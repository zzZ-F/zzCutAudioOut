/*
*  这个是长听力的裁剪脚本
*   正常读 留空白 变调读 留空白 中文翻译读 留空白 正常读 留空白 变调读 留空白
*   这个是输出出来一个整体音频片段
* */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const path = require('path');
const fs = require('fs');

// 设置 fluent-ffmpeg 使用静态的 ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 输入和输出文件路径
const inputAudioEnglish = path.join(__dirname, 'audio', 'english.mp3');
const inputAudioChinese = path.join(__dirname, 'audio', 'chinese.mp3');
const outputDir = path.join(__dirname, 'output');

// 检查输出目录是否存在，不存在则创建
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
// 获取音频长度
function getAudioDuration(inputFile) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputFile, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration;
                resolve(duration);
            }
        });
    });
}

// 函数：检测音频中的静音部分
function detectSilence(inputFile) {
    return new Promise((resolve, reject) => {
        let silenceData = [];
        ffmpeg(inputFile)
            .audioFilters('silencedetect=noise=-30dB:d=3') // 小于30dB 时间是2秒
            .on('stderr', function(stderrLine) {
                if (stderrLine.includes('silence_start')) {
                    const silenceStart = parseFloat(stderrLine.split('silence_start: ')[1]);
                    silenceData.push({ type: 'start', time: silenceStart });
                }
                if (stderrLine.includes('silence_end')) {
                    const silenceEnd = parseFloat(stderrLine.split('silence_end: ')[1].split('|')[0]);
                    silenceData.push({ type: 'end', time: silenceEnd });
                }
            })
            .on('end', () => {
                console.log(`静音检测完成: ${inputFile}`);
                resolve(silenceData);
            })
            .on('error', (err) => {
                console.error('检测静音时出错:', err);
                reject(err);
            })
            .output('pipe:1')
            .format('null')
            .run();
    });
}

// 函数：基于静音数据裁剪音频
function trimAudio(inputFile, outputFilePrefix, silenceData, totalDuration) {
    return new Promise((resolve, reject) => {
        const outputFiles = [];
        let currentPosition = 0;
        let streamCount = 0;

        // 遍历静音段，裁剪出片段
        silenceData.forEach((silence, index) => {
            if (silence.type === 'start' && silenceData[index + 1] && silenceData[index + 1].type === 'end') {
                const silenceStart = silence.time;
                const silenceEnd = silenceData[index + 1].time;

                if (silenceStart > currentPosition) {
                    const outputFile = path.join(outputDir, `${outputFilePrefix}_trimmed_${streamCount}.mp3`);
                    console.log(`裁剪片段 ${streamCount}: 开始时间: ${currentPosition}, 结束时间: ${silenceStart}`);
                    outputFiles.push(outputFile);

                    ffmpeg(inputFile)
                        .setStartTime(currentPosition)
                        .setDuration(silenceStart - currentPosition)
                        .output(outputFile)
                        .on('end', () => {
                            console.log(`裁剪完成: ${outputFile}`);
                        })
                        .on('error', (err) => {
                            console.error(`裁剪片段时出错: ${err}`);
                            reject(err);
                        })
                        .run();

                    currentPosition = silenceEnd;
                    streamCount++;
                }
            }
        });

        // 如果当前处理位置小于音频总时长，说明还有最后一段未裁剪
        if (currentPosition < totalDuration) {
            const outputFile = path.join(outputDir, `${outputFilePrefix}_trimmed_${streamCount}.mp3`);
            console.log(`裁剪最后一个片段: 开始时间: ${currentPosition}, 结束时间: ${totalDuration}`);
            outputFiles.push(outputFile);

            ffmpeg(inputFile)
                .setStartTime(currentPosition)
                .setDuration(totalDuration - currentPosition)
                .output(outputFile)
                .on('end', () => {
                    console.log(`最后片段裁剪完成: ${outputFile}`);
                    resolve(outputFiles);
                })
                .on('error', (err) => {
                    console.error(`裁剪最后片段时出错: ${err}`);
                    reject(err);
                })
                .run();
        } else {
            resolve(outputFiles);
        }
    });
}


function processSegment1(englishClip, chineseClip, outputFile) {
    return new Promise((resolve, reject) => {
        const filterParts = [];

        // 使用 concat 滤镜拼接两个音频文件，并连接到输出流
        filterParts.push(`[0:a][1:a]concat=n=2:v=0:a=1[outa];`);  // 将两个音频流拼接到一起，并输出到 [outa]

        console.log('生成的 filterParts:', filterParts.join(''));

        ffmpeg()
            .input(englishClip)  // 第一个输入：英文片段
            .input(chineseClip)  // 第二个输入：中文片段
            .complexFilter(filterParts.join(''))  // 使用 concat 滤镜
            .map('[outa]')  // 明确映射拼接的音频输出流
            .outputOptions('-acodec libmp3lame')  // 指定 MP3 编码格式
            .output(outputFile)
            .on('end', () => {
                console.log(`音频拼接完成: ${outputFile}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('处理音频时出错:', err);
                reject(err);
            })
            .run();
    });
}
function processSegment2(englishClip, chineseClip, outputFile) {
    return new Promise((resolve, reject) => {
        const filterParts = [];

        // 调整音量并拼接音频
        filterParts.push(`[0:a]volume=1.0[a_eng];`);  // 调整英文片段音量
        // filterParts.push(`[0:a]volume=1.0[a_eng1];`);  // 调整英文片段音量
        // filterParts.push(`[0:a]asetrate=44100*0.9[a_eng1];`);
        filterParts.push(`[0:a]rubberband=pitch=1.1[a_eng1];`); // 音高调节
        // filterParts.push(`[1:a]volume=0.5[a_chn];`);  // 调整中文片段音量
        filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=2[silence];`);  // 添加2秒静音
        filterParts.push(`[a_eng][silence][a_eng1]concat=n=3:v=0:a=1[outa];`);  // 拼接英文、静音和中文

        console.log('生成的 filterParts:', filterParts.join(''));

        ffmpeg()
            .input(englishClip)  // 第一个输入：英文片段
            .input(chineseClip)  // 第二个输入：中文片段
            .complexFilter(filterParts.join(''))  // 使用滤镜链
            .map('[outa]')  // 映射到最终输出
            .outputOptions('-acodec libmp3lame')  // 指定 MP3 编码格式
            .output(outputFile)
            .on('end', () => {
                console.log(`音频拼接完成: ${outputFile}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('处理音频时出错:', err);
                reject(err);
            })
            .run();
    });
}



function processSegment(englishClip, chineseClip, outputFile) {
    return new Promise((resolve, reject) => {
        const filterParts = [];

        // 第1个正常音量英文片段
        filterParts.push(`[0:a]volume=1.0[a_0];`);
        // 第2个静音英文片段
        filterParts.push(`[0:a]volume=0.0[a_1];`);
        // // 第3个正常音量英文片段
        filterParts.push(`[0:a]rubberband=pitch=1.1[a_2];`);
        // // 第4个静音英文片段
        filterParts.push(`[0:a]volume=0.0[a_3];`);
        //
        // 第1个正常音量中文片段
        filterParts.push(`[1:a]volume=1.0[a_chinese];`);
        // 添加2秒静音
        filterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=2[silence];`);
        // 再次处理同样的英文片段，创建新的流名称
        filterParts.push(`[0:a]volume=1.0[a_0_rpt];`);
        filterParts.push(`[0:a]volume=0.0[a_1_rpt];`);
        filterParts.push(`[0:a]rubberband=pitch=1.1[a_2_rpt];`);
        filterParts.push(`[0:a]volume=0.0[a_3_rpt];`);
        // 拼接顺序为: 英文1 -> 英文1静音 -> 英文1 -> 英文1静音 -> 中文 -> 静音 -> 英文1 -> 英文1静音 -> 英文1 -> 英文1静音
        filterParts.push(`[a_0][a_1][a_2][a_3][a_chinese][silence][a_0_rpt][a_1_rpt][a_2_rpt][a_3_rpt]concat=n=10:v=0:a=1[outa];`);

        console.log('生成的 filterParts:', filterParts.join(''));

        // 使用 FFmpeg 处理音频
        ffmpeg()
            .input(englishClip)  // 第一个输入：英文片段
            .input(chineseClip)  // 第二个输入：中文片段
            .complexFilter(filterParts.join(''))  // 使用滤镜链
            .map('[outa]')  // 映射到最终输出
            .outputOptions('-acodec libmp3lame')  // 指定 MP3 编码格式
            .output(outputFile)
            .on('end', () => {
                console.log(`音频拼接完成: ${outputFile}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('处理音频片段时出错:', err);
                reject(err);
            })
            .run();
    });
}




// 主函数：检测并裁剪静音部分
async function processAudioFiles() {
    try {
        // 获取音频总时长并处理 english.mp3
        console.log('开始处理 english.mp3');
        const totalDurationEnglish = await getAudioDuration(inputAudioEnglish);
        const silenceDataEnglish = await detectSilence(inputAudioEnglish);
        const englishSegments = await trimAudio(inputAudioEnglish, 'english', silenceDataEnglish, totalDurationEnglish);

        // 获取音频总时长并处理 chinese.mp3
        console.log('开始处理 chinese.mp3');
        const totalDurationChinese = await getAudioDuration(inputAudioChinese);
        const silenceDataChinese = await detectSilence(inputAudioChinese);
        const chineseSegments = await trimAudio(inputAudioChinese, 'chinese', silenceDataChinese, totalDurationChinese);
        console.log('chineseSegments', chineseSegments.length, englishSegments.length);

        // 确保英文和中文片段一一对应
        if (englishSegments.length !== chineseSegments.length) {
            throw new Error('英文片段和中文片段数量不一致，无法一一对应处理');
        }
        // const outputFile = path.join(outputDir, `final_output_${1}.mp3`);
        // await processSegment(englishSegments[0], chineseSegments[0],  outputFile);
        // return;
        // 如果你想恢复处理片段的逻辑
        for (let i = 0; i < englishSegments.length; i++) {
            const outputFile = path.join(outputDir, `final_output_${i + 1}.mp3`);
            await processSegment(englishSegments[i], chineseSegments[i], outputFile);
        }

        console.log('所有音频处理完成');
    } catch (error) {
        console.error('处理音频文件时出错:', error);
    }
}


// 开始执行
processAudioFiles();



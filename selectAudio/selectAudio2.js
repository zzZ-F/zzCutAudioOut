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

// 函数：处理音频片段生成 "start" 和 "end" 文件
function processSegment(englishClip, chineseClip, outputFileStart, outputFileEnd) {
    return new Promise((resolve, reject) => {
        const filterPartsStart = [];
        const filterPartsEnd = [];

        // For final_output_${i + 1}_start.mp3
        filterPartsStart.push(`[0:a]volume=1.0[a_0];`);  // 第1个正常音量英文片段
        filterPartsStart.push(`[0:a]volume=0.0[a_1];`);  // 第2个静音英文片段
        filterPartsStart.push(`[0:a]rubberband=pitch=1.1[a_2];`);  // 第3个正常音量英文片段
        filterPartsStart.push(`[0:a]volume=0.0[a_3];`);  // 第4个静音英文片段
        filterPartsStart.push(`[a_0][a_1][a_2][a_3]concat=n=4:v=0:a=1[outa];`);  // 拼接顺序

        // For final_output_${i + 1}_end.mp3
        filterPartsEnd.push(`[1:a]volume=1.0[a_chinese];`);  // 第1个正常音量中文片段
        filterPartsEnd.push(`anullsrc=r=44100:cl=stereo,atrim=duration=2[silence];`);  // 2秒静音
        filterPartsEnd.push(`[0:a]volume=1.0[a_0_rpt];`);  // 英文片段
        filterPartsEnd.push(`[0:a]volume=0.0[a_1_rpt];`);  // 英文片段静音
        filterPartsEnd.push(`[0:a]rubberband=pitch=1.1[a_2_rpt];`);  // 英文片段
        filterPartsEnd.push(`[0:a]volume=0.0[a_3_rpt];`);  // 英文片段静音
        filterPartsEnd.push(`[a_chinese][silence][a_0_rpt][a_1_rpt][a_2_rpt][a_3_rpt]concat=n=6:v=0:a=1[outa];`);  // 拼接顺序

        console.log('生成的 filterPartsStart:', filterPartsStart.join(''));
        console.log('生成的 filterPartsEnd:', filterPartsEnd.join(''));

        // 处理 start 文件
        ffmpeg()
            .input(englishClip)  // 输入英文片段
            .complexFilter(filterPartsStart.join(''))  // 使用滤镜链
            .map('[outa]')  // 映射到最终输出
            .outputOptions('-acodec libmp3lame')  // 指定 MP3 编码格式
            .output(outputFileStart)
            .on('end', () => {
                console.log(`音频 start 部分拼接完成: ${outputFileStart}`);
            })
            .on('error', (err) => {
                console.error('处理音频片段时出错:', err);
                reject(err);
            })
            .run();

        // 处理 end 文件
        ffmpeg()
            .input(englishClip)  // 输入英文片段
            .input(chineseClip)  // 输入中文片段
            .complexFilter(filterPartsEnd.join(''))  // 使用滤镜链
            .map('[outa]')  // 映射到最终输出
            .outputOptions('-acodec libmp3lame')  // 指定 MP3 编码格式
            .output(outputFileEnd)
            .on('end', () => {
                console.log(`音频 end 部分拼接完成: ${outputFileEnd}`);
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

        // 确保英文和中文片段一一对应
        if (englishSegments.length !== chineseSegments.length) {
            throw new Error('英文片段和中文片段数量不一致，无法一一对应处理');
        }

        // 处理音频片段
        for (let i = 0; i < englishSegments.length; i++) {
            const outputFileStart = path.join(outputDir, `final_output_${i + 1}_start.mp3`);
            const outputFileEnd = path.join(outputDir, `final_output_${i + 1}_end.mp3`);
            await processSegment(englishSegments[i], chineseSegments[i], outputFileStart, outputFileEnd);
        }

        console.log('所有音频处理完成');
    } catch (error) {
        console.error('处理音频文件时出错:', error);
    }
}

// 开始执行
processAudioFiles();

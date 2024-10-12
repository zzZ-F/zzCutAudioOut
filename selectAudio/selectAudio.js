/*
*  这个是长听力的裁剪脚本
*   1.正常读
*   2.留空白
*   3.变调读
*   4.留空白 跟上一个片段一样
*   5.中文翻译读
*   6.留空白
*   7.正常读
*   8.留空白
*   9.变调读
*   10.留空白 跟上一个片段一样
*
* */
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
// 设置 fluent-ffmpeg 使用静态的 ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
const path = require('path');
const fs = require('fs');

// 输入和输出文件路径
const inputAudioEnglish = path.join(__dirname, 'audio', 'english.mp3');
const inputAudioChinese = path.join(__dirname, 'audio', 'chinese.mp3');
const outputDir = path.join(__dirname, 'selectAudio', 'output');

// 检查输出目录是否存在，不存在则创建
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// 函数：检测音频中的静音部分
function detectSilence(inputFile) {
    return new Promise((resolve, reject) => {
        let silenceData = []; // 存储静音时间段
        ffmpeg(inputFile)
            .audioFilters('silencedetect=noise=-30dB:d=2') // 低于 -30dB 且持续 2 秒被认为是静音
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
            .output('/dev/null') // 不生成文件，只做静音检测
            .run();
    });
}

// 函数：基于静音数据裁剪音频
function trimAudio(inputFile, outputFile, silenceData) {
    return new Promise((resolve, reject) => {
        const trimParts = [];
        let currentPosition = 0;

        // 遍历静音段，确定哪些片段需要保留
        silenceData.forEach((silence, index) => {
            if (silence.type === 'start' && silenceData[index + 1] && silenceData[index + 1].type === 'end') {
                // 保留静音之前的片段
                const silenceStart = silence.time;
                const silenceEnd = silenceData[index + 1].time;

                if (silenceStart > currentPosition) {
                    trimParts.push(`[0]atrim=start=${currentPosition}:end=${silenceStart},asetpts=PTS-STARTPTS[a${index}];`);
                    currentPosition = silenceEnd;
                }
            }
        });

        // 添加最后一段音频
        trimParts.push(`[0]atrim=start=${currentPosition},asetpts=PTS-STARTPTS[a${silenceData.length}];`);
        const filterComplex = trimParts.join('') + trimParts.map((_, index) => `[a${index}]`).join('') + `concat=n=${trimParts.length}:v=0:a=1[outa]`;

        ffmpeg(inputFile)
            .complexFilter(filterComplex, 'outa')
            .output(outputFile)
            .on('end', () => {
                console.log(`音频裁剪完成: ${outputFile}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('裁剪音频时出错:', err);
                reject(err);
            })
            .run();
    });
}

// 主函数：检测并裁剪静音部分
async function processAudioFiles() {
    try {
        // 处理 english.mp3
        console.log('开始处理 english.mp3');
        const silenceDataEnglish = await detectSilence(inputAudioEnglish);
        await trimAudio(inputAudioEnglish, path.join(outputDir, 'english_trimmed.mp3'), silenceDataEnglish);

        // 处理 chinese.mp3
        console.log('开始处理 chinese.mp3');
        const silenceDataChinese = await detectSilence(inputAudioChinese);
        await trimAudio(inputAudioChinese, path.join(outputDir, 'chinese_trimmed.mp3'), silenceDataChinese);

        console.log('所有音频处理完成');
    } catch (error) {
        console.error('处理音频文件时出错:', error);
    }
}

// 开始执行
processAudioFiles();

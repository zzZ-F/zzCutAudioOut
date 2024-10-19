const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const path = require('path');
const fs = require('fs');

// 设置 fluent-ffmpeg 使用静态的 ffmpeg 和 ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 输入和输出文件路径
const audioDir = path.join(__dirname, 'audio');
const audioDir2 = path.join(__dirname, 'publicAudio');
const outputDir = path.join(__dirname, 'output');
const silenceFile = path.join(audioDir2, '3秒静音.mp3'); // 3秒静音音频文件

// 检查输出目录是否存在，不存在则创建
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// 获取目录下的音频文件
function getAudioFiles(prefix) {
    return fs.readdirSync(audioDir)
        .filter(file => file.startsWith(prefix) && file.endsWith('.mp3'))
        .map(file => path.join(audioDir, file));
}

// 拼接文件并添加静音
function concatenateAudio(audioFiles, outputFile) {
    return new Promise((resolve, reject) => {
        const command = ffmpeg();

        // 将所有音频文件加入输入
        audioFiles.forEach(file => {
            command.input(file);
        });

        // 拼接所有音频文件
        command
            .on('end', () => {
                console.log(`拼接完成: ${outputFile}`);
                resolve();
            })
            .on('error', (err) => {
                console.error('拼接音频时出错:', err);
                reject(err);
            })
            .mergeToFile(outputFile, outputDir);
    });
}

// 主函数：拼接英文和中文音频
async function processAllAudio() {
    try {
        console.log('开始处理所有音频...');

        // 获取所有以 "english" 开头的音频文件
        const englishFiles = getAudioFiles('english');
        // 获取所有以 "chinese" 开头的音频文件
        const chineseFiles = getAudioFiles('chinese');
        console.log('englishFiles', englishFiles.length);
        const englishAudioFiles = [];
        const chineseAudioFiles = [];

        // 在每个英文片段之间添加静音
        englishFiles.forEach(file => {
            englishAudioFiles.push(file);
            englishAudioFiles.push(silenceFile);
        });
        // 去掉最后一个静音片段
        englishAudioFiles.pop();

        // 在每个中文片段之间添加静音
        chineseFiles.forEach(file => {
            chineseAudioFiles.push(file);
            chineseAudioFiles.push(silenceFile);
        });
        // 去掉最后一个静音片段
        chineseAudioFiles.pop();

        // 拼接英文音频
        const englishOutputFile = path.join(outputDir, 'english.mp3');
        await concatenateAudio(englishAudioFiles, englishOutputFile);

        // 拼接中文音频
        const chineseOutputFile = path.join(outputDir, 'chinese.mp3');
        await concatenateAudio(chineseAudioFiles, chineseOutputFile);

        console.log('所有音频拼接完成');
    } catch (error) {
        console.error('处理音频文件时出错:', error);
    }
}

// 开始执行
processAllAudio();

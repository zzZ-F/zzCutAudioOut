const fs = require('fs');
const path = require('path');

// 定义项目路径
const sucaiDir = path.join(__dirname, 'sucai');
const zztestDir = path.join(__dirname, 'zztest');

// 创建 zztest 目录，如果不存在
if (!fs.existsSync(zztestDir)) {
    fs.mkdirSync(zztestDir);
}

// 读取素材目录下的音频文件，并按顺序排序
const audioFiles = fs.readdirSync(sucaiDir)
    .filter(file => file.endsWith('.mp3'))
    .sort((a, b) => {
        // 提取文件名中的数字部分并按顺序排序
        const numA = parseInt(a.match(/(\d+)\.mp3/)[1], 10);
        const numB = parseInt(b.match(/(\d+)\.mp3/)[1], 10);
        return numA - numB;
    });

// 获取 bg.png 的路径
const bgImagePath = path.join(sucaiDir, 'bg.png');

// 校验 bg.png 是否存在
if (!fs.existsSync(bgImagePath)) {
    console.error('bg.png 不存在于 sucai 目录中');
    process.exit(1);
}

// 创建剪影项目的 JSON 内容
const projectData = {
    "tracks": [
        {
            "type": "main", // 主轨道
            "assets": [
                {
                    "type": "image",
                    "src": "sucai/bg.png",
                    "duration": 10, // 设置图片显示时长
                    "position": 0
                }
            ]
        },
        {
            "type": "audio", // 音轨
            "assets": audioFiles.map((file, index) => ({
                "type": "audio",
                "src": `sucai/${file}`,
                "duration": 5, // 假设每个音频的时长为 5 秒
                "position": index * 5 // 每个音频依次排列
            }))
        }
    ]
};

// 输出 JSON 文件到 zztest 目录
fs.writeFileSync(path.join(zztestDir, 'draft_content.json'), JSON.stringify(projectData, null, 2));

// 复制 bg.png 到 zztest 目录
fs.copyFileSync(bgImagePath, path.join(zztestDir, 'bg.png'));

console.log('剪影草稿目录 zztest 生成成功');

const { exec } = require('child_process');

console.log('检查FFmpeg安装状态...\n');

exec('ffmpeg -version', (error, stdout, stderr) => {
  if (error) {
    console.error('FFmpeg未安装或未添加到PATH环境变量！\n');
    console.error('请按照以下步骤安装FFmpeg:\n');
    console.log('Windows:');
    console.log('  1. 访问 https://ffmpeg.org/download.html');
    console.log('  2. 下载Windows版本并解压');
    console.log('  3. 将bin目录添加到系统PATH环境变量\n');
    console.log('macOS:');
    console.log('  使用Homebrew: brew install ffmpeg\n');
    console.log('Linux (Ubuntu/Debian):');
    console.log('  sudo apt-get update');
    console.log('  sudo apt-get install ffmpeg\n');
    console.log('Linux (CentOS/RHEL):');
    console.log('  sudo yum install ffmpeg\n');
    process.exit(1);
  } else {
    const versionMatch = stdout.match(/ffmpeg version ([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : '未知';
    console.log(`FFmpeg已安装: 版本 ${version}`);
    console.log('您可以开始使用应用了！\n');
    process.exit(0);
  }
});

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { exec, spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = 3001;
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
const OUTPUT_DIR = path.join(__dirname, '../public/output');

// 确保上传和输出目录存在并设置权限
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  } else {
    // 尝试修复权限（如果可能）
    try {
      fs.chmodSync(dir, 0o755);
    } catch (err) {
      console.warn(`无法设置目录权限 ${dir}:`, err.message);
    }
  }
  
  // macOS: 移除扩展属性（可能阻止写入）
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      execSync(`xattr -rc "${dir}" 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (err) {
      // 忽略错误，xattr 可能不可用或没有扩展属性
    }
  }
});

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB限制
  fileFilter: (req, file, cb) => {
    const videoFormats = /\.(mp4|avi|mov|mkv|flv|wmv|webm|m4v|3gp|mpeg|mpg)$/i;
    if (videoFormats.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的视频格式'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use('/output', express.static(OUTPUT_DIR));

// Socket.io连接
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('客户端已断开:', socket.id);
  });
});

// 转换任务队列
const conversionQueue = new Map();

// 诊断工具函数
function diagnosePath(outputPath) {
  const diagnostics = {
    path: outputPath,
    isValid: true,
    issues: [],
    suggestions: []
  };

  try {
    // 检查1: 路径是否为绝对路径
    if (!path.isAbsolute(outputPath)) {
      diagnostics.issues.push('路径不是绝对路径');
      diagnostics.suggestions.push('使用 path.resolve() 转换为绝对路径');
      diagnostics.isValid = false;
    }

    // 检查2: 路径长度
    if (outputPath.length > 260) {
      diagnostics.issues.push(`路径过长 (${outputPath.length} 字符)`);
      diagnostics.suggestions.push('缩短路径或文件名');
      diagnostics.isValid = false;
    }

    // 检查3: 文件名中的非法字符
    const fileName = path.basename(outputPath);
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(fileName)) {
      diagnostics.issues.push('文件名包含非法字符');
      diagnostics.suggestions.push('清理文件名中的特殊字符');
      diagnostics.isValid = false;
    }

    // 检查4: 目录是否存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      diagnostics.issues.push('输出目录不存在');
      diagnostics.suggestions.push('创建输出目录');
      diagnostics.isValid = false;
    } else {
      // 检查5: 目录权限
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (permErr) {
        diagnostics.issues.push('输出目录无写权限');
        diagnostics.suggestions.push('检查目录权限或使用 chmod');
        diagnostics.isValid = false;
      }
    }

    // 检查6: 文件是否已存在且被锁定
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (unlinkErr) {
        diagnostics.issues.push('输出文件已存在且无法删除');
        diagnostics.suggestions.push('检查文件是否被其他进程占用');
        diagnostics.isValid = false;
      }
    }

    // 检查7: 测试写入
    try {
      const testFile = path.join(dir, `.test-${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (writeErr) {
      diagnostics.issues.push('无法在目录中写入文件');
      diagnostics.suggestions.push('检查磁盘空间和权限');
      diagnostics.isValid = false;
    }

    // 检查8: 路径规范化
    const normalized = path.normalize(outputPath);
    if (normalized !== outputPath) {
      diagnostics.issues.push('路径未规范化');
      diagnostics.suggestions.push('使用 path.normalize() 规范化路径');
    }

  } catch (err) {
    diagnostics.issues.push(`诊断错误: ${err.message}`);
    diagnostics.isValid = false;
  }

  return diagnostics;
}

// 清理文件名（移除特殊字符）
function sanitizeFileName(fileName) {
  // 移除或替换非法字符
  return fileName
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .substring(0, 255); // 限制文件名长度
}

// 视频转音频处理
function convertVideoToAudio(inputPath, outputPath, format, options, socketId) {
  return new Promise((resolve, reject) => {
    // 确保使用绝对路径
    const absoluteInputPath = path.resolve(inputPath);
    let absoluteOutputPath = path.resolve(outputPath);
    
    // 清理输出文件名
    const outputDir = path.dirname(absoluteOutputPath);
    const outputFileName = sanitizeFileName(path.basename(absoluteOutputPath));
    absoluteOutputPath = path.join(outputDir, outputFileName);
    
    // 确保输出目录存在并设置权限
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
      } catch (mkdirErr) {
        console.error('创建输出目录失败:', mkdirErr);
        return reject(new Error(`无法创建输出目录: ${mkdirErr.message}`));
      }
    }
    
    // 运行诊断
    console.log('=== 开始路径诊断 ===');
    const diagnostics = diagnosePath(absoluteOutputPath);
    console.log('诊断结果:', JSON.stringify(diagnostics, null, 2));
    
    if (!diagnostics.isValid) {
      console.error('路径诊断发现问题:');
      diagnostics.issues.forEach(issue => console.error('  -', issue));
      console.error('建议:');
      diagnostics.suggestions.forEach(suggestion => console.error('  -', suggestion));
    }
    
    // 验证输入文件
    if (!fs.existsSync(absoluteInputPath)) {
      return reject(new Error(`输入文件不存在: ${absoluteInputPath}`));
    }
    
    // 移除提前检测，让 FFmpeg 自己处理音频流检测
    // 这样可以避免误判导致正常文件无法转换
    // 如果文件没有音频流，FFmpeg 会在转换时返回明确的错误信息
    
    const taskId = path.basename(absoluteOutputPath, path.extname(absoluteOutputPath));
    
    console.log('=== 转换配置 ===');
    console.log('输入文件路径:', absoluteInputPath);
    console.log('输入文件存在:', fs.existsSync(absoluteInputPath));
    console.log('输入文件大小:', fs.statSync(absoluteInputPath).size, 'bytes');
    console.log('输出文件路径:', absoluteOutputPath);
    console.log('输出目录:', outputDir);
    console.log('输出目录存在:', fs.existsSync(outputDir));
    console.log('输出目录可写:', (() => {
      try {
        fs.accessSync(outputDir, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    })());
    console.log('格式:', format);
    console.log('选项:', options);
    
    // 构建 FFmpeg 命令
    // 注意：toFormat() 会自动添加 -vn，但为了确保，我们也在 outputOptions 中明确指定
    let command = ffmpeg(absoluteInputPath);
    
    // 设置输出格式（这会自动添加 -vn）
    command = command.toFormat(format);
    
    // 设置音频编码器
    const audioCodec = getAudioCodec(format);
    console.log('音频编码器:', audioCodec);
    command = command.audioCodec(audioCodec);
    
    // 设置比特率
    const bitrate = options.bitrate || '192k';
    console.log('比特率:', bitrate);
    command = command.audioBitrate(bitrate);

    // 设置采样率
    if (options.sampleRate) {
      const sampleRate = parseInt(options.sampleRate);
      console.log('采样率:', sampleRate);
      command = command.audioFrequency(sampleRate);
    }

    // 设置音频通道
    if (options.channels) {
      const channels = parseInt(options.channels);
      console.log('声道数:', channels);
      command = command.audioChannels(channels);
    }
    
    // 添加额外的 FFmpeg 选项以提高兼容性
    // 关键：必须明确指定输出格式和禁用视频，并确保有音频流
    command = command
      .outputOptions([
        '-vn', // 禁用视频（只提取音频）
        '-f', format, // 明确指定输出格式
        '-y', // 覆盖输出文件（如果存在）
        '-loglevel', 'info', // 设置日志级别
        '-hide_banner' // 隐藏横幅信息
      ]);

    // macOS 特定：尝试使用临时文件然后移动（解决路径访问问题）
    let useTempFile = false;
    let tempOutputPath = null;
    let useDirectExec = false; // 是否使用直接 exec 方式
    
    if (process.platform === 'darwin') {
      // 策略1: 使用临时文件（避免直接写入最终路径的问题）
      tempOutputPath = path.join(outputDir, `.temp-${taskId}${path.extname(absoluteOutputPath)}`);
      useTempFile = true;
      console.log('使用临时文件策略:', tempOutputPath);
      
      // 策略2: 如果临时文件路径也可能有问题，使用直接 exec（备用方案）
      // 可以通过环境变量启用: USE_DIRECT_FFMPEG=1
      if (process.env.USE_DIRECT_FFMPEG === '1') {
        useDirectExec = true;
        console.log('使用直接 exec 方式执行 FFmpeg');
      }
    }

    command
      .on('start', (commandLine) => {
        console.log('=== FFmpeg 命令 ===');
        console.log('完整命令:', commandLine);
        console.log('命令参数:', commandLine.split(' ').filter(arg => arg !== 'ffmpeg'));
        
        // 如果使用临时文件，修改命令的输出路径
        if (useTempFile && tempOutputPath) {
          console.log('注意: 将输出到临时文件:', tempOutputPath);
        }
        
        io.to(socketId).emit('conversionStart', { taskId, message: '开始转换...' });
      })
      .on('progress', (progress) => {
        const percent = Math.floor(progress.percent || 0);
        console.log(`转换进度: ${percent}%`);
        io.to(socketId).emit('conversionProgress', { 
          taskId, 
          progress: percent,
          timemark: progress.timemark 
        });
      })
      .on('end', () => {
        // 如果使用临时文件，需要移动到最终位置
        if (useTempFile && tempOutputPath && fs.existsSync(tempOutputPath)) {
          try {
            console.log('移动临时文件到最终位置...');
            console.log('从:', tempOutputPath);
            console.log('到:', absoluteOutputPath);
            fs.renameSync(tempOutputPath, absoluteOutputPath);
            console.log('文件移动成功');
          } catch (moveErr) {
            console.error('移动文件失败，尝试复制:', moveErr.message);
            try {
              fs.copyFileSync(tempOutputPath, absoluteOutputPath);
              fs.unlinkSync(tempOutputPath);
              console.log('文件复制成功');
            } catch (copyErr) {
              console.error('复制文件也失败:', copyErr.message);
              // 如果移动和复制都失败，使用临时文件路径
              absoluteOutputPath = tempOutputPath;
            }
          }
        }
        
        if (!fs.existsSync(absoluteOutputPath)) {
          return reject(new Error('输出文件未创建'));
        }
        
        console.log('转换完成:', absoluteOutputPath);
        conversionQueue.delete(taskId);
        io.to(socketId).emit('conversionComplete', { 
          taskId,
          outputFile: path.basename(absoluteOutputPath)
        });
        
        // 清理输入文件
        try {
          fs.unlinkSync(absoluteInputPath);
        } catch (err) {
          console.error('删除输入文件失败:', err);
        }
        
        resolve(absoluteOutputPath);
      })
      .on('error', (err) => {
        console.error('=== 转换错误 ===');
        console.error('错误消息:', err.message);
        console.error('错误堆栈:', err.stack);
        console.error('输入路径:', absoluteInputPath);
        console.error('输出路径:', absoluteOutputPath);
        
        // 重新运行诊断
        console.error('=== 错误时重新诊断 ===');
        const errorDiagnostics = diagnosePath(absoluteOutputPath);
        console.error('诊断结果:', JSON.stringify(errorDiagnostics, null, 2));
        
        // 检查系统信息
        console.error('当前工作目录:', process.cwd());
        console.error('Node.js 版本:', process.version);
        console.error('平台:', process.platform);
        
        // 尝试获取更详细的错误信息
        if (err.message.includes('code 234')) {
          console.error('错误代码 234 通常表示:');
          console.error('  1. 输出路径无效或包含非法字符');
          console.error('  2. 目录权限不足');
          console.error('  3. 文件系统问题（磁盘空间、权限等）');
          console.error('  4. FFmpeg 无法访问输出位置');
          console.error('  5. ⚠️  输入文件可能没有音频流（最常见原因）');
          console.error('     - 检查输入文件是否包含音频轨道');
          console.error('     - 某些视频文件可能只有视频流没有音频流');
          console.error('     - 使用 ffprobe 检查: ffprobe -i "' + absoluteInputPath + '"');
        }
        
        // 检查是否是"没有音频流"的错误 - 这是最常见的问题
        let friendlyError = err.message;
        let errorType = 'unknown';
        let errorSolution = '';
        
        if (err.message.includes('does not contain any stream') || 
            err.message.includes('Output file does not contain') ||
            err.message.includes('does not contain any stream')) {
          errorType = 'no_audio_stream';
          friendlyError = '❌ 错误: 输入文件没有音频流\n\n' +
            '该视频文件只包含视频轨道，没有音频轨道，无法转换为音频文件。\n\n' +
            '解决方案：\n' +
            '1. 请使用包含音频的视频文件\n' +
            '2. 或者使用 ./check-audio-stream.sh 检查文件是否有音频流\n' +
            '3. 如果文件确实没有音频，无法进行转换';
          
          errorSolution = '请使用包含音频轨道的视频文件，或使用 ./check-audio-stream.sh 检查文件';
          
          console.error('');
          console.error('═══════════════════════════════════════════════════════════');
          console.error('❌ 转换失败：输入文件没有音频流');
          console.error('═══════════════════════════════════════════════════════════');
          console.error('输入文件:', absoluteInputPath);
          console.error('');
          console.error('问题说明:');
          console.error('  该视频文件只包含视频轨道，没有音频轨道。');
          console.error('  无法从没有音频的文件中提取音频。');
          console.error('');
          console.error('解决方案:');
          console.error('  1. 使用包含音频的视频文件进行转换');
          console.error('  2. 检查文件: ./check-audio-stream.sh "' + absoluteInputPath + '"');
          console.error('  3. 如果必须使用此文件，需要先添加音频轨道');
          console.error('');
          console.error('检查命令:');
          console.error('  ffprobe -i "' + absoluteInputPath + '"');
          console.error('═══════════════════════════════════════════════════════════');
          console.error('');
        }
        
        conversionQueue.delete(taskId);
        io.to(socketId).emit('conversionError', { 
          taskId,
          error: friendlyError,
          errorType: errorType,
          errorSolution: errorSolution,
          originalError: err.message,
          details: errorDiagnostics,
          inputFile: absoluteInputPath
        });
        
        // 清理文件
        try {
          if (fs.existsSync(absoluteInputPath)) {
            fs.unlinkSync(absoluteInputPath);
          }
          if (fs.existsSync(absoluteOutputPath)) {
            fs.unlinkSync(absoluteOutputPath);
          }
        } catch (cleanupErr) {
          console.error('清理文件失败:', cleanupErr);
        }
        
        reject(err);
      })
      .save(useTempFile && tempOutputPath ? tempOutputPath : absoluteOutputPath);

    conversionQueue.set(taskId, command);
  });
}

// 根据格式获取音频编码器
function getAudioCodec(format) {
  const codecMap = {
    'mp3': 'libmp3lame',
    'aac': 'aac',
    'wav': 'pcm_s16le',
    'ogg': 'libvorbis',
    'flac': 'flac',
    'm4a': 'aac'
  };
  return codecMap[format.toLowerCase()] || 'libmp3lame';
}

// 上传和转换API
app.post('/api/convert', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到视频文件' });
    }

    const { format = 'mp3', bitrate, sampleRate, channels } = req.body;
    const socketId = req.body.socketId;
    
    const inputPath = path.resolve(req.file.path);
    const baseFileName = path.basename(req.file.filename, path.extname(req.file.filename));
    const outputFileName = `${baseFileName}.${format}`;
    const outputPath = path.resolve(OUTPUT_DIR, outputFileName);
    
    console.log('=== 文件上传信息 ===');
    console.log('原始文件名:', req.file.originalname);
    console.log('上传后文件名:', req.file.filename);
    console.log('输入路径:', inputPath);
    console.log('输出文件名:', outputFileName);
    console.log('输出路径:', outputPath);
    console.log('输出目录 (绝对路径):', path.resolve(OUTPUT_DIR));

    const options = {
      bitrate: bitrate || '192k',
      sampleRate: sampleRate || null,
      channels: channels || null
    };

    // 异步处理转换
    convertVideoToAudio(inputPath, outputPath, format, options, socketId)
      .catch(err => console.error('转换失败:', err));

    res.json({
      success: true,
      message: '转换任务已开始',
      taskId: path.basename(outputPath, path.extname(outputPath)),
      originalName: req.file.originalname
    });

  } catch (error) {
    console.error('处理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 下载 Bilibili 视频并转换为音频
app.post('/api/convert-bilibili', async (req, res) => {
  try {
    const { url, format = 'mp3', bitrate, sampleRate, channels } = req.body;
    const socketId = req.body.socketId;

    if (!url) {
      return res.status(400).json({ error: '未提供视频 URL' });
    }

    // 验证 URL 是否为 Bilibili 链接
    if (!url.includes('bilibili.com') && !url.includes('player.bilibili.com')) {
      return res.status(400).json({ error: '仅支持 Bilibili 视频链接' });
    }

    // 生成任务 ID
    const taskId = `bilibili-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const videoFileName = `${taskId}.%(ext)s`;
    const videoPath = path.join(UPLOAD_DIR, videoFileName);

    // 检查 yt-dlp 是否可用
    let ytdlpCommand = 'yt-dlp';
    try {
      await execAsync('which yt-dlp || which youtube-dl');
    } catch (err) {
      // 尝试检查是否安装了 yt-dlp 或 youtube-dl
      try {
        await execAsync('yt-dlp --version');
      } catch (e1) {
        try {
          await execAsync('youtube-dl --version');
          ytdlpCommand = 'youtube-dl';
        } catch (e2) {
          return res.status(500).json({ 
            error: '未找到 yt-dlp 或 youtube-dl。请先安装：\n' +
                   'macOS: brew install yt-dlp\n' +
                   'Linux: pip install yt-dlp\n' +
                   'Windows: pip install yt-dlp'
          });
        }
      }
    }

    console.log('=== 开始下载 Bilibili 视频 ===');
    console.log('URL:', url);
    console.log('使用工具:', ytdlpCommand);
    console.log('输出路径:', videoPath);

    // 通知客户端开始下载
    io.to(socketId).emit('conversionStart', { taskId, message: '开始下载视频...' });
    io.to(socketId).emit('conversionProgress', { taskId, progress: 10 });

    // 下载视频
    // 使用绝对路径，并转义特殊字符
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    // yt-dlp 参数说明：
    // -f: 选择最佳视频+音频格式，或最佳单一格式
    // -x: 仅提取音频（但我们先下载视频再转换，这样更灵活）
    // --no-playlist: 不下载播放列表，只下载单个视频
    // --extractor-args "bilibili:codec=avc": 可选，指定编码格式
    // --user-agent: 设置用户代理，避免被识别为爬虫
    let downloadCommand = `${ytdlpCommand} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${escapedVideoPath}" --no-playlist --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`;
    
    console.log('执行下载命令:', downloadCommand);
    
    let downloadSuccess = false;
    let stdout = '';
    let stderr = '';
    
    try {
      // 第一次尝试：正常下载
      const result = await execAsync(downloadCommand, { 
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 600000 // 10分钟超时
      });
      stdout = result.stdout || '';
      stderr = result.stderr || '';
      downloadSuccess = true;
    } catch (firstError) {
      // 如果遇到 SSL 证书错误，尝试使用 --no-check-certificate
      if (firstError.message && firstError.message.includes('CERTIFICATE_VERIFY_FAILED')) {
        console.log('检测到 SSL 证书错误，尝试使用 --no-check-certificate 参数重试...');
        downloadCommand = `${ytdlpCommand} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${escapedVideoPath}" --no-playlist --no-check-certificate --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`;
        console.log('重试下载命令:', downloadCommand);
        
        try {
          const retryResult = await execAsync(downloadCommand, { 
            maxBuffer: 10 * 1024 * 1024,
            timeout: 600000
          });
          stdout = retryResult.stdout || '';
          stderr = retryResult.stderr || '';
          downloadSuccess = true;
        } catch (retryError) {
          throw retryError; // 如果重试也失败，抛出错误
        }
      } else {
        throw firstError; // 如果不是 SSL 错误，直接抛出
      }
    }
    
    try {
      if (!downloadSuccess) {
        throw new Error('视频下载失败：下载未成功');
      }
      
      if (stderr) {
        console.log('yt-dlp 输出:', stderr);
      }
      if (stdout) {
        console.log('yt-dlp 信息:', stdout);
      }
      
      // 查找下载的文件（yt-dlp 可能会改变扩展名）
      let downloadedFile = null;
      const files = fs.readdirSync(UPLOAD_DIR);
      const matchingFiles = files.filter(f => f.startsWith(taskId));
      
      if (matchingFiles.length > 0) {
        // 找到最大的文件（通常是视频文件）
        downloadedFile = matchingFiles.reduce((prev, curr) => {
          const prevPath = path.join(UPLOAD_DIR, prev);
          const currPath = path.join(UPLOAD_DIR, curr);
          return fs.statSync(currPath).size > fs.statSync(prevPath).size ? curr : prev;
        });
      }

      if (!downloadedFile || !fs.existsSync(path.join(UPLOAD_DIR, downloadedFile))) {
        throw new Error('视频下载失败：未找到下载的文件');
      }

      const inputPath = path.join(UPLOAD_DIR, downloadedFile);
      const baseFileName = path.basename(downloadedFile, path.extname(downloadedFile));
      const outputFileName = `${baseFileName}.${format}`;
      const outputPath = path.resolve(OUTPUT_DIR, outputFileName);

      console.log('视频下载完成:', inputPath);
      io.to(socketId).emit('conversionProgress', { taskId, progress: 50 });

      // 转换视频为音频
      const options = {
        bitrate: bitrate || '192k',
        sampleRate: sampleRate || null,
        channels: channels || null
      };

      // 异步处理转换
      convertVideoToAudio(inputPath, outputPath, format, options, socketId)
        .catch(err => {
          console.error('转换失败:', err);
          // 清理下载的视频文件
          try {
            if (fs.existsSync(inputPath)) {
              fs.unlinkSync(inputPath);
            }
          } catch (cleanupErr) {
            console.error('清理文件失败:', cleanupErr);
          }
        });

      res.json({
        success: true,
        message: '视频下载成功，开始转换',
        taskId: path.basename(outputPath, path.extname(outputPath)),
        originalName: `Bilibili视频 - ${url}`
      });

    } catch (downloadError) {
      console.error('下载错误:', downloadError);
      io.to(socketId).emit('conversionError', {
        taskId,
        error: `视频下载失败: ${downloadError.message}`,
        errorType: 'download_error',
        errorSolution: '请检查 URL 是否正确，或视频是否可访问。确保已安装 yt-dlp。'
      });
      
      res.status(500).json({ 
        error: `视频下载失败: ${downloadError.message}`,
        suggestion: '请确保已安装 yt-dlp (brew install yt-dlp 或 pip install yt-dlp)'
      });
    }

  } catch (error) {
    console.error('处理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取转换历史
app.get('/api/history', (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR);
    const history = files.map(file => {
      const filePath = path.join(OUTPUT_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        filename: file,
        size: stats.size,
        createdAt: stats.birthtime,
        downloadUrl: `/output/${file}`
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除文件
app.delete('/api/file/:filename', (req, res) => {
  try {
    const filePath = path.join(OUTPUT_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: '文件已删除' });
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    ffmpeg: true,
    activeConversions: conversionQueue.size
  });
});

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log('上传目录:', path.resolve(UPLOAD_DIR));
  console.log('输出目录:', path.resolve(OUTPUT_DIR));
  
  // macOS 权限检查提示
  if (process.platform === 'darwin') {
    console.log('\n=== macOS 权限检查 ===');
    try {
      fs.accessSync(OUTPUT_DIR, fs.constants.W_OK);
      console.log('✓ 输出目录可写');
    } catch (err) {
      console.warn('⚠ 输出目录可能不可写，请运行: ./fix-permissions.sh');
    }
    try {
      fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
      console.log('✓ 上传目录可写');
    } catch (err) {
      console.warn('⚠ 上传目录可能不可写，请运行: ./fix-permissions.sh');
    }
    console.log('');
  }
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  // 停止所有转换任务
  conversionQueue.forEach((command, taskId) => {
    console.log(`停止任务: ${taskId}`);
    command.kill();
  });
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

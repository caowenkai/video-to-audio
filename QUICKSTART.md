# 视频转音频应用 - 快速启动指南

## 一键启动步骤

### 第一次使用

1. **确保已安装FFmpeg**（必需）
   ```bash
   # 检查FFmpeg是否已安装
   ffmpeg -version
   ```
   
   如果未安装，请参考下面的安装指南。

2. **安装依赖**
   ```bash
   # 安装所有依赖（服务器端和客户端）
   npm install
   pnpm install --prefer-offline
   ```

3. **启动应用**
   ```bash
   npm start
   ```
   
   应用会自动：
   - 检查FFmpeg安装状态
   - 启动后端服务器（http://localhost:3001）
   - 启动前端界面（http://localhost:5173）

4. **开始使用**
   - 浏览器会自动打开 http://localhost:5173
   - 拖拽或选择视频文件进行转换

### 后续使用

直接运行：
```bash
npm start
```

---

## FFmpeg 安装指南

### Windows

1. 下载FFmpeg：https://ffmpeg.org/download.html
2. 选择Windows builds，下载最新版本
3. 解压到任意目录，例如：`C:\ffmpeg`
4. 添加到系统PATH：
   - 右键"此电脑" → "属性" → "高级系统设置"
   - 点击"环境变量"
   - 在"系统变量"中找到"Path"，点击"编辑"
   - 添加FFmpeg的bin目录，例如：`C:\ffmpeg\bin`
   - 确定保存
5. 重启命令行或终端
6. 验证安装：`ffmpeg -version`

### macOS

使用Homebrew（推荐）：
```bash
# 安装Homebrew（如果未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装FFmpeg
brew install ffmpeg

# 验证安装
ffmpeg -version
```

### Linux

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg -y
ffmpeg -version
```

**CentOS/RHEL:**
```bash
sudo yum install ffmpeg -y
ffmpeg -version
```

**Arch Linux:**
```bash
sudo pacman -S ffmpeg
ffmpeg -version
```

---

## 常见问题解决

### 1. FFmpeg未找到

**错误提示：** "FFmpeg未安装或未添加到PATH环境变量"

**解决方法：**
- 按照上述指南安装FFmpeg
- 确保FFmpeg已添加到系统PATH
- 重启终端或命令行窗口
- 运行 `ffmpeg -version` 验证

### 2. 端口被占用

**错误提示：** "Port 3001 is already in use" 或 "Port 5173 is already in use"

**解决方法：**
- 关闭占用端口的其他应用
- 或修改端口号：
  - 后端：编辑 `server/index.js`，修改 `PORT` 值
  - 前端：编辑 `vite.config.ts`，添加 `server: { port: 其他端口号 }`

### 3. 依赖安装失败

**解决方法：**
```bash
# 清理缓存
npm cache clean --force
pnpm store prune

# 删除node_modules
rm -rf node_modules pnpm-lock.yaml

# 重新安装
npm install
pnpm install --prefer-offline
```

### 4. 视频转换失败

**可能原因：**
- 视频文件损坏
- 视频格式不支持
- FFmpeg版本过旧

**解决方法：**
- 尝试其他视频文件
- 更新FFmpeg到最新版本
- 查看服务器控制台的错误信息

### 5. 上传文件过大

**错误提示：** "文件大小超过限制"

**解决方法：**
- 编辑 `server/index.js`
- 找到 `multer` 配置中的 `limits: { fileSize: ... }`
- 修改为更大的值（单位：字节）

---

## 项目文件说明

```
video-to-audio-app/
├── server/
│   ├── index.js          # 服务器主文件（Express + Socket.IO + FFmpeg）
│   └── check-ffmpeg.js   # FFmpeg检查脚本
├── src/
│   ├── App.tsx           # React主应用
│   ├── components/       # UI组件
│   └── main.tsx          # 入口文件
├── public/
│   ├── uploads/          # 上传的视频（临时存储）
│   └── output/           # 转换后的音频文件
├── package.json          # 项目配置和脚本
└── README.md            # 详细文档
```

---

## 使用技巧

1. **批量转换**
   - 一次可以拖拽多个视频文件
   - 系统会依次处理所有文件

2. **最佳音质设置**
   - 格式：FLAC（无损）或 MP3 320kbps
   - 采样率：48000 Hz
   - 声道：立体声

3. **节省空间设置**
   - 格式：MP3 或 AAC
   - 比特率：128kbps
   - 采样率：44100 Hz

4. **清理空间**
   - 转换完成后及时下载文件
   - 使用"清除已完成"按钮清理任务列表
   - 定期清理 `public/output/` 目录

---

## 开发者信息

- **作者：** MiniMax Agent
- **技术栈：** React + TypeScript + Node.js + Express + FFmpeg
- **许可证：** MIT

---

## 需要帮助？

如遇到问题：
1. 查看本文档的"常见问题解决"部分
2. 查看服务器控制台的错误信息
3. 检查浏览器控制台的错误信息
4. 确保FFmpeg已正确安装并可用

祝使用愉快！

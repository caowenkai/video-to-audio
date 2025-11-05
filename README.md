# 🎵 视频转音频应用

一个功能强大的本地视频转音频转换工具，支持多种视频格式转换为高质量音频文件。使用 React + Node.js + FFmpeg 构建，提供现代化的 Web 界面和实时转换进度显示。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)

## 功能特性

- 支持多种视频格式：MP4, AVI, MOV, MKV, FLV, WMV, WEBM等
- 支持多种音频输出格式：MP3, AAC, WAV, OGG, FLAC, M4A
- 拖拽式文件上传界面
- 实时转换进度显示
- 批量处理支持
- 可配置音频参数（比特率、采样率、声道）
- 响应式设计，适配各种设备
- 本地转换，保护隐私

## 系统要求

- Node.js 16.x 或更高版本
- FFmpeg（必须安装并添加到系统PATH）

## 快速开始

### 1. 安装FFmpeg

**Windows:**
1. 访问 https://ffmpeg.org/download.html
2. 下载Windows版本并解压
3. 将bin目录添加到系统PATH环境变量

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Linux (CentOS/RHEL):**
```bash
sudo yum install ffmpeg
```

### 2. 安装依赖

首次运行前，需要安装项目依赖：

```bash
# 安装服务器端依赖
npm install

# 安装客户端依赖
pnpm install --prefer-offline
```

### 3. 启动应用

```bash
npm start
```

这个命令会：
1. 检查FFmpeg是否已安装
2. 启动后端服务器（端口3001）
3. 启动前端开发服务器（端口5173）

### 4. 访问应用

打开浏览器访问：http://localhost:5173

## 使用方法

1. **上传视频文件**
   - 拖拽视频文件到上传区域
   - 或点击"选择文件"按钮浏览并选择文件
   - 支持批量上传多个文件

2. **配置转换参数**（可选）
   - 切换到"设置"标签
   - 选择输出格式（MP3、AAC、WAV等）
   - 选择比特率（128k-320k）
   - 选择采样率（22050Hz-48000Hz）
   - 选择声道（单声道/立体声）

3. **转换和下载**
   - 上传后自动开始转换
   - 实时查看转换进度
   - 转换完成后点击"下载"按钮获取音频文件

## 项目结构

```
video-to-audio-app/
├── server/              # 后端服务器
│   ├── index.js        # Express服务器和FFmpeg处理
│   └── check-ffmpeg.js # FFmpeg检查脚本
├── src/                # 前端源码
│   ├── App.tsx         # 主应用组件
│   ├── components/     # UI组件
│   └── main.tsx        # 入口文件
├── public/             # 静态资源
│   ├── uploads/        # 上传的视频文件（临时）
│   └── output/         # 转换后的音频文件
└── package.json        # 项目配置
```

## 技术栈

### 后端
- **Node.js + Express** - Web服务器
- **FFmpeg** - 视频音频处理
- **fluent-ffmpeg** - FFmpeg Node.js封装
- **Socket.IO** - 实时通信
- **Multer** - 文件上传处理

### 前端
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **TailwindCSS** - 样式框架
- **Radix UI** - UI组件库
- **Lucide React** - 图标库
- **Socket.IO Client** - 实时通信客户端

## 常见问题

### FFmpeg未安装
如果启动时提示FFmpeg未安装，请按照上述"安装FFmpeg"部分的说明安装。

### 端口被占用
如果3001或5173端口被占用，可以修改：
- 后端端口：编辑 `server/index.js` 中的 `PORT` 变量
- 前端端口：编辑 `vite.config.ts` 中的 `server.port` 配置

### 上传文件大小限制
默认最大文件大小为500MB，可以在 `server/index.js` 中修改 `multer` 配置的 `limits.fileSize` 参数。

## 开发命令

```bash
# 启动完整应用
npm start

# 仅启动后端服务器
npm run server

# 仅启动前端开发服务器
npm run client

# 检查FFmpeg安装状态
npm run check-ffmpeg

# 构建生产版本
npm run build
```

## 注意事项

- 转换过程中请勿关闭浏览器或服务器
- 大文件转换可能需要较长时间
- 转换完成的音频文件会保存在 `public/output/` 目录
- 上传的原始视频文件在转换完成后会自动删除

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目采用 [MIT License](LICENSE) 许可证。

## 作者

MiniMax Agent &  maoxiansheng

## 致谢

- [FFmpeg](https://ffmpeg.org/) - 强大的音视频处理工具
- [React](https://reactjs.org/) - UI 框架
- [TailwindCSS](https://tailwindcss.com/) - CSS 框架
- [Radix UI](https://www.radix-ui.com/) - UI 组件库

---

⭐ 如果这个项目对你有帮助，请给个 Star！

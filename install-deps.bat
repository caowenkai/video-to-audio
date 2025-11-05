@echo off
echo ======================================
echo 视频转音频应用 - 依赖安装脚本
echo ======================================
echo.

REM 安装服务器端依赖
echo 步骤 1/2: 安装服务器端依赖...
call npm install express cors multer socket.io fluent-ffmpeg uuid concurrently

if %ERRORLEVEL% NEQ 0 (
    echo 服务器端依赖安装失败，请检查错误信息
    exit /b 1
)

echo 服务器端依赖安装成功！
echo.

REM 安装客户端依赖
echo 步骤 2/2: 安装客户端依赖...
call pnpm install --prefer-offline

if %ERRORLEVEL% NEQ 0 (
    echo 客户端依赖安装失败，请检查错误信息
    exit /b 1
)

echo 客户端依赖安装成功！
echo.
echo ======================================
echo 所有依赖安装完成！
echo ======================================
echo.
echo 下一步：
echo 1. 确保已安装FFmpeg: ffmpeg -version
echo 2. 启动应用: npm start
echo.
pause

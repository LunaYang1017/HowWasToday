@echo off
cd /d "%~dp0"
echo 正在启动生活搭子 AI (Electron 版)...
npm start
if %errorlevel% neq 0 (
    echo.
    echo 启动失败！请确保已安装 Node.js 和运行过 npm install
    pause
)

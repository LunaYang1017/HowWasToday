@echo off
echo 正在启动《你今天过的好吗？》AI 助手...
cd /d %~dp0
c:/python313/python.exe main.py
if %errorlevel% neq 0 (
    echo.
    echo 程序运行出错，请检查配置或依赖是否安装正确。
    pause
)

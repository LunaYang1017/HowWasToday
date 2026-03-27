import PyInstaller.__main__
import os

# 获取当前目录
cur_dir = os.path.abspath(os.path.curdir)

PyInstaller.__main__.run([
    'main.py',
    '--name=LifePartner_AI_Debug',
    # '--noconsole',  # 暂时注释掉，显示命令行窗口以便排查报错
    '--onefile',
    '--clean',
    '--hidden-import=openai',
    '--hidden-import=requests',
    '--hidden-import=dotenv',
    # 显式包含你的所有本地模块
    '--collect-all=openai',
])

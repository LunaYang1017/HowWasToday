# LifePartner AI - 部署及使用指南

这是一个基于 Python 的桌面透明挂件 AI (生活搭子)。

## 1. 快速演示 (推荐)
如果你只是想展示效果，不需要配置任何 API Key：
1. 下载仓库并解压。
2. 双击运行 `main.py` (确保已安装 Python，见下文)。
3. 点击界面右上角的 **⚙️ (设置)**。
4. 在“选择服务商”下拉菜单中选择 **“演示模式 (Demo Mode)”**。
5. 点击 **保存并重启**。此时已自动加载内置演示密钥，可直接聊天。

## 2. 开发者部署
如果你想在本地正式运行或二次开发：

### 环境要求
- Windows 10/11
- Python 3.10+

### 安装步骤
1. **安装依赖库**:
   打开终端运行：
   ```bash
   pip install openai requests python-dotenv
   ```
2. **运行程序**:
   ```bash
   python main.py
   ```

## 3. 封装为 EXE (更方便别人用)
如果你想把程序发给没有 Python 环境的朋友，可以使用 `pyinstaller`:
1. 安装 pyinstaller:
   ```bash
   pip install pyinstaller
   ```
2. 执行打包命令:
   ```bash
   pyinstaller --noconsole --onefile --add-data "*.json;." --icon=NONE main.py
   ```
   *注意：打包后，程序目录下需要保留或自动生成 `config.json` 和 `user_memory.json`。*

## 4. 功能说明
- **透明度调节**: 在设置中输入 0.3-1.0 之间的数字。
- **窗口控制**: 点击空白处可拖动，在设置中可调宽高。
- **记忆系统**: AI 会记住你的喜好并在闲时主动关心。

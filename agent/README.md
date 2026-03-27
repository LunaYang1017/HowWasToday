# 《你今天过的好吗？》 - 桌面AI主动关怀助手

这是一个基于 Python 和 Tkinter 开发的桌面 AI Agent 系统，具备主动探测、行为分析和长期记忆能力。

## 核心特性
- **主动关怀**：不仅仅是问答，AI 会根据时间、空闲状态主动发起话题。
- **长期记忆**：基于本地 JSON 存储聊天记录、用户兴趣和短期状态。
- **多线程架构**：UI 响应丝滑，Agent 在后台进行分析和决策。
- **LLM 驱动**：支持任何 OpenAI 兼容的 API。

## 运行环境
- Python 3.8+
- 安装依赖：
  ```bash
  pip install -r requirements.txt
  ```

## 快速开始
1. 在根目录下修改 `config.json`，填写你的 API Key 和 Base URL。
2. 运行程序：
   ```bash
   python main.py
   ```

## 项目结构
- `main.py`: 系统入口，初始化各模块并启动线程。
- `ui.py`: Tkinter 桌面窗口界面。
- `agent.py`: 后台 Agent 核心循环。
- `memory.py`: 负责本地 JSON 存储与数据操作。
- `generator.py`: LLM 生成模块（支持 OpenAI 格式）。
- `analyzer.py`: 行为与用户意图分析。
- `decision.py`: 决定当前是否需要主动发言。
- `trigger.py`: 触发器逻辑（如空闲时长、特定时间）。

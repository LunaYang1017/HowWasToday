import json
import os
import queue
import threading
from ui import DesktopChatUI
from memory import Memory
from generator import Generator
from analyzer import Analyzer
from decision import Decision
from trigger import Trigger
from agent import BackgroundAgent

def main():
    # 0. 检查并加载配置
    config_path = "config.json"
    if not os.path.exists(config_path):
        print("错误：未找到 config.json 配置文件。请根据 README 准备配置文件。")
        return
    
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 1. 初始化消息队列 (线程通信关键)
    # UI -> Agent (用户发送的消息)
    ui_to_agent_queue = queue.Queue()
    # Agent -> UI (AI发出的消息/主动回复)
    agent_to_ui_queue = queue.Queue()

    # 2. 实例化所有模块
    memory = Memory(filename="user_memory.json")
    generator = Generator(config_path=config_path)
    analyzer = Analyzer(memory)
    decision = Decision(memory)
    trigger = Trigger(check_interval=config.get("check_interval", 10))

    # 3. 初始化并启动后台 Agent 线程
    backend_agent = BackgroundAgent(
        memory=memory,
        generator=generator,
        analyzer=analyzer,
        decision=decision,
        trigger=trigger,
        send_to_ui=agent_to_ui_queue,
        receive_from_ui=ui_to_agent_queue,
        check_interval=2 # 后台轮询主循环的频率，单位秒
    )
    backend_agent.start()

    # 4. 初始化 UI 并运行 (主线程)
    app = DesktopChatUI(
        agent_name=config.get("agent_name", "AI助手"),
        send_queue=ui_to_agent_queue,
        receive_queue=agent_to_ui_queue
    )

    print("系统已启动。UI 处于主线程，Agent 处于子线程。")
    app.run()

if __name__ == "__main__":
    main()

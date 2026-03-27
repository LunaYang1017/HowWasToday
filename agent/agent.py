import threading
import time
import queue

class BackgroundAgent(threading.Thread):
    def __init__(self, memory, generator, analyzer, decision, trigger, send_to_ui, receive_from_ui, check_interval=10):
        super().__init__()
        self.memory = memory
        self.generator = generator
        self.analyzer = analyzer
        self.decision = decision
        self.trigger = trigger
        self.send_to_ui = send_to_ui
        self.receive_from_ui = receive_from_ui
        self.check_interval = check_interval
        self.running = True
        self.daemon = True # 随主线程退出

    def run(self):
        print("Backend Agent thread started...")
        while self.running:
            # 1. 处理来自UI的用户输入
            try:
                while True:
                    user_msg = self.receive_from_ui.get_nowait()
                    if user_msg["type"] == "reload_config":
                        self.generator.reload_config()
                        print("Agent: Config reloaded.")
                        continue
                    if user_msg["type"] == "user_msg":
                        content = user_msg["content"]
                        self.trigger.update_activity()
                        
                        # 核心修正：仅在收到用户真实输入时进行分析，且必须在 add_chat 之前或明确区分角色
                        # 确保分析的是用户的 user_input，而不是 memory 里的全家桶
                        self.analyzer.analyze(content, self.memory.data["chat_history"])
                        
                        # 将用户输入存入记忆
                        self.memory.add_chat("user", content)
                        
                        # 生成回复
                        context = self.memory.get_context_summary()
                        response = self.generator.generate_response(content, context)
                        self.memory.add_chat("assistant", response)
                        
                        # 发送回UI
                        self.send_to_ui.put({"type": "agent_msg", "content": response, "proactive": False})
                        
                        # 兼容性调用
                        self.analyzer.update_user_profile()
            except queue.Empty:
                pass

            # 2. 核心逻辑：检测是否需要主动对话
            idle_sec = self.trigger.get_idle_seconds()
            if self.decision.should_talk_proactively(idle_sec):
                print(f"Decision triggered proactive message. Idle time: {idle_sec:.2f}s")
                context = self.memory.get_context_summary()
                # 传入 is_proactive=True 告诉生成器生成开场白
                proactive_msg = self.generator.generate_response(None, context, is_proactive=True)
                self.memory.add_chat("assistant", proactive_msg)
                
                # 发送到UI（显示通知提醒）
                self.send_to_ui.put({"type": "agent_msg", "content": proactive_msg, "proactive": True})

            # 3. 休眠循环
            time.sleep(self.check_interval)

    def stop(self):
        self.running = False

import tkinter as tk
from tkinter import scrolledtext, messagebox, ttk
import threading
import queue
import json
import os

class DesktopChatUI:
    def __init__(self, agent_name, send_queue, receive_queue):
        self.agent_name = agent_name
        self.send_queue = send_queue
        self.receive_queue = receive_queue
        
        self.root = tk.Tk()
        self.root.title(f"《你今天过的好吗？》 - AI主动关怀助手")
        self.root.geometry("500x700")
        self.root.configure(bg="#f0f2f5")
        
        # 置顶属性
        self.root.attributes("-topmost", False)

        # 布局
        self._setup_ui()
        
        # 轮询接收消息队列
        self.root.after(100, self._process_messages)

    def _setup_ui(self):
        # 顶部配置区域 (API 设置)
        config_frame = tk.LabelFrame(self.root, text="API 配置 (首次运行请填写)", bg="#f0f2f5", font=("微软雅黑", 9))
        config_frame.pack(fill="x", padx=10, pady=5)

        tk.Label(config_frame, text="API Key:", bg="#f0f2f5").grid(row=0, column=0, padx=5, pady=2, sticky="e")
        self.api_key_entry = tk.Entry(config_frame, show="*", width=30)
        self.api_key_entry.grid(row=0, column=1, padx=5, pady=2)

        tk.Label(config_frame, text="Base URL:", bg="#f0f2f5").grid(row=1, column=0, padx=5, pady=2, sticky="e")
        self.base_url_entry = tk.Entry(config_frame, width=30)
        self.base_url_entry.grid(row=1, column=1, padx=5, pady=2)
        # 默认值提示用户使用 DeepSeek
        if not self.base_url_entry.get():
            self.base_url_entry.insert(0, "https://api.deepseek.com")
        
        tk.Label(config_frame, text="模型名称:", bg="#f0f2f5").grid(row=2, column=0, padx=5, pady=5, sticky="e")
        self.model_combo = ttk.Combobox(config_frame, values=["deepseek-chat", "deepseek-reasoner", "gpt-3.5-turbo", "gpt-4o"], width=27)
        self.model_combo.grid(row=2, column=1, padx=5, pady=2)
        self.model_combo.set("deepseek-chat")

        save_btn = tk.Button(config_frame, text="保存配置", command=self._save_config, bg="#28a745", fg="white")
        save_btn.grid(row=0, column=2, rowspan=2, padx=10, sticky="nsew")

        # 提示信息
        tip_label = tk.Label(config_frame, text="国内推荐: DeepSeek (速度快且便宜)\nBase URL 请填写 https://api.deepseek.com", fg="#d9534f", bg="#f0f2f5", font=("微软雅黑", 8, "bold"))
        tip_label.grid(row=3, column=0, columnspan=3, pady=2)

        self._load_current_config()

        # 状态栏
        self.status_label = tk.Label(self.root, text="● 在线", fg="green", bg="#f0f2f5", font=("微软雅黑", 10))
        self.status_label.pack(anchor="nw", padx=10, pady=5)

        # 聊天区域
        self.chat_display = scrolledtext.ScrolledText(self.root, wrap=tk.WORD, font=("微软雅黑", 11))
        self.chat_display.pack(expand=True, fill="both", padx=10, pady=5)
        self.chat_display.config(state=tk.DISABLED)

        # 输入区域
        input_frame = tk.Frame(self.root, bg="#f0f2f5")
        input_frame.pack(fill="x", padx=10, pady=10)

        self.input_box = tk.Entry(input_frame, font=("微软雅黑", 11))
        self.input_box.pack(side="left", fill="x", expand=True, padx=(0, 10), ipady=5)
        self.input_box.bind("<Return>", lambda event: self._send_message())

        self.send_btn = tk.Button(input_frame, text="发送", command=self._send_message, bg="#007bff", fg="white", font=("微软雅黑", 10, "bold"), width=8)
        self.send_btn.pack(side="right")

    def _load_current_config(self):
        if os.path.exists("config.json"):
            try:
                with open("config.json", 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.api_key_entry.insert(0, config.get("api_key", ""))
                    self.base_url_entry.insert(0, config.get("base_url", "https://api.openai.com/v1"))
                    self.model_combo.set(config.get("model", "gpt-3.5-turbo"))
            except:
                pass

    def _save_config(self):
        new_config = {
            "api_key": self.api_key_entry.get().strip(),
            "base_url": self.base_url_entry.get().strip(),
            "model": self.model_combo.get().strip(),
            "user_name": "用户",
            "agent_name": self.agent_name,
            "check_interval": 10
        }
        with open("config.json", 'w', encoding='utf-8') as f:
            json.dump(new_config, f, ensure_ascii=False, indent=4)
        
        messagebox.showinfo("成功", "配置已保存！Agent 将在下次请求时生效（或请重启程序）。")
        # 通知后台 Agent 更新配置（简单实现可通过重启或让 Generator 重新读文件）
        self.send_queue.put({"type": "reload_config"})

    def _send_message(self):
        message = self.input_box.get().strip()
        if message:
            self._append_message("用户", message)
            self.input_box.delete(0, tk.END)
            self.send_queue.put({"type": "user_msg", "content": message})
            self.set_status("思考中...", "orange")

    def _append_message(self, role, content):
        self.chat_display.config(state=tk.NORMAL)
        role_tag = f"[{role}] "
        self.chat_display.insert(tk.END, f"{role_tag}{content}\n\n")
        self.chat_display.see(tk.END)
        self.chat_display.config(state=tk.DISABLED)

    def set_status(self, text, color):
        self.status_label.config(text=f"● {text}", fg=color)

    def _process_messages(self):
        """每100ms轮询一次消息队列，获取后台Agent的消息"""
        try:
            while True:
                msg = self.receive_queue.get_nowait()
                if msg["type"] == "agent_msg":
                    self._append_message(self.agent_name, msg["content"])
                    self.set_status("在线", "green")
                    
                    # AI主动讲话时置顶显示，提醒用户
                    if msg.get("proactive", False):
                        self.root.attributes("-topmost", True)
                        self.root.after(2000, lambda: self.root.attributes("-topmost", False))
                        self.root.deiconify() # 如果最小化了就弹出来
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._process_messages)

    def run(self):
        self._append_message("系统", "你好！很高兴见到你，这是一个具备主动关怀能力的AI Agent系统。")
        self.root.mainloop()

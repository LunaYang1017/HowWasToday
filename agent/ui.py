import tkinter as tk
from tkinter import scrolledtext, messagebox, ttk
import threading
import queue
import json
import os
import sys
import subprocess

class BubbleMessage(tk.Canvas):
    def __init__(self, master, role, content, agent_name, width=220):
        self.is_user = (role == "用户")
        bg_color = "#EAEAEA" if self.is_user else "#2b2b2b"
        text_color = "#000000" if self.is_user else "#FFFFFF"
        
        # 动态计算气泡宽度：根据父级容器宽度自适应
        bubble_max_w = width * 0.75
        max_text_w = bubble_max_w - 20
        
        temp_label = tk.Label(master, text=content, font=("Microsoft YaHei", 9), wraplength=max_text_w)
        temp_label.update_idletasks()
        text_w = min(max_text_w, temp_label.winfo_reqwidth())
        text_h = temp_label.winfo_reqheight()
        
        bubble_w = text_w + 20
        bubble_h = text_h + 15
        
        super().__init__(master, width=width, height=bubble_h + 10, bg="#1a1a1a", highlightthickness=0)
        
        radius = 12
        x0 = width - bubble_w - 10 if self.is_user else 10
        y0 = 3
        x1 = x0 + bubble_w
        y1 = y0 + bubble_h
        
        self.create_rounded_rect(x0, y0, x1, y1, radius, fill=bg_color, outline="")
        
        self.text_area = tk.Text(
            self, font=("Microsoft YaHei", 9), fg=text_color, bg=bg_color,
            wrap="word", borderwidth=0, highlightthickness=0, cursor="xterm"
        )
        self.text_area.insert("1.0", content)
        self.text_area.config(state="disabled")
        self.create_window(x0 + 10, y0 + 7, window=self.text_area, anchor="nw", width=text_w + 5, height=text_h + 5)

    def create_rounded_rect(self, x1, y1, x2, y2, r, **kwargs):
        points = [x1+r, y1, x1+r, y1, x2-r, y1, x2-r, y1, x2, y1, x2, y1+r, x2, y1+r, x2, y2-r, x2, y2-r, x2, y2, x2-r, y2, x2-r, y2, x1+r, y2, x1+r, y2, x1, y2, x1, y2-r, x1, y2-r, x1, y1+r, x1, y1+r, x1, y1]
        return self.create_polygon(points, **kwargs, smooth=True)

class DesktopChatUI:
    def __init__(self, agent_name, send_queue, receive_queue):
        self.agent_name = agent_name
        self.send_queue = send_queue
        self.receive_queue = receive_queue
        
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.default_alpha = 0.92
        self.root.attributes("-alpha", self.default_alpha)
        
        # 默认几何尺寸
        self.root.geometry("260x450+1200+150")
        self.root.configure(bg="#1a1a1a")

        self.root.bind("<Button-1>", self._start_move)
        self.root.bind("<B1-Motion>", self._do_move)

        # 预设模型配置
        self.model_presets = {
            "DeepSeek (推荐)": {"base_url": "https://api.deepseek.com", "model": "deepseek-chat"},
            "OpenAI (GPT-4o)": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o"},
            "OpenAI (GPT-3.5)": {"base_url": "https://api.openai.com/v1", "model": "gpt-3.5-turbo"},
            "自定义 (Custom)": {"base_url": "", "model": ""}
        }

        self._setup_ui()
        self._load_current_config() # 加载配置
        
        self.root.after(100, self._process_messages)

    def _start_move(self, event):
        # 只有点击主容器/控制栏等地方才触发移动，避免干扰输入框或内部控件
        # 获取点击的组件及其父级
        widget = event.widget
        # 如果点击的是 Scale, Entry, Scale 的滑块等，则不触发窗口拖动
        if isinstance(widget, (tk.Scale, tk.Entry, tk.Text)):
            self.drag_data = None
            return
        self.x = event.x
        self.y = event.y
        self.drag_data = True

    def _do_move(self, event):
        if not hasattr(self, 'drag_data') or self.drag_data is None:
            return
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.root.winfo_x() + deltax
        y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{x}+{y}")

    def _setup_ui(self):
        # 1. 顶部控制栏
        self.ctrl_bar = tk.Frame(self.root, bg="#1a1a1a", height=35)
        self.ctrl_bar.pack(fill="x", side="top", padx=10)
        
        tk.Label(self.ctrl_bar, text="✕", fg="#444", bg="#1a1a1a", font=("Arial", 10), cursor="hand2").pack(side="right")
        self.ctrl_bar.winfo_children()[-1].bind("<Button-1>", lambda e: self.root.destroy())
        
        tk.Label(self.ctrl_bar, text="⚙", fg="#666", bg="#1a1a1a", font=("Arial", 12), cursor="hand2").pack(side="right", padx=10)
        self.ctrl_bar.winfo_children()[-1].bind("<Button-1>", lambda e: self._toggle_config())

        # 2. 底部输入框 (固定在最底)
        self.footer = tk.Frame(self.root, bg="#1a1a1a", pady=10)
        self.footer.pack(fill="x", side="bottom")
        input_bg = tk.Frame(self.footer, bg="#333", padx=10, pady=5)
        input_bg.pack(fill="x", padx=15)
        self.input_box = tk.Entry(input_bg, bg="#333", fg="white", font=("Microsoft YaHei", 9), borderwidth=0, insertbackground="white")
        self.input_box.pack(side="left", fill="x", expand=True)
        self.input_box.bind("<Return>", lambda e: self._send_message())

        # 3. 中间聊天区域/设置面板 (自动填充剩余空间)
        self.main_container = tk.Frame(self.root, bg="#1a1a1a")
        self.main_container.pack(fill="both", expand=True, padx=5)

        self.canvas_container = tk.Canvas(self.main_container, bg="#1a1a1a", highlightthickness=0)
        self.scrollable_frame = tk.Frame(self.canvas_container, bg="#1a1a1a")
        self.scrollable_frame.bind("<Configure>", lambda e: self.canvas_container.configure(scrollregion=self.canvas_container.bbox("all")))
        
        def update_container_width(event):
             win_w = self.root.winfo_width()
             self.canvas_container.itemconfig(inner_win, width=win_w - 20)
             
        inner_win = self.canvas_container.create_window((0, 0), window=self.scrollable_frame, anchor="nw", width=240)
        self.root.bind("<Configure>", update_container_width)
        self.canvas_container.pack(fill="both", expand=True)
        self.root.bind_all("<MouseWheel>", lambda e: self.canvas_container.yview_scroll(int(-1*(e.delta/120)), "units"))

        # --- 设置面板 (初始隐藏) ---
        self.config_visible = False
        self.config_frame = tk.Frame(self.main_container, bg="#2b2b2b", padx=20, pady=15)
        
        # 窗口尺寸与透明度
        size_frame = tk.Frame(self.config_frame, bg="#2b2b2b")
        size_frame.pack(fill="x", pady=(0, 10))
        
        tk.Label(size_frame, text="W:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 8)).pack(side="left")
        self.width_entry = tk.Entry(size_frame, bg="#1a1a1a", fg="white", width=4, borderwidth=0)
        self.width_entry.pack(side="left", padx=2)
        
        tk.Label(size_frame, text="H:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 8)).pack(side="left", padx=(5, 0))
        self.height_entry = tk.Entry(size_frame, bg="#1a1a1a", fg="white", width=4, borderwidth=0)
        self.height_entry.pack(side="left", padx=2)

        tk.Label(size_frame, text="透明度(0.3-1):", fg="#888", bg="#2b2b2b", font=("微软雅黑", 8)).pack(side="left", padx=(5, 0))
        self.alpha_entry = tk.Entry(size_frame, bg="#1a1a1a", fg="white", width=4, borderwidth=0)
        self.alpha_entry.pack(side="left", padx=2)
        self.alpha_entry.bind("<KeyRelease>", lambda e: self._on_alpha_manual())

        # 选择服务商
        tk.Label(self.config_frame, text="选择服务商:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 9)).pack(anchor="w")
        self.model_var = tk.StringVar()
        self.model_combo = ttk.Combobox(self.config_frame, textvariable=self.model_var, values=list(self.model_presets.keys()), state="readonly")
        self.model_combo.pack(fill="x", pady=(2, 10))
        self.model_combo.bind("<<ComboboxSelected>>", self._on_preset_change)

        # API Key
        tk.Label(self.config_frame, text="API Key:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 9)).pack(anchor="w")
        self.api_key_entry = tk.Entry(self.config_frame, show="*", bg="#1a1a1a", fg="white", borderwidth=0, insertbackground="white")
        self.api_key_entry.pack(fill="x", pady=(2, 10))

        # Base URL
        tk.Label(self.config_frame, text="Base URL:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 9)).pack(anchor="w")
        self.base_url_entry = tk.Entry(self.config_frame, bg="#111", fg="#666", borderwidth=0, insertbackground="white")
        self.base_url_entry.pack(fill="x", pady=(2, 10))

        # Model Name
        tk.Label(self.config_frame, text="Model Name:", fg="#888", bg="#2b2b2b", font=("微软雅黑", 9)).pack(anchor="w")
        self.model_name_entry = tk.Entry(self.config_frame, bg="#111", fg="#666", borderwidth=0, insertbackground="white")
        self.model_name_entry.pack(fill="x", pady=(2, 15))

        self.save_btn = tk.Button(self.config_frame, text="保存设置", command=self._save_config, bg="#0084ff", fg="white", borderwidth=0, pady=5)
        self.save_btn.pack(fill="x")

        # 悬停交互
        self.root.bind("<Enter>", lambda e: self.root.attributes("-alpha", 1.0))
        self.root.bind("<Leave>", lambda e: self._restore_alpha())

    def _restore_alpha(self):
        try:
            val = float(self.alpha_entry.get() or 0.92)
            self.root.attributes("-alpha", val)
        except: pass

    def _update_alpha(self, val):
        try:
            self.root.attributes("-alpha", float(val))
        except: pass

    def _on_alpha_manual(self):
        try:
            val = float(self.alpha_entry.get())
            if 0.3 <= val <= 1.0:
                self.root.attributes("-alpha", val)
                self.default_alpha = val
        except: pass

    def _on_preset_change(self, event):
        preset = self.model_presets[self.model_var.get()]
        if self.model_var.get() == "自定义 (Custom)":
            self.base_url_entry.config(state="normal", fg="white", bg="#1a1a1a")
            self.model_name_entry.config(state="normal", fg="white", bg="#1a1a1a")
            self.api_key_entry.config(state="normal", fg="white", bg="#1a1a1a")
        elif "api_key" in preset:
            # 演示模式：自动填充并锁定 Key
            self.api_key_entry.config(state="normal")
            self.api_key_entry.delete(0, tk.END)
            self.api_key_entry.insert(0, preset["api_key"])
            self.api_key_entry.config(state="readonly", fg="#666", bg="#111")
            
            self.base_url_entry.config(state="normal")
            self.base_url_entry.delete(0, tk.END)
            self.base_url_entry.insert(0, preset["base_url"])
            self.base_url_entry.config(state="readonly", fg="#666", bg="#111")
            
            self.model_name_entry.config(state="normal")
            self.model_name_entry.delete(0, tk.END)
            self.model_name_entry.insert(0, preset["model"])
            self.model_name_entry.config(state="readonly", fg="#666", bg="#111")
        else:
            self.base_url_entry.config(state="normal")
            self.base_url_entry.delete(0, tk.END)
            self.base_url_entry.insert(0, preset["base_url"])
            self.base_url_entry.config(state="readonly", fg="#666", bg="#111")
            
            self.model_name_entry.config(state="normal")
            self.model_name_entry.delete(0, tk.END)
            self.model_name_entry.insert(0, preset["model"])
            self.model_name_entry.config(state="readonly", fg="#666", bg="#111")
            # 切换为普通模式时，如果 API Key 是锁定的，解锁它
            if str(self.api_key_entry.cget("state")) == "readonly":
                self.api_key_entry.config(state="normal", fg="white", bg="#1a1a1a")

    def _save_config(self):
        import sys
        import os
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "config.json")

        try:
            w = int(self.width_entry.get() or 260)
            h = int(self.height_entry.get() or 450)
            alpha = float(self.alpha_entry.get() or 0.92)
        except:
            w, h, alpha = 260, 450, 0.92
            
        config = {
            "api_key": self.api_key_entry.get().strip(),
            "base_url": self.base_url_entry.get().strip(),
            "model": self.model_name_entry.get().strip(),
            "window_width": w,
            "window_height": h,
            "window_alpha": alpha,
            "agent_name": self.agent_name
        }
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        messagebox.showinfo("成功", "配置已保存，请手动重新运行。")
        self.root.destroy()

    def _on_first_run(self):
        # 弹窗提示
        import sys
        import os
        if getattr(sys, 'frozen', False):
            msg = "注意事项：\n1. 打包后，程序目录下需要保留或自动生成 config.json 和 user_memory.json。\n2. 您的所有记忆和配置均保存在本地，不会上传至任何服务器。"
            messagebox.showinfo("欢迎使用 LifePartner AI", msg)

    def _load_current_config(self):
        import sys
        import os
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "config.json")
        
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    self.api_key_entry.insert(0, cfg.get("api_key", ""))
                    self.base_url_entry.delete(0, tk.END)
                    self.base_url_entry.insert(0, cfg.get("base_url", "https://api.deepseek.com"))
                    self.model_name_entry.delete(0, tk.END)
                    self.model_name_entry.insert(0, cfg.get("model", "deepseek-chat"))
                    
                    w = cfg.get("window_width", 260)
                    h = cfg.get("window_height", 450)
                    alpha = cfg.get("window_alpha", 0.92)
                    
                    self.width_entry.delete(0, tk.END)
                    self.width_entry.insert(0, str(w))
                    self.height_entry.delete(0, tk.END)
                    self.height_entry.insert(0, str(h))
                    self.alpha_entry.delete(0, tk.END)
                    self.alpha_entry.insert(0, str(alpha))
                    self.default_alpha = alpha
                    self.root.attributes("-alpha", alpha)
                    self.root.geometry(f"{w}x{h}")
                    
                    for name, data in self.model_presets.items():
                        if data["base_url"] == cfg.get("base_url") and data["model"] == cfg.get("model"):
                            self.model_var.set(name)
                            break
                    if not self.model_var.get():
                        self.model_var.set("自定义 (Custom)")
                    self._on_preset_change(None)
            except: pass
        else:
            # 首次运行：创建默认配置
            default_config = {
                "api_key": "",
                "base_url": "https://api.deepseek.com",
                "model": "deepseek-chat",
                "window_width": 260,
                "window_height": 450,
                "window_alpha": 0.92,
                "agent_name": self.agent_name
            }
            try:
                with open(config_path, "w", encoding="utf-8") as f:
                    json.dump(default_config, f, indent=4, ensure_ascii=False)
                # 填充UI默认值
                self.width_entry.delete(0, tk.END)
                self.width_entry.insert(0, "260")
                self.height_entry.delete(0, tk.END)
                self.height_entry.insert(0, "450")
                self.alpha_entry.delete(0, tk.END)
                self.alpha_entry.insert(0, "0.92")
                self.model_var.set("演示模式 (Demo Mode)")
                self._on_preset_change(None)
                # 首次运行提示
                if getattr(sys, 'frozen', False):
                    messagebox.showinfo("欢迎使用 LifePartner AI", "由于是首次启动，程序已在当前目录为您生成了配置文件和记忆文件。")
            except:
                pass

    def _append_message(self, role, content):
        current_w = self.root.winfo_width()
        msg_w = current_w - 20
        msg = BubbleMessage(self.scrollable_frame, role, content, self.agent_name, width=msg_w)
        msg.pack(fill="x", pady=5)
        self.root.update_idletasks()
        self.canvas_container.yview_moveto(1.0)
        
        # 消息发送时闪亮一下提醒
        try:
            current_alpha = float(self.alpha_entry.get() or 0.92)
            self.root.attributes("-alpha", 1.0)
            self.root.after(200, lambda: self.root.attributes("-alpha", current_alpha))
        except: pass

    def _send_message(self):
        text = self.input_box.get().strip()
        if text:
            self._append_message("用户", text)
            self.input_box.delete(0, tk.END)
            self.send_queue.put({"type": "user_msg", "content": text})

    def _toggle_config(self):
        if self.config_visible:
            self.config_frame.pack_forget()
            self.canvas_container.pack(fill="both", expand=True)
        else:
            self.canvas_container.pack_forget()
            self.config_frame.pack(fill="both", expand=True)
        self.config_visible = not self.config_visible

    def _process_messages(self):
        try:
            while True:
                msg = self.receive_queue.get_nowait()
                if msg["type"] == "agent_msg":
                    self._append_message(self.agent_name, msg["content"])
        except queue.Empty: pass
        finally: self.root.after(100, self._process_messages)

    def run(self):
        self.root.mainloop()

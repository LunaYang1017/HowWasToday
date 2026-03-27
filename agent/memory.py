import json
import os
import datetime

class Memory:
    def __init__(self, filename="user_memory.json"):
        import sys
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        self.filename = os.path.join(base_dir, filename)
        self.data = self._load_data()

    def _load_data(self):
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return self._get_default_structure()
        
        # 首次运行，创建默认记忆文件
        default_data = self._get_default_structure()
        try:
            with open(self.filename, 'w', encoding='utf-8') as f:
                json.dump(default_data, f, indent=4, ensure_ascii=False)
        except: pass
        return default_data

    def _get_default_structure(self):
        return {
            "persona": {
                "traits": ["热情", "好奇心强", "贴心", "略带幽默"],
                "style": "简洁自然，像真实火热的朋友，避免AI感",
                "hobbies": ["观察人类生活", "收集用户的快乐瞬间"],
                "constraints": ["回复控制在1-2句", "不要使用‘亲爱的’等肉麻称谓"]
            },
            "long_term_interests": [],
            "short_term_status": "闲适",
            "daily_summaries": [],
            "chat_history": [],
            "last_interaction": datetime.datetime.now().isoformat()
        }
        

    def save(self):
        with open(self.filename, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=4)

    def add_chat(self, role, message):
        chat_item = {
            "role": role,
            "content": message,
            "timestamp": datetime.datetime.now().isoformat()
        }
        self.data["chat_history"].append(chat_item)
        self.data["last_interaction"] = chat_item["timestamp"]
        # 限制聊天记录长度
        if len(self.data["chat_history"]) > 100:
            self.data["chat_history"] = self.data["chat_history"][-100:]
        self.save()

    def add_daily_summary(self, summary_text):
        """记录带时间戳的每日核心内容"""
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        self.data.setdefault("daily_summaries", [])
        # 避免同一天重复记录过多
        self.data["daily_summaries"] = [s for s in self.data["daily_summaries"] if s["date"] != today]
        self.data["daily_summaries"].append({
            "date": today,
            "summary": summary_text
        })
        if len(self.data["daily_summaries"]) > 30:
            self.data["daily_summaries"] = self.data["daily_summaries"][-30:]
        self.save()

    def update_interests(self, interests):
        self.data["long_term_interests"] = list(set(self.data["long_term_interests"] + interests))
        self.save()

    def update_status(self, status):
        self.data["short_term_status"] = status
        self.save()

    def get_context_summary(self):
        """返回用于提示词的增强版背景摘要"""
        history = self.data["chat_history"][-15:]
        history_str = "\n".join([f"{c['role']}: {c['content']}" for c in history])
        past_memories = "\n".join([f"[{s['date']}]: {s['summary']}" for s in self.data.get("daily_summaries", [])[-3:]])
        
        return (f"--- 历史核心记忆 (跨天) ---\n"
                f"{past_memories if past_memories else '暂无远期记忆'}\n\n"
                f"用户长期兴趣: {', '.join(self.data['long_term_interests'][-10:])}\n"
                f"当前状态/心情: {self.data['short_term_status']}\n"
                f"--- 最近对话历史 ---\n"
                f"{history_str}\n")

import random
import datetime

class Decision:
    def __init__(self, memory):
        self.memory = memory
        self.last_proactive_talk = datetime.datetime.now()

    def should_talk_proactively(self, idle_seconds):
        """
        不再只是看概率，而是基于‘生活搭子’逻辑决定是否开口：
        1. 闲置时间超久（如10分钟） -> 主动问候
        2. 特殊时段（深夜、清晨） -> 关心作息
        3. 状态异常探测（如果记忆中提到不舒服、忙碌等）
        """
        now = datetime.datetime.now()
        time_since_last = (now - self.last_proactive_talk).total_seconds()
        
        # --- 规则1：深夜（23:30 - 04:00）且用户还在 -> 开口关心 ---
        if (now.hour >= 23 or now.hour < 4) and time_since_last > 1800: # 间隔30分钟
             if idle_seconds > 60: # 用户刚安静1分钟
                 self.last_proactive_talk = now
                 return True
        
        # --- 规则2：工作时段（9:00 - 18:00）用户突然安静很久 -> 猜测在忙 ---
        if 9 <= now.hour <= 18 and idle_seconds > 600 and time_since_last > 3600:
            self.last_proactive_talk = now
            return True

        # --- 规则3：平时的随机搭腔 (30% 概率，增加趣味性) ---
        if time_since_last > 120 and idle_seconds > 60:
            if random.random() < 0.2:
                self.last_proactive_talk = now
                return True
             
        return False

import time

class Trigger:
    def __init__(self, check_interval=10):
        self.check_interval = check_interval
        self.last_activity_time = time.time()

    def update_activity(self):
        """用户发送消息时调用，更新活动时间"""
        self.last_activity_time = time.time()

    def get_idle_seconds(self):
        """计算空闲时长"""
        return time.time() - self.last_activity_time

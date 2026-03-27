import datetime

class Analyzer:
    def __init__(self, memory):
        self.memory = memory

    def analyze(self, user_input, chat_history):
        """核心分析：只分析【用户输入】，不分析【AI回复】"""
        if not user_input or user_input.startswith("（") and user_input.endswith("）"):
            return # 简单过滤可能的机器动作或空输入

        # 1. 简单的关键词提取（只针对用户的话）
        keywords = ["TF四代", "舞台", "物料", "编程", "熬夜", "bug", "代码", "左航", "摸鱼"]
        found_interests = [k for k in keywords if k in user_input]
        if found_interests:
            self.memory.update_interests(found_interests)

        # 2. 状态分析（根据用户语气）
        status = "正常"
        if any(w in user_input for w in ["累", "困", "想睡"]):
            status = "疲惫"
        elif any(w in user_input for w in ["不耐烦", "烦", "救命", "别说了"]):
            status = "烦躁"
        elif "开心" in user_input:
            status = "愉悦"
            
        if status != "正常":
            self.memory.update_status(status)

        # 3. 跨天记忆 (深夜逻辑)
        now = datetime.datetime.now()
        if (now.hour >= 23 or now.hour < 5) and len(user_input) > 5:
            # 记录用户在干嘛
            summary = f"用户深夜提到: {user_input[:20]}... 状态: {status}"
            self.memory.add_daily_summary(summary)

    def update_user_profile(self):
        """兼容性空方法"""
        pass

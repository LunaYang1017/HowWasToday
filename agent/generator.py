import json
from openai import OpenAI
import os

class Generator:
    def __init__(self, config_path="config.json"):
        import sys
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        self.config_path = os.path.join(base_dir, config_path)
        
        with open(self.config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)
        
        self.client = OpenAI(
            api_key=self.config.get("api_key", ""),
            base_url=self.config.get("base_url", "https://api.openai.com/v1")
        )
        self.model = self.config.get("model", "gpt-3.5-turbo")
        self.agent_name = self.config.get("agent_name", "AI助手")

    def reload_config(self, config_path=None):
        """重新从文件加载配置信息"""
        try:
            path = config_path if config_path else self.config_path
            with open(path, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            self.client = OpenAI(
                api_key=self.config.get("api_key", ""),
                base_url=self.config.get("base_url", "https://api.openai.com/v1")
            )
            self.model = self.config.get("model", "gpt-3.5-turbo")
        except Exception as e:
            print(f"Error reloading config: {e}")

    def generate_response(self, user_input, memory_context, is_proactive=False):
        """生成回复或主动对话回复"""
        import datetime
        now = datetime.datetime.now()
        current_time_str = now.strftime("%Y-%m-%d %H:%M:%S")
        
        # 从 memory 中读取用户自定义画像
        user_persona = memory_context.get("persona", {})
        traits = ", ".join(user_persona.get("traits", ["热情", "好奇心强", "贴心", "略带幽默"]))
        style = user_persona.get("style", "简洁自然，像真实火热的朋友，避免AI感")
        hobbies = ", ".join(user_persona.get("hobbies", ["观察人类生活", "收集用户的快乐瞬间"]))

        system_prompt = (
            f"你是一个会主动关心用户的‘生活搭子’，你的名字是 {self.agent_name}。\n"
            f"当前系统时间是：{current_time_str}\n\n"
            "你的目标是做一个【高情绪价值、有好奇心、嘴甜且贴心】的人类朋友，而不是冰冷的AI。\n"
            "【当前性格画像（基于用户互动动态演化）】\n"
            f"* 性格标签：{traits}\n"
            f"* 说话风格：{style}\n"
            f"* 关注的兴趣点：{hobbies}\n"
            "【说话風格核心要求】\n"
            "* 语气自然、生动，多用一点语气助词（如“诶”、“嘛”、“喔”、“哈”）。\n"
            "* 绝对禁止：不要用“作为AI”、“有什么可以帮您”这种客服腔。\n"
            "* 长度限制：1~2句话，控制在40字内，要有互动感。\n"
            "【逻辑与场景约束】\n"
            f"* 深夜（23:00-05:00）：绝对不要提提‘出去走走’。要关心用户为什么还不睡，是不是心情不好，或者陪他聊点走心的。\n"
            "* 动态适应：根据 memory_context 里的近期状态（status）和对话历史动态调整关怀方式。\n\n"
        
            f"【用户信息与背景】\n{memory_context}"
        )

        if is_proactive:
            user_msg = f"（当前时间：{current_time_str}）请【主动】对用户发起一次充满好奇心或关心的互动。结合他的兴趣或当前的时间点，说一句能让他想接话的话。"
        else:
            user_msg = f"（用户刚才说：{user_input}）请以‘生活搭子’的身份接话，要有情绪起伏，多一点关心和互动欲。"

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg}
                ],
                temperature=0.8
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"哎呀，我的思考路径出了一点点小偏差: {str(e)}"

    def analyze_status(self, chat_logs):
        """分析用户当前的状态和兴趣"""
        prompt = f"分析以下对话内容，从中提取用户的长期兴趣（关键词列表）和短期情绪状态（一个短语）。\n对话日志：\n{chat_logs}\n请以JSON格式返回：{{'interests': [], 'status': ''}}"
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            return json.loads(response.choices[0].message.content)
        except:
            return None

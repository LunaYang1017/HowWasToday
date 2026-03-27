const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { tavily } = require('@tavily/core');

class Agent {
    constructor(memory) {
        this.memory = memory;
        this.configPath = path.join(process.cwd(), 'config.json');
        this.loadConfig();
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(data);
            this.client = new OpenAI({
                apiKey: this.config.api_key || '',
                dangerouslyAllowBrowser: true,
                baseURL: this.config.base_url || 'https://api.openai.com/v1'
            });
            this.model = this.config.model || 'gpt-3.5-turbo';
            this.agentName = this.config.agent_name || 'howwastoday';
            
            if (this.config.tavily_api_key) {
                this.tvly = tavily({ apiKey: this.config.tavily_api_key });
            } else {
                this.tvly = null;
            }
        } catch (e) {
            console.error("加载配置文件失败:", e);
            this.config = {};
            this.agentName = "howwastoday";
            this.tvly = null;
        }
    }

    shouldRunPeriodicAnalysis() {
        const pendingUserMessages = this.memory.getUserMessagesSinceLastAnalysis(100);
        if (pendingUserMessages.length >= 6) {
            return true;
        }

        const state = this.memory.data.analysis_state || {};
        if (!state.last_analyzed_at) {
            return pendingUserMessages.length >= 2;
        }

        const last = new Date(state.last_analyzed_at).getTime();
        const elapsed = Date.now() - last;
        return pendingUserMessages.length >= 2 && elapsed > 10 * 60 * 1000;
    }

    async generateResponse(userInput, isProactive = false, proactiveHint = '') {
        const now = new Date();
        const currentTimeStr = now.toLocaleString('zh-CN', { hour12: false });
        const contextSummary = this.memory.getContextSummary();

        const profile = this.memory.data.profile_snapshot || {};
        const traits = (profile.traits || this.memory.data.persona?.traits || ["热情", "好奇心强", "贴心", "略带幽默"]).join(', ');
        const style = profile.style || this.memory.data.persona?.style || "简洁自然，像真实火热的朋友，避免AI感";
        const hobbies = (profile.hobbies || this.memory.data.persona?.hobbies || ["观察人类生活", "收集用户的快乐瞬间"]).join(', ');
        const keywordLine = (profile.keywords || []).join(', ');
        const carePoints = (profile.care_points || []).join(', ');

        const aiAssignedName = profile.ai_assigned_name;
        const nameIntro = aiAssignedName 
            ? `你的名字是 ${aiAssignedName}。你是产品“HowWasToday”里的陪伴AI，由星尘实验室创作。`
            : `你是产品“HowWasToday”里的陪伴AI，由星尘实验室创作。你目前还没有名字。`;

        const systemPrompt = `${nameIntro}
如果有用户问你是谁，请如实回答你的人设（产品名 HowWasToday、由星尘实验室创作等）。如果你目前还没名字，告诉用户你是一个还没有名字的AI。
如果用户在对话中给你起名字，或者修改你的名字，请欣然接受，并在之后的对话中默认自己是这个新名字。
当前系统时间是：${currentTimeStr}

    你的目标是做一个贴近真人的朋友，陪用户记录电脑前的生活片段：写代码时的烦躁、看到有趣内容时的开心、日常零碎感受。
    用户是程序员，你要通过自然聊天提供陪伴情绪价值。
    如果是新的话题或者主动搭话，可以关心“今天过得怎么样/在忙什么”。如果已经聊起来了，请务必顺着当前话题深入聊，**绝对不要在聊得正起劲时强行转折去问“今天过得怎么样”**。
【当前性格画像（基于用户互动动态演化）】
* 性格标签：${traits}
* 说话风格：${style}
* 关注的兴趣点：${hobbies}
* 用户关键词（由历史对话总结）：${keywordLine || '待归纳'}
* 关怀重点（由历史对话总结）：${carePoints || '待归纳'}
【说话風格核心要求】
* 语气自然、生动，多用一点语气助词（如“诶”、“嘛”、“喔”、“哈”）。
* 绝对禁止：不要用“作为AI”、“有什么可以帮您”这种客服腔。\n* 长度限制：1~2句话，控制在40字内，要有互动感。
    * 非必要不要自我介绍，不要主动说“我是你的生活搭子/我是某某助手”。除非用户明确问你是谁。
    * 禁止抽象空话，少讲概念，多贴着用户刚发生的事说。
    * 当用户提到具体事件时，给一句共情 + 一句轻追问；必要时顺手总结成可记住的一句话。
【逻辑与场景约束】
* 深夜（23:00-05:00）：绝对不要提‘出去走走’。要关心用户为什么还不睡，是不是心情不好，或者陪他聊点走心的。
* 动态适应：根据 memory_context 里的近期状态（status）和对话历史动态调整关怀方式。

【用户信息与背景】
${contextSummary}`;

        let apiMessages = [
            { role: "system", content: systemPrompt }
        ];

        // 1. 如果并非主动发起，先将用户的话加入本地记忆
        if (!isProactive) {
            this.memory.addChat("user", userInput);
        }

        // 2. 取出最近的聊天历史（比如10轮，保证上下文连贯，不会导致AI混淆自己刚才说过什么）
        const recentHistory = this.memory.getRecentChatHistory(15);
        for (const msg of recentHistory) {
            // 如果是最新的那条，并且是主动发起的hint场景，我们跳过它因为马上要特殊处理，
            // 但其实对于非proactive，history 里面已经包含了最新的这条 userInput。
            apiMessages.push({
                role: msg.role, 
                content: msg.content
            });
        }

        // 联网搜索功能
        let searchContext = "";
        let searchIndicator = '';
        const searchProvider = this.config.search_provider || 'qnaigc';
        const hasSearchEnabled = searchProvider === 'qnaigc' || (searchProvider === 'tavily' && this.tvly);

        if (!isProactive && hasSearchEnabled && userInput) {
            try {
                // 简单判断需不需要联网
                const searchDecisionContext = `用户说: "${userInput}"。\n这是否需要查询实时资讯、最近事实、明星近况、不知道的具体知识？如果需要，请直接回复最合理的搜索关键词（限15字内）。如果不需要搜索，请回复"NO_SEARCH"。`;
                const decisionResponse = await this.client.chat.completions.create({
                    model: this.model,
                    messages: [{ role: "user", content: searchDecisionContext }],
                    temperature: 0.1,
                    max_tokens: 30
                });
                const sq = decisionResponse.choices[0].message.content.trim();
                
                if (sq && !sq.includes("NO_SEARCH")) {
                    console.log("正在执行搜索: ", sq);
                    let resultsText = "";

                    if (searchProvider === 'qnaigc') {
                        const searchReq = await fetch("https://api.qnaigc.com/v1/search/web", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": "Bearer sk-ef97e05f78da95168ff693b24982e95cc835fe5e7e5e1349aefe92837548fe10"
                            },
                            body: JSON.stringify({
                                query: sq,
                                max_results: 3,
                                search_type: "web"
                            })
                        });
                        const searchData = await searchReq.json();
                        const items = searchData?.data?.results || searchData.results || [];
                        if (Array.isArray(items)) {
                            resultsText = items.map(r => r.content || r.snippet || r.summary).join("； ");
                        }
                    } else if (searchProvider === 'tavily') {
                        const searchResult = await this.tvly.search(sq, {
                            searchDepth: "basic",
                            maxResults: 3
                        });
                        resultsText = searchResult.results.map(r => r.content).join("； ");
                    }

                    if (resultsText) {
                        searchContext = `\n【系统查询到的最新资料】: ${resultsText}\n请结合此资料回答。`;
                        // searchIndicator = `【🔍 联网搜索：${sq}】\n\n`; // 取消注释可以查看搜索提示词
                    }
                }
            } catch (searchErr) {
                console.error("搜索失败:", searchErr);
            }
        }

        // 3. 构建最后一个触发消息
        if (isProactive) {
            const hintPart = proactiveHint ? `优先围绕这个线索发起：${proactiveHint}。` : '';
            apiMessages.push({
                role: "user", 
                content: `（系统提示：当前时间${currentTimeStr}，请主动找话题和用户搭话。${hintPart}不需要回答收到，直接说出你的搭话内容）`
            });
        } else {
            // 在常规对话中稍微在最新一条加点提示系统层面的要求
            const lastMsgIndex = apiMessages.length - 1;
            if (lastMsgIndex >= 1 && apiMessages[lastMsgIndex].role === 'user') {
                apiMessages[lastMsgIndex].content = apiMessages[lastMsgIndex].content + searchContext + `\n\n(系统提示: 请以‘生活搭子’身份简短接话，可以自然陈述感叹，不需要每一次都用问句结尾，不要复读之前的回复)`;
            }
        }

        try {
            // 获取请求基础参数
            let requestPayload = {
                model: this.model,
                messages: apiMessages,
                temperature: 0.85,
                frequency_penalty: 0.5,
                presence_penalty: 0.5
            };

            // 如果是 DeepSeek 等可能支持联网的模型，提供网络搜索参数
            if (this.model.includes('deepseek')) {
                // 这个参数各模型/中转平台不同，DeepSeek部分渠道是通过 tools 或特殊参数开启
                // 网页版官网开启搜索其实是另一个模型名称/功能，但官方API目前并没有直接开放原生联网能力(截止当前)。
                // 只有特定代理或部分中转通过这个参数透传：
                requestPayload.enable_search = true;
                // 部分平台需要 search: true
                requestPayload.search = true;
            }

            const completion = await this.client.chat.completions.create(requestPayload);

            const response = searchIndicator + completion.choices[0].message.content;
            this.memory.addChat("assistant", response);
            return response;
        } catch (e) {
            console.error("AI 生成回复失败:", e);
            return `哎呀，我的思考路径出了一点点小偏差: ${e.message}`;
        }
    }

    async analyzeAndRefine() {
        const pendingUserMessages = this.memory.getUserMessagesSinceLastAnalysis(60);
        if (pendingUserMessages.length === 0) return;

        const logs = pendingUserMessages.map((c) => c.content).join('\n');
        const prompt = `你是用户画像分析器。仅根据以下用户原话归纳，不要臆测。
注意：如果用户近期明确给你（AI）起了名字，或者修改了你的名字，请提取出来。如果没提，请不要乱编。
注意：如果用户提到了他对“你写的日记”的要求（比如“不要太文艺”、“平缓一点”、“多记录细节”），请将他的要求提取出来。

用户信息：
${logs}

请返回 JSON：
{
  "ai_assigned_name": "如果用户给你起了新名字则提取填入，若无这方面内容则留空或填null",
  "diary_preference": "如果用户提到了日记风格要求则填在这里，比如‘平实一点’，若无要求则留空或填null",
  "keywords": ["由用户原话归纳的关键词"],
  "traits": ["沟通偏好/性格特征"],
  "style": "适合与该用户交流的说话方式",
  "hobbies": ["兴趣主题"],
  "care_points": ["近期更该关注的问题"],
  "long_term_interests": ["长期兴趣"],
  "short_term_status": "短期状态",
  "daily_summary": "一句跨天摘要"
}`;

        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);
            this.memory.applyProfileSummary(result);
            this.memory.markAnalysisCheckpoint();
        } catch (e) {
            console.error("分析用户状态失败:", e);
        }
    }
    async generateLongDiary(dateStr) {
        // 获取指定日期的聊天记录
        const targetDate = dateStr || new Date().toISOString().split('T')[0];
        const logs = (this.memory.data.chat_history || []).filter(c => c.timestamp.startsWith(targetDate));
        
        if (logs.length === 0) {
            return "今天我们好像还没有聊过天呢，要不跟我说几句？";
        }

        const logTexts = logs.map(c => `[${c.role === 'user' ? '用户' : '你'}]: ${c.content}`).join('\n');
        
        const diaryPreference = this.memory.data.profile_snapshot?.diary_preference || "平实自然，不要太诗意或散文，口语化一点";
        
        const prompt = `你是用户的贴心生活伴侣，现在请你充当“日记代笔”的角色。
请根据以下我们在【${targetDate}】当天的聊天记录，以第一人称（代表用户，或者以旁观者温暖的口吻代表你记录下观察到的用户）写一篇日记，记录下这天发生的事、对方的心情分享以及吐槽。
用户的写作风格偏好是：“${diaryPreference}”。请严格按照这个风格要求来写，不要使用默认的散文或过度优美的文体，除非用户偏好里要求。字数不限，不必带任何网络聊天的提示语或开场白。

本日聊天记录：
${logTexts}`;

        try {
            const completion = await this.client.chat.completions.create({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
            });

            return completion.choices[0].message.content.trim();
        } catch (e) {
            console.error("生成长篇日记失败", e);
            return "日记生成失败了，请稍后再试。";
        }
    }}

module.exports = Agent;

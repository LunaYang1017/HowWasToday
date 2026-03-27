const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { app } = require('@electron/remote');

// 导入我们的模块
const Memory = require('./memory.js');
const Agent = require('./agent.js');

// 初始化记忆和代理
const memory = new Memory();
const agent = new Agent(memory);

const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

const MODEL_BASE_URL_MAP = {
    'deepseek-chat': 'https://api.deepseek.com',
    'deepseek-reasoner': 'https://api.deepseek.com',
    'gpt-4o-mini': 'https://api.openai.com/v1',
    'gpt-4.1-mini': 'https://api.openai.com/v1'
};

// 1. 初始化界面渲染逻辑
function appendMessage(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `bubble ${role === 'user' ? 'user' : 'agent'}`;
    bubble.innerText = text;
    chatArea.appendChild(bubble);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 加载历史记录 (如果有的话)
function loadHistory() {
    if (memory.data.chat_history && memory.data.chat_history.length > 0) {
        memory.data.chat_history.slice(-10).forEach(chat => {
            appendMessage(chat.role, chat.content);
        });
    }
}

// 2. 处理发送逻辑
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    userInput.value = '';

    const response = await agent.generateResponse(text);
    appendMessage('agent', response);
    
    // 画像分析改为“按需触发”，避免每句都分析
    if (agent.shouldRunPeriodicAnalysis()) {
        agent.analyzeAndRefine();
    }
    updateActivity();
}

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 3. 处理主动关怀触发器 (Triggers)
let lastActiveTime = Date.now();
let lastProactiveAt = 0;

function updateActivity() {
    lastActiveTime = Date.now();
}

function pickProactiveHint() {
    const interests = (memory.data.long_term_interests || []).slice(-10);
    const recentUserChats = (memory.data.chat_history || [])
        .filter((c) => c.role === 'user')
        .slice(-8)
        .map((c) => c.content);

    if (interests.length > 0) {
        return `你上次挺在意「${interests[Math.floor(Math.random() * interests.length)]}」`;
    }

    if (recentUserChats.length > 0) {
        const latest = recentUserChats[recentUserChats.length - 1];
        return `延续他最近提到的话题：${latest.slice(0, 20)}`;
    }

    return '从今天状态和时间点自然开场';
}

function shouldTriggerProactive(idleSeconds) {
    const now = new Date();
    const hour = now.getHours();
    const status = memory.data.short_term_status || '正常';
    const secondsSinceLastProactive = lastProactiveAt === 0 ? Number.MAX_SAFE_INTEGER : Math.floor((Date.now() - lastProactiveAt) / 1000);

    // 深夜模式：减少频率但更关心作息
    if ((hour >= 23 || hour < 5) && idleSeconds > 120 && secondsSinceLastProactive > 1200) {
        return true;
    }

    // 白天工作时段：中等频率
    if (hour >= 9 && hour <= 18 && idleSeconds > 420 && secondsSinceLastProactive > 900) {
        return true;
    }

    // 用户状态异常时，提升关怀频率
    if ((status === '疲惫' || status === '烦躁') && idleSeconds > 180 && secondsSinceLastProactive > 480) {
        return true;
    }

    // 常规随机搭话（比旧版更积极）
    if (idleSeconds > 240 && secondsSinceLastProactive > 360) {
        return Math.random() < 0.35;
    }

    return false;
}

function getLatestLateNightUserMessage() {
    const userChats = (memory.data.chat_history || []).filter((c) => c.role === 'user');
    for (let i = userChats.length - 1; i >= 0; i -= 1) {
        const item = userChats[i];
        const ts = new Date(item.timestamp);
        const h = ts.getHours();
        if (h >= 23 || h < 5) {
            return item.content || '';
        }
    }
    return '';
}

function pickStartupTopic() {
    const hour = new Date().getHours();
    const interests = (memory.data.long_term_interests || []).slice(-10);
    const lateNightMsg = getLatestLateNightUserMessage();

    const buckets = [];
    buckets.push({ kind: 'checkin', weight: 7 });
    buckets.push({ kind: 'time', weight: 2 });
    buckets.push({ kind: 'weather', weight: 2 });

    if (interests.length > 0) {
        buckets.push({ kind: 'hobby', weight: 4 });
    }
    if (lateNightMsg) {
        buckets.push({ kind: 'last_night', weight: 4 });
    }
    if (hour >= 23 || hour < 6) {
        buckets.push({ kind: 'sleep_care', weight: 3 });
    }

    const total = buckets.reduce((acc, b) => acc + b.weight, 0);
    let r = Math.random() * total;
    let selected = buckets[0].kind;
    for (const b of buckets) {
        r -= b.weight;
        if (r <= 0) {
            selected = b.kind;
            break;
        }
    }

    if (selected === 'hobby') {
        const interest = interests[Math.floor(Math.random() * interests.length)];
        return {
            localFallback: `我刚想起你之前提过${interest}，今天它有新进展吗？`,
            hint: `围绕用户长期兴趣「${interest}」主动开场，像朋友追问近况。`
        };
    }

    if (selected === 'checkin') {
        return {
            localFallback: '你来啦！今天过的好吗？',
            hint: '先关心“今天过得好不好”，再顺着用户状态接一个小追问。'
        };
    }

    if (selected === 'last_night') {
        return {
            localFallback: `昨晚你提到“${lateNightMsg.slice(0, 16)}...”，现在感觉好点了吗？`,
            hint: `衔接昨夜话题「${lateNightMsg.slice(0, 24)}...」，先关心再追问。`
        };
    }

    if (selected === 'sleep_care') {
        return {
            localFallback: '这个点还醒着呀，今天是忙到现在还是有点睡不着？',
            hint: '深夜关怀场景，不提外出，重点关心作息和情绪。'
        };
    }

    if (selected === 'weather') {
        return {
            localFallback: '今天外面体感怎么样，冷不冷？我好奇你出门感受。',
            hint: '以天气体感做轻松开场，不需要给真实天气数据。'
        };
    }

    return {
        localFallback: '新的一天我来报到啦，你现在是学习模式还是放松模式？',
        hint: '基于当前时间段给一句自然问候，并引导用户分享当下状态。'
    };
}

async function sendStartupProactiveMessage() {
    // 如果没有任何聊天记录，则使用固定的初次问候
    if (!memory.data.chat_history || memory.data.chat_history.length === 0) {
        appendMessage('agent', '你来啦！今天过的好吗？');
        lastProactiveAt = Date.now();
        return;
    }

    const { localFallback, hint } = pickStartupTopic();

    // 无 key 时用本地开场，避免报错打断体验
    if (!agent.config.api_key) {
        appendMessage('agent', ` ${localFallback}`);
        lastProactiveAt = Date.now();
        return;
    }

    const msg = await agent.generateResponse(null, true, hint);
    appendMessage('agent', msg);
    lastProactiveAt = Date.now();
}

// 监听窗口内鼠标/键盘更新活跃度
window.addEventListener('mousemove', updateActivity);
window.addEventListener('keydown', updateActivity);

// 每隔 30 秒检查一次是否需要主动说话
setInterval(async () => {
    const idleSeconds = (Date.now() - lastActiveTime) / 1000;

    if (shouldTriggerProactive(idleSeconds)) {
        const hint = pickProactiveHint();
        const proactiveMsg = await agent.generateResponse(null, true, hint);
        appendMessage('agent', proactiveMsg);
        lastProactiveAt = Date.now();
    }
}, 30000);

// 定期归纳聊天记录，自动更新用户画像与提示词
setInterval(async () => {
    if (agent.shouldRunPeriodicAnalysis()) {
        await agent.analyzeAndRefine();
    }
}, 120000);

// 4. 配置窗口与功能面板管理
window.toggleConfig = function() {
    const overlay = document.getElementById('config-overlay');
    const diaryOverlay = document.getElementById('diary-overlay');
    if (diaryOverlay) diaryOverlay.style.display = 'none';
    overlay.style.display = overlay.style.display === 'block' ? 'none' : 'block';
};

window.toggleDiary = function() {
    const diaryOverlay = document.getElementById('diary-overlay');
    const configOverlay = document.getElementById('config-overlay');
    if (configOverlay) configOverlay.style.display = 'none';
    
    if (diaryOverlay.style.display === 'block') {
        diaryOverlay.style.display = 'none';
    } else {
        diaryOverlay.style.display = 'block';
        refreshDiaryList();
    }
};

window.refreshDiaryList = function() {
    const dateSelect = document.getElementById('diary-date-select');
    const dates = memory.getAllDiaryDates();
    const today = new Date().toISOString().split('T')[0];
    
    dateSelect.innerHTML = '';
    
    if (dates.length === 0 && !dates.includes(today)) {
        dates.push(today);
    } else if (!dates.includes(today)) {
        dates.unshift(today);
    }
    
    // 去重
    const uniqueDates = [...new Set(dates)].sort((a,b)=>b.localeCompare(a));
    
    uniqueDates.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.innerText = d === today ? `${d} (今天)` : d;
        dateSelect.appendChild(opt);
    });
    
    if(uniqueDates.length > 0) {
        window.loadDiary(uniqueDates[0]);
    }
};

window.loadDiary = function(dateStr) {
    const contentBox = document.getElementById('diary-content');
    const diaryStr = memory.getLongDiary(dateStr);
    if (diaryStr) {
        contentBox.innerText = diaryStr;
    } else {
        contentBox.innerText = "这天还没有生成日记哦，点击下方按钮生成吧！";
    }
};

window.generateDiaryNow = async function() {
    const dateSelect = document.getElementById('diary-date-select');
    const targetDate = dateSelect.value;
    const contentBox = document.getElementById('diary-content');
    
    contentBox.innerText = "正在细细回忆今天的点滴，记录中，请稍候...";
    
    const newDiary = await agent.generateLongDiary(targetDate);
    memory.saveLongDiary(targetDate, newDiary);
    
    contentBox.innerText = newDiary;
};

window.sendMessage = sendMessage;

window.saveConfig = function() {
    const apiKey = document.getElementById('api-key').value.trim();
    const baseUrl = document.getElementById('base-url-input').value.trim();
    const model = document.getElementById('model-select').value;
    const tavilyKey = document.getElementById('tavily-api-key') ? document.getElementById('tavily-api-key').value.trim() : '';

    const newConfig = {
        api_key: apiKey,
        base_url: baseUrl,
        model: model,
        agent_name: agent.agentName,
        tavily_api_key: tavilyKey
    };

    fs.writeFileSync(agent.configPath, JSON.stringify(newConfig, null, 4));
    alert('配置已保存，正在刷新...');
    location.reload();
};

window.clearChatHistory = function() {
    const ok = confirm('确认清空当前本地聊天记录吗？此操作不可撤销。');
    if (!ok) return;

    memory.clearChatRecords();
    chatArea.innerHTML = '';
    loadHistory();
    alert('已清空聊天记录。');
};

// 5. 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 自动填充配置输入框
    const apiKeyEl = document.getElementById('api-key');
    if (apiKeyEl) apiKeyEl.value = agent.config.api_key || '';

    const tavilyKeyEl = document.getElementById('tavily-api-key');
    if (tavilyKeyEl) tavilyKeyEl.value = agent.config.tavily_api_key || '';

    const modelSelectEl = document.getElementById('model-select');
    const baseUrlEl = document.getElementById('base-url-input');

    if (modelSelectEl) {
        const currentModel = agent.config.model || 'deepseek-chat';
        modelSelectEl.value = currentModel;

        modelSelectEl.addEventListener('change', () => {
            const selectedModel = modelSelectEl.value;
            const mappedUrl = MODEL_BASE_URL_MAP[selectedModel] || 'https://api.openai.com/v1';
            if (baseUrlEl) {
                baseUrlEl.value = mappedUrl;
            }
        });
    }

    if (baseUrlEl) {
        baseUrlEl.value = agent.config.base_url || MODEL_BASE_URL_MAP[agent.config.model] || 'https://api.deepseek.com';
    }
    
    loadHistory();

    // 每次启动后主动发起一条问候，话题由轻量分类器选择
    setTimeout(() => {
        sendStartupProactiveMessage();
    }, 900);
});

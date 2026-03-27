const fs = require('fs');
const path = require('path');

class Memory {
    constructor(filename = 'user_memory.json') {
        const { app } = require('@electron/remote');
        // 在 Electron 中，建议将用户数据存储在 appData 目录中
        // 如果是绿色版或者想要和 exe 放在一起，可以使用 process.resourcesPath 
        // 这里我们优先使用 userData 目录，保证多用户隔离且有写入权限
        this.userDataPath = app.getPath('userData');
        this.filename = path.join(this.userDataPath, filename);
        this.data = this._loadData();
    }

    _loadData() {
        if (fs.existsSync(this.filename)) {
            try {
                const rawData = fs.readFileSync(this.filename, 'utf-8');
                const normalized = rawData.replace(/^\uFEFF/, '');
                return JSON.parse(normalized);
            } catch (e) {
                console.error("加载记忆失败，正在使用默认结构", e);
                return this._getDefaultStructure();
            }
        }
        
        const defaultData = this._getDefaultStructure();
        this._saveToFile(defaultData);
        return defaultData;
    }

    _getDefaultStructure() {
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
            "long_diaries": {},
            "chat_history": [],
            "profile_snapshot": {
                "ai_assigned_name": null,
                "keywords": [],
                "traits": ["热情", "好奇心强", "贴心", "略带幽默"],
                "style": "简洁自然，像真实火热的朋友，避免AI感",
                "hobbies": ["观察人类生活", "收集用户的快乐瞬间"],
                "care_points": [],
                "updated_at": null
            },
            "analysis_state": {
                "last_analyzed_user_count": 0,
                "last_analyzed_at": null
            },
            "last_interaction": new Date().toISOString()
        };
    }

    _ensureFields() {
        if (!this.data.profile_snapshot) {
            this.data.profile_snapshot = {
                ai_assigned_name: null,
                keywords: [],
                traits: ["热情", "好奇心强", "贴心", "略带幽默"],
                style: "简洁自然，像真实火热的朋友，避免AI感",
                hobbies: ["观察人类生活", "收集用户的快乐瞬间"],
                care_points: [],
                updated_at: null
            };
        } else if (typeof this.data.profile_snapshot.ai_assigned_name === 'undefined') {
            this.data.profile_snapshot.ai_assigned_name = null;
        }
        if (!this.data.analysis_state) {
            this.data.analysis_state = {
                last_analyzed_user_count: 0,
                last_analyzed_at: null
            };
        }
        if (!this.data.long_diaries) {
            this.data.long_diaries = {};
        }
    }

    _saveToFile(data) {
        try {
            const jsonText = JSON.stringify(data, null, 4);
            // 写入 UTF-8 BOM，提升 Windows 记事本/PowerShell 5.1 的中文识别兼容性
            fs.writeFileSync(this.filename, '\uFEFF' + jsonText, 'utf-8');
        } catch (e) {
            console.error("保存记忆文件失败:", e);
        }
    }

    save() {
        this._ensureFields();
        this._saveToFile(this.data);
    }

    addChat(role, message) {
        const chatItem = {
            role: role,
            content: message,
            timestamp: new Date().toISOString()
        };
        this.data.chat_history.push(chatItem);
        this.data.last_interaction = chatItem.timestamp;

        // 保留更长会话记忆，支持后续主动回调话题
        if (this.data.chat_history.length > 1000) {
            this.data.chat_history = this.data.chat_history.slice(-1000);
        }
        this.save();
    }

    addDailySummary(summaryText) {
        const today = new Date().toISOString().split('T')[0];
        if (!this.data.daily_summaries) this.data.daily_summaries = [];
        
        // 过滤掉当天的旧记录
        this.data.daily_summaries = this.data.daily_summaries.filter(s => s.date !== today);
        this.data.daily_summaries.push({
            date: today,
            summary: summaryText
        });

        if (this.data.daily_summaries.length > 30) {
            this.data.daily_summaries = this.data.daily_summaries.slice(-30);
        }
        this.save();
    }

    saveLongDiary(dateStr, content) {
        this._ensureFields();
        this.data.long_diaries[dateStr] = content;
        this.save();
    }

    getLongDiary(dateStr) {
        this._ensureFields();
        return this.data.long_diaries[dateStr] || null;
    }

    getAllDiaryDates() {
        this._ensureFields();
        return Object.keys(this.data.long_diaries).sort((a, b) => b.localeCompare(a));
    }

    clearChatRecords() {
        this._ensureFields();
        this.data.chat_history = [];
        this.data.daily_summaries = [];
        this.data.long_term_interests = [];
        this.data.short_term_status = '闲适';

        this.data.profile_snapshot.ai_assigned_name = null;
        this.data.profile_snapshot.keywords = [];
        this.data.profile_snapshot.care_points = [];
        this.data.profile_snapshot.updated_at = null;

        this.data.analysis_state.last_analyzed_user_count = 0;
        this.data.analysis_state.last_analyzed_at = null;

        this.data.last_interaction = new Date().toISOString();
        this.save();
    }

    updateInterests(interests) {
        const combined = [...this.data.long_term_interests, ...interests];
        this.data.long_term_interests = [...new Set(combined)];
        this.save();
    }

    updateStatus(status) {
        this.data.short_term_status = status;
        this.save();
    }

    getUserMessageCount() {
        return (this.data.chat_history || []).filter((c) => c.role === 'user').length;
    }

    getUserMessagesSinceLastAnalysis(limit = 40) {
        this._ensureFields();
        const start = this.data.analysis_state.last_analyzed_user_count || 0;
        const userMsgs = (this.data.chat_history || []).filter((c) => c.role === 'user');
        return userMsgs.slice(start).slice(-limit);
    }

    markAnalysisCheckpoint() {
        this._ensureFields();
        this.data.analysis_state.last_analyzed_user_count = this.getUserMessageCount();
        this.data.analysis_state.last_analyzed_at = new Date().toISOString();
        this.save();
    }

    applyProfileSummary(summary) {
        this._ensureFields();
        const profile = this.data.profile_snapshot;

        if (typeof summary.ai_assigned_name === 'string' && summary.ai_assigned_name.trim()) {
            profile.ai_assigned_name = summary.ai_assigned_name.trim();
        }
        if (typeof summary.diary_preference === 'string' && summary.diary_preference.trim()) {
            profile.diary_preference = summary.diary_preference.trim();
        }

        if (Array.isArray(summary.keywords)) {
            profile.keywords = [...new Set(summary.keywords.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
        }
        if (Array.isArray(summary.traits) && summary.traits.length > 0) {
            profile.traits = summary.traits.slice(0, 8);
        }
        if (typeof summary.style === 'string' && summary.style.trim()) {
            profile.style = summary.style.trim();
        }
        if (Array.isArray(summary.hobbies) && summary.hobbies.length > 0) {
            profile.hobbies = summary.hobbies.slice(0, 8);
        }
        if (Array.isArray(summary.care_points)) {
            profile.care_points = summary.care_points.slice(0, 10);
        }
        profile.updated_at = new Date().toISOString();

        if (Array.isArray(summary.long_term_interests)) {
            this.updateInterests(summary.long_term_interests);
        }
        if (typeof summary.short_term_status === 'string' && summary.short_term_status.trim()) {
            this.updateStatus(summary.short_term_status.trim());
        }
        if (typeof summary.daily_summary === 'string' && summary.daily_summary.trim()) {
            this.addDailySummary(summary.daily_summary.trim());
        }

        this.save();
    }

    getContextSummary() {
        this._ensureFields();
        const summaries = this.data.daily_summaries || [];
        const pastMemories = summaries.slice(-3).map(s => `[${s.date}]: ${s.summary}`).join('\n');
        const profile = this.data.profile_snapshot || {};

        return `--- 历史核心记忆 (跨天) ---
${pastMemories || '暂无远期记忆'}

    用户画像关键词: ${(profile.keywords || []).join(', ')}
    用户沟通偏好: ${profile.style || '待分析'}
    关怀重点: ${(profile.care_points || []).join(', ')}

用户长期兴趣: ${this.data.long_term_interests.slice(-10).join(', ')}
当前状态/心情: ${this.data.short_term_status}
`;
    }

    getRecentChatHistory(limit = 15) {
        return this.data.chat_history.slice(-limit);
    }
}

module.exports = Memory;

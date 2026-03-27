const fs = require('fs');

const file = 'agent.js';
let content = fs.readFileSync(file, 'utf8');

const oldStr1 = `// 如果用户有Tavily搜索，先用一个小LLM调用判断是否需要搜索
        let searchContext = "";
        let searchIndicator = '';
        if (!isProactive && this.tvly && userInput) {
            try {
                // 简单判断需不需要联网
                const searchDecisionContext = \`用户说: "\${userInput}"。\\n这是否需要查询实时资讯、最近事实、明星近况、不知道的具体知识？如果需要，请直接回复最合理的搜索关键词（限15字内）。如果不需要搜索，请回复"NO_SEARCH"。\`;
                const decisionResponse = await this.client.chat.completions.create({
                    model: this.model,
                    messages: [{ role: "user", content: searchDecisionContext }],
                    temperature: 0.1,
                    max_tokens: 30
                });
                const sq = decisionResponse.choices[0].message.content.trim();
                
                if (sq && !sq.includes("NO_SEARCH")) {
                    console.log("正在执行搜索: ", sq);
                    const searchResult = await this.tvly.search(sq, {
                        searchDepth: "basic",
                        maxResults: 3
                    });
                    const resultsText = searchResult.results.map(r => r.content).join("； ");
                    searchContext = \`\\n【系统查询到的最新资料】: \${resultsText}\\n请结合此资料回答。\`;
                    // searchIndicator = \`【🔍 联网搜索：\${sq}】\\n\\n\`; // 取消注释可以查看搜索提示词
                }
            } catch (searchErr) {
                console.error("Tavily搜索失败:", searchErr);
            }
        }`;

const newStr = `// 联网搜索功能
        let searchContext = "";
        let searchIndicator = '';
        const searchProvider = this.config.search_provider || 'qnaigc';
        const hasSearchEnabled = searchProvider === 'qnaigc' || (searchProvider === 'tavily' && this.tvly);

        if (!isProactive && hasSearchEnabled && userInput) {
            try {
                // 简单判断需不需要联网
                const searchDecisionContext = \`用户说: "\${userInput}"。\\n这是否需要查询实时资讯、最近事实、明星近况、不知道的具体知识？如果需要，请直接回复最合理的搜索关键词（限15字内）。如果不需要搜索，请回复"NO_SEARCH"。\`;
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
                        const items = searchData.results || searchData.data || [];
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
                        searchContext = \`\\n【系统查询到的最新资料】: \${resultsText}\\n请结合此资料回答。\`;
                        // searchIndicator = \`【🔍 联网搜索：\${sq}】\\n\\n\`; // 取消注释可以查看搜索提示词
                    }
                }
            } catch (searchErr) {
                console.error("搜索失败:", searchErr);
            }
        }`;

let replaced = false;
if (content.includes(oldStr1)) {
    content = content.replace(oldStr1, newStr);
    replaced = true;
} else if (content.includes(oldStr1.replace(/\n/g, '\r\n'))) {
    content = content.replace(oldStr1.replace(/\n/g, '\r\n'), newStr.replace(/\n/g, '\r\n'));
    replaced = true;
}

if (replaced) {
    fs.writeFileSync(file, content, 'utf8');
    console.log("Replaced successfully!");
} else {
    console.log("Could not find string to replace");
}

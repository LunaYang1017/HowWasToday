const fs = require('fs');

const file = 'g:/ABUROBOCON2026控制/35.agent/agent_electron/agent.js';
let content = fs.readFileSync(file, 'utf8');

const oldStr1 = `                        const searchData = await searchReq.json();
                        const items = searchData.results || searchData.data || [];
                        if (Array.isArray(items)) {`;

const newStr = `                        const searchData = await searchReq.json();
                        const items = searchData?.data?.results || searchData.results || [];
                        if (Array.isArray(items)) {`;

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

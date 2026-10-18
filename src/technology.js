export const techFeeds=[
 {name:'IT之家',url:'https://www.ithome.com/rss/'},
 {name:'Solidot 科技',url:'https://www.solidot.org/index.rss'},
 {name:'少数派',url:'https://sspai.com/feed'},
 {name:'GitHub 官方博客',url:'https://github.blog/feed/'},
 {name:'Google AI 官方',url:'https://blog.google/technology/ai/rss/'},
 {name:'Hacker News',url:'https://news.ycombinator.com/rss'}
];
export const techCategories=['AI','软件开发','大厂动态','计算机行业'];
// These are keyword labels for navigation, not AI-generated factual judgments.
export function classifyTech(item){
 const text=`${item.title} ${item.description||''} ${item.source}`;
 const labels=[];
 if(/\b(ai|llm|gpt|claude|gemini|openai|deepseek|machine learning)\b|人工智能|大模型|机器学习|智能体/i.test(text))labels.push('AI');
 if(/github|\b(code|developer|programming|software|rust|python|javascript|linux|api|kubernetes)\b|开发|编程|软件|开源|代码|数据库/i.test(text))labels.push('软件开发');
 if(/\b(google|microsoft|apple|meta|amazon|nvidia|openai|bytedance|tencent|alibaba)\b|谷歌|微软|苹果|英伟达|腾讯|阿里|字节|百度|华为/i.test(text))labels.push('大厂动态');
 return labels.length?labels:['计算机行业'];
}

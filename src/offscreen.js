chrome.runtime.onMessage.addListener((message, sender, respond)=>{
 if(message.target!=='parser')return;
 try {
 const doc=new DOMParser().parseFromString(message.xml,'text/xml');
 if(doc.querySelector('parsererror'))throw Error('新闻源 XML 格式错误');
 const plain=s=>new DOMParser().parseFromString(s||'','text/html').body.textContent.trim();
 const items=[...doc.querySelectorAll('item, entry')].slice(0,100).map(node=>{
 const read=tag=>node.getElementsByTagName(tag)[0]?.textContent||'';
 const link=node.querySelector('link[rel="alternate"], link:not([rel])');
 const raw=read('pubDate')||read('published')||read('updated')||read('dc:date');
 return {title:plain(read('title')).slice(0,500),url:link?.getAttribute('href')||read('link'),date:Number.isFinite(Date.parse(raw))?new Date(raw).toISOString():new Date().toISOString(),dateEstimated:!Number.isFinite(Date.parse(raw)),description:plain(read('description')||read('summary')||read('content')).slice(0,1500),source:message.source};});
 if(!doc.querySelector('rss, feed, RDF'))throw Error('地址未返回 RSS/Atom');
 respond({items});
 }catch(e){respond({error:e.message});} return false;
});

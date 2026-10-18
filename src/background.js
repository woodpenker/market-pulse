import {dataSources,sourceOrigins,sourceFetch} from './data-sources.js';
import {bannerInstrument,bannerKey} from './markets.js';
import {isCandlePeriod} from './minute-bars.js';
import {chartCache} from './chart-cache.js';
import {resolveInstrument} from './instruments.js';
import {validateWatchlist,moveWatch} from './watchlist.js';
import {collectFeeds} from './feeds.js';
import {fetchWatchlist,watchKey,watchQuote,history} from './watchlist.js';
import {badgeView,badgeMatches} from './badge.js';
import {createChatGPT,isChatGPTCallback} from './chatgpt-auth.js';
import {createDashboard} from './dashboard.js';
import {fetchQuotes} from './markets.js';
import {syncSettings,restoreSettings} from './config.js';
import {defaults,nextRun,validate,mergeItems,askAI,needsCatchUp,buildDigest} from './core.js';
const store=chrome.storage.local;
const chatgpt=createChatGPT({local:store,session:chrome.storage.session});
const dashboard=createDashboard(chrome);
store.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let refreshing, parsing, quoting,monitoring,techRefreshing,watchQueue=Promise.resolve();
chrome.storage.sync.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
async function settings(){return {...defaults,...(await store.get('settings')).settings};}
async function schedule(){const s=await settings();if(s.watchlist?.length)await chrome.alarms.create('watchlist',{delayInMinutes:s.monitorRefreshMinutes||5,periodInMinutes:s.monitorRefreshMinutes||5});else await chrome.alarms.clear('watchlist');await chrome.alarms.create('daily',{when:nextRun(s.time)});if(s.badgeSymbol)await chrome.alarms.create('index-badge',{delayInMinutes:s.badgeRefreshMinutes||1,periodInMinutes:s.badgeRefreshMinutes||1});else{await chrome.alarms.clear('index-badge');await chrome.action.setBadgeText({text:''});}}
async function parser(){
 if(parsing)return parsing;
 parsing=(async()=>{const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']});if(!contexts.length)await chrome.offscreen.createDocument({url:'src/offscreen.html',reasons:['DOM_PARSER'],justification:'Parse RSS and Atom news feeds'});})();
 try{await parsing;}finally{parsing=null;}
}
async function refresh(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{const s=await settings();await parser();
 const results=await collectFeeds(s.feeds,(xml,source)=>chrome.runtime.sendMessage({target:'parser',xml,source}));
 const previous=await store.get(['items','status']);const incoming=results.flatMap(r=>r.items);
 try{const r=await sourceFetch(fetch,s.dataSources)('https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,GBP,JPY,CNY,HKD',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const rates=await r.json();if(!Array.isArray(rates)||!rates.length||rates.some(x=>!Number.isFinite(x.rate)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)))throw Error('汇率格式错误');incoming.push(...rates.map(x=>({title:`USD/${x.quote} 参考汇率 ${x.rate}`,url:`${dataSources(s.dataSources).endpoints.frankfurter}/v2/rate/USD/${x.quote}?date=${x.date}`,date:x.date+'T00:00:00.000Z',source:'Frankfurter 汇率',description:`1 USD = ${x.rate} ${x.quote}。数据日期 ${x.date}；每日参考汇率，非实时交易报价。`})));results.push({name:'Frankfurter 汇率',items:rates});}catch(e){results.push({name:'Frankfurter 汇率',items:[],error:e.message});}
 const items=mergeItems(previous.items||[],incoming);
 const status={attempt:new Date().toISOString(),sources:results.map(({name,error,items})=>({name,error,count:items.length})),success:results.some(r=>!r.error)};
 status.lastSuccess=status.success?status.attempt:previous.status?.lastSuccess;
 await store.set({items,status,digest:buildDigest(items,status)});
 if(s.autoAI&&incoming.length){try{await summarize();}catch(e){await store.set({aiError:e.message});}}
 return status;})();try{return await refreshing;}finally{refreshing=null;}
}
async function summarize(){const s=await settings();const {items=[]}=await store.get('items');if(!items.length)throw Error('请先拉取新闻');const text=await askAI(s,items,[{role:'user',content:'请生成市场简报：关键事件、全球地区和行业影响、需要关注的数据与事件、风险和反向情景。列出引用来源。'}],fetch,chatgpt);const summary={text,date:new Date().toISOString()};await store.set({summary,aiError:''});return summary;}
chrome.runtime.onInstalled.addListener(()=>{schedule().then(()=>refreshQuotes(true)).catch(console.error);refresh().catch(console.error);refreshTech().catch(console.error);});
chrome.runtime.onStartup.addListener(()=>{(async()=>{await schedule();refreshQuotes(true).catch(console.error);const {status}=await store.get('status');const s=await settings();if(needsCatchUp(s.time,status))await refresh();const {techStatus}=await store.get('techStatus');if(needsCatchUp(s.time,techStatus))await refreshTech();})().catch(console.error);});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='watchlist')refreshMonitor(true).catch(console.error);if(a.name==='index-badge')refreshQuotes(true).catch(console.error);if(a.name==='daily')(async()=>{await schedule();await Promise.all([refresh(),refreshTech()]);})().catch(console.error);});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(m.target==='parser')return;
 (async()=>{switch(m.type){
 case 'dashboard-blur':{if(sender.url?.split('?')[0]===chrome.runtime.getURL('index.html'))await dashboard.pageLostFocus(sender.tab?.windowId??m.windowId);return true;}
 case 'preferences':{const pending=watchQueue.then(async()=>{const s=await settings();const allowed=['language','chartIndicators','chartIntervals','tabOrder','theme'];if(!m.patch||Object.keys(m.patch).some(key=>!allowed.includes(key)))throw Error('无效偏好设置');const next=validate({...s,...m.patch});await store.set({settings:next});if(m.patch.language){const {quotes=[]}=await store.get('quotes');await chrome.action.setTitle({title:next.badgeSymbol?badgeView(quotes.find(q=>badgeMatches(q,next.badgeSymbol)),next.language).title:'Market Pulse'});}return next;});watchQueue=pending.catch(()=>{});return await pending;}
 case 'resolve-instrument':return await resolveInstrument(m.code,fetch,(await settings()).dataSources);
 case 'watch-update':{const pending=watchQueue.then(()=>updateWatch(m));watchQueue=pending.catch(()=>{});return await pending;}
 case 'tech-refresh':return await refreshTech(m.force);
 case 'monitor':return await refreshMonitor(m.force);
 case 'instrument-detail':return await instrumentDetail(m.key,m.period);
 case 'quotes':return await refreshQuotes(m.force);
 case 'auth':{
  if(m.path==='status')return await chatgpt.status();
  if(m.path==='logout'){await chatgpt.logout();return true;}
  if(m.path==='models')return await chatgpt.models();
  if(m.path==='login'){
   const {url}=await chatgpt.begin();
   const tab=await chrome.tabs.create({url:'about:blank',active:true});
   await chatgpt.bindTab(tab.id);await chrome.tabs.update(tab.id,{url});return true;
  }
  throw Error('未知登录操作');
 }
 case 'sync-upload':{const clean=syncSettings(await settings());const cloud={version:1,settings:clean,date:new Date().toISOString()};if(new TextEncoder().encode(JSON.stringify(cloud)).length>7800)throw Error('配置超过 Chrome Sync 单项容量，请减少新闻源、指数或监控项');await chrome.storage.sync.set({config:cloud});return cloud.date;}
 case 'sync-list':{const {config}=await chrome.storage.sync.get('config');let record=null,error='';if(config){try{record={version:1,date:config.date,settings:syncSettings(restoreSettings(config,await settings()))};}catch(e){error=e.message;}}return {extensionId:chrome.runtime.id,bytes:await chrome.storage.sync.getBytesInUse(null),record,error};}
 case 'sync-download':{const {config}=await chrome.storage.sync.get('config');return restoreSettings(config,await settings());}
 case 'refresh':return await refresh();
 case 'summary':return await summarize();
 case 'save':{const s=validate(m.settings);for(const url of [...(s.provider==='chatgpt'?[]:[s.endpoint]),...s.feeds.map(f=>f.url),...(s.techFeeds||defaults.techFeeds).map(f=>f.url),...sourceOrigins(s.dataSources).map(origin=>origin.slice(0,-1)),...(s.watchlist||[]).filter(i=>i.provider==='custom').map(i=>i.url)])if(!await chrome.permissions.contains({origins:[new URL(url).origin+'/*']}))throw Error('未获准访问 '+new URL(url).origin);await store.set({settings:s});await schedule();await store.remove(['instrumentCache','quotesAt','monitorAt','quotesConfig','monitorConfig']);Promise.all([refreshQuotes(true),refreshMonitor(true),refreshTech(true)]).catch(console.error);return true;}
 case 'chat':{if(typeof m.text!=='string'||!m.text.trim()||m.text.length>6000)throw Error('问题需为 1–6000 字');const {items=[],chat=[]}=await store.get(['items','chat']);const messages=[...chat,{role:'user',content:m.text}];const text=await askAI(await settings(),items,messages,fetch,chatgpt);await store.set({chat:[...messages,{role:'assistant',content:text}].slice(-16)});return text;}
 default:throw Error('未知请求');}})().then(data=>respond({data}),e=>respond({error:e.message}));return true;
});

async function refreshQuotes(force=false){
 if(quoting){const current=await quoting;if(!force)return current;return refreshQuotes(true);}
 quoting=(async()=>{
  const s=await settings();const indices=s.indices||defaults.indices;
  const fingerprint=JSON.stringify({sources:s.dataSources||defaults.dataSources,indices});const {quotes=[],quotesAt,quotesConfig}=await store.get(['quotes','quotesAt','quotesConfig']);
  if(!force&&quotesConfig===fingerprint&&Date.now()-Date.parse(quotesAt)<60000&&JSON.stringify(quotes.map(bannerKey))===JSON.stringify(indices.map(bannerKey)))return quotes;
  let fresh;
  try{fresh=await fetchQuotes(indices,fetch,s.dataSources);}catch(e){fresh=indices.map(i=>({...i,error:e.message}));}
  const merged=fresh.map(q=>{const old=quotesConfig===fingerprint?quotes.find(x=>bannerKey(x)===bannerKey(q)):null;return q.error&&old?.price?{...old,name:q.name,error:q.error}:q;});
  await store.set({quotes:merged,quotesAt:new Date().toISOString(),quotesConfig:fingerprint});
  if(s.badgeSymbol){const badge=badgeView(merged.find(q=>badgeMatches(q,s.badgeSymbol)),s.language);await chrome.action.setBadgeText({text:badge.text});await chrome.action.setBadgeBackgroundColor({color:badge.color});await chrome.action.setTitle({title:badge.title});}else{await chrome.action.setBadgeText({text:''});await chrome.action.setTitle({title:'全球市场脉搏'});}
  return merged;
 })();try{return await quoting;}finally{quoting=null;}
}
chrome.action.onClicked.addListener(tab=>dashboard.toggle(tab).catch(console.error));
chrome.windows.onFocusChanged.addListener(id=>dashboard.focusChanged(id));
chrome.tabs.onRemoved.addListener(id=>chatgpt.cancel(id).catch(console.error));
chrome.webNavigation.onBeforeNavigate.addListener(details=>{
 if(details.frameId!==0||!isChatGPTCallback(details.url))return;
 (async()=>{
  const {chatgptPending:p}=await chrome.storage.session.get('chatgptPending');
  if(!p||p.tabId!==details.tabId)return;
  // Replace the loopback navigation inside Chrome; no process listens on this port.
  await chrome.tabs.update(details.tabId,{url:chrome.runtime.getURL('auth-result.html')});
  try{await chatgpt.complete(details.url,details.tabId);}catch(e){await store.set({chatgptAuthStatus:{message:'ChatGPT 登录失败',error:e.message,date:new Date().toISOString()}});}
 })().catch(console.error);
},{url:[{schemes:['http'],hostEquals:'127.0.0.1',ports:[1455],pathEquals:'/auth/callback'}]});

async function refreshMonitor(force=false){
 if(monitoring){const current=await monitoring;if(!force)return current;return refreshMonitor(true);}
 monitoring=(async()=>{
  const s=await settings(),list=s.watchlist||[],fingerprint=JSON.stringify({sources:s.dataSources||defaults.dataSources,list});const {monitorRows=[],monitorAt,monitorConfig}=await store.get(['monitorRows','monitorAt','monitorConfig']);
  if(!force&&monitorConfig===fingerprint&&Date.now()-Date.parse(monitorAt)<(s.monitorRefreshMinutes||5)*60000&&JSON.stringify(monitorRows.map(watchKey))===JSON.stringify(list.map(watchKey)))return monitorRows;
  const fresh=await fetchWatchlist(list,fetch,s.dataSources);const rows=fresh.map(q=>{const old=monitorConfig===fingerprint?monitorRows.find(r=>watchKey(r)===watchKey(q)):null;return q.error&&old?.price?{...old,...q,price:old.price,error:q.error}:q;});
  await store.set({monitorRows:rows,monitorAt:new Date().toISOString(),monitorConfig:fingerprint});return rows;
 })();try{return await monitoring;}finally{monitoring=null;}
}
async function instrumentDetail(key,period){
 const s=await settings();const item=[...(s.watchlist||[]),...(s.indices||defaults.indices).map(bannerInstrument)].find(i=>watchKey(i)===key);if(!item)throw Error('未配置该监控项目');
 if(!['minute','day','day-max'].includes(period)&&!isCandlePeriod(period))throw Error('无效图表周期');
 const {instrumentCache=[]}=await store.get('instrumentCache');const fingerprint=JSON.stringify({sources:s.dataSources||defaults.dataSources,item});const old=instrumentCache.find(c=>c.key===key&&c.period===period&&c.sourceConfig===fingerprint);
 if(old&&Date.now()-Date.parse(old.fetchedAt)<(period==='day-max'?300000:30000))return old;
 const [quote,chart]=await Promise.allSettled([watchQuote(item,fetch,s.dataSources),history(item,period==='day-max'?'day':period,fetch,period==='day-max',s.dataSources) ]);
 const result={key,item,period,sourceConfig:fingerprint,quote:quote.status==='fulfilled'?quote.value:null,quoteError:quote.status==='rejected'?quote.reason.message:'',chart:chart.status==='fulfilled'?chart.value:null,error:chart.status==='rejected'?chart.reason.message:'',fetchedAt:new Date().toISOString()};
 if(result.error&&old?.chart)return {...old,error:'图表使用缓存：'+result.error,stale:true};
 await store.set({instrumentCache:chartCache([result,...instrumentCache.filter(c=>!(c.key===key&&c.period===period))])});return result;
}

async function refreshTech(force=false){
 if(techRefreshing){const value=await techRefreshing;if(!force)return value;return refreshTech(true);}
 techRefreshing=(async()=>{
  const s=await settings();const feeds=s.techFeeds||defaults.techFeeds;
  const previous=await store.get(['techItems','techStatus']);
  if(!force&&Date.now()-Date.parse(previous.techStatus?.attempt)<3600000&&JSON.stringify(previous.techStatus?.feeds)===JSON.stringify(feeds))return previous.techStatus;
  await parser();const results=await collectFeeds(feeds,(xml,source)=>chrome.runtime.sendMessage({target:'parser',xml,source}));
  const active=new Set(feeds.map(f=>f.name));const items=mergeItems((previous.techItems||[]).filter(i=>active.has(i.source)),results.flatMap(r=>r.items));
  const status={attempt:new Date().toISOString(),feeds,sources:results.map(r=>({name:r.name,error:r.error,count:r.items.length})),success:results.some(r=>!r.error)};
  status.lastSuccess=status.success?status.attempt:previous.techStatus?.lastSuccess;
  await store.set({techItems:items,techStatus:status,techDigest:buildDigest(items,status)});return status;
 })();try{return await techRefreshing;}finally{techRefreshing=null;}
}
async function updateWatch(message){
 const s=await settings();let list=[...(s.watchlist||[])];
 if(message.move){list=moveWatch(list,message.move,message.direction);}
 else if(message.items){validateWatchlist(message.items);list.push(...message.items.filter(i=>!list.some(w=>watchKey(w)===watchKey(i))));}
 else if(message.remove){if(!list.some(i=>watchKey(i)===message.remove))throw Error('项目已不存在，请刷新配置');list=list.filter(i=>watchKey(i)!==message.remove);}
 else{validateWatchlist([message.item]);if(message.originalKey){const at=list.findIndex(i=>watchKey(i)===message.originalKey);if(at<0)throw Error('项目已不存在，请刷新配置');list[at]=message.item;}else list.push(message.item);}
 validateWatchlist(list);
 const {monitorRows=[]}=await store.get('monitorRows');const rows=list.map(i=>({...monitorRows.find(r=>watchKey(r)===watchKey(i)&&r.dataSource===i.dataSource&&r.sourceSymbol===i.sourceSymbol),...i}));
 await store.set({settings:{...s,watchlist:list},monitorRows:rows,monitorAt:null});await schedule();
 refreshMonitor(true).catch(console.error);return list;
}

import {writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import {generateKeyPairSync,sign} from 'node:crypto';
// Run against an isolated Chrome launched with --enable-unsafe-extension-debugging.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const port=process.env.CDP_PORT||'9334';
const base=`http://127.0.0.1:${port}`;
async function connect(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};return {call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},60000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}});ws.send(JSON.stringify({id,method,params}));})},close:()=>ws.close()};}
const version=await(await fetch(base+'/json/version')).json();const browser=await connect(version.webSocketDebuggerUrl);
let page,worker;
try{
 const installed=await browser.call('Extensions.getExtensions');for(const e of installed.extensions){if(e.path===resolve(import.meta.dirname,'..'))await browser.call('Extensions.uninstall',{id:e.id});}
 const {id}=await browser.call('Extensions.loadUnpacked',{path:resolve(import.meta.dirname,'..')});
 const {targetId}=await browser.call('Target.createTarget',{url:`chrome-extension://${id}/index.html?full=1`});
 async function target(predicate){for(let i=0;i<50;i++){const list=await(await fetch(base+'/json/list')).json();const found=list.find(predicate);if(found)return found;await new Promise(r=>setTimeout(r,100));}throw Error('Target unavailable');}
 page=await connect((await target(t=>t.id===targetId)).webSocketDebuggerUrl);
 worker=await connect((await target(t=>t.type==='service_worker'&&t.url.includes(id))).webSocketDebuggerUrl);
 async function evaluate(client,expression){const r=await client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 for(let i=0;i<30;i++){if(await evaluate(worker,`typeof chrome!=='undefined'&&!!chrome.runtime`))break;await new Promise(r=>setTimeout(r,100));}
 await evaluate(worker,`(async()=>{for(const win of await chrome.windows.getAll())if(win.type==='popup')await chrome.windows.remove(win.id);})()`);
 await evaluate(page,`Promise.all(['refresh','quotes','tech-refresh','monitor'].map(type=>chrome.runtime.sendMessage({type})))`);
 // Exercise real worker, parser, storage and UI with deterministic external responses.
 await evaluate(worker,`(async()=>{globalThis.originalFetch=fetch;globalThis.fetch=async(url,init)=>{if(url.includes('/kline/mkline')){const [code,scale]=new URL(url).searchParams.get('param').split(',');return Response.json({data:{[code]:{[scale]:Array.from({length:20},(_,i)=>['20261016'+String(930+i).padStart(4,'0'),String(10+i/10),String(10.1+i/10),String(10.3+i/10),String(9.8+i/10),'100'])}}});}if(url.includes('pingzhongdata'))return new Response('var Data_netWorthTrend=[{"x":1792108800000,"y":1.1},{"x":1792195200000,"y":1.2}];');if(url.includes('smartbox.gtimg.cn'))return new Response('v_hint="sh~000001~Index~i~ZS^sz~000001~Bank~b~GP"');if(url.includes('minute/query')){const code=new URL(url).searchParams.get('code');return Response.json({data:{[code]:{data:{date:'2026-10-16',data:['0930 12.3 100','0931 12.46 150']}}}});}if(url.includes('fqkline/get')){const code=new URL(url).searchParams.get('param').split(',')[0];return Response.json({data:{[code]:{day:[['2026-10-15','12','12.29','12.4','11.8','200'],['2026-10-16','12.35','12.46','12.67','12.3','300']]}}});}if(url.includes('/ticker/24hr'))return Response.json({lastPrice:'110',openPrice:'100',highPrice:'120',lowPrice:'90',volume:'10',closeTime:1792252800000});if(url.includes('/klines'))return Response.json([[1792252800000,'100','120','90','110','10']]);if(url.startsWith('https://api.anthropic.com/')&&url.endsWith('/messages'))return Response.json({content:[{type:'text',text:'Claude protocol answer'}],stop_reason:'end_turn'});if(url.startsWith('https://generativelanguage.googleapis.com/')&&url.includes(':generateContent'))return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Gemini protocol answer'}]}}]});if(url.includes('chat/completions'))return new Response(JSON.stringify({choices:[{message:{content:'已核对来源 [1]，这是测试分析。'}}]}));if(url.includes('qt.gtimg.cn')){const f=Array(33).fill('');f[3]='3716.28';f[4]='3707.48';f[30]='20261016161500';return new Response(['sh000001','sh000300','us.IXIC','us.NDX','sh600519','sh518880','sz000001'].map(s=>{const q=f.slice();q[1]=s==='sz000001'?'Bank':s==='sh518880'?'Gold ETF':s==='sh600519'?'Moutai':'Index';if(s==='sh600519'){q[3]='12.46';q[4]='12.29';q[5]='12.35';q[33]='12.67';q[34]='12.30';}return 'v_'+s+'="'+q.join('~')+'";'}).join('\\n'));}if(url.includes('frankfurter'))return new Response(JSON.stringify([{date:new Date().toISOString().slice(0,10),quote:'JPY',rate:150}]));if(/ithome|solidot|sspai|github.blog|blog.google|ycombinator/.test(url))return new Response('<rss><channel><item><title>Google AI developer update</title><link>https://example.com/tech-event</link><pubDate>'+new Date().toUTCString()+'</pubDate><description>New software API</description></item></channel></rss>');return new Response('<rss version="2.0"><channel><item><title>Market Test Event</title><link>https://example.com/event</link><pubDate>'+new Date().toUTCString()+'</pubDate><description>Central bank update</description></item></channel></rss>');};await chrome.storage.local.clear();await chrome.storage.local.set({settings:{time:'08:00',provider:'openai',endpoint:'https://api.openai.com/v1',model:'test-model',apiKey:'dummy',autoAI:false,monitorRefreshMinutes:2,watchlist:[{name:'测试股票',type:'股票',provider:'tencent',symbol:'sh600519'},{name:'BTC / USDT',type:'加密货币',provider:'crypto',symbol:'BTCUSDT'}],feeds:[{name:'Test',url:'https://feeds.bbci.co.uk/news/business/rss.xml'}]}});return true;})()`);
 console.log('Configured deterministic fetch');
 assert.equal(await evaluate(page,`document.getElementById('open-settings').previousElementSibling.id`),'expand');
 await evaluate(page,`document.getElementById('open-settings').click()`);const settingsEntry=await target(t=>t.type==='page'&&t.url===`chrome-extension://${id}/options.html`);assert.ok(settingsEntry);await browser.call('Target.closeTarget',{targetId:settingsEntry.id});

 const refreshed=await evaluate(page,`chrome.runtime.sendMessage({type:'refresh'})`);assert.ok(refreshed.data.success);
 const data=await evaluate(worker,`(async()=>({items:(await chrome.storage.local.get('items')).items,digest:(await chrome.storage.local.get('digest')).digest,alarms:await chrome.alarms.getAll()}))()`);assert.ok(data.items.some(i=>i.title==='Market Test Event'));assert.match(data.digest.text,/Market Test Event/);assert.ok(data.items.some(i=>i.source==='Frankfurter 汇率'));assert.ok(data.alarms.some(a=>a.name==='daily'));
 // Module script may still be initializing; wait for rendered timeline.
 let visible=false;for(let i=0;i<30;i++){visible=await evaluate(page,`document.querySelector('#timeline').textContent.includes('Market Test Event')`);if(visible)break;await new Promise(r=>setTimeout(r,100));}assert.ok(visible);
 assert.ok(await evaluate(page,`document.querySelector('#overview').textContent.includes('Market Test Event')`));
 console.log('Verified refresh, cache, automatic digest and UI');
 const beforeAlarm=await evaluate(worker,`(async()=>{const {status}=await chrome.storage.local.get('status');await chrome.alarms.create('daily',{when:Date.now()+500});return status.attempt;})()`);
 let fired=false;for(let i=0;i<80;i++){const current=await evaluate(worker,`(async()=>({status:(await chrome.storage.local.get('status')).status,alarm:await chrome.alarms.get('daily')}))()`);if(current.status.attempt!==beforeAlarm&&current.alarm.scheduledTime>Date.now()+60000){fired=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(fired,'daily alarm should refresh and reschedule');
 console.log('Verified actual alarm firing');
 const tech=await evaluate(page,`chrome.runtime.sendMessage({type:'tech-refresh',force:true})`);assert.ok(tech.data.success);
 await evaluate(page,`document.querySelector('[data-tab="tech"]').click()`);
 for(let i=0;i<30;i++){if(await evaluate(page,`document.getElementById('tech-timeline').textContent.includes('Google AI developer update')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.getElementById('tech-timeline').textContent.includes('Google AI developer update')`));
 const techShot=await page.call('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/market-pulse-tech-v15.png',Buffer.from(techShot.data,'base64'));
 assert.ok(!(await evaluate(worker,`chrome.storage.local.get('items')`)).items.some(i=>i.title.includes('Google AI developer')),'technology items stay separate from finance');
 await evaluate(page,`document.getElementById('tech-category').value='软件开发';document.getElementById('tech-category').dispatchEvent(new Event('change'))`);
 assert.ok(await evaluate(page,`document.getElementById('tech-timeline').textContent.includes('Google AI developer update')`));

 await evaluate(page,`document.getElementById('news-summarize').click()`);
 let brief;for(let i=0;i<30;i++){brief=await evaluate(worker,`chrome.storage.local.get('summary')`);if(brief.summary)break;await new Promise(r=>setTimeout(r,100));}assert.match(brief.summary.text,/测试分析/);assert.equal(await evaluate(page,`document.getElementById('brief').hidden`),false);
 assert.equal(await evaluate(page,`document.querySelector('[data-tab="settings"]')`),null);
 await evaluate(page,`chrome.runtime.sendMessage({type:'quotes',force:true})`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.getElementById('market-banner').textContent.includes('3,716.28')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.getElementById('market-banner').textContent.includes('3,716.28')`));assert.equal(await evaluate(worker,`chrome.action.getBadgeText({})`),'3716');assert.match(await evaluate(worker,`chrome.action.getTitle({})`),/3716.28/);
 await page.call('Emulation.setDeviceMetricsOverride',{width:420,height:900,deviceScaleFactor:1,mobile:false});assert.ok(await evaluate(page,`document.documentElement.scrollWidth<=innerWidth`),'narrow window must not overflow');
 await page.call('Emulation.clearDeviceMetricsOverride');

 await evaluate(page,`chrome.runtime.sendMessage({type:'monitor',force:true})`);await evaluate(page,`document.querySelector('[data-tab="monitor"]').click()`);
 assert.equal(await evaluate(page,`document.querySelectorAll('#monitor-body tr').length`),2);assert.ok(await evaluate(page,`document.getElementById('monitor-table').textContent.includes('滚动24小时')`));
 await evaluate(page,`document.querySelector('#monitor-body .table-link').click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`!!document.querySelector('#instrument-chart svg')`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(page,`document.getElementById('instrument-dialog').open&&!!document.querySelector('#instrument-chart svg')`));await evaluate(page,`(()=>{const svg=document.querySelector('#instrument-chart svg');const r=svg.getBoundingClientRect();svg.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width/2,clientY:r.top+50}));})()`);assert.ok(await evaluate(page,`document.querySelector('.chart-tooltip').textContent.includes('收')`));const chartShot=await page.call('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/market-pulse-chart-v13.png',Buffer.from(chartShot.data,'base64'));
 await evaluate(page,`document.getElementById('period-day').click()`);for(let i=0;i<40;i++){if(await evaluate(page,`document.querySelector('#instrument-chart svg')?.getAttribute('aria-label').includes('日K')`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(page,`document.querySelector('#instrument-chart svg')?.getAttribute('aria-label').includes('日K')`));for(const range of ['1','5','7','90','180']){
  await evaluate(page,`document.querySelector('[data-range="${range}"]').click()`);
  for(let i=0;i<40;i++){if(await evaluate(page,`!!document.querySelector('#instrument-chart svg')`))break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(await evaluate(page,`document.querySelector('[data-range="${range}"]').classList.contains('selected')&&document.getElementById('chart-range-note').textContent.includes('自然日')`));
  if(range==='1')assert.ok(await evaluate(page,`document.getElementById('chart-range-note').textContent.includes('1 条记录')`));
 }
 assert.ok(await evaluate(page,`document.getElementById('chart-legend').textContent.includes('历史不足9点')`));
 await evaluate(page,`document.querySelector('#chart-indicators input[value="ema9"]').click()`);
 assert.ok(await evaluate(page,`!document.getElementById('chart-legend').textContent.includes('EMA9')`));
 for(const interval of ['1m','5m','15m','30m','60m']){
  await evaluate(page,`document.querySelector('[data-range="${interval}"]').click()`);
  for(let i=0;i<40;i++){if(await evaluate(page,`document.querySelector('#instrument-chart svg')?.getAttribute('aria-label').includes('${interval}')`))break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(await evaluate(page,`document.getElementById('chart-range-note').textContent.includes('分钟OHLC')&&document.querySelector('#instrument-chart [data-indicator="ma5"]')`));
 }

 await evaluate(page,`document.getElementById('instrument-close').click()`);
 await evaluate(page,`document.querySelector('#market-banner .quote').click()`);for(let i=0;i<40;i++){if(await evaluate(page,`!!document.querySelector('#instrument-chart svg')`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(page,`document.getElementById('instrument-dialog').open`));await evaluate(page,`document.getElementById('instrument-close').click()`);
 const uploaded=await evaluate(page,`chrome.runtime.sendMessage({type:'sync-upload'})`);assert.ok(uploaded.data);const synced=await evaluate(worker,`chrome.storage.sync.get('config')`);assert.ok(!JSON.stringify(synced).includes('dummy'));const pulled=await evaluate(page,`chrome.runtime.sendMessage({type:'sync-download'})`);assert.equal(pulled.data.apiKey,'dummy');
 const {targetId:optionsTarget}=await browser.call('Target.createTarget',{url:`chrome-extension://${id}/options.html`});
 const options=await connect((await target(t=>t.id===optionsTarget)).webSocketDebuggerUrl);
 try{let ready=false;for(let i=0;i<30;i++){ready=await evaluate(options,`document.documentElement?.dataset.ready==='true'`);if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);assert.equal(await evaluate(options,`!!document.querySelector('nav')`),false);assert.equal(await evaluate(options,`document.getElementById('bridge-command')`),null);

 const sync182=await evaluate(options,`chrome.runtime.sendMessage({type:'sync-list'})`);assert.equal(sync182.data.extensionId,id);assert.ok(sync182.data.record);assert.ok(!JSON.stringify(sync182).includes('dummy'));
 for(let i=0;i<40;i++){if(await evaluate(options,`document.querySelector('#sync-list table')!==null`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(options,`document.getElementById('sync-diagnostics').textContent.includes('${id}')&&!!document.querySelector('#sync-list table')`));
 const stored182=(await evaluate(worker,`chrome.storage.sync.get('config')`)).config;await evaluate(worker,`chrome.storage.sync.remove('config')`);
 for(let i=0;i<40;i++){if(await evaluate(options,`document.getElementById('sync-list').textContent.includes('当前同步区没有配置')`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(options,`document.getElementById('sync-list').textContent.includes('当前同步区没有配置')`));await evaluate(worker,`chrome.storage.sync.set({config:${JSON.stringify(stored182)}})`);
 const downloadPath='/tmp/market-pulse-export-'+Date.now();await mkdir(downloadPath,{recursive:true});await browser.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath});await evaluate(options,`document.getElementById('config-export').click()`);
 let exported182;for(let i=0;i<50;i++){const file=(await readdir(downloadPath)).find(name=>name.endsWith('.json'));if(file){exported182=JSON.parse(await readFile(downloadPath+'/'+file,'utf8'));break;}await new Promise(r=>setTimeout(r,100));}assert.ok(exported182,'export button downloads a JSON file');assert.equal(exported182.app,'market-pulse');assert.ok(!JSON.stringify(exported182).includes('dummy'));
 exported182.settings.time='10:40';await evaluate(options,`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(exported182))}],'config.json',{type:'application/json'}));document.getElementById('config-file').files=transfer.files;document.getElementById('config-file').dispatchEvent(new Event('change'));})()`);
 for(let i=0;i<40;i++){if(await evaluate(options,`!document.getElementById('config-import').disabled`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(options,`document.getElementById('config-preview').textContent.includes('10:40')`));assert.notEqual((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.time,'10:40','preview does not apply automatically');await evaluate(options,`document.getElementById('config-import').click()`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.time==='10:40')break;await new Promise(r=>setTimeout(r,100));}const imported182=(await evaluate(worker,`chrome.storage.local.get('settings')`)).settings;assert.equal(imported182.time,'10:40');assert.equal(imported182.apiKey,'dummy');assert.equal(await evaluate(options,`document.getElementById('time').value`),'10:40');
 await evaluate(options,`(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['invalid JSON'],'bad.json'));document.getElementById('config-file').files=transfer.files;document.getElementById('config-file').dispatchEvent(new Event('change'));})()`);
 for(let i=0;i<40;i++){if(await evaluate(options,`document.getElementById('config-file-status').textContent.includes('有效JSON')`))break;await new Promise(r=>setTimeout(r,100));}assert.ok(await evaluate(options,`document.getElementById('config-import').disabled`));assert.equal((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.time,'10:40');
 console.log('Verified sync list, extension ID, empty sync state, actual JSON download, import preview/apply and invalid-file rejection');
 assert.equal(await evaluate(options,`(()=>{let called=false;document.getElementById('time').showPicker=()=>{called=true};document.getElementById('time').click();return called})()`),true);
 await evaluate(options,`document.querySelectorAll('.watch-config-row')[1].querySelector('[data-move="-1"]').click()`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist[0].symbol==='BTCUSDT'&&await evaluate(options,`document.querySelector('.watch-config-row').textContent.includes('BTCUSDT')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist[0].symbol,'BTCUSDT');
 for(let i=0;i<40;i++){if(await evaluate(page,`document.querySelector('#monitor-body tr')?.textContent.includes('BTCUSDT')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.querySelector('#monitor-body tr').textContent.includes('BTCUSDT')`));assert.ok(await evaluate(options,`document.querySelector('.watch-config-row [data-move="-1"]').disabled`));
 await evaluate(options,`document.querySelector('.watch-config-row [data-move="1"]').click()`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist[0].symbol==='sh600519'&&await evaluate(options,`document.querySelector('.watch-config-row').textContent.includes('sh600519')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist[0].symbol,'sh600519');
 console.log('Verified watchlist ordering saves immediately and updates dashboard order');
 await evaluate(options,`(()=>{document.getElementById('watch-symbol').value='sh518880';document.getElementById('watch-add').click();})()`);
 for(let i=0;i<50;i++){if(await evaluate(options,`document.querySelectorAll('.watch-config-row').length===3`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate(options,`document.querySelectorAll('.watch-config-row').length`),3,'code-only add must immediately appear in configured list');
 assert.ok((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist.some(i=>i.symbol==='sh518880'),'add must persist without a second save');
 for(let i=0;i<30;i++){if(await evaluate(page,`document.getElementById('monitor-body').textContent.includes('sh518880')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.getElementById('monitor-body').textContent.includes('sh518880')`),'added code must appear in dashboard');
 await evaluate(options,`document.querySelectorAll('.watch-config-row')[2].querySelectorAll('button')[1].click()`);
 for(let i=0;i<30;i++){if(await evaluate(options,`document.querySelectorAll('.watch-config-row').length===2`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate(options,`document.querySelectorAll('.watch-config-row').length`),2);
 await evaluate(options,`document.getElementById('watch-symbol').value='000001';document.getElementById('watch-add').click()`);
 for(let i=0;i<40;i++){if(await evaluate(options,`!document.getElementById('watch-match-label').hidden`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate(options,`document.querySelectorAll('.watch-config-row').length`),2,'ambiguous code cannot be silently added');
 assert.ok(await evaluate(options,`!document.getElementById('watch-match-label').hidden`));
 await evaluate(options,`document.getElementById('watch-match').value='1';document.getElementById('watch-match').dispatchEvent(new Event('change'));document.getElementById('watch-add').click()`);
 for(let i=0;i<40;i++){if(await evaluate(options,`document.querySelectorAll('.watch-config-row').length===3`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.watchlist.some(i=>i.name==='Bank'&&i.type==='股票'&&i.symbol==='sz000001'));
 await evaluate(options,`document.querySelectorAll('.watch-config-row')[2].querySelectorAll('button')[1].click()`);
 for(let i=0;i<30;i++){if(await evaluate(options,`document.querySelectorAll('.watch-config-row').length===2`))break;await new Promise(r=>setTimeout(r,100));}
 await evaluate(options,`document.getElementById('chart-days').value='2,10,365';document.getElementById('tech-feeds').value='Custom Dev | https://github.blog/feed/'`);
 await evaluate(options,`document.getElementById('indicator-keys').value='EMA12,MA5,VWAP';document.getElementById('indicator-keys').dispatchEvent(new Event('input'));for(const input of document.querySelectorAll('#minute-intervals input'))input.checked=['1','5'].includes(input.value)`);
 await evaluate(options,`document.getElementById('theme-mode').value='light';document.getElementById('theme-mode').dispatchEvent(new Event('input'));document.querySelector('[data-tab-id="tech"] button').click();document.querySelector('[data-tab-id="tech"] button').click()`);
 assert.equal(await evaluate(options,`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`),'#f5f7fb');
 assert.equal(await evaluate(page,`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`),'#0b111c','preview must not save before submit');





 await evaluate(options,`(()=>{document.getElementById('provider').value='chatgpt';document.getElementById('provider').dispatchEvent(new Event('change'));document.getElementById('model').value='test-model';document.getElementById('badgeRefreshMinutes').value='5';document.querySelector('#settings-form button[type=submit]').click();})()`);
 let configured;for(let i=0;i<30;i++){configured=await evaluate(worker,`chrome.storage.local.get('settings')`);if(configured.settings.provider==='chatgpt')break;await new Promise(r=>setTimeout(r,100));}assert.equal(configured.settings.provider,'chatgpt');assert.equal((await evaluate(worker,`chrome.alarms.get('index-badge')`)).periodInMinutes,5);
 assert.equal(configured.settings.theme.mode,'light');assert.equal(configured.settings.tabOrder[0],'tech');
 assert.deepEqual(configured.settings.chartIntervals,[1,5]);assert.ok(configured.settings.chartIndicators.some(i=>i.key==='ema12'&&i.enabled));
 assert.deepEqual(configured.settings.chartDays,[2,10,365]);assert.equal(configured.settings.techFeeds[0].name,'Custom Dev');
 for(let i=0;i<30;i++){if(await evaluate(page,`!!document.querySelector('[data-range="365"]')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`!!document.querySelector('[data-range="2"]')&&!!document.querySelector('[data-range="max"]')&&!document.querySelector('[data-range="90"]')`));
 assert.equal(await evaluate(page,`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`),'#f5f7fb');assert.equal(await evaluate(page,`document.querySelector('nav [data-tab]').dataset.tab`),'tech');
 await evaluate(page,`document.querySelector('nav [data-tab="monitor"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true}))`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.tabOrder[1]==='monitor')break;await new Promise(r=>setTimeout(r,100));}
 assert.deepEqual((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.tabOrder,['tech','monitor','news','brief','chat']);
 await evaluate(page,`(()=>{const from=document.querySelector('nav [data-tab="tech"]'),to=document.querySelector('nav [data-tab="chat"]'),transfer=new DataTransfer();from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));to.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));})()`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.tabOrder[0]==='monitor')break;await new Promise(r=>setTimeout(r,100));}
 assert.deepEqual((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.tabOrder,['monitor','news','brief','tech','chat']);
 await evaluate(options,`document.getElementById('theme-mode').value='custom';document.getElementById('theme-background').value='#e8f4ee';document.getElementById('theme-accent').value='#016b44';document.getElementById('theme-mode').dispatchEvent(new Event('input'));document.querySelector('#settings-form button[type="submit"]').click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()==='#e8f4ee'`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate(page,`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`),'#e8f4ee');

 await evaluate(page,`document.querySelector('[data-tab="monitor"]').click();document.querySelector('#monitor-body .table-link').click();document.querySelector('[data-range="max"]').click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.getElementById('chart-range-note').textContent.includes('最长可获取历史')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.getElementById('chart-range-note').textContent.includes('最长可获取历史')`));const rangeShot=await page.call('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/market-pulse-ranges-v15.png',Buffer.from(rangeShot.data,'base64'));await evaluate(page,`document.getElementById('instrument-close').click()`);

 await evaluate(page,`document.querySelector('#monitor-body .table-link').click();document.querySelector('[data-range="5m"]').click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`!!document.querySelector('#instrument-chart [data-indicator="ema12"]')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.querySelector('#chart-indicators input[value="ema12"]').checked&&!!document.querySelector('#instrument-chart [data-indicator="ema12"]')`));
 await evaluate(page,`document.getElementById('language').value='en';document.getElementById('language').dispatchEvent(new Event('change'))`);
 for(let i=0;i<40;i++){if(await evaluate(options,`document.documentElement.lang==='en-US'&&document.querySelector('#settings-form button[type="submit"]').textContent==='Save settings'`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(page,`document.documentElement.lang==='en-US'&&document.querySelector('[data-tab="monitor"]').textContent==='Watchlist'`));
 assert.ok(await evaluate(page,`document.getElementById('chart-range-note').textContent.includes('5-minute OHLC')`));assert.ok(await evaluate(page,`document.getElementById('instrument-status').textContent.includes('Tencent minute candles')&&document.getElementById('instrument-status').textContent.includes('20 data points')`));
 assert.equal(await evaluate(options,`document.querySelector('#watch-type option').value`),'股票','translation preserves canonical option values');
 await page.call('Page.bringToFront');const englishShot=await page.call('Page.captureScreenshot',{format:'png',fromSurface:false});await writeFile('/tmp/market-pulse-english-v16.png',Buffer.from(englishShot.data,'base64'));
 await evaluate(page,`document.getElementById('instrument-close').click()`);
 await evaluate(page,`document.querySelectorAll('#market-banner .quote')[3].click()`);
 assert.equal(await evaluate(page,`document.getElementById('instrument-title').textContent`),'NASDAQ 100 · us.NDX');
 await evaluate(options,`document.getElementById('language').value='zh-TW';document.getElementById('language').dispatchEvent(new Event('change'))`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.documentElement.lang==='zh-TW'&&document.querySelector('[data-tab="tech"]').textContent==='科技資訊'`))break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(await evaluate(options,`document.querySelector('#settings-form button[type="submit"]').textContent==='儲存設定'`));
 assert.equal(await evaluate(page,`document.getElementById('instrument-title').textContent`),'納斯達克100 · us.NDX');await evaluate(page,`document.getElementById('instrument-close').click()`);
 const cloud16=await evaluate(options,`chrome.runtime.sendMessage({type:'sync-upload'})`);assert.ok(cloud16.data);const public16=(await evaluate(worker,`chrome.storage.sync.get('config')`)).config.settings;assert.equal(public16.language,'zh-TW');assert.deepEqual(public16.chartIntervals,[1,5]);assert.ok(public16.chartIndicators.some(i=>i.key==='ema12'));
 await evaluate(options,`document.getElementById('language').value='zh-CN';document.getElementById('language').dispatchEvent(new Event('change'))`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.documentElement.lang==='zh-CN'`))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(await evaluate(page,`document.querySelector('[data-tab="monitor"]').textContent`),'行情监控');
 await evaluate(page,`document.querySelectorAll('#market-banner .quote')[2].click()`);assert.ok(await evaluate(page,`document.querySelector('[data-range="1m"]').disabled`));await evaluate(page,`document.getElementById('instrument-close').click()`);

 const fund16={name:'NAV Test Fund',provider:'fund',symbol:'161725',type:'基金'};
 await evaluate(page,`chrome.runtime.sendMessage({type:'watch-update',item:${JSON.stringify(fund16)}})`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.getElementById('monitor-body').textContent.includes('NAV Test Fund')`))break;await new Promise(r=>setTimeout(r,100));}
 await evaluate(page,`[...document.querySelectorAll('#monitor-body .table-link')].find(button=>button.textContent==='NAV Test Fund').click()`);
 assert.equal(await evaluate(page,`document.querySelector('[data-range].selected').dataset.range`),'2','funds default to a daily range even with minute buttons present');assert.ok(await evaluate(page,`document.querySelector('[data-range="5m"]').disabled`));
 await evaluate(page,`document.getElementById('instrument-close').click();chrome.runtime.sendMessage({type:'watch-update',remove:'fund:161725:'})`);
 const customTech=await evaluate(page,`chrome.runtime.sendMessage({type:'tech-refresh',force:true})`);assert.equal(customTech.data.sources.length,1);assert.equal(customTech.data.sources[0].name,'Custom Dev');

 await evaluate(worker,`(async()=>{const {settings}=await chrome.storage.local.get('settings');const {apiKey,...publicSettings}=settings;await chrome.storage.sync.set({config:{version:1,settings:{...publicSettings,time:'09:30'}}});})()`);await evaluate(options,`document.getElementById('download').click()`);
 let pulledTime;for(let i=0;i<30;i++){pulledTime=await evaluate(worker,`(async()=>(await chrome.storage.local.get('settings')).settings.time)()`);if(pulledTime==='09:30')break;await new Promise(r=>setTimeout(r,100));}assert.equal(pulledTime,'09:30');
 await evaluate(worker,`(async()=>{const {settings}=await chrome.storage.local.get('settings');await chrome.storage.local.set({settings:{...settings,provider:'openai',apiKey:'dummy'}});})()`);

 // Browser-only OAuth: actual navigation callback, WebCrypto signature check, no loopback server.
 await evaluate(options,`document.getElementById('login').click()`);
 let attempt;for(let i=0;i<50;i++){attempt=await evaluate(worker,`(async()=>(await chrome.storage.session.get('chatgptPending')).chatgptPending)()`);if(attempt?.tabId)break;await new Promise(r=>setTimeout(r,100));}assert.ok(attempt?.tabId);
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'chrome-test'})).toString('base64url');const payload=Buffer.from(JSON.stringify({iss:'https://auth.openai.com',aud:'chrome-issued',sub:'user',email:'chrome@test.invalid',nonce:attempt.nonce,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');const jwt=header+'.'+payload+'.'+sign('RSA-SHA256',Buffer.from(header+'.'+payload),privateKey).toString('base64url');
 const token={access_token:'mock-browser-access',refresh_token:'mock-browser-refresh',id_token:jwt,scope:'resource.invoke chatgpt.tokens.use.direct',expires_in:3600};const jwk={...publicKey.export({format:'jwk'}),kid:'chrome-test'};
 await evaluate(worker,`(()=>{const previous=fetch;globalThis.fetch=async(url,init)=>{if(url.includes('/oauth/token'))return Response.json(${JSON.stringify(token)});if(url.includes('/jwks.json'))return Response.json({keys:[${JSON.stringify(jwk)}]});if(url.endsWith('/v1/models'))return Response.json({models:[{visibility:'list',slug:'browser-model',display_name:'Browser Model'}]});if(url.endsWith('/v1/responses'))return new Response(${JSON.stringify("data: {\"type\":\"response.output_text.delta\",\"delta\":\"Browser AI answer\"}\n\ndata: {\"type\":\"response.completed\"}\n\n")});return previous(url,init);};})()`);
 const callback='http://127.0.0.1:1455/auth/callback?'+new URLSearchParams({code:'test-code',state:attempt.state,client_id:'chrome-issued'});
 await evaluate(worker,`chrome.tabs.update(${attempt.tabId},{url:${JSON.stringify(callback)}})`);
 let authorized;for(let i=0;i<50;i++){authorized=await evaluate(options,`chrome.runtime.sendMessage({type:'auth',path:'status'})`);if(authorized.data?.connected)break;await new Promise(r=>setTimeout(r,100));}assert.equal(authorized.data?.connected,true,JSON.stringify(authorized));assert.equal(authorized.data.email,'chrome@test.invalid');
 const catalog=await evaluate(options,`chrome.runtime.sendMessage({type:'auth',path:'models'})`);assert.equal(catalog.data.models[0].id,'browser-model');
 const previousSettings=await evaluate(worker,`(async()=>(await chrome.storage.local.get('settings')).settings)()`);await evaluate(worker,`chrome.storage.local.set({settings:{...${JSON.stringify(previousSettings)},provider:'chatgpt',model:'browser-model'}})`);
 const subscriptionAnswer=await evaluate(options,`chrome.runtime.sendMessage({type:'chat',text:'浏览器内订阅对话测试'})`);assert.equal(subscriptionAnswer.data,'Browser AI answer');await evaluate(worker,`(async()=>{await chrome.storage.local.set({settings:${JSON.stringify(previousSettings)}});await chrome.storage.local.remove('chat');})()`);
assert.ok(await evaluate(options,`document.getElementById('account').textContent.includes('chrome@test.invalid')`));
 assert.ok(!JSON.stringify(await evaluate(worker,`chrome.storage.sync.get(null)`)).includes('mock-browser-access'));
 await evaluate(worker,`chrome.tabs.remove(${attempt.tabId})`);
 const apiBaseline=await evaluate(worker,`(async()=>(await chrome.storage.local.get('settings')).settings)()`);
 for(const provider of ['glm','hunyuan','anthropic','gemini','qwen','doubao','moonshot']){
  await evaluate(options,`document.getElementById('apiKey').value='previous-provider-secret';document.getElementById('provider').value='${provider}';document.getElementById('provider').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(options,`document.getElementById('apiKey').value`),'','switching providers clears previous credentials');
  await evaluate(options,`document.getElementById('apiKey').value='dummy-${provider}';document.getElementById('model').value='protocol-model';document.querySelector('#settings-form button[type="submit"]').click()`);
  for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.provider===provider)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.provider,provider);
  const answer=await evaluate(page,`chrome.runtime.sendMessage({type:'chat',text:'Protocol test'})`);assert.ok(!answer.error,JSON.stringify(answer));assert.match(answer.data,provider==='anthropic'?/Claude protocol answer/:provider==='gemini'?/Gemini protocol answer/:/测试分析/);
 }
 const synced17=await evaluate(page,`chrome.runtime.sendMessage({type:'sync-upload'})`);assert.ok(synced17.data);const config17=(await evaluate(worker,`chrome.storage.sync.get('config')`)).config.settings;assert.equal(config17.theme.background,'#e8f4ee');assert.deepEqual(config17.tabOrder,['monitor','news','brief','tech','chat']);assert.ok(!JSON.stringify(config17).includes('dummy-moonshot'));

 // Exercise overseas history and configurable multi-asset sources through the real worker and UI.
 await evaluate(worker,`(()=>{const previous=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(url.includes('api.nasdaq.com')){if(url.includes('/historical'))return Response.json({data:{totalRecords:200,tradesTable:{rows:Array.from({length:200},(_,i)=>({date:new Date(Date.UTC(2026,0,i+1)).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}),open:'100',high:'110',low:'99',close:'105',volume:'1000'}))}}});return Response.json({data:{companyName:'Apple',primaryData:{lastSalePrice:'$105',netChange:'+5',percentageChange:'+5%',lastTradeTimestamp:'2026-10-16',isRealTime:false}}});}if(url.includes('api.exchange.coinbase.com'))return Response.json(url.includes('/stats')?{open:'100',high:'120',low:'90',volume:'10'}:url.includes('/candles')?[[1792108800,90,120,100,110,10],[1792195200,95,125,110,115,20]]:{price:'110',time:'2026-10-18T00:00:00Z'});return previous(url,init);};})()`);
 await evaluate(options,`document.querySelector('[data-category="crypto"]').value='coinbase';document.querySelector('[data-category="us"]').value='nasdaq';document.getElementById('banner-market-defaults').click();document.querySelector('#settings-form button[type="submit"]').click()`);
 for(let i=0;i<40;i++){if((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.dataSources?.routes.crypto==='coinbase')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await evaluate(worker,`chrome.storage.local.get('settings')`)).settings.dataSources.routes.crypto,'coinbase');
 const multiQuotes=await evaluate(page,`chrome.runtime.sendMessage({type:'quotes',force:true})`);assert.ok(!multiQuotes.error,JSON.stringify(multiQuotes));
 const banner18=(await evaluate(worker,`chrome.storage.local.get('quotes')`)).quotes;assert.ok(banner18.some(q=>q.symbol==='BTCUSDT'&&q.source.includes('Coinbase')&&q.currency==='USDT'));assert.ok(banner18.some(q=>q.symbol==='GC'));assert.ok(banner18.some(q=>q.symbol==='au0'));assert.ok(banner18.some(q=>q.symbol==='CL'));
 await evaluate(worker,`(async()=>{const {settings}=await chrome.storage.local.get('settings');settings.watchlist=[...settings.watchlist,{name:'Apple overseas',provider:'tencent',symbol:'usAAPL',type:'股票'}];await chrome.storage.local.set({settings});})()`);
 const overseas18=await evaluate(page,`chrome.runtime.sendMessage({type:'instrument-detail',key:'tencent:usAAPL:',period:'day-max'})`);assert.ok(!overseas18.error,JSON.stringify(overseas18));assert.equal(overseas18.data.chart.bars.length,200);assert.match(overseas18.data.chart.source,/Nasdaq/);
 await evaluate(page,`chrome.runtime.sendMessage({type:'monitor',force:true})`);await evaluate(page,`document.querySelector('[data-tab="monitor"]').click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.querySelector('#monitor-body').textContent.includes('Apple overseas')`))break;await new Promise(r=>setTimeout(r,100));}
 await evaluate(page,`[...document.querySelectorAll('#monitor-body .table-link')].find(b=>b.textContent.includes('Apple overseas')).click()`);
 for(let i=0;i<40;i++){if(await evaluate(page,`document.querySelector('#instrument-status').textContent.includes('Nasdaq')`))break;await new Promise(r=>setTimeout(r,100));}
 assert.notEqual(await evaluate(page,`document.querySelector('[data-range].selected').dataset.range`),'minute');assert.ok(await evaluate(page,`document.querySelector('[data-range="minute"]').disabled`));assert.ok(await evaluate(page,`document.querySelector('#instrument-chart svg')!==null`));await evaluate(page,`document.getElementById('instrument-close').click()`);
 const sync18=await evaluate(page,`chrome.runtime.sendMessage({type:'sync-upload'})`);assert.ok(!sync18.error,JSON.stringify(sync18));assert.equal((await evaluate(worker,`chrome.storage.sync.get('config')`)).config.settings.dataSources.routes.crypto,'coinbase');

 await evaluate(worker,`(async()=>{globalThis.savedSourceFetch=fetch;globalThis.fetch=async()=>{throw Error('new-source-offline')};const {settings}=await chrome.storage.local.get('settings');settings.dataSources.routes.crypto='crypto';await chrome.storage.local.set({settings});})()`);
 await evaluate(page,`chrome.runtime.sendMessage({type:'quotes',force:true})`);const switched18=(await evaluate(worker,`chrome.storage.local.get('quotes')`)).quotes.find(q=>q.symbol==='BTCUSDT');assert.equal(switched18.price,undefined,'new source must not reuse a cached Coinbase price');assert.match(switched18.error,/new-source-offline/);
 await evaluate(worker,`globalThis.fetch=globalThis.savedSourceFetch`);
 console.log('Verified overseas 200-day history, daily default, source routing, gold/oil/crypto banner and synced source configuration');
 await evaluate(worker,`chrome.storage.local.set({settings:${JSON.stringify(apiBaseline)}})`);await evaluate(worker,`chrome.storage.local.remove('chat')`);
 console.log('Verified settings entry, tab ordering, light/custom themes and all added AI providers with mocked APIs');

 }finally{options.close();await browser.call('Target.closeTarget',{targetId:optionsTarget});}
 const chat=await evaluate(page,`chrome.runtime.sendMessage({type:'chat',text:'影响全球市场吗？'})`);assert.match(chat.data,/测试分析/);
 await evaluate(worker,`globalThis.fetch=async()=>{throw Error('offline')}`);
 await evaluate(page,`chrome.runtime.sendMessage({type:'refresh'})`);
 await evaluate(page,`chrome.runtime.sendMessage({type:'tech-refresh',force:true})`);const techOffline=await evaluate(worker,`chrome.storage.local.get(['techItems','techStatus'])`);assert.equal(techOffline.techStatus.success,false);assert.ok(techOffline.techItems.length>0);const after=await evaluate(worker,`chrome.storage.local.get(['items','status','chat'])`);assert.equal(after.status.success,false);assert.ok(after.items.length>=2);assert.equal(after.chat.length,2);
 const parser=await evaluate(page,`chrome.runtime.sendMessage({target:'parser',source:'Atom',xml:'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom test</title><link href="https://example.com/atom"/><updated>2026-10-17T01:00:00Z</updated></entry></feed>'})`);assert.equal(parser.items[0].url,'https://example.com/atom');
 await evaluate(worker,`(()=>{globalThis.focusTrace=[];chrome.windows.onFocusChanged.addListener(id=>focusTrace.push({id,at:Date.now()}))})()`);
 const actionTab=(await browser.call('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos.find(t=>t.url===`chrome-extension://${id}/index.html?full=1`);assert.ok(actionTab);
 await browser.call('Extensions.triggerAction',{id,targetId:actionTab.targetId});
 let windows;for(let i=0;i<30;i++){windows=await evaluate(worker,`chrome.windows.getAll()`);if(windows.some(w=>w.type==='popup'&&w.width===650&&w.height===425))break;await new Promise(r=>setTimeout(r,100));}
 const dashboard=windows.find(w=>w.type==='popup'&&w.width===650&&w.height===425);assert.ok(dashboard,'toolbar action opens a 650×425 resizable window');await new Promise(r=>setTimeout(r,1200));assert.ok((await evaluate(worker,`chrome.windows.getAll()`)).some(w=>w.id===dashboard.id),'new dashboard remains open after startup focus events');
 await browser.call('Extensions.triggerAction',{id,targetId:actionTab.targetId});await new Promise(r=>setTimeout(r,100));assert.equal((await evaluate(worker,`chrome.windows.getAll()`)).filter(w=>w.type==='popup').length,0,'second click closes dashboard '+JSON.stringify({dashboard,windows:await evaluate(worker,`chrome.windows.getAll()`),trace:await evaluate(worker,`globalThis.focusTrace`)}));
 await browser.call('Extensions.triggerAction',{id,targetId:actionTab.targetId});await new Promise(r=>setTimeout(r,100));
 const reopened=(await evaluate(worker,`chrome.windows.getAll()`)).find(w=>w.type==='popup');assert.ok(reopened);
 const displays=await evaluate(worker,`chrome.system.display.getInfo()`);const area=displays.find(d=>d.isPrimary).workArea;assert.equal(reopened.left,area.left+area.width-reopened.width-16);
 const dashboardTarget=await target(t=>t.type==='page'&&t.url===`chrome-extension://${id}/index.html`);const dashboardPage=await connect(dashboardTarget.webSocketDebuggerUrl);for(let i=0;i<40;i++){if(await evaluate(dashboardPage,`document.documentElement?.dataset.dashboardReady==='true'`))break;await new Promise(r=>setTimeout(r,100));}await dashboardPage.call('Page.bringToFront');await new Promise(r=>setTimeout(r,300));
 const normal=(await evaluate(worker,`chrome.windows.getAll()`)).find(w=>w.type==='normal');await evaluate(worker,`chrome.windows.update(${normal.id},{focused:true})`);await page.call('Page.bringToFront');
 // Headless reports both OS windows focused; inject only the native DOM-focus boundary.
 await evaluate(dashboardPage,`(()=>{window.dispatchEvent(new Event('focus'));Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'));})()`);dashboardPage.close();
 for(let i=0;i<30;i++){if(!(await evaluate(worker,`chrome.windows.getAll()`)).some(w=>w.id===reopened.id))break;await new Promise(r=>setTimeout(r,100));}assert.ok(!(await evaluate(worker,`chrome.windows.getAll()`)).some(w=>w.id===reopened.id),'focus loss closes dashboard');
 console.log('PASS: Chrome extension load, RSS/Atom parser, FX data, cache, schedule, UI, summary, chat, offline retention. AI responses were mocked.');
 await evaluate(worker,`globalThis.fetch=globalThis.originalFetch`);
 await browser.call('Target.closeTarget',{targetId});
}finally{page?.close();worker?.close();browser.close();}

import {configurationFile,parseConfiguration,syncSettings,restoreSettings} from './config.js';
import {sourceAdapters,sourceCategories,endpointPresets,dataSources,defaultDataSources,sourceOrigins,validateDataSources} from './data-sources.js';
import {providers,providerByID} from './ai-providers.js';
import {tabIDs,tabNames,defaultTheme,applyTheme,setupAppearance} from './appearance.js';
import {t,locale,errorText,setupLanguage} from './i18n.js';
import {commonChartDays,parseChartDays,parseIndicatorKeys,minuteIntervals} from './chart-settings.js';
import {techFeeds} from './technology.js';
import {watchExamples,validateWatchlist,watchKey} from './watchlist.js';
import {defaults,validate} from './core.js';
import {indexPresets,marketPresets,bannerKey,parseBannerLines,defaultBanner} from './markets.js';
let watchlist=[],watchOrderBusy=false,editing=-1,indicatorDraft=structuredClone(defaults.chartIndicators),indicatorDirty=false,optionsReady=false,tabOrderDraft=[...tabIDs],appearanceDirty=false,credentialScope={},sourceDraft=dataSources();
const $=id=>document.getElementById(id);
const notice=text=>{$('notice').textContent=t(text);};
const syncNotice=text=>{$('sync-status').textContent=t(text);};
async function request(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(r.error)throw Error(r.error);return r.data;}
function display(settings){
 const s={...defaults,...settings};
 for(const id of ['time','provider','endpoint','model','apiKey'])$(id).value=s[id]||'';
 tabOrderDraft=[...s.tabOrder];renderTabOrder();$('theme-mode').value=s.theme.mode;$('theme-background').value=s.theme.background;$('theme-accent').value=s.theme.accent;previewTheme();appearanceDirty=false;credentialScope={provider:s.provider,endpoint:s.endpoint};
 sourceDraft=dataSources(s.dataSources);renderSources();
 $('autoAI').checked=s.autoAI;indicatorDraft=structuredClone(s.chartIndicators);$('indicator-keys').value=indicatorDraft.map(i=>i.key==='average'?'VWAP':i.key.toUpperCase()).join(',');renderIndicatorEditor();renderMinuteIntervals(s.chartIntervals);indicatorDirty=false;
 $('tech-feeds').value=(s.techFeeds||techFeeds).map(f=>`${f.name} | ${f.url}`).join('\n');$('chart-days').value=(s.chartDays||defaults.chartDays).join(',');
 $('feeds').value=s.feeds.map(f=>`${f.name} | ${f.url}`).join('\n');
 $('index-presets').replaceChildren();
 const selected=s.indices||defaults.indices;
 for(const i of marketPresets){
  const label=document.createElement('label');label.className='inline';
  const input=document.createElement('input');input.type='checkbox';input.value=bannerKey(i);input.checked=selected.some(x=>bannerKey(x)===bannerKey(i));label.append(input,document.createTextNode(t(i.name)));$('index-presets').append(label);
 }
 $('custom-indices').value=selected.filter(i=>!marketPresets.some(p=>bannerKey(p)===bannerKey(i))).map(i=>`${i.name} | ${i.symbol} | ${i.provider||'tencent'} | ${i.type||'指数'}`).join('\n');
 badgeOptions(s.badgeSymbol??defaults.badgeSymbol);$('badgeRefreshMinutes').value=s.badgeRefreshMinutes||1;
 watchlist=structuredClone(s.watchlist||[]);editing=-1;renderWatchConfig();$('monitorRefreshMinutes').value=s.monitorRefreshMinutes||5;
 providerPanel();
}
function lines(id,valueKey){return $(id).value.split('\n').filter(s=>s.trim()).map(line=>{const at=line.indexOf('|');return {name:line.slice(0,at).trim(),[valueKey]:at<0?'':line.slice(at+1).trim()};});}
function readSettings(){
 const s={};for(const id of ['time','provider','endpoint','model','apiKey'])s[id]=$(id).value.trim();
 s.theme=readTheme();s.tabOrder=[...tabOrderDraft];s.language=$('language').value;s.chartIndicators=parseIndicatorKeys($('indicator-keys').value,readIndicatorChecks());s.chartIntervals=[...document.querySelectorAll('#minute-intervals input:checked')].map(i=>Number(i.value));s.autoAI=$('autoAI').checked;s.feeds=lines('feeds','url');s.techFeeds=lines('tech-feeds','url');s.chartDays=parseChartDays($('chart-days').value);
 s.indices=selectedBanner();s.dataSources=readSources();
 s.badgeSymbol=$('badgeSymbol').value;s.badgeRefreshMinutes=Number($('badgeRefreshMinutes').value);
 s.watchlist=watchlist;s.monitorRefreshMinutes=Number($('monitorRefreshMinutes').value);
 return validate(s);
}
function providerPanel(){const preset=providerByID($('provider').value);$('provider-docs').hidden=!preset.docs;if(preset.docs)$('provider-docs').href=preset.docs;$('model').placeholder=t('填写账户可用的模型ID；支持手动输入');const login=$('provider').value==='chatgpt';$('login-panel').hidden=!login;$('api-panel').hidden=login;$('endpoint').required=!login;}
async function apply(settings){
 const origins=[...new Set([...(settings.provider==='chatgpt'?[]:[settings.endpoint]),...settings.feeds.map(f=>f.url),...(settings.techFeeds||techFeeds).map(f=>f.url),...sourceOrigins(settings.dataSources).map(origin=>origin.slice(0,-1)),...(settings.watchlist||[]).filter(i=>i.provider==='custom').map(i=>i.url)].map(u=>new URL(u).origin+'/*'))];
 if(!await chrome.permissions.request({origins}))throw Error(t('保存需要所配置域名的访问权限'));
 await request('save',{settings});
}
async function action(button,fn,report=notice){button.disabled=true;report(t('正在处理…'));try{await fn();}catch(e){report(errorText(e.message));}finally{button.disabled=false;}}
$('time').addEventListener('click',()=>{try{$('time').showPicker();}catch{/* Native keyboard editing remains available. */}});
$('provider').onchange=()=>{const preset=providerByID($('provider').value);if(preset.endpoint)$('endpoint').value=preset.endpoint;$('apiKey').value='';$('model').value='';credentialScope={provider:preset.id,endpoint:$('endpoint').value.trim()};providerPanel();};
$('endpoint').addEventListener('input',()=>{if($('endpoint').value.trim()!==credentialScope.endpoint)$('apiKey').value='';});
$('settings-form').onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{await apply(readSettings());indicatorDirty=false;appearanceDirty=false;credentialScope={provider:$('provider').value,endpoint:$('endpoint').value.trim()};notice(t('设置已保存'));});};
$('upload').onclick=e=>action(e.currentTarget,async()=>{const date=await request('sync-upload');await renderSyncList();syncNotice(t('已写入 Chrome Sync，等待浏览器同步：')+new Date(date).toLocaleString(locale()));},syncNotice);
$('download').onclick=e=>action(e.currentTarget,async()=>{const s=await request('sync-download');await apply(s);display(s);syncNotice(t('云端配置已拉取并应用；密钥和登录状态未同步'));},syncNotice);
async function account(){const d=await request('auth',{path:'status'});$('account').textContent=d.error?`${t(d.message)}: ${errorText(d.error)}`:d.pending?t(d.message):d.connected?t('已连接 {email} · {state}',{email:d.email,state:d.planEnabled?t('已授权订阅用量'):t('未授权订阅用量')}):t('尚未登录 ChatGPT');return d;}
$('login').onclick=e=>action(e.currentTarget,async()=>{await request('auth',{path:'login'});notice(t('请在 OpenAI 官方页面完成授权，登录状态将自动更新'));});
$('login-status').onclick=e=>action(e.currentTarget,async()=>{await account();notice(t('登录状态已刷新'));});
$('logout').onclick=e=>action(e.currentTarget,async()=>{await request('auth',{path:'logout'});await account();$('model-picker').replaceChildren();notice(t('本机已退出。可在 ChatGPT 设置中撤销授权'));});
$('models').onclick=e=>action(e.currentTarget,async()=>{const {models}=await request('auth',{path:'models'});$('model-picker').replaceChildren();for(const m of models){const option=document.createElement('option');option.value=m.id;option.textContent=m.name;$('model-picker').append(option);}if(models.length){$('model').value=models[0].id;notice(t('模型已加载，请保存设置'));}else notice(t('当前账户未返回可用模型'));await account();});
$('model-picker').onchange=()=>{$('model').value=$('model-picker').value;};
chrome.storage.local.onChanged.addListener(changes=>{if(changes.chatgptAuthStatus||changes.chatgptCredentials)account().catch(e=>notice(errorText(e.message)));});
account().catch(e=>notice(errorText(e.message)));
await setupAppearance(()=>{if(appearanceDirty)previewTheme();});
await setupLanguage($('language'),()=>{if(optionsReady){notice('');$('watch-status').textContent='';refreshLabels();}});
display((await chrome.storage.local.get('settings')).settings||{...defaults,provider:'chatgpt'});

function badgeOptions(selected=$('badgeSymbol').value){
 const choices=selectedBanner();
 $('badgeSymbol').replaceChildren();const off=document.createElement('option');off.value='';off.textContent=t('不显示');$('badgeSymbol').append(off);
 for(const i of choices){const o=document.createElement('option');o.value=bannerKey(i);o.textContent=t(i.name);$('badgeSymbol').append(o);}const matching=choices.find(i=>i.symbol===selected||bannerKey(i)===selected);$('badgeSymbol').value=matching?bannerKey(matching):'';
}
$('index-presets').addEventListener('change',()=>badgeOptions());$('custom-indices').addEventListener('input',()=>badgeOptions());




let matches=[],matchedCode='',lookupTicket=0,lookupTimer;
function watchNotice(text){notice(text);$('watch-status').textContent=text;}
function resetWatch(){editing=-1;matches=[];matchedCode='';lookupTicket++;$('watch-symbol').value='';$('watch-name').value='';$('watch-data-source').value='';$('watch-source-symbol').value='';$('watch-provider').value='auto';$('watch-match-label').hidden=true;$('watch-preview').textContent=t('输入代码即可自动识别名称与品种');$('watch-add').textContent=t('识别并添加');}
function renderWatchConfig(){
 const target=$('watch-config-list');target.replaceChildren();
 if(!watchlist.length){const p=document.createElement('p');p.className='muted';p.textContent=t('暂无监控项目');target.append(p);}
 for(const [at,item] of watchlist.entries()){
  const row=document.createElement('div');row.className='watch-config-row';const text=document.createElement('span');text.textContent=`${item.name} · ${item.symbol} · ${t(item.type)} / ${item.provider}`;
  const edit=document.createElement('button');edit.type='button';edit.textContent=t('编辑');edit.onclick=()=>{resetWatch();editing=at;for(const key of ['name','type','symbol','url'])$('watch-'+key).value=item[key]||'';$('watch-provider').value=item.provider==='custom'?'custom':'auto';$('watch-url-label').hidden=item.provider!=='custom';$('watch-data-source').value=item.dataSource||'';$('watch-source-symbol').value=item.sourceSymbol||'';matches=[item];matchedCode=item.symbol;$('watch-preview').textContent=`${item.name} · ${t(item.type)}`;$('watch-add').textContent=t('更新并保存');};
  const remove=document.createElement('button');remove.type='button';remove.textContent=t('删除');remove.onclick=()=>action(remove,async()=>{watchlist=await request('watch-update',{remove:watchKey(item)});resetWatch();renderWatchConfig();watchNotice(t('项目已删除并保存'));});row.append(text,edit,remove);
  for(const [direction,label] of [[-1,'上移'],[1,'下移']]){const button=document.createElement('button');button.type='button';button.dataset.move=direction;button.textContent=t(label);button.setAttribute('aria-label',t(label)+': '+item.name);button.disabled=watchOrderBusy||at+direction<0||at+direction>=watchlist.length;button.onclick=()=>{if(watchOrderBusy)return;watchOrderBusy=true;for(const control of target.querySelectorAll('button'))control.disabled=true;const editingKey=editing>=0?watchKey(watchlist[editing]):null;action(button,async()=>{try{watchlist=await request('watch-update',{move:watchKey(item),direction});if(editingKey)editing=watchlist.findIndex(i=>watchKey(i)===editingKey);watchNotice(t('监控顺序已保存'));}finally{watchOrderBusy=false;renderWatchConfig();}});};row.append(button);}
  target.append(row);
 }
}
function chooseMatch(){const item=matches[Number($('watch-match').value)||0];if(!item)return;$('watch-name').value=item.name;$('watch-type').value=item.type;$('watch-preview').textContent=t('已识别：{name} · {type} · {symbol}',{name:item.name,type:t(item.type),symbol:item.symbol});}
async function lookup(){
 const code=$('watch-symbol').value.trim();if(code===matchedCode&&matches.length)return matches;
 const ticket=++lookupTicket;$('watch-preview').textContent=t('正在查询代码…');matches=[];matchedCode='';$('watch-match-label').hidden=true;
 const found=await request('resolve-instrument',{code});if(ticket!==lookupTicket||$('watch-symbol').value.trim()!==code)throw Error(t('代码已更改，请重新添加'));
 matches=found;matchedCode=code;$('watch-match').replaceChildren();for(const [at,item]of found.entries()){const option=document.createElement('option');option.value=at;option.textContent=`${item.name} · ${t(item.type)} · ${item.symbol} / ${item.provider}`;$('watch-match').append(option);}
 $('watch-match-label').hidden=found.length<2;
 // An ambiguous code needs an explicit choice; never silently choose index over stock or NAV over ETF.
 if(found.length>1){const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=t('该代码有多个品种，请选择');$('watch-match').prepend(placeholder);$('watch-match').value='';$('watch-preview').textContent=t('查询到多个品种，请选择后添加');}else chooseMatch();
 return matches;
}
$('watch-match').onchange=chooseMatch;
$('watch-symbol').addEventListener('input',()=>{clearTimeout(lookupTimer);lookupTicket++;matches=[];matchedCode='';$('watch-match-label').hidden=true;if($('watch-provider').value==='auto'&&$('watch-symbol').value.trim())lookupTimer=setTimeout(()=>lookup().catch(e=>{$('watch-preview').textContent=e.message;}),600);});
$('watch-symbol').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('watch-add').click();}});
$('watch-provider').onchange=()=>{$('watch-url-label').hidden=$('watch-provider').value!=='custom';};
$('watch-add').onclick=e=>action(e.currentTarget,async()=>{
 try{clearTimeout(lookupTimer);let item;
  if($('watch-provider').value==='auto'){await lookup();if(matches.length>1&&$('watch-match').value===''){watchNotice(t('该代码匹配多个品种，请选择后再次添加'));return;}item=matches[Number($('watch-match').value)||0];}
  else{item={};for(const key of ['name','type','provider','symbol'])item[key]=$('watch-'+key).value.trim();if(item.provider==='custom'){item.url=$('watch-url').value.trim();const origin=new URL(item.url).origin+'/*';if(!await chrome.permissions.request({origins:[origin]}))throw Error(t('自定义行情来源需要域名访问权限'));}}
  item={...item};if($('watch-data-source').value)item.dataSource=$('watch-data-source').value;else delete item.dataSource;if($('watch-source-symbol').value.trim())item.sourceSymbol=$('watch-source-symbol').value.trim();else delete item.sourceSymbol;
  validateWatchlist([item]);const originalKey=editing>=0?watchKey(watchlist[editing]):undefined;
  watchlist=await request('watch-update',{item,originalKey});resetWatch();renderWatchConfig();watchNotice(t('项目已保存，已在行情监控列表展示；报价正在后台更新'));
 }catch(e){watchNotice(errorText(e.message));}
});
$('watch-examples').onclick=e=>action(e.currentTarget,async()=>{watchlist=await request('watch-update',{items:watchExamples});resetWatch();renderWatchConfig();watchNotice(t('示例已保存并展示在行情监控列表'));});
$('watch-cancel').onclick=resetWatch;
$('tech-defaults').onclick=()=>{$('tech-feeds').value=techFeeds.map(f=>`${f.name} | ${f.url}`).join('\n');notice(t('已恢复科技来源，请保存设置'));};
for(const day of commonChartDays){const button=document.createElement('button');button.type='button';button.dataset.day=day;button.textContent=t('{n}天',{n:day});button.onclick=()=>{try{const days=new Set(parseChartDays($('chart-days').value));days.has(day)?days.delete(day):days.add(day);if(!days.size)throw Error(t('至少保留一个常用周期'));$('chart-days').value=[...days].sort((a,b)=>a-b).join(',');}catch(e){notice(errorText(e.message));}};$('chart-day-presets').append(button);}
if(location.hash==='#watch-config')requestAnimationFrame(()=>$('watch-config').scrollIntoView());

if(location.hash==='#tech-config')requestAnimationFrame(()=>$('tech-config').scrollIntoView());

function readIndicatorChecks(){return indicatorDraft.map(item=>({...item,enabled:document.querySelector('#indicator-enabled input[value="'+item.key+'"]')?.checked??item.enabled}));}
function renderIndicatorEditor(){
 const target=$('indicator-enabled');target.replaceChildren();
 for(const item of indicatorDraft){const label=document.createElement('label');label.className='inline';const input=document.createElement('input');input.type='checkbox';input.value=item.key;input.checked=item.enabled;input.onchange=()=>{indicatorDirty=true;indicatorDraft=readIndicatorChecks();};label.append(input,document.createTextNode(item.key==='average'?t('分时成交均价'):item.key.toUpperCase()));target.append(label);}
}
function renderMinuteIntervals(selected){const target=$('minute-intervals');target.replaceChildren();for(const minutes of minuteIntervals){const label=document.createElement('label');label.className='inline';const input=document.createElement('input');input.type='checkbox';input.value=minutes;input.checked=selected.includes(minutes);label.append(input,document.createTextNode(minutes+' min'));target.append(label);}}
$('indicator-keys').oninput=()=>{indicatorDirty=true;try{indicatorDraft=parseIndicatorKeys($('indicator-keys').value,readIndicatorChecks());renderIndicatorEditor();$('indicator-error').textContent='';}catch(error){$('indicator-error').textContent=errorText(error.message);}};
for(const key of ['ema9','ema21','ma5','ma10','ma20','ma60','average']){const button=document.createElement('button');button.type='button';button.textContent=key==='average'?'VWAP':key.toUpperCase();button.onclick=()=>{try{const items=parseIndicatorKeys($('indicator-keys').value,readIndicatorChecks());const next=items.some(i=>i.key===key)?items.filter(i=>i.key!==key):[...items,{key,enabled:true}];$('indicator-keys').value=next.map(i=>i.key==='average'?'VWAP':i.key.toUpperCase()).join(',');$('indicator-keys').dispatchEvent(new Event('input'));}catch(error){notice(errorText(error.message));}};$('indicator-presets').append(button);}
function refreshLabels(){renderSyncList().catch(error=>syncNotice(errorText(error.message)));if(pendingImport)configurationPreview($('config-preview'),pendingImport.settings);sourceDraft=readSources(false);renderSources();renderSourceOverride();renderTabOrder();for(const label of document.querySelectorAll('#index-presets label')){const preset=marketPresets.find(i=>bannerKey(i)===label.querySelector('input').value);label.lastChild.textContent=t(preset.name);}badgeOptions();renderWatchConfig();renderIndicatorEditor();for(const button of document.querySelectorAll('[data-day]'))button.textContent=t('{n}天',{n:button.dataset.day});$('watch-add').textContent=editing>=0?t('更新并保存'):t('识别并添加');if(matches.length)chooseMatch();account().catch(error=>notice(errorText(error.message)));}
chrome.storage.local.onChanged.addListener(changes=>{if(changes.settings&&!indicatorDirty){indicatorDraft=structuredClone(changes.settings.newValue?.chartIndicators||defaults.chartIndicators);$('indicator-keys').value=indicatorDraft.map(i=>i.key==='average'?'VWAP':i.key.toUpperCase()).join(',');renderIndicatorEditor();}});
optionsReady=true;document.documentElement.dataset.ready='true';

function readTheme(){return {mode:$('theme-mode').value,background:$('theme-background').value,accent:$('theme-accent').value};}
function previewTheme(){const theme=readTheme();$('theme-custom').hidden=theme.mode!=='custom';applyTheme(theme);}
for(const id of ['theme-mode','theme-background','theme-accent'])$(id).addEventListener('input',()=>{appearanceDirty=true;previewTheme();});
function renderTabOrder(){const target=$('tab-order-list');target.replaceChildren();for(const [at,id]of tabOrderDraft.entries()){const row=document.createElement('div');row.className='tab-order-row';row.dataset.tabId=id;const label=document.createElement('span');label.textContent=t(tabNames[id]);row.append(label);for(const [delta,symbol,description]of [[-1,'↑','上移'],[1,'↓','下移']]){const button=document.createElement('button');button.type='button';button.textContent=symbol;button.setAttribute('aria-label',t(description)+' '+t(tabNames[id]));button.disabled=at+delta<0||at+delta>=tabOrderDraft.length;button.onclick=()=>{appearanceDirty=true;[tabOrderDraft[at],tabOrderDraft[at+delta]]=[tabOrderDraft[at+delta],tabOrderDraft[at]];renderTabOrder();};row.append(button);}target.append(row);}}
$('tab-order-reset').onclick=()=>{appearanceDirty=true;tabOrderDraft=[...tabIDs];renderTabOrder();};
chrome.storage.local.onChanged.addListener(changes=>{if(changes.settings&&!appearanceDirty){const s={...defaults,...changes.settings.newValue};tabOrderDraft=[...s.tabOrder];renderTabOrder();$('theme-mode').value=s.theme.mode;$('theme-background').value=s.theme.background;$('theme-accent').value=s.theme.accent;$('theme-custom').hidden=s.theme.mode!=='custom';}});

function selectedBanner(){return [...document.querySelectorAll('#index-presets input:checked')].map(input=>marketPresets.find(i=>bannerKey(i)===input.value)).concat(parseBannerLines($('custom-indices').value));}
function renderSources(){
 const routes=$('source-routes'),endpoints=$('source-endpoints');routes.replaceChildren();endpoints.replaceChildren();
 for(const category of sourceCategories){const label=document.createElement('label');label.append(document.createTextNode(t(category.name)));const select=document.createElement('select');select.dataset.category=category.key;for(const adapter of sourceAdapters.filter(p=>category.choices.includes(p.id))){const option=document.createElement('option');option.value=adapter.id;option.textContent=t(adapter.name);select.append(option);}select.value=sourceDraft.routes[category.key];label.append(select);routes.append(label);}
 for(const preset of endpointPresets){const label=document.createElement('label');label.append(document.createTextNode(t(preset.name)));const input=document.createElement('input');input.type='url';input.dataset.endpoint=preset.key;input.value=sourceDraft.endpoints[preset.key];input.required=true;label.append(input);endpoints.append(label);}
 $('source-custom-template').value=sourceDraft.customTemplate;
}
function readSources(check=true){const config={routes:Object.fromEntries([...document.querySelectorAll('#source-routes select')].map(select=>[select.dataset.category,select.value])),endpoints:Object.fromEntries([...document.querySelectorAll('#source-endpoints input')].map(input=>[input.dataset.endpoint,input.value.trim()])),customTemplate:$('source-custom-template').value.trim()};return check?validateDataSources(config):dataSources(config);}
function renderSourceOverride(){const select=$('watch-data-source'),value=select.value;select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=t('使用分类默认来源');select.append(option);for(const adapter of sourceAdapters){const option=document.createElement('option');option.value=adapter.id;option.textContent=t(adapter.name);select.append(option);}select.value=value||'';}
$('sources-default').onclick=()=>{sourceDraft=dataSources(structuredClone(defaultDataSources));renderSources();notice(t('已恢复推荐来源，请保存设置'));};
$('sources-coinbase').onclick=()=>{sourceDraft=readSources(false);sourceDraft.routes.crypto='coinbase';renderSources();notice(t('来源已选择，请保存设置'));};
$('sources-yahoo').onclick=()=>{sourceDraft=readSources(false);sourceDraft.routes.us='yahoo';sourceDraft.routes.indicesUS='yahoo';sourceDraft.routes.hongkong='yahoo';renderSources();notice(t('来源已选择，请保存设置'));};
$('sources-yahoo-backup').onclick=()=>{sourceDraft=readSources(false);sourceDraft.endpoints.yahoo=sourceDraft.endpoints.yahoo.includes('query2.')?'https://query1.finance.yahoo.com':'https://query2.finance.yahoo.com';renderSources();notice(t('来源已选择，请保存设置'));};
$('banner-market-defaults').onclick=()=>{for(const input of document.querySelectorAll('#index-presets input'))input.checked=defaultBanner.some(i=>bannerKey(i)===input.value);badgeOptions();notice(t('常用行情已选择，请保存设置'));};
renderSourceOverride();

let pendingImport=null,syncListTicket=0,configFileTicket=0;
function configurationPreview(target,settings){
 target.replaceChildren();const table=document.createElement('table');table.className='config-table';const body=document.createElement('tbody');
 for(const [key,value]of Object.entries(syncSettings(settings))){const row=document.createElement('tr'),name=document.createElement('th'),cell=document.createElement('td'),details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');name.textContent=t(({time:'每日更新时间（本机时区）',provider:'AI 服务商',endpoint:'API Base URL',model:'模型名称',autoAI:'自动生成 AI 简报',feeds:'RSS / Atom 新闻源（每行：名称 | HTTPS URL）',indices:'顶部展示行情',badgeSymbol:'插件按钮关注行情',badgeRefreshMinutes:'按钮指数更新频率',watchlist:'自定义监控项目',monitorRefreshMinutes:'监控后台刷新频率',chartDays:'常用天数',techFeeds:'科技资讯来源',language:'界面语言',chartIndicators:'图表指标配置',chartIntervals:'分钟K线周期',tabOrder:'标签页顺序',theme:'背景主题',dataSources:'行情与数据源设置'})[key]||key);summary.textContent=Array.isArray(value)?t('{n} 条',{n:value.length}):value&&typeof value==='object'?t('查看内容'):String(value??'');pre.textContent=JSON.stringify(value,null,2)??'';details.append(summary,pre);cell.append(details);row.append(name,cell);body.append(row);}table.append(body);target.append(table);
}
async function renderSyncList(){
 const ticket=++syncListTicket,result=await request('sync-list');if(ticket!==syncListTicket)return;
 $('sync-diagnostics').textContent=t('扩展ID：{id} · 同步区占用：{n}字节；无法检测账户同步状态或服务器收件状态',{id:result.extensionId,n:result.bytes});const target=$('sync-list');target.replaceChildren();
 const status=document.createElement('p');status.textContent=result.error?errorText(result.error):result.record?t('最新同步副本：{time}',{time:result.record.date?new Date(result.record.date).toLocaleString(locale()):t('尚未更新')}):t('当前同步区没有配置。请在来源设备上传，确认两端扩展ID相同并开启同步后刷新。');target.append(status);
 if(result.record){const list=document.createElement('div');configurationPreview(list,result.record.settings);target.append(list);}
}
$('sync-list-refresh').onclick=e=>action(e.currentTarget,renderSyncList,syncNotice);
$('config-export').onclick=e=>action(e.currentTarget,async()=>{const file=configurationFile(readSettings()),blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='market-pulse-config-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(t('配置文件已生成，密钥和登录凭据未导出'));});
$('config-file').onchange=async()=>{
 const ticket=++configFileTicket;pendingImport=null;$('config-import').disabled=true;$('config-preview').replaceChildren();$('config-file-status').textContent='';const file=$('config-file').files[0];if(!file)return;
 try{if(file.size>1048576)throw Error('配置文件过大，最大1MB');const imported=parseConfiguration(await file.text(),{...defaults,...(await chrome.storage.local.get('settings')).settings});if(ticket!==configFileTicket)return;pendingImport={version:1,settings:syncSettings(imported)};configurationPreview($('config-preview'),imported);$('config-file-status').textContent=t('配置已读取，请检查内容后应用；将替换现有配置，密钥和登录状态不导入。');$('config-import').disabled=false;}catch(error){if(ticket===configFileTicket)$('config-file-status').textContent=errorText(error.message);}
};
$('config-import').onclick=e=>action(e.currentTarget,async()=>{if(!pendingImport)return;const settings=restoreSettings(pendingImport,{...defaults,...(await chrome.storage.local.get('settings')).settings});await apply(settings);indicatorDirty=false;appearanceDirty=false;display(settings);credentialScope={provider:settings.provider,endpoint:settings.endpoint};pendingImport=null;$('config-preview').replaceChildren();$('config-file').value='';$('config-file-status').textContent=t('离线配置已导入并保存');setTimeout(()=>$('config-import').disabled=true,0);notice(t('离线配置已导入并保存'));});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&changes.config)renderSyncList().catch(error=>syncNotice(errorText(error.message)));});
renderSyncList().catch(error=>syncNotice(errorText(error.message)));

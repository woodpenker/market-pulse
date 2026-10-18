import {dataSources,routedInstrument} from './data-sources.js';
import {bannerInstrument,bannerKey} from './markets.js';
import {setupAppearance,tabIDs,validateTabOrder,moveTab} from './appearance.js';
import {t,locale,errorText,setupLanguage} from './i18n.js';
import {defaults,buildDigest} from './core.js';
import {classifyTech} from './technology.js';
import {watchKey} from './watchlist.js';
import {drawChart} from './chart.js';
import {chartView,indicatorDefinitions} from './indicators.js';
import {isCandlePeriod,supportsMinuteCandles} from './minute-bars.js';
const $=id=>document.getElementById(id);
const local=chrome.storage.local;
const date=s=>s?new Date(s).toLocaleString(locale()):t('尚未更新');
function notice(text){$('notice').textContent=t(text);}
async function request(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(r.error)throw Error(r.error);return r.data;}
function node(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;}
async function busy(button,fn){button.disabled=true;notice(t('正在处理…'));try{await fn();notice(t('已完成'));await render();}catch(e){notice(errorText(e.message));}finally{button.disabled=false;}}
function tab(id){for(const s of document.querySelectorAll('main > section'))s.hidden=s.id!==id;for(const b of document.querySelectorAll('nav button'))b.classList.toggle('selected',b.dataset.tab===id);}
for(const b of document.querySelectorAll('nav button'))b.onclick=()=>tab(b.dataset.tab);
$('open-settings').onclick=()=>chrome.runtime.openOptionsPage();
$('expand').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('index.html?full=1')});
let cached=[],techCached=[],renderTicket=0,indicatorConfig=structuredClone(defaults.chartIndicators),languageReady=false,initialTab=false,currentSources=defaults.dataSources,sourceRevision='';
function timeline(){
 const q=$('search').value.toLowerCase();const target=$('timeline');target.replaceChildren();
 const items=cached.filter(i=>`${i.title} ${i.description} ${i.source}`.toLowerCase().includes(q));
 if(!items.length)target.append(node('p',cached.length?t('没有匹配新闻'):t('尚无新闻。点击“立即更新”，或从扩展 Options 配置新闻源。'),'muted'));
 for(const i of items){const row=node('article','','event');row.append(node('div',`${date(i.date)}${i.dateEstimated?t('（抓取时间）'):''} · ${i.source}`,'meta'));const a=node('a',i.title);a.href=i.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,node('p',i.description?.slice(0,240)||''));target.append(row);}
}
function quotes(list,selected){
 const target=$('market-banner');target.replaceChildren();
 for(const i of selected){
  const q=list.find(x=>bannerKey(x)===bannerKey(i));const card=node('button','','quote');card.type='button';card.onclick=()=>openInstrument({...bannerInstrument(i),isNAV:q?.isNAV});card.append(node('span',t(i.name)));
  card.append(node('strong',q?.price?Number(q.price).toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:2}):'—'));
  if(q?.price)card.append(node('span',`${Number.isFinite(q.change)?(q.change>=0?'+':'')+q.change.toFixed(2):'—'} (${Number.isFinite(q.percent)?(q.percent>=0?'+':'')+q.percent.toFixed(2)+'%':'—'})`,Number.isFinite(q.change)?q.change>=0?'up':'down':''));
  card.append(node('small',[q?.currency,t(q?.source||''),t(q?.basis||''),q?.quoteTime,q?.error?(q.price?t('缓存')+': ':'')+errorText(q.error):'',q?.price?'':t('等待更新')].filter(Boolean).join(' · ')));
  if(q?.error)card.title=errorText(q.error);
  target.append(card);
 }
 $('quote-status').textContent=selected.length?t('多资产行情 · 来源、币种和涨跌口径按卡片区分；数据可能延迟，可在配置中切换来源'):t('未选择展示指数，可从插件 Options 中配置');
}
async function render(){
 const ticket=++renderTicket;const d=await local.get(['items','status','summary','chat','aiError','digest','quotes','settings','monitorRows','monitorAt','techItems','techStatus']);if(ticket!==renderTicket)return;
 const nextSources=dataSources(d.settings?.dataSources),revision=JSON.stringify(nextSources);if(sourceRevision&&revision!==sourceRevision&&$('instrument-dialog').open&&selectedInstrument){detailData=null;currentSources=nextSources;openInstrument(selectedInstrument,selectedRange);}currentSources=nextSources;sourceRevision=revision;
 applyTabOrder(d.settings?.tabOrder||tabIDs);if(!initialTab){initialTab=true;tab((d.settings?.tabOrder||tabIDs)[0]);}
 cached=d.items||[];techCached=d.techItems||[];timeline();technologyTimeline();
 const configured=d.settings?.watchlist||[];const monitorRows=configured.map(item=>({...d.monitorRows?.find(row=>watchKey(row)===watchKey(item)),...item}));renderMonitor(monitorRows,d.monitorAt,d.settings?.monitorRefreshMinutes||5);
 $('tech-updated').textContent=t('最近尝试：{time} · 保存 {n} 条 · {schedule}',{time:date(d.techStatus?.attempt),n:techCached.length,schedule:t('每日自动更新')});
 $('tech-sources').textContent=d.techStatus?.sources.map(s=>`${s.name}: ${s.error?errorText(s.error):t('{n} 条',{n:s.count})}`).join(' / ')||t('等待首次更新；可以配置RSS/Atom来源');
 indicatorConfig=structuredClone(d.settings?.chartIndicators||defaults.chartIndicators);renderChartRanges(d.settings?.chartDays||defaults.chartDays,d.settings?.chartIntervals||defaults.chartIntervals);renderIndicatorControls();quotes(d.quotes||[],d.settings?.indices||defaults.indices);
 $('updated').textContent=t('最近尝试：{time} · 保存 {n} 条 · {schedule}',{time:date(d.status?.attempt),n:cached.length,schedule:t('最多保留 30 天')});
 $('sources').textContent=d.status?.sources.map(s=>`${s.name}: ${s.error?errorText(s.error):t('{n} 条',{n:s.count})}`).join(' / ')||t('首次安装将自动尝试更新');
 $('summary').textContent=d.summary?.text||t('尚未生成 AI 简报。请先通过扩展 Options 配置 ChatGPT 登录或 API，再点击生成。');
 $('brief-date').textContent=d.summary?t('生成于 {time}',{time:date(d.summary.date)})+(d.aiError?' · '+t('最近自动生成失败')+': '+errorText(d.aiError):''):errorText(d.aiError)||'';
 $('messages').replaceChildren(...(d.chat||[]).map(m=>node('div',`${m.role==='user'?t('你'):t('研究助手')}\n${m.content}`,'bubble '+m.role)));
 $('overview').replaceChildren(node('article',(d.digest?buildDigest(cached,d.status,Date.parse(d.digest.date),locale()).text:t('首次更新后自动生成本地摘要，无需登录。'))));if($('instrument-dialog').open)renderDetailChart();
}
$('search').oninput=timeline;
$('refresh').onclick=()=>busy($('refresh'),async()=>{await Promise.all([request('refresh'),request('quotes',{force:true})]);});
let generating=false;
async function generate(){tab('brief');if(generating)return;generating=true;$('news-summarize').disabled=true;try{await busy($('summarize'),()=>request('summary'));}finally{generating=false;$('news-summarize').disabled=false;}}
$('news-summarize').onclick=generate;$('summarize').onclick=generate;
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('question').value.trim();if(!text)return;busy(e.submitter,async()=>{await request('chat',{text});$('question').value='';});};
$('clear').onclick=async()=>{await local.remove('chat');await render();};
local.onChanged.addListener(()=>render().catch(e=>notice(errorText(e.message))));
request('quotes').catch(e=>{$('quote-status').textContent=e.message;});
setInterval(()=>request('quotes').catch(()=>{}),60000);

// Native focus events can lag while Chrome creates the popup. Confirm DOM blur too.
let wasFocused=document.hasFocus(),blurTimer;
window.addEventListener('focus',()=>{wasFocused=true;clearTimeout(blurTimer);});
window.addEventListener('blur',()=>{clearTimeout(blurTimer);if(!wasFocused)return;blurTimer=setTimeout(()=>{if(!document.hasFocus())chrome.tabs.getCurrent().then(tab=>tab&&!document.hasFocus()&&chrome.runtime.sendMessage({type:'dashboard-blur',windowId:tab.windowId})).catch(()=>{});},250);});

function format(value){return Number.isFinite(value)?value.toLocaleString(locale(),{maximumSignificantDigits:10}):'—';}
function renderMonitor(rows,at,frequency){
 $('monitor-status').textContent=t('最近尝试：{time} · 后台每{n}分钟更新 · {count}项',{time:date(at),n:frequency,count:rows.length});
 $('monitor-body').replaceChildren();if(!rows.length){const tr=node('tr','');const td=node('td',t('尚无监控项目。点击“管理项目”自定义添加，或添加示例。'));td.colSpan=7;tr.append(td);$('monitor-body').append(tr);}
 for(const q of rows){const tr=node('tr','');const name=node('td','');const button=node('button',q.name,'table-link');button.onclick=()=>openInstrument(q);name.append(button,node('small',q.symbol));tr.append(name,node('td',t(q.type)),node('td',format(q.price)),node('td',format(q.change),q.change>=0?'up':'down'),node('td',Number.isFinite(q.percent)?q.percent.toFixed(2)+'%':'—',q.percent>=0?'up':'down'),node('td',`${t(q.basis||'')} ${q.currency||''}`),node('td',`${q.quoteTime||'—'} · ${q.error?t('失败/缓存')+': '+errorText(q.error):t(q.source||'')}`));$('monitor-body').append(tr);}
}
$('monitor-manage').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('options.html#watch-config')});
$('monitor-refresh').onclick=()=>busy($('monitor-refresh'),()=>request('monitor',{force:true}));
let selectedInstrument,detailTicket=0,detailData,selectedRange='minute';
function renderChartRanges(days,intervals){
 const container=$('chart-ranges');const key=days.join(',')+'|'+intervals.join(',')+'|'+locale();if(container.dataset.days===key)return;container.dataset.days=key;container.replaceChildren();
 for(const range of ['minute',...intervals.map(n=>n+'m'),...days.map(String),'max']){
  const label=range==='minute'?t('分时'):range==='max'?t('最长'):isCandlePeriod(range)?range.replace('m',' min'):t('{n}天',{n:range});
  const button=node('button',label);button.dataset.range=range;button.id=range==='minute'?'period-minute':range==='90'?'period-day':'period-'+range;button.onclick=()=>selectedInstrument&&openInstrument(selectedInstrument,range);container.append(button);
 }
 updateRangeControls();
}
function updateRangeControls(){for(const button of document.querySelectorAll('[data-range]')){const range=button.dataset.range;button.classList.toggle('selected',range===selectedRange);button.disabled=!!selectedInstrument&&((range==='minute'&&(routedInstrument(selectedInstrument,currentSources).adapter==='nasdaq'||selectedInstrument.provider==='fund'||selectedInstrument.isNAV||selectedInstrument.nasdaqAssetClass==='mutualfunds'))||(isCandlePeriod(range)&&!supportsMinuteCandles(selectedInstrument,currentSources,range)));button.title=button.disabled?t('当前来源不支持分钟K线'):'';}}
function renderIndicatorControls(){
 const container=$('chart-indicators');const key=JSON.stringify(indicatorConfig)+'|'+locale();if(container.dataset.config===key)return;container.dataset.config=key;container.replaceChildren();
 for(const item of indicatorConfig){const label=node('label','');const input=document.createElement('input');input.type='checkbox';input.value=item.key;input.checked=item.enabled;input.onchange=async()=>{indicatorConfig=indicatorConfig.map(i=>i.key===item.key?{...i,enabled:input.checked}:i);renderDetailChart();try{await request('preferences',{patch:{chartIndicators:indicatorConfig}});}catch(error){notice(errorText(error.message));await render();}};label.append(input,document.createTextNode(item.key==='average'?t('分时成交均价'):item.key.toUpperCase()));container.append(label);}
}
function renderInstrumentMeta(d){
 const q=d.quote||{};$('instrument-status').textContent=[t(d.chart?.source||'')+(d.chart?.resolvedSymbol?' · '+d.chart.resolvedSymbol:''),errorText(d.chart?.warning),d.chart?t('{n}个数据点',{n:d.chart.bars.length}):'',errorText(d.error),errorText(d.quoteError),t('抓取于 {time}',{time:date(d.fetchedAt)})].filter(Boolean).join(' · ');
 $('instrument-metrics').textContent=`${t('最新')} ${format(q.price)} ${q.currency||''} · ${t('涨跌幅')} ${Number.isFinite(q.percent)?q.percent.toFixed(2)+'%':'—'} · ${t('开')} ${format(q.open)} ${t('高')} ${format(q.high)} ${t('低')} ${format(q.low)} · ${t(q.basis||'')} · ${t('报价')} ${q.quoteTime||'—'}`;
}
function renderDetailChart(){
 if(selectedInstrument)$('instrument-title').textContent=t(selectedInstrument.name)+' · '+selectedInstrument.symbol;
 if(detailData)renderInstrumentMeta(detailData);
 if(!detailData?.chart)return;const minute=selectedRange==='minute',candle=isCandlePeriod(selectedRange);
 const enabled=indicatorConfig.filter(i=>i.enabled).map(i=>i.key);const view=chartView(detailData.chart,selectedRange,enabled,indicatorDefinitions(indicatorConfig));
 if(!enabled.includes('average'))view.bars=view.bars.map(b=>({...b,average:null}));
 for(const input of document.querySelectorAll('#chart-indicators input'))input.disabled=minute?input.value.startsWith('ma'):input.value==='average';
 $('chart-range-note').textContent=minute?t('分时指标说明'):candle?t('分钟指标说明',{n:parseInt(selectedRange)}):t('日线指标说明');
 $('chart-legend').replaceChildren();for(const line of view.overlays){const value=line.values.at(-1);const label=node('span',`${line.label} ${value==null?t('历史不足{n}点',{n:line.length}):format(value)}`);label.style.color=line.color;$('chart-legend').append(label);}
 if(!minute&&view.bars.length){$('chart-range-note').textContent+=' '+(selectedRange==='max'?t('最长可获取历史。')+' ':'')+t('实际返回 {first} 至 {last}，{n} 条记录；来源可能缺失历史。',{first:view.bars[0].time,last:view.bars.at(-1).time,n:view.bars.length});}
 const q=detailData.quote||{};drawChart($('instrument-chart'),view,{candles:!minute&&selectedInstrument.provider!=='fund'&&!view.isNAV,previousClose:minute?q.previousClose:null,currency:q.currency||'',interval:candle?selectedRange:''});
}
async function openInstrument(item,period){
 const ticket=++detailTicket;const range=period||(item.provider==='fund'||item.isNAV||item.nasdaqAssetClass==='mutualfunds'||routedInstrument(item,currentSources).adapter==='nasdaq'?([...document.querySelectorAll('#chart-ranges [data-range]')].find(button=>button.dataset.range!=='minute'&&!isCandlePeriod(button.dataset.range))?.dataset.range||'max'):'minute');const chosen=range==='minute'?'minute':isCandlePeriod(range)?range:'day-max';const reused=detailData&&selectedInstrument&&watchKey(selectedInstrument)===watchKey(item)&&detailData.period===chosen?detailData:null;selectedRange=range;detailData=null;selectedInstrument=item;updateRangeControls();
 $('instrument-title').textContent=t(item.name)+' · '+item.symbol;if(!$('instrument-dialog').open)$('instrument-dialog').showModal();
 $('instrument-status').textContent=t('正在加载行情与图表…');$('instrument-chart').replaceChildren();$('instrument-metrics').replaceChildren();
 for(const button of document.querySelectorAll('[data-range]'))button.classList.toggle('selected',button.dataset.range===range);$('chart-legend').replaceChildren();$('chart-range-note').textContent='';
 try{const d=reused||await request('instrument-detail',{key:watchKey(item),period:chosen});if(ticket!==detailTicket)return;
 renderInstrumentMeta(d);
 detailData=d;renderDetailChart();
 }catch(e){if(ticket===detailTicket)$('instrument-status').textContent=errorText(e.message);}
}
$('instrument-close').onclick=()=>{detailTicket++;$('instrument-dialog').close();};

request('monitor').catch(()=>{});setInterval(()=>request('monitor').catch(()=>{}),60000);

await setupAppearance(()=>{if(languageReady)render().catch(error=>notice(errorText(error.message)));});
await setupLanguage($('language'),()=>{if(languageReady){notice('');render().catch(error=>notice(errorText(error.message)));}});languageReady=true;
await render();
request('tech-refresh').catch(e=>{$('tech-sources').textContent=e.message;});
document.documentElement.dataset.dashboardReady='true';

function technologyTimeline(){
 const query=$('tech-search').value.toLowerCase(),category=$('tech-category').value;const days=Number($('tech-days').value);const now=Date.now();
 const items=techCached.filter(item=>now-Date.parse(item.date)<days*86400000&&Date.parse(item.date)<=now&&(!category||classifyTech(item).includes(category))&&`${item.title} ${item.description} ${item.source}`.toLowerCase().includes(query));
 $('tech-count').textContent=t('当前筛选 {n} 条；主题标签按关键词归类，发布时间缺失时标记抓取时间。',{n:items.length});
 const target=$('tech-timeline');target.replaceChildren();if(!items.length)target.append(node('p',t('所选时间和主题暂无资讯。可切换到最近7/30天、刷新或检查来源状态。'),'muted'));
 for(const item of items){const row=node('article','','event');row.append(node('div',`${date(item.date)}${item.dateEstimated?t('（抓取时间）'):''} · ${item.source} · ${classifyTech(item).map(label=>t(label)).join(' / ')}`,'meta'));const a=node('a',item.title);a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,node('p',item.description?.slice(0,240)||''));target.append(row);}
}
$('tech-search').oninput=technologyTimeline;$('tech-category').onchange=technologyTimeline;$('tech-days').onchange=technologyTimeline;
$('tech-refresh').onclick=()=>busy($('tech-refresh'),()=>request('tech-refresh',{force:true}));
$('tech-manage').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('options.html#tech-config')});

function applyTabOrder(order){validateTabOrder(order);const nav=document.querySelector('nav');if([...nav.querySelectorAll('[data-tab]')].map(b=>b.dataset.tab).join(',')===order.join(','))return;for(const id of order)nav.append(nav.querySelector('[data-tab="'+id+'"]'));}
async function saveTabOrder(order){try{applyTabOrder(order);await request('preferences',{patch:{tabOrder:order}});notice(t('标签顺序已保存'));}catch(error){notice(errorText(error.message));await render();}}
let draggedTab='';
for(const button of document.querySelectorAll('nav [data-tab]')){
 button.draggable=true;button.addEventListener('dragstart',event=>{draggedTab=button.dataset.tab;event.dataTransfer.setData('text/plain',draggedTab);event.dataTransfer.effectAllowed='move';button.classList.add('dragging');});
 button.addEventListener('dragend',()=>{draggedTab='';button.classList.remove('dragging');});button.addEventListener('dragover',event=>{if(draggedTab)event.preventDefault();});
 button.addEventListener('drop',event=>{event.preventDefault();const id=draggedTab;if(!id)return;const order=[...document.querySelectorAll('nav [data-tab]')].map(b=>b.dataset.tab);saveTabOrder(moveTab(order,id,button.dataset.tab));});
 button.addEventListener('keydown',async event=>{if(!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const order=[...document.querySelectorAll('nav [data-tab]')].map(b=>b.dataset.tab),at=order.indexOf(button.dataset.tab),next=at+(event.key==='ArrowLeft'?-1:1);if(next<0||next>=order.length)return;[order[at],order[next]]=[order[next],order[at]];await saveTabOrder(order);button.focus();});
}

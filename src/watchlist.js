import {routedInstrument,sourceFetch,sourceAdapters} from './data-sources.js';
import {nasdaqQuote,nasdaqHistory,yahooQuote,yahooHistory,coinbaseQuote,coinbaseHistory} from './overseas.js';
import {isCandlePeriod,minuteHistory} from './minute-bars.js';
export const watchExamples=[
 {name:'贵州茅台',type:'股票',provider:'tencent',symbol:'sh600519'},
 {name:'苹果',type:'股票',provider:'tencent',symbol:'usAAPL'},
 {name:'华安黄金ETF',type:'黄金',provider:'tencent',symbol:'sh518880'},
 {name:'招商中证白酒A',type:'基金',provider:'fund',symbol:'161725'},
 {name:'纽约黄金',type:'黄金',provider:'future',symbol:'GC'},
 {name:'沪金主连',type:'期货',provider:'cnfuture',symbol:'au0'},
 {name:'比特币 / USDT',type:'加密货币',provider:'crypto',symbol:'BTCUSDT'},
 {name:'现货黄金（伦敦金）',type:'黄金',provider:'future',symbol:'XAU'}
];
export function watchKey(i){return `${i.provider}:${i.symbol}:${i.url||''}`;}
export function validateWatchlist(list){
 if(!Array.isArray(list)||list.length>30)throw Error('最多监控 30 个项目');const seen=new Set();
 for(const i of list){
  if(typeof i.name!=='string'||!i.name.trim()||i.name.length>60||!['股票','基金','黄金','期货','加密货币','指数','其他'].includes(i.type))throw Error('请填写监控名称和品种');
  const patterns={tencent:/^(sh\d{6}|sz\d{6}|hk[A-Za-z0-9]{2,12}|us\.?[A-Za-z0-9.]{1,15})$/,fund:/^\d{6}$/,future:/^[A-Z]{1,8}$/,cnfuture:/^[a-zA-Z]{1,5}\d{1,4}$/,crypto:/^[A-Z0-9]{5,24}$/,yahoo:/^[A-Za-z0-9^=._-]{1,32}$/,nasdaq:/^[A-Za-z0-9.-]{1,20}$/,coinbase:/^[A-Z0-9]{2,15}-[A-Z0-9]{2,10}$/,custom:/^[A-Za-z0-9._-]{1,32}$/};
  if(!patterns[i.provider]?.test(i.symbol))throw Error('监控代码格式不正确：'+i.name);
  if(i.dataSource&&!sourceAdapters.some(p=>p.id===i.dataSource))throw Error('未知行情数据源');if(i.sourceSymbol&&!/^[A-Za-z0-9^=._/-]{1,40}$/.test(i.sourceSymbol))throw Error('来源代码格式无效');
  if(i.provider==='custom'){let u;try{u=new URL(i.url);}catch{throw Error('自定义 JSON 地址无效');}if(u.protocol!=='https:'||u.username||u.password)throw Error('自定义数据源必须使用不带账号密码的 HTTPS URL');}
  if(seen.has(watchKey(i)))throw Error('监控项目重复：'+i.name);seen.add(watchKey(i));
 }
 return list;
}
export const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
export function dataJSON(text){
 const value=text.trim().replace(/^\uFEFF/,'');if(value.startsWith('{')||value.startsWith('['))return JSON.parse(value);
 const at=value.indexOf('var _data=');if(at>=0){const body=value.slice(at+'var _data='.length).trim();if(body.startsWith('(')&&body.endsWith(');'))return JSON.parse(body.slice(1,-2));}
 throw Error('数据源未返回可解析的 JSON');
}
async function text(url,fetcher){const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('行情请求失败 (HTTP '+r.status+')');const value=await r.text();if(value.length>5e6)throw Error('行情数据过大');return value;}
function result(i,q){if(!Number.isFinite(q.price)||q.price<=0)throw Error('没有有效价格');const previous=number(q.previousClose);return {...i,...q,change:previous? q.price-previous:number(q.change),percent:previous?(q.price/previous-1)*100:number(q.percent),fetchedAt:new Date().toISOString()};}
function fields(raw,symbol){const line=raw.split('\n').find(l=>l.startsWith('v_'+symbol+'='));if(!line)throw Error('该代码未返回行情');return line.slice(line.indexOf('="')+2,line.lastIndexOf('"'));}
export function parseWatchQuote(i,raw){
 const value=fields(raw,i.provider==='fund'?'jj'+i.symbol:i.provider==='future'?'hf_'+i.symbol:i.symbol);
 if(i.provider==='fund'){const f=value.split('~');const price=number(f[5]),percent=number(f[7]);return result(i,{price,percent,previousClose:price&&percent!==null?price/(1+percent/100):null,quoteTime:f[8],currency:'CNY',basis:'净值日涨跌',source:'腾讯基金净值'});}
 if(i.provider==='future'){const f=value.split(',');return result(i,{price:number(f[0]),previousClose:number(f[7]),open:number(f[8]),high:number(f[4]),low:number(f[5]),quoteTime:f[12]+' '+f[6],currency:({GC:'USD/盎司',XAU:'USD/盎司',SI:'USD/盎司',XAG:'USD/盎司',CL:'USD/桶'})[i.symbol]||'币种/单位见合约',basis:'较前收/结算参考价',source:'腾讯贵金属/期货'});}
 const f=value.split('~');return result(i,{price:number(f[3]),previousClose:number(f[4]),open:number(f[5]),high:number(f[33]),low:number(f[34]),quoteTime:f[30],volume:number(f[6]),currency:i.symbol.startsWith('us')?'USD':i.symbol.startsWith('hk')?'HKD':'CNY',basis:'较昨收',source:'腾讯财经'});
}
export function normalizeBars(values,limit=300){
 if(!Array.isArray(values))throw Error('暂无历史数据');
 return values.map(v=>({time:String(v.time??''),open:number(v.open??v.close),high:number(v.high??v.close),low:number(v.low??v.close),close:number(v.close),volume:number(v.volume)>=0?number(v.volume):null,average:number(v.average)})).filter(v=>v.time&&v.close!==null&&v.close>0&&v.open>0&&v.high>=Math.max(v.open,v.close)&&v.low<=Math.min(v.open,v.close)&&v.low>0).sort((a,b)=>a.time.localeCompare(b.time)).filter((v,i,a)=>i===0||v.time!==a[i-1].time).slice(-limit);
}
export function parseFutureHistory(raw,domestic){const data=dataJSON(raw);return normalizeBars(data.map(v=>({time:domestic?v.d:v.date,open:domestic?v.o:v.open,high:domestic?v.h:v.high,low:domestic?v.l:v.low,close:domestic?v.c:v.close,volume:domestic?v.v:v.volume})),20000);}
function futureURL(symbol,domestic,minute){return 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_data=/'+(domestic?(minute?'InnerFuturesNewService.getFewMinLine':'InnerFuturesNewService.getDailyKLine'):(minute?'GlobalFuturesService.getGlobalFuturesMinLine':'GlobalFuturesService.getGlobalFuturesDailyKLine'))+'?symbol='+symbol+(domestic&&minute?'&type=1':'');}
async function nativeWatchQuote(i,fetcher=fetch){
 if(['tencent','fund','future'].includes(i.provider))return parseWatchQuote(i,await text('https://qt.gtimg.cn/q='+(i.provider==='fund'?'jj':i.provider==='future'?'hf_':'')+i.symbol,fetcher));
 if(i.provider==='crypto'){const d=JSON.parse(await text('https://data-api.binance.vision/api/v3/ticker/24hr?symbol='+i.symbol,fetcher));return result(i,{price:number(d.lastPrice),previousClose:number(d.openPrice),open:number(d.openPrice),high:number(d.highPrice),low:number(d.lowPrice),volume:number(d.volume),quoteTime:new Date(d.closeTime).toISOString(),currency:/(USDT|USDC|FDUSD|BTC|ETH|BNB|EUR|TRY)$/.exec(i.symbol)?.[1]||'计价币见交易对',basis:'滚动24小时',source:'Binance 公共行情'});}
 if(i.provider==='cnfuture'){
  const bars=await history(i,'day',fetcher);const last=bars.bars.at(-1),previous=bars.bars.at(-2);if(!last)throw Error('暂无期货日线');
  try{const minute=await history(i,'minute',fetcher);const p=minute.bars.at(-1);if(p&&p.time.slice(0,10)>=last.time)return result(i,{price:p.close,previousClose:last.time===p.time.slice(0,10)?previous?.close:last.close,open:last.open,high:last.high,low:last.low,quoteTime:p.time,currency:'CNY',basis:'较前收（主连）',source:'新浪期货分钟线'});}catch{}
  return result(i,{price:last.close,previousClose:previous?.close,open:last.open,high:last.high,low:last.low,volume:last.volume,quoteTime:last.time,currency:'CNY',basis:'日线收盘，非盘中价',source:'新浪期货日线'});
 }
 const d=JSON.parse(await text(i.url,fetcher));return result(i,{price:number(d.price),previousClose:number(d.previousClose),change:number(d.change),percent:number(d.percent),open:number(d.open),high:number(d.high),low:number(d.low),volume:number(d.volume),quoteTime:String(d.quoteTime||'来源未提供'),currency:String(d.currency||''),basis:String(d.basis||'自定义来源口径'),source:'自定义 JSON'});
}
async function nativeHistory(i,period,fetcher=fetch,maximum=false){
 if(isCandlePeriod(period))return minuteHistory(i,period,fetcher,{text,normalizeBars,dataJSON});
 if(maximum&&period==='day'&&['tencent','crypto'].includes(i.provider))return maximumHistory(i,fetcher);
 if(!['minute','day'].includes(period))throw Error('无效周期');let bars,source;
 if(i.provider==='tencent'){
  const d=JSON.parse(await text(period==='minute'?'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code='+i.symbol:'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+i.symbol+',day,,,640,qfq',fetcher));const data=d.data?.[i.symbol];if(!data)throw Error('来源暂不支持此品种的该周期');
  if(period==='day')bars=normalizeBars((data.qfqday||data.day||[]).map(v=>({time:v[0],open:v[1],close:v[2],high:v[3],low:v[4],volume:v[5]})),640);
  else{let previous=0;bars=normalizeBars((data.data?.data||[]).map((line,at)=>{const [time,price,volume,amount]=line.split(' ');const cumulative=number(volume);const delta=cumulative===null||(at===0&&time!=='0930')?null:Math.max(0,cumulative-previous);previous=cumulative??previous;const avg=i.type!=='指数'&&/^(sh|sz)/.test(i.symbol)&&cumulative>0?number(amount)/(cumulative*100):null;return {average:avg>number(price)*.5&&avg<number(price)*2?avg:null,time:(data.data?.date||(data.qt?.[i.symbol]?.[30]||'').slice(0,10)).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')+' '+time.slice(0,2)+':'+time.slice(2),close:price,volume:delta};}));}
  source=period==='day'?'腾讯日线（前复权，如来源提供）':'腾讯分时（成交量单位按来源）';
 }else if(i.provider==='crypto'){
  const data=JSON.parse(await text('https://data-api.binance.vision/api/v3/klines?symbol='+i.symbol+'&interval='+(period==='day'?'1d':'1m')+'&limit='+(period==='day'?1000:300),fetcher));bars=normalizeBars(data.map(v=>({time:new Date(v[0]).toISOString(),open:v[1],high:v[2],low:v[3],close:v[4],volume:v[5]})),period==='day'?1000:300);source=period==='day'?'Binance 日K · UTC':'Binance 最近300分钟 · UTC';
 }else if(i.provider==='fund'){
  if(period==='minute')throw Error('场外基金仅提供每日净值，不提供真实分时成交数据');
  const raw=await text('https://fund.eastmoney.com/pingzhongdata/'+i.symbol+'.js',fetcher);const match=raw.match(/var\s+Data_netWorthTrend\s*=\s*(\[.*?\]);/s);if(!match)throw Error('暂无基金净值历史');bars=normalizeBars(JSON.parse(match[1]).map(v=>({time:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(v.x)),close:v.y})),20000);source='东方财富基金净值（非交易K线，无成交量）';
 }else if(['future','cnfuture'].includes(i.provider)){
  const domestic=i.provider==='cnfuture',raw=await text(futureURL(i.symbol,domestic,period==='minute'),fetcher);
  if(period==='day')bars=parseFutureHistory(raw,domestic);
  else if(domestic)bars=normalizeBars(dataJSON(raw).map(v=>({time:v.d,open:v.o,high:v.h,low:v.l,close:v.c,volume:v.v})));
  else {const data=dataJSON(raw).minLine_1d||[];bars=normalizeBars(data.map((v,n)=>({time:v[n===0?9:5],close:v[n===0?5:1],average:v[n===0?8:4]})));}
  source='新浪贵金属/期货 · '+(period==='day'?'日线':'分钟线')+'（品种口径由代码确定）';
 }else{
  const d=JSON.parse(await text(i.url,fetcher));bars=normalizeBars(d.bars||d.history?.[period]||[],period==='day'?20000:300);source='自定义 JSON · '+period;
 }
 if(!bars?.length)throw Error('来源未提供该周期的有效历史数据');return {bars,source,period,warning:bars.length>=20000?'已达到20000条历史上限，可能还有更早数据':''};
}
export async function fetchWatchlist(list,fetcher=fetch,value){
 validateWatchlist(list);const out=Array(list.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,list.length)},async()=>{while(next<list.length){const at=next++;try{out[at]=await watchQuote(list[at],fetcher,value);}catch(e){out[at]={...list[at],error:e.message};}}}));return out;
}

// Fetch backwards from the newest bar; stop when a source cannot advance its cursor.
// A limit or a failed older page is surfaced as a warning instead of claiming all-time coverage.
async function maximumHistory(item,fetcher){
 let accumulated=[],cursor='',warning='',exhausted=false;
 const crypto=item.provider==='crypto';const size=crypto?1000:640;
 for(let page=0;page<40;page++){
  let raw;
  try{
   const url=crypto?'https://data-api.binance.vision/api/v3/klines?symbol='+item.symbol+'&interval=1d&limit=1000'+(cursor?'&endTime='+cursor:''):'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param='+item.symbol+',day,,'+cursor+',640,qfq';
   const d=JSON.parse(await text(url,fetcher));raw=crypto?d:(d.data?.[item.symbol]?.qfqday||d.data?.[item.symbol]?.day||[]);
   if(!Array.isArray(raw))throw Error('历史分页格式错误');
  }catch(e){if(!accumulated.length)throw e;warning='更早历史未能加载：'+e.message;break;}
  const mapped=normalizeBars(raw.map(v=>crypto?{time:new Date(v[0]).toISOString(),open:v[1],high:v[2],low:v[3],close:v[4],volume:v[5]}:{time:v[0],open:v[1],close:v[2],high:v[3],low:v[4],volume:v[5]}),size);
  if(!mapped.length){exhausted=true;break;}
  const earliest=mapped[0].time;
  if(accumulated.length&&earliest>=accumulated[0].time){warning='来源不再返回更早历史，当前为可获取的最长范围';break;}
  accumulated=normalizeBars([...mapped,...accumulated],20000);
  if(accumulated.length>=20000){warning='已达到20000条历史上限，可能还有更早数据';break;}
  if(raw.length<size){exhausted=true;break;}
  const before=Date.parse(earliest)-(crypto?1:86400000);if(!Number.isFinite(before))throw Error('历史分页时间无效');
  cursor=crypto?String(before):new Date(before).toISOString().slice(0,10);
 }
 if(!accumulated.length)throw Error('来源未提供有效日线历史');
 if(!exhausted&&!warning)warning='历史分页达到请求上限，可能还有更早数据';
 return {bars:accumulated,period:'day',source:crypto?'Binance 最长可获取日K · UTC':'腾讯最长可获取日线（前复权，如来源提供）',warning};
}

export async function watchQuote(original,fetcher=fetch,value){
 const {item,adapter,config}=routedInstrument(original,value);const read=sourceFetch(fetcher,config);let quote;
 if(adapter==='nasdaq')quote=await nasdaqQuote(item,read);else if(adapter==='yahoo')quote=await yahooQuote(item,read);else if(adapter==='coinbase')quote=await coinbaseQuote(item,read);else quote=await nativeWatchQuote(item,read);
 return {...original,...quote,provider:original.provider,symbol:original.symbol,url:original.url,name:original.name,type:original.type,resolvedSymbol:item.symbol,dataSourceUsed:adapter};
}
export async function history(original,period,fetcher=fetch,maximum=false,value){
 const {item,adapter,config}=routedInstrument(original,value,period);const read=sourceFetch(fetcher,config);let data;
 if(adapter==='nasdaq')data=await nasdaqHistory(item,period,maximum,read);else if(adapter==='yahoo')data=await yahooHistory(item,period,maximum,read);else if(adapter==='coinbase')data=await coinbaseHistory(item,period,maximum,read);else data=await nativeHistory(item,period,read,maximum);
 return {...data,resolvedSymbol:item.symbol,dataSourceUsed:adapter};
}

export function moveWatch(list,key,direction){
 if(![-1,1].includes(direction))throw Error('无效排序方向');
 const at=list.findIndex(item=>watchKey(item)===key);if(at<0)throw Error('项目已不存在，请刷新配置');
 const next=[...list],target=at+direction;if(target<0||target>=next.length)return next;
 [next[at],next[target]]=[next[target],next[at]];return next;
}

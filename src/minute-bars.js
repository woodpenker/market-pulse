import {routedInstrument} from './data-sources.js';
export const isCandlePeriod=period=>['1m','5m','15m','30m','60m'].includes(period);
export function supportsMinuteCandles(item,sources,period='1m'){if(item.isNAV||item.nasdaqAssetClass==='mutualfunds')return false;let chosen;try{chosen=routedInstrument(item,sources,period);}catch{return false;}const provider=chosen.adapter;if(provider==='yahoo')return true;if(provider==='coinbase')return ['1m','5m','15m','60m'].includes(period);return provider==='crypto'||provider==='cnfuture'||provider==='custom'||(provider==='tencent'&&/^(sh|sz)\d{6}$/.test(chosen.item.symbol));}
export async function minuteHistory(item,period,fetcher,{text,normalizeBars,dataJSON}){
 if(!isCandlePeriod(period))throw Error('无效图表周期');
 if(!supportsMinuteCandles(item))throw Error('此数据源不提供该品种的分钟K线，请使用分时或日线');
 const strictBars=(values,limit)=>normalizeBars(values.filter(v=>[v.open,v.high,v.low,v.close].every(value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)))),limit);
 const minutes=Number(period.slice(0,-1));let bars,source;
 if(item.provider==='tencent'){
  const d=JSON.parse(await text('https://ifzq.gtimg.cn/appstock/app/kline/mkline?param='+item.symbol+',m'+minutes+',,320',fetcher));
  const rows=d.data?.[item.symbol]?.['m'+minutes];if(!Array.isArray(rows))throw Error('来源未提供该周期的有效历史数据');
  bars=strictBars(rows.map(v=>({time:String(v[0]).replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/,'$1-$2-$3 $4:$5'),open:v[1],close:v[2],high:v[3],low:v[4],volume:v[5]})),320);source='腾讯分钟K线（交易所当地时间）';
 }else if(item.provider==='crypto'){
  const interval=minutes===60?'1h':period;const d=JSON.parse(await text('https://data-api.binance.vision/api/v3/klines?symbol='+item.symbol+'&interval='+interval+'&limit=1000',fetcher));
  if(!Array.isArray(d))throw Error('来源未提供该周期的有效历史数据');bars=strictBars(d.map(v=>({time:new Date(v[0]).toISOString(),open:v[1],high:v[2],low:v[3],close:v[4],volume:v[5]})),1000);source='Binance 分钟K线 · UTC';
 }else if(item.provider==='cnfuture'){
  const d=dataJSON(await text('https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_data=/InnerFuturesNewService.getFewMinLine?symbol='+item.symbol+'&type='+minutes,fetcher));if(!Array.isArray(d))throw Error('来源未提供该周期的有效历史数据');bars=strictBars(d.map(v=>({time:v.d,open:v.o,high:v.h,low:v.l,close:v.c,volume:v.v})),2000);source='新浪期货分钟K线（交易所当地时间）';
 }else{const d=JSON.parse(await text(item.url,fetcher));bars=strictBars(d.history?.[period]||[],2000);source='自定义分钟K线';}
 if(!bars.length)throw Error('来源未提供该周期的有效历史数据');return {bars,period,intervalMinutes:minutes,source};
}

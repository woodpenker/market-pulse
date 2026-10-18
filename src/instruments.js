import {dataSources,sourceFetch,routedInstrument} from './data-sources.js';
import {nasdaqInfo,yahooQuote} from './overseas.js';
import {watchKey,validateWatchlist,dataJSON} from './watchlist.js';
const futureNames={GC:'纽约黄金',SI:'纽约白银',CL:'纽约原油',XAU:'现货黄金',XAG:'现货白银',HG:'纽约铜',NG:'天然气'};
const domesticNames={au:'沪金',ag:'沪银',cu:'沪铜',al:'沪铝',rb:'螺纹钢',i:'铁矿石',sc:'原油',m:'豆粕',ma:'甲醇',ta:'PTA',if:'沪深300股指',ic:'中证500股指',im:'中证1000股指',ih:'上证50股指'};
async function read(url,fetcher,gb=false){const r=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error('代码查询失败 (HTTP '+r.status+')');const bytes=await r.arrayBuffer();if(bytes.byteLength>5e6)throw Error('代码查询响应过大');return new TextDecoder(gb?'gb18030':'utf-8').decode(bytes);}
function quoteFields(raw,symbol){const line=raw.split('\n').find(l=>l.startsWith('v_'+symbol+'='));return line?.slice(line.indexOf('="')+2,line.lastIndexOf('"'));}
function stockType(symbol,name){if(/指数|综指|成指|沪深300|上证|中证|创业板指|纳斯达克|标普|道琼斯|恒生/.test(name)||/^us\.(IXIC|NDX|DJI|INX|SPX)$/i.test(symbol)||/^sh000|^sz399|^hk(HSI|HSCEI)/i.test(symbol))return '指数';if(/黄金|白银/.test(name))return '黄金';if(/ETF|LOF|基金/i.test(name)||/^(sh5|sz1[568])/.test(symbol))return '基金';return '股票';}
export async function resolveInstrument(input,fetcher=fetch,value){
 const config=dataSources(value);fetcher=sourceFetch(fetcher,config);
 const code=String(input||'').trim();if(!/^[A-Za-z0-9^=._/-]{1,32}$/.test(code))throw Error('请输入有效证券代码，例如600519、AAPL、161725、au0、BTCUSDT');
 const upper=code.toUpperCase();let candidates=[];
 if(/^[A-Z0-9]+-(USD|EUR|USDT|USDC)$/.test(upper)){try{const p=JSON.parse(await read('https://api.exchange.coinbase.com/products/'+encodeURIComponent(upper),fetcher));if(p.id&&p.base_currency)return [{name:p.display_name||p.id,type:'加密货币',provider:'coinbase',symbol:p.id,dataSource:'coinbase'}];}catch{}}
 if(code.includes('=')||code.startsWith('^')||/\.(HK|L|DE|PA|AS|TO|AX)$/i.test(code)){const i={symbol:upper,provider:'yahoo',type:code.includes('=')?'期货':code.startsWith('^')?'指数':'股票',dataSource:'yahoo'};const q=await yahooQuote(i,fetcher);return [{...i,name:q.displayName||upper,type:q.isNAV?'基金':i.type,isNAV:q.isNAV}];}

 const crypto=upper.replace(/[/-]/g,'');
 if(/(?:USDT|USDC|FDUSD|BTC|ETH|BNB|EUR|TRY)$/.test(crypto)&&crypto.length>=5){if(config.routes.crypto==='coinbase'){const i={provider:'crypto',symbol:crypto,type:'加密货币'};const selected=routedInstrument(i,config).item;const product=JSON.parse(await read('https://api.exchange.coinbase.com/products/'+encodeURIComponent(selected.symbol),fetcher));if(!product.id)throw Error('未找到该加密货币交易对');return [{name:product.display_name||product.id,type:'加密货币',provider:'crypto',symbol:crypto}];}const d=JSON.parse(await read('https://data-api.binance.vision/api/v3/exchangeInfo?symbol='+crypto,fetcher));const m=d.symbols?.find(s=>s.symbol===crypto);if(!m)throw Error('未找到该加密货币交易对');return [{name:`${m.baseAsset} / ${m.quoteAsset}`,type:'加密货币',provider:'crypto',symbol:m.symbol}];}
 if(futureNames[upper]){const raw=await read('https://qt.gtimg.cn/q=hf_'+upper,fetcher,true);const f=quoteFields(raw,'hf_'+upper)?.split(',');if(!f||!Number.isFinite(Number(f[0]))||Number(f[0])<=0)throw Error('未找到该国际期货或贵金属代码');return [{name:f.at(-1)?.trim()||futureNames[upper],type:['GC','SI','XAU','XAG'].includes(upper)?'黄金':'期货',provider:'future',symbol:upper}];}

 if(/^(?:us)?[A-Za-z][A-Za-z0-9.-]{0,18}$/.test(code)&&!/^us\./i.test(code)&&!/[0-9]$/.test(code)){
  const symbol=code.replace(/^us(?=[A-Z])/,'').toUpperCase();
  if(config.routes.us==='nasdaq'){try{const info=await nasdaqInfo({symbol,type:'股票'},fetcher);return [{name:info.companyName,type:info.nasdaqAssetClass==='stocks'?'股票':'基金',provider:'nasdaq',symbol,nasdaqAssetClass:info.nasdaqAssetClass,isNAV:info.nasdaqAssetClass==='mutualfunds'}];}catch{}}
  else if(config.routes.us==='yahoo'){const quote=await yahooQuote({symbol,provider:'yahoo'},fetcher);return [{name:quote.displayName||symbol,type:quote.isNAV||quote.instrumentType==='ETF'?'基金':'股票',provider:'yahoo',symbol,isNAV:quote.isNAV}];}
 }
 const cn=/^([a-z]{1,5})(\d{1,4})$/i.exec(code);
 if(cn&&!/^(sh|sz|hk|us)$/i.test(cn[1])){const symbol=cn[1].toLowerCase()+cn[2];const raw=await read('https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_data=/InnerFuturesNewService.getDailyKLine?symbol='+symbol,fetcher);const d=dataJSON(raw);if(!Array.isArray(d)||!d.length)throw Error('未找到该国内期货代码');return [{name:(domesticNames[cn[1].toLowerCase()]||cn[1].toUpperCase())+(cn[2]==='0'?'主连':cn[2]),type:'期货',provider:'cnfuture',symbol}];}
 let explicit=/^(sh\d{6}|sz\d{6}|hk[A-Za-z0-9]{2,12}|us\.?[A-Za-z0-9.]{1,15})$/i.test(code)?code.slice(0,2).toLowerCase()+code.slice(2):null;
 if(explicit?.startsWith('us'))explicit='us'+explicit.slice(2).toUpperCase();
 // Search is restricted to exact code matches, so an unknown code never becomes a different security.
 if(explicit)candidates.push({symbol:explicit,provider:'tencent'});
 else{
  try{const raw=await read('https://smartbox.gtimg.cn/s3/?q='+encodeURIComponent(code)+'&t=all',fetcher,true);const match=raw.match(/v_hint\s*=\s*("(?:[^"\\]|\\.)*")/);const hint=match?JSON.parse(match[1]):'';
   for(const row of hint.split('^')){const [market,symbol,name]=row.split('~');if(symbol?.toUpperCase()===upper&&['sh','sz','hk','us'].includes(market))candidates.push({name,symbol:market+symbol,provider:'tencent'});}
  }catch{/* A quote probe below still resolves standard exchange prefixes. */}
  if(!candidates.length){if(/^\d{6}$/.test(code)&&/^[03659]/.test(code))candidates.push({symbol:(/^[569]/.test(code)?'sh':'sz')+code,provider:'tencent'});else if(/^\d{5}$/.test(code))candidates.push({symbol:'hk'+code,provider:'tencent'});else if(/^[A-Z.]{1,15}$/.test(upper))candidates.push({symbol:'us'+upper,provider:'tencent'});}
 }
 if(/^\d{6}$/.test(code))candidates.push({symbol:code,provider:'fund'});
 if(!candidates.length)throw Error('未识别该代码，请使用交易所前缀或完整交易对代码');
 const keys=candidates.map(c=>c.provider==='fund'?'jj'+c.symbol:c.symbol);const raw=await read('https://qt.gtimg.cn/q='+keys.join(','),fetcher,true);const found=[];
 for(const c of candidates){const f=quoteFields(raw,c.provider==='fund'?'jj'+c.symbol:c.symbol)?.split('~');const name=f?.[1]?.trim();if(!name||f.length<6)continue;const item={name,symbol:c.symbol,provider:c.provider,type:c.provider==='fund'?'基金':stockType(c.symbol,name)};try{validateWatchlist([item]);if(!found.some(i=>watchKey(i)===watchKey(item)))found.push(item);}catch{}}
 if(!found.length)throw Error('没有查到该代码的名称和品种，请检查代码或稍后重试');return found;
}

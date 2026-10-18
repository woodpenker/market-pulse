import {validateWatchlist,fetchWatchlist,watchKey} from './watchlist.js';
export const indexPresets = [
 {name:'上证指数',symbol:'sh000001'}, {name:'沪深300',symbol:'sh000300'},
 {name:'纳斯达克综合',symbol:'us.IXIC'}, {name:'纳斯达克100',symbol:'us.NDX'},
 {name:'深证成指',symbol:'sz399001'}, {name:'创业板指',symbol:'sz399006'},
 {name:'恒生指数',symbol:'hkHSI'}, {name:'标普500',symbol:'us.INX'}, {name:'道琼斯',symbol:'us.DJI'}
];
export const marketPresets=[...indexPresets,
 {name:'沪金主连',symbol:'au0',provider:'cnfuture',type:'黄金'},
 {name:'纽约黄金期货',symbol:'GC',provider:'future',type:'黄金'},
 {name:'现货黄金（伦敦金）',symbol:'XAU',provider:'future',type:'黄金'},
 {name:'WTI原油期货',symbol:'CL',provider:'future',type:'期货'},
 {name:'上海原油主连',symbol:'sc0',provider:'cnfuture',type:'期货'},
 {name:'比特币 / USDT',symbol:'BTCUSDT',provider:'crypto',type:'加密货币'},
 {name:'以太坊 / USDT',symbol:'ETHUSDT',provider:'crypto',type:'加密货币'},
 {name:'黄金ETF华安',symbol:'sh518880',provider:'tencent',type:'黄金'},
 {name:'SPY 标普500 ETF',symbol:'SPY',provider:'nasdaq',type:'基金',nasdaqAssetClass:'etf'},
 {name:'VFIAX 美国共同基金',symbol:'VFIAX',provider:'nasdaq',type:'基金',nasdaqAssetClass:'mutualfunds'}
];
export const defaultBanner=[...indexPresets.slice(0,4),...marketPresets.filter(i=>['au0','GC','CL','BTCUSDT'].includes(i.symbol))];
export function bannerInstrument(item){return {...item,provider:item.provider||'tencent',type:item.type||'指数'};}
export function bannerKey(item){return watchKey(bannerInstrument(item));}
export function validateIndices(indices) {
 if(!Array.isArray(indices)||indices.length>20)throw Error('最多展示20个行情项目');
 validateWatchlist(indices.map(bannerInstrument));
 return indices;
}
export function parseQuotes(text, indices, now = new Date().toISOString()) {
 const records=new Map([...text.matchAll(/v_([\w.]+)="([^"]*)"/g)].map(m=>[m[1],m[2].split('~')]));
 return indices.map(i=>{
  const fields=records.get(i.symbol);
  const price=Number(fields?.[3]),previous=Number(fields?.[4]);
  if(!fields||!fields[3]||!Number.isFinite(price)||price<=0||!Number.isFinite(previous)||previous<=0||!fields[30])return {...i,error:'暂未取得有效报价'};
  return {...i,price,change:price-previous,percent:(price/previous-1)*100,quoteTime:fields[30],fetchedAt:now,source:'腾讯财经'};
 });
}
export async function fetchQuotes(indices,fetcher=fetch,value){validateIndices(indices);return fetchWatchlist(indices.map(bannerInstrument),fetcher,value);}

export function parseBannerLines(text){return text.split('\n').filter(line=>line.trim()).map(line=>{const [name,symbol,provider,type]=line.split('|').map(s=>s.trim());const preset=marketPresets.find(i=>i.symbol===symbol);let adapter=provider||preset?.provider||(/^(sh|sz|hk|us)/.test(symbol||'')?'tencent':/^[A-Z]+USDT$/.test(symbol||'')?'crypto':/^[a-z]+\d+$/.test(symbol||'')?'cnfuture':'nasdaq');return {...preset,name,symbol,provider:adapter,type:type||preset?.type||(adapter==='tencent'?'指数':adapter==='crypto'?'加密货币':adapter==='cnfuture'||adapter==='future'?'期货':'股票')};});}

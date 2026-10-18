import {translate} from './i18n.js';
export function badgeView(quote,language='zh-CN'){
 const tr=(key,values)=>translate(key,values,language);
 if(!quote||quote.error||!Number.isFinite(quote.price))return {text:'!',color:'#697586',title:quote?.error||tr('正在更新关注指数')};
 const text=quote.price>=10000?(quote.price/1000).toFixed(1)+'k':Math.round(quote.price).toString();
 return {text,color:Number.isFinite(quote.percent)?quote.percent>=0?'#b53b49':'#197c60':'#697586',title:`${tr(quote.name)} ${quote.price.toFixed(2)} · ${Number.isFinite(quote.percent)?(quote.percent>=0?'+':'')+quote.percent.toFixed(2)+'%':'—'}\n${tr('报价时间 {time}（供应商时间，可能延迟）',{time:quote.quoteTime})}`};
}
export function badgeMatches(item,value){return item&&!!value&&(value===item.symbol||value===`${item.provider||'tencent'}:${item.symbol}:${item.url||''}`);}
export function validateBadge(s){if(![1,2,5,10,15,30,60].includes(s.badgeRefreshMinutes??1))throw Error('指数更新频率无效');if(s.badgeSymbol&&!s.indices?.some(i=>badgeMatches(i,s.badgeSymbol)))throw Error('按钮关注指数必须在展示指数中');}

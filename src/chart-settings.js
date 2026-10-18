export const commonChartDays=[1,5,7,30,90,180,365,730];
export const defaultChartDays=[1,5,7,90,180];
export function validateChartDays(days){
 if(!Array.isArray(days)||!days.length||days.length>12||days.some(d=>!Number.isInteger(d)||d<1||d>36500)||new Set(days).size!==days.length)throw Error('图表周期需为1–36500天的整数，最多12个且不能重复');
 return days;
}
export function parseChartDays(text){return validateChartDays(text.split(/[,，\s]+/).filter(Boolean).map(Number)).sort((a,b)=>a-b);}
export const minuteIntervals=[1,5,15,30,60];
export const defaultChartIndicators=[{key:'ema9',enabled:true},{key:'ema21',enabled:false},{key:'ma5',enabled:true},{key:'ma10',enabled:false},{key:'ma20',enabled:true},{key:'ma60',enabled:false},{key:'average',enabled:true}];
export function validateChartIndicators(items){
 if(!Array.isArray(items)||items.length>12||new Set(items.map(i=>i?.key)).size!==items.length||items.some(i=>!i||typeof i.enabled!=='boolean'||!(i.key==='average'||/^(ema|ma)([1-9]\d{0,2})$/.test(i.key))))throw Error('指标需为EMA或MA加1–999周期，最多12项且不能重复');
 return items;
}
export function parseIndicatorKeys(text,previous=defaultChartIndicators){
 const keys=text.split(/[,，\s]+/).filter(Boolean).map(k=>k.toLowerCase()==='vwap'?'average':k.toLowerCase());
 return validateChartIndicators(keys.map(key=>({key,enabled:previous.find(i=>i.key===key)?.enabled??true})));
}
export function validateChartIntervals(values){if(!Array.isArray(values)||new Set(values).size!==values.length||values.some(n=>!minuteIntervals.includes(n)))throw Error('分钟周期仅支持1、5、15、30、60');return values;}

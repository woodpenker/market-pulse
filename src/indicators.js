import {isCandlePeriod} from './minute-bars.js';
export const indicators=[
 {key:'ema9',label:'EMA9',length:9,ema:true,color:'var(--chart-ema)'},
 {key:'ma5',label:'MA5',length:5,color:'var(--chart-ma5)'},
 {key:'ma10',label:'MA10',length:10,color:'var(--chart-ma10)'},
 {key:'ma20',label:'MA20',length:20,color:'var(--chart-ma20)'},
 {key:'ma60',label:'MA60',length:60,color:'var(--chart-ma60)'}
];
// Seed EMA with the first complete SMA; never fill missing warm-up observations.
export function movingAverage(bars,length,ema=false){
 if(!Number.isInteger(length)||length<1)throw Error('均线周期必须为正整数');
 let sum=0,previous=null;
 return bars.map((bar,i)=>{sum+=bar.close;if(i>=length)sum-=bars[i-length].close;if(i<length-1)return null;previous=ema&&previous!==null?previous+(bar.close-previous)*2/(length+1):sum/length;return previous;});
}
export function chartView(data,range,enabled,definitions=indicators){
 const bars=data.bars;const minute=range==='minute',intraday=minute||isCandlePeriod(range);
 if(!intraday&&range!=='max'&&(!Number.isInteger(Number(range))||Number(range)<1||Number(range)>36500))throw Error('不支持的图表范围');
 let start=0;
 if(!intraday&&range!=='max'&&bars.length){const end=Date.parse(bars.at(-1).time.slice(0,10)+'T00:00:00Z');const cutoff=end-(Number(range)-1)*86400000;start=bars.findIndex(b=>Date.parse(b.time.slice(0,10)+'T00:00:00Z')>=cutoff);if(start<0)start=bars.length;}
 const overlays=definitions.filter(d=>enabled.includes(d.key)&&(!minute||d.ema)).map(d=>({...d,values:movingAverage(bars,d.length,d.ema).slice(start)}));
 return {...data,bars:bars.slice(start),overlays};
}

export function indicatorDefinitions(config){return config.filter(i=>i.key!=='average').map((item,at)=>{const match=/^(ema|ma)(\d+)$/.exec(item.key);return {key:item.key,label:match[1].toUpperCase()+match[2],length:Number(match[2]),ema:match[1]==='ema',color:['var(--chart-ema)','var(--chart-ma5)','var(--chart-ma10)','var(--chart-ma20)','var(--chart-ma60)','var(--chart-ema)'][at%6]};});}

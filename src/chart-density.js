// Aggregate dense candles for display only; indicator math and hover retain every original bar.
export function chartBuckets(bars,limit=600){
 const step=Math.max(1,Math.ceil(bars.length/limit));const result=[];
 for(let start=0;start<bars.length;start+=step){const group=bars.slice(start,start+step),last=group.at(-1);result.push({at:(start+start+group.length-1)/2,start,end:start+group.length-1,open:group[0].open,close:last.close,high:group.reduce((n,b)=>Math.max(n,b.high),-Infinity),low:group.reduce((n,b)=>Math.min(n,b.low),Infinity),volume:group.some(b=>b.volume!==null)?group.reduce((n,b)=>n+(b.volume||0),0):null});}
 return result;
}

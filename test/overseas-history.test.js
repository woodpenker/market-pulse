import test from 'node:test';
import assert from 'node:assert/strict';
import {history} from '../src/watchlist.js';
test('legacy US stock uses an overseas source for multi-day history instead of the sparse domestic response',async()=>{
 const timestamps=Array.from({length:200},(_,n)=>Date.UTC(2025,0,n+1)/1000);
 const fetcher=async url=>url.includes('api.nasdaq.com')?Response.json({data:{totalRecords:200,tradesTable:{rows:timestamps.map(t=>({date:new Date(t*1000).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}),open:'100',high:'102',low:'99',close:'101',volume:'1000'}))}}}):url.includes('finance.yahoo.com')?Response.json({chart:{result:[{meta:{symbol:'AAPL',currency:'USD',exchangeTimezoneName:'America/New_York'},timestamp:timestamps,indicators:{quote:[{open:timestamps.map(()=>100),high:timestamps.map(()=>102),low:timestamps.map(()=>99),close:timestamps.map(()=>101),volume:timestamps.map(()=>1000)}]}}],error:null}}):Response.json({data:{usAAPL:{day:[['2011-01-01','10','11','12','9','100'],['2026-10-16','100','101','102','99','1000']]}}});
 const result=await history({name:'Apple',provider:'tencent',symbol:'usAAPL',type:'股票'},'day',fetcher,true);
 assert.ok(result.bars.length>=180,`overseas history should span many days, got ${result.bars.length} bars`);assert.match(result.source,/Nasdaq|Yahoo/);
});

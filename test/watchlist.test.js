import test from 'node:test';
import assert from 'node:assert/strict';
import {watchExamples,validateWatchlist,parseWatchQuote,dataJSON,normalizeBars,history,fetchWatchlist} from '../src/watchlist.js';
function fieldQuote(symbol){const f=Array(40).fill('');f[3]='12.46';f[4]='12.29';f[5]='12.35';f[30]='20261016150000';f[33]='12.67';f[34]='12.30';return `v_${symbol}="${f.join('~')}";`;}
test('custom watchlist accepts all supported asset types and rejects unsafe URLs/codes and duplicates',()=>{
 validateWatchlist(watchExamples);assert.throws(()=>validateWatchlist([watchExamples[0],watchExamples[0]]));
 for(const symbol of ['sh600519,usAAPL','<script>','sh600519&code=x'])assert.throws(()=>validateWatchlist([{...watchExamples[0],symbol}]));
 assert.throws(()=>validateWatchlist([{name:'custom',provider:'custom',symbol:'test',type:'其他',url:'javascript:alert(1)'}]));
});
test('quotes distinguish stock daily change, fund NAV change and futures reference changes',()=>{
 const q=parseWatchQuote(watchExamples[0],fieldQuote('sh600519'));assert.equal(q.price,12.46);assert.ok(Math.abs(q.change-.17)<1e-8);assert.equal(q.high,12.67);
 const fund=parseWatchQuote(watchExamples[3],'v_jj161725="161725~name~0~0~~0.5397~2~1.1811~2026-10-16~";');assert.equal(fund.price,.5397);assert.equal(fund.basis,'净值日涨跌');assert.ok(Math.abs(fund.percent-1.1811)<1e-8);
 const future=parseWatchQuote(watchExamples[4],'v_hf_GC="4184.85,0.35,4186.5,4187.1,4220.4,4167.5,04:59:56,4170.1,4192.1,0,1,1,2026-10-17,gold";');assert.equal(future.price,4184.85);assert.equal(future.open,4192.1);assert.equal(future.currency,'USD/盎司');
});
test('JSONP is parsed as data without executing external scripts',()=>{assert.deepEqual(dataJSON('/*script*/\nvar _data=([{"close":1}]);'),[{close:1}]);assert.throws(()=>dataJSON('var _data=(alert(1));'));assert.throws(()=>dataJSON('<html>blocked</html>'));});
test('historical candles have valid OHLC, sorted unique time and bounded length',()=>{const bars=normalizeBars([{time:'2026-10-17',close:'12'},{time:'2026-10-16',close:'11'},{time:'2026-10-17',close:'12'},{time:'bad',open:12,high:10,low:15,close:13}]);assert.equal(bars.length,2);assert.equal(bars[0].close,11);assert.equal(normalizeBars(Array.from({length:400},(_,n)=>({time:String(n).padStart(3,'0'),close:n+1}))).length,300);});
test('intraday uses volume increments and daily maps OHLC fields correctly',async()=>{
 const item=watchExamples[0];const minute=await history(item,'minute',async()=>Response.json({data:{sh600519:{data:{date:'2026-10-16',data:['0930 12.3 100','0931 12.4 150']}}}}));assert.equal(minute.bars[1].volume,50);
 const day=await history(item,'day',async()=>Response.json({data:{sh600519:{qfqday:[['2026-10-16','12','12.5','13','11','200']]}}}));assert.equal(day.bars[0].high,13);assert.equal(day.bars[0].close,12.5);
});
test('funds expose NAV histories in China date and refuse fabricated intraday data',async()=>{
 await assert.rejects(history(watchExamples[3],'minute'),/每日净值/);
 const d=await history(watchExamples[3],'day',async()=>new Response('var Data_netWorthTrend=[{"x":1432656000000,"y":1.23}];'));assert.equal(d.bars[0].time,'2015-05-27');assert.equal(d.bars[0].volume,null);
});
test('crypto quote and history keep 24h basis and UTC candles',async()=>{
 const item=watchExamples[6];const rows=await fetchWatchlist([item],async()=>Response.json({lastPrice:'110',openPrice:'100',highPrice:'120',lowPrice:'90',volume:'10',closeTime:1792252800000}));assert.equal(rows[0].basis,'滚动24小时');assert.equal(rows[0].currency,'USDT');assert.ok(Math.abs(rows[0].percent-10)<1e-8);
 const bars=await history(item,'day',async()=>Response.json([[1792252800000,'100','120','90','110','10']]));assert.equal(bars.bars[0].close,110);assert.match(bars.bars[0].time,/Z$/);
});
test('individual source failure does not discard successful custom quotes',async()=>{
 const items=[watchExamples[0],{name:'custom',type:'其他',provider:'custom',symbol:'X',url:'https://example.com/quote'}];const rows=await fetchWatchlist(items,async url=>url.includes('gtimg')?new Response('',{status:503}):Response.json({price:12,previousClose:10,quoteTime:'2026-10-18'}));assert.ok(rows[0].error);assert.equal(rows[1].price,12);assert.ok(Math.abs(rows[1].percent-20)<1e-8);
});
test('stock volume and turnover produce a valid intraday average without inventing missing averages',async()=>{
 const d=await history(watchExamples[0],'minute',async()=>Response.json({data:{sh600519:{data:{date:'20261016',data:['0930 12.3 100 123000','0931 12.4 150 184500']}}}}));assert.equal(d.bars[0].average,12.3);assert.equal(d.bars[0].time,'2026-10-16 09:30');assert.equal(d.bars[1].average,12.3);
});
test('longest stock history pages backwards beyond the old 300 and 400-day limits',async()=>{
 const day=n=>new Date(Date.UTC(2020,0,n+1)).toISOString().slice(0,10);let calls=0;
 const d=await history(watchExamples[0],'day',async url=>{calls++;const end=new URL(url).searchParams.get('param').split(',')[3];const rows=end?Array.from({length:10},(_,i)=>[day(i),'10','11','12','9','1']):Array.from({length:640},(_,i)=>[day(i+10),'10','11','12','9','1']);return Response.json({data:{sh600519:{day:rows}}});},true);
 assert.equal(calls,2);assert.equal(d.bars.length,650);assert.equal(d.bars[0].time,'2020-01-01');assert.equal(d.warning,'');
});
test('longest crypto history advances endTime and warns on a stuck source cursor',async()=>{
 const rows=Array.from({length:1000},(_,i)=>[Date.UTC(2020,0,i+1),'10','12','9','11','1']);let calls=0;
 const d=await history(watchExamples[6],'day',async url=>{calls++;if(calls===2)assert.ok(new URL(url).searchParams.has('endTime'));return Response.json(rows);},true);
 assert.equal(calls,2);assert.equal(d.bars.length,1000);assert.match(d.warning,/不再返回/);
});

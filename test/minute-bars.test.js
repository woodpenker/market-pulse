import test from 'node:test';
import assert from 'node:assert/strict';
import {history} from '../src/watchlist.js';
import {supportsMinuteCandles} from '../src/minute-bars.js';
test('Tencent minute candles use actual interval endpoint and correct OHLC mapping',async()=>{
 for(const minutes of [1,5,15,30,60]){const d=await history({provider:'tencent',symbol:'sh600519'},minutes+'m',async url=>{assert.ok(url.includes('ifzq.gtimg.cn/appstock/app/kline/mkline'));assert.equal(new URL(url).searchParams.get('param'),`sh600519,m${minutes},,320`);return Response.json({data:{sh600519:{['m'+minutes]:[['202610160935','10','12','13','9','100']]}}});});assert.equal(d.bars[0].time,'2026-10-16 09:35');assert.equal(d.bars[0].close,12);assert.equal(d.bars[0].high,13);assert.equal(d.intervalMinutes,minutes);}
});
test('crypto 60-minute candles use 1h and China futures pass native scale',async()=>{
 const crypto=await history({provider:'crypto',symbol:'BTCUSDT'},'60m',async url=>{assert.equal(new URL(url).searchParams.get('interval'),'1h');return Response.json([[1792252800000,'10','13','9','12','100']]);});assert.match(crypto.bars[0].time,/Z$/);
 const future=await history({provider:'cnfuture',symbol:'au0'},'5m',async url=>{assert.equal(new URL(url).searchParams.get('type'),'5');return new Response('var _data=([{"d":"2026-10-16 09:35:00","o":10,"c":12,"h":13,"l":9,"v":100}]);');});assert.equal(future.bars[0].volume,100);
});
test('unsupported markets and missing custom candle data never fall back to fabricated OHLC',async()=>{
 for(const item of [{provider:'fund',symbol:'161725'},{provider:'future',symbol:'GC'},{provider:'tencent',symbol:'usAAPL'}]){assert.equal(supportsMinuteCandles(item),false);await assert.rejects(history(item,'1m',async()=>{throw Error('must not fetch')}),/不提供/);}
 await assert.rejects(history({provider:'custom',url:'https://example.com'},'5m',async()=>Response.json({history:{minute:[{time:'09:30',close:1}]}})),/未提供/);
 await assert.rejects(history({provider:'custom',url:'https://example.com'},'5m',async()=>Response.json({history:{'5m':[{time:'2026-10-16 09:30',close:1}]}})),/未提供/);
});

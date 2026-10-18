import test from 'node:test';
import assert from 'node:assert/strict';
import {movingAverage,chartView} from '../src/indicators.js';
const bars=Array.from({length:100},(_,i)=>({time:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),close:i+1}));
test('SMA and EMA use complete warmup and SMA seed',()=>{
 assert.deepEqual(movingAverage(bars.slice(0,6),3),[null,null,2,3,4,5]);
 assert.deepEqual(movingAverage([{close:2},{close:4},{close:6},{close:12}],3,true),[null,null,4,8]);
 assert.deepEqual(movingAverage(bars.slice(0,2),9,true),[null,null]);
 assert.throws(()=>movingAverage(bars,0));
});
test('all requested calendar ranges include latest date and preserve pre-window averages',()=>{
 for(const days of [1,5,7,90,180]){const view=chartView({bars},String(days),['ema9','ma60']);assert.equal(view.bars.length,Math.min(days,100));assert.equal(view.overlays[0].values.at(-1),96);assert.equal(view.overlays[1].values.at(-1),70.5);}
 const sparse={bars:[bars[0],bars[4],bars[6]]};assert.equal(chartView(sparse,'5',[]).bars.length,2);
 assert.equal(chartView({bars:[]},'7',[]).bars.length,0);
 assert.throws(()=>chartView({bars},'0',[]));
});
test('minute view exposes EMA but does not mislabel minute averages as daily MAs',()=>{
 const view=chartView({bars},'minute',['ema9','ma5']);assert.equal(view.bars.length,100);assert.deepEqual(view.overlays.map(x=>x.key),['ema9']);
});
test('custom and longest ranges retain all source history and warm-up',()=>{
 assert.equal(chartView({bars},'10',[]).bars.length,10);assert.equal(chartView({bars},'max',['ema9']).bars.length,100);
});

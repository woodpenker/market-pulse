import test from 'node:test';
import assert from 'node:assert/strict';
import {chartCache} from '../src/chart-cache.js';
import {chartBuckets} from '../src/chart-density.js';
test('chart cache bounds actual UTF8 bytes and skips oversized entries',()=>{const entries=[{text:'中'.repeat(1000)},{key:'small'},{key:'later'}];const kept=chartCache(entries,100);assert.equal(kept.length,2);assert.ok(new TextEncoder().encode(JSON.stringify(kept)).length<=100);assert.equal(chartCache(Array.from({length:20},()=>({x:1}))).length,12);});
test('dense candles preserve OHLC extrema, volume, final close and source positions',()=>{
 const input=Array.from({length:1001},(_,i)=>({open:i+1,close:i+2,high:i+5,low:i+.5,volume:2}));const buckets=chartBuckets(input,500);assert.ok(buckets.length<=500);assert.equal(buckets[0].open,1);assert.equal(buckets[0].close,4);assert.equal(buckets[0].high,7);assert.equal(buckets[0].low,.5);assert.equal(buckets[0].volume,6);assert.equal(buckets.at(-1).close,1002);assert.equal(buckets.at(-1).end,1000);
 assert.equal(chartBuckets([{open:1,high:2,low:1,close:2,volume:null}])[0].volume,null);
});

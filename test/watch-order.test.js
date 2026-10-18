import test from 'node:test';import assert from 'node:assert/strict';
import{moveWatch,watchKey}from'../src/watchlist.js';
import{defaults}from'../src/core.js';import{syncSettings,restoreSettings}from'../src/config.js';
const list=[{name:'Apple',provider:'tencent',symbol:'usAAPL',type:'股票'},{name:'BTC',provider:'crypto',symbol:'BTCUSDT',type:'加密货币'}];
test('watchlist order moves adjacent items without mutating assets or losing source overrides',()=>{
 const source=[{...list[0],dataSource:'nasdaq'},list[1]];const next=moveWatch(source,watchKey(source[1]),-1);assert.deepEqual(next,[source[1],source[0]]);assert.deepEqual(source.map(i=>i.symbol),['usAAPL','BTCUSDT']);assert.equal(next[1].dataSource,'nasdaq');assert.deepEqual(moveWatch(next,watchKey(next[0]),1),source);
 assert.deepEqual(moveWatch(source,watchKey(source[0]),-1),source);assert.deepEqual(moveWatch(source,watchKey(source[1]),1),source);assert.throws(()=>moveWatch(source,'deleted',1));assert.throws(()=>moveWatch(source,watchKey(source[0]),0));
});
test('watchlist order survives configuration sync and restore',()=>{
 const next=moveWatch(list,watchKey(list[1]),-1),settings={...defaults,watchlist:next};assert.deepEqual(restoreSettings({version:1,settings:syncSettings(settings)},defaults).watchlist,next);
});

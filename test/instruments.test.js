import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveInstrument} from '../src/instruments.js';
function quote(code,name){const f=Array(35).fill('');f[1]=name;f[3]='10';return `v_${code}="${f.join('~')}";`;}
test('code-only resolution fills name/type and exposes numeric code ambiguity',async()=>{
 const fetcher=async url=>url.includes('smartbox')?new Response('v_hint="sh~000001~Index~s~ZS^sz~000001~Bank~b~GP"'):new Response(quote('sh000001','Index')+'\n'+quote('sz000001','Bank')+'\n'+quote('jj000001','Growth Fund'));
 const found=await resolveInstrument('000001',fetcher);assert.equal(found.length,3);assert.deepEqual(found.map(i=>i.type),['指数','股票','基金']);assert.equal(found[1].name,'Bank');
 const stock=await resolveInstrument('sh600519',async()=>new Response(quote('sh600519','Moutai')));assert.equal(stock[0].name,'Moutai');assert.equal(stock[0].type,'股票');
 const etf=await resolveInstrument('sh518880',async()=>new Response(quote('sh518880','Gold ETF')));assert.equal(etf[0].type,'基金');
});
test('US codes, funds, futures and crypto resolve without executing remote scripts',async()=>{
 const apple=await resolveInstrument('AAPL',async url=>new Response(url.includes('smartbox')?'v_hint="us~aapl.oq~Apple~a~GP"':quote('usAAPL','Apple')));assert.equal(apple[0].symbol,'usAAPL');
 const fund=await resolveInstrument('161725',async url=>new Response(url.includes('smartbox')?'v_hint=""':quote('jj161725','NAV Fund')));assert.equal(fund[0].provider,'fund');
 const crypto=await resolveInstrument('btc/usdt',async()=>Response.json({symbols:[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT'}]}));assert.equal(crypto[0].name,'BTC / USDT');
 const cn=await resolveInstrument('au0',async()=>new Response('var _data=([{"d":"2026-10-16","c":100}]);'));assert.equal(cn[0].type,'期货');
 await assert.rejects(resolveInstrument('bad;&code=x'),/有效证券代码/);await assert.rejects(resolveInstrument('sh999999',async()=>new Response('v_pv_none_match="1";')),/没有查到/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,askAI} from '../src/core.js';
import {syncSettings,restoreSettings} from '../src/config.js';
import {validateIndices,parseQuotes,indexPresets} from '../src/markets.js';
test('sync excludes API credentials and preserves a matching local key',()=>{
 const local={...defaults,apiKey:'secret',access_token:'oauth-secret'};
 const settings=syncSettings(local);assert.ok(!JSON.stringify(settings).includes('secret'));
 assert.equal(restoreSettings({version:1,settings},local).apiKey,'secret');
 assert.equal(restoreSettings({version:1,settings:{...settings,endpoint:'https://other.example'}},local).apiKey,'');
 assert.throws(()=>restoreSettings(undefined,local));
});
test('index selections reject code injection and duplicate symbols',()=>{
 validateIndices(indexPresets);
 for(const symbol of ['sh000001,us.NDX','http://evil','sh000001&q=evil','us.A;alert(1)'])assert.throws(()=>validateIndices([{name:'Bad',symbol}]));
 assert.throws(()=>validateIndices([indexPresets[0],indexPresets[0]]));
});
test('quote parsing handles prices, changes, timestamps and missing symbols',()=>{
 const fields=Array(33).fill('');fields[3]='123.45';fields[4]='120';fields[30]='20261016161500';
 const q=parseQuotes(`v_sh000001="${fields.join('~')}";`,indexPresets.slice(0,2));
 assert.equal(q[0].price,123.45);assert.ok(Math.abs(q[0].percent-2.875)<1e-8);assert.equal(q[0].quoteTime,'20261016161500');assert.ok(q[1].error);
 fields[3]='NaN';assert.ok(parseQuotes(`v_sh000001="${fields.join('~')}";`,indexPresets.slice(0,1))[0].error);
});
test('Plus inference uses browser authorization without local service or API key',async()=>{
 let called=false;const text=await askAI({...defaults,provider:'chatgpt',model:'subscription-model',apiKey:'do-not-send'},[],[{role:'user',content:'Question'}],async()=>{throw Error('Must not contact local service');},{ask:async(model,instructions,messages)=>{called=true;assert.equal(model,'subscription-model');assert.equal(messages[0].content,'Question');assert.ok(!instructions.includes('do-not-send'));return 'Answer';}});assert.equal(text,'Answer');assert.ok(called);
 await assert.rejects(askAI({...defaults,provider:'chatgpt'},[],[]),/登录 ChatGPT/);
});
test('property: sync round trips public preferences and cannot transfer credentials',()=>{
 for(let n=0;n<200;n++){
  const settings={...defaults,time:`${String(n%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,indices:indexPresets.slice(0,n%10),badgeSymbol:n%10?'sh000001':'',apiKey:'secret-'+n,refresh_token:'refresh-'+n};
  const cloud=JSON.parse(JSON.stringify({version:1,settings:syncSettings(settings)}));
  assert.ok(!JSON.stringify(cloud).includes('secret-'));assert.ok(!JSON.stringify(cloud).includes('refresh-'));
  const restored=restoreSettings(cloud,settings);assert.equal(restored.time,settings.time);assert.deepEqual(restored.indices,settings.indices);assert.equal(restored.apiKey,settings.apiKey);
  assert.equal(restoreSettings(cloud,{...settings,endpoint:'https://different.invalid'}).apiKey,'');
 }
});

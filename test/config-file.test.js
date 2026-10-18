import test from 'node:test';import assert from 'node:assert/strict';
import{defaults}from'../src/core.js';import{configurationFile,parseConfiguration,syncSettings}from'../src/config.js';
test('offline configuration preserves all preferences and order, excludes credentials and cached data',()=>{
 const original={...defaults,apiKey:'secret-local',language:'en',watchlist:[{name:'BTC',symbol:'BTCUSDT',provider:'crypto',type:'加密货币'}],chatgptTokens:{access_token:'private-token'},chat:[{content:'private-chat'}],news:['private-news']};
 const file=configurationFile(original,'2026-10-18T00:00:00Z'),text=JSON.stringify(file);for(const secret of ['secret-local','private-token','private-chat','private-news'])assert.ok(!text.includes(secret));
 const restored=parseConfiguration(text,{...defaults,apiKey:'this-device-key'});assert.equal(restored.apiKey,'this-device-key');assert.deepEqual(syncSettings(restored),syncSettings(original));
 assert.equal(parseConfiguration(JSON.stringify({...file,settings:{...file.settings,apiKey:'injected',endpoint:'https://example.com/v1'}}),{...defaults,apiKey:'local-key'}).apiKey,'');
});
test('offline import rejects malformed, oversized, foreign, unsupported and invalid settings',()=>{
 const file=configurationFile(defaults);assert.throws(()=>parseConfiguration('{bad',defaults),/JSON/);assert.throws(()=>parseConfiguration('a'.repeat(1048577),defaults),/1MB/);assert.throws(()=>parseConfiguration(JSON.stringify({...file,app:'another-app'}),defaults));assert.throws(()=>parseConfiguration(JSON.stringify({...file,version:99}),defaults));assert.throws(()=>parseConfiguration(JSON.stringify({...file,settings:{...file.settings,watchlist:[{name:'bad'}]}}),defaults));
 assert.equal(parseConfiguration(JSON.stringify({version:1,settings:syncSettings(defaults)}),defaults).time,defaults.time);
});

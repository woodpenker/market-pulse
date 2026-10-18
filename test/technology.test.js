import test from 'node:test';
import assert from 'node:assert/strict';
import {collectFeeds} from '../src/feeds.js';
import {classifyTech,techFeeds} from '../src/technology.js';
import {defaults,validate} from '../src/core.js';
import {syncSettings,restoreSettings} from '../src/config.js';
import {parseChartDays} from '../src/chart-settings.js';
test('custom chart days and technology sources validate and survive sync',()=>{
 const s={...defaults,chartDays:parseChartDays('2, 10，365 1095'),techFeeds:[{name:'Custom',url:'https://custom.example/rss'}]};validate(s);
 const restored=restoreSettings({version:1,settings:syncSettings(s)},s);assert.deepEqual(restored.chartDays,[2,10,365,1095]);assert.deepEqual(restored.techFeeds,s.techFeeds);
 for(const text of ['', '1,1','0','-5','NaN','1.5','36501'])assert.throws(()=>parseChartDays(text));
 assert.throws(()=>validate({...s,techFeeds:[{name:'evil',url:'javascript:alert(1)'}]}));assert.throws(()=>validate({...s,techFeeds:[...s.techFeeds,...s.techFeeds]}));validate({...s,techFeeds:[]});assert.ok(techFeeds.length>=4);
});
test('technology classification supports multiple labels and a general fallback',()=>{
 assert.deepEqual(classifyTech({title:'Google AI software developer API',source:'Google'}),['AI','软件开发','大厂动态']);assert.deepEqual(classifyTech({title:'New CPU architecture',source:'Test'}),['计算机行业']);
});
test('RSS collector isolates network/format errors and passes actual XML to parser',async()=>{
 const sources=[{name:'ok',url:'https://a.test'},{name:'bad',url:'https://b.test'},{name:'html',url:'https://c.test'}];
 const results=await collectFeeds(sources,async(xml,source)=>xml==='html'?{error:'not RSS'}:{items:[{title:source}]},async url=>url.includes('b.test')?new Response('',{status:503}):new Response(url.includes('c.test')?'html':'<rss/>'));
 assert.equal(results[0].items[0].title,'ok');assert.match(results[1].error,/503/);assert.equal(results[2].error,'not RSS');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,nextRun,validate,mergeItems,askAI} from '../src/core.js';
test('daily schedule advances past an elapsed local time',()=>{const now=new Date(2026,9,17,9);const next=new Date(nextRun('08:00',now));assert.equal(next.getDate(),18);assert.equal(next.getHours(),8);assert.throws(()=>nextRun('25:00'));});
test('invalid feeds and insecure API endpoints are rejected',()=>{assert.equal(validate(defaults),defaults);assert.throws(()=>validate({...defaults,endpoint:'http://example.com'}));assert.throws(()=>validate({...defaults,feeds:[]}));});
test('merge preserves cache, removes duplicate URLs and unsafe or expired entries',()=>{const now=Date.now();const item={title:'Market',url:'https://example.com/a',date:new Date(now).toISOString()};const result=mergeItems([item,{...item,url:'https://example.com/old',date:'2000-01-01'}],[{...item,url:item.url+'#section'},{...item,url:'javascript:alert(1)'}],now);assert.equal(result.length,1);assert.equal(result[0].url,item.url);});
test('OpenAI compatible request carries selected model, source context and credentials',async()=>{const s={...defaults,apiKey:'test-key',model:'chosen-model'};const result=await askAI(s,[{title:'Event',date:'2026-10-17',source:'BBC',url:'https://example.com'}],[{role:'user',content:'影响？'}],async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(init.headers.Authorization,'Bearer test-key');const b=JSON.parse(init.body);assert.equal(b.model,'chosen-model');assert.match(b.messages[0].content,/https:\/\/example.com/);assert.equal(b.messages[1].content,'影响？');return {ok:true,json:async()=>({choices:[{message:{content:'Answer'}}]})};});assert.equal(result,'Answer');});
test('DeepSeek endpoint and actionable error handling',async()=>{const s={...defaults,endpoint:'https://api.deepseek.com/',apiKey:'test',model:'selected'};await assert.rejects(askAI(s,[],[],async(url)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');return {ok:false,status:401};}),/401/);await assert.rejects(askAI(defaults,[],[]),/API Key/);await assert.rejects(askAI(s,[],[],async()=>({ok:true,json:async()=>({})})),/格式/);});

import {needsCatchUp,buildDigest} from '../src/core.js';
test('startup catches a missed daily time even with a recent previous run',()=>{
 const now=new Date(2026,9,17,10);
 assert.equal(needsCatchUp('08:00',{success:true,attempt:new Date(2026,9,16,20).toISOString()},now),true);
 assert.equal(needsCatchUp('08:00',{success:true,attempt:new Date(2026,9,17,8,5).toISOString()},now),false);
 assert.equal(needsCatchUp('08:00',undefined,now),true);
 assert.equal(needsCatchUp('08:00',{success:false,lastSuccess:new Date(2026,9,17,8,5).toISOString()},now),false);
});
test('automatic local digest distinguishes recent news, stale cache and failed sources',()=>{
 const now=Date.parse('2026-10-17T10:00:00Z');
 const item={title:'Central bank decision',date:'2026-10-17T08:00:00Z',source:'Bank',url:'https://example.com',description:'Details'};
 const d=buildDigest([item],{sources:[{name:'Failed feed',error:'offline'}]},now);
 assert.match(d.text,/过去 24 小时收录 1 条/);assert.match(d.text,/Failed feed/);assert.match(d.text,/https:\/\/example.com/);
 assert.match(buildDigest([{...item,date:'2026-10-15T00:00:00Z'}],{},now).text,/暂无新条目/);
});

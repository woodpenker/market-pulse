import test from 'node:test';
import assert from 'node:assert/strict';
import {providers,buildAIRequest,parseAIResponse} from '../src/ai-providers.js';
import {defaults,askAI,validate} from '../src/core.js';
const messages=[{role:'user',content:'Question'},{role:'assistant',content:'Earlier answer'},{role:'user',content:'Follow up'}];
function settings(id){return {...defaults,provider:id,endpoint:providers.find(p=>p.id===id).endpoint,apiKey:'local-key',model:'selected-model'};}
test('all added compatible providers use correct endpoint, model, system context and key',async()=>{
 for(const id of ['glm','hunyuan','qwen','doubao','moonshot']){const s=settings(id);validate(s);const text=await askAI(s,[],messages,async(url,init)=>{assert.equal(url,s.endpoint+'/chat/completions');assert.equal(init.headers.Authorization,'Bearer local-key');assert.equal(init.redirect,'error');const data=JSON.parse(init.body);assert.equal(data.model,'selected-model');assert.match(data.messages[0].content,/不可信/);assert.equal(data.messages.at(-1).content,'Follow up');return Response.json({choices:[{message:{content:id+' answer'},finish_reason:'stop'}]});});assert.equal(text,id+' answer');}
});
test('Claude uses native Messages API and parses only text content',async()=>{
 const text=await askAI(settings('anthropic'),[],messages,async(url,init)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init.headers['x-api-key'],'local-key');assert.equal(init.headers['anthropic-version'],'2023-06-01');assert.equal(init.headers['anthropic-dangerous-direct-browser-access'],'true');assert.equal(init.headers.Authorization,undefined);const data=JSON.parse(init.body);assert.ok(data.system);assert.equal(data.max_tokens,4096);assert.equal(data.messages.length,3);return Response.json({content:[{type:'thinking',thinking:'private'},{type:'text',text:'Claude answer'}],stop_reason:'end_turn'});});assert.equal(text,'Claude answer');
});
test('Gemini uses header credentials, native roles, system instruction and excludes thoughts',async()=>{
 const text=await askAI({...settings('gemini'),model:'models/gemini-test'},[],messages,async(url,init)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');assert.ok(!url.includes('local-key'));assert.equal(init.headers['x-goog-api-key'],'local-key');const data=JSON.parse(init.body);assert.ok(data.systemInstruction.parts[0].text);assert.equal(data.contents[1].role,'model');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private'},{text:'Gemini answer'}]}}]});});assert.equal(text,'Gemini answer');
});
test('truncation, blocked responses, invalid shapes and credential-bearing base URLs fail clearly',()=>{
 assert.throws(()=>parseAIResponse('anthropic',{stop_reason:'max_tokens'}),/长度/);assert.throws(()=>parseAIResponse('gemini',{promptFeedback:{blockReason:'SAFETY'}}),/可用/);assert.throws(()=>parseAIResponse('openai',{choices:[{finish_reason:'length'}]}),/长度/);for(const format of ['anthropic','gemini','openai'])assert.throws(()=>parseAIResponse(format,{}),/格式/);
 assert.throws(()=>buildAIRequest({...settings('gemini'),model:'../evil'},'',messages),/模型ID/);assert.throws(()=>buildAIRequest({...settings('glm'),endpoint:'https://user:pass@example.com/v1'},'',messages),/HTTPS/);assert.throws(()=>buildAIRequest({...settings('glm'),apiKey:''},'',messages),/API Key/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createChatGPT} from '../src/chatgpt-auth.js';
function storage(){const data={};return {data,async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));},async remove(key){delete data[key];}};}
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
function jwt(claims){const a=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');const b=Buffer.from(JSON.stringify(claims)).toString('base64url');return a+'.'+b+'.'+sign('RSA-SHA256',Buffer.from(a+'.'+b),privateKey).toString('base64url');}
function harness(){
 const local=storage(),session=storage();const requests=[];let pending;
 const fetcher=async(url,options={})=>{
  requests.push({url,options});assert.ok(!url.startsWith('http://127.0.0.1'),'no local service requests');
  if(url.endsWith('/jwks.json'))return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'test'}]});
  if(url.endsWith('/oauth/token')){const body=new URLSearchParams(options.body);if(body.get('grant_type')==='authorization_code'){
   assert.equal(body.get('client_id'),'issued-client');assert.equal(body.get('redirect_uri'),pending.redirect);assert.equal(body.get('code_verifier'),pending.verifier);
  }
  return Response.json({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:'resource.invoke chatgpt.tokens.use.direct',id_token:jwt({iss:'https://auth.openai.com',sub:'user',aud:'issued-client',nonce:pending.nonce,exp:Math.floor(Date.now()/1000)+3600,email:'user@test.invalid'})});}
  if(url.endsWith('/models'))return Response.json({models:[{visibility:'list',slug:'chosen',display_name:'Chosen model'}]});
  if(url.endsWith('/responses'))return new Response('data: {"type":"response.output_text.delta","delta":"Answer"}\n\ndata: {"type":"response.completed"}\n\n');
  throw Error('Unexpected request '+url);
 };
 const auth=createChatGPT({local,session,fetcher});
 return {local,session,requests,auth,async login(){const {url}=await auth.begin();pending=session.data.chatgptPending;await auth.bindTab(42);return new URL(url);},callback(state=pending.state){return 'http://127.0.0.1:1455/auth/callback?'+new URLSearchParams({state,code:'test-code',client_id:'issued-client'});}};
}
test('Chrome-only auth completes callback and inference without Node service or API key',async()=>{
 const h=harness();const url=await h.login();assert.equal(url.origin,'https://auth.openai.com');
 assert.equal((await h.auth.status()).connected,false);
 await h.auth.complete(h.callback(),42);
 assert.equal((await h.auth.status()).connected,true);assert.equal((await h.auth.status()).email,'user@test.invalid');
 assert.ok(!JSON.stringify(await h.auth.status()).includes('access_token'));
 assert.deepEqual((await h.auth.models()).models,[{id:'chosen',name:'Chosen model'}]);
 assert.equal(await h.auth.ask('chosen','Research',[{role:'user',content:'Question'}]),'Answer');
 assert.ok(!h.session.data.chatgptPending);await h.auth.logout();assert.equal((await h.auth.status()).connected,false);
});
test('callback is bound to tab, exact redirect, state, expiry and single-use attempt',async()=>{
 const h=harness();await h.login();
 await assert.rejects(h.auth.complete(h.callback(),99),/窗口/);
 await assert.rejects(h.auth.complete(h.callback('wrong'),42),/state/);
 await assert.rejects(h.auth.complete(h.callback().replace('127.0.0.1','localhost'),42),/回调/);
 await h.auth.complete(h.callback(),42);await assert.rejects(h.auth.complete(h.callback(),42),/过期|结束/);
});
test('pending browser authorization survives service worker recreation',async()=>{
 const h=harness();await h.login();const recreated=createChatGPT({local:h.local,session:h.session,fetcher:async()=>{throw Error('unused');}});
 assert.equal((await recreated.status()).pending,true);
 await recreated.cancel(42);assert.equal((await recreated.status()).pending,false);
});
test('expired browser credentials refresh once for concurrent requests',async()=>{
 const h=harness();await h.login();await h.auth.complete(h.callback(),42);const c=h.local.data.chatgptCredentials;await h.local.set({chatgptCredentials:{...c,expires_at:0}});
 const results=await Promise.all(Array.from({length:12},()=>h.auth.models()));assert.equal(results.length,12);
 assert.equal(h.requests.filter(r=>r.url.endsWith('/oauth/token')&&new URLSearchParams(r.options.body).get('grant_type')==='refresh_token').length,1);
});
test('provider error diagnostics include stage and safe code without leaking callback secrets',async()=>{
 const h=harness();await h.login();const failed=createChatGPT({local:h.local,session:h.session,fetcher:async()=>Response.json({error:'invalid_grant',error_description:'sensitive-code=secret'}, {status:400})});
 await assert.rejects(failed.complete(h.callback(),42),/令牌交换失败.*400.*invalid_grant/);
 const status=await failed.status();assert.match(status.error,/invalid_grant/);assert.ok(!status.error.includes('secret'));
});

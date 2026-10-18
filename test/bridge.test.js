import test from 'node:test';
import assert from 'node:assert/strict';
import {validateClaims,readResponseStream,allowedRequest} from '../bridge/security.mjs';
const claims={iss:'https://auth.openai.com',aud:'issued',sub:'account',exp:2000,nonce:'nonce'};
test('identity claims bind issuer, issued client, nonce, subject and expiry',()=>{
 assert.equal(validateClaims(claims,'issued','nonce',1000).sub,'account');
 for(const change of [{iss:'evil'},{aud:'other'},{nonce:'wrong'},{sub:''},{exp:1}])assert.throws(()=>validateClaims({...claims,...change},'issued','nonce',1000));
});
test('bridge only accepts its exact extension origin and loopback host',()=>{
 assert.equal(allowedRequest('127.0.0.1:1455','chrome-extension://abc','abc'),true);
 assert.equal(allowedRequest('evil.test:1455','chrome-extension://abc','abc'),false);
 assert.equal(allowedRequest('127.0.0.1:1455','https://evil.test','abc'),false);
 assert.equal(allowedRequest('127.0.0.1:1455',undefined,'abc'),false);
});
function response(events){return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));}
test('Responses streaming requires completed event and rejects failures or truncation',async()=>{
 assert.equal(await readResponseStream(response([{type:'response.output_text.delta',delta:'Hello'},{type:'response.completed'}])),'Hello');
 for(const events of [[{type:'response.output_text.delta',delta:'partial'}],[{type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}],[{type:'response.incomplete'}]])await assert.rejects(readResponseStream(response(events)));
});
test('property: untrusted origins and identity nonces never cross the authorization boundary',()=>{
 for(let n=0;n<200;n++){
  const origin='https://site'+n+'.invalid';assert.equal(allowedRequest('127.0.0.1:1455',origin,'abc'),false);
  assert.equal(allowedRequest('127.0.0.1:1455','chrome-extension://abc','abc'),true);
  assert.throws(()=>validateClaims({...claims,nonce:'nonce'+n},'issued','nonce',1000));
  assert.equal(validateClaims(claims,'issued','nonce',1000).sub,'account');
 }
});
test('property: each proper prefix of a successful response stream must fail',async()=>{
 for(let length=1;length<=30;length++){
  const deltas=Array.from({length},()=>({type:'response.output_text.delta',delta:'x'}));
  await assert.rejects(readResponseStream(response(deltas)));
  assert.equal(await readResponseStream(response([...deltas,{type:'response.completed'}])),'x'.repeat(length));
 }
});

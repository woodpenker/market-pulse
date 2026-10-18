import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const extensionId='a'.repeat(32);
test('official OAuth handshake, replay denial, renewal, model catalog and inference across real HTTP',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'market-pulse-auth-'));
 const child=spawn(process.execPath,['--import',resolve('scripts/test-fixtures/bridge-network.mjs'),resolve('bridge/server.mjs'),'--extension-id',extensionId],{cwd:process.cwd(),env:{...process.env,MARKET_PULSE_HOME:directory},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((r,j)=>{child.stdout.once('data',r);child.once('exit',code=>j(Error('Bridge exited '+code)));child.stderr.once('data',d=>j(Error(String(d))));});
  const post=async(path,body={})=>{const r=await fetch('http://127.0.0.1:1455/'+path,{method:'POST',headers:{Origin:'chrome-extension://'+extensionId,'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json();};
  const denied=await fetch('http://127.0.0.1:1455/status',{method:'POST',headers:{Origin:'https://evil.example'}});assert.equal(denied.status,403);
  assert.equal((await post('status')).connected,false);
  for(const change of [{nonce:'attacker'},{aud:'other-client'},{exp:1},{badSignature:true}]){
   const attempt=new URL((await post('login')).url);const bad=new URL('http://127.0.0.1:1455/auth/callback');bad.searchParams.set('state',attempt.searchParams.get('state'));bad.searchParams.set('client_id','issued-test-client');bad.searchParams.set('code',JSON.stringify({nonce:attempt.searchParams.get('nonce'),challenge:attempt.searchParams.get('code_challenge'),...change}));assert.equal((await fetch(bad)).status,400);assert.equal((await post('status')).connected,false);
  }
  const login=await post('login');const url=new URL(login.url);assert.equal(url.hostname,'auth.openai.com');assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');
  const callback=new URL('http://127.0.0.1:1455/auth/callback');callback.searchParams.set('state','bad');assert.equal((await fetch(callback)).status,400);
  callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('client_id','issued-test-client');callback.searchParams.set('code',JSON.stringify({nonce:url.searchParams.get('nonce'),challenge:url.searchParams.get('code_challenge')}));
  assert.equal((await fetch(callback)).status,200);assert.equal((await fetch(callback)).status,400);
  const status=await post('status');assert.equal(status.connected,true);assert.equal(status.planEnabled,true);assert.ok(!JSON.stringify(status).includes('test-access'));
  const catalogs=await Promise.all(Array.from({length:12},()=>post('models')));for(const catalog of catalogs)assert.ok(catalog.models);const models=catalogs[0];assert.deepEqual(models.models,[{id:'test-model',name:'Test Model'}]);
  const answer=await fetch('http://127.0.0.1:1455/responses',{method:'POST',headers:{Origin:'chrome-extension://'+extensionId,'Content-Type':'application/json'},body:JSON.stringify({model:'test-model',instructions:'Research',messages:[{role:'user',content:'Question'}]})});assert.match(await answer.text(),/Subscription answer/);
  const saved=JSON.parse(await readFile(join(directory,'chatgpt.json'),'utf8'));assert.equal(saved.refresh_token,'rotated-refresh');assert.equal((await stat(join(directory,'chatgpt.json'))).mode&0o777,0o600);
  await post('logout');assert.equal((await post('status')).connected,false);assert.ok(!JSON.stringify(JSON.parse(await readFile(join(directory,'chatgpt.json'),'utf8'))).includes('token'));
  const cancelled=new URL((await post('login')).url);const cancelCallback=new URL('http://127.0.0.1:1455/auth/callback');cancelCallback.searchParams.set('state',cancelled.searchParams.get('state'));cancelCallback.searchParams.set('client_id','issued-new');cancelCallback.searchParams.set('code',JSON.stringify({nonce:cancelled.searchParams.get('nonce'),challenge:cancelled.searchParams.get('code_challenge'),delay:100}));
  const inFlight=fetch(cancelCallback);await new Promise(r=>setTimeout(r,20));await post('logout');assert.equal((await inFlight).status,400);assert.equal((await post('status')).connected,false);

 }finally{child.kill();await new Promise(r=>child.once('exit',r));await rm(directory,{recursive:true,force:true});}
});

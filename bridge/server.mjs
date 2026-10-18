import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash,createPublicKey,verify} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {allowedRequest,validateClaims,readResponseStream} from './security.mjs';
const extensionId=process.argv[process.argv.indexOf('--extension-id')+1];
if(!/^[a-p]{32}$/.test(extensionId||''))throw Error('启动参数：node bridge/server.mjs --extension-id <chrome://extensions 中的插件 ID>');
const directory=process.env.MARKET_PULSE_HOME||join(homedir(),'.config','market-pulse');
await mkdir(directory,{recursive:true,mode:0o700});
const file=join(directory,'chatgpt.json');
let saved;
try{saved=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本地登录记录无法读取，请检查 '+file);}
let record=saved||{host:'urn:uuid:'+randomUUID()};
let persistence=Promise.resolve();
async function persist(next){const save=persistence.then(async()=>{const temp=file+'.tmp';await writeFile(temp,JSON.stringify(next),{mode:0o600});await rename(temp,file);record=next;});persistence=save.catch(()=>{});await save;}
if(!saved)await persist(record);
const resource='https://api.openai.com/v1';
const callback='http://127.0.0.1:1455/auth/callback';
let pending,refreshing,revision=0;
async function jsonFetch(url,options={}){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error(`授权服务请求失败 (${r.status})，请重新登录或稍后重试`);
 return r.json();
}
async function tokenRequest(body){return jsonFetch('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,resource})});}
async function identity(token,client,nonce){
 const parts=token?.split('.');if(parts?.length!==3)throw Error('登录身份格式错误');
 const head=JSON.parse(Buffer.from(parts[0],'base64url'));if(head.alg!=='RS256')throw Error('不支持的登录签名');
 const jwks=await jsonFetch('https://auth.openai.com/.well-known/jwks.json');
 const jwk=jwks.keys?.find(k=>k.kid===head.kid && k.kty==='RSA');
 if(!jwk||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('登录签名验证失败');
 return validateClaims(JSON.parse(Buffer.from(parts[1],'base64url')),client,nonce);
}
function scopes(token){return typeof token.scope==='string'?token.scope.split(/\s+/):[];}
function requirePlan(granted){if(!['resource.invoke','chatgpt.tokens.use.direct'].every(s=>granted.includes(s)))throw Error('未授权使用 ChatGPT 订阅，请重新登录并允许计划用量');}
async function access(){
 if(!record.access_token)throw Error('请先使用 Continue with ChatGPT 登录');
 if(record.expires_at>Date.now()+60000)return record.access_token;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  if(!record.refresh_token)throw Error('登录已过期，请重新登录');
  const previous=record;const previousRevision=revision;
  const token=await tokenRequest({grant_type:'refresh_token',client_id:previous.client_id,refresh_token:previous.refresh_token});
  const granted=token.scope?scopes(token):previous.scopes;requirePlan(granted);
  if(token.id_token){const user=await identity(token.id_token,previous.client_id);if(user.sub!==previous.subject)throw Error('续期身份不匹配');}
  if(record!==previous||revision!==previousRevision)throw Error('登录状态已改变，请重试');
  if(!token.access_token||!Number.isFinite(token.expires_in))throw Error('续期响应无效');
  await persist({...previous,...token,scopes:granted,refresh_token:token.refresh_token||previous.refresh_token,expires_at:Date.now()+token.expires_in*1000});
  return record.access_token;
 })();try{return await refreshing;}finally{refreshing=null;}
}
function startLogin(){
 const verifier=randomBytes(32).toString('base64url');
 pending={version:++revision,state:randomBytes(32).toString('base64url'),nonce:randomBytes(32).toString('base64url'),verifier,expires:Date.now()+600000,client:record.client_id,subject:record.subject};
 const p=new URLSearchParams({client_id:record.client_id||'dynamic_agent_client',ext_agent_host_id:record.host,response_type:'code',redirect_uri:callback,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource,state:pending.state,nonce:pending.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 if(record.client_id&&record.id_token)p.set('id_token_hint',record.id_token);
 else p.set('agent_name_hint','Market Pulse');
 return {url:'https://auth.openai.com/api/accounts/authorize?'+p};
}
async function finishLogin(url){
 const attempt=pending;
 if(!attempt||attempt.expires<Date.now()||url.searchParams.get('state')!==attempt.state)throw Error('授权请求已过期或 state 不匹配，请重新登录');
 pending=null; // A valid callback is single-use, including denied consent.
 if(url.searchParams.has('error'))throw Error('未完成授权，请返回插件重新登录');
 const client=url.searchParams.get('client_id')||attempt.client;
 if(!client||client==='dynamic_agent_client'||(attempt.client&&client!==attempt.client))throw Error('授权 client_id 不匹配');
 const code=url.searchParams.get('code');if(!code)throw Error('授权回调缺少 code');
 const token=await tokenRequest({grant_type:'authorization_code',client_id:client,code,code_verifier:attempt.verifier,redirect_uri:callback});
 const user=await identity(token.id_token,client,attempt.nonce);
 if(attempt.subject&&attempt.subject!==user.sub)throw Error('登录账号与已选账号不匹配，请退出后添加新账号');
 const granted=scopes(token);requirePlan(granted);
 if(!token.access_token||!Number.isFinite(token.expires_in))throw Error('授权响应无效');
 if(attempt.version!==revision)throw Error('登录请求已取消或被新的登录替代');
 await persist({host:record.host,client_id:client,subject:user.sub,email:user.email||'',...token,scopes:granted,expires_at:Date.now()+token.expires_in*1000});
}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>150000)throw Error('请求过大');}return body?JSON.parse(body):{};}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:1455'){send(res,403,{error:'Host denied'});return;}
  const url=new URL(req.url,'http://127.0.0.1:1455');
  if(url.pathname==='/auth/callback'&&req.method==='GET'){
   try{await finishLogin(url);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('ChatGPT 登录成功。请关闭此页，回到插件刷新登录状态。');}
   catch(e){send(res,400,{error:e.message});}return;
  }
  if(!allowedRequest(req.headers.host,req.headers.origin,extensionId)){send(res,403,{error:'Origin denied'});return;}
  res.setHeader('Access-Control-Allow-Origin',`chrome-extension://${extensionId}`);
  res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST'){send(res,405,{error:'POST required'});return;}
  const body=await readBody(req);
  if(url.pathname==='/status'){send(res,200,{connected:!!record.access_token,email:record.email||'',planEnabled:record.scopes?.includes('chatgpt.tokens.use.direct')||false});return;}
  if(url.pathname==='/login'){send(res,200,startLogin());return;}
  if(url.pathname==='/logout'){revision++;pending=null;await persist({host:record.host});send(res,200,{ok:true});return;}
  if(url.pathname==='/models'){
   const token=await access();const catalog=await jsonFetch(resource+'/models',{headers:{Authorization:'Bearer '+token}});
   send(res,200,{models:(catalog.models||[]).filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name}))});return;
  }
  if(url.pathname==='/responses'){
   if(typeof body.model!=='string'||!body.model||typeof body.instructions!=='string'||!Array.isArray(body.messages)||body.messages.length>16||body.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'))throw Error('AI 请求格式错误');
   const token=await access();const response=await fetch(resource+'/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model:body.model,instructions:body.instructions,input:body.messages,store:false,stream:true})});
   // Send bytes while upstream streams so Chrome's service worker stays active.
   res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});res.write(JSON.stringify({pending:true})+'\n');
   const keepalive=setInterval(()=>res.write(JSON.stringify({pending:true})+'\n'),5000);
   try{const text=await readResponseStream(response);res.end(JSON.stringify({text})+'\n');}
   catch(e){res.end(JSON.stringify({error:e.message})+'\n');}finally{clearInterval(keepalive);}return;
  }
  send(res,404,{error:'Unknown route'});
 }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
});
server.requestTimeout=150000;
server.listen(1455,'127.0.0.1',()=>console.log(`Market Pulse 登录服务已启动，仅允许插件 ${extensionId}。\n请回到配置页点击 Continue with ChatGPT。关闭本进程将停止订阅 AI 功能。`));

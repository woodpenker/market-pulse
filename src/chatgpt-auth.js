import {validateClaims,readResponseStream} from '../bridge/security.mjs';
export const CHATGPT_CALLBACK='http://127.0.0.1:1455/auth/callback';
const resource='https://api.openai.com/v1';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
export function isChatGPTCallback(value){try{const u=new URL(value);return u.origin==='http://127.0.0.1:1455'&&u.pathname==='/auth/callback'&&!u.username&&!u.password;}catch{return false;}}
export function createChatGPT({local,session,fetcher=(...args)=>fetch(...args)}){
 let completing=false,refreshing,mutations=Promise.resolve();
 function mutate(fn){const run=mutations.then(fn);mutations=run.catch(()=>{});return run;}
 const load=async()=> (await local.get('chatgptCredentials')).chatgptCredentials;
 const pending=async()=> (await session.get('chatgptPending')).chatgptPending;
 async function state(message,error=''){await local.set({chatgptAuthStatus:{message,error,date:new Date().toISOString()}});}
 async function json(url,options={},stage='请求'){
  let response;
  try{response=await fetcher(url,{...options,signal:AbortSignal.timeout(25000)});}catch{throw Error(`${stage}无法连接 OpenAI，请检查 Chrome 网络或代理后重试`);}
  const body=await response.json().catch(()=>null);
  if(!response.ok){const code=body?.error?.code||body?.error;const safe=typeof code==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(code)?' · '+code:'';throw Error(`${stage}失败（HTTP ${response.status}${safe}）${response.status===400?'，请重新发起登录，不要重复使用旧回调':''}`);}
  if(!body)throw Error(`${stage}返回格式无效，请检查网络拦截或代理`);
  return body;
 }
 async function token(body){return json('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,resource})},'令牌交换');}
 async function identity(value,client,nonce){
  const parts=value?.split('.');if(parts?.length!==3)throw Error('授权未返回有效的 ID token');
  let header,claims;try{header=JSON.parse(new TextDecoder().decode(decode(parts[0])));claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));}catch{throw Error('登录身份格式无效');}
  if(header.alg!=='RS256')throw Error('登录签名算法不受支持');
  const keys=await json('https://auth.openai.com/.well-known/jwks.json',{},'身份公钥加载');
  const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('未找到登录签名公钥');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('登录签名验证失败');
  return validateClaims(claims,client,nonce);
 }
 function granted(t,prior=[]){const scopes=typeof t.scope==='string'?t.scope.split(/\s+/):prior;if(!['resource.invoke','chatgpt.tokens.use.direct'].every(s=>scopes.includes(s)))throw Error('账号未授权使用订阅额度，请重新登录并允许计划用量');return scopes;}
 async function begin(){
  const credentials=await load();let host=(await local.get('chatgptHost')).chatgptHost;
  if(!host){host='urn:uuid:'+crypto.randomUUID();await local.set({chatgptHost:host});}
  const attempt={id:random(),state:random(),nonce:random(),verifier:random(),redirect:CHATGPT_CALLBACK,expires:Date.now()+600000,client:credentials?.client_id,subject:credentials?.subject};
  const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(attempt.verifier))));
  await session.set({chatgptPending:attempt,chatgptGeneration:attempt.id});
  const p=new URLSearchParams({client_id:attempt.client||'dynamic_agent_client',ext_agent_host_id:host,response_type:'code',redirect_uri:attempt.redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource,state:attempt.state,nonce:attempt.nonce,code_challenge_method:'S256',code_challenge:challenge});
  if(attempt.client&&credentials.id_token)p.set('id_token_hint',credentials.id_token);else if(!attempt.client)p.set('agent_name_hint','Market Pulse');
  await state('等待你在 OpenAI 官方页面完成授权');
  return {url:'https://auth.openai.com/api/accounts/authorize?'+p};
 }
 async function bindTab(tabId){const p=await pending();if(!p)throw Error('登录请求已结束');await session.set({chatgptPending:{...p,tabId}});}
 async function complete(value,tabId){
  if(!isChatGPTCallback(value))throw Error('登录回调地址不匹配');
  const attempt=await pending();if(!attempt||attempt.expires<Date.now())throw Error('登录请求已结束或过期，请重新登录');
  if(attempt.tabId!==tabId)throw Error('登录回调来自其他窗口');
  const u=new URL(value);if(u.searchParams.get('state')!==attempt.state)throw Error('登录 state 校验失败，请重新登录');
  if(completing)throw Error('正在处理登录回调');completing=true;
  await session.remove('chatgptPending');
  try{
   const error=u.searchParams.get('error');if(error)throw Error(error==='access_denied'?'你已取消登录授权':'OpenAI 授权失败，请重新登录');
   const client=u.searchParams.get('client_id')||attempt.client;
   if(!client||client==='dynamic_agent_client'||(attempt.client&&client!==attempt.client))throw Error('授权回调缺少或不匹配 client_id');
   const code=u.searchParams.get('code');if(!code)throw Error('授权回调缺少 code');
   await state('正在校验授权结果');
   const t=await token({grant_type:'authorization_code',client_id:client,code,code_verifier:attempt.verifier,redirect_uri:attempt.redirect});
   const user=await identity(t.id_token,client,attempt.nonce);if(attempt.subject&&user.sub!==attempt.subject)throw Error('账号不匹配，请退出后切换账号');
   const scopes=granted(t);if(!t.access_token||!Number.isFinite(t.expires_in))throw Error('授权令牌格式无效');
   await mutate(async()=>{if((await session.get('chatgptGeneration')).chatgptGeneration!==attempt.id)throw Error('登录请求已取消或被替代');await local.set({chatgptCredentials:{...t,client_id:client,subject:user.sub,email:user.email||'',scopes,expires_at:Date.now()+t.expires_in*1000}});});
   await state('ChatGPT 登录成功');return {connected:true};
  }catch(e){await state('ChatGPT 登录失败',e.message);throw e;}finally{completing=false;}
 }
 async function status(){const c=await load();const p=await pending();const {chatgptAuthStatus:s}=await local.get('chatgptAuthStatus');return {connected:!!c?.access_token,email:c?.email||'',planEnabled:c?.scopes?.includes('chatgpt.tokens.use.direct')||false,pending:!!p&&p.expires>Date.now(),message:s?.message||'',error:s?.error||''};}
 async function cancel(tabId){const p=await pending();if(p?.tabId===tabId){await session.remove('chatgptPending');await session.set({chatgptGeneration:random()});await state('登录窗口已关闭');}}
 async function logout(){await mutate(async()=>{await session.set({chatgptGeneration:random()});await session.remove('chatgptPending');await local.remove('chatgptCredentials');await state('已退出 ChatGPT');});}
 async function access(){
  const c=await load();if(!c?.access_token)throw Error('请先在配置页登录 ChatGPT');
  if(c.expires_at>Date.now()+60000)return c.access_token;
  if(refreshing)return refreshing;
  refreshing=(async()=>{
   if(!c.refresh_token)throw Error('登录已过期，请重新登录');const generation=(await session.get('chatgptGeneration')).chatgptGeneration;
   const t=await token({grant_type:'refresh_token',client_id:c.client_id,refresh_token:c.refresh_token});const scopes=granted(t,c.scopes);
   if(t.id_token){const user=await identity(t.id_token,c.client_id);if(user.sub!==c.subject)throw Error('续期身份不匹配');}
   if(!t.access_token||!Number.isFinite(t.expires_in))throw Error('续期令牌格式无效');
   await mutate(async()=>{if((await session.get('chatgptGeneration')).chatgptGeneration!==generation||!(await load())?.access_token)throw Error('登录状态已改变，请重试');await local.set({chatgptCredentials:{...c,...t,scopes,refresh_token:t.refresh_token||c.refresh_token,expires_at:Date.now()+t.expires_in*1000}});});return t.access_token;
  })();try{return await refreshing;}catch(e){await state('登录续期失败',e.message);throw e;}finally{refreshing=null;}
 }
 async function models(){const result=await json(resource+'/models',{headers:{Authorization:'Bearer '+await access()}},'模型列表加载');return {models:(result.models||[]).filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name}))};}
 async function ask(model,instructions,messages){if(!model?.trim())throw Error('请先登录并选择可用模型');const r=await fetcher(resource+'/responses',{method:'POST',headers:{Authorization:'Bearer '+await access(),'Content-Type':'application/json'},signal:AbortSignal.timeout(150000),body:JSON.stringify({model,instructions,input:messages.slice(-16),store:false,stream:true})});return readResponseStream(r);}
 return {begin,bindTab,complete,status,cancel,logout,models,ask};
}

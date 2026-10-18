export function validateClaims(claims, clientId, nonce, now = Date.now()/1000) {
 if (claims.iss !== 'https://auth.openai.com' ||
     !(Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId) ||
     (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) ||
     !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= now ||
     (claims.nbf && claims.nbf > now + 30) || (nonce !== undefined && claims.nonce !== nonce)) {
  throw Error('登录身份验证失败，请重新登录');
 }
 return claims;
}
export function allowedRequest(host, origin, extensionId) {
 return host === '127.0.0.1:1455' && origin === `chrome-extension://${extensionId}`;
}
export async function readResponseStream(response) {
 if (!response.ok) throw Error(`ChatGPT 请求失败 (${response.status})，请检查登录与订阅额度`);
 const reader = response.body.getReader();
 const decoder = new TextDecoder();
 let buffer = '', text = '', completed = false;
 function block(value) {
  const data = value.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if (!data || data === '[DONE]') return;
  const event = JSON.parse(data);
  if (event.type === 'response.output_text.delta') text += event.delta || '';
  if (event.type === 'response.completed') completed = true;
  if (['response.failed','response.incomplete','error'].includes(event.type)) {
   throw Error('ChatGPT 未完成回答：'+(event.response?.error?.code || event.error?.code || event.type));
  }
 }
 try {
  while (true) {
   const {value,done} = await reader.read();
   buffer += done ? decoder.decode() : decoder.decode(value,{stream:true});
   buffer = buffer.replace(/\r\n/g,'\n');
   let at;
   while ((at=buffer.indexOf('\n\n')) >= 0) {block(buffer.slice(0,at));buffer=buffer.slice(at+2);}
   if (done) break;
  }
  if(buffer.trim())block(buffer);
  if(!completed || !text.trim())throw Error('ChatGPT 回答中断或为空，请重试');
  return text;
 } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}

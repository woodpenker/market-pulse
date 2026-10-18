// Imported only by an isolated child in bridge-http.test.js; never production.
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
let previous,refreshCount=0;
function jwt(data){const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');const p=Buffer.from(JSON.stringify({iss:'https://auth.openai.com',sub:'account',email:'example@test.invalid',exp:Math.floor(Date.now()/1000)+3600,...data})).toString('base64url');return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');}
globalThis.fetch=async(url,options={})=>{
 if(url.endsWith('/jwks.json'))return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'test-key'}]});
 if(url.endsWith('/oauth/token')){
  const body=new URLSearchParams(options.body);
  if(body.get('grant_type')==='authorization_code'){
   const code=JSON.parse(body.get('code'));refreshCount=0;if(code.delay)await new Promise(r=>setTimeout(r,code.delay));if(createHash('sha256').update(body.get('code_verifier')).digest('base64url')!==code.challenge)throw Error('PKCE mismatch');
   if(body.get('redirect_uri')!=='http://127.0.0.1:1455/auth/callback')throw Error('callback mismatch');
   previous=code;return Response.json({access_token:'test-access',refresh_token:'test-refresh',id_token:(code.badSignature?'invalid.': '')+jwt({aud:code.aud||body.get('client_id'),nonce:code.nonce,...(code.exp?{exp:code.exp}:{})}),expires_in:0,scope:'resource.invoke chatgpt.tokens.use.direct offline_access'});
  }
  if(++refreshCount>1)throw Error('Refresh token reused concurrently');await new Promise(r=>setTimeout(r,25));
  return Response.json({access_token:'renewed-access',refresh_token:'rotated-refresh',expires_in:3600,scope:'resource.invoke chatgpt.tokens.use.direct offline_access'});
 }
 if(url.endsWith('/models')){if(options.headers.Authorization!=='Bearer renewed-access')throw Error('refresh did not run');return Response.json({models:[{visibility:'list',slug:'test-model',display_name:'Test Model'},{visibility:'hide',slug:'hidden'}]});}
 if(url.endsWith('/responses')){const body=JSON.parse(options.body);if(body.store!==false||body.stream!==true||body.input[0].role!=='user'||!body.instructions)throw Error('Invalid subscription contract');return new Response('data: {"type":"response.output_text.delta","delta":"Subscription answer"}\n\ndata: {"type":"response.completed"}\n\n');}
 throw Error('Unexpected fixture request');
};

export const providers=[
 {id:'chatgpt',name:'ChatGPT Plus / Pro（登录订阅）',format:'subscription',endpoint:'https://api.openai.com/v1'},
 {id:'openai',name:'OpenAI API',format:'openai',endpoint:'https://api.openai.com/v1'},
 {id:'deepseek',name:'DeepSeek API',format:'openai',endpoint:'https://api.deepseek.com'},
 {id:'glm',name:'智谱 GLM',format:'openai',endpoint:'https://open.bigmodel.cn/api/paas/v4',docs:'https://docs.bigmodel.cn/api-reference/模型-api/对话补全'},
 {id:'hunyuan',name:'腾讯混元',format:'openai',endpoint:'https://api.hunyuan.cloud.tencent.com/v1',docs:'https://cloud.tencent.com/document/product/1729/111007'},
 {id:'anthropic',name:'Anthropic / Claude',format:'anthropic',endpoint:'https://api.anthropic.com/v1',docs:'https://platform.claude.com/docs/en/api/messages/create'},
 {id:'gemini',name:'Google Gemini',format:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',docs:'https://ai.google.dev/api/generate-content'},
 {id:'qwen',name:'阿里云 Qwen',format:'openai',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1',docs:'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope'},
 {id:'doubao',name:'火山方舟 / 豆包',format:'openai',endpoint:'https://ark.cn-beijing.volces.com/api/v3',docs:'https://www.volcengine.com/docs/82379/1494384'},
 {id:'moonshot',name:'Moonshot / Kimi',format:'openai',endpoint:'https://api.moonshot.cn/v1',docs:'https://platform.kimi.com/docs/api/overview'},
 {id:'custom',name:'自定义 OpenAI 兼容 API',format:'openai',endpoint:''}
];
export function providerByID(id){const p=providers.find(p=>p.id===id);if(!p)throw Error('无效的服务商');return p;}
export function buildAIRequest(settings,system,messages){
 const provider=providerByID(settings.provider);if(provider.format==='subscription')throw Error('请从插件配置页登录 ChatGPT');
 const base=settings.endpoint.replace(/\/+$/,'');const endpoint=new URL(base);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('API地址必须为不带账号密码、查询参数或片段的HTTPS地址');
 const model=typeof settings.model==='string'?settings.model.trim():'';if(typeof settings.apiKey!=='string'||!settings.apiKey.trim()||!model)throw Error('请先在设置中填写 API Key 和模型名称');
 const turns=messages.slice(-16).filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content}));
 let url,body,headers={'Content-Type':'application/json'};
 if(provider.format==='anthropic'){
  url=base+'/messages';headers={...headers,'x-api-key':settings.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'};
  body={model,max_tokens:4096,system,messages:turns};
 }else if(provider.format==='gemini'){
  const id=model.replace(/^models\//,'');if(!/^[A-Za-z0-9._-]+$/.test(id))throw Error('Gemini模型ID无效');
  url=base+'/models/'+encodeURIComponent(id)+':generateContent';headers['x-goog-api-key']=settings.apiKey;
  body={systemInstruction:{parts:[{text:system}]},contents:turns.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}))};
 }else{url=base+'/chat/completions';headers.Authorization='Bearer '+settings.apiKey;body={model,messages:[{role:'system',content:system},...turns]};}
 return {format:provider.format,url,init:{method:'POST',headers,signal:AbortSignal.timeout(90000),redirect:'error',body:JSON.stringify(body)}};
}
export function parseAIResponse(format,data){
 let result='';const array=value=>Array.isArray(value)?value:[];
 if(format==='anthropic'){
  if(data.stop_reason==='max_tokens')throw Error('AI输出达到长度上限，请缩小问题或减少新闻数量后重试');
  result=array(data.content).filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n');
 }else if(format==='gemini'){
  const candidate=data.candidates?.[0];if(candidate?.finishReason==='MAX_TOKENS')throw Error('AI输出达到长度上限，请缩小问题或减少新闻数量后重试');
  if(data.promptFeedback?.blockReason||(candidate?.finishReason&&!['STOP','FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)))throw Error('AI没有返回可用文本，请检查内容限制或模型配置');
  result=array(candidate?.content?.parts).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('\n');
 }else{
  const choice=data.choices?.[0];if(choice?.finish_reason==='length')throw Error('AI输出达到长度上限，请缩小问题或减少新闻数量后重试');
  const content=choice?.message?.content;result=typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):'';
 }
 if(!result.trim())throw Error('AI 返回为空或格式不兼容');return result;
}
export async function askProvider(settings,system,messages,fetcher=fetch){
 const {format,url,init}=buildAIRequest(settings,system,messages);const response=await fetcher(url,init);
 if(!response.ok)throw Error(`AI 请求失败 (HTTP ${response.status})，请检查密钥、模型、额度或接口地址`);
 return parseAIResponse(format,await response.json());
}

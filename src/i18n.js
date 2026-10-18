import {catalog} from './locales/catalog.js';
export const languages=[{id:'zh-CN',name:'简体中文'},{id:'zh-TW',name:'繁體中文'},{id:'en',name:'English'}];
let language='zh-CN';
export function resolveLanguage(value,browser=globalThis.navigator?.language||'zh-CN'){if(value==='auto'){if(/^zh[-_](TW|HK|MO|Hant)/i.test(browser))return 'zh-TW';return /^zh/i.test(browser)?'zh-CN':'en';}if(/^en(?:-|$)/i.test(value||''))return 'en';return languages.some(l=>l.id===value)?value:'zh-CN';}
export function setLanguage(value){language=resolveLanguage(value);return language;}
export function locale(){return language==='en'?'en-US':language;}
export function translate(key,values={},selected=language){
 const message=catalog[key]?.[resolveLanguage(selected)]??key;
 return message.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??'{'+name+'}'));
}
export const t=(key,values={})=>translate(key,values,language);
export function errorText(error){const raw=typeof error==='string'?error:error?.message||'';for(const prefix of ['更早历史未能加载：','图表使用缓存：'])if(raw.startsWith(prefix))return t(prefix)+errorText(raw.slice(prefix.length));if(language==='zh-CN'||catalog[raw]||!/[\u4e00-\u9fff]/.test(raw))return t(raw);return t('请求失败，请检查配置或稍后重试')+(raw.match(/HTTP \d+/)?' ('+raw.match(/HTTP \d+/)[0]+')':'');}
// Bind static UI text once, before rendering external news or user content.
export function bindStaticTranslations(root=document){
 for(const option of root.querySelectorAll('option:not([value])'))option.value=option.textContent.trim();
 const bindings=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode;if(/^(SCRIPT|STYLE)$/.test(node.parentElement?.tagName))continue;const key=node.textContent.trim();if(catalog[key]){const prefix=node.textContent.match(/^\s*/)[0],suffix=node.textContent.match(/\s*$/)[0];bindings.push(()=>{if(node.isConnected)node.textContent=prefix+t(key)+suffix;});}}
 for(const element of root.querySelectorAll('*'))for(const attribute of ['placeholder','title','aria-label']){const key=element.getAttribute(attribute);if(catalog[key])bindings.push(()=>element.setAttribute(attribute,t(key)));}
 return ()=>{document.documentElement.lang=locale();for(const update of bindings)update();};
}
export async function setupLanguage(select,onChange=()=>{}){
 const updateStatic=bindStaticTranslations();const stored=(await chrome.storage.local.get('settings')).settings?.language||'zh-CN';
 select.replaceChildren();const auto=document.createElement('option');auto.value='auto';select.append(auto);
 for(const choice of languages){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.name;select.append(option);}
 let preference=stored;
 function apply(value){preference=value;setLanguage(value);select.value=value;auto.textContent=t('跟随浏览器');select.setAttribute('aria-label',t('界面语言'));updateStatic();onChange();}
 select.onchange=async()=>{select.disabled=true;try{const response=await chrome.runtime.sendMessage({type:'preferences',patch:{language:select.value}});if(response.error)throw Error(response.error);apply(select.value);}catch(error){select.value=preference;document.getElementById('notice')?.replaceChildren(document.createTextNode(errorText(error)));}finally{select.disabled=false;}};
 chrome.storage.local.onChanged.addListener(changes=>{if(changes.settings){const value=changes.settings.newValue?.language||'zh-CN';if(value!==preference)apply(value);}});
 apply(stored);return updateStatic;
}

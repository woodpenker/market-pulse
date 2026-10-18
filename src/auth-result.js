import {setupAppearance} from './appearance.js';
import {t,locale,errorText,setupLanguage} from './i18n.js';
async function render(){const r=await chrome.runtime.sendMessage({type:'auth',path:'status'});document.getElementById('auth-status').textContent=(r.error?errorText(r.error):r.data.error?errorText(r.data.error):t(r.data.message||''))||t('请从插件配置页重新发起登录');}
chrome.storage.local.onChanged.addListener(()=>render());
document.getElementById('auth-options').onclick=()=>chrome.runtime.openOptionsPage();
await setupAppearance();
await setupLanguage(document.getElementById('language'),()=>render());
await render();

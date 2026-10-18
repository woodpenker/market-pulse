export const tabIDs=['news','monitor','tech','brief','chat'];
export const tabNames={news:'市场时间线',monitor:'行情监控',tech:'科技资讯',brief:'研究简报',chat:'AI 对话'};
export const defaultTheme={mode:'dark',background:'#0b111c',accent:'#5de0bb'};
export function validateTabOrder(order){if(!Array.isArray(order)||order.length!==tabIDs.length||new Set(order).size!==order.length||order.some(id=>!tabIDs.includes(id)))throw Error('标签顺序必须包含全部标签且不能重复');return order;}
export function moveTab(order,id,before){validateTabOrder(order);if(!order.includes(id)||!order.includes(before))throw Error('无效标签');if(id===before)return [...order];const next=order.filter(x=>x!==id);next.splice(next.indexOf(before),0,id);return next;}
export function validateTheme(theme){if(!theme||!['dark','light','custom','system'].includes(theme.mode)||!/^#[0-9a-f]{6}$/i.test(theme.background)||!/^#[0-9a-f]{6}$/i.test(theme.accent))throw Error('主题颜色需为6位十六进制颜色');return theme;}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
export function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
function mix(a,b,amount){return '#'+rgb(a).map((v,i)=>Math.round(v*(1-amount)+rgb(b)[i]*amount).toString(16).padStart(2,'0')).join('');}
function readableAccent(accent,background,foreground){for(let n=0;n<=20;n++){const candidate=mix(accent,foreground,n/20);if(contrast(candidate,background)>=4.5)return candidate;}return foreground;}
export function themeTokens(theme=defaultTheme,systemDark=true){
 validateTheme(theme);const mode=theme.mode==='system'?(systemDark?'dark':'light'):theme.mode;
 const background=mode==='custom'?theme.background:mode==='light'?'#f5f7fb':'#0b111c';
 const text=contrast('#ffffff',background)>=contrast('#000000',background)?'#ffffff':'#000000';const dark=text==='#ffffff';
 const candidate=mix(background,text,dark?.045:.025),other=mix(background,text,dark?.08:.06);const surface=contrast(candidate,text)>=4.5?candidate:background,alt=contrast(other,text)>=4.5?other:background;
 const safe=color=>{let result=readableAccent(color,surface,text);if(contrast(result,background)<4.5)result=readableAccent(result,background,text);return result;};
 const accent=safe(mode==='custom'?theme.accent:dark?'#5de0bb':'#006d5b');
 return {'--bg':background,'--text':text,'--surface':surface,'--surface-alt':alt,'--hover':mix(background,text,.12),'--border':mix(background,text,.22),'--grid':mix(background,text,.18),'--muted':safe(mix(background,text,.68)),'--accent':accent,'--up':safe(dark?'#ff9595':'#ae2638'),'--down':safe(dark?'#61dfad':'#087554'),'--glow':mix(background,accent,.12),'--chat-user':mix(background,accent,.12),'--chart-ema':'#'+(dark?'bca0ff':'6f42bd'),'--chart-ma5':dark?'#f3ce62':'#806000','--chart-ma10':dark?'#61d9e8':'#006c80','--chart-ma20':dark?'#ffa763':'#a34c00','--chart-ma60':dark?'#80da91':'#287038'};
}
export function applyTheme(theme=defaultTheme,root=document.documentElement){const tokens=themeTokens(theme,globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches??true);root.dataset.theme=theme.mode;root.style.colorScheme=tokens['--text']==='#ffffff'?'dark':'light';for(const [key,value]of Object.entries(tokens))root.style.setProperty(key,value);return tokens;}
export async function setupAppearance(onChange=()=>{}){
 const apply=settings=>{applyTheme(settings?.theme||defaultTheme);onChange(settings);};apply((await chrome.storage.local.get('settings')).settings);
 chrome.storage.local.onChanged.addListener(changes=>{if(changes.settings)apply(changes.settings.newValue);});
 globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change',async()=>apply((await chrome.storage.local.get('settings')).settings));
}

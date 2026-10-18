export function createDashboard(chrome, delay=250){
 let focusTimer,toggling=Promise.resolve();
 async function close(id){
  try{await chrome.windows.remove(id);}catch{/* Already closed. */}
  const saved=await chrome.storage.session.get('dashboardWindow');
  if(saved.dashboardWindow===id)await chrome.storage.session.remove('dashboardWindow');
 }
 async function bounds(tab){
  let anchor;try{anchor=tab?.windowId?await chrome.windows.get(tab.windowId):await chrome.windows.getLastFocused();}catch{}
  let displays=[];try{displays=await chrome.system.display.getInfo();}catch{}
  const center=anchor?{x:anchor.left+anchor.width/2,y:anchor.top+anchor.height/2}:null;
  const display=displays.find(d=>center&&center.x>=d.bounds.left&&center.x<d.bounds.left+d.bounds.width&&center.y>=d.bounds.top&&center.y<d.bounds.top+d.bounds.height)||displays.find(d=>d.isPrimary)||displays[0];
  const area=display?.workArea;
  if(!area)return anchor?{left:Math.max(anchor.left,anchor.left+anchor.width-666),top:anchor.top+80}:{};
  const width=Math.min(650,area.width),height=Math.min(425,area.height);
  return {width,height,left:Math.max(area.left,area.left+area.width-width-16),top:Math.max(area.top,Math.min((anchor?.top??area.top)+80,area.top+area.height-height-16))};
 }
 function toggle(tab){
  clearTimeout(focusTimer);
  const run=toggling.then(async()=>{
   const {dashboardWindow:id}=await chrome.storage.session.get('dashboardWindow');
   if(id){try{await chrome.windows.get(id);await close(id);return;}catch{await chrome.storage.session.remove('dashboardWindow');}}
   const win=await chrome.windows.create({url:chrome.runtime.getURL('index.html'),type:'popup',width:650,height:425,focused:true,...await bounds(tab)});
   await chrome.storage.session.set({dashboardWindow:win.id});
  });
  toggling=run.catch(()=>{});return run;
 }
 function focusChanged(windowId){
  clearTimeout(focusTimer);
  focusTimer=setTimeout(()=>{
   (async()=>{await toggling;const {dashboardWindow:id}=await chrome.storage.session.get('dashboardWindow');if(!id||id===windowId)return;let win;try{win=await chrome.windows.get(id);}catch{return;}if(!win.focused)await close(id);})().catch(console.error);
  },delay);
 }
 async function pageLostFocus(windowId){await toggling;const {dashboardWindow:id}=await chrome.storage.session.get('dashboardWindow');if(id===windowId)await close(id);}
 return {toggle,focusChanged,pageLostFocus};
}

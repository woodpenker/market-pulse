import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboard} from '../src/dashboard.js';
function harness(){const data={},windows=new Map();let seq=0;const chrome={runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{session:{async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,v);},async remove(k){delete data[k];}}},windows:{async create(o){const w={...o,id:++seq};windows.set(w.id,w);return w;},async get(id){if(!windows.has(id))throw Error('missing');return windows.get(id);},async remove(id){windows.delete(id);}}};return {windows,data,api:createDashboard(chrome,5)};}
test('toolbar toggle opens then closes, with half-size dimensions',async()=>{const h=harness();await h.api.toggle();assert.equal(h.windows.size,1);const w=[...h.windows.values()][0];assert.equal(w.width,650);assert.equal(w.height,425);await h.api.toggle();assert.equal(h.windows.size,0);await h.api.toggle();assert.equal(h.windows.size,1);});
test('focus loss closes dashboard but focus return during click does not double-toggle',async()=>{const h=harness();await h.api.toggle();const w=[...h.windows.values()][0];w.focused=false;h.api.focusChanged(999);await new Promise(r=>setTimeout(r,20));assert.equal(h.windows.size,0);await h.api.toggle();const again=[...h.windows.values()][0];again.focused=false;h.api.focusChanged(999);await h.api.toggle();await new Promise(r=>setTimeout(r,20));assert.equal(h.windows.size,0);});
test('dashboard is right aligned on the monitor containing the clicked browser',async()=>{
 const session={};let created;
 const chrome={runtime:{getURL:p=>p},storage:{session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v)}},system:{display:{getInfo:async()=>[{isPrimary:true,bounds:{left:0,top:0,width:1920,height:1080},workArea:{left:0,top:0,width:1920,height:1040}},{bounds:{left:1920,top:0,width:2560,height:1440},workArea:{left:1920,top:0,width:2560,height:1400}}]}},windows:{get:async()=>({left:2000,top:0,width:1500,height:1000}),create:async o=>{created=o;return {...o,id:5};}}};
 await createDashboard(chrome).toggle({windowId:2});assert.equal(created.left,1920+2560-650-16);assert.equal(created.top,80);assert.equal(created.width,650);
});
test('late browser focus events after popup creation must not close the focused popup',async()=>{
 const h=harness();await h.api.toggle();const w=[...h.windows.values()][0];assert.equal(w.focused,true);
 h.api.focusChanged(999);await new Promise(r=>setTimeout(r,20));assert.equal(h.windows.size,1,'opening window must survive stale source-window event');
 h.api.focusChanged(-1);await new Promise(r=>setTimeout(r,20));assert.equal(h.windows.size,1,'transient no-focus event must not close focused popup');
});
test('confirmed page blur only closes its own dashboard window',async()=>{const h=harness();await h.api.toggle();const id=[...h.windows.keys()][0];await h.api.pageLostFocus(999);assert.equal(h.windows.size,1);await h.api.pageLostFocus(id);assert.equal(h.windows.size,0);});

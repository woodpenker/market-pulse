import test from 'node:test';
import assert from 'node:assert/strict';
import {tabIDs,moveTab,validateTabOrder,defaultTheme,validateTheme,themeTokens,contrast} from '../src/appearance.js';
import {defaults,validate} from '../src/core.js';
import {syncSettings,restoreSettings} from '../src/config.js';
test('tab movement preserves all IDs and rejects missing or duplicate tabs',()=>{
 const order=moveTab(tabIDs,'tech','news');assert.deepEqual(order,['tech','news','monitor','brief','chat']);assert.deepEqual(tabIDs,['news','monitor','tech','brief','chat']);assert.throws(()=>validateTabOrder(['news']));assert.throws(()=>validateTabOrder(['news','news','tech','brief','chat']));assert.throws(()=>moveTab(tabIDs,'settings','news'));
});
test('theme palettes validate colors and maintain readable text and accent contrast',()=>{
 for(const background of ['#ffffff','#000000','#777777','#ff0000','#00ff00','#12415b']){
  const tokens=themeTokens({mode:'custom',background,accent:'#ffffff'});assert.equal(tokens['--bg'],background);for(const key of ['--text','--muted','--accent'])assert.ok(contrast(tokens[key],tokens['--surface'])>=4.5,`${background}: ${key}`);
 }
 assert.equal(themeTokens({ ...defaultTheme,mode:'system'},false)['--bg'],'#f5f7fb');assert.equal(themeTokens(defaultTheme)['--bg'],'#0b111c');
 for(const theme of [{...defaultTheme,background:'url(evil)'},{...defaultTheme,mode:'unknown'},{...defaultTheme,accent:'#fff'}])assert.throws(()=>validateTheme(theme));
});
test('tab order and themes survive cloud round trips and legacy settings receive defaults',()=>{
 const s={...defaults,tabOrder:[...tabIDs].reverse(),theme:{mode:'custom',background:'#fff2dd',accent:'#a14c00'},apiKey:'private'};validate(s);const cloud={version:1,settings:syncSettings(s)};assert.ok(!JSON.stringify(cloud).includes('private'));const restored=restoreSettings(cloud,s);assert.deepEqual(restored.theme,s.theme);assert.deepEqual(restored.tabOrder,s.tabOrder);delete cloud.settings.theme;delete cloud.settings.tabOrder;assert.deepEqual(restoreSettings(cloud,s).theme,defaultTheme);assert.deepEqual(restoreSettings(cloud,s).tabOrder,tabIDs);
});

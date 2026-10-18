import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalog} from '../src/locales/catalog.js';
import {setLanguage,t,resolveLanguage,errorText} from '../src/i18n.js';
import {parseIndicatorKeys,validateChartIndicators,validateChartIntervals} from '../src/chart-settings.js';
import {indicatorDefinitions,chartView} from '../src/indicators.js';
import {defaults,validate,instructions,buildDigest} from '../src/core.js';
import {syncSettings,restoreSettings} from '../src/config.js';
test('every static Chinese UI label has English and Traditional Chinese translations',async()=>{
 for(const file of ['index.html','options.html','auth-result.html']){
  const html=await readFile(new URL('../'+file,import.meta.url),'utf8');const values=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim()).concat([...html.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)].map(m=>m[1]));
  for(const key of values.filter(v=>/[\u4e00-\u9fff]/.test(v))){assert.ok(catalog[key]?.en,`${file}: English missing: ${key}`);assert.ok(catalog[key]?.['zh-TW'],`${file}: Traditional missing: ${key}`);}
 }
});
test('language switching, interpolation, browser preference and error fallback',()=>{
 setLanguage('en');assert.equal(t('行情监控'),'Watchlist');assert.equal(t('{n}天',{n:10}),'10 days');assert.equal(errorText('未知错误 HTTP 503'),'Request failed. Check settings or try again later. (HTTP 503)');
 setLanguage('zh-TW');assert.equal(t('保存设置'),'儲存設定');setLanguage('zh-CN');assert.equal(t('行情监控'),'行情监控');assert.equal(resolveLanguage('auto','zh-HK'),'zh-TW');assert.equal(resolveLanguage('auto','fr-FR'),'en');
});
test('indicator definitions allow configured EMA/MA periods and minute candle averages',()=>{
 const config=parseIndicatorKeys('EMA9, EMA21,MA5,MA120,VWAP');assert.equal(config[3].key,'ma120');assert.equal(config[4].key,'average');
 const d=indicatorDefinitions(config),bars=Array.from({length:130},(_,i)=>({time:'2026-10-16 09:'+i,close:i+1}));const view=chartView({bars},'5m',['ema21','ma5'],d);assert.equal(view.bars.length,130);assert.equal(view.overlays[0].values.at(-1),120);assert.equal(view.overlays[1].values.at(-1),128);
 for(const text of ['EMA0','MA1000','EMA9,ema9','abc'])assert.throws(()=>parseIndicatorKeys(text));assert.throws(()=>validateChartIndicators([{key:'ema9',enabled:'yes'}]));assert.throws(()=>validateChartIntervals([2]));validateChartIntervals([]);
});
test('language and chart preferences validate and round trip without credentials',()=>{
 const s={...defaults,language:'en',chartIndicators:[{key:'ema12',enabled:true},{key:'ma5',enabled:false}],chartIntervals:[1,5]};const restored=restoreSettings({version:1,settings:syncSettings(s)},s);assert.equal(restored.language,'en');assert.deepEqual(restored.chartIndicators,s.chartIndicators);assert.deepEqual(restored.chartIntervals,[1,5]);assert.throws(()=>validate({...s,language:'invalid'}));
 const old=syncSettings({...defaults});delete old.chartIndicators;delete old.chartIntervals;delete old.language;assert.deepEqual(restoreSettings({version:1,settings:old},s).chartIndicators,defaults.chartIndicators);
});
test('AI instructions and local digest follow selected language while source content stays original',()=>{
 assert.match(instructions([],'en'),/Answer in English/);assert.match(instructions([],'zh-TW'),/繁體/);const digest=buildDigest([{title:'原始标题',date:new Date().toISOString(),url:'https://example.com',source:'测试'}],{},Date.now(),'en');assert.match(digest.text,/past 24 hours/);assert.match(digest.text,/原始标题/);
});

import {defaults,validate} from './core.js';
export function syncSettings(settings){
 const {time,provider,endpoint,model,autoAI,feeds,indices,badgeSymbol,badgeRefreshMinutes,watchlist,monitorRefreshMinutes,chartDays=defaults.chartDays,techFeeds=defaults.techFeeds,language=defaults.language,chartIndicators=defaults.chartIndicators,chartIntervals=defaults.chartIntervals,tabOrder=defaults.tabOrder,theme=defaults.theme,dataSources=defaults.dataSources}=settings;
 return {time,provider,endpoint,model,autoAI,feeds,indices,badgeSymbol,badgeRefreshMinutes,watchlist,monitorRefreshMinutes,chartDays,techFeeds,language,chartIndicators,chartIntervals,tabOrder,theme,dataSources};
}
export function restoreSettings(cloud,local){
 if(cloud?.version!==1||!cloud.settings)throw Error('云端配置为空或版本不支持');
 return validate({...defaults,...syncSettings(cloud.settings),apiKey:cloud.settings.provider===local.provider&&cloud.settings.endpoint===local.endpoint?local.apiKey||'':''});
}

export function configurationFile(settings,date=new Date().toISOString()){
 const clean=syncSettings(validate({...defaults,...settings}));return {version:1,app:'market-pulse',date,settings:clean};
}
export function parseConfiguration(text,local){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>1048576)throw Error('配置文件过大，最大1MB');
 let data;try{data=JSON.parse(text);}catch{throw Error('配置文件不是有效JSON');}
 if(data?.app&&data.app!=='market-pulse')throw Error('不是Market Pulse配置文件');
 return restoreSettings(data,local);
}

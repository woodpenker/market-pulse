export const sourceAdapters=[
 {id:'native',name:'按项目原来源'}, {id:'tencent',name:'腾讯股票 / ETF / 指数'},
 {id:'nasdaq',name:'Nasdaq 美国股票 / ETF / 共同基金'}, {id:'yahoo',name:'Yahoo Finance 全球行情（网络可用时）'},
 {id:'fund',name:'腾讯净值 + 东方财富历史'}, {id:'cnfuture',name:'新浪国内期货'},
 {id:'future',name:'腾讯报价 + 新浪国际期货'}, {id:'crypto',name:'Binance 公共行情'},
 {id:'coinbase',name:'Coinbase Exchange'}, {id:'custom',name:'自定义标准JSON'}
];
export const endpointPresets=[
 {key:'tencentQuote',name:'腾讯报价',base:'https://qt.gtimg.cn'},
 {key:'tencentChart',name:'腾讯日线/分时',base:'https://web.ifzq.gtimg.cn'},
 {key:'tencentMinute',name:'腾讯分钟K线',base:'https://ifzq.gtimg.cn'},
 {key:'tencentSearch',name:'腾讯代码查询',base:'https://smartbox.gtimg.cn'},
 {key:'nasdaq',name:'Nasdaq',base:'https://api.nasdaq.com'},
 {key:'yahoo',name:'Yahoo Finance',base:'https://query1.finance.yahoo.com'},
 {key:'fund',name:'东方财富净值',base:'https://fund.eastmoney.com'},
 {key:'futures',name:'新浪期货',base:'https://stock2.finance.sina.com.cn'},
 {key:'binance',name:'Binance',base:'https://data-api.binance.vision'},
 {key:'coinbase',name:'Coinbase',base:'https://api.exchange.coinbase.com'},
 {key:'frankfurter',name:'Frankfurter 汇率',base:'https://api.frankfurter.dev'}
];
export const sourceCategories=[
 {key:'mainland',name:'内地股票 / ETF / 指数',choices:['tencent','yahoo','custom'],value:'tencent'},
 {key:'us',name:'美国股票 / ETF / 共同基金',choices:['nasdaq','yahoo','tencent','custom'],value:'nasdaq'},
 {key:'indicesUS',name:'海外指数',choices:['tencent','nasdaq','yahoo','custom'],value:'tencent'},
 {key:'hongkong',name:'港股',choices:['tencent','yahoo','custom'],value:'tencent'},
 {key:'global',name:'其他海外资产',choices:['yahoo','custom'],value:'yahoo'},
 {key:'fund',name:'国内场外基金',choices:['fund','custom'],value:'fund'},
 {key:'futuresCN',name:'国内期货',choices:['cnfuture','custom'],value:'cnfuture'},
 {key:'futuresGlobal',name:'国际期货 / 贵金属',choices:['future','yahoo','custom'],value:'future'},
 {key:'crypto',name:'加密货币',choices:['crypto','coinbase','yahoo','custom'],value:'crypto'}
];
export const defaultDataSources={routes:Object.fromEntries(sourceCategories.map(c=>[c.key,c.value])),endpoints:Object.fromEntries(endpointPresets.map(p=>[p.key,p.base])),customTemplate:''};
export function dataSources(value={}){return {...defaultDataSources,...value,routes:{...defaultDataSources.routes,...value.routes},endpoints:{...defaultDataSources.endpoints,...value.endpoints}};}
export function publicURL(value){let url;try{url=new URL(value);}catch{throw Error('数据源地址无效');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('数据源必须使用不带账号密码的HTTPS地址');return url;}
export function validateDataSources(value){
 const config=dataSources(value);for(const [key,adapter]of Object.entries(config.routes)){const category=sourceCategories.find(c=>c.key===key);if(!category?.choices.includes(adapter))throw Error('数据源不支持该资产分类');}
 for(const [key,url]of Object.entries(config.endpoints)){if(!endpointPresets.some(p=>p.key===key))throw Error('未知数据源地址');if(publicURL(url).search)throw Error('数据源基础地址不能包含查询参数');}
 if(config.customTemplate){if(!config.customTemplate.includes('{symbol}'))throw Error('自定义数据源模板需包含{symbol}');publicURL(config.customTemplate.replaceAll('{symbol}','TEST').replaceAll('{period}','day'));}
 if(Object.values(config.routes).includes('custom')&&!config.customTemplate)throw Error('请填写自定义数据源模板');return config;
}
export function categoryOf(i){
 if(i.provider==='fund')return 'fund';if(i.provider==='cnfuture')return 'futuresCN';if(i.provider==='future')return 'futuresGlobal';if(['crypto','coinbase'].includes(i.provider)||i.type==='加密货币')return 'crypto';
 if(i.provider==='tencent'){if(/^us\./.test(i.symbol)||(/^us/.test(i.symbol)&&i.type==='指数'))return 'indicesUS';if(/^us/.test(i.symbol))return 'us';if(/^hk/.test(i.symbol))return 'hongkong';return 'mainland';}
 if(i.provider==='nasdaq')return 'us';if(i.provider==='yahoo'){if(/\.HK$/i.test(i.symbol))return 'hongkong';if(/\.S[ZS]$/i.test(i.symbol))return 'mainland';if(i.type==='期货'||i.type==='黄金')return 'futuresGlobal';if(i.symbol.startsWith('^'))return 'indicesUS';if(/^[A-Z][A-Z0-9-]*$/i.test(i.symbol))return 'us';return 'global';}
 return null;
}
const yahooIndices={'us.IXIC':'^IXIC','us.NDX':'^NDX','us.INX':'^GSPC','us.DJI':'^DJI','hkHSI':'^HSI'};
export function yahooSymbol(i){if(i.sourceSymbol)return i.sourceSymbol;if(i.provider==='yahoo')return i.symbol;if(yahooIndices[i.symbol])return yahooIndices[i.symbol];if(/^us/.test(i.symbol))return i.symbol.slice(2).replace(/^\./,'').replace(/\.(OQ|N)$/i,'').replace(/\./g,'-').toUpperCase();if(/^hk\d+$/.test(i.symbol))return i.symbol.slice(2).replace(/^0+(?=\d{4}$)/,'')+'.HK';if(/^(sh|sz)\d{6}$/.test(i.symbol))return i.symbol.slice(2)+(i.symbol.startsWith('sh')?'.SS':'.SZ');if(i.provider==='future'&&!['XAU','XAG'].includes(i.symbol))return ({GC:'GC=F',SI:'SI=F',CL:'CL=F',OIL:'BZ=F',HG:'HG=F',NG:'NG=F'})[i.symbol]||i.symbol+'=F';if(['crypto','coinbase'].includes(i.provider)){const match=/^(.*?)(USDT|USDC|USD|EUR|BTC|ETH)$/.exec(i.symbol.replace('-',''));if(match)return match[1]+'-'+match[2];}throw Error('无法映射该代码，请填写所选来源的代码');}
export function routedInstrument(item,value,period='quote'){
 const config=dataSources(value),category=categoryOf(item);const adapter=item.dataSource&&item.dataSource!=='native'?item.dataSource:item.dataSource==='native'||item.provider==='custom'?item.provider:config.routes[category]||item.provider;
 let symbol=item.sourceSymbol||item.symbol,provider=adapter,url=item.url;
 if(adapter==='yahoo')symbol=yahooSymbol(item);
 else if(adapter==='nasdaq'){symbol=item.sourceSymbol||(/^us/.test(item.symbol)?item.symbol.slice(2).replace(/^\./,''):item.symbol);symbol=({IXIC:'COMP',INX:'SPX'})[symbol]||symbol;}
 else if(adapter==='coinbase'){if(!symbol.includes('-')){const match=/^(.*?)(USDT|USDC|USD|EUR|BTC|ETH)$/.exec(symbol);if(!match)throw Error('请输入Coinbase完整交易对');symbol=match[1]+'-'+match[2];}}
 else if(adapter==='crypto'){if(symbol.includes('-'))symbol=symbol.replace('-','');}
 else if(adapter==='tencent'&&item.provider!=='tencent'){if(/\.HK$/i.test(symbol))symbol='hk'+symbol.replace(/\.HK$/i,'').padStart(5,'0');else if(/\.S[ZS]$/i.test(symbol))symbol=(/\.SS$/i.test(symbol)?'sh':'sz')+symbol.slice(0,-3);else if(/^[A-Z][A-Z0-9-]*$/.test(symbol))symbol='us'+symbol;else throw Error('无法映射该代码，请填写所选来源的代码');}
 else if(adapter==='future'&&item.provider==='yahoo'){symbol=({'GC=F':'GC','SI=F':'SI','CL=F':'CL','BZ=F':'OIL','NG=F':'NG','HG=F':'HG'})[symbol];if(!symbol)throw Error('无法映射该代码，请填写所选来源的代码');}
 if(adapter==='custom'&&item.provider!=='custom'){if(!config.customTemplate)throw Error('请填写自定义数据源模板');url=config.customTemplate.replaceAll('{symbol}',encodeURIComponent(symbol)).replaceAll('{period}',encodeURIComponent(period));}
 return {item:{...item,provider,symbol,url},adapter,config};
}
export function sourceFetch(fetcher,value){const config=dataSources(value);return (input,init)=>{let url=new URL(input);const preset=endpointPresets.find(p=>new URL(p.base).origin===url.origin);if(preset){const base=config.endpoints[preset.key].replace(/\/+$/,'');url=new URL(base+url.pathname+url.search);}return fetcher(url.href,init);};}
export function sourceOrigins(value){const config=validateDataSources(value);return [...new Set([...Object.values(config.endpoints),...(config.customTemplate?[config.customTemplate.replaceAll('{symbol}','TEST').replaceAll('{period}','day')]:[])].map(url=>publicURL(url).origin+'/*'))];}

import test from 'node:test';import assert from 'node:assert/strict';
import{dataSources,routedInstrument,sourceFetch,validateDataSources,yahooSymbol}from'../src/data-sources.js';
import{marketPresets,bannerKey,parseBannerLines,fetchQuotes}from'../src/markets.js';
import{history,watchQuote}from'../src/watchlist.js';
import{supportsMinuteCandles}from'../src/minute-bars.js';
import{defaults}from'../src/core.js';import{syncSettings,restoreSettings}from'../src/config.js';
test('routing preserves legacy symbols, manual overrides and crypto quote currencies',()=>{
 const old={provider:'tencent',symbol:'usAAPL',type:'股票'};assert.equal(routedInstrument(old).item.symbol,'AAPL');assert.equal(routedInstrument(old).adapter,'nasdaq');
 assert.equal(routedInstrument({...old,dataSource:'native'}).adapter,'tencent');assert.equal(routedInstrument({...old,dataSource:'yahoo',sourceSymbol:'MSFT'}).item.symbol,'MSFT');
 assert.equal(routedInstrument({provider:'crypto',symbol:'BTCUSDT'},dataSources({routes:{crypto:'coinbase'}})).item.symbol,'BTC-USDT');
 assert.equal(yahooSymbol({provider:'tencent',symbol:'us.IXIC'}),'^IXIC');assert.equal(yahooSymbol({provider:'future',symbol:'GC'}),'GC=F');assert.throws(()=>yahooSymbol({provider:'future',symbol:'XAU'}));
});
test('source base URLs rewrite paths and queries and reject credentials and invalid routes',async()=>{
 const config=dataSources({endpoints:{nasdaq:'https://example.com/proxy'}});let requested;
 await sourceFetch(async url=>{requested=url;},config)('https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks');assert.equal(requested,'https://example.com/proxy/api/quote/AAPL/info?assetclass=stocks');
 assert.throws(()=>validateDataSources({routes:{us:'coinbase'}}));assert.throws(()=>validateDataSources({endpoints:{nasdaq:'https://user:pass@example.com'}}));assert.throws(()=>validateDataSources({routes:{us:'custom'}}));
 assert.equal(routedInstrument({provider:'nasdaq',symbol:'BRK-B'},dataSources({routes:{us:'custom'},customTemplate:'https://example.com/{symbol}?period={period}'}),'day').item.url,'https://example.com/BRK-B?period=day');
});
test('fund history is daily NAV, ETF is OHLC, and Nasdaq minute candles are disabled',async()=>{
 const rows=Array.from({length:190},(_,n)=>({date:new Date(Date.UTC(2025,0,n+1)).toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}),close:'$105',open:'$100',high:'$110',low:'$99',volume:'1,000'}));
 const fetcher=async()=>Response.json({data:{totalRecords:190,tradesTable:{rows}}});
 const fund={provider:'nasdaq',symbol:'VFIAX',type:'基金',nasdaqAssetClass:'mutualfunds'},etf={provider:'nasdaq',symbol:'SPY',type:'基金',nasdaqAssetClass:'etf'};
 const nav=await history(fund,'day',fetcher,true),bars=await history(etf,'day',fetcher,true);assert.equal(nav.bars.length,190);assert.ok(nav.isNAV);assert.equal(nav.bars[0].open,105);assert.equal(nav.bars[0].volume,null);assert.equal(bars.bars[0].open,100);assert.equal(bars.bars[0].volume,1000);assert.equal(supportsMinuteCandles(etf),false);
});
test('multi-asset banner presets remain distinct and isolate failures',async()=>{
 for(const symbol of ['au0','GC','CL','BTCUSDT','SPY','VFIAX'])assert.ok(marketPresets.some(i=>i.symbol===symbol));
 const items=parseBannerLines('Bitcoin | BTCUSDT | crypto | 加密货币\nApple | AAPL | nasdaq | 股票');assert.notEqual(bannerKey(items[0]),bannerKey(items[1]));
 const result=await fetchQuotes(items,async url=>{if(url.includes('nasdaq'))throw Error('offline');return Response.json({lastPrice:'110',openPrice:'100',closeTime:1792252800000});});assert.equal(result[0].price,110);assert.match(result[1].error,/offline/);
});
test('Coinbase reports exact quote currency and rolling 24h basis',async()=>{
 const quote=await watchQuote({provider:'crypto',symbol:'BTCUSDT',name:'BTC',type:'加密货币'},async url=>Response.json(url.endsWith('/stats')?{open:'100',high:'120',low:'90',volume:'5'}:{price:'110',time:'2026-10-18T00:00:00Z'}),{routes:{crypto:'coinbase'}});assert.equal(quote.currency,'USDT');assert.equal(quote.resolvedSymbol,'BTC-USDT');assert.equal(quote.change,10);assert.match(quote.basis,/24/);
});
test('public source settings round trip through Chrome configuration sync',()=>{
 const settings={...defaults,dataSources:dataSources({routes:{crypto:'coinbase'},endpoints:{yahoo:'https://query2.finance.yahoo.com'}})};
 const restored=restoreSettings({version:1,settings:syncSettings(settings)},defaults);assert.deepEqual(restored.dataSources,settings.dataSources);assert.ok(Buffer.byteLength(JSON.stringify({version:1,settings:syncSettings(settings)}))<7800);
});

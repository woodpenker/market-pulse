export async function collectFeeds(feeds,parse,fetcher=fetch){
 return Promise.all(feeds.map(async feed=>{
  try{const response=await fetcher(feed.url,{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
   const xml=await response.text();if(xml.length>3e6)throw Error('新闻源过大');const parsed=await parse(xml,feed.name);if(parsed.error)throw Error(parsed.error);
   if(!Array.isArray(parsed.items))throw Error('新闻源解析失败');return {name:feed.name,items:parsed.items};
  }catch(error){return {name:feed.name,items:[],error:error.message};}
 }));
}

// Reserve space for news, technology feeds and preferences in Chrome's local quota.
export function chartCache(entries,limit=5_000_000){
 const kept=[];let used=2;const encoder=new TextEncoder();
 for(const entry of entries){const size=encoder.encode(JSON.stringify(entry)).byteLength+1;if(used+size>limit)continue;kept.push(entry);used+=size;if(kept.length===12)break;}
 return kept;
}

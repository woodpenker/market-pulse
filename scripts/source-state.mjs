import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=createHash('sha256');
async function scan(relative=''){
 const entries=await readdir(new URL(relative,root),{withFileTypes:true});
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){const path=relative+entry.name;if(entry.isDirectory())await scan(path+'/');else if(/\.(js|mjs|json|html|css)$/.test(path)){hash.update(path+'\0');hash.update(await readFile(new URL(path,root)));}}
}
await scan();console.log(hash.digest('hex'));

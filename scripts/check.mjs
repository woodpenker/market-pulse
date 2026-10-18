import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const directory of ['src','bridge'])for(const name of await readdir(new URL('../'+directory+'/',import.meta.url))){
 if(!/\.(mjs|js)$/.test(name))continue;
 const result=spawnSync(process.execPath,['--check',new URL('../'+directory+'/'+name,import.meta.url).pathname],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
console.log('All extension and login bridge scripts passed syntax checks.');

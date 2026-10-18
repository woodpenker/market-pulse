import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'market-pulse-mutation-'));
const original=await readFile(new URL('../bridge/security.mjs',import.meta.url),'utf8');
const mutants=[
 ['Origin guard removed','origin === `chrome-extension://${extensionId}`','true'],
 ['Nonce equality bypassed','claims.nonce !== nonce','false'],
 ['Interrupted stream accepted','if(!completed || !text.trim())','if(!text.trim())']
];
try{
 await mkdir(join(directory,'bridge'));await mkdir(join(directory,'test'));
 await copyFile(new URL('../test/bridge.test.js',import.meta.url),join(directory,'test','bridge.test.mjs'));
 for(const [name,from,to] of mutants){
  if(original.split(from).length!==2)throw Error('Mutant source must match exactly once: '+name);
  // Per-mutant code marker proves this exact module was loaded; tests run in a fresh process.
  const marker='MUTANT_EXECUTED:'+name;
  const modified=`console.error(${JSON.stringify(marker)});\n`+original.replace(from,to);
  await writeFile(join(directory,'bridge','security.mjs'),modified);
  for(const propertyOnly of [false,true]){
   const args=['--test',...(propertyOnly?['--test-name-pattern=property']:[]),join(directory,'test','bridge.test.mjs')];
   const result=spawnSync(process.execPath,args,{encoding:'utf8'});
   if(result.error||result.status!==1||!(result.stdout+result.stderr).includes(marker)||!result.stdout.includes('not ok'))throw Error('Mutant survived or execution was not proven: '+name+'\n'+result.stdout+result.stderr);
  }
  console.log('KILLED in full suite and properties: '+name);
 }
 // Baseline negative control: the same unchanged suite must pass on restored source.
 await writeFile(join(directory,'bridge','security.mjs'),original);
 const baseline=spawnSync(process.execPath,['--test',join(directory,'test','bridge.test.mjs')],{encoding:'utf8'});
 if(baseline.status!==0)throw Error('Restored source baseline failed: '+baseline.stdout+baseline.stderr);
 console.log('Manual mutation: 3/3 killed; baseline restored and passed.');
}finally{await rm(directory,{recursive:true,force:true});}

import {spawnSync} from 'node:child_process';
import {readdir,mkdtemp,mkdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.chdir(new URL('../',import.meta.url).pathname);
function run(args,expected=0){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error||r.status!==expected)throw Error('Check failed: '+args.join(' '));}
// A known invalid input must cause our syntax gate to fail.
const control=await mkdtemp(join(tmpdir(),'market-pulse-check-control-'));
try{
 for(const name of ['src','bridge','scripts'])await mkdir(join(control,name));
 await copyFile('scripts/check.mjs',join(control,'scripts','check.mjs'));
 await writeFile(join(control,'src','broken.js'),'const = ;');
 const bad=spawnSync(process.execPath,[join(control,'scripts','check.mjs')],{encoding:'utf8'});
 if(bad.status!==1||!bad.stderr.includes('SyntaxError'))throw Error('Syntax negative control failed');
 console.log('Syntax negative control: rejected invalid source.');
}finally{await rm(control,{recursive:true,force:true});}
run(['scripts/check.mjs']);
run(['--test','--experimental-test-coverage','--test-coverage-include=bridge/security.mjs','--test-coverage-lines=100','--test-coverage-branches=75','--test-coverage-functions=80']);
const files=(await readdir('test')).filter(n=>n.endsWith('.test.js')).sort();let seed=17;
for(let i=files.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[files[i],files[j]]=[files[j],files[i]];}
run(['--test',...files.map(f=>'test/'+f)]);
console.log('Suite health: shuffled file order, seed 17.');
run(['scripts/mutation.mjs']);
run(['scripts/browser-smoke.mjs']);
run(['scripts/source-state.mjs']);

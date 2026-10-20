import { readFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const release=JSON.parse(await readFile(new URL('../config/provisional-preview.json',import.meta.url),'utf8'));
const survey=await readFile(new URL('../public/research/street-survey.json',import.meta.url));
if(createHash('sha256').update(survey).digest('hex')!==release.surveySha256)throw Error('Provisional preview pin mismatch');
if(release.mode!=='provisional'||release.status!=='ready'||!release.zone)throw Error('Provisional preview requires a reviewed bounded source scope and connected source-listed jobs, not full verified coverage.');
for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']]){
  const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,ROADSTER_PROVISIONAL_ONLY:'1'},stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
}
await copyFile(new URL('../dist/preview.html',import.meta.url),new URL('../dist/index.html',import.meta.url));
await rm(new URL('../dist/sw.js',import.meta.url),{force:true});
console.log(JSON.stringify({mode:'provisional',surveyRevision:release.surveyRevision,root:'dist/index.html',verifiedModeUnchanged:true}));

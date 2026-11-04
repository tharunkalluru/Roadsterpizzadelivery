import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir=await mkdtemp(join(tmpdir(),'roadster-character-release-'));
try{
  const outfile=join(dir,'audit.mjs');
  await build({stdin:{contents:"export { auditCampaignCharacters } from './src/delivery/art/campaign-release'; export { DELIVERY_LEVELS } from './src/delivery/content/levels';",resolveDir:resolve('.')},outfile,bundle:true,platform:'node',format:'esm',logLevel:'error'});
  const {auditCampaignCharacters,DELIVERY_LEVELS}=await import(pathToFileURL(outfile).href);
  const records=auditCampaignCharacters(DELIVERY_LEVELS),withheld=records.filter(r=>!r.allowed);
  for(const r of records)console.log(`Level ${r.level}: ${r.characterId} — ${r.allowed?'APPROVED':r.status.toUpperCase()}`);
  console.log(`${records.length-withheld.length}/${records.length} character appearances approved. ${withheld.length?'Campaign publication is blocked.':'Campaign character gate passed.'}`);
  if(withheld.length)process.exitCode=1;
}finally{await rm(dir,{recursive:true,force:true});}

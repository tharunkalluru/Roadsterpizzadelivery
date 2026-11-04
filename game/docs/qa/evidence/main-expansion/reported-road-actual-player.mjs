import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'reported-road-actual-player-'));
try{
  const output=join(directory,'probe.mjs');
  const bundled=await build({entryPoints:[join(dirname(fileURLToPath(import.meta.url)),'reported-road-actual-player.ts')],outfile:output,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,
    define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});
  const inputs=[...Object.keys(bundled.metafile.inputs).filter(file=>!file.includes('node_modules/')),'package-lock.json'];
  const hashes=Object.fromEntries(await Promise.all(inputs.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
  const result=spawnSync(process.execPath,[output,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,ROAD_ACTUAL_PLAYER_SOURCE_HASHES:JSON.stringify(hashes)}});process.exitCode=result.status??1;
}finally{await rm(directory,{recursive:true,force:true});}

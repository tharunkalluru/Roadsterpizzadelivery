import { build } from 'esbuild';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const root = process.cwd();
const files = (await readdir('tests')).filter(f => f.endsWith('.test.ts') && (!process.argv[2] || f.includes(process.argv[2]))).sort();
if (!files.length) throw new Error('No matching behavioral tests found');
const dir = await mkdtemp(join(tmpdir(), 'roadster-tests-'));
try {
  const outputs=[];
  for (const file of files) {
    const out=join(dir,file.replace(/\.ts$/,'.mjs')); outputs.push(out);
    await build({entryPoints:[resolve('tests',file)],outfile:out,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error'});
  }
  const code=await new Promise(resolveCode=>{const child=spawn(process.execPath,['--test',...outputs],{stdio:'inherit',cwd:root});child.on('exit',resolveCode);});
  process.exitCode=code ?? 1;
} finally { await rm(dir,{recursive:true,force:true}); }

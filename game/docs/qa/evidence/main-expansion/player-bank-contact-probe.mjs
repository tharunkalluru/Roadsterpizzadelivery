import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'player-bank-contact-'));
try {
  const output = join(directory, 'probe.mjs');
  await build({ entryPoints: [join(dirname(fileURLToPath(import.meta.url)), 'player-bank-contact-probe.ts')],
    outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const result = spawnSync(process.execPath, [output, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }

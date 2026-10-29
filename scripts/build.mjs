import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
rmSync('dist', { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist/client'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: false });
// The Site host provisions DB from the logical hosting binding. This UUID is
// the Sites starter's documented local placeholder, never a production DB ID.
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
config.main = 'index.js'; config.assets.directory = '../client'; config.d1_databases[0].migrations_dir = '../../drizzle';
writeFileSync('dist/server/wrangler.json', JSON.stringify(config, null, 2) + '\n');
// Public release identity lets QA distinguish the active build from a saved
// Site version without exposing any runtime or account state.
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
if (revision.status !== 0) throw new Error('Build requires a committed source revision.');
writeFileSync('dist/client/build-info.json', JSON.stringify({
  sourceCommit: revision.stdout.trim(),
  baseline: '02f6abef4946b701ebca6d66d51257e2c5f638be',
  release: 'mystery-deliveries-v1',
}) + '\n');
mkdirSync('dist/.openai', { recursive: true });
try { cpSync('.openai/hosting.json', 'dist/.openai/hosting.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Built game assets + bounded bug-report Worker.');

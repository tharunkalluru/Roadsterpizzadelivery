import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { gameBuildFingerprint } from './build-fingerprint.mjs';
import { packageLosslessAssets, expandedDirectoryBytes, LOSSLESS_ASSET_PREFIX } from './asset-transport.mjs';
const profiles = spawnSync(process.execPath, ['scripts/audit-required-fixes-release.mjs'], { stdio: 'inherit' });
if (profiles.status !== 0) process.exit(profiles.status || 1);
rmSync('dist', { recursive: true, force: true });
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist/client'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const losslessAssets = await packageLosslessAssets(process.cwd());
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: false,
  define: { __LOSSLESS_ASSETS__: JSON.stringify(losslessAssets) } });
// The Site host provisions DB from the logical hosting binding. This UUID is
// the Sites starter's documented local placeholder, never a production DB ID.
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
config.main = 'index.js'; config.assets.directory = '../client'; config.d1_databases[0].migrations_dir = '../../drizzle';
config.assets.run_worker_first = [...new Set([...(Array.isArray(config.assets.run_worker_first) ? config.assets.run_worker_first : ['/api/*']), ...losslessAssets.map(entry => entry.path), `${LOSSLESS_ASSET_PREFIX}*`])];
writeFileSync('dist/server/wrangler.json', JSON.stringify(config, null, 2) + '\n');
writeFileSync('dist/server/asset-transport.json', JSON.stringify({ schemaVersion: 1, assets: losslessAssets }, null, 2) + '\n');
// Public release identity lets QA distinguish the active build from a saved
// Site version without exposing any runtime or account state.
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
if (revision.status !== 0) throw new Error('Build requires a committed source revision.');
const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' });
if (status.status !== 0) throw new Error('Cannot verify build source status.');
writeFileSync('dist/client/build-info.json', JSON.stringify({
  sourceCommit: revision.stdout.trim(),
  sourceDirty: Boolean(status.stdout.trim()),
  buildFingerprint: gameBuildFingerprint(process.cwd()),
  baseline: '02f6abef4946b701ebca6d66d51257e2c5f638be',
  release: 'fourteen-required-game-fixes-20261105',
  roadData: 'existing-live-road-baseline-a679b72',
}) + '\n');
mkdirSync('dist/.openai', { recursive: true });
try { cpSync('.openai/hosting.json', 'dist/.openai/hosting.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const expandedBytes = await expandedDirectoryBytes('dist'), maximumBytes = 256 * 1024 * 1024;
if (expandedBytes > maximumBytes) throw new Error(`Site package expands to ${expandedBytes} bytes; maximum is ${maximumBytes}.`);
console.log(`Built lossless game assets + reporting Worker: ${losslessAssets.length} packed assets; ${expandedBytes} expanded bytes (limit ${maximumBytes}).`);

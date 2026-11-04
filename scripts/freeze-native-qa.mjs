import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Native controls need a fixed build while other source work continues. This
// development-guard snapshot is deliberately separate from release packaging.
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node scripts/freeze-native-qa.mjs SOURCE /tmp/roadster-final-frozen-qa-UNIQUE');
const source = resolve(process.argv[2]), output = resolve(process.argv[3]);
if (!output.startsWith('/tmp/roadster-final-frozen-qa-')) throw Error('Use a new QA directory with the required /tmp prefix.');
try { await access(output); throw Error('Preserve existing QA snapshots; select a new directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
process.chdir(source);
const { gameBuildFingerprint } = await import(pathToFileURL(join(source, 'scripts/build-fingerprint.mjs')).href);
const before = gameBuildFingerprint(source);
const catalog = JSON.parse(await readFile('src/delivery/art/character-assets.json', 'utf8'));
const reviews = JSON.parse(await readFile('src/delivery/art/character-reviews.json', 'utf8'));
if (!catalog.assets.length || catalog.assets.some(asset => !reviews.records.some(review => review.status === 'approved' && review.characterId === asset.characterId && review.candidate.sha256 === asset.candidate.sha256))) throw Error('Native QA requires every exact appearance to have an approved review.');
process.env.NODE_ENV = 'development';
const { build } = await import(pathToFileURL(join(source, 'node_modules/vite/dist/node/index.js')).href);
await build({ root: source, configFile: join(source, 'vite.config.ts'), define: { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' },
  build: { outDir: output, emptyOutDir: false, rollupOptions: { input: ['index.html', 'tests/browser/npc-people.html', 'tests/browser/metro-access.html', 'tests/browser/traffic-vehicles.html', 'tests/browser/character-performance.html'].map(file => join(source, file)) } } });
if (gameBuildFingerprint(source) !== before) throw Error('Runtime source changed during the QA freeze. Preserve this incomplete snapshot and retry at a new path.');
const bundles = [];
for (const file of (await readdir(join(output, 'assets'))).sort()) if (/\.(js|css)$/.test(file)) {
  const bytes = await readFile(join(output, 'assets', file));
  bundles.push({ path: 'assets/' + file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifest = { schemaVersion: 1, capturedAt: new Date().toISOString(), purpose: 'Instrumented native-control QA snapshot; never a publication archive.',
  sourceCheckout: source, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim(), runtimeFingerprint: before,
  qaOnlyDifference: 'Vite DEV guards enabled for visible diagnostic controls and passive evidence export; no timing/camera/quality override.',
  models: catalog.assets.map(asset => ({ characterId: asset.characterId, candidate: asset.candidate, glb: asset.glb })), bundles, noPrivateDocsCopied: true };
await writeFile(join(output, 'qa-build-identity.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(output + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ directory: output, runtimeFingerprint: before, approvedAppearances: manifest.models.length, bundles: bundles.length }));

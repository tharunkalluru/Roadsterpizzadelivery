// Build only; do not launch a browser or alter src.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const outAt=process.argv.indexOf('--out'); const out = outAt>=0 ? process.argv[outAt+1] : 'output/playwright/roadster-visual-fixture-repro'; mkdirSync(out, { recursive: true });
const vehicles = resolve('src/world/vehicles.ts'), candidate = readFileSync(vehicles, 'utf8');
const at = process.argv.indexOf('--baseline-ref'), baselineRef = at >= 0 ? process.argv[at + 1] : '6390d3ed7d763ccd6c8cf64b028a8af2a418dcd4';
const original = execFileSync('git', ['show', `${baselineRef}:src/world/vehicles.ts`], { encoding: 'utf8' });
if (original.includes('outer.userData.staticBatching') || !candidate.includes('outer.userData.staticBatching')) throw new Error('Expected explicit pre-batching baseline and enabled current candidate');
const sourceHash = createHash('sha256').update(candidate).digest('hex');
for (const variant of ['baseline', 'candidate']) {
  await build({ entryPoints: ['scripts/qa/roadster-fixture-entry.ts'], outfile: `${out}/${variant}.js`, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    define: { FIXTURE_VARIANT: JSON.stringify(variant), FIXTURE_SOURCE_HASH: JSON.stringify(createHash('sha256').update(variant === 'baseline' ? original : candidate).digest('hex')) },
    plugins: [{ name: 'verified-roadster-reference', setup(builder) {
      builder.onLoad({ filter: /[/\\]src[/\\]world[/\\]vehicles\.ts$/ }, () => ({ contents: variant === 'baseline' ? original : candidate, loader: 'ts', resolveDir: resolve('src/world') }));
    } }] });
  writeFileSync(`${out}/${variant}.html`, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./fonts/fonts.css"><style>html,body{margin:0;background:#17132b;width:1280px;height:720px;overflow:hidden}#game{width:1280px;height:720px}canvas{display:block}</style></head><body><div id="game"></div><script type="module" src="./${variant}.js"></script></body></html>`);
}
cpSync('public/fonts', `${out}/fonts`, { recursive: true });
writeFileSync(`${out}/manifest.json`, JSON.stringify({ kind: 'prepared synthetic fixture; browser not executed', sourceHash, baselineRef, baselineSourceHash: createHash('sha256').update(original).digest('hex'), variants: ['baseline', 'candidate'],
  views: ['front', 'rear', 'side', 'wheel'], moods: ['day', 'night'], poseQueries: ['deploy=0&steer=0&roll=0&flip=0', 'deploy=.5&steer=.6&roll=1.2&flip=0', 'deploy=1&steer=-.7&roll=2.8&flip=1.1'],
  note: 'Both bundles import actual Player/Engine and use real materials, labels, textures, PMREM, shadows and animation references. Baseline replaces only roadster source with the explicit Git reference; candidate uses current enabled batching. Actual Player/Engine are shared. No src changes or gameplay proof.' }, null, 2) + '\n');
console.log(`Prepared ${out}; source unchanged; browser not run.`);

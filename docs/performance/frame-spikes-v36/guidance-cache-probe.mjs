// Run from repository root: node docs/performance/frame-spikes-v36/guidance-cache-probe.mjs
// CPU fixture only; no browser/GPU/mobile certification. Both variants use the
// same real packed city and exact same routes, collision data and settings.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const baseline = '2a19b975bb26751c032b819f80e9dbbf57d806d4';
async function bundle(contents, plugins = []) {
  const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, plugins });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const baselinePlugin = { name: 'pre-cache-guidance', setup(b) {
  b.onLoad({ filter: /src\/game\/(physics|route-guidance)\.ts$/ }, args => {
    const relative = args.path.slice(process.cwd().length + 1);
    return { contents: execFileSync('git', ['show', `${baseline}:${relative}`], { encoding: 'utf8' }), loader: 'ts' };
  });
} };
const before = await bundle("export * from './src/game/route-guidance';", [baselinePlugin]);
const after = await bundle("export * from './src/game/route-guidance';");
const { packedDriveWorld } = await bundle("export {packedDriveWorld} from './tests/fixtures/packed-drive-world';");
const { city, graph } = packedDriveWorld({ x: 0, z: 0 });
const routes = [[700, 0], [0, 700], [-700, 0], [0, -700]].map(([x, z]) => graph.route(0, 0, x, z)?.pts).filter(Boolean);
const prepare = (mod, route) => mod.clearRoadGuidance(city, mod.softenRoadCorners(city, route));
for (const route of routes) assert.deepEqual(prepare(before, route), prepare(after, route));
function stats(mod) {
  for (let i = 0; i < 15; i++) for (const route of routes) prepare(mod, route);
  const values = [];
  for (let i = 0; i < 40; i++) for (const route of routes) {
    const start = performance.now(); prepare(mod, route); values.push(performance.now() - start);
  }
  values.sort((a, b) => a - b);
  return { count: values.length, p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) };
}
console.log(JSON.stringify({ baseline, fixture: 'packedDriveWorld centre0,0 targets +/-700 on each axis', outputEquality: true,
  routePoints: routes.map(r => r.length), guidePoints: routes.map(r => prepare(after, r).pts.length), before: stats(before), after: stats(after) }, null, 2));

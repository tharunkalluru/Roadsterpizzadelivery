import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let temporary, api;
test.before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'road-scenery-width-'));
  const bundle = join(temporary, 'api.mjs');
  const manifestPath = process.env.ROADSTER_SCENERY_CLEARANCE_STAGE;
  const manifest = manifestPath ? JSON.parse(await readFile(manifestPath)) : null;
  const held = new Map();
  const overlays = new Map((manifest?.changes || []).map(row => [resolve(row.path), row]));
  await build({ plugins: [{ name: 'explicit-held-scenery-candidate', setup(builder) {
    builder.onLoad({ filter: /\.[cm]?[jt]s$/ }, async ({ path }) => {
      const selected = overlays.get(resolve(path)), file = selected ? selected.stagePath : path;
      const contents = await readFile(file), digest = createHash('sha256').update(contents).digest('hex');
      if (selected) assert.equal(digest, selected.afterSHA256);
      held.set(file, digest);
      return { contents, loader: path.endsWith('.ts') ? 'ts' : 'js' };
    });
  } }], stdin: { contents: "export * from './src/world/road-pavement'; export * from './src/world/fitted-road-scenery-clearance'; export {roadRibbon} from './src/world/bridge-clearance';",
    resolveDir: resolve('.'), loader: 'ts' }, outfile: bundle, bundle: true,
    platform: 'node', format: 'esm', logLevel: 'error' });
  api = await import(pathToFileURL(bundle));
  for (const [file, digest] of held) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'), digest);
});
test.after(async () => { await rm(temporary, { recursive: true, force: true }); });

const road = fields => ({ id: 'scenery-test', cls: 'secondary', w: 6, pts: [[0, 0], [100, 0]], ...fields });

test('post-fit raised pavement clears furniture without mutating transport widths, road or native geometry', () => {
  for (const elev of [[0, 0], [1.2, 0], [1.200001, 0], [6.8, 0], [-4, -2]]) {
    const value = road({ elev });
    const snapshot = structuredClone(value), ribbon = api.roadRibbon(value, [value]);
    const legacy = api.roadClearanceWidth(value), support = api.roadSupportWidth(value);
    const clearance = api.roadSceneryClearanceWidth(value);
    assert.ok(clearance >= api.roadPavementWidth(value, 0));
    assert.equal(clearance, elev.some(y => y > 1.2) ? 8.4 : 6);
    assert.equal(api.roadClearanceWidth(value), legacy);
    assert.equal(api.roadSupportWidth(value), support);
    assert.deepEqual(api.roadRibbon(value, [value]), ribbon);
    assert.deepEqual(value, snapshot);
  }
});

test('actual declared single lane remains narrow, while source and retained historical margins remain conservative', () => {
  const declared = road({ w: 4.5, elev: [3, 3], lanes: 1, oneway: 'forward',
    sourceLaneIntervals: [{ from: 0, to: 100, lanes: 1, oneway: true }] });
  assert.equal(api.roadSceneryClearanceWidth(declared), 4.5);
  assert.equal(api.roadSceneryClearanceWidth({ ...declared, sourceLaneIntervals: undefined }), 8.4);
  assert.equal(api.roadSceneryClearanceWidth(road({ elev: [0, 0], sceneryWidth: 11 })), 11);
  assert.equal(api.roadSceneryClearanceWidth(road({ w: 12, elev: [3, 3] })), 12);
});

test('joined and tapered pavement is cleared across its full rendered width', () => {
  for (const profile of [
    { physicalWidth: 6, originalWidth: 10, sourceWidth: 12, intervals: [[40, 60]], taper: 20 },
    { physicalWidth: 9, originalWidth: 7, intervals: [[0, 20]], taper: 20 }
  ]) {
    const value = road({ joinedPavement: profile });
    for (let distance = 0; distance <= 100; distance += 5) {
      assert.ok(api.roadSceneryClearanceWidth(value) >= api.roadPavementWidth(value, distance));
    }
  }
});

// Covered path extraction and rendering regressions. No network, browser or hidden game state.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-covered-path-'));
let checks = 0;
const test = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export {drawExtras, osmPathKind} from './game/src/world/extras'; export {buildTile} from './game/src/world/city'; export {supportAt} from './game/src/game/physics'; export {initTemplates} from './game/src/core/util';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { drawExtras, osmPathKind, buildTile, supportAt, initTemplates } = await import(pathToFileURL(join(temp, 'test.mjs')));
  initTemplates();
  const cases = [
    [{ highway: 'cycleway', covered: 'yes', name: 'Healthway' }, 'covered_path'],
    [{ highway: 'footway', covered: 'yes' }, 'covered_path'],
    [{ highway: 'path', covered: 'yes', bridge: 'no', layer: '0' }, 'covered_path'],
    [{ highway: 'corridor', covered: 'yes', layer: 'n/a' }, 'covered_path'],
    [{ highway: 'cycleway', covered: 'yes', layer: 'Infinity' }, 'covered_path'],
    [{ highway: 'footway', covered: 'yes', layer: '1' }, 'footbridge'],
    [{ highway: 'steps', covered: 'yes', bridge: 'yes', layer: '2' }, 'footbridge'],
    [{ highway: 'footway', bridge: 'viaduct' }, 'footbridge'],
    [{ highway: 'footway', bridge: 'yes', tunnel: 'yes', covered: 'yes' }, 'subway'],
    [{ highway: 'path', covered: 'yes', layer: '-1' }, 'subway'],
    [{ highway: 'cycleway', tunnel: 'yes' }, 'subway'],
    [{ highway: 'footway', covered: 'no', bridge: 'no', tunnel: 'no' }, null],
    [{ highway: 'cycleway' }, null],
    [{ highway: 'motorway', covered: 'yes' }, null],
    [{ railway: 'rail', covered: 'yes' }, null],
  ];
  await test('cover alone remains at grade while positive bridge layers and underground paths retain their levels', () => {
    for (const [tags, expected] of cases) assert.equal(osmPathKind(tags), expected, JSON.stringify(tags));
  });
  await test('future extraction and runtime classifiers agree, and covered paths survive the export whitelist', async () => {
    const input = JSON.stringify(cases.map(([tags]) => tags));
    const program = `import ast,json,sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(sys.argv[1])/'pipeline'))\nfrom osm_path_kind import path_kind\ntags=json.loads(sys.stdin.read())\nextract=ast.parse((Path(sys.argv[1])/'pipeline/osm_extract.py').read_text())\nfn=next(x for x in extract.body if isinstance(x,ast.FunctionDef) and x.name=='kind_of')\nscope={'path_kind':path_kind}\nexec(compile(ast.Module(body=[fn],type_ignores=[]),'<kind_of>','exec'),scope)\nresults=[path_kind(t) for t in tags]\nfor t,result in zip(tags,results):\n if result is not None: assert scope['kind_of'](t)==result\nexport=ast.parse((Path(sys.argv[1])/'pipeline/add_osm.py').read_text())\nassignments={n.targets[0].id:ast.literal_eval(n.value) for n in export.body if isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ('KINDS','TAGS')}\nassert 'covered_path' in assignments['KINDS']\nassert all(t in assignments['TAGS'] for t in ('highway','covered','bridge','layer','tunnel','width'))\nprint(json.dumps(results))`;
    const output = execFileSync(process.env.PYTHON || 'python3', ['-c', program, root], { input, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), cases.map(([, expected]) => expected));
  });
  const fixture = (overrides = {}) => {
    const records = [], pads = [], signs = [], obstacles = [];
    const batches = Object.fromEntries(['st', 'foot', 'lit', 'marks', 'roof'].map(mat => [mat, Object.fromEntries(['box', 'add', 'quad', 'tri'].map(method => [method, (...args) => records.push({ mat, method, args })]))]));
    const C = { B: batches, lowQ: false, inTile: () => true, nearestRoad: () => null, onRoad: () => false, inBuilding: () => false,
      obstacle: (...args) => obstacles.push(args), wall: () => {}, solid: () => {}, sign: (...args) => signs.push(args), lamp: () => {}, pad: (...args) => pads.push(args), ...overrides };
    return { records, pads, signs, obstacles, C };
  };
  const feature = (tags = {}, extra = {}) => ({ id: 'covered-fixture', k: 'footbridge', l: [[100, 500], [900, 500]], t: { highway: 'cycleway', covered: 'yes', name: 'Healthway', ...tags }, ...extra });
  await test('legacy Healthway pack tags render a ground cycle path and low solar roof without elevated deck or stair towers', () => {
    const f = feature(), original = JSON.stringify(f), out = fixture(); drawExtras([f], out.C);
    assert.equal(JSON.stringify(f), original, 'rendering must not rewrite original feature kind, tags or coordinates');
    assert.ok(out.pads.length > 0); assert.ok(out.pads.every(p => p[4] >= 0 && p[4] < .1 && p[5] === 2.25));
    const boxes = out.records.filter(r => r.method === 'box');
    assert.ok(boxes.some(r => r.args[6] === '#24405e'), 'verified Healthway retains a solar-panel roof');
    assert.ok(boxes.filter(r => r.mat === 'marks').length >= out.pads.length * 2, 'three cycling lanes remain visible');
    assert.ok(boxes.every(r => r.args[1] + r.args[4] / 2 < 3.4), 'a weather canopy must not become a6.6m skywalk');
    assert.ok(out.obstacles.length > 0 && out.obstacles.every(p => p[2] < .2 && p[3] < 3.4), 'roof columns replace elevated stair towers');
  });
  await test('ordinary covered footpaths receive simple ground roofs and do not claim solar infrastructure', () => {
    const out = fixture(); drawExtras([feature({ highway: 'footway', name: 'Covered walk' })], out.C);
    assert.ok(out.pads.length > 0); assert.ok(out.pads.every(p => p[4] < .1 && p[5] === 1.2));
    assert.ok(!out.records.some(r => r.args.includes('#24405e'))); assert.equal(out.records.filter(r => r.mat === 'marks').length, 0);
    assert.ok(out.records.every(r => r.method !== 'box' || r.args[1] + r.args[4] / 2 < 3.4));
  });
  await test('tile integration provides ground support under Healthway without an elevated skywalk surface', () => {
    const zone = { i: 0, j: 0, roads: [], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [feature()] };
    const built = buildTile(zone, { lowQ: true });
    for (const fromY of [0, 6.8]) {
      const support = supportAt(built, 500, 500, fromY);
      assert.equal(support.kind, 'pad'); assert.ok(Math.abs(support.y - .055) < 1e-8);
    }
    const surfaces = [...new Set([...built.surfaceGrid.values()].flat())];
    assert.ok(surfaces.length > 0 && surfaces.every(s => s.ya < .1 && s.yb < .1));
    for (const buffer of built.buffers) for (let i = 1; i < buffer.pos.length; i += 3) assert.ok(buffer.pos[i] < 3.4, 'no6.6m deck or elevated stair geometry survives');
  });
  await test('explicit elevated covered bridges still have their deck, roof and stairs', () => {
    for (const tags of [{ bridge: 'yes' }, { layer: '1' }]) {
      const out = fixture(); drawExtras([feature({ highway: 'footway', name: 'Foot overbridge', ...tags })], out.C);
      assert.ok(out.pads.some(p => p[4] > 6.5));
      assert.ok(out.obstacles.some(p => p[2] >= 1.6), 'real overbridge stairs are preserved');
      assert.ok(out.records.some(r => r.method === 'box' && r.args[1] > 9));
    }
  });
  await test('explicit tunnel and negative-layer legacy paths retain subway entrances rather than solar roofs', () => {
    for (const tags of [{ tunnel: 'yes' }, { layer: '-1' }]) {
      const out = fixture(); drawExtras([feature({ highway: 'footway', name: 'Subway', ...tags })], out.C);
      assert.equal(out.pads.length, 0); assert.ok(out.signs.some(s => s[1] === 'SUBWAY'));
      assert.ok(!out.records.some(r => r.args.includes('#24405e')));
    }
  });
  await test('new covered_path exports and legacy footbridge packs produce the same geometry', () => {
    const old = fixture(), updated = fixture(); drawExtras([feature()], old.C); drawExtras([feature({}, { k: 'covered_path' })], updated.C);
    assert.deepEqual(updated.records, old.records); assert.deepEqual(updated.pads, old.pads); assert.deepEqual(updated.obstacles, old.obstacles);
  });
  await test('long covered paths have local tile ownership and never draw their whole canopy from a distant midpoint', () => {
    const f = feature({}, { l: [[100, 500], [1900, 500]] });
    const left = fixture({ inTile: (x, z) => x >= 0 && x < 1000 && z >= 0 && z < 1000 });
    const right = fixture({ inTile: (x, z) => x >= 1000 && x < 2000 && z >= 0 && z < 1000 });
    drawExtras([f], left.C); drawExtras([f], right.C);
    assert.ok(left.pads.some(p => p[0] <= 500 && p[2] >= 500)); assert.ok(right.pads.some(p => p[0] <= 1500 && p[2] >= 1500));
    assert.ok(left.pads.every(p => (p[0] + p[2]) / 2 < 1000)); assert.ok(right.pads.every(p => (p[0] + p[2]) / 2 >= 1000));
    const owned = new Set(left.pads.map(p => JSON.stringify(p)));
    assert.ok(right.pads.every(p => !owned.has(JSON.stringify(p))));
  });
  await test('canopy columns stay out of roads and buildings, and low-quality mode retains the solar roof', () => {
    const blocked = fixture({ onRoad: () => true }), built = fixture({ inBuilding: () => true }), low = fixture({ lowQ: true });
    drawExtras([feature()], blocked.C); drawExtras([feature()], built.C); drawExtras([feature()], low.C);
    assert.equal(blocked.obstacles.length, 0); assert.equal(built.obstacles.length, 0);
    assert.ok(low.pads.length > 0 && low.records.some(r => r.args.includes('#24405e')));
  });
  await test('all shipped Healthway covered ways are recognized at grade without deleting or rewriting source evidence', async () => {
    const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm')))), found = new Map();
    for (const pack of core.packs) {
      const data = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', pack.file))));
      for (const tile of Object.values(data.tiles)) for (const f of tile.osm || []) if (f.l && f.t.highway === 'cycleway' && f.t.name === 'Healthway' && f.t.covered === 'yes') found.set(f.id, f);
    }
    assert.ok(found.size >= 20, 'shipped Healthway source coverage must remain present');
    for (const f of found.values()) { assert.equal(osmPathKind(f.t), 'covered_path', f.id); const out = fixture({ lowQ: true }); drawExtras([f], out.C); assert.ok(out.pads.length > 0 && out.pads.every(p => p[4] < .1), f.id); }
    console.log(`Inspected ${found.size} original Healthway ways with their unchanged source tags.`);
  });
  console.log(`${checks} covered-path regression groups passed (offline production rendering and extraction classifiers).`);
} finally { await rm(temp, { recursive: true, force: true }); }

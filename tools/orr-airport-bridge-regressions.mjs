// Production geometry regressions, not a substitute for normal-world driving.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'orr-airport-bridge-'));
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export { drawExtras, tollLaneLayout } from './game/src/world/extras'; export * from './game/src/world/airfields'; export * from './game/src/world/airport-aircraft'; export { drawDurgamBridge, DURGAM_BRIDGE } from './game/src/world/durgam-bridge'; export { Kit } from './game/src/world/landmarks'; export * from './game/src/world/landmark-support'; export { captureLandmarkBatches } from './game/src/world/landmark-support-capture'; export { initTemplates, TiledBatch } from './game/src/core/util';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'checks.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const m = await import(pathToFileURL(join(temp, 'checks.mjs'))); m.initTemplates();
  const hit = (id, x, z, width, lanes, y = 0) => ({ e: { id, lanes }, cx: x, cz: z, hx: 1, hz: 0, w: width, y, d: 0 });
  const tollFixture = (nearestRoad, inTile = () => true) => {
    const boxes = [], signs = [], obstacles = [];
    return { boxes, signs, obstacles, context: { B: { st: { box: (...a) => boxes.push(a) }, lit: { box() {} } }, nearestRoad, inTile, lowQ: true,
      sign: (...a) => signs.push(a), obstacle: (...a) => obstacles.push(a), onRoad: () => false, inBuilding: () => false, wall() {}, solid() {}, lamp() {}, pad() {} } };
  };
  const toll = (id, p) => ({ id, k: 'toll', p, t: {} });
  await test('a one-lane ramp retains one driveable booth gap instead of being split in half', () => {
    const r = hit('ramp', 0, 0, 5, 1), f = tollFixture(() => r);
    m.drawExtras([toll('entry', [0, 0])], f.context);
    assert.deepEqual(m.tollLaneLayout(r), { lanes: 1, laneWidth: 5, width: 5 });
    assert.equal(f.obstacles.length, 2); assert.ok(f.obstacles.every(o => Math.abs(o[1]) === 2.5));
    assert.ok(f.obstacles[1][1] - f.obstacles[0][1] - 1.5 >= 3.4, 'full-car clearance between collidable booth envelopes');
  });
  await test('ORR four-lane metadata controls booth count rather than counting shoulders as a fifth lane', () => {
    const r = hit('main', 0, 0, 17.5, 4), f = tollFixture(() => r);
    m.drawExtras([toll('entry', [0, 0])], f.context);
    assert.equal(m.tollLaneLayout(r).lanes, 4); assert.equal(f.obstacles.length, 5);
    assert.ok(m.tollLaneLayout(r).laneWidth - 1.5 >= 2.5);
  });
  await test('nearby entry and exit carriageways each retain their own toll canopy', () => {
    const f = tollFixture((x, z) => hit(z < 5 ? 'entry' : 'exit', x, z < 5 ? 0 : 15, 7, 2));
    m.drawExtras([toll('entry-lane-a', [0, 0]), toll('entry-lane-b', [0, 3]), toll('exit-lane', [0, 15])], f.context);
    assert.equal(f.signs.length, 4, 'two named faces per canopy, two canopies');
    assert.equal(f.obstacles.length, 6);
  });
  await test('out-of-tile toll context cannot hide the owned plaza at a tile boundary', () => {
    const f = tollFixture((x, z) => hit('entry', x, z, 5, 1), x => x >= 0);
    m.drawExtras([toll('context', [-10, 0]), toll('owned', [10, 0])], f.context);
    assert.equal(f.signs.length, 2); assert.ok(f.signs.every(s => s[0].startsWith('owned')));
  });
  await test('explicit six-metre taxiways are drawn at six metres and missing widths use the documented fallback', () => {
    assert.equal(m.airportTaxiwayWidth({ width: '6' }), 6); assert.equal(m.airportTaxiwayWidth({ width: '30' }), 30);
    for (const width of [undefined, '', 'n/a', '-6', 'Infinity']) assert.equal(m.airportTaxiwayWidth({ width }), 23);
    const polygons = [], noop = () => {}, B = { road: { quad: (...a) => polygons.push(a) }, marks: { quad: noop }, lit: { box: noop }, st: { tri: noop, quad: noop } };
    m.drawAirfieldTile([{ id: 'fixture', name: 'Fixture', bounds: { minX: 100, maxX: 200, minZ: 100, maxZ: 200 }, runways: [], features: [{ id: 'taxi', kind: 'taxiway', width: '6', pts: [[100, 100], [200, 100]] }] }], 0, 0, B, new Map());
    assert.equal(polygons.length, 4);
    for (const p of polygons) assert.equal(Math.hypot(p[0][0] - p[1][0], p[0][2] - p[1][2]), 6);
  });
  const apron = (minX, minZ, maxX, maxZ) => ({ id: 'apron', kind: 'apron', pts: [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]] });
  const airfield = features => ({ id: 'vohs', name: 'Fixture', features, runways: [], bounds: {} });
  await test('parking requires the whole wing/tail envelope to fit, including narrow aprons and concave edges', () => {
    assert.equal(m.airportParkingPositions(airfield([apron(0, 0, 30, 200)]), [0, 0], 1, 4).length, 0, 'a centre inside a thirty-metre apron cannot fit the thirty-four-metre wingspan');
    const concave = { id: 'concave', kind: 'apron', pts: [[0, 0], [100, 0], [100, 30], [30, 30], [30, 100], [0, 100], [0, 0]] };
    assert.equal(m.airportParkingPositions(airfield([concave]), [0, 0], 1, 4).length, 0, 'an L-shaped apron cannot hold wings over its concave corner');
    const chosen = m.airportParkingPositions(airfield([apron(0, 0, 300, 300)]), [0, 0], 1, 4);
    assert.equal(chosen.length, 4);
    const radius = Math.hypot(18, 16) + 1.5;
    for (const [x, z] of chosen) assert.ok(x >= radius && z >= radius && x <= 300 - radius && z <= 300 - radius);
    for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) assert.ok(Math.hypot(chosen[i][0] - chosen[j][0], chosen[i][1] - chosen[j][1]) >= radius * 2 + 3);
  });
  await test('parked aircraft refuse terminal, hangar and active taxiway clearance envelopes', () => {
    const base = apron(0, 0, 100, 100), terminal = { ...base, id: 'terminal', kind: 'terminal' };
    assert.deepEqual(m.airportParkingPositions(airfield([base, terminal]), [0, 0], 1, 4), []);
    assert.deepEqual(m.airportParkingPositions(airfield([base, { ...terminal, kind: 'hangar' }]), [0, 0], 1, 4), []);
    const taxi = { id: 'taxi', kind: 'taxiway', width: '80', pts: [[0, 50], [100, 50]] };
    assert.deepEqual(m.airportParkingPositions(airfield([base, taxi]), [0, 0], 1, 4), []);
    assert.equal(m.airfieldClearAt([{ ...airfield([taxi]), bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 } }], 50, 75), true, 'wide mapped taxi pavement must also exclude replacement crops and trees');
  });
  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  await test('both shipped airports retain bounded low/normal-quality parking and connected departures', () => {
    const project = m.airfieldProjection(core.origin);
    for (const a of m.placeAirfields(core.origin)) {
      const layout = m.AIRPORT_LAYOUTS[a.id], terminal = project(layout.terminal.lat, layout.terminal.lon), scale = a.id === 'vohy' ? .55 : 1;
      assert.equal(m.airportParkingPositions(a, terminal, scale, 2).length, 2, a.id);
      assert.equal(m.airportParkingPositions(a, terminal, scale, 4).length, 4, a.id);
      assert.ok(m.airportDepartureRoute(a, terminal).runway > 1800);
    }
  });
  const names = ['st', 'road', 'marks', 'lit', 'water', 'wall', 'park', 'roof', 'foot', 'kerb', 'glow', 'shop'];
  const bridge = (height, rot = 0) => {
    const B = Object.fromEntries(names.map(n => [n, new m.TiledBatch()])), grid = new Map();
    const kit = new m.Kit(0, 0, rot, { B: m.captureLandmarkBatches(B, grid, 'durgam'), roadY: height, obstacle() {}, solid() {}, road: () => false });
    m.drawDurgamBridge(kit); return { B, grid, kit };
  };
  await test('Durgam slab and footpaths continuously follow the existing sloped road instead of a raised flat platform', () => {
    const expected = v => 7 + v * .02, f = bridge((x, z) => expected(-z));
    for (let v = -210; v <= 210; v += 2.5) {
      assert.ok(Math.abs(m.landmarkHeightAt(f.grid, 4, -v, 30) - (expected(v) - .05)) < 1e-5);
      assert.ok(Math.abs(m.landmarkHeightAt(f.grid, 11.8, -v, 30) - (expected(v) + .28)) < 1e-5);
    }
  });
  await test('median gaps sample both bridge carriageways and preserve the rotated source frame', () => {
    const theta = 31 * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
    const f = bridge((x, z) => { const u = x * c + z * s, v = x * s - z * c; return Math.abs(u) < 2 ? null : 8 + v * .012; }, 31);
    for (const v of [-200, -100, 0, 100, 200]) {
      const [x, z] = f.kit.P(4, v);
      assert.ok(Math.abs(m.landmarkHeightAt(f.grid, x, z, 30) - (8 + v * .012 - .05)) < 1e-5);
    }
  });
  await test('Durgam retains documented dimensions, fifty-two stays and finite bounded emitted geometry', () => {
    const f = bridge(() => 6.8);
    assert.equal(m.DURGAM_BRIDGE.width, 25.8); assert.equal(m.DURGAM_BRIDGE.mainSpan, 233.85); assert.equal(m.DURGAM_BRIDGE.stayCount, 52);
    let vertices = 0;
    for (const b of Object.values(f.B)) for (const part of b.tiles.values()) { assert.ok(part.pos.every(Number.isFinite)); vertices += part.pos.length / 3; }
    assert.ok(vertices < 40000, `bounded bridge geometry: ${vertices}`);
  });
  console.log(`${checks} ORR/airport/bridge follow-up regression groups passed. No browser play claimed.`);
} finally { await rm(temp, { recursive: true, force: true }); }

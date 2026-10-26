// Production extras geometry/collision checks. No browser or live-game mutation.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'roadster-roadside-'));
let count = 0;
const test = (label, run) => { run(); count++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: "export { drawExtras, extrasFootprintClear } from './game/src/world/extras'; export { roadStructureClearance } from './game/src/world/structure-clearance';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'checks.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { drawExtras, extrasFootprintClear, roadStructureClearance } = await import(pathToFileURL(join(temp, 'checks.mjs')));
  const road = (id, pts, w = 10, elev = null) => ({ id, pts, w, elev, cls: 'residential', lanes: 2, oneway: null, name: id });
  const main = road('main', [[-100, 0], [100, 0]]);
  const hit = { e: main, d: 0, cx: 0, cz: 0, hx: 1, hz: 0, w: 10, y: 0 };
  const fixture = (roads = [main], overrides = {}) => {
    const records = [], obstacles = [], solids = [], signs = [], exact = roadStructureClearance(roads);
    const batch = mat => Object.fromEntries(['box', 'quad', 'tri', 'add'].map(method => [method, (...args) => records.push({ mat, method, args })]));
    const onRoad = (x, z, padding = 0) => roads.some(e => e.pts.slice(1).some((b, i) => {
      const a = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < e.w / 2 + padding;
    }));
    const C = { B: Object.fromEntries(['st', 'foot', 'lit', 'marks'].map(mat => [mat, batch(mat)])), lowQ: false,
      inTile: () => true, nearestRoad: () => hit, onRoad, structureClear: exact.clear, inBuilding: () => false,
      obstacle: (...args) => obstacles.push(args), solid: (...args) => solids.push(args), sign: (...args) => signs.push(args),
      wall() {}, lamp() {}, pad() {}, ...overrides };
    return { C, records, obstacles, solids, signs, exact };
  };
  const fuel = { id: 'fuel', k: 'fuel', p: [0, 18], t: { name: 'IndianOil Petrol Bunk', brand: 'IndianOil' } };
  const boxClear = (f, box) => {
    const [x, y, z, w, h, length, , opts = {}] = box.args, a = opts.ry || 0;
    return f.exact.clear({ x, z, hx: Math.sin(a), hz: Math.cos(a), hw: w / 2, hl: length / 2 }, y - h / 2, y + h / 2);
  };
  test('clear fuel forecourts retain their meshes and matching rear kiosk collider', () => {
    const f = fixture(); drawExtras([fuel], f.C);
    assert.equal(f.solids.length, 1); assert.equal(f.obstacles.length, 7); assert.ok(f.signs.length >= 3);
    assert.ok(f.records.filter(r => r.method === 'box').every(r => boxClear(f, r)));
    assert.ok(f.obstacles.every(([x, z, r, top]) => f.exact.clear({ x, z, r }, 0, top)));
  });
  test('a side road clipping only the rear kiosk relocates the whole fuel group to the clear side', () => {
    const cross = road('rear access', [[-8, 23.4], [-1, 23.4]], 3), f = fixture([main, cross]);
    assert.equal(f.C.onRoad(0, 15.5, 1), false, 'former centre check passed');
    assert.equal(f.C.onRoad(0, 21.5, 0), false, 'former rear centre check missed the kiosk end');
    drawExtras([fuel], f.C);
    assert.equal(f.solids.length, 1); assert.ok(f.solids[0][0].every(p => p[1] < -5));
    assert.ok(f.records.filter(r => r.method === 'box').every(r => boxClear(f, r)));
    assert.ok(f.obstacles.every(([x, z]) => z < -5), 'no phantom collisions remain at rejected forecourt');
  });
  test('blocked fuel sites emit neither decorative geometry nor orphaned colliders', () => {
    const f = fixture([main, road('cross', [[-5, -40], [-5, 40]], 3)]);
    drawExtras([fuel], f.C);
    assert.equal(f.records.length, 0); assert.equal(f.solids.length, 0); assert.equal(f.obstacles.length, 0); assert.equal(f.signs.length, 0);
  });
  test('station concourse is omitted when a side road clips an end beyond its clear centre', () => {
    const f = fixture([main, road('station access', [[17, 18], [17, 36]], 3)]);
    assert.equal(f.C.onRoad(0, 25, 2), false);
    drawExtras([{ id: 'station', k: 'station', p: [0, 25], t: { name: 'Fixture Railway Station' } }], f.C);
    assert.equal(f.solids.length, 0); assert.ok(!f.records.some(r => r.method === 'box' && r.args[4] === 8));
    assert.ok(f.signs.length, 'a safe station name board is retained');
  });
  test('bus bays reject long end overlaps before drawing shelters, parked buses or obstacles', () => {
    const f = fixture([main, road('terminal access', [[18, 15], [18, 45]], 3)]);
    assert.equal(f.C.onRoad(0, 23.5, 1), false); assert.equal(f.C.onRoad(0, 36.5, 1), false);
    drawExtras([{ id: 'terminal', k: 'bus_station', p: [0, 30], t: { name: 'Fixture Terminal' } }], f.C);
    assert.ok(!f.records.some(r => r.method === 'box' && [40, 36, 11, 10].includes(r.args[5])));
    assert.equal(f.obstacles.length, 1, 'only the safe terminal name board remains');
  });
  test('subway entrance corners cannot intrude into a carriageway despite a clear centre', () => {
    const f = fixture([main, road('entrance side road', [[-8, 17.6], [8, 17.6]], 2)]);
    assert.equal(f.C.onRoad(0, 15, .3), false);
    drawExtras([{ id: 'subway', k: 'subway', l: [[0, 15], [0, 30]], t: { highway: 'footway', tunnel: 'yes' } }], f.C);
    assert.equal(f.obstacles.length, 1); assert.equal(f.obstacles[0][1], 30);
    assert.ok(!f.records.some(r => r.method === 'box' && r.args[2] === 15));
  });
  test('road level permits a safe forecourt below a high flyover while detecting a low ramp', () => {
    const high = fixture([main, road('high flyover', [[-40, 16], [40, 16]], 10, [14, 14])]); drawExtras([fuel], high.C);
    assert.equal(high.solids.length, 1); assert.ok(high.solids[0][0].every(p => p[1] > 5));
    const low = fixture([main, road('low ramp', [[-40, 16], [40, 16]], 10, [3, 3])]); drawExtras([fuel], low.C);
    assert.equal(low.solids.length, 1); assert.ok(low.solids[0][0].every(p => p[1] < -5));
  });
  test('legacy contexts check interiors and rotated corners rather than just structure centres', () => {
    const f = fixture([], { structureClear: undefined, onRoad: (x, z, p) => Math.hypot(x - 4, z - 3) <= p + .2 });
    assert.equal(extrasFootprintClear(f.C, { x: 0, z: 0, hx: Math.SQRT1_2, hz: Math.SQRT1_2, hw: 5, hl: 8 }, 0, 4), false);
    assert.equal(extrasFootprintClear(f.C, { x: -20, z: 0, hx: 0, hz: 1, hw: 2, hl: 2 }, 0, 4), true);
  });
  test('mapped-building overlap rejects the complete fuel group without altering source evidence', () => {
    const original = JSON.stringify(fuel), f = fixture([main], { inBuilding: (x, z) => Math.abs(x + 4) < 1 && Math.abs(Math.abs(z) - 23) < 1 });
    drawExtras([fuel], f.C);
    assert.equal(f.records.length, 0); assert.equal(f.solids.length, 0); assert.equal(JSON.stringify(fuel), original);
  });
  console.log(`${count} roadside clearance regression groups passed (offline production geometry and colliders).`);
} finally { await rm(temp, { recursive: true, force: true }); }

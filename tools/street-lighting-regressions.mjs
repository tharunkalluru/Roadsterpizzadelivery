// Actual production lamp, gantry and roadside sign geometry. Offline fixtures;
// these checks are not a claim of citywide browser or surveyed road coverage.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'roadster-lighting-'));
let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export { buildTile } from './src/world/city'; export { drawStreetLamp } from './src/world/street-lamps';
    export { drawExpresswaySigns, drawRampChevrons } from './src/world/expressway-signs'; export { drawExtras } from './src/world/extras';
    export { roadStructureClearance } from './src/world/structure-clearance'; export { initTemplates } from './src/core/util';
    export { BoxGeometry, RingGeometry } from 'three';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temporary, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { buildTile, drawStreetLamp, drawExpresswaySigns, drawRampChevrons, drawExtras, roadStructureClearance, initTemplates, BoxGeometry, RingGeometry } = await import(pathToFileURL(join(temporary, 'production.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const road = (id, pts, extra = {}) => ({ id, seg: id, pts, w: 14, cls: 'primary', lanes: 4, name: id, oneway: null, elev: null, from: `${id}-a`, to: `${id}-b`, maxspeed: null, ...extra });
  const zone = (roads, furniture = []) => ({ i: 0, j: 0, roads, nodes: {}, buildings: [], boards: [], furniture, areas: [], osm: [] });
  const sink = () => { const boxes = [], signs = [], posts = []; const batch = { box: (...args) => boxes.push(args), add() {} };
    return { boxes, signs, posts, B: { st: batch, lit: batch, glow: batch }, inTile: () => true,
      sign: (...args) => signs.push(args), obstacle: (...args) => posts.push(args), post: (x, z, bottom, top) => posts.push([x, z, .25, top, bottom]) }; };
  test('lamp arms, emissive heads and warm pools share an inward endpoint for every road heading and side', () => {
    for (const angle of [0, .4, Math.PI / 2, 2.1, Math.PI, -1.2]) for (const side of [-1, 1]) {
      const hx = Math.sin(angle), hz = Math.cos(angle), x = -hz * side * 8, z = hx * side * 8, B = sink().B;
      const fixture = drawStreetLamp(B, { road: 'fixture', kind: 'road', x, z, inwardX: hz * side, inwardZ: -hx * side });
      assert.ok(fixture.head[0] ** 2 + fixture.head[2] ** 2 < x * x + z * z);
      assert.deepEqual([fixture.pool[0], fixture.pool[2]], [fixture.head[0], fixture.head[2]]);
      assert.ok(B && fixture.pole.every(Number.isFinite) && fixture.head.every(Number.isFinite));
    }
  });
  test('production city lamps point into their own ground, one-way, median and widened elevated carriageways', () => {
    for (const extra of [{}, { oneway: 'backward' }, { oneway: 'forward' }, { w: 7, elev: [6.8, 6.8] },
      { w: 17.5, cls: 'motorway', oneway: 'backward', name: 'Outer Ring Road' }]) {
      const e = road('lamp-road', [[100, 500], [900, 500]], extra), built = buildTile(zone([e]), { lowQ: false });
      assert.ok(built.lampFixtures.length > 3, JSON.stringify(extra));
      const hw = Math.max(e.w / 2, e.elev ? 4.2 : 0);
      for (const f of built.lampFixtures) {
        assert.ok(Math.abs(f.pole[2] - 500) > hw + .09, 'the complete pole remains outside the road');
        assert.ok(Math.abs(f.head[2] - 500) < hw, 'the head reaches over its own carriageway');
        assert.deepEqual([f.pool[0], f.pool[2]], [f.head[0], f.head[2]]);
        assert.ok(built.lamps.some(p => p.every((v, i) => v === f.head[i])), 'dynamic light is the same physical head');
      }
    }
  });
  test('mapped kerb lights and two-headed median masts use the same aligned production fixture', () => {
    const e = road('mapped-road', [[100, 500], [900, 500]], { cls: 'residential' });
    const mapped = buildTile(zone([e], [{ kind: 'street_lamp', name: null, p: [300, 513] }]), { lowQ: true });
    assert.equal(mapped.lampFixtures.length, 1); assert.equal(mapped.lampFixtures[0].kind, 'mapped');
    assert.ok(mapped.lampFixtures[0].pole[2] > 507); assert.ok(mapped.lampFixtures[0].head[2] < 507);
    const median = buildTile(zone([{ ...e, cls: 'primary' }], [{ kind: 'street_lamp', name: null, p: [500, 500] }]), { lowQ: true });
    const heads = median.lampFixtures.filter(f => f.kind === 'median'); assert.equal(heads.length, 2);
    assert.ok(heads.some(f => f.head[2] < 500) && heads.some(f => f.head[2] > 500));
  });
  const incoming = road('orr', [[100, 500], [900, 500]], { w: 17.5, cls: 'motorway', oneway: 'backward', name: 'Outer Ring Road', to: 'exit',
    expressway: { controlled: true, ramp: false, throughLanes: 4 } });
  const slip = road('slip', [[900, 500], [980, 440]], { w: 7, cls: 'motorway_link', oneway: 'backward', from: 'exit', expressway: { controlled: false, ramp: true, throughLanes: 2 } });
  test('ORR panels face the approaching heading, fit one carriageway and replace a blocked median post with a clear cantilever', () => {
    const cross = road('cross-road', [[400, 510], [400, 650]], { w: 6 }), roads = [incoming, slip, cross], C = sink(), exact = roadStructureClearance(roads);
    drawExpresswaySigns(roads, [{ id: 'exit', k: 'exit', p: [900, 500], t: { ref: '1' } }], C);
    assert.ok(C.signs.length >= 9);
    for (const sign of C.signs) { assert.ok(sign[3][0] < -.999 && Math.abs(sign[3][2]) < 1e-8); assert.ok(sign[4] < incoming.w / 2); }
    assert.ok(C.posts.every(([x, z, r, top, bottom]) => exact.clear({ x, z, r }, bottom || 0, top)));
    assert.equal(C.posts.filter(p => Math.abs(p[0] - 400) < 1e-6).length, 1, 'no median post in the intersecting road');
    assert.ok(C.signs.some(s => s[0] === 'orr_exit_500_name'), 'the clear half still provides its exit information');
  });
  test('generic exit signs follow source curves, face arrivals and emit no structure at a conflicting bridge height', () => {
    const e = road('curved', [[100, 300], [500, 300], [500, 700]], { oneway: 'backward' }), exact = roadStructureClearance([e]);
    const C = sink(), ctx = { ...C, nearestRoad: () => ({ e, cx: 500, cz: 700, hx: 0, hz: 1, w: 14, y: 0 }), structureClear: exact.clear,
      inBuilding: () => false, onRoad: () => false, solid() {}, wall() {}, lamp() {}, pad() {}, lowQ: false };
    drawExtras([{ id: 'curved-exit', k: 'exit', p: [500, 700], t: { ref: '4', destination: 'Fixture area' } }], ctx);
    assert.equal(C.signs.length, 1); assert.ok(C.signs[0][5][2] < -.999); assert.ok(Math.abs(C.signs[0][4][2] - 580) < .1);
    assert.ok(C.posts.every(([x, z, r, top]) => exact.clear({ x, z, r }, 0, top)));
    const blocked = sink(); drawExtras([{ id: 'blocked', k: 'exit', p: [500, 700], t: {} }], { ...ctx, ...blocked, structureClear: () => false });
    assert.equal(blocked.signs.length, 0); assert.equal(blocked.boxes.length, 0); assert.equal(blocked.posts.length, 0);
  });
  console.log(`${passed} lamp/gantry regression groups passed (production geometry, offline).`);
} finally { await rm(temporary, { recursive: true, force: true }); }

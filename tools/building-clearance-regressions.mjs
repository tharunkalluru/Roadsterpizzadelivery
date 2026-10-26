// Independent geometry/contact checks against generated solids; source records stay immutable.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = new URL('../', import.meta.url).pathname, tmp = mkdtempSync(path.join(tmpdir(), 'roadster-building-clearance-'));
let count = 0;
const test = (name, run) => { run(); count++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export * from './game/src/world/building-clearance';export {buildTile,pointInRing} from './game/src/world/city';export {collideBuildings,roofUnder} from './game/src/game/physics';export {initTemplates,TiledBatch} from './game/src/core/util';export {BoxGeometry,RingGeometry} from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: path.join(tmp, 'probe.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const m = await import(pathToFileURL(path.join(tmp, 'probe.mjs')));
  m.initTemplates({ rbox: new m.BoxGeometry(1, 1, 1), ring: new m.RingGeometry(1, 1.35, 12) });
  const road = (extra = {}) => ({ id: 'through', cls: 'secondary', name: 'Mapped road', w: 4, lanes: 2, oneway: null, from: 'a', to: 'b', pts: [[-30, 0], [30, 0]], elev: null, ...extra });
  const building = (extra = {}) => ({ id: 'source-building', name: 'Evidence retained', cls: 'commercial', h: 18, hs: 'estimate', ring: [[-8, -8], [8, -8], [8, 8], [-8, 8]], fc: '#eeeeee', rc: '#aaaaaa', ...extra });
  test('ground-road conflict trims only its swept footprint and preserves source identity and area', () => {
    const b = building(), before = JSON.stringify(b), c = m.buildingTransportClearance([road()]).correct(b);
    assert.ok(c); assert.equal(JSON.stringify(b), before); assert.equal(c.correction.sourceId, b.id);
    assert.ok(Math.abs(c.correction.sourceArea - 256) < 1e-6);
    assert.ok(Math.abs(c.correction.retainedArea - (256 - 16 * 4.4)) < 1e-5);
    assert.ok(c.pieces.every(p => p.sourceId === b.id && p.name === b.name && p.h === b.h));
    for (let x = -7.5; x < 8; x += .5) for (let z = -7.5; z < 8; z += .5) {
      assert.equal(c.pieces.some(p => m.pointInRing(x, z, p.ring)), Math.abs(z) > 2.2, `${x},${z}`);
    }
  });
  test('low buildings below an elevated deck remain while tall intersecting extrusions are corrected', () => {
    const c = m.buildingTransportClearance([road({ elev: [12, 12] })]);
    assert.equal(c.correct(building({ h: 8 })), null);
    assert.ok(c.correct(building({ h: 22 }))?.pieces.length);
    assert.equal(c.correct(building({ ring: [[40, 40], [50, 40], [50, 50], [40, 50]] })), null);
  });
  test('metro deck and complete station envelope clear tall source buildings with source line identities', () => {
    const metro = { lines: [{ id: 'green', pts: [[-100, 0], [100, 0]] }], stations: [{ id: 'known', lines: ['green'], p: [0, 0] }], deckHeight: 11 };
    const c = m.buildingTransportClearance([], metro);
    assert.equal(c.correct(building({ h: 4 })), null);
    const result = c.correct(building({ h: 30 })); assert.ok(result); assert.equal(result.pieces.length, 0);
    assert.ok(result.correction.corridors.includes('station:known'));
    const edge = c.correct(building({ ring: [[-6, 12], [6, 12], [6, 18], [-6, 18]], h: 25 }));
    assert.ok(edge); assert.ok(edge.pieces.every(p => p.ring.every(q => q[1] >= 13.4 - 1e-6)));
  });
  test('metro physical girder end overlap cannot leave a thin source-building remnant', () => {
    const metro = { lines: [{ id: 'blue', pts: [[20, 0], [40, 0], [40, 20]] }], stations: [], deckHeight: 11 };
    const b = building({ ring: [[19.91, -.5], [20.05, -.5], [20.05, .5], [19.91, .5]], h: 18 });
    const result = m.buildingTransportClearance([], metro).correct(b);
    assert.ok(result); assert.equal(result.pieces.length, 0, 'real deck length includes 0.1 m beyond the source endpoint');
  });
  test('concave buildings and dense duplicate road copies retain the same corridor opening', () => {
    const b = building({ ring: [[-10, -8], [10, -8], [10, 8], [3, 8], [3, -3], [-3, -3], [-3, 8], [-10, 8]] });
    const a = m.buildingTransportClearance([road()]).correct(b);
    const dense = road({ pts: Array.from({ length: 61 }, (_, i) => [i - 30, 0]) });
    const c = m.buildingTransportClearance([dense, { ...dense, ctx: 1 }]).correct(b);
    assert.ok(a && c); assert.ok(Math.abs(a.correction.retainedArea - c.correction.retainedArea) < 1e-4);
    for (let x = -9.75; x < 10; x += .5) for (let z = -7.75; z < 8; z += .5) {
      const expected = m.pointInRing(x, z, b.ring) && Math.abs(z) > 2.2;
      assert.equal(c.pieces.some(p => m.pointInRing(x, z, p.ring)), expected, `${x},${z}`);
    }
  });
  test('actual widened ramp ends and joined corner paint cannot leave a solid building in the road', () => {
    const turn = road({ w: 10, pts: [[-30, 0], [0, 0], [0, 30]] });
    const corner = building({ ring: [[2, -4], [4, -4], [4, -2], [2, -2]], h: 12 });
    const correction = m.buildingTransportClearance([turn]).correct(corner); assert.ok(correction);
    assert.equal(correction.pieces.some(p => m.pointInRing(3, -3, p.ring)), false);
    const ramp = road({ w: 4, pts: [[-30, 0], [0, 0], [30, 0]], elev: [0, 0, 6] });
    const edge = building({ ring: [[-20, 3], [-15, 3], [-15, 4], [-20, 4]], h: 7 });
    assert.ok(m.buildingTransportClearance([ramp]).correct(edge), 'ground end uses whole raised-edge8.4m width');
  });
  test('generated render fragments and collision solids agree: road opens, remaining building still collides', () => {
    const r = road({ pts: [[20, 100], [180, 100]] }), b = building({ ring: [[80, 80], [120, 80], [120, 120], [80, 120]] });
    const zone = { i: 0, j: 0, roads: [r], buildings: [b], boards: [], furniture: [], areas: [], nodes: {} };
    const before = JSON.stringify(zone), built = m.buildTile(zone, { lowQ: true }); assert.equal(JSON.stringify(zone), before);
    assert.equal(built.buildingCorrections.length, 1);
    const car = { x: 100, z: 100 }; assert.equal(m.collideBuildings(built, car, 1.05, .55), 0); assert.deepEqual(car, { x: 100, z: 100 });
    const solid = { x: 100, z: 90 }; assert.ok(m.collideBuildings(built, solid, 1.05, .55) > 0);
    assert.equal(m.roofUnder(built, [[100, 100]]), 0); assert.equal(m.roofUnder(built, [[100, 90]]), 18);
    for (const buffer of built.buffers.filter(b => b.mat === 'wall' || b.mat === 'roof')) for (let i = 0; i < buffer.pos.length; i += 3) {
      const [x, , z] = buffer.pos.slice(i, i + 3); assert.ok(!(x > 80.001 && x < 119.999 && Math.abs(z - 100) < 2.19), 'no residual solid rendered in the lane');
    }
  });
  test('junction fan between separate source edges opens the rendered turning pavement', () => {
    const a = road({ id: 'a', w: 10, from: 'west', to: 'join', pts: [[20, 100], [100, 100]] });
    const b = road({ id: 'b', w: 10, from: 'join', to: 'north', pts: [[100, 100], [100, 180]] });
    const obstruction = building({ ring: [[101, 98], [102, 98], [102, 99], [101, 99]] });
    const built = m.buildTile({ i: 0, j: 0, roads: [a, b], nodes: { join: [100, 100] }, buildings: [obstruction], boards: [], furniture: [], areas: [] }, { lowQ: true });
    assert.equal(built.buildingCorrections.length, 1); assert.equal(built.buildingCorrections[0].fragments, 0);
    const car = { x: 101.5, z: 98.5 }; assert.equal(m.collideBuildings(built, car, .3, .55), 0);
  });
  test('normal-quality rooftop rooms cannot extend outside a safe thin footprint into a flyover', () => {
    const original = m.TiledBatch.prototype.box;
    const capture = (b, z) => {
      const rooms = []; m.TiledBatch.prototype.box = function(...a) { if (a[3] === 2.6 && a[4] === 2.6 && a[5] === 2.8) rooms.push(a); return original.apply(this, a); };
      try { m.buildTile({ i: 0, j: 0, roads: [road({ pts: [[400, z], [600, z]], elev: [12, 12], w: 10 })], nodes: {}, buildings: [b], boards: [], furniture: [], areas: [] }, { lowQ: false }); } finally { m.TiledBatch.prototype.box = original; }
      return rooms;
    };
    const collision = a => a[0] + 1.3 > 400 && a[0] - 1.3 < 600 && a[2] - 1.4 < 505.2 && a[2] + 1.4 > 494.8;
    let candidate;
    for (let i = 0; i < 100 && !candidate; i++) { const b = building({ id: `thin-roof-${i}`, h: 11.5, ring: [[465, 507], [535, 507], [535, 509], [465, 509]] }); if (capture(b, 450).some(collision)) candidate = b; }
    assert.ok(candidate, 'fixture must exercise an actual random room overhang');
    assert.equal(m.buildingTransportClearance([road({ pts: [[400, 500], [600, 500]], elev: [12, 12], w: 10 })]).correct(candidate), null, 'base building is outside the road');
    assert.equal(capture(candidate, 500).some(collision), false, 'actual room footprint is checked independently');
  });
  console.log(`${count} building/transport clearance regression groups passed.`);
} finally { rmSync(tmp, { recursive: true, force: true }); }

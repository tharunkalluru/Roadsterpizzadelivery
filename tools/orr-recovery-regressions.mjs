// Reproduced ORR barrier-recovery regression, using production placement code.
// These deterministic fixtures supplement, rather than claim, browser playtesting.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url)), out = await mkdtemp(join(tmpdir(), 'orr-recovery-'));
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export * from './src/game/spatial-safety'; export {RoadGraph} from './src/game/roadgraph'; export {Game} from './src/game/game';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(out, 'recovery.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { findClearRecoverySpot, findClearStreetSpot, RoadGraph, Game } = await import(pathToFileURL(join(out, 'recovery.mjs')));
  const metadata = { controlled: true, ramp: false, throughLanes: 4, laneWidth: 3.5, shoulders: [2.5, 1] };
  const road = (id, pts, extra = {}) => ({ id, seg: id, name: id, from: id + '-a', to: id + '-b', pts, w: 8, lanes: 2, cls: 'service', oneway: null, elev: null, maxspeed: null, ...extra });
  const orr = (id, pts, extra = {}) => road(id, pts, { w: 17.5, lanes: 4, cls: 'motorway', name: 'Outer Ring Road', oneway: 'backward', elev: pts.map(() => 3.4), expressway: metadata, ...extra });
  const gridAdd = (grid, item, x0, z0, x1, z1, size) => {
    for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) for (let z = Math.floor(z0 / size); z <= Math.floor(z1 / size); z++) {
      const key = `${x},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(item);
    }
  };
  const cityFor = roads => {
    const city = { surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map() };
    for (const e of roads) for (let i = 1; i < e.pts.length; i++) {
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i], hw = e.w / 2 + .6;
      gridAdd(city.surfaceGrid, { e, i: i - 1, ax, az, bx, bz, hw, ya: e.elev?.[i - 1] ?? 0, yb: e.elev?.[i] ?? 0, kind: 'road' }, Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, 30);
    }
    return city;
  };
  const building = (city, x0, z0, x1, z1, h = 12) => gridAdd(city.buildingGrid, { ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h }, x0, z0, x1, z1, 50);
  const fixture = (roads, loaded = roads) => ({ graph: new RoadGraph(roads), city: cityFor(loaded) });
  const heading = spot => ({ x: -Math.sin(spot.yaw), z: -Math.cos(spot.yaw) });
  const assertMain = (spot, y = 3.4, direction = 1) => {
    assert.ok(spot, 'a loaded clear through lane is available');
    assert.ok(Math.abs(spot.y - y) < 1e-7); assert.ok(heading(spot).x * direction > .99);
    assert.ok(spot.z >= -5.1 && spot.z <= 7.4, 'whole car is inside through lanes, off both shoulders');
  };

  test('ORR barrier recovery retains its deck and direction instead of gliding to a service road', () => {
    const roads = [orr('main', [[-150, 0], [150, 0]]), road('service', [[-150, -15], [150, -15]])];
    const { graph, city } = fixture(roads);
    const legacy = findClearStreetSpot(graph, city, 0, 8.6, { heading: { x: 1, z: 0 } });
    assert.ok(legacy && legacy.y === 0, 'fixture reproduces the old ground-street fallback');
    const spot = findClearRecoverySpot(graph, city, 0, 8.6, 3.4, { heading: { x: 1, z: 0 } });
    assertMain(spot); assert.ok(Math.hypot(spot.x, spot.z - 8.6) < 12);
  });
  test('normal ground recovery underneath or beside the ORR is unchanged', () => {
    const roads = [orr('main', [[-150, 0], [150, 0]]), road('below', [[-150, 0], [150, 0]])];
    const { graph, city } = fixture(roads), options = { heading: { x: 1, z: 0 } };
    assert.deepEqual(findClearRecoverySpot(graph, city, 0, 0, 0, options), findClearStreetSpot(graph, city, 0, 0, options));
    const plain = fixture([road('street', [[-100, 0], [100, 0]])]);
    assert.deepEqual(findClearRecoverySpot(plain.graph, plain.city, 20, 2, 0), findClearStreetSpot(plain.graph, plain.city, 20, 2));
  });
  test('blocked or unloaded ORR returns null even when a clear service road is available', () => {
    const main = orr('main', [[-150, 0], [150, 0]]), service = road('service', [[-150, -18], [150, -18]]);
    const blocked = fixture([main, service]); building(blocked.city, -100, -10, 100, 10);
    assert.equal(findClearRecoverySpot(blocked.graph, blocked.city, 0, 8.6, 3.4), null);
    const unloaded = fixture([main, service], [service]);
    assert.equal(findClearRecoverySpot(unloaded.graph, unloaded.city, 0, 8.6, 3.4), null);
  });
  test('a close opposite carriageway and a nearby ramp cannot replace the current mainline', () => {
    const main = orr('main', [[-150, 0], [150, 0]]), opposite = orr('opposite', [[-150, 21], [150, 21]], { oneway: 'forward' });
    const exit = orr('exit', [[-150, -20], [150, -20]], { cls: 'motorway_link', expressway: { ...metadata, ramp: true, throughLanes: 1, shoulders: [.5, .5] }, w: 6 });
    const { graph, city } = fixture([main, opposite, exit]); building(city, -100, -10, 100, 10);
    assert.equal(findClearRecoverySpot(graph, city, 0, 8.6, 3.4), null);
    city.buildingGrid.clear(); const spot = findClearRecoverySpot(graph, city, 0, 8.6, 3.4, { heading: { x: -1, z: 0 } });
    assertMain(spot, 3.4, 1); assert.ok(spot.z < 10, 'skidding backwards cannot select the opposing carriageway');
  });
  test('reverse-encoded carriageways recover with their legal travel direction', () => {
    const main = orr('reverse', [[-150, 0], [150, 0]], { oneway: 'forward' }), { graph, city } = fixture([main]);
    const spot = findClearRecoverySpot(graph, city, 0, -8.6, 3.4, { heading: { x: 1, z: 0 } });
    assert.ok(spot && heading(spot).x < -.99); assert.ok(spot.z > -7.4 && spot.z < 5.1);
  });
  test('continuous same-carriageway edges support a clear forward exit across their shared node', () => {
    const a = orr('a', [[-100, 0], [0, 0]], { to: 'join' }), b = orr('b', [[0, 0], [100, 0]], { from: 'join' });
    const { graph, city } = fixture([a, b]); building(city, -100, -10, -1, 10);
    const spot = findClearRecoverySpot(graph, city, -4, 8.6, 3.4);
    assertMain(spot); assert.ok(spot.x > 1, 'uses only the connected continuation after the blocker');
    const unconnected = fixture([a, { ...b, from: 'unconnected' }]); building(unconnected.city, -100, -10, 100, 10);
    assert.equal(findClearRecoverySpot(unconnected.graph, unconnected.city, -4, 8.6, 3.4), null);
  });
  test('ORR recovery keeps the actual local grade and checks its forward footprint', () => {
    const main = orr('grade', [[-150, 0], [150, 0]], { elev: [1.4, 5.4] }), { graph, city } = fixture([main]);
    const spot = findClearRecoverySpot(graph, city, 0, 8.6, 3.4);
    assert.ok(spot); assert.ok(Math.abs(spot.y - (1.4 + (spot.x + 150) / 300 * 4)) < 1e-7);
    // A solid across every through lane blocks both placement and the short exit.
    gridAdd(city.walls, { ax: -100, az: 7, bx: 100, bz: 7, y0a: 0, y0b: 0, y1a: 10, y1b: 10, kind: 'parapet' }, -100, 7, 100, 7, 30);
    const safe = findClearRecoverySpot(graph, city, 0, 8.6, 3.4);
    assert.ok(safe); assert.ok(safe.z < 6, 'does not place the body against the inner parapet');
  });
  test('occupied lanes select another clear lane and a fully queued corridor refuses placement', () => {
    const main = orr('main', [[-150, 0], [150, 0]]), { graph, city } = fixture([main]);
    const blocker = { x: 0, y: 3.4, z: 6, hx: 1, hz: 0, size: [2.5, 3.3, 11] };
    const spot = findClearRecoverySpot(graph, city, 0, 8.6, 3.4, { vehicles: [blocker] });
    assertMain(spot); assert.ok(Math.hypot(spot.x, spot.z - 6) > 3);
    const queue = [-4.5, -1, 2.5, 6].map(z => ({ x: 0, y: 3.4, z, hx: 1, hz: 0, size: [3.1, 3.3, 130] }));
    assert.equal(findClearRecoverySpot(graph, city, 0, 8.6, 3.4, { vehicles: queue }), null);
  });
  test('separate mainline geometry without a graph join never grants a recovery shortcut', () => {
    const a = orr('a', [[-100, 0], [0, 0]]), b = orr('b', [[0, 0], [100, 0]]);
    const { graph, city } = fixture([a, b]); building(city, -100, -10, 2, 10);
    assert.equal(findClearRecoverySpot(graph, city, -4, 8.6, 3.4), null);
  });
  test('a source ramp connected to mainline is not used as a mid-block ORR escape', () => {
    const main = orr('main', [[-100, 0], [0, 0]], { to: 'exit' });
    const ramp = orr('ramp', [[0, 0], [100, -20]], { from: 'exit', cls: 'motorway_link', expressway: { ...metadata, ramp: true }, w: 9 });
    const { graph, city } = fixture([main, ramp]); building(city, -100, -10, 2, 10);
    assert.equal(findClearRecoverySpot(graph, city, -4, 8.6, 3.4), null);
  });
  test('explicit ORR ramps retain their role and grade even without the mainline controlled flag', () => {
    const ramp = orr('ramp', [[-150, 0], [150, 0]], { cls: 'motorway_link', w: 5, lanes: 1, expressway: { ...metadata, controlled: false, ramp: true, throughLanes: 1, shoulders: [.75, .75] } });
    const service = road('service', [[-150, -12], [150, -12]]), { graph, city } = fixture([ramp, service]);
    const spot = findClearRecoverySpot(graph, city, 0, 2.2, 3.4);
    assert.ok(spot && Math.abs(spot.z) < .01 && spot.y === 3.4 && heading(spot).x > .99);
    building(city, -100, -3, 100, 3); assert.equal(findClearRecoverySpot(graph, city, 0, 2.2, 3.4), null);
  });
  test('auxiliary-lane surface shifts do not move recovery into shoulders or reject a clear through lane', () => {
    const main = orr('main', [[-150, 0], [150, 0]]), { graph, city } = fixture([main]);
    const seen = new Set();
    for (const cells of city.surfaceGrid.values()) for (const s of cells) if (!seen.has(s)) { seen.add(s); s.az -= 1.75; s.bz -= 1.75; s.hw += 1.75; }
    const spot = findClearRecoverySpot(graph, city, 0, 8.6, 3.4); assertMain(spot);
    assert.equal(spot.z, 6, 'nearest inner through lane remains available despite the asymmetric widened surface');
    const outer = findClearRecoverySpot(graph, city, 0, -8.6, 3.4); assertMain(outer);
    assert.equal(outer.z, -4.5, 'auxiliary lane is not silently counted as a through lane');
  });
  test('actual Game recovery throttles failed ORR searches and retries after three simulation seconds', () => {
    const main = orr('main', [[-150, 0], [150, 0]]), service = road('service', [[-150, -18], [150, -18]]);
    const { graph, city } = fixture([main, service]); building(city, -100, -10, 100, 10);
    const notices = [], placements = []; let searches = 0;
    const game = Object.assign(Object.create(Game.prototype), {
      graph, city, traffic: { cars: [] }, t: 10, recoveryRetryUntil: 0, stuckT: 9.1, slowT: 27,
      paused: false, stuckRef: [0, 8.6], slowRef: [0, 8.6],
      player: { pos: { x: 0, y: 3.95, z: 8.6 }, forward: { x: 1, z: 0 }, speed: 0,
        glide: null, flying: false, lastKind: 'road', glideTo(x, y, z, yaw) { placements.push({ x, y, z, yaw }); this.glide = {}; } },
      hud: { rescue() {}, toast(text, color) { notices.push({ text, color }); } },
      streetSpotNear(x, z) { searches++; return Game.prototype.streetSpotNear.call(this, x, z); },
    });
    const trying = { throttle: 1, brake: 0, steer: 0 };
    // Trigger the real automatic stuck watcher, which calls the actual rescue.
    game.watchStuck(1 / 60, trying);
    assert.equal(searches, 1); assert.equal(notices.length, 1); assert.equal(placements.length, 0);
    assert.equal(game.recoveryRetryUntil, 13); assert.equal(game.stuckT, 0); assert.equal(game.slowT, 0);
    // Repeated recovery requests during normal frames cannot run the expensive
    // search or repeat the failure toast while its simulation-time gate is closed.
    for (let frame = 1; frame < 180; frame++) { game.t = 10 + frame / 60; game.watchStuck(1 / 60, trying); game.rescue(); }
    assert.equal(searches, 1); assert.equal(notices.length, 1); assert.equal(placements.length, 0);
    game.t = 13; game.rescue();
    assert.equal(searches, 2); assert.equal(notices.length, 2); assert.equal(game.recoveryRetryUntil, 16);
    assert.equal(game.stuckT, 0); assert.equal(game.slowT, 0);
    city.buildingGrid.clear();
    game.t = 15.999; game.rescue(); assert.equal(searches, 2, 'newly clear geometry still observes the current cooldown');
    game.t = 16; game.rescue();
    assert.equal(searches, 3); assert.equal(placements.length, 1); assert.equal(notices.length, 3);
    assertMain(placements[0]); assert.equal(game.recoveryRetryUntil, 0); assert.equal(game.stuckT, 0); assert.equal(game.slowT, 0);
    assert.equal(notices[2].color, 'teal');
    for (let frame = 0; frame < 120; frame++) { game.t += 1 / 60; game.rescue(); }
    assert.equal(searches, 3, 'an active recovery glide cannot start another recovery'); assert.equal(placements.length, 1);
  });
  console.log(`${checks} ORR recovery regression groups passed.`);
} finally { await rm(out, { recursive: true, force: true }); }

// Production NPC movement with deterministic road/body fixtures. These checks
// are not browser playtests and never mutate a running game's hidden state.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url)), out = await mkdtemp(join(tmpdir(), 'roadster-traffic-'));
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export * from './src/game/traffic-path';
    export { Traffic } from './src/game/traffic'; export { RoadGraph } from './src/game/roadgraph';
    export { resolveSignalSites } from './src/world/signals';
    export { rng } from './src/core/util'; export { Group, Scene, BufferGeometry, MeshBasicMaterial } from 'three';`,
    resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(out, 'traffic.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { Traffic, TrafficCurve, RoadGraph, Scene, BufferGeometry, MeshBasicMaterial, rng, resolveSignalSites,
    turnProfile, turnSpeed, trafficOverlap, trafficPoseClear, trafficCurveClear } = await import(pathToFileURL(join(out, 'traffic.mjs')));
  const road = (id, pts, extra = {}) => ({ id, seg: id, from: id + '-a', to: id + '-b', pts, cls: 'residential', w: 16, lanes: 4, oneway: null, elev: null, name: id, maxspeed: null, ...extra });
  const gridAdd = (grid, item, x0, z0, x1, z1, size) => {
    for (let x = Math.floor(x0 / size); x <= Math.floor(x1 / size); x++) for (let z = Math.floor(z0 / size); z <= Math.floor(z1 / size); z++) {
      const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item);
    }
  };
  const cityFor = roads => {
    const city = { surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map() };
    for (const e of roads) for (let i = 0; i < e.pts.length - 1; i++) {
      const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1], hw = e.w / 2 + .6;
      gridAdd(city.surfaceGrid, { e, i, ax, az, bx, bz, ya: e.elev?.[i] ?? 0, yb: e.elev?.[i + 1] ?? 0, hw, kind: 'road' }, Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, 30);
    }
    return city;
  };
  const sizes = { car: [1.8, 1.6, 4.5], auto: [1.36, 1.85, 2.65], bike: [.75, 1.9, 2], bus: [2.5, 3.3, 11], truck: [2.5, 3.1, 8.4] };
  const fixture = (roads, loaded = true) => {
    const byGroup = Object.fromEntries(Object.entries(sizes).map(([group, size]) => [group, [{ group, size, body: new BufferGeometry(), lights: new BufferGeometry(), decals: [] }]]));
    return Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph: new RoadGraph(roads), city: loaded ? cityFor(roads) : undefined,
      scene: new Scene(), mats: { vBody: new MeshBasicMaterial(), vLight: new MeshBasicMaterial() }, byGroup,
      r: rng(77), t: 0, phaseLen: 22, plans: 0, stopsByEdge: new Map(), onHorn() {} });
  };
  const farPlayer = { x: 250, y: .55, z: 250, speed: 0, hx: 1, hz: 0 };
  const tick = (traffic, dt = 1 / 60, player = farPlayer, walkers = []) => traffic.update(dt, 0, 0, player, walkers);
  const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hz * b.hz)));
  const junction = (group, sign = 1, dt = 1 / 60) => {
    const traffic = fixture([road('in', [[-80, 0], [0, 0]], { to: 'j' }), road('out', [[0, 0], [0, sign * 100]], { from: 'j' })]);
    const c = traffic.spawnAt(group, traffic.graph.byId.get('in'), 1, 35, 2.8);
    let turning = false, slowest = Infinity, maxYaw = 0, n = 0;
    for (; n < 3600 && !(c.edge.e.id === 'out' && c.s > 24); n++) {
      const last = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
      tick(traffic, dt);
      const yaw = angle(last, c); maxYaw = Math.max(maxYaw, yaw);
      assert.ok(Math.hypot(c.x - last.x, c.z - last.z) <= c.speed * dt + .004, 'position follows the same travelled curve distance');
      assert.ok(yaw < .16, `no raw segment yaw snap: ${yaw}`);
      assert.ok(Math.abs(-Math.sin(c.g.rotation.y) - c.hx) < 1e-9 && Math.abs(-Math.cos(c.g.rotation.y) - c.hz) < 1e-9, 'render and collision use identical heading');
      if (c.motion?.progress >= 0) { turning = true; slowest = Math.min(slowest, c.speed); }
    }
    assert.ok(n < 3600, `${group} completes mapped ${sign > 0 ? 'right' : 'left'} turn`);
    assert.ok(turning && maxYaw > .001, 'uses a real curved trajectory');
    return { c, slowest, maxYaw };
  };

  test('arc-length curve endpoints and tangents are exact in both turn directions', () => {
    for (const sign of [-1, 1]) {
      const a = { x: -10, y: 0, z: 0, hx: 1, hz: 0 }, b = { x: 0, y: 0, z: sign * 10, hx: 0, hz: sign };
      const curve = new TrafficCurve(a, b, 5.5228475);
      assert.deepEqual(curve.sample(0), a); assert.ok(angle(curve.sample(curve.length), b) < 1e-7);
      assert.ok(Math.abs(curve.length - Math.PI * 5) < .01); assert.ok(curve.minRadius > 9.7);
      for (let s = 1; s < curve.length; s++) assert.ok(Math.abs(Math.hypot(curve.sample(s).x - curve.sample(s - 1).x, curve.sample(s).z - curve.sample(s - 1).z) - 1) < .003);
    }
  });
  test('cars complete both junction turns with continuous motion at 30 and 60 Hz', () => { for (const dt of [1 / 30, 1 / 60]) for (const sign of [-1, 1]) junction('car', sign, dt); });
  test('buses use larger-radius paths and lower turn speed than autos', () => {
    const plans = {};
    for (const group of ['auto', 'bus']) {
      const t = fixture([road('in', [[-80, 0], [0, 0]], { to: 'j' }), road('out', [[0, 0], [0, 100]], { from: 'j' })]);
      const c = t.spawnAt(group, t.graph.byId.get('in'), 1, 30, 2.8); c.assertive = group === 'auto'; t.prepare(c);
      assert.ok(c.motion, group + ' has a swept-clear path'); plans[group] = c.motion;
    }
    assert.ok(plans.bus.curve.minRadius > plans.auto.curve.minRadius * 1.5);
    assert.ok(plans.bus.cap < plans.auto.cap);
    for (const sign of [-1, 1]) junction('bus', sign);
  });
  test('internal road-polyline corners also turn smoothly without changing graph routing', () => {
    for (const dir of [-1, 1]) {
      const t = fixture([road('bend', [[-80, 0], [0, 0], [0, 80]])]);
      const c = t.spawnAt('car', t.graph.edges[0], dir, 35, 2.2);
      for (let i = 0; i < 1800 && c.s < 110; i++) { const last = { hx: c.hx, hz: c.hz }; tick(t); assert.ok(angle(last, c) < .12); }
      assert.ok(c.s > 110); assert.equal(c.edge, t.graph.edges[0]);
    }
  });
  test('curve sweep rejects unloaded roads, buildings, medians and a bridge-level mismatch', () => {
    const roads = [road('wide', [[-100, 0], [100, 0]])], city = cityFor(roads);
    const a = { x: -8, z: -2.8, y: 0, hx: 1, hz: 0 }, b = { ...a, x: 8 };
    const curve = new TrafficCurve(a, b, 16 / 3);
    assert.equal(trafficCurveClear(curve, city, sizes.bus), true);
    assert.equal(trafficCurveClear(curve, cityFor([]), sizes.car), false);
    const building = { ring: [[-1, -5], [1, -5], [1, -1], [-1, -1]], h: 12 };
    gridAdd(city.buildingGrid, building, -1, -5, 1, -1, 50); assert.equal(trafficCurveClear(curve, city, sizes.auto), false);
    city.buildingGrid.clear();
    gridAdd(city.walls, { ax: 0, az: -8, bx: 0, bz: 8, y0a: 0, y0b: 0, y1a: .8, y1b: .8, kind: 'median' }, 0, -8, 0, 8, 30);
    assert.equal(trafficCurveClear(curve, city, sizes.auto), false); city.walls.clear();
    const bridge = cityFor([road('deck', [[-100, 0], [100, 0]], { elev: [8, 8] })]);
    assert.equal(trafficCurveClear(curve, bridge, sizes.auto), false);
    assert.equal(trafficPoseClear(city, { ...a, z: -7.6 }, sizes.car), false, 'whole body cannot use the pavement margin');
  });
  test('the full bus nose and tail corners reject facade clips at straight and rotated headings', () => {
    for (const yaw of [0, Math.PI / 4, Math.PI / 2]) for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const city = cityFor([road('wide', [[-100, 0], [100, 0]])]);
      const p = { x: 0, y: 0, z: 0, hx: Math.cos(yaw), hz: Math.sin(yaw) };
      const x = p.hx * end * 5.4 + p.hz * side * 1.15, z = p.hz * end * 5.4 - p.hx * side * 1.15;
      const b = { ring: [[x - .1, z - .1], [x + .1, z - .1], [x + .1, z + .1], [x - .1, z + .1]], h: 12 };
      gridAdd(city.buildingGrid, b, x - .1, z - .1, x + .1, z + .1, 50);
      assert.equal(trafficPoseClear(city, p, sizes.bus), false, `rejects corner end=${end}, side=${side}, heading=${yaw}`);
    }
    const city = cityFor([road('wide', [[-100, 0], [100, 0]])]);
    const b = { ring: [[5.3, 1.45], [5.7, 1.45], [5.7, 1.8], [5.3, 1.8]], h: 12 };
    gridAdd(city.buildingGrid, b, 5.3, 1.45, 5.7, 1.8, 50);
    assert.equal(trafficPoseClear(city, { x: 0, y: 0, z: 0, hx: 1, hz: 0 }, sizes.bus), true, 'a clear corner retains its normal small margin');
  });
  test('bus corner barrier and pole checks preserve separation from ground obstacles below a bridge', () => {
    const city = cityFor([road('deck', [[-100, 0], [100, 0]], { elev: [8, 8] })]);
    const p = { x: 0, y: 8, z: 0, hx: 1, hz: 0 };
    const wall = { ax: 5.3, az: 1.15, bx: 5.7, bz: 1.15, y0a: 0, y0b: 0, y1a: .8, y1b: .8, kind: 'parapet' };
    gridAdd(city.walls, wall, 5.3, 1.15, 5.7, 1.15, 30);
    city.obstacles.set('0,0', [{ x: -5.4, z: -1.15, r: .1, top: 5 }]);
    const building = { ring: [[5.3, -1.25], [5.7, -1.25], [5.7, -.95], [5.3, -.95]], h: 5 };
    gridAdd(city.buildingGrid, building, 5.3, -1.25, 5.7, -.95, 50);
    assert.equal(trafficPoseClear(city, p, sizes.bus), true, 'ground geometry cannot block a bus on the deck');
    wall.y0a = wall.y0b = 8; wall.y1a = wall.y1b = 8.8;
    assert.equal(trafficPoseClear(city, p, sizes.bus), false, 'a deck-height barrier clips the front corner');
    city.walls.clear(); city.obstacles.get('0,0')[0].top = 10;
    assert.equal(trafficPoseClear(city, p, sizes.bus), false, 'a deck-height pole clips the tail corner');
    city.obstacles.clear();
    gridAdd(city.walls, { ax: -100, az: 1.15, bx: 100, bz: 1.15, y0a: 0, y0b: 10, y1a: .8, y1b: 10.8, kind: 'parapet' }, -100, 1.15, 100, 1.15, 30);
    assert.equal(trafficPoseClear(city, p, sizes.bus), true, 'wall height is evaluated only where its segment crosses the bus');
  });
  test('cross-edge oriented bodies block entry; crossing grade-separated vehicles do not', () => {
    const a = { x: 0, y: 0, z: 0, hx: 1, hz: 0, size: sizes.bus }, b = { x: 4, y: 0, z: 1.2, hx: 0, hz: 1, size: sizes.car };
    assert.equal(trafficOverlap(a, b), true); assert.equal(trafficOverlap(a, { ...b, y: 8 }), false);
    const t = fixture([road('in', [[-80, 0], [0, 0]], { to: 'j' }), road('out', [[0, 0], [0, 100]], { from: 'j' })]);
    const c = t.spawnAt('car', t.graph.byId.get('in'), 1, 55, 2.8); t.prepare(c); assert.ok(c.motion);
    const blocker = t.spawnAt('bus', t.graph.byId.get('out'), 1, 8, 2.8);
    assert.equal(t.canEnter(c, c.motion, farPlayer), false);
    blocker.y = 8; assert.equal(t.canEnter(c, c.motion, farPlayer), true);
  });
  test('an auto can make a quick curved U-turn only through a supported clear opening', () => {
    const t = fixture([road('dead-end', [[-100, 0], [0, 0]], { w: 16 })]);
    const c = t.spawnAt('auto', t.graph.edges[0], 1, 75, 3.3); c.assertive = true; c.uturnAt = 0;
    t.prepare(c); assert.equal(c.motion?.kind, 'uturn');
    for (let i = 0; i < 1800 && c.dir !== -1; i++) { const last = { hx: c.hx, hz: c.hz }; tick(t); assert.ok(angle(last, c) < .12); }
    assert.equal(c.dir, -1); assert.ok(c.uturnAt > t.t + 30, 'cooldown prevents repeated quick reversals');
    const blocked = fixture([road('blocked', [[-100, 0], [0, 0]], { cls: 'primary', w: 16 })]);
    gridAdd(blocked.city.walls, { ax: -100, az: 0, bx: 0, bz: 0, y0a: 0, y0b: 0, y1a: .8, y1b: .8, kind: 'median' }, -100, 0, 0, 0, 30);
    const d = blocked.spawnAt('auto', blocked.graph.edges[0], 1, 75, 3.3); blocked.prepare(d); assert.equal(d.motion, undefined);
    for (let i = 0; i < 900; i++) tick(blocked);
    assert.equal(d.dir, 1, 'does not flip heading across the divider');
    assert.ok(d.s < 99.99);
  });
  test('lane changes preserve tangent, enforce cooldown and reject occupied gaps', () => {
    const t = fixture([road('wide', [[-100, 0], [150, 0]])]);
    const c = t.spawnAt('auto', t.graph.edges[0], 1, 30, 2); c.assertive = true; c.laneT = 4.5; c.laneChangeAt = 0;
    assert.equal(t.tryLane(c, farPlayer), true); assert.ok(c.laneChangeAt >= t.t + 8);
    for (let i = 0; i < 300 && c.motion; i++) { const last = { hx: c.hx, hz: c.hz }; tick(t); assert.ok(angle(last, c) < .12); }
    assert.ok(Math.abs(c.lane - 4.5) < .001); c.laneT = 2;
    assert.equal(t.tryLane(c, farPlayer), false, 'cannot immediately weave back');
    const b = fixture([road('wide', [[-100, 0], [150, 0]])]);
    const auto = b.spawnAt('auto', b.graph.edges[0], 1, 30, 2); auto.laneT = 4.5; auto.laneChangeAt = 0; auto.assertive = true;
    b.spawnAt('car', b.graph.edges[0], 1, 38, 4.5);
    assert.equal(b.tryLane(auto, farPlayer), false, 'rejects occupied front/rear merge gap');
  });
  test('controlled ORR traffic stays in four through lanes, off both shoulders', () => {
    const expressway = { controlled: true, ramp: false, throughLanes: 4, laneWidth: 3.5, shoulders: [2.5, 1] };
    const t = fixture([road('orr', [[-100, 0], [150, 0]], { w: 17.5, oneway: 'backward', cls: 'motorway', expressway })]);
    const lanes = new Set();
    for (let i = 0; i < 100; i++) { const lane = t.pickLane(t.graph.edges[0], 1.8, 'car'); lanes.add(lane); assert.ok(lane - .9 >= -8.75 + 1 && lane + .9 <= 8.75 - 2.5); }
    assert.equal(lanes.size, 4); assert.equal(t.allowed({ group: 'auto' }, t.graph.edges[0]), false); assert.equal(t.allowed({ group: 'bike' }, t.graph.edges[0]), false);
    for (let i = 0; i < 70; i++) t.spawn(0, 0);
    assert.ok(t.cars.length > 0); assert.ok(t.cars.every(c => c.group !== 'auto' && c.group !== 'bike'));
  });
  test('stationary lane requests never slide sideways, and red signals hold before the turn', () => {
    const t = fixture([road('in', [[-80, 0], [0, 0]], { to: 'j' }), road('out', [[0, 0], [0, 100]], { from: 'j' })]);
    const c = t.spawnAt('car', t.graph.byId.get('in'), 1, 62, 2.8); c.speed = 0; c.want = 0; c.laneT = 4.5; c.laneChangeAt = 0;
    const x = c.x, z = c.z;
    for (let i = 0; i < 120; i++) tick(t);
    assert.equal(c.x, x); assert.equal(c.z, z);
    c.want = 10; const sites = resolveSignalSites(t.graph.edges.map(g => g.e), [{ kind: 'traffic_signals', name: null, p: [0, 0] }]).sites;
    t.graph.markSignals(sites); t.t = 483 - sites[0].offset;
    const start = c.motion?.startS;
    for (let i = 0; i < 180; i++) tick(t);
    assert.ok(c.s <= (start ?? c.motion?.startS) + .001); assert.equal(c.motion?.progress, -1);
  });
  test('a committed junction turn finishes when its approach signal changes', () => {
    const t = fixture([road('in', [[-80, 0], [0, 0]], { to: 'j' }), road('out', [[0, 0], [0, 100]], { from: 'j' })]);
    const c = t.spawnAt('bus', t.graph.byId.get('in'), 1, 55, 2.8);
    const sites = resolveSignalSites(t.graph.edges.map(g => g.e), [{ kind: 'traffic_signals', name: null, p: [0, 0] }]).sites;
    t.graph.markSignals(sites); t.t = 460 - sites[0].offset;
    for (let i = 0; i < 1200 && !(c.motion?.progress >= 0); i++) tick(t);
    assert.ok(c.motion?.progress >= 0); t.t = 483 - sites[0].offset;
    for (let i = 0; i < 1200 && c.edge.e.id !== 'out'; i++) tick(t);
    assert.equal(c.edge.e.id, 'out'); assert.ok(c.speed > 1, 'does not stop in the intersection for its old approach red');
  });
  test('bus kerb pull-in remains a moving curve and dwell completes before departure', () => {
    const t = fixture([road('bus-road', [[-120, 0], [150, 0]], { w: 16, oneway: 'backward' })]);
    const stop = { edge: 'bus-road', s: 100, side: 1 };
    t.stopsByEdge.set('bus-road', [stop]);
    const c = t.spawnAt('bus', t.graph.edges[0], 1, 45, 2.8); let sawCurve = false, sawDwell = false;
    for (let i = 0; i < 3000 && !(sawDwell && c.s > 110); i++) {
      const before = { x: c.x, z: c.z }; tick(t);
      if (c.motion?.kind === 'lane' && c.motion.progress >= 0) sawCurve = true;
      if (c.dwell > 0) { sawDwell = true; if (c.speed < .01) assert.ok(Math.hypot(c.x - before.x, c.z - before.z) < .001); }
    }
    assert.ok(sawCurve && sawDwell && c.served.has(stop), JSON.stringify({ sawCurve, sawDwell, served: c.served.has(stop), s: c.s, lane: c.lane, laneT: c.laneT, motion: c.motion?.kind })); assert.ok(c.s > 110);
  });
  test('swept runtime collision stops for another edge and a crossing pedestrian', () => {
    const t = fixture([road('a', [[-100, 0], [100, 0]]), road('b', [[0, -100], [0, 100]])]);
    const a = t.spawnAt('car', t.graph.byId.get('a'), 1, 70, 2.8);
    const b = t.spawnAt('bus', t.graph.byId.get('b'), 1, 97.2, 2.8); b.speed = 0; b.want = 0;
    // Keep fixtures below the spawn/retirement budget.
    t.max = 2;
    for (let i = 0; i < 240; i++) { tick(t); assert.equal(trafficOverlap(a, b, .01), false); }
    assert.ok(a.x < b.x - 2, 'cross-edge queue prevents a collision');
    t.cars.splice(t.cars.indexOf(b), 1); t.max = 1;
    const pedestrian = { x: a.x + 5, z: a.z, crossing: true };
    for (let i = 0; i < 300; i++) tick(t, 1 / 60, farPlayer, [pedestrian]);
    assert.ok(a.x + sizes.car[2] / 2 < pedestrian.x - .2);
  });
  console.log(`${checks} traffic regression groups passed.`);
} finally { await rm(out, { recursive: true, force: true }); }

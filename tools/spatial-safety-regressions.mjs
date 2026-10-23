// Placement, recovery, camera and physical barrier regressions. No browser or
// hidden live-game state: fixtures exercise the same production functions.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'roadster-spatial-'));
let checks = 0;
const test = (label, fn) => { fn(); checks++; console.log(`PASS ${label}`); };
try {
  await build({
    stdin: { contents: `export * from './game/src/game/spatial-safety';
      export { Player } from './game/src/game/player'; export { Traffic } from './game/src/game/traffic';
      export { Game } from './game/src/game/game'; export { RoadGraph } from './game/src/game/roadgraph';
      export { collideWalls } from './game/src/game/physics'; export { drawLandmark } from './game/src/world/landmarks';
      export { placeLandmarks } from './game/src/world/landmarks'; export { buildTile } from './game/src/world/city';
      export { initTemplates } from './game/src/core/util';
      export { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
      export { Vector3, Group, RingGeometry } from 'three';`, resolveDir: join(root, 'game'), loader: 'ts' },
    // Imports above are rooted at the repository, while three resolves from game.
    absWorkingDir: root, outfile: join(out, 'game.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
    plugins: [{ name: 'repo-imports', setup(b) { b.onResolve({ filter: /^\.\/game\// }, ({ path }) => ({ path: join(root, path + '.ts') })); } }],
  });
  const { Player, Traffic, Game, RoadGraph, Vector3, Group, collideWalls, drawLandmark, placeLandmarks, buildTile, initTemplates, RoundedBoxGeometry, RingGeometry,
    staticSolidAt, clearCameraPosition, segmentHitsVehicle, streetFootprintClear, findClearStreetSpot } = await import(pathToFileURL(join(out, 'game.mjs')));
  const city = () => ({ surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map() });
  const gridAdd = (grid, item, xs, zs, size) => {
    for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++)
      for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++) {
        const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(item);
      }
  };
  const road = (id, pts, extra = {}) => ({ id, seg: id, from: `${id}-a`, to: `${id}-b`, pts, cls: 'residential', w: 8, lanes: 2, oneway: null, elev: null, name: id, maxspeed: null, ...extra });
  const addRoad = (c, e) => {
    for (let i = 0; i < e.pts.length - 1; i++) {
      const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1], hw = e.w / 2 + 1.3;
      const s = { e, i, ax, az, bx, bz, ya: e.elev?.[i] ?? 0, yb: e.elev?.[i + 1] ?? 0, hw, kind: 'road' };
      gridAdd(c.surfaceGrid, s, [ax - hw, bx + hw], [az - hw, bz + hw], 30);
    }
  };
  const rect = (c, x0, z0, x1, z1, h = 20) => {
    const b = { ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h };
    gridAdd(c.buildingGrid, b, [x0, x1], [z0, z1], 50); return b;
  };
  const fixture = (roads) => { const c = city(); roads.forEach(e => addRoad(c, e)); return { c, g: new RoadGraph(roads) }; };
  const assertExit = (c, p, cars = []) => {
    assert.ok(p, 'must find a supported clear street');
    const hx = -Math.sin(p.yaw), hz = -Math.cos(p.yaw);
    for (const ahead of [0, 2, 4, 6, 8]) assert.ok(streetFootprintClear(c, { x: p.x + hx * ahead, y: p.y, z: p.z + hz * ahead }, hx, hz, cars));
  };

  test('recovery clears the whole car and faces away from a nearby facade', () => {
    const { c, g } = fixture([road('main', [[0, 0], [100, 0]])]);
    rect(c, 46, -6, 60, 6);
    const p = findClearStreetSpot(g, c, 45, -2);
    assertExit(c, p); assert.ok(-Math.sin(p.yaw) < 0, 'nearest safe departure faces away from facade');
    assert.ok(p.x + 2.4 < 46, 'nose and tail both clear the facade');
  });
  test('narrow streets keep spawn within the carriageway instead of a fixed 2.2 m offset', () => {
    const { c, g } = fixture([road('narrow', [[0, 0], [100, 0]], { w: 4 })]);
    const p = findClearStreetSpot(g, c, 50, 0); assertExit(c, p);
    assert.ok(Math.abs(p.z) + 1.15 <= 2);
  });
  test('one-way recovery respects the denied heading while finding a clear departure', () => {
    const { c, g } = fixture([road('one-way', [[0, 0], [100, 0]], { oneway: 'forward' })]);
    const p = findClearStreetSpot(g, c, 50, 0, { heading: { x: 1, z: 0 } });
    assertExit(c, p); assert.ok(-Math.sin(p.yaw) < -0.99);
  });
  test('blocked nearest road uses a farther clear road and fully blocked areas refuse placement', () => {
    const roads = [road('blocked', [[0, 0], [100, 0]]), road('clear', [[0, 30], [100, 30]])];
    const { c, g } = fixture(roads); rect(c, -10, -10, 110, 10);
    const p = findClearStreetSpot(g, c, 50, 0); assertExit(c, p); assert.ok(p.z > 25);
    rect(c, -10, 15, 110, 45); assert.equal(findClearStreetSpot(g, c, 50, 0), null);
  });
  test('graph-only roads cannot spawn into unloaded geometry or arbitrary area coordinates', () => {
    const c = city(), g = new RoadGraph([road('unloaded', [[0, 0], [100, 0]])]);
    assert.equal(findClearStreetSpot(g, c, 50, 0), null);
    let placed = false;
    const game = Object.assign(Object.create(Game.prototype), { graph: g, city: c, player: { place() { placed = true; } } });
    assert.equal(game.placeNear(50, 0), false); assert.equal(placed, false);
  });
  test('recovery avoids a bus at the otherwise preferred street point', () => {
    const { c, g } = fixture([road('main', [[0, 0], [100, 0]])]);
    const cars = [{ x: 50, z: -2, y: 0, hx: 1, hz: 0, size: [2.6, 3.2, 12] }];
    const p = findClearStreetSpot(g, c, 50, -2, { vehicles: cars });
    assertExit(c, p, cars);
  });
  test('camera sightline stops before a pole and solid wall, with edge clearance', () => {
    const c = city(); c.obstacles.set('0,-1', [{ x: 0, z: -4, r: 0.7, top: 8 }]);
    const from = { x: 0, y: 2, z: 0 }, desired = { x: 0, y: 3, z: -8 };
    const p = clearCameraPosition(c, from, desired); assert.ok(p.z > -3); assert.equal(staticSolidAt(c, p), false);
    c.obstacles.clear();
    c.walls.set('0,-1', [{ ax: -5, az: -4, bx: 5, bz: -4, y0a: 0, y0b: 0, y1a: 6, y1b: 6, kind: 'parapet' }]);
    const q = clearCameraPosition(c, from, desired); assert.ok(q.z > -3.65); assert.equal(staticSolidAt(c, q), false);
    rect(c, 4, -8, 8, 8);
    assert.equal(staticSolidAt(c, { x: 3.8, y: 4, z: 0 }), true, 'camera radius clears the building edge');
  });
  test('close-wall camera fallback stays below an overhead slab and keeps a clear sightline', () => {
    const c = city(); rect(c, -4, -2, -1, 2);
    const slab = { ax: -20, az: 0, bx: 20, bz: 0, ya: 4, yb: 4, hw: 20, kind: 'deck', e: null, i: 0 };
    gridAdd(c.surfaceGrid, slab, [-20, 20], [-20, 20], 30);
    const from = { x: 0, y: 2, z: 0 }, p = clearCameraPosition(c, from, { x: -8, y: 3, z: 0 });
    assert.equal(staticSolidAt(c, p), false); assert.ok(p.y < 3.4);
    for (let t = 0; t <= 1; t += 0.05) assert.equal(staticSolidAt(c, { x: p.x * t, y: from.y + (p.y - from.y) * t, z: p.z * t }), false);
  });
  test('embedded camera pivot exits a facade even when the desired camera is also embedded', () => {
    const c = city(); rect(c, -2, -2, 2, 2, 12);
    const from = { x: 0, y: 2, z: 0 };
    for (const wanted of [{ x: 0, y: 4, z: 8 }, { x: 0, y: 3, z: 1 }, from]) {
      const p = clearCameraPosition(c, from, wanted);
      assert.equal(staticSolidAt(c, p), false);
      assert.ok(Math.hypot(p.x, p.y - 2, p.z) < 2.36, 'choose a nearby exterior instead of jumping above the building');
    }
  });
  test('an embedded camera under a slab exits below it, with full camera-volume clearance', () => {
    const c = city();
    const slab = { ax: -10, az: 0, bx: 10, bz: 0, ya: 8, yb: 8, hw: 10, kind: 'deck', e: null, i: 0 };
    gridAdd(c.surfaceGrid, slab, [-10, 10], [-10, 10], 30);
    const from = { x: 0, y: 7.75, z: 0 }, p = clearCameraPosition(c, from, { x: 0, y: 8, z: 4 });
    assert.equal(staticSolidAt(c, from), true); assert.equal(staticSolidAt(c, p), false);
    assert.ok(p.y < 7.36 && p.y > 7.3);
  });
  test('deeply embedded and below-ground camera pivots still return outside every local solid', () => {
    const c = city(); rect(c, -100, -100, 100, 100, 100);
    c.obstacles.set('0,0', [{ x: 0, z: 0, r: 0.8, top: 130 }]);
    const p = clearCameraPosition(c, { x: 0, y: 2, z: 0 }, { x: 0, y: 4, z: 8 });
    assert.equal(staticSolidAt(c, p), false); assert.ok(p.y > 130);
    const empty = city(), below = clearCameraPosition(empty, { x: 0, y: -40, z: 0 }, { x: 0, y: -39, z: 8 });
    assert.equal(staticSolidAt(empty, below), false); assert.ok(below.y > 0.35);
  });
  test('clear pivot with embedded desired camera retains a fully checked ordinary sightline', () => {
    const c = city(); rect(c, -2, 4, 2, 12, 10);
    const from = { x: 0, y: 2, z: 0 }, p = clearCameraPosition(c, from, { x: 0, y: 3, z: 8 });
    assert.ok(p.z < 3.65); assert.equal(staticSolidAt(c, p), false);
    for (let t = 0; t <= 1; t += 0.05) assert.equal(staticSolidAt(c, { x: p.x * t, y: from.y + (p.y - from.y) * t, z: p.z * t }), false);
  });
  test('full bus length occludes the chase camera and visibility restores after it leaves', () => {
    const car = { x: 5, z: 0, y: 0, hx: 1, hz: 0, size: [2.6, 3.2, 12], g: { visible: true, rotation: { y: -Math.PI / 2 } } };
    const cam = new Vector3(0, 2.5, -10), target = { x: 0, y: 0.55, z: 10 };
    assert.equal(segmentHitsVehicle(cam, target, car), true, 'bus end crosses ray even though centre is 5 m away');
    const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [car] });
    traffic.hideNear(cam, target); assert.equal(car.g.visible, false);
    car.x = 20; traffic.hideNear(cam, target); assert.equal(car.g.visible, true);
  });
  test('rotated trucks occlude correctly but traffic overhead does not hide from below', () => {
    const q = Math.SQRT1_2, car = { x: 0, z: 0, y: 0, hx: q, hz: q, size: [2.6, 3.5, 10] };
    assert.equal(segmentHitsVehicle({ x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, car), true);
    car.y = 8;
    assert.equal(segmentHitsVehicle({ x: -10, y: 2, z: 0 }, { x: 10, y: 2, z: 0 }, car), false);
  });
  test('Mecca facade and gate piers collide while their arch openings remain open', () => {
    const c = city(), batch = { box() {}, add() {} };
    drawLandmark({ kind: 'mecca', x: 0, z: 0, rot: 0, lat: 0, lon: 0, name: 'fixture', clear: 0 }, {
      B: new Proxy({}, { get: () => batch }), road: () => false, roadY: () => 0,
      obstacle(x, z, r, top) { gridAdd(c.obstacles, { x, z, r, top }, [x - r, x + r], [z - r, z + r], 50); },
      solid(ring, h) { gridAdd(c.buildingGrid, { ring, h }, ring.map(p => p[0]), ring.map(p => p[1]), 50); },
    });
    assert.equal(staticSolidAt(c, { x: 12.02 * 0.405, y: 3, z: -23 }), true);
    assert.equal(staticSolidAt(c, { x: 0, y: 0.75, z: -23 }), true, 'the visible raised plinth has support/collision');
    assert.equal(staticSolidAt(c, { x: 0, y: 3, z: -23 }), false);
    assert.equal(staticSolidAt(c, { x: -7 + 14 * 0.405, y: 3, z: -140 }), true);
    assert.equal(staticSolidAt(c, { x: -7, y: 3, z: -140 }), false);
  });
  const barrier = (kind, floor = 0) => ({ ax: -10, az: 0, bx: 10, bz: 0, y0a: floor, y0b: floor, y1a: floor + (kind === 'kerb' ? 0.2 : 1.1), y1b: floor + (kind === 'kerb' ? 0.2 : 1.1), kind });
  test('bridge parapet prevents a crossing step while clear flight can pass above it', () => {
    const c = city(); c.walls.set('0,0', [barrier('parapet', 8)]);
    const p = { x: 0, z: 2 };
    assert.ok(collideWalls(c, { x: 0, z: -2 }, p, 1.05, 8, 9.15).hit > 0);
    assert.ok(p.z <= -1.05);
    const flying = { x: 0, z: 2 };
    assert.equal(collideWalls(c, { x: 0, z: -2 }, flying, 1.05, 10, 11.15).hit, 0);
    assert.equal(flying.z, 2);
  });
  const mockPlayer = (c, extra = {}) => Object.assign(Object.create(Player.prototype), {
    city: c, pos: new Vector3(0, 0.55, -1.5), yaw: Math.PI, speed: 10, vy: 0, steerVis: 0,
    flying: false, descending: false, charge: 2.5, chargeCap: 20, earnT: 0, onRoad: true,
    lastSupport: 0, lastKind: 'road', lastElevRoad: false, lastEdge: null, hitCooldown: 0, bump: 0,
    flyAlt: 24, altT: 0, kerbT: 0, glide: null, placementRevision: 0,
    group: new Group(), glow: new Group(), light: new Group(), wheels: [], wheelRollers: [],
    animateThrusters() {}, ...extra,
  });
  const input = { throttle: 1, brake: 0, steer: 0, flyPressed: false, boost: false };
  test('takeoff does not disable wall collision before the car clears parapet height', () => {
    const c = city(); c.walls.set('0,0', [barrier('parapet')]);
    const p = mockPlayer(c); p.update(0.2, { ...input, flyPressed: true }, 0.2);
    assert.equal(p.flying, true); assert.ok(p.pos.y > 1.65); assert.ok(p.pos.z <= -1.05);
  });
  test('a low kerb allows crossing but produces a visible bump and slows the car', () => {
    const c = city(); c.walls.set('0,0', [barrier('kerb')]);
    const p = mockPlayer(c, { pos: new Vector3(0, 0.55, -0.5) }); p.update(0.1, input, 0.1);
    assert.ok(p.pos.z > 0); assert.ok(p.bump > 0); assert.ok(p.kerbT > 0); assert.ok(p.speed < 10);
  });
  test('placement cancels old glide and recovery completion immediately aligns model and heading', () => {
    const { c } = fixture([road('main', [[-50, 0], [50, 0]])]);
    const p = mockPlayer(c, { glide: { x: 100, y: 0.55, z: 100, yaw: 0, t: 0 }, lastEdge: {} });
    p.place(10, 0, -Math.PI / 2); assert.equal(p.glide, null); assert.equal(p.lastEdge, null); assert.equal(p.onRoad, true);
    assert.equal(p.placementRevision, 1); assert.equal(p.group.rotation.y, p.yaw);
    p.glideTo(10, 0, 0, Math.PI / 2); p.updateGlide(0.016, 1);
    assert.equal(p.glide, null); assert.equal(p.placementRevision, 2); assert.equal(p.group.rotation.y, p.yaw);
    assert.equal(p.yaw, Math.PI / 2); assert.ok(p.group.position.equals(p.pos));
  });
  // Optional integration pass uses actual shipped roads and the same tile builder
  // as the browser. It verifies placement geometry, not successful player driving.
  if (process.argv.includes('--shipped')) {
    const readPack = async file => JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', file))));
    const core = await readPack('core.pack.wasm'), landmarks = placeLandmarks(core.origin);
    initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new RingGeometry(1, 1.35, 40) });
    const kx = Math.cos(core.origin.lat * Math.PI / 180) * 6380050.094 * Math.PI / 180, kz = 6341141.9 * Math.PI / 180;
    for (const [name, lat, lon] of [['Uppal', 17.4058, 78.5591], ['Charminar', 17.3616, 78.4747], ['RTC X Roads', 17.4063, 78.4966]]) {
      const x = (lon - core.origin.lon) * kx, z = -(lat - core.origin.lat) * kz, c = city(), g = new RoadGraph(core.roads), start = performance.now();
      let tiles = 0;
      for (const pack of core.packs) {
        const wanted = pack.tiles.filter(([i, j]) => Math.hypot(Math.max(i * 1000 - x, 0, x - (i + 1) * 1000), Math.max(j * 1000 - z, 0, z - (j + 1) * 1000)) <= 650);
        if (!wanted.length) continue;
        const decoded = await readPack(pack.file);
        for (const [i, j] of wanted) {
          const zone = decoded.tiles[`${i}_${j}`]; if (!zone) continue;
          const built = buildTile(zone, { lowQ: true, metro: core.metro, landmarks }); tiles++;
          for (const grid of ['buildingGrid', 'surfaceGrid', 'walls', 'obstacles']) for (const [key, values] of built[grid]) c[grid].set(key, [...(c[grid].get(key) || []), ...values]);
          g.addRoads(built.roads);
        }
      }
      test(`${name} spawn has a supported whole-car footprint and clear 8 m departure in shipped geometry`, () => {
        const t = performance.now(), p = findClearStreetSpot(g, c, x, z, { preferMajor: true });
        assertExit(c, p); assert.ok(Math.hypot(p.x - x, p.z - z) < 550);
        console.log(`  ${tiles} tiles; placement search ${Math.round(performance.now() - t)} ms; offset ${Math.round(Math.hypot(p.x - x, p.z - z))} m; build ${Math.round(performance.now() - start)} ms`);
      });
    }
  }
  console.log(`${checks} spatial safety regressions passed`);
} finally { await rm(out, { recursive: true, force: true }); }

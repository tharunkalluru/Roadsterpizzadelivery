import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
// Historical rooftop/IMAX world-footprint fixtures remain regression coverage.
import { loadLegacyLevels as loadLevels } from './fixtures/legacy-levels';
import { DeliveryRuntime } from '../../src/delivery/runtime';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import type { DeliveryModuleContext } from '../../src/delivery/modules/types';
import { RoadGraph } from '../../src/game/roadgraph';
import { RailTrains } from '../../src/game/rail';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { initTemplates } from '../../src/core/util';
import { waterGrid, waterHeightAt } from '../../src/world/water';
import { buildTile, type TileZone } from '../../src/world/city';
import { placeLandmarks } from '../../src/world/landmarks';
import { roofUnder } from '../../src/game/physics';

const levels = loadLevels();
const unpack = (file: string) => JSON.parse(gunzipSync(readFileSync(`public/city/${file}`)).toString());
const core = unpack('core.pack.wasm');
const packs = new Map<string, { tiles: Record<string, TileZone> }>();
function tileAt(x: number, z: number) {
  const i = Math.floor(x / 1000), j = Math.floor(z / 1000);
  const pack = core.packs.find((p: any) => p.tiles.some((t: number[]) => t[0] === i && t[1] === j));
  if (!pack) return null;
  if (!packs.has(pack.file)) packs.set(pack.file, unpack(pack.file));
  return packs.get(pack.file)!.tiles[`${i}_${j}`];
}

test('every authored delivery and chain stop is inside the shipped city and has a real streamed tile', () => {
  for (const level of levels) {
    const { x, z } = level.destination;
    const points = [{ x, z }, ...(Array.isArray(level.moduleParams.targets) ? level.moduleParams.targets.map((raw: any) => ({ x: raw.x ?? x + (raw.dx || 0), z: raw.z ?? z + (raw.dz || 0) })) : [])];
    for (const p of points) {
      assert.ok(p.x >= core.bounds.minX && p.x <= core.bounds.maxX && p.z >= core.bounds.minZ && p.z <= core.bounds.maxZ, level.id);
      assert.ok(tileAt(p.x, p.z), `${level.id}: target outside available city data`);
    }
  }
});

test('Level1 can actually prepare its truck on the shipped highway using the production runtime selector', () => {
  const level = levels[0], events = new EventBus<DeliveryEvents>();
  const graph = new RoadGraph(core.roads, []);
  const local = tileAt(level.destination.x, level.destination.z)!;
  graph.addRoads(local.roads, []);
  let prepared: DeliveryModuleContext | undefined;
  const game: any = {
    deliveryEvents: events, graph, rail: { bodies: [] },
    player: { pos: { ...level.destination, y: .55 }, yaw: 0, speed: 0, flying: false, descending: false, jumping: false },
    traffic: { pickLane() { return 2.4; } },
    city: { surfaceGrid: new Map(), buildingGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] },
    hud: { root: null, pickupStatus() {}, set() {} }, carriers: { clear() {} }, pickupDetector: { reset() {} },
    sound: { cue() {} }, resetInput() {}, clock: { getDelta() {} }, engine: { scene: new THREE.Scene() },
    routeTarget: null, setTarget(target: unknown) { game.routeTarget = target; },
  };
  const runtime = new DeliveryRuntime(game, {
    levels: [level], storage: { getItem() { return null; }, setItem() {} },
    uiFactory() { return { blocking: false, collectionOpen: false, setVisible() {}, update() {}, dispose() {} }; },
    moduleFactory() { return { target: level.destination as any, status: { instruction: '', actionLabel: 'DROP', canDrop: false }, supports: [], movement: { mode: 'normal' }, setup(ctx) { prepared = ctx; }, update() {}, onDrop() {}, teardown() {} }; },
  });
  events.emit('orderPicked', { carrierId: 'test-carrier', position: { x: 0, y: 3, z: 0 } });
  runtime.beforePlayer(.016);
  assert.ok(prepared, 'A pickup must not lead to an arrival with no truck scene');
  assert.ok(prepared.route && prepared.route.length >= 30, 'leave a usable moving approach, not a tiny junction stub');
  const near = graph.nearestEdges(level.destination.x, level.destination.z, 1).filter(e => e.e.cls === 'trunk' && e.len > 300);
  assert.ok(near.length, 'the highway scene must be anchored on a real continuous highway');
  assert.ok(prepared.route.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  runtime.dispose();
});

test('Secunderabad delivery can bind actual city trains instead of waiting for a nonexistent rail service', () => {
  initTemplates();
  const d = levels.find(l => l.moduleParams.vehicle === 'train')!.destination, network = railwayNetwork();
  assert.ok((network.closest(d.x, d.z, 100)?.d ?? Infinity) < 100);
  const built = buildTile(tileAt(d.x, d.z)!, { lowQ: true, railway: network });
  const rails = new Map(built.rails.map(r => [r.id, r]));
  assert.ok(rails.size, 'actual streamed tile publishes non-service railway tracks');
  const material = new THREE.MeshBasicMaterial(), sim = new RailTrains(material);
  // Real spawning, route selection and coach frames; no synthetic target train.
  for (let frame = 0; frame < 400; frame++) sim.update(.1, d.x, d.z, rails);
  assert.ok(sim.bodies.some(b => Math.hypot(b.x - d.x, b.z - d.z) <= 650), 'runtime train binding radius must contain an existing coach');
  for (const geometry of Object.values(sim.geos)) geometry.dispose();
  material.dispose();
});

test('Hussain Sagar underwater delivery and its full dive approach are inside actual water', () => {
  const level = levels.find(l => l.module === 'underwater')!, d = level.destination;
  const grid = new Map();
  for (const dx of [-70, 0, 70]) for (const dz of [-70, 0, 70]) {
    const zone = tileAt(d.x + dx, d.z + dz); assert.ok(zone);
    for (const [key, regions] of waterGrid(zone.areas)) grid.set(key, regions);
  }
  assert.notEqual(waterHeightAt(grid, d.x, d.z), null);
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI * 2 / 24;
    assert.notEqual(waterHeightAt(grid, d.x + Math.cos(angle) * 60, d.z + Math.sin(angle) * 60), null, 'the dive must not auto-descend through dry land');
  }
});


test('actual police rooftop and IMAX sets clear the whole existing-city footprint, not only its empty centre', () => {
  initTemplates();
  const landmarks = placeLandmarks(core.origin, core.packs.flatMap((p: any) => p.tiles));
  for (const levelNumber of [3, 5]) {
    const level = levels.find(l => l.level === levelNumber)!, d = level.destination;
    const zone = tileAt(d.x, d.z)!;
    const built = buildTile(zone, { lowQ: true, landmarks, metro: core.metro, railway: railwayNetwork() });
    const city: any = { ...built, movingRail: [] };
    const halfWidth = levelNumber === 3 ? 12 : 17, halfDepth = levelNumber === 3 ? 10 : 18;
    const points: [number, number][] = [];
    for (let dx = -halfWidth; dx <= halfWidth; dx += 1) for (let dz = -halfDepth; dz <= halfDepth; dz += 1) points.push([d.x + dx, d.z + dz]);
    const requiredRoof = roofUnder(city, points);
    assert.ok(requiredRoof > roofUnder(city, [[d.x, d.z]]) + 3, 'real-data fixture must exercise the off-centre building regression');
    let prepared: DeliveryModuleContext | undefined;
    const events = new EventBus<DeliveryEvents>();
    const game: any = {
      deliveryEvents: events, city, player: { pos: { ...d }, speed: 0 }, traffic: { setKinematicVehicles() {} },
      hud: { root: null, set() {}, pickupStatus() {} }, sound: { cue() {} },
      carriers: { clear() {} }, pickupDetector: { reset() {} }, resetInput() {},
      engine: { scene: new THREE.Scene() }, routeTarget: null,
      setTarget(target: unknown) { game.routeTarget = target; },
    };
    const runtime = new DeliveryRuntime(game, {
      levels: [level], storage: { getItem() { return null; }, setItem() {} },
      uiFactory() { return { blocking: false, collectionOpen: false, setVisible() {}, update() {}, dispose() {} }; },
      moduleFactory() { return { target: d as any, status: { instruction: '', actionLabel: 'DROP', canDrop: false }, supports: [], movement: { mode: 'normal' }, setup(ctx) { prepared = ctx; }, update() {}, onDrop() {}, teardown() {} }; },
    });
    events.emit('orderPicked', { carrierId: 'test-carrier', position: { x: 0, y: 3, z: 0 } });
    runtime.beforePlayer(.016);
    assert.ok(prepared);
    const shellBelowFloor = levelNumber === 3 ? 7 : .6;
    assert.ok(prepared.destination.y - shellBelowFloor >= requiredRoof, `Level${levelNumber}: visible set underside ${prepared.destination.y - shellBelowFloor} intersects real roof${requiredRoof}`);
    runtime.dispose();
  }
});

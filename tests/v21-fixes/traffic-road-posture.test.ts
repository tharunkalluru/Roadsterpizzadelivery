import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initTemplates, rng } from '../../src/core/util';
import { Traffic, type Car } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import { buildTile } from '../../src/world/city';
import * as M from '../../src/world/traffic_models';
import type { RoadEdge, XZ } from '../../src/world/types';
import { EmittedPlayerGeometry } from '../fixtures/emitted-player-contact';
import { trafficRoadPitch } from '../../src/game/traffic-road-posture';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const gradient = { addColorStop() {} }, context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, k) => k in o ? o[k] : () => {} });
(globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, .12), ring: new THREE.RingGeometry(1, 1.35, 40) });
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
const models = { bus: M.bus(rng(1)), auto: M.auto(rng(2)), car: M.car('sedan', '#eeeeee', rng(3)) };
const prototypes = Object.fromEntries(Object.entries(models).map(([group, m]) => [group, { group, size: m.size, body: m.body.geometry(), lights: m.lights.geometry(), decals: m.decals ?? [] }]));
after(() => {
  for (const p of Object.values(prototypes)) for (const g of [p.body, p.lights, ...p.decals.map(d => d.geo)]) g.dispose();
  material.dispose();
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete (globalThis as any).document;
});

function fixture(grade: number, direction: XZ = [.6, .8]) {
  const pts: XZ[] = [[160 - direction[0] * 90, 160 - direction[1] * 90], [160 + direction[0] * 90, 160 + direction[1] * 90]];
  const e: RoadEdge = { id: 'actual-ramp', cls: 'primary', name: 'Traffic posture fixture', w: 13, lanes: 3, oneway: null, from: 'a', to: 'b', pts, elev: [20 - grade * 90, 20 + grade * 90], maxspeed: 40 };
  const built = buildTile({ i: 0, j: 0, roads: [e], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const city: any = { surfaceGrid: built.surfaceGrid, buildingGrid: built.buildingGrid, walls: built.walls, obstacles: built.obstacles, waterGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] };
  const geometry = new EmittedPlayerGeometry({ minX: 0, maxX: 320, minZ: 0, maxZ: 320 }); geometry.collect(built);
  const graph = new RoadGraph([e]);
  const traffic: Traffic = Object.assign(Object.create(Traffic.prototype), { graph, city, cars: [], max: 0, scene: new THREE.Scene(), mats: { vBody: material, vLight: material }, byGroup: Object.fromEntries(Object.entries(prototypes).map(([key, value]) => [key, [value]])), r: rng(77), t: 0, plans: 0, stopsByEdge: new Map(), passengerExchanges: [], services: null, onHorn() {} });
  return { e, graph, traffic, geometry, city };
}

function contacts(c: Car, geometry: EmittedPlayerGeometry) {
  c.g.updateMatrixWorld(true);
  const mesh = c.g.children[0] as THREE.Mesh, p = mesh.geometry.getAttribute('position'), frame = geometry.frame(c.x, c.z), point = new THREE.Vector3();
  const axles = c.group === 'bus' ? [-3.6, 2.1] : c.group === 'auto' ? [-1.12, .8] : [-1.35, 1.35];
  const contacts = new Map<number, number>(); let minBody = Infinity, count = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    point.set(x, y, z).applyMatrix4(mesh.matrixWorld);
    const surface = frame.nearestSupport(point.x, point.z, c.y); if (!surface) continue;
    const gap = point.y - surface.y;
    if (y < .06) {
      const axle = axles.findIndex(a => Math.abs(z - a) < .4);
      if (axle >= 0) { const key = axle * 2 + (x < 0 ? 0 : 1); contacts.set(key, Math.min(contacts.get(key) ?? Infinity, gap)); count++; }
    } else minBody = Math.min(minBody, gap);
  }
  assert.ok(count > 0 && contacts.size >= (c.group === 'auto' ? 3 : 4), 'sample real merged-model tyre tread vertices at every axle');
  return { tyres: [...contacts.values()], minBody };
}

for (const group of ['bus', 'auto', 'car'] as const) test(`actual ${group} mesh follows emitted rising/falling road planes at spawn and during normal traffic`, t => {
  const baseline = fixture(0), b = baseline.traffic.spawnAt(group, baseline.graph.byId.get('actual-ramp')!, 1, 90, 2.4), flat = contacts(b, baseline.geometry);
  let minimumBody = Infinity, worstContactChange = 0;
  for (const grade of [-.1, -.075, .075, .1]) for (const dir of [-1, 1] as const) for (const hz of [30, 60]) {
    const f = fixture(grade), c = f.traffic.spawnAt(group, f.graph.byId.get('actual-ramp')!, dir, 70, 2.4);
    c.speed = c.want = 8;
    for (let frame = 0; frame <= hz; frame++) {
      const actual = contacts(c, f.geometry);
      minimumBody = Math.min(minimumBody, actual.minBody);
      worstContactChange = Math.max(worstContactChange, ...actual.tyres.map((gap, i) => Math.abs(gap - flat.tyres[i])));
      assert.ok(actual.minBody >= -.01, `actual visible body penetrates the emitted ramp: ${JSON.stringify({ group, grade, dir, hz, frame, actual })}`);
      assert.ok(actual.tyres.every((gap, i) => Math.abs(gap - flat.tyres[i]) < .005), `grade adds tyre penetration/float beyond the unchanged flat mesh: ${JSON.stringify({ group, grade, dir, hz, frame, actual, flat })}`);
      if (frame < hz) f.traffic.update(1 / hz, c.x, c.z, { x: c.x + 290, z: c.z + 290, y: c.y + .55, speed: 0 }, []);
    }
    assert.ok(Math.abs(f.traffic.t - 1) < 1e-10, 'normal traffic clock advances exactly one second');
    assert.ok(c.s > 77.9 && c.s < 78.1 && Math.abs(c.speed - 8) < 1e-10, 'surface posture does not change road progress or speed');
  }
  t.diagnostic(JSON.stringify({ group, minimumBody, worstContactChange, baselineTyres: flat.tyres }));
});

test('visual road pitch rejects missing finite pavement, unavailable city and another overhead layer', () => {
  const f = fixture(.075), edge = f.graph.byId.get('actual-ramp')!, p = f.graph.pointAt(edge, 90, 1, 2.4);
  assert.ok(Math.abs(trafficRoadPitch(f.city, p, 11) - Math.atan(.075)) < 1e-9);
  assert.equal(trafficRoadPitch(undefined, p, 11), 0);
  assert.equal(trafficRoadPitch({ ...f.city, surfaceGrid: new Map() }, p, 11), 0);
  assert.equal(trafficRoadPitch(f.city, { ...p, y: p.y - 6 }, 11), 0, 'a separate upper road cannot tilt a lower vehicle');
  assert.equal(trafficRoadPitch(f.city, f.graph.pointAt(edge, edge.len - .1, 1, 2.4), 11), 0, 'the forward probe must remain inside actual finite pavement');
  for (const invalid of [0, -1, Infinity, NaN]) assert.equal(trafficRoadPitch(f.city, p, invalid), 0);
});

function state(c: Car) {
  return Object.fromEntries(['dir', 's', 'speed', 'want', 'lane', 'laneT', 'base', 'x', 'y', 'z', 'hx', 'hz', 'wob', 'blockedT', 'stuckT', 'passS', 'honkT', 'filtering', 'dwell', 'planAfter', 'assertive', 'laneChangeAt', 'uturnAt'].map(key => [key, (c as any)[key]]));
}
test('paired normal traffic runs retain exact clocks, kinematics and headings with the visual correction', () => {
  for (const group of ['bus', 'auto', 'car'] as const) for (const grade of [-.1, 0, .075]) for (const hz of [30, 60]) {
    const corrected = fixture(grade), original = fixture(grade);
    (original.traffic as any).placeVisual = (g: THREE.Group, p: any) => { g.position.set(p.x, p.y + .02, p.z); g.rotation.set(0, Math.atan2(-p.hx, -p.hz), 0); };
    const a = corrected.traffic.spawnAt(group, corrected.graph.byId.get('actual-ramp')!, 1, 70, 2.4), b = original.traffic.spawnAt(group, original.graph.byId.get('actual-ramp')!, 1, 70, 2.4);
    a.want = b.want = 8;
    for (let i = 0; i <= hz; i++) {
      assert.deepEqual(state(a), state(b)); assert.equal(a.edge.e.id, b.edge.e.id);
      assert.equal(corrected.traffic.t, original.traffic.t); assert.equal(a.g.rotation.y, b.g.rotation.y);
      assert.deepEqual(a.g.position.toArray(), b.g.position.toArray());
      assert.equal(a.motion?.kind, b.motion?.kind); assert.equal(a.motion?.progress, b.motion?.progress);
      if (i < hz) {
        corrected.traffic.update(1 / hz, a.x, a.z, { x: a.x + 290, z: a.z + 290, y: a.y + .55, speed: 0 }, []);
        original.traffic.update(1 / hz, b.x, b.z, { x: b.x + 290, z: b.z + 290, y: b.y + .55, speed: 0 }, []);
      }
    }
  }
});

test('player and jump overlap follows the actual pitched bus locally at its nose, middle and tail', () => {
  for (const grade of [-.1, .1]) {
    const f = fixture(grade), c = f.traffic.spawnAt('bus', f.graph.byId.get('actual-ramp')!, 1, 90, 2.4);
    c.g.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), mesh = c.g.children[0] as THREE.Mesh;
    for (const along of [-4.4, 0, 4.4, -Math.sign(grade) * 5.65]) {
      const x = c.x + c.hx * along, z = c.z + c.hz * along;
      ray.set(new THREE.Vector3(x, c.y + 10, z), new THREE.Vector3(0, -1, 0));
      const roof = ray.intersectObject(mesh, false)[0]?.point.y;
      assert.ok(roof !== undefined, `the actual visible bus must occupy the tested longitudinal slice: ${JSON.stringify({ grade, along })}`);
      const touching = { bottom: roof - .08, top: roof + .02 };
      assert.ok(f.traffic.hitTest(x, roof + .55, z, .04, touching) === c, `jump/body collision misses visible pitched roof: ${JSON.stringify({ grade, along, roof, oldRoof: c.y + c.size[1] })}`);
      const point = { x, y: roof + .55, z };
      assert.ok(f.traffic.pushOut(point, .04, .04, touching) === c, 'the physical overlap and push-out must agree');
      // The existing box includes up to12cm above the bus's noncentral roof
      // panels. Keep that original allowance while testing a clear local jump.
      const clear = { bottom: roof + .18, top: roof + .38 }, airborne = { x, y: roof + .73, z };
      assert.ok(f.traffic.hitTest(x, airborne.y, z, .04, clear) === null, `a jump above the lower local body box must not hit a globally inflated roof: ${JSON.stringify({ grade, along, roof })}`);
      assert.ok(f.traffic.pushOut(airborne, .04, .04, clear) === null);
      assert.deepEqual(airborne, { x, y: roof + .73, z }, 'a clear local jump keeps its physical root');
    }
  }
});

test('flat traffic player bounds retain their exact prior vertical interval', () => {
  const f = fixture(0), c = f.traffic.spawnAt('bus', f.graph.byId.get('actual-ramp')!, 1, 90, 2.4);
  for (const bottom of [-.5, 0, .2, 3.2, 3.3, 3.5]) {
    const bounds = { bottom: c.y + bottom, top: c.y + bottom + .1 }, expected = bounds.bottom < c.y + c.size[1] && bounds.top > c.y ? c : null;
    assert.ok(f.traffic.hitTest(c.x, c.y + .55, c.z, .2, bounds) === expected);
  }
});

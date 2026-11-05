import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initTemplates, rng } from '../../src/core/util';
import { buildTile, type Wall } from '../../src/world/city';
import { RoadGraph, type GEdge } from '../../src/game/roadgraph';
import { Traffic, type Car } from '../../src/game/traffic';
import { busLane, busTurn } from '../../src/game/bus-path';
import { trafficApproachRoom, trafficBendRoom } from '../../src/game/traffic-approach';
import { trafficCurveClear, turnProfile, type TrafficCurve, type TrafficPose } from '../../src/game/traffic-path';
import * as M from '../../src/world/traffic_models';
import type { RoadEdge, TileZone, XZ } from '../../src/world/types';

const fixture = JSON.parse(readFileSync('tests/fixtures/reported-west-bus-continuation-independent.json', 'utf8'));
const ids = ['38a7824d-0e1_0', '38a7824d-0e1_1'];
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const gradient = { addColorStop() {} }, context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, k) => k in o ? o[k] : () => {} });
(globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, .12), ring: new THREE.RingGeometry(1, 1.35, 40) });
const busModel = M.bus(rng(1)), busBoards = M.busRouteBoards('QA', 'WEST CONTINUATION');
const busBody = busModel.body.geometry(), busLights = busModel.lights.geometry();
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
const busTail = busModel.tailLights?.geometry(), busReverse = busModel.reverseLights?.geometry();
const busPrototype = { group: 'bus', size: busModel.size, body: busBody, lights: busLights, tailLights: busTail, reverseLights: busReverse, headlights: busModel.headlights, decals: [...(busModel.decals ?? []), ...busBoards] };
const carModel = M.car('sedan', '#eeeeee', rng(2)), autoModel = M.auto(rng(3));
const otherPrototypes = [carModel, autoModel].map(m => ({ group: m.kind, size: m.size, body: m.body.geometry(), lights: m.lights.geometry(), decals: m.decals ?? [] }));
const uniqueVertices = new Map<string, THREE.Vector3>();
for (const g of [busBody, busLights, busTail, busReverse, ...busPrototype.decals.map(d => d.geo)].filter(Boolean) as THREE.BufferGeometry[]) {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); uniqueVertices.set(v.toArray().map(n => n.toFixed(7)).join(','), v); }
}
const bodyVertices = [...uniqueVertices.values()];
after(() => {
  for (const g of [busBody, busLights, busTail, busReverse, ...busPrototype.decals.map(d => d.geo), ...otherPrototypes.flatMap(p => [p.body, p.lights, ...p.decals.map(d => d.geo)])].filter(Boolean) as THREE.BufferGeometry[]) g.dispose(); material.dispose();
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete (globalThis as any).document;
});

type Triangle = [number, number, number, number, number, number, number, number, number];
function height(t: Triangle, x: number, z: number) {
  const bx = t[3] - t[0], bz = t[5] - t[2], cx = t[6] - t[0], cz = t[8] - t[2], d = bx * cz - bz * cx;
  if (Math.abs(d) < 1e-10) return null;
  const px = x - t[0], pz = z - t[2], u = (px * cz - pz * cx) / d, v = (bx * pz - bz * px) / d;
  return u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001 ? t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1]) : null;
}
function triangleIndex(triangles: Triangle[]) {
  const grid = new Map<string, Triangle[]>();
  for (const t of triangles) for (let x = Math.floor(Math.min(t[0], t[3], t[6]) / 4); x <= Math.floor(Math.max(t[0], t[3], t[6]) / 4); x++)
    for (let z = Math.floor(Math.min(t[2], t[5], t[8]) / 4); z <= Math.floor(Math.max(t[2], t[5], t[8]) / 4); z++) { const key = `${x},${z}`; (grid.get(key) ?? grid.set(key, []).get(key)!).push(t); }
  return (x: number, z: number) => grid.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) ?? [];
}
function world(roads?: RoadEdge[]) {
  const zone: TileZone = roads ? { i: 0, j: 0, roads, nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] } : JSON.parse(JSON.stringify(fixture.tile));
  const built = buildTile(zone, { lowQ: true }), triangles = (mat: string) => built.buffers.filter(b => b.mat === mat).flatMap(b => Array.from({ length: b.pos.length / 9 }, (_, n) => Array.from(b.pos.slice(n * 9, n * 9 + 9)) as Triangle));
  const city: any = { surfaceGrid: built.surfaceGrid, buildingGrid: built.buildingGrid, walls: built.walls, obstacles: built.obstacles, waterGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] };
  return { city, built, asphalt: triangleIndex(triangles('road')), solid: triangleIndex(triangles('st')) };
}
function bodyClear(w: ReturnType<typeof world>, p: TrafficPose, label: string) {
  const c = -p.hz, s = -p.hx, pose = { x: p.x, y: p.y, z: p.z, hx: p.hx, hz: p.hz };
  for (const v of bodyVertices) {
    const x = p.x + c * v.x + s * v.z, z = p.z - s * v.x + c * v.z, y = p.y + .02 + v.y;
    const surfaces = w.asphalt(x, z).map(t => ({ y: height(t, x, z), t })).filter(a => a.y !== null);
    if (!surfaces.some(a => Math.abs(a.y! - p.y) < .15)) assert.fail(`${label}: actual full bus footprint leaves emitted finite asphalt at ${JSON.stringify({ point: [x, y, z], pose })}`);
    for (const top of surfaces) {
      if (top.y! - p.y < .45 || y >= top.y! - .02) continue;
      const underside = w.solid(x, z).map(t => height(t, x, z)).find(b => b !== null && top.y! - b > .85 && top.y! - b < 1.05);
      assert.ok(underside === undefined || underside === null || y <= underside + .02, `${label}: actual bus body intersects asphalt/soffit ${JSON.stringify({ point: [x, y, z], pose, top: top.y, underside })}`);
    }
  }
}
function fullCurve(w: ReturnType<typeof world>, curve: TrafficCurve, label: string) {
  const count = Math.max(1, Math.ceil(curve.length / .1));
  for (let i = 0; i <= count; i++) bodyClear(w, curve.sample(curve.length * i / count), `${label} sample ${i}/${count}`);
  return count + 1;
}
function densify(e: RoadEdge, step = .08): RoadEdge {
  const pts: XZ[] = [e.pts[0]], elev = [e.elev?.[0] ?? 0];
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 1; j <= n; j++) { const u = j / n; pts.push(j === n ? b : [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); elev.push((e.elev?.[i - 1] ?? 0) + ((e.elev?.[i] ?? 0) - (e.elev?.[i - 1] ?? 0)) * u); }
  }
  return { ...e, pts, elev };
}
function coarsen(e: RoadEdge): RoadEdge {
  const indices = [0];
  for (let i = 1; i < e.pts.length - 1; i++) {
    const a = e.pts[indices.at(-1)!], b = e.pts[i], c = e.pts[i + 1], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 1e-7 || u[0] * v[0] + u[1] * v[1] < 0) indices.push(i);
  }
  indices.push(e.pts.length - 1); return { ...e, pts: indices.map(i => e.pts[i]), elev: e.elev ? indices.map(i => e.elev![i]) : null };
}
function traffic(roads: RoadEdge[], city: any) {
  const graph = new RoadGraph(roads), t: Traffic = Object.assign(Object.create(Traffic.prototype), { graph, city, cars: [], max: 0, scene: new THREE.Scene(), mats: { vBody: material, vLight: material }, brakeLampMaterial: material, reverseLampMaterial: material, byGroup: { bus: [busPrototype], car: [otherPrototypes[0]], auto: [otherPrototypes[1]] }, r: rng(77), t: 0, plans: 0, stopsByEdge: new Map(), passengerExchanges: [], services: null, onHorn() {} });
  return { graph, traffic: t };
}
function plan(t: Traffic, c: Car) { (t as any).plans = 0; (t as any).prepare(c); }
function road(id: string, pts: XZ[], from: string, to: string): RoadEdge { return { id, seg: id, name: 'Independent approach fixture', cls: 'primary', w: 7, lanes: 2, oneway: 'backward', from, to, pts, elev: null, maxspeed: 40, joinedPavement: { sourceWidth: 9.4, originalWidth: 9.4, intervals: [[-1000, 1000]], taper: 30, release: 'independent synthetic fixture' } }; }
function straightRoads() { return [road('in', [[20, 20], [140, 20]], 'a', 'joint'), road('out', [[140, 20], [260, 20]], 'joint', 'b')]; }

for (const variant of ['actual', 'coarse', 'dense'] as const) test(`exact west Tarnaka continuation plans and carries the complete bus on real emitted asphalt: ${variant}`, t => {
  assert.equal(fixture.sourceSha256, 'be8246e417965d361e109a5eea9576b82888ffa4e9c6752df72992aaac15f132');
  const source: RoadEdge[] = ids.map(id => fixture.tile.roads.find((e: RoadEdge) => e.id === id));
  const roads = variant === 'coarse' ? source.map(coarsen) : variant === 'dense' ? source.map(e => densify(e)) : source;
  const w = world(), f = traffic(roads, w.city), a = f.graph.byId.get(ids[0])!, b = f.graph.byId.get(ids[1])!;
  assert.ok(f.graph.nodes.get(a.to)!.out.some(o => o.edge === b && o.dir === 1), 'the exact west source connection is legal forward travel');
  const result = busTurn(f.graph, a, 1, b, 1); assert.ok(result, 'a sub-metre grading sample cannot strand the full bus at a real same-direction continuation');
  assert.ok(result.curve.minRadius >= turnProfile('bus').minRadius);
  assert.ok(trafficCurveClear(result.curve, w.city, busModel.size), 'normal production full-body/collision gate remains active');
  const samples = fullCurve(w, result.curve, `${variant} exact west`);
  const c = f.traffic.spawnAt('bus', a, 1, a.len - .5, busLane(a)); c.speed = c.want = 8;
  plan(f.traffic, c); assert.ok(c.motion, 'the real Traffic planner must publish the continuation'); assert.equal(c.motion!.edge.e.id, ids[1]);
  let maxStep = 0, maxYaw = 0, frames = 0;
  for (; frames < 900 && !(c.edge === b && c.s > 9); frames++) {
    const before = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
    f.traffic.update(1 / 60, c.x, c.z, { x: c.x + 290, z: c.z + 290, y: .55, speed: 0 }, []);
    maxStep = Math.max(maxStep, Math.hypot(c.x - before.x, c.z - before.z));
    maxYaw = Math.max(maxYaw, Math.abs(Math.atan2(before.hx * c.hz - before.hz * c.hx, before.hx * c.hx + before.hz * c.hz)));
    if (frames % 3 === 0) bodyClear(w, c, `${variant} execution frame ${frames}`);
  }
  assert.equal(c.edge, b); assert.ok(c.s > 9, 'the bus must actually drive onto the outgoing edge');
  assert.ok(maxStep <= 8 / 60 + .001); assert.ok(maxYaw < .08); assert.ok(Math.abs(f.traffic.t - frames / 60) < 1e-8);
  assert.equal(f.traffic.cars.length, 1, 'the isolated planner check must retain its single explicit bus');
  const caps = [...new Set([...w.built.surfaceGrid.values()].flat())].filter(s => s.roadQuad && s.roadQuad[2][0] === s.roadQuad[3][0] && s.roadQuad[2][2] === s.roadQuad[3][2] && Math.hypot(s.ax - 3609.1, s.az + 2322.6) < 5);
  assert.ok(caps.length > 0, 'exercise the actual emitted shared-node asphalt caps');
  t.diagnostic(JSON.stringify({ variant, sourceModel: fixture.sourceSha256, pointCounts: roads.map(e => e.pts.length), roomIn: trafficApproachRoom(a, 1, true), roomOut: trafficApproachRoom(b, 1, false), radius: result.curve.minRadius, samples, fullVisibleBusVertices: bodyVertices.length, executionFrames: frames, maxStep, maxYaw, nodeCapSurfaces: caps.length }));
});

test('coarse and densely sampled straight approaches publish identical bus and ordinary-car turn geometry', () => {
  const source = straightRoads(), pairs = [source, source.map(e => densify(e, .01))], plans = pairs.map(roads => {
    const f = traffic(roads, undefined), a = f.graph.byId.get('in')!, b = f.graph.byId.get('out')!, p = busTurn(f.graph, a, 1, b, 1)!;
    assert.ok(p); assert.equal(trafficApproachRoom(a, 1, true), 60); assert.equal(trafficApproachRoom(b, 1, false), 60);
    const car: any = { edge: a, dir: 1, s: a.len - 4, size: [1.9, 1.5, 4.6], group: 'car', lane: 1.75, laneT: 1.75, base: 1.75, planAfter: 0, assertive: false };
    plan(f.traffic, car); assert.ok(car.motion); assert.equal(car.motion.edge, b);
    return { bus: p, car: car.motion };
  });
  for (const kind of ['bus', 'car'] as const) for (let i = 0; i <= 20; i++) {
    const a = plans[0][kind].curve.at(i / 20), b = plans[1][kind].curve.at(i / 20);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-7, `${kind} geometric continuation changes under pure tessellation`);
    assert.ok(Math.hypot(a.hx - b.hx, a.hz - b.hz) < 1e-7);
  }
});

test('real bends including a ten-centimetre right-angle stub retain their physical room after densification', () => {
  for (const r of [road('bend', [[20, 20], [20, 60], [40, 60]], 'a', 'b'), road('tiny-real-bend', [[20, 20], [20.1, 20], [20.1, 60]], 'a', 'b')]) {
    for (const e of [r, densify(r, .01)]) {
      const g = new RoadGraph([e]).byId.get(e.id)!;
      const expectedStart = r.id === 'bend' ? 40 : .1;
      assert.ok(Math.abs(trafficApproachRoom(g, 1, false) - expectedStart) < 1e-7, 'a genuine right-angle bend cannot become a long approach');
      assert.ok(Math.abs(trafficApproachRoom(g, -1, true) - expectedStart) < 1e-7, 'reverse-direction lookup must stop at the same physical bend');
    }
  }
  const internal = road('two-real-bends', [[20,20],[20,60],[40,60],[40,90]], 'a', 'b');
  for (const e of [internal, densify(internal, .01)]) {
    const g = new RoadGraph([e]).byId.get(e.id)!, index = e.pts.findIndex(p => p[0] === 40 && p[1] === 60);
    const forward = trafficBendRoom(g, index, 1), reverse = trafficBendRoom(g, index, -1);
    assert.ok(Math.abs(forward[0] - 20) < 1e-7 && Math.abs(forward[1] - 30) < 1e-7, 'internal turning room stops at the adjacent genuine bend');
    assert.ok(Math.abs(reverse[0] - 30) < 1e-7 && Math.abs(reverse[1] - 20) < 1e-7);
  }
});

test('a real median still rejects the full bus curve and the normal Traffic planner despite ample approach room', () => {
  const roads = straightRoads(), w = world(roads), f = traffic(roads, w.city), a = f.graph.byId.get('in')!, b = f.graph.byId.get('out')!, curve = busTurn(f.graph, a, 1, b, 1)!;
  assert.ok(curve); const barrier: Wall = { ax: 140, az: 15, bx: 140, bz: 25, y0a: 0, y0b: 0, y1a: 1.2, y1b: 1.2, kind: 'median' };
  for (let x = 3; x <= 5; x++) for (let z = 0; z <= 1; z++) w.city.walls.set(`${x},${z}`, [...(w.city.walls.get(`${x},${z}`) ?? []), barrier]);
  assert.equal(trafficCurveClear(curve.curve, w.city, busModel.size), false, 'the physical median must block the ordinary full-body gate');
  const c = f.traffic.spawnAt('bus', a, 1, a.len - 6, busLane(a)); plan(f.traffic, c);
  assert.equal(c.motion, undefined, 'more physical turning room cannot bypass a blocked median'); assert.ok(c.stopS! < a.len);
});

// Endpoint room can be fixed while an earlier true bend remains incorrectly
// limited by its adjacent sampling spans. Exercise the ordinary planner over
// that complete approach as a separate invariant, without overriding curveOK.
test('ordinary Traffic reaches the same continuation from before its final physical approach bend under collinear refinement', t => {
  const source: RoadEdge[] = ids.map(id => fixture.tile.roads.find((e: RoadEdge) => e.id === id)), w = world(), failures: any[] = [];
  for (const group of ['bus', 'car', 'auto'] as const) for (const variant of ['actual', 'coarse', 'dense'] as const) {
    const roads = variant === 'coarse' ? source.map(coarsen) : variant === 'dense' ? source.map(e => densify(e)) : source, f = traffic(roads, w.city);
    const a = f.graph.byId.get(ids[0])!, b = f.graph.byId.get(ids[1])!, turn = busTurn(f.graph, a, 1, b, 1)!; assert.ok(turn);
    const c = f.traffic.spawnAt(group, a, 1, Math.max(0, turn.startS - 2), busLane(a)); c.speed = c.want = 8;
    let maxStep = 0, maxYaw = 0, frames = 0;
    for (; frames < 900 && !(c.edge === b && c.s > 9); frames++) {
      const before = { x: c.x, z: c.z, hx: c.hx, hz: c.hz };
      f.traffic.update(1 / 60, c.x, c.z, { x: c.x + 290, z: c.z + 290, y: .55, speed: 0 }, []);
      maxStep = Math.max(maxStep, Math.hypot(c.x - before.x, c.z - before.z));
      maxYaw = Math.max(maxYaw, Math.abs(Math.atan2(before.hx * c.hz - before.hz * c.hx, before.hx * c.hx + before.hz * c.hz)));
      if (group === 'bus' && frames % 3 === 0) bodyClear(w, c, `${variant} complete approach frame ${frames}`);
    }
    assert.ok(maxStep <= 8 / 60 + .001); assert.ok(maxYaw < .08); assert.ok(Math.abs(f.traffic.t - frames / 60) < 1e-8);
    const result = { group, variant, frames, maxStep, maxYaw, reachedOutgoing: c.edge === b && c.s > 9, edge: c.edge.e.id, s: c.s, speed: c.speed, stopS: c.stopS, pendingMotion: c.motion?.kind };
    t.diagnostic(JSON.stringify(result)); if (!result.reachedOutgoing) failures.push(result);
  }
  assert.deepEqual(failures, [], 'pure collinear sampling must not strand ordinary traffic before its legal continuation');
});

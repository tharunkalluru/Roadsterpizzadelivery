import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DynamicSpatialIndex, vehicleBounds } from '../src/game/dynamic-spatial-index';
import { RouteSearchGate } from '../src/game/route-search-gate';
import { PlanningBudget } from '../src/game/planning-budget';
import { trafficOverlap } from '../src/game/traffic-path';
import { Traffic } from '../src/game/traffic';
import { RoadGraph } from '../src/game/roadgraph';
import { initTemplates, rng } from '../src/core/util';

test('spatial candidates cover randomized rotated OBB overlaps in stable active order', () => {
  const random = rng(8144), index = new DynamicSpatialIndex<any>(20), cars: any[] = [], out: any[] = [];
  for (let i = 0; i < 300; i++) {
    const angle = random() * Math.PI * 2;
    const c = { x: random.range(-150, 150), z: random.range(-150, 150), y: random.pick([0, 8]), hx: Math.cos(angle), hz: Math.sin(angle), size: [random.range(.7, 3), 2, random.range(2, 13)] };
    cars.push(c); index.upsert(c, vehicleBounds(c, .8), i);
  }
  for (let q = 0; q < 3000; q++) {
    const a = cars[q % cars.length], angle = random() * Math.PI * 2;
    const p = { ...a, x: random.range(-150, 150), z: random.range(-150, 150), hx: Math.cos(angle), hz: Math.sin(angle) };
    index.query(vehicleBounds(p, .5), out);
    for (const c of cars) if (trafficOverlap(p, c, .18)) assert.ok(out.includes(c), 'broadphase omitted overlapping OBB');
    assert.deepEqual(out.map(c => cars.indexOf(c)), out.map(c => cars.indexOf(c)).sort((a,b) => a-b));
    if (q % 30 === 0) { a.x += random.range(-30, 30); a.z += random.range(-30, 30); index.upsert(a, vehicleBounds(a, .8), q % cars.length); }
  }
  for (const c of cars) index.remove(c);
  assert.equal(index.query({ minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, out), 0);
});

test('routing retries are bounded and graph/placement changes reject stale results', () => {
  const gate = new RouteSearchGate(), identity = { targetKey: 'pickup:A', graphRevision: 1, placementRevision: 1, startKey: 'ground:e1' };
  const first = gate.allow(0, identity)!; assert.notEqual(first, null);
  assert.equal(gate.finish(first, false, 0), true);
  for (let i = 1; i < 72; i++) assert.equal(gate.allow(i/60, identity), null);
  const retry = gate.allow(1.21, identity)!; assert.notEqual(retry, null);
  const newArea = gate.allow(1.22, { ...identity, placementRevision: 2 })!;
  assert.notEqual(newArea, retry); assert.equal(gate.finish(retry, true, 1.22), false);
  assert.equal(gate.finish(newArea, true, 1.22), true);
  const graph = gate.allow(1.23, { ...identity, placementRevision: 2, graphRevision: 2 })!;
  assert.notEqual(graph, null); gate.finish(graph, true, 1.23);
  assert.equal(gate.allow(1.24, { ...identity, placementRevision: 2, graphRevision: 2 }), null);
});

test('planning allowance refills with time and cannot be spent once per arbitrary render callback', () => {
  const b = new PlanningBudget(); b.beginFrame(0);
  let count = 0;
  for (let i = 0; i < 1000; i++) b.run(() => count++);
  assert.ok(count < 1000); const spent = b.spentMs;
  for (let i = 0; i < 100; i++) { b.beginFrame(0); b.run(() => count++); }
  assert.ok(b.spentMs <= spent + 2);
  b.beginFrame(1); assert.ok(b.available); b.run(() => {}); assert.ok(b.spentMs > spent);
});

function trafficFixture() {
  const gradient = { addColorStop() {} };
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, p) => p in o ? o[p] : () => {} });
  (globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
  initTemplates({ rbox: new THREE.BoxGeometry(1,1,1), ring: new THREE.RingGeometry(1,1.2,8) });
  const graph = new RoadGraph([{ id: 'main', seg: 'main', name: 'Fixture road', cls: 'primary', w: 40, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[0,0],[500,0]], elev: null, maxspeed: null }]);
  const traffic = new Traffic(graph, new THREE.Scene(), { vBody: new THREE.MeshStandardMaterial(), vLight: new THREE.MeshBasicMaterial() }, 0);
  return { traffic, edge: graph.edges[0] };
}

test('complete vehicle pool reuses geometry and resets mutable vehicle state with a new generation', () => {
  const { traffic, edge } = trafficFixture(), bus = traffic.spawnAt('bus', edge, 1, 100);
  const id = bus.id, generation = bus.generation, group = bus.g;
  bus.dwell = 5; bus.g.visible = false; bus.filtering = true; bus.served.add({} as any); bus.stopS = 120;
  traffic.clear();
  const next = traffic.spawnAt('bus', edge, 1, 150);
  assert.equal(next.id, id); assert.equal(next.g, group); assert.equal(next.generation, generation + 1);
  assert.equal(next.dwell, 0); assert.equal(next.filtering, false); assert.equal(next.served.size, 0);
  assert.equal(next.stopS, undefined); assert.equal(next.g.visible, true);
});

test('jump participants remain visible and retain edge identity through landing grace', () => {
  const { traffic, edge } = trafficFixture(), bus = traffic.spawnAt('bus', edge, 1, 100);
  const p = { jumping: true, x: bus.x - 20, y: .55, z: bus.z, hx: 1, hz: 0, speed: 15 };
  traffic.updateJumpRetention(p, 1/60); assert.ok(traffic.retainedEdges().has(edge));
  traffic.hideNear(new THREE.Vector3(bus.x-20, 2, bus.z), { x: bus.x+20, y: .55, z: bus.z }); assert.equal(bus.g.visible, true);
  traffic.updateJumpRetention({ ...p, jumping: false, x: bus.x+20 }, .1);
  assert.ok(traffic.retainedEdges().has(edge));
  traffic.updateJumpRetention({ ...p, jumping: false, x: bus.x+30 }, 1.01);
  assert.equal(traffic.retainedEdges().size, 0);
  traffic.clear(); assert.equal(traffic.retainedEdges().size, 0);
});

test('bus board cache shares resources until the last user releases them', () => {
  const { traffic } = trafficFixture(), t = traffic as any;
  const run = { pattern: { id: 'route', direction: 'outbound', number: '218', to: 'Koti' } } as any;
  const a = t.boardAcquire(run), b = t.boardAcquire(run);
  assert.equal(a.decals, b.decals); assert.equal(t.boards.get(a.key).refs, 2);
  let disposed = 0; a.decals[0].geo.addEventListener('dispose', () => disposed++);
  t.boards.get(a.key).refs = 1; t.trimBoards(true); assert.equal(disposed, 0);
  t.boards.get(a.key).refs = 0; t.trimBoards(true); assert.equal(disposed, 1);
  assert.equal(t.boards.size, 0); assert.equal(t.boardBytes, 0);
});

test('resumable bus planning advances without snapping to an old snapshot', () => {
  const { traffic, edge } = trafficFixture(), bus = traffic.spawnAt('bus', edge, 1, 100);
  bus.busRun = { pattern: { id: 'fixture', number: '218', direction: 'out', to: 'Koti', stops: ['a','b'] } as any,
    target: 1, path: [{edge, dir:1}], step: 0, ended: false,
    stopPosition: { edge, dir: 1, s: 400, stop: { edge: edge.e.id, s: 400, side: 1, x: 400, z: 0, hx: 1, hz: 0 } } };
  traffic.services = { next: () => null } as any;
  const start = bus.x; let previous = bus.x;
  for (let i=0; i<300; i++) {
    traffic.update(1/60, bus.x-20, bus.z+10, { x:bus.x-20, y:.55, z:bus.z+10, speed:8, hx:1, hz:0 });
    assert.ok(bus.x >= previous - .021, 'a completed plan must not move a bus backward');
    assert.ok(bus.x-previous < .25, 'a completed plan must not snap a bus ahead'); previous = bus.x;
  }
  assert.ok(bus.x > start+15, 'planning must not indefinitely stop a routine bus');
  assert.ok(traffic.stats.plans > 0);
});

test('indexed player hit query and pushout keep all-pairs response order', () => {
  const { traffic, edge } = trafficFixture();
  traffic.spawnAt('car', edge, 1, 100, 3); traffic.spawnAt('bus', edge, 1, 105, 5);
  const reference = (pos: {x:number;y:number;z:number}, halfW:number, halfL:number) => {
    for(const c of traffic.cars) {
      if(pos.y-.55 >= c.y+c.size[1] || pos.y-.55+1.2 <= c.y) continue;
      const dx=pos.x-c.x,dz=pos.z-c.z,along=dx*c.hx+dz*c.hz,side=dx*c.hz-dz*c.hx;
      const pa=c.size[2]/2+halfL-Math.abs(along),ps=c.size[0]/2+halfW-Math.abs(side);
      if(pa<=0||ps<=0) continue;
      if(ps<pa){const k=(Math.sign(side)||1)*ps;pos.x+=c.hz*k;pos.z-=c.hx*k;}
      else{const k=(Math.sign(along)||1)*pa;pos.x+=c.hx*k;pos.z+=c.hz*k;}
    }
  };
  for (let x=95;x<112;x+=.7) for(let z=1;z<8;z+=.4) {
    const a={x,y:.55,z}, b={...a}; reference(a,1,2.4); traffic.pushOut(b,1,2.4);
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-8);
    assert.equal(traffic.hitTest(x,8,z,1.5),null,'bridge height must not collide with ground vehicles');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import { rng } from '../../src/core/util';
import type { MovingRailBody } from '../../src/game/moving-rail';
import { trafficOverlap } from '../../src/game/traffic-path';

const sizes = { car: [1.8, 1.6, 4.5], auto: [1.36, 1.85, 2.65], bike: [.75, 1.9, 2], bus: [2.5, 3.3, 11], truck: [2.5, 3.1, 8.4] };
const farPlayer = { x: 350, y: .55, z: 200, speed: 0, hx: 1, hz: 0 };
function fixture(group: keyof typeof sizes = 'car') {
  const road: any = { id: 'delivery-road', seg: 'd', from: 'a', to: 'b', cls: 'primary', w: 12, lanes: 2, oneway: null, elev: null, pts: [[0, 0], [500, 0]], name: 'test', maxspeed: null };
  const byGroup = Object.fromEntries(Object.entries(sizes).map(([group, size]) => [group, [{ group, size, body: new THREE.BufferGeometry(), lights: new THREE.BufferGeometry(), decals: [] }]]));
  const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph: new RoadGraph([road]), scene: new THREE.Scene(),
    mats: { vBody: new THREE.MeshBasicMaterial(), vLight: new THREE.MeshBasicMaterial() }, byGroup, r: rng(77), t: 0, plans: 0,
    passengerExchanges: [], stopsByEdge: new Map(), onHorn() {} }) as Traffic;
  const car = traffic.spawnAt(group, traffic.graph.edges[0], 1, 80, 3);
  car.speed = 12; car.want = 12; car.uturnAt = Infinity; car.laneChangeAt = Infinity;
  return { traffic, car };
}
function truck(x = 120, y = 0): MovingRailBody {
  return { id: 'delivery-log-truck', x, y, z: -3, hx: 1, hz: 0, halfWidth: 1.95, halfLength: 5.25,
    bottom: y + .2, roof: y + 2.8, previous: { x, y, z: -3, hx: 1, hz: 0 } };
}

test('every NPC class brakes before the delivery truck and resumes after it leaves', () => {
  for (const group of Object.keys(sizes) as (keyof typeof sizes)[]) {
    const { traffic, car } = fixture(group), body = truck();
    traffic.setKinematicVehicles([body], 1 / 60);
    for (let n = 0; n < 600; n++) traffic.update(1 / 60, 100, 0, farPlayer);
    assert.ok(car.x + car.size[2] / 2 < body.x - body.halfLength, `${group} must not penetrate truck`);
    assert.ok(car.speed < .2, `${group} settles behind stopped truck: speed ${car.speed}, x ${car.x}`);
    assert.equal(trafficOverlap(car, { ...body, y: body.bottom, size: [3.9, 2.6, 10.5] }), false);
    const stopped = car.x; traffic.setKinematicVehicles([], 1 / 60);
    for (let n = 0; n < 120; n++) traffic.update(1 / 60, 100, 0, farPlayer);
    assert.ok(car.x > stopped + 2, `${group} resumes after teardown`);
  }
});

test('an empty adapter preserves ordinary traffic motion exactly', () => {
  const a = fixture('bus'), b = fixture('bus');
  for (let n = 0; n < 180; n++) {
    a.traffic.update(1 / 60, 100, 0, farPlayer);
    b.traffic.setKinematicVehicles([], 1 / 60); b.traffic.update(1 / 60, 100, 0, farPlayer);
    assert.deepEqual([a.car.x, a.car.y, a.car.z, a.car.hx, a.car.hz, a.car.speed], [b.car.x, b.car.y, b.car.z, b.car.hx, b.car.hz, b.car.speed]);
  }
});

test('a truck on another vertical layer does not stop ground traffic', () => {
  const a = fixture(), b = fixture(); b.traffic.setKinematicVehicles([truck(120, 12)], 1 / 60);
  for (let n = 0; n < 150; n++) {
    a.traffic.update(1 / 60, 100, 0, farPlayer); b.traffic.update(1 / 60, 100, 0, farPlayer);
  }
  assert.equal(a.car.x, b.car.x); assert.equal(a.car.speed, b.car.speed);
});

test('delivery truck follows actual NPC speed and cannot enter an occupied NPC body', () => {
  const { traffic, car } = fixture(); car.x = 120; car.speed = 0;
  const body = truck(110);
  assert.ok(traffic.kinematicSpeedLimit(body, 8) < 2);
  assert.equal(traffic.kinematicPoseClear(truck(120)), false);
  assert.equal(traffic.kinematicPoseClear(truck(100)), true);
  car.y = 12; assert.equal(traffic.kinematicSpeedLimit(body, 8), 8);
  assert.equal(traffic.kinematicPoseClear(truck(120)), true);
});

test('adapter snapshots reusable bodies and ignores invalid scene geometry', () => {
  const { traffic } = fixture(); const body = truck(); body.previous.x = 119;
  traffic.setKinematicVehicles([body, { ...body, x: NaN }], .1);
  const list = (traffic as any).kinematicVehicles;
  assert.equal(list.length, 1); assert.equal(list[0].speed, 10);
  const snapshot = list[0]; body.x = 130; assert.equal(snapshot.x, 120);
  traffic.setKinematicVehicles([body], .1); assert.equal(list[0], snapshot); assert.equal(snapshot.x, 130);
  traffic.setKinematicVehicles([], 0); assert.equal(list.length, 0);
});

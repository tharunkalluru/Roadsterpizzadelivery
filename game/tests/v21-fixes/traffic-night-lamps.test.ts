import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import { initTemplates } from '../../src/core/util';

function fixture() {
  const gradient = { addColorStop() {} };
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, key) => key in o ? o[key] : () => {} });
  (globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
  initTemplates({ rbox: new THREE.BoxGeometry(1, 1, 1), ring: new THREE.RingGeometry(1, 1.2, 8) });
  const graph = new RoadGraph([{ id: 'road', seg: 'road', name: 'Night lamps', cls: 'primary', w: 40, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[0, 0], [0, -1000]], elev: null, maxspeed: null }]);
  const traffic = new Traffic(graph, new THREE.Scene(), { vBody: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }), vLight: new THREE.MeshBasicMaterial() }, 20);
  return { traffic, edge: graph.edges[0] };
}

test('every NPC prototype exposes unobstructed white headlamps and red rear lenses outside the body skin', () => {
  const { traffic } = fixture();
  for (const proto of traffic.protos) {
    assert.ok(proto.headlights?.length, `${proto.group} needs actual source anchors`);
    const body = new THREE.Mesh(proto.body, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    body.updateMatrixWorld(true);
    for (const anchor of proto.headlights!) {
      const origin = new THREE.Vector3(anchor.x, anchor.y, anchor.z - 1);
      const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, 1), 0, .98).intersectObject(body);
      assert.equal(hit.length, 0, `${proto.group} paint blocks front lens at ${anchor.z}`);
    }
    const rear = proto.tailLights!.getAttribute('position');
    assert.ok(rear.count > 0, `${proto.group} has red tails`);
    // Check the centre of every box's rear-facing plane, not a silhouette edge.
    const bounds = new THREE.Box3().setFromBufferAttribute(rear as THREE.BufferAttribute);
    const y = (bounds.min.y + bounds.max.y) / 2, z = bounds.max.z;
    for (const x of bounds.min.x < -.05 ? [bounds.min.x + .025, bounds.max.x - .025] : [0]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(x, y, z + 1), new THREE.Vector3(0, 0, -1), 0, .98).intersectObject(body);
      assert.equal(hit.length, 0, `${proto.group} paint blocks rear lens at ${z}`);
    }
  }
});

test('a real NPC approaching the stopped player brightens only its rear lamps, then releases the brake after acceleration', () => {
  const { traffic, edge } = fixture(), car = traffic.spawnAt('car', edge, 1, 100, 0);
  car.speed = 12; car.want = 12;
  const lamps = car.lamps!;
  assert.equal(lamps.rear.visible, false);
  const head = car.g.children.find((child: any) => child.isMesh && child.geometry === traffic.byGroup.car[0].lights) as THREE.Mesh;
  const headMaterial = head.material;
  const player = { x: car.x + car.hx * 8, z: car.z + car.hz * 8, y: car.y + .55, speed: 0, hx: car.hx, hz: car.hz };
  traffic.update(1 / 60, car.x, car.z, player);
  assert.ok(car.speed < 12, 'normal avoidance actually brakes');
  assert.equal(lamps.braking, true);
  assert.equal(lamps.rear.visible, true);
  assert.equal(head.material, headMaterial, 'braking cannot brighten white headlights');
  assert.equal(lamps.reverse.visible, false);
  const away = { x: 500, z: car.z, y: 100, speed: 0 };
  for (let i = 0; i < 30; i++) traffic.update(1 / 60, car.x, car.z, away);
  assert.equal(lamps.braking, false);
  assert.equal(lamps.rear.visible, false);
});

test('bus dwelling keeps brake lights steadily lit while passengers board and share materials with other buses', () => {
  const { traffic, edge } = fixture();
  const a = traffic.spawnAt('bus', edge, 1, 100, 0), b = traffic.spawnAt('bus', edge, 1, 140, 0);
  assert.equal(a.lamps!.rear.visible, false);
  assert.equal(a.lamps!.rear.material, b.lamps!.rear.material);
  a.dwell = 3; b.dwell = 3;
  for (let i = 0; i < 60; i++) {
    traffic.update(1 / 60, a.x, a.z, { x: 500, z: 0, y: 100, speed: 0 });
    assert.equal(a.lamps!.braking, true);
    assert.equal(a.lamps!.rear.material, b.lamps!.rear.material);
  }
  assert.equal(a.lamps!.rear.visible, true);
  assert.equal(a.lamps!.reverse.visible, false);
});

test('brake hysteresis avoids single-frame flicker and the lamp rig allocates no individual real lights', () => {
  const { traffic, edge } = fixture(), car = traffic.spawnAt('auto', edge, 1, 100, 0);
  car.dwell = .02;
  traffic.update(1 / 60, car.x, car.z, { x: 500, z: 0, y: 100, speed: 0 });
  const rear = car.lamps!.rear, reverse = car.lamps!.reverse;
  car.dwell = 0;
  traffic.update(1 / 60, car.x, car.z, { x: 500, z: 0, y: 100, speed: 0 });
  assert.equal(car.lamps!.braking, true, 'a brief release retains a stable brake signal');
  assert.equal(car.lamps!.rear, rear);
  assert.equal(car.lamps!.reverse, reverse);
  let realLights = 0; car.g.traverse(o => { if ((o as THREE.Light).isLight) realLights++; });
  assert.equal(realLights, 0, 'nearby illumination is supplied by the separate bounded pool');
});

test('reverse lenses only illuminate for actual negative movement, with no invented reversing lights on two-wheelers', () => {
  const { traffic, edge } = fixture();
  const car = traffic.spawnAt('car', edge, 1, 100, 0), bike = traffic.spawnAt('bike', edge, 1, 140, 0);
  car.speed = -2; bike.speed = -2;
  traffic.update(1 / 60, car.x, car.z, { x: 500, z: 0, y: 100, speed: 0 });
  assert.equal(car.lamps!.reversing, true);
  assert.equal(car.lamps!.reverse.visible, true);
  assert.equal(bike.lamps!.reverse.visible, false);
  car.speed = .2;
  traffic.update(1 / 60, car.x, car.z, { x: 500, z: 0, y: 100, speed: 0 });
  assert.equal(car.lamps!.reverse.visible, false);
});

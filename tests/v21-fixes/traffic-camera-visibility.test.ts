import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic, type Car } from '../../src/game/traffic';
import { RoadGraph } from '../../src/game/roadgraph';
import { initTemplates } from '../../src/core/util';

const groups = ['auto', 'bus', 'bike', 'car', 'truck'] as const;
function fixture(group: typeof groups[number]) {
  const gradient = { addColorStop() {} };
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, key) => key in o ? o[key] : () => {} });
  (globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
  initTemplates({ rbox: new THREE.BoxGeometry(1, 1, 1), ring: new THREE.RingGeometry(1, 1.2, 8) });
  const graph = new RoadGraph([{ id: 'road', seg: 'road', name: 'Orbit regression', cls: 'primary', w: 40, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[0, 0], [0, -1000]], elev: null, maxspeed: null }]);
  const traffic = new Traffic(graph, new THREE.Scene(), { vBody: new THREE.MeshStandardMaterial(), vLight: new THREE.MeshBasicMaterial() }, 0);
  const car = traffic.spawnAt(group, graph.edges[0], 1, 100, 0);
  return { traffic, car };
}
function localPoint(car: Car, side: number, height: number, along: number) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(car.g.quaternion), p = car.g.position;
  return new THREE.Vector3(p.x + f.z * side + f.x * along, p.y + height, p.z - f.x * side + f.z * along);
}

for (const group of groups) test(`${group} stays present throughout a full exterior camera orbit, including a blocked player sightline`, () => {
  const { traffic, car } = fixture(group), pose = [car.x, car.y, car.z, car.hx, car.hz, car.speed, car.s];
  const radius = Math.hypot(car.size[0] / 2, car.size[2] / 2) + 2;
  const target = localPoint(car, 0, .55, 0);
  for (const yaw of [-Math.PI, -2.4, -Math.PI / 2, -.4, 0, .4, Math.PI / 2, 2.4, Math.PI]) {
    car.g.rotation.y = yaw;
    for (let degree = 0; degree < 360; degree += 5) {
      const angle = degree * Math.PI / 180;
      const camera = localPoint(car, Math.sin(angle) * radius, 1.5, Math.cos(angle) * radius);
      for (const jumping of [false, true, false]) {
        traffic.hideNear(camera, target, jumping);
        assert.equal(car.g.visible, true, `${group}: exterior orbit ${degree}°, yaw ${yaw}, jumping ${jumping}`);
      }
    }
  }
  assert.deepEqual([car.x, car.y, car.z, car.hx, car.hz, car.speed, car.s], pose, 'view changes cannot advance, rotate or remove the vehicle');
  assert.equal(traffic.cars.length, 1);
  assert.equal(traffic.cars[0], car);
});

for (const group of groups) test(`${group} only hides at the actual near-camera body and restores immediately outside it`, () => {
  const { traffic, car } = fixture(group);
  for (const yaw of [-2.4, -.7, 0, .7, 2.4]) {
    car.g.rotation.y = yaw;
    const interior = localPoint(car, 0, car.size[1] / 2, 0);
    const exterior = localPoint(car, car.size[0] / 2 + .2, car.size[1] / 2, 0);
    traffic.hideNear(interior);
    assert.equal(car.g.visible, false, 'camera physically inside the opaque body retains protection');
    traffic.hideNear(exterior);
    assert.equal(car.g.visible, true, 'a camera outside the near-plane margin must not hide a nearby vehicle');
    traffic.hideNear(localPoint(car, 0, car.size[1] + .2, 0));
    assert.equal(car.g.visible, true, 'a camera just above the roof must not hide a bus during a jump');
  }
});

test('camera protection follows the displayed vehicle pose rather than a stale simulation centre', () => {
  const { traffic, car } = fixture('auto');
  const original = localPoint(car, 0, .9, 0);
  car.g.position.x += 8; car.g.position.y += 3; car.g.position.z -= 2;
  car.g.rotation.y = 2.4;
  traffic.hideNear(original);
  assert.equal(car.g.visible, true, 'no hidden auto where its old authoritative centre happened to be');
  traffic.hideNear(localPoint(car, 0, .9, 0));
  assert.equal(car.g.visible, false, 'camera safety still covers the actual displayed body');
  traffic.hideNear(localPoint(car, 2, .9, 0));
  assert.equal(car.g.visible, true);
});

test('orbit visibility never removes nearby collision participants or changes hit and push-out results', () => {
  const { traffic, car } = fixture('auto');
  const target = { x: car.x, y: car.y + .55, z: car.z };
  const initial = traffic.hitTest(target.x, target.y, target.z, 1);
  assert.equal(initial, car);
  const before = { ...target };
  const beforeHit = traffic.pushOut(before, .9, 1.8);
  for (let degree = 0; degree < 360; degree += 10) {
    const angle = degree * Math.PI / 180;
    traffic.hideNear(new THREE.Vector3(car.x + Math.sin(angle) * 7.6, car.y + 3.7, car.z + Math.cos(angle) * 7.6), target, false);
    assert.equal(car.g.visible, true, 'ordinary stopped orbit must keep a physically present neighbour visible');
    assert.equal(traffic.hitTest(target.x, target.y, target.z, 1), initial);
    const after = { ...target };
    assert.equal(traffic.pushOut(after, .9, 1.8), beforeHit);
    assert.deepEqual(after, before);
  }
});

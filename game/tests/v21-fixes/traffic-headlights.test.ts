import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrafficHeadlights, type HeadlightTrafficVehicle } from '../../src/game/traffic-headlights';

function vehicle(x = 0, y = 0, z = 0): HeadlightTrafficVehicle {
  const g = new THREE.Group(); g.position.set(x, y, z);
  return { g, lamps: { headlights: [{ x: -.65, y: .8, z: -2.1 }, { x: .65, y: .8, z: -2.1 }] } };
}
const player = { x: 0, y: .55, z: 0 };
function near(actual: THREE.Vector3, expected: THREE.Vector3) {
  assert.ok(actual.distanceTo(expected) < 1e-8, `${actual.toArray()} != ${expected.toArray()}`);
}

test('NPC beams originate at the visible headlamps and follow the complete displayed transform', () => {
  const scene = new THREE.Scene(), pool = new TrafficHeadlights(scene, true), car = vehicle(3, 1, -8);
  const parent = new THREE.Group(); parent.position.set(4, 0, 2); parent.rotation.y = .4;
  parent.add(car.g); scene.add(parent);
  car.g.rotation.set(-.12, 1.3, .05, 'YXZ');
  pool.update(player, [car], 1);
  car.g.updateWorldMatrix(true, false);
  near(pool.lights[0].position, new THREE.Vector3(0, .8, -2.13).applyMatrix4(car.g.matrixWorld));
  near(pool.lights[0].target.position, new THREE.Vector3(0, .06, -37.13).applyMatrix4(car.g.matrixWorld));
  assert.equal(pool.lights[0].parent, scene);
  assert.equal(pool.lights[0].target.parent, scene);
  assert.equal(pool.lights[0].castShadow, false);
  assert.ok(pool.lights[0].intensity > 0);
});

test('illumination has a fixed quality budget, nearby selection and no daytime shader-light churn', () => {
  for (const low of [true, false]) {
    const scene = new THREE.Scene(), pool = new TrafficHeadlights(scene, low);
    const cars = [vehicle(50), vehicle(40), vehicle(30), vehicle(20), vehicle(10)];
    const lights = [...pool.lights], targets = lights.map(light => light.target);
    pool.update(player, cars, 1);
    assert.equal(lights.length, low ? 2 : 3);
    assert.ok(lights.every(light => light.intensity > 0));
    assert.ok(lights.some(light => light.position.x === 10));
    assert.ok(lights.every(light => light.position.x <= (low ? 20 : 30)));
    pool.update(player, cars, 0);
    assert.ok(lights.every(light => light.intensity === 0 && light.visible));
    for (let i = 0; i < 300; i++) pool.update(player, cars, .5);
    assert.deepEqual(pool.lights, lights);
    assert.deepEqual(pool.lights.map(light => light.target), targets);
    assert.equal(scene.children.length, lights.length * 2);
    assert.ok(lights.every(light => light.intensity === (low ? 325 : 75)));
  }
});

test('nearby cars retain their illumination until a materially closer source arrives', () => {
  const pool = new TrafficHeadlights(new THREE.Scene(), true);
  const a = vehicle(10), b = vehicle(20), competitor = vehicle(19);
  pool.update(player, [a, b], 1);
  pool.update(player, [competitor, a, b], 1);
  assert.equal(pool.lights[1].position.x, 20, 'one metre does not swap adjacent sources');
  competitor.g.position.x = 15;
  pool.update(player, [competitor, a, b], 1);
  assert.equal(pool.lights[1].position.x, 15, 'a more than twenty percent nearer source takes the distant slot');
});

test('despawned, unlit, hidden and vertically distant vehicles release their pooled lights', () => {
  const pool = new TrafficHeadlights(new THREE.Scene(), true);
  const a = vehicle(10), b = vehicle(20), elevated = vehicle(1, 12), far = vehicle(80), noLenses = vehicle(2);
  noLenses.lamps = undefined;
  pool.update(player, [a, b, elevated, far, noLenses], 1);
  assert.ok(pool.lights.every(light => light.intensity > 0));
  a.g.visible = false;
  pool.update(player, [a, elevated, far, noLenses], 1);
  assert.ok(pool.lights.every(light => light.intensity === 0));
  a.g.visible = true; a.g.position.set(6, 0, 0);
  pool.update(player, [a], 1);
  assert.equal(pool.lights.filter(light => light.intensity > 0).length, 1);
  assert.ok(pool.lights.some(light => light.position.x === 6 && light.intensity > 0));
});

test('disposal detaches and releases only the pool and is safe to repeat', () => {
  const scene = new THREE.Scene(), other = new THREE.Group(); scene.add(other);
  const pool = new TrafficHeadlights(scene, true); pool.update(player, [vehicle(5)], 1);
  pool.dispose(); pool.dispose();
  assert.deepEqual(scene.children, [other]);
  pool.update(player, [vehicle(5)], 1);
  assert.deepEqual(scene.children, [other]);
});

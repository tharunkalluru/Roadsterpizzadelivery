import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerLights, vehicleDarkness } from '../../src/game/player-lights';

function rig() {
  const mount = new THREE.Group();
  const tail = new THREE.MeshBasicMaterial(), reverse = new THREE.MeshBasicMaterial();
  return new PlayerLights(mount, tail, reverse);
}

test('tail lights remain red, braking intensifies them, and reverse uses separate white lenses', () => {
  const lights = rig();
  lights.update(1, 0, 12); const tail = lights.tail.color.r;
  assert.ok(tail > .5 && tail < 1 && lights.tail.color.g < .02);
  assert.equal(lights.braking, false); assert.equal(lights.reversing, false);
  lights.update(1, 1, 12);
  assert.equal(lights.braking, true); assert.ok(lights.tail.color.r > tail * 2);
  const brake = lights.tail.color.r;
  lights.update(1, 1, 0); assert.equal(lights.tail.color.r, brake, 'held brake stays bright at rest');
  lights.update(1, 1, -2);
  assert.equal(lights.braking, false); assert.equal(lights.reversing, true);
  assert.ok(lights.reverse.color.r > 1 && lights.reverse.color.b > 1);
  assert.equal(lights.tail.color.r, tail, 'reverse keeps normal red tails, not a permanently applied brake');
  lights.update(1, 0, 1); assert.equal(lights.reversing, false);
  assert.ok(lights.reverse.color.r < .1, 'white lights switch off as soon as reverse ends');
});

test('daytime brakes and reverse remain legible but actual road illumination fades at dawn', () => {
  const lights = rig(); lights.update(1, 1, 0); const count = lights.mount.children.length;
  lights.update(0, 1, 0); assert.ok(lights.braking && lights.tail.color.r > 3);
  assert.ok(lights.headlights.every(light => light.intensity === 0 && light.visible && !light.castShadow));
  assert.equal(lights.rear.intensity, 0);
  lights.update(0, 1, -1); assert.ok(lights.reverse.color.b > 1);
  for (let i = 0; i < 300; i++) lights.update(.5, 0, 10);
  assert.equal(lights.mount.children.length, count); assert.equal(lights.headlights[0].intensity, 500);
  assert.equal(vehicleDarkness(0), 0); assert.equal(vehicleDarkness(6), 1); assert.equal(vehicleDarkness(2), .5);
  lights.update(1, 0, 10, .22); assert.equal(lights.headlights[0].intensity, 220, 'HDR bloom gain prevents white-body glare');
});

test('beams are physically attached to front lamp positions through yaw, pitch and the kickflip', () => {
  const lights = rig(), root = new THREE.Group(), pivot = new THREE.Group();
  root.position.set(12, .55, -20); root.rotation.set(.12, 1.4, .04, 'YXZ');
  pivot.position.y = .1; pivot.rotation.z = 1.2; root.add(pivot);
  lights.mount.position.y = -.65; pivot.add(lights.mount); root.updateMatrixWorld(true);
  const actual = new THREE.Vector3(), expected = new THREE.Vector3(-.62, .55, -2.35).applyMatrix4(lights.mount.matrixWorld);
  lights.headlights[0].getWorldPosition(actual); assert.ok(actual.distanceTo(expected) < 1e-9);
  lights.headlights[0].target.getWorldPosition(actual);
  expected.set(-.62 * 1.8, -.4, -36).applyMatrix4(lights.mount.matrixWorld);
  assert.ok(actual.distanceTo(expected) < 1e-9);
  assert.equal(lights.rear.parent, lights.mount);
  assert.equal(lights.rear.target.parent, lights.mount);
  assert.ok(lights.rear.target.position.z > lights.rear.position.z, 'rear spill faces away from the bodywork');
});

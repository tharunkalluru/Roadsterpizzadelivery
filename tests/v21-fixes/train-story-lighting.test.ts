import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MatchAndLand } from '../../src/delivery/modules/match-and-land';
import { loadLevels } from '../../src/delivery/content/levels';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';
import type { SceneCharacter } from '../../src/delivery/modules/character';
import type { MovingRailBody } from '../../src/game/moving-rail';
import { Game } from '../../src/game/game';

function fixture() {
  const scene = new THREE.Scene(), module = new MatchAndLand();
  const body: MovingRailBody = { id: 'rail:story:lighting:2', x: 100, y: 0, z: 200, hx: 0, hz: 1,
    roof: 4.2, bottom: .2, halfWidth: 1.65, halfLength: 10, previous: { x: 100, y: 0, z: 200, hx: 0, hz: 1 } };
  const player: DeliveryPlayer = { x: body.x, y: body.roof + .55, z: body.z - 3.3, yaw: Math.PI, speed: 0,
    flying: false, descending: false, jumping: false, railSupportId: body.id, verticalSpeed: 0 };
  const group = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group(), catchPoint = new THREE.Object3D();
  group.add(leftArm, rightArm, catchPoint); catchPoint.position.set(0, 1.2, .4);
  group.userData.characterRelease = 'synthetic-visible-lighting-fixture';
  const actor: SceneCharacter = { group, leftArm, rightArm, catchPoint, catchPose() {}, animate() {} };
  let completed = 0;
  module.setup({ scene, destination: { x: body.x, y: body.roof, z: body.z }, player: () => player,
    automaticStories: true, storyActive: () => true, canInteract: () => true, characterFactory: () => actor,
    existingTrain: () => body, trainBodies: () => [body], emit(type) { if (type === 'done') completed++; },
  }, loadLevels()[1].moduleParams);
  for (let i = 0; i < 25; i++) module.update(.05);
  return { scene, module, body, player, actor, get completed() { return completed; } };
}

function lampCentres(f: ReturnType<typeof fixture>) {
  const mesh = f.scene.getObjectByName('delivery-coach-worklights') as THREE.Mesh;
  const positions = mesh.geometry.getAttribute('position'), colors = mesh.geometry.getAttribute('color'), warm = new THREE.Color('#FFE0B0');
  const bounds = new Map<string, THREE.Box3>();
  for (let i = 0; i < positions.count; i++) {
    if (Math.abs(colors.getX(i) - warm.r) + Math.abs(colors.getY(i) - warm.g) + Math.abs(colors.getZ(i) - warm.b) > 1e-5) continue;
    const point = new THREE.Vector3().fromBufferAttribute(positions, i), key = `${Math.sign(point.x)}:${Math.sign(point.z)}`;
    if (!bounds.has(key)) bounds.set(key, new THREE.Box3()); bounds.get(key)!.expandByPoint(point);
  }
  mesh.updateWorldMatrix(true, false);
  return [...bounds.values()].map(box => mesh.localToWorld(box.getCenter(new THREE.Vector3())));
}

test('train-roof light requests use real visible face-height lenses and a clear front-face ray above the Roadster', () => {
  const f = fixture(), request = f.module.sceneLamp!;
  assert.ok(request); assert.equal(request.kind, 'porch');
  const lenses = lampCentres(f); assert.equal(lenses.length, 4);
  for (const lens of lenses) assert.ok(lens.y - f.body.roof >= 2.2 && lens.y - f.body.roof <= 2.7,
    'all four existing coach fixtures illuminate from above the face, not below it');
  assert.ok(lenses.some(lens => lens.distanceTo(new THREE.Vector3().copy(request.position)) < 1e-6),
    'the requested point light is exactly at a visible lamp lens center');
  const face = f.actor.group.localToWorld(new THREE.Vector3(0, 1.7, .08)), source = new THREE.Vector3().copy(request.position);
  const localLight = f.actor.group.worldToLocal(source.clone());
  assert.ok(localLight.z > 1, 'the lamp is in front of the character, not shining into his back');
  assert.ok(source.y > face.y + .4);
  for (let i = 0; i <= 40; i++) {
    const ray = source.clone().lerp(face, i / 40), dx = ray.x - f.player.x, dz = ray.z - f.player.z;
    const along = dx * f.body.hx + dz * f.body.hz, side = -dx * f.body.hz + dz * f.body.hx;
    assert.ok(!(Math.abs(along) < 2.4 && Math.abs(side) < 1.15 && ray.y > f.player.y - .55 && ray.y < f.player.y + 1.2),
      'the Roadster cabin must not block the light-to-face ray');
  }
  assert.equal(f.scene.getObjectsByProperty('isLight', true).length, 0, 'the module never adds renderer lights');
  assert.equal(f.module.supports.length, 0, 'presentation fixtures do not change the real railway collision body');
  f.module.teardown();
});

test('the existing pooled light follows the exact moving-coach fixture and releases without changing identities or handoff gates', () => {
  const f = fixture(), lights = [0, 1, 2].map(() => new THREE.PointLight('#ffcf8a', 22, 26, 1.6));
  f.scene.add(...lights); const original = lights.slice();
  const street = [new THREE.Vector3(102, 8, 204), new THREE.Vector3(110, 8, 204), new THREE.Vector3(120, 8, 204)];
  const game: any = Object.assign(Object.create(Game.prototype), { player: { pos: new THREE.Vector3(f.player.x, f.player.y, f.player.z) },
    story: { get sceneLamp() { return f.module.sceneLamp; } }, engine: { lampLights: lights, mood: { lampLights: 6 } },
    city: { lamps: street }, lampT: 0, streetLampPositions: [], sceneLampReserved: false });
  assert.equal(f.module.status.canDrop, true); assert.equal(f.module.storyArrivalReady, true);
  game.placeLampLights(); assert.equal(lights[0].intensity, 8); assert.equal(lights[0].distance, 7);
  const before = lights[0].position.clone(); Object.assign(f.body.previous, f.body);
  f.body.x += 2; f.player.x += 2; f.module.update(.05); game.placeLampLights();
  assert.ok(Math.abs(lights[0].position.x - before.x - 2) < 1e-6);
  assert.ok(lampCentres(f).some(lens => lens.distanceTo(lights[0].position) < 1e-6));
  assert.deepEqual(lights, original); assert.equal(f.scene.getObjectsByProperty('isPointLight', true).length, 3);
  f.player.z += 50; game.placeLampLights();
  assert.equal(lights[0].intensity, 22); assert.equal(lights[0].distance, 26);
  assert.ok(lights[0].position.equals(game.streetLampPositions[0]));
  f.module.teardown();
});

test('the physical train handoff and held customer keep the same fixture-aligned face lighting through a coach turn', () => {
  const f = fixture(); assert.equal(f.module.status.canDrop, true); f.module.onDrop();
  for (let i = 0; i < 30; i++) f.module.update(.05);
  assert.equal(f.completed, 1); assert.ok(f.module.cameraFocus);
  const request = f.module.sceneLamp!; assert.equal(request.kind, 'porch');
  Object.assign(f.body.previous, f.body); f.body.x += 6; f.body.z += 4; f.body.hx = 1; f.body.hz = 0;
  Object.assign(f.player, { x: f.body.x - 3.3, z: f.body.z, yaw: -Math.PI / 2 });
  f.module.update(.05);
  assert.equal(f.module.sceneLamp, request, 'the retained scene reuses its bounded request object');
  assert.ok(lampCentres(f).some(lens => lens.distanceTo(new THREE.Vector3().copy(request.position)) < 1e-6));
  const face = f.actor.group.localToWorld(new THREE.Vector3(0, 1.7, 0));
  assert.ok(request.position.y > face.y + .4);
  assert.ok(f.actor.group.worldToLocal(new THREE.Vector3().copy(request.position)).z > 1);
  assert.ok(f.module.cameraFocus, 'the existing held camera and exact roof contact remain valid');
  assert.equal(f.module.headlightGain, .02); assert.equal(f.completed, 1);
  f.module.teardown(); assert.equal(f.module.sceneLamp, undefined);
});

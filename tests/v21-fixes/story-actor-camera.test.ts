import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WalkingHandoff, WeddingHandoff } from '../../src/delivery/modules/street-scenes';
import type { SceneCharacter, CharacterMotion } from '../../src/delivery/modules/character';
import type { DeliveryPlayer, ModuleCameraFocus } from '../../src/delivery/modules/types';
import { Game } from '../../src/game/game';
import { Player } from '../../src/game/player';

test('unprepared story modules cannot request a character camera', () => {
  assert.equal(new WalkingHandoff().cameraFocus, undefined);
  assert.equal(new WeddingHandoff().cameraFocus, undefined);
});

function fixture(kind: 'walking' | 'wedding', yaw = 0) {
  const scene = new THREE.Scene(), module = kind === 'walking' ? new WalkingHandoff() : new WeddingHandoff();
  const group = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group(), catchPoint = new THREE.Object3D();
  catchPoint.position.set(0, 1.2, .4); group.add(leftArm, rightArm, catchPoint);
  group.userData.characterRelease = 'synthetic-visible-camera-fixture';
  group.userData.releasedCharacter = { characterId: kind === 'walking' ? 'jessie' : 'bhanumathi' };
  let captured = false, completed = 0;
  const motions: { dt: number; motion: CharacterMotion; speed?: number }[] = [];
  const actor: SceneCharacter = { group, leftArm, rightArm, catchPoint, catchPose() {},
    animate(dt, motion, speed) { motions.push({ dt, motion, speed }); } };
  const p: DeliveryPlayer = { x: 100, y: 4.55, z: 200, yaw, speed: 0, flying: false, descending: false, jumping: false };
  module.setup({ scene, destination: { x: 100, y: 4, z: 200 }, player: () => p, automaticStories: true,
    storyActive: () => captured, canInteract: () => true, characterFactory: () => actor,
    emit(type) { if (type === 'done') completed++; },
  }, { useExistingStreet: true, streetYaw: yaw, walkLength: 24, walkSpeed: .7 });
  const step = (drop = false) => {
    module.update(.05);
    if (captured && module.story) Object.assign(p, module.story.point, { yaw: module.story.yaw ?? p.yaw, speed: module.story.speed ?? 0 });
    if (drop && module.status.canDrop) module.onDrop();
  };
  return { scene, module, actor, p, motions, step, setCaptured(value: boolean) { captured = value; }, get completed() { return completed; } };
}

function assertReadableAndUnobstructed(f: ReturnType<typeof fixture>, focus: ModuleCameraFocus) {
  f.actor.group.updateWorldMatrix(true, false);
  const localCamera = f.actor.group.worldToLocal(new THREE.Vector3(focus.position.x, focus.position.y, focus.position.z));
  assert.ok(localCamera.z > 2, 'camera remains in the actor-facing half-space, not behind her hair');
  assert.ok(localCamera.y > 1.3 && localCamera.y < 2, 'view remains near human eye level');
  assert.ok(Math.hypot(localCamera.x, localCamera.z) < 5, 'the actor is not tiny in a distant chase shot');
  const camera = new THREE.PerspectiveCamera(55, 932 / 430, .1, 100);
  camera.position.set(focus.position.x, focus.position.y, focus.position.z);
  camera.lookAt(focus.target.x, focus.target.y, focus.target.z); camera.updateMatrixWorld(true);
  const head = f.actor.group.localToWorld(new THREE.Vector3(0, 1.9, 0)).project(camera);
  const feet = f.actor.group.localToWorld(new THREE.Vector3(0, .03, 0)).project(camera);
  for (const point of [head, feet]) assert.ok(Math.abs(point.x) < .9 && Math.abs(point.y) < .95 && point.z > -1 && point.z < 1,
    'the full standing silhouette fits the actual landscape camera');
  assert.ok(Math.abs(head.y - feet.y) > .6, 'the figure fills over thirty percent of the screen height');

  // A clear actor-to-camera ray must not cross the full Roadster volume.
  // This would fail the native L8 shot, which parked directly on the actor.
  const from = new THREE.Vector3(focus.target.x, focus.target.y, focus.target.z), to = new THREE.Vector3(focus.position.x, focus.position.y, focus.position.z);
  const h = { x: -Math.sin(f.p.yaw), z: -Math.cos(f.p.yaw) };
  for (let i = 0; i <= 40; i++) {
    const at = from.clone().lerp(to, i / 40), dx = at.x - f.p.x, dz = at.z - f.p.z;
    const along = dx * h.x + dz * h.z, side = -dx * h.z + dz * h.x;
    assert.ok(!(Math.abs(along) < 2.75 && Math.abs(side) < 1.5 && at.y > f.p.y - .55 && at.y < f.p.y + 1.5),
      'the Roadster cannot obscure the actor-to-camera sightline');
  }
}

for (const kind of ['walking', 'wedding'] as const) for (const yaw of [0, Math.PI / 2, -1.1]) {
  test(`${kind} cinematic follows a front/side full-body shot at street yaw ${yaw}`, () => {
    const f = fixture(kind, yaw); f.setCaptured(true);
    for (let i = 0; i < 120; i++) f.step();
    assert.ok(f.module.cameraFocus); assertReadableAndUnobstructed(f, f.module.cameraFocus!);
    const start = new THREE.Vector3().copy(f.module.cameraFocus!.target);
    for (let i = 0; i < 1200; i++) f.step(); // Jessie has turned around; the held procession has moved too.
    assertReadableAndUnobstructed(f, f.module.cameraFocus!);
    assert.ok(start.distanceTo(new THREE.Vector3().copy(f.module.cameraFocus!.target)) > 1, 'framing follows the moving actor');
    f.module.teardown();
  });
}

test('Jessie story camera survives physical handoff and the indefinite moving character hold, and releases outside story', () => {
  const f = fixture('walking'); assert.equal(f.module.cameraFocus, undefined);
  f.setCaptured(true);
  for (let i = 0; i < 300 && !f.completed; i++) f.step(true);
  assert.equal(f.completed, 1); assert.ok(f.module.cameraFocus);
  for (let i = 0; i < 300; i++) f.step();
  assertReadableAndUnobstructed(f, f.module.cameraFocus!); assert.equal(f.completed, 1);
  f.setCaptured(false); assert.equal(f.module.cameraFocus, undefined, 'ordinary walking/chase framing is unchanged');
  f.setCaptured(true); f.actor.group.visible = false; assert.equal(f.module.cameraFocus, undefined);
  f.actor.group.visible = true; f.actor.group.userData.characterRelease = 'withheld'; assert.equal(f.module.cameraFocus, undefined);
  f.module.teardown(); assert.equal(f.module.cameraFocus, undefined);
});

test('wedding story parks beside the dancer, clears the camera ray and preserves target and dance timing through handoff', () => {
  const f = fixture('wedding', .7), reference = fixture('wedding', .7); f.setCaptured(true);
  for (let i = 0; i < 250 && !f.completed; i++) { f.step(true); reference.step(); }
  assert.equal(f.completed, 1); assert.ok(f.module.cameraFocus); assertReadableAndUnobstructed(f, f.module.cameraFocus!);
  const actor = f.actor.group.getWorldPosition(new THREE.Vector3()), dx = f.p.x - actor.x, dz = f.p.z - actor.z;
  const along = dx * Math.sin(.7) + dz * Math.cos(.7), side = dx * Math.cos(.7) - dz * Math.sin(.7);
  assert.ok(side > 3.1 && side < 3.5 && Math.abs(along - .5) < 1e-6);
  assert.ok(side - 1.15 > .8, 'the whole car stays outside the character silhouette and hand reach');
  assert.deepEqual(f.module.target, reference.module.target, 'camera/parking changes never move the delivery destination');
  assert.deepEqual(f.motions.map(m => [m.dt, m.motion, m.speed]), reference.motions.map(m => [m.dt, m.motion, m.speed]), 'the actual dancer receives identical motion timing');
  for (let i = 0; i < 100; i++) f.step();
  assertReadableAndUnobstructed(f, f.module.cameraFocus!);
  f.setCaptured(false);
  assert.ok(f.module.cameraFocus, 'the original stopped-handoff camera remains available outside story');
  f.p.speed = 2; assert.equal(f.module.cameraFocus, undefined, 'normal driving releases the existing handoff camera');
  f.setCaptured(true); f.actor.group.userData.characterRelease = 'withheld'; assert.equal(f.module.cameraFocus, undefined);
  f.module.teardown(); reference.module.teardown();
});

test('actual Game camera uses the captured actor shot despite a previously dragged sideways orbit, then preserves ordinary orbit behavior', () => {
  for (const kind of ['walking', 'wedding'] as const) {
    const f = fixture(kind, .7); f.setCaptured(true); for (let i = 0; i < 120; i++) f.step();
    const focus = f.module.cameraFocus!;
    const player = Object.assign(Object.create(Player.prototype), { pos: new THREE.Vector3(f.p.x, f.p.y, f.p.z), yaw: f.p.yaw,
      speed: f.p.speed, lastSupport: 4, placementRevision: 0, flying: false, descending: false, jumpActive: false, bump: 0 });
    const pivots: THREE.Vector3[] = [];
    const g: any = Object.assign(Object.create(Game.prototype), { player, cameraPlacementRevision: 0,
      camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), orbitYaw: 1.4, orbitPitch: .9, orbitDist: 3,
      airOrbitPitch: .62, airOrbitDist: 0, dragging: true,
      story: { cinematic: true, supports: f.module.supports, cameraFocus: focus },
      engine: { camera: new THREE.PerspectiveCamera(60, 932 / 430, .1, 900), placeSun() {} },
      traffic: { hideNear() {} }, city: { signs: { update() {} } },
      clearCamera(from: THREE.Vector3, to: THREE.Vector3) { pivots.push(from.clone()); return to.clone(); },
      insideSolid: () => false, placeLampLights() {} });
    g.updateCamera(0);
    assert.ok(g.engine.camera.position.distanceTo(new THREE.Vector3().copy(focus.position)) < 1e-8,
      'captured story must not stay in the old locked sideways/rear view');
    assert.ok(g.camLook.distanceTo(new THREE.Vector3().copy(focus.target)) < 1e-8);
    assert.ok(pivots.every(point => point.distanceTo(new THREE.Vector3().copy(focus.target)) < 1e-8),
      'clearance uses the actor sightline rather than a line through the car');
    g.story.cinematic = false; g.camPos.set(0, 0, 0); g.camLook.set(0, 0, 0); g.updateCamera(0);
    assert.ok(g.engine.camera.position.distanceTo(new THREE.Vector3().copy(focus.position)) > 1,
      'the same ordinary dragged orbit still has authority after cinematic capture ends');
    assert.equal(g.orbitYaw, 1.4); assert.equal(g.orbitPitch, .9); assert.equal(g.orbitDist, 3);
    f.module.teardown();
  }
});

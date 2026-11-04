import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { speedCameraDistance, speedCameraFov, DRIVING_CAMERA, drivingCameraHeight } from '../../src/game/camera';
import { Game } from '../../src/game/game';

test('stationary camera keeps its baseline distance and 60 degree field of view', () => {
  assert.equal(speedCameraDistance(0), 0);
  assert.equal(speedCameraFov(0), 60);
  assert.equal(7.6 + speedCameraDistance(0), 7.6);
  assert.equal(7.6 + 4 + speedCameraDistance(0), 11.6);
});

test('road, flight and reverse speeds contribute exactly a quarter of the prior zoom delta', () => {
  for (const speed of [120 / 3.6, 160 / 3.6, -6, 10, 20]) {
    assert.equal(speedCameraDistance(speed), Math.abs(speed) * .06 * .25);
    assert.ok(Math.abs(speedCameraFov(speed) - 60 - Math.abs(speed) * .3 * .25) < 1e-12);
  }
  assert.equal(speedCameraDistance(120 / 3.6), .5);
  assert.equal(speedCameraFov(120 / 3.6), 62.5);
});

test('actual Game driving camera uses the lower profile with the same position and FOV damping', () => {
  const game: any = Object.assign(Object.create(Game.prototype), {
    cameraPlacementRevision: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(),
    orbitYaw: 0, orbitPitch: .38, orbitDist: 0, airOrbitPitch: .62, airOrbitDist: 0, dragging: false,
    player: { pos: new THREE.Vector3(0, .55, 0), lastSupport: 0, placementRevision: 0, forward: new THREE.Vector3(0, 0, -1),
      speed: 0, flying: false, descending: false, jumping: false, bump: 0, takeoffAnimating: false },
    engine: { camera: new THREE.PerspectiveCamera(60, 16 / 9, .1, 900), placeSun() {} }, traffic: { hideNear() {} }, city: { signs: { update() {} } },
    clearCamera: (_from: THREE.Vector3, to: THREE.Vector3) => to.clone(), insideSolid: () => false, placeLampLights() {},
  });
  game.updateCamera(0); const originalY = game.engine.camera.position.y;
  game.player.speed = 120 / 3.6; const dt = 1 / 60; game.updateCamera(dt);
  assert.ok(Math.abs(game.engine.camera.position.z - (DRIVING_CAMERA.distance + .5 * (1 - Math.exp(-dt * 5)))) < 1e-10);
  const targetY=.55+drivingCameraHeight(game.player.speed,.38,DRIVING_CAMERA.distance+.5);
  assert.ok(Math.abs(game.engine.camera.position.y - (originalY + (targetY-originalY) * (1 - Math.exp(-dt * 5)))) < 1e-10);
  assert.ok(Math.abs(game.engine.camera.fov - (60 + 2.5 * (1 - Math.exp(-dt * 6)))) < 1e-10);
});

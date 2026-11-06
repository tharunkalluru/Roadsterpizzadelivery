import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLevels } from '../../src/delivery/content/levels';
import { deliveryStoryPoseClear } from '../../src/delivery/runtime';
import { collideBuildings } from '../../src/game/physics';
import { packedDriveWorld } from '../fixtures/release-packed-drive-world';

test('the Golconda delivery road and actor are separated by a solid citadel wall in the shipped map', () => {
  const level = loadLevels().find(l => l.moduleParams.theme === 'salaar')!;
  const { x, z } = level.destination, yaw = Number(level.moduleParams.sceneYaw);
  const { city } = packedDriveWorld({x, z});
  assert.equal(deliveryStoryPoseClear(city, { x, z, y: .55, yaw }), true, 'clear roadster parking space');
  const point = (metres: number, side = 0) => ({
    x: x - metres * Math.sin(yaw) + side * Math.cos(yaw),
    z: z - metres * Math.cos(yaw) - side * Math.sin(yaw),
  });
  assert.ok(collideBuildings(city, point(16), .4, 4, 6) > 0, 'stone wall spans above head height');
  assert.equal(collideBuildings(city, point(26, -8), .4, .15, 2), 0, 'standing room inside for Prabhas');
});

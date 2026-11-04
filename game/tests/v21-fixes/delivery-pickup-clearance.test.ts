import test from 'node:test';
import assert from 'node:assert/strict';
import type { CityData, Surface, Wall } from '../../src/world/city';
import { pickupPathClear } from '../../src/delivery/systems/pickup-clearance';
import { PickupDetector, type JumpPickupPose, type PickupMarker } from '../../src/delivery/systems/pickup-detector';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';

function city(): CityData { return { buildingGrid: new Map(), surfaceGrid: new Map(), walls: new Map(), obstacles: new Map() } as CityData; }
function pose(y: number): JumpPickupPose { return { x: 0, y, z: 0, bottom: y - .55, top: y + 1, jumping: true }; }
function marker(x: number, y: number): PickupMarker { return { carrierId: 'bus', position: { x, y, z: 0 }, previousPosition: { x, y, z: 0 } }; }
function road(y: number): Surface { return { kind: 'road', e: null, i: 0, ax: -8, az: 0, bx: 8, bz: 0, ya: y, yb: y, hw: 4,
  roadQuad: [[-8,y,-4],[-8,y,4],[8,y,4],[8,y,-4]] }; }

test('reach cannot pass down through a low deck or choose a rotating low bound below it', () => {
  const world = city(); world.surfaceGrid.set('0,0', [road(4)]);
  const hero = pose(4.65), box = marker(1, 2.5);
  assert.equal(pickupPathClear(world, hero, hero, box, .5), false);
  hero.bottom = 2.8;
  assert.equal(pickupPathClear(world, hero, hero, box, .5), false, 'root-to-anchor also checks the separating slab');
});

test('reach cannot pass upward through an upper-deck road to its box', () => {
  const world = city(); world.surfaceGrid.set('0,0', [road(4)]);
  const hero = pose(2.2), box = marker(1, 5);
  assert.equal(pickupPathClear(world, hero, hero, box, .5), false);
});

test('an open bus box remains reachable below an overhead bridge and beyond a finite road edge', () => {
  const world = city(); world.surfaceGrid.set('0,0', [road(5)]);
  const hero = pose(3.2), box = marker(1, 3.95);
  assert.equal(pickupPathClear(world, hero, hero, box, .5), true, 'driving step tolerance must not make an overhead road into a solid floor');
  hero.x = 10; box.position.x = box.previousPosition.x = 11; box.position.y = box.previousPosition.y = 5.3;
  assert.equal(pickupPathClear(world, hero, hero, box, .5), true, 'the road has a finite footprint');
});

test('side walls and buildings block a generous pickup but an open reach does not', () => {
  const world = city(), hero = pose(2), box = marker(2, 2.8);
  assert.equal(pickupPathClear(world, hero, hero, box, .5), true);
  const wall: Wall = { ax: 1, az: -2, bx: 1, bz: 2, y0a: 0, y0b: 0, y1a: 5, y1b: 5, kind: 'parapet' };
  world.walls.set('0,0', [wall]); assert.equal(pickupPathClear(world, hero, hero, box, .5), false);
  world.walls.clear(); world.buildingGrid.set('0,0', [{ id: 'b', h: 5, ring: [[.8,-2],[1.2,-2],[1.2,2],[.8,2]] } as any]);
  assert.equal(pickupPathClear(world, hero, hero, box, .5), false);
});

test('clearance uses interpolated contact positions, not only final frame positions', () => {
  const world = city(), before = pose(2), after = pose(2), box = marker(2, 3);
  before.x = -2; after.x = 2; box.previousPosition.x = 0; box.position.x = 4;
  world.walls.set('0,0', [{ ax: 1, az: -2, bx: 1, bz: 2, y0a: 0, y0b: 0, y1a: 5, y1b: 5, kind: 'parapet' }]);
  assert.equal(pickupPathClear(world, before, after, box, .5), false);
  assert.equal(pickupPathClear(world, before, after, box, 1), true);
});

test('detector performs no world queries on misses, disabled simulation, grounded frames or a latched catch', () => {
  const bus = new EventBus<DeliveryEvents>(), detector = new PickupDetector(bus), hero = pose(2); let queries = 0;
  const clear = () => { queries++; return true; };
  assert.equal(detector.update(hero, hero, [marker(10, 3)], clear), null); assert.equal(queries, 0);
  detector.enabled = false; detector.update(hero, hero, [marker(0, 3)], clear); assert.equal(queries, 0);
  detector.enabled = true; detector.update({ ...hero, jumping: false }, { ...hero, jumping: false }, [marker(0, 3)], clear); assert.equal(queries, 0);
  assert.ok(detector.update(hero, hero, [marker(0, 3)], clear)); assert.equal(queries, 1);
  detector.update(hero, hero, [marker(0, 3)], clear); assert.equal(queries, 1);
});

test('blocked candidate does not latch or prevent a different clear carrier from being caught', () => {
  const bus = new EventBus<DeliveryEvents>(), detector = new PickupDetector(bus), hero = pose(2);
  const blocked = marker(0, 3), clear = { ...marker(1, 3), carrierId: 'auto' };
  assert.equal(detector.update(hero, hero, [blocked], () => false), null); assert.equal(detector.caught, false);
  assert.equal(detector.update(hero, hero, [blocked, clear], candidate => candidate.carrierId === 'auto')?.carrierId, 'auto');
});

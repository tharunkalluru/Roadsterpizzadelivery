import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCameraPosition, staticSolidAt, type CameraCollisionOptions } from '../../src/game/spatial-safety';
import { waterGrid, WATER_LEVEL } from '../../src/world/water';
import type { Area } from '../../src/world/types';
import type { Surface } from '../../src/world/city';

const lake: Area = { kind: 'water', cls: 'water', sub: 'lake', name: 'Actual test lake', ring: [[-40,-40],[40,-40],[40,40],[-40,40]] };
const medium: CameraCollisionOptions = { underwater: { x: 0, z: 0, radius: 25 } };
const city = (): any => ({ waterGrid: waterGrid([lake]), surfaceGrid: new Map(), buildingGrid: new Map(), obstacles: new Map(), walls: new Map(), movingRail: [] });
const slab = (kind: Surface['kind'], y: number): Surface => ({ kind, e: null, i: 0, ax: -20, az: 0, bx: 20, bz: 0, hw: 15, ya: y, yb: y });
const putSurface = (c: any, s: Surface) => { for (let x=-1;x<=1;x++) for (let z=-1;z<=1;z++) c.surfaceGrid.set(`${x},${z}`,[s]); };

test('opt-in lake camera stays submerged rather than escaping above the opaque water surface', () => {
  const c = city(), pivot = { x: 0, y: -2.6, z: 0 }, wanted = { x: 0, y: -2.8, z: 7.5 };
  assert.equal(staticSolidAt(c, pivot), true, 'reproduce the ordinary water-floor rejection');
  assert.equal(staticSolidAt(c, pivot, .35, .35, medium), false);
  assert.deepEqual(clearCameraPosition(c, pivot, wanted, medium), wanted);
  assert.ok(clearCameraPosition(c, pivot, wanted).y > -.5, 'unmodified baseline camera still recovers above water');
});

test('underwater exception requires the active radius, real lake polygon and bounded depth', () => {
  const c = city();
  for (const p of [{x:30,y:-3,z:0}, {x:50,y:-3,z:0}, {x:0,y:-30,z:0}])
    assert.equal(staticSolidAt(c, p, .35, .35, medium), true);
  const land = city(); land.waterGrid.clear(); assert.equal(staticSolidAt(land, {x:0,y:-3,z:0}, .35, .35, medium), true);
  for (const radius of [0,-1,Infinity,NaN,201])
    assert.equal(staticSolidAt(c, {x:0,y:-3,z:0}, .35, .35, {underwater:{x:0,z:0,radius}}), true);
  const wanted = {x:60,y:-3,z:0};
  const clipped = clearCameraPosition(c, {x:0,y:-3,z:0}, wanted, medium);
  assert.ok(clipped.x <= 25 && clipped.y < 0, 'sightline cannot escape the verified water/circle into earth');
});

test('real submerged road/deck floors and overhead lids still constrain the lake camera', () => {
  for (const kind of ['road','deck','pad'] as const) {
    const c = city(); putSurface(c, slab(kind, -5));
    assert.equal(staticSolidAt(c, {x:0,y:-4.85,z:0}, .35, .35, medium), true, `${kind} remains a solid floor`);
    assert.equal(staticSolidAt(c, {x:0,y:-4,z:0}, .35, .35, medium), false);
  }
  const c = city(); putSurface(c, slab('road', -2));
  assert.equal(staticSolidAt(c, {x:0,y:-2.15,z:0}, .35, .35, medium), true, 'actual overhead road face stays solid');
  assert.equal(staticSolidAt(c, {x:0,y:-3,z:0}, .35, .35, medium), false);
});

test('underwater pier obstacles and walls remain physical and camera escape stays in water', () => {
  const c = city(); c.obstacles.set('0,0',[{x:0,z:0,r:1,bottom:-8,top:4}]);
  const pivot = {x:0,y:-3,z:0}; assert.equal(staticSolidAt(c,pivot,.35,.35,medium),true);
  const clear = clearCameraPosition(c,pivot,{x:0,y:-3,z:8},medium);
  assert.equal(staticSolidAt(c,clear,.35,.35,medium),false); assert.ok(clear.y < WATER_LEVEL);
  c.obstacles.clear(); c.walls.set('0,0',[{ax:-10,az:3,bx:10,bz:3,y0a:-8,y0b:-8,y1a:1,y1b:1,kind:'wall'}]);
  const before = {x:0,y:-3,z:0}, wanted = {x:0,y:-3,z:8};
  const clipped = clearCameraPosition(c,before,wanted,medium);
  assert.ok(clipped.z < 3 && clipped.y < 0, 'camera stops before a real wall beneath the water');
});

test('normal city camera and above-water building safety are unchanged with an inactive or inapplicable medium', () => {
  const c = city();
  c.buildingGrid.set('0,0',[{id:'building',h:8,ring:[[-2,-2],[2,-2],[2,2],[-2,2]]}]);
  assert.equal(staticSolidAt(c,{x:0,y:4,z:0},.35,.35,medium),true);
  const from = {x:10,y:4,z:0}, wanted={x:10,y:5,z:8};
  assert.deepEqual(clearCameraPosition(c,from,wanted,medium),clearCameraPosition(c,from,wanted));
  c.waterGrid.clear(); assert.deepEqual(clearCameraPosition(c,from,wanted,medium),clearCameraPosition(c,from,wanted));
});

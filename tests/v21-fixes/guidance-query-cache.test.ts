import test from 'node:test';
import assert from 'node:assert/strict';
import { GuidanceCollisionQueries, collideWalls, collideBuildings } from '../../src/game/physics';
import { clearRoadGuidance } from '../../src/game/route-guidance';

function fixture(): any {
  const city = { walls: new Map(), buildingGrid: new Map(), obstacles: new Map(), railwayWalls: [] as any[] };
  const walls = [
    { ax: 20, az: -10, bx: 20, bz: 20, y0a: 0, y0b: 0, y1a: 2, y1b: 2, kind: 'wall' },
    { ax: 10, az: -10, bx: 10, bz: 20, y0a: 0, y0b: 0, y1a: .3, y1b: .3, kind: 'kerb' },
    { ax: 20, az: 0, bx: 50, bz: 0, y0a: 7, y0b: 8, y1a: 9, y1b: 10, kind: 'wall' },
  ];
  const buildings = [
    { h: 5, ring: [[30, -8], [40, -8], [40, 8], [30, 8]] },
    { h: 4, ring: [[39, -7], [46, -7], [46, 6], [39, 6]] },
  ];
  city.railwayWalls.push(walls[0], walls[0]);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    city.walls.set(`${x},${z}`, walls);
    city.buildingGrid.set(`${x},${z}`, buildings);
    city.obstacles.set(`${x},${z}`, [{ x: 51, z: 0, r: 1.5, top: 2 }]);
  }
  return city;
}

test('build-local candidates preserve exact collision responses and mutation order', () => {
  const city = fixture(), queries = new GuidanceCollisionQueries(city);
  for (let x = -2; x < 65; x += .7) for (const y of [-2, 0, 7.5, 12]) for (const z of [-9, 0, 9]) {
    const previous = { x: x - 2, z }, a = { x, z }, b = { x, z };
    const footprint = { hx: 1, hz: 0, halfLength: 2.4, halfWidth: 1 };
    assert.deepEqual(collideWalls(city, previous, a, 1.05, y, y + 1.2, footprint), collideWalls(city, previous, b, 1.05, y, y + 1.2, footprint, queries));
    assert.deepEqual(a, b);
    assert.equal(collideBuildings(city, a, 1.15, y), collideBuildings(city, b, 1.15, y, undefined, queries));
    assert.deepEqual(a, b);
  }
});

test('new guidance builds see changed gates and newly published buildings', () => {
  const city: any = { walls: new Map(), buildingGrid: new Map(), obstacles: new Map(), railwayWalls: [] };
  const pts: [number, number, number][] = [[0, 0, 0], [80, 0, 0]];
  const original = clearRoadGuidance(city, pts); assert.equal(original.blocked, false);
  city.railwayWalls.push({ ax: 40, az: -10, bx: 40, bz: 10, y0a: 0, y0b: 0, y1a: 2, y1b: 2, kind: 'wall' });
  assert.equal(clearRoadGuidance(city, pts).blocked, true);
  city.railwayWalls.length = 0;
  assert.deepEqual(clearRoadGuidance(city, pts), original);
  city.buildingGrid.set('0,0', [{ h: 3, ring: [[30, -3], [34, -3], [34, 3], [30, 3]] }]);
  assert.equal(clearRoadGuidance(city, pts).blocked, true);
});

test('a cache from a different city cannot override collision candidates', () => {
  const city = fixture(), wrong = new GuidanceCollisionQueries({ walls: new Map(), buildingGrid: new Map(), railwayWalls: [] } as any);
  const a = { x: 20, z: 0 }, b = { ...a };
  assert.deepEqual(collideWalls(city, { x: 18, z: 0 }, a, 1, 0, 1), collideWalls(city, { x: 18, z: 0 }, b, 1, 0, 1, undefined, wrong));
  assert.deepEqual(a, b);
});

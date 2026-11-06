import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildTile, type Wall } from '../../src/world/city';
import { initTemplates } from '../../src/core/util';
import { makeRailwayNetwork } from '../../src/world/railway-geometry';
import { collideWalls } from '../../src/game/physics';
import type { RoadEdge } from '../../src/world/types';

const road = (id: string, pts: [number,number][], extra: Partial<RoadEdge> = {}): RoadEdge => ({
  id, seg: id, name: id, cls: 'primary', pts, w: 12, lanes: 2, oneway: 'backward', elev: null,
  from: 'join', to: id+'-end', maxspeed: 40, ...extra,
});
const built = (roads: RoadEdge[], lowQ: boolean, i = 0, j = 0) => {
  initTemplates();
  return buildTile({ i, j, roads, nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ, railway: makeRailwayNetwork([]) });
};
const wallsOf = (tile: ReturnType<typeof built>) => [...new Set([...tile.walls.values()].flat())];

test('a shallow mapped merge remains open farther than the short junction trim, in both quality modes', () => {
  const main = road('main', [[100,500],[700,500]]), branch = road('branch', [[100,500],[700,560]], { w: 7.6 });
  for (const lowQ of [true, false]) {
    const tile = built([main, branch], lowQ), walls = wallsOf(tile);
    // Main-road inner curb z=506.2 crosses the branch at x=162. The old
    // dot>.94 shortcut retained this barrier 62m beyond their shared node.
    assert.ok(!walls.some(w => w.kind === 'median' && Math.abs((w.az+w.bz)/2-506.2)<.02 && Math.min(w.ax,w.bx)<166 && Math.max(w.ax,w.bx)>158));
    const p = { x: 163, z: 506.3 };
    assert.equal(collideWalls({ walls: tile.walls, railwayWalls: [] } as any, { x:161, z:506.1 }, p, 1.05, 0, 1.1).hit, 0);
    assert.ok(walls.some(w => w.kind === 'median' && Math.abs(w.az-506.2)<.02 && w.ax>400), 'real divider resumes after the envelopes separate');
  }
});

test('parallel disconnected carriageways and separate-height flyovers retain their actual boundaries', () => {
  const main = road('main', [[100,500],[700,500]]), parallel = road('parallel', [[100,510],[700,510]], { from:'other-start', to:'other-end' });
  for (const roads of [[main, parallel], [main, road('overpass', [[100,500],[700,560]], { elev:[8,8] })]]) {
    const walls = wallsOf(built(roads, true));
    assert.ok(walls.some(w => w.kind === 'median' && Math.abs(w.az-506.2)<.02 && w.ax>150 && w.ax<170));
  }
});

test('ground divider collision heights match their visible painted curb instead of an invisible metre wall', () => {
  const tile = built([road('main', [[100,500],[700,500]])], true);
  for (const wall of wallsOf(tile).filter(w => w.kind === 'median')) assert.ok(Math.abs(wall.y1a-wall.y0a-.42)<1e-8);
  const position = { x:350, z:507.4 };
  assert.equal(collideWalls({ walls:tile.walls, railwayWalls:[] } as any, {x:350,z:505}, position, 1.05, .5, 1.5).hit, 0, 'a car already above the curb is not hit by empty air');
});

test('shipped Dallas Centre merge near IKEA has no divider through its joining lane', () => {
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const roads = core.roads.filter((r: RoadEdge) => ['89279b8f-2c8_8','4d24a77f-b3b_0'].includes(r.id));
  assert.equal(roads.length, 2);
  const snapshot = JSON.stringify(roads), tile = built(roads, true, -13, -3);
  const joining = roads.find((r: RoadEdge) => r.id === '4d24a77f-b3b_0') as RoadEdge;
  const [a,b] = joining.pts, dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
  const obstructions = wallsOf(tile).filter((wall: Wall) => {
    if (wall.kind !== 'median') return false;
    const x=(wall.ax+wall.bx)/2,z=(wall.az+wall.bz)/2;
    const along=((x-a[0])*dx+(z-a[1])*dz)/len;
    const lateral=Math.abs((x-a[0])*dz-(z-a[1])*dx)/len;
    return along>20 && along<len-6 && lateral<1.3;
  });
  assert.equal(obstructions.length,0);
  assert.equal(JSON.stringify(roads),snapshot,'openings do not invent roads or move the source junction');
});

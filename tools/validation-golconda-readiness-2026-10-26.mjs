// Read-only validation probe. Uses production geometry, support, collision and
// Player.update; it does not change the application or any shipped city data.
// The existing flat-roof test is retained as a positive control before probing
// a real visible hillside that still leaves the car horizontal.
import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const bundle = await build({
  stdin: {
    contents: "export * from './game/src/world/landmarks'; export * from './game/src/world/landmark-support'; export * from './game/src/world/landmark-support-capture'; export * from './game/src/world/golconda-summit'; export * from './game/src/core/util'; export {Player} from './game/src/game/player'; export {Vector3,Group} from './game/node_modules/three/build/three.module.js';",
    resolveDir: new URL('..', import.meta.url).pathname,
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
m.initTemplates();
const names = ['st', 'wall', 'park', 'water', 'roof', 'lit', 'glow', 'road', 'marks', 'foot', 'kerb', 'shop'];
const batches = Object.fromEntries(names.map(name => [name, new m.TiledBatch()]));
const landmarkSurfaceGrid = new Map(), buildingGrid = new Map(), obstacles = new Map(), solids = [];
const landmark = m.placeLandmarks({ lat: 17.4063, lon: 78.4966 }).find(p => p.id === 'golconda');
const context = {
  B: m.captureLandmarkBatches(batches, landmarkSurfaceGrid, 'golconda'),
  obstacle(x, z, r, top) {
    const key = `${Math.floor(x / 50)},${Math.floor(z / 50)}`;
    if (!obstacles.has(key)) obstacles.set(key, []);
    obstacles.get(key).push({ x, z, r, top });
  },
  solid(ring, h) { solids.push({ id: `golconda_${solids.length}`, cls: 'landmark', h, ring }); },
  road: () => false,
  roadY: () => null,
};
m.drawLandmark(landmark, context);
for (const solid of solids) {
  const xs = solid.ring.map(p => p[0]), zs = solid.ring.map(p => p[1]);
  for (let i = Math.floor(Math.min(...xs) / 50); i <= Math.floor(Math.max(...xs) / 50); i++) {
    for (let j = Math.floor(Math.min(...zs) / 50); j <= Math.floor(Math.max(...zs) / 50); j++) {
      const key = `${i},${j}`;
      if (!buildingGrid.has(key)) buildingGrid.set(key, []);
      buildingGrid.get(key).push(solid);
    }
  }
}
const city = { surfaceGrid: new Map(), buildingGrid, landmarkSurfaceGrid, obstacles, walls: new Map() };
const frame = new m.Kit(landmark.x, landmark.z, landmark.rot, context);
function playerAt(localU, localV, supportY, yaw, flying) {
  const [x, z] = frame.P(localU, localV);
  return Object.assign(Object.create(m.Player.prototype), {
    city, pos: new m.Vector3(x, supportY + .55 + (flying ? 8 : 0), z), yaw,
    speed: 0, vy: 0, steerVis: 0, flying, descending: false, onRoad: false,
    lastSupport: supportY, lastKind: 'landmark', lastElevRoad: false, lastEdge: null,
    hitCooldown: 0, bump: 0, flyAlt: supportY + 8, altT: 0, kerbT: 0, glide: null,
    placementRevision: 0, roadPitch: 0, group: new m.Group(), glow: new m.Group(), light: new m.Group(),
    wheels: [], wheelRollers: [], animateThrusters() {},
  });
}
const idle = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false };
function step(player, count, input = {}) {
  for (let i = 0; i < count; i++) player.update(1 / 60, { ...idle, ...input }, i / 60);
}

// Positive control: the already-reported flat summit landing/drive/park works.
const roof = m.GOLCONDA_SUMMIT.roof;
const roofPlayer = playerAt(-8, -4, roof, Math.atan2(-frame.c, -frame.s), true);
step(roofPlayer, 1, { flyPressed: true }); step(roofPlayer, 240);
assert.equal(roofPlayer.flying, false);
assert.equal(roofPlayer.descending, false);
assert.equal(roofPlayer.lastKind, 'landmark');
assert.ok(Math.abs(roofPlayer.pos.y - roof - .55) < 1e-4);
const landed = roofPlayer.pos.clone();
step(roofPlayer, 78, { throttle: 1 }); step(roofPlayer, 50, { brake: 1 }); step(roofPlayer, 120);
assert.ok(roofPlayer.pos.distanceTo(landed) > 8);
assert.ok(Math.abs(roofPlayer.speed) < .05);
const parked = roofPlayer.pos.clone(); step(roofPlayer, 300);
assert.ok(roofPlayer.pos.distanceTo(parked) < 1e-5);
assert.ok(Math.abs(roofPlayer.pos.y - roof - .55) < 1e-4);

// A near-planar ~15.7 degree longitudinal hillside, comfortably below the
// landmark normal filter's 78.5 degree limit. Uses the actual four wheel centers
// from vehicles.ts (x +/- .945, z +/- 1.4), not only the center support query.
const local = [-18, 182], [x, z] = frame.P(...local);
const centerSurface = m.landmarkHeightAt(landmarkSurfaceGrid, x, z);
assert.ok(centerSurface !== null);
const slopePlayer = playerAt(...local, centerSurface, Math.PI / 2, false);
step(slopePlayer, 120);
slopePlayer.group.updateMatrixWorld(true);
const contacts = [];
for (const lateral of [-.945, .945]) for (const longitudinal of [-1.4, 1.4]) {
  const wheelBottom = new m.Vector3(lateral, -.55, longitudinal).applyMatrix4(slopePlayer.group.matrixWorld);
  const worldX = wheelBottom.x, worldZ = wheelBottom.z;
  const terrainY = m.landmarkHeightAt(landmarkSurfaceGrid, worldX, worldZ, centerSurface + 2);
  assert.ok(terrainY !== null);
  const wheelBottomY = wheelBottom.y;
  contacts.push({ lateral, longitudinal, worldX, worldZ, terrainY, wheelBottomY,
    penetrationM: Math.max(0, terrainY - wheelBottomY), floatingM: Math.max(0, wheelBottomY - terrainY) });
}
const maxPenetrationM = Math.max(...contacts.map(p => p.penetrationM));
const maxFloatingM = Math.max(...contacts.map(p => p.floatingM));
const ready = maxPenetrationM <= .1 && maxFloatingM <= .1;
console.log(JSON.stringify({
  flatRoofPositiveControl: 'PASS: 91.5m landing, >8m drive, brake and 5s park',
  realSolids: solids.length, realObstacleCells: obstacles.size,
  slope: { local, world: [x, z], centerSurface, playerY: slopePlayer.pos.y, pitch: slopePlayer.group.rotation.x,
    roll: slopePlayer.group.rotation.z, lastKind: slopePlayer.lastKind, contacts, maxPenetrationM, maxFloatingM },
  readiness: ready ? 'PASS' : 'FAIL: landmark slope leaves wheels embedded/floating',
  cause: 'Player.update computes pitch only when onRoad; landmark support samples only the car center.',
  source: ['game/src/game/player.ts:135', 'game/src/game/player.ts:170', 'game/src/world/vehicles.ts:143'],
}, null, 2));
if (!ready) process.exitCode = 1;

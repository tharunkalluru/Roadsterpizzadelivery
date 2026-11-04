import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Batch } from '../../../../src/core/util';
import type { RoadEdge } from '../../../../src/world/types';
import type { CityData, Surface } from '../../../../src/world/city';
import type { RoadQuad } from '../../../../src/world/road-surface';
import { actualPlayer } from '../../../../tests/fixtures/actual-player';

const output = process.argv[2] || 'docs/qa/evidence/main-expansion/player-bank-contact-results.json';
const paintLift = .04, idle = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false };
type Triangle = number[];
// Independent oracle reads emitted Float32 vertices, not roadQuadHeight/supportAt.
function triangleHeight(t: Triangle, x: number, z: number): number | null {
  const bx = t[3] - t[0], bz = t[5] - t[2], cx = t[6] - t[0], cz = t[8] - t[2], det = bx * cz - bz * cx;
  if (Math.abs(det) < 1e-9) return null;
  const px = x - t[0], pz = z - t[2], u = (px * cz - pz * cx) / det, v = (bx * pz - bz * px) / det;
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001 ? t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1]) : null;
}
function world(bank: number) {
  const y = (x: number) => 10 + bank * x;
  // Deliberately broad diagnostic plane keeps 45/90-degree heading controls
  // finite and supported throughout normal acceleration; it is not a city road.
  const quad: RoadQuad = [[-100, y(-100), -200], [-100, y(-100), 200], [100, y(100), 200], [100, y(100), -200]];
  const edge: RoadEdge = { id: 'synthetic-bank', seg: 'synthetic-bank', name: null, cls: 'primary', w: 200,
    lanes: 2, oneway: null, from: 'a', to: 'b', pts: [[0, -200], [0, 200]], elev: [10, 10], maxspeed: null };
  const surface: Surface = { e: edge, i: 0, ax: 0, az: -200, bx: 0, bz: 200, ya: 10, yb: 10, hw: 100,
    kind: 'road', roadQuad: quad, paintLift };
  const surfaceGrid = new Map<string, Surface[]>();
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) surfaceGrid.set(`${x},${z}`, [surface]);
  const batch = new Batch(); batch.quad(...quad.map(p => [p[0], p[1] + paintLift, p[2]]) as RoadQuad, '#fff');
  const geometry = batch.geometry(), emitted = geometry.getAttribute('position');
  assert.ok(emitted.array instanceof Float32Array);
  const triangles = Array.from({ length: emitted.count / 3 }, (_, i) => Array.from(emitted.array.slice(i * 9, i * 9 + 9)));
  const height = (x: number, z: number) => {
    const h = triangles.map(t => triangleHeight(t, x, z)).find(y => y !== null);
    assert.notEqual(h, undefined, `outside synthetic finite road at ${x},${z}`);
    return h!;
  };
  const city = { surfaceGrid, buildingGrid: new Map(), walls: new Map(), obstacles: new Map(),
    movingRail: [], waterGrid: new Map(), landmarkSurfaceGrid: new Map() } as unknown as CityData;
  return { city, geometry, height, triangles };
}
const visible = (object: THREE.Object3D) => { for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false; return true; };
const point = new THREE.Vector3();
const range = () => ({ min: Infinity, max: -Infinity });
const include = (r: ReturnType<typeof range>, value: number) => { r.min = Math.min(r.min, value); r.max = Math.max(r.max, value); };

function run(bank: number, hz: number, yaw: number, motion: 'stationary' | 'forward' | 'reverse') {
  const fixture = world(bank), actual = actualPlayer(fixture.city), p = actual.player;
  const tyres = p.wheelRollers.map((roller, i) => {
    const mesh = roller.children[0];
    assert.ok(mesh instanceof THREE.Mesh && mesh.geometry.type === 'CylinderGeometry', `real tyre ${i}`);
    return mesh as THREE.Mesh;
  });
  const wheelSet = new Set(p.wheels), tyreSet = new Set(tyres);
  const meshes: { mesh: THREE.Mesh; inWheel: boolean }[] = [];
  p.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    let inWheel = false;
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (wheelSet.has(node as THREE.Group)) inWheel = true;
    meshes.push({ mesh: object, inWheel });
  });
  const snapshots: any[] = [], wheelRanges = tyres.map(() => ({ mesh: range(), bottom: range() }));
  let time = 0, frames = 0, offRoad = 0;
  const wheelMeasure = (accumulate: boolean) => tyres.map((mesh, i) => {
    let min = Infinity;
    const positions = mesh.geometry.getAttribute('position');
    for (let n = 0; n < positions.count; n++) {
      point.fromBufferAttribute(positions, n).applyMatrix4(mesh.matrixWorld);
      min = Math.min(min, point.y - fixture.height(point.x, point.z));
    }
    // Bottom of the actual unspun steering frame, transformed through its real
    // parents; tyre-mesh minima above additionally include tread width/spin.
    point.set(0, -.36, 0).applyMatrix4(p.wheels[i].matrixWorld);
    const bottom = point.y - fixture.height(point.x, point.z);
    if (accumulate) { include(wheelRanges[i].mesh, min + paintLift); include(wheelRanges[i].bottom, bottom + paintLift); }
    return { index: i, meshMinAsphaltGap: min, meshMinSupportGap: min + paintLift,
      wheelBottomAsphaltGap: bottom, wheelBottomSupportGap: bottom + paintLift };
  });
  const snapshot = (phase: string) => {
    let min = Infinity, bodyMin = Infinity, tyreMin = Infinity, vertices = 0, bodyMesh = '';
    for (const [index, { mesh, inWheel }] of meshes.entries()) {
      if (!visible(mesh)) continue;
      const positions = mesh.geometry.getAttribute('position');
      for (let n = 0; n < positions.count; n++) {
        point.fromBufferAttribute(positions, n).applyMatrix4(mesh.matrixWorld);
        const gap = point.y - fixture.height(point.x, point.z); vertices++;
        min = Math.min(min, gap);
        if (tyreSet.has(mesh)) tyreMin = Math.min(tyreMin, gap);
        if (!inWheel && gap < bodyMin) { bodyMin = gap; bodyMesh = mesh.name || `mesh[${index}]`; }
      }
    }
    snapshots.push({ phase, time, position: p.pos.toArray(), speed: p.speed,
      displayedYXZ: [p.group.rotation.x, p.group.rotation.y, p.group.rotation.z],
      matrixWorld: p.group.matrixWorld.toArray(), visibleVertices: vertices,
      fullModelMinAsphaltGap: min, fullModelMinSupportGap: min + paintLift,
      nonWheelBodyMinAsphaltGap: bodyMin, nonWheelBodyMinSupportGap: bodyMin + paintLift, bodyMesh,
      tyreMinAsphaltGap: tyreMin, tyreMinSupportGap: tyreMin + paintLift, wheels: wheelMeasure(false) });
  };
  try {
    p.place(0, 0, yaw, 10); p.group.updateMatrixWorld(true); snapshot('placed');
    const settleCheckpoints = new Set([Math.round(hz * .25), Math.round(hz * .5), hz, hz * 3]);
    for (let frame = 1; frame <= hz * 3; frame++) {
      time += 1 / hz; p.update(1 / hz, idle, time); p.group.updateMatrixWorld(true); frames++;
      if (!p.onRoad) offRoad++;
      wheelMeasure(false);
      if (settleCheckpoints.has(frame)) snapshot('settle');
    }
    const input = motion === 'forward' ? { ...idle, throttle: 1 } : motion === 'reverse' ? { ...idle, brake: 1 } : idle;
    for (let frame = 1; frame <= hz * 4; frame++) {
      time += 1 / hz; p.update(1 / hz, input, time); p.group.updateMatrixWorld(true); frames++;
      if (!p.onRoad) offRoad++;
      wheelMeasure(true);
      if ([hz, hz * 2, hz * 4].includes(frame)) snapshot('motion');
    }
    assert.equal(offRoad, 0, 'every actual Player update remains grounded on the synthetic finite road');
    return { bank, hz, yaw, motion, frames, offRoad, wheelRangesSupport: wheelRanges, snapshots };
  } finally { actual.dispose(); fixture.geometry.dispose(); }
}

const scenarios: any[] = [];
for (const hz of [30, 60]) for (const yaw of [0, Math.PI / 4, Math.PI / 2]) for (const motion of ['stationary', 'forward', 'reverse'] as const)
  for (const bank of [0, .025, -.025]) scenarios.push(run(bank, hz, yaw, motion));
const final = (s: any) => s.snapshots.at(-1);
const summary = scenarios.filter(s => s.bank !== 0).map(s => {
  const f = final(s), flat = final(scenarios.find(b => b.bank === 0 && b.hz === s.hz && b.yaw === s.yaw && b.motion === s.motion));
  return { bank: s.bank, hz: s.hz, yawDegrees: s.yaw * 180 / Math.PI, motion: s.motion,
    finalSpeed: f.speed, displayedPitch: f.displayedYXZ[0], displayedRoll: f.displayedYXZ[2],
    wheelBottomSupportMM: f.wheels.map((w: any) => w.wheelBottomSupportGap * 1000),
    tyreMeshSupportMM: f.wheels.map((w: any) => w.meshMinSupportGap * 1000),
    fullModelSupportMM: f.fullModelMinSupportGap * 1000,
    nonWheelBodySupportMM: f.nonWheelBodyMinSupportGap * 1000,
    nonWheelBodyDeltaFromFlatMM: (f.nonWheelBodyMinSupportGap - flat.nonWheelBodyMinSupportGap) * 1000,
    tyreMeshDeltaFromFlatMM: (f.tyreMinSupportGap - flat.tyreMinSupportGap) * 1000 };
});
const sourceHashes = Object.fromEntries(['src/game/player.ts', 'src/world/vehicles.ts', 'src/game/physics.ts', 'src/world/road-surface.ts',
  'tests/fixtures/actual-player.ts', 'docs/qa/evidence/main-expansion/player-bank-contact-probe.ts'].map(file =>
  [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { measuredAt: new Date().toISOString(), sourceHashes, setup: { productionConstructor: 'Player', poseSource: 'actual mesh.matrixWorld after Player.update',
  bank: '+/-2.5% x slope', baseHeight: 10, diagnosticPlaneWidth: 200, roadLength: 400, paintLift,
  supportGapConvention: 'signed vertical clearance to Float32 emitted asphalt minus existing .04 render lift; negative is penetration',
  asphaltGapConvention: 'signed vertical clearance to actual emitted Float32 Batch.geometry triangles; negative is penetration',
  wheelOrder: ['front left', 'front right', 'rear left', 'rear right'],
  stationarySettleSeconds: 3, subsequentMotionSeconds: 4, frameRates: [30, 60], headingsDegrees: [0, 45, 90],
  sampling: 'actual tyre meshes and wheel bottoms every Player update; all visible body mesh vertices at placement, settle .25/.5/1/3s, motion1/2/4s',
  bodyDefinition: 'all visible real Player Mesh vertices; nonWheelBody excludes descendants of real wheel steering groups',
  limitations: 'Synthetic planar surface contact diagnostic only; no bank runtime implementation, UI, source-city feasibility, camera, or publication claims' },
  scenarios, summary };
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, scenarios: scenarios.length, actualPlayerFrames: scenarios.reduce((n, s) => n + s.frames, 0),
  zeroOffRoadFrames: scenarios.every(s => s.offRoad === 0), crossBankSummary: summary.filter(s => s.bank === .025 && s.yawDegrees === 0) }, null, 2));

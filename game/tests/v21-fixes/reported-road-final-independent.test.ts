import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { buildTile, type Surface } from '../../src/world/city';
import type { CoreData, RoadEdge } from '../../src/world/types';
import { applyRoadGradePatches, currentRoadGradePatches, prepareRoadGrades } from '../../src/world/road-grades';
import { supportAt } from '../../src/game/physics';
import { roadster } from '../../src/world/vehicles';
import { joinedGroundApproaches } from '../../src/world/road-joined-approaches';

const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const sourceIds = ['ad6f78f1-dc9_0', '23427c8c-e37_0'];
const target = { x: 3983.1, z: -2073.2, yaw: 280.3 * Math.PI / 180 };
initTemplates();

/** Independent oracle: actual emitted asphalt triangles, rather than the
 * roadQuadHeight helper used by both the existing tests and support query. */
type Triangle = [number, number, number, number, number, number, number, number, number];
function visibleHeight(t: Triangle, x: number, z: number): number | null {
  const bx = t[3] - t[0], bz = t[5] - t[2], cx = t[6] - t[0], cz = t[8] - t[2];
  const determinant = bx * cz - bz * cx;
  if (Math.abs(determinant) < 1e-10) return null;
  const px = x - t[0], pz = z - t[2], u = (px * cz - pz * cx) / determinant, v = (bx * pz - bz * px) / determinant;
  return u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001 ? t[1] + u * (t[4] - t[1]) + v * (t[7] - t[1]) : null;
}

function actualReportedWorld(classes?: [string, string]) {
  // Preserve the reported source network, including real shared-node and
  // mapped-level controls. Class variants only exercise this same geometry.
  const source = core.roads.map(e => {
    const index = sourceIds.indexOf(e.id);
    return index >= 0 && classes ? { ...e, cls: classes[index] } : e;
  });
  const roads = prepareRoadGrades(source), patches = currentRoadGradePatches(roads);
  const packs = new Map<string, any>(), surfaces = new Map<string, Surface[]>(), triangles: Triangle[] = [], solidTriangles: Triangle[] = [];
  for (const i of [3, 4]) {
    const j = -3, pack = core.packs.find(p => p.tiles.some(([x, z]) => x === i && z === j))!;
    let contents = packs.get(pack.file);
    if (!contents) { contents = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()); packs.set(pack.file, contents); }
    const zone = contents.tiles[`${i}_${j}`], local = applyRoadGradePatches(zone.roads, patches).map(e => {
      const index = sourceIds.indexOf(e.id);
      return index >= 0 && classes ? { ...e, cls: classes[index] } : e;
    });
    const tile = buildTile({ ...zone, roads: local }, { lowQ: true, metro: core.metro });
    for (const [key, list] of tile.surfaceGrid) surfaces.set(key, [...(surfaces.get(key) ?? []), ...list]);
    for (const buffer of tile.buffers.filter(b => b.mat === 'road' || b.mat === 'st')) for (let n = 0; n < buffer.pos.length; n += 9) {
      const t = Array.from(buffer.pos.slice(n, n + 9)) as Triangle;
      if (Math.max(t[0], t[3], t[6]) < 3480 || Math.min(t[0], t[3], t[6]) > 4040 ||
        Math.max(t[2], t[5], t[8]) < -2410 || Math.min(t[2], t[5], t[8]) > -2020) continue;
      (buffer.mat === 'road' ? triangles : solidTriangles).push(t);
    }
  }
  const city: any = { surfaceGrid: surfaces, buildingGrid: new Map(), obstacles: new Map(), walls: new Map(),
    movingRail: [], waterGrid: new Map(), landmarkSurfaceGrid: new Map() };
  assert.ok(triangles.length > 20, 'exercise actual emitted road triangles at the reported tile join');
  const pair = sourceIds.map(id => roads.find(e => e.id === id)!);
  assert.ok(pair.every(Boolean));
  return { city, triangles, solidTriangles, pair, roads };
}

function checkBodyClearance(world: ReturnType<typeof actualReportedWorld>) {
  const hx = -Math.sin(target.yaw), hz = -Math.cos(target.yaw);
  let feet = .05, samples = 0, roadFrames = 0;
  for (let distance = 5; distance <= 32; distance += .5) {
    const x = target.x + hx * distance, z = target.z + hz * distance;
    const center = supportAt(world.city, x, z, feet, true); feet = center.y;
    if (center.kind === 'road') roadFrames++;
    else assert.ok(!world.triangles.some(t => { const y = visibleHeight(t, x, z); return y !== null && Math.abs(y - feet) < .15; }), `actual reachable emitted asphalt must support the car at distance${distance}`);
    // Nose/body/tail and both sides of the real car footprint. Local tyre
    // support handles legitimate road slope; a second asphalt plane inside
    // the body remains a physical obstruction even if support chooses lower.
    for (const along of [-2, 0, 2]) for (const side of [-.85, 0, .85]) {
      const px = x + hx * along - hz * side, pz = z + hz * along + hx * side;
      const floor = supportAt(world.city, px, pz, feet, true);
      for (const triangle of world.triangles) {
        const rendered = visibleHeight(triangle, px, pz); if (rendered === null) continue;
        const gap = rendered - floor.y; samples++;
        assert.ok(gap <= .45 || gap >= 1.8,
          `drawn road cuts grounded car body ${JSON.stringify({ distance, along, side, x: px, z: pz, support: floor.y,
            supportRoad: floor.s?.e?.id, rendered, gap, triangle })}`);
      }
    }
  }
  assert.ok(samples > 400);
  assert.ok(roadFrames >= 20, 'the actual report heading must enter real road pavement for at least10m');
  return samples;
}

// This reviewer-owned final gate extends the previous exact-model check to every
// half-metre frame, including the previously omitted +31 m neighbour slab.
function triangleGrid(triangles: Triangle[]) {
  const grid = new Map<string, Triangle[]>();
  for (const t of triangles) for (let x = Math.floor(Math.min(t[0], t[3], t[6]) / 4); x <= Math.floor(Math.max(t[0], t[3], t[6]) / 4); x++)
    for (let z = Math.floor(Math.min(t[2], t[5], t[8]) / 4); z <= Math.floor(Math.max(t[2], t[5], t[8]) / 4); z++) {
      const key = `${x},${z}`; (grid.get(key) ?? grid.set(key, []).get(key)!).push(t);
    }
  return (x: number, z: number) => grid.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) ?? [];
}
function completeCarVertices() {
  const material = new THREE.MeshBasicMaterial(), model = roadster(new Proxy({}, { get: () => material }), { logo: material, plate: material });
  model.group.updateMatrixWorld(true);
  const vertices = new Map<string, { mesh: string; point: THREE.Vector3 }>();
  model.group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    const positions = o.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld);
      vertices.set(point.toArray().map(n => n.toFixed(7)).join(','), { mesh: o.name, point });
    }
  });
  const dispose = () => { model.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); material.dispose(); };
  return { vertices: [...vertices.values()], dispose };
}
function fullCarSweep(world: ReturnType<typeof actualReportedWorld>, poses: { label: string; x: number; z: number; yaw: number; required?: boolean }[]) {
  const car = completeCarVertices(), asphalt = triangleGrid(world.triangles), solid = triangleGrid(world.solidTriangles);
  let feet = .05, prior: number | undefined, frames = 0, offRoad = 0, tested = 0, minOverhead = Infinity;
  try {
    for (const pose of poses) {
      const support = supportAt(world.city, pose.x, pose.z, feet, true); feet = support.y;
      if (support.kind !== 'road') { assert.ok(!pose.required, `${pose.label}: tyre support leaves the real road`); offRoad++; }
      if (prior !== undefined && pose.label.startsWith('reported')) assert.ok(Math.abs(feet - prior) < .25, `${pose.label}: support jumps ${feet - prior}m`);
      prior = feet; frames++;
      const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), hx = -s, hz = -c;
      const nose = supportAt(world.city, pose.x + hx * 1.6, pose.z + hz * 1.6, feet, true), tail = supportAt(world.city, pose.x - hx * 1.6, pose.z - hz * 1.6, feet, true);
      const pitch = nose.onRoad && tail.onRoad && Math.abs(nose.y - tail.y) < 1 ? Math.atan2(nose.y - tail.y, 3.2) : 0;
      const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, pose.yaw, 0, 'YXZ'));
      for (const { mesh, point: local } of car.vertices) {
        const p = local.clone().applyMatrix4(matrix); p.add(new THREE.Vector3(pose.x, feet + .55, pose.z));
        for (const triangle of asphalt(p.x, p.z)) {
          const top = visibleHeight(triangle, p.x, p.z); if (top === null || top - feet < .45 || p.y >= top - .02) continue;
          const underside = solid(p.x, p.z).map(t => visibleHeight(t, p.x, p.z)).find(y => y !== null && top - y > .85 && top - y < 1.05);
          if (underside === undefined || underside === null) continue;
          minOverhead = Math.min(minOverhead, underside - p.y); tested++;
          assert.ok(p.y <= underside + .02, `actual complete Roadster enters emitted slab ${JSON.stringify({ pose, mesh, point: p.toArray(), feet, top, underside, triangle })}`);
        }
      }
    }
  } finally { car.dispose(); }
  return { frames, offRoad, uniqueVisibleCarVertices: car.vertices.length, potentialSlabSamples: tested, minOverhead: Number.isFinite(minOverhead) ? minOverhead : null };
}
function reportedPoses() {
  const hx = -Math.sin(target.yaw), hz = -Math.cos(target.yaw), poses = [];
  for (let distance = 0; distance <= 40; distance += .5) poses.push({ label: `reported +${distance}m`, x: target.x + hx * distance, z: target.z + hz * distance, yaw: target.yaw, required: false });
  return poses;
}
for (const classes of [undefined, ['primary', 'secondary'], ['secondary', 'tertiary'], ['trunk', 'primary']] as ([string, string] | undefined)[]) {
  test(`final emitted complete-car report sweep every 0.5m, including +31m: ${classes?.join('/') ?? 'actual source'}`, t => {
    const world = actualReportedWorld(classes);
    const sweep = fullCarSweep(world, reportedPoses());
    assert.ok(sweep.frames - sweep.offRoad >= 20, 'the actual report heading must enter real road pavement for at least10m');
    t.diagnostic(JSON.stringify(sweep));
    checkBodyClearance(world);
  });
}

function sourcePath(road: RoadEdge, reverse: boolean, limit: number) {
  const points = reverse ? [...road.pts].reverse() : road.pts, poses = []; let distance = 0;
  for (let i = 1; i < points.length && distance < limit; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (!length) continue;
    const steps = Math.ceil(Math.min(length, limit - distance) / .5);
    for (let k = 0; k <= steps; k++) {
      const d = Math.min(length, limit - distance) * k / steps;
      poses.push({ label: `${road.id}${reverse ? ' reverse' : ''} +${(distance + d).toFixed(3)}m`, x: a[0] + dx * d / length, z: a[1] + dz * d / length, yaw: Math.atan2(-dx, -dz), required: true });
    }
    distance += length;
  }
  return poses;
}
test('actual complete visible Roadster clears both genuine Tarnaka fork and bypass continuations', t => {
  const world = actualReportedWorld(), byId = new Map(world.roads.map(e => [e.id, e]));
  const cases: [string, boolean, number][] = [
    ['ad6f78f1-dc9_0', false, 110], ['23427c8c-e37_0', false, 130],
    ['bdf0bad3-182_0', false, 170], ['bdf0bad3-182_0', true, 110],
    ['38a7824d-0e1_0', false, 130], ['38a7824d-0e1_1', false, 50],
    ['37e421d1-548_1', true, 30], ['37e421d1-548_0', true, 100],
  ];
  const failures: { id: string; reverse: boolean; message: string }[] = [];
  for (const [id, reverse, limit] of cases) {
    try { t.diagnostic(JSON.stringify({ id, reverse, ...fullCarSweep(world, sourcePath(byId.get(id)!, reverse, limit)) })); }
    catch (error) { const failure = { id, reverse, message: error instanceof Error ? error.message : String(error) }; failures.push(failure); t.diagnostic(JSON.stringify(failure)); }
  }
  assert.deepEqual(failures, [], 'every reported fork continuation must clear the actual complete car');
});

function clipRoadTriangle(subject: [number, number][], boundary: [number, number][]) {
  const cross = (a: number[], b: number[], p: number[]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const orientation = Math.sign(cross(boundary[0], boundary[1], boundary[2])); if (!orientation) return [];
  for (let edge = 0; edge < 3 && subject.length; edge++) {
    const a = boundary[edge], b = boundary[(edge + 1) % 3], output: [number, number][] = [];
    let previous = subject.at(-1)!, prior = orientation * cross(a, b, previous);
    for (const p of subject) {
      const value = orientation * cross(a, b, p);
      if ((prior >= 0) !== (value >= 0)) { const u = prior / (prior - value); output.push([previous[0] + (p[0] - previous[0]) * u, previous[1] + (p[1] - previous[1]) * u]); }
      if (value >= -1e-8) output.push(p); previous = p; prior = value;
    }
    subject = output;
  }
  return subject;
}
test('the genuine transverse 7db crossing retains 5.85m in every actual finite Float32 asphalt overlap', t => {
  const roads = prepareRoadGrades(core.roads);
  const triangles = ['bdf0bad3-182_0', '7db1eb5a-d98_0'].map(id => {
    const e = { ...roads.find(e => e.id === id)!, ctx: 0 };
    const built = buildTile({ i: 3, j: -3, roads: [e], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
    return built.buffers.filter(b => b.mat === 'road').flatMap(b => Array.from({ length: b.pos.length / 9 }, (_, i) => Array.from(b.pos.slice(i * 9, i * 9 + 9)) as Triangle)).filter(t => Math.max(t[0], t[3], t[6]) > 3630 && Math.min(t[0], t[3], t[6]) < 3680 && Math.max(t[2], t[5], t[8]) > -2300 && Math.min(t[2], t[5], t[8]) < -2240);
  });
  let polygons = 0, samples = 0, minimumGap = Infinity;
  for (const a of triangles[0]) for (const b of triangles[1]) {
    const poly = clipRoadTriangle([[a[0], a[2]], [a[3], a[5]], [a[6], a[8]]], [[b[0], b[2]], [b[3], b[5]], [b[6], b[8]]]);
    if (poly.length < 3 || Math.abs(poly.reduce((n, p, i) => { const q = poly[(i + 1) % poly.length]; return n + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2 < .00001) continue;
    polygons++;
    for (const [x, z] of [...poly, [poly.reduce((n, p) => n + p[0], 0) / poly.length, poly.reduce((n, p) => n + p[1], 0) / poly.length]]) {
      const upper = visibleHeight(a, x, z), lower = visibleHeight(b, x, z); if (upper === null || lower === null) continue;
      const gap = upper - lower; minimumGap = Math.min(minimumGap, gap); samples++;
      assert.ok(gap >= 5.849, `actual finite separate crossing loses clearance ${JSON.stringify({ x, z, upper, lower, gap, a, b })}`);
    }
  }
  assert.ok(polygons > 2 && samples > 10, 'exercise the actual finite crossing, including ribbon corners');
  t.diagnostic(JSON.stringify({ polygons, samples, minimumGap }));
});

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
      if (Math.max(t[0], t[3], t[6]) < 3980 || Math.min(t[0], t[3], t[6]) > 4023 ||
        Math.max(t[2], t[5], t[8]) < -2088 || Math.min(t[2], t[5], t[8]) > -2058) continue;
      (buffer.mat === 'road' ? triangles : solidTriangles).push(t);
    }
  }
  const city: any = { surfaceGrid: surfaces, buildingGrid: new Map(), obstacles: new Map(), walls: new Map(),
    movingRail: [], waterGrid: new Map(), landmarkSurfaceGrid: new Map() };
  assert.ok(triangles.length > 20, 'exercise actual emitted road triangles at the reported tile join');
  const pair = sourceIds.map(id => roads.find(e => e.id === id)!);
  assert.ok(pair.every(Boolean));
  return { city, triangles, solidTriangles, pair };
}

function checkBodyClearance(world: ReturnType<typeof actualReportedWorld>) {
  const hx = -Math.sin(target.yaw), hz = -Math.cos(target.yaw);
  let feet = .05, samples = 0, roadFrames = 0;
  for (let distance = 5; distance <= 32; distance += .5) {
    const x = target.x + hx * distance, z = target.z + hz * distance;
    const center = supportAt(world.city, x, z, feet, true); feet = center.y;
    // The screenshot starts beside the carriageway. Require support wherever
    // actual emitted asphalt is reachable, without inventing a road at +5m.
    if (center.kind === 'road') roadFrames++;
    else assert.ok(!world.triangles.some(t => {
      const y = visibleHeight(t, x, z); return y !== null && Math.abs(y - feet) < .15;
    }), `actual reachable emitted asphalt must support the car at distance${distance}`);
    // Nose/body/tail and both sides of the real car footprint. Local tyre
    // support handles legitimate road slope; a second asphalt plane inside
    // the body remains a physical obstruction even if support chooses lower.
    for (const along of [-2, 0, 2]) for (const side of [-.85, 0, .85]) {
      const px = x + hx * along - hz * side, pz = z + hz * along + hx * side;
      const floor = supportAt(world.city, px, pz, feet, true);
      if (floor.kind !== 'road') continue;
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
  assert.ok(roadFrames >= 20, 'the reported heading must exercise at least10m of actual road support');
  return samples;
}

test('actual Tarnaka report has no intersecting asphalt through the full grounded car at its real merge and tile join', t => {
  const world = actualReportedWorld();
  const shared = [world.pair[0].from, world.pair[0].to].find(node => node && [world.pair[1].from, world.pair[1].to].includes(node));
  assert.equal(shared, 'd6ba3a6d-36c', 'retain the actual local common junction, not a guessed road link');
  t.diagnostic(JSON.stringify({ actualSourceIds: sourceIds, shared, samples: checkBodyClearance(world) }));
});

test('the actual complete visible Roadster does not penetrate the independently rendered road deck and soffit on the reported approach', () => {
  const world = actualReportedWorld(), material = new THREE.MeshBasicMaterial();
  const model = roadster(new Proxy({}, { get: () => material }), { logo: material, plate: material });
  model.group.updateMatrixWorld(true);
  const vertices: { mesh: string; point: THREE.Vector3 }[] = [];
  model.group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    const positions = o.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) vertices.push({ mesh: o.name, point: new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld) });
  });
  try {
    const hx = -Math.sin(target.yaw), hz = -Math.cos(target.yaw), c = Math.cos(target.yaw), s = Math.sin(target.yaw);
    let feet = .05;
    for (let distance = 5; distance <= 30; distance += .5) {
      const x = target.x + hx * distance, z = target.z + hz * distance;
      feet = supportAt(world.city, x, z, feet, true).y;
      if (![18, 20, 24, 28].includes(distance)) continue;
      for (const { mesh, point: local } of vertices) {
        const px = x + c * local.x + s * local.z, py = feet + .55 + local.y, pz = z - s * local.x + c * local.z;
        for (const triangle of world.triangles) {
          const top = visibleHeight(triangle, px, pz);
          if (top === null || top - feet < .45 || py >= top - .02) continue;
          // Require the actual separately emitted soffit too. This is a real
          // drawn slab containing car geometry, not an enclosing height box.
          const underside = world.solidTriangles.map(t => visibleHeight(t, px, pz)).find(y => y !== null && top - y > .85 && top - y < 1.05);
          assert.ok(underside === undefined || underside === null || py <= underside + .02,
            `actual Roadster geometry penetrates independently rendered deck ${JSON.stringify({ distance, mesh, point: [px, py, pz], feet, top, underside, triangle })}`);
        }
      }
    }
  } finally { model.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); material.dispose(); }
});

for (const classes of [['primary', 'secondary'], ['secondary', 'tertiary'], ['trunk', 'primary']] as [string, string][]) {
  test(`the same finite joined-merge body clearance holds for ${classes.join('/')} road classes`, () => {
    checkBodyClearance(actualReportedWorld(classes));
  });
}

test('new joined-approach correction never treats proximity, remote nodes or protected road controls as a real same-level merge', () => {
  const base = { seg: 'review', name: null, cls: 'primary', w: 10, lanes: 2, oneway: null, maxspeed: 40 } as const;
  const ramp: RoadEdge = { ...base, id: 'review-ramp', from: 'local-joint', to: 'ramp-end',
    pts: [[0, 0], [20, 0], [120, 0], [240, 0]], elev: [0, 1.4, 6.8, 6.8] };
  const bypass: RoadEdge = { ...base, id: 'review-bypass', from: 'local-joint', to: 'bypass-end',
    pts: [[0, 0], [20, 2], [80, 25], [200, 50]], elev: null };
  assert.equal(joinedGroundApproaches([ramp, bypass]).report.pairs, 1, 'exercise an eligible finite shallow source merge');
  const variants: [string, RoadEdge, RoadEdge][] = [
    ['nearby but disconnected', ramp, { ...bypass, from: 'another-node' }],
    ['shared graph ID at a remote position', ramp, { ...bypass, pts: bypass.pts.map(([x, z]) => [x + 1000, z]) }],
    ['incompatible source level at the same node', { ...ramp, elev: [6.8, 6.8, 6.8, 6.8] }, bypass],
    ['explicit surveyed profile', { ...ramp, elevationSource: 'surveyed' } as RoadEdge, bypass],
    ['controlled expressway profile', { ...ramp, expressway: { controlled: true, ramp: false, throughLanes: 2, sources: [], sourceDate: 'review', uncertainty: 'control preservation fixture' } }, bypass],
  ];
  for (const [name, a, b] of variants) {
    const snapshot = JSON.stringify([a, b]), result = joinedGroundApproaches([a, b]);
    assert.equal(result.report.pairs, 0, `${name} must not gain an invented flat connection`);
    assert.equal(JSON.stringify([a, b]), snapshot, `${name} source inputs remain unchanged`);
  }
});

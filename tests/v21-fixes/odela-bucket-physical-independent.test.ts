import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { buildTile, pointInRing, type CityData, type TileBuilt } from '../../src/world/city';
import type { CoreData } from '../../src/world/types';
import { prepareRoadGrades, currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';
import { roadster } from '../../src/world/vehicles';
import { RopeBucket } from '../../src/delivery/modules/street-scenes';
import { StoryDirector, stepStoryPose } from '../../src/delivery/systems/story-director';
import { deliveryStoryPoseClear } from '../../src/delivery/runtime';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';

/** Independent physical check. A camera can frame the pizza while its basket
 * floor still cuts through the actual Roadster windscreen. Use rendered
 * triangles and exact drawn panel interiors, not an enclosing vehicle AABB. */
initTemplates();
const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const patches = currentRoadGradePatches(prepareRoadGrades(core.roads)), tiles: TileBuilt[] = [];
const packs = new Map<string, any>();
for (const i of [-2, -1]) {
  const j = -4, key = `${i}_${j}`, pack = core.packs.find(p => p.tiles.some(([x, z]) => x === i && z === j))!;
  let data = packs.get(pack.file);
  if (!data) { data = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()); packs.set(pack.file, data); }
  tiles.push(buildTile({ ...data.tiles[key], roads: applyRoadGradePatches(data.tiles[key].roads, patches) }, { lowQ: true, metro: core.metro }));
}
const merge = (key: 'buildingGrid' | 'surfaceGrid' | 'walls' | 'obstacles') => {
  const result = new Map<string, any[]>();
  for (const tile of tiles) for (const [cell, entries] of tile[key]) result.set(cell, [...(result.get(cell) ?? []), ...entries]);
  return result;
};
const buildingGrid = merge('buildingGrid'), byBuilding = new Map<string, any>();
for (const entries of buildingGrid.values()) for (const b of entries) byBuilding.set(b.id, b);
const city = { buildingGrid, byBuilding, surfaceGrid: merge('surfaceGrid'), walls: merge('walls'), obstacles: merge('obstacles'),
  movingRail: [], waterGrid: new Map(), landmarkSurfaceGrid: new Map() } as unknown as CityData;
// Exact ordinary-registry frontage from frozen19, independently tied to the
// retained packed Paradise building; no fabricated empty-city clearance.
const building = byBuilding.get('5b496a6d-84b')!, a = building.ring.at(-1), b = building.ring[0];
const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
const destination = { x: -1021.3815, y: .02, z: -3917.8625 };
const params = { useExistingFacade: true, roofHeight: building.h - .02, winchAnchorX: -nx * 5.2, winchAnchorZ: -nz * 5.2,
  rooftopActorX: -nx * 6.5 - nz * 1.8, rooftopActorZ: -nz * 6.5 + nx * 1.8,
  rooftopCameraSide: 1, facadeNormalX: nx, facadeNormalZ: nz };
const panels = [
  [0, 0, 0, 4.8, .22, 3.8], [-2.35, .8, 0, .16, 1.7, 3.8], [2.35, .8, 0, .16, 1.7, 3.8],
  [0, .8, -1.82, 4.8, 1.7, .16], [0, .32, 1.82, 4.8, .7, .16],
].map(([x, y, z, w, h, d]) => new THREE.Box3(new THREE.Vector3(x - w / 2 + 1e-5, y - h / 2 + 1e-5, z - d / 2 + 1e-5),
  new THREE.Vector3(x + w / 2 - 1e-5, y + h / 2 - 1e-5, z + d / 2 - 1e-5)));

function fixture(tangent: number, lowered: boolean, initialPose?: Partial<DeliveryPlayer>) {
  const material = new THREE.MeshBasicMaterial(), model = roadster(new Proxy({}, { get: () => material }), { logo: material, plate: material });
  model.group.updateMatrixWorld(true);
  const triangles: THREE.Triangle[] = [];
  model.group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    for (let parent = o.parent; parent; parent = parent.parent) if (!parent.visible) return;
    const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex();
    for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
      const vertices = [0, 1, 2].map(k => {
        const j = index ? index.getX(i + k) : i + k;
        return new THREE.Vector3(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(o.matrixWorld);
      });
      const triangle = new THREE.Triangle(vertices[0], vertices[1], vertices[2]);
      if (triangle.getArea() > 1e-9) triangles.push(triangle);
    }
  });
  const p: DeliveryPlayer = { x: destination.x - nz * tangent, y: destination.y + .55,
    z: destination.z + nx * tangent, yaw: 43 * Math.PI / 180, speed: 0, flying: false, descending: false, jumping: false };
  Object.assign(p, initialPose);
  const module = new RopeBucket(), scene = new THREE.Scene(), director = new StoryDirector();
  const actor = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group(), catchPoint = new THREE.Object3D();
  actor.add(leftArm, rightArm, catchPoint); actor.userData.characterRelease = 'independent-geometry-fixture';
  module.setup({ scene, destination, player: () => p, automaticStories: true, storyActive: () => director.captured,
    canInteract: () => true, emit: type => { if (type === 'done') director.complete(); },
    storyPoseClear: pose => deliveryStoryPoseClear(city, pose, module.supports),
    characterFactory: () => ({ group: actor, leftArm, rightArm, catchPoint, catchPose() {} }) }, params);
  const bucket = scene.getObjectByName('delivery-rope-bucket')!;
  if (lowered) { bucket.position.y = 1.1; (module as any).phase = 'ready'; }
  const transform = new THREE.Matrix4(), world = new THREE.Matrix4(), rotation = new THREE.Quaternion(), sample = new THREE.Triangle();
  const unique = new Map<string, THREE.Vector3>();
  for (const triangle of triangles) for (const v of [triangle.a, triangle.b, triangle.c]) unique.set(v.toArray().join(','), v);
  const cityBuildings = [...byBuilding.values()].filter(b => b.ring.some(([x, z]: number[]) => Math.hypot(x - destination.x, z - destination.z) < 35));
  const buildingIntersections = () => {
    world.compose(new THREE.Vector3(p.x, p.y, p.z), rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1));
    const point = new THREE.Vector3(); let count = 0;
    for (const v of unique.values()) {
      point.copy(v).applyMatrix4(world);
      for (const b of cityBuildings) if (point.y > .01 && point.y < b.h - .01 && pointInRing(point.x, point.z, b.ring)) count++;
    }
    return count;
  };
  const intersections = () => {
    scene.updateMatrixWorld(true);
    world.compose(new THREE.Vector3(p.x, p.y, p.z), rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(1, 1, 1));
    transform.copy(bucket.matrixWorld).invert().multiply(world);
    let count = 0;
    for (const triangle of triangles) {
      sample.copy(triangle); sample.a.applyMatrix4(transform); sample.b.applyMatrix4(transform); sample.c.applyMatrix4(transform);
      if (panels.some(panel => panel.intersectsTriangle(sample))) count++;
    }
    return count;
  };
  const cartonIntersections = () => {
    scene.updateMatrixWorld(true);
    const pizza = scene.getObjectByName('delivery-scene-pizza')!;
    if (!pizza.visible) return 0;
    let count = 0;
    pizza.traverse(o => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const pos = o.geometry.getAttribute('position'), index = o.geometry.getIndex();
      const matrix = new THREE.Matrix4().copy(bucket.matrixWorld).invert().multiply(o.matrixWorld);
      for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
        const points = [0, 1, 2].map(k => {
          const j = index ? index.getX(i + k) : i + k;
          return new THREE.Vector3(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(matrix);
        });
        const triangle = new THREE.Triangle(points[0], points[1], points[2]);
        if (triangle.getArea() > 1e-9 && panels.some(panel => panel.intersectsTriangle(triangle))) count++;
      }
    });
    return count;
  };
  return { module, p, director, intersections, cartonIntersections, buildingIntersections, dispose() {
    module.teardown(); model.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); material.dispose();
  } };
}

for (const [name, tangent, lowered] of [['centered-high-start', 0, false], ['already-low-positive-side', 6, true], ['already-low-negative-side', -12, true]] as const) {
  test(`actual Paradise ${name}: complete Roadster and story approach clear basket and retained alley`, () => {
    const f = fixture(tangent, lowered);
    try {
      for (let frame = 0; frame < 400 && !f.director.viewing; frame++) {
        f.module.update(.05); f.director.tryStart(f.module.story, true);
        assert.equal(f.director.captured, true, 'normal reachable arrival must not silently disable the level');
        const story = f.module.story; assert.ok(story);
        Object.assign(f.p, stepStoryPose(f.p, story, .05));
        // The generic conservative metro-cylinder clearance rejects even the
        // observed clear43-degree initial pose in this narrow alley. Inspect
        // actual visible Roadster vertices against retained building rings;
        // hidden deployed jets must not create false intrusions.
        assert.equal(f.buildingIntersections(), 0, `actual visible Roadster vertices enter retained alley buildings at frame${frame}`);
        assert.equal(f.intersections(), 0, `actual Roadster triangles penetrate drawn basket at frame${frame}`);
        assert.equal(f.cartonIntersections(), 0, `actual pizza carton triangles penetrate drawn basket at frame${frame}`);
        if (f.director.actionReady(.05, f.module.status.canDrop)) f.module.onDrop();
      }
      assert.equal(f.director.viewing, true, 'physical clearance must still complete the bucket lift and retain the view');
    } finally { f.dispose(); }
  });
}

test('actual frozen20 Prepare-only road spawn clears full Roadster, basket and retained alley through the complete automatic approach', t => {
  const start = { x: -1020, y: .55, z: -3932.4, yaw: Math.PI / 2 };
  const f = fixture(0, false, start);
  try {
    assert.equal(f.buildingIntersections(), 0, 'the observed ordinary road spawn must be physically valid before the story starts');
    assert.equal(f.intersections(), 0, 'the high basket initially clears the real road-spawn car');
    let frames = 0;
    for (; frames < 400 && !f.director.viewing; frames++) {
      f.module.update(.05); f.director.tryStart(f.module.story, true);
      assert.equal(f.director.captured, true, 'the legitimate road arrival starts the normal automatic scene');
      const story = f.module.story; assert.ok(story);
      Object.assign(f.p, stepStoryPose(f.p, story, .05));
      assert.equal(f.buildingIntersections(), 0, `full visible Roadster enters a retained building from the actual native road spawn at frame${frames}`);
      assert.equal(f.intersections(), 0, `actual native-spawn Roadster triangles penetrate basket panels at frame${frames}`);
      assert.equal(f.cartonIntersections(), 0, `actual native-spawn carton triangles penetrate basket panels at frame${frames}`);
      if (f.director.actionReady(.05, f.module.status.canDrop)) f.module.onDrop();
    }
    assert.equal(f.director.viewing, true, 'the normal road-spawn approach finishes the real bucket lift and retains the customer');
    assert.ok(Math.hypot(f.p.x + 1021.3374, f.p.z + 3922.5854) < .001, 'match the actual frozen20 parked bay, not a replacement starting fixture');
    const expectedYaw = Math.atan2(-nz, nx) + Math.PI;
    assert.ok(Math.abs(Math.atan2(Math.sin(f.p.yaw - expectedYaw), Math.cos(f.p.yaw - expectedYaw))) < .001, 'native90-degree heading takes the nearest parallel179.5-degree bay heading');
    t.diagnostic(JSON.stringify({ start, end: { ...f.p }, frames, evidence: 'native-paradise-final20 Prepare-only path; no Stage relocation' }));
  } finally { f.dispose(); }
});

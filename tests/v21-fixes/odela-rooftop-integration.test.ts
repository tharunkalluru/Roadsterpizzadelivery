import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findGroundScenePlacement } from '../../src/delivery/scene-placement';
import { RopeBucket } from '../../src/delivery/modules/street-scenes';
import { RoadGraph } from '../../src/game/roadgraph';
import type { CityData } from '../../src/world/city';
import type { Building, RoadEdge, XZ } from '../../src/world/types';
import type { LevelConfig } from '../../src/delivery/core/types';

function placementFixture(ring: XZ[]) {
  const building: Building = { id: 'real-restaurant', name: null, cls: 'building', h: 16.6, hs: 'surveyed', fc: null, rc: null, ring };
  const city: CityData = { group: new THREE.Group(), signs: null, lit: null, glow: null, buildingGrid: new Map(), surfaceGrid: new Map(),
    byBuilding: new Map([[building.id, building]]), obstacles: new Map(), walls: new Map(), waterGrid: new Map(), landmarkSurfaceGrid: new Map(),
    movingRail: [], railwayWalls: [], bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, centroid: () => [-10, 0], signals: [], lamps: [], busStops: [], walkPaths: [] };
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) city.buildingGrid.set(`${x},${z}`, [building]);
  const road: RoadEdge = { id: 'front-street', seg: 'street', name: 'Public street', cls: 'residential', w: 6, lanes: 2, oneway: null,
    from: 'a', to: 'b', pts: [[8, -200], [8, 200]], elev: null, maxspeed: 30 };
  const level: LevelConfig = { id: 'bucket', level: 4, celebrity: { name: 'Customer', movie: 'Scene', image: '/unknown.svg' },
    destination: { x: 0, z: 0, y: 0, label: 'Paradise' }, callMode: 'NONE', revealAt: 'afterDelivery', script: [], module: 'ropeBucket',
    moduleParams: { roofHeight: 15 }, restaurantStage: 'Counter', completionLine: 'Delivered' };
  return { city, building, level, graph: new RoadGraph([road]) };
}
function pointInside(x: number, z: number, ring: XZ[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}

test('Odela placement keeps the entire receiver and real lamp on a concave mapped rooftop at its actual height', () => {
  const f = placementFixture([[-20, -12], [-6, -12], [-6, -3], [-12, -3], [-12, 3], [-6, 3], [-6, 12], [-20, 12]]);
  const result = findGroundScenePlacement(f.city, f.graph, f.level); assert.ok(result);
  const params = result.moduleParams, x = result.destination.x + Number(params.rooftopActorX), z = result.destination.z + Number(params.rooftopActorZ);
  assert.equal(result.reusedBuilding, f.building.id);
  assert.ok(Math.abs(result.destination.y + Number(params.roofHeight) - f.building.h) < 1e-9, 'the receiver feet use the real roof plane, not a floating 0.4m slab');
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    assert.ok(pointInside(x + Math.cos(angle) * .84, z + Math.sin(angle) * .84, f.building.ring), 'complete footprint plus edge margin must lie inside the concave roof');
  }
  const nx = Number(params.facadeNormalX), nz = Number(params.facadeNormalZ), side = Number(params.rooftopCameraSide);
  assert.ok(pointInside(x + nx * 1.6 + nz * side * .4, z + nz * 1.6 - nx * side * .4, f.building.ring), 'the physical lamp must stand on the same roof');
  assert.equal(f.city.byBuilding.size, 1, 'placement never invents a replacement building');
});

test('a narrow real roof cannot receive a hovering celebrity when the complete footprint will not fit', () => {
  const f = placementFixture([[-7.2, -12], [-6, -12], [-6, 12], [-7.2, 12]]);
  assert.equal(findGroundScenePlacement(f.city, f.graph, f.level), null);
});

for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0], [Math.SQRT1_2, Math.SQRT1_2]]) {
  for (const side of [-1, 1]) test(`completed bucket camera clears the actual winch and lamp for facade ${nx},${nz} side ${side}`, () => {
    const scene = new THREE.Scene(), actor = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group(), catchPoint = new THREE.Object3D();
    actor.add(leftArm, rightArm, catchPoint); actor.userData.characterRelease = 'visible-test-fixture';
    const player = { x: 0, y: .55, z: 4, yaw: 0, speed: 0 }, events: string[] = [], module = new RopeBucket();
    const anchorX = -nx * 5.2, anchorZ = -nz * 5.2, actorX = anchorX - nx * 1.3 - nz * side * 1.8, actorZ = anchorZ - nz * 1.3 + nx * side * 1.8;
    module.setup({ scene, destination: { x: 0, y: 0, z: 0 }, player: () => player, emit: type => events.push(type), storyActive: () => true,
      characterFactory: () => ({ group: actor, leftArm, rightArm, catchPoint, catchPose() {} }) },
    { useExistingFacade: true, roofHeight: 15, winchAnchorX: anchorX, winchAnchorZ: anchorZ, facadeNormalX: nx, facadeNormalZ: nz,
      rooftopActorX: actorX, rooftopActorZ: actorZ, rooftopCameraSide: side });
    for (let i = 0; i < 120; i++) module.update(.05);
    module.onDrop(); for (let i = 0; i < 120; i++) module.update(.05);
    assert.equal(events.filter(type => type === 'done').length, 1);
    assert.equal(actor.position.y, 15); assert.equal(actor.rotation.y, Math.atan2(nx, nz));
    const focus = module.cameraFocus!; assert.ok(focus); scene.updateMatrixWorld(true);
    const staticMeshes: THREE.Object3D[] = [];
    scene.traverse(object => { if (object instanceof THREE.Mesh && !object.parent?.userData.characterRelease) staticMeshes.push(object); });
    for (const height of [.15, .95, 1.7]) for (const offset of [-.3, 0, .3]) {
      const to = actor.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-nz * offset, height, nx * offset));
      const direction = to.clone().sub(focus.position), distance = direction.length();
      const ray = new THREE.Raycaster(focus.position, direction.normalize(), .05, distance - .2);
      assert.deepEqual(ray.intersectObjects(staticMeshes, false).map(hit => hit.object.name), [], 'the real frame must not interrupt the character view');
    }
    const lamp = module.sceneLamp!;
    assert.ok(Math.abs(lamp.position.x - (actorX + nx * 1.6 + nz * side * .4)) < 1e-8);
    assert.ok(Math.abs(lamp.position.z - (actorZ + nz * 1.6 - nx * side * .4)) < 1e-8);
    assert.equal(lamp.position.y, 17.7, 'the requested light coincides with the actual fixture glass');
    actor.userData.characterRelease = 'withheld'; assert.equal(module.cameraFocus, undefined); assert.equal(module.sceneLamp, undefined);
    module.teardown();
  });
}

test('voiced rooftop conversation finishes before the basket starts down', () => {
  const scene = new THREE.Scene(), module = new RopeBucket(), actor = new THREE.Group();
  const player = {x: 0, y: .55, z: 4, yaw: 0, speed: 0};
  let active = false, spoken = false;
  module.setup({scene, destination:{x:0,y:0,z:0}, player:()=>player, emit(){}, automaticStories:true,
    storyActive:()=>active, storyDialogueComplete:()=>spoken,
    characterFactory:()=>({group:actor, leftArm:new THREE.Group(), rightArm:new THREE.Group(), catchPose(){}})}, {roofHeight:15});
  const basket=scene.getObjectByName('delivery-rope-bucket')!, height=basket.position.y;
  for(let i=0;i<100;i++)module.update(.05);
  assert.equal(basket.position.y,height);
  active=true;
  for(let i=0;i<100;i++)module.update(.05);
  assert.equal(basket.position.y,height);
  assert.ok(module.sceneLamp);
  assert.equal(module.cameraFocus?.target.y,actor.position.y+1.1);
  spoken=true;
  module.update(.05);
  assert.ok(basket.position.y<height);
  assert.equal(module.sceneLamp,undefined);
  module.teardown();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { buildTile, type CityData, type TileBuilt } from '../../src/world/city';
import type { CoreData } from '../../src/world/types';
import { metroCorridors, metroPlatformAssemblies, projectMetroPath, sampleMetroPath, type MetroPlatformAssembly } from '../../src/world/metro-geometry';
import { prepareRoadGrades, currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';
import { clearCameraPosition, segmentHitsVehicle, staticSolidAt } from '../../src/game/spatial-safety';
import { MetroRide } from '../../src/delivery/modules/metro-ride';
import { supportedMetroHandoffParking } from '../../src/delivery/metro-platform';
import type { DeliveryModuleContext, DeliveryPlayer, DeliveryPoint, ModuleCameraFocus } from '../../src/delivery/modules/types';
import type { MovingRailBody } from '../../src/game/moving-rail';
import type { MetroStationDwell } from '../../src/game/metro';
import { Game } from '../../src/game/game';
import { Player } from '../../src/game/player';
import { deliveryStoryPoseClear } from '../../src/delivery/runtime';

const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const assemblies = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight);
const patches = currentRoadGradePatches(prepareRoadGrades(core.roads));
const packs = new Map<string, any>(), tiles = new Map<string, TileBuilt>();
initTemplates();
function actualCity(a: MetroPlatformAssembly) {
  const i = Math.floor(a.source.p[0] / 1000), j = Math.floor(a.source.p[1] / 1000), key = `${i}_${j}`;
  let tile = tiles.get(key);
  if (!tile) {
    const pack = core.packs.find(p => p.tiles.some(([x, z]) => x === i && z === j))!;
    let data = packs.get(pack.file);
    if (!data) { data = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()); packs.set(pack.file, data); }
    const zone = data.tiles[key];
    tile = buildTile({ ...zone, roads: applyRoadGradePatches(zone.roads, patches) }, { lowQ: true, metro: core.metro });
    tiles.set(key, tile);
  }
  return { ...tile, movingRail: [], byBuilding: new Map(), signs: { update() {} } } as unknown as CityData & Pick<TileBuilt,'buffers'>;
}
function actualDoor(a: MetroPlatformAssembly, direction: -1 | 1, coach = 22.1, offset = 0) {
  const track = a.corridor.tracks.find(t => t.dir === direction)!;
  const stationS = projectMetroPath(track.path, [a.frame.cx, a.frame.cz]).s;
  const q = sampleMetroPath(track.path, stationS + direction * (coach + offset), 8), side = -direction;
  const outward = { x: -q.hz * side, z: q.hx * side };
  return { door: { x: q.x + outward.x * 1.5, y: a.deckHeight + 1.2, z: q.z + outward.z * 1.5, hx: q.hx, hz: q.hz }, outward, q, side };
}
function pathClear(city: CityData, from: DeliveryPoint, to: DeliveryPoint) {
  const clear = clearCameraPosition(city, from, to);
  return Math.hypot(clear.x - to.x, clear.y - to.y, clear.z - to.z) < .01;
}
function fixture(a: MetroPlatformAssembly, direction: -1 | 1, coach = 22.1, offset = 0) {
  const city = actualCity(a), { door, outward, q, side } = actualDoor(a, direction, coach, offset);
  const p: DeliveryPlayer = { x: q.x, y: door.y + 4, z: q.z, yaw:Math.atan2(-q.hx,-q.hz), speed: 0 };
  const body: MovingRailBody = { id: 'metro:actual:1:0', ...q, y: door.y, bottom: door.y, roof: door.y + 3.45, halfLength: 11.05, halfWidth: 1.5, previous: { ...q, y: door.y } };
  const doors=[-22.1,0,22.1].flatMap(coach=>[-6.5,0,6.5].map(offset=>actualDoor(a,direction,coach,offset).door));
  const stop: MetroStationDwell = { trainId: 'metro:actual:1', stationId: a.stationId, lineId: a.lineId, direction, platformSide: side as -1 | 1, elapsed: 1, remaining: 17, doors, platform: a };
  let reads = 0,poseReads=0;const poseFailures:any[]=[];
  const ctx: DeliveryModuleContext = { scene: new THREE.Scene(), destination: { x: door.x, y: door.y, z: door.z }, player: () => p,
    canInteract: () => true, automaticStories: true, storyActive: () => true, emit() {},
    cameraPathClear: (from: DeliveryPoint, to: DeliveryPoint) => { reads++; return pathClear(city, from, to); },
    storyPoseClear: pose=>{poseReads++;const result=deliveryStoryPoseClear(city,pose);if(result!==true)poseFailures.push({pose,result});return result;},
  } as DeliveryModuleContext;
  const module = new MetroRide(); module.setup(ctx, { immersiveHandoff: true });
  const group = ctx.scene.getObjectByName('vakeel-platform-group')!;
  group.children.forEach(actor => actor.userData.characterRelease = 'synthetic-camera-geometry-fixture');
  const planningStart=performance.now();(module as any).beginExit(stop, body);let planningMs=performance.now()-planningStart,maxSliceMs=planningMs,planningFrames=1,maxChecksPerFrame=reads+poseReads;
  for (let frame=0;frame<300&&(module as any).phase!=='handoff';frame++) {
    const preparing=!!(module as any).exitPreparation,before=reads+poseReads,start=performance.now();
    module.update(.05);
    if(preparing){const elapsed=performance.now()-start;planningMs+=elapsed;maxSliceMs=Math.max(maxSliceMs,elapsed);planningFrames++;maxChecksPerFrame=Math.max(maxChecksPerFrame,reads+poseReads-before);}
    const focus=module.cameraFocus;
    if(!focus)continue;
    assert.ok(pathClear(city,focus.target,focus.position),`${a.key}: the moving exit subject must retain the real clear shot`);
    const camera=new THREE.PerspectiveCamera(55,932/430,.1,100);
    camera.position.copy(new THREE.Vector3().copy(focus.position));camera.lookAt(focus.target.x,focus.target.y,focus.target.z);camera.updateMatrixWorld(true);
    group.updateWorldMatrix(true,true);
    for(const actor of group.children){
      const face=actor.localToWorld(new THREE.Vector3(0,1.85,0)),projection=face.clone().project(camera);
      assert.ok(pathClear(city,face,focus.position),`${a.key}: no real support may hide a passenger face during the staggered door exit`);
      assert.ok(Math.abs(projection.x)<.93&&Math.abs(projection.y)<.94&&projection.z>-1&&projection.z<1,`${a.key}: all four exiting heads remain in the landscape frame`);
    }
  }
  const selectedDoor=(module as any).door as typeof door;
  Object.assign(p, module.target, { y: module.target.y + .55, speed: 0, yaw:Math.atan2(-selectedDoor.hx,-selectedDoor.hz) }); module.update(.05);
  return { a, city, module, p, group, door:selectedDoor, outward:(module as any).outward as typeof outward, poseFailures,planningMs,maxSliceMs,planningFrames,maxChecksPerFrame,get reads() { return reads; },get poseReads(){return poseReads;} };
}
function assertWholeGroup(f: ReturnType<typeof fixture>, focus: ModuleCameraFocus) {
  const camera = new THREE.PerspectiveCamera(55, 932 / 430, .1, 100);
  camera.position.copy(new THREE.Vector3().copy(focus.position)); camera.lookAt(focus.target.x, focus.target.y, focus.target.z); camera.updateMatrixWorld(true);
  assert.ok(pathClear(f.city, focus.target, focus.position), 'the host must keep the authored eye instead of entering its short-ray escape fallback');
  assert.equal(staticSolidAt(f.city, focus.position), false, 'the camera volume remains outside real station solids');
  const car = { x: f.p.x, y: f.p.y - .55, z: f.p.z, hx: -Math.sin(f.p.yaw), hz: -Math.cos(f.p.yaw), size: [2.3, 1.75, 4.8] };
  for(const along of [-2.4,2.4])for(const side of [-1.15,1.15])for(const y of [.1,1.6]){
    const point=new THREE.Vector3(car.x+car.hx*along-car.hz*side,car.y+y,car.z+car.hz*along+car.hx*side).project(camera);
    assert.ok(Math.abs(point.x)<.98&&Math.abs(point.y)<.98&&point.z>-1&&point.z<1,`${f.a.key}: the supported parked Roadster also stays inside the landscape frame`);
  }
  const bounds = new THREE.Box3();
  f.group.updateWorldMatrix(true, true);
  for (const actor of f.group.children) for (const y of [.08, .85, 1.85]) {
    const point = actor.localToWorld(new THREE.Vector3(0, y, 0)); bounds.expandByPoint(point);
    const projection = point.clone().project(camera);
    assert.ok(Math.abs(projection.x) < .93 && Math.abs(projection.y) < .94 && projection.z > -1 && projection.z < 1, `${f.a.key}: all four standing bodies fit the actual landscape camera`);
    if (y > .4) {
      assert.ok(pathClear(f.city, point, focus.position), `${f.a.key}: a real station solid must not obscure a passenger body`);
      assert.equal(segmentHitsVehicle(focus.position, point, car, .1), false, 'the parked Roadster cannot hide a passenger');
    }
  }
  assert.ok(bounds.max.y - bounds.min.y > 1.7);
}
function assertRenderedSightlines(f:ReturnType<typeof fixture>,focus:ModuleCameraFocus){
  const eye=new THREE.Vector3().copy(focus.position),points:THREE.Vector3[]=[];
  f.group.updateWorldMatrix(true,true);
  // Thin open stair handrail posts can cross a lower-leg pixel ray without
  // hiding a figure. Check the actually rendered torso and face separately;
  // assertWholeGroup also retains the full feet-to-head screen framing.
  for(const actor of f.group.children)for(const y of [.85,1.85])points.push(actor.localToWorld(new THREE.Vector3(0,y,0)));
  const box=new THREE.Box3().setFromPoints([eye,...points]).expandByScalar(.25),positions:number[]=[];
  box.min.y=f.door.y-.2;
  // Use actual emitted triangle buffers, including pieces absent from the
  // collision grid. Limit only the spatial query, not the geometry itself.
  for(const buffer of f.city.buffers)for(let i=0;i<buffer.pos.length;i+=9){
    const p=buffer.pos;
    if(Math.max(p[i],p[i+3],p[i+6])<box.min.x||Math.min(p[i],p[i+3],p[i+6])>box.max.x||
      Math.max(p[i+1],p[i+4],p[i+7])<box.min.y||Math.min(p[i+1],p[i+4],p[i+7])>box.max.y||
      Math.max(p[i+2],p[i+5],p[i+8])<box.min.z||Math.min(p[i+2],p[i+5],p[i+8])>box.max.z)continue;
    positions.push(...p.slice(i,i+9));
  }
  assert.ok(positions.length>0,'exercise actual nearby station triangles');
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
  for(const point of points){
    const direction=point.clone().sub(eye),distance=direction.length();
    const ray=new THREE.Raycaster(eye,direction.normalize(),.03,distance-.03),hits=ray.intersectObject(mesh);
    assert.equal(hits.length,0,`${f.a.key}: an actually rendered station triangle blocks a standing body ${JSON.stringify({point:point.toArray(),eye:eye.toArray(),hit:hits[0]?.point.toArray(),triangle:hits[0]?.faceIndex!==undefined?positions.slice(hits[0].faceIndex*9,hits[0].faceIndex*9+9):[],door:f.door,outward:f.outward})}`);
  }
  geometry.dispose();material.dispose();
}

test('the exact native Ameerpet Blue held shot avoids the actual upper interchange pier and preserves the real Game camera', () => {
  const a = assemblies.find(a => a.key === 'st_ameerpet:blue')!, f = fixture(a, -1);
  const original=actualDoor(a,-1),oldParking=supportedMetroHandoffParking(a,original.door,original.outward)!;
  assert.ok(Math.hypot(oldParking.x + 5534.4, oldParking.z + 3221.9) < .03, 'reproduce the actual native held Roadster position from the exact original door');
  assert.equal((f.module as any).phase,'handoff',`a clear adjacent actual door remains available at this same station ${JSON.stringify(f.poseFailures.slice(0,10))}`);
  assert.ok(Math.hypot(f.door.x-original.door.x,f.door.z-original.door.z)>6,'reject the obstructed door instead of weakening the real support collider');
  assert.ok([-22.1,0,22.1].some(coach=>[-6.5,0,6.5].some(offset=>{
    const actual=actualDoor(a,-1,coach,offset).door;return Math.hypot(actual.x-f.door.x,actual.z-f.door.z)<.001;
  })),'the replacement is an actual existing door on the same marked rake');
  const oldTarget = { x: -5531.480122201951, y: 14.75, z: -3218.074183408816 };
  const oldEye = { x: -5530.942850885131, y: 15.35, z: -3214.5299853990937 };
  const oldClear = clearCameraPosition(f.city, oldTarget, oldEye);
  assert.ok(Math.hypot(oldClear.x + 5527.5, oldClear.y - 17.2, oldClear.z + 3218.7) < .08, 'retain the exact source-based reproduction of the old native failure');
  assertWholeGroup(f, f.module.cameraFocus!);
  assertRenderedSightlines(f,f.module.cameraFocus!);
  const player = Object.assign(Object.create(Player.prototype), { pos: new THREE.Vector3(f.p.x, f.p.y, f.p.z), yaw: Math.atan2(-f.door.hx, -f.door.hz), speed: 0, lastSupport: f.door.y, placementRevision: 0, flying: false, descending: false, jumpActive: false, bump: 0 });
  const g: any = Object.assign(Object.create(Game.prototype), { player, cameraPlacementRevision: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), orbitYaw: 1.2, orbitPitch: .9, orbitDist: 3, airOrbitPitch: .62, airOrbitDist: 0, dragging: true,
    city: f.city, story: { cinematic: true, supports: f.module.supports, cameraFocus: f.module.cameraFocus }, engine: { camera: new THREE.PerspectiveCamera(60, 932 / 430, .1, 900), placeSun() {} }, traffic: { hideNear() {} }, placeLampLights() {} });
  g.updateCamera(0);
  assert.ok(g.engine.camera.position.distanceTo(new THREE.Vector3().copy(f.module.cameraFocus!.position)) < .01, 'actual production Game clearance must retain the entire scene-aware shot');
  assert.ok(g.camLook.distanceTo(new THREE.Vector3().copy(f.module.cameraFocus!.target)) < .01);
  f.module.teardown();
});

test('real curved and interchange platforms retain clear four-person framing in both travel directions without per-frame probing',t=>{
  const selected=assemblies.filter(a=>['st_ameerpet','st_mahatma_gandhi_bus_station','st_parade_grounds','st_hitec_city','st_madhapur'].includes(a.stationId));
  assert.ok(selected.length>=6,'include actual separate platforms on multiple-line interchanges');
  let shots=0;const diagnostics:any[]=[];
  for(const a of selected)for(const direction of [-1,1] as const)for(const coach of [-22.1,22.1]){
    const f=fixture(a,direction,coach);
    assert.equal((f.module as any).phase,'handoff',`${a.key}/${direction}/${coach}: a genuine door must provide a supported clear scene`);
    const focus=f.module.cameraFocus!;assert.ok(focus,`${a.key}: real arrived actors need a held camera`);
    assertWholeGroup(f,focus);assertRenderedSightlines(f,focus);
    const reads=f.reads,poseReads=f.poseReads;
    for(let i=0;i<120;i++){f.module.update(.05);assert.ok(f.module.cameraFocus);}
    assert.equal(f.reads,reads,'the chosen static shot is reused through exit and held animation, not recalculated every frame');
    assert.equal(f.poseReads,poseReads,'the physically checked approach is not searched again during animation or held viewing');
    assert.ok(f.maxChecksPerFrame<=4,'cold planning work is staged with at most four actual clearance calls per frame');
    diagnostics.push({station:a.key,direction,coach,along:(f.module as any).focusAlong,across:(f.module as any).focusOutward,reads,poseReads,planningMs:f.planningMs,maxSliceMs:f.maxSliceMs,planningFrames:f.planningFrames,maxChecksPerFrame:f.maxChecksPerFrame});
    f.module.teardown();shots++;
  }
  t.diagnostic(JSON.stringify({shots,choices:diagnostics}));
});

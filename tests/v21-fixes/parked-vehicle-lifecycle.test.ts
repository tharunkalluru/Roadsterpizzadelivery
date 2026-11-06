import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../../src/world/world';
import { initTemplates } from '../../src/core/util';
import type { ParkedVehicleSite } from '../../src/world/parked-vehicles';
initTemplates({rbox:new THREE.BoxGeometry(1,1,1),ring:new THREE.RingGeometry(1,1.35,20)});
function fixture() {
  const material=new THREE.MeshBasicMaterial();
  const world:any=Object.assign(Object.create(World.prototype),{
    group:new THREE.Group(),tiles:new Map(),groundGeo:new THREE.PlaneGeometry(1000,1000),mats:{ground:material,st:material},
    buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),byBuilding:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map(),activity:new Map(),rails:new Map(),
    lamps:[],signals:[],busStops:[],walkPaths:[],signs:{add(){},remove(){}},onTileAdded(){},onTileRemoved(){},
  });
  const site:ParkedVehicleSite={id:'bike',kind:'bike',x:10,y:0,z:10,yaw:0,color:'#b3262b'};
  const tile=()=>({key:'0_0',i:0,j:0,buffers:[],roads:[],parkedVehicles:[site],buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),signs:[],lamps:[],signals:[],busStops:[],walkPaths:[],rails:[],activity:[]});
  return {world,tile,dispose(){for(const t of [...world.tiles.values()])world.unload(t);world.groundGeo.dispose();material.dispose();}};
}
test('prototype preview initialization, moving near cells, culling bounds and disposal use real World lifecycle',()=>{
  const f=fixture(),w=f.world;try {
    assert.deepEqual(w.parkedVehiclesNear(10,10,2),[]);
    w.add(f.tile());const body=w.parkedVehiclesNear(10,10,2)[0];assert.ok(body);
    let mesh!:THREE.InstancedMesh;w.tiles.get('0_0').group.traverse((o:any)=>{if(o.isInstancedMesh)mesh=o;});
    assert.equal(mesh.frustumCulled,true);assert.ok(mesh.boundingSphere);
    body.x=1200;body.y=8;body.pitch=.7;body.sync();
    assert.equal(w.parkedVehiclesNear(10,10,2).length,0);assert.equal(w.parkedVehiclesNear(1200,10,2)[0],body);
    const matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[12]-1200)<1e-6);
    const sphere=mesh.geometry.boundingSphere!.clone().applyMatrix4(matrix);
    assert.ok(mesh.boundingSphere!.center.distanceTo(sphere.center)+sphere.radius<=mesh.boundingSphere!.radius+1e-6,'moved geometry stays inside culled bound');
    let disposed=false;mesh.addEventListener('dispose',()=>disposed=true);
    w.unload(w.tiles.get('0_0'));assert.equal(disposed,true);assert.equal(body.loaded,false);assert.equal(w.parkedVehiclesNear(1200,10,2).length,0);assert.equal(w.parkedGrid.size,0);
    assert.equal(w.parkedPoses.size,0,'unchanged last ground does not consume persistence');
    w.add(f.tile());const restored=w.parkedVehiclesNear(10,10,2)[0];assert.equal(restored.y,0);assert.equal(restored.pitch,0,'unload during kick restores ground, never airborne pitch');
  } finally {f.dispose();}
});
test('only changed supported poses survive streaming, including validated planned landings',()=>{
  const f=fixture(),w=f.world;try {
    w.add(f.tile());const body=w.parkedVehicles[0];
    body.settledPose={x:66,y:.25,z:30,hx:1,hz:0,pitch:.1};
    body.x=45;body.y=9;body.z=20;body.pitch=-.8;body.sync();
    w.unload(w.tiles.get('0_0'));assert.equal(w.parkedPoses.size,1);
    w.add(f.tile());const restored=w.parkedVehiclesNear(66,30,2)[0];
    assert.ok(restored);assert.equal(restored.y,.25);assert.equal(restored.pitch,.1);assert.equal(restored.hx,1);assert.equal(w.parkedVehiclesNear(10,10,2).length,0);
    restored.x=70;restored.y=0;restored.pitch=0;restored.settledPose={x:70,y:0,z:30,hx:1,hz:0,pitch:0};restored.sync();
    w.unload(w.tiles.get('0_0'));w.add(f.tile());assert.equal(w.parkedVehiclesNear(70,30,2)[0].x,70);
  } finally {f.dispose();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';
import { staticSolidAt,clearCameraPosition,type CameraCollisionOptions } from '../../src/game/spatial-safety';

test('delivery camera sees the real container roof and walls while retaining its clear interior view',()=>{
  const scene=new THREE.Scene(),module=new TruckInterior();
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:1000}],player:()=>({x:.55,y:2.1,z:0,yaw:Math.PI,speed:0}),canInteract:()=>false,emit(){}},{});module.update(0);
  const city:any={surfaceGrid:new Map(),buildingGrid:new Map(),obstacles:new Map(),walls:new Map(),movingRail:[]},options:CameraCollisionOptions={deliverySolids:module.supports};
  const pivot={x:.55,y:3,z:0},wanted={x:.55,y:7,z:-4},roof=module.supports.find(b=>b.id==='delivery-interior-roof')!;
  assert.equal(staticSolidAt(city,pivot,.35,.35,options),false,'usable space inside stays clear');
  assert.equal(staticSolidAt(city,{x:0,y:roof.bottom+.05,z:0},.35,.35,options),true,'the visible roof slab blocks the camera');
  assert.equal(staticSolidAt(city,{x:2.9,y:3,z:0},.35,.35,options),true,'thick container sides block the camera');
  const clipped=clearCameraPosition(city,pivot,wanted,options);assert.ok(clipped.y<roof.bottom-.3);assert.equal(staticSolidAt(city,clipped,.35,.35,options),false);
  const inside={x:.55,y:3.7,z:-3};assert.deepEqual(clearCameraPosition(city,pivot,inside,options),inside,'short interior view is not pushed outside the container');
  assert.deepEqual(clearCameraPosition(city,pivot,wanted),wanted,'ordinary baseline camera ignores delivery-only solids without the explicit context');
  module.teardown();
});

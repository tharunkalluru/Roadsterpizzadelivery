import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MatchAndLand } from '../../src/delivery/modules/match-and-land';
import type { DeliveryModuleContext } from '../../src/delivery/modules/types';

function setup(interior:boolean){
  const scene=new THREE.Scene();let unlocked=false;
  const ctx:DeliveryModuleContext={scene,destination:{x:100,y:3,z:200},
    player:()=>({x:100,y:3.55,z:190,yaw:0,speed:0}),canInteract:()=>unlocked,emit:()=>{},
    route:[{x:100,y:3,z:200},{x:400,y:9,z:600}]};
  const module=new MatchAndLand();module.setup(ctx,interior?{scene:'truckInterior',speed:6}:{vehicle:'truck',speed:6});
  return{module,scene,unlock:()=>{unlocked=true;}};
}

function checkLenses(scene:THREE.Scene,interior=true){
  scene.updateMatrixWorld(true);
  for(const [name,sign] of [['delivery-truck-headlights',1],['delivery-truck-tail-lights',-1]] as const){
    const lamps=scene.getObjectByName(interior?name:'delivery-truck-open-window-cab') as THREE.InstancedMesh;
    assert.ok(lamps?.isMesh);
    if(interior){assert.ok(lamps.isInstancedMesh);assert.equal(lamps.count,2);}
    const material=lamps.material as THREE.MeshBasicMaterial;
    assert.equal(material.isMeshBasicMaterial,true);assert.equal(material.toneMapped,false);
    for(let i=0;i<2;i++){
      const instance=new THREE.Matrix4();
      if(interior)lamps.getMatrixAt(i,instance);
      else instance.makeTranslation((i?1:-1)*(sign>0?1.25:1.55),sign>0?1.35:.95,sign>0?5.62:-5.36);
      const center=new THREE.Vector3().setFromMatrixPosition(instance).applyMatrix4(lamps.matrixWorld);
      const outward=new THREE.Vector3(0,0,sign).transformDirection(lamps.matrixWorld);
      const ray=new THREE.Raycaster(center.clone().addScaledVector(outward,4),outward.negate(),0,5);
      const hit=ray.intersectObject(lamps.parent!,true).find(h=>h.object.visible);
      assert.equal(hit?.object,lamps,`${name} lens ${i} must remain outside truck skin and folded door`);
      const color=interior?material.color:new THREE.Color().fromBufferAttribute(lamps.geometry.getAttribute('color'),hit!.face!.a);
      if(sign<0){assert.ok(color.r>.9);assert.ok(color.g<.05);assert.ok(color.b<.06);}
      else assert.ok(color.r>.8&&color.g>.8&&color.b>.6);
    }
  }
  let lightCount=0;scene.traverse(node=>{if(node instanceof THREE.Light)lightCount++;});
  assert.equal(lightCount,0,'setpiece lenses add no real-time lighting cost');
}

test('both delivery trucks have exposed forward white and rear red lenses that follow their moving graded route',()=>{
  for(const interior of [true,false]){
    const f=setup(interior);checkLenses(f.scene,interior);
    for(let i=0;i<50;i++)f.module.update(.05);
    checkLenses(f.scene,interior);f.module.teardown();assert.equal(f.scene.children.length,0);
  }
});

test('interior truck rear lenses stay exposed when the entry ramp fully opens and are disposed with the scene',()=>{
  const f=setup(true);f.unlock();
  for(let i=0;i<40;i++)f.module.update(.05);
  checkLenses(f.scene);assert.ok(f.module.supports.some(body=>body.id==='delivery-interior-ramp'));
  const resources=new Set<THREE.BufferGeometry|THREE.Material>();let disposals=0;
  for(const name of ['delivery-truck-headlights','delivery-truck-tail-lights']){
    const mesh=f.scene.getObjectByName(name) as THREE.InstancedMesh;
    resources.add(mesh.geometry);resources.add(mesh.material as THREE.Material);
  }
  for(const resource of resources)resource.addEventListener('dispose',()=>disposals++);
  f.module.teardown();f.module.teardown();assert.equal(disposals,resources.size);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import assets from '../../src/delivery/art/character-assets.json';
import {pickFaceAnnotation,validFaceAnnotation}from '../../src/delivery/art/face-annotations';
import {createMouthPerformance}from '../../src/delivery/art/actor-performance';

function fixture(){const root=new THREE.Group(),head=new THREE.Object3D();head.name='Head';head.position.y=1.6;root.add(head);
  const geometry=new THREE.PlaneGeometry(.18,.18,24,24);geometry.translate(0,1.6,.1);const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.name='ExplicitStaticFace';root.add(mesh);
  root.userData.releasedCharacter={identity:'arundhati',glbSha256:assets.assets.find(a=>a.characterId==='arundhati')!.glb.sha256};root.updateWorldMatrix(true,true);
  const hit=new THREE.Raycaster(new THREE.Vector3(0,1.6,1),new THREE.Vector3(0,0,-1)).intersectObject(mesh)[0];
  return{root,mesh,head,annotation:pickFaceAnnotation(root,'arundhati',hit)};
}
test('native surface pick binds a sparse actual lip region even on the static Arundhati model class',()=>{
  const f=fixture(),a=f.annotation;assert.ok(a.mask.length>=4&&a.mask.length<100);assert.equal(a.meshName,'ExplicitStaticFace');assert.deepEqual(a.nodePath,[1]);
  assert.equal(validFaceAnnotation(f.root,a,'arundhati'),false,'a pick alone is not production approval');
  assert.equal(validFaceAnnotation(f.root,a,'arundhati',true),true);a.review.status='approved';assert.equal(validFaceAnnotation(f.root,a,'arundhati'),true);
  const resources={geometry:<T extends THREE.BufferGeometry>(g:T)=>g,material(){}};assert.equal(createMouthPerformance(f.root,resources),null,'there is no proportional-head fallback');
  const mouth=createMouthPerformance(f.root,resources,a)!;assert.ok(mouth);assert.ok(mouth.point.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,1.6,.1))<1e-6);
  const original=f.mesh.geometry.getAttribute('position').getY(a.mask[0].index);mouth.set(1);mouth.dispose();assert.equal(f.mesh.geometry.getAttribute('position').getY(a.mask[0].index),original);
});
test('changed source SHA, mesh, count, vertex indices, review or malformed annotations fail closed',()=>{
  const f=fixture();f.annotation.review.status='approved';
  for(const change of [a=>a.glbSha256='0'.repeat(64),a=>a.meshName='Wrong',a=>a.positionCount++,a=>a.mask[0].index=-1,
    a=>a.nodePath=undefined,a=>a.sourceTriangle.barycentric=[0,0,0],a=>a.mask[0].weight=NaN,a=>a.mask.push({...a.mask[0]}),a=>a.review.status='picked',
    a=>a.sourceTriangle.indices=[0,0,0],a=>a.anchorHeadLocal[1]+=.03,a=>a.mask[0].index=0]){
    const a=structuredClone(f.annotation);change(a);assert.equal(validFaceAnnotation(f.root,a,'arundhati'),false);
  }
});

test('explicit head-local pick follows a turned and tilted actual head with the original bounded mask',()=>{
  const root=new THREE.Group(),head=new THREE.Object3D();head.name='Head';head.position.set(.04,1.6,-.02);
  head.rotation.set(.12,Math.PI/2,.18);root.add(head);
  const geometry=new THREE.PlaneGeometry(.18,.18,48,48);
  // A real face surface twenty centimetres forward from the head pivot. A
  // quarter-turn puts it outside the legacy actor-X face box without changing
  // its anatomical head-local location or making the allowed box any larger.
  geometry.translate(0,-.025,.20);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.name='ExplicitTurnedFace';head.add(mesh);
  const identity='arundhati',sha=assets.assets.find(a=>a.characterId===identity)!.glb.sha256;
  root.userData.releasedCharacter={identity,glbSha256:sha};root.updateWorldMatrix(true,true);
  const lip=head.localToWorld(new THREE.Vector3(0,-.025,.20)),normal=new THREE.Vector3(0,0,1).transformDirection(head.matrixWorld);
  const hit=new THREE.Raycaster(lip.clone().addScaledVector(normal,1),normal.clone().negate()).intersectObject(mesh)[0];assert.ok(hit);
  assert.throws(()=>pickFaceAnnotation(root,identity,hit),/must be on the face/,'legacy rules remain unchanged');
  const annotation=pickFaceAnnotation(root,identity,hit,'head-local');assert.equal(annotation.coordinateSpace,'head-local');
  assert.ok(annotation.mask.length>=4&&annotation.mask.length<250);
  assert.equal(validFaceAnnotation(root,annotation,identity,true),true);
  annotation.review.status='approved';assert.equal(validFaceAnnotation(root,annotation,identity),true);
  const resources={geometry:<T extends THREE.BufferGeometry>(g:T)=>g,material(){}};
  const mouth=createMouthPerformance(root,resources,annotation)!;assert.ok(mouth);
  const entry=annotation.mask.find(e=>e.lower)!;const original=mesh.geometry.getAttribute('position')as THREE.BufferAttribute;
  const before=new THREE.Vector3().fromBufferAttribute(original,entry.index);mouth.set(1);
  const after=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position')as THREE.BufferAttribute,entry.index);
  assert.ok(after.y<before.y&&Math.abs(after.x-before.x)<1e-7&&Math.abs(after.z-before.z)<1e-7,'deformation follows actual head up, not actor/root sideways');
  mouth.dispose();
  for(const change of [a=>delete a.coordinateSpace,a=>a.coordinateSpace='world',a=>a.headNode='ExplicitTurnedFace',a=>a.mask.reduce((best,e)=>e.weight>best.weight?e:best).weight*=.1,a=>a.sourceTriangle.indices.reverse(),a=>a.displacementUp=[1,0,0],a=>a.glbSha256='0'.repeat(64)]){
    const bad=structuredClone(annotation);change(bad);assert.equal(validFaceAnnotation(root,bad,identity),false,'tag, native triangle, weight, direction and identity tampering fail closed');
  }
});

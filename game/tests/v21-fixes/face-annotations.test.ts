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

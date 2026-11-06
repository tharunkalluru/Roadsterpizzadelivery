import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMouthPerformance, installActorPerformance, solveHandTarget } from '../../src/delivery/art/actor-performance';
import type { SceneCharacter } from '../../src/delivery/modules/character';
import {pickFaceAnnotation} from '../../src/delivery/art/face-annotations';
import assets from '../../src/delivery/art/character-assets.json';

function fixture(identity='jessie'){
  const group=new THREE.Group();group.name='ReviewedCharacterScene';
  const head=new THREE.Bone();head.name='Head';head.position.y=1.5;group.add(head);
  for(const [side,sign]of [['Left',1],['Right',-1]]as const){
    const arm=new THREE.Bone();arm.name=`${side}Arm`;arm.position.set(sign*.25,1.4,0);group.add(arm);
    const fore=new THREE.Bone();fore.name=`${side}ForeArm`;fore.position.y=-.28;arm.add(fore);
    const hand=new THREE.Bone();hand.name=`${side}Hand`;hand.position.y=-.25;fore.add(hand);
  }
  const geometry=new THREE.PlaneGeometry(.17,.336,10,24);geometry.translate(0,1.648,.11);
  const count=geometry.getAttribute('position').count,weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.computeBoundingSphere();
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());mesh.name='Face';group.add(mesh);group.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([head]));mesh.computeBoundingSphere();
  const ownedGeometry:THREE.BufferGeometry[]=[],ownedMaterial:THREE.Material[]=[],resources={geometry:<T extends THREE.BufferGeometry>(g:T)=>{ownedGeometry.push(g);return g;},material:(_:string,m:THREE.Material)=>{ownedMaterial.push(m);}};
  const actor:SceneCharacter={group,leftArm:group.getObjectByName('LeftArm')as THREE.Group,rightArm:group.getObjectByName('RightArm')as THREE.Group,catchPose(){},animate(){}};
  const glbSha256=assets.assets.find(asset=>asset.characterId===identity)?.glb.sha256??assets.assets[0].glb.sha256;
  group.userData.releasedCharacter={identity,glbSha256};
  const hit=new THREE.Raycaster(new THREE.Vector3(0,1.64,1),new THREE.Vector3(0,0,-1)).intersectObject(mesh)[0];
  const annotation=pickFaceAnnotation(group,identity,hit);annotation.review.status='approved';
  return {identity,group,head,geometry,mesh,resources,actor,ownedGeometry,ownedMaterial,annotation};
}

test('mouth is silent by default, sparse and clone-owned, bounded to eight millimetres and exactly resettable',()=>{
  const f=fixture(),original=Array.from(f.geometry.getAttribute('position').array),mouth=createMouthPerformance(f.group,f.resources,f.annotation)!;
  assert.ok(mouth.vertices>0&&mouth.vertices<original.length/3/3);assert.ok(mouth.bytes>0);
  assert.notEqual(f.mesh.geometry,f.geometry);assert.notEqual(f.mesh.geometry.getAttribute('position'),f.geometry.getAttribute('position'));
  assert.equal(f.mesh.geometry.getAttribute('skinWeight'),f.geometry.getAttribute('skinWeight'),'all immutable attributes are shared');
  mouth.set(1);let maximum=0,changed=0;
  const actual=f.mesh.geometry.getAttribute('position');for(let i=0;i<actual.count;i++){
    const delta=Math.hypot(actual.getX(i)-original[i*3],actual.getY(i)-original[i*3+1],actual.getZ(i)-original[i*3+2]);maximum=Math.max(maximum,delta);if(delta>1e-7)changed++;
  }
  assert.ok(changed>0&&changed<=mouth.vertices);assert.ok(maximum<=.0080001&&maximum>.001);
  assert.deepEqual(Array.from(f.geometry.getAttribute('position').array),original,'the released template is untouched');
  mouth.set(NaN);assert.deepEqual(Array.from(actual.array),original);mouth.set(1);mouth.dispose();mouth.dispose();assert.deepEqual(Array.from(actual.array),original);
});

test('hand target solver preserves bone lengths and moves an existing palm toward a reachable target',()=>{
  const f=fixture(),target=new THREE.Vector3(-.05,1.15,.25),hand=f.group.getObjectByName('RightHand')!,palm=()=>new THREE.Vector3(0,.035,0).applyMatrix4(hand.matrixWorld);
  const positions=['RightArm','RightForeArm','RightHand'].map(name=>f.group.getObjectByName(name)!.position.toArray());
  const before=palm().distanceTo(target);assert.equal(solveHandTarget(f.group,'Right',target,12),true);
  assert.ok(palm().distanceTo(target)<.025);assert.ok(palm().distanceTo(target)<before/10);
  assert.deepEqual(['RightArm','RightForeArm','RightHand'].map(name=>f.group.getObjectByName(name)!.position.toArray()),positions);
});

test('wrist orientation is retained during CCD so fingertips point under the pizza rather than across the eyes',()=>{
  const f=fixture(),hand=f.group.getObjectByName('RightHand')!,target=new THREE.Vector3(-.05,1.20,.30);
  const palmUp=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  assert.equal(solveHandTarget(f.group,'Right',target,12,palmUp),true);
  const fingerDirection=new THREE.Vector3(0,1,0).transformDirection(hand.matrixWorld),normal=new THREE.Vector3(0,0,1).transformDirection(hand.matrixWorld);
  assert.ok(fingerDirection.dot(new THREE.Vector3(0,0,-1))>.9999);
  assert.ok(normal.dot(new THREE.Vector3(0,1,0))>.9999);
  assert.ok(new THREE.Vector3(0,.035,0).applyMatrix4(hand.matrixWorld).distanceTo(target)<.02);
});

test('receipt opens an actual lid, carries the slice to the face, chews, and retains the box through the completed viewing phase',()=>{
  const f=fixture(),source=Array.from(f.geometry.getAttribute('position').array),performance=installActorPerformance(f.actor,'jessie',f.resources,f.annotation);
  for(let i=0;i<30;i++)f.actor.animate!(1/30,'idle');
  assert.equal(f.group.userData.deliveryPerformance.mouth,0);assert.equal(f.group.getObjectByName('received-pizza-openable-carton')!.visible,false);
  assert.equal(f.actor.receivePizza!(),true);assert.equal(f.actor.receivePizza!(),false);
  for(let i=0;i<96;i++)f.actor.animate!(1/30,'idle');
  const carton=f.group.getObjectByName('received-pizza-openable-carton')!,lid=f.group.getObjectByName('received-carton-lid')!,slice=f.group.getObjectByName('received-pizza-slice')!;
  assert.equal(carton.visible,true);assert.ok(lid.rotation.x<-1.4);assert.equal(slice.visible,true);assert.equal(f.group.userData.deliveryPerformance.phase,'eating');assert.ok(f.group.userData.deliveryPerformance.mouth>.2);
  for(let i=0;i<120;i++)f.actor.animate!(1/30,'idle');
  assert.equal(f.group.userData.deliveryPerformance.phase,'enjoying');assert.equal(slice.visible,false);assert.equal(carton.visible,true);assert.equal(f.group.userData.deliveryPerformance.mouth,0);
  assert.equal(f.group.userData.deliveryPerformance.time,6);assert.deepEqual(Array.from(f.geometry.getAttribute('position').array),source);
  f.actor.setSpeechEnvelope!(1);f.actor.animate!(.1,'idle');assert.ok(f.group.userData.deliveryPerformance.mouth>.9);
  f.actor.setSpeechEnvelope!(0);for(let i=0;i<20;i++)f.actor.animate!(.1,'idle');assert.equal(f.group.userData.deliveryPerformance.mouth,0);
  performance.dispose();performance.dispose();assert.equal(carton.parent,null);assert.equal(slice.parent,null);assert.equal(f.group.userData.deliveryPerformance,undefined);
});

test('special two-hand scenes and non-recipients never acquire an eating prop',()=>{
  for(const identity of ['devara','arundhati','prabhas-salaar','vakeel-woman-1']){
    const f=fixture(identity),performance=installActorPerformance(f.actor,identity,f.resources,f.annotation);
    assert.equal(f.actor.receivePizza!(),false,identity);f.actor.animate!(.1,'idle');assert.equal(f.group.getObjectByName('received-pizza-openable-carton'),undefined);performance.dispose();
  }
});

test('completed handoff relinquishes authored catch before meal calibration and late catch fades cannot re-own its hands',()=>{
  const f=fixture(),calls:number[]=[];f.actor.catchPose=amount=>calls.push(amount);
  const performance=installActorPerformance(f.actor,'jessie',f.resources,f.annotation);
  f.actor.catchPose(.8);assert.deepEqual(calls,[.8],'unreceived authored catch remains intact');
  assert.equal(f.actor.receivePizza!(),true);assert.deepEqual(calls,[.8,0],'calibration starts on the post-catch surface');
  for(const amount of [1,.8,.5,.1,0]){f.actor.catchPose(amount);f.actor.animate!(.05,'read',0);}
  assert.deepEqual(calls,[.8,0],'a host completion fade cannot restore the old catch clip over the received support');
  assert.equal(f.group.getObjectByName('received-pizza-openable-carton')!.visible,true);performance.dispose();
});

test('the edible slice tip approaches the lips while the crust and palm stay outside the face',()=>{
  const f=fixture(),performance=installActorPerformance(f.actor,'jessie',f.resources,f.annotation);f.actor.receivePizza!();
  for(let i=0;i<96;i++)f.actor.animate!(1/30,'idle');
  const mouth=f.group.getObjectByName('delivery-mouth-anchor')!.getWorldPosition(new THREE.Vector3());
  const slice=f.group.getObjectByName('received-pizza-slice')!,tip=slice.localToWorld(new THREE.Vector3(0,0,.13));
  assert.ok(tip.distanceTo(mouth)<.035,'measure the actual tip, not the palm or slice origin');
  const point=new THREE.Vector3();let nearest=Infinity;
  slice.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const p=node.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);nearest=Math.min(nearest,point.z-mouth.z);}});
  assert.ok(nearest>=.002,'no held pizza geometry passes behind the lip plane');
  const oldTip=new THREE.Vector3(0,0,.13).applyEuler(new THREE.Euler(-.3,0,0)).add(new THREE.Vector3(0,-.018,.008));
  assert.ok(oldTip.length()>.12,'negative control: centre-only aiming misses the edible tip');
  performance.dispose();
});

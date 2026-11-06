import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CinematicVenue} from '../../src/delivery/modules/cinematic-venues';
import {bindCinematicProp} from '../../src/delivery/modules/cinematic-prop-anchors';
const actor=()=>{const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();group.add(leftArm,rightArm);return {group,leftArm,rightArm,catchPose(){}};};
test('film props follow a genuine authored wrist anchor through character movement and wrist rotation',()=>{
 const a=actor(),hand=new THREE.Bone(),anchor=new THREE.Object3D(),prop=new THREE.Group();hand.name='LeftHand';anchor.name='PropBottle';anchor.position.set(.02,.06,.03);hand.add(anchor);a.group.add(hand);
 assert.equal(bindCinematicProp(a,prop,'bottle'),true);assert.equal(prop.parent,anchor);a.group.position.set(5,0,7);hand.position.set(.2,1.1,0);hand.rotation.z=Math.PI/2;a.group.updateWorldMatrix(true,true);
 const actual=prop.getWorldPosition(new THREE.Vector3()),expected=anchor.getWorldPosition(new THREE.Vector3());assert.ok(actual.distanceTo(expected)<1e-8);assert.equal(prop.visible,true);
});
test('upper-arm, pizza catch and root props cannot impersonate a phone wrist anchor',()=>{
 const a=actor(),fake=new THREE.Object3D(),prop=new THREE.Group();fake.name='PropPhone';a.group.add(fake);assert.equal(bindCinematicProp(a,prop,'phone'),false);assert.equal(prop.visible,false);assert.match(prop.userData.cinematicPropWithheld,/authored wrist/);
});
test('legacy exact candidates accept only an explicit finite reviewed hand-local binding',()=>{
 const a=actor(),hand=new THREE.Bone(),prop=new THREE.Group();hand.name='RightHand';a.group.add(hand);assert.equal(bindCinematicProp(a,prop,'phone',{hand:'RightHand',position:[.02,.03,.04],rotation:[0,0,.1]}),true);assert.equal(prop.parent,hand);assert.deepEqual(prop.position.toArray(),[.02,.03,.04]);
 assert.equal(bindCinematicProp(a,new THREE.Group(),'xray',{hand:'RightHand',position:[0,NaN,0],rotation:[0,0,0]}),false);
});

test('actual venue attaches the X-ray to its authored hand and clears speech while holding the completed view',()=>{
 const a=actor(),hand=new THREE.Bone(),anchor=new THREE.Object3D(),scene=new THREE.Scene();let speech=-1;hand.name='LeftHand';anchor.name='PropXray';hand.add(anchor);a.group.add(hand);
 const module=new CinematicVenue();module.setup({scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.55,z:0,yaw:0,speed:0}),emit(){},canInteract:()=>true,storyActive:()=>true,storyDialogueComplete:()=>true,storySpeechEnvelope:()=>.8,characterFactory:()=>({...a,setSpeechEnvelope:v=>{speech=v;}})},{venue:'artsCorridor',actorStyle:'shankarDada'});
 const film=scene.getObjectByName('shankar-xray')!;assert.equal(film.parent,anchor);assert.equal(film.visible,true);module.update(.1);assert.equal(speech,.8);module.onDrop();module.update(.1);assert.equal(speech,0);module.teardown();
});

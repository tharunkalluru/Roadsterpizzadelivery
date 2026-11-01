import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAuthoredMotionPlayer, validateAuthoredMotions, type AuthoredMotionContract } from '../../src/delivery/art/authored-motion';

function actor() {
  const root=new THREE.Group();root.name='Actor';
  for(const name of ['LeftLeg','RightLeg','LeftArm','RightArm']){const bone=new THREE.Bone();bone.name=name;root.add(bone);}
  const track=(name:string,values:number[])=>new THREE.NumberKeyframeTrack(`${name}.rotation[x]`,[0,.5,1],values);
  const clips=[
    new THREE.AnimationClip('Walk',1,[track('LeftLeg',[0,.6,0]),track('RightLeg',[0,-.6,0]),track('LeftArm',[0,-.3,0])]),
    new THREE.AnimationClip('Idle',1,[track('LeftArm',[0,.02,0])]),
    new THREE.AnimationClip('Receive',1,[track('LeftArm',[0,.45,.9]),track('RightArm',[0,.45,.9])]),
  ];
  const motions:AuthoredMotionContract={required:['idle','walk'],clips:{idle:{clipName:'Idle'},walk:{clipName:'Walk',metresPerCycle:1.2}}};
  const handoff={clipName:'Receive',upperBodyNodes:['LeftArm','RightArm']};
  return {root,clips,motions,handoff};
}

test('handoff sampling preserves the walking clock and the legs while overriding only authored upper-body nodes',()=>{
  const a=actor();validateAuthoredMotions(a.root,a.clips,a.motions,a.handoff);
  const animation=createAuthoredMotionPlayer(a.root,a.clips,a.motions,a.handoff);
  animation.animate!(.1,'walk',1.2);animation.animate!(.1,'walk',1.2);
  const before=a.root.getObjectByName('LeftLeg')!.rotation.x;
  assert.ok(before>.2);assert.equal(a.root.userData.authoredMotion.time,.2);
  animation.catchPose(.6);
  assert.ok(Math.abs(a.root.getObjectByName('LeftLeg')!.rotation.x-before)<1e-6);
  assert.ok(Math.abs(a.root.getObjectByName('LeftArm')!.rotation.x-.54)<1e-6);
  animation.animate!(.1,'walk',1.2);animation.catchPose(.8);
  assert.ok(Math.abs(a.root.userData.authoredMotion.time-.3)<1e-6);
  assert.ok(a.root.getObjectByName('LeftLeg')!.rotation.x>before);
  animation.catchPose(0);assert.ok(Math.abs(a.root.userData.authoredMotion.time-.3)<1e-6);
  animation.animate!(.1,'walk',1.2);assert.ok(Math.abs(a.root.userData.authoredMotion.time-.4)<1e-6);
  animation.dispose();animation.dispose();
});

test('walking follows actual scene velocity, stays in place and remains independent between instances',()=>{
  const a=actor(),b=actor(),one=createAuthoredMotionPlayer(a.root,a.clips,a.motions,a.handoff),two=createAuthoredMotionPlayer(b.root,b.clips,b.motions,b.handoff);
  one.animate!(.1,'walk',.6);two.animate!(.1,'walk',1.2);
  assert.equal(a.root.userData.authoredMotion.rate,.5);assert.equal(b.root.userData.authoredMotion.rate,1);
  assert.equal(a.root.userData.authoredMotion.time,.05);assert.equal(b.root.userData.authoredMotion.time,.1);
  one.catchPose(1);assert.ok(Math.abs(b.root.getObjectByName('LeftArm')!.rotation.x+.06)<1e-6);
  assert.deepEqual(a.root.position.toArray(),[0,0,0]);
  one.animate!(.1,'walk',0);assert.equal(a.root.userData.authoredMotion.time,.05);
  one.dispose();two.animate!(.1,'walk',1.2);assert.equal(b.root.userData.authoredMotion.time,.2);two.dispose();
});

test('missing gait, unsafe root motion, invalid stride and full-body catch cannot masquerade as authored locomotion',()=>{
  const missing=actor();missing.motions.required.push('dance');assert.throws(()=>validateAuthoredMotions(missing.root,missing.clips,missing.motions,missing.handoff),/dance/);
  const stride=actor();stride.motions.clips.walk!.metresPerCycle=0;assert.throws(()=>validateAuthoredMotions(stride.root,stride.clips,stride.motions,stride.handoff),/stride/);
  const rootMotion=actor();rootMotion.clips[0].tracks.push(new THREE.VectorKeyframeTrack('Actor.position',[0,1],[0,0,0,0,0,1]));assert.throws(()=>validateAuthoredMotions(rootMotion.root,rootMotion.clips,rootMotion.motions,rootMotion.handoff),/in place/);
  const catchLeg=actor();catchLeg.clips[2].tracks.push(new THREE.NumberKeyframeTrack('LeftLeg.rotation[x]',[0,1],[0,1]));assert.throws(()=>validateAuthoredMotions(catchLeg.root,catchLeg.clips,catchLeg.motions,catchLeg.handoff),/upper-body mask/);
  const absent=actor();absent.clips[0].tracks[0].name='MissingBone.rotation[x]';assert.throws(()=>validateAuthoredMotions(absent.root,absent.clips,absent.motions,absent.handoff),/absent node/);
});

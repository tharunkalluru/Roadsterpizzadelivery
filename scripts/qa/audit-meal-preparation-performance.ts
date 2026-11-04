import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash}from 'node:crypto';
import assert from 'node:assert/strict';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
import {installActorPerformance,prepareActorPerformanceGeometry} from '../../src/delivery/art/actor-performance';
import {createMealGeometry,prepareActorPerformanceGeometry as prepareSource}from '../../src/delivery/art/actor-meal-geometry';
import {clone as cloneSkeleton}from 'three/examples/jsm/utils/SkeletonUtils.js';
import {installActorPerformance as referenceInstall,receivedCartonDepth as referenceDepth}from './fixtures/actor-performance-freeze28.mjs';
import {createAuthoredMotionPlayer} from '../../src/delivery/art/authored-motion';
const repo=process.cwd();if(!process.argv[2]||!process.argv[3])throw Error('Supply native annotation JSON and new output JSON paths');
const manifest=JSON.parse(await readFile(repo+'/src/delivery/art/character-assets.json','utf8'));
const report=[];const annotationBytes=await readFile(process.argv[2]),annotations=JSON.parse(annotationBytes.toString()).entries;const sourcePaths=['src/delivery/art/actor-performance.ts','src/delivery/art/actor-meal-geometry.ts','src/delivery/art/released-gltf.ts','src/delivery/art/face-annotations.ts','src/delivery/art/character-assets.json'];const sourceHashes=await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path))})));
const recipients=new Set(process.argv[4]?.split(',')??['pushpa-raj','ram-vvr','jessie','hasini','bhanumathi','sukumar','nani-jersey','arjun-reddy','maruthi','vakeel-saab','srikanth-odela']);
const sampleFrames=Number(process.argv[5]??180),sampleDt=6/sampleFrames;assert.ok(Number.isInteger(sampleFrames)&&sampleFrames>=60&&sampleFrames<=720,'Use 60..720 evenly spaced audit frames');
for(const entry of manifest.assets.filter(e=>annotations.some(a=>a.characterId===e.characterId)&&recipients.has(e.characterId))){
 const bytes=await readFile(repo+'/public'+entry.glb.url);assert.equal(sha(bytes),entry.glb.sha256);const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size).toString());
 // The numerical articulation audit needs no decoder/textures. Preserve the
 // original BIN, topology, nodes, skeleton, skin weights and authored clips.
 for(const material of json.materials??[]){for(const key of Object.keys(material))if(key.endsWith('Texture'))delete material[key];if(material.pbrMetallicRoughness)for(const key of Object.keys(material.pbrMetallicRoughness))if(key.endsWith('Texture'))delete material.pbrMetallicRoughness[key];}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),pad=(4-text.length%4)%4,body=bytes.subarray(20+size),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+pad+body.length,8);header.writeUInt32LE(text.length+pad,12);header.writeUInt32LE(0x4e4f534a,16);
 const buffer=Buffer.concat([header,text,Buffer.alloc(pad,32),body]);const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const root=gltf.scene,contract=entry.contract,motion=createAuthoredMotionPlayer(root,gltf.animations,contract.motions,contract.pose.mode==='handoff-clip'?contract.pose:undefined);
 const owned=[],resources={geometry(g){owned.push(g);return g;},material(_,m){owned.push(m);}};
 const actor={group:root,leftArm:root.getObjectByName(contract.nodes.leftArm),rightArm:root.getObjectByName(contract.nodes.rightArm),catchPoint:root.getObjectByName(contract.nodes.catchPoint),book:contract.nodes.book?root.getObjectByName(contract.nodes.book):undefined,catchPose:motion.catchPose,animate:motion.animate};

 root.userData.releasedCharacter={identity:entry.characterId,glbSha256:entry.glb.sha256};motion.animate?.(0,'idle',0);
 const matrices=()=>{root.updateWorldMatrix(true,true);const a=[];root.traverse(n=>{if(n instanceof THREE.Bone)a.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray());});return a;};const beforePrepare=matrices();
 const prepAt=globalThis.performance.now();await prepareSource(root,()=>true,()=>Promise.resolve());const preparationMs=globalThis.performance.now()-prepAt;assert.deepEqual(matrices(),beforePrepare,'preparation must not mutate pose');
 const measure=createMealGeometry(root),head=root.getObjectByName('Head');let maximumDepthResidual=0,poseCases=0;
 for(const mode of ['idle','read','walk','dance'])for(const seconds of [0,.37,1.13])for(const catchAt of [0,.5,1])for(const transformed of [false,true]){
  root.position.set(transformed?3983.1:0,transformed?.66:0,transformed?-2073.2:0);root.rotation.set(transformed?.11:0,transformed?2.1:0,transformed?-.06:0);root.scale.set(transformed?.91:1,transformed?1.13:1,transformed?1.04:1);
  for(let i=0;i<Math.ceil(seconds/.1);i++)motion.animate?.(Math.min(.1,seconds-i*.1),mode,1.6);motion.catchPose(catchAt);root.updateWorldMatrix(true,true);
  const expected=referenceDepth(root,head,.47),actual=measure.depth(head,.47),residual=Math.abs(expected-actual);maximumDepthResidual=Math.max(maximumDepthResidual,residual);assert.ok(residual<1e-10,entry.characterId+' exact posed max mismatch '+residual);poseCases++;
 }
 root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);motion.dispose();
 const annotation=annotations.find(a=>a.characterId===entry.characterId),runs=[];let maximumPoseResidual=0;
 for(let repeat=0;repeat<3;repeat++)for(const optimized of [false,true]){
  const group=cloneSkeleton(root),owned=[],resources={geometry(g){owned.push(g);return g;},material(_,m){owned.push(m);}},player=createAuthoredMotionPlayer(group,gltf.animations,contract.motions,contract.pose.mode==='handoff-clip'?contract.pose:undefined);player.catchPose(0);player.animate?.(0,'idle',0);group.userData.releasedCharacter={identity:entry.characterId,glbSha256:entry.glb.sha256};
  const actor={group,catchPose:player.catchPose,animate:player.animate,book:contract.nodes.book?group.getObjectByName(contract.nodes.book):undefined};const at=globalThis.performance.now(),perf=(optimized?installActorPerformance:referenceInstall)(actor,entry.characterId,resources,annotation),setupMs=globalThis.performance.now()-at,start=globalThis.performance.now();assert.equal(actor.receivePizza(),true);const receiveMs=globalThis.performance.now()-start;
  const poses=[];for(let i=0;i<180;i++){actor.animate(1/30,'idle',0);group.updateWorldMatrix(true,true);const pose=[];group.traverse(n=>{if(n instanceof THREE.Bone||n.name.startsWith('received-')||n.name==='delivery-mouth-anchor')pose.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray());});poses.push(pose);}
  if(!optimized)runs.push({repeat,setupMs,receiveMs,poses});else{const reference=runs[repeat];assert.equal(reference.poses.length,poses.length);for(let i=0;i<poses.length;i++){assert.equal(poses[i].length,reference.poses[i].length);for(let k=0;k<poses[i].length;k++)maximumPoseResidual=Math.max(maximumPoseResidual,Math.abs(poses[i][k]-reference.poses[i][k]));}Object.assign(reference,{afterSetupMs:setupMs,afterReceiveMs:receiveMs});delete reference.poses;}
  assert.equal(actor.receivePizza(),false,'repeated receipt is inert');const stateTime=group.userData.deliveryPerformance.time;actor.animate(NaN,'idle',0);assert.equal(group.userData.deliveryPerformance.time,stateTime);perf.dispose();perf.dispose();assert.equal(actor.receivePizza(),false,'disposed recipient cannot restart');player.dispose();owned.forEach(r=>r.dispose());
 }
 assert.ok(maximumPoseResidual<1e-10,entry.characterId+' animation pose changed '+maximumPoseResidual);assert.equal(sha(await readFile(repo+'/public'+entry.glb.url)),entry.glb.sha256);report.push({identity:entry.characterId,preparationMs,poseCases,maximumDepthResidual,maximumPoseResidual,runs});console.log(JSON.stringify(report.at(-1)));
}
await writeFile(process.argv[3],JSON.stringify({scope:'Same real 11 GLBs, exact reference current-pose maximum versus conservative accelerated query; 72 pose/transform cases per actor, 3 baseline/after 180-frame meals and repeated/disposed/invalid-dt lifecycle checks. CPU measurements on this host only; not GPU or phone FPS.',sourceHashes,report},null,2),{flag:'wx'});

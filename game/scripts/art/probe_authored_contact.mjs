#!/usr/bin/env node
/** Geometry-only verification of exact native palm surfaces under gameplay's
 * actual continuing motion + masked handoff. No renderer/GPU or asset edits.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createAuthoredMotionPlayer } from '../../src/delivery/art/authored-motion.ts';
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
for(const key of ['--input','--rig','--palms','--output'])if(!args.get(key))throw new Error(`Missing ${key}.`);
const input=resolve(args.get('--input')),output=resolve(args.get('--output'));
try{await access(output);throw new Error('Use a new contact proof output.');}catch(error){if(error.code!=='ENOENT')throw error;}
const bytes=await readFile(input),contract=JSON.parse(await readFile(args.get('--rig'),'utf8')),source=JSON.parse(await readFile(args.get('--palms'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
if(source.sourceGlbSha256!==hash(bytes)||!source.hands?.length)throw new Error('Native palm evidence must match these exact GLB bytes.');
globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');gltf.scene.updateMatrixWorld(true);
const sources=source.hands.map(hand=>{
 const mesh=gltf.scene.getObjectByName(hand.meshName);if(!(mesh instanceof THREE.SkinnedMesh))throw new Error('Exact anatomical hand is missing.');
 const vertices=hand.vertices.map(vertex=>{
  const expected=new THREE.Vector3().fromArray(vertex.exportThreeRestWorld);let best=-1,distance=Infinity;
  for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){const point=mesh.localToWorld(mesh.getVertexPosition(i,new THREE.Vector3())),d=point.distanceTo(expected);if(d<distance){best=i;distance=d;}}
  if(distance>2e-6)throw new Error('Native palm source point does not match the actual exported skin.');
  return{nativeVertexIndex:vertex.nativeVertexIndex,exportedVertexIndex:best};
 });return{side:hand.side,meshName:hand.meshName,boneName:hand.boneName,vertices};
});
const mode=args.get('--mode')??'walk',speed=Number(args.get('--speed')??.7),phases=(args.get('--phases')??'0,.25,.5,.75,1').split(',').map(Number);
if(!Number.isFinite(speed)||speed<0||phases.some(value=>!Number.isFinite(value)||value<0||value>10))throw new Error('Invalid motion samples.');
const records=phases.map(phase=>{
 const actor=clone(gltf.scene),motion=createAuthoredMotionPlayer(actor,gltf.animations,contract.motions,contract.pose);motion.animate?.(0,mode,speed);
 let elapsed=0;while(elapsed<phase-1e-10){const dt=Math.min(.05,phase-elapsed);motion.animate?.(dt,mode,speed);elapsed+=dt;}
 const before=actor.userData.authoredMotion.time;motion.catchPose(1);actor.updateMatrixWorld(true);
 const hands=sources.map(source=>{
  const mesh=actor.getObjectByName(source.meshName),points=source.vertices.map(vertex=>mesh.localToWorld(mesh.getVertexPosition(vertex.exportedVertexIndex,new THREE.Vector3())));
  const mean=points.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).divideScalar(points.length);
  return{side:source.side,meanWorldThree:mean.toArray(),pointsWorldThree:points.map(point=>point.toArray())};
 });
 const mean=hands.reduce((sum,hand)=>sum.add(new THREE.Vector3().fromArray(hand.meanWorldThree)),new THREE.Vector3()).divideScalar(hands.length);
 const anchor=actor.getObjectByName(contract.nodes.catchPoint).getWorldPosition(new THREE.Vector3());
 const palm=anchor.clone();if(contract.catchPointSpace==='box-center')palm.y-=.035;
 const box=anchor.clone();if(contract.catchPointSpace!=='box-center')box.y+=.035;
 const result={elapsed:phase,mode,speed,clockBeforeCatch:before,clockAfterCatch:actor.userData.authoredMotion.time,catchAmount:1,
  hands,expectedPalmMeanWorldThree:mean.toArray(),anchorWorldThree:anchor.toArray(),boxCenterWorldThree:box.toArray(),anchorPalmErrorMetres:palm.distanceTo(mean),
  handBoxSupport:hands.map(hand=>{const p=new THREE.Vector3().fromArray(hand.meanWorldThree);return{side:hand.side,undersideVerticalGapMetres:p.y-(box.y-.035),insideBoxFootprint:Math.abs(p.x-box.x)<=.2&&Math.abs(p.z-box.z)<=.2};})};
 motion.dispose();return result;
});
if(records.some(row=>row.clockBeforeCatch!==row.clockAfterCatch||row.anchorPalmErrorMetres>.001||row.handBoxSupport.some(hand=>!hand.insideBoxFootprint||Math.abs(hand.undersideVerticalGapMetres)>.015)))throw new Error('Actual continuing-mixer palm/box contact failed.');
const report={status:'Numerical contact PASS only; exact actual GLB visual/gait/scene/likeness approval still required',sourceGlbSha256:hash(bytes),outputGlbSha256:hash(bytes),sourcePalmEvidenceSha256:hash(await readFile(args.get('--palms'))),
 sourceHands:sources,catchPointSpace:contract.catchPointSpace??'palm-contact',actualMixer:'createAuthoredMotionPlayer from gameplay source',samples:records,
 maximumAnchorPalmErrorMetres:Math.max(...records.map(row=>row.anchorPalmErrorMetres)),renderer:'none; CPU evaluation of exact exported skin',producerSha256:hash(await readFile(new URL(import.meta.url)))};
await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({output,sha256:hash(bytes),maxError:report.maximumAnchorPalmErrorMetres,phases:records.length}));

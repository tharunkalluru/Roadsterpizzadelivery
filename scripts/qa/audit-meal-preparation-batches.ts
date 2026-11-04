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


 const pose=[];root.traverse(n=>pose.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()));const start=globalThis.performance.now();let previous=start,maximumTaskMs=0,yields=0;
 await prepareSource(root,()=>true,async()=>{const now=globalThis.performance.now();maximumTaskMs=Math.max(maximumTaskMs,now-previous);yields++;await new Promise(resolve=>setTimeout(resolve,0));previous=globalThis.performance.now();});maximumTaskMs=Math.max(maximumTaskMs,globalThis.performance.now()-previous);
 const after=[];root.traverse(n=>after.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()));assert.deepEqual(after,pose);assert.equal(sha(await readFile(repo+'/public'+entry.glb.url)),entry.glb.sha256);const measured={identity:entry.characterId,wallMs:globalThis.performance.now()-start,maximumTaskMs,yields,poseUnchanged:true,sourceUnchanged:true};report.push(measured);console.log(JSON.stringify(measured));motion.dispose();
}
await writeFile(process.argv[3],JSON.stringify({scope:'Real immutable GLB classification with production-style timer yields between at most512 source vertices; host wall-clock CPU tasks, not GPU or phone FPS. Existing root pose and source GLB preserved.',sourceHashes,report},null,2),{flag:'wx'});

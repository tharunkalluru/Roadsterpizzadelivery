import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const inputs:{path:string;sha256:string}[]=[];
import {installActorPerformance} from '../../src/delivery/art/actor-performance';
import {createAuthoredMotionPlayer} from '../../src/delivery/art/authored-motion';
const repo=process.cwd();
const manifest=JSON.parse(await readFile(repo+'/src/delivery/art/character-assets.json','utf8'));
const report=[];
for(const entry of manifest.assets){
 const assetPath='public'+entry.glb.url,bytes=await readFile(repo+'/'+assetPath);assert.equal(sha(bytes),entry.glb.sha256);inputs.push({path:assetPath,sha256:sha(bytes)});const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size).toString());
 // The numerical articulation audit needs no decoder/textures. Preserve the
 // original BIN, topology, nodes, skeleton, skin weights and authored clips.
 for(const material of json.materials??[]){for(const key of Object.keys(material))if(key.endsWith('Texture'))delete material[key];if(material.pbrMetallicRoughness)for(const key of Object.keys(material.pbrMetallicRoughness))if(key.endsWith('Texture'))delete material.pbrMetallicRoughness[key];}
 delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),pad=(4-text.length%4)%4,body=bytes.subarray(20+size),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+pad+body.length,8);header.writeUInt32LE(text.length+pad,12);header.writeUInt32LE(0x4e4f534a,16);
 const buffer=Buffer.concat([header,text,Buffer.alloc(pad,32),body]);const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const root=gltf.scene,contract=entry.contract,motion=createAuthoredMotionPlayer(root,gltf.animations,contract.motions,contract.pose.mode==='handoff-clip'?contract.pose:undefined);
 const owned=[],resources={geometry(g){owned.push(g);return g;},material(_,m){owned.push(m);}};
 const actor={group:root,leftArm:root.getObjectByName(contract.nodes.leftArm),rightArm:root.getObjectByName(contract.nodes.rightArm),catchPoint:root.getObjectByName(contract.nodes.catchPoint),book:contract.nodes.book?root.getObjectByName(contract.nodes.book):undefined,catchPose:motion.catchPose,animate:motion.animate};
 const performance=installActorPerformance(actor,entry.characterId,resources);const received=actor.receivePizza?.()??false;
 let maxHandMouthDistance=0,minHandMouthDistance=Infinity,maxBoundFraction=0,nonFinite=0,maxTipDistance=0,minPizzaFacePlane=Infinity,minRightFingerFacePlane=Infinity,maxRightFingerAboveMouth=-Infinity,maxRightHandAbovePizza=-Infinity,minPalmUp=1,minFingerForward=1; const tip=new THREE.Vector3(),vertex=new THREE.Vector3(),mouthLocal=new THREE.Vector3();
 for(let i=0;i<180;i++){
  actor.animate?.(1/30,'idle',0);const t=(i+1)/30;root.updateWorldMatrix(true,true);
  if(t>=3.05&&t<=4.3){const mouth=root.getObjectByName('delivery-mouth-anchor'),slice=root.getObjectByName('received-pizza-slice');if(mouth&&slice){const d=mouth.getWorldPosition(new THREE.Vector3()).distanceTo(slice.getWorldPosition(new THREE.Vector3()));maxHandMouthDistance=Math.max(maxHandMouthDistance,d);minHandMouthDistance=Math.min(minHandMouthDistance,d); mouth.getWorldPosition(mouthLocal);slice.localToWorld(tip.set(0,0,.13)); maxTipDistance=Math.max(maxTipDistance,tip.distanceTo(mouthLocal)); root.worldToLocal(mouthLocal);slice.traverse(n=>{if(!(n instanceof THREE.Mesh))return;const ps=n.geometry.getAttribute('position');for(let j=0;j<ps.count;j++){vertex.fromBufferAttribute(ps,j).applyMatrix4(n.matrixWorld);root.worldToLocal(vertex);minPizzaFacePlane=Math.min(minPizzaFacePlane,vertex.z-mouthLocal.z);}});
 const hand=root.getObjectByName('RightHand');if(hand){
  const handUp=new THREE.Vector3(0,0,1).transformDirection(hand.matrixWorld),rootUp=new THREE.Vector3(0,1,0).transformDirection(root.matrixWorld);
  const fingerDirection=new THREE.Vector3(0,1,0).transformDirection(hand.matrixWorld),towardActor=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);
  minPalmUp=Math.min(minPalmUp,handUp.dot(rootUp));minFingerForward=Math.min(minFingerForward,fingerDirection.dot(towardActor));
 }
 for(const name of ['RightIndex3','RightMiddle3','RightRing3','RightPinky3','RightThumb3']){const finger=root.getObjectByName(name);if(!finger)continue;const at=root.worldToLocal(finger.getWorldPosition(new THREE.Vector3()));minRightFingerFacePlane=Math.min(minRightFingerFacePlane,at.z-mouthLocal.z);maxRightFingerAboveMouth=Math.max(maxRightFingerAboveMouth,at.y-mouthLocal.y);}
 const crust=slice.localToWorld(new THREE.Vector3(0,.008,-.079)),pizzaNormal=new THREE.Vector3(0,1,0).transformDirection(slice.matrixWorld);
 root.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;const skinIndex=node.geometry.getAttribute('skinIndex'),skinWeight=node.geometry.getAttribute('skinWeight');if(!skinIndex||!skinWeight)return;const position=node.geometry.getAttribute('position');node.skeleton.update();
 for(let v=0;v<position.count;v++){let weight=0;for(let k=0;k<4;k++){const bone=node.skeleton.bones[skinIndex.getComponent(v,k)];if(bone&&/^Right(?:Hand|Index|Middle|Ring|Pinky|Thumb)/.test(bone.name))weight+=skinWeight.getComponent(v,k);}if(weight<.75)continue;
 node.getVertexPosition(v,vertex).applyMatrix4(node.matrixWorld);maxRightHandAbovePizza=Math.max(maxRightHandAbovePizza,vertex.clone().sub(crust).dot(pizzaNormal));}
 });
}}
  if([30,90,120,179].includes(i))root.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;node.skeleton.update();const sphere=node.boundingSphere;if(!sphere)return;const count=node.geometry.getAttribute('position').count;for(let v=0;v<count;v++){const p=node.getVertexPosition(v,new THREE.Vector3());if(!p.toArray().every(Number.isFinite))nonFinite++;maxBoundFraction=Math.max(maxBoundFraction,p.distanceTo(sphere.center)/sphere.radius);}});
 }
 const state={...root.userData.deliveryPerformance},mouth=root.getObjectByName('delivery-mouth-anchor');
 report.push({identity:entry.characterId,received,bytes:performance.bytes,state,mouth:mouth?.getWorldPosition(new THREE.Vector3()).toArray(),maxHandMouthDistance,minHandMouthDistance:Number.isFinite(minHandMouthDistance)?minHandMouthDistance:null,maxTipDistance,minRightFingerFacePlane:Number.isFinite(minRightFingerFacePlane)?minRightFingerFacePlane:null,maxRightFingerAboveMouth:Number.isFinite(maxRightFingerAboveMouth)?maxRightFingerAboveMouth:null,maxRightHandAbovePizza:Number.isFinite(maxRightHandAbovePizza)?maxRightHandAbovePizza:null,minPalmUp,minFingerForward,minPizzaFacePlane:Number.isFinite(minPizzaFacePlane)?minPizzaFacePlane:null,maxBoundFraction,nonFinite});
 performance.dispose();motion.dispose();for(const resource of owned)resource.dispose();
}
assert.equal(report.filter(r=>r.received).length,11);
for(const result of report){assert.equal(result.nonFinite,0);if(result.received){assert.ok(result.maxTipDistance<.035,result.identity);assert.ok(result.minPizzaFacePlane!>=.002,result.identity);assert.ok(result.maxBoundFraction<1,result.identity);assert.ok(result.minPalmUp>.999,result.identity);assert.ok(result.minFingerForward>.999,result.identity);assert.ok(result.minRightFingerFacePlane!>.05,result.identity);assert.ok(result.maxRightFingerAboveMouth!<-.025,result.identity);assert.ok(result.maxRightHandAbovePizza!<.004,result.identity);}}
for(const input of inputs)assert.equal(sha(await readFile(repo+'/'+input.path)),input.sha256);
const output=process.argv[2];if(!output)throw Error('Supply a new output path');
await writeFile(output,JSON.stringify({scope:'CPU tip/face-plane, articulation and culling only; original GLB BIN/skins retained and texture bindings stripped in memory; native mouth anatomical/appearance review remains required',checks:{actualAssets:report.length,eaters:report.filter(r=>r.received).length,sourceAssetsUnchanged:true,actualEdibleTipDistanceUnder35mm:true,pizzaVerticesAtLeast2mmInFrontOfRootLipPlane:true,sampledSkinBounds:true,palmUpAndFingersTowardActor:true,fingertipsOutsideFaceAndBelowMouth:true,handSurfaceBelowPizza:true},inputs,report},null,2),{flag:'wx'});
console.log(JSON.stringify({output,assets:report.length,eaters:11,maxTipDistance:Math.max(...report.map(r=>r.maxTipDistance)),minimumPizzaFacePlane:Math.min(...report.filter(r=>r.received).map(r=>r.minPizzaFacePlane!))}));

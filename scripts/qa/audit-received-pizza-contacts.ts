import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash}from 'node:crypto';
import assert from 'node:assert/strict';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
import {installActorPerformance} from '../../src/delivery/art/actor-performance';
import {createAuthoredMotionPlayer} from '../../src/delivery/art/authored-motion';
const repo=process.cwd();if(!process.argv[2]||!process.argv[3])throw Error('Supply native annotation JSON and new output JSON paths');
const manifest=JSON.parse(await readFile(repo+'/src/delivery/art/character-assets.json','utf8'));
const report=[];const annotationBytes=await readFile(process.argv[2]),annotations=JSON.parse(annotationBytes.toString()).entries;const sourcePaths=['src/delivery/art/actor-performance.ts','src/delivery/art/actor-meal-geometry.ts','src/delivery/art/released-gltf.ts','src/delivery/art/face-annotations.ts','src/delivery/art/character-assets.json'];const sourceHashes=await Promise.all(sourcePaths.map(async path=>({path,sha256:sha(await readFile(path))})));
const recipients=new Set(process.argv[4]?.split(',')??['pushpa-raj','ram-vvr','jessie','hasini','bhanumathi','sukumar','nani-jersey','arjun-reddy','maruthi','vakeel-saab','srikanth-odela']);
const sampleFrames=Number(process.argv[5]??180),sampleDt=6/sampleFrames;assert.ok(Number.isInteger(sampleFrames)&&sampleFrames>=60&&sampleFrames<=720,'Use 60..720 evenly spaced audit frames');
const lifecycleArg=process.argv[6]??'idle-direct',lifecycles=lifecycleArg==='all-handoffs'?['idle','read','walk','dance']:lifecycleArg==='idle-direct'?['idle-direct']:[lifecycleArg];
assert.ok(lifecycles.every(mode=>['idle-direct','idle','read','walk','dance'].includes(mode)),'Use idle-direct, idle/read/walk/dance or all-handoffs');
for(const lifecycle of lifecycles){
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
 root.userData.releasedCharacter={identity:entry.characterId,glbSha256:entry.glb.sha256};motion.animate?.(0,'idle',0);const annotation=annotations.find(a=>a.characterId===entry.characterId); const performance=installActorPerformance(actor,entry.characterId,resources,annotation);
 if(lifecycle!=='idle-direct'){
  // Actual scene transforms and the authored handoff lifecycle matter: the
  // receiver has been reading/walking/dancing before catch reaches one, and
  // the host fades catch while its requested base motion continues afterward.
  const stage=new THREE.Group();stage.position.set(3983,1.2,-2073);stage.rotation.set(-.015,.72,0,'YXZ');root.position.set(1.6,1.57,6);root.rotation.y=Math.PI;stage.add(root);
  for(let frame=0;frame<240;frame++)actor.animate?.(1/60,lifecycle,1.2);
  for(let frame=0;frame<69;frame++){actor.animate?.(1/60,lifecycle,1.2);actor.catchPose(Math.min(1,frame/20));}
 }
 const received=actor.receivePizza?.()??false;
 let maxHandMouthDistance=0,minHandMouthDistance=Infinity,maxSliceTipDistance=0,minimumSliceFaceClearance=Infinity,minimumHandFaceClearance=Infinity,maxBoundFraction=0,nonFinite=0;const geometryReport=[];
 for(let i=0;i<sampleFrames;i++){
  const t=(i+1)*sampleDt;if(lifecycle!=='idle-direct')actor.catchPose(Math.max(0,1-t/.45));actor.animate?.(sampleDt,lifecycle==='idle-direct'?'idle':lifecycle,1.2);root.updateWorldMatrix(true,true);
  if(t>=3.05&&t<=4.3){const mouth=root.getObjectByName('delivery-mouth-anchor'),slice=root.getObjectByName('received-pizza-slice');if(mouth&&slice){const m=mouth.getWorldPosition(new THREE.Vector3()),d=m.distanceTo(slice.getWorldPosition(new THREE.Vector3()));maxHandMouthDistance=Math.max(maxHandMouthDistance,d);minHandMouthDistance=Math.min(minHandMouthDistance,d);maxSliceTipDistance=Math.max(maxSliceTipDistance,m.distanceTo(slice.localToWorld(new THREE.Vector3(0,0,.13))));const inverse=root.matrixWorld.clone().invert(),at=m.applyMatrix4(inverse);slice.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const p=node.geometry.getAttribute('position');for(let k=0;k<p.count;k++)minimumSliceFaceClearance=Math.min(minimumSliceFaceClearance,node.getVertexPosition(k,new THREE.Vector3()).applyMatrix4(node.matrixWorld).applyMatrix4(inverse).z-at.z);});}}
 
 {
  const carton=root.getObjectByName('received-pizza-openable-carton'),lid=root.getObjectByName('received-carton-lid')?.children[0];
  if(!carton||!lid)throw Error('No annotated performance');
  const tray=carton.children[0]as THREE.Mesh;tray.geometry.computeBoundingBox();const trayBounds=tray.geometry.boundingBox!,trayInverse=tray.matrixWorld.clone().invert();
  const cp=carton.position,rootInverse=root.matrixWorld.clone().invert(),lidInverse=lid.matrixWorld.clone().invert();
  let leftInsidePizza=0,rightInsidePizza=0,lidTriangles=0,lidFullTriangles=0,lidVolumeTriangles=0,leftSupportDistance=Infinity,leftSupportVertices=0,leftTrayPenetration=0;let leftSupportWitness=null;const witnesses=[],volumeWitnesses=[];const solidLid=new THREE.Box3(new THREE.Vector3(-.16,-.006,-.16),new THREE.Vector3(.16,.006,.16)),mouthAt=root.getObjectByName('delivery-mouth-anchor')!.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
  root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let ancestor:THREE.Object3D|null=node;ancestor&&ancestor!==root;ancestor=ancestor.parent)if(!ancestor.visible||ancestor.name.startsWith('received-'))return;if(node instanceof THREE.SkinnedMesh)node.skeleton.update();const p=node.geometry.getAttribute('position'),si=node.geometry.getAttribute('skinIndex'),sw=node.geometry.getAttribute('skinWeight'),idx=node.geometry.index,vertices=[];
   for(let k=0;k<p.count;k++){
    const world=node.getVertexPosition(k,new THREE.Vector3()).applyMatrix4(node.matrixWorld),at=world.clone().applyMatrix4(rootInverse),v=world.clone().applyMatrix4(lidInverse);vertices.push(v);
    let w=0,rw=0;if(node instanceof THREE.SkinnedMesh&&si&&sw)for(let b=0;b<4;b++){const name=node.skeleton.bones[si.getComponent(k,b)]?.name??'';if(/^Left(?:Hand|Index|Middle|Ring|Pinky|Thumb)/.test(name))w+=sw.getComponent(k,b);if(/^Right(?:Hand|Index|Middle|Ring|Pinky|Thumb)/.test(name))rw+=sw.getComponent(k,b);}else for(let bone:THREE.Object3D|null=node;bone&&bone!==root;bone=bone.parent){if(/^Left(?:Hand|Index|Middle|Ring|Pinky|Thumb)/.test(bone.name))w=1;if(/^Right(?:Hand|Index|Middle|Ring|Pinky|Thumb)/.test(bone.name))rw=1;}
    if(w>.5&&at.y>cp.y+.01&&Math.hypot(at.x-cp.x,at.z-cp.z)<.145)leftInsidePizza++;if(rw>.5&&at.y>cp.y+.01&&at.y<cp.y+.04&&Math.hypot(at.x-cp.x,at.z-cp.z)<.14112)rightInsidePizza++;
    if(w>.5&&node instanceof THREE.SkinnedMesh){const trayAt=world.clone().applyMatrix4(trayInverse);if(trayAt.x>trayBounds.min.x+.001&&trayAt.x<trayBounds.max.x-.001&&trayAt.z>trayBounds.min.z+.001&&trayAt.z<trayBounds.max.z-.001){const gap=trayBounds.min.y-trayAt.y;if(gap>=-.001&&Math.abs(gap)<leftSupportDistance){leftSupportDistance=Math.abs(gap);leftSupportWitness={mesh:node.name,vertex:k,rootPoint:at.toArray(),undersideGapMetres:gap};}if(Math.abs(gap)<.004)leftSupportVertices++;if(gap<-.001&&trayAt.y<trayBounds.max.y)leftTrayPenetration++;}}
    if(t>=3.05&&t<=4.3&&(w>.5||rw>.5)&&Math.abs(at.x-mouthAt.x)<.11&&Math.abs(at.y-mouthAt.y)<.065)minimumHandFaceClearance=Math.min(minimumHandFaceClearance,at.z-mouthAt.z);
   }
   const count=idx?idx.count:p.count;
   for(let k=0;k<count;k+=3){const a=vertices[idx?idx.getX(k):k],b=vertices[idx?idx.getX(k+1):k+1],c=vertices[idx?idx.getX(k+2):k+2];
    if(Math.max(a.x,b.x,c.x)<-.16||Math.min(a.x,b.x,c.x)>.16||Math.max(a.z,b.z,c.z)<-.16||Math.min(a.z,b.z,c.z)>.16||Math.min(a.y,b.y,c.y)>.006||Math.max(a.y,b.y,c.y)<-.006)continue;
    if(solidLid.intersectsTriangle(new THREE.Triangle(a,b,c))){lidVolumeTriangles++;if(volumeWitnesses.length<5)volumeWitnesses.push({mesh:node.name,triangle:k/3,centroid:a.clone().add(b).add(c).divideScalar(3).toArray()});}
    for(const [v,w]of [[a,b],[b,c],[c,a]]){if(v.y*w.y>0||Math.abs(v.y-w.y)<1e-10)continue;const t=-v.y/(w.y-v.y),x=v.x+(w.x-v.x)*t,z=v.z+(w.z-v.z)*t;if(Math.abs(x)<.16&&Math.abs(z)<.16){lidFullTriangles++;if(Math.abs(x)<.157&&Math.abs(z)<.157)lidTriangles++;if(witnesses.length<5)witnesses.push({mesh:node.name,triangle:k/3,point:[x,0,z]});break;}}
   }
  });
  geometryReport.push({time:t,carton:cp.toArray(),leftInsidePizza,rightInsidePizza,leftSupportDistance:Number.isFinite(leftSupportDistance)?leftSupportDistance:null,leftSupportVertices,leftSupportWitness,leftTrayPenetration,lidTriangles,lidFullTriangles,lidVolumeTriangles,witnesses,volumeWitnesses});
 }
 if(i%3===0||i===sampleFrames-1)root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let ancestor:THREE.Object3D|null=node;ancestor&&ancestor!==root;ancestor=ancestor.parent)if(!ancestor.visible||ancestor.name.startsWith('received-'))return;if(node instanceof THREE.SkinnedMesh)node.skeleton.update();const sphere=node.boundingSphere;if(!sphere)return;const count=node.geometry.getAttribute('position').count;for(let v=0;v<count;v++){const p=node.getVertexPosition(v,new THREE.Vector3());if(!p.toArray().every(Number.isFinite))nonFinite++;maxBoundFraction=Math.max(maxBoundFraction,p.distanceTo(sphere.center)/sphere.radius);}});
 }
 const state={...root.userData.deliveryPerformance},mouth=root.getObjectByName('delivery-mouth-anchor');
 assert.equal(sha(await readFile(repo+'/public'+entry.glb.url)),entry.glb.sha256);report.push({identity:entry.characterId,lifecycle,assetSha256:entry.glb.sha256,received,geometryReport,bytes:performance.bytes,state,mouth:mouth?.getWorldPosition(new THREE.Vector3()).toArray(),maxHandMouthDistance,minHandMouthDistance:Number.isFinite(minHandMouthDistance)?minHandMouthDistance:null,maxSliceTipDistance,minimumSliceFaceClearance:Number.isFinite(minimumSliceFaceClearance)?minimumSliceFaceClearance:null,minimumHandFaceClearance:Number.isFinite(minimumHandFaceClearance)?minimumHandFaceClearance:null,maxBoundFraction,nonFinite});
 performance.dispose();motion.dispose();for(const resource of owned)resource.dispose();
}
}
for(const item of sourceHashes)assert.equal(sha(await readFile(item.path)),item.sha256,'runtime changed during audit');
assert.ok(report.length>0,'No matching recipient models');
const summary={characters:report.length,receivers:report.filter(r=>r.received).length,sampledFramesPerRecipient:sampleFrames,maximumLeftSupportGap:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.leftSupportDistance??Infinity))),minimumLeftSupportVertices:Math.min(...report.flatMap(r=>r.geometryReport.map(g=>g.leftSupportVertices))),maximumLeftTrayPenetration:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.leftTrayPenetration))),maximumLeftPizzaVertices:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.leftInsidePizza))),maximumRightPizzaVertices:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.rightInsidePizza))),maximumLidInteriorTriangles:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.lidTriangles))),maximumLidFullTriangles:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.lidFullTriangles))),maximumLidVolumeTriangles:Math.max(...report.flatMap(r=>r.geometryReport.map(g=>g.lidVolumeTriangles))),maximumSliceTipDistance:Math.max(...report.map(r=>r.maxSliceTipDistance)),minimumSliceFaceClearance:Math.min(...report.map(r=>r.minimumSliceFaceClearance??Infinity)),minimumHandFaceClearance:Math.min(...report.map(r=>r.minimumHandFaceClearance??Infinity)),maximumBoundFraction:Math.max(...report.map(r=>r.maxBoundFraction)),nonFinite:report.reduce((n,r)=>n+r.nonFinite,0)};
const checks={allReceived:summary.receivers===summary.characters,positiveSkinSupport:summary.minimumLeftSupportVertices>=1&&Number.isFinite(summary.maximumLeftSupportGap)&&summary.maximumLeftSupportGap<=.0041,noTrayPenetration:summary.maximumLeftTrayPenetration===0,noPizzaIntrusion:summary.maximumLeftPizzaVertices===0&&summary.maximumRightPizzaVertices===0,noFiniteLidBodyOrPropIntersections:summary.maximumLidInteriorTriangles===0&&summary.maximumLidFullTriangles===0&&summary.maximumLidVolumeTriangles===0,edibleTipAtLips:summary.maximumSliceTipDistance<=.035,faceClearance:summary.minimumSliceFaceClearance>=.002&&summary.minimumHandFaceClearance>=.002,withinCullingBounds:summary.maximumBoundFraction<=1,finite:summary.nonFinite===0};const passed=Object.values(checks).every(Boolean);
await writeFile(process.argv[3],JSON.stringify({passed,checks,scope:'Actual native-picked lip point, actual both-hand vertices, source rigid props and actual finite 12mm lid/source-body triangle intersections, sampled through six seconds at the explicitly reported interval. Positive support uses source skin vertices and the actual carton-bottom geometry (4mm contact tolerance), excluding rigid nails/bangles. Texture bindings stripped only in memory; no native appearance/FPS acceptance. Interior is 3mm inside the real lid edge; full plane and solid-volume contacts are also retained.',lifecycles,uniqueCharacters:new Set(report.map(r=>r.identity)).size,sampleDtSeconds:sampleDt,annotationInput:{path:process.argv[2],sha256:sha(annotationBytes)},sourceHashes,summary,report},null,2),{flag:'wx'});
console.log(JSON.stringify({output:process.argv[3],passed,checks,summary}));assert.ok(passed,'Actual released actor contact audit failed; inspect output witnesses');

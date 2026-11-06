import {installRodinHandoff} from '../../src/delivery/art/rodin-handoff';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import assets from '../../src/delivery/art/character-assets.json';
import {installActorPerformance} from '../../src/delivery/art/actor-performance';
import {createAuthoredMotionPlayer} from '../../src/delivery/art/authored-motion';
import {TruckInterior} from '../../src/delivery/modules/truck-interior';
import {clearCameraPosition,staticSolidAt} from '../../src/game/spatial-safety';
import {roadster} from '../../src/world/vehicles';
import {Game} from '../../src/game/game';
import type {DeliveryPlayer} from '../../src/delivery/modules/types';
import type {SceneCharacter} from '../../src/delivery/modules/character';

const cameraEvidence:unknown[]=[];
after(async()=>{if(!process.env.ROADSTER_CAMERA_EVIDENCE)return;const sourcePaths=['src/game/game.ts','src/delivery/modules/types.ts','src/delivery/modules/truck-interior.ts','src/delivery/art/actor-performance.ts','src/delivery/art/actor-meal-geometry.ts','src/delivery/art/released-gltf.ts','src/delivery/art/face-annotations.json','tests/v21-fixes/truck-reader-camera.test.ts'];const sourceHashes=await Promise.all(sourcePaths.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));await writeFile(process.env.ROADSTER_CAMERA_EVIDENCE,JSON.stringify({passed:cameraEvidence.length===15,scope:'Exact approved GLB, actual TruckInterior and actual Game camera consumer. Texture bindings removed only in memory. Physical/visibility/projection checks, not native appearance or FPS acceptance.',nativeAppearanceAccepted:false,sourceHashes,cases:cameraEvidence},null,2),{flag:'wx'});});

async function exactPushpa(){
  const entry=assets.assets.find(a=>a.characterId==='pushpa-raj')!,bytes=await readFile('public'+entry.glb.url);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.glb.sha256);
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  // Node needs no texture decoder. Keep the original BIN, mesh topology,
  // skeleton, pose and authored clips; original on-disk bytes stay immutable.
  for(const material of json.materials??[]){for(const key of Object.keys(material))if(key.endsWith('Texture'))delete material[key];for(const key of Object.keys(material.pbrMetallicRoughness??{}))if(key.endsWith('Texture'))delete material.pbrMetallicRoughness[key];}
  delete json.images;delete json.textures;delete json.samplers;
  const text=Buffer.from(JSON.stringify(json)),padding=(4-text.length%4)%4,bin=bytes.subarray(20+jsonLength),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+text.length+padding+bin.length,8);header.writeUInt32LE(text.length+padding,12);header.writeUInt32LE(0x4e4f534a,16);
  const payload=Buffer.concat([header,text,Buffer.alloc(padding,32),bin]);
  return{entry,gltf:await new GLTFLoader().parseAsync(payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength),'')};
}

for(const aspect of [1579/1180,16/9,2.33])for(const [yaw,grade]of [[0,0],[.72,.025],[2.4,-.02],[Math.PI-.0001,.1],[-Math.PI+.0001,-.1]])test(`actual held Pushpa stays frontal and camera-clear through Read/catch/receive/fade at yaw ${yaw}, grade ${grade}, aspect ${aspect}`,async()=>{
  const {entry,gltf}=await exactPushpa(),scene=new THREE.Scene(),hx=Math.sin(yaw),hz=Math.cos(yaw),destination={x:3983,y:1.2,z:-2073};
  const module=new TruckInterior(),events:string[]=[],city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),landmarkSurfaceGrid:new Map()};
  const point=(x:number,z:number,y:number)=>({x:destination.x+hz*x+hx*z,y:destination.y+y+grade*z,z:destination.z-hx*x+hz*z});
  const player:DeliveryPlayer={...point(0,-25,.55),yaw:Math.atan2(-hx,-hz),speed:0,flying:false};
  let actor!:SceneCharacter,performance:{dispose():void}|undefined,motion:ReturnType<typeof createAuthoredMotionPlayer>|undefined,queries=0,storyActive=false,clearanceState:'pending'|'blocked'|'ready'='pending',planningQueries=0;const rejected:any[]=[];
  const pathClear=(from:any,to:any)=>{queries++;const result=clearCameraPosition(city,from,to,{deliverySolids:module.supports}),clear=Math.hypot(result.x-to.x,result.y-to.y,result.z-to.z)<.01;if(!clear)rejected.push({from:from.toArray?.()??from,to:to.toArray?.()??to,fromSolids:module.supports.filter(body=>staticSolidAt(city,from,.35,.35,{deliverySolids:[body]})).map(b=>b.id),toSolids:module.supports.filter(body=>staticSolidAt(city,to,.35,.35,{deliverySolids:[body]})).map(b=>b.id)});return clear;};
  module.setup({scene,destination,player:()=>player,automaticStories:true,canInteract:()=>true,storyActive:()=>storyActive,emit:type=>events.push(type),
    route:[destination,{x:destination.x+hx*1000,y:destination.y+grade*1000,z:destination.z+hz*1000}],cameraPathClear:(from,to)=>{planningQueries++;return clearanceState==='pending'?undefined:clearanceState==='blocked'?false:pathClear(from,to);},
    vehicleSpeedLimit:()=>0, characterFactory(style,_seated,resources){
      if(style!=='pushpa'){const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();group.add(leftArm,rightArm);return{group,leftArm,rightArm,catchPose(){}};}
      const group=gltf.scene,contract=entry.contract;group.userData.releasedCharacter={identity:entry.characterId,glbSha256:entry.glb.sha256};
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();group.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
      for(const g of geometries)resources.geometry(g);for(const m of materials)resources.material(m.uuid,m);
      motion=createAuthoredMotionPlayer(group,gltf.animations,contract.motions,contract.pose.mode==='handoff-clip'?contract.pose:undefined);motion.animate?.(0,'idle',0);
      actor={group,leftArm:group.getObjectByName(contract.nodes.leftArm)as THREE.Group,rightArm:group.getObjectByName(contract.nodes.rightArm)as THREE.Group,catchPoint:group.getObjectByName(contract.nodes.catchPoint),book:group.getObjectByName(contract.nodes.book!),animate:motion.animate,catchPose:motion.catchPose};
      performance=entry.candidate.assetId.endsWith('-rodin-cast-v1')?installRodinHandoff(actor,resources):installActorPerformance(actor,entry.characterId,resources);return actor;
    },
  },{scene:'truckInterior',vehicle:'truck',speed:6});
  const advance=(seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
  advance(4);storyActive=true;Object.assign(player,point(.55,-9,1.55+.55));module.update(.05);Object.assign(player,point(.55,-7,1.55+.55));module.update(.05);Object.assign(player,module.story!.point);advance(.7);
  assert.equal(module.status.canDrop,true,JSON.stringify({status:module.status,player,floor:module.supports[0],story:module.story}));
  assert.equal(module.cameraFocus,undefined,'pending geometry cannot certify a close-up');const pendingQueries=planningQueries;for(let i=0;i<20;i++)assert.equal(module.cameraFocus,undefined);assert.equal(planningQueries,pendingQueries,'pending planning is rate limited');
  clearanceState='blocked';advance(1.1);assert.equal(module.cameraFocus,undefined,'an obstructed shot safely falls back to the ordinary camera');
  clearanceState='ready';advance(1.1);assert.ok(module.cameraFocus,'actual reading actor has a verified frontal shot: '+JSON.stringify(rejected.slice(-5)));
  assert.equal(pathClear(point(1.6,6,1.55+1),point(.9,4.2,1.55+2)),false,'negative control: old aim starts inside the physical study-corner keep-out');
  const parkedState={...player};Object.assign(player,point(.55,2,1.55+.55));assert.equal(module.cameraFocus,undefined,'captured transition at old z2 cannot reuse a too-close camera');Object.assign(player,parkedState);assert.ok(module.cameraFocus,'actual new park owns the close shot');
  module.onDrop();advance(1.2);assert.deepEqual(events,['done']);
  const carMaterial=new THREE.MeshBasicMaterial(),car=roadster(new Proxy({},{get:()=>carMaterial}),{logo:carMaterial,plate:carMaterial});car.cargo.visible=false;
  const carBounds=new THREE.Box3();car.group.updateWorldMatrix(true,true);car.group.traverseVisible(node=>{if(node instanceof THREE.Mesh){node.geometry.computeBoundingBox();carBounds.union(node.geometry.boundingBox!.clone().applyMatrix4(node.matrixWorld));}});
  car.group.position.set(player.x,player.y,player.z);car.group.rotation.set(Math.atan(grade),player.yaw,0,'YXZ');scene.add(car.group);car.group.updateWorldMatrix(true,true);
  let wholeCarPathVertices=0;const pathSolids=module.supports.filter(b=>!['delivery-interior-floor','delivery-interior-ramp'].includes(b.id));const carVertex=new THREE.Vector3();
  for(let step=0;step<=32;step++){const p=point(.55,2-.8*step/32,1.55+.55);car.group.position.set(p.x,p.y,p.z);car.group.updateWorldMatrix(true,true);car.group.traverseVisible(n=>{if(!(n instanceof THREE.Mesh))return;const a=n.geometry.getAttribute('position');for(let v=0;v<a.count;v++){n.getVertexPosition(v,carVertex).applyMatrix4(n.matrixWorld);assert.equal(staticSolidAt(city,carVertex,0,0,{deliverySolids:pathSolids}),false,'literal hero-car body clears all container/reader solids through final rearward park');wholeCarPathVertices++;}});}car.group.position.set(player.x,player.y,player.z);car.group.updateWorldMatrix(true,true);
  const game:any=Object.assign(Object.create(Game.prototype),{cameraPlacementRevision:0,camPos:new THREE.Vector3(),camLook:new THREE.Vector3(),orbitYaw:0,orbitPitch:.38,orbitDist:0,airOrbitPitch:.62,airOrbitDist:0,dragging:false,
    player:{pos:new THREE.Vector3(player.x,player.y,player.z),yaw:player.yaw,forward:new THREE.Vector3(hx,0,hz),speed:0,flying:false,descending:false,jumping:false,lastSupport:player.y-.55,placementRevision:0,bump:0,takeoffAnimating:false},
    story:{cinematic:true,get supports(){return module.supports;},get cameraFocus(){return module.cameraFocus;}},engine:{camera:new THREE.PerspectiveCamera(60,aspect,.3,2500),placeSun(){}},traffic:{hideNear(){}},city:{...city,signs:{update(){}}},placeLampLights(){},
  });
  // Historical builds held the open meal in the left hand. Rodin uses the authored actual catch palm.
  let handSide='Left';
  if(entry.candidate.assetId.endsWith('-rodin-cast-v1'))for(let parent=actor.catchPoint;parent;parent=parent.parent??undefined){if(parent.name==='RightHand'){handSide='Right';break;}if(parent.name==='LeftHand')break;}
  const supportBones=new RegExp('^'+handSide+'(?:Hand|Index|Middle|Ring|Pinky|Thumb)');
  const handSkin:{mesh:THREE.SkinnedMesh;indices:number[]}[]=[];actor.group.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;const si=node.geometry.getAttribute('skinIndex'),sw=node.geometry.getAttribute('skinWeight'),p=node.geometry.getAttribute('position');if(!si||!sw)return;const left=node.skeleton.bones.map(b=>supportBones.test(b.name)),indices:number[]=[];for(let i=0;i<p.count;i++){let w=0;for(let k=0;k<4;k++)if(left[si.getComponent(i,k)])w+=sw.getComponent(i,k);if(w>=.6)indices.push(i);}if(indices.length)handSkin.push({mesh:node,indices});});
  const poses:unknown[]=[];let sampledSeconds=0;
  for(const seconds of [.05,.1,.3,.5,1.1,1.6,2.2,2.8,3.2,3.8,4.5,5.2,6]){
    while(sampledSeconds<seconds-1e-8){module.update(.05);sampledSeconds+=.05;}
    const focus=module.cameraFocus;assert.ok(focus);assert.equal(pathClear(focus.clearanceTarget!,focus.position),true);
    assert.ok(new THREE.Vector3().subVectors(focus.target,focus.position).normalize().dot(new THREE.Vector3().subVectors(focus.clearanceTarget!,focus.position).normalize())>.99999,'optical subject and checked pivot share the same framing ray');
    assert.equal(staticSolidAt(city,focus.position,.35,.35,{deliverySolids:module.supports}),false);
    assert.equal(carBounds.clone().expandByScalar(.35).containsPoint(car.group.worldToLocal(new THREE.Vector3().copy(focus.position))),false,'camera volume clears the exact ordinary Roadster, including its nose/roof');
    const mouth=actor.group.getObjectByName('delivery-mouth-anchor')!.getWorldPosition(new THREE.Vector3()),head=actor.group.getObjectByName('Head')!;
    const front=new THREE.Vector3(0,0,1).transformDirection(head.matrixWorld),view=new THREE.Vector3().subVectors(focus.position,mouth).normalize();assert.ok(front.dot(view)>.78,'camera remains in front of the actual downward-looking face');front.y=0;front.normalize();view.y=0;view.normalize();assert.ok(front.dot(view)>.94,'frontal azimuth follows actual head rather than a fixed truck axis');
    game.camPos.set(0,0,0);game.camLook.set(0,0,0);game.updateCamera(0);assert.ok(game.camPos.distanceTo(focus.position)<.01,'actual Game consumer uses the checked pivot and keeps the optical subject');
    const camera=game.engine.camera as THREE.PerspectiveCamera;camera.updateMatrixWorld(true);
    const carton=actor.group.getObjectByName('received-delivery-carton')??actor.group.getObjectByName('received-pizza-openable-carton')!,hand=actor.group.getObjectByName(handSide+'Hand')!;
    const projections:unknown[]=[];for(const [label,at]of [['mouth',mouth],['hair/head',head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.18,0))],['carton',carton.getWorldPosition(new THREE.Vector3())],['support wrist',hand.getWorldPosition(new THREE.Vector3())]]as const){const p=at.clone().project(camera);assert.ok(Number.isFinite(p.x+p.y+p.z)&&Math.abs(p.x)<.85&&Math.abs(p.y)<.85&&p.z>-1&&p.z<1,JSON.stringify({label,seconds,ndc:p.toArray(),position:focus.position.toArray(),target:focus.target.toArray()}));projections.push({label,world:at.toArray(),ndc:p.toArray()});}
    const ray=new THREE.Raycaster(camera.position,new THREE.Vector3().subVectors(mouth,camera.position).normalize(),0,camera.position.distanceTo(mouth)-.012);
    const environment:THREE.Mesh[]=[];scene.traverseVisible(node=>{if(!(node instanceof THREE.Mesh))return;let cartonPart=false;for(let n:THREE.Object3D|null=node;n;n=n.parent){if(n===carton)cartonPart=true;if(n===actor.group){if(cartonPart)environment.push(node);return;}}environment.push(node);});const hit=ray.intersectObjects(environment,false)[0];
    assert.equal(hit,undefined,'no real container roof, panel, carton or open lid blocks the face');
    let visibleHandSkin=0;const skinPoint=new THREE.Vector3(),projected=new THREE.Vector3(),handRay=new THREE.Raycaster();
    for(const {mesh,indices}of handSkin){mesh.skeleton.update();for(const i of indices){if(visibleHandSkin>10)break;mesh.getVertexPosition(i,skinPoint).applyMatrix4(mesh.matrixWorld);projected.copy(skinPoint).project(camera);if(Math.abs(projected.x)>=.85||Math.abs(projected.y)>=.85)continue;
      handRay.set(camera.position,new THREE.Vector3().subVectors(skinPoint,camera.position).normalize());handRay.far=camera.position.distanceTo(skinPoint)-.004;if(!handRay.intersectObject(carton,true).length)visibleHandSkin++;
    }}
    assert.ok(visibleHandSkin>10,'actual supporting-hand skin is visible beside/below the real carton, not only an in-frame wrist origin');
    let maximumCartonNDC=0,maximumHeadNDC=0,cartonVertices=0,headVertices=0;const framePoint=new THREE.Vector3();
    carton.traverseVisible(n=>{if(!(n instanceof THREE.Mesh))return;const a=n.geometry.getAttribute('position');for(let v=0;v<a.count;v++){n.getVertexPosition(v,framePoint).applyMatrix4(n.matrixWorld).project(camera);maximumCartonNDC=Math.max(maximumCartonNDC,Math.abs(framePoint.x),Math.abs(framePoint.y));cartonVertices++;assert.ok(framePoint.z>-1&&framePoint.z<1&&Math.abs(framePoint.x)<.90&&Math.abs(framePoint.y)<.90,JSON.stringify({problem:'carton-frame',yaw,grade,seconds,ndc:framePoint.toArray()}));}});
    actor.group.traverseVisible(n=>{if(!(n instanceof THREE.Mesh))return;const si=n.geometry.getAttribute('skinIndex'),sw=n.geometry.getAttribute('skinWeight'),a=n.geometry.getAttribute('position');let rigidHead=false;for(let p=n.parent;p;p=p.parent)if(p.name==='Head')rigidHead=true;if(n instanceof THREE.SkinnedMesh)n.skeleton.update();else if(!rigidHead)return;for(let v=0;v<a.count;v++){let weight=rigidHead?1:0;if(n instanceof THREE.SkinnedMesh&&si&&sw)for(let k=0;k<4;k++)if(n.skeleton.bones[si.getComponent(v,k)]?.name==='Head')weight+=sw.getComponent(v,k);if(weight<=.5)continue;n.getVertexPosition(v,framePoint).applyMatrix4(n.matrixWorld).project(camera);maximumHeadNDC=Math.max(maximumHeadNDC,Math.abs(framePoint.x),Math.abs(framePoint.y));headVertices++;assert.ok(framePoint.z>-1&&framePoint.z<1&&Math.abs(framePoint.x)<.90&&Math.abs(framePoint.y)<.90,JSON.stringify({problem:'literal-head-frame',yaw,grade,seconds,ndc:framePoint.toArray()}));}});
    assert.ok(headVertices>100,'Literal rigid+skinned source head coverage must be nonempty');projections.push({maximumCartonNDC,maximumHeadNDC,cartonVertices,headVertices});
    poses.push({seconds,position:focus.position.toArray(),target:focus.target.toArray(),clearanceTarget:focus.clearanceTarget.toArray(),actualGamePosition:game.camPos.toArray(),actualGameOpticalTarget:game.camLook.toArray(),fov:camera.fov,projections,visibleHandSkin,faceRenderObstruction:false,truckCameraVolumeCollision:false,roadsterCameraVolumeCollision:false});
  }
  const focus=module.cameraFocus!;game.camPos.copy(new THREE.Vector3().copy(player).addScaledVector(new THREE.Vector3(hx,0,hz),-3.7).add(new THREE.Vector3(0,.8,0)));game.camLook.copy(new THREE.Vector3().copy(player).add(new THREE.Vector3(0,1.4,0)));
  for(let i=0;i<180;i++){game.updateCamera(1/60);assert.equal(staticSolidAt(city,game.camPos,.35,.35,{deliverySolids:module.supports}),false,'smoothed/cut story transition stays outside truck solids');assert.equal(carBounds.clone().expandByScalar(.35).containsPoint(car.group.worldToLocal(game.camPos.clone())),false,'transition cannot pass through the real parked Roadster');}
  assert.ok(game.camPos.distanceTo(focus.position)<.01);assert.ok(game.camLook.distanceTo(focus.target)<.01,'smoothing finishes on the actual optical face/carton subject');
  const count=queries;for(let i=0;i<120;i++)assert.ok(module.cameraFocus);assert.equal(queries,count,'held camera plans reuse bounded clear geometry instead of rescanning every frame');
  player.speed=1;assert.equal(module.cameraFocus,undefined);player.speed=0;player.flying=true;assert.equal(module.cameraFocus,undefined);
  performance?.dispose();motion?.dispose();module.teardown();assert.equal(module.cameraFocus,undefined);const carGeometry=new Set<THREE.BufferGeometry>();car.group.traverse(node=>{if(node instanceof THREE.Mesh)carGeometry.add(node.geometry);});for(const geometry of carGeometry)geometry.dispose();carMaterial.dispose();
  cameraEvidence.push({aspect,wholeCarPathVertices,capturedOldParkCameraGated:true,yaw,grade,assetSha256:entry.glb.sha256,poses,transitionFrames:180,pendingAndBlockedFailClosed:true,heldQueriesCached:true,drivingAndFlightRelease:true});
});

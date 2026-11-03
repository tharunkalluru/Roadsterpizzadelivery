import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AngleParking, ClassroomHandoff, GateDelivery, RopeBucket, WalkingHandoff, WeddingHandoff } from '../../src/delivery/modules/street-scenes';
import type { DeliveryModule, DeliveryModuleContext, DeliveryPlayer } from '../../src/delivery/modules/types';

test('a stopped classroom handoff uses its visible courtyard lamp without changing driving/flight framing or adding lights',()=>{
  const scene=new THREE.Scene(),group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group(),catchPoint=new THREE.Object3D();group.add(leftArm,rightArm,catchPoint);
  group.userData.releasedCharacter={characterId:'arjun-reddy'};
  const p:DeliveryPlayer={x:0,y:.55,z:0,yaw:0,speed:0},module=new ClassroomHandoff();
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>p,emit(){},characterFactory:()=>({group,leftArm,rightArm,catchPoint,catchPose(){}})},{useExistingFacade:true});
  module.update(.05);assert.equal(module.status.canDrop,true);assert.ok(module.cameraFocus);assert.equal(module.cameraFocus!.context,'stationary-handoff');assert.equal(module.intentionalStop,true);assert.equal(module.headlightGain,.02);assert.equal(module.hideWorldGuidance,true);
  assert.ok(scene.getObjectByName('delivery-classroom-courtyard-lamp'));assert.equal(scene.getObjectsByProperty('isPointLight',true).length,0);
  const lamp=module.sceneLamp!;assert.ok(Math.abs(lamp.position.x+3.6)<1e-6&&Math.abs(lamp.position.y-2.91)<1e-6&&Math.abs(lamp.position.z+1.7)<1e-6);
  p.speed=1;assert.equal(module.cameraFocus,undefined);assert.equal(module.hideWorldGuidance,false);p.speed=0;p.jumping=true;assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);assert.equal(module.intentionalStop,false);
  p.jumping=false;group.userData.characterRelease='withheld';assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);module.teardown();assert.equal(scene.children.length,0);
});

function fixture() {
  const scene = new THREE.Scene();
  const player: DeliveryPlayer = { x: 100, y: 4, z: 300, yaw: 0, speed: 0, flying: false };
  const events: { type: string; reason?: string }[] = [];
  const cues: string[] = [];
  const ctx: DeliveryModuleContext = {
    scene, player: () => player, destination: { x: 100, y: 4, z: 200, label: 'Street scene' },
    emit: (type, detail) => events.push({ type, ...detail }), cue: cue => cues.push(cue),
  };
  return { scene, player, events, cues, ctx };
}
const advance = (module: DeliveryModule, seconds: number) => { for (let n = 0; n < Math.ceil(seconds / .05); n++) module.update(.05); };
const doneCount = (events: { type: string }[]) => events.filter(event => event.type === 'done').length;

test('Paradise bucket lowers only near the player, accepts a visible pizza and completes only after returning to the roof', () => {
  const f = fixture(), module = new RopeBucket(); module.setup(f.ctx, {});
  const bucket = f.scene.getObjectByName('delivery-rope-bucket')!, rope = f.scene.getObjectByName('delivery-bucket-rope')!;
  const initial = bucket.position.y; advance(module, 7);
  assert.equal(bucket.position.y, initial, 'a distant player must not lower the bucket');
  module.onDrop(); assert.equal(doneCount(f.events), 0); assert.equal(f.events.at(-1)?.type, 'failed');
  Object.assign(f.player, { x: module.target.x, y: module.target.y, z: module.target.z + 4 });
  advance(module, 5.5);
  assert.ok(bucket.position.y < initial / 2); assert.equal(module.status.canDrop, true);
  assert.ok(rope.scale.y > 10, 'the cable visibly stretches down from its roof winch');
  module.onDrop(); const pizza = f.scene.getObjectByName('delivery-scene-pizza')!;
  assert.equal(pizza.visible, true); assert.equal(doneCount(f.events), 0);
  advance(module, .5); assert.equal(doneCount(f.events), 0);
  advance(module, .4); assert.equal(pizza.visible, true, 'pizza stays in the open bucket during the lift');
  const low = bucket.position.y; advance(module, 1);
  assert.ok(bucket.position.y > low); assert.ok(Math.abs(pizza.position.y - bucket.position.y - .23) < .001);
  assert.equal(doneCount(f.events), 0, 'placing the pizza is not instant completion');
  advance(module, 5); assert.equal(doneCount(f.events), 1); advance(module, 3); assert.equal(doneCount(f.events), 1);
  module.teardown(); assert.equal(f.scene.children.length, 0);
});

for (const theme of ['haunted', 'college', 'villa', 'salaar']) {
  test(`${theme} scene requires deliberate nearby delivery, remains retryable and shows a physical pizza pass`, () => {
    const f = fixture(), module = new GateDelivery(); module.setup(f.ctx, { theme, villaNumber: 79 });
    module.update(.05); module.onDrop(); assert.equal(doneCount(f.events), 0); assert.equal(f.events.at(-1)?.type, 'failed');
    Object.assign(f.player, { x: module.target.x, y: module.target.y, z: module.target.z, speed: 7 });
    module.update(.05); assert.equal(module.status.canDrop, false, 'no handover at road speed');
    f.player.speed = 0; module.update(.05); assert.equal(module.status.canDrop, true);
    assert.equal(doneCount(f.events), 0, 'arriving does not auto-complete');
    module.onDrop(); module.onDrop(); assert.equal(doneCount(f.events), 0);
    assert.equal(f.scene.getObjectByName('delivery-scene-pizza')!.visible, true);
    advance(module, .95); assert.equal(doneCount(f.events), 1); assert.ok(f.cues.includes('throw'));
    advance(module, 2); module.onDrop(); assert.equal(doneCount(f.events), 1);
    module.teardown(); assert.equal(f.scene.children.length, 0);
  });
}

test('Salaar heavy gates slide apart with matching physical colliders and leave a car-sized central entrance', () => {
  const f = fixture(), module = new GateDelivery(); module.setup(f.ctx, { theme: 'salaar' });
  const gateBodies = module.supports.filter(body => body.id.startsWith('delivery-sliding-gate:'));
  assert.equal(gateBodies.length, 2);
  assert.ok(gateBodies.every(body => Math.abs(body.x - 100) - body.halfWidth < 1));
  Object.assign(f.player, { x: 100, z: 220 }); advance(module, 2.6);
  const doors: THREE.Object3D[] = []; f.scene.traverse(object => { if (object.name === 'delivery-salaar-sliding-gate') doors.push(object); });
  assert.equal(doors.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(gateBodies[i].x - 100) - gateBodies[i].halfWidth > 10);
    assert.equal(gateBodies[i].x, 100 + doors[i].position.x, 'colliders follow exactly what is drawn');
  }
  assert.ok(!f.scene.getObjectByName('delivery-character-prabhas'), 'this scene does not create a Prabhas stand-in');
  module.teardown();
});

test('Jessie handover needs an alongside moving car and its customer target never recycles or teleports', () => {
  const f = fixture(), module = new WalkingHandoff(); module.setup(f.ctx, { walkLength: 30, walkSpeed: 1.1 });
  let last = { ...module.target };
  for (let n = 0; n < 1700; n++) {
    module.update(.05);
    assert.ok(Math.abs(module.target.z - last.z) <= 1.11 * .05, 'target movement remains bounded at turnarounds too');
    last = { ...module.target };
  }
  // Return to the initial forward direction for an unambiguous handover.
  module.setup(f.ctx, { walkLength: 30, walkSpeed: 1.1 }); advance(module, 8);
  Object.assign(f.player, { x: module.target.x + 3, y: module.target.y, z: module.target.z, yaw: 0, speed: 0 });
  module.update(.05); assert.equal(module.status.canDrop, false, 'a parked car does not count as following');
  f.player.speed = 1.2; f.player.yaw = Math.PI; module.update(.05); assert.equal(module.status.canDrop, false, 'wrong direction is not following');
  f.player.speed = -1.2; f.player.yaw = 0; module.update(.05); assert.equal(module.status.canDrop, false, 'reversing away while facing her direction is not following');
  module.onDrop(); assert.equal(f.events.at(-1)?.type, 'failed');
  f.player.yaw = 0; f.player.speed = 1.2; module.update(.05); assert.equal(module.status.canDrop, true);
  module.onDrop(); advance(module, .95); assert.equal(doneCount(f.events), 1);
  module.teardown(); assert.equal(f.scene.children.length, 0);
});

test('village wedding uses a bounded animated procession and a retryable, speed-limited handover', () => {
  const f = fixture(), module = new WeddingHandoff(); module.setup(f.ctx, {});
  const crowd = f.scene.getObjectByName('delivery-wedding-crowd') as THREE.Group,templates=crowd.children as THREE.InstancedMesh[];
  assert.equal(templates.reduce((n,m)=>n+m.count,0),16);assert.equal(templates.length,4);const before = new THREE.Matrix4(); templates[0].getMatrixAt(0, before);
  advance(module, 1); const after = new THREE.Matrix4(); templates[0].getMatrixAt(0, after);
  assert.notDeepEqual(before.elements, after.elements); assert.equal(templates.reduce((n,m)=>n+m.count,0),16);
  Object.assign(f.player, { x: module.target.x + 3, y: module.target.y, z: module.target.z, speed: 10 });
  module.update(.05); module.onDrop(); assert.equal(f.events.at(-1)?.type, 'failed');
  f.player.speed = 0; module.update(.05); assert.equal(module.status.canDrop, true); assert.equal(doneCount(f.events), 0);
  module.onDrop(); advance(module, .95); assert.equal(doneCount(f.events), 1);
  module.teardown(); assert.equal(f.scene.children.length, 0);
});

test('Sukumar parking accepts an eight-degree tolerance but rejects wrong orientation and speed', () => {
  const f = fixture(), module = new AngleParking(); module.setup(f.ctx, {});
  Object.assign(f.player, { x: module.target.x, y: module.target.y, z: module.target.z, yaw: 0, speed: 0 });
  module.update(.05); assert.equal(module.status.canDrop, false); module.onDrop(); assert.equal(f.events.at(-1)?.type, 'failed');
  f.player.yaw = Math.PI / 4 + 7 * Math.PI / 180; module.update(.05); assert.equal(module.status.canDrop, true);
  f.player.yaw = Math.PI / 4 + 9 * Math.PI / 180; module.update(.05); assert.equal(module.status.canDrop, false);
  f.player.yaw = Math.PI / 4 + Math.PI * 2; f.player.speed = 2; module.update(.05); assert.equal(module.status.canDrop, false);
  f.player.speed = 0; module.update(.05); assert.equal(module.status.canDrop, true, 'wrapped headings are accepted');assert.equal(module.intentionalStop,true);
  f.player.x += Math.cos(Math.PI / 4) * 2.2; f.player.z -= Math.sin(Math.PI / 4) * 2.2;
  module.update(.05); assert.equal(module.status.canDrop, false, 'correct yaw in the adjacent bay is not parking inside this marked bay');
  f.player.x = module.target.x; f.player.z = module.target.z; module.update(.05);
  assert.equal(doneCount(f.events), 0); module.onDrop(); advance(module, .95); assert.equal(doneCount(f.events), 1);assert.equal(module.intentionalStop,true,'the retained completed bay is still a legitimate stop');
  module.teardown();
});

test('medical college leaves a level, car-accessible courtyard and requires an explicit handover', () => {
  const f = fixture(), module = new ClassroomHandoff(); module.setup(f.ctx, {});
  // No structure crosses the 8m-wide approach at a normal car's height.
  for (let z = 210; z >= 195; z -= 2) {
    for (const body of module.supports) {
      const blocksCar = Math.abs(body.x - 100) <= body.halfWidth + 2 && Math.abs(body.z - z) <= body.halfLength + 2
        && body.bottom < 6 && body.roof > 4.1;
      assert.equal(blocksCar, false, `a structural collider blocks the courtyard at z=${z}`);
    }
  }
  module.onDrop(); assert.equal(f.events.at(-1)?.type, 'failed');
  Object.assign(f.player, { x: module.target.x, y: module.target.y, z: module.target.z }); module.update(.05);
  assert.equal(module.status.canDrop, true); assert.equal(doneCount(f.events), 0);
  module.onDrop(); advance(module, .95); assert.equal(doneCount(f.events), 1); module.teardown();
});

test('all street scenes use opaque, unlit local scenery and release their buffers on teardown and reuse', () => {
  const variants = [new RopeBucket(), new GateDelivery(), new WalkingHandoff(), new WeddingHandoff(), new AngleParking(), new ClassroomHandoff()];
  for (const module of variants) {
    const f = fixture(); module.setup(f.ctx, {});
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); let geometryDisposals = 0, materialDisposals = 0;
    let staticDraws = 0;
    f.scene.traverse(object => {
      assert.ok(!(object instanceof THREE.Light), 'scene dressing must not add per-object lights');
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.name.includes('character')) staticDraws++;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material); assert.equal(material.transparent, false); assert.equal(material.opacity, 1);
      }
    });
    assert.ok(staticDraws < 42, `${module.constructor.name} should batch its scenery, got ${staticDraws} draws`);
    for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
    for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
    module.teardown();
    assert.equal(geometryDisposals, geometries.size, `${module.constructor.name} leaked geometry`);
    assert.equal(materialDisposals, materials.size, `${module.constructor.name} leaked materials`);
    assert.equal(f.scene.children.length, 0);
    module.setup(f.ctx, {}); assert.equal(f.scene.children.length, 1); module.teardown(); assert.equal(f.scene.children.length, 0);
  }
});

test('street scenes respect an external interaction gate throughout an in-flight pizza pass', () => {
  const f = fixture(), module = new ClassroomHandoff(); let enabled = false; f.ctx.canInteract = () => enabled;
  module.setup(f.ctx, {}); Object.assign(f.player, module.target); module.update(.05); module.onDrop();
  assert.equal(module.status.canDrop, false); assert.equal(doneCount(f.events), 0);
  enabled = true; module.update(.05); module.onDrop(); advance(module, .3);
  enabled = false; advance(module, 2); assert.equal(doneCount(f.events), 0);
  enabled = true; advance(module, .6); assert.equal(doneCount(f.events), 1); module.teardown();
});

test('street handovers require a landed car and cannot complete while hovering, descending or jumping', () => {
  for (const module of [new RopeBucket(), new GateDelivery(), new WalkingHandoff(), new WeddingHandoff(), new AngleParking(), new ClassroomHandoff()]) {
    const f = fixture(); module.setup(f.ctx, {});
    Object.assign(f.player, { x: module.target.x, y: module.target.y, z: module.target.z });
    if (module instanceof RopeBucket) advance(module, 6);
    if (module instanceof WalkingHandoff) { advance(module, 6); Object.assign(f.player, { x: module.target.x + 3, z: module.target.z, speed: 1.1 }); }
    if (module instanceof AngleParking) f.player.yaw = Math.PI / 4;
    for (const flag of ['flying', 'descending', 'jumping'] as const) {
      f.player[flag] = true; module.update(.05); assert.equal(module.status.canDrop, false, `${module.constructor.name} allowed ${flag}`);
      module.onDrop(); assert.equal(doneCount(f.events), 0); f.player[flag] = false;
    }
    module.teardown();
  }
});

test('authored Jessie locomotion receives actual walking speed without procedural model bob or arm swings', () => {
  const f = fixture(), module = new WalkingHandoff(); module.setup(f.ctx, { walkSpeed: .7 });
  const receiver = (module as any).receiver, motions: any[] = [];
  receiver.animate = (dt: number, motion: string, speed: number) => motions.push({ dt, motion, speed });
  advance(module, 10);
  assert.ok(motions.some(motion => motion.motion === 'walk' && motion.speed > .04 && motion.speed <= .71));
  assert.equal(receiver.group.position.y, 0); assert.equal(receiver.leftArm.rotation.x, 0); assert.equal(receiver.rightArm.rotation.x, 0);
  Object.assign(f.player, { x: module.target.x + 3, z: module.target.z, y: module.target.y, yaw: 0, speed: .7 });
  module.update(.05); assert.equal(module.status.canDrop, true); module.onDrop();
  const count = motions.length; advance(module, .4); assert.ok(motions.length > count, 'walking must continue while handing over');
  module.teardown();
});

test('authored Bhanumathi dance continues during the moving procession without substituting whole-model bobbing', () => {
  const f = fixture(), module = new WeddingHandoff(); module.setup(f.ctx, {});
  const receiver = (module as any).receiver, motions: any[] = [];
  receiver.animate = (dt: number, motion: string, speed: number) => motions.push({ dt, motion, speed });
  const startZ = module.target.z; advance(module, 2);
  assert.ok(motions.length > 10); assert.ok(motions.every(motion => motion.motion === 'dance' && motion.dt > 0 && motion.speed === 1));
  assert.equal(receiver.group.position.y, 0); assert.equal(receiver.group.rotation.y, 0); assert.notEqual(module.target.z, startZ);
  module.teardown();
});

test('the moving wedding has a readable stopped handoff and borrows the nearest actual static fixture on a rotated street',()=>{
 const f=fixture(),module=new WeddingHandoff(),yaw=Math.PI/3;
 assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);
 module.setup(f.ctx,{useExistingStreet:true,streetYaw:yaw});
 const actor=(module as any).receiver;Object.assign(f.player,module.target);module.update(.05);
 assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined,'withheld characters cannot attract lighting');
 actor.group.visible=true;actor.group.userData.characterRelease='synthetic-visible-fixture';actor.animate=()=>{};
 Object.assign(f.player,module.target);module.update(.05);
 const focus=module.cameraFocus!,request=module.sceneLamp!,position=request.position;
 assert.equal(focus.context,'stationary-handoff');assert.equal(module.intentionalStop,true);assert.equal(module.headlightGain,.02);assert.equal(module.hideWorldGuidance,true);
 assert.equal(request.kind,'porch');assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0);
 const root=f.scene.getObjectByName('delivery-setpiece')!,localTarget=root.worldToLocal(focus.target.clone());
 assert.ok(Math.abs(localTarget.x)<1e-8);assert.ok(Math.abs(localTarget.z-actor.group.position.z)<1e-8);
 // Read the actual packed light-emitter vertices in world space. The request
 // must choose one fixed fixture, including the real existing-street yaw.
 const fixtureMesh=f.scene.getObjectsByProperty('name','delivery-village-procession').find(object=>object instanceof THREE.Mesh&&!Array.isArray(object.material)&&(object.material as THREE.MeshBasicMaterial).color.getHexString()==='ffe0b0') as THREE.Mesh;
 assert.ok(fixtureMesh);f.scene.updateMatrixWorld(true);const vertices=fixtureMesh.geometry.getAttribute('position'),point=new THREE.Vector3(),centers:THREE.Vector3[]=[];
 for(const z of [-13,-7,-1,5]){
   const box=new THREE.Box3();for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i);if(Math.abs(point.z-z)<.1)box.expandByPoint(point);}
   assert.equal(box.isEmpty(),false);centers.push(root.localToWorld(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0,-.03,0)));
 }
 assert.ok(centers.some(center=>center.distanceTo(new THREE.Vector3(position.x,position.y,position.z))<1e-5));
 const first=new THREE.Vector3(position.x,position.y,position.z);advance(module,18);Object.assign(f.player,module.target);
 assert.equal(module.sceneLamp,request);assert.equal(module.sceneLamp!.position,position);assert.ok(first.distanceTo(new THREE.Vector3(position.x,position.y,position.z))>5,'a moving procession switches among fixed lamps');
 assert.ok(centers.some(center=>center.distanceTo(new THREE.Vector3(position.x,position.y,position.z))<1e-5));
 f.player.speed=1;assert.equal(module.cameraFocus,undefined);assert.equal(module.hideWorldGuidance,false);
 f.player.speed=0;f.player.flying=true;assert.equal(module.cameraFocus,undefined);assert.equal(module.intentionalStop,false);assert.equal(module.headlightGain,undefined);
 f.player.flying=false;module.update(.05);module.onDrop();advance(module,1);Object.assign(f.player,module.target);
 assert.equal(doneCount(f.events),1);assert.ok(module.cameraFocus,'the completed actor remains inspectable');assert.equal(module.intentionalStop,true);
 f.player.z+=50;assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);assert.equal(module.headlightGain,undefined);
 module.teardown();assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);assert.equal(f.scene.children.length,0);
});

test('the compact medical-college treatment contains an open physical classroom doorway and keeps the driving approach clear', () => {
  const f = fixture(), module = new ClassroomHandoff(); module.setup(f.ctx, { useExistingFacade: true });
  assert.ok(f.scene.getObjectByName('delivery-medical-classroom-doorway'));
  assert.ok(f.scene.getObjectByName('delivery-classroom-open-door'));
  assert.equal(module.supports.length, 4, 'a classroom facade has wall wings and corridor sides');
  const bounds=new THREE.Box3().setFromObject(f.scene);assert.ok(bounds.max.x-bounds.min.x>=15);assert.ok(bounds.max.z-bounds.min.z>=6);
  for (let z=module.target.z;z<=module.target.z+14;z+=1)for (const body of module.supports) {
    const blocked=Math.abs(body.x-module.target.x)<=body.halfWidth+1.2&&Math.abs(body.z-z)<=body.halfLength+2.4&&body.bottom<f.player.y+2&&body.roof>f.player.y+.1;
    assert.equal(blocked,false,'a classroom wall blocks the central driving approach');
  }
  module.teardown();
});

test('compact college and villa approaches retain complete architectural frontage without blocking the handoff lane',()=>{
  for(const theme of ['college','villa']){
    const f=fixture(),module=new GateDelivery();module.setup(f.ctx,{theme,useExistingFacade:true,villaNumber:79,sign:'NIZAM COLLEGE'});
    const bounds=new THREE.Box3().setFromObject(f.scene);assert.ok(bounds.max.x-bounds.min.x>=15,'a labeled post is not a campus or villa frontage');
    assert.ok(bounds.max.z-bounds.min.z>=9,'frontage needs an actual covered entry depth');assert.ok(bounds.max.y-bounds.min.y>=6.8);
    for(let z=module.target.z;z<=module.target.z+12;z+=1)for(const body of module.supports){
      const blocked=Math.abs(body.x-module.target.x)<=body.halfWidth+1.2&&Math.abs(body.z-z)<=body.halfLength+2.4&&body.bottom<f.player.y+2&&body.roof>f.player.y+.1;
      assert.equal(blocked,false,`${theme} frontage blocks the central car approach`);
    }
    module.teardown();assert.equal(f.scene.children.length,0);
  }
});
test('a grounded gate handoff frames its visible customer and borrows a real entrance fixture without extra lights',()=>{
 for(const theme of ['college','villa']){
  const f=fixture(),module=new GateDelivery();module.setup(f.ctx,{theme,useExistingFacade:true});
  const actor=(module as any).receiver;assert.equal(module.cameraFocus,undefined,'withheld likenesses have no camera target');actor.group.visible=true;
  actor.group.userData.characterRelease='test-approved-fixture';
  Object.assign(f.player,module.target);module.update(.05);const focus=module.cameraFocus!,lamp=module.sceneLamp!;
  assert.equal(focus.context,'stationary-handoff');assert.ok(focus.position.z>focus.target.z+4);assert.ok(focus.position.x<module.target.x,'camera remains outside the parked car footprint');
  assert.equal(lamp.kind,theme==='villa'?'porch':'reading');assert.ok(lamp.position.z>focus.target.z,'a real front-side fixture lights the face');assert.ok(f.scene.getObjectByName('delivery-entrance-light'));
  assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0);
  f.player.speed=2;assert.equal(module.cameraFocus,undefined);f.player.speed=0;f.player.flying=true;assert.equal(module.cameraFocus,undefined);f.player.flying=false;
  f.player.z+=40;assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);module.teardown();assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);
 }
});

test('the static haunted receiver is readable from outside its bars without changing driving or adding a lamp',()=>{
 const f=fixture(),module=new GateDelivery();
 assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);assert.equal(module.sceneLamp,undefined);
 module.setup(f.ctx,{theme:'haunted',sceneScale:.55});
 const actor=(module as any).receiver;actor.group.visible=true;actor.group.userData.characterRelease='synthetic-visible-static-fixture';
 Object.assign(f.player,module.target);module.update(.05);
 const focus=module.cameraFocus!,lamp=module.sceneLamp!;
 assert.equal(focus.context,'stationary-handoff');assert.ok(focus.position.z>f.ctx.destination.z-5*.55,'camera stays outside the actual gate plane');
 assert.equal(module.headlightGain,.02);assert.equal(module.intentionalStop,true);assert.equal(lamp.kind,'lantern');
 assert.equal(module.hideWorldGuidance,true);assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,false,'the parked haunted close-up has no cyan ring bloom');
 assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0,'the existing engine light is borrowed, not a new scene light');
 // Measure the existing packed lantern glass, not a second copy of the
 // fixture-position formula. It must remain correct after X/Z-only scaling.
 const architecture=f.scene.getObjectsByProperty('name','delivery-haunted-architecture').find(object=>{
   if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return false;
   return(object.material as THREE.MeshBasicMaterial).color.getHexString()==='d4a759';
 }) as THREE.Mesh;
 assert.ok(architecture);f.scene.updateMatrixWorld(true);const positions=architecture.geometry.getAttribute('position');
 const glass=new THREE.Box3(),point=new THREE.Vector3();let vertices=0;
 for(let i=0;i<positions.count;i++){
   point.fromBufferAttribute(positions,i).applyMatrix4(architecture.matrixWorld);
   if(point.x<f.ctx.destination.x){glass.expandByPoint(point);vertices++;}
 }
 assert.ok(vertices>0);assert.ok(glass.getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3(lamp.position.x,lamp.position.y,lamp.position.z))<1e-5);
 f.player.speed=1;module.update(.05);assert.equal(module.cameraFocus,undefined);assert.equal(module.hideWorldGuidance,false);assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,true,'guidance returns when driving resumes');f.player.speed=0;f.player.flying=true;
 assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);assert.equal(module.intentionalStop,false);
 f.player.flying=false;actor.group.userData.characterRelease='withheld';assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);assert.equal(module.headlightGain,undefined);
 actor.group.userData.characterRelease='synthetic-visible-static-fixture';module.onDrop();advance(module,1);
 assert.equal(doneCount(f.events),1);assert.equal(module.intentionalStop,true,'the retained gate remains a legitimate parked stop');
 f.player.z+=50;assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);
 module.teardown();assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);assert.equal(f.scene.children.length,0);
});

test('the actual aligned studio handoff reduces local beam glare and uses a physical pooled fixture without changing parking rules',()=>{
 const f=fixture(),module=new AngleParking();module.setup(f.ctx,{parkingYaw:Math.PI/4});
 const actor=(module as any).receiver;Object.assign(f.player,module.target,{yaw:Math.PI/4});module.update(.05);
 assert.equal(module.cameraFocus,undefined);assert.equal(module.sceneLamp,undefined);assert.equal(module.headlightGain,undefined,'withheld actors cannot attract camera or light');
 actor.group.visible=true;actor.group.userData.characterRelease='synthetic-visible-fixture';module.update(.05);const lamp=module.sceneLamp!,focus=module.cameraFocus!;
 assert.equal(module.status.canDrop,true);assert.equal(module.headlightGain,.02);assert.equal(focus.context,'stationary-handoff');
 assert.ok(focus.position.x<module.target.x&&focus.position.z<module.target.z,'close camera stays ahead of the parked car');
 assert.equal(lamp.kind,'reading');assert.ok(lamp.position.z>focus.target.z);assert.ok(f.scene.getObjectByName('delivery-studio-reading-light'));
 assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0,'uses existing engine light pool');assert.equal(module.sceneLamp,lamp);
 f.player.yaw=0;module.update(.05);assert.equal(module.status.canDrop,false);assert.equal(module.cameraFocus,undefined,'wrong-angle parking stays visible under ordinary chase');
 f.player.yaw=Math.PI/4;f.player.speed=2;module.update(.05);assert.equal(module.cameraFocus,undefined);
 f.player.speed=0;f.player.flying=true;module.update(.05);assert.equal(module.cameraFocus,undefined);assert.equal(module.headlightGain,undefined);
 f.player.flying=false;f.player.z+=40;assert.equal(module.sceneLamp,undefined);assert.equal(module.headlightGain,undefined);
 module.teardown();assert.equal(module.sceneLamp,undefined);assert.equal(module.cameraFocus,undefined);assert.equal(f.scene.children.length,0);
});

test('a walking route lights the next real curb fixture ahead without adding lights or retaining a departed player',()=>{
 const f=fixture(),module=new WalkingHandoff();module.setup(f.ctx,{walkLength:24,walkSpeed:.7});
 assert.equal(module.sceneLamp,undefined);
 Object.assign(f.player,module.target);module.update(.05);const request=module.sceneLamp!,position=request.position,initialZ=position.z;
 assert.equal(request.kind,'street-scene');assert.ok(Math.abs(position.x-(f.ctx.destination.x-4.06))<1e-6);
 assert.ok(Math.abs(position.y-(f.ctx.destination.y+4.01))<1e-6);
 assert.ok(position.z<module.target.z,'the active fixture is ahead of her forward-facing side');
 advance(module,35);Object.assign(f.player,module.target);
 assert.equal(module.sceneLamp,request);assert.equal(module.sceneLamp!.position,position);
 assert.equal(Math.round(initialZ-position.z),12,'the light selects an actual static post along the route');
 advance(module,30);Object.assign(f.player,module.target);assert.ok(module.sceneLamp!.position.z>module.target.z,'the next fixture follows the return direction');
 assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0,'the route owns no extra renderer lights');
 f.player.z+=40;assert.equal(module.sceneLamp,undefined);module.teardown();assert.equal(module.sceneLamp,undefined);
});
test('completed haunted property remains physical until the car has left the delivery area', () => {
  const f = fixture(), module = new GateDelivery(); let targets = 0; f.ctx.onTarget = () => targets++;
  module.setup(f.ctx, { theme: 'haunted' }); Object.assign(f.player, module.target); module.update(.05); module.onDrop(); advance(module, 1);
  assert.equal(doneCount(f.events), 1); assert.equal(module.exitPending, true); assert.match(module.status.instruction, /^Leave/);
  const count = targets; advance(module, 2); module.onDrop();
  assert.equal(targets, count, 'a completed scene must not replace the next campaign navigation'); assert.equal(doneCount(f.events), 1);
  assert.ok(f.scene.getObjectByName('delivery-haunted-architecture')); assert.equal(module.status.canDrop, false);
  const carton=f.scene.getObjectByName('delivery-pizza-box') as THREE.Mesh;
  assert.equal(carton.parent!.visible,true,'a pizza left at the gate remains after completion');
  carton.updateWorldMatrix(true,false);carton.geometry.computeBoundingBox();
  const underside=carton.localToWorld(new THREE.Vector3(0,carton.geometry.boundingBox!.min.y,0));
  assert.ok(Math.abs(underside.y-f.ctx.destination.y)<1e-6,'the physical carton rests on the paving');
  assert.ok(Math.abs(underside.x-f.player.x)>1.5,'the carton is beside the full car footprint');
  f.player.z = module.target.z + 46; module.update(.05); assert.equal(module.exitPending, false); module.teardown();
});

test('Salaar retains its complete courtyard and open gates until the entire car exits, including compact placement', () => {
  for (const scale of [1, .55]) {
    const f = fixture(), module = new GateDelivery(); module.setup(f.ctx, { theme: 'salaar', sceneScale: scale });
    Object.assign(f.player, { x: f.ctx.destination.x, y: f.ctx.destination.y, z: f.ctx.destination.z - 5 * scale });
    advance(module, 3); assert.equal(module.status.canDrop, false, 'straddling the gate is not an inner-courtyard delivery');
    Object.assign(f.player, module.target); module.update(.05); assert.equal(module.status.canDrop, true); module.onDrop(); advance(module, 1);
    assert.equal(doneCount(f.events), 1); assert.equal(module.exitPending, true); assert.match(module.status.instruction, /Leave the courtyard/);
    // A full-size set extends farther than the normal 45m retention circle.
    f.player.z = f.ctx.destination.z - 48 * scale; module.update(.05); assert.equal(module.exitPending, true);
    f.player.z = f.ctx.destination.z + 4.5 * scale + 1 + 2.3; module.update(.05); assert.equal(module.exitPending, true, 'the rear of the car still intersects the front boundary');
    f.player.z += .2; module.update(.05); assert.equal(module.exitPending, false);
    assert.equal(module.sceneryPending, true, 'clearing the gate must not erase the visible compound');
    f.player.z = f.ctx.destination.z + 851; assert.equal(module.sceneryPending, false);
    module.teardown(); assert.equal(f.scene.children.length, 0);
  }
});

test('a valid retry clears the old failure and preserves passing feedback until the physical handoff ends', () => {
  for (const module of [new GateDelivery(), new WalkingHandoff(), new WeddingHandoff(), new AngleParking(), new ClassroomHandoff()]) {
    const f = fixture(); module.setup(f.ctx, {}); module.onDrop(); assert.ok(module.status.failure);
    if (module instanceof WalkingHandoff) advance(module, 8);
    Object.assign(f.player, { x: module.target.x + (module instanceof WalkingHandoff ? 3 : 0), y: module.target.y, z: module.target.z,
      yaw: module instanceof AngleParking ? Math.PI / 4 : 0, speed: module instanceof WalkingHandoff ? 1 : 0 });
    module.update(.05); assert.equal(module.status.canDrop, true); module.onDrop();
    assert.equal(module.status.failure, undefined, `${module.constructor.name} kept a previous failure after accepting the retry`);
    advance(module, .4); assert.equal(module.status.instruction, 'Passing the pizza…'); assert.equal(doneCount(f.events), 0);
    advance(module, .5); assert.equal(doneCount(f.events), 1); assert.match(module.status.instruction, /^Leave/); module.teardown();
  }
});

test('completed walking and wedding customers keep moving without publishing new navigation or duplicate completion', () => {
  for (const module of [new WalkingHandoff(), new WeddingHandoff()]) {
    const f = fixture(); let targets = 0, motionFrames = 0; f.ctx.onTarget = () => targets++;
    module.setup(f.ctx, {});const poses:number[]=[];(module as any).receiver.catchPose=(amount:number)=>poses.push(amount); (module as any).receiver.animate = () => motionFrames++;
    advance(module, 8); Object.assign(f.player, { x: module.target.x + 3, y: module.target.y, z: module.target.z, yaw: 0, speed: module instanceof WalkingHandoff ? 1 : 0 });
    module.update(.05); assert.equal(module.status.canDrop, true); module.onDrop(); advance(module, 1);
    assert.equal(doneCount(f.events), 1); assert.equal(module.exitPending, true); assert.match(module.status.instruction, /^Leave/);
    const before = { z: module.target.z, targets, motionFrames }; advance(module, 2); module.onDrop();
    assert.notEqual(module.target.z, before.z, 'physical customer movement continues'); assert.ok(motionFrames > before.motionFrames);
    assert.ok(poses.includes(1),'the receiver visibly catches the carton');assert.equal(poses.at(-1),0,'empty hands return to the ordinary walk/dance rather than freezing in Take');
    assert.equal(targets, before.targets, 'post-delivery actors cannot move the active route marker'); assert.equal(doneCount(f.events), 1);
    assert.equal(module.status.canDrop, false); assert.match(module.status.instruction, /^Leave/); module.teardown();
  }
});

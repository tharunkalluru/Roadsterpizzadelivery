import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RajaAutoDelivery,InduBusDelivery,replaceBakedAutoDriver} from '../../src/delivery/modules/moving-cinematic-scenes';
import type {DeliveryRoadVehicle,DeliveryPlayer,DeliveryModuleContext} from '../../src/delivery/modules/types';
import {initTemplates,rng} from '../../src/core/util';
import {auto} from '../../src/world/traffic_models';

const actor=()=>{const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();group.add(leftArm,rightArm);return {group,leftArm,rightArm,catchPose(){}};};
function fixture(kind:'auto'|'bus'){
 const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
 const geometry=new THREE.BoxGeometry(1,1,1).toNonIndexed();geometry.userData.driverVertexRange=[0,3];group.add(new THREE.Mesh(geometry));
 const vehicle:DeliveryRoadVehicle={id:kind,group,x:0,y:0,z:0,hx:0,hz:-1,speed:8,size:kind==='auto'?[1.36,1.85,2.65]:[2.5,3.3,11]};
 const p:DeliveryPlayer={x:3.75,y:.55,z:10.5,yaw:0,speed:8};let active=false,dialogue=false,done=0,selected:DeliveryRoadVehicle|null=vehicle;
 const ctx:DeliveryModuleContext={scene,player:()=>p,destination:{x:0,y:0,z:0},emit:t=>{if(t==='done')done++;},automaticStories:true,canInteract:()=>true,storyActive:()=>active,characterFactory:()=>actor(),existingRoadVehicle:()=>{if(selected){selected.group.position.set(selected.x,selected.y+.02,selected.z);selected.group.rotation.y=Math.atan2(-selected.hx,-selected.hz);}return selected;},storyDialogueComplete:()=>dialogue};
 return {ctx,p,vehicle,geometry,set active(v:boolean){active=v;},set dialogue(v:boolean){dialogue=v;},set selected(v:DeliveryRoadVehicle|null){selected=v;},get done(){return done;}};
}
test('selected auto driver replacement preserves all other vertices and restores the shared prototype',()=>{
 const f=fixture('auto'),mesh=f.vehicle.group.children[0] as THREE.Mesh,original=mesh.geometry,restore=replaceBakedAutoDriver(f.vehicle.group)!;
 assert.equal(mesh.geometry.getAttribute('position').count,original.getAttribute('position').count-3);assert.equal(original.getAttribute('position').count,36);
 const a=original.getAttribute('position').array,b=mesh.geometry.getAttribute('position').array;assert.deepEqual([...b],[...a].slice(9));restore();assert.equal(mesh.geometry,original);
});
test('actual auto builder identifies only its existing driver triangles without changing default occupants',()=>{
 const gradient={addColorStop(){}};const context=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o:any,k)=>k in o?o[k]:()=>{}});
 (globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>context})};
 initTemplates();const m=auto(rng(23),0),range=m.driverVertexRange!;
 assert.ok(range&&range[1]>range[0]);assert.ok(m.occupants?.some(o=>o.role==='driver'));
 for(let i=range[0]*3;i<range[1]*3;i+=3){assert.ok(Math.abs(m.body.pos[i])<.7);assert.ok(m.body.pos[i+1]>.1&&m.body.pos[i+1]<1.8);}
});
test('Raja accepts only a grounded speed-matched right-side approach then hands off while following actual traffic',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery();module.setup(f.ctx,{immersiveHandoff:true});module.update(.05);
 Object.assign(f.p,module.target);assert.equal(module.story?.entry,true);f.p.x=-f.p.x;assert.equal(module.story?.entry,false);f.p.x=-f.p.x;
 f.vehicle.approachValid=false;assert.equal(module.story?.entry,false,'a newly blocked right-side corridor cannot capture');f.vehicle.approachValid=true;
 f.p.flying=true;assert.equal(module.story?.entry,false);f.p.flying=false;f.p.speed=25;assert.equal(module.story?.entry,false);f.p.speed=8;
 f.active=true;for(let i=0;i<25;i++)module.update(.05);assert.equal(module.status.canDrop,false);f.dialogue=true;module.update(.05);assert.equal(module.status.canDrop,true);module.onDrop();
 for(let i=0;i<20;i++){f.vehicle.z-=.4;module.update(.05);}assert.equal(f.done,1);const before=module.target.z;f.vehicle.z-=4;module.update(.05);assert.equal(module.target.z,before-4,'retained viewing scene follows the same actual auto');module.teardown();assert.equal((f.vehicle.group.children[0]as THREE.Mesh).geometry,f.geometry);
});
test('Indu keeps scarf on windshield, waits for dialogue, then completes only after overtaking without a handoff',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();module.setup(f.ctx,{immersiveHandoff:true});module.update(.05);Object.assign(f.p,module.target);assert.equal(module.story?.entry,true);
 f.active=true;for(let i=0;i<70;i++)module.update(.05);assert.equal(module.status.canDrop,false);f.dialogue=true;module.update(.05);module.onDrop();assert.equal(f.done,0);
 const cloth=f.ctx.scene.getObjectByName('Indu chunni retained on windshield')!;assert.ok(cloth.visible);const before=cloth.position.clone();f.p.z-=8;module.update(.05);assert.ok(Math.abs(cloth.position.z-before.z+8)<.001);assert.ok(cloth.visible);
 const frame=module.story!;assert.ok(frame.point.z< -5.5);Object.assign(f.p,frame.point);module.update(.05);assert.equal(f.done,1);assert.equal(f.ctx.scene.getObjectByName('delivery-handoff-pizza'),undefined);module.teardown();assert.equal(f.ctx.scene.getObjectByName('Indu chunni retained on windshield'),undefined);
});
test('despawned moving service hides its marker instead of completing or drawing a ghost replacement',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();module.setup(f.ctx,{});module.update(.05);f.selected=null;module.update(.05);assert.equal(module.status.canDrop,false);assert.equal(f.done,0);assert.equal(f.ctx.scene.getObjectByName('delivery-setpiece')?.visible,false);module.teardown();
});

test('loss during a captured moving scene explicitly asks the host to restore controls once, never silently hangs',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();let retries=0;f.ctx.storyCarrierLost=()=>retries++;module.setup(f.ctx,{});module.update(.05);f.active=true;module.update(.05);f.selected=null;module.update(.05);module.update(.05);assert.equal(retries,1);assert.equal(module.story,undefined);assert.equal(f.done,0);module.teardown();
});

test('moving camera keeps one frame object while translating its eye, subject and anchor with the actual carrier',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery();module.setup(f.ctx,{});module.update(.05);f.active=true;module.update(.05);const focus=module.cameraFocus!,before={eye:focus.position.z,target:focus.target.z,anchor:focus.translationAnchor!.z};f.vehicle.z-=2;module.update(.05);assert.equal(module.cameraFocus,focus);assert.equal(focus.position.z,before.eye-2);assert.equal(focus.target.z,before.target-2);assert.equal(focus.translationAnchor!.z,before.anchor-2);module.teardown();
});
test('Raja driver camera stays outside the right-front opening below the auto roof',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery();module.setup(f.ctx,{});module.update(.05);f.active=true;module.update(.05);const focus=module.cameraFocus!;
 assert.ok(focus.position.x>f.vehicle.size[0]/2+.5);assert.ok(focus.position.x<module.target.x-1.05,'eye remains in the gap between auto and Roadster bodies');assert.ok(focus.position.z<-.7,'look through front-right opening rather than rear canopy');assert.ok(focus.position.y<f.vehicle.size[1],'eye stays below roof height');assert.ok(focus.target.y>1.3&&focus.target.y<1.6,'face remains the subject');module.teardown();
});

test('pre-entry terminal stop retains the same service through long signals',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery(),requests:(string|undefined)[]=[],released:string[]=[];
 f.ctx.existingRoadVehicle=(_kind,id)=>{requests.push(id);f.vehicle.group.position.set(f.vehicle.x,f.vehicle.y+.02,f.vehicle.z);return f.vehicle;};f.ctx.releaseRoadVehicle=id=>released.push(id);
 module.setup(f.ctx,{});module.update(.05);f.vehicle.speed=0;Object.defineProperty(f.vehicle,'approachValid',{get:()=>f.vehicle.speed>1});
 for(let i=0;i<120;i++)module.update(.05);assert.equal(released.length,0,'ordinary RTC dwell or short signal cannot jump the marker');
 for(let i=0;i<85;i++)module.update(.05);assert.deepEqual(released,[]);assert.ok(requests.slice(-5).every(id=>id==='auto'),'the level never asks for a replacement service');module.teardown();
});
test('active story and held viewing never recycle their exact carrier because of a prolonged traffic signal',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();let releases=0;f.ctx.releaseRoadVehicle=()=>releases++;module.setup(f.ctx,{});module.update(.05);f.active=true;f.vehicle.speed=0;f.vehicle.approachValid=false;
 for(let i=0;i<300;i++)module.update(.05);assert.equal(releases,0);assert.ok(module.cameraFocus);module.teardown();
});
test('pre-entry carrier losing its legal right lane retains identity while refusing entry',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();let releases=0;f.ctx.releaseRoadVehicle=()=>releases++;module.setup(f.ctx,{});module.update(.05);f.vehicle.approachValid=false;
 for(let i=0;i<40;i++)module.update(.05);assert.equal(releases,0);for(let i=0;i<22;i++)module.update(.05);assert.equal(releases,0);assert.equal(module.story?.entry,false);module.teardown();
});

test('offscreen service and a kicked airborne player retain one exact target across direction changes',()=>{
 const f=fixture('bus'),module=new InduBusDelivery(),requests:(string|undefined)[]=[];let releases=0;
 const read=f.ctx.existingRoadVehicle!;f.ctx.existingRoadVehicle=(kind,id)=>{requests.push(id);return read(kind,id);};f.ctx.releaseRoadVehicle=()=>releases++;
 module.setup(f.ctx,{});module.update(.05);f.p.x=900;f.p.flying=true;
 for(let i=0;i<250;i++)module.update(.05);assert.equal(releases,0);assert.ok(requests.slice(1).every(id=>id==='bus'));assert.equal(module.story?.entry,false);
 f.selected=null;module.update(.05);f.selected=f.vehicle;f.vehicle.hx=1;f.vehicle.hz=0;module.update(.05);assert.equal(requests.at(-1),'bus');
 Object.assign(f.p,module.target,{yaw:-Math.PI/2,speed:8,flying:false,jumping:true});assert.equal(module.story?.entry,false);f.p.jumping=false;f.p.descending=true;assert.equal(module.story?.entry,false);f.p.descending=false;assert.equal(module.story?.entry,true);module.teardown();
});

test('actor mounting and camera use the actual carrier visual chassis transform, including road pitch',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();f.vehicle.group.position.set(2,.32,-5);f.vehicle.group.rotation.set(.07,.3,0,'YXZ');f.ctx.existingRoadVehicle=()=>f.vehicle;module.setup(f.ctx,{});module.update(.05);
 const root=f.ctx.scene.getObjectByName('delivery-setpiece')!;assert.equal(root.parent,f.vehicle.group);root.updateWorldMatrix(true,false);assert.ok(root.getWorldPosition(new THREE.Vector3()).distanceTo(f.vehicle.group.position)<1e-9);root.getWorldQuaternion(new THREE.Quaternion()).toArray().forEach((v,i)=>assert.ok(Math.abs(v-f.vehicle.group.quaternion.toArray()[i])<1e-9));module.teardown();
});

test('carrier movement later in the Game frame instantly moves its mounted actor, with no one-frame transform lag',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery();module.setup(f.ctx,{});module.update(.05);const root=f.ctx.scene.getObjectByName('delivery-setpiece')!,before=root.getWorldPosition(new THREE.Vector3());f.vehicle.group.position.z-=.4;const after=root.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(after.z-before.z+.4)<1e-9);module.teardown();
});
test('settled Indu scarf follows the actual Roadster visual in the same frame without a second module update',()=>{
 const f=fixture('bus'),hero=new THREE.Group(),module=new InduBusDelivery();f.ctx.scene.add(hero);f.ctx.playerObject=()=>hero;module.setup(f.ctx,{});module.update(.05);f.active=true;for(let i=0;i<50;i++)module.update(.05);
 const cloth=hero.getObjectByName('Indu chunni retained on windshield')!;assert.ok(cloth);const before=cloth.getWorldPosition(new THREE.Vector3());hero.position.set(2,.15,-.75);const after=cloth.getWorldPosition(new THREE.Vector3());assert.ok(after.clone().sub(before).distanceTo(hero.position)<1e-9,'late player presentation carries the attached cloth with no lag');assert.ok(cloth.visible);module.teardown();assert.equal(cloth.parent,null);
});
test('Raja deposits the received carton onto a supported visible dashboard tray and borrows the lamp pool',()=>{
 const f=fixture('auto'),module=new RajaAutoDelivery();module.setup(f.ctx,{immersiveHandoff:true,retainReceivedCarton:true});module.update(.05);Object.assign(f.p,module.target);f.active=true;f.dialogue=true;for(let i=0;i<25;i++)module.update(.05);module.onDrop();for(let i=0;i<35;i++)module.update(.05);
 assert.equal(f.done,1);const carton=f.ctx.scene.getObjectByName('delivery-received-carton')!,tray=f.ctx.scene.getObjectByName('Raja supported dashboard pizza tray')as THREE.Mesh;assert.ok(carton?.visible);assert.equal(carton.parent,tray.parent);assert.ok(Math.abs(carton.position.y-.035-(tray.position.y+.02))<1e-9,'carton rests on actual tray top');assert.ok(carton.position.y>1,'carton cannot remain hidden down on the lap');assert.ok(module.sceneLamp);let lights=0;f.ctx.scene.traverse(o=>{if(o instanceof THREE.Light)lights++;});assert.equal(lights,0,'module requests existing pool instead of adding a light');const before=module.sceneLamp!.position.z;f.vehicle.group.position.z-=.25;assert.equal(module.sceneLamp!.position.z,before-.25,'same-frame fixture follows real carrier');module.teardown();
});
test('Indu establishes the bus and scarf, moves close to the real window for dialogue, and widens during the pass',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();module.setup(f.ctx,{});module.update(.05);f.active=true;module.update(.05);const focus=module.cameraFocus!,wideDistance=focus.position.z-focus.target.z;for(let i=0;i<50;i++)module.update(.05);assert.equal(module.cameraFocus,focus);assert.ok(Math.hypot(focus.position.x-focus.target.x,focus.position.z-focus.target.z)<3,'actual window actor readable for dialogue');assert.ok(wideDistance>8);f.dialogue=true;for(let i=0;i<20;i++)module.update(.05);module.onDrop();assert.equal(module.cameraFocus,focus);assert.ok(focus.position.z-focus.target.z>8,'overtake retains establishing road context');module.teardown();
});

test('Indu can rendezvous with her same stopped bus using a grounded, aligned approach',()=>{
 const f=fixture('bus'),module=new InduBusDelivery();module.setup(f.ctx,{});module.update(.05);f.vehicle.speed=0;f.vehicle.approachValid=true;module.update(.05);
 Object.assign(f.p,module.target,{speed:0});assert.equal(module.story?.entry,true);f.p.jumping=true;assert.equal(module.story?.entry,false);module.teardown();
});

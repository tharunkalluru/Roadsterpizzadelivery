import { installLegacyCandidateActors } from './fixtures/legacy-candidate-actors';
installLegacyCandidateActors();
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeliveryModule,type DeliveryPlayer,type DeliveryModuleContext } from '../../src/delivery/modules';
import { railRoofAt,MovingRailInteraction } from '../../src/game/moving-rail';
import { supportAt } from '../../src/game/physics';
import type { MovingRailBody } from '../../src/game/moving-rail';

const advance=(module:ReturnType<typeof createDeliveryModule>,seconds:number)=>{for(let t=0;t<seconds-1e-8;t+=.05)module.update(.05);};
function setup(name='matchAndLand',params:Record<string,unknown>={scene:'truckInterior',vehicle:'truck',speed:6}){
  const scene=new THREE.Scene(),p:DeliveryPlayer={x:0,y:.55,z:-25,yaw:Math.PI,speed:0,flying:false};
  const events:string[]=[],sceneEvents:string[]=[];let unlocked=false;
  const ctx:DeliveryModuleContext={scene,player:()=>p,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:60}],canInteract:()=>unlocked,
    emit:type=>events.push(type),sceneEvent:kind=>sceneEvents.push(kind)};
  const module=createDeliveryModule(name);module.setup(ctx,params);
  return{scene,p,events,sceneEvents,ctx,module,unlock:()=>{unlocked=true;}};
}
test('truck drives a finite mapped route, opens its folded tailgate only after the call, and exposes separate NPC envelope',()=>{
  const f=setup();advance(f.module,2);assert.ok(f.module.trafficBodies![0].z>3);
  assert.ok(f.module.supports.some(b=>b.id==='delivery-interior-door:0'));assert.ok(!f.module.supports.some(b=>b.id==='delivery-interior-ramp'));
  assert.equal(f.module.arrival!.side,'rear');
  const rear=f.module.arrival!,bed=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.ok(Math.abs(rear.z-(bed.z-bed.halfLength))<.001,'call boundary is the actual rear door, not the more distant approach marker');
  assert.ok(f.module.target.z<rear.z-10,'navigation stays at the safe approach point behind the ramp');
  f.unlock();advance(f.module,2);const ramp=f.module.supports.find(b=>b.id==='delivery-interior-ramp')!,floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.ok(ramp);assert.ok(!f.module.supports.some(b=>b.id.startsWith('delivery-interior-door:')));
  assert.ok(Math.abs(railRoofAt(ramp,ramp.x,ramp.z-ramp.halfLength)!-.12)<.001);
  assert.ok(Math.abs(railRoofAt(ramp,ramp.x,ramp.z+ramp.halfLength)!-floor.roof)<.001);
  assert.ok(f.module.trafficBodies![0].roof>floor.roof+4,'NPC volume includes cab and walls, not only the driveable floor');
  advance(f.module,30);const end=f.module.trafficBodies![0].z;advance(f.module,5);assert.equal(f.module.trafficBodies![0].z,end);f.module.teardown();
});
test('truck interior cannot be delivered from above or through a side; actual rear entry reveals once and handoff visibly completes',()=>{
  const f=setup();f.unlock();advance(f.module,30);const floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  assert.equal(f.scene.getObjectByName('delivery-character-unknown')!.visible,true);assert.equal(f.scene.getObjectByName('delivery-character-pushpa')!.visible,false);
  Object.assign(f.p,{x:floor.x+.55,y:floor.roof+3,z:floor.z+2,flying:true});advance(f.module,.7);f.module.onDrop();assert.equal(f.events.at(-1),'failed');assert.deepEqual(f.sceneEvents,[]);
  Object.assign(f.p,{y:floor.roof+.55,flying:false});advance(f.module,.7);assert.equal(f.module.status.canDrop,false,'dropping vertically into the box is not rear entry');
  f.p.z=floor.z-9;f.module.update(.05);f.p.z=floor.z-7;f.module.update(.05);assert.deepEqual(f.sceneEvents,['interiorEntered']);
  assert.equal(f.scene.getObjectByName('delivery-character-unknown')!.visible,false);assert.equal(f.scene.getObjectByName('delivery-character-pushpa')!.visible,true);
  f.p.z=floor.z+2;advance(f.module,.7);assert.equal(f.module.status.canDrop,true);f.module.onDrop();assert.equal(f.events.filter(e=>e==='done').length,0);
  advance(f.module,.75);assert.equal(f.events.filter(e=>e==='done').length,0,'completion waits for the character catch settle');advance(f.module,.5);
  assert.equal(f.events.filter(e=>e==='done').length,1);assert.deepEqual(f.sceneEvents,['interiorEntered','catchStarted']);f.module.teardown();
});
test('truck clear aisle is physically open while visible logs and walls reject the complete car envelope',()=>{
  const f=setup();f.unlock();advance(f.module,30);const floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  const collide=(x:number)=>{
    const interaction=new MovingRailInteraction(),p={pos:{x,y:floor.roof+.55,z:floor.z-7},yaw:Math.PI,speed:3,vy:0,flying:false,descending:false,jumping:false};
    interaction.beforePlayer(p,f.module.supports,false,.05);p.pos.z=floor.z+1;return interaction.afterPlayer(p,.05);
  };
  assert.equal(collide(.55).hit,false,'a complete Roadster fits the central aisle');assert.equal(collide(-2).hit,true,'logs remain physical');assert.equal(collide(2.8).hit,true,'sidewall is physical');f.module.teardown();
});
test('production support selection carries grounded wheels from the ramp tip up to the truck floor',()=>{
  const f=setup();f.unlock();advance(f.module,30);
  const ramp=f.module.supports.find(b=>b.id==='delivery-interior-ramp')!,floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;
  const city={surfaceGrid:new Map(),buildingGrid:new Map(),waterGrid:new Map(),landmarkSurfaceGrid:new Map(),movingRail:f.module.supports} as any;
  let z=ramp.z-ramp.halfLength-.8,feet=0;const x=.55;
  for(let i=0;i<30;i++){
    const previous={x,z,feet};z+=.4;
    const selected=supportAt(city,x,z,feet,false,previous);
    if(z>=ramp.z-ramp.halfLength&&z<=floor.z+1){assert.equal(selected.kind,'rail','ramp continuity must beat the underlying ground');assert.ok(selected.y>=feet-.001);}
    feet=selected.y;
  }
  assert.ok(Math.abs(feet-floor.roof)<.001);f.module.teardown();
});
test('surface scene never requests diving, waits for call and emergence, and catches the thrown pizza before completion',()=>{
  const f=setup('underwater',{scene:'surfaceEmergence',throwRange:12});Object.assign(f.p,{x:0,y:.3,z:7});advance(f.module,3);
  assert.equal(f.module.movement.mode,'approach');assert.equal(f.module.status.canDrop,false);assert.deepEqual(f.sceneEvents,[]);
  const character=f.scene.getObjectByName('delivery-character-simhadri')!;assert.equal(character.visible,false);
  f.unlock();advance(f.module,.5);assert.equal(f.module.status.canDrop,false);assert.equal(character.visible,true);assert.ok(character.position.y<-.65);
  advance(f.module,1.5);assert.equal(f.module.status.canDrop,true);assert.deepEqual(f.sceneEvents,['characterEmerged']);
  f.p.y=-3;f.module.update(.05);assert.equal(f.module.status.canDrop,false,'surface handoff cannot be performed deep underwater');f.p.y=.3;f.module.update(.05);f.module.onDrop();
  assert.deepEqual(f.sceneEvents,['characterEmerged','catchStarted']);advance(f.module,.9);assert.ok(!f.events.includes('done'));advance(f.module,.6);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
});
test('new immersive scenes release merged costume, tailgate and water-scene resources exactly once',()=>{
  for(const [name,params]of [['matchAndLand',{scene:'truckInterior',vehicle:'truck'}],['underwater',{scene:'surfaceEmergence'}]] as const){
    const f=setup(name,params);const resources=new Set<THREE.BufferGeometry|THREE.Material>();let disposed=0;
    f.scene.traverse(n=>{if(n instanceof THREE.Mesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])resources.add(m);}});
    for(const r of resources)r.addEventListener('dispose',()=>disposed++);f.module.teardown();f.module.teardown();assert.equal(disposed,resources.size);assert.equal(f.scene.children.length,0);
  }
});
test('opt-in rooftop, stadium and IMAX handoffs reach physical hands before completing and ignore repeat taps',()=>{
  for(const [name,params]of [
    ['matchAndLand',{vehicle:'stationary',speed:0}],
    ['beatDrop',{period:2,windowStart:0,windowEnd:.9}],
    ['threadGap',{hazards:false}],
  ] as const){
    const f=setup(name,{...params,immersiveHandoff:true});f.unlock();
    if(name==='threadGap'){
      Object.assign(f.p,{x:0,y:3,z:20,flying:true});f.module.update(.05);f.p.z=13;f.module.update(.05);f.p.z=-7;
    }else Object.assign(f.p,f.module.target,{y:f.module.target.y+3});
    advance(f.module,.6);assert.equal(f.module.status.canDrop,true);f.module.onDrop();f.module.onDrop();
    const box=f.scene.getObjectByName('delivery-handoff-pizza') as THREE.Mesh;assert.equal(box.visible,true);assert.ok(!f.events.includes('done'));assert.equal(f.module.status.canDrop,false);
    advance(f.module,.6);assert.ok(!f.events.includes('done'));assert.equal(f.module.status.instruction,'Caught it!');
    let raised=false;f.scene.traverse(n=>{if(n.name.endsWith('-left-arm')&&n.rotation.x< -1.2)raised=true;});assert.ok(raised);
    advance(f.module,.2);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.onDrop();assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
  }
});
test('each chain take waits for its director catch and teardown cancels an in-flight pizza',()=>{
  const f=setup('chainDrop',{immersiveHandoff:true});f.unlock();
  const first={...f.module.target};Object.assign(f.p,first,{y:first.y+3});f.module.update(.05);f.module.onDrop();f.module.onDrop();
  advance(f.module,.5);assert.deepEqual(f.module.target,first);assert.equal(f.module.status.canDrop,false);
  advance(f.module,.3);assert.notDeepEqual(f.module.target,first);assert.equal(f.module.status.progress,'2 / 4');
  Object.assign(f.p,f.module.target,{y:f.module.target.y+3});f.module.update(.05);f.module.onDrop();
  f.module.teardown();advance(f.module,2);assert.ok(!f.events.includes('done'));assert.equal(f.scene.children.length,0);
});
test('train catch follows its actual moving coach every frame and is cancelled if that coach disappears',()=>{
  const f=setup('matchAndLand',{vehicle:'train',immersiveHandoff:true,holdSeconds:.2,matchTolerance:4});f.unlock();
  const body:MovingRailBody={id:'real-train',x:0,y:0,z:0,hx:0,hz:1,halfWidth:1.6,halfLength:10,bottom:.2,roof:4.2,previous:{x:0,y:0,z:0,hx:0,hz:1}};
  let present=true;f.ctx.existingTrain=()=>present?body:null;
  Object.assign(f.p,{x:0,y:4.75,z:0,speed:0,flying:false});
  const move=()=>{body.previous.z=body.z;body.z+=.5;f.module.update(.05);f.p.z+=.5;};
  for(let i=0;i<15;i++)move();assert.equal(f.module.status.canDrop,true);f.module.onDrop();
  const start=body.z;for(let i=0;i<12;i++)move();assert.ok(body.z>start+5);assert.ok(!f.events.includes('done'));
  const box=f.scene.getObjectByName('delivery-handoff-pizza') as THREE.Mesh,receiver=f.scene.getObjectByName('delivery-character-trainHero')!;
  const world=new THREE.Vector3();box.getWorldPosition(world);assert.ok(Math.abs(world.z-body.z)<1,'pizza catch follows the current moving train position');
  receiver.getWorldPosition(world);assert.ok(Math.abs(world.z-body.z)<.001);
  for(let i=0;i<4;i++)move();assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
  // A second fresh attempt loses its source coach before the catch settles.
  const g=setup('matchAndLand',{vehicle:'train',immersiveHandoff:true,holdSeconds:.1});g.unlock();
  body.previous.z=body.z;g.ctx.existingTrain=()=>present?body:null;Object.assign(g.p,{x:0,y:4.75,z:body.z,speed:0,flying:false});advance(g.module,.3);g.module.onDrop();
  assert.ok(g.scene.getObjectByName('delivery-handoff-pizza')?.visible);present=false;g.module.update(.05);advance(g.module,1);
  assert.ok(!g.events.includes('done'));assert.equal(g.scene.getObjectByName('delivery-handoff-pizza')!.visible,false);g.module.teardown();
});
test('train customer turns toward a visitor on his coach and gives roof directions without changing airborne approaches',()=>{
  const f=setup('matchAndLand',{vehicle:'train',scene:'trainRoof',immersiveHandoff:true,holdSeconds:.2});f.unlock();
  const body:MovingRailBody={id:'real-train',x:0,y:0,z:0,hx:0,hz:1,halfWidth:1.6,halfLength:12,bottom:.2,roof:4.2,previous:{x:0,y:0,z:0,hx:0,hz:1}};
  f.ctx.existingTrain=()=>body;Object.assign(f.p,{x:.3,y:4.75,z:-9,speed:0,flying:false});
  const actor=f.scene.getObjectByName('delivery-character-trainHero')!;
  advance(f.module,1.3);
  const angle=Math.atan2(.3,-9);
  assert.ok(Math.abs(Math.atan2(Math.sin(actor.rotation.y-angle),Math.cos(actor.rotation.y-angle)))<.001);
  assert.equal(f.module.status.instruction,'Drive along the roof to the marker');
  const before=actor.rotation.y;Object.assign(f.p,{z:5,flying:true});advance(f.module,1);
  assert.equal(actor.rotation.y,before,'a flying pass cannot spin the customer into a handover pose');
  assert.equal(f.module.status.canDrop,false);f.module.teardown();
});
test('a matched train-roof handoff is readable, then its exact customer keeps riding without changing the next navigation',()=>{
 const f=setup('matchAndLand',{vehicle:'train',scene:'trainRoof',immersiveHandoff:true,holdSeconds:.2});f.unlock();
 const body:MovingRailBody={id:'stable-coach',x:0,y:0,z:0,hx:0,hz:1,halfWidth:1.6,halfLength:12,bottom:.2,roof:4.2,previous:{x:0,y:0,z:0,hx:0,hz:1}};
 let present=true,targets=0;const requested:string[]=[];f.ctx.existingTrain=id=>{if(id)requested.push(id);return present?body:null;};f.ctx.onTarget=()=>targets++;
 Object.assign(f.p,{x:.3,y:4.75,z:-5,speed:0,flying:false});advance(f.module,1.2);assert.equal(f.module.status.canDrop,true);
 assert.equal(f.module.headlightGain,.02);assert.equal(f.module.cameraFocus!.context,'stationary-handoff');
 const lamp=f.module.sceneLamp!;assert.equal(lamp.kind,'reading');assert.ok(f.scene.getObjectByName('delivery-coach-worklights'));assert.equal(f.scene.getObjectsByProperty('isLight',true).length,0);
 f.p.speed=2;assert.equal(f.module.cameraFocus,undefined);f.p.speed=0;f.p.flying=true;assert.equal(f.module.headlightGain,undefined);assert.equal(f.module.cameraFocus,undefined);f.p.flying=false;
 f.module.onDrop();advance(f.module,.8);assert.ok(f.events.includes('done'));assert.equal(f.module.sceneryPending,true);const before=targets;
 for(let i=0;i<20;i++){body.previous.z=body.z;body.z+=.2;f.p.z+=.2;f.module.update(.05);}
 const actor=f.scene.getObjectByName('delivery-character-trainHero')!,world=new THREE.Vector3();actor.getWorldPosition(world);assert.ok(Math.abs(world.z-body.z)<1e-6,'completed actor follows the same real coach');assert.equal(targets,before,'completed scenery cannot publish the next order target');assert.ok(requested.every(id=>id==='stable-coach'));
 assert.equal(f.module.sceneLamp,lamp);assert.ok(Math.abs(lamp.position.z-body.z+1.47)<1e-6,'selected worklight remains fixed on the moving coach');
 assert.equal(f.scene.getObjectByName('delivery-target-ring')!.visible,false);present=false;f.module.update(.05);assert.equal(f.module.sceneryPending,false,'missing exact coach cannot leave a floating customer');f.module.teardown();
});
test('Eega variant retains its insect geometry and timing while the pizza visibly reaches its receiver',()=>{
  const f=setup('beatDrop',{theme:'eega',period:3,windowStart:.67,windowEnd:.9,radius:7,immersiveHandoff:true});f.unlock();
  Object.assign(f.p,{x:0,y:3,z:0});advance(f.module,2.4);assert.equal(f.module.status.canDrop,true);
  const insect=f.scene.getObjectByName('delivery-character-eega')!;let parts=0;insect.traverse(n=>{if(n instanceof THREE.Mesh)parts++;});assert.equal(parts,3,'same body and two wing meshes');
  f.module.onDrop();assert.ok(!f.events.includes('done'));advance(f.module,.6);
  const pizza=f.scene.getObjectByName('delivery-handoff-pizza')!,anchor=f.scene.getObjectByName('delivery-eega-catch-point')!;
  const p=new THREE.Vector3(),a=new THREE.Vector3();pizza.getWorldPosition(p);anchor.getWorldPosition(a);a.y+=.035;assert.ok(p.distanceTo(a)<.001,'the actual .07m box underside rests at the receiving anchor');
  assert.ok(insect.children.some(n=>n instanceof THREE.Group&&Math.abs(n.rotation.z)>.5),'wings react to receiving the pizza');
  assert.ok(!f.events.includes('done'));advance(f.module,.2);assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
});

/** Contact samples come from the production body geometry. Restrict the rear
 * pelvis and shoes rather than trusting the character group's origin. */
function seatedContact(character:THREE.Object3D){
  const body=character.getObjectByName(`${character.name}-body`) as THREE.Mesh,p=body.geometry.getAttribute('position');
  let butt=Infinity,shoe=Infinity;const point=new THREE.Vector3();character.updateWorldMatrix(true,true);
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),z=p.getZ(i),x=p.getX(i);
    if(y>.4&&y<.8&&z<-.06&&Math.abs(x)<.15){point.fromBufferAttribute(p,i).applyMatrix4(body.matrixWorld);butt=Math.min(butt,point.y);}
    if(y<.18&&z>.3){point.fromBufferAttribute(p,i).applyMatrix4(body.matrixWorld);shoe=Math.min(shoe,point.y);}
  }
  assert.ok(Number.isFinite(butt)&&Number.isFinite(shoe),'physical pelvis and shoe samples exist');return{butt,shoe};
}

test('both seated truck identities rest on the crate with their shoes at the actual bed',()=>{
  const f=setup();advance(f.module,.2);f.scene.updateMatrixWorld(true);
  const seat=new THREE.Box3().setFromObject(f.scene.getObjectByName('delivery-truck-study-seat')!),bed=new THREE.Box3().setFromObject(f.scene.getObjectByName('delivery-truck-bed')!);
  for(const style of['pushpa','unknown']){
    const actor=f.scene.getObjectByName(`delivery-character-${style}`)!,contact=seatedContact(actor);
    assert.ok(Math.abs(contact.butt-seat.max.y)<.003,`${style}: pelvis rests on the seat`);
    assert.ok(contact.shoe>=bed.max.y-.005&&contact.shoe-bed.max.y<.05,`${style}: shoes stay within five centimetres of the truck bed`);
    const mesh=actor.getObjectByName(`${actor.name}-body`) as THREE.Mesh,points=mesh.geometry.getAttribute('position'),world=new THREE.Vector3();let buried=0;
    for(let i=0;i<points.count;i++){world.fromBufferAttribute(points,i).applyMatrix4(mesh.matrixWorld);if(world.y>bed.max.y+.1&&world.y<seat.max.y-.05&&seat.containsPoint(world))buried++;}
    assert.equal(buried,0,`${style}: lower legs and shoes stay outside the wood crate`);
  }
  f.module.teardown();
});

test('IMAX customer rests on the hero seat with shoes at the hall floor; scene gates and background seats stay unchanged',()=>{
  const f=setup('threadGap',{hazards:false});f.scene.updateMatrixWorld(true);
  const actor=f.scene.getObjectByName('delivery-character-imax')!,contact=seatedContact(actor),seat=new THREE.Box3().setFromObject(f.scene.getObjectByName('delivery-imax-customer-seat')!);
  const floor=f.module.supports.find(b=>b.id.startsWith('delivery-platform:'))!;
  assert.ok(Math.abs(seat.min.y-floor.roof)<.001,'hero seat base is on the hall floor');assert.ok(Math.abs(seat.max.y-floor.roof-.58)<.001);
  assert.ok(Math.abs(contact.butt-seat.max.y)<.003,'pelvis contacts the actual cushion surface');
  assert.ok(contact.shoe>=floor.roof-.005&&contact.shoe-floor.roof<.05,'no raised hidden riser or floating feet');
  assert.ok(Math.abs(seat.max.z+6.68)<.001,'knees and shoes fit in front of the seat rather than inside its block');
  const body=actor.getObjectByName(`${actor.name}-body`) as THREE.Mesh,points=body.geometry.getAttribute('position'),world=new THREE.Vector3();let buried=0;
  for(let i=0;i<points.count;i++){world.fromBufferAttribute(points,i).applyMatrix4(body.matrixWorld);if(world.y>floor.roof+.1&&world.y<seat.max.y-.05&&seat.containsPoint(world))buried++;}
  assert.equal(buried,0,'actual lower-leg vertices remain clear of the hero seat');
  assert.deepEqual(f.module.target,{x:0,y:3,z:19,label:'IMAX entrance opening'},'entrance marker and height remain unchanged');
  const bases=f.scene.getObjectByName('delivery-imax-seat-bases') as THREE.InstancedMesh;assert.equal(bases.count,32);
  const matrix=new THREE.Matrix4();bases.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[13]-.9)<.000001,'background seat placement is unchanged');
  f.module.teardown();
});

test('moving rotated truck handoff ends at the lowered reader actual hands before the original settle time',()=>{
  const f=setup();f.ctx.destination={x:40,y:7,z:-10};f.ctx.route=[{x:40,y:7,z:-10},{x:100,y:9,z:50}];
  f.module.setup(f.ctx,{scene:'truckInterior',vehicle:'truck',speed:6});f.module.update(0);
  const rear=f.module.arrival!;Object.assign(f.p,{x:rear.x-rear.hx*20,z:rear.z-rear.hz*20,y:7.55});
  f.unlock();advance(f.module,2);
  const place=(z:number)=>{const floor=f.module.supports.find(b=>b.id==='delivery-interior-floor')!;Object.assign(f.p,{x:floor.x+floor.hz*.55+floor.hx*z,y:floor.roof+z*(floor.grade||0)+.55,z:floor.z-floor.hx*.55+floor.hz*z,flying:false});};
  place(-9);f.module.update(.05);place(-7);f.module.update(.05);
  const follow=()=>{place(2);f.module.update(.05);};
  for(let i=0;i<16;i++)follow();assert.equal(f.module.status.canDrop,true);f.module.onDrop();
  for(let i=0;i<14;i++)follow();
  const vehicle=f.scene.getObjectByName('delivery-truck-interior')!,pizza=f.scene.getObjectByName('delivery-truck-handoff-pizza')!;
  const hands=f.scene.getObjectByName('delivery-character-pushpa-hands')!,actual=new THREE.Vector3(),wanted=new THREE.Vector3();vehicle.updateWorldMatrix(true,true);pizza.getWorldPosition(actual);hands.getWorldPosition(wanted);wanted.addScaledVector(new THREE.Vector3(0,1,0).transformDirection(vehicle.matrixWorld),.035);
  assert.ok(actual.distanceTo(wanted)<.00001,'pizza reaches the moving/rotated physical hand anchor, not the old hard-coded point');
  assert.equal(f.module.status.instruction,'Caught it!');assert.ok(!f.events.includes('done'),'the original catch-settle delay remains');
  for(let i=0;i<10;i++)follow();assert.equal(f.events.filter(e=>e==='done').length,1);f.module.teardown();
});

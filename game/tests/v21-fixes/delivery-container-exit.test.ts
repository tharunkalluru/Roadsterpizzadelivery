import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player,type Input } from '../../src/game/player';
import { MovingRailInteraction,railLocal } from '../../src/game/moving-rail';
import { MatchAndLand } from '../../src/delivery/modules/match-and-land';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';

const idle:Input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
function player(){return Object.assign(Object.create(Player.prototype),{
  city:{group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]},
  pos:new THREE.Vector3(.55,.55,-25),yaw:Math.PI,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,
  hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
  jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
  group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
}) as Player;}

for(const hz of[30,60])test(`completed container keeps moving floor/ramp until the entire production car reverses out at${hz}Hz`,()=>{
  const p=player(),module=new MatchAndLand(),scene=new THREE.Scene(),contacts=new MovingRailInteraction(),events:string[]=[];let unlocked=true,carried=false,time=0,targetChanges=0;
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:1000}],player:()=>({...p.pos,yaw:p.yaw,speed:p.speed,flying:p.flying,jumping:p.jumping}),canInteract:()=>unlocked,
    emit:e=>{events.push(e);if(e==='done')unlocked=false;},onTarget:()=>targetChanges++},{scene:'truckInterior',speed:6});
  const dt=1/hz,tick=(input:Input=idle)=>{
    module.update(dt);p.city.movingRail=[...module.supports];contacts.beforePlayer(p,p.city.movingRail,false,dt);p.update(dt,input,time+=dt);const result=contacts.afterPlayer(p,dt);carried=result.carried;
    return result;
  };
  for(let i=0;i<hz*3;i++)tick();assert.equal(module.exitPending,false,'an unfinished delivery has no retired-scene lock');
  for(let i=0;i<hz*35&&!events.includes('done');i++){
    const floor=module.supports.find(b=>b.id==='delivery-interior-floor')!,along=railLocal(floor,p.pos.x,p.pos.z).along,desired=along>.3?0:carried?3:11;
    tick({...idle,throttle:p.speed<desired-.15?1:0,brake:p.speed>desired+.4&&p.speed>20*dt?1:0});if(module.status.canDrop)module.onDrop();
  }
  assert.deepEqual(events,['done']);assert.equal(module.exitPending,true,'the completion callback must see the still-inside car');
  assert.equal(scene.getObjectByName('delivery-target-ring')!.visible,false,'completed cargo scene never revives its old ring');
  const floorAtDone=module.supports.find(b=>b.id==='delivery-interior-floor')!.z,changesAtDone=targetChanges;
  for(let i=0;i<hz;i++){tick();module.onDrop();assert.equal(module.exitPending,true);assert.ok(module.supports.some(b=>b.id==='delivery-interior-ramp'));assert.equal(module.status.canDrop,false);}
  assert.ok(module.supports.find(b=>b.id==='delivery-interior-floor')!.z>floorAtDone+5,'completion does not freeze the mapped truck under the car');assert.equal(targetChanges,changesAtDone,'retirement cannot revive the old delivery GPS');
  let partial=false,reverseFrames=0;
  while(module.exitPending&&reverseFrames++<hz*25){
    const result=tick({...idle,brake:1,allowReverse:true});assert.equal(result.hit,false,'aligned reverse must remain clear across bed and ramp seams');
    const ramp=module.supports.find(b=>b.id==='delivery-interior-ramp')!,local=railLocal(ramp,p.pos.x,p.pos.z);
    if(local.along<-ramp.halfLength&&local.along+2.4>=-ramp.halfLength-.15){partial=true;assert.equal(module.exitPending,true,'a centre beyond the ramp tip is insufficient while the nose/wheels still overlap');}
  }
  assert.ok(reverseFrames<hz*25,'the physical car can reverse out without teleportation');assert.equal(partial,true);assert.equal(module.exitPending,false);assert.deepEqual(events,['done']);
  module.teardown();assert.equal(module.supports.length,0);assert.equal(module.trafficBodies.length,0);assert.equal(scene.children.length,0);assert.equal(module.exitPending,false);
});

test('completed reader smoothly returns to the authored reading loop beside a bounded physical cabin light',()=>{
  const catches:number[]=[],reads:number[]=[];
  class ObservedTruck extends TruckInterior {
    protected override character(...args:Parameters<TruckInterior['character']>){
      const actor=super.character(...args);
      if(args[0]==='pushpa'){actor.catchPose=value=>catches.push(value);actor.animate=(dt,motion)=>{if(motion==='read')reads.push(dt);};}
      return actor;
    }
  }
  const scene=new THREE.Scene(),module=new ObservedTruck(),events:string[]=[];
  const p={x:0,y:.55,z:-25,yaw:Math.PI,speed:0,flying:false,jumping:false};
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:1000}],player:()=>p,
    vehicleSpeedLimit:()=>0,emit:type=>events.push(type)},{speed:6});
  for(let frame=0;frame<20;frame++)module.update(.1);
  Object.assign(p,{z:-8.01,y:2.10});module.update(.1);p.z=-7.99;module.update(.1);
  p.z=2;for(let frame=0;frame<6;frame++)module.update(.1);
  assert.equal(module.status.canDrop,true);
  assert.equal(module.cameraFocus,undefined,'a withheld mechanics fixture cannot attract an approved-face close-up; exact source camera coverage is separate');
  p.speed=2;assert.equal(module.cameraFocus,undefined,'driving always releases close interaction framing');p.speed=0;
  module.onDrop();
  for(let frame=0;frame<12;frame++)module.update(.1);
  assert.deepEqual(events,['done']);assert.equal(catches.at(-1),1);
  const previousReads=reads.length,returnStart=catches.length;
  for(let frame=0;frame<6;frame++)module.update(.1);
  const returning=catches.slice(returnStart);
  assert.ok(returning[0]>0&&returning[0]<1,'receiving arm eases back instead of snapping or remaining frozen');
  assert.equal(returning.at(-1),0);assert.ok(returning.every((value,index)=>!index||value<=returning[index-1]));
  assert.ok(reads.length>previousReads);assert.deepEqual(events,['done']);
  const light=scene.getObjectByName('delivery-truck-reading-light')!;
  assert.ok(light);assert.ok(module.sceneLamp);assert.ok(module.sceneLamp!.position.distanceTo(light.getWorldPosition(new THREE.Vector3()))<1e-6);
  assert.ok(light.position.y>2.8&&light.position.z<6,'lamp lights the face/book from above and in front');
  assert.equal(scene.getObjectsByProperty('isPointLight',true).length,0,'the scene borrows an existing engine light instead of changing all city shader variants');
  p.z=80;assert.equal(module.sceneLamp,undefined,'a distant or retired truck does not reserve a city light');
  module.teardown();assert.equal(scene.children.length,0);
});

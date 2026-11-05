import * as THREE from 'three';
import { ModuleBase, distanceXZ, numberParam } from './base';
import type { SceneCharacter } from './character';
import type { DeliveryPoint, DeliveryRoadVehicle, ModuleCameraFocus, ModuleStoryFrame } from './types';

/** Removes just the authored driver vertex range from one live auto instance.
 * Shared prototypes, paint, decals, passengers and every other NPC stay intact. */
export function replaceBakedAutoDriver(group:THREE.Group):(()=>void)|null {
  const mesh=group.children.find(o=>o instanceof THREE.Mesh&&Array.isArray(o.geometry.userData.driverVertexRange)) as THREE.Mesh|undefined;
  if(!mesh)return null;
  const original=mesh.geometry,range=original.userData.driverVertexRange as number[],position=original.getAttribute('position');
  if(original.index||range.length!==2||!range.every(Number.isInteger)||range[0]<0||range[1]>position.count||range[1]<=range[0]||range[0]%3||range[1]%3)return null;
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(original.attributes)){
    const size=attribute.itemSize,count=attribute.count-(range[1]-range[0]),values=new Float32Array(count*size);let out=0;
    for(let i=0;i<attribute.count;i++)if(i<range[0]||i>=range[1])for(let j=0;j<size;j++)values[out++]=attribute.array[i*size+j];
    geometry.setAttribute(name,new THREE.BufferAttribute(values,size,attribute.normalized));
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
  return ()=>{if(mesh.geometry===geometry)mesh.geometry=original;geometry.dispose();};
}

abstract class MovingRoadScene extends ModuleBase {
  protected abstract kind:'auto'|'bus';
  protected vehicle:DeliveryRoadVehicle|null=null;
  protected receiver:SceneCharacter|null=null;
  protected capturedTime=0;
  protected active=false;
  private driverPrepared=false;
  private notifiedLost=false;
  private stoppedBeforeEntry=0;
  private invalidBeforeEntry=0;
  private farBeforeEntry=0;
  private localBuffer=new THREE.Vector3();
  private focus:ModuleCameraFocus={position:{x:0,y:0,z:0},target:{x:0,y:0,z:0},translationAnchor:{x:0,y:0,z:0}};
  private restoreDriver:(()=>void)|null=null;
  protected abstract get actorStyle():string;
  protected actorSeat():THREE.Vector3{return new THREE.Vector3();}
  protected build(){this.vehicle=null;this.receiver=null;this.capturedTime=0;this.active=false;this.notifiedLost=false;this.stoppedBeforeEntry=0;this.invalidBeforeEntry=0;this.farBeforeEntry=0;this.status={instruction:'Find the marked vehicle',canDrop:false,actionLabel:'DELIVER'};}
  protected localPoint(x:number,y:number,z:number):DeliveryPoint {
    const v=this.vehicle;if(!v)return {...this.ctx.destination};
    v.group.updateWorldMatrix(true,false);this.localBuffer.set(x,y,z).applyMatrix4(v.group.matrixWorld);
    return {x:this.localBuffer.x,y:this.localBuffer.y,z:this.localBuffer.z};
  }
  protected get yaw(){const v=this.vehicle;return v?Math.atan2(-v.hx,-v.hz):0;}
  protected sync(dt:number){
    if(!this.ready)return false;
    const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    // Base.tick deliberately stops at done; moving viewing scenes must continue
    // following the same real service until the player explicitly chooses Next.
    if(!this.ended)this.tick(seconds);else this.time+=seconds;
    const captured=!!this.ctx.storyActive?.();
    const selected=this.ctx.existingRoadVehicle?.(this.kind,this.vehicle?.id)??null;
    if(!selected){
      this.root.visible=false;this.status.canDrop=false;
      const corridor=this.ctx.waitingRoadTarget?.();if(!captured&&corridor){Object.assign(this.target,corridor,{label:this.ctx.destination.label});this.ctx.onTarget?.({...this.target});this.status.instruction='Follow the road to the delivery vehicle';}
      if(captured&&!this.notifiedLost){this.notifiedLost=true;this.ctx.storyCarrierLost?.();}
      if(!captured){if(this.vehicle)this.ctx.releaseRoadVehicle?.(this.vehicle.id);this.restoreDriver?.();this.restoreDriver=null;this.vehicle=null;}
      return false;
    }
    if(!captured&&this.vehicle?.id===selected.id){
      this.stoppedBeforeEntry=Math.abs(selected.speed)<.5?this.stoppedBeforeEntry+seconds:0;
      // The live adapter also returns false while a carrier is stopped. A
      // normal red light must use the longer stopped timer, not masquerade
      // as a newly blocked side lane and jump markers after three seconds.
      this.invalidBeforeEntry=Math.abs(selected.speed)>.5&&selected.approachValid===false?this.invalidBeforeEntry+seconds:0;
      this.farBeforeEntry=distanceXZ(this.ctx.player(),selected)>330?this.farBeforeEntry+seconds:0;
      // A short signal/dwell never makes the marker jump. An inaccessible
      // side lane, terminal stop or distant carrier can recycle BEFORE capture.
      if(this.stoppedBeforeEntry>=10||this.invalidBeforeEntry>=3||this.farBeforeEntry>=2){
        this.ctx.releaseRoadVehicle?.(selected.id);this.restoreDriver?.();this.restoreDriver=null;this.vehicle=null;
        this.stoppedBeforeEntry=0;this.invalidBeforeEntry=0;this.farBeforeEntry=0;this.root.visible=false;this.status.canDrop=false;return false;
      }
    }
    if(this.vehicle?.id!==selected.id){
      if(captured){this.root.visible=false;this.status.canDrop=false;if(!this.notifiedLost){this.notifiedLost=true;this.ctx.storyCarrierLost?.();}return false;}
      this.restoreDriver?.();this.restoreDriver=null;
      this.vehicle=selected;this.notifiedLost=false;this.stoppedBeforeEntry=0;this.invalidBeforeEntry=0;this.farBeforeEntry=0;
      this.driverPrepared=this.kind!=='auto';
      if(this.kind==='auto'){this.restoreDriver=replaceBakedAutoDriver(selected.group);this.driverPrepared=!!this.restoreDriver;}
      this.receiver??=this.character(this.actorStyle,0,0,0,true);
      const seat=this.actorSeat();this.receiver.group.position.copy(seat);
      this.receiver.group.rotation.set(0,Math.PI,0);
    }else this.vehicle=selected;
    if(!this.driverPrepared){this.root.visible=false;this.status.canDrop=false;return false;}
    // Traffic advances later in the Game frame. Parenting to the actual
    // rendered carrier keeps actors/marker in that SAME current transform,
    // including chassis offset and road pitch, without changing its clock.
    if(this.root.parent!==selected.group)selected.group.add(this.root);
    this.root.position.set(0,0,0);this.root.quaternion.identity();this.root.visible=true;
    this.active=!!this.ctx.storyActive?.();if(this.active)this.capturedTime+=seconds;
    this.receiver?.animate?.(seconds,'idle');this.receiver?.setSpeechEnvelope?.(this.ctx.storySpeechEnvelope?.()??0);
    const point=this.approachPoint();Object.assign(this.target,point,{label:this.ctx.destination.label});
    this.ring.position.set(this.sideOffset(),.08,this.behindOffset());
    this.ctx.onTarget?.({...this.target});
    return true;
  }
  protected abstract sideOffset():number;
  protected abstract behindOffset():number;
  protected cameraEye(){return this.localPoint(this.sideOffset()+3.6,2.5,this.behindOffset()+3.8);}
  protected cameraSubject(){const seat=this.actorSeat();return this.localPoint(seat.x,seat.y+1.2,seat.z);}
  protected approachPoint(){return this.localPoint(this.sideOffset(),.55,this.behindOffset());}
  protected entryAllowed(){
    const v=this.vehicle,p=this.ctx.player();if(!v||(!this.active&&v.approachValid===false)||!this.driverPrepared||!this.charactersReady||p.flying||p.descending||p.jumping||Math.abs(p.y-(v.y+.55))>.55)return false;
    const h={x:-Math.sin(p.yaw),z:-Math.cos(p.yaw)},dot=h.x*v.hx+h.z*v.hz;
    return v.speed>1&&Math.abs(p.speed-v.speed)<4&&dot>.9&&distanceXZ(p,this.approachPoint())<2.25;
  }
  get story():ModuleStoryFrame|undefined {
    if(!this.vehicle||!this.root.visible||!this.ctx.automaticStories)return undefined;
    const point=this.approachPoint();return {entry:this.entryAllowed(),allowMovingEntry:true,point,landing:{point,radius:2.25},yaw:this.yaw,speed:this.vehicle.speed,maxSpeed:Math.max(10,this.vehicle.speed+5),verticalSpeed:2};
  }
  get storyArrivalReady(){return this.entryAllowed();}
  get intentionalStop(){return this.active;}
  get cameraFocus(){
    if(!this.vehicle||!this.active)return undefined;
    Object.assign(this.focus.position,this.cameraEye());
    Object.assign(this.focus.target,this.cameraSubject());Object.assign(this.focus.translationAnchor!,this.localPoint(0,0,0));
    return this.focus;
  }
  teardown(){this.restoreDriver?.();this.restoreDriver=null;this.vehicle=null;this.receiver=null;super.teardown();}
}

/** Actual traffic auto, right-side speed match, handoff while both keep moving. */
export class RajaAutoDelivery extends MovingRoadScene {
  protected kind='auto' as const;
  private received:THREE.Object3D|null=null;
  private settleT=0;private cartonStart=new THREE.Vector3();private cartonRest=new THREE.Vector3(.24,1.095,-.88);
  private lampWorld=new THREE.Vector3();private cabinLamp={position:this.lampWorld,kind:'reading' as const};
  protected build(){
    super.build();this.received=null;this.settleT=0;
    this.box(.24,1.04,-.88,.44,.04,.42,'#3c4448').name='Raja supported dashboard pizza tray';
    for(const x of [.08,.40])this.box(x,.88,-.98,.025,.30,.025,'#30383c');
    this.box(.30,1.725,-.95,.16,.055,.13,'#30383c');
    this.box(.30,1.69,-.95,.12,.018,.09,'#FFE0B0').name='Raja practical cabin reading lamp';
  }
  get sceneLamp(){if(!this.vehicle||!this.active||!this.root.visible)return undefined;const point=this.localPoint(.30,1.67,-.95);this.lampWorld.set(point.x,point.y,point.z);return this.cabinLamp;}
  protected get actorStyle(){return 'raja';}
  protected actorSeat(){return new THREE.Vector3(0,.22,-.42);}
  protected sideOffset(){return (this.vehicle?.size[0]??1.36)/2+2.1;}
  protected behindOffset(){return -.42;}
  // The auto's roof occludes a high rear camera. This eye stays outside the
  // right/front opening, below its roof, showing Raja and the actual controls.
  protected cameraEye(){return this.localPoint(1.4,1.55,-1.1);}
  protected cameraSubject(){return this.localPoint(0,1.45,-.42);}
  get storyDialogueReady(){return this.active&&this.capturedTime>.8;}
  update(dt:number){
    if(!this.sync(dt))return;
    this.advanceHandoff(dt);
    if(this.received){this.settleT=Math.min(.65,this.settleT+Math.max(0,Math.min(.1,dt)));const t=this.settleT/.65;this.received.position.lerpVectors(this.cartonStart,this.cartonRest,t*t*(3-2*t));this.received.rotation.set(0,0,0);if(t>=1&&!this.ended)this.done();}
    this.status.canDrop=!this.ended&&!this.received&&!this.handoffPending&&this.active&&this.capturedTime>.8&&this.unlocked()&&(this.ctx.storyDialogueComplete?.()??true);
    this.status.instruction=this.active?'Driving alongside Raja':'Match the auto’s speed on its right';
  }
  onDrop(){if(this.status.canDrop)this.beginHandoff(this.receiver,()=>{
    const carton=this.root.getObjectByName('delivery-received-carton');
    if(carton){this.root.attach(carton);this.received=carton;this.cartonStart.copy(carton.position);this.settleT=0;}else this.done();
  });}
}

/** RTC bus choreography: chunni stays on the windscreen, wave, dialogue, pass.
 * There is deliberately no catch/handoff: the approved joke keeps the pizza. */
export class InduBusDelivery extends MovingRoadScene {
  protected kind='bus' as const;
  protected get actorStyle(){return 'indu';}
  private cloth:THREE.Mesh|null=null;
  private clothWorld=new THREE.Vector3();
  private source=new THREE.Vector3();
  private overtaking=false;
  private lampWorld=new THREE.Vector3();private windowLamp={position:this.lampWorld,kind:'reading' as const};
  protected build(){
    super.build();this.overtaking=false;this.cloth=null;
    this.box(1.255,2.72,2.55,.07,.055,.14,'#303b41');
    this.box(1.28,2.685,2.55,.045,.018,.10,'#FFE0B0').name='Indu practical window courtesy lamp';
  }
  get sceneLamp(){if(!this.vehicle||!this.active||!this.root.visible)return undefined;const point=this.localPoint((this.vehicle.size[0]??2.5)/2+.03,2.66,2.55);this.lampWorld.set(point.x,point.y,point.z);return this.windowLamp;}
  protected actorSeat(){return new THREE.Vector3((this.vehicle?.size[0]??2.5)/2-.25,.96044,2.2);}
  protected sideOffset(){return (this.vehicle?.size[0]??2.5)/2+2.5;}
  protected behindOffset(){return (this.vehicle?.size[2]??11)/2+5;}
  protected cameraEye(){return this.capturedTime<2.1||this.overtaking&&!this.ended?super.cameraEye():this.localPoint((this.vehicle?.size[0]??2.5)/2+2,2.35,3.3);}
  protected cameraSubject(){const seat=this.actorSeat();return this.capturedTime<2.1||this.overtaking&&!this.ended?super.cameraSubject():this.localPoint(seat.x+.10,seat.y+1.2,seat.z);}
  get storyDialogueReady(){return this.active&&this.capturedTime>2.8;}
  private passingPoint(){return this.localPoint(this.sideOffset(),.55,-(this.vehicle?.size[2]??11)/2-7);}
  get story(){const frame=super.story;if(frame&&this.overtaking){frame.point=this.passingPoint();frame.maxSpeed=Math.max(12,(this.vehicle?.speed??0)+9);}return frame;}
  private scarf(){
    if(!this.cloth){
      const geometry=this.own(new THREE.PlaneGeometry(1.7,.52,8,3)),positions=geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++)positions.setZ(i,Math.sin(positions.getX(i)*6)*.055);geometry.computeVertexNormals();
      this.cloth=new THREE.Mesh(geometry,this.mat('#FAF5E9'));this.cloth.name='Indu chunni retained on windshield';this.ctx.scene.add(this.cloth);this.cloth.visible=false;
    }
    const p=this.ctx.player(),window=this.localPoint((this.vehicle?.size[0]??2.5)/2+.08,2.1,2.2),progress=Math.min(1,Math.max(0,(this.capturedTime-.7)/1.4));
    const playerObject=this.ctx.playerObject?.();
    if(progress>=1&&playerObject){
      if(this.cloth.parent!==playerObject)playerObject.add(this.cloth);
      this.cloth.position.set(0,.95,-1.35);this.cloth.rotation.set(-.65,0,0);this.cloth.visible=true;return;
    }
    this.source.set(window.x,window.y,window.z);
    // The centre/front portion of the windscreen: enough cloth to read the gag,
    // without a full-screen opaque blindfold. Once settled it never blows away.
    this.clothWorld.set(p.x-Math.sin(p.yaw)*1.35,p.y+.95,p.z-Math.cos(p.yaw)*1.35);
    this.cloth.position.lerpVectors(this.source,this.clothWorld,progress);this.cloth.position.y+=Math.sin(progress*Math.PI)*.6;
    this.cloth.rotation.set(-.65,p.yaw,Math.sin(progress*Math.PI)*.4);this.cloth.visible=this.capturedTime>.7;
  }
  update(dt:number){
    if(!this.sync(dt))return;
    if(this.active||this.ended){this.scarf();this.receiver?.catchPose(this.capturedTime<3?.22+.16*Math.sin(this.capturedTime*8):0);}
    this.status.canDrop=!this.ended&&!this.overtaking&&this.active&&this.capturedTime>2.8&&this.unlocked()&&(this.ctx.storyDialogueComplete?.()??true);
    this.status.instruction=this.overtaking?'Passing the bus':'Follow the bus in the right lane';
    if(this.overtaking&&distanceXZ(this.ctx.player(),this.passingPoint())<1.5)this.done();
  }
  onDrop(){if(this.status.canDrop){this.overtaking=true;this.status.canDrop=false;}}
  teardown(){this.cloth?.removeFromParent();this.cloth=null;super.teardown();}
}

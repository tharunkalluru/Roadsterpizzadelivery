import * as THREE from 'three';
import { ModuleBase, distanceXZ } from './base';
import { SceneBatch } from './street-scenes';
import type { SceneCharacter } from './character';
import {bindCinematicProp,type CinematicPropRole,type ReviewedPropBinding} from './cinematic-prop-anchors';

/** Stationary stories reuse the real venue's world geometry. They own only the
 * receiver and movie props, never a replacement campus or duplicate theatre. */
export class CinematicVenue extends ModuleBase {
 private actor!:SceneCharacter;private actorStart=new THREE.Vector3();private walk=0;
 private boothReceiver?:THREE.Group;private carton?:THREE.Mesh;
 private roleProps:THREE.Object3D[]=[];
 private placing=false;private placementT=0;
 private fixtureLocal=new THREE.Vector3();private fixtureWorld=new THREE.Vector3();
 private fixtureLamp={position:this.fixtureWorld,kind:'street-scene' as const};
 get headlightGain(){return this.ctx?.storyActive?.() ? .5 : 1;}
 get sceneLamp(){if(!this.root.visible)return undefined;this.fixtureWorld.copy(this.fixtureLocal).applyMatrix4(this.root.matrixWorld);return this.fixtureLamp;}
 private bindProp(prop:THREE.Object3D,role:CinematicPropRole){
  const bindings=this.params.propBindings as Partial<Record<CinematicPropRole,ReviewedPropBinding>>|undefined;
  bindCinematicProp(this.actor,prop,role,bindings?.[role]);this.roleProps.push(prop);
 }
 private get theme(){return String(this.params.venue??'wineMart');}
 private point(x:number,y:number,z:number){return new THREE.Vector3(x,y,z).applyMatrix4(this.root.matrixWorld);}
 get storyDialogueReady(){return this.ctx.storyActive?.()??false;}
 override get story(){
  if(!this.ready||!this.ctx.automaticStories)return undefined;
  const p=this.ctx.player(),point={...this.ctx.destination,y:this.ctx.destination.y+.55};
  return {entry:this.charactersReady&&distanceXZ(p,point)<7&&!p.flying&&!p.jumping&&!p.descending,point,yaw:Number(this.params.sceneYaw)||0,maxSpeed:3,verticalSpeed:2};
 }
 get cameraFocus(){
  if(!this.ctx.storyActive?.())return undefined;
  this.root.updateWorldMatrix(true,false);
  if(this.placing&&this.carton){
    return {position:this.point(13,2.2,-2),target:this.carton.getWorldPosition(new THREE.Vector3()),context:'stationary-handoff' as const};
  }
  if(this.theme==='phoneBooth'&&this.ctx.storySpeaker?.()==='player'){
    return {position:this.point(4,2.2,6),target:this.point(0,1,0),context:'stationary-handoff' as const};
  }
  const target=this.actor.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,this.handoffPending?1.15:1.4,0));
  const a=this.actor.group.position;
  const position=this.theme==='wineMart'?this.point(a.x-(this.handoffPending?2.2:.8),a.y+1.6,a.z+(this.handoffPending?2.8:1.8)):
    this.theme==='phoneBooth'?this.point(a.x+.9,a.y+1.6,a.z+1.8):this.point(a.x+.6,a.y+1.6,a.z+2.2);
  return {position,target,context:'stationary-handoff' as const};
 }
 protected build(){
  this.roleProps=[];this.walk=0;this.boothReceiver=undefined;this.carton=undefined;this.placing=false;this.placementT=0;
  this.root.rotation.y=Number(this.params.sceneYaw)||0;
  const b=new SceneBatch(g=>this.own(g),c=>this.mat(c),this.root);
  const offset=this.params.actorOffset as number[]|undefined;
  this.actorStart.set(...(offset??(this.theme==='artsCorridor'?[0,3.4,-15]:this.theme==='phoneBooth'?[-2,6,-15]:[-1.3,0,-6])) as [number,number,number]);
  this.actor=this.character(String(this.params.actorStyle),this.actorStart.x,this.actorStart.y,this.actorStart.z);
  if(this.theme==='wineMart'){
   // Retail shelving and labels inside the researched shop footprint, clear
   // doorway in front. The world venue supplies the actual exterior shell.
   for(const x of [-5,5])for(const y of [.7,1.5,2.3]){b.box(x,y,-6,1.4,.12,7,'#5D3C2B');for(let z=-9;z<-3;z+=.55){b.cylinder(x,y+.21,z,.085,.36,'#52351E');b.cylinder(x,y+.44,z,.035,.12,'#C6A36A');}}
   const bottle=new THREE.Group();bottle.name='mansion-house-bottle';this.actor.group.add(bottle);this.bindProp(bottle,'bottle');
   this.cylinder(0,.11,0,.045,.22,'#62361E',bottle);this.cylinder(0,.255,0,.021,.07,'#D6B267',bottle);this.cylinder(0,.293,0,.023,.015,'#22211E',bottle);this.box(0,.11,.045,.072,.085,.009,'#E6C77A',bottle);
   const brand=new SceneBatch(g=>this.own(g),c=>this.mat(c),bottle);brand.sign('MANSION',0,.124,.051,.065,'#342819');brand.sign('HOUSE',0,.102,.051,.054,'#342819');brand.flush('mansion-house-label');
   this.boothReceiver=new THREE.Group();this.boothReceiver.name='film-phone-receiver';this.actor.group.add(this.boothReceiver);this.bindProp(this.boothReceiver,'phone');this.box(0,0,0,.055,.15,.025,'#181A1D',this.boothReceiver);
  }else if(this.theme==='phoneBooth'){
   const x=this.actorStart.x,z=this.actorStart.z,y=this.actorStart.y;
   // Authored Athadu phone vignette on the real upper floor, behind the
   // opaque exterior fascia. The roadster never teleports into the building.
   b.box(x,y-.16,z-1,12,.3,9,'#B5A89A');
   b.box(x,y+1.6,z-3,12,3.5,.2,'#CEBFAA');
   b.box(x-3,y+1.6,z, .18,3.5,6,'#9F9689');
   for(const dx of [-.9,.9]){b.box(x+dx,y+1.45,z,.1,2.9,1.8,'#7A5651');b.box(x+dx,y+1.5,z-.9,.1,2.9,.1,'#BCA995');}
   b.box(x,y+2.9,z,1.9,.15,1.9,'#765747');b.box(x,y+2.55,z+.92,1.9,.45,.15,'#DCCDB6');b.sign('TELEPHONES',x,y+2.56,z+1.01,1.7,'#342F2D');
   b.box(x,y+.85,z-.82,1.7,1.65,.12,'#725749');b.box(x+.5,y+1.35,z-.68,.35,.6,.12,'#D3BE79');
   // The Athadu model includes the ivory handset and its coiled cord.
  }else{
   const film=new THREE.Group();film.name='shankar-xray';this.actor.group.add(film);this.bindProp(film,'xray');this.box(0,0,0,.35,.48,.015,'#192A38',film);
   for(const side of [-1,1])for(let i=0;i<5;i++)this.box(side*.07,.12-i*.055,.011,.085,.012,.006,'#AFC6CC',film);
   this.box(0,-.02,.012,.018,.32,.007,'#C4D8DE',film);
   // A continuous flexible tube rests below the collar; no segmented bars
   // rise along the cheeks. The silver chestpiece faces the same way as skin.
   const collar=new THREE.Group();collar.name='shankar-stethoscope';this.actor.group.add(collar);
   const tube=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.1,1.49,.15),new THREE.Vector3(-.13,1.34,.2),new THREE.Vector3(-.08,1.2,.24),
    new THREE.Vector3(0,1.16,.24),new THREE.Vector3(.08,1.2,.24),new THREE.Vector3(.13,1.34,.2),new THREE.Vector3(.1,1.49,.15)]);
   collar.add(new THREE.Mesh(this.own(new THREE.TubeGeometry(tube,32,.012,8,false)),this.mat('#192326')));
   const chest=this.cylinder(0,1.15,.25,.035,.018,'#BFC7CA',collar);chest.rotation.x=Math.PI/2;
  }
  // The receiver walks to the doorway. Its practical entrance light projects
  // forward from the fascia, so the held face is lit from the camera side
  // rather than from above/behind. This reuses the same pooled light slot.
  this.fixtureLocal.set(this.actorStart.x,this.actorStart.y+(this.theme==='phoneBooth'?2.65:3),this.theme==='wineMart'?0:this.actorStart.z+.5);
  if(this.theme==='wineMart')b.box(this.fixtureLocal.x,this.fixtureLocal.y+.08,-1,.08,.08,2,'#35404A');
  b.box(this.fixtureLocal.x,this.fixtureLocal.y+.08,this.fixtureLocal.z,.7,.12,.4,'#35404A');
  b.box(this.fixtureLocal.x,this.fixtureLocal.y,this.fixtureLocal.z,.57,.035,.3,'#FFF0CC');
  b.flush('cinematic-venue-props');this.root.updateWorldMatrix(true,false);
  this.status={instruction:'Stop in the blue marker',canDrop:false,actionLabel:'DELIVER'};
 }
 update(dt:number){
  if(!this.tick(dt)){this.actor?.setSpeechEnvelope?.(0);this.actor?.animate?.(dt,'idle');return;}
  this.root.visible=distanceXZ(this.ctx.player(),this.ctx.destination)<850;
  const active=!!this.ctx.storyActive?.();this.actor.setSpeechEnvelope?.(active?this.ctx.storySpeechEnvelope?.()??0:0);
  const spoken=this.ctx.storyDialogueComplete?.()??true;
  if(this.theme==='wineMart'&&active&&spoken){this.walk=Math.min(1,this.walk+Math.max(0,Math.min(.1,dt))*.25);this.actor.group.position.z=this.actorStart.z+4*this.walk;this.actor.group.position.x=this.actorStart.x-.7*this.walk;if(this.boothReceiver)this.boothReceiver.visible=false;}
  const walking=this.theme==='wineMart'&&this.walk>0&&this.walk<1;
  this.actor.animate?.(dt,walking?'walk':'idle',walking?Math.hypot(4,.7)*.25:0);
  this.advanceHandoff(dt);
  if(this.placing&&this.carton){
    this.placementT+=Math.max(0,Math.min(.1,dt));const t=Math.min(1,this.placementT/1.25);
    const at=this.params.dropOffset as number[]??[10.5,.62,-8.5];
    this.carton.position.set(at[0]*t,.8*(1-t)+at[1]*t+Math.sin(t*Math.PI)*.7,at[2]*t);
    this.status.canDrop=false;if(this.placementT>=2.4)this.done();return;
  }
  this.status.canDrop=this.unlocked()&&active&&spoken&&(this.theme!=='wineMart'||this.walk>=1)&&!this.handoffPending;
 }
 onDrop(){
  if(!this.status.canDrop)return;
  if(this.theme!=='phoneBooth')for(const prop of this.roleProps)prop.visible=false;
  if(this.theme==='phoneBooth'){
   // Mahesh stays at the phone; the pizza is left on the entrance steps.
   this.carton??=this.pizzaBox();this.carton.name='delivery-steps-pizza';this.carton.position.set(0,.8,0);this.placing=true;this.placementT=0;this.status.canDrop=false;this.status.instruction='Pizza left on the steps';
  }else this.beginHandoff(this.actor,()=>this.done());
 }
}

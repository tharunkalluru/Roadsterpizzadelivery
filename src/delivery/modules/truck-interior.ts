import * as THREE from 'three';
import type { MovingRailBody } from '../../game/moving-rail';
import { ModuleBase, distanceXZ, numberParam } from './base';
import type { DeliveryPoint, ModuleArrival } from './types';
import type { SceneCharacter } from './character';

const BED=1.55, REAR=-8, RAMP_LENGTH=8.4, RAMP_TIP=.12;
const OPEN_ANGLE=-Math.acos((RAMP_TIP-BED)/RAMP_LENGTH), RAMP_RUN=Math.sqrt(RAMP_LENGTH**2-(BED-RAMP_TIP)**2);
export class TruckInterior extends ModuleBase {
  private vehicle=new THREE.Group();
  private hinge=new THREE.Group();
  private fold=new THREE.Group();
  private reader!:SceneCharacter;
  private anonymous!:SceneCharacter;
  private routeLength=0; private lengths:number[]=[]; private s=0; private speed=0;
  private open=0; private entered=false; private revealed=false; private steady=0; private caught=-1;
  private pose={x:0,y:0,z:0,hx:0,hz:1,grade:0};
  private previousLocal:{x:number;y:number;z:number}|null=null;
  private priorPlayer={x:0,z:0}; private priorDt=0;
  private envelope:MovingRailBody|null=null;
  private priorBodies=new Map<string,MovingRailBody>();
  private pizza!:THREE.Mesh;
  private throwFrom=new THREE.Vector3();
  private catchTo=new THREE.Vector3();
  get trafficBodies(){return this.envelope?[this.envelope]:[];}
  get arrival():ModuleArrival {const p=this.world(0,REAR,1);return {...p,hx:this.pose.hx,hz:this.pose.hz,side:'rear',radius:48};}
  protected build(){
    this.s=0;this.speed=0;this.open=0;this.entered=false;this.revealed=false;this.steady=0;this.caught=-1;this.lengths=[];this.routeLength=0;this.priorBodies.clear();this.previousLocal=null;
    const route=this.ctx.route||[];for(let i=1;i<route.length;i++){this.routeLength+=distanceXZ(route[i-1],route[i]);this.lengths.push(this.routeLength);}
    this.pose={...this.ctx.destination,hx:0,hz:1,grade:0};
    this.priorPlayer={x:this.ctx.player().x,z:this.ctx.player().z};this.priorDt=0;
    this.vehicle=new THREE.Group();this.vehicle.name='delivery-truck-interior';this.root.add(this.vehicle);
    this.box(0,BED-.18,0,5.6,.36,16,'#8B4B32',this.vehicle).name='delivery-truck-bed';
    for(const x of [-2.85,2.85]){
      this.box(x,3.63,0,.22,4.15,16,'#8B4229',this.vehicle);
      for(const z of [-7.5,-3.5,.5,4.5,7.5])this.box(x*1.01,3.6,z,.25,4.3,.16,'#D6AE6B',this.vehicle);
    }
    this.box(0,3.3,8,5.8,3.5,.3,'#793A29',this.vehicle);
    this.box(0,2.2,10,5.7,4.1,4,'#CA672D',this.vehicle);
    this.box(0,3.5,12.03,4.8,1.5,.04,'#233D4A',this.vehicle);
    for(const x of [-2.7,2.7])for(const z of [-5,5,10]){const wheel=this.cylinder(x,.7,z,.85,.45,'#24252B',this.vehicle);wheel.rotation.z=Math.PI/2;}
    // The logs live along one wall, leaving an unobstructed Roadster-width aisle.
    for(let row=0;row<3;row++)for(let col=0;col<2;col++){
      const log=this.cylinder(-2.3+col*.58,BED+.3+row*.56,3,.3,8,row%2?'#B67F49':'#8E5B35',this.vehicle);log.rotation.x=Math.PI/2;
    }
    this.box(1.6,BED+.3,6,.9,.6,.6,'#4B3430',this.vehicle).name='delivery-truck-study-seat';
    // The seated pelvis contacts y=.58 and shoe soles y=.025 in actor space.
    this.reader=this.character('pushpa',1.6,BED+.02,6,true,this.vehicle);this.reader.group.rotation.y=Math.PI;
    this.reader.group.visible=false;
    this.anonymous=this.character('unknown',1.6,BED+.02,6,true,this.vehicle);this.anonymous.group.rotation.y=Math.PI;
    this.hinge=new THREE.Group();this.hinge.position.set(0,BED-.08,REAR);this.vehicle.add(this.hinge);
    this.box(0,2.1,0,5.5,4.2,.16,'#AC713B',this.hinge);
    this.fold=new THREE.Group();this.fold.position.y=4.2;this.hinge.add(this.fold);
    this.box(0,2.1,0,5.5,4.2,.16,'#B8874D',this.fold);this.fold.rotation.x=Math.PI;
    for(let z=0;z<8;z++)this.box(0,BED+.015,-7+z*1.7,2.6,.025,.075,'#D3AA69',this.vehicle);
    this.pizza=this.box(0,0,0,.9,.17,.9,'#F1B443',this.vehicle);this.pizza.name='delivery-truck-handoff-pizza';this.pizza.visible=false;
    this.status={instruction:'Approach the truck from behind and call',canDrop:false,actionLabel:'HAND OVER'};
    this.movement={mode:'normal'};
    this.updatePose(0);
  }
  private sample(distance:number){
    const route=this.ctx.route||[];if(route.length<2||this.routeLength<1)return null;
    let i=this.lengths.findIndex(v=>v>=distance);if(i<0)i=this.lengths.length-1;
    const a=route[i],b=route[i+1],start=i?this.lengths[i-1]:0,len=Math.max(.001,this.lengths[i]-start),t=Math.max(0,Math.min(1,(distance-start)/len));
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,hx:(b.x-a.x)/len,hz:(b.z-a.z)/len,grade:(b.y-a.y)/len};
  }
  private world(x:number,z:number,y:number):DeliveryPoint{return{x:this.pose.x+this.pose.hz*x+this.pose.hx*z,y:this.pose.y+y+z*this.pose.grade,z:this.pose.z-this.pose.hx*x+this.pose.hz*z};}
  private local(p:DeliveryPoint){const dx=p.x-this.pose.x,dz=p.z-this.pose.z,z=dx*this.pose.hx+dz*this.pose.hz;return{x:dx*this.pose.hz-dz*this.pose.hx,y:p.y-this.pose.y-z*this.pose.grade,z};}
  private body(id:string,x:number,z:number,bottom:number,roof:number,hw:number,hl:number,grade=0):MovingRailBody{
    const at=this.world(x,z,0),prior=this.priorBodies.get(id);
    return{id,x:at.x,y:at.y,z:at.z,hx:this.pose.hx,hz:this.pose.hz,halfWidth:hw,halfLength:hl,bottom:at.y+bottom,roof:at.y+roof,grade:this.pose.grade+grade,
      previous:prior?{x:prior.x,y:prior.y,z:prior.z,hx:prior.hx,hz:prior.hz,grade:prior.grade}:{...at,hx:this.pose.hx,hz:this.pose.hz,grade:this.pose.grade+grade}};
  }
  private updatePose(dt:number){
    const old={...this.pose},priorS=this.s,remaining=this.routeLength-this.s;
    const limit=this.envelope?this.ctx.vehicleSpeedLimit?.(this.envelope):undefined;
    const max=numberParam(this.params,'speed',6,2,10),desired=Math.min(max,limit!=null&&Number.isFinite(limit)?Math.max(0,limit):max,Math.sqrt(Math.max(0,5*remaining)));
    this.speed+=Math.max(-3*dt,Math.min(4*dt,desired-this.speed));this.s=Math.min(this.routeLength,this.s+this.speed*dt);
    if(this.s>=this.routeLength-.01){this.s=this.routeLength;this.speed=0;}
    const next=this.sample(this.s);if(!next){this.vehicle.visible=false;this.envelope=null;this.bodies=[];return false;}
    this.pose=next;let candidate=this.body('delivery-log-truck',0,2,.2,5.8,3,10);
    if(this.ctx.vehiclePoseClear?.(candidate)===false){this.s=priorS;this.speed=0;this.pose=this.sample(this.s)||old;candidate=this.body('delivery-log-truck',0,2,.2,5.8,3,10);}
    this.envelope=candidate;this.vehicle.visible=true;
    this.vehicle.position.set(this.pose.x-this.ctx.destination.x,this.pose.y-this.ctx.destination.y,this.pose.z-this.ctx.destination.z);
    this.vehicle.rotation.set(-Math.atan(this.pose.grade),Math.atan2(this.pose.hx,this.pose.hz),0,'YXZ');
    return true;
  }
  private updateSurfaces(){
    this.bodies=[this.body('delivery-interior-floor',0,0,BED-.36,BED,2.8,8),
      this.body('delivery-interior-cab',0,10,.15,4.25,2.85,2),
      this.body('delivery-interior-front',0,8,BED,5.05,2.9,.15),
      this.body('delivery-interior-left',-2.85,0,BED,5.7,.11,8),this.body('delivery-interior-right',2.85,0,BED,5.7,.11,8),
      this.body('delivery-interior-logs',-2.01,3,BED,BED+1.75,.59,4)];
    if(this.open>=1){this.bodies.push(this.body('delivery-interior-ramp',0,REAR-RAMP_RUN/2,(BED+RAMP_TIP)/2-.16,(BED+RAMP_TIP)/2,2.75,RAMP_RUN/2,(BED-RAMP_TIP)/RAMP_RUN));}
    else{
      const a=this.hinge.rotation.x,b=a+this.fold.rotation.x;
      const y0=BED-.08,z0=REAR,y1=y0+Math.cos(a)*4.2,z1=z0+Math.sin(a)*4.2,y2=y1+Math.cos(b)*4.2,z2=z1+Math.sin(b)*4.2;
      for(const [i,ya,yb,za,zb]of [[0,y0,y1,z0,z1],[1,y1,y2,z1,z2]])this.bodies.push(this.body(`delivery-interior-door:${i}`,0,(za+zb)/2,Math.min(ya,yb)-.08,Math.max(ya,yb)+.08,2.75,Math.max(.08,Math.abs(zb-za)/2)));
    }
    this.priorBodies=new Map(this.bodies.map(b=>[b.id,b]));if(this.envelope)this.priorBodies.set(this.envelope.id,this.envelope);
  }
  update(dt:number){
    if(!this.tick(dt))return;const elapsed=Math.max(0,Math.min(.1,dt));
    if(!this.updatePose(elapsed)){this.status.canDrop=false;this.status.instruction='Preparing a clear highway route';return;}
    if(this.unlocked())this.open=Math.min(1,this.open+elapsed/1.6);
    const smooth=this.open*this.open*(3-2*this.open);this.hinge.rotation.x=OPEN_ANGLE*smooth;this.fold.rotation.x=Math.PI*(1-smooth);
    this.updateSurfaces();
    const p=this.ctx.player(),local=this.local(p),prior=this.previousLocal;
    const crossing=prior&&prior.z<REAR&&local.z>=REAR&&Math.abs(local.x)<1.5&&local.y>=BED+.35&&local.y<=BED+1.4&&!p.flying&&!p.jumping;
    if(this.unlocked()&&this.open===1&&!this.entered&&crossing){this.entered=true;this.reader.group.visible=true;this.anonymous.group.visible=false;if(!this.revealed){this.revealed=true;this.ctx.sceneEvent?.('interiorEntered',{character:'pushpa'});}}
    if(local.z<REAR-3||Math.abs(local.x)>3.5)this.entered=false;
    const localTarget=this.entered?{x:.55,z:2,y:BED+.55}:{x:0,z:REAR-RAMP_RUN-2,y:.55};
    this.setTarget({...this.world(localTarget.x,localTarget.z,localTarget.y),label:this.ctx.destination.label});
    const onFloor=local.y>=BED+.3&&local.y<=BED+1.3;
    const relative=this.priorDt>0?Math.hypot((p.x-this.priorPlayer.x)/this.priorDt-this.pose.hx*this.speed,(p.z-this.priorPlayer.z)/this.priorDt-this.pose.hz*this.speed):Infinity;
    const steady=this.entered&&onFloor&&!p.flying&&!p.jumping&&local.z>-3&&local.z<5&&local.x>-.9&&local.x<1.6&&relative<3.5;
    this.steady=steady?this.steady+elapsed:0;
    this.status.canDrop=this.unlocked()&&this.caught<0&&this.steady>.35;
    this.status.instruction=!this.unlocked()?'Call from behind the moving truck':this.open<1?'Tailgate opening — stay behind the truck':!this.entered?'Drive up the rear ramp into the truck':this.status.canDrop?'Inside! Hand the pizza to the reader':'Ease forward inside, release GO and hand over';
    this.status.progress=this.entered?'Inside the truck':'Rear entrance';
    this.movement={mode:'approach',center:this.world(0,-6,BED),radius:50,altitude:this.pose.y+BED+.8};
    if(this.caught>=0){
      this.caught+=elapsed;const t=Math.min(1,this.caught/.65);
      this.reader.catchPose(Math.min(1,this.caught*3));
      const hands=this.reader.catchPoint;
      if(hands){hands.updateWorldMatrix(true,false);this.catchTo.setFromMatrixPosition(hands.matrixWorld);this.vehicle.worldToLocal(this.catchTo);}
      else this.catchTo.set(1.6,BED+1.2,5.45);
      this.pizza.position.lerpVectors(this.throwFrom,this.catchTo,t);this.pizza.position.y+=Math.sin(t*Math.PI)*.7;
      this.status.instruction=t<1?'Passing the pizza…':'Caught it!';
      if(this.caught>=1.15)this.done();
    }
    this.root.visible=distanceXZ(p,this.pose)<850;this.previousLocal=local;this.priorPlayer={x:p.x,z:p.z};this.priorDt=elapsed;
  }
  onDrop(){
    if(!this.unlocked()||this.ended||this.caught>=0)return;
    if(!this.status.canDrop){this.fail(this.entered?'Slow down inside the truck before handing over.':'Enter through the rear ramp first.');return;}
    const p=this.local(this.ctx.player());this.throwFrom.set(p.x,p.y+.2,p.z);this.caught=0;this.pizza.visible=true;this.status.canDrop=false;this.ctx.sceneEvent?.('catchStarted',{character:'pushpa'});this.ctx.cue?.('throw');
  }
}

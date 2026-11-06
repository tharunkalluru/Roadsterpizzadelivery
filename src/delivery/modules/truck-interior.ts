import * as THREE from 'three';
import type { MovingRailBody } from '../../game/moving-rail';
import { ModuleBase, distanceXZ, numberParam } from './base';
import type { DeliveryPoint, ModuleArrival, ModuleStoryFrame } from './types';
import type { SceneCharacter } from './character';

const BED=1.55, REAR=-8, RAMP_LENGTH=8.4, RAMP_TIP=.12;
// Leave a real viewing/handoff gap ahead of the parked Roadster. A closer
// parking point forced the camera/carton inside the normal lens's near plane.
const PARK_Z=1.2;
const CONTAINER_HALF_WIDTH=3.02, CONTAINER_WALL=.34, CONTAINER_TOP=5.82, CONTAINER_ROOF=.22;
// Actual undeployed Roadster height is1.334331m; the1.55m bed plus
// that envelope and0.215m clearance fit below3.1m. A rear bay is not the
// six-metre container: unrelated elevated roads must not inherit its queue.
export const TRUCK_REAR_APPROACH_CLEARANCE=3.1;
const OPEN_ANGLE=-Math.acos((RAMP_TIP-BED)/RAMP_LENGTH), RAMP_RUN=Math.sqrt(RAMP_LENGTH**2-(BED-RAMP_TIP)**2);
/** NPC planning only. This area contains the full ramp and the parked
 * Roadster behind its blue marker; it must never join player support solids. */
export function truckRearTrafficReservation(truck:MovingRailBody):MovingRailBody{
  const run=RAMP_RUN+5.5,offset=-truck.halfLength-run/2+.15,grade=truck.grade??0;
  const x=truck.x+truck.hx*offset,z=truck.z+truck.hz*offset,y=truck.y+grade*offset;
  const prior=truck.previous,previousGrade=prior.grade??grade;
  return {id:`${truck.id}:rear-approach`,x,y,z,hx:truck.hx,hz:truck.hz,grade,
    bottom:y,roof:y+TRUCK_REAR_APPROACH_CLEARANCE,halfWidth:truck.halfWidth,halfLength:run/2+.15,
    previous:{x:prior.x+prior.hx*offset,y:prior.y+previousGrade*offset,z:prior.z+prior.hz*offset,hx:prior.hx,hz:prior.hz,grade:previousGrade}};
}
export class TruckInterior extends ModuleBase {
  protected override get prepareActors(){return false;}
  override get charactersReady(){return this.graphicsReady;}
  // The physical truck/ramp keeps working during preparation. Reader reveal
  // and handoff have their own exact-instance graphics gate below.
  protected override unlocked(){return this.ready&&(this.ctx.canInteract?.()??true);}
  private vehicle=new THREE.Group();
  private hinge=new THREE.Group();
  private fold=new THREE.Group();
  private reader!:SceneCharacter;
  private anonymous!:SceneCharacter;
  private routeLength=0; private lengths:number[]=[]; private s=0; private speed=0;
  private waitingForDelivery=false;
  private open=0; private entered=false; private revealed=false; private steady=0; private caught=-1;
  private readingReturn=0;
  private readingSource=new THREE.Object3D();
  private readingRequest={position:new THREE.Vector3()};
  private cameraTime=0;private cameraRetryAt=0;
  private cameraPlan:{received:boolean;position:THREE.Vector3;target:THREE.Vector3;clearance:THREE.Vector3}|null=null;
  private readerFocus={position:new THREE.Vector3(),target:new THREE.Vector3(),clearanceTarget:new THREE.Vector3()};
  private graphicsEpoch=0;private graphicsReady=true;private graphicsPending=false;private graphicsRetryAt=Infinity;
  private pose={x:0,y:0,z:0,hx:0,hz:1,grade:0};
  private previousLocal:{x:number;y:number;z:number}|null=null;
  private priorPlayer={x:0,z:0}; private priorDt=0;
  private envelope:MovingRailBody|null=null;
  private priorBodies=new Map<string,MovingRailBody>();
  private pizza!:THREE.Mesh;
  private throwFrom=new THREE.Vector3();
  private catchTo=new THREE.Vector3();
  get trafficBodies(){return this.envelope?[this.envelope]:[];}
  get trafficReservations(){return this.envelope?[truckRearTrafficReservation(this.envelope)]:[];}
  override get story():ModuleStoryFrame|undefined{
    if(!this.ready||!this.ctx.automaticStories||!this.envelope)return undefined;
    const p=this.ctx.player(),local=this.local(p),tip=REAR-RAMP_RUN;
    const entry=local.z<REAR-1&&local.z>tip-24&&Math.abs(local.x)<7&&Math.abs(local.y-.55)<28&&!p.jumping;
    let x=0,z=tip-.3,y=.55;
    if(this.entered){x=.55;z=PARK_Z;y=BED+.55;}
    else if(Math.abs(local.x)<.45&&local.z>=tip-.7&&this.open===1){
      z=Math.min(REAR+.7,local.z+1.4);y=RAMP_TIP+(BED-RAMP_TIP)*Math.max(0,Math.min(1,(z-tip)/RAMP_RUN))+.55;
    }
    return {entry,point:this.world(x,z,y),yaw:Math.atan2(-this.pose.hx,-this.pose.hz),
      maxSpeed:this.entered?Math.max(2,this.speed+2):Math.max(6,this.speed+5),verticalSpeed:3};
  }
  get hideWorldGuidance(){
    if(!this.ready||!this.envelope)return false;
    const p=this.local(this.ctx.player());
    return p.y>BED+.2&&p.y<CONTAINER_TOP-.2&&Math.abs(p.x)<CONTAINER_HALF_WIDTH-CONTAINER_WALL&&p.z>REAR&&p.z<8.15;
  }
  get headlightGain(){return this.hideWorldGuidance ? .02 : undefined;}
  get cameraFocus(){
    const p=this.ctx?.player();
    if(!p||!this.entered||!this.graphicsReady||!this.hideWorldGuidance||this.steady<=.35||Math.abs(p.speed)>.75||p.flying||p.jumping)return undefined;
    const parked=this.local(p);
    // Keep the ordinary safe view while the captured car finishes parking;
    // the close-up is checked for its final physical position, not mid-entry.
    if(this.ctx.automaticStories&&this.ctx.storyActive?.()&&Math.hypot(parked.x-.55,parked.z-PARK_Z)>.18)return undefined;
    const mouth=this.reader.group.getObjectByName('delivery-mouth-anchor'),head=this.reader.group.getObjectByName('Head');
    if(!mouth||!head||!this.reader.group.visible)return undefined;
    const carton=this.reader.group.getObjectByName('received-delivery-carton')??this.reader.group.getObjectByName('received-pizza-openable-carton'),received=carton?.visible===true;
    if(this.cameraPlan?.received!==received){
      if(this.cameraTime<this.cameraRetryAt)return undefined;this.cameraRetryAt=this.cameraTime+1;
      this.vehicle.updateWorldMatrix(true,true);
      const face=mouth.getWorldPosition(new THREE.Vector3()),up=new THREE.Vector3(0,1,0).transformDirection(this.vehicle.matrixWorld);
      // Use the actual face azimuth, but not its downward reading pitch: that
      // pitch otherwise lowers the camera into the Roadster's roof/nose.
      const front=new THREE.Vector3(0,0,1).transformDirection(head.matrixWorld);front.addScaledVector(up,-front.dot(up)).normalize();
      const side=new THREE.Vector3().crossVectors(up,front).normalize(),subject=face.clone().addScaledVector(up,-.10);
      if(received&&carton)subject.lerp(carton.getWorldPosition(new THREE.Vector3()).addScaledVector(up,.02),.30);
      const forwardAlong=Math.abs(-Math.sin(p.yaw)*this.pose.hx-Math.cos(p.yaw)*this.pose.hz),forwardSide=Math.sqrt(Math.max(0,1-forwardAlong*forwardAlong));
      // The real car nose and the physical reader keep-out leave a narrow
      // clear strip. Use its midpoint, rather than putting a low camera above
      // the bonnet or relying on a fixed distance from a leaning reader.
      const near=parked.z+forwardAlong*2.4+forwardSide*1.15+.38,far=6-.75-.38,strip=(near+far)/2;
      const faceAlong=(face.x-this.pose.x)*this.pose.hx+(face.z-this.pose.z)*this.pose.hz,frontAlong=front.x*this.pose.hx+front.z*this.pose.hz,sideAlong=side.x*this.pose.hx+side.z*this.pose.hz,upAlong=up.x*this.pose.hx+up.z*this.pose.hz;
      this.cameraPlan=null;
      // The closed carton is shallow and rests above a single supporting palm.
      // Start slightly below the face to keep that support visible on an uphill truck.
      const elevations=received&&carton?.name==='received-delivery-carton'?[-.15,-.05,.02,.22,.55]:[.02,.55];
      for(const elevation of elevations)for(const lateral of [.22,-.15,0]){
        if(this.cameraPlan)break;
        const distance=near<=far&&frontAlong<-.5?(strip-faceAlong-sideAlong*lateral-upAlong*elevation)/frontAlong:1.45;
        if(distance<.5||distance>2.2)continue;
        const position=face.clone().addScaledVector(front,distance).addScaledVector(side,lateral).addScaledVector(up,elevation);
        const local=this.vehicle.worldToLocal(position.clone());
        if(Math.abs(local.x)>2.55||local.z<REAR+1||local.z>7.3||local.y<BED+.6||local.y>CONTAINER_TOP-.45)continue;
        const dx=position.x-p.x,dz=position.z-p.z,fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw);
        if(Math.abs(dx*fx+dz*fz)<2.75&&Math.abs(dx*fz-dz*fx)<1.5&&position.y+.35>p.y-.55&&position.y-.35<p.y+.8)continue;
        // The old aim was inside the invisible reader/seat keep-out, causing
        // Game.clearCamera to pull a frontal shot into a side profile. Keep
        // the same subject framing ray but choose its clear point in front
        // of that volume. Walls, ceiling, ramp and the full player remain real.
        for(const towardCamera of [0,.2,.4,.6,.85,.95]){
          const target=subject.clone().lerp(position,towardCamera);
          const clear=this.ctx.cameraPathClear?.(target,position);
          if(this.ctx.cameraPathClear&&clear!==true)continue;
          this.cameraPlan={received,position:this.vehicle.worldToLocal(position),target:this.vehicle.worldToLocal(subject.clone()),clearance:this.vehicle.worldToLocal(target)};break;
        }
        if(this.cameraPlan)break;
      }
      if(!this.cameraPlan)return undefined;
    }
    this.vehicle.updateWorldMatrix(true,false);
    this.vehicle.localToWorld(this.readerFocus.position.copy(this.cameraPlan.position));
    this.vehicle.localToWorld(this.readerFocus.target.copy(this.cameraPlan.target));
    this.vehicle.localToWorld(this.readerFocus.clearanceTarget.copy(this.cameraPlan.clearance));return this.readerFocus;
  }
  get sceneLamp(){
    if(!this.ready||!this.vehicle.visible||distanceXZ(this.ctx.player(),this.pose)>40)return undefined;
    this.readingSource.updateWorldMatrix(true,false);this.readingRequest.position.setFromMatrixPosition(this.readingSource.matrixWorld);
    return this.readingRequest;
  }
  get sceneryPending(){return this.ready&&this.ended&&distanceXZ(this.ctx.player(),this.pose)<850;}
  /** Keep a completed physical truck until the whole car, not just its centre,
   * clears the floor/ramp. This also covers a last wheel on the ramp edge. */
  get exitPending(){
    if(!this.ready||!this.ended||!this.envelope)return false;
    const p=this.ctx.player();if(![p.x,p.y,p.z,p.yaw].every(Number.isFinite))return false;
    const local=this.local(p),fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw);
    const along=Math.abs(fx*this.pose.hx+fz*this.pose.hz)*2.4+Math.abs(-fz*this.pose.hx+fx*this.pose.hz)*1.15;
    const side=Math.abs(fx*this.pose.hz-fz*this.pose.hx)*2.4+Math.abs(-fz*this.pose.hz-fx*this.pose.hx)*1.15;
    return local.z+along>=REAR-RAMP_RUN-.15&&local.z-along<=12.25&&
      Math.abs(local.x)<=CONTAINER_HALF_WIDTH+side+.15&&local.y-.55<=CONTAINER_TOP+.2&&local.y+(p.jumping?2.4:1)>=-.2;
  }
  get arrival():ModuleArrival|undefined {if(this.entered)return undefined;const p=this.world(0,REAR,1);return {...p,hx:this.pose.hx,hz:this.pose.hz,side:'rear',radius:48};}
  protected build(){
    this.s=0;this.speed=0;this.waitingForDelivery=false;this.open=0;this.entered=false;this.revealed=false;this.steady=0;this.caught=-1;this.readingReturn=0;this.lengths=[];this.routeLength=0;this.priorBodies.clear();this.previousLocal=null;
    this.cameraTime=0;this.cameraRetryAt=0;this.cameraPlan=null;
    const route=this.ctx.route||[];for(let i=1;i<route.length;i++){this.routeLength+=distanceXZ(route[i-1],route[i]);this.lengths.push(this.routeLength);}
    this.pose={...this.ctx.destination,hx:0,hz:1,grade:0};
    this.priorPlayer={x:this.ctx.player().x,z:this.ctx.player().z};this.priorDt=0;
    this.vehicle=new THREE.Group();this.vehicle.name='delivery-truck-interior';this.root.add(this.vehicle);
    this.box(0,BED-.18,0,5.7,.36,16,'#8B4B32',this.vehicle).name='delivery-truck-bed';
    // This is an enclosed steel container. The ceiling is real geometry and a
    // physical slab; it cannot be mistaken for an open-top tipper at altitude.
    const wallHeight=CONTAINER_TOP-CONTAINER_ROOF-BED;
    for(const x of [-CONTAINER_HALF_WIDTH+CONTAINER_WALL/2,CONTAINER_HALF_WIDTH-CONTAINER_WALL/2]){
      this.box(x,BED+wallHeight/2,0,CONTAINER_WALL,wallHeight,16,'#81442E',this.vehicle).name=x<0?'delivery-container-left-wall':'delivery-container-right-wall';
    }
    this.box(0,CONTAINER_TOP-CONTAINER_ROOF/2,0,CONTAINER_HALF_WIDTH*2,CONTAINER_ROOF,16.2,'#A26042',this.vehicle).name='delivery-container-closed-roof';
    this.box(0,BED+wallHeight/2,8,CONTAINER_HALF_WIDTH*2,wallHeight,.34,'#793A29',this.vehicle).name='delivery-container-front-wall';
    const ribs=this.ownInstances(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(.065,wallHeight-.15,.105)),this.mat('#A96B48'),104));
    ribs.name='delivery-container-corrugated-sides';let rib=0;
    for(const x of [-CONTAINER_HALF_WIDTH-.025,CONTAINER_HALF_WIDTH+.025])for(let i=0;i<52;i++)ribs.setMatrixAt(rib++,new THREE.Matrix4().makeTranslation(x,BED+wallHeight/2,-7.8+i*.305));
    ribs.instanceMatrix.needsUpdate=true;this.vehicle.add(ribs);
    const roofRibs=this.ownInstances(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(5.95,.045,.105)),this.mat('#B57D57'),38));
    roofRibs.name='delivery-container-corrugated-roof';for(let i=0;i<38;i++)roofRibs.setMatrixAt(i,new THREE.Matrix4().makeTranslation(0,CONTAINER_TOP+.02,-7.8+i*.42));
    roofRibs.instanceMatrix.needsUpdate=true;this.vehicle.add(roofRibs);
    for(const x of [-2.88,2.88]){
      for(const z of [-7.88,7.88])this.box(x,BED+wallHeight/2,z,.29,wallHeight+.08,.32,'#C39462',this.vehicle).name='delivery-container-reinforced-corner';
      for(const y of [BED+.05,CONTAINER_TOP-.1])this.box(x,y,0,.31,.16,16.15,'#BE8C5B',this.vehicle);
    }
    this.box(0,2.2,10,5.7,4.1,4,'#CA672D',this.vehicle);
    this.box(0,3.5,12.03,4.8,1.5,.04,'#233D4A',this.vehicle);
    // The cab faces +Z. Opaque emissive lenses remain readable without bloom;
    // rear lights sit beside the folding ramp so opening it cannot hide them.
    for(const [name,color,x,y,z,w,h] of [
      ['delivery-truck-headlights','#fff5dd',2.1,1.3,12.12,.65,.28],
      ['delivery-truck-tail-lights','#ff2436',2.87,1.25,REAR-.14,.22,.30],
    ] as const){
      const lamps=this.ownInstances(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(w,h,.08)),this.mat(color),2));
      lamps.name=name;for(let i=0;i<2;i++)lamps.setMatrixAt(i,new THREE.Matrix4().makeTranslation((i?1:-1)*x,y,z));
      lamps.instanceMatrix.needsUpdate=true;this.vehicle.add(lamps);
    }
    for(const x of [-2.7,2.7])for(const z of [-5,5,10]){const wheel=this.cylinder(x,.7,z,.85,.45,'#24252B',this.vehicle);wheel.rotation.z=Math.PI/2;}
    // The logs live along one wall, leaving an unobstructed Roadster-width aisle.
    for(let row=0;row<3;row++)for(let col=0;col<2;col++){
      const log=this.cylinder(-2.3+col*.58,BED+.3+row*.56,3,.3,8,row%2?'#B67F49':'#8E5B35',this.vehicle);log.rotation.x=Math.PI/2;
    }
    this.box(1.6,BED+.3,6,.9,.6,.6,'#4B3430',this.vehicle).name='delivery-truck-study-seat';
    // This fixture borrows one existing short-range engine light nearby.
    // Adding a PointLight here would change shaders for the whole city.
    this.box(2.79,BED+2.15,5.6,.12,.4,.34,'#363238',this.vehicle).name='delivery-truck-reading-lamp-mount';
    this.box(2.25,BED+2.08,5.6,1.05,.08,.1,'#494247',this.vehicle);
    this.box(1.75,BED+1.98,5.6,.38,.14,.28,'#4D4441',this.vehicle);
    this.box(1.75,BED+1.90,5.6,.3,.035,.21,'#FFE3AA',this.vehicle).name='delivery-truck-reading-lamp-lens';
    this.readingSource=new THREE.Object3D();this.readingSource.name='delivery-truck-reading-light';
    this.readingSource.position.set(1.75,BED+1.84,5.45);this.vehicle.add(this.readingSource);
    // The seated pelvis contacts y=.58 and shoe soles y=.025 in actor space.
    this.reader=this.character('pushpa',1.6,BED+.02,6,true,this.vehicle);this.reader.group.rotation.y=Math.PI;
    this.reader.group.visible=false;
    this.anonymous=this.character('unknown',1.6,BED+.02,6,true,this.vehicle);this.anonymous.group.rotation.y=Math.PI;
    this.hinge=new THREE.Group();this.hinge.position.set(0,BED-.08,REAR);this.vehicle.add(this.hinge);
    this.hinge.name='delivery-container-rear-ramp-hinge';
    this.box(0,2.1,0,5.5,4.2,.16,'#AC713B',this.hinge).name='delivery-container-rear-doors';
    // Twin recessed door faces, centre seam and locking bars remain readable
    // when closed; on opening these panels form the lower drive-on ramp.
    for(const x of [-1.38,1.38]){
      this.box(x,2.1,-.095,2.62,3.92,.06,'#8F5135',this.hinge);
      this.box(x,2.1,-.16,.07,3.7,.08,'#D0B58B',this.hinge);
      this.box(x,1.6,-.225,.36,.065,.07,'#C6A277',this.hinge);
    }
    this.fold=new THREE.Group();this.fold.position.y=4.2;this.hinge.add(this.fold);
    this.box(0,2.1,0,5.5,4.2,.16,'#B8874D',this.fold).name='delivery-container-folded-ramp';this.fold.rotation.x=Math.PI;
    for(let z=0;z<8;z++)this.box(0,BED+.015,-7+z*1.7,2.6,.025,.075,'#D3AA69',this.vehicle);
    this.pizza=this.pizzaBox(this.vehicle);this.pizza.name='delivery-truck-handoff-pizza';this.pizza.visible=false;
    this.status={instruction:'Approach the rear of the moving container',canDrop:false,actionLabel:'HAND OVER'};
    this.movement={mode:'normal'};
    this.updatePose(0);
    // Prepare the exact constructed rigs before their first visible draw.
    // The fixture uses the existing light pool, preserving shader light counts.
    this.graphicsReady=!this.ctx.prepareCharacterGraphics;this.graphicsPending=false;this.graphicsRetryAt=0;
    this.prepareGraphics();
  }
  private prepareGraphics(){
    if(!this.ready||this.graphicsReady||this.graphicsPending||this.time<this.graphicsRetryAt)return;
    const prepare=this.ctx.prepareCharacterGraphics;if(!prepare){this.graphicsReady=true;return;}
    const epoch=this.graphicsEpoch;this.graphicsPending=true;this.graphicsRetryAt=Infinity;this.status.canDrop=false;
    void Promise.resolve().then(()=>{
      if(!this.ready||epoch!==this.graphicsEpoch)return;
      return prepare(this.reader.group,()=>this.ready&&epoch===this.graphicsEpoch);
    }).then(()=>{
      if(!this.ready||epoch!==this.graphicsEpoch)return;
      this.graphicsPending=false;this.graphicsReady=true;this.showReader();
    },()=>{
      if(!this.ready||epoch!==this.graphicsEpoch)return;
      this.graphicsPending=false;this.graphicsRetryAt=this.time+5;
    });
  }
  private showReader(){
    if(!this.entered||!this.graphicsReady)return;
    this.reader.group.visible=true;this.anonymous.group.visible=false;
    if(!this.revealed){this.revealed=true;this.ctx.sceneEvent?.('interiorEntered',{character:'pushpa'});}
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
    const max=numberParam(this.params,'speed',6,2,10),p=this.ctx.player();
    if(this.ctx.automaticStories&&!this.waitingForDelivery&&!this.ctx.storyActive?.()){
      const approach=this.world(0,REAR-RAMP_RUN-2,.55);
      // A delivery stop uses the normal 3m/s² truck braking below. It is
      // requested early enough that the player can follow, brake and park on
      // a stable blue bay. Flight overhead never requests or enters a story.
      if(!p.flying&&!p.descending&&!p.jumping&&Math.abs(p.verticalSpeed??0)<=.15&&
        Math.abs(p.y-approach.y)<=.65&&Math.abs(p.speed)<=max+1.5&&distanceXZ(p,approach)<22&&
        // A vehicle already within a newly moving reservation brakes normally
        // while the truck rolls ahead to establish the rear gap. Do not park
        // the truck over that car and turn the temporary occupancy into a jam.
        this.ctx.vehiclePoseClear?.(truckRearTrafficReservation(this.envelope??this.body('delivery-log-truck',0,2,.2,CONTAINER_TOP+.05,CONTAINER_HALF_WIDTH+.1,10)))!==false)
        this.waitingForDelivery=true;
    }
    if(this.ended&&this.waitingForDelivery&&distanceXZ(p,this.pose)>70)this.waitingForDelivery=false;
    const desired=Math.min(max,this.waitingForDelivery?0:Infinity,limit!=null&&Number.isFinite(limit)?Math.max(0,limit):max,Math.sqrt(Math.max(0,5*remaining)));
    this.speed+=Math.max(-3*dt,Math.min(4*dt,desired-this.speed));this.s=Math.min(this.routeLength,this.s+this.speed*dt);
    if(this.s>=this.routeLength-.01){this.s=this.routeLength;this.speed=0;}
    const next=this.sample(this.s);if(!next){this.vehicle.visible=false;this.envelope=null;this.bodies=[];return false;}
    this.pose=next;let candidate=this.body('delivery-log-truck',0,2,.2,CONTAINER_TOP+.05,CONTAINER_HALF_WIDTH+.1,10);
    if(this.ctx.vehiclePoseClear?.(candidate)===false){this.s=priorS;this.speed=0;this.pose=this.sample(this.s)||old;candidate=this.body('delivery-log-truck',0,2,.2,CONTAINER_TOP+.05,CONTAINER_HALF_WIDTH+.1,10);}
    this.envelope=candidate;this.vehicle.visible=true;
    this.vehicle.position.set(this.pose.x-this.ctx.destination.x,this.pose.y-this.ctx.destination.y,this.pose.z-this.ctx.destination.z);
    this.vehicle.rotation.set(-Math.atan(this.pose.grade),Math.atan2(this.pose.hx,this.pose.hz),0,'YXZ');
    return true;
  }
  private updateSurfaces(){
    this.bodies=[this.body('delivery-interior-floor',0,0,BED-.36,BED,2.8,8),
      this.body('delivery-interior-cab',0,10,.15,4.25,2.85,2),
      this.body('delivery-interior-front',0,8,BED,CONTAINER_TOP-CONTAINER_ROOF,CONTAINER_HALF_WIDTH,.17),
      this.body('delivery-interior-roof',0,0,CONTAINER_TOP-CONTAINER_ROOF,CONTAINER_TOP,CONTAINER_HALF_WIDTH,8.1),
      this.body('delivery-interior-left',-CONTAINER_HALF_WIDTH+CONTAINER_WALL/2,0,BED,CONTAINER_TOP-CONTAINER_ROOF,CONTAINER_WALL/2,8),
      this.body('delivery-interior-right',CONTAINER_HALF_WIDTH-CONTAINER_WALL/2,0,BED,CONTAINER_TOP-CONTAINER_ROOF,CONTAINER_WALL/2,8),
      this.body('delivery-interior-logs',-2.01,3,BED,BED+1.75,.59,4),
      this.body('delivery-study-corner',1.6,6,BED,BED+1.7,.65,.75)];
    if(this.open>=1){this.bodies.push(this.body('delivery-interior-ramp',0,REAR-RAMP_RUN/2,(BED+RAMP_TIP)/2-.16,(BED+RAMP_TIP)/2,2.75,RAMP_RUN/2,(BED-RAMP_TIP)/RAMP_RUN));}
    else{
      const a=this.hinge.rotation.x,b=a+this.fold.rotation.x;
      const y0=BED-.08,z0=REAR,y1=y0+Math.cos(a)*4.2,z1=z0+Math.sin(a)*4.2,y2=y1+Math.cos(b)*4.2,z2=z1+Math.sin(b)*4.2;
      for(const [i,ya,yb,za,zb]of [[0,y0,y1,z0,z1],[1,y1,y2,z1,z2]])this.bodies.push(this.body(`delivery-interior-door:${i}`,0,(za+zb)/2,Math.min(ya,yb)-.08,Math.max(ya,yb)+.08,2.75,Math.max(.08,Math.abs(zb-za)/2)));
    }
    this.priorBodies=new Map(this.bodies.map(b=>[b.id,b]));if(this.envelope)this.priorBodies.set(this.envelope.id,this.envelope);
  }
  update(dt:number){
    this.cameraTime+=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    if(this.ready&&this.ended){this.updateExit(dt);return;}
    if(!this.tick(dt))return;const elapsed=Math.max(0,Math.min(.1,dt));this.prepareGraphics();
    this.reader.animate?.(elapsed,'read');
    if(!this.updatePose(elapsed)){this.status.canDrop=false;this.status.instruction='Preparing a clear highway route';return;}
    const approaching=this.local(this.ctx.player());
    if(this.unlocked()&&(this.open>0||approaching.z<REAR+2&&approaching.z>REAR-40&&Math.abs(approaching.x)<8))this.open=Math.min(1,this.open+elapsed/1.6);
    const smooth=this.open*this.open*(3-2*this.open);this.hinge.rotation.x=OPEN_ANGLE*smooth;this.fold.rotation.x=Math.PI*(1-smooth);
    this.updateSurfaces();
    const p=this.ctx.player(),local=this.local(p),prior=this.previousLocal;
    const crossing=prior&&prior.z<REAR&&local.z>=REAR&&Math.abs(local.x)<1.5&&local.y>=BED+.35&&local.y<=BED+1.4&&!p.flying&&!p.jumping;
    if(this.unlocked()&&this.open===1&&!this.entered&&crossing){this.entered=true;this.showReader();}
    if(local.z<REAR-3||Math.abs(local.x)>3.5)this.entered=false;
    const localTarget=this.entered?{x:.55,z:PARK_Z,y:BED+.55}:{x:0,z:REAR-RAMP_RUN-2,y:.55};
    this.setTarget({...this.world(localTarget.x,localTarget.z,localTarget.y),label:this.ctx.destination.label});
    this.ring.visible=this.caught<0&&!this.hideWorldGuidance;
    const onFloor=local.y>=BED+.3&&local.y<=BED+1.3;
    const relative=this.priorDt>0?Math.hypot((p.x-this.priorPlayer.x)/this.priorDt-this.pose.hx*this.speed,(p.z-this.priorPlayer.z)/this.priorDt-this.pose.hz*this.speed):Infinity;
    const steady=this.entered&&onFloor&&!p.flying&&!p.jumping&&local.z>-3&&local.z<5&&local.x>-.9&&local.x<1.6&&relative<3.5;
    this.steady=steady?this.steady+elapsed:0;
    this.status.canDrop=this.unlocked()&&this.graphicsReady&&this.caught<0&&this.steady>.35;
    this.status.instruction=!this.unlocked()?'Approach the rear of the moving container':this.open<1?'Container ramp opening — stay behind the truck':!this.entered?'Drive up the rear ramp into the container':this.status.canDrop?'Inside! Hand the pizza to the reader':'Ease forward inside, release GO and hand over';
    if(this.entered&&!this.graphicsReady)this.status.instruction='One moment…';
    this.status.progress=this.entered?'Inside the truck':'Rear entrance';
    this.movement={mode:'approach',center:this.world(0,-6,BED),radius:50,altitude:this.pose.y+BED+.8};
    if(this.caught>=0){
      this.caught+=elapsed;const t=Math.min(1,this.caught/.65);
      this.reader.catchPose(Math.min(1,this.caught*3));
      const hands=this.reader.catchPoint;
      if(hands){hands.updateWorldMatrix(true,false);this.catchTo.setFromMatrixPosition(hands.matrixWorld);this.vehicle.worldToLocal(this.catchTo);if(this.reader.catchPointSpace!=='box-center')this.catchTo.y+=.035;}
      else this.catchTo.set(1.6,BED+1.2,5.45);
      this.pizza.position.lerpVectors(this.throwFrom,this.catchTo,t);this.pizza.position.y+=Math.sin(t*Math.PI)*.7;
      this.status.instruction=t<1?'Passing the pizza…':'Caught it!';
      if(this.caught>=1.15){this.reader.receivePizza?.();this.pizza.visible=false;this.done();}
    }
    this.root.visible=distanceXZ(p,this.pose)<850;this.previousLocal=local;this.priorPlayer={x:p.x,z:p.z};this.priorDt=elapsed;
  }
  onDrop(){
    if(!this.unlocked()||this.ended||this.caught>=0)return;
    if(!this.graphicsReady){this.status.canDrop=false;return;}
    if(!this.status.canDrop){this.fail(this.entered?'Slow down inside the truck before handing over.':'Enter through the rear ramp first.');return;}
    const p=this.local(this.ctx.player());this.throwFrom.set(p.x,p.y+.2,p.z);this.caught=0;this.pizza.visible=true;this.status.canDrop=false;this.ctx.sceneEvent?.('catchStarted',{character:'pushpa'});this.ctx.cue?.('throw');
  }
  private updateExit(dt:number){
    this.ring.visible=false;
    this.status.canDrop=false;this.status.actionLabel='EXIT TRUCK';this.status.instruction='Pizza delivered — reverse down the open ramp';this.status.progress='Leave the container';
    this.movement={mode:'normal'};this.pizza.visible=false;
    if(!this.exitPending&&!this.sceneryPending)return;
    const elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    this.readingReturn=Math.min(1,this.readingReturn+elapsed/.45);
    const returning=this.readingReturn*this.readingReturn*(3-2*this.readingReturn);
    this.reader.catchPose(1-returning);this.reader.animate?.(elapsed,'read');
    if(!this.updatePose(elapsed))return;
    this.open=1;this.hinge.rotation.x=OPEN_ANGLE;this.fold.rotation.x=0;this.updateSurfaces();
    this.root.visible=distanceXZ(this.ctx.player(),this.pose)<850;
  }
  teardown(){
    this.graphicsEpoch++;this.graphicsReady=false;this.graphicsPending=false;this.graphicsRetryAt=Infinity;
    this.envelope=null;this.priorBodies.clear();this.previousLocal=null;this.entered=false;this.caught=-1;this.cameraPlan=null;
    super.teardown();
  }
}

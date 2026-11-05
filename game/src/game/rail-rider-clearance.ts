/** Ordinary roof-rider safety. This constrains motion; it never changes a road,
 * rail, clearance requirement, player camera or unoccupied train's timing. */
import type { RailwayRun } from './railway-flow';
import { railwayPoint, projectRailwayRun } from './railway-flow';

export interface RiderPoint { x:number; y:number; z:number }
export interface RiderEnvelope { radius:number; bottom:number; top:number; launchRadius:number;launchBottom:number;launchTop:number }
export interface NativeSoffit {
  readonly id:string; readonly road:string; readonly segment:number;
  readonly triangle:readonly (readonly [number,number,number])[];
  readonly deckTop:number; readonly geometryRevision:string;
}
export interface RiderGeometry {
  readonly revision:string;
  /** A missing streamed cell is unknown, including when it has no surfaces. */
  known(a:RiderPoint,b:RiderPoint,radius:number):boolean;
  near(a:RiderPoint,b:RiderPoint,radius:number):readonly NativeSoffit[];
}
export interface RoofRider {
  pos:RiderPoint; placementRevision:number; supportId:string|null;
  flying:boolean; descending:boolean; jumping:boolean;
}
export interface OccupiedTrain {
  id:string; story:boolean; run:RailwayRun; direction:1|-1; speed:number;
  /** May be supplied only by an exact fitted-route clearance proof. A story
   * label or CDM exclusion alone never grants a rider clearance exemption. */
  storyClearanceVerified?:boolean;
}
export interface RiderMotionLimit { fraction:number; reason:'clear'|'soffit'|'unknown'; obstacle?:string; deckTop?:number }
export interface RiderStop {
  train:string; distance:number; reason:'soffit'|'unknown'; geometryRevision:string;
}
const SAFETY_SPACE=.08, TRAIN_BRAKE=1.5, MAX_STEP=.05;
const finite=(x:number)=>Number.isFinite(x);
const dot=(a:number[],b:number[])=>a[0]*b[0]+a[1]*b[1];

/** Closed swept disk against a literal finite triangle. The triangle interior,
 * its finite edge strips, and its endpoint disks cover its Minkowski sum with
 * the disk. No fixed step sampling can skip a thin diagonal soffit. */
export function sweptDiskTriangle(a:RiderPoint,b:RiderPoint,radius:number,triangle:NativeSoffit['triangle']):[number,number]|null {
  if(!finite(radius)||radius<0||triangle.length!==3||![a.x,a.z,b.x,b.z,...triangle.flat()].every(finite))throw Error('Invalid finite soffit query');
  const start=[a.x,a.z],delta=[b.x-a.x,b.z-a.z],ranges:number[][]=[];
  const constrain=(range:number[],value:number,change:number,low:number,high:number)=>{
    if(change===0)return value>=low&&value<=high;
    const p=(low-value)/change,q=(high-value)/change;
    range[0]=Math.max(range[0],Math.min(p,q));range[1]=Math.min(range[1],Math.max(p,q));return range[0]<=range[1];
  };
  const orientation=(triangle[1][0]-triangle[0][0])*(triangle[2][2]-triangle[0][2])-(triangle[1][2]-triangle[0][2])*(triangle[2][0]-triangle[0][0]);
  if(orientation!==0){
    const inside=[0,1];let ok=true;
    for(let i=0;i<3;i++){
      const p=triangle[i],q=triangle[(i+1)%3],dx=q[0]-p[0],dz=q[2]-p[2],sign=Math.sign(orientation);
      if(!constrain(inside,sign*(dx*(a.z-p[2])-dz*(a.x-p[0])),sign*(dx*delta[1]-dz*delta[0]),0,Infinity)){ok=false;break;}
    }
    if(ok)ranges.push(inside);
  }
  for(let i=0;i<3;i++){
    const p=triangle[i],q=triangle[(i+1)%3],edge=[q[0]-p[0],q[2]-p[2]],length=Math.hypot(...edge),offset=[start[0]-p[0],start[1]-p[2]];
    if(length>0){
      const tangent=edge.map(v=>v/length),normal=[-tangent[1],tangent[0]],range=[0,1];
      if(constrain(range,dot(offset,tangent),dot(delta,tangent),0,length)&&constrain(range,dot(offset,normal),dot(delta,normal),-radius,radius))ranges.push(range);
    }
    const A=dot(delta,delta),B=2*dot(offset,delta),C=dot(offset,offset)-radius*radius;
    if(A===0){if(C<=0)ranges.push([0,1]);}
    else{
      const discriminant=B*B-4*A*C;
      if(discriminant>=0){const root=Math.sqrt(discriminant),range=[Math.max(0,(-B-root)/(2*A)),Math.min(1,(-B+root)/(2*A))];if(range[0]<=range[1])ranges.push(range);}
    }
  }
  return ranges.length?[Math.min(...ranges.map(r=>r[0])),Math.max(...ranges.map(r=>r[1]))]:null;
}

/** Conservative whole-car vertical interval, using the actual finite slab's
 * minimum underside and maximum deck. An expanded footprint can stop early;
 * it cannot license passage through a lower part of a sloped native slab. */
export function limitRiderSweep(geometry:RiderGeometry,a:RiderPoint,b:RiderPoint,envelope:RiderEnvelope,launch=false):RiderMotionLimit {
  if(![envelope.radius,envelope.launchRadius,envelope.bottom,envelope.top,envelope.launchBottom,envelope.launchTop,a.y,b.y].every(finite)||envelope.radius<0||envelope.launchRadius<envelope.radius||envelope.top<envelope.bottom||envelope.launchTop<envelope.top||envelope.launchBottom>envelope.bottom)throw Error('Invalid measured whole-car envelope');
  const radius=(launch?envelope.launchRadius:envelope.radius)+SAFETY_SPACE;
  const bottom=launch?envelope.launchBottom:envelope.bottom,top=launch?envelope.launchTop:envelope.top;
  let best:RiderMotionLimit={fraction:1,reason:'clear'};
  if(!geometry.known(a,b,radius)){
    if(!geometry.known(a,a,radius))return{fraction:0,reason:'unknown'};
    // Loaded-prefix membership is monotone. Locate the unknown frontier so
    // existing train braking starts before it; do not alternate v=0/resume
    // merely because a distant tile has not finished its cold preparation.
    let lo=0,hi=1;
    for(let i=0;i<30;i++){const t=(lo+hi)/2,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(geometry.known(a,p,radius))lo=t;else hi=t;}
    best={fraction:Math.max(0,lo-1e-7),reason:'unknown'};
  }
  for(const slab of geometry.near(a,b,radius)){
    if(slab.geometryRevision!==geometry.revision)throw Error('Stale source-bound soffit');
    const minimum=Math.min(...slab.triangle.map(p=>p[1]));
    if(Math.max(a.y,b.y)+top<minimum-SAFETY_SPACE||Math.min(a.y,b.y)+bottom>slab.deckTop+SAFETY_SPACE)continue;
    const hit=sweptDiskTriangle(a,b,radius,slab.triangle);
    if(hit&&hit[0]<=best.fraction)best={fraction:Math.max(0,hit[0]-1e-7),reason:'soffit',obstacle:slab.id,deckTop:slab.deckTop};
  }
  return best;
}

/** Local state survives Fly detachment until the complete car leaves the
 * stopped rake/low-bridge corridor. Camera changes never affect membership. */
export class RailRiderClearance {
  private latch:{train:string;placement:number;revision:string;releaseTop:number}|null=null;
  private stop:RiderStop|null=null;
  get active(){return this.latch!==null;}
  get warning(){return this.stop!==null;}
  get currentStop():Readonly<RiderStop>|null{return this.stop?{...this.stop}:null;}
  reset(){this.latch=null;this.stop=null;}
  prepare(rider:RoofRider,trains:readonly OccupiedTrain[],geometry:RiderGeometry,envelope:RiderEnvelope,relativeSpeed:number):RiderStop|null {
    if(this.latch?.placement!==rider.placementRevision)this.reset();
    const occupied=trains.find(t=>!(t.story&&t.storyClearanceVerified)&&rider.supportId?.startsWith(t.id+':'));
    if(occupied&&this.latch?.train!==occupied.id)this.latch={train:occupied.id,placement:rider.placementRevision,revision:geometry.revision,releaseTop:-Infinity};
    const train=trains.find(t=>t.id===this.latch?.train&&!(t.story&&t.storyClearanceVerified));
    if(!train){this.reset();return null;}
    const projected=projectRailwayRun(train.run,rider.pos.x,rider.pos.z);
    // Deliberate side/vertical departure, not the mere Fly flag, releases the
    // occupied train. Continued takeoff alongside the roof keeps its hold.
    const departureBottom=rider.flying||rider.descending||rider.jumping?envelope.launchBottom:envelope.bottom;
    const safelyBesideAndBelow=projected.d>envelope.launchRadius+2&&rider.pos.y+envelope.top<projected.y+4.175-SAFETY_SPACE;
    if(!occupied&&(safelyBesideAndBelow||rider.pos.y+departureBottom>Math.max(this.latch!.releaseTop,projected.y+4.175+envelope.top)+SAFETY_SPACE)){
      this.reset();return null;
    }
    this.latch!.revision=geometry.revision;this.stop=null;
    const speed=Math.max(0,train.speed),reach=speed*speed/(2*TRAIN_BRAKE)+speed*MAX_STEP+Math.abs(relativeSpeed)*MAX_STEP+envelope.launchRadius+12;
    const end=Math.max(0,Math.min(train.run.len,projected.s+train.direction*reach));
    const breaks=[projected.s,...train.run.cum.filter(s=>train.direction*(s-projected.s)>0&&train.direction*(end-s)>0),end].sort((a,b)=>train.direction*(a-b));
    const originY=railwayPoint(train.run,projected.s).y,offset=rider.pos.y-originY;
    let traversed=0;
    for(let i=1;i<breaks.length;i++){
      const p=railwayPoint(train.run,breaks[i-1]),q=railwayPoint(train.run,breaks[i]);
      const a={x:p.x,y:p.y+offset,z:p.z},b={x:q.x,y:q.y+offset,z:q.z};
      // A low bridge is one the carried car cannot actually pass. Reserve
      // the whole roll disk horizontally for an upstream manual launch, but
      // do not stop at a high bridge merely because a hypothetical takeoff
      // would rise into it while the player is still just riding upright.
      const limit=limitRiderSweep(geometry,a,b,{...envelope,radius:envelope.launchRadius},false),length=Math.abs(breaks[i]-breaks[i-1]);
      if(limit.reason!=='clear'){
        if(limit.deckTop!==undefined)this.latch!.releaseTop=Math.max(this.latch!.releaseTop,limit.deckTop);
        this.stop={train:train.id,distance:Math.max(0,traversed+length*limit.fraction),reason:limit.reason,geometryRevision:geometry.revision};break;
      }
      traversed+=length;
    }
    return this.currentStop;
  }
  guardRelativeMotion(geometry:RiderGeometry,a:RiderPoint,b:RiderPoint,envelope:RiderEnvelope,launch=false):RiderMotionLimit {
    if(!this.latch)return{fraction:1,reason:'clear'};
    return limitRiderSweep(geometry,a,b,envelope,launch);
  }
}

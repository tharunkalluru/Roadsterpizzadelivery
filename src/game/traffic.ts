import * as THREE from 'three';
import * as M from '../world/traffic_models';
import { rng } from '../core/util';
import type { RoadGraph, GEdge, GNode } from './roadgraph';
import { hasCentreMedian, type BusStop, type CityData } from '../world/city';
import { segmentHitsVehicle } from './spatial-safety';
import { TrafficCurve, roundedTrafficCorner, trafficCurveClear, trafficPoseClear, trafficOverlap, turnProfile, turnSpeed } from './traffic-path';
import { isORR } from '../world/expressway';
import { BusServices, type BusRun, type BusFeed } from './bus-services';
import { signalAspect } from '../world/signals';
import { busLane, busTurn, busRoundedCorner } from './bus-path';
import { BusPassengerExchange } from './bus-passengers';
import { constructionLane } from '../world/construction';
import type { RailwayCrossings } from './railway-crossings';
import type { MovingRailBody } from './moving-rail';
import { trafficApproachRoom, trafficBendRoom } from './traffic-approach';
import { trafficRoadPitch, trafficBodySection } from './traffic-road-posture';
import { TrafficCurveRoadSupport, trafficCurveRoadWindow } from './traffic-curve-road-support';

type Group = 'car' | 'auto' | 'bike' | 'bus' | 'truck';
interface Proto { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; tailLights?: THREE.BufferGeometry; reverseLights?: THREE.BufferGeometry; headlights?: readonly M.LampAnchor[]; decals: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; size: number[]; group: Group }
interface Motion {
  kind: 'bend' | 'junction' | 'lane' | 'uturn' | 'route'; curve: TrafficCurve; startS: number; endS: number;
  edge: GEdge; dir: 1 | -1; lane: number; progress: number; cap: number; node?: string;
  busStep?: number;
  busDistance?: number;
  busPath?: BusRun['path'];
  busSpans?: { edge: GEdge; dir: 1 | -1; start: number; end: number; base: number; index: number }[];
  busStart?: number;
  busStop?: boolean;
}
export interface TrafficLampRig {
  /** Source positions in the model's local frame; front is -Z. */
  headlights: readonly M.LampAnchor[];
  rear: THREE.Mesh;
  reverse: THREE.Mesh;
  brakeHold: number;
  braking: boolean;
  reversing: boolean;
}
export interface Car {
  g: THREE.Group; kind: string; group: Group; size: number[]; edge: GEdge; dir: 1 | -1; s: number; speed: number; want: number;
  lane: number; laneT: number; base: number; x: number; y: number; z: number; hx: number; hz: number; wob: number;
  blockedT: number; stuckT: number; passS: number; honkT: number; filtering: boolean; dwell: number; served: Set<BusStop>;
  motion?: Motion; stopS?: number; planAfter?: number; assertive?: boolean; laneChangeAt?: number; uturnAt?: number;
  busRun?: BusRun; routeDecals?: ReturnType<typeof M.busRouteBoards>;
  passengerExchange?: BusPassengerExchange; lamps?: TrafficLampRig;
  arcadeFlight?: ArcadeAutoFlight;
}
interface ArcadeLanding { edge:GEdge; dir:1|-1; s:number; lane:number; pose:ReturnType<RoadGraph['pointAt']>; }
interface ArcadeAutoFlight {
  elapsed:number; duration:number; startX:number; startY:number; startZ:number;
  vx:number; vy:number; vz:number; landing:ArcadeLanding;
}
export interface Walker { x: number; z: number; crossing: boolean }
export interface TrafficVerticalBounds { bottom: number; top: number }
interface KinematicTrafficVehicle { id: string; x: number; y: number; z: number; hx: number; hz: number; speed: number; size: number[]; reservation?:boolean }
const NO_KINEMATIC_VEHICLES: readonly KinematicTrafficVehicle[] = [];

function playerVerticalBounds(y: number, bounds?: TrafficVerticalBounds): TrafficVerticalBounds {
  if (bounds && Number.isFinite(bounds.bottom) && Number.isFinite(bounds.top) && bounds.top >= bounds.bottom) return bounds;
  const bottom = y - .55;
  return { bottom, top: bottom + 1.2 };
}

const WEIGHT: Record<string, number> = { motorway: 6, motorway_link: 2, trunk: 6, primary: 6, secondary: 4, tertiary: 3, trunk_link: 2, primary_link: 2, secondary_link: 2, residential: 0.6, unclassified: 0.8, service: 0.15, living_street: 0.3, unknown: 0.4 };
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'motorway', 'motorway_link', 'trunk_link']);

export class Traffic {
  cars: Car[] = []; protos: Proto[] = []; byGroup: Record<Group, Proto[]> = { car: [], auto: [], bike: [], bus: [], truck: [] };
  r = rng(77); t = 0;
  private nextStorySpawn=0;
  private storyRejectedFootprints=new Map<string,number>();
  private storyCorridor:{x:number;y:number;z:number}|null=null;
  private pendingStoryVehicle:{kind:'auto'|'bus';candidate:Car;hint:{x:number;y:number;z:number}}|null=null;
  getStoryVehicleCorridor(){return this.storyCorridor;}
  private storyVehicleId:string|null=null;
  private lostStoryVehicleId:string|null=null;
  private storyEntryCheck:{id:string;at:number;x:number;z:number;allowed:boolean}|null=null;

  /** A high-speed collision can launch an auto; it keeps its vehicle identity and lands on mapped road. */
  kickAuto(car:Car, impactSpeed:number, hx:number, hz:number) {
    if(car.group!=='auto'||car.arcadeFlight||!Number.isFinite(impactSpeed)||Math.abs(impactSpeed)<=60/3.6)return false;
    const length=Math.hypot(hx,hz);if(length<.01)return false;hx/=length;hz/=length;
    const direction=Math.sign(impactSpeed),speed=Math.abs(impactSpeed),duration=2.1;
    const launchSpeed=Math.min(55,speed*.9+4);
    const desiredDistance=launchSpeed*duration;
    // Choose an exact legal mapped landing before lift-off. If the full range
    // has no road, progressively shorten the flight; never snap to a late pick.
    let landing:ArcadeLanding|undefined;
    for(const fraction of [1,.85,.7,.55,.4,.28,.18,.1]){
      const distance=desiredDistance*fraction;
      landing=this.arcadeLanding(car, hx*direction, hz*direction, car.x+hx*direction*distance, car.z+hz*direction*distance);
      if(landing)break;
    }
    if(!landing)return false;
    car.arcadeFlight = {
      elapsed: 0, duration, startX: car.x, startY: car.y, startZ: car.z, landing,
      vx: (landing.pose.x - car.x) / duration,
      vy: (landing.pose.y - car.y + 4.9 * duration * duration) / duration,
      vz: (landing.pose.z - car.z) / duration,
    };
    car.speed = 0;
    car.motion = undefined;
    car.stopS = undefined;
    car.dwell = 0;
    return true;
  }

  private arcadeLanding(car:Car, impactX:number, impactZ:number, x:number, z:number):ArcadeLanding|undefined {
    const nearby=this.graph.nearestEdges(x,z,4).filter(edge=>
      this.allowed(car,edge)&&!edge.e.workZone&&(!this.storyLeased(car)||this.graph.permanent.has(edge.e.id)));
    let best:(ArcadeLanding&{score:number})|undefined;
    for(const edge of nearby){
      let canonical=0,bd=Infinity;
      for(let i=1;i<edge.e.pts.length;i++){
        const a=edge.e.pts[i-1],b=edge.e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz||1;
        const u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length2));
        const distance=Math.hypot(x-a[0]-dx*u,z-a[1]-dz*u);
        if(distance<bd){bd=distance;canonical=edge.cum[i-1]+Math.sqrt(length2)*u;}
      }
      for(const dir of [1,-1] as const){
        // RoadGraph stores one-way as the forbidden heading.
        if(edge.e.oneway===(dir===1?'forward':'backward'))continue;
        const [lo,hi]=this.laneRange(edge,car.size[0],dir);if(hi<lo)continue;
        const lane=Math.max(lo,Math.min(hi,car.lane)),s=dir===1?canonical:edge.len-canonical;
        const pose=this.graph.pointAt(edge,s,dir,lane),distance=Math.hypot(pose.x-x,pose.z-z),height=Math.abs(pose.y-car.y);
        if(distance>8||height>1.2)continue;
        if (this.city && !trafficPoseClear(this.city, pose, car.size)) continue;
        const heading = pose.hx * impactX + pose.hz * impactZ;
        const score=distance+height*.8+(heading<0?Math.abs(heading)*12:0)+(edge===car.edge?5:0);
        if(!best||score<best.score)best={edge,dir,s,lane,pose,score};
      }
    }
    return best;
  }

  private advanceArcadeAuto(car:Car,dt:number){
    const flight=car.arcadeFlight!;flight.elapsed=Math.min(flight.duration,flight.elapsed+dt);const t=flight.elapsed;
    car.x=flight.startX+flight.vx*t;car.z=flight.startZ+flight.vz*t;
    car.y=flight.startY+flight.vy*t-4.9*t*t;
    const horizontalSpeed=Math.hypot(flight.vx,flight.vz)||1;car.hx=flight.vx/horizontalSpeed;car.hz=flight.vz/horizontalSpeed;
    if(flight.elapsed<flight.duration){
      car.speed=horizontalSpeed;this.placeVisual(car.g,car,car.size);car.g.rotation.x=-Math.max(-.45,Math.min(.45,(flight.vy-9.8*t)*.025));return;
    }
    const {edge,dir,s,lane,pose}=flight.landing;
    car.edge=edge;car.dir=dir;car.s=s;car.lane=car.laneT=car.base=lane;
    car.x=pose.x;car.y=pose.y;car.z=pose.z;car.hx=pose.hx;car.hz=pose.hz;car.planAfter=0;
    car.arcadeFlight=undefined;car.speed=Math.max(2,Math.min(8,Math.hypot(flight.vx,flight.vz)*.35));car.motion=undefined;this.prepare(car);this.placeVisual(car.g,car,car.size);
  }
  /** One scene-owned live NPC; all ordinary traffic retains its original clock. */
  leaseStoryVehicle(id:string|null){
    // Runtime reads the same selected NPC each frame. Renewing an unchanged
    // live lease must not invalidate its bounded physical-entry probe cache.
    if(id&&id===this.storyVehicleId&&this.cars.some(c=>c.g.uuid===id&&c.g.parent))return;
    this.pendingStoryVehicle=null;if(!id)this.storyCorridor=null;
    this.storyVehicleId=null;this.lostStoryVehicleId=null;this.storyEntryCheck=null;
    if(id){
      const car=this.cars.find(c=>c.g.uuid===id&&c.g.parent);
      if(car){
        this.storyVehicleId=id;
        // The marked RTC service follows its verified two-lane corridor.
        // A published stop path may turn away from that corridor and recenter
        // the bus during a span, removing the player's right-side lane.
        if(car.group==='bus'){car.want=Math.min(car.want,4);if(car.busRun){car.busRun=undefined;car.motion=undefined;car.stopS=undefined;car.planAfter=0;car.dwell=0;}}
      }else this.lostStoryVehicleId=id;
    }
  }
  storyVehicleLeaseStatus(id:string):'active'|'lost'|'none'{
    if(this.lostStoryVehicleId===id)return 'lost';
    return this.storyVehicleId===id&&this.cars.some(c=>c.g.uuid===id&&c.g.parent)?'active':this.storyVehicleId===id?'lost':'none';
  }
  private storyLeased(c:Car){return this.storyVehicleId!=null&&c.g?.uuid===this.storyVehicleId;}
  private storyHorizon(c:Car){return Math.max(220,Math.min(500,c.speed*(c.group==='bus'?35:45)+40));}
  /** Advance planning metadata on connected mapped road only. This is not a
   * visible vehicle and does not advance the traffic clock. */
  private storyForwardCandidate(c:Car,metres:number):Car|null {
    let edge=c.edge,dir=c.dir,s=c.s,left=metres;
    const sideLane=c.lane-c.size[0]/2-(c.group==='bus'?2.5:2.1);
    for(let record=0;record<96;record++){
      const room=edge.len-s;
      if(left<=room){const pose=this.graph.pointAt(edge,s+left,dir,c.lane);return {...c,edge,dir,s:s+left,...pose};}
      left-=room;const end=this.graph.pointAt(edge,edge.len-.01,dir,c.lane),node=this.graph.nodes.get(dir===1?edge.to:edge.from);
      const next=node?.out.filter(o=>o.edge!==edge&&this.graph.permanent.has(o.edge.e.id)&&this.allowed(c,o.edge)&&!o.edge.e.workZone).map(o=>{const [lo,hi]=this.laneRange(o.edge,2,o.dir),p=this.graph.pointAt(o.edge,.01,o.dir,c.lane);return {...o,room:sideLane>=lo+.15&&sideLane<=hi-.15,dot:p.hx*end.hx+p.hz*end.hz,p};}).filter(o=>o.room&&o.dot>.97&&Math.abs(o.p.y-end.y)<.5).sort((a,b)=>b.dot-a.dot)[0];
      if(!next)return null;edge=next.edge;dir=next.dir;s=0;
    }return null;
  }
  private trySpawnStoryCandidate(candidate:Car,px:number,pz:number,validated=false):Car|null {
    const {edge,dir,s,lane,size}=candidate,kind=candidate.group as 'auto'|'bus',distance=Math.hypot(candidate.x-px,candidate.z-pz);
    if(distance<60||distance>300||this.graph.byId.get(edge.e.id)!==edge||!validated&&!this.canEnterStoryVehicle(candidate))return null;
    const side=size[0]/2+(kind==='bus'?2.5:2.1),back=kind==='bus'?size[2]/2+5:-.42;
    const approach={x:candidate.x-candidate.hz*side-candidate.hx*back,y:candidate.y,z:candidate.z+candidate.hx*side-candidate.hz*back,hx:candidate.hx,hz:candidate.hz,size:[2,1.6,4.8]};
    if(this.railwayCrossings?.spawnBlocked(candidate,size[2]/2,size[0]/2)||this.cars.some(c=>trafficOverlap(candidate,c,2)||trafficOverlap(approach,c,1))||(this.kinematicVehicles||NO_KINEMATIC_VEHICLES).some(c=>trafficOverlap(candidate,c,2)||trafficOverlap(approach,c,1)))return null;
    const car=this.spawnAt(kind,edge,dir,s,lane);
    if(kind==='bus'){
      const run=this.services?.bind(edge,dir,s,.37);if(run&&!run.ended&&(run.stopPosition.edge!==edge||run.stopPosition.dir!==dir||run.stopPosition.s-s>350)){car.busRun=run;car.routeDecals=M.busRouteBoards(run.pattern.number,run.pattern.to);for(const decal of car.routeDecals)car.g.add(new THREE.Mesh(decal.geo,decal.mat));}
    }
    this.leaseStoryVehicle(car.g.uuid);this.storyCorridor=null;this.nextStorySpawn=this.t+10;return car;
  }
  /** One ordinary NPC on a verified nearby carriageway when ambient traffic
   * cannot supply this scene. Never moves another car or invents a road. */
  ensureStoryVehicle(kind:'auto'|'bus',px:number,pz:number):Car|null {
    if(![px,pz].every(Number.isFinite))return null;
    const existing=this.cars.filter(c=>c.group===kind&&Math.hypot(c.x-px,c.z-pz)<260&&this.canHostStoryVehicle(c))
      .sort((a,b)=>Math.hypot(a.x-px,a.z-pz)-Math.hypot(b.x-px,b.z-pz)).slice(0,2).find(c=>this.canEnterStoryVehicle(c));
    if(existing)return existing;
    if(this.t<this.nextStorySpawn||this.cars.length>this.max)return null;
    this.nextStorySpawn=this.t+3;
    const pending=this.pendingStoryVehicle;
    if(pending?.kind===kind&&this.graph.byId.get(pending.candidate.edge.e.id)===pending.candidate.edge&&Math.hypot(pending.hint.x-px,pending.hint.z-pz)<1500&&this.canEnterStoryVehicle(pending.candidate)){
      this.storyCorridor=pending.hint;
      // The rendezvous is a hundred metres behind this candidate. A fast
      // flight directly onto the hint still leaves a safe real spawn ahead.
      const ready=this.trySpawnStoryCandidate(pending.candidate,px,pz,true);if(ready)return ready;
      if(Math.hypot(pending.candidate.x-px,pending.candidate.z-pz)<=220){
        const shift=Math.floor(this.t/3)%2?35:-35,c=pending.candidate;
        const alternative=shift>0?this.storyForwardCandidate(c,shift):c.s>=-shift?{...c,s:c.s+shift,...this.graph.pointAt(c.edge,c.s+shift,c.dir,c.lane)}:this.storyForwardCandidate(c,35);
        if(alternative)return this.trySpawnStoryCandidate(alternative,px,pz);
      }
      return null;
    }
    this.pendingStoryVehicle=null;this.storyCorridor=null;
    const proto=this.byGroup[kind][0];if(!proto)return null;
    const nearest=this.graph.nearestEdges(px,pz,12).filter(edge=>{
      if(edge.e.workZone||edge.len<proto.size[2]+2||!this.allowed({group:kind}as Car,edge))return false;
      // Narrow side streets must not crowd all twelve search slots and hide
      // the real multi-lane corridor just beyond them.
      return ([1,-1]as const).some(dir=>{
        if(edge.e.oneway===(dir===1?'forward':'backward'))return false;
        const [lo,hi]=this.laneRange(edge,proto.size[0],dir),lane=hi-.2,[a,b]=this.laneRange(edge,2,dir),sideLane=lane-proto.size[0]/2-(kind==='bus'?2.5:2.1);
        return lane>=lo&&sideLane>=a+.15&&sideLane<=b-.15;
      });
    }).map(edge=>{
      let best=Infinity,s=0;
      for(let i=1;i<edge.e.pts.length;i++){const a=edge.e.pts[i-1],b=edge.e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[1])*dz)/(len*len||1))),d=Math.hypot(px-a[0]-dx*u,pz-a[1]-dz*u);if(d<best){best=d;s=edge.cum[i-1]+len*u;}}
      return {edge,s,distance:best};
    }).sort((a,b)=>a.distance-b.distance).slice(0,12);
    let checks=0,physicalChecks=0;
    for(const item of nearest)for(const offset of [0,90,-90,180,-180,20-item.s,item.edge.len-20-item.s])for(const dir of [1,-1]as const){
      const edge=item.edge;if(edge.e.oneway===(dir===1?'forward':'backward'))continue;
      const margin=Math.min(12,proto.size[2]/2+1),canonical=Math.max(margin,Math.min(edge.len-margin,item.s+offset)),s=dir===1?canonical:edge.len-canonical;
      const [lo,hi]=this.laneRange(edge,proto.size[0],dir),lane=hi-(kind==='bus'?.35:.2);if(lane<lo)continue;
      const sideLane=lane-proto.size[0]/2-(kind==='bus'?2.5:2.1),[sideLow,sideHigh]=this.laneRange(edge,2,dir);if(sideLane<sideLow+.15||sideLane>sideHigh-.15)continue;
      if(++checks>64)return null;
      const pose=this.graph.pointAt(edge,s,dir,lane),distance=Math.hypot(pose.x-px,pose.z-pz);
      if(distance<60||distance>1000)continue;
      const tiles=(this.city as (CityData&{tiles?:Map<string,unknown>})|undefined)?.tiles;if(tiles&&!tiles.has(`${Math.floor(pose.x/1000)}_${Math.floor(pose.z/1000)}`))continue;
      const proposed={group:kind,g:{parent:this.scene},edge,dir,s,lane,size:proto.size,speed:8,...pose}as unknown as Car;
      if(!this.canHostStoryVehicle(proposed)||this.railwayCrossings?.spawnBlocked(pose,proto.size[2]/2,proto.size[0]/2))continue;
      const side=proto.size[0]/2+(kind==='bus'?2.5:2.1),back=kind==='bus'?proto.size[2]/2+5:-.42;
      const approach={x:pose.x-pose.hz*side-pose.hx*back,y:pose.y,z:pose.z+pose.hx*side-pose.hz*back,hx:pose.hx,hz:pose.hz,size:[2,1.6,4.8]};
      const body={...pose,size:proto.size};
      if(this.city&&(!trafficPoseClear(this.city,pose,proto.size)||!trafficPoseClear(this.city,approach,approach.size)))continue;
      if(this.cars.some(c=>trafficOverlap(body,c,2)||trafficOverlap(approach,c,1))||(this.kinematicVehicles||NO_KINEMATIC_VEHICLES).some(c=>trafficOverlap(body,c,2)||trafficOverlap(approach,c,1)))continue;
      const probeKey=`${edge.e.id}:${dir}:${Math.round(s/10)}:${Math.round(lane)}`;
      if((this.storyRejectedFootprints.get(probeKey)??0)>this.t)continue;
      if(physicalChecks++>=2)return null;
      if(!this.canEnterStoryVehicle(proposed)){
        if(this.storyRejectedFootprints.size>128)this.storyRejectedFootprints.clear();
        this.storyRejectedFootprints.set(probeKey,this.t+60);continue;
      }
      this.storyCorridor={x:approach.x,y:approach.y,z:approach.z};
      if(distance>300){
        const future=this.storyForwardCandidate(proposed,100);
        if(future&&physicalChecks<2){physicalChecks++;if(this.canEnterStoryVehicle(future)){this.pendingStoryVehicle={kind,candidate:future,hint:this.storyCorridor};return null;}}
        this.storyRejectedFootprints.set(probeKey,this.t+60);this.storyCorridor=null;continue;
      }
      const car=this.trySpawnStoryCandidate(proposed,px,pz,true);if(car)return car;
    }
    return null;
  }

  /** Both scenes need a real same-direction lane to the vehicle's right,
   * with enough mapped forward road for the dialogue and pass. No roads or
   * traffic are moved just to make the scene possible. */
  storyApproachLaneClear(c:Car){
    if((c.group!=='auto'&&c.group!=='bus')||!c.g.parent||c.edge.e.workZone)return false;
    const lane=c.lane-c.size[0]/2-(c.group==='bus'?2.5:2.1),[low,high]=this.laneRange(c.edge,2,c.dir);
    if(lane<low+.15||lane>high-.15)return false;
    if(c.edge.len-c.s<15){const node=this.graph.nodes.get(c.dir===1?c.edge.to:c.edge.from);if(!node?.out.some(o=>o.edge!==c.edge&&this.allowed(c,o.edge)))return false;}
    return true;
  }
  canHostStoryVehicle(c:Car){
    if(!this.graph.permanent.has(c.edge.e.id)||c.arcadeFlight||c.group==='bus'&&c.motion?.kind==='route'&&c.motion.progress>=0||!this.storyApproachLaneClear(c)||c.speed<=1||c.busRun?.ended||c.dwell>0)return false;
    // Do not advertise a bus trapped behind an existing junction queue.
    // Its first capture runway must be reachable before traffic clears.
    if(c.group==='bus'&&this.cars.some(other=>{
      if(other===c||other.speed>.5||Math.abs(other.y-c.y)>2)return false;
      const dx=other.x-c.x,dz=other.z-c.z,along=dx*c.hx+dz*c.hz,side=dx*c.hz-dz*c.hx;
      return along>0&&along<45&&Math.abs(side)<(other.size[0]+c.size[0])/2+.35;
    }))return false;
    const offset=c.size[0]/2+(c.group==='bus'?2.5:2.1),lane=c.lane-offset;
    const [low,high]=this.laneRange(c.edge,2,c.dir);
    if(lane<low+.15||lane>high-.15)return false;
    const needed=this.storyHorizon(c);
    let edge=c.edge,dir=c.dir,distance=edge.len-c.s;
    for(let n=0;n<96&&distance<needed;n++){
      const node=this.graph.nodes.get(dir===1?edge.to:edge.from),end=this.graph.pointAt(edge,edge.len-.01,dir,lane);
      const next=node?.out.filter(o=>o.edge!==edge&&this.graph.permanent.has(o.edge.e.id)&&this.allowed(c,o.edge)&&!o.edge.e.workZone).map(o=>{
        const [lo,hi]=this.laneRange(o.edge,2,o.dir),pose=this.graph.pointAt(o.edge,.01,o.dir,lane);
        return {...o,pose,room:lane>=lo+.15&&lane<=hi-.15,dot:pose.hx*end.hx+pose.hz*end.hz};
      }).filter(o=>o.room&&o.dot>.97&&Math.abs(o.pose.y-end.y)<.5).sort((a,b)=>b.dot-a.dot)[0];
      if(!next)return false;edge=next.edge;dir=next.dir;distance+=edge.len;
    }
    return distance>=needed;
  }
  /** Revalidate immediately before capture. An initially eligible carrier may
   * have reached a narrower junction while the player was catching up. Cache
   * only this selected vehicle's geometry probe; ordinary NPCs do no extra work. */
  canEnterStoryVehicle(c:Car){
    if(c.arcadeFlight)return false;
    const cached=this.storyEntryCheck;
    if(c.g.uuid&&cached?.id===c.g.uuid&&this.t-cached.at<.65&&Math.hypot(c.x-cached.x,c.z-cached.z)<4)return cached.allowed;
    const leased=this.storyLeased(c);
    let allowed=leased?this.storyApproachLaneClear(c)&&c.dwell<=0:this.canHostStoryVehicle(c);
    const side=c.size[0]/2+(c.group==='bus'?2.5:2.1),back=c.group==='bus'?c.size[2]/2+5:-.42,lane=c.lane-side;
    const needed=leased?Math.max(28,c.speed*25+25):this.storyHorizon(c);let edge=c.edge,dir=c.dir,start=c.s,total=0;
    for(let record=0;allowed&&record<96&&total<needed;record++){
      const end=Math.min(edge.len,start+needed-total);
      if(this.city)for(let s=start;allowed&&s<=end+.01;s+=Math.min(12,Math.max(.01,end-s))){
        const pose=this.graph.pointAt(edge,Math.min(s,end),dir,c.lane),approach={x:pose.x-pose.hz*side-pose.hx*back,y:pose.y,z:pose.z+pose.hx*side-pose.hz*back,hx:pose.hx,hz:pose.hz};
        allowed=trafficPoseClear(this.city,pose,c.size)&&trafficPoseClear(this.city,approach,[2,1.6,4.8]);
        if(s>=end-.01)break;
      }
      total+=end-start;if(!allowed||total>=needed)break;
      const endpoint=this.graph.pointAt(edge,edge.len-.01,dir,lane),node=this.graph.nodes.get(dir===1?edge.to:edge.from);
      const next=node?.out.filter(o=>o.edge!==edge&&this.graph.permanent.has(o.edge.e.id)&&this.allowed(c,o.edge)&&!o.edge.e.workZone).map(o=>{const [lo,hi]=this.laneRange(o.edge,2,o.dir),pose=this.graph.pointAt(o.edge,.01,o.dir,lane);return {...o,room:lane>=lo+.15&&lane<=hi-.15,dot:pose.hx*endpoint.hx+pose.hz*endpoint.hz,pose};}).filter(o=>o.room&&o.dot>.97&&Math.abs(o.pose.y-endpoint.y)<.5).sort((a,b)=>b.dot-a.dot)[0];
      if(!next){allowed=false;break;}edge=next.edge;dir=next.dir;start=0;
    }
    allowed=allowed&&total>=needed;if(c.g.uuid)this.storyEntryCheck={id:c.g.uuid,at:this.t,x:c.x,z:c.z,allowed};return allowed;
  }
  private placeVisual(g: THREE.Group, p: { x: number; y: number; z: number; hx: number; hz: number }, size: number[]) {
    g.position.set(p.x, p.y + .02, p.z);
    // Yaw remains the traffic path's heading. YXZ applies the small road pitch
    // in that local frame instead of tilting around a fixed world axis.
    g.rotation.set(trafficRoadPitch(this.city, p, size[2]), Math.atan2(-p.hx, -p.hz), 0, 'YXZ');
  }
  // Normal tails share the existing lamp batch. These two shared overlays draw
  // only during braking/reversing and remain clear without bloom on phones.
  private brakeLampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setScalar(3.5), toneMapped: false });
  private reverseLampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color().setScalar(2.4), toneMapped: false });
  private attachLamps(group: THREE.Group, proto: Proto): TrafficLampRig | undefined {
    if (!proto.tailLights || !proto.reverseLights) return undefined;
    const rear = new THREE.Mesh(proto.tailLights, this.brakeLampMaterial), reverse = new THREE.Mesh(proto.reverseLights, this.reverseLampMaterial);
    rear.name = 'Traffic brake lamps'; rear.visible = false; reverse.name = 'Traffic reverse lamps'; reverse.visible = false;
    group.add(rear, reverse);
    return { headlights: proto.headlights || [], rear, reverse, brakeHold: 0, braking: false, reversing: false };
  }
  private updateLamps(car: Car, previousSpeed: number, dt: number) {
    const lamps = car.lamps; if (!lamps) return;
    const seconds = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const slowing = Math.abs(previousSpeed) - Math.abs(car.speed) > Math.max(.015, seconds * .6);
    const stopped = Math.abs(car.speed) < .15 && (car.want > .15 || car.dwell > 0);
    lamps.brakeHold = slowing || stopped ? .22 : Math.max(0, lamps.brakeHold - seconds);
    lamps.braking = lamps.brakeHold > 0;
    lamps.reversing = car.speed < -.15;
    lamps.rear.visible = lamps.braking;
    lamps.reverse.visible = lamps.reversing && lamps.reverse.geometry.getAttribute('position').count > 0;
  }
  stopsByEdge = new Map<string, BusStop[]>();
  services: BusServices | null = null;
  passengerExchanges: BusPassengerExchange[] = [];
  onHorn: (kind: string, x: number, z: number) => void = () => {};
  private railwayCrossings?: RailwayCrossings;
  private kinematicVehicles: KinematicTrafficVehicle[] = [];
  setRailwayCrossings(crossings: RailwayCrossings) { this.railwayCrossings = crossings; }
  /** Optional scene vehicles join normal avoidance; ordinary traffic keeps its original clock/path updates. */
  setKinematicVehicles(bodies: readonly MovingRailBody[], dt: number,reservations:readonly MovingRailBody[]=[]) {
    const vehicles = this.kinematicVehicles ||= [];
    let count = 0;
    for(let index=0;index<bodies.length+reservations.length;index++){
      const reservation=index>=bodies.length,body=reservation?reservations[index-bodies.length]:bodies[index];
      if (![body.x, body.z, body.bottom, body.roof, body.hx, body.hz, body.halfWidth, body.halfLength].every(Number.isFinite) ||
        body.roof <= body.bottom || body.halfWidth <= 0 || body.halfLength <= 0) continue;
      const pose = vehicles[count] ||= { id: '', x: 0, y: 0, z: 0, hx: 0, hz: 1, speed: 0, size: [0, 0, 0] };
      const n = Math.hypot(body.hx, body.hz) || 1;
      pose.id = body.id; pose.x = body.x; pose.y = body.bottom; pose.z = body.z;
      pose.reservation=reservation;
      pose.hx = body.hx / n; pose.hz = body.hz / n;
      pose.size[0] = body.halfWidth * 2; pose.size[1] = body.roof - body.bottom; pose.size[2] = body.halfLength * 2;
      pose.speed = Number.isFinite(dt) && dt > 0 && body.previous && [body.previous.x, body.previous.z].every(Number.isFinite) ? Math.min(45, Math.hypot(body.x - body.previous.x, body.z - body.previous.z) / dt) : 0;
      if (!Number.isFinite(pose.speed)) pose.speed = 0;
      count++;
    }
    vehicles.length = count;
  }
  /** Following target for a scripted vehicle, using the same nearby NPC bodies. */
  kinematicSpeedLimit(body: MovingRailBody, desiredSpeed = 12) {
    let target = Number.isFinite(desiredSpeed) ? Math.max(0, desiredSpeed) : 12;
    const n = Math.hypot(body.hx, body.hz) || 1, hx = body.hx / n, hz = body.hz / n;
    for (const car of this.cars) {
      if (body.bottom >= car.y + car.size[1] || body.roof <= car.y) continue;
      const dx = car.x - body.x, dz = car.z - body.z, along = dx * hx + dz * hz, side = dx * hz - dz * hx;
      const dot = hx * car.hx + hz * car.hz, cross = hx * car.hz - hz * car.hx;
      const halfLength = Math.abs(dot) * car.size[2] / 2 + Math.abs(cross) * car.size[0] / 2;
      const halfWidth = Math.abs(cross) * car.size[2] / 2 + Math.abs(dot) * car.size[0] / 2;
      const gap = along - body.halfLength - halfLength;
      if (along > -body.halfLength && gap < 5 + target * 1.2 && Math.abs(side) < body.halfWidth + halfWidth + .3)
        target = Math.min(target, Math.max(0, car.speed * dot) * .9 + Math.max(0, gap - 1.6) * .9);
    }
    return target;
  }
  kinematicPoseClear(body: MovingRailBody) {
    if (![body.x, body.y, body.z, body.bottom, body.roof, body.hx, body.hz, body.halfWidth, body.halfLength].every(Number.isFinite) ||
      body.roof <= body.bottom || body.halfWidth <= 0 || body.halfLength <= 0) return false;
    const size = [body.halfWidth * 2, body.roof - body.bottom, body.halfLength * 2];
    if (this.city && !trafficPoseClear(this.city, body, size)) return false;
    const bounds = { ...body, y: body.bottom, size };
    return !this.cars.some(car => trafficOverlap(bounds, car, .25));
  }
  constructor(public graph: RoadGraph, public scene: THREE.Scene, public mats: Record<string, any>, public max = 55, busStops: BusStop[] = [], public city?: CityData) {
    const R = rng(4049);
    const add = (m: M.Model) => {
      const p: Proto = { body: m.body.geometry(), lights: m.lights.geometry(), tailLights: m.tailLights?.geometry(), reverseLights: m.reverseLights?.geometry(), headlights: m.headlights, decals: m.decals || [], size: m.size, group: m.kind as Group };
      if(m.driverVertexRange)p.body.userData.driverVertexRange=[...m.driverVertexRange];
      this.protos.push(p); this.byGroup[p.group].push(p);
    };
    const CAR = ['#F3F2EE', '#F3F2EE', '#F3F2EE', '#C9CCD2', '#9ea3ad', '#5b5f68', '#b3202a', '#23356b', '#6b1f2a', '#1b1a1f', '#7a5a3a', '#2a5bd7'];
    for (let i = 0; i < 12; i++) add(M.car(R.pick(['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'cab'] as const), CAR[i % CAR.length], R));
    for (let i = 0; i < 10; i++) add(M.auto(R, i));
    for (let i = 0; i < 6; i++) add(M.motorbike(R));
    for (let i = 0; i < 5; i++) add(M.scooter(R));
    for (let i = 0; i < 4; i++) add(M.bus(R));
    for (let i = 0; i < 2; i++) add(M.lorry(R));
    add(M.tanker(R));
    // More recognizable silhouettes, using the same five simulation groups,
    // traffic population cap, following rules, marker and lamp contracts.
    add(M.miniTruck(R));
    add(M.passengerVan(R));
    this.setBusStops(busStops);
  }
  setBusStops(busStops: BusStop[]) {
    this.stopsByEdge.clear();
    for (const s of busStops) (this.stopsByEdge.get(s.edge) || this.stopsByEdge.set(s.edge, []).get(s.edge)!).push(s);
  }
  setBusFeed(feed: BusFeed) { this.services = new BusServices(this.graph, feed); }
  private release(c: Car) {
    if(this.storyLeased(c)){this.lostStoryVehicleId=this.storyVehicleId;this.storyVehicleId=null;}
    this.scene.remove(c.g);
    if (c.passengerExchange) {
      this.scene.remove(c.passengerExchange.group);
      this.passengerExchanges = this.passengerExchanges?.filter(exchange => exchange !== c.passengerExchange) || [];
      c.passengerExchange = undefined;
    }
    const materials = new Set<THREE.Material>();
    for (const decal of c.routeDecals || []) { decal.geo.dispose(); materials.add(decal.mat); }
    for (const material of materials) { (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose(); }
  }
  clear() { this.leaseStoryVehicle(null); for (const c of this.cars) this.release(c); this.cars.length = 0; for (const exchange of this.passengerExchanges || []) this.scene.remove(exchange.group); this.passengerExchanges = []; }
  // vehicles on roads of an unloaded tile leave with it
  dropEdges(gone: Set<GEdge>) {
    for (let i = this.cars.length - 1; i >= 0; i--) if (gone.has(this.cars[i].edge) || (this.cars[i].motion && (gone.has(this.cars[i].motion!.edge)
        || this.cars[i].motion!.busSpans?.some(span => gone.has(span.edge))))) { this.release(this.cars[i]); this.cars.splice(i, 1); }
  }
  // Pedestrians and callers use the same mapped approach plan as the lamps.
  // An unbound/manual node flag cannot invent a traffic controller.
  green(node: GNode, hx: number, hz: number) {
    const controls = node.signalControls || [];
    const matched = controls.slice().sort((a, b) => (b.approach.hx * hx + b.approach.hz * hz) - (a.approach.hx * hx + a.approach.hz * hz))[0];
    return !matched || matched.approach.hx * hx + matched.approach.hz * hz < .8 || signalAspect(matched.site, matched.approach.phase, this.t) === 'green';
  }
  signalState(node: GNode, phase: number) {
    const control = node.signalControls?.find(c => c.approach.phase === phase);
    return control ? signalAspect(control.site, phase, this.t) : 'green';
  }
  private signalAhead(c: Car) {
    // Once the nose has crossed its stop bar on green, finish clearing it.
    if ((c.motion?.kind === 'junction' || c.motion?.kind === 'uturn') && c.motion.progress >= 0) return undefined;
    return this.graph.signalsFor(c.edge, c.dir).find(control => control.approach.stopS >= c.s + c.size[2] / 2 - .1);
  }
  private redStop(c: Car) {
    const control = this.signalAhead(c);
    return control && signalAspect(control.site, control.approach.phase, this.t) !== 'green' ? control.approach.stopS - c.size[2] / 2 - .35 : undefined;
  }
  private railwayDistance(c: Car) {
    const crossings = this.railwayCrossings; if (!crossings) return Infinity;
    const halfLength = c.size[2] / 2;
    let distance = Infinity;
    const stop = crossings.roadStop(c.edge.e.id, c.dir, c.s, halfLength);
    if (stop !== undefined) distance = stop - c.s;
    const m = c.motion;
    if (m) {
      const active = m.progress >= 0, progress = active ? m.progress : 0, approach = active ? 0 : Math.max(0, m.startS - c.s);
      const pathStop = crossings.pathStop(m.curve, active ? progress : -halfLength - 2, halfLength,
        { ...c, halfLength, halfWidth: c.size[0] / 2 });
      if (pathStop !== undefined) distance = Math.min(distance, approach + pathStop - progress);
      const beyond = crossings.roadStop(m.edge.e.id, m.dir, m.endS - halfLength - 1.5, halfLength,
        { ...c, halfLength, halfWidth: c.size[0] / 2 });
      if (beyond !== undefined) distance = Math.min(distance, approach + m.curve.length - progress + beyond - m.endS);
    }
    return distance;
  }
  laneRange(edge: GEdge, w: number, dir: 1 | -1 = 1): [number, number] {
    const work = edge.e.workZone, centre = constructionLane(edge.e, dir);
    if (work && centre !== undefined) { const room = Math.max(0, (work.width - w) / 2 - .3); return [centre - room, centre + room]; }
    const e = edge.e, half = e.w / 2;
    if (isORR(e) && e.expressway?.shoulders) return [-half + e.expressway.shoulders[1] + w / 2 + 0.15, half - e.expressway.shoulders[0] - w / 2 - 0.15];
    if (e.oneway) return [-half + w / 2 + 0.3, half - w / 2 - 0.3];
    const inner = hasCentreMedian(e) ? 0.95 : 0.35;                     // keep clear of the centre median
    return [inner + w / 2, Math.max(inner + w / 2, half - w / 2 - 0.3)];
  }
  pickLane(edge: GEdge, w: number, group: Group, dir: 1 | -1 = 1) {
    const workLane = constructionLane(edge.e, dir); if (workLane !== undefined) return workLane;
    if (group === 'bus') return busLane(edge, dir);
    const e = edge.e, half = e.oneway ? e.w : e.w / 2;
    const usableLanes = e.oneway ? e.joinedPavement?.usableLanes : undefined;
    if (isORR(e) && e.expressway?.throughLanes) {
      const lw = e.expressway.laneWidth || 3.5, left = e.w / 2 - (e.expressway.shoulders?.[0] || 0);
      const [lo, hi] = this.laneRange(edge, w);
      return Math.max(lo, Math.min(hi, left - (Math.floor(this.r() * e.expressway.throughLanes) + 0.5) * lw));
    }
    if (usableLanes === 1) return 0;
    const lanes = usableLanes ?? Math.max(1, Math.floor(half / 3.2)), lw = Math.min(3.4, half / lanes);
    // k counts lanes from the left kerb (slow traffic keeps left in India)
    let k = Math.floor(this.r() * lanes);
    if ((group === 'truck' || group === 'auto') && this.r() < 0.6) k = 0;
    const [lo, hi] = this.laneRange(edge, w);
    const lane = e.oneway ? e.w / 2 - (k + 0.5) * lw : half - (k + 0.5) * lw;
    return Math.max(lo, Math.min(hi, lane + (group === 'bike' ? (this.r() - 0.5) * 1.2 : 0)));
  }
  spawn(px: number, pz: number, forcedGroup?:Group) {
    const cand = this.graph.nearestEdges(px, pz, 4).filter((g) => (WEIGHT[g.e.cls] || 0) > 0.1 && (!forcedGroup||this.allowed({group:forcedGroup}as Car,g)) && !(g.e.elev && Math.max(...g.e.elev) > 1.2 && this.r() < 0.3));
    if (!cand.length) return;
    let tot = 0; for (const g of cand) tot += (WEIGHT[g.e.cls] || 0.2) * g.len;
    let pick = this.r() * tot, edge = cand[0];
    for (const g of cand) { pick -= (WEIGHT[g.e.cls] || 0.2) * g.len; if (pick <= 0) { edge = g; break; } }
    const dirs: (1 | -1)[] = []; if (edge.e.oneway !== 'forward') dirs.push(1); if (edge.e.oneway !== 'backward') dirs.push(-1);
    if (!dirs.length) return;
    const dir = this.r.pick(dirs);
    const s = this.r() * edge.len;
    const p = this.graph.pointAt(edge, s, dir);
    if (this.railwayCrossings?.spawnBlocked(p, 7, 1.4)) return;
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < 70 || d > 300) return;
    const big = MAJOR.has(edge.e.cls);
    // Hyderabad mix: two-wheelers dominate, then autos and cars; buses and lorries on main roads
    const roll = this.r();
    const fast = /^motorway/.test(edge.e.cls);
    let group: Group = forcedGroup ?? (fast ? (roll < 0.66 ? 'car' : roll < 0.82 ? 'bus' : 'truck') : big ? (roll < 0.36 ? 'bike' : roll < 0.58 ? 'auto' : roll < 0.86 ? 'car' : roll < 0.95 ? 'bus' : 'truck') : (roll < 0.5 ? 'bike' : roll < 0.78 ? 'auto' : 'car'));
    const busRun = group === 'bus' ? this.services?.bind(edge, dir, s, this.r()) : null;
    if (group === 'bus' && !busRun) group = fast ? 'truck' : 'car';
    const pr = this.r.pick(this.byGroup[group]);
    const g = new THREE.Group();
    const b = new THREE.Mesh(pr.body, this.mats.vBody); b.castShadow = true; b.receiveShadow = true;
    g.add(b, new THREE.Mesh(pr.lights, this.mats.vLight));
    for (const dc of pr.decals) g.add(new THREE.Mesh(dc.geo, dc.mat));
    const lamps = this.attachLamps(g, pr);
    const lane = this.pickLane(edge, pr.size[0], group, dir);
    const pose = this.graph.pointAt(edge, s, dir, lane);
    if ((this.city && !trafficPoseClear(this.city, pose, pr.size)) || this.cars.some(c => trafficOverlap({ ...pose, size: pr.size }, c, 2)) ||
      (this.kinematicVehicles || NO_KINEMATIC_VEHICLES).some(c => trafficOverlap({ ...pose, size: pr.size }, c, 2))) return;
    this.scene.add(g); this.placeVisual(g, pose, pr.size);
    const want = group === 'bike' ? this.r.range(9, 13) : group === 'bus' || group === 'truck' ? this.r.range(6.5, 9) : group === 'auto' ? this.r.range(7, 10) : this.r.range(8, 12);
    const routeDecals = busRun ? M.busRouteBoards(busRun.pattern.number, busRun.pattern.to) : undefined;
    for (const dc of routeDecals || []) g.add(new THREE.Mesh(dc.geo, dc.mat));
    this.cars.push({ g, lamps, kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * 0.6, want, lane, laneT: lane, base: lane, ...pose, wob: this.r() * 10, blockedT: 0, stuckT: 0, passS: 0, honkT: this.r.range(0.6, 2), filtering: false, dwell: 0, served: new Set(), assertive: group === 'auto' && this.r() < 0.38, laneChangeAt: group === 'bus' ? 0 : this.t + this.r.range(5, 15), uturnAt: this.t + this.r.range(25, 55), busRun: busRun || undefined, routeDecals });
  }
  // place a specific vehicle (used by tests and scripted scenes)
  spawnAt(group: Group, edge: GEdge, dir: 1 | -1, s: number, lane?: number): Car {
    const pr = this.byGroup[group][0];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pr.body, this.mats.vBody), new THREE.Mesh(pr.lights, this.mats.vLight));
    for (const dc of pr.decals) g.add(new THREE.Mesh(dc.geo, dc.mat));
    this.scene.add(g);
    const ln = constructionLane(edge.e, dir) ?? lane ?? this.pickLane(edge, pr.size[0], group, dir);
    const p = this.graph.pointAt(edge, s, dir, ln);
    this.placeVisual(g, p, pr.size);
    const want = group === 'bike' ? 11 : group === 'bus' ? 8 : 10;
    const lamps = this.attachLamps(g, pr);
    const c: Car = { g, lamps, kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * 0.8, want, lane: ln, laneT: ln, base: ln, ...p, wob: 0, blockedT: 0, stuckT: 0, passS: 0, honkT: 0.5, filtering: false, dwell: 0, served: new Set(), assertive: group === 'auto' && this.r() < 0.38, laneChangeAt: group === 'bus' ? 0 : this.t + this.r.range(5, 15), uturnAt: this.t + this.r.range(25, 55) };
    this.cars.push(c);
    return c;
  }
  private plans = 0;
  private allowed(c: Car, edge: GEdge) { return !((c.group === 'auto' || c.group === 'bike') && /^motorway/.test(edge.e.cls)); }
  private curveOK(c: Car, curve: TrafficCurve, spans: readonly { edge: GEdge; dir: 1 | -1; start: number; end: number }[]) {
    if (this.city) curve.setRoadSupport(new TrafficCurveRoadSupport(this.city.surfaceGrid,
      spans.map(span => trafficCurveRoadWindow(span.edge, span.dir, span.start, span.end))));
    return Number.isFinite(curve.length) && curve.length > 0.05 && curve.minRadius >= turnProfile(c.group, c.assertive).minRadius &&
      Math.abs(curve.a.y - curve.b.y) < 3 && (!this.city || trafficCurveClear(curve, this.city, c.size));
  }
  private remember(c: Car, motion: Omit<Motion, 'progress' | 'cap'>) {
    c.motion = { ...motion, progress: -1, cap: turnSpeed(motion.curve, c.group, c.assertive) };
    c.stopS = undefined;
  }
  private segmentRoom(edge: GEdge, dir: 1 | -1, end: boolean) {
    return trafficApproachRoom(edge, dir, end);
  }
  private prepareBusSpan(c: Car) {
    const run = c.busRun; if (!run || run.ended) return false;
    // Tiny source split records are not physical intersections. Plan a smooth
    // swept span across their allotted chain, retaining exact edge ownership at
    // the exit. The next published stop is a hard limit; no stop can be skipped.
    this.services?.next(run, c.edge, c.dir, c.s);
    if (run.path[run.step]?.edge !== c.edge || run.path[run.step]?.dir !== c.dir) return false;
    const spans: { edge: GEdge; dir: 1 | -1; start: number; end: number; base: number; index: number }[] = [];
    let length = 0;
    // Look beyond the length of a typical motion. A corner close to the end
    // of the horizon still needs its complete outgoing turning clearance.
    const lookahead = 120;
    for (let index = run.step; index < run.path.length && length < lookahead && index < run.step + 48; index++) {
      const step = run.path[index], edge = step.edge;
      if (this.graph.byId.get(edge.e.id) !== edge) return false;
      const start = index === run.step ? c.s : 0;
      let end = index === run.path.length - 1 ? run.stopPosition.s : edge.len;
      // A source stop bar must retain the normal explicit red-light approach
      // and queue logic instead of being interpolated across another edge.
      const control = this.graph.signalsFor(edge, step.dir).find(control => control.approach.stopS >= start && control.approach.stopS <= end);
      if (control && index === run.step) break;
      if (control) end = Math.min(end, control.approach.stopS - c.size[2] / 2 - 1.35);
      end = Math.min(end, start + lookahead - length);
      if (end <= start) break;
      spans.push({ edge, dir: step.dir, start, end, base: length, index }); length += Math.max(0, end - start);
      if (control) break;
    }
    if (length < 1) return false;
    const point = (distance: number) => {
      const span = spans.find(s => distance < s.base + s.end - s.start - 1e-6) || spans[spans.length - 1];
      const at = Math.min(span.end, span.start + Math.max(0, distance - span.base));
      return { span, at, pose: this.graph.pointAt(span.edge, at, span.dir, busLane(span.edge, span.dir)) };
    };
    const corners: { at:number; trim:number }[] = [];
    const addCorner = (at:number, dot:number) => {
      if (dot >= .9995) return;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      corners.push({ at, trim:Math.max(.2, turnProfile('bus').radius * Math.tan(angle / 2)) });
    };
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      for (let k = 1; k < span.edge.cum.length - 1; k++) {
        const at = span.dir === 1 ? span.edge.cum[k] : span.edge.len - span.edge.cum[k];
        if (at <= span.start + .01 || at >= span.end) continue;
        const p = this.graph.pointAt(span.edge, at - .001, span.dir), q = this.graph.pointAt(span.edge, at + .001, span.dir);
        addCorner(span.base + at - span.start, p.hx * q.hx + p.hz * q.hz);
      }
      const next = spans[i + 1];
      if (next) {
        const p = this.graph.pointAt(span.edge, span.end - .001, span.dir), q = this.graph.pointAt(next.edge, next.start + .001, next.dir);
        addCorner(span.base + span.end - span.start, p.hx * q.hx + p.hz * q.hz);
      }
    }
    // Reserve the turning radius before the first physical corner, even when
    // several short collinear source edges sit between here and that corner.
    // Picking successive short straight spans otherwise commits the bus too
    // close to a bend for its next smooth curve to fit.
    corners.sort((a,b) => a.at - b.at);
    const corner = corners[0];
    // A shallow source bend needs a short tangent trim; reserving thirteen
    // metres for every two-degree bend merges unrelated bends and can strand
    // a bus on an otherwise smooth arterial road.
    const wantedStart = corner ? Math.max(0, corner.at - corner.trim) : 0;
    const currentRoom = c.edge.len - c.s;
    const startDistance = wantedStart < currentRoom - .01 ? wantedStart : 0;
    const waitForNextEdge = wantedStart >= currentRoom - .01;
    const a = startDistance ? this.graph.pointAt(c.edge, c.s + startDistance, c.dir, c.lane) : this.graph.pointAt(c.edge, c.s, c.dir, c.lane);
    const minimumEnd = corner && !waitForNextEdge ? corner.at + corner.trim : 0;
    const targetDistances = [...new Set((waitForNextEdge ? [Math.max(.2, wantedStart)] : [minimumEnd, 8, 12, 18, 26, 38, 52, 65, 96, lookahead, length]).map(d => Math.min(d, length)))].sort((a, b) => a - b);
    for (const distance of targetDistances) {
      if (distance < .2 || distance < Math.min(length, minimumEnd) - .001 || distance <= startDistance + .05) continue;
      if (!waitForNextEdge && corners.some(corner => corner.at > distance + .01 && corner.at - distance < corner.trim)) continue;
      const end = point(distance), [lowLane, highLane] = this.laneRange(end.span.edge, c.size[0], end.span.dir);
      for (const lane of [...new Set([busLane(end.span.edge, end.span.dir), Math.max(lowLane, Math.min(highLane, 0)), lowLane, highLane])]) {
      const endpoint = this.graph.pointAt(end.span.edge, end.at, end.span.dir, lane), baseCurve = busRoundedCorner(a, endpoint);
      for (const [incoming, outgoing] of [[1,1],[1.25,.8],[1.5,.65],[.8,1.25],[.65,1.5]]) {
      const curve = incoming === 1 && outgoing === 1 ? baseCurve : new TrafficCurve(a, endpoint, baseCurve.handleA * incoming, baseCurve.handleB * outgoing);
      const intended = spans.filter(span => span.base <= distance && span.base + span.end - span.start >= startDistance)
        .map(span => ({ edge: span.edge, dir: span.dir, start: Math.max(span.start, span.start + startDistance - span.base), end: Math.min(span.end, span.start + distance - span.base) }));
      if (!this.curveOK(c, curve, intended)) continue;
      // Without a streamed city (offline tests), still reject a curve that
      // leaves its prescribed road corridor or shortcuts a parallel street.
      let follows = true;
      for (let at = 0; at <= curve.length + .1; at += .8) {
        const p = curve.sample(Math.min(at, curve.length)); let nearest = Infinity;
        for (const span of spans) {
          if (span.base > distance) break;
          const lo = span.dir === 1 ? span.start : span.edge.len - span.end;
          const hi = span.dir === 1 ? span.end : span.edge.len - span.start;
          for (let k = 1; k < span.edge.cum.length; k++) {
            if (span.edge.cum[k] < lo || span.edge.cum[k - 1] > hi) continue;
            const u = span.edge.e.pts[k - 1], v = span.edge.e.pts[k], dx = v[0] - u[0], dz = v[1] - u[1];
            const t = Math.max(0, Math.min(1, ((p.x - u[0]) * dx + (p.z - u[1]) * dz) / (dx * dx + dz * dz || 1)));
            nearest = Math.min(nearest, Math.hypot(p.x - u[0] - dx * t, p.z - u[1] - dz * t) - span.edge.e.w / 2);
          }
        }
        if (nearest > .15) { follows = false; break; }
      }
      if (!follows) continue;
      this.remember(c, { kind: 'route', curve, startS: c.s + startDistance, endS: end.at, edge: end.span.edge, dir: end.span.dir, lane, busStep: end.span.index, busDistance: distance - startDistance, busPath: run.path,
        busSpans: spans.filter(span => span.base < distance + .001), busStart: startDistance,
        busStop: end.span.index === run.path.length - 1 && Math.abs(end.at - run.stopPosition.s) < .01 });
      return true;
      }
      }
    }
    return false;
  }
  // Prepare before braking distance. Pending paths remain fixed, so a new random
  // exit/lane is never selected while a vehicle is already turning.
  private prepare(c: Car) {
    if (c.motion || (c.planAfter || 0) > this.t) return;
    if (c.group === 'bus' && c.busRun && this.prepareBusSpan(c)) return;
    const profile = turnProfile(c.group, c.assertive), edge = c.edge;
    let vertex = Infinity, vertexIndex = -1;
    for (let i = 1; i < edge.cum.length - 1; i++) {
      const s = c.dir === 1 ? edge.cum[i] : edge.len - edge.cum[i];
      if (s < c.s + 0.015 || s >= vertex) continue;
      const a = this.graph.pointAt(edge, s - 0.001, c.dir), b = this.graph.pointAt(edge, s + 0.001, c.dir);
      if (a.hx * b.hx + a.hz * b.hz > 0.9999999) continue;
      vertex = s;
      vertexIndex = i;
    }
    const at = Number.isFinite(vertex) ? vertex : edge.len;
    if (at - c.s > 75) return;
    // A same-edge published stop is the current destination, even when it sits
    // close to the junction. The next service leg is selected after the dwell;
    // the generic missing-exit buffer must not stop the bus before this stop.
    if (!Number.isFinite(vertex) && c.busRun && !c.busRun.ended && c.busRun.stopPosition.edge === edge && c.busRun.stopPosition.dir === c.dir) {
      c.stopS = Math.max(c.s, Math.min(edge.len - .02, c.busRun.stopPosition.s));
      c.planAfter = this.t + .5; return;
    }
    // An unplanned corner is a stop, never permission to snap to another heading.
    c.stopS = Math.max(c.s, at - Math.min(16, c.size[2] + 3));
    if (this.plans >= 3) return;
    this.plans++; c.planAfter = this.t + 1.1;
    if (Number.isFinite(vertex)) {
      const before = this.graph.pointAt(edge, vertex - 0.001, c.dir), after = this.graph.pointAt(edge, vertex + 0.001, c.dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, before.hx * after.hx + before.hz * after.hz)));
      if (angle > Math.PI * 0.94) return;
      const wanted = Math.max(0.2, profile.radius * Math.tan(angle / 2));
      const [roomBefore, roomAfter] = trafficBendRoom(edge, vertexIndex, c.dir);
      for (const factor of [1, 1.45, 0.7]) {
        const trim = Math.min(wanted * factor, roomBefore * 0.46, roomAfter * 0.46);
        const startS = Math.max(c.s, vertex - trim), endS = vertex + trim;
        const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(edge, endS, c.dir, c.lane);
        const curve = roundedTrafficCorner(a, b);
        if (!this.curveOK(c, curve, [{ edge, dir: c.dir, start: startS, end: endS }])) continue;
        this.remember(c, { kind: 'bend', curve, startS, endS, edge, dir: c.dir, lane: c.lane }); return;
      }
      return;
    }
    const node = this.graph.nodes.get(c.dir === 1 ? edge.to : edge.from);
    if (!node) return;
    const assigned = c.busRun && this.services?.next(c.busRun, edge, c.dir, c.s);
    const opts = (c.busRun ? (assigned ? [assigned] : []) : node.out.filter(o => o.edge !== edge && (WEIGHT[o.edge.e.cls] || 0) > 0.1 && this.allowed(c, o.edge))).filter(o=>{if(!this.storyLeased(c))return true;const side=c.lane-c.size[0]/2-(c.group==='bus'?2.5:2.1),[lo,hi]=this.laneRange(o.edge,2,o.dir);return this.graph.permanent.has(o.edge.e.id)&&side>=lo+.15&&side<=hi-.15;});
    if(this.storyLeased(c)&&!opts.length){c.stopS=Math.max(c.s,edge.len-35);return;}
    // Only some autos take opportunistic U-turns; all drivers can return at a
    // sufficiently large dead end. A one-way edge has no reverse graph exit.
    const reverse = node.out.find(o => o.edge === edge && o.dir !== c.dir);
    const drawnOpportunistic = c.assertive && this.t >= (c.uturnAt || 0) && this.r() < 0.14;
    const opportunistic=drawnOpportunistic&&!this.storyLeased(c);
    if (!c.busRun && reverse && (!opts.length || opportunistic) && !edge.e.workZone && !isORR(edge.e) && (!hasCentreMedian(edge.e) || this.city)) {
      const trim = Math.min(Math.max(3, c.size[2] * 0.65), this.segmentRoom(edge, c.dir, true) * 0.45);
      const startS = Math.max(c.s, edge.len - trim), endS = edge.len - startS;
      const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(edge, endS, reverse.dir, c.lane);
      const curve = new TrafficCurve(a, b, Math.abs(c.lane) * 4 / 3);
      if (this.curveOK(c, curve, [{ edge, dir: c.dir, start: startS, end: edge.len }, { edge, dir: reverse.dir, start: 0, end: endS }])) {
        this.remember(c, { kind: 'uturn', curve, startS, endS, edge, dir: reverse.dir, lane: c.lane, node: node.id }); return;
      }
    }
    const shuffled = [...opts];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if(this.storyLeased(c)){
      const end=this.graph.pointAt(edge,edge.len-.01,c.dir,c.lane);
      const score=(out:typeof shuffled[number])=>{const p=this.graph.pointAt(out.edge,.01,out.dir,c.lane);return end.hx*p.hx+end.hz*p.hz;};
      // Keep the existing random draws above, then prefer the already verified
      // legal forward corridor only for this single cinematic carrier.
      shuffled.sort((a,b)=>score(b)-score(a));
    }
    for (const out of shuffled) {
      if (c.group === 'bus') {
        const planned = busTurn(this.graph, edge, c.dir, out.edge, out.dir, c.s, c.lane);
        if (planned && this.curveOK(c, planned.curve, [{ edge, dir: c.dir, start: planned.startS, end: edge.len }, { edge: out.edge, dir: out.dir, start: 0, end: planned.endS }])) {
          this.remember(c, { kind: 'junction', ...planned, edge: out.edge, dir: out.dir, node: node.id }); return;
        }
        continue;
      }
      const entry = this.graph.pointAt(edge, edge.len - 0.001, c.dir), exit = this.graph.pointAt(out.edge, 0.001, out.dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, entry.hx * exit.hx + entry.hz * exit.hz)));
      if (angle > Math.PI * 0.88) continue;
      const [lo, hi] = this.laneRange(out.edge, c.size[0], out.dir), lane = constructionLane(out.edge.e, out.dir) ?? Math.max(lo, Math.min(hi, c.lane));
      const wanted = Math.max(3, profile.radius * Math.tan(angle / 2));
      for (const factor of [1, 1.45, 0.7]) {
        const trimIn = Math.min(wanted * factor, this.segmentRoom(edge, c.dir, true) * 0.46);
        const trimOut = Math.min(wanted * factor, this.segmentRoom(out.edge, out.dir, false) * 0.46);
        const startS = Math.max(c.s, edge.len - trimIn), endS = trimOut;
        const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(out.edge, endS, out.dir, lane);
        const curve = roundedTrafficCorner(a, b);
        if (!this.curveOK(c, curve, [{ edge, dir: c.dir, start: startS, end: edge.len }, { edge: out.edge, dir: out.dir, start: 0, end: endS }])) continue;
        this.remember(c, { kind: 'junction', curve, startS, endS, edge: out.edge, dir: out.dir, lane, node: node.id }); return;
      }
    }
  }
  private canEnter(c: Car, m: Motion, player: { x: number; z: number; y: number; hx?: number; hz?: number }) {
    const other = this.cars.filter(o => o !== c && Math.abs(o.y - c.y) < 4);
    const body = { x: player.x, z: player.z, y: player.y - 0.55, size: [2, 1.6, 4.8], hx: player.hx ?? c.hx, hz: player.hz ?? c.hz };
    for (let s = 0; s <= m.curve.length + 0.01; s += 1.1) {
      const p = { ...m.curve.sample(Math.min(s, m.curve.length)), size: c.size };
      if (trafficOverlap(p, body, 0.5) || other.some(o => trafficOverlap(p, o, 0.5)) ||
        (this.kinematicVehicles || NO_KINEMATIC_VEHICLES).some(o => !(o.reservation&&trafficOverlap(c,o,.5))&&trafficOverlap(p, o, .5))) return false;
    }
    if (m.node && other.some(o => o.motion?.node === m.node && o.motion.progress >= 0)) return false;
    return true;
  }
  private tryLane(c: Car, player: { x: number; z: number; y: number; hx?: number; hz?: number }) {
    if (c.edge.e.workZone) return false;
    if (Math.abs(c.laneT - c.lane) < 0.1 || (c.motion && c.motion.progress >= 0) || this.t < (c.laneChangeAt || 0)) return false;
    const distance = c.group === 'bus' ? 28 : c.assertive ? 6.5 : c.group === 'bike' ? 8 : 14;
    const endS = c.s + Math.max(distance, c.speed * (c.assertive ? 1.4 : 2.5));
    if (endS >= (c.motion?.startS ?? c.stopS ?? c.edge.len) - 2) return false;
    const a = this.graph.pointAt(c.edge, c.s, c.dir, c.lane), b = this.graph.pointAt(c.edge, endS, c.dir, c.laneT);
    // A lane change must stay on a straight section; intervening bends are planned first.
    if (a.hx * b.hx + a.hz * b.hz < 0.99999) return false;
    const curve = new TrafficCurve(a, b, (endS - c.s) / 3);
    if (!this.curveOK(c, curve, [{ edge: c.edge, dir: c.dir, start: c.s, end: endS }])) { c.laneChangeAt = this.t + 2; return false; }
    const m: Motion = { kind: 'lane', curve, startS: c.s, endS, edge: c.edge, dir: c.dir, lane: c.laneT, progress: -1, cap: Math.min(c.want, turnSpeed(curve, c.group, c.assertive)) };
    if (!this.canEnter(c, m, player)) { c.laneChangeAt = this.t + 1.5; return false; }
    c.motion = m; c.stopS = undefined; c.laneChangeAt = this.t + this.r.range(c.assertive ? 8 : 14, c.assertive ? 17 : 25); return true;
  }
  private advance(c: Car, distance: number, player: { x: number; z: number; y: number; hx?: number; hz?: number }, walkers: Walker[]) {
    const body = { x: player.x, z: player.z, y: player.y - 0.55, hx: player.hx ?? c.hx, hz: player.hz ?? c.hz, size: [2, 1.6, 4.8] };
    // Small swept steps prevent a long bus or a fast auto tunnelling through a
    // crossing vehicle between frames. This is simulation collision, not a test driver.
    for (let guard = 0; distance > 1e-6 && guard < 32; guard++) {
      const railwayDistance = this.railwayDistance(c);
      if (railwayDistance <= 1e-5) { c.speed = 0; break; }
      let m = c.motion;
      if (m && m.progress < 0 && c.s >= m.startS - 1e-6) {
        if ((m.node && this.redStop(c) !== undefined) || !this.canEnter(c, m, player)) { c.speed = 0; break; }
        m.progress = 0;
        if (m.kind === 'uturn') c.uturnAt = this.t + this.r.range(45, 85);
      }
      const active = m && m.progress >= 0;
      let available = active ? m!.curve.length - m!.progress : Math.max(0, (m?.startS ?? c.stopS ?? c.edge.len - 0.02) - c.s);
      available = Math.min(available, Math.max(0, railwayDistance));
      const redStop = this.redStop(c);
      if (redStop !== undefined) {
        const roadPerCurve = active ? (m!.endS - m!.startS) / m!.curve.length : 1;
        if (roadPerCurve > 0) available = Math.min(available, Math.max(0, redStop - c.s) / roadPerCurve);
      }
      const step = Math.min(distance, 0.4, available);
      if (step < 1e-7) { c.speed = 0; break; }
      const p = active ? m!.curve.sample(m!.progress + step) : this.graph.pointAt(c.edge, c.s + step, c.dir, c.lane);
      if (this.railwayCrossings?.movementBlocked(c, p, c.size[2] / 2, c.size[0] / 2)) { c.speed = 0; break; }
      const bounds = { ...p, size: c.size };
      const overlaps = (o: Parameters<typeof trafficOverlap>[1]) => trafficOverlap(bounds, o, 0.18) &&
        (!trafficOverlap(c, o, 0.18) || Math.hypot(p.x - o.x, p.z - o.z) <= Math.hypot(c.x - o.x, c.z - o.z));
      const walkerHit = walkers.some(w => w.crossing && trafficOverlap(bounds, { ...w, y: p.y, hx: 1, hz: 0, size: [0.7, 1.8, 0.7] }, 0.5));
      if (overlaps(body) || this.cars.some(o => o !== c && overlaps(o)) ||
        (this.kinematicVehicles || NO_KINEMATIC_VEHICLES).some(o=>!(o.reservation&&trafficOverlap(c,o,.18))&&overlaps(o)) || walkerHit || (this.city && !trafficPoseClear(this.city, p, c.size))) { c.speed = 0; break; }
      distance -= step;
      if (active) {
        m!.progress += step;
        const u = m!.progress / m!.curve.length;
        if (m!.kind === 'route') {
          const progress = m!.busStart! + m!.busDistance! * u;
          const span = m!.busSpans!.find(span => progress < span.base + span.end - span.start - 1e-6) || m!.busSpans![m!.busSpans!.length - 1];
          c.edge = span.edge; c.dir = span.dir; c.s = Math.min(span.end, span.start + Math.max(0, progress - span.base));
          if (c.busRun?.path === m!.busPath) c.busRun.step = span.index;
        } else c.s = m!.startS + ((m!.kind === 'junction' || m!.kind === 'uturn' ? c.edge.len : m!.endS) - m!.startS) * u;
        if (m!.kind === 'lane') c.lane = c.lane + (m!.lane - c.lane) * step / Math.max(step, m!.curve.length - m!.progress + step);
        if (m!.progress >= m!.curve.length - 1e-6) {
          c.edge = m!.edge; c.dir = m!.dir; c.s = m!.endS; c.lane = m!.lane;
          if (m!.busStep !== undefined && c.busRun && c.busRun.path === m!.busPath) c.busRun.step = m!.busStep;
          if (m!.kind === 'junction' || m!.kind === 'uturn' || m!.kind === 'route') { c.base = c.laneT = c.lane; c.filtering = false; c.dwell = 0; }
          c.motion = undefined; c.planAfter = 0;
          // Plan the next corner before consuming any remaining frame distance.
          this.prepare(c); m = c.motion;
        }
      } else c.s += step;
      c.x = p.x; c.y = p.y; c.z = p.z; c.hx = p.hx; c.hz = p.hz;
    }
    this.placeVisual(c.g, c, c.size);
  }
  update(dt: number, px: number, pz: number, player: { x: number; z: number; y: number; speed: number; hx?: number; hz?: number }, walkers: Walker[] = []) {
    this.plans = 0;
    this.t += dt;
    for (let i = (this.passengerExchanges?.length || 0) - 1; i >= 0; i--) {
      const exchange = this.passengerExchanges[i]; exchange.update(dt);
      if (exchange.finished || Math.hypot(exchange.group.position.x - px, exchange.group.position.z - pz) > 200) {
        this.scene.remove(exchange.group); this.passengerExchanges.splice(i, 1);
      }
    }
    for (let k = 0; k < 6 && this.cars.length < this.max; k++) this.spawn(px, pz);
    // over budget (moved somewhere quieter): retire the farthest vehicle once it is well out of the way
    if (this.cars.length > this.max) {
      let far = -1, fd = 160;
      for (let i = 0; i < this.cars.length; i++) { const d = Math.hypot(this.cars[i].x - px, this.cars[i].z - pz); if (d > fd&&!this.storyLeased(this.cars[i])) { fd = d; far = i; } }
      if (far >= 0) { this.release(this.cars[far]); this.cars.splice(far, 1); }
    }
    const byEdge = new Map<GEdge, Car[]>();
    for (const c of this.cars) if(!c.arcadeFlight) (byEdge.get(c.edge) || byEdge.set(c.edge, []).get(c.edge)!).push(c);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - px, c.z - pz) > 340&&!this.storyLeased(c)) { this.release(c); this.cars.splice(i, 1); continue; }
      const previousSpeed = c.speed;
      if(c.arcadeFlight){this.advanceArcadeAuto(c,dt);this.updateLamps(c,previousSpeed,dt);continue;}
      const halfL = c.size[2] / 2, halfW = c.size[0] / 2;
      if (c.dwell > 0) {
        c.speed = 0; c.dwell = Math.max(0, c.dwell - dt);
        if (c.dwell <= 0) { c.laneT = c.base; c.passengerExchange = undefined; c.planAfter = 0; }
        // No path replanning, yaw, creep or lane changes while passengers use the doors.
        this.updateLamps(c, previousSpeed, dt);
        continue;
      }
      this.prepare(c);
      let target = Math.min(c.want, c.edge.e.workZone ? c.edge.e.workZone.speed / 3.6 : Infinity);
      // follow whatever is ahead in an overlapping lane on the same edge; remember a stopped one as an obstacle
      let obs: { lane: number; halfW: number; s: number; halfL: number } | null = null;
      for (const o of byEdge.get(c.edge) || []) {
        if (o === c || o.dir !== c.dir || Math.abs(o.lane - c.lane) > (o.size[0] + c.size[0]) / 2 + 0.25) continue;
        const gap = o.s - c.s - (o.size[2] + c.size[2]) / 2;
        if (gap > -0.5 && gap < 5 + c.speed * 1.1) {
          target = Math.min(target, o.speed * 0.9, Math.max(0, (gap - 1.6) * 0.9));
          if (gap < (c.assertive ? 17 : 7) && o.speed < (c.assertive ? c.want * 0.6 : 1) && (!obs || o.s < obs.s)) obs = { lane: o.lane, halfW: o.size[0] / 2, s: o.s, halfL: o.size[2] / 2 };
        }
      }
      for (const other of this.kinematicVehicles || NO_KINEMATIC_VEHICLES) {
        if (c.y >= other.y + other.size[1] || c.y + c.size[1] <= other.y) continue;
        // A reservation can sweep over an existing vehicle when the scene
        // first becomes active. Brake on the real road instead of trapping it
        // in an invisible solid; the truck keeps moving until this gap clears.
        if(other.reservation&&trafficOverlap(c,other,.18)){target=0;continue;}
        const dx = other.x - c.x, dz = other.z - c.z, along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
        const dot = c.hx * other.hx + c.hz * other.hz, cross = c.hx * other.hz - c.hz * other.hx;
        const extentLength = Math.abs(dot) * other.size[2] / 2 + Math.abs(cross) * other.size[0] / 2;
        const extentWidth = Math.abs(cross) * other.size[2] / 2 + Math.abs(dot) * other.size[0] / 2;
        const gap = along - halfL - extentLength;
        if (along > -halfL && gap < 5 + c.speed * 1.2 && Math.abs(side) < halfW + extentWidth + .3)
          target = Math.min(target, Math.max(0, other.speed * dot) * .9 + Math.max(0, gap - 1.6) * .9);
      }
      // the player's car is a vehicle like any other: queue behind it, honk, and squeeze past when there is room
      const rx = player.x - c.x, rz = player.z - c.z;
      const along = rx * c.hx + rz * c.hz, lat = rx * c.hz - rz * c.hx;    // lat > 0: player is to this vehicle's left
      const sameLevel = Math.abs(player.y - 0.55 - c.y) < 2;
      let blocked = false;
      if (sameLevel && along > -halfL && along < 16 + c.speed * 1.2 && Math.abs(lat) < halfW + 1.0 + 0.3) {
        const gap = along - halfL - 2.4;
        target = Math.min(target, Math.max(0, gap * 0.9));
        blocked = gap < 7 && Math.abs(player.speed) < 1.5;
        if (blocked && (!obs || c.s + along < obs.s)) obs = { lane: c.lane + lat, halfW: 1.0, s: c.s + along, halfL: 2.3 };
      }
      c.blockedT = blocked ? c.blockedT + dt : Math.max(0, c.blockedT - dt * 2);
      c.stuckT = obs && target < (c.assertive ? c.want * 0.7 : 0.8) ? c.stuckT + dt : Math.max(0, c.stuckT - dt);
      const canFilter = !c.edge.e.workZone && (c.group === 'bike' || c.group === 'auto' || (c.group === 'car' && this.r() < 0.03));
      if (obs && c.stuckT > (c.assertive ? 0.25 : 0.6) && !c.filtering && canFilter && this.t >= (c.laneChangeAt || 0) && (!c.motion || c.motion.progress < 0)) {
        // look for a gap beside whatever is stopped ahead (the player's car or a queue), inside this carriageway
        const [lo, hi] = this.laneRange(c.edge, c.size[0]);
        const need = obs.halfW + halfW + 0.65;
        const opts = [obs.lane - need, obs.lane + need].filter((v) => v >= lo && v <= hi).sort((a, b) => Math.abs(a - c.lane) - Math.abs(b - c.lane));
        const free = opts.find((v) => !(byEdge.get(c.edge) || []).some((o) => o !== c && o.dir === c.dir && Math.abs(o.lane - v) < (o.size[0] + c.size[0]) / 2 && o.s > c.s - 6 && o.s < obs!.s + 10));
        if (free !== undefined) { c.laneT = free; c.filtering = true; c.passS = obs.s + obs.halfL + halfL + 3; }
      }
      if (c.filtering) {
        if (c.motion?.kind === 'lane') target = Math.max(target, c.assertive ? 3 : 1.6);
        if (c.s > c.passS) { c.filtering = false; c.laneT = c.base; }
      }
      if (blocked && !c.filtering && c.blockedT > 1.2) {
        if ((c.honkT -= dt) <= 0) { c.honkT = this.r.range(1.0, 3.2); this.onHorn(c.group, c.x, c.z); }
      }
      // buses pull in at their stops for a few seconds
      if (c.group === 'bus') {
        if (c.busRun?.ended) target = 0;
        for (const st of (c.busRun ? c.busRun.stopPosition.edge === c.edge && c.busRun.stopPosition.dir === c.dir && !c.busRun.ended ? [c.busRun.stopPosition.stop] : [] : this.stopsByEdge.get(c.edge.e.id) || [])) {
          if (c.served.has(st)) continue;
          const leftSign = c.dir === 1 ? st.side : -st.side;
          if (leftSign < 0 && !c.edge.e.oneway) continue;
          const sd = c.dir === 1 ? st.s : c.edge.len - st.s, ahead = sd - c.s;
          if (ahead < -2 || ahead > 45) continue;
          // Leave room for the long body's nose/tail sweep during pull-in.
          c.laneT = c.busRun ? c.base : leftSign * (c.edge.e.w / 2 - halfW - 0.7);
          target = Math.min(target, Math.max(0, ahead * 0.55));
          if (ahead < 1.5 && c.speed < 0.6) {
            c.dwell = this.r.range(5, 6); c.speed = 0; target = 0; c.served.add(st);
            const exchange = new BusPassengerExchange(c, c.dwell, this.mats.vBody);
            exchange.group.userData = { route: c.busRun?.pattern.number || '', stopId: c.busRun?.pattern.stops[c.busRun.target] || '' };
            c.passengerExchange = exchange; (this.passengerExchanges ||= []).push(exchange); this.scene.add(exchange.group);
            if (c.busRun) { this.services?.served(c.busRun, c.edge, c.dir, c.s); if (!c.motion || c.motion.progress < 0) { c.motion = undefined; c.planAfter = 0; } }
          }
          break;
        }
      }
      // give way to people crossing
      for (const w of walkers) {
        if (!w.crossing) continue;
        const wx = w.x - c.x, wz = w.z - c.z, a2 = wx * c.hx + wz * c.hz, l2 = wx * c.hz - wz * c.hx;
        if (a2 > 0 && a2 < 7 + c.speed && Math.abs(l2) < halfW + 0.8) target = Math.min(target, Math.max(0, (a2 - halfL - 1.5) * 0.8));
      }
      // Mapped controls may be at a junction or midway along an edge. Braking
      // and the swept movement cap share the rendered stop bar, with room for
      // the whole vehicle nose (including an eleven-metre bus).
      const endNode = this.graph.nodes.get(c.dir === 1 ? c.edge.to : c.edge.from);
      if (!endNode) { this.release(c); this.cars.splice(i, 1); continue; }
      const redStop = this.redStop(c);
      if (redStop !== undefined) target = Math.min(target, Math.sqrt(8 * Math.max(0, redStop - c.s)));
      const railwayDistance = this.railwayDistance(c);
      if (Number.isFinite(railwayDistance)) target = Math.min(target, Math.sqrt(6 * Math.max(0, railwayDistance)));
      this.tryLane(c, player);
      if (c.motion) {
        const m = c.motion;
        if (m.kind === 'route' && m.busStop) {
          const remaining = m.progress < 0 ? m.curve.length + Math.max(0, m.startS - c.s) : Math.max(0, m.curve.length - m.progress);
          target = Math.min(target, Math.sqrt(4 * remaining));
        }
        // Braking starts on the approach, rather than after the vehicle yaws.
        const approach = m.progress < 0 ? Math.max(0, m.startS - c.s) : 0;
        target = Math.min(target, Math.sqrt(m.cap * m.cap + 2 * (c.group === 'bus' || c.group === 'truck' ? 2 : 3) * approach));
        if (m.progress < 0 && m.node && redStop !== undefined) target = Math.min(target, Math.max(0, (approach - 0.2) * 0.8));
      } else if (c.stopS !== undefined) target = Math.min(target, Math.sqrt(4 * Math.max(0, c.stopS - c.s)));
      c.speed += Math.max(-9 * dt, Math.min(3.2 * dt, target - c.speed));
      if (c.edge.e.workZone) c.speed = Math.min(c.speed, c.edge.e.workZone.speed / 3.6);
      this.advance(c, c.speed * dt, player, walkers);
      if (c.edge.e.workZone) c.speed = Math.min(c.speed, c.edge.e.workZone.speed / 3.6);
      this.updateLamps(c, previousSpeed, dt);
    }
  }
  // Traffic stays visible when it crosses the camera-to-player sightline:
  // hiding the whole body makes an occupied lane look empty during an orbit.
  // Only protect the near plane when the camera itself enters the vehicle.
  // Keep the old arguments for callers; jumping/landing has the same policy.
  hideNear(cam: THREE.Vector3, _tgt?: { x: number; y: number; z: number }, _preserveOvertake = false) {
    for (const c of this.cars) {
      const p = c.g.position;
      const body = { x: p.x, y: p.y - .02, z: p.z, size: c.size, hx: -Math.sin(c.g.rotation.y), hz: -Math.cos(c.g.rotation.y) };
      c.g.visible = !segmentHitsVehicle(cam, cam, body, .1);
    }
  }
  // keep the player's car out of other vehicles: push it out along the shallowest side of the overlap
  pushOut(pos: { x: number; y: number; z: number }, halfW: number, halfL: number, bounds?: TrafficVerticalBounds): Car | null {
    let hit: Car | null = null;
    const { bottom, top } = playerVerticalBounds(pos.y, bounds);
    for (const c of this.cars) {
      if(c.arcadeFlight)continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      const section = trafficBodySection(c.y, c.size[1], c.size[2], c.g.rotation.x, along, halfL);
      if (!section || bottom >= section.top || top <= section.bottom) continue;
      const center = (section.minimumAlong + section.maximumAlong) / 2;
      const pa = Math.min(section.maximumAlong + halfL - along, along - section.minimumAlong + halfL), ps = c.size[0] / 2 + halfW - Math.abs(side);
      if (pa <= 0 || ps <= 0) continue;
      if (ps < pa) { const k = (Math.sign(side) || 1) * ps; pos.x += c.hz * k; pos.z -= c.hx * k; }
      else { const k = (Math.sign(along - center) || 1) * pa; pos.x += c.hx * k; pos.z += c.hz * k; }
      hit = c;
    }
    return hit;
  }
  // overlap test against the player; returns the vehicle hit, if any
  hitTest(x: number, y: number, z: number, r: number, bounds?: TrafficVerticalBounds): Car | null {
    const { bottom, top } = playerVerticalBounds(y, bounds);
    for (const c of this.cars) {
      if(c.arcadeFlight)continue;
      const dx = x - c.x, dz = z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      const section = trafficBodySection(c.y, c.size[1], c.size[2], c.g.rotation.x, along, r);
      if (!section || bottom >= section.top || top <= section.bottom) continue;
      if (along > section.minimumAlong - r && along < section.maximumAlong + r && Math.abs(side) < c.size[0] / 2 + r * 0.7) return c;
    }
    return null;
  }
}

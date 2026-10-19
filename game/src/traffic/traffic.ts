import { TRAFFIC, SIM_HZ, VEHICLE } from '../config/gameplay';
import { TICK_SECONDS } from '../core/clock';
import type { Rng } from '../core/rng';
import type { WorldPhysics, Contact } from '../world/collision';
import type { DynamicWorld } from '../player/player';
import { forwardOf, headingOf, wrapAngle } from '../world/roadIndex';
import { SignalSystem } from './signals';
import {trafficByEdge} from './congestion';
import {transportOf} from './placements';

export type ActorKind = 'car' | 'auto' | 'bus' | 'bike' | 'bicycle' | 'truck';

const DIMS: Record<ActorKind, { length: number; width: number; height: number; vmax: number; accel: number }> = {
  car: { length: 4.2, width: 1.8, height: 1.5, vmax: 11.5, accel: 2.2 },
  auto: { length: 2.9, width: 1.4, height: 1.8, vmax: 9.0, accel: 1.6 },
  bus: { length: 11.5, width: 2.6, height: 3.2, vmax: 9.5, accel: 0.9 },
  bike: { length: 2.0, width: 0.8, height: 1.5, vmax: 12.0, accel: 2.6 },
  bicycle:{length:1.85,width:.65,height:1.65,vmax:5.5,accel:.9},
  truck: { length: 7.5, width: 2.4, height: 3.0, vmax: 9.0, accel: 1.0 },
};

export interface Actor {
  id: number;
  kind: ActorKind;
  edge: string;
  nextEdge?: string; // choose once per approach so exit queues are evaluated on the actual turn
  along: number;
  speed: number;
  lateral: number; // signed offset from centreline (+ right of travel)
  laneLateral: number;
  vmax: number;
  freeSpeed?:number;
  length: number; width: number; height: number;
  state: 'drive' | 'yield' | 'curb' | 'merge' | 'queue';
  /** scenario-overlay queue release tick (actor holds position until then) */
  holdUntil?: number;
  encounterId?: string;
  stateTicks: number;
  waitTicks: number;
  stalledTicks?: number;
  braking: boolean;
  waitingForSignal?: boolean;
  waitingForJunction?:boolean;
  blockedBy?:'geometry'|'actor';
  stopAlong?: number;
  stopDwellUntil?: number;
  stopDwellSeconds?:number;
  stopApproachStarted?:number;
  lastStop?: string;
  turn?: {fromEdge:string;toEdge:string;radius:number;fromLateral:number;toLateral:number};
  x: number; z: number; y: number; heading: number;
  px: number; pz: number; py: number; pheading: number;
}

export interface Pedestrian {
  id: number;
  edge: string; // road id for footpath
  along: number;
  side: 1 | -1;
  dir: 1 | -1;
  speed: number;
  state: 'walk' | 'wait' | 'cross';
  stateTicks: number;
  crossT: number;
  crossingId?:string;
  x: number; z: number; y: number; heading: number;
  px: number; pz: number; pheading: number;
}

/**
 * Traffic: kinematic, path-controlled actors with application-level avoidance (MASTER §14).
 * Left-hand road organisation: on two-way roads actors keep left of the centreline.
 * Stable integer IDs; actors are owned by the traffic system, not by chunks, so chunk
 * crossing never duplicates or deletes them (M11).
 */
export class TrafficSystem implements DynamicWorld {
  actors: Actor[] = [];
  peds: Pedestrian[] = [];
  private nextId = 1;
  private tickCount = 0;
  density = 1;
  /** forbidden spawn zones (stopping polygons, active landing forecast) */
  reserved: { x: number; z: number; r: number }[] = [];
  log: string[] = [];

  readonly signals: SignalSystem;
  /** Station-adjacent provisional bus boarding points; upgraded by surveyed records when supplied. */
  private busStops = new Map<string, {id:string;along:number}[]>();
  private autoRanks = new Map<string, {id:string;along:number}[]>();
  private nodePositions:Map<string,WorldPhysics['core']['nodes'][number]>;
  private junctionNodes:Set<string>;
  private junctionReservations:{actor:number;node:string;entry:string;exit:string;heading:number;turn:number;until:number}[]=[];
  constructor(private world: WorldPhysics, private rng: Rng) {
    this.nodePositions=new Map(world.core.nodes.map(n=>[n.id,n]));
    this.junctionNodes=new Set(world.core.junctions.map(j=>j.nodeId));
    this.signals = new SignalSystem(world);
    const transport=transportOf(world.core);
    for(const match of transport?.matches??[]){
      const feature=transport!.features.find(f=>f.id===match.featureId)!;
      if(feature.kind!=='bus_stop'&&feature.kind!=='auto_stand')continue;
      const map=feature.kind==='bus_stop'?this.busStops:this.autoRanks;
      for(const id of match.edgeIds){const edge=world.nav.edges.get(id);if(!edge)continue;const stops=map.get(id)??[];stops.push({id:feature.id,along:edge.forward?match.alongM:edge.lengthM-match.alongM});map.set(id,stops);}
    }
    // Legacy fixtures without a sourced inventory retain explicitly heuristic station stops.
    // A real-world inventory, even with unmatched points, never silently invents replacements.
    if(!transport)
    for (const station of world.core.stations) {
      let best: { roadId: string; along: number; distance: number } | null = null;
      const seen = new Set<string>();
      for(const dx of [-40,0,40]) for(const dz of [-40,0,40]) for(const seg of world.roads.segmentsNear(station.x+dx,station.z+dz)) {
        if(seen.has(`${seg.road.id}:${seg.i}`)) continue; seen.add(`${seg.road.id}:${seg.i}`);
        if(seg.road.bridge || seg.road.tunnel || seg.road.widthM < 9 || Math.max(seg.ay,seg.by)>.3)continue;
        const sx=seg.bx-seg.ax,sz=seg.bz-seg.az;
        const u=Math.max(0,Math.min(1,((station.x-seg.ax)*sx+(station.z-seg.az)*sz)/(seg.len*seg.len)));
        const distance=Math.hypot(station.x-seg.ax-sx*u,station.z-seg.az-sz*u);
        const along=seg.cumStart+u*seg.len;
        if(along<25 || along>seg.road.lengthM-25 || distance>55)continue;
        if(!best || distance<best.distance)best={roadId:seg.road.id,along,distance};
      }
      if(best)for(const edge of world.core.directed.filter(e=>e.roadId===best!.roadId)){const stops=this.busStops.get(edge.id)??[];stops.push({id:`scenario_station_${station.id}`,along:edge.forward?best.along:edge.lengthM-best.along});this.busStops.set(edge.id,stops);}
    }
  }
  get tick(): number { return this.tickCount; }
  delayFactors():Map<string,number>{return new Map([...trafficByEdge(this.actors)].map(([id,t])=>[id,t.delayFactor]));}

  reset(): void { this.actors = []; this.peds = []; this.nextId = 1; this.tickCount = 0; this.reserved = [];this.junctionReservations=[]; }

  private dims(kind: ActorKind) { return DIMS[kind]; }
  private chooseKind():ActorKind {const roll=this.rng.next();return roll<.32?'car':roll<.60?'bike':roll<.66?'bicycle':roll<.86?'auto':roll<.94?'bus':'truck';}

  private pose(edge: string, along: number, lateral: number) {
    const p = this.world.nav.pointOnDirected(edge, along);
    const [fx, fz] = forwardOf(p.heading);
    return { x: p.x + -fz * lateral, z: p.z + fx * lateral, y: p.y, heading: p.heading };
  }

  private laneFor(edge: string, kind: ActorKind): number {
    const e = this.world.nav.edges.get(edge)!;
    const road = this.world.roads.roads.get(e.roadId)!;
    const hw = road.widthM / 2;
    const w = this.dims(kind).width;
    if (road.oneway) {
      // multi-lane one-way: spread across, buses/autos favour the kerb (left)
      const lanes = Math.max(1, Math.round(road.widthM / 3.3));
      const laneW = road.widthM / lanes;
      const lane = kind === 'bus' || kind === 'auto'||kind==='bicycle' ? 0 : this.rng.int(0, lanes);
      const jitter = kind === 'bike'||kind==='bicycle' ? this.rng.range(-0.25, 0.25) * laneW : 0;
      return -hw + laneW * (lane + 0.5) + jitter;
    }
    // two-way: keep left half
    const centre = -hw / 2;
    const jitter = kind === 'bike'||kind==='bicycle' ? this.rng.range(-hw / 4 + w, hw / 4 - w) : 0;
    return Math.max(-hw + w / 2 + 0.3, Math.min(-w / 2 - 0.2, centre + jitter));
  }

  private chooseNext(a: Actor): string | undefined {
    const edge=this.world.nav.edges.get(a.edge)!;
    const legal=edge.next.filter(id=>this.fitsRoad(a.kind,id)&&this.world.nav.edges.get(id)!.roadId!==edge.roadId);
    if(a.nextEdge && legal.includes(a.nextEdge))return a.nextEdge;
    if(!legal.length)return undefined;
    const straight=this.world.nav.straightestNext(a.edge);
    a.nextEdge=this.rng.next()<.65 && straight&&legal.includes(straight) ? straight : this.rng.pick(legal);
    return a.nextEdge;
  }

  /** A continuous tangent-matched connector through the junction, rather than a lane-offset teleport. */
  private motionPose(a:Actor) {
    const nav=this.world.nav,e=nav.edges.get(a.edge)!;
    if(a.turn&&a.edge===a.turn.toEdge&&a.along>=a.turn.radius)a.turn=undefined;
    if(!a.turn&&a.nextEdge){
      const next=nav.edges.get(a.nextEdge)!,radius=Math.min(a.kind==='bus'||a.kind==='truck'?11:7,e.lengthM/4,next.lengthM/4);
      if(e.lengthM-a.along<radius){
        const p=this.pose(e.id,e.lengthM, a.lateral),q=this.pose(next.id,0,this.boundedLateral(next.id,a.kind,a.lateral));
        const angle=Math.abs(wrapAngle(p.heading-q.heading));
        if(angle>.12&&angle<2.8&&Math.abs(p.y-q.y)<.6)a.turn={fromEdge:e.id,toEdge:next.id,radius,fromLateral:a.lateral,toLateral:this.boundedLateral(next.id,a.kind,a.lateral)};
      }
    }
    const turn=a.turn;
    if(!turn)return this.pose(a.edge,a.along,a.lateral);
    const from=nav.edges.get(turn.fromEdge)!,r=turn.radius;
    const u=Math.max(0,Math.min(1,a.edge===turn.fromEdge?(a.along-(from.lengthM-r))/(2*r):(r+a.along)/(2*r))),v=1-u;
    const p=this.pose(turn.fromEdge,from.lengthM-r,turn.fromLateral),q=this.pose(turn.toEdge,r,turn.toLateral);
    const [fx,fz]=forwardOf(p.heading),[qx,qz]=forwardOf(q.heading),c1={x:p.x+fx*r,z:p.z+fz*r},c2={x:q.x-qx*r,z:q.z-qz*r};
    const x=v*v*v*p.x+3*v*v*u*c1.x+3*v*u*u*c2.x+u*u*u*q.x,z=v*v*v*p.z+3*v*v*u*c1.z+3*v*u*u*c2.z+u*u*u*q.z;
    const dx=3*v*v*(c1.x-p.x)+6*v*u*(c2.x-c1.x)+3*u*u*(q.x-c2.x),dz=3*v*v*(c1.z-p.z)+6*v*u*(c2.z-c1.z)+3*u*u*(q.z-c2.z);
    return {x,z,y:p.y+(q.y-p.y)*u,heading:headingOf(dx,dz)};
  }

  private boundedLateral(edge:string,kind:ActorKind,lateral:number):number {
    const road=this.world.roads.roads.get(this.world.nav.edges.get(edge)!.roadId)!,width=this.dims(kind).width;
    const left=-road.widthM/2+width/2+.25;
    const right=road.oneway?road.widthM/2-width/2-.25:-width/2-.15;
    return Math.max(left,Math.min(Math.max(left,right),lateral));
  }

  private fitsRoad(kind:ActorKind,edge:string):boolean {
    const road=this.world.roads.roads.get(this.world.nav.edges.get(edge)!.roadId)!,d=this.dims(kind);
    return !((kind==='bus'||kind==='truck')&&(road.widthM<7||/^(service|living_street|residential|unclassified)$/.test(road.highway)))
      && (road.oneway?road.widthM:road.widthM/2)>=d.width+.5;
  }

  private legalSpeed(speed:number,edge:string):number {
    const road=this.world.roads.roads.get(this.world.nav.edges.get(edge)!.roadId)!;
    const limit=(road as typeof road&{sourceProperties?:{maxSpeedKph?:number}}).sourceProperties?.maxSpeedKph;
    return limit&&limit>0?Math.min(speed,limit/3.6):speed;
  }

  /** Full capsule, not only the centre: shared by initial, runtime and scenario spawning. */
  private bodyClear(p:{x:number;z:number;y:number;heading:number},d:{length:number;width:number;height:number},roadId?:string):boolean {
    const [fx,fz]=forwardOf(p.heading),n=Math.max(2,Math.ceil(d.length/d.width));
    for(let i=0;i<n;i++){
      const off=-d.length/2+d.width/2+i*(d.length-d.width)/(n-1),x=p.x+fx*off,z=p.z+fz*off;
      if(!this.world.isLoaded(x,z)||this.world.contacts(x,z,p.y+.05,d.height-.1,d.width/2+.15).length)return false;
      const support=this.world.roads.surface(x,z,{...(roadId?{onlyRoadId:roadId}:{}),margin:-d.width/2-.1,maxY:p.y+.4});
      if(!support?.onCarriageway||Math.abs(support.elevation-p.y)>.6)return false;
    }
    return true;
  }

  private clearBrakingPath(edge:string,along:number,lateral:number,d:{length:number;width:number;height:number},speed:number):boolean {
    const e=this.world.nav.edges.get(edge)!,distance=2+speed*1.2+speed*speed/6,steps=Math.max(1,Math.ceil(distance/3));
    if(along<d.length/2+5||e.lengthM-along<d.length/2+5+distance)return false;
    for(let i=0;i<=steps;i++)if(!this.bodyClear(this.pose(edge,along+distance*i/steps,lateral),d,e.roadId))return false;
    return true;
  }

  /** Shared capsule geometry for crossing/turning conflicts. Longitudinal following alone
   * cannot protect vehicles whose centrelines cross or a player stopped beside a turn. */
  private movingOverlaps(p:{x:number;z:number;y:number;heading:number},a:Actor,player:{x:number;z:number;y:number;heading:number;airborne:boolean}):Map<string,number> {
    const points=(p:{x:number;z:number;heading:number},length:number,width:number)=>{
      const [fx,fz]=forwardOf(p.heading),n=Math.max(2,Math.ceil(length/width));
      return Array.from({length:n},(_,i)=>{const off=-length/2+width/2+i*(length-width)/(n-1);return{x:p.x+fx*off,z:p.z+fz*off};});
    };
    const own=points(p,a.length,a.width),overlaps=new Map<string,number>();
    const add=(id:string,other:{x:number;z:number;y:number;heading:number},length:number,width:number,height:number)=>{
      if(p.y>=other.y+height||p.y+a.height<=other.y)return;
      const broad=(a.length+length)/2+.5,dx=p.x-other.x,dz=p.z-other.z;
      if(dx*dx+dz*dz>broad*broad)return;
      const theirs=points(other,length,width),radius=(a.width+width)/2+.08;
      let depth=0;for(const q of own)for(const r of theirs){const x=q.x-r.x,z=q.z-r.z,squared=x*x+z*z;if(squared<radius*radius)depth=Math.max(depth,radius-Math.sqrt(squared));}
      if(depth>0)overlaps.set(id,depth);
    };
    for(const b of this.actors)if(b!==a)add(`actor_${b.id}`,b,b.length,b.width,b.height);
    // A flying player is still solid when low enough to intersect a road vehicle.
    add('player',player,VEHICLE.circleOffset*2+VEHICLE.collisionRadius*2,VEHICLE.collisionRadius*2,1.15);
    for(const ped of this.peds)add(`ped_${ped.id}`,ped,.6,.6,1.8);
    return overlaps;
  }

  private mayEnterJunction(a:Actor,next:string):boolean {
    const nav=this.world.nav,e=nav.edges.get(a.edge)!,node=this.nodePositions.get(e.toNode);
    if(!node)return true;
    const exit=this.pose(next,0,this.boundedLateral(next,a.kind,a.lateral)),turn=wrapAngle(exit.heading-a.heading);
    const conflicts=this.junctionReservations.filter(r=>r.actor!==a.id).filter(r=>{
      const other=this.nodePositions.get(r.node);if(!other||Math.hypot(other.x-node.x,other.z-node.z)>15)return false;
      // A vehicle already inside a short connector clears before its followers
      // enter it. Nearby-node reservations must not make it yield backwards.
      if(r.exit===a.edge)return false;
      if(r.entry===a.edge&&r.exit===next)return false; // same movement follows with the normal leader gap
      if(Math.abs(turn)<.2&&Math.abs(r.turn)<.2&&Math.abs(Math.abs(wrapAngle(a.heading-r.heading))-Math.PI)<.2)return false;
      return true;
    });
    // Swept body contacts handle actors already inside. Treating every vehicle on a
    // short outgoing edge as a conflicting movement created circular phantom queues.
    if(conflicts.length)return false;
    if(!this.junctionReservations.some(r=>r.actor===a.id))this.junctionReservations.push({actor:a.id,node:node.id,entry:a.edge,exit:next,heading:a.heading,turn,until:this.tickCount+8*SIM_HZ});
    return true;
  }

  /** Populate the already loaded opening scene, before it is shown. Runtime replenishment
   * keeps its larger anti-pop-in exclusion; only this initial pass can use nearby lanes. */
  prewarmAround(player: { x: number; z: number; y: number; heading: number }, maxActors = TRAFFIC.maxActors): void {
    const radius = 115, want = Math.min(Math.round(maxActors * this.density), Math.round(12 * this.density));
    let nearby = this.actors.filter(a => Math.hypot(a.x-player.x,a.z-player.z) <= radius && Math.abs(a.y-player.y)<2.5).length;
    if (nearby >= want) return;
    const [fx,fz] = forwardOf(player.heading);
    const segments = new Map<string, ReturnType<WorldPhysics['roads']['segmentsNear']>[number]>();
    for(let dx=-120;dx<=120;dx+=40)for(let dz=-120;dz<=120;dz+=40)for(const s of this.world.roads.segmentsNear(player.x+dx,player.z+dz))segments.set(`${s.road.id}:${s.i}`,s);
    const candidates: { edge: string; along: number; rank: number }[] = [], seen = new Set<string>();
    for(const s of segments.values()) {
      const u=Math.max(0,Math.min(1,((player.x-s.ax)*(s.bx-s.ax)+(player.z-s.az)*(s.bz-s.az))/(s.len*s.len)));
      const closest=s.cumStart+u*s.len;
      for(const offset of [0,35,-35,50,-50,65,-65,80,-80,95,-95,110,-110]) {
        const at=closest+offset;
        if(at<0 || at>s.road.lengthM)continue;
        for(const edge of [`${s.road.id}:f`,`${s.road.id}:b`]) {
          const e=this.world.nav.edges.get(edge);
          if(!e || !this.world.nav.inCore(edge))continue;
          const along=e.forward?at:e.lengthM-at,key=`${edge}:${Math.round(along/3)}`;
          if(seen.has(key))continue;seen.add(key);
          const p=this.world.nav.pointOnDirected(edge,along),distance=Math.hypot(p.x-player.x,p.z-player.z);
          if(distance<30 || distance>radius || Math.abs(p.y-player.y)>=2.5)continue;
          const ahead=(p.x-player.x)*fx+(p.z-player.z)*fz;
          candidates.push({edge,along,rank:(ahead>20?0:140)+distance+this.rng.range(0,15)});
        }
      }
    }
    candidates.sort((a,b)=>a.rank-b.rank);
    for(const c of candidates) {
      if(nearby>=want || this.actors.length>=Math.round(maxActors*this.density))break;
      const e=this.world.nav.edges.get(c.edge)!,road=this.world.roads.roads.get(e.roadId)!;
      const kind=this.chooseKind(),d=this.dims(kind);
      if(!this.fitsRoad(kind,c.edge))continue;
      const lane=this.boundedLateral(c.edge,kind,this.laneFor(c.edge,kind)),p=this.pose(c.edge,c.along,lane);
      if(Math.hypot(p.x-player.x,p.z-player.z)<30+d.length/2)continue;
      if(this.reserved.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<q.r+d.length/2+5))continue;
      const signal=this.signals.colorFor(c.edge,this.tickCount),toEnd=e.lengthM-c.along;
      const movingSpeed=this.legalSpeed(d.vmax*.55,c.edge);
      const speed=signal && signal!=='green' && toEnd<5+movingSpeed*1.2+movingSpeed*movingSpeed/6 ? 0 : movingSpeed;
      // Leave room to brake before the next junction, including an occupied/narrow exit.
      if(c.along<d.length/2+8 || toEnd<d.length/2+8+speed*1.2+speed*speed/6)continue;
      if(this.actors.some(a=> {
        if(Math.abs(a.y-p.y)>=2.5)return false;
        if(Math.hypot(a.x-p.x,a.z-p.z)<(a.length+d.length)/2+1.5)return true;
        if(a.edge!==c.edge || Math.abs(a.lateral-lane)>(a.width+d.width)/2+.4)return false;
        const v=Math.max(a.speed,speed),gap=Math.abs(a.along-c.along)-(a.length+d.length)/2;
        return gap<2+v*1.2+v*v/6;
      }))continue;
      let clear=true;
      const brakingDistance=2+speed*1.2+speed*speed/6,steps=Math.ceil(brakingDistance/4),n=Math.max(2,Math.ceil(d.length/d.width));
      // Check the body through its initial braking envelope, not just an empty spawn point.
      for(let j=0;j<=steps && clear;j++) {
        const at=this.pose(c.edge,c.along+brakingDistance*j/steps,lane),[ax,az]=forwardOf(at.heading);
        for(let i=0;i<n;i++) {
          const offset=-d.length/2+d.width/2+i*(d.length-d.width)/(n-1),x=at.x+ax*offset,z=at.z+az*offset;
          const supported=this.world.roads.surface(x,z,{onlyRoadId:road.id,margin:-d.width/2-.15,preferLevel:road.level});
          if(!this.world.isLoaded(x,z) || !supported?.onCarriageway || this.world.contacts(x,z,at.y+.05,d.height-.1,d.width/2+.15).length){clear=false;break;}
        }
      }
      if(!clear)continue;
      const a:Actor={id:this.nextId++,kind,edge:c.edge,along:c.along,speed,lateral:lane,laneLateral:lane,vmax:d.vmax*this.rng.range(.8,1.05),length:d.length,width:d.width,height:d.height,state:'drive',stateTicks:0,waitTicks:0,braking:speed===0,...p,px:p.x,pz:p.z,py:p.y,pheading:p.heading};
      a.freeSpeed=a.vmax;a.vmax=this.legalSpeed(a.freeSpeed,a.edge);a.speed=Math.min(a.speed,a.vmax);
      this.actors.push(a);nearby++;
    }
  }

  spawnAround(px: number, pz: number, pheading: number, maxActors = TRAFFIC.maxActors): void {
    const want = Math.round(maxActors * this.density);
    let attempts = 0;
    while (this.actors.length < want && attempts++ < 36) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(TRAFFIC.minSpawnDistance, TRAFFIC.spawnRadius);
      const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
      // Sample a nearby centreline rather than requiring a random point to hit a narrow road.
      const candidates = this.world.roads.segmentsNear(x, z);
      if (!candidates.length) continue;
      const candidate = this.rng.pick(candidates);
      const u = this.rng.next();
      const s = this.world.roads.surface(candidate.ax + (candidate.bx-candidate.ax)*u, candidate.az + (candidate.bz-candidate.az)*u, { margin: 0, onlyRoadId: candidate.road.id });
      if (!s || Math.hypot(s.px-px,s.pz-pz)<TRAFFIC.minSpawnDistance || Math.hypot(s.px-px,s.pz-pz)>TRAFFIC.spawnRadius) continue;
      // avoid spawning in the player's near forward view (no pop-in in stopping distance)
      const [fx, fz] = forwardOf(pheading);
      const ahead = (s.px - px) * fx + (s.pz - pz) * fz;
      if (ahead > 0 && ahead < 120 && Math.abs((s.px - px) * -fz + (s.pz - pz) * fx) < 25) continue;
      if (this.reserved.some((q) => Math.hypot(q.x - s.px, q.z - s.pz) < q.r + 8)) continue;
      const dirs = [`${s.roadId}:f`, `${s.roadId}:b`].filter((d) => this.world.nav.edges.has(d));
      if (!dirs.length) continue;
      const edge = this.rng.pick(dirs);
      const e = this.world.nav.edges.get(edge)!;
      const along = e.forward ? s.along : e.lengthM - s.along;
      const kind=this.chooseKind();
      const road = this.world.roads.roads.get(e.roadId)!;
      if (!this.fitsRoad(kind,edge)) continue;
      const d = this.dims(kind);
      if (this.actors.some((a) => a.edge === edge && Math.abs(a.along - along) < (a.length + d.length) / 2 + 4)) continue;
      const lane = this.boundedLateral(edge,kind,this.laneFor(edge, kind));
      const p = this.pose(edge, along, lane);
      if(this.actors.some(a=>Math.abs(a.y-p.y)<2.5 && Math.hypot(a.x-p.x,a.z-p.z)<(a.length+d.length)/2+1))continue;
      const movingSpeed=this.legalSpeed(d.vmax*.55,edge),signal=this.signals.colorFor(edge,this.tickCount);
      const speed=signal&&signal!=='green'&&e.lengthM-along<5+movingSpeed*1.2+movingSpeed*movingSpeed/6?0:movingSpeed;
      if(!this.clearBrakingPath(edge,along,lane,d,speed))continue;
      if(this.actors.some(a=>a.edge===edge&&Math.abs(a.lateral-lane)<(a.width+d.width)/2+.4&&Math.abs(a.along-along)-(a.length+d.length)/2<2+Math.max(a.speed,speed)*1.2+Math.max(a.speed,speed)**2/6))continue;
      const a: Actor = {
        id: this.nextId++, kind, edge, along, speed, lateral: lane, laneLateral: lane,
        vmax: d.vmax * this.rng.range(0.8, 1.05), length: d.length, width: d.width, height: d.height,
        state: 'drive', stateTicks: 0, waitTicks: 0, braking: false, ...p, px: p.x, pz: p.z, py: p.y, pheading: p.heading,
      };
      a.freeSpeed=a.vmax;a.vmax=this.legalSpeed(a.freeSpeed,a.edge);a.speed=Math.min(a.speed,a.vmax);
      this.actors.push(a);
    }
    const wantPeds = Math.round(TRAFFIC.maxPedestrians * this.density);
    attempts = 0;
    while (this.peds.length < wantPeds && attempts++ < 8) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(40, 160);
      const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
      const s = this.world.roads.surface(x, z, { margin: 0 });
      if (!s) continue;
      // footpaths only beside fully at-grade roads: never on bridges, flyovers, ramps or highway links
      const rd = s.road as typeof s.road & { footpath?: boolean };
      if (rd.footpath === false || rd.bridge || rd.tunnel || Math.max(...rd.pointElevM, rd.elevationM) > 0.3 || /^(motorway|trunk_link|motorway_link)/.test(rd.highway)) continue;
      const side: 1 | -1 = this.rng.next() < 0.5 ? 1 : -1;
      const ped: Pedestrian = { id: this.nextId++, edge: s.roadId, along: s.along, side, dir: this.rng.next() < 0.5 ? 1 : -1, speed: this.rng.range(1.0, 1.5), state: 'walk', stateTicks: 0, crossT: 0, x, z, y: s.elevation, heading: 0, px: x, pz: z, pheading: 0 };
      this.placePed(ped);
      if (this.onOtherCarriageway(ped)||!this.pedClear(ped)) continue;
      ped.px = ped.x; ped.pz = ped.z;
      this.peds.push(ped);
    }
  }

  /** a walking pedestrian's footpath point lies on some other road's carriageway (dense real networks: parallel/crossing roads) */
  private onOtherCarriageway(p: Pedestrian): boolean {
    const hit = this.world.roads.surface(p.x, p.z, { margin: 0.3 });
    return !!hit && hit.roadId !== p.edge && Math.abs(hit.elevation - p.y) < 1.5;
  }

  private pedClear(p:Pedestrian):boolean {
    return this.world.isLoaded(p.x,p.z)&&this.world.contacts(p.x,p.z,p.y+.05,1.7,.3).length===0;
  }

  private placePed(p: Pedestrian) {
    const road = this.world.roads.roads.get(p.edge)!;
    const pt = this.world.roads.pointAlong(p.edge, p.along);
    const [fx, fz] = forwardOf(pt.heading);
    const hw = road.widthM / 2;
    let lat: number;
    if (p.state === 'cross') lat = p.side * (hw + 1.4) * (1 - 2 * p.crossT);
    else lat = p.side * (hw + 1.4);
    p.x = pt.x + -fz * lat; p.z = pt.z + fx * lat;
    p.y=this.world.roads.groundHeight(p.x,p.z,p.edge,road.level,pt.y+.5);
    p.heading = p.state === 'cross' ? wrapAngle(pt.heading + (p.side > 0 ? Math.PI / 2 : -Math.PI / 2)) : (p.dir > 0 ? pt.heading : wrapAngle(pt.heading + Math.PI));
  }

  /** IDM-style follow on own edge and the next; includes the player as a leader when ahead in lane */
  step(player: { x: number; z: number; y: number; speed: number; heading: number; airborne: boolean }): void {
    this.tickCount++;
    const dt = TICK_SECONDS;
    const nav = this.world.nav;
    // despawn far actors (outside interaction horizon only)
    this.actors = this.actors.filter((a) => Math.hypot(a.x - player.x, a.z - player.z) < TRAFFIC.despawnRadius);
    this.peds = this.peds.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < TRAFFIC.despawnRadius - 60);
    this.junctionReservations=this.junctionReservations.filter(r=>{
      const a=this.actors.find(a=>a.id===r.actor);if(!a||r.until<=this.tickCount)return false;
      if(a.state==='curb'||a.state==='queue')return false;
      const edge=nav.edges.get(a.edge)!;
      return a.edge===r.entry||(edge.fromNode===r.node&&a.along<a.length/2+10);
    });
    // stable update order by id (M12)
    this.actors.sort((a, b) => a.id - b.id);
    for (const a of this.actors) {
      const previous={edge:a.edge,along:a.along,lateral:a.lateral,laneLateral:a.laneLateral,turn:a.turn};
      a.px = a.x; a.pz = a.z; a.py = a.y; a.pheading = a.heading;
      const e = nav.edges.get(a.edge)!;
      const rd = this.world.roads.roads.get(e.roadId)!;
      // An explicitly disabled actor remains disabled; the source-limit cache must
      // not resurrect it and bypass bounded deadlock recovery.
      if(a.vmax<=.1)a.freeSpeed=a.vmax;
      a.freeSpeed??=a.vmax;a.vmax=this.legalSpeed(a.freeSpeed,a.edge);
      const intendedNext=this.chooseNext(a);
      a.waitingForSignal = false;
      a.waitingForJunction=false;
      // Bikes filter along a clear gap inside their own carriageway, never across its centre.
      if((a.kind==='bike'||a.kind==='bicycle') && a.speed<6 && rd.widthM>=9 && a.state==='drive') {
        const hw=rd.widthM/2;
        const options=[a.laneLateral, a.laneLateral+.8,a.laneLateral-.8].filter(lat=>lat>-hw+a.width/2+.35 && lat<(rd.oneway?hw-a.width/2-.35:-a.width/2-.2));
        let best=a.laneLateral,bestGap=-Infinity;
        for(const lat of options) {
          let g=35;
          for(const b of this.actors) if(b!==a && b.edge===a.edge && Math.abs(b.lateral-lat)<(b.width+a.width)/2+.3 && b.along>a.along-a.length) g=Math.min(g,b.along-a.along-(b.length+a.length)/2);
          if(g>bestGap+1) { best=lat;bestGap=g; }
        }
        if(bestGap>3) a.laneLateral=best;
      }
      // gap to leader
      let gap = Infinity, leaderSpeed = 0;
      for (const b of this.actors) {
        if (b === a) continue;
        let d: number | null = null;
        if (b.edge === a.edge && (b.along > a.along + 1e-4 || (Math.abs(b.along-a.along)<=1e-4 && b.id<a.id)) && Math.abs(b.lateral - a.lateral) < (a.width + b.width) / 2 + 0.3) d = b.along - a.along;
        else if (b.edge===intendedNext && Math.abs(b.lateral-this.boundedLateral(b.edge,a.kind,a.lateral))<(a.width+b.width)/2+.6) d=e.lengthM-a.along+b.along;
        if (d !== null) { d -= (a.length + b.length) / 2; if (d < gap) { gap = d; leaderSpeed = b.speed; } }
      }
      if (!player.airborne && Math.abs(player.y - a.y) < 2.5) {
        const [fx, fz] = forwardOf(a.heading);
        const dx = player.x - a.x, dz = player.z - a.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        const sameDir = Math.abs(wrapAngle(player.heading - a.heading)) < 1.0;
        // follow the player when travelling the same way; for crossing conflicts only avoid imminent contact
        if (ahead > 0 && side < a.width / 2 + 1.3 && (sameDir ? ahead < 40 : ahead < a.length / 2 + 6)) { const d = ahead - (a.length / 2 + 2.0); if (d < gap) { gap = d; leaderSpeed = sameDir ? Math.max(0, player.speed) : 0; } }
      }
      // junction yield: approaching a junction node with a conflicting actor already inside it
      const distToEnd = e.lengthM - a.along;
      a.state = a.state === 'curb' || a.state === 'queue' || a.state === 'merge' ? a.state : 'drive';
      if(a.state==='merge' && Math.abs(a.lateral-a.laneLateral)<.15)a.state='drive';
      // signalled junction: stop at the line on red (and on amber when there is room to stop)
      const sig = this.signals.colorFor(a.edge, this.tickCount);
      a.waitingForSignal = sig === 'red' || sig === 'amber';
      if (sig && sig !== 'green') {
        const stopAt = distToEnd - 5;
        const canStop = a.speed * a.speed / (2 * 3.0) < stopAt + 1;
        if (sig === 'red' || (sig === 'amber' && canStop)) { if (stopAt > -0.5 && stopAt < gap) { gap = Math.max(0, stopAt); leaderSpeed = 0; } }
      }
      const canProceed=!sig||sig==='green'||(sig==='amber'&&a.speed*a.speed/6>=distToEnd-4);
      if(a.state!=='curb'&&a.state!=='queue'&&distToEnd<12&&intendedNext&&canProceed&&gap>distToEnd-6&&this.junctionNodes.has(e.toNode)){
        if(!this.mayEnterJunction(a,intendedNext)){a.state='yield';a.waitingForJunction=true;gap=Math.min(gap,Math.max(0,distToEnd-6));leaderSpeed=0;a.waitTicks++;}
        else a.waitTicks=0;
      }
      const crossingStop=this.signals.crossingStopDistance(a.edge,a.along,this.tickCount,this.world);
      if(crossingStop!==null){gap=Math.min(gap,crossingStop);leaderSpeed=0;a.waitingForSignal=true;}
      for(const ped of this.peds){
        if(ped.edge!==e.roadId||!ped.crossingId||ped.state==='walk')continue;
        const crossing=this.signals.crossings.find(c=>c.id===ped.crossingId)!;
        if(ped.state==='wait'&&crossing.controlled)continue;
        const at=e.forward?ped.along:e.lengthM-ped.along,distance=at-a.along;
        if(distance>=-1&&distance<45){gap=Math.min(gap,Math.max(0,distance-a.length/2-3));leaderSpeed=0;}
      }
      // Buses pull left at station-adjacent boarding areas and dwell before merging.
      if((a.kind==='bus'||a.kind==='auto') && a.state==='drive') {
        for(const stop of (a.kind==='bus'?this.busStops:this.autoRanks).get(a.edge)??[]) {
          const along=stop.along,key=`${a.edge}:${stop.id}`;
          if(a.lastStop!==key && along-a.along>0 && along-a.along<45) {
            a.state='curb';a.stateTicks=0;a.stopAlong=along;a.stopDwellUntil=undefined;a.stopApproachStarted=this.tickCount;a.stopDwellSeconds=a.kind==='bus'?8:15;a.lastStop=key;break;
          }
        }
      }
      // autos: occasional curb stop with readable intent (drift to kerb, brake lights)
      if (a.kind === 'auto' && a.state === 'drive' && a.speed>3&&gap>25&&a.along>15&&distToEnd>30&&this.rng.next() < 0.0008) { a.state = 'curb'; a.stateTicks = 0; }
      let targetV = a.vmax;
      if(intendedNext){
        const exit=this.pose(intendedNext,0,this.boundedLateral(intendedNext,a.kind,a.lateral));
        if(distToEnd<Math.max(18,a.speed*a.speed/6+6)){
          targetV=Math.min(targetV,this.legalSpeed(a.freeSpeed??a.vmax,intendedNext));
          if(Math.abs(wrapAngle(exit.heading-a.heading))>.5)targetV=Math.min(targetV,a.kind==='bus'||a.kind==='truck'?3:4.5);
        }
      }
      if (a.state === 'queue') {
        if (this.tickCount >= (a.holdUntil ?? 0)) { a.state = 'drive'; a.encounterId = undefined; }
        else { targetV = 0; gap = Math.min(gap, 0.5); leaderSpeed = 0; }
      }
      let targetLat = a.laneLateral;
      if (a.state === 'curb') {
        a.stateTicks++;
        const road = this.world.roads.roads.get(e.roadId)!;
        targetLat = -road.widthM / 2 + a.width / 2 + 0.3;
        if(a.stopAlong!==undefined) {
          a.stopApproachStarted??=this.tickCount;
          gap=Math.min(gap,Math.max(0,a.stopAlong-a.along)); leaderSpeed=0;
          targetV=Math.min(targetV,6);
          if(a.stopAlong-a.along<2.6 && a.speed<.3) a.stopDwellUntil ??= this.tickCount+(a.stopDwellSeconds??8)*SIM_HZ;
          if(a.stopDwellUntil!==undefined) { targetV=0;if(this.tickCount>=a.stopDwellUntil){a.state='merge';a.stopAlong=undefined;a.stopDwellUntil=undefined;a.stopApproachStarted=undefined;a.stateTicks=0;} }
          else if(this.tickCount-(a.stopApproachStarted??this.tickCount)>30*SIM_HZ){a.state='merge';a.stopAlong=undefined;a.stopApproachStarted=undefined;a.stateTicks=0;}
        } else {
          if (a.stateTicks > 60) targetV = 0;
          if (a.stateTicks > 60 + 4 * SIM_HZ) { a.state = 'merge'; a.stateTicks = 0; }
        }
      }
      // IDM
      const s0 = 2.0, T = 1.2, b = 3.0;
      const sStar = s0 + Math.max(0, a.speed * T + (a.speed * (a.speed - leaderSpeed)) / (2 * Math.sqrt(this.dims(a.kind).accel * b)));
      let acc = this.dims(a.kind).accel * (1 - Math.pow(a.speed / Math.max(0.1, targetV), 4) - (gap < Infinity ? Math.pow(sStar / Math.max(0.1, gap), 2) : 0));
      acc = Math.max(-8, Math.min(this.dims(a.kind).accel, acc));
      a.braking = acc < -0.8 || a.speed < 0.3;
      a.speed = Math.max(0, a.speed + acc * dt);
      if (gap < 0.3) a.speed = 0;
      // A curbside vehicle waits for a safe merge gap instead of intersecting a passing vehicle.
      const mergeBlocked = a.state === 'merge' && this.actors.some(b => {
        if(b===a || b.edge!==a.edge || Math.abs(b.lateral-a.laneLateral)>(a.width+b.width)/2+.35)return false;
        const delta=b.along-a.along, clearance=(a.length+b.length)/2+1;
        // Existing overlapping merges clear from the front, with stable ID priority for
        // exact ties. A stopped merging follower must not block the front vehicle forever.
        if(b.state==='merge' && (delta < -1e-4 || (Math.abs(delta)<=1e-4 && b.id>a.id)))return false;
        // A stationary follower with a normal gap is yielding, not blocking the merge.
        return Math.abs(delta)<clearance || (delta<0 && b.speed>1 && -delta<clearance+b.speed*1.2);
      });
      if(mergeBlocked) { a.speed=0; targetLat=a.lateral; }
      // The connector ends at this exact exit offset. Begin a new lane merge only
      // after reaching it; drifting the logical lane during the arc causes a snap.
      if(a.turn&&a.edge===a.turn.toEdge&&a.along<a.turn.radius)targetLat=a.turn.toLateral;
      const lateralRate=a.kind==='bike'||a.kind==='bicycle'?1.0:.6;
      a.lateral += Math.max(-lateralRate * dt, Math.min(lateralRate * dt, targetLat - a.lateral));
      a.along += a.speed * dt;
      while (a.along > nav.edges.get(a.edge)!.lengthM) {
        const cur = nav.edges.get(a.edge)!;
        const opts = cur.next;
        if (!opts.length) { a.along = cur.lengthM; a.speed = 0; (a as any).exited = true; break; } // leaves the acquired area
        // prefer straight continuation; seeded choice among others
        const nxt = this.chooseNext(a);
        if(!nxt){a.along=cur.lengthM;a.speed=0;(a as any).exited=true;break;}
        const enteringAlong=a.along-cur.lengthM,enteringLat=this.boundedLateral(nxt,a.kind,a.lateral);
        const occupied=this.actors.some(b=>b!==a && b.edge===nxt && Math.abs(b.along-enteringAlong)<(a.length+b.length)/2+1 && Math.abs(b.lateral-enteringLat)<(a.width+b.width)/2+.3);
        if(occupied){a.along=cur.lengthM-.05;a.speed=0;a.braking=true;break;}
        a.along = enteringAlong;
        a.edge = nxt;a.nextEdge=undefined;a.lastStop=undefined;
        a.laneLateral = this.laneFor(nxt, a.kind);
        // A lane from a wide approach must not remain outside a narrower exit for several
        // seconds. Preserve its side where possible, then merge within real carriageway bounds.
        a.lateral = enteringLat;
        a.waitTicks = 0;
      }
      const p = this.motionPose(a),travel=Math.hypot(p.x-a.x,p.z-a.z),yaw=wrapAngle(p.heading-a.heading),steps=Math.max(1,Math.ceil((travel+Math.abs(yaw)*a.length/2)/.4));
      // A stationary queue requests no swept movement. Other moving actors and the
      // player still sweep against this solid body on their own integration pass.
      if(p.x===a.x&&p.z===a.z&&p.y===a.y&&yaw===0){a.blockedBy=undefined;continue;}
      const initialOverlaps=this.movingOverlaps(a,a,player);
      let clear=true;a.blockedBy=undefined;
      for(let i=1;i<=steps;i++){
        const u=i/steps,pose={x:a.x+(p.x-a.x)*u,z:a.z+(p.z-a.z)*u,y:a.y+(p.y-a.y)*u,heading:wrapAngle(a.heading+yaw*u)};
        // Old overlapping checkpoint/scenario actors may separate, but never deepen an
        // overlap. New crossing conflicts stop before either vehicle tunnels through.
        if(!this.bodyClear(pose,a)){clear=false;a.blockedBy='geometry';break;}
        if([...this.movingOverlaps(pose,a,player)].some(([id,depth])=>depth>(initialOverlaps.get(id)??0)+.005)){clear=false;a.blockedBy='actor';break;}
      }
      if(clear){a.x=p.x;a.z=p.z;a.y=p.y;a.heading=p.heading;}
      else {
        // Restore the exact logical progress too. Reprojecting a curved turn onto its exit
        // repeatedly reset its arc and produced a permanent, slowly oscillating obstacle.
        Object.assign(a,previous);
        a.speed=0;a.braking=true;
      }
    }
    // pathological deadlock recovery (M10): an actor stalled > 10 s is recycled (it "turns off" out of the scene);
    // stalls caused by an intentional curb stop are excluded. Logged for diagnostics.
    for (const a of this.actors) {
      const edge=nav.edges.get(a.edge)!;
      const waiting=(b:Actor)=>b.waitingForSignal||(b.waitingForJunction&&b.waitTicks<10*SIM_HZ)||b.state==='queue'||b.state==='curb'||(b.state==='merge'&&b.speed>.2);
      const legitimateQueue = a.vmax > .1 && a.blockedBy!=='geometry' && (a.waitingForSignal || (a.waitingForJunction&&a.waitTicks<10*SIM_HZ) || this.actors.some(b=>b!==a && waiting(b) && b.blockedBy!=='geometry' && ((b.edge===a.edge && b.along>a.along && b.along-a.along<50)||(b.edge===a.nextEdge && edge.lengthM-a.along+b.along<50))));
      a.stalledTicks = Math.hypot(a.x-a.px,a.z-a.pz)<.003 && (a.blockedBy==='geometry'||a.state !== 'curb' && a.state !== 'queue' && !legitimateQueue) ? (a.stalledTicks ?? 0) + 1 : 0;
      if (a.stalledTicks > 10 * SIM_HZ) { (a as any).exited = true; this.log.push(`deadlock-recycle ${a.id} ${a.kind} ${a.edge}`); if (this.log.length > 100) this.log.shift(); }
    }
    this.actors = this.actors.filter((a) => !(a as any).exited);
    // pedestrians: walk footpaths; occasionally wait at the edge, then cross (readable intent)
    this.peds.sort((a, b) => a.id - b.id);
    for (const p of this.peds) {
      p.px = p.x; p.pz = p.z; p.pheading = p.heading;
      const len = this.world.roads.roadLength(p.edge);
      p.stateTicks++;
      if (p.state === 'walk') {
        const prevAlong = p.along;
        p.along += p.dir * p.speed * dt;
        if (p.along < 0 || p.along > len) { p.dir = (p.dir * -1) as 1 | -1; p.along = Math.max(0, Math.min(len, p.along)); }
        this.placePed(p);
        // footpaths end where they would run onto another carriageway: turn back instead of walking into traffic
        if (this.onOtherCarriageway(p)||!this.pedClear(p)) {
          p.along = prevAlong; p.dir = (p.dir * -1) as 1 | -1;
          this.placePed(p);
          if (this.onOtherCarriageway(p)||!this.pedClear(p)) (p as any).gone = true;
        }
        const crossing=this.signals.crossings.filter(c=>c.roadId===p.edge&&Math.abs(c.along-p.along)<1.8).sort((a,b)=>Math.abs(a.along-p.along)-Math.abs(b.along-p.along))[0];
        if(crossing&&p.stateTicks>5*SIM_HZ){p.along=crossing.along;p.crossingId=crossing.id;p.state='wait';p.stateTicks=0;}
      } else if (p.state === 'wait') {
        const crossing=this.signals.crossings.find(c=>c.id===p.crossingId),road=this.world.roads.roads.get(p.edge)!;
        const duration=(road.widthM+2.8)/p.speed,[pfx,pfz]=forwardOf(player.heading),centre=this.world.roads.pointAlong(p.edge,p.along);
        const ahead=(centre.x-player.x)*pfx+(centre.z-player.z)*pfz,side=Math.abs((centre.x-player.x)*-pfz+(centre.z-player.z)*pfx);
        const playerApproaching=!player.airborne&&ahead>0&&side<road.widthM/2+2&&ahead/Math.max(.1,player.speed)<duration+2;
        const clear = !this.actors.some((a) => {
          const edge=nav.edges.get(a.edge)!;if(edge.roadId!==p.edge)return false;
          const at=edge.forward?p.along:edge.lengthM-p.along,distance=at-a.along;
          return Math.abs(distance)<a.length/2+2||(distance>0&&distance<30&&a.speed>.3);
        }) && !playerApproaching && Math.hypot(player.x - p.x, player.z - p.z) > 12;
        if (p.stateTicks > 90 && crossing&&this.signals.canBeginCrossing(crossing.id,this.tickCount,(road.widthM+2.8)/p.speed*SIM_HZ)&&clear) {
          // only cross where the far kerb is a footpath, not another carriageway (divided roads)
          const side = p.side; p.side = (side * -1) as 1 | -1; this.placePed(p);
          let ok = !this.onOtherCarriageway(p)&&this.pedClear(p);
          p.side = side; this.placePed(p);
          // A mapped crossing is evidence of a location, not proof that imported
          // median/furniture geometry has a usable opening for a person.
          const state=p.state;p.state='cross';
          for(let i=0;i<=Math.ceil((road.widthM+2.8)/.3)&&ok;i++){
            p.crossT=i/Math.ceil((road.widthM+2.8)/.3);this.placePed(p);ok=this.pedClear(p);
          }
          p.state=state;p.crossT=0;this.placePed(p);
          if (ok) { p.state = 'cross'; p.stateTicks = 0; p.crossT = 0; } else { p.state = 'walk'; p.stateTicks = 0; }
        }
        if(!crossing||(!crossing.controlled&&p.stateTicks>20*SIM_HZ)){p.state='walk';p.stateTicks=0;p.crossingId=undefined;}
      } else {
        const road = this.world.roads.roads.get(p.edge)!;
        p.crossT += (p.speed * dt) / (road.widthM + 2.8);
        if (p.crossT >= 1) { p.crossT = 0; p.side = (p.side * -1) as 1 | -1; p.state = 'walk'; p.stateTicks = 0;p.crossingId=undefined; }
      }
      this.placePed(p);
    }
    this.peds = this.peds.filter((p) => !(p as any).gone);
  }

  contacts(x: number, z: number, y: number, h: number, r: number, out: Contact[]): Contact[] {
    for (const a of this.actors) {
      if (y >= a.y + a.height || y + h <= a.y) continue;
      const [fx, fz] = forwardOf(a.heading);
      const n = Math.max(1, Math.round(a.length / a.width));
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : -a.length / 2 + a.width / 2 + (i * (a.length - a.width)) / (n - 1);
        const cx = a.x + fx * off, cz = a.z + fz * off;
        const d = Math.hypot(x - cx, z - cz);
        const rr = a.width / 2 + r;
        if (d < rr) {
          const l = d || 1;
          // coming down onto the top of a vehicle: a roof is never a landing surface (F09)
          const fromAbove = y > a.y + a.height - 0.9;
          out.push({ id: `actor_${a.id}`, kind: 'vehicle', nx: (x - cx) / l, nz: (z - cz) / l, depth: fromAbove ? a.y + a.height - y : rr - d, vertical: fromAbove ? 'above' : undefined });
          break;
        }
      }
    }
    for (const p of this.peds) {
      if (y >= p.y + 1.8 || y + h <= p.y) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < r + 0.3) { const l = d || 1; out.push({ id: `ped_${p.id}`, kind: 'pedestrian', nx: (x - p.x) / l, nz: (z - p.z) / l, depth: r + 0.3 - d }); }
    }
    return out;
  }

  /** rolling forecast, ~2.5 s horizon; a forecast, not a guarantee (MASTER §12.5) */
  occupancy(x: number, z: number, r: number): number {
    let occ = 0;
    for (const a of this.actors) {
      for (const t of [0, 1.25, 2.5]) {
        const ahead = this.world.nav.advance(a.edge, a.along, a.speed * t);
        const d = Math.hypot(ahead.x - x, ahead.z - z);
        if (d < r + a.length / 2) occ = Math.max(occ, t === 0 ? 1 : 0.6);
        else if (d < r + a.length / 2 + 4) occ = Math.max(occ, 0.3);
      }
    }
    return occ;
  }

  /**
   * Scenario overlay (MASTER §14, S04): a temporary queue of stopped vehicles on a directed edge,
   * released after `holdTicks`. Placed out of the near view and away from reserved stop/landing areas
   * by the caller. Returns the number of actors placed.
   */
  spawnQueue(edge: string, along: number, count: number, holdTicks: number, encounterId: string): number {
    const e = this.world.nav.edges.get(edge);
    if (!e) return 0;
    let placed = 0, at = along;
    for (let i = 0; i < count && at > 4 && this.actors.length<Math.round(TRAFFIC.maxActors*this.density); i++) {
      const kind: ActorKind = this.rng.pick(['car', 'car', 'auto', 'bike', 'bus'] as const);
      const d = this.dims(kind);
      if(!this.fitsRoad(kind,edge))continue;
      const lane = this.boundedLateral(edge,kind,this.laneFor(edge, kind));
      const p = this.pose(edge, at, lane);
      if(!this.bodyClear(p,d,e.roadId)){at-=d.length+2;continue;}
      if (this.reserved.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 6)) break;
      if (this.actors.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < (b.length + d.length) / 2 + 1)) { at -= d.length + 2; continue; }
      this.actors.push({ id: this.nextId++, kind, edge, along: at, speed: 0, lateral: lane, laneLateral: lane, vmax: d.vmax * 0.9, length: d.length, width: d.width, height: d.height, state: 'queue', stateTicks: 0, waitTicks: 0, braking: true, holdUntil: this.tickCount + holdTicks + i * 20, encounterId, ...p, px: p.x, pz: p.z, py: p.y, pheading: p.heading });
      placed++;
      at -= d.length + 1.8;
    }
    return placed;
  }

  snapshot() {
    return { nextId: this.nextId, tick: this.tickCount, actors: this.actors.map((a) => ({ ...a })), peds: this.peds.map((p) => ({ ...p })),junctionReservations:this.junctionReservations.map(r=>({...r})) };
  }
  restore(s: ReturnType<TrafficSystem['snapshot']>) {
    this.nextId = s.nextId; this.tickCount = s.tick; this.actors = s.actors.map((a) => ({ ...a })); this.peds = s.peds.map((p) => ({ ...p }));this.junctionReservations=(s.junctionReservations??[]).map(r=>({...r}));
  }
}

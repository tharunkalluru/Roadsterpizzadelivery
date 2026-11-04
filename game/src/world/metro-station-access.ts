import type { TiledBatch } from '../core/util';
import { metroLineColor, sampleMetroPath, projectMetroPath, METRO_PLATFORM_HALF_LENGTH, METRO_PLATFORM_OUTER_EDGE, type MetroPlatformAssembly } from './metro-geometry';
import type { StructureFootprint } from './structure-clearance';
import type { Building } from './types';

export interface StationAccessPoint { x:number; y:number; z:number }
export interface StationAccessFlight {
  id:string; from:StationAccessPoint; to:StationAccessPoint; width:number;
  kind:'street'|'platform'; side:number; end:number;
  escalator?:boolean;
}
export interface StationAccessLanding { id:string; from:StationAccessPoint; to:StationAccessPoint; width:number; covered?:boolean }
export interface StationAccessArm {
  id:string; side:number; end:number; u:number; foot:StationAccessPoint; top:StationAccessPoint;
  flight:StationAccessFlight; flights:StationAccessFlight[]; rest:StationAccessLanding; link:StationAccessLanding;
}
export interface StationAccessLift { id:string; side:number; u:number; point:StationAccessPoint; bottom?:number; top:number; concourse:number; links:StationAccessLanding[] }
export interface StationInterchangeTransfer { stationId:string; owner:string; lift:StationAccessLift; connections:{key:string;side:number;u:number;landing:StationAccessLanding}[] }
export interface StationAccessPlan { arms:StationAccessArm[]; platformFlights:StationAccessFlight[]; platformLinks:StationAccessLanding[]; lifts:StationAccessLift[] }
export type StationClearance=(p:StructureFootprint,bottom:number,top:number)=>boolean;
export type StationOccupancy=(x:number,z:number,pad:number,bottom?:number,top?:number)=>boolean;
export interface StationAccessBuildObservation {
  readonly assembly:Readonly<MetroPlatformAssembly>; readonly plan:Readonly<StationAccessPlan>;
  readonly clear:StationClearance; readonly occupied:StationOccupancy;
  readonly physical:Readonly<ReturnType<typeof stationPhysicalObstacles>>;
}
type Batches={st:Pick<TiledBatch,'box'|'quad'>};
/** Static flight must cover every clearance-fitted arm candidate, including
 * the lift cap outside the main canopy. It is not a tyre landing surface. */
export function stationAccessEnvelope(a:MetroPlatformAssembly){return{
  halfLength:37.5+Math.max(13,(a.deckHeight-4.2)/Math.tan(Math.PI/6))+2.8+1,
  halfWidth:32.5,top:a.deckHeight+4.3,
};}

/** Source has station centres/rail paths but no surveyed entrance nodes. These
 * clearance-fitted access arms are explicitly game geometry. Every arm has a
 * real open flight and a connected upper landing; no painted stair box. */
export function stationAccessPlan(a:MetroPlatformAssembly,clear:StationClearance=()=>true,
  occupied:StationOccupancy=()=>false,sharedConcourse=false):StationAccessPlan {
  const plan:StationAccessPlan={arms:[],platformFlights:[],platformLinks:[],lifts:[]};
  const floor=a.deckHeight-4.2,platform=a.deckHeight+1.2,{cx,cz,hx,hz}=a.frame;
  const P=(u:number,v:number,y:number):StationAccessPoint=>({x:cx+hx*u-hz*v,y,z:cz+hz*u+hx*v});
  const stationS=a.frame.s??0;
  const curved=(u:number,v:number,y:number):StationAccessPoint=>{const p=sampleMetroPath(a.corridor.center,stationS+u);return{x:p.x-p.hz*v,y,z:p.z+p.hx*v};};
  const approachClear=(from:StationAccessPoint,dx:number,dz:number,width:number)=>{
    const length=Math.hypot(dx,dz)||1,hx=dx/length,hz=dz/length,reach=2.05;
    if(!clear({x:from.x+hx*reach/2,z:from.z+hz*reach/2,hx,hz,hw:width/2+.1,hl:reach/2+.05},from.y-.02,from.y+2.3))return false;
    for(let d=0;d<=reach;d+=.4)if(occupied(from.x+hx*d,from.z+hz*d,width/2+.12,from.y-.02,from.y+2.3))return false;
    return true;
  };
  const liftApproachClear=(point:StationAccessPoint,side:number)=>{
    // The rendered ground door faces inward, like its upper landing doors.
    // Reserve an actual person's two-metre approach beyond that exact face.
    const dx=hz*side,dz=-hx*side;
    return approachClear({x:point.x+dx*1.26,y:.12,z:point.z+dz*1.26},dx,dz,1.6);
  };
  for(const end of [-1,1])for(const side of [-1,1]){
    const u=end*37.5,run=Math.max(13,floor/Math.tan(Math.PI/6))+2.8;
    for(let attempt=0;attempt<7&&!(sharedConcourse&&a.secondary);attempt++){
      const v=side*(14.7+attempt*2.5),foot=P(u+end*run,v,.12),top=P(u,v,floor);
      const flight:StationAccessFlight={id:`${a.key}:street:${end}:${side}`,from:foot,to:top,width:3.8,kind:'street',side,end,
        escalator:['st_ameerpet','st_mahatma_gandhi_bus_station'].includes(a.stationId)||end===side};
      const middle0=P(u+end*(run/2+1.4),v,(floor+.12)/2),middle1=P(u+end*(run/2-1.4),v,(floor+.12)/2);
      const flights=[{...flight,id:flight.id+':lower',to:middle0},{...flight,id:flight.id+':upper',from:middle1}];
      const rest={id:flight.id+':rest',from:middle0,to:middle1,width:3.8,covered:true};
      const link={id:flight.id+':landing',from:top,to:P(u,side*8.6,floor),width:3.8,covered:true};
      if(!flights.every(f=>flightClear(f,clear,occupied))||![rest,link].every(l=>landingClear(l,clear,occupied))||
        !approachClear(foot,foot.x-top.x,foot.z-top.z,2.4))continue;
      plan.arms.push({id:flight.id,side,end,u,foot,top,flight,flights,rest,link});break;
    }
    // Keep the stair outside the continuous platform driving/delivery pad.
    // Its landing enters through an actual gap in the outer platform guard.
    const platformRun=(platform-floor)/Math.tan(Math.PI/6),uTop=end*39.5;
    const flight:StationAccessFlight={id:`${a.key}:platform:${end}:${side}`,
      from:curved(uTop-end*platformRun,side*9.8,floor),to:curved(uTop,side*9.8,platform),width:2.5,kind:'platform',side,end,escalator:end===side};
    const link={id:flight.id+':landing',from:flight.to,to:curved(uTop,side*5.6,platform),width:3};
    const lowerU=(flight.from.x-cx)*hx+(flight.from.z-cz)*hz;
    const lower={id:flight.id+':concourse-landing',from:flight.from,to:P(lowerU,side*8.6,floor),width:flight.width};
    // Platform stairs follow the curved retained tracks; the concourse is a
    // tangent slab. Join their actual lower endpoints with a checked floor,
    // rather than relying on a small accidental overlap at curved stations.
    if(flightClear(flight,clear,occupied)&&[link,lower].every(l=>landingClear(l,clear,occupied))){plan.platformFlights.push(flight);plan.platformLinks.push(link,lower);}
  }
  const liftSides=sharedConcourse&&a.secondary?[]:a.stationId==='st_assembly'?[-1]:[-1,1];
  for(const side of liftSides)for(const u of a.stationId==='st_ameerpet'?[-20,20]:[side*20]){
    for(let attempt=0;attempt<7;attempt++){
      const point=P(u,side*(14.7+attempt*2.5),0),footprint={x:point.x,z:point.z,hx,hz,hw:1.35,hl:1.35};
      const lower={id:`${a.key}:lift:${side}:${u}:concourse`,from:{...point,y:floor},to:P(u,side*8.6,floor),width:2.4};
      const upper={id:`${a.key}:lift:${side}:${u}:platform`,from:{...point,y:platform},to:curved(u,side*5.6,platform),width:2.4};
      if(occupied(point.x,point.z,1.4,0,platform+2.6)||!clear(footprint,0,platform+2.6)||
        ![lower,upper].every(l=>landingClear(l,clear,occupied))||!liftApproachClear(point,side))continue;
      plan.lifts.push({id:`${a.key}:lift:${side}:${u}`,side,u,point,top:platform,concourse:floor,links:[lower,upper]});break;
    }
  }
  // A fixed longitudinal shaft position is only a preference. Dense existing
  // streets can block every preferred stair/lift while leaving a clear entry
  // a few metres along the same station. Search only this static envelope,
  // retaining all road, railway, metro and corrected-building checks.
  if(!plan.arms.length&&!plan.lifts.length&&!(sharedConcourse&&a.secondary)){
    const extent=METRO_PLATFORM_HALF_LENGTH*2*.31,du=extent*2/14,dv=4;
    const cellAt=(x:number,z:number)=>{
      const u=(x-cx)*hx+(z-cz)*hz,v=-(x-cx)*hz+(z-cz)*hx;
      if(Math.abs(u)>extent-.01||Math.abs(v)>10-.01)return-1;
      return Math.min(13,Math.floor((u+extent)/du))*5+Math.min(4,Math.floor((v+10)/dv));
    };
    const floorCells=new Map<number,boolean>();
    const retainedCell=(cell:number)=>{
      if(cell<0||cell>=70)return false;
      if(floorCells.has(cell))return floorCells.get(cell)!;
      const q=P(-extent+(Math.floor(cell/5)+.5)*du,-10+(cell%5+.5)*dv,floor);
      const retained=clear({x:q.x,z:q.z,hx,hz,hw:dv/2,hl:du/2},floor-.35,floor);
      floorCells.set(cell,retained);return retained;
    };
    const endpointSupported=(link:StationAccessLanding,needsPlatformConnection:boolean)=>{
      const dx=link.to.x-link.from.x,dz=link.to.z-link.from.z,length=Math.hypot(dx,dz)||1;
      const start:number[]=[];
      for(const offset of [-link.width/2,0,link.width/2]){
        const x=link.to.x-dz/length*offset,z=link.to.z+dx/length*offset;
        const cell=cellAt(x,z);if(!retainedCell(cell))return false;start.push(cell);
      }
      if(needsPlatformConnection){
        const goals=new Set(plan.platformLinks.filter(l=>l.id.endsWith(':concourse-landing')).map(l=>cellAt(l.to.x,l.to.z)).filter(retainedCell));
        const queue=[start[1]],seen=new Set(queue);let connected=false;
        for(let i=0;i<queue.length;i++){
          const cell=queue[i];if(goals.has(cell)){connected=true;break;}
          const row=Math.floor(cell/5),column=cell%5;
          for(const next of [row>0?cell-5:-1,row<13?cell+5:-1,column>0?cell-1:-1,column<4?cell+1:-1])if(!seen.has(next)&&retainedCell(next)){seen.add(next);queue.push(next);}
        }
        if(!connected)return false;
      }
      return true;
    };
    const tryLift=(side:number,u:number,v:number,groundOnly:boolean)=>{
      const point=P(u,v,0),endU=Math.max(-36,Math.min(36,u)),top=groundOnly?floor:platform;
      const id=`${a.key}:lift:ground-access:${side}:${u}:${groundOnly?'concourse':'platform'}`;
      const lower={id:id+':concourse',from:{...point,y:floor},to:P(endU,side*8.6,floor),width:2.4};
      const links:StationAccessLanding[]=[lower];
      if(!groundOnly)links.push({id:id+':platform',from:{...point,y:platform},to:curved(u,side*5.6,platform),width:2.4});
      if(occupied(point.x,point.z,1.4,0,top+2.6)||!clear({x:point.x,z:point.z,hx,hz,hw:1.35,hl:1.35},0,top+2.6)||
        !links.every(link=>landingClear(link,clear,occupied))||!endpointSupported(lower,groundOnly)||!liftApproachClear(point,side))return false;
      plan.lifts.push({id,side,u,point,top,concourse:floor,links});return true;
    };
    // A direct ground-to-platform bank remains preferred. A ground-to-
    // concourse lift is sufficient only when an actual retained internal
    // staircase continues to the platform; no imaginary upper stop is drawn.
    for(const groundOnly of [false,true]){
      if(plan.lifts.length||groundOnly&&!plan.platformFlights.length)break;
      const extent=groundOnly?Math.min(52,Math.floor((stationAccessEnvelope(a).halfLength-1.6)/2)*2):36;
      const positions=Array.from({length:extent+1},(_,i)=>i*2-extent).sort((x,y)=>Math.abs(x)-Math.abs(y)||x-y);
      let found=false;
      for(const side of liftSides){if(found)break;for(const u of positions){if(found)break;for(let attempt=0;attempt<7;attempt++){
        if(tryLift(side,u,side*(14.7+attempt*2.5),groundOnly)){found=true;break;}
      }}}
    }
  }
  return plan;
}

/** A displaced lift's floor link can meet the concourse at a different u from
 * its shaft. Cut the parapet where that physical link actually crosses it. */
export function stationLiftGuardOpenings(a:MetroPlatformAssembly,lift:StationAccessLift,side:number,level:'concourse'|'platform'):[number,number][]{
  if(lift.side!==side)return[];
  const y=level==='concourse'?lift.concourse:a.deckHeight+1.2,{cx,cz,hx,hz}=a.frame;
  const result:[number,number][]=[];
  const stationS=projectMetroPath(a.corridor.center,[cx,cz]).s;
  const outer=(u:number)=>{
    const p=sampleMetroPath(a.corridor.center,stationS+u),v=side*(METRO_PLATFORM_OUTER_EDGE+.12);
    return{x:p.x-p.hz*v,z:p.z+p.hx*v};
  };
  for(const link of lift.links){
    if(Math.abs(link.from.y-y)>.01)continue;
    if(level==='platform'){
      // City platforms use these same retained ten-metre curved guard faces.
      // A tangent-u hole is wrong at a curved station even if the lift shaft
      // happens to share its nominal path distance with the landing.
      const dx=link.to.x-link.from.x,dz=link.to.z-link.from.z,len=Math.hypot(dx,dz);
      for(let u0=-METRO_PLATFORM_HALF_LENGTH;u0<METRO_PLATFORM_HALF_LENGTH;u0+=10){
        const u1=Math.min(METRO_PLATFORM_HALF_LENGTH,u0+10),from=outer(u0),to=outer(u1);
        const gx=to.x-from.x,gz=to.z-from.z,den=dx*gz-dz*gx;
        if(Math.abs(den)<1e-8)continue;
        const ax=from.x-link.from.x,az=from.z-link.from.z,t=(ax*gz-az*gx)/den,s=(ax*dz-az*dx)/den;
        if(t<0||t>1||s<0||s>1)continue;
        const u=u0+(u1-u0)*s,width=(link.width/2+.12)*len*(u1-u0)/Math.abs(den);
        result.push([u-width,u+width]);
      }
      continue;
    }
    const u0=(link.from.x-cx)*hx+(link.from.z-cz)*hz,u1=(link.to.x-cx)*hx+(link.to.z-cz)*hz;
    const v0=-(link.from.x-cx)*hz+(link.from.z-cz)*hx,v1=-(link.to.x-cx)*hz+(link.to.z-cz)*hx;
    const dv=v1-v0,t=(side*10.02-v0)/dv;if(!Number.isFinite(t)||t<0||t>1)continue;
    const u=u0+(u1-u0)*t,width=(link.width/2+.12)*Math.hypot(u1-u0,dv)/Math.abs(dv);
    result.push([u-width,u+width]);
  }
  return result;
}

/** Ameerpet/MGBS are shared multi-level buildings, not two independent sets of
 * four street entrances. When a clear transfer bank can join both actual
 * concourses, the secondary assembly uses that connection. Other interchanges
 * retain their separately mapped station anchors and entrances. Hub positions
 * are clearance-fitted game interpretations, not surveyed architectural plans. */
export function stationInterchangeTransfers(assemblies:readonly MetroPlatformAssembly[],clear:StationClearance=()=>true,
  occupied:StationOccupancy=()=>false):StationInterchangeTransfer[]{
  const result:StationInterchangeTransfer[]=[];
  for(const stationId of ['st_ameerpet','st_mahatma_gandhi_bus_station']){
    const pair=assemblies.filter(a=>a.stationId===stationId).sort((a,b)=>Number(a.secondary)-Number(b.secondary));if(pair.length!==2)continue;
    const cx=(pair[0].frame.cx+pair[1].frame.cx)/2,cz=(pair[0].frame.cz+pair[1].frame.cz)/2;
    const floors=pair.map(a=>a.deckHeight-4.2),bottom=Math.min(...floors),top=Math.max(...floors);let found=false;
    for(const radius of [24,32,42,54,66]){if(found)break;for(let n=0;n<16;n++){
      const point={x:cx+Math.cos(n*Math.PI/8)*radius,y:bottom,z:cz+Math.sin(n*Math.PI/8)*radius};
      if(occupied(point.x,point.z,1.6,bottom-.35,top+2.6)||!clear({x:point.x,z:point.z,r:1.7},bottom-.35,top+2.6))continue;
      const connections:StationInterchangeTransfer['connections']=[];
      for(const [i,a]of pair.entries()){
        let best:StationInterchangeTransfer['connections'][number]|undefined,score=Infinity;
        for(const side of [-1,1])for(const u of [-28,-20,20,28]){
          const {cx,cz,hx,hz}=a.frame,from={x:cx+hx*u-hz*side*8.6,y:floors[i],z:cz+hz*u+hx*side*8.6};
          const landing={id:`${stationId}:transfer:${a.lineId}`,from,to:{...point,y:floors[i]},width:2.6,covered:true};
          const length=Math.hypot(from.x-point.x,from.z-point.z);
          if(length>=score||!landingClear(landing,clear,occupied))continue;
          best={key:a.key,side,u,landing};score=length;
        }
        if(!best)break;connections.push(best);
      }
      if(connections.length!==2)continue;
      result.push({stationId,owner:pair[0].key,connections,lift:{id:`${stationId}:interchange-transfer`,side:1,u:0,point,bottom,concourse:bottom,top,links:connections.map(c=>c.landing)}});found=true;break;
    }}
  }
  return result;
}

export function stationFlightSections(f:StationAccessFlight,maximumLength=2) {
  const dx=f.to.x-f.from.x,dz=f.to.z-f.from.z,length=Math.hypot(dx,dz),n=Math.max(1,Math.ceil(length/maximumLength)),hx=dx/(length||1),hz=dz/(length||1);
  return Array.from({length:n},(_,i)=>{
    const u0=i/n,u1=(i+1)/n,ym=f.from.y+(f.to.y-f.from.y)*(u0+u1)/2;
    return {footprint:{x:f.from.x+dx*(u0+u1)/2,z:f.from.z+dz*(u0+u1)/2,hx,hz,hw:f.width/2+.4,hl:length/n/2+.25},
      bottom:Math.min(f.from.y+(f.to.y-f.from.y)*u0,f.from.y+(f.to.y-f.from.y)*u1)-.38,
      top:Math.max(f.from.y+(f.to.y-f.from.y)*u0,f.from.y+(f.to.y-f.from.y)*u1)+2.85,ym};
  });
}
export function flightClear(f:StationAccessFlight,clear:StationClearance,occupied?:StationOccupancy){
  return stationFlightSections(f).every(s=>clear(s.footprint,s.bottom,s.top)&&(!occupied||!occupied(s.footprint.x,s.footprint.z,f.width/2+.4,s.bottom,s.top)));
}

export interface StationPhysicalObstacle {readonly x:number;readonly z:number;readonly r:number;readonly top:number;readonly bottom?:number}
/** Freeze pre-station scenery before any generated station adds its own
 * colliders. Circular gameplay proxies can understate rectangular fixture
 * corners (notably a footbridge stair tower), so planning encloses their full
 * possible square as well. This never removes or changes the mapped fixture. */
export function stationPhysicalObstacles(source:ReadonlyMap<string,readonly StationPhysicalObstacle[]>){
  const grid=new Map<string,{x:number;z:number;r:number;bottom:number;top:number}[]>(),seen=new Set<StationPhysicalObstacle>();
  for(const entries of source.values())for(const obstacle of entries){
    if(seen.has(obstacle))continue;seen.add(obstacle);
    const bottom=obstacle.bottom??0;
    if(![obstacle.x,obstacle.z,obstacle.r,bottom,obstacle.top].every(Number.isFinite)||obstacle.r<=0||obstacle.top<bottom)continue;
    const copy={x:obstacle.x,z:obstacle.z,r:obstacle.r*Math.SQRT2+.08,bottom,top:obstacle.top};
    for(let i=Math.floor((copy.x-copy.r)/50);i<=Math.floor((copy.x+copy.r)/50);i++)for(let j=Math.floor((copy.z-copy.r)/50);j<=Math.floor((copy.z+copy.r)/50);j++){
      const key=`${i},${j}`,list=grid.get(key)??[];list.push(copy);grid.set(key,list);
    }
  }
  const clear:StationClearance=(p,bottom,top)=>{
    const ex='r'in p?p.r:Math.abs(p.hx)*p.hl+Math.abs(p.hz)*p.hw,ez='r'in p?p.r:Math.abs(p.hz)*p.hl+Math.abs(p.hx)*p.hw;
    const checked=new Set<object>();
    for(let i=Math.floor((p.x-ex)/50);i<=Math.floor((p.x+ex)/50);i++)for(let j=Math.floor((p.z-ez)/50);j<=Math.floor((p.z+ez)/50);j++)for(const o of grid.get(`${i},${j}`)??[]){
      if(checked.has(o)||top<=o.bottom+.02||bottom>=o.top+.08)continue;checked.add(o);
      const dx=o.x-p.x,dz=o.z-p.z;
      if('r'in p){if(Math.hypot(dx,dz)<p.r+o.r)return false;}
      else if(Math.hypot(Math.max(0,Math.abs(dx*p.hx+dz*p.hz)-p.hl),Math.max(0,Math.abs(-dx*p.hz+dz*p.hx)-p.hw))<o.r)return false;
    }
    return true;
  };
  return{clear,occupied:(x:number,z:number,pad:number,bottom=0,top=Infinity)=>!clear({x,z,r:pad},bottom,top)};
}

/** Use the corrected visible building pieces and their actual heights. The
 * old ground-only AABB lookup rejected skywalks above a short bus building,
 * and original footprints could include pieces already trimmed for transit. */
export function stationBuildingOccupied(grid:Map<string,Building[]>,x:number,z:number,pad:number,bottom=0){
  const seen=new Set<Building>();
  for(let i=Math.floor((x-pad)/50);i<=Math.floor((x+pad)/50);i++)for(let j=Math.floor((z-pad)/50);j<=Math.floor((z+pad)/50);j++)for(const b of grid.get(`${i},${j}`)||[]){
    if(seen.has(b)||b.h+.08<bottom)continue;seen.add(b);let inside=false;
    for(let a=0,c=b.ring.length-1;a<b.ring.length;c=a++){
      const p=b.ring[a],q=b.ring[c];if((p[1]>z)!==(q[1]>z)&&x<(q[0]-p[0])*(z-p[1])/(q[1]-p[1])+p[0])inside=!inside;
      const dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(x-p[0]-dx*t,z-p[1]-dz*t)<=pad)return true;
    }
    if(inside)return true;
  }
  return false;
}
export function landingFootprint(l:StationAccessLanding):StructureFootprint{
  const dx=l.to.x-l.from.x,dz=l.to.z-l.from.z,length=Math.hypot(dx,dz)||.01;
  return{x:(l.from.x+l.to.x)/2,z:(l.from.z+l.to.z)/2,hx:dx/length,hz:dz/length,hw:l.width/2+(l.covered?.4:.08),hl:length/2+.1};
}
export function landingClear(l:StationAccessLanding,clear:StationClearance,occupied?:StationOccupancy){
  if(!clear(landingFootprint(l),l.from.y-.35,l.from.y+(l.covered?2.85:1.15)))return false;
  if(!occupied)return true;
  const dx=l.to.x-l.from.x,dz=l.to.z-l.from.z,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.75));
  const pad=l.width/2+(l.covered?.4:.08)+.12;
  for(let i=0;i<=n;i++)if(occupied(l.from.x+dx*i/n,l.from.z+dz*i/n,pad,l.from.y-.35,l.from.y+(l.covered?2.85:1.15)))return false;
  return true;
}

/** Openings are real geometry omissions. Never paint a door over a solid wall. */
export function stationGuardSegments(from:number,to:number,openings:readonly [number,number][]=[[-41.2,-37.8],[37.8,41.2]]){
  let pieces:[[number,number]]|[number,number][]=[[from,to]];
  for(const [lo,hi]of openings)pieces=pieces.flatMap(([a,b])=>b<=lo||a>=hi?[[a,b] as [number,number]]:
    [...(a<lo?[[a,lo] as [number,number]]:[]),...(b>hi?[[hi,b] as [number,number]]:[])]);
  return pieces.filter(([a,b])=>b-a>.01);
}

function drawRail(B:Batches,a:StationAccessPoint,b:StationAccessPoint,width:number,height:number,color:string){
  const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),pitch=-Math.atan2(dy,length),nx=-dz/(length||1),nz=dx/(length||1);
  for(const side of [-1,1]){
    B.st.box((a.x+b.x)/2+nx*width*side/2,(a.y+b.y)/2+height,(a.z+b.z)/2+nz*width*side/2,.055,.065,Math.hypot(length,dy),color,{ry:yaw,rx:pitch});
    const count=Math.max(1,Math.ceil(length/3));for(let i=0;i<=count;i++){const u=i/count;
      B.st.box(a.x+dx*u+nx*width*side/2,a.y+dy*u+height/2,a.z+dz*u+nz*width*side/2,.045,height,.045,'#8c969d');
    }
  }
}

export function drawStationFlight(f:StationAccessFlight,B:Batches,lowQ:boolean,lineId:string){
  const dx=f.to.x-f.from.x,dz=f.to.z-f.from.z,dy=f.to.y-f.from.y,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  const risers=Math.max(1,Math.ceil(dy/.18)),at=(u:number,v:number,y:number)=>[f.from.x+dx*u+nx*v,y,f.from.z+dz*u+nz*v];
  // Two faces per real tread/riser rather than a solid stair housing. This
  // preserves the rise/run in Low too, while sharing the existing tile batch.
  for(let i=0;i<risers;i++){
    const a=i/risers,b=(i+1)/risers,y0=f.from.y+dy*a,y1=f.from.y+dy*b,w=f.width/2;
    const split=f.escalator?w-1.15:w;
    B.st.quad(at(a,-w,y1),at(b,-w,y1),at(b,split,y1),at(a,split,y1),'#c2c7ca');
    B.st.quad(at(a,split,y0),at(a,-w,y0),at(a,-w,y1),at(a,split,y1),'#8e999f');
    if(f.escalator){B.st.quad(at(a,split,y1),at(b,split,y1),at(b,w,y1),at(a,w,y1),'#59656c');
      B.st.quad(at(a,w,y0),at(a,split,y0),at(a,split,y1),at(a,w,y1),'#818e94');}
    if(!lowQ||i%2===0)B.st.quad(at(a,-w+.04,y1+.006),at(a+.025/length,-w+.04,y1+.006),at(a+.025/length,w-.04,y1+.006),at(a,w-.04,y1+.006),'#e5d088');
  }
  for(const side of [-1,1])B.st.quad(at(0,side*f.width/2,f.from.y-.38),at(1,side*f.width/2,f.to.y-.38),at(1,side*f.width/2,f.to.y),at(0,side*f.width/2,f.from.y),'#aeb6bc');
  drawRail(B,f.from,f.to,f.width-.1,1.02,'#606d75');
  // Covered, open-sided flight. Its sloping soffit remains above the whole
  // staircase; supports stand at its outer corners instead of filling it.
  const yaw=Math.atan2(dx,dz),pitch=-Math.atan2(dy,length),color=metroLineColor(lineId);
  if(f.escalator)for(const v of [f.width/2-1.15,f.width/2-.04]){
    B.st.box((f.from.x+f.to.x)/2+nx*v,(f.from.y+f.to.y)/2+.82,(f.from.z+f.to.z)/2+nz*v,.08,.36,Math.hypot(length,dy),'#a5b2b7',{ry:yaw,rx:pitch});
    B.st.box((f.from.x+f.to.x)/2+nx*v,(f.from.y+f.to.y)/2+1.04,(f.from.z+f.to.z)/2+nz*v,.09,.055,Math.hypot(length,dy),'#303a3f',{ry:yaw,rx:pitch});
  }
  B.st.box((f.from.x+f.to.x)/2,(f.from.y+f.to.y)/2+2.7,(f.from.z+f.to.z)/2,f.width+.65,.14,Math.hypot(length,dy)+.4,'#e7ecec',{ry:yaw,rx:pitch});
  for(const side of [-1,1]){
    B.st.box((f.from.x+f.to.x)/2+nx*(f.width/2+.24)*side,(f.from.y+f.to.y)/2+2.64,(f.from.z+f.to.z)/2+nz*(f.width/2+.24)*side,.09,.18,Math.hypot(length,dy)+.4,color,{ry:yaw,rx:pitch});
    for(const u of [0,.5,1])B.st.box(f.from.x+dx*u+nx*(f.width/2+.2)*side,f.from.y+dy*u+1.32,f.from.z+dz*u+nz*(f.width/2+.2)*side,.065,2.64,.065,'#8c969d');
  }
}

export function drawStationLanding(l:StationAccessLanding,B:Batches){
  const dx=l.to.x-l.from.x,dz=l.to.z-l.from.z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
  B.st.box((l.from.x+l.to.x)/2,l.from.y-.15,(l.from.z+l.to.z)/2,l.width,.3,length+.1,'#c9ced0',{ry:yaw});
  drawRail(B,l.from,l.to,l.width-.1,1.02,'#69777d');
  if(l.covered)B.st.box((l.from.x+l.to.x)/2,l.from.y+2.7,(l.from.z+l.to.z)/2,l.width+.65,.14,length+.2,'#e7ecec',{ry:yaw});
}

export function drawStationEntryPortal(arm:StationAccessArm,B:Batches,lineId:string){
  const f=arm.flight,dx=f.to.x-f.from.x,dz=f.to.z-f.from.z,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length,yaw=Math.atan2(dx,dz),color=metroLineColor(lineId);
  const p=arm.foot;
  B.st.box(p.x,p.y+2.43,p.z,f.width+.4,.4,.25,color,{ry:yaw});
  // A small train pictogram above a genuinely open entrance, not another
  // station-nameboard or an opaque door painted across the stair opening.
  const off=.15;B.st.box(p.x-dx/length*off,p.y+2.44,p.z-dz/length*off,.52,.27,.03,'#f4f6ee',{ry:yaw});
  for(const side of [-1,1])B.st.box(p.x+nx*(f.width/2+.12)*side,p.y+1.2,p.z+nz*(f.width/2+.12)*side,.1,2.4,.1,color);
}

export function drawStationLift(l:StationAccessLift,a:MetroPlatformAssembly,B:Batches){
  const {hx,hz}=a.frame,yaw=Math.atan2(hx,hz),nx=-hz,nz=hx,{x,z}=l.point,bottom=l.bottom??0,height=l.top-bottom+2.5;
  // Opaque muted glazing avoids mobile compositing artifacts. Narrow corner
  // frames and three correctly aligned landing doors make this a lift shaft,
  // rather than pretending its glass is an open stair entrance.
  B.st.box(x,bottom+height/2,z,2.5,height,2.5,'#607780',{ry:yaw});
  for(const u of [-1.27,1.27])for(const v of [-1.27,1.27])B.st.box(x+hx*u+nx*v,bottom+height/2,z+hz*u+nz*v,.1,height,.1,'#c6ced0');
  for(const y of [...new Set([bottom,l.concourse,l.top])]){
    const v=-l.side*1.26,px=x+nx*v,pz=z+nz*v;
    B.st.box(px,y+1.05,pz,1.45,2.1,.04,'#b7c1c3',{ry:yaw+Math.PI/2});
    B.st.box(px+hx*.73,y+1.08,pz+hz*.73,.06,2.2,.06,'#3b4b53');
    B.st.box(px,y+2.2,pz,1.6,.18,.08,metroLineColor(a.lineId),{ry:yaw+Math.PI/2});
    B.st.box(px,y+1.05,pz,.04,2.05,.05,'#51636a');
  }
  for(const link of l.links)drawStationLanding(link,B);
}

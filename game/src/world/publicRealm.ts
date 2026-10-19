/** Source positions are preserved. Furniture dimensions and roadside fits remain provisional. */
import type { Vec2, WorldCore } from './schema';
import { RoadIndex, headingOf } from './roadIndex';

export type PublicRealmKind='bus_stop'|'auto_stand'|'vendor'|'parking'|'utility_pole'|'streetlight'|'drain'|'tree'|'pothole'|'speed_breaker'|'construction';
export interface PublicRealmSource {id:string;url:string;license?:string;fetchedAt?:string;captureDate?:string}
export interface PublicRealmFeature {
  id:string;kind:PublicRealmKind;x:number;z:number;lat?:number;lon?:number;roadId?:string;side?:-1|1;heading?:number;name?:string;
  sourceId:string;sourceElementId?:string;tags?:Record<string,string>;
  status:'source_mapped'|'street_observed'|'scenario_overlay';geometryStatus?:'provisional'|'verified';
  placement?:'source_position'|'roadside_fit';widthM?:number;lengthM?:number;heightM?:number;
  variant?:string;count?:number;points?:Vec2[];
}
export interface PublicRealmData {version:1;note?:string;sources:PublicRealmSource[];features:PublicRealmFeature[]}
export function mergePublicRealmData(...layers:(PublicRealmData|null|undefined)[]):PublicRealmData {
  const sources=new Map<string,PublicRealmSource>(),features=new Map<string,PublicRealmFeature>();
  for(const layer of layers){if(!layer)continue;validatePublicRealm(layer);for(const s of layer.sources)sources.set(s.id,s);
    for(const f of layer.features){const prior=features.get(f.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(f))throw new Error(`Contradictory public-realm feature ${f.id}`);features.set(f.id,f);}
  }
  return{version:1,sources:[...sources.values()],features:[...features.values()],note:'Source-mapped, street-observed and scenario records retain their individual evidence and geometry statuses.'};
}
export interface PublicRealmSurfacePatch {
  id:string;kind:'pothole'|'speed_breaker';x:number;z:number;heading:number;widthM:number;lengthM:number;heightM:number;
  roadId:string;elevationM:number;sourceIds:string[];
  variant?:string;
}
export interface PublicRealmSolid {id:string;poly:Vec2[];bottom:number;top:number}
export interface PlannedPublicRealmFeature {
  source:PublicRealmFeature;x:number;z:number;heading:number;widthM:number;lengthM:number;heightM:number;
  elevationM:number;roadId?:string;sourceDistanceM:number;
}
export interface PublicRealmPlan {
  features:PlannedPublicRealmFeature[];solids:PublicRealmSolid[];surfaces:PublicRealmSurfacePatch[];
  rejected:{id:string;reason:string}[];sources:PublicRealmSource[];
}
type RealmCore=WorldCore&{publicRealm?:PublicRealmPlan};
const kinds=new Set<PublicRealmKind>(['bus_stop','auto_stand','vendor','parking','utility_pole','streetlight','drain','tree','pothole','speed_breaker','construction']);
const defaults:Record<PublicRealmKind,[number,number,number]>={
  bus_stop:[5.6,2.2,2.8],auto_stand:[6.5,3.2,1.8],vendor:[3.1,2.4,2.3],parking:[5.5,2.5,1.35],
  utility_pole:[.35,.35,8],streetlight:[.22,.22,8.5],drain:[.65,1.1,.025],tree:[.55,.55,8],
  pothole:[1.45,.95,.09],speed_breaker:[5.5,2.8,.11],construction:[5,2,.95],
};
export function validatePublicRealm(data:PublicRealmData):void {
  if(data.version!==1||!Array.isArray(data.features)||!Array.isArray(data.sources))throw new Error('Unsupported public-realm data');
  const sources=new Set(data.sources.map(s=>s.id)),ids=new Set<string>();
  for(const f of data.features){
    if(!f.id||ids.has(f.id)||!kinds.has(f.kind)||!Number.isFinite(f.x)||!Number.isFinite(f.z)||!sources.has(f.sourceId)||!['source_mapped','street_observed','scenario_overlay'].includes(f.status))throw new Error(`Invalid public-realm feature ${f.id??''}`);
    for(const key of ['widthM','lengthM','heightM']as const)if(f[key]!==undefined&&(!Number.isFinite(f[key])||f[key]!<=0||f[key]!>60))throw new Error(`Invalid public-realm dimension ${f.id}:${key}`);
    if(f.heading!==undefined&&!Number.isFinite(f.heading)||f.count!==undefined&&(!Number.isInteger(f.count)||f.count<1||f.count>20)||f.points?.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error(`Invalid public-realm pose ${f.id}`);
    if(f.geometryStatus==='verified'&&f.status==='scenario_overlay')throw new Error(`Scenario geometry cannot be verified: ${f.id}`);
    ids.add(f.id);
  }
}
export async function loadPublicRealm(url='./research/public-realm.json',signal?:AbortSignal):Promise<PublicRealmData|null>{
  const response=await fetch(url,{signal});if(response.status===404)return null;
  if(!response.ok)throw new Error(`Public-realm data unavailable (${response.status})`);
  const data=await response.json()as PublicRealmData;validatePublicRealm(data);return data;
}
/** Local +Z points toward the road for furniture; along travel for road patches. */
export function publicRealmPoint(f:Pick<PlannedPublicRealmFeature,'x'|'z'|'heading'>,x:number,z:number):Vec2 {
  const c=Math.cos(f.heading),s=Math.sin(f.heading);return[f.x+c*x+s*z,f.z-s*x+c*z];
}
export function publicRealmRectangle(f:Pick<PlannedPublicRealmFeature,'x'|'z'|'heading'>,width:number,length:number,x=0,z=0):Vec2[]{
  return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>publicRealmPoint(f,x+sx*width/2,z+sz*length/2));
}
/** Smooth compact support, shared by the visual mesh and four-wheel physical sampling. */
export function publicRealmSurfaceHeight(p:PublicRealmSurfacePatch,x:number,z:number):number {
  const dx=x-p.x,dz=z-p.z,c=Math.cos(p.heading),s=Math.sin(p.heading);
  const u=(dx*c-dz*s)/(p.widthM/2),v=(dx*s+dz*c)/(p.lengthM/2);
  if(Math.abs(u)>=1||Math.abs(v)>=1)return 0;
  const edge=(a:number)=>{const t=Math.max(0,Math.min(1,(1-Math.abs(a))/.18));return t*t*(3-2*t);};
  if(p.kind==='speed_breaker')return p.heightM*(p.variant==='rumble_strip'?(1+Math.cos(v*7*Math.PI))*.5*edge(v):Math.cos(v*Math.PI/2)**2)*edge(u);
  const r=u*u+v*v;if(r>=1)return 0;return-p.heightM*(1-r)**2;
}
const surfaceIndexes=new WeakMap<PublicRealmPlan,Map<string,PublicRealmSurfacePatch[]>>();
export function publicRealmHeightAt(plan:PublicRealmPlan|undefined,roadId:string,x:number,z:number):number {
  if(!plan)return 0;let index=surfaceIndexes.get(plan);if(!index){index=new Map();for(const p of plan.surfaces){const list=index.get(p.roadId)??[];list.push(p);index.set(p.roadId,list);}surfaceIndexes.set(plan,index);}
  let h=0;for(const p of index.get(roadId)??[])h+=publicRealmSurfaceHeight(p,x,z);return h;
}
export function publicRealmOf(core:WorldCore):PublicRealmPlan|undefined{return(core as RealmCore).publicRealm;}
export function attachPublicRealm(core:WorldCore,data:PublicRealmData):PublicRealmPlan {
  const plan=planPublicRealm(data,core);(core as RealmCore).publicRealm=plan;return plan;
}
/** Transport association is owned by placements.ts; only matched stop/rank points become 3D furniture. */
export function publicRealmWithTransport(core:WorldCore,extra?:PublicRealmData|null):PublicRealmData {
  const transport=(core as WorldCore&{transport?:{sources:PublicRealmSource[];features:(Omit<PublicRealmFeature,'kind'|'status'>&{kind:string;status:string})[];matches:{featureId:string;roadId:string;side:-1|1}[]}}).transport;
  const sources=new Map((extra?.sources??[]).map(s=>[s.id,s]));
  const supplied=new Map((extra?.features??[]).map(f=>[f.id,f]));
  const features=(extra?.features??[]).filter(f=>!transport||!['bus_stop','auto_stand'].includes(f.kind)||f.status!=='source_mapped'),ids=new Set(features.map(f=>f.id));
  if(transport){
    for(const s of transport.sources)sources.set(s.id,s);
    const matches=new Map(transport.matches.map(m=>[m.featureId,m]));
    for(const f of transport.features){const match=matches.get(f.id);if(!match||!['bus_stop','auto_stand'].includes(f.kind)||ids.has(f.id))continue;
      features.push({...f,...supplied.get(f.id),kind:f.kind as 'bus_stop'|'auto_stand',roadId:match.roadId,side:match.side,status:'source_mapped',geometryStatus:'provisional',placement:'roadside_fit'});ids.add(f.id);
    }
  }
  return{version:1,sources:[...sources.values()],features,note:'Mapped source points retained; 3D furniture dimensions and any roadside fit are provisional.'};
}

export function planPublicRealm(data:PublicRealmData,core:WorldCore):PublicRealmPlan {
  validatePublicRealm(data);
  const roads=new RoadIndex(core),plan:PublicRealmPlan={features:[],solids:[],surfaces:[],rejected:[],sources:data.sources};
  const reject=(id:string,reason:string)=>plan.rejected.push({id,reason});
  const solid=(f:PlannedPublicRealmFeature,w:number,d:number,h:number,x=0,z=0,bottom=f.elevationM)=>plan.solids.push({id:`public:${f.source.id}:${plan.solids.length}`,poly:publicRealmRectangle(f,w,d,x,z),bottom,top:bottom+h});
  for(const source of data.features){
    const [dw,dl,dh]=defaults[source.kind];
    const f:PlannedPublicRealmFeature={source,x:source.x,z:source.z,heading:source.heading??0,widthM:source.widthM??dw,lengthM:source.lengthM??dl,heightM:source.heightM??dh,elevationM:.16,sourceDistanceM:0};
    if(source.kind==='bus_stop'&&source.tags?.shelter!=='yes'){f.widthM=source.widthM??(source.tags?.bench==='yes'?2.4:.55);f.lengthM=source.lengthM??.55;}
    if(source.kind==='speed_breaker'&&source.variant==='rumble_strip'){f.heightM=source.heightM??.025;f.lengthM=source.lengthM??4.8;}
    else if(source.kind==='speed_breaker'&&source.variant==='hump')f.lengthM=source.lengthM??3.6;
    if(source.kind==='parking'&&['underground','multi-storey','rooftop'].includes(source.tags?.parking??'')){reject(source.id,'parking_is_not_a_surface_lot');continue;}
    if(source.kind==='utility_pole'&&source.variant==='substation'){f.widthM=source.widthM??2.3;f.lengthM=source.lengthM??1.1;f.heightM=source.heightM??1.8;}
    if(source.kind==='utility_pole'&&source.variant==='transformer'&&source.tags?.location!=='overhead'){f.widthM=source.widthM??1.3;f.lengthM=source.lengthM??1;f.heightM=source.heightM??1.8;}
    const candidates=new Set<ReturnType<RoadIndex['segmentsNear']>[number]>();
    for(const dx of [-40,0,40])for(const dz of [-40,0,40])for(const s of roads.segmentsNear(source.x+dx,source.z+dz))if(!source.roadId||s.road.id===source.roadId)candidates.add(s);
    let hit:{x:number;z:number;distance:number;rx:number;rz:number;heading:number;along:number;roadId:string;width:number;length:number;elevation:number}|null=null;
    for(const s of candidates){
      if(s.road.tunnel||s.road.bridge||Math.max(s.ay,s.by)>.3||['footway','pedestrian','path','steps','cycleway'].includes(s.road.highway))continue;
      const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((source.x-s.ax)*dx+(source.z-s.az)*dz)/(s.len*s.len))),x=s.ax+dx*t,z=s.az+dz*t,distance=Math.hypot(source.x-x,source.z-z);
      if(!hit||distance<hit.distance)hit={x,z,distance,rx:-dz/s.len,rz:dx/s.len,heading:headingOf(dx,dz),along:s.cumStart+t*s.len,roadId:s.road.id,width:s.road.widthM,length:s.road.lengthM,elevation:s.ay+(s.by-s.ay)*t};
    }
    if(source.kind==='pothole'||source.kind==='speed_breaker'){
      if(!hit||hit.distance>hit.width/2+1){reject(source.id,'hazard_not_on_ground_carriageway');continue;}
      if(hit.along<6||hit.length-hit.along<6){reject(source.id,'hazard_at_junction_or_short_edge');continue;}
      f.roadId=hit.roadId;f.heading=hit.heading;f.elevationM=hit.elevation;
      f.heightM=Math.min(source.kind==='pothole'?.12:.16,f.heightM);
      if(source.kind==='speed_breaker'){f.x=hit.x;f.z=hit.z;f.widthM=Math.min(f.widthM,hit.width-.4);}
      else f.widthM=Math.min(f.widthM,Math.max(.45,hit.width-2*hit.distance-.3));
      const p:PublicRealmSurfacePatch={id:source.id,kind:source.kind,x:f.x,z:f.z,heading:f.heading,widthM:f.widthM,lengthM:f.lengthM,heightM:f.heightM,roadId:hit.roadId,elevationM:hit.elevation,sourceIds:[source.sourceId],variant:source.variant};
      // Preserve one physical/visual surface; duplicates at nearly identical source nodes are not stacked.
      if(plan.surfaces.some(q=>q.kind===p.kind&&Math.hypot(q.x-p.x,q.z-p.z)<Math.max(q.lengthM,p.lengthM)/2)){reject(source.id,'duplicate_surface_patch');continue;}
      plan.surfaces.push(p);plan.features.push(f);continue;
    }
    if(hit){f.roadId=hit.roadId;if(source.heading===undefined){const side=source.side??((source.x-hit.x)*hit.rx+(source.z-hit.z)*hit.rz<0?-1:1);f.heading=Math.atan2(-hit.rx*side,-hit.rz*side);}}
    // A mapped stop point often describes boarding at the kerb, not the shelter's rear wall.
    // Keep raw coordinates in source; mark the fitted 3D footprint as provisional.
    if(hit&&(source.placement==='roadside_fit'||['bus_stop','auto_stand'].includes(source.kind))){
      const side=source.side??((source.x-hit.x)*hit.rx+(source.z-hit.z)*hit.rz<0?-1:1),offset=Math.max(hit.width/2+f.lengthM/2+.55,hit.distance);
      f.x=hit.x+hit.rx*side*offset;f.z=hit.z+hit.rz*side*offset;
    }
    let conflict=false;
    for(const u of [-.5,0,.5])for(const v of [-.5,0,.5]){
      const [x,z]=publicRealmPoint(f,u*f.widthM,v*f.lengthM);
      if(roads.surface(x,z,{maxY:.4,margin:source.kind==='drain'?.02:.2})){conflict=true;break;}
    }
    if(conflict){reject(source.id,'furniture_overlaps_carriageway');continue;}
    f.elevationM=roads.groundHeight(f.x,f.z,f.roadId??null,0,.4);
    f.sourceDistanceM=Math.hypot(source.x-f.x,source.z-f.z);plan.features.push(f);
    if(source.kind==='bus_stop'){
      if(source.tags?.shelter==='yes')for(const x of [-f.widthM*.43,f.widthM*.43])solid(f,.13,.13,f.heightM,x,-f.lengthM*.35);
      else solid(f,.08,.08,f.heightM,-f.widthM*.4,0);
      if(source.tags?.bench==='yes'||source.tags?.shelter==='yes')solid(f,f.widthM*.72,.48,.5,0,-f.lengthM*.13);
      if(source.tags?.shelter==='yes'){solid(f,f.widthM,f.lengthM,.14,0,0,f.elevationM+f.heightM-.14);solid(f,f.widthM*.94,.065,1.2,0,-f.lengthM*.4,f.elevationM+.9);}
    }else if(source.kind==='utility_pole'||source.kind==='streetlight'){
      solid(f,f.widthM,f.lengthM,f.heightM);
      if(source.kind==='utility_pole'&&(source.variant==='transformer'||source.tags?.transformer)&&source.tags?.location==='overhead')solid(f,.85,.7,1.05,0,-.2,f.elevationM+f.heightM*.6-.525);
    }else if(source.kind==='tree')solid(f,f.widthM,f.lengthM,f.heightM*.58);
    else if(source.kind==='vendor'){
      if(source.variant==='pottery'){solid(f,f.widthM,f.lengthM,.42*f.heightM/2.9);solid(f,.07,.07,f.heightM*.92,0,.2);}
      else solid(f,2.1,1.05,.95);
    }
    else if(source.kind==='auto_stand'){
      for(const [x,yaw]of [[-1.6,.2],[1.2,-.1]]){
        const centre=publicRealmPoint(f,x,0),auto={...f,x:centre[0],z:centre[1],heading:f.heading+yaw};
        plan.solids.push({id:`public:${source.id}:auto:${x}`,poly:publicRealmRectangle(auto,1.25,2.25,0,.1),bottom:f.elevationM,top:f.elevationM+1.8});
      }
    }else if(source.kind==='construction')solid(f,f.widthM,f.lengthM,f.heightM);
  }
  return plan;
}

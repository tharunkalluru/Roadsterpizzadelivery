import type { WorldCore } from '../world/schema';
import { RoadIndex } from '../world/roadIndex';

export type TransportKind = 'signal' | 'bus_stop' | 'auto_stand' | 'crossing';
export interface TransportFeature {
  id:string; kind:TransportKind; x:number; z:number; lat:number; lon:number;
  name?:string; sourceId:string; sourceElementId:string; tags?:Record<string,string>;
  status:'source_mapped';
}
export interface TransportData {
  version:1; worldId:string; worldVersion:string;
  sources:{id:string;url:string;license:string;fetchedAt:string}[];
  features:TransportFeature[];
}
export interface TransportMatch {
  featureId:string; roadId:string; alongM:number; side:-1|1; edgeIds:string[];
  distanceM:number; junctionIds?:string[]; status:'provisional';
}
export interface MatchedTransport extends TransportData {
  matches:TransportMatch[];
  unmatched:{featureId:string;reason:string}[];
}
export type TransportCore = WorldCore & {transport?:MatchedTransport};

/** Keep source points intact. A nearby graph attachment is always provisional, never a surveyed move. */
export function attachTransport<T extends WorldCore>(core:T,data:TransportData):T & {transport:MatchedTransport} {
  if(data.version!==1 || data.worldId!=='hyd-metro' || data.worldVersion!==core.manifestVersion)throw new Error('Transport data belongs to another world version');
  const ids=new Set<string>(),sources=new Set(data.sources.map(s=>s.id));
  for(const f of data.features){
    if(ids.has(f.id)||!f.id||!['signal','bus_stop','auto_stand','crossing'].includes(f.kind)||![f.x,f.z,f.lat,f.lon].every(Number.isFinite)||!sources.has(f.sourceId)||!f.sourceElementId||f.status!=='source_mapped')throw new Error(`Invalid sourced transport feature ${f.id}`);
    ids.add(f.id);
  }
  const roads=new RoadIndex(core),nodes=new Map(core.nodes.map(n=>[n.id,n])),matches:TransportMatch[]=[],unmatched:MatchedTransport['unmatched']=[];
  for(const feature of data.features){
    const candidates=new Map<string,{roadId:string;alongM:number;side:-1|1;distanceM:number;score:number}>();
    const nearby=new Map<string,ReturnType<RoadIndex['segmentsNear']>[number]>();
    for(const dx of [-40,0,40])for(const dz of [-40,0,40])for(const seg of roads.segmentsNear(feature.x+dx,feature.z+dz))nearby.set(`${seg.road.id}:${seg.i}`,seg);
    for(const seg of nearby.values()){
      const r=seg.road;
      if(r.bridge||r.tunnel||Math.max(r.elevationM,...r.pointElevM)>.4||/^(footway|pedestrian|path|steps|cycleway|track|motorway|motorway_link)$/.test(r.highway))continue;
      if(feature.kind==='bus_stop'&&r.widthM<6)continue;
      const dx=seg.bx-seg.ax,dz=seg.bz-seg.az,t=Math.max(0,Math.min(1,((feature.x-seg.ax)*dx+(feature.z-seg.az)*dz)/(seg.len*seg.len)));
      const px=seg.ax+dx*t,pz=seg.az+dz*t,distanceM=Math.hypot(feature.x-px,feature.z-pz);
      if(distanceM>Math.min(30,r.widthM/2+14))continue;
      const lateral=(feature.x-px)*(-dz/seg.len)+(feature.z-pz)*(dx/seg.len),score=Math.abs(distanceM-r.widthM/2);
      const candidate={roadId:r.id,alongM:seg.cumStart+t*seg.len,side:(lateral<0?-1:1) as -1|1,distanceM,score};
      if(!candidates.has(r.id)||score<candidates.get(r.id)!.score)candidates.set(r.id,candidate);
    }
    const sorted=[...candidates.values()].sort((a,b)=>a.score-b.score||a.distanceM-b.distanceM||a.roadId.localeCompare(b.roadId)),best=sorted[0];
    if(!best){unmatched.push({featureId:feature.id,reason:'No nearby at-grade vehicle road'});continue;}
    const road=roads.roads.get(best.roadId)!;
    const competing=sorted[1];
    if(competing&&competing.score-best.score<1.5&&competing.distanceM-best.distanceM<1.5&&feature.kind!=='signal'){
      const other=roads.roads.get(competing.roadId)!;
      const sharesEnd=road.fromNode===other.fromNode||road.fromNode===other.toNode||road.toNode===other.fromNode||road.toNode===other.toNode;
      if(!sharesEnd){unmatched.push({featureId:feature.id,reason:'Ambiguous adjacent carriageways; retained at source coordinate'});continue;}
    }
    const directed=core.directed.filter(e=>e.roadId===road.id),both=feature.kind==='crossing'||feature.kind==='signal';
    const edgeIds=directed.filter(e=>both||road.oneway||e.forward===(best.side<0)).map(e=>e.id);
    if(!edgeIds.length){unmatched.push({featureId:feature.id,reason:'No legal approach on the mapped kerb side'});continue;}
    const match:TransportMatch={featureId:feature.id,roadId:road.id,alongM:best.alongM,side:best.side,edgeIds,distanceM:best.distanceM,status:'provisional'};
    if(feature.kind==='signal'){
      const near=core.junctions.map(j=>({j,n:nodes.get(j.nodeId)!})).filter(({n})=>n&&n.level===0&&Math.hypot(n.x-feature.x,n.z-feature.z)<=35).sort((a,b)=>Math.hypot(a.n.x-feature.x,a.n.z-feature.z)-Math.hypot(b.n.x-feature.x,b.n.z-feature.z));
      if(!near.length){unmatched.push({featureId:feature.id,reason:'Signal point has no nearby ground-level junction; no invented junction'});continue;}
      const nearest=near[0].n;
      match.junctionIds=near.filter(({n})=>Math.hypot(n.x-nearest.x,n.z-nearest.z)<=12).map(({j})=>j.id);
    }
    matches.push(match);
  }
  const signalled=new Set(matches.flatMap(m=>m.junctionIds??[]));
  return {...core,junctions:core.junctions.map(j=>signalled.has(j.id)?{...j,signalled:true}:j),transport:{...data,matches,unmatched}};
}

export function transportOf(core:WorldCore):MatchedTransport|undefined{return (core as TransportCore).transport;}

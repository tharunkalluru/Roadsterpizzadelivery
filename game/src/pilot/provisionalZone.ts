import type { SourcePlaceListingIndex } from '../world/sourceAccuracy';
import { NavGraph } from '../world/nav';
import { RoadIndex } from '../world/roadIndex';
import type { DeliveryLocation, Vec2, WorldCore } from '../world/schema';
import type { StreetSurveyData } from '../world/streetSurveyTypes';
import type { MissionDef } from '../missions/types';
import { isPizzaPickup, stopAlongOnEdge } from '../missions/catalog';
import type { PlayZone } from './playZone';
import type { WorldPhysics } from '../world/collision';

export interface ProvisionalZoneDefinition {
  schemaVersion: 1;
  id: string;
  label: string;
  surveyRevision: number;
  surveySha256: string;
  /** Saved source/canonical-boundary review, never a verified-coverage receipt. */
  scopeReceipt: string;
  limitations: string[];
  polygon: Vec2[];
  roadIds: string[];
  researchedRoadIds: string[];
  spawn: { x: number; z: number; heading: number; roadId: string };
  entrances: { deliveryId: string }[];
  jobs: { id: string; title: string; pickupId: string; stops: string[] }[];
  maxHeightM: number;
}

/** Explicitly provisional source-data preview. Does not call, weaken or populate PilotZone. */
export class ProvisionalZone implements PlayZone {
  readonly mode = 'provisional' as const;
  readonly nav: NavGraph;
  readonly missions: MissionDef[];
  private orientation: number;
  private roadIds: Set<string>;

  constructor(readonly definition: ProvisionalZoneDefinition, core: WorldCore, survey: StreetSurveyData, actualHash: string, listings: SourcePlaceListingIndex | null = null) {
    const d = definition;
    const check = (ok: unknown, why: string) => { if (!ok) throw new Error(`Provisional preview: ${why}`); };
    check(d.schemaVersion === 1 && !!d.id && !!d.label && !!d.scopeReceipt, 'missing bounded source scope');
    check(survey.revision === d.surveyRevision && /^[a-f0-9]{64}$/.test(d.surveySha256) && actualHash === d.surveySha256, 'survey pin mismatch');
    check(d.limitations.length > 0 && d.limitations.every(s => !!s.trim()), 'missing uncertainty labels');
    check(d.polygon.length >= 3 && d.polygon.every(p => p.length === 2 && p.every(Number.isFinite)), 'invalid polygon');
    const area = d.polygon.reduce((s,a,i) => { const b=d.polygon[(i+1)%d.polygon.length]; return s+a[0]*b[1]-a[1]*b[0]; },0);
    check(Math.abs(area)>1 && Number.isFinite(area), 'degenerate polygon'); this.orientation=Math.sign(area);
    for(let i=0;i<d.polygon.length;i++){
      const a=d.polygon[i],b=d.polygon[(i+1)%d.polygon.length];
      check(Math.hypot(b[0]-a[0],b[1]-a[1])>.01, 'duplicate boundary');
      check(d.polygon.every(p=>this.cross(a,b,p)>=-1e-7), 'boundary must be simple/convex');
    }
    check(Number.isFinite(d.maxHeightM) && d.maxHeightM>=2 && d.maxHeightM<=100, 'invalid height ceiling');
    this.roadIds=new Set(d.roadIds); check(this.roadIds.size>0 && this.roadIds.size===d.roadIds.length, 'empty/duplicate road list');
    for(const id of this.roadIds){
      const r=core.roads.find(r=>r.id===id);check(r,`unknown road ${id}`);
      check(r!.points.every(p=>this.contains(...p,r!.widthM/2+3)),`road envelope outside scope ${id}`);
    }
    check(d.researchedRoadIds.length>0 && d.researchedRoadIds.every(id=>this.roadIds.has(id) && (survey.storefrontOverrides.some(s=>s.roadId===id)||survey.observations.some(o=>o.roadId===id)||survey.roads.some(r=>r.roadId===id&&(r.left.reviewedRanges?.length||r.right.reviewedRanges?.length)))), 'researched-road label lacks saved evidence');
    const directed=core.directed.filter(e=>this.roadIds.has(e.roadId)),ids=new Set(directed.map(e=>e.id));
    this.nav=new NavGraph({...core,directed:directed.map(e=>({...e,next:e.next.filter(id=>ids.has(id))}))},new RoadIndex(core));
    check(directed.length>0 && this.nav.core_.size===directed.length, 'road set is not connected/returnable');
    check([d.spawn.x,d.spawn.z,d.spawn.heading].every(Number.isFinite) && this.roadIds.has(d.spawn.roadId) && this.allowsPose(d.spawn), 'invalid spawn');
    const start=this.nav.roads.surface(d.spawn.x,d.spawn.z,{preferRoadId:d.spawn.roadId,margin:0});check(start?.roadId===d.spawn.roadId,'spawn is not on declared road');
    const admitted=new Map<string,DeliveryLocation>();
    for(const entry of d.entrances){
      const stop=core.deliveries.find(s=>s.id===entry.deliveryId);check(stop && !admitted.has(entry.deliveryId),'unknown/duplicate source delivery');
      check(this.roadIds.has(stop!.roadId) && this.contains(...stop!.entrance) && stop!.stopPolygon.length>=3 && stop!.stopPolygon.every(p=>this.contains(...p,3)), 'source stop outside boundary');
      check(stop!.approachEdges.length>0 && stop!.approachEdges.every(id=>ids.has(id) && this.nav.edges.get(id)!.roadId===stop!.roadId), 'stop approach outside scope');
      const sourceListed = listings?.places.some(p=>p.frontageId===stop!.poiId && p.name===stop!.label && p.positionStatus==='source_listing' && p.sources.length>0 && p.licenses.length>0);
      check(!!stop!.poiId && (core.pois.some(p=>p.id===stop!.poiId)||sourceListed),'stop lacks source listing identity');
      admitted.set(entry.deliveryId,stop!);
    }
    check(d.jobs.length>0 && new Set(d.jobs.map(j=>j.id)).size===d.jobs.length,'empty/duplicate jobs');
    const from=this.nav.directedFor(start!,d.spawn.heading);
    const routingWorld={nav:this.nav,roads:this.nav.roads} as WorldPhysics;
    this.missions=d.jobs.map<MissionDef>((job,i)=>{
      check(job.stops.length>0 && admitted.has(job.pickupId) && job.stops.every(id=>id!==job.pickupId && admitted.has(id)), 'unbound job');
      check(isPizzaPickup(core,admitted.get(job.pickupId)!), 'pickup is not a source pizza listing');
      let edge=from.id,along=from.along,length=0;
      for(const id of [job.pickupId,...job.stops]){
        const stop=admitted.get(id)!;
        const passed=stop.approachEdges.includes(edge)&&along>stopAlongOnEdge(routingWorld,stop,edge);
        const route=this.nav.route(edge,stop.approachEdges,along,passed);check(route,'job disconnected inside boundary');
        length+=route!.lengthM;edge=route!.path.at(-1)!;along=stopAlongOnEdge(routingWorld,stop,edge);
      }
      return {id:`preview_${d.id}_${job.id}`,version:1,templates:['MT01'],title:job.title,brief:'Provisional map preview: select this pizza order, drive to collect it, then hand it over. Listings, entrances and dimensions are approximate.',pickupId:job.pickupId,stops:[...job.stops],flightSeconds:25,deadlineSeconds:Math.max(600,Math.ceil(length/2+120)),cargo:{label:'Test pizza',fragility:1,failThreshold:0},traffic:'light',seed:13300+i,deadlineBasis:'Provisional preview route, generous two metres/second planning pace plus interaction margin; not a real delivery-time claim.',routeLengthM:Math.round(length)};
    });
  }
  private cross(a:Vec2,b:Vec2,p:Vec2){return this.orientation*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));}
  contains(x:number,z:number,margin=0){return [x,z,margin].every(Number.isFinite)&&this.definition.polygon.every((a,i)=>{const b=this.definition.polygon[(i+1)%this.definition.polygon.length];return this.cross(a,b,[x,z])>=margin*Math.hypot(b[0]-a[0],b[1]-a[1])-1e-7;});}
  allowsPose(p:{x:number;z:number;y?:number;roadId?:string|null}){return this.contains(p.x,p.z,3)&&(p.y===undefined||Number.isFinite(p.y)&&p.y>=-1&&p.y<=this.definition.maxHeightM)&&(!p.roadId||this.roadIds.has(p.roadId));}
}

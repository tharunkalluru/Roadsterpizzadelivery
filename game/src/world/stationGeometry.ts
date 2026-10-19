/** Source exterior envelopes inform horizontal extents only. Heights, interiors and access remain provisional. */
import type {MetroStation,Vec2,WorldCore} from './schema';
import {metroAlignments,type MetroAlignment} from './metroGeometry';
export interface StationGeometryFeature {
 id:string;stationId:string;sourceElementId:string;sourceUrl:string;sourceUpdatedAt?:string;
 tags:Record<string,string>;footprint:Vec2[];centre:Vec2;lengthM:number;widthM:number;axis:Vec2;
 rectangularity:number;associationDistanceM:number;status:'source_mapped';dimensionStatus:'provisional';
 layoutStatus:'supported_envelope'|'requires_custom_layout';note:string;
}
export interface StationGeometryData {
 version:1;worldId:string;worldVersion:string;sourceSnapshot:string;snapshotSha256:string;
 license:string;attribution:string;sourceUrl:string;features:StationGeometryFeature[];
 unmatched:{sourceElementId:string;reason:string;[key:string]:unknown}[];limitations:string[];
 /** SHA of the exact fetched JSON, rather than a reserialized object. */
 contentSha256?:string;
}
export const FALLBACK_STATION_LENGTH_M=140,FALLBACK_STATION_WIDTH_M=22;
export interface StationLayout {
 stationId:string;alignment:MetroAlignment;alongM:number;x:number;z:number;tx:number;tz:number;
 lengthM:number;widthM:number;basis:'source_envelope'|'authored_fallback';horizontalStatus:'provisional';verticalStatus:'provisional';
 evidenceIds:string[];unappliedReason?:string;sourceFeatureId?:string;snapDistanceM?:number;orientationDifferenceRad?:number;
 clearancePortals:StationClearancePortal[];
}
/** Clearance gaps in authored lower bodies, inferred from an elevated vehicle carriageway, never surveyed architecture. */
export interface StationClearancePortal {x0:number;x1:number;z0:number;z1:number;bottom:number;top:number;roadIds:string[];status:'authored_clearance'}
function area(poly:Vec2[]):number {let v=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)v+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];return Math.abs(v)/2;}
const pair=(v:unknown):v is Vec2=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
export function validateStationGeometry(data:StationGeometryData):void {
 if(data.version!==1||!Array.isArray(data.features)||!Array.isArray(data.unmatched)||!Array.isArray(data.limitations)||!data.worldId||!data.worldVersion||!data.sourceSnapshot||!/^[a-f\d]{64}$/i.test(data.snapshotSha256)||data.license!=='ODbL-1.0'||!data.attribution||!/^https:\/\//.test(data.sourceUrl))throw new Error('Invalid station geometry layer');
 const ids=new Set<string>(),elements=new Set<string>();
 for(const f of data.features){
  if(!f.id||ids.has(f.id)||!f.stationId||!/^way\/\d+$/.test(f.sourceElementId)||elements.has(f.sourceElementId)||f.sourceUrl!==`https://www.openstreetmap.org/${f.sourceElementId}`||!f.tags||Object.values(f.tags).some(v=>typeof v!=='string')||!Array.isArray(f.footprint)||f.footprint.length<4||f.footprint.length>1000||f.footprint.some(p=>!pair(p))||!pair(f.centre)||!pair(f.axis)||![f.lengthM,f.widthM,f.rectangularity,f.associationDistanceM].every(Number.isFinite)||f.lengthM<20||f.lengthM>600||f.widthM<5||f.widthM>200||f.lengthM<f.widthM||f.associationDistanceM<0||f.rectangularity<=0||f.rectangularity>1.001||Math.abs(Math.hypot(...f.axis)-1)>.002||f.status!=='source_mapped'||f.dimensionStatus!=='provisional'||!['supported_envelope','requires_custom_layout'].includes(f.layoutStatus))throw new Error(`Invalid source station envelope ${f.id}`);
  const along=f.footprint.map(([x,z])=>x*f.axis[0]+z*f.axis[1]),across=f.footprint.map(([x,z])=>-x*f.axis[1]+z*f.axis[0]);
  const length=Math.max(...along)-Math.min(...along),width=Math.max(...across)-Math.min(...across);
  if(Math.abs(length-f.lengthM)>.12||Math.abs(width-f.widthM)>.12||Math.abs(area(f.footprint)/(length*width)-f.rectangularity)>.01)throw new Error(`Station envelope dimensions disagree with its source footprint: ${f.id}`);
  ids.add(f.id);elements.add(f.sourceElementId);
 }
 for(const e of data.unmatched)if(!e.sourceElementId||!e.reason)throw new Error('Invalid unapplied station evidence');
}
export async function loadStationGeometry(url='./research/station-geometry.json',signal?:AbortSignal):Promise<StationGeometryData|null>{
 const response=await fetch(url,{signal});if(response.status===404)return null;
 if(!response.ok)throw new Error(`Station geometry unavailable (${response.status})`);
 const raw=await response.text(),data=JSON.parse(raw) as StationGeometryData;validateStationGeometry(data);
 const hash=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(v=>v.toString(16).padStart(2,'0')).join(''):undefined;
 return{...data,...(hash?{contentSha256:hash}:{})};
}
export function attachStationGeometry<T extends WorldCore>(core:T,data:StationGeometryData):T {
 validateStationGeometry(data);
 if(data.worldId!=='hyd-metro'||data.worldVersion!==core.manifestVersion)throw new Error('Station geometry belongs to another world version');
 return{...core,stationGeometry:data};
}
function nearest(aligns:MetroAlignment[],x:number,z:number){
 let best:{alignment:MetroAlignment;alongM:number;x:number;z:number;tx:number;tz:number;distance:number}|null=null;
 for(const alignment of aligns)for(let i=1;i<alignment.samples.length;i++){
  const a=alignment.samples[i-1],b=alignment.samples[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<.001)continue;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(l*l))),px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(x-px,z-pz);
  if(!best||distance<best.distance)best={alignment,alongM:a.s+t*l,x:px,z:pz,tx:dx/l,tz:dz/l,distance};
 }
 return best;
}
function nonMetro(f:StationGeometryFeature):boolean {
 const text=[f.tags.network,f.tags.operator,f.tags.name,f.tags.railway].filter(Boolean).join(' ');
 return /\bmmts\b|south central railway|indian railways|hyderabad deccan|secunderabad junction|kacheguda railway/i.test(text);
}
/** The sole plan for render, pier exclusions, station access and collision. Never snap to another line. */
export function stationLayout(core:WorldCore,station:MetroStation,aligns=metroAlignments(core)):StationLayout|null {
 const matching=aligns.filter(a=>station.lines.includes(a.lineId)),fallback=nearest(matching,station.x,station.z);
 if(!fallback||fallback.distance>90||!station.inCorridor)return null;
 const evidence=core.stationGeometry?.features.filter(f=>f.stationId===station.id)??[];
 const base:StationLayout={stationId:station.id,alignment:fallback.alignment,alongM:fallback.alongM,x:fallback.x,z:fallback.z,tx:fallback.tx,tz:fallback.tz,lengthM:FALLBACK_STATION_LENGTH_M,widthM:FALLBACK_STATION_WIDTH_M,basis:'authored_fallback',horizontalStatus:'provisional',verticalStatus:'provisional',evidenceIds:evidence.map(f=>f.id),clearancePortals:[]};
 const finish=(p:StationLayout)=>({...p,clearancePortals:stationClearancePortals(core,p)});
 const reject=(reason:string)=>finish({...base,unappliedReason:reason});
 if(!evidence.length)return reject('No source envelope for this station');
 if(evidence.length!==1)return reject('Multiple source envelopes need manual reconciliation');
 const f=evidence[0];
 if(nonMetro(f))return reject('Mainline/MMTS evidence is not a metro station envelope');
 if(station.lines.length!==1||f.layoutStatus!=='supported_envelope')return reject('Interchange or irregular footprint requires a custom layout');
 if(f.lengthM<70||f.lengthM>210||f.widthM<14||f.widthM>36||f.rectangularity<.85)return reject('Source outline does not support the ordinary rectangular station template');
 const d=Math.hypot(f.centre[0]-station.x,f.centre[1]-station.z);
 if(d>50||Math.abs(d-f.associationDistanceM)>2)return reject('Source envelope and station marker association are inconsistent');
 const n=nearest(matching,...f.centre);if(!n||n.distance>Math.min(16,f.widthM*.7))return reject('Source envelope is too far from its own metro alignment');
 const angle=Math.acos(Math.min(1,Math.abs(f.axis[0]*n.tx+f.axis[1]*n.tz)));
 if(angle>Math.PI/9)return reject('Source envelope orientation conflicts with its metro alignment');
 // A straight rectangular template cannot safely span a strongly curving alignment.
 for(const p of n.alignment.samples)if(Math.abs(p.s-n.alongM)<f.lengthM/2&&Math.acos(Math.min(1,Math.abs(p.tx*n.tx+p.tz*n.tz)))>Math.PI/7)return reject('Alignment curvature requires a custom station layout');
 return finish({...base,alignment:n.alignment,alongM:n.alongM,x:n.x,z:n.z,tx:n.tx,tz:n.tz,lengthM:f.lengthM,widthM:f.widthM,basis:'source_envelope',sourceFeatureId:f.id,snapDistanceM:n.distance,orientationDifferenceRad:angle});
}
export function stationGeometrySummary(core:WorldCore){
 const aligns=metroAlignments(core),plans=core.stations.map(s=>({station:s,plan:stationLayout(core,s,aligns)}));
 return{sourceEnvelopes:core.stationGeometry?.features.length??0,applied:plans.filter(p=>p.plan?.basis==='source_envelope').map(p=>({stationId:p.station.id,sourceFeatureId:p.plan!.sourceFeatureId,lengthM:p.plan!.lengthM,widthM:p.plan!.widthM,snapDistanceM:p.plan!.snapDistanceM})),unapplied:(core.stationGeometry?.features??[]).filter(f=>!plans.some(p=>p.plan?.sourceFeatureId===f.id)).map(f=>({featureId:f.id,stationId:f.stationId,reason:plans.find(p=>p.station.id===f.stationId)?.plan?.unappliedReason??'No matching visible metro station alignment'})),unmatched:core.stationGeometry?.unmatched.length??0};
}

export function stationClearancePortals(core:WorldCore,p:Pick<StationLayout,'x'|'z'|'tx'|'tz'|'widthM'>):StationClearancePortal[]{
 const hw=p.widthM/2+.5,hl=39.6,H=core.metro.deckHeightM,byRoad=new Map<string,StationClearancePortal>();
 const local=(x:number,z:number)=>{const dx=x-p.x,dz=z-p.z;return[-p.tz*dx+p.tx*dz,-p.tx*dx-p.tz*dz];};
 for(const road of core.roads){
  if(road.tunnel||Math.max(road.elevationM,...road.pointElevM)<1)continue;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.001)continue;
   const ya=road.pointElevM[i-1]??road.elevationM,yb=road.pointElevM[i]??road.elevationM;
   if(Math.min(ya,yb)>H-1.5||Math.max(ya,yb)+3.9<H-5.4)continue;
   const corners=[-1,1].flatMap(side=>[a,b].map(v=>local(v[0]-dz/len*side*(road.widthM/2+1),v[1]+dx/len*side*(road.widthM/2+1))));
   const x0=Math.max(-hw,Math.min(...corners.map(v=>v[0]))),x1=Math.min(hw,Math.max(...corners.map(v=>v[0]))),z0=Math.max(-hl,Math.min(...corners.map(v=>v[1]))),z1=Math.min(hl,Math.max(...corners.map(v=>v[1])));
   if(x1<=x0||z1<=z0)continue;
   const portal:StationClearancePortal={x0,x1,z0,z1,bottom:Math.min(ya,yb)-.2,top:Math.max(ya,yb)+3.9,roadIds:[road.id],status:'authored_clearance'},old=byRoad.get(road.id);
   if(old){old.x0=Math.min(old.x0,x0);old.x1=Math.max(old.x1,x1);old.z0=Math.min(old.z0,z0);old.z1=Math.max(old.z1,z1);old.bottom=Math.min(old.bottom,portal.bottom);old.top=Math.max(old.top,portal.top);}else byRoad.set(road.id,portal);
  }
 }
 return [...byRoad.values()];
}

/** Authored component dimensions, shared unchanged by the model and its solid bodies. */
export interface StationBodyBox {id:string;material:'concrete'|'glass'|'steel';x:number;z:number;width:number;length:number;bottom:number;top:number}
export function stationBodyBoxes(L:number,W:number,H:number,trackX:number,portals:StationClearancePortal[]=[]):StationBodyBox[]{
 const hw=W/2,pIn=trackX+1.5,bodyTop=H-1.5,bodyBot=H-5.4,bodyL=78,out:StationBodyBox[]=[];
 const box=(id:string,material:StationBodyBox['material'],x:number,z:number,width:number,length:number,bottom:number,top:number)=>out.push({id,material,x,z,width,length,bottom,top});
 for(const side of [-1,1])box(`platform:${side}`,'concrete',side*(pIn+hw-.4)/2,0,hw-.4-pIn,L,H-1.5,H+.9);
 box('concourse:floor','concrete',0,0,W-.4,bodyL,bodyBot,bodyBot+.7);
 box('concourse:ceiling','concrete',0,0,W-.4,bodyL,bodyTop-.5,bodyTop);
 for(const side of [-1,1]){
  const x=side*(hw-.25);
  box(`concourse:glass:${side}`,'glass',x,0,.12,bodyL-4,bodyBot+.8,bodyTop-.8);
  for(let z=-bodyL/2;z<=bodyL/2+.01;z+=6.5)box(`concourse:mullion:${side}:${z}`,'steel',x,z,.35,.35,bodyBot,bodyTop);
  box(`concourse:rail:${side}`,'steel',x,0,.35,bodyL,bodyTop-1.05,bodyTop-.75);
 }
 for(const end of [-1,1])box(`concourse:end:${end}`,'concrete',0,end*bodyL/2,W-.4,.5,bodyBot,bodyTop);
 let pieces=out;
 for(const p of portals)pieces=pieces.flatMap(b=>{
  const bx0=b.x-b.width/2,bx1=b.x+b.width/2,bz0=b.z-b.length/2,bz1=b.z+b.length/2,x0=Math.max(bx0,p.x0),x1=Math.min(bx1,p.x1),z0=Math.max(bz0,p.z0),z1=Math.min(bz1,p.z1),y0=Math.max(b.bottom,p.bottom),y1=Math.min(b.top,p.top);
  if(x1<=x0||z1<=z0||y1<=y0)return[b];
  const result:StationBodyBox[]=[];
  const part=(lx:number,rx:number,lz:number,rz:number,bottom:number,top:number)=>{if(rx-lx>.001&&rz-lz>.001&&top-bottom>.001)result.push({...b,id:`${b.id}:portal:${p.roadIds.join('+')}:${result.length}`,x:(lx+rx)/2,z:(lz+rz)/2,width:rx-lx,length:rz-lz,bottom,top});};
  part(bx0,x0,bz0,bz1,b.bottom,b.top);part(x1,bx1,bz0,bz1,b.bottom,b.top);
  part(x0,x1,bz0,z0,b.bottom,b.top);part(x0,x1,z1,bz1,b.bottom,b.top);
  part(x0,x1,z0,z1,b.bottom,y0);part(x0,x1,z0,z1,y1,b.top);
  return result;
 });
 return pieces;
}
export function stationRoofProfile(W:number,H:number):Vec2[]{
 return Array.from({length:15},(_,i)=>{const x=-W/2-1.2+i/14*(W+2.4),u=x/(W/2+1.2);return[x,H+4.6+2.2*(1-u*u)];});
}
/** Thin conservative shell bands follow the same 14-segment profile as the visible roof.
 * Their <=.35m lateral width bounds the local-height approximation instead of filling the air below. */
export function stationRoofObstacles(L:number,W:number,H:number):StationBodyBox[]{
 const profile=stationRoofProfile(W,H),out:StationBodyBox[]=[];
 for(let i=1;i<profile.length;i++){
  const a=profile[i-1],b=profile[i],n=Math.ceil((b[0]-a[0])/.35);
  for(let j=0;j<n;j++){
   const x0=a[0]+(b[0]-a[0])*j/n,x1=a[0]+(b[0]-a[0])*(j+1)/n,y0=a[1]+(b[1]-a[1])*j/n,y1=a[1]+(b[1]-a[1])*(j+1)/n;
   out.push({id:`roof:${i}:${j}`,material:'concrete',x:(x0+x1)/2,z:0,width:x1-x0,length:L,bottom:Math.min(y0,y1)-.35,top:Math.max(y0,y1)});
  }
 }
 return out;
}

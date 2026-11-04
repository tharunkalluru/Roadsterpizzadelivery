import type { VerifiedSourceRoadGeometry } from '../../src/world/road-source-geodesic';

/** Final inference uses the corrected source's length coordinates. Historical
 * triangles use the immutable former edge's coordinates. Convert explicitly;
 * a repaired cut may legitimately extend before0 or beyond the old edge end. */
export function legacyRoadReference(data:VerifiedSourceRoadGeometry){
  const repairs=new Map(data.roads.map(road=>[road.id,road]));
  return(roadID:string,correctedDistance:number)=>{
    if(!Number.isFinite(correctedDistance))throw Error(`Invalid corrected source distance: ${roadID}`);
    const road=repairs.get(roadID);if(!road)return correctedDistance;
    const arc=road.correctedArc,old=road.sourceArc;
    if(correctedDistance<arc[0]-1e-7||correctedDistance>arc.at(-1)!+1e-7)throw Error(`Corrected source distance lies outside its bound edge: ${roadID}`);
    // Only compensate harmless arithmetic at the corrected domain boundary;
    // never clamp the resulting historical coordinate to the old interval.
    const distance=Math.max(arc[0],Math.min(arc.at(-1)!,correctedDistance));
    let i=1;while(i<arc.length-1&&arc[i]<distance)i++;
    const u=(distance-arc[i-1])/(arc[i]-arc[i-1]);
    return old[i-1]+u*(old[i]-old[i-1]);
  };
}

export interface GeographicSourceReference {
  version:1;kind:'verified-overture-geographic-source-reference';generationID:string;sourceDataSHA256:string;sourceCorePackSHA256:string;
  policy:{maximumProjectionErrorM:number;distinctBranchAmbiguityM:number;legacyPointFractionsUsed:boolean;legacyHeightsUsed:boolean};
  roads:{id:string;sourceSegmentID:string;legacyArc:number[];legacyOfficialMetres:number[];projectionErrors:number[];correctedArc:number[];correctedOfficialMetres:number[]}[];
  unresolved:{id:string;reason:string}[];
}
export interface GeographicRoadReference {id:string;arc:[number,number]}
const increasing=(values:number[])=>Array.isArray(values)&&values.length>=2&&values.every((v,i)=>Number.isFinite(v)&&(!i||v>values[i-1]));
function interpolate(at:number,x:number[],y:number[],id:string){
  if(!Number.isFinite(at)||at<x[0]-1e-7||at>x.at(-1)!+1e-7)throw Error(`Geographic reference lies outside its bound edge: ${id}`);
  const distance=Math.max(x[0],Math.min(x.at(-1)!,at));let i=1;while(i<x.length-1&&x[i]<distance)i++;
  return y[i-1]+(y[i]-y[i-1])*(distance-x[i-1])/(x[i]-x[i-1]);
}

/** A source-family alias requires a full retained Overture UUID and an exact
 * geographic historical reference artifact. Shared names/prefixes, inherited
 * height fractions and missing siblings never establish correspondence. */
export function geographicRoadReferences(data:VerifiedSourceRoadGeometry,reference:GeographicSourceReference,dataSHA256:string){
  if(reference.version!==1||reference.kind!=='verified-overture-geographic-source-reference'||reference.generationID!==data.generationID||
    reference.sourceDataSHA256!==dataSHA256||reference.sourceCorePackSHA256!==data.sourceCorePackSHA256||
    reference.policy?.legacyPointFractionsUsed!==false||reference.policy?.legacyHeightsUsed!==false||
    reference.policy.maximumProjectionErrorM!==.075||reference.policy.distinctBranchAmbiguityM!==.15)throw Error('Unbound geographic source-reference artifact');
  const patches=new Map(data.roads.map(p=>[p.id,p])),sources=new Map(data.sources.map(s=>[s.id,s])),records=new Map(reference.roads.map(r=>[r.id,r]));
  const inventory=[...reference.roads.map(r=>r.id),...reference.unresolved.map(r=>r.id)];
  if(records.size!==reference.roads.length||new Set(inventory).size!==inventory.length||inventory.length!==patches.size||inventory.some(id=>!patches.has(id)))throw Error('Incomplete or duplicate geographic source-reference inventory');
  for(const record of records.values()){
    const patch=patches.get(record.id)!,source=sources.get(patch.sourceSegmentID)!;
    if(record.sourceSegmentID!==patch.sourceSegmentID||!increasing(record.legacyArc)||!increasing(record.legacyOfficialMetres)||
      !increasing(record.correctedArc)||!increasing(record.correctedOfficialMetres)||record.legacyArc.length!==patch.expected.pts.length||
      record.legacyOfficialMetres.length!==record.legacyArc.length||record.projectionErrors.length!==record.legacyArc.length||
      record.projectionErrors.some(e=>!Number.isFinite(e)||e<0||e>.075)||JSON.stringify(record.correctedArc)!==JSON.stringify(patch.correctedArc)||
      JSON.stringify(record.correctedOfficialMetres)!==JSON.stringify(patch.sourceFractions.map(f=>f*source.geodeticLengthM)))throw Error(`Unbound geographic source-reference road: ${record.id}`);
    let distance=0;
    for(let i=0;i<patch.expected.pts.length;i++){
      if(i)distance+=Math.hypot(patch.expected.pts[i][0]-patch.expected.pts[i-1][0],patch.expected.pts[i][1]-patch.expected.pts[i-1][1]);
      if(Math.abs(record.legacyArc[i]-distance)>1e-7)throw Error(`Historical reference arclength changed: ${record.id}`);
    }
    if(Math.abs(record.legacyOfficialMetres[0]-patch.cuts.actualBefore[0]*source.geodeticLengthM)>1e-7||
      Math.abs(record.legacyOfficialMetres.at(-1)!-patch.cuts.actualBefore[1]*source.geodeticLengthM)>1e-7)throw Error(`Historical source cut uses declared/inherited fractions: ${record.id}`);
  }
  const segment=(id:string,range:[number,number],corrected:boolean):GeographicRoadReference|undefined=>{
    const record=records.get(id);if(!record)return;
    const x=corrected?record.correctedArc:record.legacyArc,y=corrected?record.correctedOfficialMetres:record.legacyOfficialMetres;
    return{id:record.sourceSegmentID,arc:[interpolate(range[0],x,y,id),interpolate(range[1],x,y,id)]};
  };
  return{historical:(id:string,range:[number,number])=>segment(id,range,false),corrected:(id:string,range:[number,number])=>segment(id,range,true),unresolved:reference.unresolved};
}

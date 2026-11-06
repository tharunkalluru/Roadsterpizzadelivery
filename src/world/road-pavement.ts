import type { RoadEdge } from './types';

/** The source estimate is retained for conservative furniture clearance. */
export const roadClearanceWidth = (e: RoadEdge) => Math.max(e.w, e.joinedPavement?.physicalWidth || 0, e.joinedPavement?.originalWidth || 0, e.joinedPavement?.sourceWidth || 0, e.sceneryWidth || 0);
const sceneryCorridors = new WeakMap<RoadEdge, readonly RoadEdge[]>();
/** Moving modeled pavement must not expose a former pier/facade site. The old
 * prepared corridor participates only in exclusion, never road support/render. */
export function roadSceneryCorridors(e: RoadEdge): readonly RoadEdge[] {
  const cached = sceneryCorridors.get(e); if (cached) return cached;
  const source = e.scenerySource;
  const corridors = source ? [e, { ...e, pts: source.pts, elev: source.elev, w: source.width, sceneryWidth: source.width,
    joinedPavement: undefined, sourceLaneIntervals: undefined, scenerySource: undefined, expressway: undefined }] : [e];
  sceneryCorridors.set(e, corridors); return corridors;
}
/** Structural caps retain the source span, rather than an exclusion margin. */
export const roadSupportWidth = (e: RoadEdge) => Math.max(e.w, e.joinedPavement?.physicalWidth || 0, e.joinedPavement?.sourceWidth || 0);
/** Keep old furniture exclusions when an estimated hump is later flattened. */
export function retainRaisedRoadExclusions(roads: RoadEdge[]) {
  return roads.map(e => e.elev?.some(y => y > 1.2) && e.w < 8.4 && (e.sceneryWidth || 0) < 8.4 ? { ...e, sceneryWidth: 8.4 } : e);
}
const singleLaneEvidence = new WeakMap<RoadEdge, boolean>();
/** Packed lane counts are class defaults. Remove the legacy floor only when
 * exact one-way source intervals cover the whole edge (10 cm source rounding). */
export function hasDeclaredSingleLane(e: RoadEdge) {
  const cached = singleLaneEvidence.get(e); if(cached!==undefined)return cached;
  let valid = !!e.oneway && e.lanes === 1 && !!e.sourceLaneIntervals?.length;
  if(valid){
    const intervals=[...e.sourceLaneIntervals!].sort((a,b)=>a.from-b.from);let end=0;
    for(const s of intervals){if(!s.oneway||s.lanes!==1||s.from>end+.1){valid=false;break;}end=Math.max(end,s.to);}
    const length=e.pts.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-e.pts[i][0],p[1]-e.pts[i][1]),0);
    valid=valid&&end>=length-.1;
  }
  singleLaneEvidence.set(e,valid);return valid;
}
export function roadPavementWidth(e: RoadEdge, distance: number) {
  const profile = e.joinedPavement;
  if (!profile) return e.elev?.some(y => y > 1.2) && (e.expressway || !hasDeclaredSingleLane(e)) ? Math.max(e.w, 8.4) : e.w;
  let away = Infinity;
  for (const [a, b] of profile.intervals) away = Math.min(away, distance < a ? a - distance : distance > b ? distance - b : 0);
  const u = Math.max(0, Math.min(1, away / profile.taper));
  const physicalWidth = profile.physicalWidth ?? e.w;
  return physicalWidth + (profile.originalWidth - physicalWidth) * u * u * (3 - 2 * u);
}
export function roadPavementWidthAt(e:RoadEdge,x:number,z:number){
  if(!e.joinedPavement)return roadPavementWidth(e,0);
  let distance=0,along=0,best=Infinity;
  for(let i=1;i<e.pts.length;i++){const a=e.pts[i-1],b=e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(length*length||1))),d=Math.hypot(x-a[0]-dx*u,z-a[1]-dz*u);if(d<best){best=d;along=distance+length*u;}distance+=length;}
  return roadPavementWidth(e,along);
}
/** New capacity profiles size the actual cap to the local paved span. */
export const roadSupportWidthAt = (e: RoadEdge, x: number, z: number) => e.joinedPavement?.usableLanes ? roadPavementWidthAt(e,x,z) : roadSupportWidth(e);
/** Tagged one-way capacities are local; untagged spans retain the modeled
 * source count. The conservative NPC minimum does not repaint unknown spans. */
export function roadPavementLanes(e: RoadEdge, distance: number) {
  const tagged = (e.sourceLaneIntervals || []).filter(s => s.oneway && distance >= s.from - 1e-6 && distance <= s.to + 1e-6).map(s => s.lanes);
  return tagged.length ? Math.max(...tagged) : e.lanes;
}

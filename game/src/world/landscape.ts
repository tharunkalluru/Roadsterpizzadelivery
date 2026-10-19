/** Factual source polygons; flat rendered elevations remain explicit assumptions. */
import type { Vec2, WorldCore } from './schema';
export interface LandscapePart {footprint:Vec2[];holes:Vec2[][];centroid:Vec2;areaM2:number}
export interface LandscapeFeature {
  id:string;kind:'water'|'land_use';name:string|null;class:string|null;subtype:string|null;
  sourceIds:string[];sources:{dataset?:string;recordId?:string;license?:string;updateTime?:string}[];
  parts:LandscapePart[];geometryStatus:'source_derived';elevationStatus:'unknown';notes:string;
}
export interface LandscapeData {version:1;worldId:string;worldVersion:string;sourceSnapshot:string;summary:Record<string,number>;features:LandscapeFeature[];unresolved?:{id:string;kind:string;geometryType:string;name:string|null;sourceIds:string[];reason:string}[];limitations:string[]}
type LandscapeCore=WorldCore&{sourceLandscape?:LandscapeData};
export function validateLandscape(data:LandscapeData):void {
  if(data.version!==1||!Array.isArray(data.features))throw new Error('Invalid landscape layer');
  const ids=new Set<string>();
  for(const f of data.features){
    if(!f.id||ids.has(f.id)||!['water','land_use'].includes(f.kind)||f.geometryStatus!=='source_derived'||f.elevationStatus!=='unknown'||!f.sourceIds.length||!f.sources.length||!f.parts.length)throw new Error(`Invalid sourced landscape ${f.id}`);
    for(const p of f.parts){
      if(!Number.isFinite(p.areaM2)||p.areaM2<=0||!p.centroid.every(Number.isFinite)||p.footprint.length<3||[p.footprint,...p.holes].some(r=>r.length<3||r.some(v=>v.length!==2||!v.every(Number.isFinite))))throw new Error(`Invalid landscape polygon ${f.id}`);
    }ids.add(f.id);
  }
}
export async function loadLandscape(url='./research/landscape.json',signal?:AbortSignal):Promise<LandscapeData|null>{
  const response=await fetch(url,{signal});if(response.status===404)return null;
  if(!response.ok)throw new Error(`Landscape data unavailable (${response.status})`);
  const data=await response.json()as LandscapeData;validateLandscape(data);return data;
}
export function attachLandscape(core:WorldCore,data:LandscapeData):void {
  if(data.worldId!=='hyd-metro'||data.worldVersion!==core.manifestVersion)throw new Error('Landscape data belongs to another world version');
  validateLandscape(data);(core as LandscapeCore).sourceLandscape=data;
}
export function landscapeOf(core:WorldCore):LandscapeData|undefined{return(core as LandscapeCore).sourceLandscape;}

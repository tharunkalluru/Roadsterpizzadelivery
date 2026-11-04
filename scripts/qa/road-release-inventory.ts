import type { RoadEdge,XZ } from '../../src/world/types';
import type { TriangleRecord } from './road-release-finite';

export interface PhysicalRoadFootprint {id:string;L:XZ[];R:XZ[]}
export interface TileRoadReleaseModel {
  schemaVersion:1;sourceCoreSHA256:string;revision?:string;sourceModelSHA256?:string;sourceRoadGeometryGeneration?:string;
  requestedRoadIDs:string[];includedCoreRoadIDs?:string[];includedCoreNotRendered?:string[];includedCoreWithoutRawTileCopy?:string[];roads:RoadEdge[];physicalFootprints:PhysicalRoadFootprint[];
  triangles?:TriangleRecord[];sourcePackSHA256:Record<string,string>;
  copies:{id:string;tile:string;pack:string;context:boolean;physicalSHA256:string;footprintSHA256:string}[];
  unmatched:unknown[];inputDisagreements:unknown[];footprintVariants:unknown[];requestedNotRendered:string[];
}
export const physicalRoad=(e:RoadEdge)=>({id:e.id,cls:e.cls,pts:e.pts,elev:e.elev??null,w:e.w,from:e.from??null,to:e.to??null,oneway:e.oneway??null,
  joinedPavement:e.joinedPavement??null,scenerySource:e.scenerySource??null});

/** Preserve the globally prepared core and exact actual tile-only inventory.
 * Compressed context copies may omit lane/label fields, but cannot disagree
 * about the physical surface, source topology or inferred pavement shape. */
export function unionPhysicalRoads(core:RoadEdge[],tile:TileRoadReleaseModel){
  if(tile.schemaVersion!==1||!Array.isArray(tile.roads)||!Array.isArray(tile.physicalFootprints)||!Array.isArray(tile.copies)||
    !Array.isArray(tile.requestedRoadIDs)||new Set(tile.requestedRoadIDs).size!==tile.requestedRoadIDs.length||
    ![tile.unmatched,tile.inputDisagreements,tile.footprintVariants,tile.requestedNotRendered,...(tile.includedCoreRoadIDs?[tile.includedCoreNotRendered,tile.includedCoreWithoutRawTileCopy]:[])].every(a=>Array.isArray(a)&&a.length===0))throw Error('Tile inventory is missing or has unresolved actual geometry');
  const roads=new Map(core.map(e=>[e.id,e]));if(roads.size!==core.length)throw Error('Duplicate core road inventory');
  const local=new Set<string>(),footprints=new Map<string,PhysicalRoadFootprint>();
  for(const e of tile.roads){
    if(local.has(e.id))throw Error(`Duplicate tile road inventory: ${e.id}`);local.add(e.id);
    const prior=roads.get(e.id);if(prior&&JSON.stringify(physicalRoad(prior))!==JSON.stringify(physicalRoad(e)))throw Error(`Core/tile physical road disagreement: ${e.id}`);
    if(!prior)roads.set(e.id,e);
  }
  for(const footprint of tile.physicalFootprints){
    const e=roads.get(footprint.id);
    if(!local.has(footprint.id)||footprints.has(footprint.id)||!e||footprint.L.length!==e.pts.length||footprint.R.length!==e.pts.length||
      [...footprint.L,...footprint.R].some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error(`Invalid actual tile footprint inventory: ${footprint.id}`);
    footprints.set(footprint.id,footprint);
  }
  if(footprints.size!==local.size||tile.requestedRoadIDs.some(id=>!local.has(id)||!tile.copies.some(copy=>copy.id===id&&!copy.context)))throw Error('Incomplete actual tile footprint/requested-owner inventory');
  return{roads:[...roads.values()],byId:roads,footprints,localIDs:local};
}

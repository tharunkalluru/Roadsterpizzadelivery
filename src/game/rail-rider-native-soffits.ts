/** Match road slab candidates to the literal emitted structure triangles.
 * A junction cap is not silently given a fictitious .9m slab. Missing matches
 * remain unknown at that finite source quad rather than becoming clear space. */
import type { RoadEdge } from '../world/types';
import type { Surface,TileBuilt } from '../world/city';
import { roadRibbon } from '../world/bridge-clearance';
import type { NativeSoffit,RiderGeometry,RiderPoint } from './rail-rider-clearance';
import { sweptDiskTriangle } from './rail-rider-clearance';

const THICKNESS=.9;
const key=(points:readonly (readonly number[])[])=>points.map(p=>p.map(Math.fround).join(',')).sort().join('|');
export interface NativeSoffitTile {
  readonly key:string;readonly revision:string;
  readonly slabs:readonly NativeSoffit[];
  readonly unknown:readonly {road:string;segment:number;quad:readonly (readonly [number,number,number])[]}[];
  readonly structureTrianglesInspected:number;
  readonly cells:ReadonlyMap<string,readonly NativeSoffit[]>;
}
export function* prepareNativeSoffitTileSteps(tile:TileBuilt,revision:string):Generator<void,NativeSoffitTile,void> {
  if(!revision)throw Error('Explicit native geometry revision required');
  yield; // Cancelling a newly queued tile never starts a partial structure scan.
  const surfaces=new Set<Surface>();for(const rows of tile.surfaceGrid.values())for(const s of rows)surfaces.add(s);
  const roads=[...new Set([...surfaces].flatMap(s=>s.e?[s.e]:[]))];
  const segments=new Map<RoadEdge,Set<number>>();
  const lifts=new Map<RoadEdge,Map<number,number>>();let work=0;
  for(const s of surfaces){
    if((++work&255)===0)yield;
    if(s.kind!=='road'||!s.e||!s.roadQuad||s.i<0||s.i+1>=s.e.pts.length)continue;
    if(!(s.e.elev?.[s.i]>1.2||s.e.elev?.[s.i+1]>1.2))continue;
    if(!segments.has(s.e))segments.set(s.e,new Set());segments.get(s.e)!.add(s.i);
    if(!lifts.has(s.e))lifts.set(s.e,new Map());const m=lifts.get(s.e)!;m.set(s.i,Math.max(m.get(s.i)??0,s.paintLift??0));
  }
  const candidates:{road:RoadEdge;segment:number;quad:ReturnType<typeof roadRibbon>['quads'][number];lift:number;keys:string[]}[]=[],wanted=new Set<string>();
  let low=Infinity,high=-Infinity;
  for(const [road,indices]of segments){
    const ribbon=roadRibbon(road,roads);
    for(const segment of indices){
      if((++work&31)===0)yield;
      const q=ribbon.quads[segment];
      const lift=lifts.get(road)!.get(segment)??0;
      // City writes the soffit as L0,L1,R1,R0; its diagonal differs from
      // asphalt's R0,R1,L1,L0. Match the actual slab operation order.
      const keys=[[3,2,1],[3,1,0]].map(ix=>key(ix.map(i=>[q[i][0],q[i][1]-THICKNESS,q[i][2]])));
      for(const k of keys)wanted.add(k);for(const p of q){low=Math.min(low,Math.fround(p[1]-THICKNESS));high=Math.max(high,Math.fround(p[1]-THICKNESS));}
      candidates.push({road,segment,quad:q,lift,keys});
    }
  }
  // Keep only actual triangles for the finite candidate slabs, not every city
  // structure face. Flat tiles do no structure scan; a complete match stops
  // early. This cold tile work is never repeated by the frame controller.
  const actual=new Map<string,[number,number,number][]>();let triangles=0;
  if(wanted.size)scan:for(const buffer of tile.buffers){
    if(buffer.mat!=='st')continue;
    if(!(buffer.pos instanceof Float32Array)||buffer.pos.length%9)throw Error('Literal native Float32 structures required');
    for(let i=0;i<buffer.pos.length;i+=9){
      if((++work&127)===0)yield;
      triangles++;
      if(buffer.pos[i+1]<low||buffer.pos[i+1]>high||buffer.pos[i+4]<low||buffer.pos[i+4]>high||buffer.pos[i+7]<low||buffer.pos[i+7]>high)continue;
      const p:[number,number,number][]=[[buffer.pos[i],buffer.pos[i+1],buffer.pos[i+2]],[buffer.pos[i+3],buffer.pos[i+4],buffer.pos[i+5]],[buffer.pos[i+6],buffer.pos[i+7],buffer.pos[i+8]]],k=key(p);
      if(wanted.has(k))actual.set(k,p);if(actual.size===wanted.size)break scan;
    }
  }
  const slabs:NativeSoffit[]=[],unknown:NativeSoffitTile['unknown'][number][]=[],seen=new Set<string>();
  for(const {road,segment,quad:q,lift,keys}of candidates){
      if((++work&31)===0)yield;
      const matches:NativeSoffit[]=[];
      for(const [ordinal,k]of keys.entries()){
        const triangle=actual.get(k);
        if(triangle)matches.push(Object.freeze({id:`${tile.key}:${road.id}:${segment}:${ordinal}`,road:road.id,segment,
          triangle:Object.freeze(triangle.map(p=>Object.freeze(p.slice()as[number,number,number]))),deckTop:Math.max(...q.map(p=>p[1]))+lift,geometryRevision:revision}));
      }
      if(matches.length===2){for(const m of matches){const k=key(m.triangle);if(!seen.has(k)){seen.add(k);slabs.push(m);}}}
      else unknown.push(Object.freeze({road:road.id,segment,quad:Object.freeze(q.map(p=>Object.freeze(p.slice()as[number,number,number])))}));
  }
  const cells=new Map<string,NativeSoffit[]>();
  for(const slab of slabs){
    if((++work&63)===0)yield;
    const x=slab.triangle.map(p=>p[0]),z=slab.triangle.map(p=>p[2]);
    for(let i=Math.floor(Math.min(...x)/50);i<=Math.floor(Math.max(...x)/50);i++)for(let j=Math.floor(Math.min(...z)/50);j<=Math.floor(Math.max(...z)/50);j++){
      const k=`${i}_${j}`;if(!cells.has(k))cells.set(k,[]);cells.get(k)!.push(slab);
    }
  }
  return Object.freeze({key:tile.key,revision,slabs:Object.freeze(slabs),unknown:Object.freeze(unknown),structureTrianglesInspected:triangles,cells});
}
export function prepareNativeSoffitTile(tile:TileBuilt,revision:string):NativeSoffitTile {
  const steps=prepareNativeSoffitTileSteps(tile,revision);
  for(;;){const next=steps.next();if(next.done)return next.value;}
}

/** Explicit loaded-domain snapshot. Caller replaces the snapshot on tile or
 * fitted-identity changes; stale triangle revisions never enter queries. */
export class LoadedNativeSoffits implements RiderGeometry {
  readonly tiles:ReadonlyMap<string,NativeSoffitTile>;
  private readonly empty:ReadonlySet<string>;
  constructor(readonly revision:string,tiles:Iterable<NativeSoffitTile>,knownEmpty:Iterable<string>=[]){
    const map=new Map<string,NativeSoffitTile>();for(const tile of tiles){
      if(tile.revision!==revision||map.has(tile.key))throw Error('Mixed native soffit tile snapshot');map.set(tile.key,tile);
    }this.tiles=map;this.empty=new Set(knownEmpty);
  }
  private keys(a:RiderPoint,b:RiderPoint,r:number){
    const result:string[]=[];for(let i=Math.floor((Math.min(a.x,b.x)-r)/1000);i<=Math.floor((Math.max(a.x,b.x)+r)/1000);i++)for(let j=Math.floor((Math.min(a.z,b.z)-r)/1000);j<=Math.floor((Math.max(a.z,b.z)+r)/1000);j++)result.push(`${i}_${j}`);return result;
  }
  known(a:RiderPoint,b:RiderPoint,radius:number){
    for(const k of this.keys(a,b,radius)){
      const tile=this.tiles.get(k);if(!tile){if(this.empty.has(k))continue;return false;}
    }
    for(const tile of this.tiles.values())for(const missing of tile.unknown)for(const ix of[[0,1,2],[0,2,3]])if(sweptDiskTriangle(a,b,radius,ix.map(i=>missing.quad[i])))return false;
    return true;
  }
  near(a:RiderPoint,b:RiderPoint,radius:number){
    const found=new Set<NativeSoffit>();
    for(let i=Math.floor((Math.min(a.x,b.x)-radius)/50);i<=Math.floor((Math.max(a.x,b.x)+radius)/50);i++)for(let j=Math.floor((Math.min(a.z,b.z)-radius)/50);j<=Math.floor((Math.max(a.z,b.z)+radius)/50);j++)for(const tile of this.tiles.values())for(const slab of tile.cells.get(`${i}_${j}`)??[])found.add(slab);
    return[...found];
  }
}

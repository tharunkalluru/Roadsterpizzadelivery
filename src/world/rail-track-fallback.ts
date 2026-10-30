import * as THREE from 'three';
import { Batch } from '../core/util';
import { drawExtras } from './extras';
import type { makeRailwayNetwork, RailProfile } from './railway-geometry';

type Network = ReturnType<typeof makeRailwayNetwork>;
type LoadedTiles = ReadonlyMap<string, unknown> | ReadonlySet<string>;
interface Point { x:number; z:number }
interface Chunk { group:THREE.Group; used:number }

const TILE=1000, CHUNK=250, CACHE_LIMIT=64, ACTIVE_LIMIT=48, RADIUS=220;
const key=(x:number,z:number)=>`${Math.floor(x/CHUNK)}_${Math.floor(z/CHUNK)}`;

/** Track-only scenery is independent of city-pack availability. It uses the
 * same canonical renderer and midpoint ownership as the normal city tiles,
 * subdivided into250mchunks for smaller cold geometry batches.
 * A loaded city tile always wins, so rail meshes never double up. */
export class RailTrackFallback {
  readonly group=new THREE.Group();
  readonly chunks=new Map<string,Chunk>();
  private byChunk=new Map<string,Set<RailProfile>>();
  private normalOwners=new Map<string,string>();
  private wanted:string[]=[];
  private refresh=Infinity;
  private clock=0;
  private disposed=false;
  builds=0;

  constructor(private network:Network,private materials:{st:THREE.Material;foot:THREE.Material},private options:{lowQ:boolean}) {
    this.group.name='canonical railway fallback';
    for(const profile of network.profiles)for(let i=1;i<profile.pts.length;i++){
      const a=profile.pts[i-1],b=profile.pts[i],owner=key((a[0]+b[0])/2,(a[1]+b[1])/2);
      let list=this.byChunk.get(owner);if(!list)this.byChunk.set(owner,list=new Set());list.add(profile);
      this.normalOwners.set(owner,`${Math.floor((a[0]+b[0])/2/TILE)}_${Math.floor((a[1]+b[1])/2/TILE)}`);
    }
  }

  /** Call every rendered frame, after World.update. New rail-only chunks are
   * installed one per call; the220m lookahead prepares them before arrival.
   * nearbyTrainPoints may contain real coach positions; at most six samples
   * spanning the full list prepare the head and tail of both nearby rakes.
   * No packOf lookup is used: missing city-pack tiles still receive rails. */
  update(x:number,z:number,loaded:LoadedTiles,dt=0,nearbyTrainPoints:readonly Point[]=[]) {
    if(this.disposed||!Number.isFinite(x)||!Number.isFinite(z))return;
    this.clock++;this.refresh+=Math.max(0,dt);
    if(this.refresh>=.25){
      this.refresh=0;
      const eligible=nearbyTrainPoints.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.hypot(p.x-x,p.z-z)<2700);
      const samples=eligible.length<=6?eligible:Array.from({length:6},(_,i)=>eligible[Math.round(i*(eligible.length-1)/5)]);
      const centers=[{x,z},...samples];
      const scores=new Map<string,number>();
      for(const [centerIndex,center] of centers.entries())for(let i=Math.floor((center.x-RADIUS)/CHUNK);i<=Math.floor((center.x+RADIUS)/CHUNK);i++)for(let j=Math.floor((center.z-RADIUS)/CHUNK);j<=Math.floor((center.z+RADIUS)/CHUNK);j++){
        const owner=`${i}_${j}`;if(!this.byChunk.has(owner))continue;
        const dx=Math.max(i*CHUNK-center.x,0,center.x-(i+1)*CHUNK),dz=Math.max(j*CHUNK-center.z,0,center.z-(j+1)*CHUNK),distance=Math.hypot(dx,dz);
        if(distance>RADIUS)continue;
        scores.set(owner,Math.min(scores.get(owner)??Infinity,distance+(centerIndex?1:0)));
      }
      this.wanted=[...scores].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])).slice(0,ACTIVE_LIMIT).map(([owner])=>owner);
    }
    const wanted=new Set(this.wanted);let built=false;
    for(const [owner,chunk] of this.chunks){
      const active=wanted.has(owner)&&!loaded.has(this.normalOwners.get(owner)!);
      if(active){if(chunk.group.parent!==this.group)this.group.add(chunk.group);chunk.used=this.clock;}
      else if(chunk.group.parent===this.group)this.group.remove(chunk.group);
    }
    for(const owner of this.wanted){
      if(loaded.has(this.normalOwners.get(owner)!)||this.chunks.has(owner)||built)continue;
      const chunk=this.build(owner);this.chunks.set(owner,chunk);this.group.add(chunk.group);built=true;
    }
    while(this.chunks.size>CACHE_LIMIT){
      const victim=[...this.chunks].filter(([,v])=>v.group.parent!==this.group).sort((a,b)=>a[1].used-b[1].used)[0];
      if(!victim)break;this.release(victim[1]);this.chunks.delete(victim[0]);
    }
  }

  private build(owner:string):Chunk {
    const [i,j]=owner.split('_').map(Number),x0=i*CHUNK,z0=j*CHUNK,st=new Batch(),foot=new Batch();
    // The common renderer supplies exact ballast, rails, bridge datum and
    // high-quality sleepers. Decorative masts wait for a normal city tile,
    // where their footprint/collision checks have full road/building context.
    const noop=()=>{};
    drawExtras([...(this.byChunk.get(owner)||[])].map(profile=>profile.source),{
      B:{st,foot},railway:this.network,lowQ:this.options.lowQ,
      inTile:(x,z)=>x>=x0&&x<x0+CHUNK&&z>=z0&&z<z0+CHUNK,
      nearestRoad:()=>null,onRoad:()=>false,inBuilding:()=>false,structureClear:()=>false,
      obstacle:noop,wall:noop,solid:noop,sign:noop,lamp:noop,pad:noop,
    });
    const group=new THREE.Group();group.name=`rail fallback ${owner}`;
    for(const [name,batch] of [['foot',foot],['st',st]] as const){
      if(!batch.pos.length)continue;
      const mesh=new THREE.Mesh(batch.geometry(),this.materials[name]);
      mesh.name=`canonical rail ${name}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    this.builds++;return{group,used:this.clock};
  }

  private release(chunk:Chunk){
    chunk.group.removeFromParent();
    for(const child of chunk.group.children)(child as THREE.Mesh).geometry.dispose();
    chunk.group.clear();
  }
  dispose(){if(this.disposed)return;this.disposed=true;for(const chunk of this.chunks.values())this.release(chunk);this.chunks.clear();this.group.clear();this.byChunk.clear();this.normalOwners.clear();this.wanted=[];}
}

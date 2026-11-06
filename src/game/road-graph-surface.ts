import type { RoadEdge } from '../world/types';
import { roadRibbon } from '../world/bridge-clearance';
import { roadQuadHeight, type RoadQuad } from '../world/road-surface';
import { isORR, isRamp, sharedNode, travelDirection } from '../world/expressway';
import { roadPavementWidth } from '../world/road-pavement';

interface RibbonBlock { key: number; start: number; quads: RoadQuad[]; points: number }
interface CachedRibbon {
  flat: boolean;
  quads?: RoadQuad[];
  blocks?: Map<number, RibbonBlock>;
  arc?: readonly number[];
  halfWidth?: number;
  outer?: number;
  joinFrom?: boolean;
  joinTo?: boolean;
  segments: number;
  points: number;
}
/** An active fleet stays warm without retaining a whole long drive's generated
 * ribbons. Cold edges inspect only themselves and directly attached ORR ramps. */
export class RoadGraphSurfaceCache {
  static readonly MAX_EDGES=96;
  static readonly MAX_POINTS=131072;
  static readonly FULL_SEGMENTS=128;
  static readonly BLOCK_SEGMENTS=64;
  private roads=new Map<string,RoadEdge>();
  private nodes=new Map<string,Set<RoadEdge>>();
  private entries=new Map<RoadEdge,CachedRibbon>();
  private blocks = new Map<RibbonBlock, CachedRibbon>();
  private pointCount=0;
  private recent:RoadEdge|undefined;
  private recentBlock: RibbonBlock | undefined;
  private forget(e:RoadEdge){
    const entry=this.entries.get(e);
    if(entry){
      this.pointCount-=entry.points;
      if(entry.blocks)for(const block of entry.blocks.values()){this.blocks.delete(block);if(this.recentBlock===block)this.recentBlock=undefined;}
      this.entries.delete(e);
    }
    if(this.recent===e)this.recent=undefined;
  }
  private trim(){
    while(this.entries.size>RoadGraphSurfaceCache.MAX_EDGES)this.forget(this.entries.keys().next().value!);
    while(this.pointCount>RoadGraphSurfaceCache.MAX_POINTS){
      // Discard the oldest local geometry, not a long road's entire active
      // mesh. Several long roads must not evict/rebuild one another per frame.
      const block=this.blocks.keys().next().value;
      if(block){
        const owner=this.blocks.get(block)!;
        owner.blocks!.delete(block.key);owner.points-=block.points;this.pointCount-=block.points;this.blocks.delete(block);
        if(this.recentBlock===block)this.recentBlock=undefined;
      }else this.forget(this.entries.keys().next().value!);
    }
  }
  private invalidate(e:RoadEdge){this.forget(e);for(const node of[e.from,e.to])if(node)for(const other of this.nodes.get(node)||[])this.forget(other);}
  add(e:RoadEdge){
    const previous=this.roads.get(e.id);if(previous===e)return;
    if(previous)this.remove(previous);
    // Ordinary streets have no neighbour-dependent ribbon geometry.
    if(!isORR(e)&&!isRamp(e)){this.forget(e);return;}
    this.invalidate(e);this.roads.set(e.id,e);
    for(const node of[e.from,e.to])if(node){const rows=this.nodes.get(node)||new Set<RoadEdge>();rows.add(e);this.nodes.set(node,rows);}
  }
  remove(e:RoadEdge){
    this.forget(e);if(this.roads.get(e.id)!==e)return;
    this.invalidate(e);this.roads.delete(e.id);
    for(const node of[e.from,e.to])if(node){const rows=this.nodes.get(node);rows?.delete(e);if(!rows?.size)this.nodes.delete(node);}
  }
  private create(e:RoadEdge,sourceArc?:readonly number[]):CachedRibbon{
    const flat=!e.elev?.length||e.elev.every(y=>y===e.elev![0]);
    const entry:CachedRibbon={flat,points:0,segments:e.pts.length-1};
    if(flat)return entry;
    const local=new Set<RoadEdge>([e]);for(const node of[e.from,e.to])if(node)for(const other of this.nodes.get(node)||[])local.add(other);
    if(e.pts.length-1<=RoadGraphSurfaceCache.FULL_SEGMENTS){entry.quads=roadRibbon(e,[...local]).quads;entry.points=entry.quads.length*4;return entry;}
    let arc=sourceArc;
    if(!arc||arc.length!==e.pts.length){
      const owned=[0];for(let i=1;i<e.pts.length;i++)owned.push(owned[i-1]+Math.hypot(e.pts[i][0]-e.pts[i-1][0],e.pts[i][1]-e.pts[i-1][1]));
      arc=owned;entry.points+=owned.length;
    }
    const joins=new Set([...local].filter(o=>o.id!==e.id&&isRamp(o)).map(o=>sharedNode(e,o)).filter(Boolean));
    entry.arc=arc;entry.halfWidth=e.joinedPavement?e.w/2:roadPavementWidth(e,0)/2;entry.outer=-travelDirection(e);
    entry.joinFrom=isORR(e)&&joins.has(e.from);entry.joinTo=isORR(e)&&joins.has(e.to);entry.blocks=new Map();
    return entry;
  }
  private block(e:RoadEdge,entry:CachedRibbon,segment:number){
    const key=Math.floor(segment/RoadGraphSurfaceCache.BLOCK_SEGMENTS);
    let block=entry.blocks!.get(key);
    if(!block){
      const start=Math.max(0,key*RoadGraphSurfaceCache.BLOCK_SEGMENTS-1),end=Math.min(e.pts.length-2,(key+1)*RoadGraphSurfaceCache.BLOCK_SEGMENTS);
      const arc=entry.arc!,total=arc[arc.length-1],left:number[][]=[],right:number[][]=[];
      for(let i=start;i<=end+1;i++){
        const p=e.pts[i],a=e.pts[Math.max(0,i-1)],b=e.pts[Math.min(e.pts.length-1,i+1)],len=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
        const width=e.joinedPavement?roadPavementWidth(e,arc[i])/2:entry.halfWidth!;
        const d=Math.min(entry.joinFrom?arc[i]:Infinity,entry.joinTo?total-arc[i]:Infinity),t=Math.max(0,Math.min(1,1-d/220));
        const extra=3.5*t*t*(3-2*t),y=e.elev?.[i]||0;
        for(let side=1;side>=-1;side-=2){
          const off=side*(width+(side===entry.outer?extra:0));
          (side===1?left:right).push([p[0]-(b[1]-a[1])/len*off,y,p[1]+(b[0]-a[0])/len*off]);
        }
      }
      const quads:RoadQuad[]=[];
      for(let i=0;i<end-start+1;i++)quads.push([right[i],right[i+1],left[i+1],left[i]] as RoadQuad);
      block={key,start,quads,points:quads.length*4};
      if(this.entries.get(e)===entry){entry.blocks!.set(key,block);entry.points+=block.points;this.pointCount+=block.points;this.blocks.set(block,entry);this.trim();}
    }else if(this.recentBlock!==block){this.blocks.delete(block);this.blocks.set(block,entry);}
    this.recentBlock=this.blocks.has(block)?block:undefined;
    return block;
  }
  height(e:RoadEdge,segment:number,x:number,z:number,scalar:number,sourceArc?:readonly number[]){
    let entry=this.entries.get(e);
    if(!entry){
      entry=this.create(e,sourceArc);this.entries.set(e,entry);this.pointCount+=entry.points;this.trim();
    }else if(this.recent!==e){this.entries.delete(e);this.entries.set(e,entry);}
    this.recent=this.entries.get(e)===entry?e:undefined;
    if(entry.flat||!Number.isSafeInteger(segment)||segment<0||segment>=entry.segments)return scalar;
    const block=entry.blocks?this.block(e,entry,segment):undefined,quads=block?.quads??entry.quads!,start=block?.start??0;
    let value=scalar,error=Infinity;
    // Source arcs select the local sheet even if this road loops across itself
    // elsewhere. Warm calls create no arrays and never query a foreign road.
    for(let k=0;k<3;k++){
      const index=segment+(k===1?-1:k===2?1:0)-start,q=quads[index];if(!q)continue;
      const y=roadQuadHeight(q,x,z);if(y===null)continue;
      const d=Math.abs(y-scalar);if(d<error){value=y;error=d;}
    }
    return value;
  }
}

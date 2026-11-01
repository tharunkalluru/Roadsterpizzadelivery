import { railwayNetwork } from '../world/railway-geometry';
import type { RailwayRun, RailwayTrack, RailDirection } from './railway-flow';

export const STORY_RAIL_STATIONS={
  ghatkesar:{id:'n1974699692',label:'Ghatkesar',x:19306.1,z:-5152.5},
  hitecCity:{id:'n1425916857',label:'HITEC City',x:-11817.8,z:-7029.4},
} as const;
interface Edge {to:number;length:number;way:string;dir:RailDirection}
interface Node {point:number[];edges:Edge[]}
interface Entry {node:number;distance:number}
/** Small binary heap keeps route preparation outside the per-frame train loop. */
class Queue {
  private entries:Entry[]=[];
  push(entry:Entry){let i=this.entries.length;this.entries.push(entry);while(i){const p=(i-1)>>1;if(this.entries[p].distance<=entry.distance)break;this.entries[i]=this.entries[p];i=p;}this.entries[i]=entry;}
  pop(){const first=this.entries[0],last=this.entries.pop();if(!last)return undefined;if(this.entries.length){let i=0;while(i*2+1<this.entries.length){let c=i*2+1;if(c+1<this.entries.length&&this.entries[c+1].distance<this.entries[c].distance)c++;if(this.entries[c].distance>=last.distance)break;this.entries[i]=this.entries[c];i=c;}this.entries[i]=last;}return first;}
}

/** Route only along exact connected source nodes. A station may select a nearby
 * mapped track node, but no synthetic station connector is ever added. Heights
 * are part of node identity so a railway overpass cannot become a junction. */
export function findRailwayStoryRoute(rails:ReadonlyMap<string,RailwayTrack>,from:{x:number;z:number},to:{x:number;z:number},stationRadius=120):RailwayRun|null{
  const nodes:Node[]=[],ids=new Map<string,number>();
  const node=(point:number[])=>{const key=`${point[0]},${point[1]},${point[2]}`;let id=ids.get(key);if(id===undefined){id=nodes.length;ids.set(key,id);nodes.push({point,edges:[]});}return id;};
  for(const[id,track]of rails){
    if('service'in track&&track.service)continue;
    for(let i=1;i<track.pts.length;i++){
      const a=track.pts[i-1],b=track.pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-7)continue;
      const ai=node([a[0],(track.elev?.[i-1]??(track.bridge?6.2:0))+.11,a[1]]),bi=node([b[0],(track.elev?.[i]??(track.bridge?6.2:0))+.11,b[1]]);
      nodes[ai].edges.push({to:bi,length,way:id,dir:1});nodes[bi].edges.push({to:ai,length,way:id,dir:-1});
    }
  }
  const distances=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),via:(Edge|undefined)[]=Array(nodes.length),ends=new Set<number>(),queue=new Queue();
  nodes.forEach((n,i)=>{
    const start=Math.hypot(n.point[0]-from.x,n.point[2]-from.z);if(start<=stationRadius){distances[i]=start;queue.push({node:i,distance:start});}
    if(Math.hypot(n.point[0]-to.x,n.point[2]-to.z)<=stationRadius)ends.add(i);
  });
  let end=-1;
  for(let item=queue.pop();item;item=queue.pop()){
    if(item.distance!==distances[item.node])continue;
    if(ends.has(item.node)){end=item.node;break;}
    for(const edge of nodes[item.node].edges){const next=item.distance+edge.length;if(next>=distances[edge.to])continue;distances[edge.to]=next;previous[edge.to]=item.node;via[edge.to]=edge;queue.push({node:edge.to,distance:next});}
  }
  if(end<0)return null;
  const path:number[]=[];for(let at=end;at>=0;at=previous[at])path.push(at);path.reverse();if(path.length<2)return null;
  const pts=path.map(i=>nodes[i].point),cum=[0],ways:RailwayRun['ways']=[];
  for(let i=1;i<path.length;i++){
    const edge=via[path[i]]!;cum.push(cum[i-1]+edge.length);
    if(ways.at(-1)?.id!==edge.way||ways.at(-1)?.dir!==edge.dir)ways.push({id:edge.way,dir:edge.dir});
  }
  return{pts,cum,ways,len:cum.at(-1)!};
}

let cached:RailwayRun|null|undefined;
export function buildRailwayStoryRoute(rails?:ReadonlyMap<string,RailwayTrack>):RailwayRun|null{
  if(rails)return findRailwayStoryRoute(rails,STORY_RAIL_STATIONS.ghatkesar,STORY_RAIL_STATIONS.hitecCity);
  if(cached!==undefined)return cached;
  return cached=findRailwayStoryRoute(new Map(railwayNetwork().profiles.map(r=>[r.id,r])),STORY_RAIL_STATIONS.ghatkesar,STORY_RAIL_STATIONS.hitecCity);
}

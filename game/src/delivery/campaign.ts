import type { LevelConfig, StorageLike } from './core/types';
import type { RoadGraph } from '../game/roadgraph';
const KEY='roadster-mystery-progress-v1';
export function savedCampaign(levels:readonly LevelConfig[],raw:string|null) {
  const empty={completed:[] as string[],order:levels.map(l=>l.id)};
  try {
    const data=JSON.parse(raw||'null'); if(!data||![1,2].includes(data.version)||!Array.isArray(data.completed))return empty;
    const known=new Set(levels.map(l=>l.id));
    const order=data.version===2?data.order:empty.order;
    if(!Array.isArray(order)||new Set(order).size!==order.length||order.some(id=>typeof id!=='string'||!id.trim()))return empty;
    // A shipped content update can retire a previously valid ID. Validate the
    // saved history first, then remove retired entries without resetting the
    // already completed customers that still exist in the campaign.
    if(data.version===2&&(new Set(data.completed).size!==data.completed.length||
      data.completed.some(id=>typeof id!=='string'||!id.trim()||!order.includes(id))))return empty;
    const stored=new Set(data.completed.filter((id:unknown)=>typeof id==='string'));
    const completed:string[]=[];for(const id of order){if(!stored.has(id))break;if(known.has(id))completed.push(id);}
    return {completed,order:[...order.filter(id=>known.has(id)),...empty.order.filter(id=>!order.includes(id))]};
  }catch{return empty;}
}
const dist=(a:LevelConfig,b:LevelConfig)=>Math.hypot(a.destination.x-b.destination.x,a.destination.z-b.destination.z);
export function campaignDistance(levels:readonly LevelConfig[]) {return levels.reduce((sum,l,i)=>sum+(i?dist(levels[i-1],l):0),0);}
/** Exact waypoint route for small campaigns, bounded nearest-neighbour + 2-opt for larger content sets. */
export function campaignPlan(source:readonly LevelConfig[],raw:string|null=null):LevelConfig[] {
  if(!source.length)return [];
  // Numbered scene campaigns deliberately preserve the author's level order.
  if(source[0].campaignOrder==='fixed')return source.map((level,i)=>({...level,level:i+1}));
  const saved=savedCampaign(source,raw),byId=new Map(source.map(l=>[l.id,l]));
  const completed=saved.completed.map(id=>byId.get(id)!);
  let pending=source.filter(l=>!saved.completed.includes(l.id));
  const opening=pending.find(l=>l.campaignRole==='opening')??(!completed.length?pending[0]:undefined);
  const finale=pending.find(l=>l.campaignRole==='finale')??(pending.length>1?pending[pending.length-1]:undefined);
  const lead=[...completed];if(opening){lead.push(opening);pending=pending.filter(l=>l!==opening);}
  const tail=finale&&finale!==opening?[finale]:[];pending=pending.filter(l=>!tail.includes(l));
  const anchor=lead[lead.length-1];
  let best=pending.slice(),bestCost=Infinity;
  const cost=(middle:LevelConfig[])=>campaignDistance([...(anchor?[anchor]:[]),...middle,...tail]);
  if(pending.length<=8){
    const visit=(prefix:LevelConfig[],remaining:LevelConfig[],soFar:number)=>{
      if(soFar>=bestCost)return;
      if(!remaining.length){const value=cost(prefix);if(value<bestCost){bestCost=value;best=prefix.slice();}return;}
      for(let i=0;i<remaining.length;i++){const next=remaining[i],previous=prefix[prefix.length-1]??anchor;visit([...prefix,next],remaining.filter((_,j)=>j!==i),soFar+(previous?dist(previous,next):0));}
    };visit([],pending,0);
  }else{
    best=[];let rest=pending.slice(),at=anchor;
    while(rest.length){rest.sort((a,b)=>at?dist(at,a)-dist(at,b):a.id.localeCompare(b.id));at=rest.shift()!;best.push(at);}
    for(let pass=0;pass<4;pass++){let improved=false;for(let i=0;i<best.length-1;i++)for(let j=i+1;j<best.length;j++){const candidate=[...best.slice(0,i),...best.slice(i,j+1).reverse(),...best.slice(j+1)];if(cost(candidate)+.01<cost(best)){best=candidate;improved=true;}}if(!improved)break;}
  }
  const stages=source.map(l=>l.restaurantStage);
  return [...lead,...best,...tail].map((l,i)=>({...l,level:i+1,restaurantStage:stages[i]}));
}
/** Migrate in memory; the next ordinary completion persists the new order. Never erase the old save. */
export function campaignSession(levels:LevelConfig[],storage?:StorageLike) {
  let raw:string|null=null;try{raw=storage?.getItem(KEY)??null;}catch{}
  const saved=savedCampaign(levels,raw),planned=campaignPlan(levels,raw);
  const initial=JSON.stringify({version:2,order:planned.map(l=>l.id),completed:saved.completed});
  let written=false;
  const wrapped:StorageLike|undefined=storage?{getItem:key=>key===KEY&&!written?initial:storage.getItem(key),setItem:(key,value)=>{if(key===KEY)written=true;storage.setItem(key,value);},removeItem:key=>storage.removeItem?.(key)}:undefined;
  return {levels:planned,storage:wrapped};
}
/** Candidate lies on a real, ground-level main carriageway 1–2km from the first delivery. */
export function campaignSpawn(graph:RoadGraph,target:{x:number;z:number}) {
  let best:{name:string;x:number;z:number}|null=null,score=Infinity;
  for(const edge of graph.edges){
    if(edge.e.workZone)continue;
    if(!['primary','secondary','trunk','motorway'].includes(edge.e.cls)||edge.e.w<9||edge.e.elev?.some(y=>Math.abs(y)>1))continue;
    for(let s=8;s<edge.len-8;s+=Math.min(100,Math.max(12,edge.len/10))){
      const p=graph.pointAt(edge,s,1),d=Math.hypot(p.x-target.x,p.z-target.z);
      if(d<1250||d>1750)continue;
      const value=Math.abs(d-1500)+(edge.e.cls==='primary'?0:40);
      if(value<score){score=value;best={name:edge.e.name||'Hyderabad main road',x:p.x,z:p.z};}
    }
  }
  return best;
}

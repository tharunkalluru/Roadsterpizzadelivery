import { projectRailwayRun, type RailwayRun } from './railway-flow';
import { createRailWindowJob, clusterRailConflictWindows, type RailConflictWindow, type RailWindowJob } from './rail-conflict-windows';
export interface Train {id:string;run:RailwayRun;s:number;dir:1|-1;formationDir?:1|-1;v:number;cars:readonly unknown[]}
const length=(t:Train)=>Math.max(0,t.cars.length-1)*23.4+22.5;
const head=(t:Train)=>t.dir===(t.formationDir??t.dir)?t.s:t.s-(t.formationDir??t.dir)*length(t);
const STOP_MARGIN=3,CLEAR_MARGIN=3;
function state(t:Train,range:[number,number]){
 const h=head(t),tail=h-t.dir*length(t),entry=t.dir>0?range[0]:range[1];
 const occupied=Math.min(h,tail)<=range[1]+CLEAR_MARGIN&&Math.max(h,tail)>=range[0]-CLEAR_MARGIN;
 const ahead=t.dir*(entry-h);return{occupied,ahead,passed:!occupied&&ahead<0};
}
interface Pair {
 a:Train;b:Train;aRun:RailwayRun;bRun:RailwayRun;reach:number;windows:RailConflictWindow[];owners:Map<number,string>;
 job:RailWindowJob;prepared:boolean;prepStops:Map<string,{s:number;dir:1|-1}>;
}
function transform(old:RailwayRun,next:RailwayRun){
 if(old===next)return{sign:1,offset:0};
 // Actual route appends, prepends and story adoption retain shared source
 // segments, sometimes in reverse. Resolve their affine scalar mapping once.
 const key=(p:number[])=>p.map(n=>n.toFixed(6)).join(','),indices=new Map<string,number[]>();
 next.pts.forEach((p,i)=>{const k=key(p),list=indices.get(k)||[];list.push(i);indices.set(k,list);});
 for(let i=0;i<old.pts.length-1;i++)for(const j of indices.get(key(old.pts[i]))||[])for(const sign of[1,-1]){
  if(next.pts[j+sign]&&key(next.pts[j+sign])===key(old.pts[i+1]))return{sign,offset:next.cum[j]-sign*old.cum[i]};
 }
 const p=old.pts[0];return{sign:1,offset:p?projectRailwayRun(next,p[0],p[2]).s:0};
}
function mappedWindows(prior:Pair,a:RailwayRun,b:RailwayRun){
 const ta=transform(prior.aRun,a),tb=transform(prior.bRun,b),range=(r:[number,number],t:typeof ta)=>{
  const lo=r[0]*t.sign+t.offset,hi=r[1]*t.sign+t.offset;return[Math.min(lo,hi),Math.max(lo,hi)] as [number,number];
 };
 return prior.windows.map(w=>({a:range(w.a,ta),b:range(w.b,tb)}));
}
function preserveOwners(prior:Pair,next:Pair){
 const old=mappedWindows(prior,next.aRun,next.bRun);
 for(const [index,owner]of prior.owners)next.windows.forEach((w,k)=>{
  const v=old[index];if(v.a[0]<=w.a[1]&&w.a[0]<=v.a[1]&&v.b[0]<=w.b[1]&&w.b[0]<=v.b[1]){
   const existing=next.owners.get(k);if(!existing||owner<existing)next.owners.set(k,owner);
  }
 });
}
/** Cached finite coach-envelope windows; reservations are reconsidered at2Hz,
 * remain owned until the whole rake clears, and never replace the live SAT.
 */
export class RailConflictReservations {
 private prepared=new WeakMap<RailwayRun,WeakMap<RailwayRun,RailWindowJob>>();
 private pairs=new Map<string,Pair>();private clock=0;private nextScan=0;
 readonly diagnostics={bothCommitted:0};
 private job(a:RailwayRun,b:RailwayRun){
  let map=this.prepared.get(a);if(!map){map=new WeakMap();this.prepared.set(a,map);}
  let job=map.get(b);if(!job){job=createRailWindowJob(a,b);map.set(b,job);}return job;
 }
 private prepStop(pair:Pair,t:Train){
  let stop=pair.prepStops.get(t.id);
  if(!stop||stop.dir!==t.dir){stop={s:head(t)+t.dir*(t.v*t.v/(2*1.5)+4),dir:t.dir};pair.prepStops.set(t.id,stop);}
  return Math.max(0,(stop.s-head(t))*t.dir);
 }
 update(dt:number,trains:readonly Train[]){
  this.clock+=Math.max(0,dt);const live=new Set<string>();let changed=false;
  for(let i=0;i<trains.length;i++)for(let j=i+1;j<trains.length;j++){
   const [a,b]=[trains[i],trains[j]].sort((x,y)=>x.id.localeCompare(y.id)),key=a.id+'|'+b.id;live.add(key);
   const reach=Math.max(length(a),length(b))+20;let pair=this.pairs.get(key);
   if(!pair||pair.aRun!==a.run||pair.bRun!==b.run||pair.reach!==reach){
    const prior=pair;pair={a,b,aRun:a.run,bRun:b.run,reach,windows:prior?mappedWindows(prior,a.run,b.run):[],owners:prior?new Map(prior.owners):new Map(),
     job:this.job(a.run,b.run),prepared:false,prepStops:new Map()};this.pairs.set(key,pair);changed=true;
   }else{pair.a=a;pair.b=b;}
   // Only cold preparation advances here, with a1ms/2048-operation chunk.
   // While unknown, use the existing1.5m/s² braking curve to a fixed upstream
   // signal, retaining current geometry, pose and any prior approach ownership.
   if(!pair.job.ready){this.prepStop(pair,a);this.prepStop(pair,b);pair.job.step();}
   if(pair.job.ready&&!pair.prepared){
    const prior={...pair,windows:pair.windows,owners:pair.owners};pair.windows=clusterRailConflictWindows(pair.job.windows,reach);pair.owners=new Map();
    preserveOwners(prior,pair);pair.prepared=true;changed=true;
   }
  }
  for(const key of this.pairs.keys())if(!live.has(key)){this.pairs.delete(key);changed=true;}
  if(!changed&&this.clock<this.nextScan)return;this.nextScan=this.clock+.5;
  for(const pair of this.pairs.values())pair.windows.forEach((window,k)=>{
   const {a,b}=pair,aa=state(a,window.a),bb=state(b,window.b);let owner=pair.owners.get(k);
   if(owner&&(owner===a.id?aa:bb).passed){pair.owners.delete(k);owner=undefined;}
   if(owner||aa.passed||bb.passed)return;
   const horizon=Math.max(length(a),length(b))+Math.max(a.v*a.v,b.v*b.v)/(2*1.5)+40;
   if(Math.min(aa.ahead,bb.ahead)>horizon)return;
   if(aa.occupied&&bb.occupied)this.diagnostics.bothCommitted++;
   owner=aa.occupied&&!bb.occupied?a.id:bb.occupied&&!aa.occupied?b.id:aa.ahead/Math.max(1,a.v)<=bb.ahead/Math.max(1,b.v)?a.id:b.id;
   pair.owners.set(k,owner);
  });
 }
 stopDistance(t:Train){
  let distance=Infinity;
  for(const pair of this.pairs.values())if(pair.a.id===t.id||pair.b.id===t.id){
   if(!pair.job.ready)distance=Math.min(distance,this.prepStop(pair,t));
   const isA=pair.a.id===t.id;
   pair.windows.forEach((w,k)=>{const owner=pair.owners.get(k);if(!owner||owner===t.id)return;const s=state(t,isA?w.a:w.b);
    if(!s.passed)distance=Math.min(distance,Math.max(0,s.ahead-STOP_MARGIN));
   });
  }return distance;
 }
 debug(){return[...this.pairs.values()].map(p=>({a:p.a.id,b:p.b.id,ready:p.job.ready,stats:p.job.stats,windows:p.windows,owners:[...p.owners]}));}
}

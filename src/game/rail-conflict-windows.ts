import { railwayPoint, type RailwayRun } from './railway-flow';
export interface RailConflictWindow {a:[number,number];b:[number,number]}
type Point=[number,number];
interface Pose{x:number;y:number;z:number;hx:number;hz:number;grade:number;dx:number;dz:number;dy:number}
interface Span{s0:number;s1:number;poly:Point[];loX:number;hiX:number;loZ:number;hiZ:number;bottom:number;roof:number}
const CELL=24,HALF_LENGTH=11.25,HALF_WIDTH=1.57,PAD=.08;
const shapes=new WeakMap<RailwayRun,Span[]>();
function pose(run:RailwayRun,s:number):Pose{
 const p=railwayPoint(run,s),a=railwayPoint(run,s-7),b=railwayPoint(run,s+7),l=Math.hypot(b.x-a.x,b.z-a.z);
 return{x:p.x,y:p.y,z:p.z,hx:l>.01?(b.x-a.x)/l:p.hx,hz:l>.01?(b.z-a.z)/l:p.hz,grade:l>.01?(b.y-a.y)/l:Math.tan(p.pitch),dx:b.x-a.x,dz:b.z-a.z,dy:b.y-a.y};
}
function corners(p:Pose,h:Pose,pad:number):Point[]{
 const out:Point[]=[];for(const along of[-HALF_LENGTH-pad,HALF_LENGTH+pad])for(const side of[-HALF_WIDTH-pad,HALF_WIDTH+pad])
  out.push([p.x+h.hx*along-h.hz*side,p.z+h.hz*along+h.hx*side]);return out;
}
function hull(points:Point[]){
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=(ps:Point[])=>{const h:Point[]=[];for(const p of ps){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h;};
 const a=half(points),b=half(points.slice().reverse());return a.slice(0,-1).concat(b.slice(0,-1));
}
function overlaps(a:Point[],b:Point[]){
 for(const poly of[a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],nx=q[1]-p[1],nz=p[0]-q[0];let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;
  for(const r of a){const d=r[0]*nx+r[1]*nz;amin=Math.min(amin,d);amax=Math.max(amax,d);}
  for(const r of b){const d=r[0]*nx+r[1]*nz;bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
  if(amax<=bmin||bmax<=amin)return false;
 }return true;
}
function* spans(run:RailwayRun):Generator<void,Span[]>{
 const cached=shapes.get(run);if(cached)return cached;
 // Centre position and the two +/-7m heading samples are piecewise linear
 // between these breakpoints. Heading turns monotonically inside each span.
 const breaks=new Set([0,run.len]);for(const s of run.cum){breaks.add(s);breaks.add(Math.max(0,s-7));breaks.add(Math.min(run.len,s+7));yield;}
 const points=[...breaks].sort((a,b)=>a-b),out:Span[]=[];let p0=pose(run,0);
 for(let i=1;i<points.length;i++){
  const count=Math.max(1,Math.ceil((points[i]-points[i-1])/5));
  for(let k=0;k<count;k++){
   const s0=points[i-1]+(points[i]-points[i-1])*k/count,s1=points[i-1]+(points[i]-points[i-1])*(k+1)/count,p1=pose(run,s1);
   const angle=Math.acos(Math.max(-1,Math.min(1,p0.hx*p1.hx+p0.hz*p1.hz)));
   // Independent endpoint translations/headings enclose their Minkowski sum.
   // The corner-arc bow allowance encloses intermediate rotation as well.
   const pad=PAD+Math.hypot(HALF_LENGTH,HALF_WIDTH)*(1-Math.cos(angle/2));
   const poly=hull([...corners(p0,p0,pad),...corners(p0,p1,pad),...corners(p1,p0,pad),...corners(p1,p1,pad)]);
   let loX=Infinity,hiX=-Infinity,loZ=Infinity,hiZ=-Infinity;
   for(const p of poly){loX=Math.min(loX,p[0]);hiX=Math.max(hiX,p[0]);loZ=Math.min(loZ,p[1]);hiZ=Math.max(hiZ,p[1]);}
   // The +/-7m chord is affine between heading breakpoints. Its minimum
   // horizontal length and maximum endpoint |dy| conservatively bound grade,
   // including an interior bend maximum, rather than assuming a flat coach.
   const vx=p1.dx-p0.dx,vz=p1.dz-p0.dz,den=vx*vx+vz*vz;
   const u=den?Math.max(0,Math.min(1,-(p0.dx*vx+p0.dz*vz)/den)):0;
   const minChord=Math.hypot(p0.dx+u*vx,p0.dz+u*vz);
   const grade=Math.max(Math.abs(p0.grade),Math.abs(p1.grade),Math.max(Math.abs(p0.dy),Math.abs(p1.dy))/Math.max(.01,minChord));
   out.push({s0,s1,poly,loX,hiX,loZ,hiZ,bottom:Math.min(p0.y,p1.y)+.2-grade*HALF_LENGTH-.02,roof:Math.max(p0.y,p1.y)+4.175+grade*HALF_LENGTH+.02});
   p0=p1;yield;
  }
 }
 shapes.set(run,out);return out;
}
function cells(s:Span){const out:string[]=[];for(let x=Math.floor(s.loX/CELL);x<=Math.floor(s.hiX/CELL);x++)for(let z=Math.floor(s.loZ/CELL);z<=Math.floor(s.hiZ/CELL);z++)out.push(x+','+z);return out;}
export function clusterRailConflictWindows(raw:readonly RailConflictWindow[],reach:number){
 const windows:RailConflictWindow[]=[];
 for(const w of raw){let m={a:[...w.a] as [number,number],b:[...w.b] as [number,number]},changed=true;
  while(changed){changed=false;for(let i=windows.length-1;i>=0;i--){const v=windows[i];
   if(m.a[0]<=v.a[1]+reach&&v.a[0]<=m.a[1]+reach&&m.b[0]<=v.b[1]+reach&&v.b[0]<=m.b[1]+reach){
    m={a:[Math.min(m.a[0],v.a[0]),Math.max(m.a[1],v.a[1])],b:[Math.min(m.b[0],v.b[0]),Math.max(m.b[1],v.b[1])]};windows.splice(i,1);changed=true;
   }
  }}windows.push(m);
 }return windows.sort((x,y)=>x.a[0]-y.a[0]||x.b[0]-y.b[0]);
}
export interface RailWindowJob {
 ready:boolean;windows:RailConflictWindow[];
 stats:{cpuMs:number;maxChunkMs:number;chunks:number;aSpans:number;bSpans:number;candidates:number;satCalls:number;rawConflicts:number};
 step():void;
}
/** Prepare once in bounded chunks; no route forecast runs in an ordinary frame. */
export function createRailWindowJob(a:RailwayRun,b:RailwayRun):RailWindowJob{
 const stats={cpuMs:0,maxChunkMs:0,chunks:0,aSpans:0,bSpans:0,candidates:0,satCalls:0,rawConflicts:0};
 const job:RailWindowJob={ready:false,windows:[],stats,step(){
  if(job.ready)return;const start=performance.now();let n=0;
  do{if(work.next().done){job.ready=true;break;}}while(++n<2048&&performance.now()-start<1);
  const ms=performance.now()-start;stats.cpuMs+=ms;stats.maxChunkMs=Math.max(stats.maxChunkMs,ms);stats.chunks++;
 }};
 function* prepare():Generator<void>{
  const aa=yield* spans(a),bb=yield* spans(b);stats.aSpans=aa.length;stats.bSpans=bb.length;
  const grid=new Map<string,number[]>();
  for(let i=0;i<aa.length;i++){for(const key of cells(aa[i])){const values=grid.get(key)||[];values.push(i);grid.set(key,values);}yield;}
  const raw:RailConflictWindow[]=[];
  for(const y of bb){
   const seen=new Set<number>();for(const key of cells(y))for(const i of grid.get(key)||[])seen.add(i);
   for(const i of seen){stats.candidates++;const x=aa[i];
    if(x.hiX>y.loX&&y.hiX>x.loX&&x.hiZ>y.loZ&&y.hiZ>x.loZ&&x.bottom<y.roof&&y.bottom<x.roof){
     stats.satCalls++;if(overlaps(x.poly,y.poly))raw.push({a:[x.s0,x.s1],b:[y.s0,y.s1]});
    }yield;
   }
  }
  stats.rawConflicts=raw.length;
  // Source windows are few, but coalesce raw samples cooperatively too.
  let merged:RailConflictWindow[]=[];for(const w of raw){merged=clusterRailConflictWindows([...merged,w],2);yield;}
  job.windows=merged;
 }
 const work=prepare();return job;
}

import type { RoadEdge, XZ } from './types';

// Reviewed Paradise/Sardar Patel fork corridors. This corrects inherited game
// elevation estimates, not surveyed alignments. Never invent a new service road.
const REVIEWED = new Set(['c74bed09-107_0','d0978a06-15a_0','8a2c3f45-5c3_0','51be01ba-57f_0']);
const GRADE = .065;
// Packed two-lane widths include an oversized legacy apron. At these reviewed
// forks, retain two 3.4m traffic lanes rather than two overlapping 9.4m decks.
const width = (e:RoadEdge) => e.oneway && e.lanes===2 && e.w>6.8 && e.w<=10 && !e.expressway && !e.joinedPavement ? 6.8 : e.w;
const flat = (e:RoadEdge) => !/survey|explicit/.test(String((e as RoadEdge & {elevationSource?:string}).elevationSource||'')) && !e.expressway && !e.elev?.some(y=>Math.abs(y)>.01) && /^(primary|secondary|tertiary|trunk|unclassified|service|residential)(_link)?$/.test(e.cls);
const distanceToLine=(p:XZ,pts:XZ[])=>{
 let best=Infinity;
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz));}
 return best;
};
const rise=(distance:number)=>{const d=Math.max(0,distance);return GRADE*(d<20?d*d/40:d-10);};
export function repairReviewedFlyoverTerminals(source:RoadEdge[],prepared:RoadEdge[]):RoadEdge[]{
 const originals=new Map(source.map(e=>[e.id,e])),byNode=new Map<string,RoadEdge[]>();
 for(const e of source)for(const n of [e.from,e.to])if(n)(byNode.get(n)||byNode.set(n,[]).get(n)!).push(e);
 const forks:{p:XZ;id:string;start:boolean;flatUntil:number}[]=[];
 for(const e of prepared){
  if(!REVIEWED.has(e.id)||/survey|explicit/.test(String((originals.get(e.id) as RoadEdge & {elevationSource?:string})?.elevationSource||'')))continue;
  for(const start of [true,false]){
   const index=start?0:e.pts.length-1,node=start?e.from:e.to,p=e.pts[index],q=e.pts[start?1:index-1];
   if(!node)continue;
   const dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz);
   const branches=(byNode.get(node)||[]).filter(b=>b.id!==e.id&&flat(b)).filter(b=>{
    const j=b.from===node?0:b.pts.length-1,k=j===0?1:j-1,ax=b.pts[k][0]-b.pts[j][0],az=b.pts[k][1]-b.pts[j][1];
    return (ax*dx+az*dz)/(Math.hypot(ax,az)*length||1)>.75;
   });
   if(!branches.length)continue;
   // Both finite pavements must separate before they acquire different levels.
   // Otherwise the ramp's concrete side/soffit cuts the through carriageway.
   const points=start?e.pts:[...e.pts].reverse();let distance=0,flatUntil=0;
   for(let i=1;i<points.length;i++){
    distance+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    if(distance>600)break;
    if(branches.every(b=>distanceToLine(points[i],b.pts)>width(originals.get(e.id)!)/2+width(b)/2+1)){flatUntil=distance;break;}
   }
   if(flatUntil)forks.push({p,id:e.id,start,flatUntil});
  }
 }
 if(!forks.length)return prepared;
 return prepared.map(e=>{
  const original=originals.get(e.id),own=forks.filter(f=>f.id===e.id);
  if(!original||!e.elev||!own.length&&!flat(original))return e;
  let distance=0;const along=e.pts.map((p,i)=>{if(i)distance+=Math.hypot(p[0]-e.pts[i-1][0],p[1]-e.pts[i-1][1]);return distance;});
  let changed=false;
  const elev=e.elev.map((y,i)=>{
   let height=y;
   for(const f of own)height=Math.min(height,rise((f.start?along[i]:distance-along[i])-f.flatUntil));
   if(!own.length)for(const f of forks){const d=Math.hypot(e.pts[i][0]-f.p[0],e.pts[i][1]-f.p[1]);height=Math.min(height,rise(d-200));}
   if(Math.abs(height-y)>1e-8)changed=true;
   return height;
  });
  const narrow = width(original)<e.w && (own.length>0 || e.pts.some(p=>forks.some(f=>Math.hypot(p[0]-f.p[0],p[1]-f.p[1])<200)));
  if(!changed&&!narrow)return e;
  const w=narrow?width(original):e.w;
  return {...e,elev,...(narrow?{w,sceneryWidth:Math.max(e.sceneryWidth||0,e.w),joinedPavement:{sourceWidth:e.w,originalWidth:w,physicalWidth:w,intervals:[[0,distance]] as [number,number][],taper:40,release:'reviewed-paradise-fork-20261105',usableLanes:e.lanes}}:{})};
 });
}

import type { RoadEdge, XZ } from './types';
import { DESTINATION_HERO_PLANS } from './destination-hero-data';
import { placeCatalogue } from './landmark_catalog';

export interface StadiumExclusion { x: number; z: number; rx: number; rz: number }
export function stadiumExclusions(origin: {lat:number;lon:number}): StadiumExclusion[] {
  const p=placeCatalogue(origin).find(p=>p.id==='uppal_stadium')!;
  return stadiumExclusionsAt(p.x,p.z);
}
export function stadiumExclusionsAt(x:number,z:number): StadiumExclusion[] {
  const ring=DESTINATION_HERO_PLANS.uppal_stadium.ring;
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  // The same source-sized bowl used by drawUppalStadium, plus its outer wall.
  return [{x,z,rx:(Math.max(...xs)-Math.min(...xs))*.46+3,rz:(Math.max(...zs)-Math.min(...zs))*.46+3}];
}
export const insideStadium=(s:StadiumExclusion,x:number,z:number,pad=0)=>((x-s.x)/(s.rx+pad))**2+((z-s.z)/(s.rz+pad))**2<1;
// Clip only at-grade street portions inside the cricket bowl. Keep outer roads,
// source coordinates, heights and endpoint connectivity; cut ends never join
// through the playing field. Identical IDs/fragments are used by render/traffic.
export function excludeStadiumRoads<T extends RoadEdge>(roads:T[],stadiums:readonly StadiumExclusion[]):T[] {
 if(!stadiums.length)return roads;
 let changed=false; const result:T[]=[];
 for(const e of roads){
  if(e.pts.length<2||e.elev?.some(y=>y>1.5)){result.push(e);continue;}
  const near=stadiums.filter(s=>e.pts.some(p=>Math.abs(p[0]-s.x)<=s.rx+e.w&&Math.abs(p[1]-s.z)<=s.rz+e.w)||e.pts.some((p,i)=>i&&Math.min(p[0],e.pts[i-1][0])<=s.x+s.rx&&Math.max(p[0],e.pts[i-1][0])>=s.x-s.rx&&Math.min(p[1],e.pts[i-1][1])<=s.z+s.rz&&Math.max(p[1],e.pts[i-1][1])>=s.z-s.rz));
  if(!near.length){result.push(e);continue;}
  const runs:{pts:XZ[];elev:number[]}[]=[];let run:{pts:XZ[];elev:number[]}|null=null,removed=false;
  for(let i=1;i<e.pts.length;i++){
   const a=e.pts[i-1],b=e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],cuts=[0,1];
   for(const s of near){const rx=s.rx+e.w/2+1,rz=s.rz+e.w/2+1,x=(a[0]-s.x)/rx,z=(a[1]-s.z)/rz,u=dx/rx,v=dz/rz,A=u*u+v*v,B=2*(x*u+z*v),C=x*x+z*z-1,D=B*B-4*A*C;if(A>1e-12&&D>0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>0&&t<1)cuts.push(t);}
   cuts.sort((a,b)=>a-b);
   for(let j=1;j<cuts.length;j++){
    const lo=cuts[j-1],hi=cuts[j],m=(lo+hi)/2;
    if(near.some(s=>insideStadium(s,a[0]+dx*m,a[1]+dz*m,e.w/2+1))){removed=true;run=null;continue;}
    const P=(t:number):XZ=>t===0?a:t===1?b:[a[0]+dx*t,a[1]+dz*t];
    const Y=(t:number)=>(e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*t;
    if(!run){run={pts:[P(lo)],elev:[Y(lo)]};runs.push(run);}run.pts.push(P(hi));run.elev.push(Y(hi));
   }
  }
  if(!removed){result.push(e);continue;}changed=true;
  runs.forEach((r,i)=>{if(r.pts.length<2||Math.hypot(r.pts.at(-1)![0]-r.pts[0][0],r.pts.at(-1)![1]-r.pts[0][1])<.1)return;
   const first=r.pts[0],last=r.pts.at(-1)!,a=e.pts[0],b=e.pts.at(-1)!;
   const same=(a:XZ,b:XZ)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
   result.push({...e,id:i?`${e.id}:stadium:${i}`:e.id,pts:r.pts,elev:e.elev?r.elev:null,from:same(first,a)?e.from:null,to:same(last,b)?e.to:null} as T);
  });
 }
 return changed?result:roads;
}

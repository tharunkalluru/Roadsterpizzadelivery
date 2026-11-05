import plans from './college-campus-plans.json';
export const COLLEGE_CAMPUSES=plans;
export type CollegeCampusId=keyof typeof COLLEGE_CAMPUSES;
export function collegeCampusId(id:string):CollegeCampusId|null{return id==='nizam_college'||id==='osmania_medical'?id:null;}
const inside=(ring:readonly number[][],x:number,z:number)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
export function collegeCampusClearAt(l:{id?:string;x?:number;z?:number},x:number,z:number):boolean|null{
 const id=l.id&&collegeCampusId(l.id);if(!id||l.x==null||l.z==null)return null;
 const p=COLLEGE_CAMPUSES[id],r=p.rotation*Math.PI/180,dx=x-l.x,dz=z-l.z,u=dx*Math.cos(r)+dz*Math.sin(r),v=dx*Math.sin(r)-dz*Math.cos(r);
 return inside(p.ring,u,v);
}

import * as THREE from 'three';
import type {Kit} from './landmarks';
import plan from './prasads-source-plan.json';
export const PRASADS_SOURCE_PLAN=plan;
export function prasadsSourceClearAt(l:{id?:string;x?:number;z?:number},x:number,z:number):boolean|null{
 if(l.id!=='prasads'||l.x==null||l.z==null)return null;
 const r=plan.rotation*Math.PI/180,dx=x-l.x,dz=z-l.z,u=dx*Math.cos(r)+dz*Math.sin(r),v=dx*Math.sin(r)-dz*Math.cos(r);let hit=false;
 for(let i=0,j=plan.outer.length-1;i<plan.outer.length;j=i++){const a=plan.outer[i],b=plan.outer[j];if((a[1]>v)!==(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;
}
export function drawPrasadsSource(K:Kit){
 const r=plan.rotation*Math.PI/180;K.c=Math.cos(r);K.s=Math.sin(r);K.ry0=-r;
 const wall='#D7D3C8',dark='#3C4B55';
 const addWall=(a:number[],b:number[],bottom=0,top=20)=>{
  const du=b[0]-a[0],dv=b[1]-a[1],length=Math.hypot(du,dv),yaw=Math.atan2(-dv,du),u=(a[0]+b[0])/2,v=(a[1]+b[1])/2;
  K.box(u,v,bottom,length,top-bottom,.45,wall,yaw);
  if(bottom===0){const A=K.P(...a as [number,number]),B=K.P(...b as [number,number]),nx=-(B[1]-A[1])/length*.26,nz=(B[0]-A[0])/length*.26;K.k.solid([[A[0]+nx,A[1]+nz],[B[0]+nx,B[1]+nz],[B[0]-nx,B[1]-nz],[A[0]-nx,A[1]-nz]],top);}
 };
 for(let i=0;i<plan.outer.length;i++){
  const a=plan.outer[i],b=plan.outer[(i+1)%plan.outer.length];
  if(a[1]>40&&b[1]>40&&Math.abs(a[0]-b[0])>80){
   const at=(u:number)=>[u,a[1]+(b[1]-a[1])*(u-a[0])/(b[0]-a[0])];
   // Current public entrance plus the movie's visible interior phone booth.
   // Booth itself is story scenery, not a claim it remains in today's venue.
   addWall(a,at(-17));addWall(at(-3),b);addWall(at(-17),at(-3),5,20);
  }else addWall(a,b);
 }
 const ring=plan.outer.map(p=>new THREE.Vector2(...p as [number,number]));
 for(const t of THREE.ShapeUtils.triangulateShape(ring,[])){const p=t.map(i=>{const w=K.P(...plan.outer[i] as [number,number]);return[w[0],20,w[1]];});K.k.B.roof.tri(p[0],p[2],p[1],dark);}
 // Glazed upper frontage, restrained corporate lettering and shallow steps.
 for(let u=-33;u<58;u+=5){K.box(u,41.55,7.8,4.65,5,.12,'#506979');K.box(u,41.7,7.8,.16,5,.18,'#B9C4C2');}
 K.box(-10,43,4.8,17,.35,4,wall);K.board('PRASADS',-10,44.7,8.1,14,1.8,'#D7D3C8','#C23F34');
 // The car remains outside. These small steps are visual public-entry detail,
 // while the central ground approach remains free of any new barrier.
 for(const side of [-1,1])for(let n=0;n<3;n++)K.box(-10+side*10.5,42.5+n*.6,0,5,.2*(3-n),.7,'#B9B7AE');
}

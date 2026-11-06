import * as THREE from 'three';
import type {Kit} from './landmarks';
import {toTpl} from '../core/util';
import plan from './osmania-university-plan.json';
export const OSMANIA_UNIVERSITY_PLAN=plan;
// Photo-informed Arts College interior courts. OSM provides the exterior only.
const court=[[-40,-31],[32,-26],[29,13],[-43,8]];
const inside=(ring:number[][],x:number,z:number)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
export function osmaniaArtsClearAt(l:{id?:string;x?:number;z?:number},x:number,z:number):boolean|null{
 if(l.id!=='ouarts'||l.x==null||l.z==null)return null;
 const r=plan.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),dx=x-l.x,dz=z-l.z;
 return inside(plan.outer,dx*c+dz*s,dx*s-dz*c);
}
function arch(K:Kit,u:number,v:number,y:number,width:number,height:number,color:string){
 const r=width/2,base=height-r,th=.28,shape=new THREE.Shape();
 shape.moveTo(-r,0);shape.lineTo(-r,base);shape.quadraticCurveTo(-r,height-.5,0,height);shape.quadraticCurveTo(r,height-.5,r,base);shape.lineTo(r,0);shape.lineTo(r-th,0);shape.lineTo(r-th,base);shape.quadraticCurveTo(r-th,height-.75,0,height-th);shape.quadraticCurveTo(-r+th,height-.75,-r+th,base);shape.lineTo(-r+th,0);shape.closePath();
 const g=new THREE.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:false,curveSegments:8}),flat=g.index?g.toNonIndexed():g,p=K.P(u,v);
 K.k.B.st.add(toTpl(flat),p[0],y,p[1],1,1,1,color,{ry:K.ry0});if(flat!==g)flat.dispose();g.dispose();
}
export function drawOsmaniaArts(K:Kit){
 const r=plan.rotation*Math.PI/180;K.c=Math.cos(r);K.s=Math.sin(r);K.ry0=-r;
 const granite='#B9AEA1',trim='#A29689',shadow='#605D55';
 // The source plan controls exterior walls; no bounding-square building or
 // city-wide clear zone replaces the surrounding campus.
 for(const ring of [plan.outer,court])for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],du=b[0]-a[0],dv=b[1]-a[1],len=Math.hypot(du,dv),yaw=Math.atan2(-dv,du),u=(a[0]+b[0])/2,v=(a[1]+b[1])/2;
  const centralFront=ring===plan.outer&&a[1]>53&&b[1]>53&&a[0]>-24&&a[0]<5&&b[0]>-24&&b[0]<5;
  if(centralFront)continue; // the real recessed doorway/corridor is built below
  K.box(u,v,0,len,15,.5,granite,yaw);
  const A=K.P(...a as [number,number]),B=K.P(...b as [number,number]),nx=-(B[1]-A[1])/len*.27,nz=(B[0]-A[0])/len*.27;
  K.k.solid([[A[0]+nx,A[1]+nz],[B[0]+nx,B[1]+nz],[B[0]-nx,B[1]-nz],[A[0]-nx,A[1]-nz]],15);
  for(const y of [3.1,8.3,14.5])K.box(u,v,y,len+.2,.25,.75,trim,yaw);
  for(let n=0;n<Math.floor(len/5);n++){
   const t=(n+.5)/Math.floor(len/5),x=a[0]+du*t,z=a[1]+dv*t;
   for(const y of [2.5,9]){K.box(x,z,y,1.8,3.2,.6,shadow,yaw);K.box(x,z,y+3.1,2.3,.16,.8,trim,yaw);}
  }
 }
 const vertices=[...plan.outer,...court],faces=THREE.ShapeUtils.triangulateShape(plan.outer.map(p=>new THREE.Vector2(...p as [number,number])),[court.map(p=>new THREE.Vector2(...p as [number,number]))]);
 for(const face of faces){const p=face.map(i=>{const w=K.P(...vertices[i] as [number,number]);return[w[0],15,w[1]];});K.k.B.roof.tri(p[0],p[2],p[1],trim);}
 // The central gateway is a tall recess above a raised small door, matching
 // photographic reference; it is not an invented car-sized ground portal.
 const u=-8,v=61;
 for(const side of [-1,1]){K.box(u+side*9.3,v,0,2.1,26,4,granite);K.cyl(u+side*8,v+2.15,3.4,.28,20,trim);}
 K.box(u,v,24,20.5,2.2,4.5,granite);
 for(const side of [-1,1]){K.box(u+side*4.75,v-.5,3.4,6,20,.8,granite);K.solidRect(u+side*4.75,v-.5,6,.8,23.4);}
 K.box(u,v-.5,7,3.5,16.4,.8,granite);
 // Open 3.5m academic doorway reveals a short shaded corridor; the delivery
 // character stands within, while the Roadster stays at the outdoor marker.
 K.box(u,v-5.5,3.4,6.6,5,.3,'#8E8579');K.box(u,v-3,7.2,6.6,.35,6,'#AAA092');
 // The photographed Arts courtyard corridor has cream rear plaster, black
 // skirting, red timber frames/high square vents and pink-granite pilasters.
 // This bounded bay is a photo-informed arrangement, not a surveyed interior;
 // every shallow closed surface stays on the existing wall (no new opening,
 // floor, collision or circulation route). iMahesh's 2019 corridor photograph
 // and the university's 2025 Arts brochure are recorded in the source review.
 const wallFace=v-5.29,timber='#683429',glass='#414A43',skirting='#302F2B';
 K.box(u,wallFace,3.4,6.6,.22,.045,skirting);
 for(const x of [u-1.85,u+1.85]){
  K.box(x,wallFace,4.12,1.16,1.7,.065,timber);
  K.box(x,wallFace+.045,4.21,.98,1.5,.025,glass);
  for(const dx of [-.32,0,.32])K.box(x+dx,wallFace+.065,4.21,.04,1.5,.025,timber);
  for(const y of [4.7,5.2])K.box(x,wallFace+.065,y,.98,.04,.025,timber);
  K.box(x,wallFace+.035,4.02,1.3,.1,.18,trim);
  K.box(x,wallFace+.025,6.38,.52,.52,.045,skirting);
  for(const dx of [-.31,.31])K.box(x+dx,wallFace+.04,6.34,.075,.6,.045,trim);
  for(const y of [6.3,6.9])K.box(x,wallFace+.04,y,.7,.075,.045,trim);
 }
 for(const y of [6.02,6.12])K.box(u,wallFace+.03,y,6.6,.035,.045,trim);
 for(const side of [-1,1]){
  const x=u+side*3.02;
  K.box(x,wallFace+.055,3.4,.48,3.62,.11,granite);
  K.box(x,wallFace+.09,3.4,.64,.26,.17,trim);
  K.box(x,wallFace+.075,3.7,.55,.11,.14,trim);
  K.box(x,wallFace+.09,6.83,.63,.15,.17,trim);
  K.box(x,wallFace+.11,6.98,.74,.15,.21,granite);
  for(const y of [4.2,4.85,5.5,6.15])K.box(x,wallFace+.115,y,.48,.015,.012,'#A69B8D');
 }
 arch(K,u,v+2.2,3.4,16,20.2,trim);
 // Shadowed corridor/landing and the two real side stair flights.
 K.box(u,v+3,3.1,20,.3,6,trim);K.solidRect(u,v+3,20,6,3.4);
 K.box(u,v-2.5,3.1,6.6,.3,9,trim);K.solidRect(u,v-2.5,6.6,9,3.4);
 for(const side of [-1,1])for(let n=0;n<12;n++){
  const x=u+side*(10.5+n*.7),y=3.4-(n+1)*3.4/12;
  K.box(x,v+5,y,1,3.4/12,3.8,granite);K.solidRect(x,v+5,1,3.8,y+3.4/12);
 }
 for(const center of [-37,20])for(let x=center-13;x<=center+13;x+=4.5){arch(K,x,58.2,1,3.8,6.5,trim);arch(K,x,58.25,8.7,3.8,5,trim);}
 // Carved parapet rhythm, deep corbel shadows and stone bands read at street
 // distance without extra textures or animated materials.
 for(let x=-61;x<46;x+=2.6){K.box(x,60,15.1,.65,1.4,.75,granite);K.box(x,60,14.7,1.6,.35,1.1,trim);}
 for(let x=u-9.5;x<u+10;x+=1.8){K.box(x,v+2.2,26.2,.55,1.2,.8,granite);K.box(x,v+2.3,23.3,.9,.7,.8,trim);}
 K.board('OSMANIA UNIVERSITY',u,v+2.2,7.6,10,.7,'#A99C8E','#46463F');
 // Preserve all mapped campus access roads. The model adds only the Arts
 // building; surrounding university buildings/roads remain streamed sources.
}

export function osmaniaLibraryClearAt(l:{id?:string;x?:number;z?:number},x:number,z:number):boolean|null{
 if(l.id!=='ou_library'||l.x==null||l.z==null)return null;
 const r=plan.library.rotation*Math.PI/180,dx=x-l.x,dz=z-l.z;
 return inside(plan.library.ring,dx*Math.cos(r)+dz*Math.sin(r),dx*Math.sin(r)-dz*Math.cos(r));
}
export function drawOsmaniaLibrary(K:Kit){
 const p=plan.library,r=p.rotation*Math.PI/180;K.c=Math.cos(r);K.s=Math.sin(r);K.ry0=-r;
 const h=p.height,cream='#D9D3BC',trim='#C9C4AD';
 for(let i=0;i<p.ring.length;i++){
  const a=p.ring[i],b=p.ring[(i+1)%p.ring.length],du=b[0]-a[0],dv=b[1]-a[1],len=Math.hypot(du,dv),u=(a[0]+b[0])/2,v=(a[1]+b[1])/2,yaw=Math.atan2(-dv,du);
  K.box(u,v,0,len,h,.45,cream,yaw);
  const A=K.P(...a as [number,number]),B=K.P(...b as [number,number]),nx=-(B[1]-A[1])/len*.25,nz=(B[0]-A[0])/len*.25;
  K.k.solid([[A[0]+nx,A[1]+nz],[B[0]+nx,B[1]+nz],[B[0]-nx,B[1]-nz],[A[0]-nx,A[1]-nz]],h);
  for(const y of [3.4,7.05])K.box(u,v,y,len,.2,.7,trim,yaw);
  for(let n=0;n<Math.floor(len/5);n++){const t=(n+.5)/Math.floor(len/5),x=a[0]+du*t,z=a[1]+dv*t;for(const y of [1.2,4.6])K.box(x,z,y,1.7,1.8,.5,'#5B655B',yaw);}
 }
 for(const t of THREE.ShapeUtils.triangulateShape(p.ring.map(v=>new THREE.Vector2(...v as [number,number])),[])){const v=t.map(i=>{const w=K.P(...p.ring[i]as[number,number]);return[w[0],h,w[1]];});K.k.B.roof.tri(v[0],v[2],v[1],trim);}
 // Official library photograph: flat cream frontage, paired classical columns
 // and blue Ambedkar-library board. No invented Indo-Saracenic domes.
 K.box(0,31.8,.85,15,6.6,.3,cream);
 for(const x of [-4.5,0,4.5]){K.box(x,32.06,1,2.2,2.5,.2,'#574B36');K.box(x,32.2,3.5,2.5,.15,.25,trim);}
 K.box(0,32.04,4.1,13.5,2.6,.15,'#51605A');
 for(let x=-6.5;x<=6.5;x+=1.3)K.box(x,32.17,4.1,.09,2.6,.14,trim);
 for(let y=4.1;y<=6.7;y+=.65)K.box(0,32.2,y,13.5,.09,.14,trim);
 for(const x of [-5.5,5.5]){K.cyl(x,35,.7,.45,5.8,'#E6E0CC');K.box(x,35,.5,1.3,.3,1.3,trim);K.box(x,35,6.5,1.3,.3,1.3,trim);K.solidCircle(x,35,.5,6.5);for(let n=0;n<4;n++)K.box(x,35,5.7+n*.21,1+n*.12,.15,1+n*.12,trim);}
 K.box(0,34,6.7,15,.6,7,cream);K.board('DR B R AMBEDKAR LIBRARY',0,37.65,7.6,15,.85,'#183E6A','#F2EFE2');K.board('OSMANIA UNIVERSITY',0,37.7,6.8,11,.55,'#183E6A','#F2EFE2');
 for(let n=0;n<5;n++)if(!K.road(0,36.4+n*.55,1)){K.box(0,36.4+n*.55,0,13,.18*(5-n),.6,trim);K.solidRect(0,36.4+n*.55,13,.6,.18*(5-n));}
}

import * as THREE from 'three';
import { Kit } from './landmarks';
import { toTpl } from '../core/util';
import { COLLEGE_CAMPUSES, type CollegeCampusId } from './college-campus-data';

function roof(K:Kit,ring:number[][],holes:number[][][],y:number,color:string){
 const vertices=[ring,...holes].flat();
 for(const t of THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p as [number,number])),holes.map(h=>h.map(p=>new THREE.Vector2(...p as [number,number]))))){
  const pts=t.map(i=>{const p=K.P(vertices[i][0],vertices[i][1]);return[p[0],y,p[1]];});K.k.B.roof.tri(pts[0],pts[2],pts[1],color);
 }
}
function shell(K:Kit,id:CollegeCampusId){
 const p=COLLEGE_CAMPUSES[id],medical=id==='osmania_medical',h=medical?13.5:10.5,wall=medical?'#DCE6DB':'#E9B38E';
 for(const ring of [p.ring,...p.holes])for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dv=b[1]-a[1],length=Math.hypot(dx,dv),yaw=Math.atan2(-dv,dx),u=(a[0]+b[0])/2,v=(a[1]+b[1])/2;
  // The portico remains open below its first floor, rather than a painted arch.
  const open=!medical&&v>-22 || medical&&Math.abs(u)<8.5&&v>0;
  const bottom=open?5.2:0;
  K.box(u,v,bottom,length,h-bottom,.45,wall,yaw);
  if(!open){const A=K.P(a[0],a[1]),B=K.P(b[0],b[1]),nx=-(B[1]-A[1])/(length||1)*.25,nz=(B[0]-A[0])/(length||1)*.25;K.k.solid([[A[0]+nx,A[1]+nz],[B[0]+nx,B[1]+nz],[B[0]-nx,B[1]-nz],[A[0]-nx,A[1]-nz]],h);}
  for(const y of medical?[4.1,8.3,12.6]:[5.1,10.1])K.box(u,v,y,length+.2,.22,.65,medical?'#D2DBD5':'#F4E1BE',yaw);
  if(length>3)for(let n=0;n<Math.floor(length/4);n++){
   const t=(n+.5)/Math.floor(length/4),x=a[0]+dx*t,z=a[1]+dv*t;
   for(const y of medical?[2.4,6.5,10.6]:[2.8,7.9])if(!(open&&y<5.2)){
    K.box(x,z,y-1,2,2.1,.55,medical?'#42656B':'#4F3F35',yaw);
    K.box(x,z,y+1.1,2.4,.14,.8,medical?'#C4D1CE':'#E8CD9F',yaw);
   }
  }
 }
 roof(K,p.ring,p.holes,h,medical?'#B5C3BD':'#C9A887');
}
function arch(K:Kit,u:number,v:number,y:number,w:number,h:number,color:string,pointed=false){
 // A real arch rim with open space, not an opaque black decal.
 const shape=new THREE.Shape(),r=w/2,inner=r-.2,base=h-r;
 if(pointed){
  shape.moveTo(-r,0);shape.lineTo(-r,base);shape.quadraticCurveTo(-r,h-.6,0,h);shape.quadraticCurveTo(r,h-.6,r,base);shape.lineTo(r,0);shape.lineTo(inner,0);shape.lineTo(inner,base);shape.quadraticCurveTo(inner,h-.75,0,h-.25);shape.quadraticCurveTo(-inner,h-.75,-inner,base);shape.lineTo(-inner,0);shape.closePath();
 }else{shape.moveTo(-r,0);shape.lineTo(-r,base);shape.absarc(0,base,r,Math.PI,0,true);shape.lineTo(r,0);shape.lineTo(inner,0);shape.lineTo(inner,base);shape.absarc(0,base,inner,0,Math.PI,false);shape.lineTo(-inner,0);shape.closePath();}
 const g=new THREE.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:false,curveSegments:10}),p=K.P(u,v);const flat=g.index?g.toNonIndexed():g;K.k.B.st.add(toTpl(flat),p[0],y,p[1],1,1,1,color,{ry:K.ry0});if(flat!==g)flat.dispose();g.dispose();
}
function palm(K:Kit,u:number,v:number){
 const [x,z]=K.P(u,v);if(K.k.road(x,z,1.1))return;
 K.cyl(u,v,0,.22,6.5,'#9B8E74');K.sph(u,v,6.8,1.7,'#365F38',0,.6);
 for(let n=0;n<8;n++){const a=n*Math.PI/4;K.box(u+Math.cos(a)*1.4,v+Math.sin(a)*1.4,6.8,3,.08,.65,'#47773E',a);}
 K.k.obstacle(x,z,.28,6.5);
}
function nizam(K:Kit){
 shell(K,'nizam_college');
 // Raised peach portico: white/orange pilasters, dark shutters, flat parapet.
 for(const x of [-6.2,6.2]){K.box(x,-9,0,.8,5.4,18,'#E5B083');for(const z of [-.5,-17.5])K.box(x,z,0,1.1,5.4,1.1,'#F0DEC1');}
 for(const x of [-3.1,3.1])arch(K,x,.05,0,5.4,5.1,'#F2DFC0');
 K.box(0,-9,5.2,14.3,8.9,18.8,'#EDB797');
 for(const x of [-6.6,0,6.6])K.box(x,.6,5.3,.45,8.8,.4,'#F5E5C9');
 for(const x of [-3.3,3.3])for(const y of [7.2,10.5]){K.box(x,.66,y,2.1,1.5,.15,'#493C36');K.box(x,.92,y+1.45,2.5,.12,.65,'#DBBE93');}
 for(const y of [5.3,13.8,14.3])K.box(0,-9,y,14.8,.22,19.3,'#F2DDB6');
 K.board('NIZAM COLLEGE',0,1,4.3,7,.65,'#EAC297','#384D69');
 // Shield/emblem sits on the portico, where it appears in the college photos.
 K.box(0,.9,3.9,1.2,1.3,.14,'#4F7D99');K.cyl(0,1,4.3,.28,.08,'#DCC071');
 for(const x of [-15,-9,9,15])palm(K,x,9);
 const p=K.P(0,16);if(!K.k.road(...p,2)){K.cyl(0,16,-.02,4,.2,'#B9CEC0');K.cyl(0,16,.12,3.6,.08,'#6AA8B2');}
 const gate=COLLEGE_CAMPUSES.nizam_college.gate!,center=K.P(gate[0],gate[1]),G=new Kit(center[0],center[1],COLLEGE_CAMPUSES.nizam_college.gateRotation,K.k);
 for(const x of [-5.8,5.8]){G.box(x,0,0,.85,4.7,.9,'#BFBDB3');G.solidRect(x,0,.85,.9,4.7);}
 G.board('NIZAM COLLEGE',0,.1,4.9,11,.85,'#18395B');
 for(const side of [-1,1]){
  const hinge=G.P(side*5.3,0),leaf=new Kit(hinge[0],hinge[1],COLLEGE_CAMPUSES.nizam_college.gateRotation-side*65,G.k),direction=-side;
  for(const u of [1.25,3.75]){const x=u*direction;
   leaf.box(x,0,0,2.35,.5,.14,'#193E68');leaf.box(x,0,3.1,2.35,.28,.14,'#193E68');for(const side of [-1,1])leaf.box(x+side*1.12,0,.45,.12,2.7,.14,'#193E68');arch(leaf,x,.04,.5,2.25,2.6,'#B8BEAF',true);
   for(let n=-2;n<=2;n++)leaf.box(x+n*.4,0,.5,.045,2.6,.1,'#C0C7B9');
   for(const y of [.9,1.5,2.1])leaf.box(x,0,y,2.2,.04,.1,'#B8BEAF');
  }
  for(let u=.2;u<5.1;u+=.45)leaf.box(u*direction,0,3.05,.07,.7,.1,'#A9B4B3');
 }

}
function medical(K:Kit){
 shell(K,'osmania_medical');
 // Tall recessed glazing with geometric cream/octagonal tile piers.
 for(const x of [-7,7]){
  K.box(x,1.5,0,4.5,20.5,1.1,'#DFE5D7');
  for(let row=0;row<10;row++){
   const z=2.12,y=1+row*1.85;K.box(x,z,y,4.35,.8,.09,'#737B78');
   const tile=new THREE.CircleGeometry(.98,8);tile.rotateZ(Math.PI/8);tile.rotateY(Math.PI);const t=K.P(x,z+.11),flat=tile.toNonIndexed();K.k.B.st.add(toTpl(flat),t[0],y+.85,t[1],1,1,1,'#E7E8D7',{ry:K.ry0});flat.dispose();tile.dispose();
   K.box(x,z+.08,y+.05,.45,.45,.08,'#A78F78');
   for(const side of [-1,1])K.box(x+side*1.5,z+.08,y+.85,1.8,.14,.1,'#ABB6AE',side*.45);
  }
 }
 K.box(0,1.6,4.5,9.5,13.4,.3,'#688484');
 for(let x=-4.5;x<=4.6;x+=1.5)K.box(x,1.85,4.5,.12,13.4,.2,'#BECBC7');
 for(let y=4.7;y<18;y+=2.6)K.box(0,1.9,y,9.4,.14,.22,'#BFCAC3');
 K.box(0,1.2,18.1,18.8,2.7,2.4,'#DCE3D4');
 for(let x=-6;x<=6;x+=1.2)K.box(x,2.48,18.9,.55,1.2,.15,'#3A5554');
 K.box(0,4.4,3.7,17.5,.55,6.4,'#DEE1D2');
 for(const x of [-6.2,6.2]){K.box(x,6.4,0,.4,3.7,.4,'#394849');K.solidRect(x,6.4,.4,.4,3.7);}
 K.board('OSMANIA MEDICAL COLLEGE',0,7.8,5.4,17,1.0,'#D7DFD6','#C3A552');
 K.box(0,1.6,0,8,3.5,.18,'#3B5C5B');
 // Courtyard planting is kept beside the drive; the two mapped inner courts
 // remain open to the sky in both render geometry and collision support.
 for(const u of [-16,16])for(const v of [8,17])palm(K,u,v);
}
export function drawCollegeCampus(K:Kit,id:CollegeCampusId){
 const r=COLLEGE_CAMPUSES[id].rotation*Math.PI/180;K.c=Math.cos(r);K.s=Math.sin(r);K.ry0=-r;
 if(id==='nizam_college')nizam(K);else medical(K);
}

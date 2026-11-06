import * as THREE from 'three';
import { TPL } from '../core/util';
import type { Kit } from './landmarks';

// Reviewed against the Department of Language and Culture, Government of
// Telangana photograph captured2023-06-22, not a generic standing-man pose.
// https://commons.wikimedia.org/wiki/File:125_feet_Ambedkar_Statue_in_Hyderabad,_Telangana_01.jpg
// The raised right index is above the head; the left arm cradles the Constitution.
//125ft is the published statue height.50ft pedestal dimensions are reported
// project dimensions, not a new survey. Fine likeness/reliefs remain stylised.
// Horizontal radii are stylised proportions estimated from the photograph;
// only statue and pedestal heights below are published project dimensions.
export const AMBEDKAR_MONUMENT = Object.freeze({ statueHeight:125*.3048, pedestalHeight:50*.3048, pedestalRadius:26.21, terraceRadius:11.28 });
export const AMBEDKAR_POSE = Object.freeze({
  shoulder:[-3.5,.2,25.5] as const, elbow:[-6.2,1.4,29] as const,
  wrist:[-8.8,3,34.4] as const, fingertip:[-11.25,4.15,37.93] as const,
  headTop:35.6, bookSide:1, pointingSide:-1,
});
type Point=readonly [number,number,number]; // local u,v,height

export function drawAmbedkarMonument(K:Kit) {
  const bronze='#8b7160',light='#a58a72',dark='#685341',stone='#e2d6bd',red='#9b6450';
  const {pedestalHeight:base,pedestalRadius:R,terraceRadius:terrace}=AMBEDKAR_MONUMENT;
  K.cyl(0,0,0,R,.9,red,'cyl24'); K.cyl(0,0,.9,R-.8,base-2.1,stone,'cyl24');
  for(let i=0;i<44;i++) {const a=i*Math.PI*2/44;K.cyl(Math.cos(a)*(R-.6),Math.sin(a)*(R-.6),1.15,.46,base-2.65,'#eee4d1','cyl8');}
  K.cyl(0,0,base-1.25,R+.1,.65,red,'cyl24');K.cyl(0,0,base-.6,terrace,.6,stone,'cyl24');
  K.solidCircle(0,0,R,base-.6,24);K.solidCircle(0,0,terrace,base,24);
  const old=K.y0; K.y0+=base;
  // A continuous rounded bronze limb between photographed joint positions.
  const limb=(a:Point,b:Point,r:number,color=bronze)=>{
    const[ax,az]=K.P(a[0],a[1]),[bx,bz]=K.P(b[0],b[1]);
    const from=new THREE.Vector3(ax,K.y0+a[2],az),to=new THREE.Vector3(bx,K.y0+b[2],bz),delta=to.clone().sub(from),length=delta.length();
    if(length<1e-6)return;
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.multiplyScalar(1/length));
    const matrix=new THREE.Matrix4().compose(from.add(to).multiplyScalar(.5),q,new THREE.Vector3(r,length,r));
    K.k.B.st.addTpl(TPL.cyl,matrix,color);
  };
  const ellipsoid=(u:number,v:number,y:number,rx:number,ry:number,rz:number,color=bronze)=>{const[x,z]=K.P(u,v);K.k.B.st.add(TPL.sph,x,K.y0+y,z,rx,ry,rz,color,{ry:K.ry0});};
  for(const s of [-1,1]) {
    ellipsoid(s*1.35,1.0,.65,1.2,.65,2.4,dark);
    limb([s*1.35,0,1.2],[s*1.25,-.1,16],1.18);
    ellipsoid(s*1.25,0,9,1.25,7.5,1.3); K.solidRect(s*1.35,.7,2.4,4.7,1.3);
  }
  // Two-button suit, trousers and open lapels, rather than a full-length robe.
  ellipsoid(0,-.1,20,3.7,7.8,2.2);
  K.shape('robe',0,-.15,13.4,7.3,14,4.6,bronze);
  K.box(0,2.08,17.2,.12,9.5,.12,dark);
  for(const s of [-1,1]) {K.box(s*2.2,2.02,15.3,1.5,.14,.18,dark);limb([s*.8,2.0,26.4],[s*2.2,2.1,22.3],.13,light);}
  K.shape('cone',0,2.22,21.8,.55,4.9,.15,dark);K.box(0,2.23,26.2,.8,.8,.18,light);
  for(const y of [18.5,20.5])ellipsoid(.35,2.22,y,.13,.13,.1,dark);
  // Left forearm across the book, with a visible thumb and four curled fingers.
  limb([3.4,.2,25.4],[5.25,1.6,20.2],1.2);
  K.box(3.65,2.35,19.4,4.1,8,.85,dark);K.box(3.65,2.86,19.65,3.8,7.5,.12,light);
  limb([5.25,1.6,20.2],[3.2,3.18,22.5],1.1);
  ellipsoid(2.7,3.3,22.8,1.3,.9,.55);
  for(let i=0;i<4;i++)limb([1.85+i*.35,3.64,22.45],[2.15+i*.35,3.64,23.3],.16,light);
  limb([3.6,3.34,22.9],[3.3,3.6,24.1],.23);
  // Right arm rises and points above the head, as in the original photograph.
  limb(AMBEDKAR_POSE.shoulder,AMBEDKAR_POSE.elbow,1.35);
  limb(AMBEDKAR_POSE.elbow,AMBEDKAR_POSE.wrist,1.08);
  ellipsoid(-9.05,3.2,34.8,.82,1.05,.72);
  limb([-9.45,3.45,35.35],AMBEDKAR_POSE.fingertip,.17,light);
  ellipsoid(...AMBEDKAR_POSE.fingertip,.17,.17,.17,light);
  for(let i=0;i<3;i++)ellipsoid(-9.8+i*.38,3.7,35.15+i*.16,.28,.38,.27);
  limb([-8.55,3.5,34.65],[-9.35,3.9,35.5],.27);
  // Head, combed hair, facial relief and two separate round spectacle rims.
  K.cyl(0,0,26.8,1.05,2.1,bronze,'cyl10');
  ellipsoid(0,.15,31.5,2.15,3.0,1.85);
  ellipsoid(0,-.2,33.75,2.08,1.85,1.8,dark);
  ellipsoid(0,1.65,30.45,1.4,1.15,.7);ellipsoid(0,2.03,31.75,.37,.72,.55,light);
  for(const s of [-1,1]) {ellipsoid(s*2.0,.05,31.4,.36,.72,.4);ellipsoid(s*.83,1.86,32.35,.48,.2,.18,dark);}
  limb([-.55,2.32,30.9],[.55,2.32,30.9],.07,dark);
  for(const s of [-1,1]) {
    for(let i=0;i<18;i++) {
      const a=i*Math.PI/9,b=(i+1)*Math.PI/9;
      limb([s*.9+Math.cos(a)*.82,2.08,32.6+Math.sin(a)*.67],[s*.9+Math.cos(b)*.82,2.08,32.6+Math.sin(b)*.67],.065,dark);
    }
    limb([s*.16,2.08,32.7],[s*.04,2.21,32.75],.07,dark);
    limb([s*1.68,2.02,32.7],[s*2.0,.1,32.6],.07,dark);
  }
  K.ob(0,0,4.2,AMBEDKAR_MONUMENT.statueHeight);
  K.y0=old;
}

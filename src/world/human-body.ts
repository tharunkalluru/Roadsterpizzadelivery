import * as THREE from 'three';
import {toTpl,type Tpl} from '../core/util';
import source from './npc-human-v4.json';
import type {HumanPartSink} from './human-anatomy';
import {HUMAN_BONES,humanSeatMatrices,poseHumanPositions,rigidHumanTemplate,type HumanTemplate} from './human-skin';
import {TPL} from '../core/util';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
export interface HumanBodyLook {kind:string;female:boolean;age:'child'|'teen'|'adult'|'elder';build?:string;skin:string;hair?:string;a:string;b:string;c:string;sleeve?:string;face?:number;hairstyle?:number;facialHair?:boolean;walk?:number;bindi?:boolean;s?:number}
export type HumanSeat='bike'|'scooter'|'auto'|'bench'|'pillion'|'pillionSide'|'scooterPillion'|'rickshawDriver'|'rickshawPassenger';
type Region='skin'|'top'|'pants'|'shoes'|'socks';
type NativeData=typeof source.human;
const bodies=new Map<string,Record<string,HumanTemplate>>();
const B=HUMAN_BONES;
const limbIds=[B.armL,B.elbowL,B.handL,B.armR,B.elbowR,B.handR];
const headIds=[B.neck,B.head];
const influence=(data:NativeData,id:number,bones:readonly number[])=>{let value=0;for(let j=0;j<4;j++)if(bones.includes(data.skinIndex[id*4+j]))value+=data.skinWeight[id*4+j];return value;};
function variant(look:HumanBodyLook,low:boolean){const data=low?source.humanLow:source.human,key=`${look.female?'female':'male'}-${look.age==='elder'?'old':look.age==='child'?'child':'young'}` as keyof typeof data.positions,p=data.positions[key],child=data.positions[`${look.female?'female':'male'}-child`];return Float32Array.from(p,(v,i)=>look.age==='teen'?v*.76+child[i]*.24:v);}
export function humanHeadAnchor(look:Pick<HumanBodyLook,'female'|'age'>,seat?:HumanSeat){const key=`${look.female?'female':'male'}-${look.age==='elder'?'old':look.age==='child'?'child':'young'}` as keyof typeof source.headAnchors,p=source.headAnchors[key],c=source.headAnchors[`${look.female?'female':'male'}-child`],v=new THREE.Vector3(...p.map((v,i)=>look.age==='teen'?v*.76+c[i]*.24:v) as [number,number,number]);if(seat)v.applyMatrix4(humanSeatMatrices(seat)[B.head]);return v;}
function templateParts(look:HumanBodyLook,low:boolean,seat?:HumanSeat){const key=[look.female,look.age,look.kind,look.sleeve,look.hairstyle??0,look.facialHair,low,seat??'standing',seat?look.s:1].join(':'),cached=bodies.get(key);if(cached)return cached;
 const data=low?source.humanLow:source.human,rest=variant(look,low),anchor=humanHeadAnchor(look),k=look.kind,long=['salwar','kurta_cap','elder_m','burqa'].includes(k),wrapped=['sari','elder_f','lungi'].includes(k),closedShoes=!['sari','elder_f','lungi','burqa','salwar','elder_m','kurta_cap'].includes(k),hem=k==='burqa'?.055:.58;
 const positions=seat?poseHumanPositions(rest,data.skinIndex,data.skinWeight,humanSeatMatrices(seat,look.s??1)):rest,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(data.indices);g.computeVertexNormals();
 const normals=g.getAttribute('normal'),parts:Record<string,{p:number[];n:number[];ids:number[];weights:number[]}>=Object.fromEntries(['skin','top','pants','shoes','socks','hair','lips'].map(key=>[key,{p:[],n:[],ids:[],weights:[]}])) as any;
 const add=(region:string,ids:number[])=>{for(const i of ids){parts[region].p.push(positions[i*3],positions[i*3+1],positions[i*3+2]);parts[region].n.push(normals.getX(i),normals.getY(i),normals.getZ(i));for(let j=0;j<4;j++){parts[region].ids.push(data.skinIndex[i*4+j]);parts[region].weights.push(data.skinWeight[i*4+j]);}}};
 type V={p:number[];n:number[];ids:number[];weights:number[];r:number[];arm:number;neck:number};
 const point=(i:number):V=>({p:Array.from(positions.slice(i*3,i*3+3)),n:[normals.getX(i),normals.getY(i),normals.getZ(i)],ids:data.skinIndex.slice(i*4,i*4+4),weights:data.skinWeight.slice(i*4,i*4+4),r:Array.from(rest.slice(i*3,i*3+3)),arm:influence(data,i,limbIds),neck:influence(data,i,headIds)});
 const interpolate=(a:V,b:V,t:number):V=>{const all=new Map<number,number>();for(let j=0;j<4;j++){all.set(a.ids[j],(all.get(a.ids[j])??0)+a.weights[j]*(1-t));all.set(b.ids[j],(all.get(b.ids[j])??0)+b.weights[j]*t);}const ordered=[...all].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ordered.reduce((s,v)=>s+v[1],0);return{p:a.p.map((v,i)=>v+(b.p[i]-v)*t),n:a.n.map((v,i)=>v+(b.n[i]-v)*t),r:a.r.map((v,i)=>v+(b.r[i]-v)*t),arm:a.arm+(b.arm-a.arm)*t,neck:a.neck+(b.neck-a.neck)*t,ids:Array.from({length:4},(_,i)=>ordered[i]?.[0]??0),weights:Array.from({length:4},(_,i)=>(ordered[i]?.[1]??0)/total)};};
 // Split by an anatomical scalar evaluated at both edge endpoints. Both
 // adjoining material regions retain precisely the same interpolated surface
 // and source weights; no centroid-based teeth or broad shoulder-height mask.
 const clipped=(poly:V[],field:(v:V)=>number,positive=true)=>{const out:V[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=field(a),fb=field(b),inside=positive?fa>=0:fa<=0,next=positive?fb>=0:fb<=0;if(inside)out.push(a);if(inside!==next)out.push(interpolate(a,b,fa/(fa-fb)));}return out;};
 const addPolygon=(region:string,poly:V[])=>{for(let i=1;i<poly.length-1;i++)for(const v of [poly[0],poly[i],poly[i+1]]){parts[region].p.push(...v.p);parts[region].n.push(...v.n);parts[region].ids.push(...v.ids);parts[region].weights.push(...v.weights);}};
 const sleeveEnd=look.sleeve==='long'||k==='burqa'||k==='kurta_cap'||k==='elder_m'?.87:1.15;
 const emitSurface=(poly:V[])=>{
  if(poly.length<3)return;
  const neckField=(v:V)=>v.neck-.46,head=clipped(poly,neckField),body=clipped(poly,neckField,false);
  if(head.length>=3){const key=`${look.female?'female':'male'}-${look.age==='elder'?'old':look.age==='child'?'child':'young'}` as keyof typeof source.mouths,mouth=source.mouths[key]*1.025;
   const hairField=(v:V)=>{const ry=v.r[1]-anchor.y,rz=v.r[2]-anchor.z,front=blend(.025,.075,-rz),line=.03+front*((look.hairstyle??0)%3===1?.08:.065);return k==='burqa'?Math.max(ry-.09,rz+.065,Math.abs(v.r[0])-.066):ry-line;};
   addPolygon('hair',clipped(head,hairField));let face=clipped(head,hairField,false);
   if(look.facialHair&&!look.female&&look.age==='elder'){
    const beard=(v:V)=>Math.min(mouth-.006-(v.r[1]-anchor.y),(v.r[1]-anchor.y)-(mouth-.045),-.035-(v.r[2]-anchor.z),.058-Math.abs(v.r[0]));
    addPolygon('hair',clipped(face,beard));face=clipped(face,beard,false);
   }
   addPolygon('skin',face);
  }
  // The arm identity travels with the source bone weights, so a long sleeve
  // cannot be cut by a torso/pants rule on a bent elbow or broad shoulder.
  const handField=(v:V)=>Math.min((sleeveEnd-v.r[1])*8,v.arm-.12),bare=clipped(body,handField),dressed=clipped(body,handField,false);
  addPolygon('skin',bare);
  const waist=(v:V)=>Math.max(v.r[1]-.975,(v.arm-.12)*.4);addPolygon('top',clipped(dressed,waist));let lower=clipped(dressed,waist,false);
  if(k.startsWith('school')){addPolygon('pants',clipped(lower,v=>v.r[1]-.76));lower=clipped(lower,v=>v.r[1]-.76,false);addPolygon('skin',clipped(lower,v=>v.r[1]-.20));addPolygon('socks',clipped(lower,v=>v.r[1]-.20,false));}
  else if(!closedShoes){addPolygon('skin',clipped(lower,v=>.10-v.r[1]));addPolygon('pants',clipped(lower,v=>v.r[1]-.10));}
  else addPolygon('pants',lower);
 };
 for(let t=0;t<data.indices.length;t+=3){let poly=data.indices.slice(t,t+3).map(point);
  if(closedShoes){const foot=(v:V)=>v.r[1]-.10;poly=clipped(poly,foot);}
  if(long||wrapped){
   // Only replace the lower tunic/wrap. The anatomically fitted native chest,
   // shoulders and sleeves remain a continuous surface above its waist seam.
   const bottom=long?hem-.012:k==='lungi'?.30:.065,fields=[(v:V)=>v.r[1]-bottom,(v:V)=>.993-v.r[1],(v:V)=>.18-v.arm];
   for(const field of fields){emitSurface(clipped(poly,field,false));poly=clipped(poly,field);}
  }else emitSurface(poly);
 }
 const result=Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,{pos:Float32Array.from(v.p),nor:Float32Array.from(v.n),uv:new Float32Array(v.p.length/3*2),count:v.p.length/3,skinIndex:Uint16Array.from(v.ids),skinWeight:Float32Array.from(v.weights)}])) as Record<string,HumanTemplate>;
 g.dispose();bodies.set(key,result);while(bodies.size>40)bodies.delete(bodies.keys().next().value!);return result;
}
type ClothRole='tunic'|'wrap'|'drape';
const blend=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function weightedCloth(template:Tpl,rest:Float32Array,data:NativeData,role:ClothRole):HumanTemplate{
 const ids:number[]=[],weights:number[]=[];
 for(let i=0;i<template.count;i++){
  const x=template.pos[i*3],y=template.pos[i*3+1],z=template.pos[i*3+2],values=new Map<number,number>(),core=blend(.93,1.28,y);
  if(y>=.98||role==='drape'){values.set(B.hips,1-core);values.set(B.spine,core);}
  else {
   // Cloth around the torso/lap is never bound to hands or sleeves. A short
   // tunic ends above the knee and therefore never inherits knee/ankle bones.
   const front=1-blend(-.04,.10,z),amount=role==='tunic'?Math.min(.72,(.98-y)/.42)*(.38+.62*front):.40+.40*front;
   const right=blend(-.11,.11,x),knee=role==='wrap'?1-blend(.22,.56,y):0;
   values.set(B.hips,1-amount);values.set(B.thighL,amount*(1-right)*(1-knee));values.set(B.thighR,amount*right*(1-knee));
   if(knee){values.set(B.kneeL,amount*(1-right)*knee);values.set(B.kneeR,amount*right*knee);}
  }
  const ordered=[...values].filter(v=>v[1]>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),total=ordered.reduce((s,v)=>s+v[1],0);
  for(let j=0;j<4;j++){ids.push(ordered[j]?.[0]??0);weights.push((ordered[j]?.[1]??0)/total);}
 }
 return {...template,skinIndex:Uint16Array.from(ids),skinWeight:Float32Array.from(weights)};
}
function fitGarmentSeam(template:HumanTemplate,rest:Float32Array,data:NativeData):HumanTemplate{
 const g=new THREE.BufferGeometry(),triangles:number[]=[];g.setAttribute('position',new THREE.BufferAttribute(rest,3));
 for(let i=0;i<data.indices.length;i+=3){const ix=data.indices.slice(i,i+3);if(ix.reduce((s,j)=>s+influence(data,j,limbIds),0)/3>.18)continue;triangles.push(...ix);}g.setIndex(triangles);g.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,material),ray=new THREE.Raycaster(),p=new THREE.Vector3(),direction=new THREE.Vector3(),positions=Float32Array.from(template.pos),ids=Uint16Array.from(template.skinIndex!),weights=Float32Array.from(template.skinWeight!),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),bc=new THREE.Vector3();
 for(let i=0;i<template.count;i++){
  const y=positions[i*3+1],amount=blend(.90,.993,y);if(!amount)continue;
  direction.set(positions[i*3],0,positions[i*3+2]).normalize();ray.set(p.set(0,y,0),direction);const hit=ray.intersectObject(mesh,false)[0];if(!hit?.face)continue;
  p.copy(hit.point).addScaledVector(direction,.006);positions[i*3]+=(p.x-positions[i*3])*amount;positions[i*3+2]+=(p.z-positions[i*3+2])*amount;
  const face=hit.face;THREE.Triangle.getBarycoord(hit.point,a.fromArray(rest,face.a*3),b.fromArray(rest,face.b*3),c.fromArray(rest,face.c*3),bc);
  const values=new Map<number,number>();for(let j=0;j<4;j++)values.set(ids[i*4+j],(values.get(ids[i*4+j])??0)+weights[i*4+j]*(1-amount));
  for(const [v,w] of [[face.a,bc.x],[face.b,bc.y],[face.c,bc.z]])for(let j=0;j<4;j++){const bone=data.skinIndex[v*4+j];values.set(bone,(values.get(bone)??0)+data.skinWeight[v*4+j]*w*amount);}
  const sorted=[...values].filter(([,v])=>v>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),total=sorted.reduce((s,v)=>s+v[1],0);for(let j=0;j<4;j++){ids[i*4+j]=sorted[j]?.[0]??0;weights[i*4+j]=(sorted[j]?.[1]??0)/total;}
 }
 g.dispose();material.dispose();return smoothHumanTemplate({...template,pos:positions,skinIndex:ids,skinWeight:weights});
}
function smoothHumanTemplate(template:HumanTemplate):HumanTemplate{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(template.pos),3));g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array.from(template.skinIndex!),4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from(template.skinWeight!),4));
 const joined=mergeVertices(g,1e-5);joined.computeVertexNormals();const ids:number[]=[],weights:number[]=[],a=joined.getAttribute('skinIndex'),b=joined.getAttribute('skinWeight'),index=joined.getIndex();for(let i=0;i<(index?.count??a.count);i++){const j=index?index.getX(i):i;for(let n=0;n<4;n++){ids.push(a.array[j*4+n]);weights.push(b.array[j*4+n]);}}
 const result={...toTpl(joined),skinIndex:Uint16Array.from(ids),skinWeight:Float32Array.from(weights)};g.dispose();joined.dispose();return result;
}
function poseTemplate(template:HumanTemplate,seat:HumanSeat,scale=1):HumanTemplate{const matrices=humanSeatMatrices(seat,scale),positions=poseHumanPositions(template.pos,template.skinIndex!,template.skinWeight!,matrices),normalMatrices=matrices.map(m=>new THREE.Matrix3().getNormalMatrix(m)),normals=new Float32Array(template.nor.length),n=new THREE.Vector3(),sum=new THREE.Vector3();for(let i=0;i<template.count;i++){sum.set(0,0,0);for(let j=0;j<4;j++){const w=template.skinWeight![i*4+j];if(w)sum.addScaledVector(n.set(template.nor[i*3],template.nor[i*3+1],template.nor[i*3+2]).applyMatrix3(normalMatrices[template.skinIndex![i*4+j]]),w);}sum.normalize();normals.set([sum.x,sum.y,sum.z],i*3);}return {...template,pos:positions,nor:normals};}
const dressedTemplates=new Map<string,HumanTemplate>();
const boundOutfits=new Map<string,HumanTemplate>();
function outfit(template:Tpl,key:string,look:HumanBodyLook,low:boolean,seat?:HumanSeat,role:ClothRole='drape'){const bindKey=[key,look.female,look.age,low,role].join(':'),cacheKey=[bindKey,seat,seat?look.s:1].join(':'),cached=dressedTemplates.get(cacheKey);if(cached)return cached;let weighted=boundOutfits.get(bindKey);if(!weighted){const rest=variant(look,low),data=low?source.humanLow:source.human;weighted=fitGarmentSeam(weightedCloth(template,rest,data,role),rest,data);boundOutfits.set(bindKey,weighted);while(boundOutfits.size>32)boundOutfits.delete(boundOutfits.keys().next().value!);}const result=seat?poseTemplate(weighted,seat,look.s??1):weighted;dressedTemplates.set(cacheKey,result);while(dressedTemplates.size>64)dressedTemplates.delete(dressedTemplates.keys().next().value!);return result;}
type Ring=readonly[y:number,w:number,d:number,z?:number];
const garments=new Map<string,Tpl>();
/** Closed elliptical garment, including slight integrated pleats and a curved
 * shoulder/waist profile. The rear is closed; it is not a flat front polygon. */
function garment(key:string,rings:Ring[],sides:number,pleats=0):Tpl{const cached=garments.get(key);if(cached)return cached;const dense:Ring[]=[];for(let i=0;i<rings.length-1;i++){const a=rings[i],b=rings[i+1],steps=Math.max(1,Math.ceil((b[0]-a[0])/.055));for(let j=0;j<steps;j++){const t=j/steps;dense.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,(a[3]??0)+((b[3]??0)-(a[3]??0))*t]);}}dense.push(rings[rings.length-1]);rings=dense;const p:number[]=[],ix:number[]=[];for(let r=0;r<rings.length;r++){const[y,w,d,z=0]=rings[r];for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,fold=1+pleats*Math.cos(a*12);p.push(Math.sin(a)*w*fold,y,Math.cos(a)*d*fold+z);if(r){const b=(r-1)*sides+j,c=(r-1)*sides+(j+1)%sides;ix.push(b,c,r*sides+j,c,r*sides+(j+1)%sides,r*sides+j);}}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();const t=toTpl(g);g.dispose();garments.set(key,t);return t;}
function ribbon(key:string,points:number[][],width:number,low:boolean):Tpl{const cached=garments.get(key);if(cached)return cached;const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),steps=low?16:24,sides=low?6:8,p:number[]=[],ix:number[]=[];
 for(let i=0;i<=steps;i++){const c=curve.getPoint(i/steps),t=curve.getTangent(i/steps),across=new THREE.Vector3(t.y,-t.x,0).normalize();for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,w=width*(.85+.15*Math.cos(i/steps*Math.PI))*Math.sin(a);p.push(c.x+across.x*w*.5,c.y+across.y*w*.5,c.z+Math.cos(a)*.006);if(i){const b=(i-1)*sides+j,n=(i-1)*sides+(j+1)%sides;ix.push(b,n,i*sides+j,n,i*sides+(j+1)%sides,i*sides+j);}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();const result=toTpl(g);g.dispose();garments.set(key,result);return result;}
const eyeDisk=toTpl(new THREE.CircleGeometry(1,8).rotateY(Math.PI));
const browTpl=toTpl(new THREE.BoxGeometry(1,1,1));
const shoeTemplates=new Map<string,HumanTemplate>();
/** The shoe is the convex outer envelope of this morph's native foot, with a
 * small ankle collar and a flat sole. It is not a scaled ball over the toes. */
function fittedShoe(look:HumanBodyLook,low:boolean,side:number):HumanTemplate{
 const key=[look.female,look.age,low,side].join(':'),cached=shoeTemplates.get(key);if(cached)return cached;
 const data=low?source.humanLow:source.human,rest=variant(look,low),bone=side<0?B.ankleL:B.ankleR,points:THREE.Vector3[]=[];let ankleX=side*.085;
 for(let i=0;i<rest.length/3;i++)if(side*rest[i*3]>0&&influence(data,i,[bone])>.55&&rest[i*3+1]<.105){const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];points.push(new THREE.Vector3(x+side*.003,Math.max(.015,y+.006),z));if(y>.075)ankleX=x;}
 // Keep the source footprint and toe length. Only the upper is lofted over
 // individual toes, closing toe valleys into a normal shoe toe box.
 for(const p of [...points])if(p.y<.055)points.push(new THREE.Vector3(p.x,Math.min(.075,p.y+.036),p.z));
 for(let j=0;j<12;j++){const a=j/12*Math.PI*2;points.push(new THREE.Vector3(side*.085+Math.sin(a)*.031,.115,Math.cos(a)*.034));}
 const g=new ConvexGeometry(points),result=rigidHumanTemplate(toTpl(g),bone);g.dispose();shoeTemplates.set(key,result);return result;
}
function scalpAnchor(look:HumanBodyLook,low:boolean){const data=low?source.humanLow:source.human,rest=variant(look,low),head=humanHeadAnchor(look);let best=-Infinity,result=new THREE.Vector3(0,head.y+.035,head.z+.065);for(let i=0;i<rest.length/3;i++){if(influence(data,i,[B.head])<.7||Math.abs(rest[i*3])>.035||Math.abs(rest[i*3+1]-head.y-.035)>.035)continue;if(rest[i*3+2]>best){best=rest[i*3+2];result.set(0,rest[i*3+1],rest[i*3+2]);}}return result;}
function fittedRings(look:HumanBodyLook,low:boolean,rings:Ring[]):Ring[]{const data=low?source.humanLow:source.human,rest=variant(look,low);return rings.map(([y,w,d,z=0])=>{let rw=w,rd=d;for(let i=0;i<rest.length/3;i++){if(Math.abs(rest[i*3+1]-y)>.048||influence(data,i,limbIds)>.3||influence(data,i,[B.head])>.3)continue;rw=Math.max(rw,Math.abs(rest[i*3])+.014);rd=Math.max(rd,Math.abs(rest[i*3+2]-z)+.014);}return[y,rw,rd,z];});}
const conformedRibbons=new Map<string,Tpl>();
function conformRibbon(template:Tpl,key:string,look:HumanBodyLook,low:boolean,robe=false):Tpl{const cacheKey=[key,look.female,look.age,low,robe].join(':'),cached=conformedRibbons.get(cacheKey);if(cached)return cached;const rest=variant(look,low),positions=Float32Array.from(template.pos),rings=robe?fittedRings(look,low,[[.565,.225,.17],[.94,.205,.16],[1.12,.21,.16],[1.28,.225,.16],[1.365,.215,.13],[1.42,.065,.07]]):null;
 for(let i=0;i<template.count;i++){const x=positions[i*3],y=positions[i*3+1],original=positions[i*3+2],sign=original<0?-1:1;let surface=original;
  if(rings){let r=0;while(r<rings.length-2&&y>rings[r+1][0])r++;const a=rings[r],b=rings[r+1],t=Math.max(0,Math.min(1,(y-a[0])/(b[0]-a[0]))),w=a[1]+(b[1]-a[1])*t,d=a[2]+(b[2]-a[2])*t;surface=sign*d*Math.sqrt(Math.max(.02,1-(x/w)**2));}
  else {const near:{d:number;z:number}[]=[];for(let j=0;j<rest.length/3;j++){if(sign*rest[j*3+2]<0||Math.abs(rest[j*3+1]-y)>.10)continue;const d=(rest[j*3]-x)**2+2*(rest[j*3+1]-y)**2;if(near.length<4||d<near[near.length-1].d){near.push({d,z:rest[j*3+2]});near.sort((a,b)=>a.d-b.d);if(near.length>4)near.pop();}}if(near.length){let total=0,sum=0;for(const v of near){const w=1/(v.d+.0001);sum+=v.z*w;total+=w;}surface=sum/total;}}
  const amount=blend(.02,.065,Math.abs(original));positions[i*3+2]=original+(surface+sign*.007-original)*amount+template.nor[i*3+2]*.002;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));const joined=mergeVertices(g,1e-5);joined.computeVertexNormals();const result=toTpl(joined);g.dispose();joined.dispose();conformedRibbons.set(cacheKey,result);while(conformedRibbons.size>64)conformedRibbons.delete(conformedRibbons.keys().next().value!);return result;
}
const clothPatches=new Map<string,HumanTemplate>();
/** Cut a drape from the real torso surface, retaining its exact barycentric
 * skin weights. Offset inner/outer surfaces are stitched at every open edge.
 * Unlike a separately projected ribbon, this cannot switch to the far side of
 * the chest or float off a shoulder when a seated pose bends the spine. */
function nativeClothPatch(look:HumanBodyLook,low:boolean,kind:'pallu'|'scarf'):HumanTemplate{
 const key=[look.female,look.age,low,kind].join(':'),cached=clothPatches.get(key);if(cached)return cached;
 const data=low?source.humanLow:source.human,rest=variant(look,low),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(rest,3));g.setIndex(data.indices);g.computeVertexNormals();const ns=g.getAttribute('normal');
 type V={p:THREE.Vector3;n:THREE.Vector3;w:Map<number,number>};
 const vertex=(i:number):V=>({p:new THREE.Vector3(rest[i*3],rest[i*3+1],rest[i*3+2]),n:new THREE.Vector3(ns.getX(i),ns.getY(i),ns.getZ(i)),w:new Map(Array.from({length:4},(_,j)=>[data.skinIndex[i*4+j],data.skinWeight[i*4+j]] as [number,number]))});
 const lerp=(a:V,b:V,t:number):V=>{const w=new Map<number,number>();for(const [id,v] of a.w)w.set(id,v*(1-t));for(const [id,v] of b.w)w.set(id,(w.get(id)??0)+v*t);return{p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),w};};
 const clip=(poly:V[],field:(p:THREE.Vector3)=>number)=>{const out:V[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=field(a.p),fb=field(b.p);if(fa>=0)out.push(a);if((fa>=0)!==(fb>=0))out.push(lerp(a,b,fa/(fa-fb)));}return out;};
 const verts:V[]=[],tris:number[]=[],map=new Map<string,number>();
 const index=(v:V)=>{const hash=v.p.toArray().map(n=>Math.round(n*1e6)).join(':');let id=map.get(hash);if(id===undefined){id=verts.length;map.set(hash,id);verts.push(v);}return id;};
 for(let t=0;t<data.indices.length;t+=3){const ix=data.indices.slice(t,t+3);if(ix.reduce((s,i)=>s+influence(data,i,limbIds),0)/3>.30)continue;const raw=ix.map(vertex);
  // Each boundary is a separate linear half-plane. A single abs()/distance
  // field discards triangles whose endpoints fall outside a thin band even
  // though the band crosses the triangle, leaving the former scarf islands.
  const regions:((p:THREE.Vector3)=>number)[][]=[];
  if(kind==='pallu')for(const front of [true,false]){
   const center=(p:THREE.Vector3)=>front?.115-(p.y-1.0)*.70:-.13;
   regions.push([(p)=>front?-p.z:p.z,(p)=>p.y-(front?.985:1.005),(p)=>1.405-p.y,(p)=>.060-(p.x-center(p)),(p)=>.060+(p.x-center(p))]);
  }else for(const side of [-1,1]){
   const u=(p:THREE.Vector3)=>p.y-1.25-.62*side*p.x;
   regions.push([(p)=>-p.z,(p)=>side*p.x,(p)=>.17-side*p.x,(p)=>.027-u(p),(p)=>.027+u(p)]);
  }
  for(const region of regions){let poly=raw;for(const f of region)poly=clip(poly,f);for(let i=1;i<poly.length-1;i++)tris.push(index(poly[0]),index(poly[i]),index(poly[i+1]));}
 }
 const edges=new Map<string,{a:number;b:number;n:number}>();for(let t=0;t<tris.length;t+=3)for(const [a,b] of [[tris[t],tris[t+1]],[tris[t+1],tris[t+2]],[tris[t+2],tris[t]]]){const key=a<b?`${a}:${b}`:`${b}:${a}`,edge=edges.get(key);if(edge)edge.n++;else edges.set(key,{a,b,n:1});}
 const positions:number[]=[],normals:number[]=[],ids:number[]=[],weights:number[]=[],count=verts.length,indices:number[]=[];
 for(const offset of [.009,.005])for(const v of verts){const p=v.p.clone().addScaledVector(v.n,offset);positions.push(p.x,p.y,p.z);const w=[...v.w].filter(([,w])=>w>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=w.reduce((s,v)=>s+v[1],0);for(let j=0;j<4;j++){ids.push(w[j]?.[0]??0);weights.push((w[j]?.[1]??0)/sum);}}
 for(let t=0;t<tris.length;t+=3){indices.push(tris[t],tris[t+1],tris[t+2],tris[t]+count,tris[t+2]+count,tris[t+1]+count);}for(const {a,b,n} of edges.values())if(n===1)indices.push(a,b+count,b,a,a+count,b+count);
 const mesh=new THREE.BufferGeometry();mesh.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));mesh.setIndex(indices);mesh.computeVertexNormals();const tpl=toTpl(mesh),skinIndex:number[]=[],skinWeight:number[]=[];for(const i of indices)for(let j=0;j<4;j++){skinIndex.push(ids[i*4+j]);skinWeight.push(weights[i*4+j]);}
 const result={...tpl,skinIndex:Uint16Array.from(skinIndex),skinWeight:Float32Array.from(skinWeight)};mesh.dispose();g.dispose();clothPatches.set(key,result);return result;
}
export function drawContinuousBody(put:HumanPartSink,look:HumanBodyLook,low=false,seat?:HumanSeat){
 const parts=templateParts(look,low,seat),k=look.kind,colors:Record<string,string>={skin:look.skin,top:k==='sari'||k==='elder_f'?look.b:look.a,pants:look.b,shoes:'#36312c',socks:'#d7d6cc',hair:k==='burqa'?look.a:look.hair??'#211b18',lips:`#${new THREE.Color(look.skin).multiplyScalar(.88).getHexString()}`};
 for(const region of Object.keys(parts))put(parts[region],0,0,0,1,1,1,colors[region]);
 if(!['sari','elder_f','lungi','burqa','salwar','elder_m','kurta_cap'].includes(k))for(const side of [-1,1]){let shoe=fittedShoe(look,low,side);if(seat)shoe=poseTemplate(shoe,seat,look.s??1);put(shoe,0,0,0,1,1,1,k.startsWith('school')?'#242428':'#342d28');}
 const sides=low?18:24,lookKey=`${look.female}:${look.age}:${low}`;
 if(['sari','elder_f','lungi'].includes(k)){
  const rings:Ring[]=k==='lungi'?[[.30,.195,.15],[.60,.185,.14],[.98,.18,.13]]:[[.065,.205,.16],[.26,.195,.15],[.55,.19,.145],[.78,.195,.14],[.995,.18,.13]],key=`wrap:${k}:${lookKey}`;
  put(outfit(garment(key,fittedRings(look,low,rings),sides,.008),key,look,low,seat,'wrap'),0,0,0,1,1,1,k==='lungi'?look.b:look.a);
 }
 if(['salwar','kurta_cap','elder_m','burqa'].includes(k)){
  const full=k==='burqa',key=`robe:${k}:${lookKey}`,rings:Ring[]=[[full?.055:.565,.195,.145],[.78,.18,.135],[.94,.167,.12],[1.005,.15,.115]];
  put(outfit(garment(key,fittedRings(look,low,rings),sides,.006),key,look,low,seat,k==='burqa'?'wrap':'tunic'),0,0,0,1,1,1,look.a);
 }
 if(k==='sari'||k==='elder_f'||k==='salwar'){let cloth=nativeClothPatch(look,low,k==='salwar'?'scarf':'pallu');if(seat)cloth=poseTemplate(cloth,seat,look.s??1);put(cloth,0,0,0,1,1,1,k==='salwar'?look.c:look.a);}
 const key=`${look.female?'female':'male'}-${look.age==='elder'?'old':look.age==='child'?'child':'young'}` as keyof typeof source.eyes,anchor=humanHeadAnchor(look),matrices=seat?humanSeatMatrices(seat,look.s??1):null,headTransform=(v:THREE.Vector3)=>matrices?v.applyMatrix4(matrices[B.head]):v;
 for(let i=0;i<2;i++){const e=source.eyes[key][i],child=source.eyes[`${look.female?'female':'male'}-child`][i],p=headTransform(new THREE.Vector3(anchor.x+(look.age==='teen'?e[0]*.76+child[0]*.24:e[0])*1.05,anchor.y+(look.age==='teen'?e[1]*.76+child[1]*.24:e[1])*1.04,anchor.z+(look.age==='teen'?e[2]*.76+child[2]*.24:e[2])*.96-.005));
  put(rigidHumanTemplate(eyeDisk,B.head),p.x,p.y,p.z,.0105,.0032,1,'#a59d8d');put(rigidHumanTemplate(eyeDisk,B.head),p.x,p.y,p.z-.0006,.0031,.0028,1,'#322a23');
  put(rigidHumanTemplate(browTpl,B.head),p.x,p.y+.008,p.z+.002,.020,.0018,.0015,look.hair??'#211b18');
 }
 if(look.female&&k!=='burqa'){
  const scalp=scalpAnchor(look,low),hairColor=look.hair??'#211b18';
  if(k==='sari'||k==='elder_f'){
   const center=headTransform(scalp.clone().add(new THREE.Vector3(0,0,.015)));put(rigidHumanTemplate(TPL.sphL,B.head),center.x,center.y,center.z,.040,.037,.040,hairColor);
  }else{
   const points=[scalp,scalp.clone().add(new THREE.Vector3(0,-.055,.026)),scalp.clone().add(new THREE.Vector3(0,-.18,.035))],curve=new THREE.CatmullRomCurve3(points),g=new THREE.TubeGeometry(curve,low?5:8,.020,5,false);let hair:HumanTemplate=rigidHumanTemplate(toTpl(g),B.head);g.dispose();if(seat)hair=poseTemplate(hair,seat,look.s??1);put(hair,0,0,0,1,1,1,hairColor);
  }
 }
 if(seat&&(seat==='bike'||seat==='scooter')&&(look.walk??1)>0){const center=headTransform(anchor.clone().add(new THREE.Vector3(0,.135,.005)));put(rigidHumanTemplate(TPL.sphL,B.head),center.x,center.y,center.z,.093,.058,.095,look.female?'#d7d3c9':'#26292d');}
}
export const continuousHumanStats={bodyTriangles:source.human.triangleCount,lowBodyTriangles:source.humanLow.triangleCount,sourceTopology:source.sourceTopology,maxBodyTemplates:40,maxOutfitTemplates:64,get bodyTemplates(){return bodies.size;},get outfitTemplates(){return dressedTemplates.size;}};

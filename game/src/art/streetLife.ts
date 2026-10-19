/** Contextual set dressing. Procedural vendors are explicitly scenario overlays, not surveyed businesses. */
import * as THREE from 'three';
import type { Quality } from './api';
import type { WorldChunk, WorldChunkV2, WorldCore, RoadEdge } from '../world/schema';
import { GeoBuilder, addBox, boxMatrix, hashString, hex, pointInPoly } from './geo';
import { registerCull } from './cull';
export type StreetLifeKind='fruit'|'banana'|'coconut'|'panipuri'|'tiffin'|'chai'|'pottery'|'bus_stop'|'auto_stand'|'parked_bikes';
export interface StreetLifeFeature {id:string;kind:StreetLifeKind;x:number;z:number;heading:number;status?:string;elevationM?:number;scale?:[number,number,number]}
const materials = new Map<Quality,THREE.MeshStandardMaterial>();
function material(q:Quality){let m=materials.get(q);if(!m){m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.08});materials.set(q,m);}return m;}

export function buildStreetLife(chunk:WorldChunk,core:WorldCore,quality:Quality,placedFeatures?:StreetLifeFeature[]):THREE.Group {
  const root=new THREE.Group();root.name='street-life';root.userData.fidelity='scenario_overlay';
  const authored=placedFeatures??(chunk as WorldChunk & {streetLife?:StreetLifeFeature[]}).streetLife??[];
  const storesInChunk=(chunk as WorldChunkV2).storefronts??[],hasSurveyFront=storesInChunk.some(s=>s.placeId.startsWith('survey:'));
  const researched=new Set(chunk.buildings.filter(b=>b.researchedProfile||b.surveyStyle).map(b=>b.id));
  // A raw neighbouring listing must not invent a cart in a photographed forecourt.
  // Independently positioned observed features remain available through authored/placedFeatures.
  const candidateStores=placedFeatures||hasSurveyFront?[]:storesInChunk.filter(s=>!researched.has(s.buildingId??'')&&s.floor===0 && ['grocery','restaurant','cafe_bakery','auto_service'].includes(s.group));
  root.userData.features=[];
  if(!authored.length && !candidateStores.length) return root;
  const body=new GeoBuilder(true);
  let frame=new THREE.Matrix4();
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,c:number,ry=0)=>addBox(body,w,h,d,new THREE.Matrix4().multiplyMatrices(frame,boxMatrix(x,y,z,ry)),1,hex(c));
  const shape=(g:THREE.BufferGeometry,x:number,y:number,z:number,c:number,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{
    const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
    body.appendGeometry(g,new THREE.Matrix4().multiplyMatrices(frame,m),hex(c));
  };
  const sphere=new THREE.SphereGeometry(1,quality==='low'?5:7,5),cylinder=new THREE.CylinderGeometry(1,1,1,8),cone=new THREE.ConeGeometry(1,1,8),wheel=new THREE.TorusGeometry(.23,.055,5,10),banana=new THREE.TorusGeometry(.11,.025,4,7,2.5);
  const person=(x:number,z:number,shirt:number,angle=0)=>{
    const saved=frame.clone();frame.multiply(boxMatrix(x,0,z,angle));
    for(const side of [-1,1]){box(.13,.7,.16,side*.1,.36,0,0x263443);box(.09,.45,.1,side*.22,.99,-.04,0xb47e56);}
    box(.36,.55,.24,0,1.05,0,shirt);shape(sphere,0,1.48,0,0xc08c61,.13,.17,.13);box(.15,.07,.27,-.1,.05,-.05,0x24221f);box(.15,.07,.27,.1,.05,-.05,0x24221f);
    frame.copy(saved);
  };
  const parkedBike=(x:number,z:number,heading:number)=>{
    const saved=frame.clone();frame.multiply(boxMatrix(x,0,z,heading));
    for(const zz of [-.65,.65])shape(wheel,0,.27,zz,0x171a1b,1,1,1,0,Math.PI/2);
    box(.2,.1,1.25,0,.55,0,0x68747a);box(.3,.22,.55,0,.7,-.14,0x6c2229);box(.32,.08,.5,0,.85,.34,0x171b1c);box(.6,.045,.045,0,1.05,-.57,0x747c7f);box(.04,.54,.04,0,.7,-.61,0x72797b);
    frame.copy(saved);
  };
  const parkedAuto=(x:number,z:number,heading:number)=>{
    const saved=frame.clone();frame.multiply(boxMatrix(x,0,z,heading));
    box(1.24,.64,2.1,0,.7,.1,0xd9af2a);box(1.25,.58,1.6,0,1.43,.35,0x262d27);
    box(1.12,.08,1.8,0,1.76,.25,0x242823);box(.9,.4,.08,0,1.18,-.91,0x345666);
    for(const xx of [-.55,.55])shape(wheel,xx,.27,.9,0x191d1c,1,1,1,0,Math.PI/2);
    shape(wheel,0,.27,-.88,0x191d1c,1,1,1,0,Math.PI/2);frame.copy(saved);
  };
  const cart=(kind:StreetLifeKind)=>{
    if(kind==='pottery'){
      // Observed vessel type; stall placement is supplied explicitly, never hashed into unrelated streets.
      box(3.1,.035,2.35,0,.02,0,0x8f7161);
      for(let k=0;k<23;k++){
        const x=-1.2+(k%6)*.48,z=-.72+Math.floor(k/6)*.49,r=.16+(k%3)*.035,col=[0xa64e30,0x80412d,0x322b2a][k%3];
        shape(sphere,x,r*.83,z,col,r,r*.95,r);shape(cylinder,x,r*1.7,z,col,r*.47,.09,r*.47);shape(cylinder,x,r*1.7+.052,z,0x342c24,r*.32,.012,r*.32);
      }
      for(let k=0;k<4;k++){const x=-1.05+k*.3;shape(cone,x,.13,-.95,0xa9603c,.075,.2,.075);shape(sphere,x,.27,-.95,0xb16a45,.055,.06,.055);}
      shape(cylinder,0,1.35,.2,0x797362,.035,2.7,.035);
      for(let k=0;k<8;k++){const g=new THREE.ConeGeometry(1.72,.48,8,1,true,2*Math.PI*k/8,2*Math.PI/8);shape(g,0,2.65,.2,[0x9f4a3a,0x54805d,0xd8bf57,0xded6be][k%4]);g.dispose();}
      person(1.45,.5,0xcdbb9d);return;
    }
    box(2.1,.12,1.05,0,.85,0,0x486e69);box(1.95,.32,.95,0,.58,0,0x845b36);
    for(const side of [-1,1])shape(wheel,side*.88,.27,0,0x202324,1,1,1,0,Math.PI/2);
    for(const side of [-1,1])box(.045,1.72,.045,side*.94,1.25,.41,0x686d6a);
    box(2.35,.08,1.4,0,2.17,.1,kind==='panipuri'?0xa33f30:kind==='chai'?0x2c637d:0xc3a057);
    for(let i=0;i<6;i++)box(.18,.17,1.43,-1.03+i*.415,2.06,.1,i%2?0xe3d6b4:0x426d55);
    if(kind==='fruit'||kind==='banana'||kind==='coconut'){
      for(let k=0;k<3;k++){
        const x=-.7+k*.7;box(.63,.15,.8,x,.99,0,0x765333);
        for(let j=0;j<(quality==='low'?5:10);j++) {
          const xx=x-.22+(j%3)*.21,zz=-.23+Math.floor(j/3)*.18;
          if(kind==='banana')shape(banana,xx,1.14,zz,0xf1cb3b,1,1,1,Math.PI/2,.4*j);
          else shape(sphere,xx,1.15,zz,kind==='coconut'?(j%2?0x74864b:0x8e9557):[0xd85b26,0xd4b734,0x72944c][k],kind==='coconut'?.14:.1,kind==='coconut'?.17:.1,kind==='coconut'?.14:.1);
        }
      }
      // Inventory crates and a water container on the vendor side.
      box(.55,.45,.5,1.35,.23,.05,0x2d6d5c);shape(cylinder,-1.3,.4,.15,0x3d7b9b,.18,.75,.18);
    } else if(kind==='panipuri'){
      // Glass-box frame, visible puris, steel filling vessels and a water pot.
      for(const x of [-.85,-.1])for(const z of [-.35,.35])box(.025,.52,.025,x,1.2,z,0xc1c5bb);
      box(.8,.035,.8,-.47,1.48,0,0xc6c6b6);
      for(let i=0;i<16;i++)shape(sphere,-.77+(i%4)*.18,1.04+Math.floor(i/8)*.12,-.22+(Math.floor(i/4)%2)*.22,0xcba65e,.075,.07,.075);
      for(const z of [-.26,.26])shape(cylinder,.36,1.02,z,0xb5babb,.16,.22,.16);
      shape(sphere,.8,1.05,0,0xaeb9b9,.19,.23,.19);
    } else {
      shape(cylinder,-.4,1.13,0,0xc0c3bb,.28,.5,.28);shape(cone,-.4,1.41,0,0xb9bfb8,.3,.1,.3);
      if(kind==='tiffin'){box(.62,.065,.45,.42,1.03,0,0x373f3b);for(let k=0;k<5;k++)shape(cylinder,.23+(k%3)*.18,1.08,.1+Math.floor(k/3)*.14,0xeee2c7,.07,.025,.07);}
      else {for(let k=0;k<6;k++)shape(cylinder,.12+(k%3)*.18,1.05,-.15+Math.floor(k/3)*.3,0xe0d5bc,.05,.11,.05);}
      shape(cylinder,1.28,.29,.5,0x9a4335,.17,.56,.17);box(.35,.42,.35,-1.3,.21,.2,0x696a4e);
    }
    person(.1,.86,0xd2c3a6,Math.PI);person(-.8,-1.2,0x59848d);
  };
  const features:StreetLifeFeature[]=[...authored];
  const boundsPoints=[...chunk.buildings.flatMap(b=>b.footprint), ...((chunk as WorldChunkV2).storefronts??[]).flatMap(s=>s.facade??[]), ...features.map(f=>[f.x,f.z])];
  const minX=Math.min(...boundsPoints.map(p=>p[0]))-12,maxX=Math.max(...boundsPoints.map(p=>p[0]))+12,minZ=Math.min(...boundsPoints.map(p=>p[1]))-12,maxZ=Math.max(...boundsPoints.map(p=>p[1]))+12;
  const streets:RoadEdge[]=core.roads.filter(r=>!r.tunnel && r.elevationM<.4 && r.points.some(([x,z],i)=>i>0 && Math.max(x,r.points[i-1][0])>=minX && Math.min(x,r.points[i-1][0])<=maxX && Math.max(z,r.points[i-1][1])>=minZ && Math.min(z,r.points[i-1][1])<=maxZ));
  const clear=(x:number,z:number,radius:number)=>{
    for(const b of chunk.buildings)for(const [dx,dz]of [[0,0],[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]])if(pointInPoly(x+dx,z+dz,b.footprint))return false;
    for(const r of streets)for(let i=1;i<r.points.length;i++){
      const [ax,az]=r.points[i-1],[bx,bz]=r.points[i];const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2));
      if(Math.hypot(x-ax-dx*t,z-az-dz*t)<r.widthM/2+radius)return false;
    }
    return true;
  };
  const stores=candidateStores;
  const roadById=new Map(core.roads.map(r=>[r.id,r]));
  for(const sf of stores) {
    if(features.length>=(quality==='low'?3:7) || !sf.facade || sf.floor!==0)continue;
    if(!['grocery','restaurant','cafe_bakery','auto_service'].includes(sf.group))continue;
    const h=hashString(sf.id);if(h%5!==0)continue;
    const street=roadById.get(sf.roadId);if(!street || street.bridge || street.tunnel || street.elevationM>.3)continue;
    const [a,b]=sf.facade, mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    const nx=-Math.sin(sf.facingHeading),nz=-Math.cos(sf.facingHeading);
    const x=mx+nx*3,z=mz+nz*3;
    if(!clear(x,z,1.6))continue;
    const kinds:StreetLifeKind[]=sf.group==='grocery'?['fruit','banana','coconut']:sf.group==='auto_service'?['parked_bikes']:['panipuri','tiffin','chai'];
    features.push({id:`overlay_${sf.id}`,kind:kinds[h%kinds.length],x,z,heading:Math.atan2(nx,nz),status:'scenario_overlay'});
  }
  for(const f of features) {
    frame=boxMatrix(f.x,f.elevationM??.08,f.z,f.heading);if(f.scale)frame.scale(new THREE.Vector3(...f.scale));
    if(f.kind==='parked_bikes'){for(let k=0;k<3;k++)parkedBike(-.8+k*.8,0,.35);}
    else if(f.kind==='bus_stop'){
      box(5.6,.15,2.4,0,2.8,0,0x7d9196);for(const x of [-2.4,2.4])box(.1,2.7,.1,x,1.35,.8,0x535e61);
      box(5.2,1.4,.08,0,1.5,.9,0xacc0b8);box(4.2,.12,.5,0,.52,.35,0x5d6c65);person(-1.1,-.4,0x9c563e);person(.7,-.6,0x4e7783);person(1.8,-.3,0x92845b);
    } else if(f.kind==='auto_stand'){parkedAuto(-1.6,0,.2);parkedAuto(1.2,0,-.1);person(-.2,-1.8,0xcbb78e);person(.8,-2.1,0xe0d8c2);}
    else cart(f.kind);
  }
  for(const geo of [sphere,cylinder,cone,wheel,banana])geo.dispose();
  if(body.vcount){const mesh=new THREE.Mesh(body.build(),material(quality));mesh.castShadow=quality!=='low';mesh.receiveShadow=true;root.add(mesh);registerCull(root);}
  root.userData.features=features;root.userData.note=placedFeatures?'Source-positioned activity; metric props and people remain provisional.':'Procedural roadside activity is an authored scenario, not verified Street View placement.';
  if(placedFeatures)root.userData.fidelity='source_positioned_provisional';
  return root;
}

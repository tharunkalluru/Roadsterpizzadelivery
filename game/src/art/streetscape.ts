/** Reference-derived street features. Presence and approximate geometry have separate statuses. */
import * as THREE from 'three';
import type { Quality } from './api';
import type { Vec2, WorldCore } from '../world/schema';
import { RoadIndex } from '../world/roadIndex';
import { GeoBuilder, addBox, boxMatrix, hex, makeSamples, polyLength, sampleAt } from './geo';
import { registerCull } from './cull';
import { createSignTexture } from './sign';
import { publicRealmOf } from '../world/publicRealm';
import { buildPublicRealm } from './publicRealm';
export interface StreetscapeFeature {
  id:string;
  kind:'compound_wall'|'planted_median'|'pier_identifier';
  points:Vec2[];
  heightM:number;
  widthM:number;
  heading?:number;
  label?:string;
  treesBehind?:boolean;
  sourceId:string;
  imageryDate:string;
  geometryStatus:'provisional'|'verified';
  presenceStatus:'verified'|'provisional';
}
export interface StreetscapeData {version:1;features:StreetscapeFeature[];note:string}
interface BarrierPlan {id:string;points:Vec2[];elevation:number;height:number;width:number;feature:StreetscapeFeature}
export async function loadStreetscape(url='./research/streetscape.json',signal?:AbortSignal):Promise<StreetscapeData|null> {
  const response=await fetch(url,{signal});if(response.status===404)return null;
  if(!response.ok)throw new Error(`Streetscape data unavailable (${response.status})`);
  const data=await response.json() as StreetscapeData;
  if(data.version!==1 || !Array.isArray(data.features))throw new Error('Unsupported streetscape data');
  for(const f of data.features){
    if(!f.id || !['compound_wall','planted_median','pier_identifier'].includes(f.kind) || !f.points?.length || f.points.some(p=>p.length!==2 || p.some(v=>!Number.isFinite(v))) || !Number.isFinite(f.heightM) || f.heightM<=0 || !Number.isFinite(f.widthM) || f.widthM<=0 || !f.sourceId || !/^\d{4}-\d{2}$/.test(f.imageryDate) || !['verified','provisional'].includes(f.geometryStatus) || !['verified','provisional'].includes(f.presenceStatus))throw new Error(`Invalid streetscape feature ${f.id??''}`);
  }
  return data;
}
/** The same clipped segments feed rendering and solid collisions; crossroads remain open. */
export function streetscapeBarriers(data:StreetscapeData,core:WorldCore):BarrierPlan[] {
  const roads=new RoadIndex(core),out:BarrierPlan[]=[];
  for(const feature of data.features){
    if(feature.kind==='pier_identifier' || feature.points.length<2)continue;
    const samples=makeSamples(feature.points,0),length=polyLength(samples);
    const steps=Math.max(1,Math.ceil(length/2));
    let run:Vec2[]=[];
    const flush=()=>{if(run.length>1)out.push({id:`${feature.id}_${out.length}`,points:run,elevation:0,height:feature.heightM,width:feature.widthM,feature});run=[];};
    for(let i=0;i<steps;i++){
      const a=sampleAt(samples,length*i/steps),b=sampleAt(samples,length*(i+1)/steps),m=sampleAt(samples,length*(i+.5)/steps);
      let clear=true;
      for(const side of [-1,0,1]) {
        const x=m.x-m.tz*feature.widthM*.5*side,z=m.z+m.tx*feature.widthM*.5*side;
        if(roads.surface(x,z,{maxY:.3,margin:.18})){clear=false;break;}
      }
      if(clear){if(!run.length)run.push([a.x,a.z]);run.push([b.x,b.z]);}else flush();
    }
    flush();
  }
  return out;
}
let material:THREE.MeshStandardMaterial|undefined;
export function buildStreetscape(data:StreetscapeData,core:WorldCore,quality:Quality):THREE.Group {
  const root=new THREE.Group();root.name='researched-streetscape';root.userData.features=data.features;
  const publicRealm=publicRealmOf(core);if(publicRealm)root.add(buildPublicRealm(publicRealm,core,quality));
  const geometry=new GeoBuilder(true),greenery=new GeoBuilder(true);
  const ball=new THREE.IcosahedronGeometry(1,quality==='high'?1:0),cylinder=new THREE.CylinderGeometry(1,1,1,7);
  const sphere=(b:GeoBuilder,x:number,y:number,z:number,rx:number,ry:number,rz:number,c:number)=>b.appendGeometry(ball,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(rx,ry,rz)),hex(c));
  const box=(b:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,yaw:number,c:number)=>addBox(b,w,h,d,boxMatrix(x,y,z,yaw),1,hex(c));
  const plans=streetscapeBarriers(data,core);
  for(const plan of plans){
    const f=plan.feature;
    const samples=makeSamples(plan.points,0),length=polyLength(samples);
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i],d=Math.hypot(a.x-b.x,a.z-b.z),yaw=Math.atan2(-(b.z-a.z),b.x-a.x);
      box(geometry,d,f.heightM,f.widthM,(a.x+b.x)/2,f.heightM/2,(a.z+b.z)/2,yaw,f.kind==='planted_median'?0xb1aca0:0xd0c9ac);
      if(f.kind==='compound_wall') {
        box(geometry,d,.16,f.widthM+.12,(a.x+b.x)/2,f.heightM-.02,(a.z+b.z)/2,yaw,0xd8d2b9);
        // Original coloured panels evoke the observed painted wall without copying source artwork.
        box(geometry,d*.88,f.heightM*.62,f.widthM+.025,(a.x+b.x)/2,f.heightM*.5,(a.z+b.z)/2,yaw,[0x8b584a,0x7f9974,0x7292a5,0xa89866][i%4]);
      }
    }
    if(f.kind==='planted_median'){
      for(let d=1;d<length;d+=quality==='low'?5:3){
        const p=sampleAt(samples,d);
        for(const side of [-1,1])sphere(greenery,p.x-p.tz*side*.8,f.heightM+.4,p.z+p.tx*side*.8,.62,.48,.72,side===1?0x647e42:0x748c50);
      }
    }else if(f.treesBehind){
      for(let d=4;d<length;d+=quality==='low'?14:9){
        const p=sampleAt(samples,d),x=p.x+p.tz*4,z=p.z-p.tx*4;
        geometry.appendGeometry(cylinder,new THREE.Matrix4().compose(new THREE.Vector3(x,3.4,z),new THREE.Quaternion(),new THREE.Vector3(.23,6.8,.23)),hex(0x736b54));
        sphere(greenery,x,7.4,z,3.0,3.3,3.0,0x526c45);sphere(greenery,x+1.4,8.1,z-1,2.7,2.9,2.6,0x667f4d);
      }
    }
  }
  const pending:Promise<void>[]=[];
  for(const f of data.features)if(f.kind==='pier_identifier' && f.label){
    const [x,z]=f.points[0],yaw=f.heading??0;
    const mat=new THREE.MeshBasicMaterial({color:0xf0efe6});
    const labelGeo=new THREE.PlaneGeometry(.92,.6);labelGeo.userData.shared=false;
    for(const side of [-1,1]){
      const mesh=new THREE.Mesh(labelGeo,mat),normal=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
      mesh.position.set(x+normal.x*.99*side,f.heightM,z+normal.z*.99*side);mesh.rotation.y=yaw+(side===-1?Math.PI:0);mesh.name=`metro-pier-${f.label}`;root.add(mesh);
    }
    pending.push(createSignTexture([{text:f.label,lang:'en'}],{bg:'#f1efe3',fg:'#252c29',width:256,height:128}).then(texture=>{mat.map=texture;mat.color.setHex(0xffffff);mat.needsUpdate=true;}));
  }
  ball.dispose();cylinder.dispose();
  material??=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:.02});
  for(const [builder,name]of [[geometry,'streetscape-wall-median'],[greenery,'streetscape-trees-planting']]as const)if(builder.vcount){const mesh=new THREE.Mesh(builder.build(),material);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=quality!=='low';root.add(mesh);registerCull(mesh);}
  root.userData.pending=Promise.all(pending);root.userData.barrierCount=plans.length;
  return root;
}

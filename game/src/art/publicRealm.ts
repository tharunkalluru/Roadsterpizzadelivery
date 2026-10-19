/** Merged, distance-culled street furniture from the same source plans used by physics. */
import * as THREE from 'three';
import type { Quality } from './api';
import type { WorldCore,WorldChunk } from '../world/schema';
import { publicRealmPoint,publicRealmSurfaceHeight,type PublicRealmPlan,type PlannedPublicRealmFeature } from '../world/publicRealm';
import { GeoBuilder,addBox,boxMatrix,hex } from './geo';
import { registerCull } from './cull';
import { buildStreetLife,type StreetLifeFeature,type StreetLifeKind } from './streetLife';

export function buildPublicRealm(plan:PublicRealmPlan,core:WorldCore,quality:Quality):THREE.Group {
  const root=new THREE.Group();root.name='source-public-realm';root.userData.plan=plan;
  const groups=new Map<string,PlannedPublicRealmFeature[]>();
  for(const f of plan.features){const key=`${Math.floor(f.x/320)}_${Math.floor(f.z/320)}`,list=groups.get(key)??[];list.push(f);groups.set(key,list);}
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.08});
  const lightMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.3,emissive:0xffd7a0,emissiveIntensity:.9});
  // Each builder owns its materials so scene disposal does not damage the next run.
  const ball=new THREE.IcosahedronGeometry(1,quality==='high'?1:0),cylinder=new THREE.CylinderGeometry(1,1,1,7);
  const vendors=new Set(['fruit','banana','coconut','panipuri','tiffin','chai','pottery']);
  for(const [key,features]of groups){
    const tile=new THREE.Group();tile.name=`public-realm-${key}`;root.add(tile);
    const geo=new GeoBuilder(true),lit=new GeoBuilder(true);let frame=new THREE.Matrix4(),f:PlannedPublicRealmFeature;
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,col:number,b=geo)=>addBox(b,w,h,d,new THREE.Matrix4().multiplyMatrices(frame,boxMatrix(x,y,z)),1,hex(col));
    const shape=(g:THREE.BufferGeometry,x:number,y:number,z:number,sx:number,sy:number,sz:number,col:number)=>geo.appendGeometry(g,new THREE.Matrix4().multiplyMatrices(frame,new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(sx,sy,sz))),hex(col));
    const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number,col:number)=>{const delta=b.clone().sub(a),length=delta.length(),m=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),new THREE.Vector3(r,length,r));geo.appendGeometry(cylinder,m,hex(col));};
    const activity:StreetLifeFeature[]=[];
    for(f of features){
      frame=boxMatrix(f.x,f.elevationM,f.z,f.heading);
      const s=f.source,w=f.widthM,d=f.lengthM,h=f.heightM;
      if(s.kind==='speed_breaker'||s.kind==='pothole'){
        const patch=plan.surfaces.find(p=>p.id===s.id);if(!patch)continue;
        const nx=Math.ceil(w/.26),nz=Math.ceil(d/.18);
        for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
          const x0=-w/2+w*i/nx,x1=-w/2+w*(i+1)/nx,z0=-d/2+d*j/nz,z1=-d/2+d*(j+1)/nz;
          const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].flatMap(([x,z])=>{const [px,pz]=publicRealmPoint(f,x,z);return[px,patch.elevationM+publicRealmSurfaceHeight(patch,px,pz)+.004,pz];});
          const col=s.kind==='pothole'?0x514a3e:(i%4<2?0xa49b77:0x56564d);
          geo.quad(corners,[0,0,1,0,1,1,0,1],[0,1,0],hex(col));
        }
      }else if(s.kind==='bus_stop'){
        if(s.tags?.shelter==='yes'){
          box(w,.14,d,0,h-.07,0,0x788e91);box(w*.94,1.2,.065,0,1.5,-d*.4,0x91aaa9);
          for(const x of [-w*.43,w*.43])box(.13,h,.13,x,h/2,-d*.35,0x535e62);
        }else box(.08,h,.08,-w*.4,h/2,0,0x757d7b);
        if(s.tags?.bench==='yes'||s.tags?.shelter==='yes'){box(w*.72,.1,.48,0,.5,-d*.13,0x6c7773);for(const x of [-w*.25,w*.25])box(.09,.45,.3,x,.225,-d*.13,0x535b58);}
        // A simple original bus pictogram; no invented route number or advertisement.
        const x=s.tags?.shelter==='yes'?-w*.35:-w*.4;
        box(.5,.65,.055,x,h-.45,.06,0x315d8d);box(.31,.36,.025,x,h-.43,.095,0xe8ebe5);
        for(const xx of [-.085,.085]){box(.11,.1,.03,x+xx,h-.35,.115,0x52768b);box(.07,.07,.035,x+xx,h-.64,.115,0x253239);}
      }else if(s.kind==='vendor'&&vendors.has(s.variant??''))activity.push({id:s.id,kind:s.variant as StreetLifeKind,x:f.x,z:f.z,elevationM:f.elevationM,heading:f.heading,status:s.status,scale:s.variant==='pottery'?[w/3.1,h/2.9,d/2.4]:undefined});
      else if(s.kind==='auto_stand')activity.push({id:s.id,kind:'auto_stand',x:f.x,z:f.z,elevationM:f.elevationM,heading:f.heading,status:s.status});
      else if(s.kind==='parking'){
        const count=s.count??3,step=w/count;
        for(let k=0;k<=count;k++)box(.045,.012,d,-w/2+k*step,.01,0,0xdedbd0);
        box(w,.012,.06,0,.01,d/2,0xdedbd0);
        // A parking node does not establish vehicle occupancy or count. Display the space, not invented cars.
      }else if(s.kind==='utility_pole'){
        if(s.variant==='substation'||s.variant==='transformer'&&s.tags?.location!=='overhead'){
          box(w,h,d,0,h/2,0,0x858e86);for(let k=0;k<9;k++)box(w*.7,.035,.03,0,h*.2+k*h*.07,d/2+.02,0x37413f);
          box(.28,.32,.035,0,h*.76,d/2+.045,0xd4b045);
        }else{
          box(w,h,d,0,h/2,0,0x999a91);box(1.6,.1,.18,0,h-.8,0,0x5a6863);
          for(const x of [-.6,0,.6])shape(cylinder,x,h-.62,0,.055,.25,.055,0x686b58);
          if(s.variant==='transformer'||s.tags?.transformer){box(.85,1.05,.7,0,h*.6,-.2,0x67756f);for(let k=0;k<5;k++)box(.035,.85,.78,-.32+k*.16,h*.6,-.2,0x4e5f58);}
        }
        if(s.points&&s.points.length>1)for(let i=1;i<s.points.length;i++){
          const a=s.points[i-1],b=s.points[i];for(const offset of [-.3,.3])for(let k=0;k<8;k++){
            const t=k/8,u=(k+1)/8,point=(v:number)=>new THREE.Vector3(a[0]+(b[0]-a[0])*v,h-.8-Math.sin(v*Math.PI)*.6,a[1]+(b[1]-a[1])*v+offset);
            beam(point(t),point(u),.017,0x353b3a);
          }
        }
      }else if(s.kind==='streetlight'){
        shape(cylinder,0,h/2,0,w/2,h,w/2,0x737e7b);box(.09,.09,1.8,0,h-.12,.8,0x737e7b);box(.4,.15,.9,0,h-.21,1.45,0x525f60);box(.33,.035,.75,0,h-.3,1.45,0xffe7b4,lit);
      }else if(s.kind==='tree'){
        // OSM establishes a tree point, not species, canopy size or a surveyed trunk diameter.
        shape(cylinder,0,h*.29,0,w/2,h*.58,d/2,0x79654b);
        for(const side of [-1,1]){const a=new THREE.Vector3(...[f.x,f.elevationM+h*.38,f.z]),q=publicRealmPoint(f,side*1.4,.3);beam(a,new THREE.Vector3(q[0],f.elevationM+h*.68,q[1]),.11,0x79654b);}
        shape(ball,0,h*.75,0,2.9,h*.3,2.8,0x587647);shape(ball,1.6,h*.72,.5,2.1,h*.24,2,0x66824d);shape(ball,-1.5,h*.69,-.5,2,h*.25,2.1,0x476b42);
      }else if(s.kind==='drain'){
        box(w,.02,d,0,.005,0,0x2c3635);for(let x=-w/2+.06;x<w/2;x+=.12)box(.045,.025,d*.94,x,.018,0,0x8b9290);
      }else if(s.kind==='construction'){
        if(s.variant==='corrugated_boundary'){
          const low=Math.min(1.4,h*.4);box(w,low,d,0,low/2,0,0x7b3d49);box(w,h-low,d,0,low+(h-low)/2,0,0x53775b);
          box(w*.97,.035,.012,0,low*.65,d/2+.01,0xc6b7ad);
          for(let x=-w/2+.12;x<w/2;x+=.24)box(.025,h-low,d*.3,x,low+(h-low)/2,d/2+.015,0x638769);
        }else{box(w,h,d,0,h/2,0,0x786c57);for(let k=0;k<7;k++)box(w/12,.12,d*.8,-w*.42+k*w*.14,h+.05,0,0xb3a18b);}
      }
    }
    for(const [b,m,name]of [[geo,material,'furniture'],[lit,lightMaterial,'lamps']]as const)if(b.vcount){const mesh=new THREE.Mesh(b.build(),m);mesh.name=`public-${name}`;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;tile.add(mesh);}
    if(activity.length){const chunk={id:`public-${key}`,buildings:[]}as unknown as WorldChunk;tile.add(buildStreetLife(chunk,core,quality,activity));}
    registerCull(tile);
  }
  ball.dispose();cylinder.dispose();root.userData.sourceFeatures=plan.features.length;root.userData.rejected=plan.rejected;
  return root;
}

import * as THREE from 'three';
import { TPL, type TiledBatch } from '../core/util';
import { AIRFIELD_FEATURES, type AirfieldFeature } from './airfield-data';
import type { Kit } from './landmarks';
import { addLandmarkSurface, type LandmarkSurfaceGrid } from './landmark-support';
export interface GeoOrigin {lat:number;lon:number}
export type AirPoint=[number,number];
export interface AirRunway {id:string;ends:[AirPoint,AirPoint];width:number;length:number;thresholds:[number,number];labels:[string,string]}
export interface Airfield {id:string;name:string;features:(Omit<AirfieldFeature,'pts'>&{pts:AirPoint[]})[];runways:AirRunway[];bounds:{minX:number;maxX:number;minZ:number;maxZ:number}}
const dms=(d:number,m:number,s:number)=>d+m/60+s/3600;
// AAI2026 RGIA ADC and AAI2025 Begumpet ADC/AD2.12. These are
// physical endpoints, not the displaced landing thresholds at Begumpet.
export const AIRPORT_LAYOUTS={
  vohs:{name:'Rajiv Gandhi International Airport',terminal:{lat:17.235385669,lon:78.425700476},runways:[
    {id:'09R/27L',a:[dms(17,13,42.91),dms(78,24,46.11)],b:[dms(17,13,44.89),dms(78,27,10.27)],width:60,length:4260,thresholds:[0,0],labels:['09R','27L']},
    {id:'09L/27R',a:[dms(17,13,50.35),dms(78,24,54.80)],b:[dms(17,13,52.08),dms(78,27,0.25)],width:45,length:3707,thresholds:[0,0],labels:['09L','27R']}
  ]},
  vohy:{name:'Begumpet Airport',terminal:{lat:17.449502467,lon:78.4712797},runways:[
    {id:'09/27',a:[dms(17,27,10.39),dms(78,27,13.04)],b:[dms(17,27,12.42),dms(78,29,2.49)],width:45,length:3230,thresholds:[479,738],labels:['09','27']}
  ]}
} as const;
export function airfieldProjection(o:GeoOrigin){const kx=Math.cos(o.lat*Math.PI/180)*6380050.094*Math.PI/180,kz=6341141.9*Math.PI/180;return(lat:number,lon:number):AirPoint=>[(lon-o.lon)*kx,-(lat-o.lat)*kz];}
export function placeAirfields(origin:GeoOrigin):Airfield[]{const p=airfieldProjection(origin);return Object.entries(AIRPORT_LAYOUTS).map(([id,a])=>{
  const features=AIRFIELD_FEATURES[id].map((f)=>({...f,pts:f.pts.map(([lat,lon])=>p(lat,lon))}));
  const runways=a.runways.map((r)=>({id:r.id,ends:[p(r.a[0],r.a[1]),p(r.b[0],r.b[1])] as [AirPoint,AirPoint],width:r.width,length:r.length,thresholds:[...r.thresholds] as [number,number],labels:[...r.labels] as [string,string]}));
  const pts=features.flatMap((f)=>f.pts).concat(runways.flatMap((r)=>r.ends));
  return{id,name:a.name,features,runways,bounds:{minX:Math.min(...pts.map(p=>p[0]))-60,maxX:Math.max(...pts.map(p=>p[0]))+60,minZ:Math.min(...pts.map(p=>p[1]))-60,maxZ:Math.max(...pts.map(p=>p[1]))+60}};
});}
function inRing(x:number,z:number,p:AirPoint[]){let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
// Keep procedural crops/trees/building replacements off mapped pavement and the
// AAI runway strips (280m RGIA,150m Begumpet). Surrounding city data is retained.
export function airfieldClearAt(airfields:Airfield[],x:number,z:number):boolean{
  for(const a of airfields){if(x<a.bounds.minX-140||x>a.bounds.maxX+140||z<a.bounds.minZ-140||z>a.bounds.maxZ+140)continue;
    for(const r of a.runways){const[p,q]=r.ends,dx=q[0]-p[0],dz=q[1]-p[1],L2=dx*dx+dz*dz,u=((x-p[0])*dx+(z-p[1])*dz)/L2;if(u>=-.01&&u<=1.01&&Math.hypot(x-p[0]-u*dx,z-p[1]-u*dz)<(a.id==='vohs'?140:75))return true;}
    for(const f of a.features){if(f.kind==='taxiway'){for(let i=1;i<f.pts.length;i++){const p=f.pts[i-1],q=f.pts[i],dx=q[0]-p[0],dz=q[1]-p[1],L2=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/L2));if(Math.hypot(x-p[0]-dx*u,z-p[1]-dz*u)<Math.max(18,airportTaxiwayWidth(f)/2+1))return true;}}else if(inRing(x,z,f.pts))return true;}
  }return false;
}
// Explicit mapped widths include small6m service taxiways at Begumpet. The
// former12m floor doubled those pavements; the23m fallback is only for missing
// widths and is an illustrative default, not a survey of every taxiway.
export function airportTaxiwayWidth(f: { width?: string }) {
  const value = Number(f.width);
  return Number.isFinite(value) && value >= 3 && value <= 80 ? value : 23;
}
function strip(batch:TiledBatch,a:AirPoint,b:AirPoint,width:number,y:number,col:string){const dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);if(L<.01)return;const nx=-dz/L*width/2,nz=dx/L*width/2;batch.quad([a[0]-nx,y,a[1]-nz],[a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz],col);}
const DIGITS:Record<string,string[]>={'0':['a','b','c','d','e','f'],'2':['a','b','g','e','d'],'7':['a','b','c'],'9':['a','b','c','d','f','g'],'R':['a','b','e','f','g','h'],'L':['f','e','d']};
const SEGS:Record<string,number[]>={a:[-.5,0,.5,0],b:[.5,0,.5,.5],c:[.5,.5,.5,1],d:[-.5,1,.5,1],e:[-.5,.5,-.5,1],f:[-.5,0,-.5,.5],g:[-.5,.5,.5,.5],h:[0,.5,.5,1]};
export function drawAirfieldTile(airfields:Airfield[],i:number,j:number,B:Record<string,TiledBatch>,grid:LandmarkSurfaceGrid){
  const owns=(x:number,z:number)=>Math.floor(x/1000)===i&&Math.floor(z/1000)===j;
  const surface=(a:AirPoint,b:AirPoint,c:AirPoint,y:number,id:string)=>addLandmarkSurface(grid,{id,a:[a[0],y,a[1]],b:[b[0],y,b[1]],c:[c[0],y,c[1]]});
  for(const a of airfields){if(a.bounds.maxX<i*1000||a.bounds.minX>(i+1)*1000||a.bounds.maxZ<j*1000||a.bounds.minZ>(j+1)*1000)continue;
    for(const f of a.features){
      if(f.kind==='terminal')continue; // The catalogue recipe emits its mapped footprint once.
      if(f.kind==='apron'||f.kind==='hangar'){
        const pts=f.pts.slice(0,-1),top=f.kind==='apron'?.11:Math.max(8,Math.min(28,parseFloat(f.height||'')||12));
        let tris:number[][];try{tris=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(...p)),[]);}catch{continue;}
        for(const t of tris){const q=t.map(n=>pts[n]),cx=q.reduce((s,p)=>s+p[0],0)/3,cz=q.reduce((s,p)=>s+p[1],0)/3;if(!owns(cx,cz))continue;
          B[f.kind==='apron'?'road':'st'].tri([q[0][0],top,q[0][1]],[q[2][0],top,q[2][1]],[q[1][0],top,q[1][1]],f.kind==='apron'?'#99988f':'#c9cbd0');surface(q[0],q[2],q[1],top,`${a.id}:${f.id}`);}
        if(f.kind==='hangar')for(let k=1;k<f.pts.length;k++){const p=f.pts[k-1],q=f.pts[k];if(owns((p[0]+q[0])/2,(p[1]+q[1])/2))B.st.quad([p[0],0,p[1]],[q[0],0,q[1]],[q[0],top,q[1]],[p[0],top,p[1]],'#adb7bd');}
      }else if(f.kind==='taxiway')for(let k=1;k<f.pts.length;k++){
        const p=f.pts[k-1],q=f.pts[k],L=Math.hypot(q[0]-p[0],q[1]-p[1]),n=Math.max(1,Math.ceil(L/30));
        for(let s=0;s<n;s++){const u=s/n,v=(s+1)/n,x:AirPoint=[p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u],z:AirPoint=[p[0]+(q[0]-p[0])*v,p[1]+(q[1]-p[1])*v];if(!owns((x[0]+z[0])/2,(x[1]+z[1])/2))continue;strip(B.road,x,z,airportTaxiwayWidth(f),.13,'#626369');strip(B.marks,x,z,.24,.145,'#e9c544');}
      }
    }
    for(const r of a.runways){const[p,q]=r.ends,dx=q[0]-p[0],dz=q[1]-p[1],L=Math.hypot(dx,dz),hx=dx/L,hz=dz/L,n=Math.ceil(L/30);const point=(s:number,cross=0):AirPoint=>[p[0]+hx*s-hz*cross,p[1]+hz*s+hx*cross];
      for(let k=0;k<n;k++){const s=k*L/n,e=(k+1)*L/n,mid=point((s+e)/2);if(!owns(...mid))continue;const v=point(s),w=point(e);strip(B.road,v,w,r.width,.16,'#44464c');
        const off=r.width/2;const aa=point(s,-off),bb=point(e,-off),cc=point(e,off),dd=point(s,off);surface(aa,cc,bb,.16,`${a.id}:${r.id}`);surface(aa,dd,cc,.16,`${a.id}:${r.id}`);
        for(const side of [-1,1])strip(B.marks,point(s,side*(off-1)),point(e,side*(off-1)),.4,.18,'#f0eee4');
      }
      for(let s=80;s<L-80;s+=60){const p0=point(s);if(!owns(...p0))continue;strip(B.marks,point(s),point(Math.min(L-80,s+30)),.9,.18,'#f4f1e7');for(const side of [-1,1]){const light=point(s,side*(r.width/2+1));B.lit.box(light[0],.21,light[1],.45,.2,.45,'#f1f6d0');}}
      for(const end of [0,1]){const sign=end?-1:1,thr=end?L-r.thresholds[1]:r.thresholds[0],label=r.labels[end];
        for(let stripe=-4;stripe<=4;stripe++){if(stripe===0)continue;const p0=point(thr+sign*12,stripe*r.width/12);if(owns(...p0))strip(B.marks,p0,point(thr+sign*40,stripe*r.width/12),1.5,.185,'#f4f1e7');}
        for(let c=0;c<label.length;c++)for(const seg of DIGITS[label[c]]||[]){const[x0,z0,x1,z1]=SEGS[seg],off=(c-(label.length-1)/2)*5.5;const aa=point(thr+sign*(52+(1-z0)*12),sign*(off+x0*4)),bb=point(thr+sign*(52+(1-z1)*12),sign*(off+x1*4));if(owns((aa[0]+bb[0])/2,(aa[1]+bb[1])/2))strip(B.marks,aa,bb,.9,.19,'#f4f1e7');}
      }
    }
  }
}

// Plan shape is mapped, while facade heights/materials stay explicitly stylised.
// Unlike the old generic block this preserves RGIA's concourse/terminal outline.
export function drawAirportTerminal(K:Kit,code:keyof typeof AIRPORT_LAYOUTS){
  const a=AIRPORT_LAYOUTS[code],f=AIRFIELD_FEATURES[code].find(f=>f.kind==='terminal')!,project=airfieldProjection(a.terminal);
  const ring=f.pts.slice(0,-1).map(([lat,lon])=>{const[x,z]=project(lat,lon);return[K.x0+x,K.z0+z] as AirPoint;});
  const h=code==='vohs'?22:10,tri=THREE.ShapeUtils.triangulateShape(ring.map(p=>new THREE.Vector2(...p)),[]);
  for(const t of tri){const[p,q,r]=t.map(i=>ring[i]);K.k.B.st.tri([p[0],h,p[1]],[r[0],h,r[1]],[q[0],h,q[1]],'#c6cdd3');}
  for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];K.k.B.st.quad([p[0],0,p[1]],[q[0],0,q[1]],[q[0],h,q[1]],[p[0],h,p[1]],'#698b9c');}
  K.k.solid(ring,h);K.board(code==='vohs'?'RAJIV GANDHI INTERNATIONAL AIRPORT':'BEGUMPET AIRPORT',0,-45,code==='vohs'?16:7,code==='vohs'?36:25,2,'#ffffff','#243c68');
  // Glass curtain wall, silver roof seams and a shaded entry canopy.
  const minX=Math.min(...ring.map(p=>p[0])),maxX=Math.max(...ring.map(p=>p[0])),maxZ=Math.max(...ring.map(p=>p[1]));
  for(let x=minX+10;x<maxX;x+=18)K.k.B.st.box(x,h+.15,K.z0, .5,.3,35,'#e2e5e6');
  K.k.B.st.box((minX+maxX)/2,h*.65,maxZ+8,(maxX-minX)*.68,.5,18,'#c9d2d8');
}

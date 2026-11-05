import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batch,initTemplates } from '../../src/core/util';
import { drawClosedDivider,dividerStripeDistance } from '../../src/world/road-divider-mesh';
import { buildTile } from '../../src/world/city';
import { continuousPaintStroke,paintOnRoad } from '../../src/world/road-paint-mesh';

type Point=[number,number];
const minus=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
/** Independent literal triangle/line half-plane intersection. No pairing or
 * triangulation-order assumption, including asphalt-clipped emitted paint. */
function section(triangle:Point[],center:Point,normal:Point){
  let lo=-.3,hi=.3;const sign=Math.sign(cross(minus(triangle[1],triangle[0]),minus(triangle[2],triangle[0])));if(!sign)return null;
  for(let i=0;i<3;i++){
    const p=triangle[i],edge=minus(triangle[(i+1)%3],p),a=sign*cross(edge,minus(center,p)),b=sign*cross(edge,normal);
    if(Math.abs(b)<1e-12){if(a< -1e-8)return null;}
    else if(b>0)lo=Math.max(lo,-a/b);else hi=Math.min(hi,-a/b);
    if(lo>hi+1e-8)return null;
  }
  return [lo,hi];
}
function sectionWidth(triangles:Point[][],center:Point,normal:Point){
  const intervals=triangles.map(t=>section(t,center,normal)).filter(Boolean)as number[][];
  intervals.sort((a,b)=>a[0]-b[0]);const merged:number[][]=[];
  for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+1e-5)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
  const at=merged.find(x=>x[0]<=.00005&&x[1]>=-.00005);return at?at[1]-at[0]:null;
}
const offset=(points:Point[],distance:number)=>points.map((p,i):Point=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],delta=minus(b,a),length=Math.hypot(...delta)||1;
  return[p[0]-delta[1]/length*distance,p[1]+delta[0]/length*distance];
});

function capRay(batch:Batch,origin:THREE.Vector3,direction:THREE.Vector3){
  const geometry=batch.geometry(),material=new THREE.MeshBasicMaterial({side:THREE.FrontSide}),mesh=new THREE.Mesh(geometry,material);
  mesh.updateMatrixWorld(true);const hits=new THREE.Raycaster(origin,direction,0,30).intersectObject(mesh);
  geometry.dispose();material.dispose();return hits;
}
test('independent outward cap rays see both ends; the historical three-face negative stays open',()=>{
  for(const [a,b,width,height,ya,yb]of [
    [[10,20],[18,26],.9,.36,0,.8],[[20,40],[20,30],.4,.42,-1,-.5],[[0,0],[-3,4],.22,.26,.4,0],
  ]as [number[],number[],number,number,number,number][]){
    const batch=new Batch();drawClosedDivider(batch,a,b,width,height,ya,yb,'#fff',.123,11.234);
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),dir=new THREE.Vector3(dx/len,0,dz/len);
    for(const [point,y,sign]of [[a,ya,-1],[b,yb,1]]as [number[],number,number][]){
      const origin=new THREE.Vector3(point[0],y+height/2,point[1]).addScaledVector(dir,sign*.5);
      const hits=capRay(batch,origin,dir.clone().multiplyScalar(-sign));assert.ok(hits.length);
      assert.ok(Math.abs(hits[0].distance-.5)<1e-6,'visible cap is at the existing exact run end');
      assert.ok(Math.abs(hits[0].face!.normal.dot(dir))>.999,'front-facing finite terminal face');
    }
    const old=new Batch();
    // Keep the new top/two sides only: same historical open-prism topology,
    // independent of texture/cap helper implementation.
    for(const start of [0,36,54])for(const name of ['pos','nor','col','uv']as const){const stride=name==='uv'?2:3;old[name].push(...batch[name].slice(start/3*stride,(start+18)/3*stride));}
    const origin=new THREE.Vector3(a[0],ya+height/2,a[1]).addScaledVector(dir,-.5);
    assert.equal(capRay(old,origin,dir).length,0,'negative control must detect absent caps');
  }
});

test('independent differential UVs retain fixed physical half-metre blocks and clipped-run phase',()=>{
  for(const length of [.07,.7071067811872711,1.0630145812733964,9.91,250.25])for(const start of [0,length*.37]){
    const end=Math.min(length,start+.031),a=dividerStripeDistance(start,length),b=dividerStripeDistance(end,length);
    assert.ok(Math.abs((b-a)-(end-start))<1e-12,'UV slope is one repeat per metre at every source length');
    const oldCompressed=(s:number)=>s*Math.ceil(length)/length;
    if(length<2)assert.ok(Math.abs((oldCompressed(end)-oldCompressed(start))-(end-start))>1e-5,'rejected compression negative is observable');
  }
});

test('independent emitted triangle unions close the old right-angle and unequal-leg paint-width defect',()=>{
  initTemplates();
  let checked=0,oldFailures=0;
  for(const outgoing of [300,3]){
    const points:Point[]=[[200,200],[500,200],[500,200+outgoing]];
    const road:any={id:'independent-paint',cls:'primary',w:12,lanes:4,oneway:null,from:'a',to:'b',pts:points,elev:null};
    const built=buildTile({i:0,j:0,roads:[road],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
    const triangles:Point[][]=[];
    for(const buffer of built.buffers.filter(b=>b.mat==='marks'))for(let i=0;i<buffer.pos.length;i+=9)
      triangles.push([0,3,6].map(k=>[buffer.pos[i+k],buffer.pos[i+k+2]]as Point));
    for(const side of [1,-1]){
      const line=offset(points,5.65*side),oldLeft=offset(line,.06),oldRight=offset(line,-.06),old:Point[][]=[];
      for(let i=0;i<line.length-1;i++)old.push([oldLeft[i],oldLeft[i+1],oldRight[i+1]],[oldLeft[i],oldRight[i+1],oldRight[i]]);
      for(let i=0;i<line.length-1;i++){
        const a=line[i],b=line[i+1],d=minus(b,a),length=Math.hypot(...d),normal:Point=[-d[1]/length,d[0]/length];
        for(const f of [.01,.1,.5,.9,.99]){
          const center:Point=[a[0]+d[0]*f,a[1]+d[1]*f],width=sectionWidth(triangles,center,normal);
          // A bounded bevel/overlapping arm can widen the actual join itself,
          // but straight sections outside its 4-half-width limit stay .12m.
          if(Math.min(f,1-f)*length>.24){assert.ok(width!==null&&Math.abs(width-.12)<.00012,`${outgoing}/${side}/${i}/${f}: union width ${width}`);checked++;}
          const oldWidth=sectionWidth(old,center,normal);if(oldWidth!==null&&Math.abs(oldWidth-.12)>.005)oldFailures++;
        }
      }
    }
  }
  assert.ok(checked>=30,'actual emitted paint sections, not a stand-alone join helper');
  assert.ok(oldFailures>10,'literal previous chord-normal geometry is rejected by the same union oracle');
});

test('independent acute and reversal controls keep finite bounded joins and literal own-asphalt film',()=>{
  // An unconstrained intersection of the two parallel offset lines at this
  // near reversal is >7m from a 12cm stripe's join. It must not be rendered.
  const outgoing:Point=[-3/Math.hypot(3,.05),.05/Math.hypot(3,.05)],delta:Point=[-outgoing[1]*.06,outgoing[0]*.06-.06];
  const naiveDistance=Math.abs(cross(delta,outgoing)/cross([1,0],outgoing));assert.ok(naiveDistance>7);
  for(const points of [ [[0,0],[300,0],[300,3]],[[0,0],[300,0],[297,.05]],[[0,0],[300,0],[0,0]],[[0,0],[0,0],[3,0]] ]as Point[][]){
    const stroke=continuousPaintStroke(points,.12);
    for(let i=0;i<stroke.segments.length;i++)for(const key of ['left0','right0','left1','right1']as const){
      const v=stroke.segments[i][key],source=points[i+(key.endsWith('1')?1:0)];assert.ok(v.every(Number.isFinite));
      assert.ok(Math.hypot(v[0]-source[0],v[1]-source[1])<=.2400001,'no miter spike beyond four half-widths');
    }
    for(const bevel of stroke.bevels)for(const v of bevel.points)assert.ok(Math.hypot(v[0]-points[bevel.index][0],v[1]-points[bevel.index][1])<=.0600001);
  }
  const road:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[0,0,0],[3,.1,0],[3,.6,3],[0,.1,3]];
  const triangles=paintOnRoad([[-1,1],[4,1],[4,1.12],[-1,1.12]],road,.012);
  const height=(p:number[])=>{
    for(const indices of [[0,1,2],[0,2,3]]){
      const [a,b,c]=indices.map(i=>road[i]),u0=b[0]-a[0],u1=b[2]-a[2],v0=c[0]-a[0],v1=c[2]-a[2],den=u0*v1-u1*v0;
      const x=p[0]-a[0],z=p[2]-a[2],u=(x*v1-z*v0)/den,v=(u0*z-u1*x)/den;
      if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
    }return null;
  };
  assert.ok(triangles.length>=4,'paint is split at the actual warped asphalt diagonal');
  for(const triangle of triangles){
    const [a,b,c]=triangle,centroid=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
    for(const p of [a,b,c,centroid]){const y=height(p);assert.notEqual(y,null,'no paint over the missing pavement beyond quad edges');assert.ok(Math.abs(p[1]-y!-.012)<1e-10,'each painted triangle follows its own literal asphalt plane');}
  }
});

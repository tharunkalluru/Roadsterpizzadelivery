import * as THREE from 'three';
import { TPL, type TiledBatch, type Tpl, type AddOpts } from '../core/util';
import { addLandmarkSurface, type LandmarkSurfaceGrid, type LandmarkVertex } from './landmark-support';

// Capture the identical transforms used by Batch.add (YXZ Euler order). Keeping
// this at the batch seam includes hand-made roofs, arch panels and rocky hills.
export function captureLandmarkBatches(batches: Record<string,TiledBatch>, grid: LandmarkSurfaceGrid, id:string): Record<string,TiledBatch> {
  const matrix=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), v=new THREE.Vector3();
  const triangle=(a:number[],b:number[],c:number[])=>addLandmarkSurface(grid,{id,a:[...a] as LandmarkVertex,b:[...b] as LandmarkVertex,c:[...c] as LandmarkVertex});
  const tpl=(t:Tpl,m:THREE.Matrix4)=>{for(let i=0;i+2<t.count;i+=3){const p:number[][]=[];for(let j=0;j<3;j++){v.fromArray(t.pos,(i+j)*3).applyMatrix4(m);p.push([v.x,v.y,v.z]);}triangle(p[0],p[1],p[2]);}};
  const transformed=(t:Tpl,x:number,y:number,z:number,sx:number,sy:number,sz:number,o:AddOpts={})=>{
    q.setFromEuler(e.set(o.rx||0,o.ry||0,o.rz||0,'YXZ'));matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(sx,sy,sz));tpl(t,matrix);
  };
  return Object.fromEntries(Object.entries(batches).map(([name,b])=>[name,/^(lit|glow|water|marks)$/.test(name)?b:new Proxy(b, {get(target,key){
    if(key==='box')return(...a:Parameters<TiledBatch['box']>)=>{transformed(TPL.box,...a.slice(0,6) as [number,number,number,number,number,number],a[7]);target.box(...a);};
    if(key==='add')return(...a:Parameters<TiledBatch['add']>)=>{transformed(a[0],...a.slice(1,7) as [number,number,number,number,number,number],a[8]);target.add(...a);};
    if(key==='addTpl')return(...a:Parameters<TiledBatch['addTpl']>)=>{tpl(a[0],a[1]);target.addTpl(...a);};
    if(key==='tri')return(...a:Parameters<TiledBatch['tri']>)=>{triangle(a[0],a[1],a[2]);target.tri(...a);};
    if(key==='quad')return(...a:Parameters<TiledBatch['quad']>)=>{triangle(a[0],a[1],a[2]);triangle(a[0],a[2],a[3]);target.quad(...a);};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})]));
}

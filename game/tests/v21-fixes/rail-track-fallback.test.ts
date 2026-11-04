import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrackFallback } from '../../src/world/rail-track-fallback';
import { makeRailwayNetwork, railwayNetwork } from '../../src/world/railway-geometry';
import type { OsmFeature } from '../../src/world/extras';

initTemplates();
const material=()=>new THREE.MeshStandardMaterial({vertexColors:true});
const fixture=(features:OsmFeature[],lowQ=true)=>{
  const network=makeRailwayNetwork(features),st=material(),foot=material();
  return{network,st,foot,layer:new RailTrackFallback(network,{st,foot},{lowQ})};
};
const line=(id:string,points:[number,number][]):OsmFeature=>({id,k:'rail',t:{railway:'rail'},l:points});
const meshes=(g:THREE.Group)=>g.children as THREE.Mesh[];

test('actual canonical track missing from city pack tiles still has visible exact-datum rails',()=>{
  const network=railwayNetwork(),core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const packOf=new Set<string>(core.packs.flatMap(p=>p.tiles.map(([i,j])=>`${i}_${j}`)));
  let spot:{x:number;z:number;owner:string}|null=null;
  for(const profile of network.profiles){if(profile.service)continue;for(let i=1;i<profile.pts.length;i++){
    const a=profile.pts[i-1],b=profile.pts[i],x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,owner=`${Math.floor(x/1000)}_${Math.floor(z/1000)}`;
    if(!packOf.has(owner)){spot={x,z,owner};break;}
  }if(spot)break;}
  assert.ok(spot,'exercise a genuine missing-pack track rather than an invented line');
  const st=material(),foot=material(),layer=new RailTrackFallback(network,{st,foot},{lowQ:true});
  try{
    for(let i=0;i<4;i++)layer.update(spot.x,spot.z,new Map(),0);
    const chunk=layer.chunks.get(`${Math.floor(spot.x/250)}_${Math.floor(spot.z/250)}`);assert.ok(chunk);assert.equal(chunk.group.parent,layer.group);
    assert.ok(meshes(chunk.group).every(mesh=>mesh.geometry.getAttribute('position').count>0));
    const steel=meshes(chunk.group).find(mesh=>mesh.material===st)!;assert.ok(steel);
    const y=steel.geometry.getAttribute('position');let min=Infinity,max=-Infinity;
    for(let i=0;i<y.count;i++){min=Math.min(min,y.getY(i));max=Math.max(max,y.getY(i));}
    assert.ok(Math.abs(min-.21)<1e-5&&Math.abs(max-.31)<1e-5,'steel keeps the same canonical running datum as normal city geometry');
  }finally{layer.dispose();st.dispose();foot.dispose();}
});

test('normal tile installation removes fallback immediately and unloading restores cached geometry without duplicate meshes',()=>{
  const f=fixture([line('canonical',[[1010,100],[1090,100]])]),loaded=new Map<string,unknown>();
  try{
    f.layer.update(1050,100,loaded);const chunk=f.layer.chunks.get('4_0')!,geometry=meshes(chunk.group)[0].geometry;
    assert.ok(chunk);assert.equal(f.layer.group.children.length,1);const builds=f.layer.builds;
    loaded.set('1_0',{});f.layer.update(1050,100,loaded);
    assert.equal(f.layer.group.children.length,0,'the city-owned track replaces fallback in the same update');
    loaded.delete('1_0');f.layer.update(1050,100,loaded);
    assert.equal(f.layer.group.children.length,1);assert.equal(meshes(chunk.group)[0].geometry,geometry);assert.equal(f.layer.builds,builds);
  }finally{f.layer.dispose();f.st.dispose();f.foot.dispose();}
});

test('midpoint ownership matches normal tiles across a boundary without extending or inventing source track',()=>{
  const f=fixture([line('seam',[[980,100],[1020,100]])]),loaded=new Map([['0_0',{}]]);
  try{
    for(let i=0;i<3;i++)f.layer.update(1000,100,loaded);
    assert.equal(f.layer.group.children.length,1);const chunk=f.layer.chunks.get('4_0')!;
    const box=new THREE.Box3().setFromObject(chunk.group);
    assert.ok(box.min.x>999.8&&box.min.x<1000.1);assert.ok(box.max.x>1019.9&&box.max.x<1020.2);
    assert.deepEqual(f.network.profiles[0].source.l,[[980,100],[1020,100]],'source line endpoints remain unchanged');
  }finally{f.layer.dispose();f.st.dispose();f.foot.dispose();}
});

test('both train ends receive fallback outside the player radius and quality retains sleepers',()=>{
  const source=[line('near',[[100,100],[180,100]]),line('train-a',[[1900,100],[1980,100]]),line('train-b',[[-1800,100],[-1720,100]])];
  const low=fixture(source),high=fixture(source,false),points=Array.from({length:26},(_,i)=>i<13?{x:1900+i*5,z:100}:{x:-1800+(i-13)*5,z:100});
  try{
    for(const f of [low,high])for(let i=0;i<8;i++)f.layer.update(140,100,new Map(),0,points);
    assert.ok(low.layer.chunks.has('7_0')&&low.layer.chunks.has('-8_0')&&low.layer.chunks.has('0_0'),'sampling the full coach list includes both rakes, not only the first six coaches');
    assert.equal(low.layer.group.children.length,4,'the western source line crosses two250mchunks');
    const vertices=(f:typeof low)=>[...f.layer.chunks.values()].flatMap(c=>meshes(c.group)).reduce((n,m)=>n+m.geometry.getAttribute('position').count,0);
    assert.ok(vertices(high)>vertices(low),'high quality keeps canonical sleepers rather than downgrading nearby rails');
  }finally{for(const f of [low,high]){f.layer.dispose();f.st.dispose();f.foot.dispose();}}
});

test('rail cache and per-frame preparation stay bounded and owned geometry releases once without releasing shared materials',()=>{
  const f=fixture(Array.from({length:80},(_,i)=>line(`way:${i}`,[[i*1000+200,100],[i*1000+240,100]])));
  let released=0,sharedReleased=0;const watched=new Set<THREE.BufferGeometry>();
  f.st.addEventListener('dispose',()=>sharedReleased++);f.foot.addEventListener('dispose',()=>sharedReleased++);
  for(let i=0;i<80;i++)for(let frame=0;frame<3;frame++){
    const before=f.layer.builds;f.layer.update(i*1000+220,100,new Map(),.3);
    assert.ok(f.layer.builds-before<=1,'one geometry chunk at most is prepared in a frame');
    for(const chunk of f.layer.chunks.values())for(const mesh of meshes(chunk.group))if(!watched.has(mesh.geometry)){
      watched.add(mesh.geometry);mesh.geometry.addEventListener('dispose',()=>released++);
    }
    assert.ok(f.layer.chunks.size<=64);assert.ok(f.layer.group.children.length<=48);
  }
  assert.ok(released>0,'far chunks actually evict rather than keeping the entire city resident');
  f.layer.dispose();assert.equal(released,watched.size);assert.equal(sharedReleased,0);
  f.layer.dispose();assert.equal(released,watched.size);assert.equal(f.layer.group.children.length,0);
  f.st.dispose();f.foot.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../../src/world/world';
import { SignSystem } from '../../src/world/signs';
import { initTemplates } from '../../src/core/util';
initTemplates();
function fixture() {
 const material = new THREE.MeshBasicMaterial();
 const world:any=Object.assign(Object.create(World.prototype),{
  group:new THREE.Group(), tiles:new Map(), groundGeo:new THREE.PlaneGeometry(1000,1000), mats:{ground:material,st:material},
  buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),byBuilding:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map(),activity:new Map(),rails:new Map(),
  lamps:[],signals:[],busStops:[],walkPaths:[],signs:new SignSystem(),onTileAdded(){},onTileRemoved(){},signalSeconds:0,
  empty:new Set(),pending:new Map(),requestIds:new Map(),failures:new Map(),waiters:[],buildMs:[],addMs:[],focus:null,worker:{postMessage(){}},preparationFrame:1,
 });
 const box=new THREE.BoxGeometry(2,3,4).toNonIndexed();box.computeBoundingSphere();
 const tile=(key='0_0')=>({key,i:0,j:0,buffers:Array.from({length:3},()=>({mat:'st',pos:box.getAttribute('position').array,nor:box.getAttribute('normal').array,uv:box.getAttribute('uv').array,col:new Float32Array(box.getAttribute('position').array.length),sphere:{center:box.boundingSphere!.center.toArray(),radius:box.boundingSphere!.radius}})),roads:[],
  parkedVehicles:[{id:key+'bike',kind:'bike',x:10,y:0,z:10,yaw:0,color:'#b3262b'}],buildingGrid:new Map([['0,0',[{id:key+'house',ring:[[1,1],[2,2],[3,3]]}]]]),surfaceGrid:new Map([['0,0',[{id:key+'road'}]]]),walls:new Map(),obstacles:new Map(),signs:[],lamps:[[1,2,3]],signals:[],busStops:[],walkPaths:[],rails:[],activity:[]});
 const receive=(built:any,id=1)=>{world.pending.set(built.key,performance.now());world.requestIds.set(built.key,id);world.onMessage({type:'built',key:built.key,requestId:id,built,ms:10});};
 const finish=()=>{for(let n=0;world.preparations?.size&&n<1000;n++)world.pumpPreparation(.1);assert.equal(world.preparations?.size,0);};
 return {world,tile,receive,finish,dispose(){for(const t of [...world.tiles.values()])world.unload(t);world.groundGeo.dispose();material.dispose();box.dispose();}};
}
test('streamed tile resources stay private until one coherent rendering and collision publication',()=>{
 const f=fixture(),w=f.world;try {
  const tile=f.tile();f.receive(tile);
  assert.equal(w.tiles.size,0);assert.equal(w.group.children.length,0);assert.equal(w.surfaceGrid.size,0);
  const preparation=w.preparations.get(tile.key);
  for(let i=0;i<3;i++){assert.equal(preparation.job.next().done,false);assert.equal(w.group.children.length,0);assert.equal(w.parkedVehicles?.length||0,0);assert.equal(w.byBuilding.size,0);}
  let published=0;w.onTileAdded=(t:any)=>{published++;assert.equal(w.tiles.get(t.key),t);assert.ok(w.group.children.includes(t.group));assert.equal(w.surfaceGrid.get('0,0')[0],tile.surfaceGrid.get('0,0')![0]);assert.equal(w.parkedVehiclesNear(10,10,3).length,1);};
  f.finish();assert.equal(published,1);assert.equal(w.tiles.size,1);assert.equal(w.pending.size,0);
  const mesh=w.tiles.get(tile.key).group.children[1];const expected=mesh.geometry.boundingSphere.clone();mesh.geometry.computeBoundingSphere();assert.deepEqual(mesh.geometry.boundingSphere,expected);
 } finally {f.dispose();}
});
test('cancelling obsolete preparation disposes private geometry and rejects late worker results',()=>{
 const f=fixture(),w=f.world;try {
  const tile=f.tile();f.receive(tile);const preparation=w.preparations.get(tile.key);
  const original=THREE.BufferGeometry.prototype.dispose;let disposed=0;
  THREE.BufferGeometry.prototype.dispose=function(){disposed++;return original.call(this);};
  try {preparation.job.next();preparation.job.next();w.cancelPreparation(tile.key);}finally{THREE.BufferGeometry.prototype.dispose=original;}
  assert.equal(disposed,2);assert.equal(w.tiles.size,0);assert.equal(w.surfaceGrid.size,0);assert.equal(w.group.children.length,0);
  w.onMessage({type:'built',key:tile.key,requestId:1,built:tile,ms:1});assert.equal(w.preparations.size,0);
  f.receive(tile,2);f.finish();assert.equal(w.tiles.size,1);
 }finally{f.dispose();}
});
test('one frame publishes at most one tile and failed callbacks roll back all world registrations',()=>{
 const f=fixture(),w=f.world;try {
  f.receive(f.tile());f.receive(f.tile('1_0'),2);w.pumpPreparation(100);assert.equal(w.tiles.size,1);assert.equal(w.preparations.size,1);
  w.onTileAdded=()=>{throw Error('listener failed');};w.pumpPreparation(100);
  assert.equal(w.tiles.size,1);assert.equal(w.group.children.length,1);assert.equal(w.parkedVehicles.length,1);assert.equal(w.surfaceGrid.get('0,0').length,1);assert.equal(w.byBuilding.size,1);assert.equal(w.failures.get('1_0').attempts,1);
  w.onTileAdded=()=>{};f.receive(f.tile('1_0'),3);f.finish();assert.equal(w.tiles.size,2);assert.equal(w.parkedVehicles.length,2);
 }finally{f.dispose();}
});
test('malformed preparation never publishes and can be retried with the same tile identity',()=>{
 const f=fixture(),w=f.world;try {
  const broken=f.tile();Object.defineProperty(broken.buffers[1],'pos',{get(){throw Error('invalid buffer');}});f.receive(broken);w.pumpPreparation(100);
  assert.equal(w.tiles.size,0);assert.equal(w.group.children.length,0);assert.equal(w.parkedVehicles?.length||0,0);assert.equal(w.failures.get('0_0').attempts,1);
  f.receive(f.tile(),2);f.finish();assert.equal(w.tiles.size,1);
 }finally{f.dispose();}
});
test('aborting an area load releases its pending private tile and keeps the old area focus',async()=>{
 const f=fixture(),w=f.world;try {
  w.wanted=()=>['0_0'];w.request=()=>{};w.radius=900;
  const abort=new AbortController(),promise=w.ensure(0,0,700,abort.signal);
  const rejected=assert.rejects(promise,{name:'AbortError'});
  f.receive(f.tile());w.preparations.get('0_0').job.next();abort.abort();await rejected;
  assert.equal(w.focus,null);assert.equal(w.pending.size,0);assert.equal(w.preparations.size,0);assert.equal(w.tiles.size,0);assert.equal(w.waiters.length,0);
 }finally{f.dispose();}
});

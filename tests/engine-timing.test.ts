import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Engine } from '../src/core/engine';
function fixture() {
 const calls:string[]=[];
 const gl:any={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,createQuery:()=>({}),getQueryParameter:(_q:unknown,key:number)=>key===1?false:8e6,getParameter:()=>false,beginQuery:()=>calls.push('begin'),endQuery:()=>calls.push('end'),deleteQuery:()=>calls.push('delete')};
 const engine:any=Object.create(Engine.prototype);
 Object.assign(engine,{contextLost:false,gpuQuery:null,gpuFrames:19,gpuExtension:null,gpuMs:null,sky:{position:new Vector3()},camera:{position:new Vector3()},renderer:{info:{reset(){}},getContext:()=>gl,render:()=>calls.push('render')},scene:{},composer:null,sceneScale:{scale:1,update:()=>1},targetFPS:60,adaptiveResolution:false});
 return {engine,gl,calls};
}
test('unsupported GPU timers leave timing unknown and do not query GPU state',()=>{
 const {engine,calls}=fixture();engine.render();assert.equal(engine.gpuMs,null);assert.deepEqual(calls,['render']);
});
test('pending GPU timing never reads unavailable result or blocks rendering',()=>{
 const {engine,gl,calls}=fixture();engine.gpuQuery={};engine.gpuExtension={GPU_DISJOINT_EXT:3,TIME_ELAPSED_EXT:4};
 gl.getParameter=()=>{throw Error('pending sample must not query result');};engine.render();assert.deepEqual(calls,['render']);
});
test('disjoint GPU samples are discarded and query resources released',()=>{
 const {engine,gl,calls}=fixture();engine.gpuMs=4;engine.gpuQuery={};engine.gpuFrames=0;engine.gpuExtension={GPU_DISJOINT_EXT:3,TIME_ELAPSED_EXT:4};
 gl.getQueryParameter=()=>true;gl.getParameter=()=>true;engine.render();assert.equal(engine.gpuMs,null);assert.deepEqual(calls,['delete','render']);
});
test('render failure closes an active GPU timing query exactly once',()=>{
 const {engine,calls}=fixture();engine.gpuExtension={GPU_DISJOINT_EXT:3,TIME_ELAPSED_EXT:4};engine.renderer.render=()=>{throw Error('test render failure');};
 assert.throws(()=>engine.render(),/test render failure/);assert.deepEqual(calls,['begin','end']);
});

test('geometry preparation restores the current target, retains source ownership and reuses uploads',async()=>{
 const THREE=await import('three'),{engine}=fixture();const calls:any[]=[];
 const source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),original=source.geometry;
 Object.assign(engine,{uploadScene:new THREE.Scene(),uploadCamera:new THREE.Camera(),uploadGeometry:new THREE.BufferGeometry(),uploadMaterial:new THREE.MeshBasicMaterial(),uploadMesh:new THREE.Mesh(),uploadTarget:{name:'private1px'},uploaded:new WeakSet(),uploadStats:{count:0,totalMs:0,maxMs:0}});
 engine.renderer.getRenderTarget=()=>({name:'main'});engine.renderer.setRenderTarget=(target:any)=>calls.push(target.name);
 engine.renderer.render=(scene:any)=>{assert.equal(scene.children[0].geometry,original);assert.equal(scene.children[0].frustumCulled,false);};
 let disposed=0;original.addEventListener('dispose',()=>disposed++);
 engine.prepareMesh(source);engine.prepareMesh(source);assert.deepEqual(calls,['private1px','main']);assert.equal(engine.uploadStats.count,1);assert.equal(disposed,0);assert.equal(source.geometry,original);assert.equal(engine.uploadScene.children.length,0);
 const second=new THREE.Mesh(new THREE.BoxGeometry(),source.material);engine.renderer.render=()=>{throw Error('injected upload failure');};
 assert.throws(()=>engine.prepareMesh(second),/injected upload failure/);assert.equal(calls.at(-1),'main');assert.equal(engine.uploadMesh.geometry,engine.uploadGeometry);assert.equal(engine.uploadScene.children.length,0);
 original.dispose();second.geometry.dispose();engine.uploadGeometry.dispose();engine.uploadMaterial.dispose();(source.material as any).dispose();
});

test('opaque offers/loading and hidden tabs cannot masquerade as presented gameplay frames',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');const classes=new Set<string>();
 const doc:any={hidden:false,documentElement:{classList:{contains:(s:string)=>classes.has(s)}}};Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 try{const{engine,calls}=fixture();assert.equal(engine.canPresent,true);classes.add('ui-blocks-world');assert.equal(engine.render(),false);assert.deepEqual(calls,[]);classes.clear();classes.add('game-loading');assert.equal(engine.canPresent,false);classes.clear();doc.hidden=true;assert.equal(engine.canPresent,false);doc.hidden=false;engine.restoring=true;assert.equal(engine.canPresent,false);engine.restoring=false;assert.equal(engine.render(),true);}
 finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete(globalThis as any).document;}
});

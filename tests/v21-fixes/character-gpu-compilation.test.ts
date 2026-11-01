import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compileCharacterPrograms } from '../../src/delivery/art/gpu-compilation';

function fixture(){
  const canvas=new EventTarget(),handles=[{id:1},{id:2}],complete=new Map(handles.map(handle=>[handle,false]));
  const queries:{handle:unknown;parameter:number}[]=[],compiles:unknown[][]=[];
  let lost=false,khr=true,compileFailure=false,linkFailure=false;
  const gl={LINK_STATUS:35714,isContextLost:()=>lost,
    getProgramParameter(handle:typeof handles[number],parameter:number){queries.push({handle,parameter});return parameter===37297?complete.get(handle):!linkFailure;},
    getProgramInfoLog:()=>linkFailure?'fixture link error':'',
  };
  const renderer:any={domElement:canvas,getContext:()=>gl,info:{programs:handles.map(program=>({program}))},
    extensions:{get(name:string){assert.equal(name,'KHR_parallel_shader_compile');return khr?{COMPLETION_STATUS_KHR:37297}:null;}},
    compile(...args:unknown[]){compiles.push(args);if(compileFailure)throw new Error('fixture compile error');},
    compileAsync(){throw new Error('Native uncancellable polling must not be started.');},
  };
  Object.defineProperty(renderer,'properties',{get(){throw new Error('Private material properties must not be read.');}});
  return {renderer:renderer as THREE.WebGLRenderer,canvas,handles,complete,queries,compiles,
    setLost(value:boolean){lost=value;},setKhr(value:boolean){khr=value;},setCompileFailure(value:boolean){compileFailure=value;},setLinkFailure(value:boolean){linkFailure=value;}};
}
const object=new THREE.Group(),camera=new THREE.PerspectiveCamera(),scene=new THREE.Scene();
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('public compile is invoked synchronously and KHR waits without querying link status while a program is pending',async()=>{
  const f=fixture(),promise=compileCharacterPrograms(f.renderer,object,camera,scene,()=>true,1000);
  assert.deepEqual(f.compiles,[[object,camera,scene]],'caller can restore its render target immediately after this invocation');
  assert.ok(f.queries.length>0);assert.ok(f.queries.every(query=>query.parameter===37297));
  f.complete.set(f.handles[0],true);await delay(15);
  assert.ok(f.queries.every(query=>query.parameter===37297),'one ready program does not cause a blocking query on another');
  f.complete.set(f.handles[1],true);await promise;
  assert.equal(f.queries.filter(query=>query.parameter===35714).length,2);
});

test('lost/restored interrupts a never-completing wait immediately, stops polling and permits a fresh retry',async()=>{
  const f=fixture(),old=compileCharacterPrograms(f.renderer,object,camera,scene,()=>true,1000);
  const rejection=assert.rejects(old,/graphics context change/);
  f.setLost(true);f.canvas.dispatchEvent(new Event('webglcontextlost'));await rejection;
  const count=f.queries.length;await delay(25);assert.equal(f.queries.length,count,'cancelled native handles are never polled again');
  f.setLost(false);f.canvas.dispatchEvent(new Event('webglcontextrestored'));
  f.handles.forEach(handle=>f.complete.set(handle,true));await compileCharacterPrograms(f.renderer,object,camera,scene);
  assert.equal(f.compiles.length,2);
  f.handles.forEach(handle=>f.complete.set(handle,false));
  const pending=compileCharacterPrograms(f.renderer,object,camera,scene,()=>true,1000),restored=assert.rejects(pending,/graphics context change/);
  f.canvas.dispatchEvent(new Event('webglcontextrestored'));await restored;
});

test('compile failure, link failure, timeout and validity cancellation all reject without starting native asynchronous polling',async()=>{
  const f=fixture();f.setCompileFailure(true);await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene),/fixture compile error/);
  f.setCompileFailure(false);f.handles.forEach(handle=>f.complete.set(handle,true));f.setLinkFailure(true);
  await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene),/could not be linked.*fixture link error/);
  f.setLinkFailure(false);f.handles.forEach(handle=>f.complete.set(handle,false));
  await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene,()=>true,25),/timed out/);
  let valid=true;const pending=compileCharacterPrograms(f.renderer,object,camera,scene,()=>valid,1000);valid=false;
  await assert.rejects(pending,/cancelled/);
  const calls=f.compiles.length;await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene,()=>false),/cancelled/);assert.equal(f.compiles.length,calls);
});

test('no-KHR fallback checks linking on a later task, and a retired unrelated program does not strand the snapshot',async()=>{
  const f=fixture();f.setKhr(false);
  const promise=compileCharacterPrograms(f.renderer,object,camera,scene);
  assert.equal(f.queries.length,0,'the fallback allows the caller to restore renderer state before its driver query');
  await promise;assert.equal(f.queries.filter(query=>query.parameter===35714).length,2);
  const next=fixture(),waiting=compileCharacterPrograms(next.renderer,object,camera,scene,()=>true,1000);
  next.renderer.info.programs=next.renderer.info.programs!.slice(0,1);
  next.complete.set(next.handles[0],true);await waiting;
  assert.equal(next.queries.filter(query=>query.parameter===35714).length,1);
});

test('invalid timeouts and an already-lost context fail before shader compilation',async()=>{
  const f=fixture();
  for(const value of [NaN,Infinity,0,-1])await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene,()=>true,value),/finite positive timeout/);
  f.setLost(true);await assert.rejects(compileCharacterPrograms(f.renderer,object,camera,scene),/temporarily unavailable/);
  assert.equal(f.compiles.length,0);
});

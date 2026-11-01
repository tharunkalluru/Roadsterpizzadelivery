import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warmCharacterGeometry } from '../../src/delivery/art/gpu-geometry';

function fixture(){
  const canvas=new EventTarget(),originalTarget=new THREE.WebGLRenderTarget(20,10),root=new THREE.Group(),parent=new THREE.Group();parent.add(root);
  const geometry=new THREE.BoxGeometry(),other=new THREE.BoxGeometry(2,2,2),material=new THREE.MeshStandardMaterial();
  geometry.boundingSphere=null;other.boundingSphere=null;
  const first=new THREE.Mesh(geometry,[material,material]),second=new THREE.Mesh(geometry,material),third=new THREE.Mesh(other,material);
  first.visible=false;root.add(first,second,third);let sourceCallbacks=0;first.onBeforeRender=()=>{sourceCallbacks++;};
  let target:THREE.WebGLRenderTarget|null=originalTarget,face=3,mip=2,lost=false,fail=false;
  const draws:THREE.BufferGeometry[]=[],compiles:THREE.BufferGeometry[]=[],bindings:unknown[][]=[];
  const originalViewport=new THREE.Vector4(2,3,60,40);
  const renderer:any={domElement:canvas,sortObjects:true,xr:{enabled:true},shadowMap:{enabled:true},
    info:{autoReset:true,render:{frame:17,calls:7,triangles:33,points:1,lines:2}},
    extensions:{get:()=>null},getContext:()=>({isContextLost:()=>lost}),getRenderTarget:()=>target,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,
    getViewport:(out:THREE.Vector4)=>out.copy(originalViewport),getPixelRatio:()=>2,
    setRenderTarget(next:THREE.WebGLRenderTarget|null,f=0,m=0){target=next;face=f;mip=m;bindings.push([next,f,m]);},
    compile(scene:THREE.Scene){assert.equal(target!.width,1,'compile uses the same offscreen colour-space variant as the draw');compiles.push((scene.children[0] as THREE.Mesh).geometry);},
    render(scene:THREE.Scene){
      const proxy=scene.children[0] as THREE.Mesh;
      assert.notEqual(proxy,first);assert.equal(proxy.frustumCulled,false);assert.equal(renderer.sortObjects,false);
      assert.equal(renderer.xr.enabled,false);assert.equal(renderer.shadowMap.enabled,false);
      assert.equal(target!.width,1);assert.equal(target!.height,1);assert.equal(target!.scissorTest,false);
      assert.ok(proxy.material instanceof THREE.MeshBasicMaterial);assert.ok(root.parent===parent);assert.equal(first.visible,false);
      renderer.info.render.frame++;renderer.info.render.calls++;draws.push(proxy.geometry);
      if(fail)throw new Error('simulated offscreen draw failure');
    },
  };
  return {root,parent,first,geometry,other,material,renderer:renderer as THREE.WebGLRenderer,draws,compiles,bindings,originalTarget,
    counts:()=>({...renderer.info.render}),flags:()=>({sort:renderer.sortObjects,xr:renderer.xr.enabled,shadows:renderer.shadowMap.enabled,auto:renderer.info.autoReset}),
    target:()=>({target,face,mip}),sourceCallbacks:()=>sourceCallbacks,setLost:(v:boolean)=>lost=v,setFail:(v:boolean)=>fail=v,canvas};
}
const noWait=async()=>{};

test('offscreen upload shares exact indexed geometry, avoids all source mutations and preserves framebuffer/presentation state',async()=>{
  const f=fixture(),positions=f.geometry.attributes.position.array.slice(),indices=f.geometry.index!.array.slice();let disposals=0,yields=0;
  f.geometry.addEventListener('dispose',()=>disposals++);
  assert.equal(await warmCharacterGeometry(f.root,f.renderer,async()=>{yields++;},()=>true),2);
  assert.deepEqual(f.draws,[f.geometry,f.other]);assert.deepEqual(f.compiles,[f.geometry,f.other]);assert.equal(yields,4);
  assert.equal(disposals,0);assert.equal(f.sourceCallbacks(),0);assert.equal(f.root.parent,f.parent);assert.equal(f.first.visible,false);
  assert.equal(f.geometry.boundingSphere,null);assert.deepEqual(f.geometry.attributes.position.array,positions);assert.deepEqual(f.geometry.index!.array,indices);
  assert.deepEqual(f.flags(),{sort:true,xr:true,shadows:true,auto:true});assert.deepEqual(f.target(),{target:f.originalTarget,face:3,mip:2});
  assert.deepEqual(f.counts(),{frame:19,calls:7,triangles:33,points:1,lines:2});
  const viewport=new THREE.Vector4();f.renderer.getViewport(viewport);assert.deepEqual(viewport.toArray(),[2,3,60,40]);assert.equal(f.renderer.getPixelRatio(),2);
  await warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);assert.equal(f.draws.length,2,'a second actor/template sharing the buffers does not upload again');
});

test('failed draw restores all borrowed renderer state and retries without disposing source resources',async()=>{
  const f=fixture();f.setFail(true);
  await assert.rejects(warmCharacterGeometry(f.root,f.renderer,noWait,()=>true),/offscreen draw failure/);
  assert.deepEqual(f.flags(),{sort:true,xr:true,shadows:true,auto:true});assert.deepEqual(f.target(),{target:f.originalTarget,face:3,mip:2});assert.equal(f.root.parent,f.parent);
  assert.deepEqual(f.counts(),{frame:18,calls:7,triangles:33,points:1,lines:2});
  f.setFail(false);await warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);assert.equal(f.draws.length,3);
});

test('queued upload cancellation and graphics restoration invalidate readiness without stale draws',async()=>{
  const f=fixture();let valid=false;
  await assert.rejects(warmCharacterGeometry(f.root,f.renderer,noWait,()=>valid),/interrupted/);assert.equal(f.draws.length,0);
  valid=true;await warmCharacterGeometry(f.root,f.renderer,noWait,()=>valid);assert.equal(f.draws.length,2);
  f.setLost(true);f.canvas.dispatchEvent(new Event('webglcontextrestored'));
  await assert.rejects(warmCharacterGeometry(f.root,f.renderer,noWait,()=>true),/interrupted/);assert.equal(f.draws.length,2);
  f.setLost(false);await warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);assert.equal(f.draws.length,4);
  f.geometry.dispose();await warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);assert.equal(f.draws.length,5,'an explicitly disposed/reused buffer needs a fresh upload');
});

test('asynchronous shader wait restores the caller framebuffer immediately and morph proxies own their influences',async()=>{
  const f=fixture();let ready=false,started!:()=>void;
  const began=new Promise<void>(resolve=>started=resolve),program={} as WebGLProgram;
  (f.renderer.info as any).programs=[{program}];
  (f.renderer.extensions as any).get=()=>({COMPLETION_STATUS_KHR:91});
  (f.renderer as any).getContext=()=>({isContextLost:()=>false,LINK_STATUS:1,getProgramParameter:(_p:unknown,type:number)=>type===91?ready:true});
  f.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(f.geometry.attributes.position.count*3),3)];
  const original=f.renderer.compile.bind(f.renderer);let first=true;
  f.renderer.compile=(scene,camera,targetScene)=>{const compiled=original(scene,camera,targetScene);if(first){first=false;const mesh=(scene as THREE.Scene).children[0] as THREE.Mesh;assert.equal(mesh.morphTargetInfluences?.length,1);started();}return compiled;};
  const preparing=warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);await began;
  assert.deepEqual(f.target(),{target:f.originalTarget,face:3,mip:2},'waiting for a program cannot steal the next gameplay framebuffer');
  ready=true;await preparing;assert.equal(f.first.morphTargetInfluences,undefined,'the actual source mesh was never modified');
});

test('a context change cancels a stalled compile so fresh geometry work is not trapped behind the old queue',async()=>{
  const f=fixture();let ready=false,started!:()=>void;
  const began=new Promise<void>(resolve=>started=resolve),program={} as WebGLProgram;
  (f.renderer.info as any).programs=[{program}];
  (f.renderer.extensions as any).get=()=>({COMPLETION_STATUS_KHR:91});
  (f.renderer as any).getContext=()=>({isContextLost:()=>false,LINK_STATUS:1,getProgramParameter:(_p:unknown,type:number)=>type===91?ready:true});
  const original=f.renderer.compile.bind(f.renderer);
  f.renderer.compile=(...args)=>{const compiled=original(...args);started();return compiled;};
  const stalled=warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);await began;
  f.canvas.dispatchEvent(new Event('webglcontextrestored'));
  await assert.rejects(stalled,/context change/);assert.equal(f.draws.length,0);
  ready=true;await warmCharacterGeometry(f.root,f.renderer,noWait,()=>true);assert.equal(f.draws.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector2, Vector3 } from 'three';
import { Engine } from '../src/core/engine';
import { SceneResolutionController } from '../src/core/performance-monitor';

test('resolution window reset preserves lost-context scale and discards 2.9s pressure', () => {
  const c = new SceneResolutionController();
  c.update(3, 30, 60, true); assert.equal(c.scale, .975);
  c.update(2.9, 30, 60, true); assert.equal(c.pressure, 2.9);
  c.reset(); assert.equal(c.scale, .975); assert.equal(c.pressure, 0); assert.equal(c.healthy, 0);
  c.update(.2, 30, 60, true); assert.equal(c.scale, .975); assert.equal(c.pressure, .2);
  c.update(2.81, 30, 60, true); assert.equal(c.scale, .95, 'only fresh 3s pressure may reduce scale');
});
test('healthy recovery evidence also resets; restoration returns scale 1 without stale GPU evidence', () => {
  const c = new SceneResolutionController(); for(let i=0;i<4;i++)c.update(3,30,60,true);
  assert.equal(c.scale,.9);c.update(9.9,2,60,true);c.reset();c.update(.2,2,60,true);assert.equal(c.scale,.9);
  c.update(9.81,2,60,true);assert.equal(c.scale,.925);
  assert.equal(c.reset(true),1);assert.equal(c.pressure,0);assert.equal(c.healthy,0);
  c.update(.25,null,60,true);assert.equal(c.scale,1);assert.equal(c.pressure,0);
});
function fixture(scale=1) {
 const calls:any[]=[];let ratio=scale,w=640,h=360;
 const engine:any=Object.create(Engine.prototype),container={clientWidth:640,clientHeight:360};
 const controller=new SceneResolutionController();controller.scale=scale;
 Object.assign(engine,{contextLost:true,restoring:true,opts:{lowQ:false},container,sceneScale:controller,gpuQuery:{invalid:true},gpuMs:50,gpuFrames:19,lastRenderAt:100,renderSize:new Vector2(),
  renderer:{getPixelRatio:()=>ratio,setPixelRatio:(n:number)=>{ratio=n;calls.push(['ratio',n]);},getSize:(v:Vector2)=>v.set(w,h),setSize:(x:number,y:number)=>{w=x;h=y;calls.push(['size',x,y]);},info:{reset(){}},getContext:()=>({}),render:()=>calls.push(['render'])},
  composer:null,camera:{position:new Vector3(),aspect:640/360,updateProjectionMatrix:()=>calls.push(['projection'])},sky:{position:new Vector3()},scene:{},gpuExtension:null,targetFPS:60,adaptiveResolution:true});
 return{engine,calls,container};
}
function withWindow(fn:()=>void) {
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});
 try{fn();}finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete(globalThis as any).window;}
}
test('lost context never reallocates targets and same-scale restore applies pending viewport size',()=>withWindow(()=>{
 const{engine,calls,container}=fixture(1);engine.sceneScale.pressure=2.9;engine.sceneScale.healthy=9.9;
 engine.resetAdaptiveAfterContextChange(false);assert.equal(engine.sceneScale.scale,1);assert.equal(engine.gpuMs,null);assert.equal(engine.gpuQuery,null);assert.equal(engine.gpuFrames,0);assert.equal(engine.lastRenderAt,0);
 container.clientWidth=900;container.clientHeight=400;engine.resize();engine.resetAdaptiveAfterContextChange(true);assert.deepEqual(calls,[],'even erroneous restored request must not allocate while context remains lost');
 engine.contextLost=false;engine.resetAdaptiveAfterContextChange(true);assert.deepEqual(calls,[['size',900,400],['projection']]);assert.equal(engine.camera.aspect,2.25);assert.equal(engine.sceneScale.pressure,0);assert.equal(engine.sceneScale.healthy,0);
}));
test('restoration resets scale before resize and fixed still fixtures allocate no adaptive targets',()=>withWindow(()=>{
 const{engine,calls}=fixture(.925);engine.resetAdaptiveAfterContextChange(false);assert.equal(engine.sceneScale.scale,.925);assert.deepEqual(calls,[]);
 engine.contextLost=false;engine.resetAdaptiveAfterContextChange(true);assert.equal(engine.sceneScale.scale,1);assert.deepEqual(calls,[['ratio',1]]);
 const still=fixture(.9);still.engine.opts.still={w:1280,h:592};still.engine.contextLost=false;still.engine.resetAdaptiveAfterContextChange(true);assert.equal(still.engine.sceneScale.scale,1);assert.deepEqual(still.calls,[]);
}));
test('first restored rendered frame has zero adaptation debt and cannot inherit pressure',()=>withWindow(()=>{
 const{engine}=fixture(.975);engine.sceneScale.pressure=2.9;engine.resetAdaptiveAfterContextChange(false);engine.contextLost=false;engine.resetAdaptiveAfterContextChange(true);engine.restoring=false;
 const previous=Object.getOwnPropertyDescriptor(globalThis,'performance');let now=1_000_000;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
 try{engine.gpuMs=30;engine.render();assert.equal(engine.sceneScale.scale,1);assert.equal(engine.sceneScale.pressure,0);now+=100;engine.render();assert.equal(engine.sceneScale.scale,1);assert.ok(Math.abs(engine.sceneScale.pressure-.1)<1e-9);}
 finally{if(previous)Object.defineProperty(globalThis,'performance',previous);else delete(globalThis as any).performance;}
}));
test('High composer receives restored scale and current viewport after loss, without lost-context calls',()=>withWindow(()=>{
 const{engine,calls,container}=fixture(.9);
 engine.composer={setPixelRatio:(r:number)=>calls.push(['composerRatio',r]),setSize:(w:number,h:number)=>calls.push(['composerSize',w,h])};
 engine.resetAdaptiveAfterContextChange(false);container.clientWidth=900;container.clientHeight=400;engine.resize();assert.deepEqual(calls,[]);
 engine.contextLost=false;engine.resetAdaptiveAfterContextChange(true);
 assert.deepEqual(calls,[['ratio',1],['composerRatio',1],['size',900,400],['projection'],['composerSize',900,400]]);
}));

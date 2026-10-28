import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredQuality, rememberQuality } from '../src/core/quality-profile';

test('Auto requires a current measured GPU/CPU profile and honors render density',()=>{
 const previousStorage=(globalThis as any).localStorage,previousDPR=(globalThis as any).devicePixelRatio;
 const saved=new Map<string,string>();Object.assign(globalThis,{devicePixelRatio:2,localStorage:{getItem:(k:string)=>saved.get(k)||null,setItem:(k:string,v:string)=>saved.set(k,v)}});
 try{
  assert.equal(measuredQuality(),true);
  rememberQuality(3,16.7,null);assert.equal(measuredQuality(),true,'unknown GPU is not high-quality evidence');
  rememberQuality(3,16.7,6,true);assert.equal(measuredQuality(),true,'a Low measurement does not certify the High preset');
  rememberQuality(3,16.7,6,false);assert.equal(measuredQuality(),false);
  (globalThis as any).devicePixelRatio=3;assert.equal(measuredQuality(),true,'different render density requires a fresh measurement');
  (globalThis as any).devicePixelRatio=2;
  const key='roadster-measured-quality-v1';saved.set(key,JSON.stringify({version:3,time:Date.now()-86400001,pixelRatio:2,low:false,measuredPreset:'high'}));assert.equal(measuredQuality(),true);
  saved.set(key,JSON.stringify({version:3,time:Date.now(),pixelRatio:2,low:'false'}));assert.equal(measuredQuality(),true);
  rememberQuality(3,16.7,NaN,false);assert.equal(measuredQuality(),true);
 }finally{(globalThis as any).localStorage=previousStorage;(globalThis as any).devicePixelRatio=previousDPR;}
});

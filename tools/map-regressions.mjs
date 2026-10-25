import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const temp = mkdtempSync(path.join(tmpdir(), 'roadster-map-'));
try {
  const entry = path.join(temp, 'map.mjs');
  await build({entryPoints:[new URL('../game/src/ui/map.ts',import.meta.url).pathname],outfile:entry,bundle:true,platform:'node',format:'esm'});
  const {FullMap} = await import(entry);
  function fixture() {
    const calls = {closed:0,cancel:0,released:[],zoom:[]};
    const panel = {hidden:false};
    const m=Object.assign(Object.create(FullMap.prototype),{
      root:{hidden:false,dataset:{pick:'1'},querySelector:()=>panel},open:true,dirty:false,
      pointers:new Map([[3,{x:1,y:1}]]),pinch0:7,
      cv:{hasPointerCapture:()=>true,releasePointerCapture:id=>calls.released.push(id)},
      onClose:()=>calls.closed++,pick:{onCancel:()=>calls.cancel++},
      zoomAt:n=>calls.zoom.push(n)
    });
    return {m,calls,panel};
  }
  {const {m,calls,panel}=fixture();m.close();assert.equal(m.open,false);assert.equal(m.root.hidden,true);assert.equal(m.pick,null);assert.equal(panel.hidden,true);assert.equal(calls.closed,1);assert.equal(calls.cancel,1);assert.equal(m.pointers.size,0);assert.deepEqual(calls.released,[3]);m.close();assert.equal(calls.closed,1);}
  {const {m,calls}=fixture();m.cancelPick();assert.equal(m.open,true);assert.equal(m.pick,null);assert.equal(calls.closed,0);assert.equal(calls.cancel,1);}
  {const {m,calls}=fixture();m.pick.onCancel=()=>{calls.cancel++;m.hide();};m.close();assert.equal(calls.closed,1);assert.equal(calls.cancel,1);}
  {const {m,calls}=fixture();m.pointers.set(4,{x:2,y:2});m.cv.releasePointerCapture=id=>{calls.released.push(id);if(id===3)throw Error('already released');};m.close();assert.equal(m.open,false);assert.equal(m.pointers.size,0);assert.equal(m.pinch0,0);assert.deepEqual(calls.released,[3,4]);assert.equal(calls.closed,1);assert.equal(calls.cancel,1);}
  for (const code of ['KeyM','KeyP','Escape']) {const {m,calls}=fixture();m.handleKey({code,key:'',repeat:true,preventDefault(){}});assert.equal(m.open,true);m.handleKey({code,key:'',repeat:false,preventDefault(){}});assert.equal(m.open,false);assert.equal(calls.closed,1);}
  {const {m,calls}=fixture();m.handleKey({code:'Equal',key:'+',preventDefault(){}});assert.deepEqual(calls.zoom,[1.4]);assert.equal(m.open,true);}
  {const {m}=fixture();let prevented=0;m.handleKey({code:'Space',key:' ',target:{closest:()=>({})},preventDefault(){prevented++;}});assert.equal(prevented,0);m.handleKey({code:'Space',key:' ',target:{closest:()=>null},preventDefault(){prevented++;}});assert.equal(prevented,1);}
  {const {m}=fixture();let attempts=0;m.buildP=null;m.load=async()=>{m.loading=true;if(++attempts===1)throw Error('network');m.loading=false;};await assert.rejects(m.build(),/network/);assert.equal(m.loading,false);assert.equal(m.buildP,null);await m.build();assert.equal(attempts,2);}
  console.log('Map regressions: close/cancel, initial picker, repeated keys, pointer cleanup, zoom, and failed-load retry passed.');
} finally {rmSync(temp,{recursive:true,force:true});}

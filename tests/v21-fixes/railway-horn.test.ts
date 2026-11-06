import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../../src/game/audio';

test('train horn respects unlock, mute, hidden-page state, distance and spatial pan and releases its voices',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
  const nodes:any[]=[],oscillators:any[]=[],param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>{const n={connect(){},disconnect(){this.disconnected=true;},disconnected:false};nodes.push(n);return n;};
  const context:any={state:'running',currentTime:0,createGain:()=>Object.assign(node(),{gain:param()}),createStereoPanner:()=>Object.assign(node(),{pan:param()}),createOscillator:()=>{const o=Object.assign(node(),{frequency:param(),start(time:number){this.startAt=time;},stop(time:number){this.stopAt=time;},onended:null as any,startAt:0,stopAt:0});oscillators.push(o);return o;}};
  const sound:any=Object.assign(Object.create(Sound.prototype),{ctx:null,master:null,muted:false,foreground:true,trainHornAt:-Infinity});
  try{
    sound.trainHorn(0,0);assert.equal(oscillators.length,0,'no gesture-unlocked context means no voices');
    sound.ctx=context;sound.effects={};sound.trainHorn(150,2);assert.equal(oscillators.length,3);assert.ok(nodes.some(n=>n.pan?.value===1));assert.ok(oscillators.every(o=>o.stopAt-o.startAt>=1.3));
    sound.trainHorn(150,0);assert.equal(oscillators.length,3,'adjacent crossing records do not layer duplicate horns');
    oscillators.forEach(o=>o.onended());assert.ok(nodes.every(n=>n.disconnected),'all transient horn nodes disconnect');
    context.currentTime=3;sound.muted=true;sound.trainHorn(0,0);sound.muted=false;(document as any).hidden=true;sound.trainHorn(0,0);(document as any).hidden=false;sound.foreground=false;sound.trainHorn(0,0);sound.foreground=true;sound.trainHorn(1000,0);assert.equal(oscillators.length,3);
  }finally{prior?Object.defineProperty(globalThis,'document',prior):delete(globalThis as any).document;}
});

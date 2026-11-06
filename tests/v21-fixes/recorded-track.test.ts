import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordedTrack} from '../../src/game/recorded-track';

function fixture(loop=false) {
  const starts:number[]=[],sources:any[]=[];
  const context={state:'running',currentTime:0,decodeAudioData:async()=>({duration:10}),createBufferSource:()=>{
    const source={connect(){},disconnect(){},onended:null,start(_time:number,offset:number){starts.push(offset);},stop(){}};
    sources.push(source);return source;
  }};
  let ends=0;
  const track=new RecordedTrack(context as unknown as AudioContext,{} as AudioNode,loop,()=>ends++);
  return {starts,sources,context,track,ends:()=>ends};
}

test('pause, late decode, resume and natural conversation completion share the playback clock',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1])));
  const f=fixture();
  f.track.setActive(true);
  const load=f.track.load('voice');
  f.track.setActive(false);
  await load;
  assert.equal(f.starts.length,0);
  f.track.setActive(true);f.track.setActive(true);f.context.currentTime=3;
  f.track.setActive(false);f.context.currentTime=8;
  assert.equal(f.track.position,3);
  f.track.setActive(true);assert.deepEqual(f.starts,[0,3]);
  f.sources[1].onended();
  assert.equal(f.track.position,10);assert.equal(f.track.status,'ended');
  f.track.setActive(false);f.track.setActive(true);
  assert.equal(f.starts.length,2);assert.equal(f.ends(),1);
});

test('music resumes inside the current loop and a failed conversation releases the story',async t=>{
  const f=fixture(true);
  t.mock.method(globalThis,'fetch',async(url:string)=>new Response(new Uint8Array([1]),{status:url==='missing'?404:200}));
  f.track.setActive(true);await f.track.load('music');
  assert.equal(f.sources[0].loop,true);
  f.context.currentTime=27;f.track.setActive(false);f.track.setActive(true);
  assert.deepEqual(f.starts,[0,7]);await f.track.load('missing');
  assert.equal(f.track.status,'failed');assert.equal(f.ends(),1);
});

test('loading a different level cancels the previous recording even during decode',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1])));
  const f=fixture();let finishOld!:()=>void,begin!:()=>void;
  const oldDecoding=new Promise<void>(resolve=>{begin=resolve;});
  let decodes=0;
  f.context.decodeAudioData=async()=>{
    if(++decodes===1){begin();await new Promise<void>(resolve=>{finishOld=resolve;});}
    return {duration:decodes===2?7:10};
  };
  f.track.setActive(true);const old=f.track.load('old');await oldDecoding;
  await f.track.load('new');finishOld();await old;
  assert.equal(f.starts.length,1);assert.equal(f.track.status,'playing');
  f.track.clear();assert.equal(f.track.status,'idle');assert.equal(f.track.duration,0);
});

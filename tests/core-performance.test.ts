import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceMonitor, FixedStepClock, PresentationPacer, SceneResolutionController } from '../src/core/performance-monitor';
import { jumpProfile, JUMP_AIRTIME, JUMP_HEIGHT, JUMP_COOLDOWN_SECONDS } from '../src/game/jump-motion';
import { ROAD_SPEED_LIMIT, FLIGHT_SPEED_LIMIT } from '../src/game/player';
test('monitor retains only bounded recent samples and reports percentiles',()=>{
 const p=new PerformanceMonitor(3); [1,2,3,4,5].forEach(x=>p.record('frame',x)); const s=p.summary().phases.frame;
 assert.equal(s.count,3); assert.equal(s.p50,4); assert.equal(s.max,5);
});
test('lifetime frame histogram retains stalls after rolling samples expire and resets cleanly',()=>{
 const p=new PerformanceMonitor(3);p.record('frameInterval',500);for(let i=0;i<10;i++)p.record('frameInterval',16.7);
 const s=p.summary().phases.frameInterval;assert.equal(s.max,16.7);assert.equal(s.lifetime.count,11);assert.equal(s.lifetime.max,500);assert.equal(s.lifetime.p95UpperMs,500);
 p.enabled=false;p.record('frameInterval',5);assert.equal(p.summary().phases.frameInterval.lifetime.count,11);
 p.reset();assert.deepEqual(p.summary().phases,{});assert.equal(p.activeSeconds,0);
});
test('simulation time is presentation-rate independent and pauses discard debt',()=>{
 for(const hz of [30,60,90,120]) {const c=new FixedStepClock();let ticks=0;for(let i=0;i<hz*5;i++)ticks+=c.advance(1/hz,true);assert.equal(ticks,300);}
 const c=new FixedStepClock();assert.equal(c.advance(2,true),4);assert.ok(c.droppedSeconds>0);assert.equal(c.advance(2,false),0);assert.equal(c.accumulator,0);
});
test('frame pacing preserves native refresh despite callback jitter and caps faster displays',()=>{
 const jittered=new PresentationPacer();for(let i=0;i<600;i++)assert.equal(jittered.due((i%2?16.2:17.1)/1000,60),true);
 for(const display of [60,90,120,144])for(const target of [60,90,120]){
  const p=new PresentationPacer();let count=0;for(let i=0;i<display*10;i++)if(p.due(1/display,target))count++;
  assert.ok(Math.abs(count-Math.min(display,target)*10)<=1,`${display} Hz display / ${target} FPS requested: ${count}`);
 }
 const p=new PresentationPacer();p.due(2,60,false);assert.equal(p.due(1/120,120),true);
});
test('adaptive resolution is opt-in, bounded, gradual, and needs GPU evidence',()=>{
 const c=new SceneResolutionController();for(let i=0;i<120;i++)c.update(1,40,60,false);assert.equal(c.scale,1);
 for(let i=0;i<120;i++)c.update(1,null,60,true);assert.equal(c.scale,1);
 for(let i=0;i<120;i++)c.update(1,40,60,true);assert.equal(c.scale,.9);
 for(let i=0;i<120;i++)c.update(1,2,60,true);assert.equal(c.scale,1);
});
test('authorized jump and speed limits stay unchanged',()=>{
 assert.equal(JUMP_HEIGHT,3.125);assert.equal(JUMP_AIRTIME,5/3);assert.equal(JUMP_COOLDOWN_SECONDS,5);
 assert.equal(jumpProfile(0).rise,0);assert.equal(jumpProfile(JUMP_AIRTIME/2).rise,JUMP_HEIGHT);assert.equal(jumpProfile(JUMP_AIRTIME).rise,0);
 assert.ok(Math.abs(ROAD_SPEED_LIMIT*3.6-120)<1e-9);assert.ok(Math.abs(FLIGHT_SPEED_LIMIT*3.6-160)<1e-9);
});

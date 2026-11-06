import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayCadence } from '../../src/delivery/qa/gameplay-cadence';

test('cadence records actual wall time and keeps simulation clamping separate',()=>{
 const meter=new GameplayCadence();meter.sample(0,0,true);meter.sample(1000/60,1/60,true);meter.sample(1000/60+200,1/60+.05,true);
 const report=meter.summary();assert.equal(report.intervals,2);assert.ok(Math.abs(report.activeWallMs-(200+1000/60))<1e-9);
 assert.ok(Math.abs(report.simulatedMs-(50+1000/60))<1e-9);assert.equal(report.intervalMs.longest,200);
 assert.equal(report.missedBudgetWithHalfMillisecondTolerance.fps60,1,'the 200ms stall cannot hide behind the physics clamp');
});

test('paused, hidden and focus transitions do not count as gameplay or produce resume-gap stalls',()=>{
 const meter=new GameplayCadence();meter.sample(0,0,true);meter.sample(20,.02,true);meter.sample(40,.02,false);
 for(let n=1;n<=100;n++)meter.sample(40+n*1000,.02,false);
 meter.sample(101000,.04,true);meter.sample(101020,.06,true);meter.break();meter.sample(400000,.08,true);meter.sample(400020,.1,true);
 const report=meter.summary();assert.equal(report.intervals,3);assert.equal(report.activeWallMs,60);assert.equal(report.intervalMs.longest,20);
});

test('60, 90 and 120 callback fixtures are measured independently without promising a display capability',()=>{
 for(const hz of [60,90,120]){
  const meter=new GameplayCadence();for(let i=0;i<=hz*2;i++)meter.sample(i*1000/hz,i/hz,true);
  const report=meter.summary();assert.ok(Math.abs(report.observedCallbacksPerSecond!-hz)<1e-8);assert.ok(Math.abs(report.activeWallMs-2000)<1e-8);
  assert.equal(report.missedBudgetWithHalfMillisecondTolerance['fps'+hz as 'fps60'|'fps90'|'fps120'],0);
 }
});

test('invalid samples break continuity and long stalls remain explicit beyond the bounded histogram',()=>{
 const meter=new GameplayCadence();meter.sample(0,0,true);meter.sample(NaN,.01,true);meter.sample(50000,.02,true);meter.sample(52000,.07,true);
 const report=meter.summary();assert.equal(report.intervals,1);assert.equal(report.activeWallMs,2000);assert.equal(report.intervalMs.longest,2000);
 assert.equal(report.intervalMs.atLeast1000ms,1);assert.equal(report.intervalMs.p95,1000);
});

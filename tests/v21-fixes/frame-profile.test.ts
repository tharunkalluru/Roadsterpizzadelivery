import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameProfile} from '../../src/core/frame-profile';
test('opt-in profiler counts thresholds and excludes inactive callback gaps',()=>{
 const p=new FrameProfile();p.frame(1,true);p.record('disabled',100);assert.deepEqual(p.report(),{});
 p.enabled=true;p.frame(1,true);p.frame(11,true);p.frame(100,false);p.frame(1000,true);p.frame(1026,true);
 const r=p.report()['frame.interval'];assert.equal(r.count,2);assert.equal(r.p50,10);assert.equal(r.p95,26);assert.equal(r.over25,1);assert.equal(r.over33_3,0);
 assert.throws(()=>p.measure('throw',()=>{throw Error('original')}),/original/);assert.equal(p.report().throw.count,1);
});
test('profiling storage is bounded while full-session counts and maximum persist',()=>{
 const p=new FrameProfile();p.enabled=true;p.record('work',99);
 for(let i=0;i<40000;i++)p.record('work',1);
 const r=p.report().work;assert.equal(r.retained,32768);assert.equal(r.count,40001);assert.equal(r.max,99);assert.equal(r.p99,1);
 p.reset();assert.deepEqual(p.report(),{});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runReplay } from '../scripts/sim-replay-runner';

test('actual Player state sequences are invariant at 30/60/90/120 presentation',()=>{
  for(const scenario of ['jump','drive-brake','fly-once'] as const){
    const reference=runReplay({scenario,hz:60});
    for(const hz of [30,60,90,120])assert.deepEqual(runReplay({scenario,hz}).samples,reference.samples);
  }
});
test('jump preserves apex, momentum distance and five second cooldown after actual landing',()=>{
  const r=runReplay({scenario:'jump',hz:120});
  assert.equal(r.jumpStarts,1);assert.equal(r.apex-.55,3.125);
  assert.ok(Math.abs(r.landedAt!-5/3)<=1/60+1e-8);
  assert.ok(Math.abs(r.landingDistance!-12.5*r.landedAt!)<1e-7);
  assert.ok(r.canJumpReadyAt!>=r.landedAt!+5-1e-8);
  assert.ok(r.canJumpReadyAt!<=r.landedAt!+5+1/60+1e-8);
});
test('one-shot flight action is not repeated by multi-step presentation frames',()=>{
  for(const hz of [30,60,90,120]){const r=runReplay({scenario:'fly-once',hz});assert.equal(r.flightToggles,1);assert.equal(r.final[9],true);}
});
test('road acceleration, braking distance and travel retain baseline golden values',()=>{
  const r=runReplay({scenario:'drive-brake',hz:60});
  assert.ok(Math.abs(r.brakingStartSpeed!-27)<1e-8);
  assert.ok(Math.abs(r.brakingStopDistance!-18.007777777777697)<1e-7);
  assert.equal(r.stoppedAt,4.4);
  assert.ok(Math.abs(r.travelDistance-58.73277777777766)<1e-7);
  assert.equal(r.final[5],0);
});
test('visual random draws cannot affect precomputed simulation input and global RNG restores',()=>{
  const originalRandom=Math.random,originalNow=Date.now,originalDoc=(globalThis as any).document;
  const a=runReplay({scenario:'drive-brake',hz:60,renderRandomDraws:0}),b=runReplay({scenario:'drive-brake',hz:120,renderRandomDraws:99});
  assert.deepEqual(a.samples,b.samples);assert.equal(Math.random,originalRandom);assert.equal(Date.now,originalNow);assert.equal((globalThis as any).document,originalDoc);
});

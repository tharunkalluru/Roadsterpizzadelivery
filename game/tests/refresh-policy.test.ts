import test from 'node:test';
import assert from 'node:assert/strict';
import { RefreshPolicy, compatibleRefresh } from '../src/core/refresh-policy';
import { PresentationPacer } from '../src/core/performance-monitor';
class Run {
  now = 0; last = 0; readonly pacer = new PresentationPacer();
  constructor(readonly policy: RefreshPolicy) {}
  drive(hz: number, seconds: number, cpu = 2, options: { jitter?: boolean; delayed?: boolean; noPresentation?: boolean } = {}) {
    for (let i = 0; i < Math.round(hz * seconds); i++) {
      const ms = 1000 / hz * (options.jitter ? (i % 2 ? 1.018 : .982) : 1); this.now += ms;
      const s = this.policy.state, presented = !options.noPresentation && this.pacer.due(ms / 1000, s.effectiveFPS, true, s.callbackDivisor);
      const interval = presented && this.last ? (this.now - this.last) * (options.delayed ? 2 : 1) : undefined;
      if (presented) this.last = this.now;
      this.policy.observe({ rafMs: ms, cpuMs: cpu, presented, presentationMs: interval, active: true });
    }
    return this.policy.state;
  }
}
test('compatible goals use integer callback divisors and never exceed preference', () => {
  const cases = [[60,60,60],[60,90,60],[60,120,60],[90,60,45],[90,90,90],[90,120,90],[120,60,60],[120,90,60],[120,120,120],[144,60,48],[144,90,72],[144,120,72]];
  for (const [hz, request, expected] of cases) { const r = compatibleRefresh(hz,request); assert.equal(r.fps,expected); assert.equal(hz/r.fps,r.divisor); assert.ok(r.fps<=request); }
});
test('default remains conservative and a 60 callback stream cannot enable 90 or 120', () => {
  for (const requested of [60,90,120] as const) { const p=new RefreshPolicy(requested), r=new Run(p);r.drive(60,15);assert.equal(p.state.effectiveFPS,60);assert.equal(p.state.observedCadenceHz,60);assert.equal(p.state.requestedFPS,requested); }
});
test('higher targets require sustained warm CPU and paced presentation evidence', () => {
  for (const [hz,requested,expected] of [[90,90,90],[120,120,120],[144,90,72],[144,120,72]] as const) {
    const p=new RefreshPolicy(requested),r=new Run(p);r.drive(hz,5);assert.ok(p.state.effectiveFPS<=60);r.drive(hz,10);assert.equal(p.state.effectiveFPS,expected);assert.ok(p.state.effectiveFPS<=requested);
  }
  const p=new RefreshPolicy(90);new Run(p).drive(120,20);assert.equal(p.state.effectiveFPS,60);assert.equal(p.state.callbackDivisor,2);
  const missing=new RefreshPolicy(120);new Run(missing).drive(120,20,1,{noPresentation:true});assert.equal(missing.state.effectiveFPS,60);
});
test('compatible pacing has uniform callback gaps under mild callback jitter', () => {
  for (const [hz,fps,divisor] of [[120,60,2],[144,72,2],[144,48,3],[90,90,1]] as const) {
    const p=new PresentationPacer(),frames:number[]=[];
    for(let i=0;i<600;i++)if(p.due((1000/hz*(i%2?1.02:.98))/1000,fps,true,divisor))frames.push(i);
    const gaps=frames.slice(1).map((n,i)=>n-frames[i]);assert.ok(gaps.every(n=>n===divisor));
    p.reset();assert.equal(p.due(1/hz,fps,true,divisor),true);
  }
});
test('sustained pressure lowers actual goal and recovery has cooldown hysteresis', () => {
  const p=new RefreshPolicy(120),r=new Run(p);r.drive(120,15);assert.equal(p.state.effectiveFPS,120);
  r.drive(120,.3,25);assert.equal(p.state.effectiveFPS,120,'one short spike must not switch immediately');
  r.drive(120,4,25);assert.ok(p.state.effectiveFPS<120);assert.equal(p.state.requestedFPS,120);
  r.drive(120,4,2);assert.ok(p.state.effectiveFPS<120,'cooldown must prevent immediate oscillation');
  r.drive(120,30,2);assert.equal(p.state.effectiveFPS,120);
});
test('CPU alone and unstable loaded callbacks never establish high-refresh capability', () => {
  const cpuOnly=new RefreshPolicy(120);for(let i=0;i<2400;i++)cpuOnly.observe({rafMs:1000/120,cpuMs:1,presented:true,active:true});assert.equal(cpuOnly.state.effectiveFPS,60);
  const jitter=new RefreshPolicy(120);for(let i=0;i<2400;i++)jitter.observe({rafMs:i%2?8.33:16.67,cpuMs:1,presented:true,presentationMs:16.67,active:true});assert.equal(jitter.state.observedCadenceHz,null);assert.equal(jitter.state.effectiveFPS,60);
  const slow=new RefreshPolicy(120);new Run(slow).drive(120,15,15);assert.ok(slow.state.effectiveFPS<=60);
});
test('pause, viewport reset, preference changes and long gaps discard stale evidence', () => {
  const p=new RefreshPolicy(120),r=new Run(p);r.drive(120,15);assert.equal(p.state.effectiveFPS,120);
  p.observe({rafMs:1000,cpuMs:0,presented:false,active:false});assert.equal(p.state.effectiveFPS,60);assert.equal(p.state.observedCadenceHz,null);assert.equal(p.snapshot().sampledCallbacks,0);
  r.drive(120,1);assert.equal(p.state.effectiveFPS,60);p.reset('viewport');assert.equal(p.state.reason,'viewport');assert.equal(p.snapshot().sampledPresentedFrames,0);
  r.drive(120,15);assert.equal(p.state.effectiveFPS,120);p.setRequestedFPS(90);assert.equal(p.state.requestedFPS,90);assert.equal(p.state.effectiveFPS,60);r.drive(120,15);assert.equal(p.state.effectiveFPS,60);
  p.observe({rafMs:1000,cpuMs:1,presented:true,presentationMs:1000,active:true});assert.equal(p.state.observedCadenceHz,null);assert.equal(p.snapshot().sampledCallbacks,0);
});
test('evidence storage stays bounded and unknown settings normalize to conservative preference', () => {
  const p=new RefreshPolicy(120);new Run(p).drive(144,180);const s=p.snapshot();assert.ok(s.sampledCallbacks<=240);assert.ok(s.sampledPresentedFrames<=240);assert.equal(s.capacity,240);assert.ok(s.healthySeconds<=5);
  p.setRequestedFPS(1000);assert.equal(p.state.requestedFPS,60);assert.equal(p.state.effectiveFPS,60);
});
test('stale previously healthy presentation samples cannot enable a higher goal', () => {
  const p=new RefreshPolicy(120),r=new Run(p);r.drive(120,4);assert.equal(p.state.effectiveFPS,60);
  r.drive(120,20,1,{noPresentation:true});assert.equal(p.state.effectiveFPS,60);assert.equal(p.state.healthySeconds,0);
  r.drive(120,15);assert.equal(p.state.effectiveFPS,120);
  r.drive(120,2,1,{noPresentation:true});assert.equal(p.state.effectiveFPS,60);
});
test('lost cadence confidence does not raise a pressure-demoted presentation target', () => {
  const p=new RefreshPolicy(120),r=new Run(p);r.drive(120,15);r.drive(120,5,30);
  const demoted=p.state.effectiveFPS;assert.ok(demoted<60);
  for(let i=0;i<500;i++)p.observe({rafMs:i%2?8.33:16.67,cpuMs:30,presented:true,presentationMs:40,active:true});
  assert.equal(p.state.observedCadenceHz,null);assert.ok(p.state.effectiveFPS<=demoted);
});

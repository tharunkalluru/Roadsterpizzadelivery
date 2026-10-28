// Bounded local diagnostics. No network telemetry and no synchronous GPU waits.
export class PerformanceMonitor {
  private samples = new Map<string, { values: Float64Array; at: number; count: number; total: number; max: number; histogram: Uint32Array }>();
  private starts = new Map<string, number>();
  counters: Record<string, number> = {};
  activeSeconds = 0;
  enabled = true;
  constructor(public capacity = 1800) {}
  record(name: string, value: number) {
    if (!this.enabled || !Number.isFinite(value) || value < 0) return;
    let ring = this.samples.get(name);
    if (!ring) { ring = { values: new Float64Array(this.capacity), at: 0, count: 0, total: 0, max: 0, histogram: new Uint32Array(401) }; this.samples.set(name, ring); }
    ring.values[ring.at] = value; ring.at = (ring.at + 1) % this.capacity; ring.count = Math.min(this.capacity, ring.count + 1);
    ring.total++; ring.max = Math.max(ring.max, value); ring.histogram[Math.min(400, Math.floor(value * 2))]++;
  }
  begin(name: string) { if (this.enabled) this.starts.set(name, performance.now()); }
  end(name: string) { const start = this.starts.get(name); if (start !== undefined) { this.record(name, performance.now() - start); this.starts.delete(name); } }
  count(name: string, n = 1) { this.counters[name] = (this.counters[name] || 0) + n; }
  reset() { this.samples.clear(); this.starts.clear(); this.counters = {}; this.activeSeconds = 0; }
  summary() {
    const phases: Record<string, any> = {};
    for (const [name, ring] of this.samples) {
      const v = Array.from(ring.values.subarray(0, ring.count)).sort((a,b) => a-b);
      const at = (p: number) => v.length ? v[Math.min(v.length-1, Math.floor((v.length-1)*p))] : null;
      const lifetimeAt = (p: number) => { let n = 0; const target = Math.ceil(ring.total * p); for (let i = 0; i < ring.histogram.length; i++) { n += ring.histogram[i]; if (n >= target) return i === 400 ? ring.max : (i + 1) / 2; } return null; };
      phases[name] = { count: v.length, p50: at(.5), p95: at(.95), p99: at(.99), max: v.at(-1) ?? null,
        lifetime: { count: ring.total, p50UpperMs: lifetimeAt(.5), p95UpperMs: lifetimeAt(.95), p99UpperMs: lifetimeAt(.99), max: ring.max, histogramStepMs: .5 } };
    }
    return { enabled: this.enabled, activeSeconds: this.activeSeconds, phases, counters: { ...this.counters }, sampledCapacity: this.capacity };
  }
}

export class FixedStepClock {
  accumulator = 0; droppedSeconds = 0;
  readonly step = 1 / 60;
  advance(dt: number, active: boolean) {
    if (!active) { this.accumulator = 0; return 0; }
    this.droppedSeconds += Math.max(0, dt - .25);
    this.accumulator += Math.max(0, Math.min(dt, .25));
    const available = Math.floor((this.accumulator + 1e-10) / this.step), steps = Math.min(4, available);
    this.accumulator -= steps * this.step;
    if (available > 4) { const dropped = Math.floor(this.accumulator / this.step) * this.step; this.droppedSeconds += dropped; this.accumulator -= dropped; }
    return steps;
  }
  get alpha() { return Math.max(0, Math.min(1, this.accumulator / this.step)); }
}

// Pace against callback time, not the varying time at which physics finishes.
// On a display already at/below the requested rate, every callback is useful.
export class PresentationPacer {
  private elapsed = 0; private target = 0; private divisor: number | null = null; private callbackPhase = 0;
  reset() { this.elapsed = this.target = this.callbackPhase = 0; this.divisor = null; }
  due(dt: number, hz: number, active = true, callbackDivisor: number | null = null) {
    const divisor = Number.isInteger(callbackDivisor) && callbackDivisor! >= 1 && callbackDivisor! <= 16 ? callbackDivisor : null;
    if (!active || hz !== this.target || divisor !== this.divisor) { this.elapsed = this.callbackPhase = 0; this.target = hz; this.divisor = divisor; return true; }
    if (divisor !== null) {
      // Count compatible callback slots: no alternating 8/16 ms "90 FPS" on a
      // fixed 120 callback stream. A missed slot presents once, never catches up.
      if (dt >= (1 / (hz * divisor)) * 1.8) { this.callbackPhase = 0; return true; }
      if (++this.callbackPhase < divisor) return false;
      this.callbackPhase = 0; return true;
    }
    const period = 1 / hz;
    this.elapsed += Math.max(0, dt);
    if (dt >= period * .85) { this.elapsed = 0; return true; }
    if (this.elapsed + period * .025 < period) return false;
    this.elapsed = Math.max(0, this.elapsed - period); return true;
  }
}

export class SceneResolutionController {
  scale = 1; pressure = 0; healthy = 0;
  reset(restoreScale = false) {
    this.pressure = this.healthy = 0;
    if (restoreScale) this.scale = 1;
    return this.scale;
  }
  update(dt: number, gpuMs: number | null, hz: number, enabled: boolean) {
    if (!enabled) { this.scale = 1; this.pressure = this.healthy = 0; return this.scale; }
    // Unknown GPU time is not evidence that a CPU stall needs lower resolution.
    if (gpuMs === null) return this.scale;
    const budget = 1000 / hz;
    if (gpuMs > budget * .9) { this.pressure += dt; this.healthy = 0; }
    else if (gpuMs < budget * .65) { this.healthy += dt; this.pressure = 0; }
    else this.pressure = this.healthy = 0;
    if (this.pressure >= 3) { this.scale = Math.max(.9, Math.round((this.scale - .025) * 1000) / 1000); this.pressure = 0; }
    if (this.healthy >= 10) { this.scale = Math.min(1, Math.round((this.scale + .025) * 1000) / 1000); this.healthy = 0; }
    return this.scale;
  }
}

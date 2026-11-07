/** Opt-in CPU diagnostics. Timings describe submitted JS/WebGL work, not GPU
 * completion or phone display presentation. Storage is bounded per category. */
export class FrameProfile {
  enabled = false;
  private samples = new Map<string, { values: Float64Array; count: number; total: number; max: number; over: number[] }>();
  private previous = 0;
  reset() { this.samples.clear(); this.previous = 0; }
  frame(now: number, active: boolean) {
    if (!this.enabled) return;
    if (active && this.previous) this.record('frame.interval', now - this.previous);
    this.previous = active ? now : 0;
  }
  record(name: string, milliseconds: number) {
    if (!this.enabled || !Number.isFinite(milliseconds) || milliseconds < 0) return;
    let sample = this.samples.get(name);
    if (!sample) { sample = { values: new Float64Array(32768), count: 0, total: 0, max: 0, over: [0, 0, 0, 0] }; this.samples.set(name, sample); }
    sample.values[sample.count % sample.values.length] = milliseconds;
    sample.count++; sample.total += milliseconds; sample.max = Math.max(sample.max, milliseconds);
    [16.67, 25, 33.3, 50].forEach((limit, i) => { if (milliseconds > limit) sample!.over[i]++; });
  }
  measure<T>(name: string, action: () => T): T {
    if (!this.enabled) return action();
    const start = performance.now();
    try { return action(); } finally { this.record(name, performance.now() - start); }
  }
  report() {
    return Object.fromEntries([...this.samples].map(([name, sample]) => {
      const values = Array.from(sample.values.subarray(0, Math.min(sample.count, sample.values.length))).sort((a, b) => a - b);
      const percentile = (p: number) => values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? 0;
      return [name, { count: sample.count, retained: values.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sample.max, total: sample.total, over16_67: sample.over[0], over25: sample.over[1], over33_3: sample.over[2], over50: sample.over[3] }];
    }));
  }
}
export const frameProfile = new FrameProfile();
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qaProfile') === '1') {
  frameProfile.enabled = true;
  Object.assign(window, { __frameProfile: frameProfile });
}

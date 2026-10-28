// Observed browser callback cadence, never a claim about a screen's hardware Hz.
export type RequestedRefresh = 60 | 90 | 120;
export interface RefreshSample {
  rafMs: number;
  cpuMs: number;
  presented: boolean;
  presentationMs?: number | null;
  active: boolean;
}
export interface RefreshDecision {
  requestedFPS: RequestedRefresh;
  effectiveFPS: number;
  observedCadenceHz: number | null;
  callbackDivisor: number | null;
  reason: 'warming' | 'unknown-cadence' | 'compatible' | 'headroom-probe' | 'pressure' | 'cooldown' | 'inactive' | 'viewport';
  healthySeconds: number;
  pressureSeconds: number;
}
const CADENCES = [30, 40, 48, 50, 60, 72, 75, 80, 90, 100, 120, 144, 165, 180, 240];
const WINDOW = 240;
const clampRequest = (value: number): RequestedRefresh => value === 90 || value === 120 ? value : 60;

/** Even callback spacing at/below the requested presentation goal. */
export function compatibleRefresh(cadenceHz: number, requestedFPS: number) {
  if (!Number.isFinite(cadenceHz) || cadenceHz <= 0 || !Number.isFinite(requestedFPS) || requestedFPS <= 0) return { fps: 60, divisor: null as number | null };
  const divisor = Math.max(1, Math.ceil(cadenceHz / requestedFPS - 1e-7));
  return { fps: cadenceHz / divisor, divisor };
}

/**
 * Fixed-size local evidence windows. 60 is a preference/default, not a promise.
 * High refresh is probed only after sustained active headroom. CPU/frame timing
 * cannot identify a phone GPU or display mode, so unstable cadence stays unknown.
 */
export class RefreshPolicy {
  readonly state: RefreshDecision;
  private raf = new Float64Array(WINDOW);
  private cpu = new Float64Array(WINDOW);
  private intervals = new Float64Array(WINDOW);
  private scratch = new Float64Array(WINDOW);
  private rafAt = 0; private rafCount = 0;
  private cpuAt = 0; private cpuCount = 0;
  private intervalAt = 0; private intervalCount = 0;
  private elapsed = 0; private evaluateIn = 0; private cooldown = 0;
  private active = false; private unknownWindows = 0; private evidenceAge = Infinity; private pressureCap: number | null = null;
  constructor(requestedFPS: RequestedRefresh = 60) {
    this.state = { requestedFPS: clampRequest(requestedFPS), effectiveFPS: 60, observedCadenceHz: null, callbackDivisor: null, reason: 'warming', healthySeconds: 0, pressureSeconds: 0 };
  }
  setRequestedFPS(value: number) {
    const next = clampRequest(value);
    if (next !== this.state.requestedFPS) { this.state.requestedFPS = next; this.reset(); }
    return this.state;
  }
  reset(reason: 'warming' | 'inactive' | 'viewport' = 'viewport') {
    this.rafAt = this.rafCount = this.cpuAt = this.cpuCount = this.intervalAt = this.intervalCount = 0;
    this.elapsed = this.evaluateIn = this.cooldown = this.unknownWindows = 0; this.active = false; this.evidenceAge = Infinity; this.pressureCap = null;
    Object.assign(this.state, { effectiveFPS: 60, observedCadenceHz: null, callbackDivisor: null, reason, healthySeconds: 0, pressureSeconds: 0 });
    return this.state;
  }
  snapshot() { return { ...this.state, sampledCallbacks: this.rafCount, sampledPresentedFrames: this.cpuCount, capacity: WINDOW }; }
  private percentile(values: Float64Array, count: number, fraction: number) {
    this.scratch.set(values.subarray(0, count), 0);
    const view = this.scratch.subarray(0, count); view.sort();
    return view[Math.min(count - 1, Math.floor((count - 1) * fraction))];
  }
  private cadence() {
    if (this.rafCount < 30) return null;
    const median = this.percentile(this.raf, this.rafCount, .5);
    const lo = this.percentile(this.raf, this.rafCount, .1), hi = this.percentile(this.raf, this.rafCount, .9);
    // Mixed/missed callbacks under load do not establish a compatible cadence.
    if (hi - lo > Math.max(.6, median * .08)) return null;
    const hz = 1000 / median;
    let nearest = CADENCES[0]; for (const candidate of CADENCES) if (Math.abs(candidate - hz) < Math.abs(nearest - hz)) nearest = candidate;
    return Math.abs(nearest - hz) / nearest <= .035 ? nearest : null;
  }
  private use(fps: number, divisor: number | null, reason: RefreshDecision['reason']) {
    if (fps !== this.state.effectiveFPS || divisor !== this.state.callbackDivisor) {
      // Intervals from the previous goal are not evidence about the new goal.
      this.intervalCount = this.intervalAt = 0;
    }
    this.state.effectiveFPS = Math.min(this.state.requestedFPS, fps);
    this.state.callbackDivisor = divisor; this.state.reason = reason;
  }
  observe(sample: RefreshSample): RefreshDecision {
    if (!sample.active) { if (this.active || this.state.reason !== 'inactive') this.reset('inactive'); return this.state; }
    if (!Number.isFinite(sample.rafMs) || sample.rafMs <= 0) return this.state;
    if (sample.rafMs > 250) { this.reset('warming'); return this.state; }
    this.active = true;
    const dt = sample.rafMs / 1000;
    this.elapsed += dt; this.evaluateIn += dt; this.evidenceAge += dt; this.cooldown = Math.max(0, this.cooldown - dt);
    this.raf[this.rafAt] = sample.rafMs; this.rafAt = (this.rafAt + 1) % WINDOW; this.rafCount = Math.min(WINDOW, this.rafCount + 1);
    if (sample.presented && Number.isFinite(sample.cpuMs) && sample.cpuMs >= 0) {
      this.cpu[this.cpuAt] = sample.cpuMs; this.cpuAt = (this.cpuAt + 1) % WINDOW; this.cpuCount = Math.min(WINDOW, this.cpuCount + 1);
      if (sample.presentationMs != null && Number.isFinite(sample.presentationMs) && sample.presentationMs > 0) {
        this.evidenceAge = 0;
        this.intervals[this.intervalAt] = sample.presentationMs; this.intervalAt = (this.intervalAt + 1) % WINDOW; this.intervalCount = Math.min(WINDOW, this.intervalCount + 1);
      }
    }
    // Sort a bounded scratch buffer only twice a second, never every frame.
    if (this.elapsed < 2 || this.evaluateIn < .5) return this.state;
    const evaluated = Math.min(.6, this.evaluateIn); this.evaluateIn = 0;
    const cadence = this.cadence();
    if (cadence === null) {
      this.state.healthySeconds = this.state.pressureSeconds = 0;
      if (++this.unknownWindows >= 2 || this.state.observedCadenceHz === null) {
        this.state.observedCadenceHz = null; this.use(Math.min(60, this.state.effectiveFPS), null, 'unknown-cadence');
      }
      return this.state;
    }
    this.unknownWindows = 0;
    const base = compatibleRefresh(cadence, 60), goal = compatibleRefresh(cadence, this.state.requestedFPS);
    if (this.state.observedCadenceHz !== cadence) {
      this.state.observedCadenceHz = cadence; this.state.healthySeconds = this.state.pressureSeconds = 0;
      const safe = compatibleRefresh(cadence, Math.min(60, this.pressureCap ?? 60));
      this.use(safe.fps, safe.divisor, 'warming');
    }
    const cpu = this.cpuCount >= 20 ? this.percentile(this.cpu, this.cpuCount, .95) : null;
    const interval = this.intervalCount >= 20 ? this.percentile(this.intervals, this.intervalCount, .95) : null;
    const budget = 1000 / this.state.effectiveFPS;
    if (this.evidenceAge > .15) {
      // Fast callbacks with no fresh rendered CPU+interval sample are not
      // evidence of rendering headroom (even if a caller mislabeled active).
      this.state.healthySeconds = this.state.pressureSeconds = 0;
      const safe = compatibleRefresh(cadence, Math.min(base.fps, this.state.effectiveFPS));
      this.use(safe.fps, safe.divisor, 'warming'); return this.state;
    }
    const pressure = cpu !== null && cpu > budget * .9 || interval !== null && interval > budget * 1.25;
    if (pressure) {
      this.state.pressureSeconds += evaluated; this.state.healthySeconds = 0;
      if (this.state.pressureSeconds >= 2) {
        const nextDivisor = Math.min(Math.max(1, Math.floor(cadence / 30)), (this.state.callbackDivisor || 1) + 1);
        this.pressureCap = cadence / nextDivisor;
        this.use(this.pressureCap, nextDivisor, 'pressure');
        this.state.pressureSeconds = 0; this.cooldown = 10;
      }
      return this.state;
    }
    this.state.pressureSeconds = 0;
    // A healthy paced presentation window is required as well as cheap CPU work.
    // At 60 on a 120 callback stream this tests current stability, then a higher
    // goal is a guarded probe; sustained presentation pressure will undo it.
    const healthy = cpu !== null && interval !== null && cpu < (1000 / goal.fps) * .65 && interval <= budget * 1.2;
    if (healthy && this.cooldown === 0) this.state.healthySeconds = Math.min(5, this.state.healthySeconds + evaluated);
    else this.state.healthySeconds = 0;
    if (this.cooldown > 0) this.state.reason = 'cooldown';
    else if (goal.fps <= this.state.effectiveFPS) this.state.reason = 'compatible';
    else if (this.state.healthySeconds >= 5) {
      this.pressureCap = null; this.use(goal.fps, goal.divisor, 'headroom-probe'); this.state.healthySeconds = 0;
    }
    return this.state;
  }
}

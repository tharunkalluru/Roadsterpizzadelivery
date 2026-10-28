/** Time-based token bucket, shared by buses and other strategic traffic plans. */
export class PlanningBudget {
  private credit = 2; private frameLeft = .75;
  spentMs = 0; overruns = 0; deferred = 0;
  beginFrame(dt: number) { this.credit = Math.min(2, this.credit + Math.max(0, dt) * 30); this.frameLeft = Math.min(.75, this.credit); }
  get available() { return Math.min(this.credit, this.frameLeft) > .025; }
  run<T>(work: () => T): T | undefined {
    if (!this.available) { this.deferred++; return undefined; }
    const start = performance.now(), result = work(), elapsed = Math.max(.005, performance.now() - start);
    this.credit -= elapsed; this.frameLeft -= elapsed; this.spentMs += elapsed;
    if (elapsed > .75) this.overruns++; return result;
  }
}

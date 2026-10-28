export interface RouteSearchIdentity {
  targetKey: string; graphRevision: number; placementRevision: number;
  startKey?: string; airborne?: boolean;
  sourceX?: number; sourceZ?: number;
}
/** Coalesces persistent retry conditions; major state changes are consumed once. */
export class RouteSearchGate {
  private context = ''; private event = ''; private nextAt = -Infinity;
  private failedKey = ''; private failedUntil = -Infinity;
  private active: { generation: number; key: string } | null = null;
  private generation = 0;
  private pending: { token: number; identity: string; job: RoadRouteJob; x?: number; z?: number; travelled: number } | null = null;
  private sliceFrame: number | undefined; private sliceLeft = 1;
  get hasPending() { return !!this.pending; }
  searches = 0; suppressed = 0;
  reset() { this.pending?.job.cancel(); this.pending = null; this.context = this.event = this.failedKey = ''; this.nextAt = this.failedUntil = -Infinity; this.active = null; this.generation++; }
  /** A target/graph/placement/mode change rejects old work before spending its next slice. */
  updateSearch(nowSeconds: number, identity: RouteSearchIdentity, create?: () => RoadRouteJob, budgetMs = 1, frameId?: number): { state: 'idle' | 'pending' | 'complete' | 'failed'; route?: RoadRoute; travelledMetres?: number } {
    const stamp = `${identity.targetKey}|${identity.graphRevision}|${identity.placementRevision}|${identity.airborne ? 1 : 0}`;
    if (this.pending && this.pending.identity !== stamp) this.cancel();
    if (!this.pending && create) {
      const token = this.allow(nowSeconds, identity);
      if (token !== null) this.pending = { token, identity: stamp, job: create(), x: identity.sourceX, z: identity.sourceZ, travelled: 0 };
    }
    const pending = this.pending;
    if (!pending) return { state: 'idle' };
    if (identity.sourceX !== undefined && identity.sourceZ !== undefined) {
      if (pending.x !== undefined && pending.z !== undefined) pending.travelled += Math.hypot(identity.sourceX - pending.x, identity.sourceZ - pending.z);
      pending.x = identity.sourceX; pending.z = identity.sourceZ;
    }
    // Several fixed simulation ticks can share one presentation frame. They
    // share this allowance rather than each spending another millisecond.
    if (frameId === undefined || frameId !== this.sliceFrame) { this.sliceFrame = frameId; this.sliceLeft = budgetMs; }
    if (this.sliceLeft <= 0) return { state: 'pending' };
    const started = performance.now(), status = pending.job.step(Math.min(budgetMs, this.sliceLeft));
    this.sliceLeft -= performance.now() - started;
    if (status === 'pending') return { state: 'pending' };
    this.pending = null;
    if (status !== 'complete') { this.cancel(); return { state: 'idle' }; }
    if (!this.finish(pending.token, !!pending.job.result, nowSeconds)) return { state: 'idle' };
    return pending.job.result ? { state: 'complete', route: pending.job.result, travelledMetres: pending.travelled } : { state: 'failed' };
  }
  allow(nowSeconds: number, identity: RouteSearchIdentity, reason = 'retry'): number | null {
    const context = `${identity.targetKey}|${identity.placementRevision}`;
    const event = `${context}|${identity.graphRevision}|${identity.airborne ? 1 : 0}`;
    const key = `${event}|${identity.startKey || ''}`;
    const changed = context !== this.context || event !== this.event;
    if (changed) { this.generation++; this.active = null; this.failedUntil = -Infinity; }
    this.context = context; this.event = event;
    if (this.active || !changed && (nowSeconds < this.nextAt || key === this.failedKey && nowSeconds < this.failedUntil)) { this.suppressed++; return null; }
    this.nextAt = nowSeconds + .6; this.searches++;
    this.active = { generation: ++this.generation, key }; return this.generation;
  }
  finish(generation: number, success: boolean, nowSeconds: number): boolean {
    if (!this.active || this.active.generation !== generation) return false;
    if (!success) { this.failedKey = this.active.key; this.failedUntil = nowSeconds + 1.2; }
    else { this.failedKey = ''; this.failedUntil = -Infinity; }
    this.active = null; return true;
  }
  cancel() { this.pending?.job.cancel(); this.pending = null; this.active = null; this.generation++; }
}

import type { RoadRoute, RoadRouteJob } from './roadgraph';

type Priority = 'current' | 'upcoming';
export interface ScenePreparationDependencies {
  warm(ids: readonly string[]): Promise<void>;
  retain(ids: readonly string[]): void;
  now(): number;
  failed?(error: unknown, priority: Priority): void;
}
const unique = (ids: readonly string[]) => [...new Set(ids)];

/** Only current actors gate entry. Upcoming actors are speculative work: a
 * slow, failed or obsolete next delivery cannot hold the current scene hostage.
 * The registry still owns cancellation, shared templates and live instances. */
export class ScenePreparation {
  private current: string[] = [];
  private window: string[] = [];
  private currentKey: string | undefined;
  private windowKey: string | undefined;
  private readyKey: string | undefined;
  private currentRevision = 0;
  private upcomingRevision = 0;
  private currentPending = false;
  private upcomingPending = false;
  private upcomingReady = false;
  private currentRetry = Infinity;
  private upcomingRetry = Infinity;
  private preparation = Promise.resolve();
  private disposed = false;
  constructor(private dependencies: ScenePreparationDependencies) {}
  get nextRetryAt() { return Math.min(this.currentRetry, this.ready(this.current) ? this.upcomingRetry : Infinity); }
  get currentPreparation() { return this.preparation; }
  /** Explicit loading-screen Retry works while the simulation clock is
   * paused. It never starts a duplicate pending preparation. */
  retryCurrent(){if(!this.currentPending&&!this.ready(this.current)){this.currentRetry=0;this.startCurrent();}return this.preparation;}
  ready(ids: readonly string[]) { return !this.disposed && this.readyKey !== undefined && this.readyKey === unique(ids).join('|'); }

  select(currentIds: readonly string[], windowIds: readonly string[]) {
    if (this.disposed) return;
    const current = unique(currentIds), window = unique([...current, ...windowIds]);
    const currentKey = current.join('|'), windowKey = window.join('|');
    const changedCurrent = this.currentKey !== currentKey, changedWindow = this.windowKey !== windowKey;
    if (changedWindow) { this.window = window; this.windowKey = windowKey; this.dependencies.retain(window); }
    if (changedCurrent) {
      this.current = current; this.currentKey = currentKey; this.readyKey = undefined;
      this.currentRevision++; this.currentPending = false; this.currentRetry = 0;
    }
    if (changedCurrent || changedWindow) {
      this.upcomingRevision++; this.upcomingPending = false; this.upcomingReady = false; this.upcomingRetry = 0;
    }
    this.startCurrent();
    if (this.ready(this.current)) this.startUpcoming();
  }
  private startCurrent() {
    if (this.disposed || this.currentPending || this.ready(this.current) || this.dependencies.now() < this.currentRetry) return;
    const revision = this.currentRevision, key = this.currentKey!, ids = [...this.current];
    this.currentPending = true; this.currentRetry = Infinity;
    this.preparation = Promise.resolve().then(() => {
      // A selection can change before this microtask runs. Do not enqueue an
      // obsolete load after retain() has already retired its old window.
      if(this.disposed||revision!==this.currentRevision)return;
      return this.dependencies.warm(ids);
    });
    void this.preparation.then(() => {
      if (this.disposed || revision !== this.currentRevision) return;
      this.currentPending = false; this.readyKey = key; this.startUpcoming();
    }, error => {
      if (this.disposed || revision !== this.currentRevision) return;
      this.currentPending = false; this.currentRetry = this.dependencies.now() + 5;
      this.dependencies.failed?.(error, 'current');
    });
  }
  private startUpcoming() {
    if (this.disposed || !this.ready(this.current) || this.upcomingPending || this.upcomingReady || this.dependencies.now() < this.upcomingRetry) return;
    const ids = this.window.filter(id => !this.current.includes(id)), revision = this.upcomingRevision;
    if (!ids.length) { this.upcomingReady = true; this.upcomingRetry = Infinity; return; }
    this.upcomingPending = true; this.upcomingRetry = Infinity;
    void Promise.resolve().then(() => {
      if(this.disposed||revision!==this.upcomingRevision)return;
      return this.dependencies.warm(ids);
    }).then(() => {
      if (this.disposed || revision !== this.upcomingRevision) return;
      this.upcomingPending = false; this.upcomingReady = true;
    }, error => {
      if (this.disposed || revision !== this.upcomingRevision) return;
      this.upcomingPending = false; this.upcomingRetry = this.dependencies.now() + 5;
      this.dependencies.failed?.(error, 'upcoming');
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.currentRevision++; this.upcomingRevision++;
    this.readyKey = undefined; this.currentRetry = this.upcomingRetry = Infinity;
  }
}

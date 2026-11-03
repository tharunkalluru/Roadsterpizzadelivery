import type { Destination, LevelConfig } from '../core/types';
import type { ProgressSystem } from './progress-system';

/** The outward navigation payload contains no identity, script or mechanic hint. */
export class OrderSystem {
  private active: LevelConfig | null = null;
  constructor(private progress: ProgressSystem) {}
  get level() { return this.active; }
  get destination(): Destination | null { return this.active ? { ...this.active.destination } : null; }
  assign(level:LevelConfig|null=this.progress.nextLevel) {
    if (this.active) return null;
    const next = level;
    this.active = next ? { ...next, destination: { ...next.destination }, moduleParams: { ...next.moduleParams } } : null;
    return this.active;
  }
  clear() { this.active = null; }
}

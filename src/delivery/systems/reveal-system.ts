import type { CelebrityCard, LevelConfig } from '../core/types';
import type { EventBus, DeliveryEvents } from '../core/events';
import type { ProgressSystem } from './progress-system';

export class RevealSystem {
  current: CelebrityCard | null = null;
  constructor(private events: EventBus<DeliveryEvents>, private progress: ProgressSystem) {}
  get cards() { return this.progress.cards; }
  reveal(level: LevelConfig) {
    if (this.current?.id === level.id) return this.current;
    this.current = { id: level.id, level: level.level, ...level.celebrity, completionLine: level.completionLine };
    this.events.emit('celebrityRevealed', { ...this.current });
    return this.current;
  }
  clear() { this.current = null; }
}

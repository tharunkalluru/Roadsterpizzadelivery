import type { CelebrityCard, LevelConfig, StorageLike } from '../core/types';

export const MYSTERY_SAVE_KEY = 'roadster-mystery-progress-v1';

/** Completion is saved by stable content id. An interrupted order is safe to retry after a reload. */
export class ProgressSystem {
  private completed = new Set<string>();
  saveAvailable = true;
  constructor(readonly levels: readonly LevelConfig[], private storage?: StorageLike) {
    if (!levels.length) throw new Error('Progress requires delivery content.');
    this.load();
  }
  get total() { return this.levels.length; }
  get nextLevel(): LevelConfig | null { return this.levels.find(level => !this.completed.has(level.id)) ?? null; }
  get currentLevel() { return this.nextLevel?.level ?? this.total; }
  get completedIds() { return this.levels.filter(level => this.completed.has(level.id)).map(level => level.id); }
  get finished() { return this.nextLevel === null; }
  get restaurantStage() {
    return [...this.levels].reverse().find(level => this.completed.has(level.id))?.restaurantStage ?? 'Your dream';
  }
  get restaurantIndex() { return this.completedIds.length; }
  get cards(): CelebrityCard[] {
    return this.levels.filter(level => this.completed.has(level.id)).map(level => ({
      id: level.id, level: level.level, ...level.celebrity, completionLine: level.completionLine,
    }));
  }
  complete(id: string) {
    // Stale/double callbacks and locked future levels never add progress.
    if (this.nextLevel?.id !== id) return false;
    this.completed.add(id); this.save(); return true;
  }
  reset() { this.completed.clear(); this.save(); }
  private load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(MYSTERY_SAVE_KEY); if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !Array.isArray(parsed.completed)) return;
      const stored = new Set(parsed.completed.filter(id => typeof id === 'string'));
      // Keep only the contiguous unlocked prefix, including when new levels are inserted.
      for (const level of this.levels) { if (!stored.has(level.id)) break; this.completed.add(level.id); }
    } catch { this.saveAvailable = false; }
  }
  private save() {
    if (!this.storage) return;
    try { this.storage.setItem(MYSTERY_SAVE_KEY, JSON.stringify({ version: 1, completed: this.completedIds })); this.saveAvailable = true; }
    catch { this.saveAvailable = false; }
  }
}

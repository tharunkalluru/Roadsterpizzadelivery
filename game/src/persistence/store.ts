/**
 * Versioned local persistence (MASTER §23). localStorage for small settings/progress/records and
 * one atomic checkpoint slot with a last-known-valid fallback. Storage denial or quota errors
 * degrade to session-only play with an explanation (U05).
 */
export const SAVE_SCHEMA = 1;
const PREFIX = 'hmd.v1.';

export interface Settings {
  sensitivity: number;
  musicVolume: number;
  sfxVolume: number;
  uiVolume: number;
  haptics: boolean;
  reducedShake: boolean;
  reducedFlashing: boolean;
  largeText: boolean;
  quality: 'auto' | 'low' | 'standard' | 'high';
  handedness: 'right' | 'left';
  practiceDone: boolean;
  timeOfDay: 'day' | 'dusk' | 'night';
  weather: 'clear' | 'rain';
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, musicVolume: 0.5, sfxVolume: 0.8, uiVolume: 0.7, haptics: true, reducedShake: false,
  reducedFlashing: false, largeText: false, quality: 'auto', handedness: 'right', practiceDone: false,
  timeOfDay: 'day', weather: 'clear',
};

export interface BestRecord { comparableKey: string; score: number; chargedSeconds: number; at: string }

export class Store {
  available = true;
  reason: string | null = null;
  private mem = new Map<string, string>();

  constructor(private readonly prefix = PREFIX) {
    try {
      const k = this.prefix + 'probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
    } catch (e) {
      this.available = false;
      this.reason = 'Saving is unavailable in this browser mode. You can still play; progress lasts for this session only.';
    }
  }

  private get(key: string): string | null {
    if (!this.available) return this.mem.get(key) ?? null;
    try { return localStorage.getItem(this.prefix + key); } catch { return this.mem.get(key) ?? null; }
  }
  private set(key: string, v: string): boolean {
    this.mem.set(key, v);
    if (!this.available) return false;
    try { localStorage.setItem(this.prefix + key, v); return true; } catch {
      this.reason = 'Storage is full; progress is kept for this session only.';
      return false;
    }
  }
  private del(key: string) { this.mem.delete(key); try { localStorage.removeItem(this.prefix + key); } catch { /* ignore */ } }

  private readJson<T>(key: string): T | null {
    const raw = this.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  loadSettings(): Settings {
    const s = this.readJson<{ schema: number; data: Partial<Settings> }>('settings');
    if (!s || s.schema !== SAVE_SCHEMA) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...s.data };
    if (typeof merged.sensitivity !== 'number' || merged.sensitivity < 0.4 || merged.sensitivity > 2.5) merged.sensitivity = 1;
    if (!['day', 'dusk', 'night'].includes(merged.timeOfDay)) merged.timeOfDay = 'day';
    if (!['clear', 'rain'].includes(merged.weather)) merged.weather = 'clear';
    return merged;
  }
  saveSettings(s: Settings) { this.set('settings', JSON.stringify({ schema: SAVE_SCHEMA, data: s })); }

  loadBests(): Record<string, BestRecord> { return this.readJson<Record<string, BestRecord>>('bests') ?? {}; }
  /** only comparable, non-debug, non-resumed successful runs become records (M14) */
  submitBest(r: { comparableKey: string; score: number; chargedSeconds: number; success: boolean; resumed: boolean; debugUsed: boolean }): { isBest: boolean; previous: BestRecord | null } {
    const bests = this.loadBests();
    const prev = bests[r.comparableKey] ?? null;
    if (!r.success || r.resumed || r.debugUsed) return { isBest: false, previous: prev };
    if (!prev || r.score > prev.score) {
      bests[r.comparableKey] = { comparableKey: r.comparableKey, score: r.score, chargedSeconds: r.chargedSeconds, at: new Date().toISOString() };
      this.set('bests', JSON.stringify(bests));
      return { isBest: true, previous: prev };
    }
    return { isBest: false, previous: prev };
  }

  loadProgress(): { completed: string[] } { return this.readJson<{ completed: string[] }>('progress') ?? { completed: [] }; }
  markCompleted(missionId: string) {
    const p = this.loadProgress();
    if (!p.completed.includes(missionId)) p.completed.push(missionId);
    this.set('progress', JSON.stringify(p));
  }

  /** atomic checkpoint: write candidate with checksum, then promote; keep previous valid revision */
  saveCheckpoint(cp: object): boolean {
    const body = JSON.stringify(cp);
    const rec = JSON.stringify({ schema: SAVE_SCHEMA, sum: checksum(body), savedAt: Date.now(), body });
    const prev = this.get('checkpoint');
    if (prev) this.set('checkpoint.prev', prev);
    return this.set('checkpoint', rec);
  }
  loadCheckpoint(): { cp: any; fromPrevious: boolean } | { error: string } | null {
    for (const [key, fromPrevious] of [['checkpoint', false], ['checkpoint.prev', true]] as const) {
      const raw = this.get(key);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw);
        if (rec.schema !== SAVE_SCHEMA) return { error: 'Saved delivery is from an older version and cannot be resumed. Your settings and records are kept.' };
        if (checksum(rec.body) !== rec.sum) continue;
        return { cp: JSON.parse(rec.body), fromPrevious };
      } catch { continue; }
    }
    return null;
  }
  clearCheckpoint() { this.del('checkpoint'); this.del('checkpoint.prev'); }
}

function checksum(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16) + ':' + s.length;
}

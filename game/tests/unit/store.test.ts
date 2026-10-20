import { describe, it, expect, beforeEach } from 'vitest';

class MemStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } key() { return null; } get length() { return this.m.size; } }
beforeEach(() => { (globalThis as any).localStorage = new MemStorage(); });

describe('M14 personal bests only for comparable, clean runs', async () => {
  const { Store } = await import('../../src/persistence/store');
  it('debug, resumed and failed runs never become records; better scores replace worse', () => {
    const s = new Store();
    const key = 'mt01@v1|hyd-uppal-tarnaka@v1|seed:1|traffic:light';
    expect(s.submitBest({ comparableKey: key, score: 900, chargedSeconds: 60, success: true, resumed: false, debugUsed: true }).isBest).toBe(false);
    expect(s.submitBest({ comparableKey: key, score: 900, chargedSeconds: 60, success: true, resumed: true, debugUsed: false }).isBest).toBe(false);
    expect(s.submitBest({ comparableKey: key, score: 900, chargedSeconds: 60, success: false, resumed: false, debugUsed: false }).isBest).toBe(false);
    expect(s.submitBest({ comparableKey: key, score: 900, chargedSeconds: 60, success: true, resumed: false, debugUsed: false }).isBest).toBe(true);
    expect(s.submitBest({ comparableKey: key, score: 800, chargedSeconds: 70, success: true, resumed: false, debugUsed: false }).isBest).toBe(false);
    expect(s.submitBest({ comparableKey: key.replace('seed:1', 'seed:2'), score: 100, chargedSeconds: 70, success: true, resumed: false, debugUsed: false }).isBest).toBe(true);
    expect(Object.keys(s.loadBests()).length).toBe(2);
  });
});

describe('U08/U05 saves', async () => {
  const { Store, DEFAULT_SETTINGS } = await import('../../src/persistence/store');
  it('keeps pilot saves and settings separate from the main game', () => {
    const main = new Store(), pilot = new Store('hmd.pilot.synthetic.');
    main.saveCheckpoint({ run: 'main' }); pilot.saveCheckpoint({ run: 'pilot' });
    main.saveSettings({ ...DEFAULT_SETTINGS, sensitivity: 1.7 });
    pilot.saveSettings({ ...DEFAULT_SETTINGS, sensitivity: .8 });
    expect((main.loadCheckpoint() as any).cp.run).toBe('main');
    expect((pilot.loadCheckpoint() as any).cp.run).toBe('pilot');
    expect(new Store().loadSettings().sensitivity).toBe(1.7);
    expect(new Store('hmd.pilot.synthetic.').loadSettings().sensitivity).toBe(.8);
    pilot.clearCheckpoint(); expect((main.loadCheckpoint() as any).cp.run).toBe('main');
  });
  it('incompatible checkpoint schema is explained; settings survive', () => {
    const s = new Store();
    s.saveSettings({ ...DEFAULT_SETTINGS, sensitivity: 1.7 });
    localStorage.setItem('hmd.v1.checkpoint', JSON.stringify({ schema: 999, sum: 'x', body: '{}' }));
    const r = s.loadCheckpoint();
    expect(r && 'error' in r).toBe(true);
    expect(s.loadSettings().sensitivity).toBe(1.7);
  });
  it('a corrupted latest checkpoint falls back to the previous valid revision', () => {
    const s = new Store();
    s.saveCheckpoint({ v: 1 });
    s.saveCheckpoint({ v: 2 });
    const raw = JSON.parse(localStorage.getItem('hmd.v1.checkpoint')!);
    raw.body = raw.body.replace('2', '3'); // tamper: checksum mismatch
    localStorage.setItem('hmd.v1.checkpoint', JSON.stringify(raw));
    const r = s.loadCheckpoint() as { cp: any; fromPrevious: boolean };
    expect(r.cp).toEqual({ v: 1 });
    expect(r.fromPrevious).toBe(true);
  });
  it('denied storage → session-only with explanation, still functional in memory', () => {
    (globalThis as any).localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const s = new Store();
    expect(s.available).toBe(false);
    expect(s.reason).toMatch(/session only/);
    s.saveSettings({ ...DEFAULT_SETTINGS, sensitivity: 1.3 });
    expect(s.loadSettings().sensitivity).toBe(1.3);
  });
});

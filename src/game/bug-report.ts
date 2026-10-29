declare const __ROADSTER_BUILD__: string;
export const GAME_BUILD = typeof __ROADSTER_BUILD__ === 'string' ? __ROADSTER_BUILD__ : 'development';
export interface BugSample { time: number; x: number; y: number; z: number; speed: number; throttle: number; brake: number; steer: number; flying: boolean; surface: string }
export interface BugContext {
  build: string; capturedAt: string; area: string;
  location: { x: number; y: number; z: number; latitude: number; longitude: number; tile: string; yaw: number };
  road: { id: string; name: string; distance: number; elevation: number; sourceClass: string } | null;
  player: object; order: object | null; route: object | null; world: object; device: object;
  observations: string[]; recent: BugSample[]; errors: string[];
}
export interface BugEnvelope { id: string; session: string; context: BugContext; screenshot: string | null }
const QUEUE = 'p2ph-bug-reports-v1', QUARANTINE = 'p2ph-bug-report-quarantine-v1', SESSION = 'p2ph-report-session-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface QuarantinedReport { report: unknown; reason: string; quarantinedAt: string }
interface ReportStore { pending: unknown[]; quarantine: QuarantinedReport[] }
type SendResult = 'sent' | 'retry' | 'permanent';
const redact = (text: string) => text.replace(/https?:\/\/[^\s)]+/g, url => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return '[url]'; } }).slice(0, 300);

function validEnvelope(value: unknown): value is BugEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<BugEnvelope>, c = v.context, p = c?.location;
  const finite = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
  if (!uuid.test(String(v.id)) || !uuid.test(String(v.session)) || !c || !p || !c.build || typeof c.build !== 'string') return false;
  if (!finite(p.x, 100000) || !finite(p.y, 100000) || !finite(p.z, 100000) || !finite(p.latitude, 90) || !finite(p.longitude, 180)) return false;
  try { return JSON.stringify(c).length <= 48000; } catch { return false; }
}
function storedArray(key: string): unknown[] {
  const raw = localStorage.getItem(key); if (raw === null) return [];
  try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed : [parsed]; }
  catch { return [raw]; } // Preserve malformed evidence rather than discarding it.
}
function quarantine(store: ReportStore, report: unknown, reason: string) {
  const serialized = JSON.stringify(report);
  if (store.quarantine.some(q => JSON.stringify(q.report) === serialized)) return true;
  if (store.quarantine.length >= 8) return false;
  store.quarantine.push({ report, reason, quarantinedAt: new Date().toISOString() }); return true;
}

// Projection matches the published city data, not device geolocation.
export function gameCoordinates(origin: { lat: number; lon: number }, x: number, z: number) {
  return { latitude: origin.lat - z / (6341141.9 * Math.PI / 180), longitude: origin.lon + x / (Math.cos(origin.lat * Math.PI / 180) * 6380050.094 * Math.PI / 180) };
}
export function reportObservations(samples: BugSample[], surface: string, stuck: number, slow: number) {
  const flags: string[] = [];
  const first = samples[0], last = samples[samples.length - 1];
  if (stuck > 3.5 || slow > 14 || first && last && samples.length >= 6 && samples.filter(s => s.throttle > .1).length >= 5 && Math.hypot(last.x - first.x, last.z - first.z) < 4) flags.push('Possible blocked or stuck vehicle; cause needs review.');
  if (surface === 'roof') flags.push('Vehicle is supported by a roof or structure.');
  if (!flags.length) flags.push('Player reported this spot; inspect the scene and recent movement.');
  return flags;
}
export function gameScreenshot(canvas: HTMLCanvasElement) {
  try {
    const image = document.createElement('canvas'), scale = Math.min(1, 600 / canvas.width, 400 / canvas.height);
    image.width = Math.max(1, Math.round(canvas.width * scale)); image.height = Math.max(1, Math.round(canvas.height * scale));
    const context = image.getContext('2d'); if (!context) return null;
    context.drawImage(canvas, 0, 0, image.width, image.height);
    for (const quality of [.6, .42, .25]) { const data = image.toDataURL('image/jpeg', quality); if (data.length <= 150000) return data; }
  } catch { /* A context-loss report still includes coordinates and diagnostics. */ }
  return null;
}

export class BugReporter {
  private readonly samples: BugSample[] = [];
  get recent() { return this.freshRecent(); }
  readonly errors: string[] = [];
  readonly session: string;
  private lastSample = -Infinity;
  private flushing: Promise<void> | null = null;
  private retryAt = 0;
  private hasPending = false;
  constructor() {
    let session: string | null = null;
    try { session = sessionStorage.getItem(SESSION); } catch { /* Memory fallback. */ }
    this.session = session && uuid.test(session) ? session : crypto.randomUUID();
    try { sessionStorage.setItem(SESSION, this.session); } catch { /* Memory fallback. */ }
    try { this.hasPending = storedArray(QUEUE).length > 0; } catch { /* Storage unavailable: never claim a durable queue. */ }
    const remember = (value: unknown) => { const text = typeof value === 'string' ? value : value instanceof Error ? value.message : ''; if (text) { this.errors.push(redact(text)); if (this.errors.length > 10) this.errors.shift(); } };
    addEventListener('error', event => remember(event.message));
    addEventListener('unhandledrejection', event => remember(event.reason));
    addEventListener('online', () => { void this.flush(); });
    addEventListener('storage', event => { if (event.key === QUEUE) { this.hasPending = true; this.retryAt = 0; } });
    if (this.hasPending) void this.flush();
  }
  record(sample: BugSample) {
    const now = Date.now() / 1000;
    if (now >= this.lastSample && now - this.lastSample < 1) return;
    this.lastSample = now; this.samples.push({ ...sample, time: now });
    if (this.samples.length > 30) this.samples.shift();
    this.expireSamples(now);
  }
  private expireSamples(now = Date.now() / 1000) { while (this.samples.length && (this.samples[0].time < now - 30 || this.samples[0].time > now + 1)) this.samples.shift(); }
  freshRecent() {
    this.expireSamples();
    return this.samples.map(sample => ({ ...sample }));
  }
  envelope(context: BugContext, screenshot: string | null, recent = this.freshRecent()): BugEnvelope {
    return { id: crypto.randomUUID(), session: this.session, context: structuredClone({ ...context, recent: recent.map(s => ({ ...s })), errors: [...this.errors] }), screenshot };
  }
  private async transaction<T>(mutate: (store: ReportStore) => T, fallback: T): Promise<{ value: T; persisted: boolean }> {
    // Every operation re-reads shared storage inside the lock. Network I/O is
    // outside it. The fallback is one synchronous read/merge/write/verify turn,
    // so even without Web Locks no stale per-tab queue snapshot is written.
    const run = () => {
      let value = fallback;
      try {
        const saved = storedArray(QUARANTINE), store: ReportStore = { pending: storedArray(QUEUE), quarantine: saved.map(q => q && typeof q === 'object' && 'report' in q ? q as QuarantinedReport : { report: q, reason: 'invalid_quarantine_record', quarantinedAt: new Date().toISOString() }) };
        value = mutate(store);
        const held = JSON.stringify(store.quarantine), pending = JSON.stringify(store.pending);
        // Write quarantine first: if a quota error interrupts a move, the
        // original remains pending, or both copies remain; evidence is kept.
        if (localStorage.getItem(QUARANTINE) !== held) localStorage.setItem(QUARANTINE, held);
        if (localStorage.getItem(QUEUE) !== pending) localStorage.setItem(QUEUE, pending);
        const persisted = localStorage.getItem(QUEUE) === pending && localStorage.getItem(QUARANTINE) === held;
        this.hasPending = store.pending.some(validEnvelope); return { value, persisted };
      } catch { return { value, persisted: false }; }
    };
    const locks = globalThis.navigator?.locks;
    if (locks) { try { return await locks.request(QUEUE, { mode: 'exclusive' }, run); } catch { /* A disabled lock API still permits the synchronous fallback. */ } }
    return run();
  }
  private async send(report: BugEnvelope): Promise<SendResult> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(new URL('api/bug-reports', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report), signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) return [400, 403, 413, 415, 422].includes(response.status) ? 'permanent' : 'retry';
      const receipt = await response.json(); return receipt?.saved === true && receipt?.id === report.id ? 'sent' : 'retry';
    } catch { return 'retry'; } finally { clearTimeout(timeout); }
  }
  async submit(report: BugEnvelope): Promise<'sent' | 'queued' | 'failed'> {
    const result = validEnvelope(report) ? await this.send(report) : 'permanent';
    if (result === 'sent') { await this.transaction(store => { store.pending = store.pending.filter(r => !validEnvelope(r) || r.id !== report.id); }, undefined); return 'sent'; }
    if (result === 'permanent') { await this.hold(report, 'permanent_submission_error'); return 'failed'; }
    this.retryAt = performance.now() + 30000;
    const retained = await this.transaction(store => {
      this.cleanPending(store);
      if (!store.pending.some(r => validEnvelope(r) && r.id === report.id)) { if (store.pending.length >= 8) return false; store.pending.push(report); }
      return store.pending.some(r => validEnvelope(r) && r.id === report.id && JSON.stringify(r) === JSON.stringify(report));
    }, false);
    return retained.persisted && retained.value ? 'queued' : 'failed';
  }
  private cleanPending(store: ReportStore) { store.pending = store.pending.filter(r => validEnvelope(r) || !quarantine(store, r, 'invalid_cached_report')); }
  private async hold(report: BugEnvelope, reason: string) {
    await this.transaction(store => { if (quarantine(store, report, reason)) store.pending = store.pending.filter(r => !validEnvelope(r) || r.id !== report.id); }, undefined);
  }
  retryPending() { if (this.hasPending && !this.flushing && performance.now() >= this.retryAt) void this.flush(); }
  async flush() {
    if (this.flushing) return this.flushing;
    this.retryAt = performance.now() + 30000;
    const pending = async () => {
      const snapshot = await this.transaction(store => { this.cleanPending(store); return store.pending.filter(validEnvelope); }, [] as BugEnvelope[]);
      for (const report of snapshot.value) {
        const result = await this.send(report);
        if (result === 'retry') break;
        if (result === 'permanent') { await this.hold(report, 'permanent_server_rejection'); continue; }
        await this.transaction(store => { store.pending = store.pending.filter(r => !validEnvelope(r) || r.id !== report.id); }, undefined);
      }
    };
    this.flushing = pending();
    try { await this.flushing; } finally { this.flushing = null; }
  }
}

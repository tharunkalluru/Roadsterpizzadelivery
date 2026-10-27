import * as THREE from 'three';
import { SignSystem, SignInst } from './signs';
import type { CityData, TileBuilt, Surface, Wall, BusStop, WalkPath } from './city';
import type { Building, CoreData, XZ } from './types';
import { placeLandmarks } from './landmarks';
import type { LandmarkSurfaceGrid } from './landmark-support';
import { placeAirfields } from './airfields';
import { roadGradePatches, type RoadGradePatch } from './road-grades';
import { SignalLights } from './signal-lights';
import type { SignalSite } from './signals';
import { planConstruction, applyConstructionRoads, type ConstructionPlan } from './construction';

export interface LoadedTile { key: string; built: TileBuilt; group: THREE.Group; signs: SignInst[]; lamps: THREE.Vector3[]; buildings: Building[]; signalLights?: SignalLights }

const TILE_ATTEMPTS = 3, TILE_TIMEOUT = 20000, ENSURE_TIMEOUT = 75000, STREAM_RETRY_DELAY = 30000, MAX_PENDING = 2;

const RENDER: Record<string, { cast: boolean; receive: boolean; order?: number }> = {
  park: { cast: false, receive: true }, water: { cast: false, receive: true }, road: { cast: false, receive: true }, marks: { cast: false, receive: true },
  foot: { cast: true, receive: true }, kerb: { cast: false, receive: true }, st: { cast: true, receive: true }, wall: { cast: true, receive: true }, shop: { cast: true, receive: true },
  roof: { cast: false, receive: true }, lit: { cast: false, receive: false }, glow: { cast: false, receive: false, order: 2 },
};

// The streamed city: keeps the 1 km tiles around the player built (in a worker) and exposes them to the game
// through the same grids the single-zone city used, so physics, traffic and walkers don't care where a tile ends.
export class World implements CityData {
  movingRail: import('../game/moving-rail').MovingRailBody[] = [];
  group = new THREE.Group(); signs: SignSystem; lit = null; glow = null;
  buildingGrid = new Map<string, Building[]>(); surfaceGrid = new Map<string, Surface[]>(); walls = new Map<string, Wall[]>();
  landmarkSurfaceGrid: LandmarkSurfaceGrid = new Map();
  obstacles = new Map<string, { x: number; z: number; r: number; top: number }[]>(); byBuilding = new Map<string, Building>();
  signals: SignalSite[] = []; lamps: THREE.Vector3[] = []; busStops: BusStop[] = []; walkPaths: WalkPath[] = []; rails = new Map<string, { id: string; pts: XZ[]; bridge?: boolean }>();
  private signalSeconds = 0;
  construction: ConstructionPlan;
  private preparedGrades: RoadGradePatch[];
  theatreFacades = new Map<string, { c: THREE.Vector3; n: THREE.Vector3; w: number; top: number; building: Building }>();
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  tiles = new Map<string, LoadedTile>(); pending = new Map<string, number>(); empty = new Set<string>();
  failures = new Map<string, { attempts: number; retryAt: number; message: string }>();
  private requestIds = new Map<string, number>(); private nextRequestId = 0;
  private workerUnavailable = false; private workerRestarts = 0; private workerFailed = false;
  private workerTimer: ReturnType<typeof setTimeout> | null = null;
  packOf = new Map<string, string>(); worker: Worker | null = null; groundGeo = new THREE.PlaneGeometry(1000, 1000);
  onTileAdded: (t: LoadedTile) => void = () => {}; onTileRemoved: (t: LoadedTile) => void = () => {};
  activity = new Map<string, number>();          // shop units per 100 m cell across the loaded tiles
  radius: number; waiters: (() => void)[] = []; buildMs: number[] = []; addMs: number[] = []; t = 0; focus: [number, number] | null = null;
  constructor(public core: CoreData, public mats: Record<string, any>, public opts: { lowQ: boolean; base: string }) {
    this.preparedGrades = roadGradePatches(core.roads);
    this.construction = planConstruction(core.roads, core.origin);
    core.roads = applyConstructionRoads(core.roads, this.construction);
    this.bounds = core.bounds;
    this.radius = opts.lowQ ? 900 : 1150;
    for (const p of core.packs) for (const [i, j] of p.tiles) this.packOf.set(`${i}_${j}`, new URL(p.file, opts.base).href);
    this.signs = new SignSystem(opts.lowQ ? 2 : 3, opts.lowQ ? 170 : 230);
    this.group.add(this.signs.group);
    try { this.worker = this.makeWorker(); }
    catch { this.workerError(); }
    addEventListener('online', () => this.retryStreaming());
  }
  makeWorker() {
    const w = new Worker(new URL('./tileworker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => { if (this.worker === w) this.onMessage(ev.data); };
    w.onerror = (e) => { if (this.worker === w) { e.preventDefault(); this.workerError(); } };
    w.onmessageerror = () => { if (this.worker === w) this.workerError(); };
    try { w.postMessage({ type: 'init', lowQ: this.opts.lowQ, metro: this.core.metro, landmarks: placeLandmarks(this.core.origin, this.core.packs.flatMap((p) => p.tiles)), airfields:placeAirfields(this.core.origin), roadGrades: this.preparedGrades, trafficSignals: this.core.trafficSignals, construction: this.construction }); }
    catch (error) { w.terminate(); throw error; }
    return w;
  }
  private workerError() {
    console.error('The city loader stopped unexpectedly.');
    this.worker?.terminate(); this.worker = null; this.workerUnavailable = true;
    if (this.workerTimer !== null) clearTimeout(this.workerTimer);
    this.workerTimer = null;
    for (const k of [...this.pending.keys()]) this.fail(k, 'The city loader stopped unexpectedly.');
    if (this.workerRestarts >= 2) { this.workerFailed = true; this.notify(); return; }
    const delay = 500 * 2 ** this.workerRestarts++;
    this.workerTimer = setTimeout(() => {
      this.workerTimer = null;
      try { this.worker = this.makeWorker(); this.workerUnavailable = false; this.notify(); }
      catch { this.workerError(); }
    }, delay);
    this.notify();
  }
  private notify() { for (const w of this.waiters.slice()) w(); }
  private retryStreaming() {
    // Connectivity recovery must not extend an in-progress ensure indefinitely.
    if (!this.focus || this.waiters.length) return;
    for (const k of this.wanted(this.focus[0], this.focus[1], this.radius)) this.failures.delete(k);
    this.update(this.focus[0], this.focus[1], 0, true);
  }
  private fail(k: string, message: string) {
    this.pending.delete(k); this.requestIds.delete(k);
    const attempts = (this.failures.get(k)?.attempts || 0) + 1;
    this.failures.set(k, { attempts, retryAt: performance.now() + (attempts >= TILE_ATTEMPTS ? STREAM_RETRY_DELAY : 500 * 2 ** (attempts - 1)), message });
  }
  private expireRequests() {
    const now = performance.now();
    for (const [k, at] of this.pending) if (now - at >= TILE_TIMEOUT) this.fail(k, 'Loading this part of the city timed out.');
  }
  centroid = (b: Building): XZ => { let x = 0, z = 0; for (const p of b.ring) { x += p[0]; z += p[1]; } return [x / b.ring.length, z / b.ring.length]; };
  // tiles whose square comes within `r` of (x, z), nearest first
  wanted(x: number, z: number, r: number) {
    const out: [string, number][] = [];
    const i0 = Math.floor((x - r) / 1000), i1 = Math.floor((x + r) / 1000), j0 = Math.floor((z - r) / 1000), j1 = Math.floor((z + r) / 1000);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = `${i}_${j}`; if (!this.packOf.has(k)) continue;
      const dx = Math.max(i * 1000 - x, 0, x - (i + 1) * 1000), dz = Math.max(j * 1000 - z, 0, z - (j + 1) * 1000);
      const d = Math.hypot(dx, dz); if (d <= r) out.push([k, d]);
    }
    return out.sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  }
  // call every frame: request missing tiles near the player, drop far ones
  update(x: number, z: number, dt = 0.016, force = false) {
    this.focus = [x, z];
    if (!force && (this.t += dt) < 0.4) return; this.t = 0;
    this.expireRequests();
    const want = this.wanted(x, z, this.radius);
    for (const k of want) this.request(k);
    for (const [k, t] of this.tiles) {
      if (this.waiters.length) break;           // retain the old playable area until a relocation succeeds
      const [i, j] = k.split('_').map(Number);
      const dx = Math.max(i * 1000 - x, 0, x - (i + 1) * 1000), dz = Math.max(j * 1000 - z, 0, z - (j + 1) * 1000);
      if (Math.hypot(dx, dz) > this.radius + 450) this.unload(t);
    }
  }
  request(k: string) {
    const f = this.failures.get(k), now = performance.now();
    if (this.workerUnavailable || this.workerFailed || !this.worker || !this.packOf.has(k) || this.tiles.has(k) || this.empty.has(k) || this.pending.has(k) || this.pending.size >= MAX_PENDING) return;
    if (f) {
      if (now < f.retryAt || (f.attempts >= TILE_ATTEMPTS && this.waiters.length)) return;
      if (f.attempts >= TILE_ATTEMPTS) this.failures.delete(k);   // bounded background retry window
    }
    const requestId = ++this.nextRequestId;
    this.pending.set(k, now); this.requestIds.set(k, requestId);
    try { this.worker.postMessage({ type: 'build', key: k, url: this.packOf.get(k), requestId }); }
    catch { this.fail(k, 'Could not send this part of the city to the loader.'); }
  }
  // resolve once every tile within r of (x, z) is built (start-up, teleports, test scenes)
  ensure(x: number, z: number, r = 700, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException('Area choice cancelled', 'AbortError'));
    const previousFocus = this.focus, targetFocus: [number, number] = [x, z];
    this.focus = targetFocus;
    const want = this.wanted(x, z, r);
    // A new area choice is an explicit retry; previous failures are not permanent empty streets.
    for (const k of want) if (!this.pending.has(k)) this.failures.delete(k);
    if (this.workerFailed) {
      this.workerFailed = false; this.workerRestarts = 0;
      try { this.worker = this.makeWorker(); this.workerUnavailable = false; }
      catch { this.workerFailed = true; }
    }
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + ENSURE_TIMEOUT;
      let done = false, timer: ReturnType<typeof setInterval> | undefined;
      const finish = (error?: Error) => {
        if (done) return;
        done = true; if (timer !== undefined) clearInterval(timer);
        signal?.removeEventListener('abort', abort);
        this.waiters = this.waiters.filter((f) => f !== check);
        if (error && this.focus === targetFocus) this.focus = previousFocus;
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new DOMException('Area choice cancelled', 'AbortError'));
      const check = () => {
        if (done) return;
        this.expireRequests();
        const missing = want.filter((k) => !this.tiles.has(k) && !this.empty.has(k));
        if (!missing.length) { finish(); return; }
        if (this.workerFailed) { finish(new Error('The city loader could not restart. Please choose the area again.')); return; }
        if (missing.some((k) => (this.failures.get(k)?.attempts || 0) >= TILE_ATTEMPTS)) {
          finish(new Error('Could not load the streets in this area. Check your connection and choose the area again.')); return;
        }
        if (performance.now() >= deadline) { finish(new Error('Loading this area took too long. Check your connection and try again.')); return; }
        for (const k of missing) this.request(k);
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.waiters.push(check); check();
      if (!done) timer = setInterval(check, 200);
    });
  }
  onMessage(m: any) {
    if (!this.pending.has(m.key) || m.requestId !== this.requestIds.get(m.key)) return;
    const t0 = this.pending.get(m.key); this.pending.delete(m.key);
    this.requestIds.delete(m.key);
    if (m.type === 'built') {
      try {
        if (m.built?.key !== m.key) throw new Error('Mismatched city tile');
        const a0 = performance.now(); this.add(m.built); this.addMs.push(Math.round(performance.now() - a0)); this.buildMs.push(m.ms); if (t0 !== undefined) this.buildMs.push(Math.round(performance.now() - t0)); this.failures.delete(m.key);
      }
      catch { this.fail(m.key, 'Could not display this part of the city. Please try again.'); }
    }
    else if (m.type === 'empty') { this.empty.add(m.key); this.failures.delete(m.key); }
    else if (m.type === 'error') { console.error('City tile loading failed.', m.key); this.fail(m.key, 'Could not load this part of the city. Please try again.'); }
    else this.fail(m.key, 'The city loader returned an invalid response.');
    this.notify();
    if (this.focus) this.update(this.focus[0], this.focus[1], 0, true);
  }
  add(b: TileBuilt) {
    if (this.tiles.has(b.key)) return;
    const g = new THREE.Group(); g.name = 'tile ' + b.key;
    const ground = new THREE.Mesh(this.groundGeo, this.mats.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(b.i * 1000 + 500, 0, b.j * 1000 + 500); ground.receiveShadow = true; g.add(ground);
    for (const buf of b.buffers) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(buf.nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(buf.col, 3));
      geo.computeBoundingSphere();
      const r = RENDER[buf.mat] || { cast: true, receive: true };
      const m = new THREE.Mesh(geo, this.mats[buf.mat]); m.castShadow = r.cast; m.receiveShadow = r.receive; m.renderOrder = r.order || 0;
      g.add(m);
    }
    const signalLights = b.signals.length ? new SignalLights(b.signals) : undefined;
    if (signalLights) { signalLights.update(this.signalSeconds); g.add(signalLights.mesh); }
    this.group.add(g);
    const merge = <T>(dst: Map<string, T[]>, src: Map<string, T[]>) => { for (const [k, a] of src) { const d = dst.get(k); if (d) d.push(...a); else dst.set(k, a.slice()); } };
    merge(this.buildingGrid, b.buildingGrid); merge(this.surfaceGrid, b.surfaceGrid); merge(this.walls, b.walls); merge(this.obstacles, b.obstacles);
    if (b.landmarkSurfaceGrid) merge(this.landmarkSurfaceGrid, b.landmarkSurfaceGrid);
    const buildings = new Set<Building>(); for (const a of b.buildingGrid.values()) for (const x of a) buildings.add(x);
    for (const x of buildings) this.byBuilding.set(x.id, x);
    const signs = b.signs.map((s) => this.signs.add({ id: s.id, text: s.text, bg: s.bg, fg: s.fg, c: new THREE.Vector3(...s.c), right: new THREE.Vector3(...s.right), up: new THREE.Vector3(0, 1, 0), w: s.w, h: s.h }));
    const lamps = b.lamps.map((l) => new THREE.Vector3(l[0], l[1], l[2]));
    for (const [k, n] of b.activity || []) this.activity.set(k, (this.activity.get(k) || 0) + n);
    for (const r of b.rails || []) this.rails.set(r.id, r);
    this.lamps.push(...lamps); this.signals.push(...b.signals); this.busStops.push(...b.busStops); this.walkPaths.push(...b.walkPaths);
    for (const f of b.facades) {
      const bld = this.byBuilding.get(f.building); if (!bld) continue;
      this.theatreFacades.set(f.id, { c: new THREE.Vector3(...f.c), n: new THREE.Vector3(...f.n), w: f.w, top: f.top, building: bld });
    }
    const t: LoadedTile = { key: b.key, built: b, group: g, signs, lamps, buildings: [...buildings], signalLights };
    this.tiles.set(b.key, t);
    this.onTileAdded(t);           // boards get atlas slots on the next regular sign update (spreads the work)
  }
  unload(t: LoadedTile) {
    this.tiles.delete(t.key);
    this.group.remove(t.group);
    t.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== this.groundGeo && m.geometry !== t.signalLights?.geometry) m.geometry.dispose(); });
    t.signalLights?.dispose();
    const strip = <T>(dst: Map<string, T[]>, src: Map<string, T[]>) => {
      for (const [k, a] of src) { const gone = new Set(a); const d = dst.get(k); if (!d) continue; const f = d.filter((x) => !gone.has(x)); if (f.length) dst.set(k, f); else dst.delete(k); }
    };
    const b = t.built;
    for (const rail of b.rails || []) {
      if (this.rails.get(rail.id) !== rail) continue;
      this.rails.delete(rail.id);
      // Border rails may be shared by neighboring tiles. Retain a still-loaded copy.
      for (const other of this.tiles.values()) {
        const retained = other.built.rails?.find((r) => r.id === rail.id);
        if (retained) { this.rails.set(retained.id, retained); break; }
      }
    }
    strip(this.buildingGrid, b.buildingGrid); strip(this.surfaceGrid, b.surfaceGrid); strip(this.walls, b.walls); strip(this.obstacles, b.obstacles);
    if (b.landmarkSurfaceGrid) strip(this.landmarkSurfaceGrid, b.landmarkSurfaceGrid);
    for (const x of t.buildings) this.byBuilding.delete(x.id);
    for (const [k, n] of b.activity || []) { const v = (this.activity.get(k) || 0) - n; if (v > 0.5) this.activity.set(k, v); else this.activity.delete(k); }
    this.signs.remove(t.signs);
    const ls = new Set(t.lamps); this.lamps = this.lamps.filter((l) => !ls.has(l));
    const ss = new Set(b.signals); this.signals = this.signals.filter((s) => !ss.has(s));
    const bs = new Set(b.busStops); this.busStops = this.busStops.filter((s) => !bs.has(s));
    const ws = new Set(b.walkPaths); this.walkPaths = this.walkPaths.filter((s) => !ws.has(s));
    for (const f of b.facades) this.theatreFacades.delete(f.id);
    this.onTileRemoved(t);
  }
  updateSignals(seconds: number) {
    this.signalSeconds = seconds;
    for (const tile of this.tiles.values()) tile.signalLights?.update(seconds);
  }
  // how lively the streets around (x, z) are: 0 = quiet colony, 1 = RTC X Roads / Dilsukhnagar busy
  busyAt(x: number, z: number) {
    const cx = Math.floor(x / 100), cz = Math.floor(z / 100); let n = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) n += this.activity.get(`${cx + i},${cz + j}`) || 0;
    return Math.min(1, n / 900);
  }
  // buildings of the loaded tiles (for the map)
  loadedBuildings() { const out: Building[] = []; for (const t of this.tiles.values()) out.push(...t.buildings); return out; }
}

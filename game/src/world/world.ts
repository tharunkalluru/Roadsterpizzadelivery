import * as THREE from 'three';
import { SignSystem, SignInst } from './signs';
import type { CityData, TileBuilt, Surface, Wall, BusStop, WalkPath } from './city';
import type { Building, CoreData, XZ } from './types';
import { placeLandmarks } from './landmarks';

export interface LoadedTile { key: string; built: TileBuilt; group: THREE.Group; signs: SignInst[]; lamps: THREE.Vector3[]; buildings: Building[] }

const RENDER: Record<string, { cast: boolean; receive: boolean; order?: number }> = {
  park: { cast: false, receive: true }, water: { cast: false, receive: true }, road: { cast: false, receive: true }, marks: { cast: false, receive: true },
  foot: { cast: true, receive: true }, kerb: { cast: false, receive: true }, st: { cast: true, receive: true }, wall: { cast: true, receive: true }, shop: { cast: true, receive: true },
  roof: { cast: false, receive: true }, lit: { cast: false, receive: false }, glow: { cast: false, receive: false, order: 2 },
};

// The streamed city: keeps the 1 km tiles around the player built (in a worker) and exposes them to the game
// through the same grids the single-zone city used, so physics, traffic and walkers don't care where a tile ends.
export class World implements CityData {
  group = new THREE.Group(); signs: SignSystem; lit = null; glow = null;
  buildingGrid = new Map<string, Building[]>(); surfaceGrid = new Map<string, Surface[]>(); walls = new Map<string, Wall[]>();
  obstacles = new Map<string, { x: number; z: number; r: number; top: number }[]>(); byBuilding = new Map<string, Building>();
  signals: { p: XZ; node: string | null }[] = []; lamps: THREE.Vector3[] = []; busStops: BusStop[] = []; walkPaths: WalkPath[] = []; rails = new Map<string, { id: string; pts: XZ[]; bridge?: boolean }>();
  theatreFacades = new Map<string, { c: THREE.Vector3; n: THREE.Vector3; w: number; top: number; building: Building }>();
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  tiles = new Map<string, LoadedTile>(); pending = new Map<string, number>(); empty = new Set<string>();
  failures = new Map<string, { attempts: number; retryAt: number; error: string }>();
  packOf = new Map<string, string>(); worker: Worker; groundGeo = new THREE.PlaneGeometry(1000, 1000);
  onTileAdded: (t: LoadedTile) => void = () => {}; onTileRemoved: (t: LoadedTile) => void = () => {};
  activity = new Map<string, number>();          // shop units per 100 m cell across the loaded tiles
  radius: number; waiters: (() => void)[] = []; buildMs: number[] = []; addMs: number[] = []; t = 0; focus: [number, number] = [0, 0];
  constructor(public core: CoreData, public mats: Record<string, any>, public opts: { lowQ: boolean; base: string }) {
    this.bounds = core.bounds;
    this.radius = opts.lowQ ? 900 : 1150;
    for (const p of core.packs) for (const [i, j] of p.tiles) this.packOf.set(`${i}_${j}`, new URL(p.file, opts.base).href);
    this.signs = new SignSystem(opts.lowQ ? 2 : 3, opts.lowQ ? 170 : 230);
    this.group.add(this.signs.group);
    this.worker = this.makeWorker();
  }
  makeWorker() {
    const w = new Worker(new URL('./tileworker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => this.onMessage(ev.data);
    // a crashed worker (out of memory on a small phone, say) is replaced and its tiles asked for again
    w.onerror = (e) => { console.error('tile worker', e.message); w.terminate(); this.worker = this.makeWorker(); const keys = [...this.pending.keys()]; this.pending.clear(); for (const k of keys) this.request(k); };
    w.postMessage({ type: 'init', lowQ: this.opts.lowQ, metro: this.core.metro, landmarks: placeLandmarks(this.core.origin) });
    return w;
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
    const now = performance.now();
    for (const [k, t] of this.pending) if (now - t > 25000) { this.pending.delete(k); this.request(k); }   // lost request: ask again
    const want = this.wanted(x, z, this.radius);
    for (const k of want) if (!this.tiles.has(k) && !this.pending.has(k) && !this.empty.has(k) && this.pending.size < 2) this.request(k);
    for (const [k, t] of this.tiles) {
      const [i, j] = k.split('_').map(Number);
      const dx = Math.max(i * 1000 - x, 0, x - (i + 1) * 1000), dz = Math.max(j * 1000 - z, 0, z - (j + 1) * 1000);
      if (Math.hypot(dx, dz) > this.radius + 450) this.unload(t);
    }
  }
  request(k: string) {
    if (this.pending.has(k) || (this.failures.get(k)?.retryAt || 0) > performance.now()) return;
    this.pending.set(k, performance.now()); this.worker.postMessage({ type: 'build', key: k, url: this.packOf.get(k) });
  }
  // resolve once every tile within r of (x, z) is built (start-up, teleports, test scenes)
  ensure(x: number, z: number, r = 700): Promise<void> {
    this.focus = [x, z];                       // we are going there: don't unload what we're about to need
    // A new explicit area selection can retry an area which previously failed to load.
    for (const k of this.wanted(x, z, r)) this.failures.delete(k);
    return new Promise((resolve, reject) => {
      const started = performance.now();
      let timer: ReturnType<typeof setInterval> | undefined;
      const finish = (error?: Error) => {
        if (timer) clearInterval(timer);
        this.waiters = this.waiters.filter((f) => f !== check);
        if (error) reject(error); else resolve();
      };
      const check = () => {
        const want = this.wanted(x, z, r);
        const missing = want.filter((k) => !this.tiles.has(k) && !this.empty.has(k));
        if (!missing.length) { finish(); return true; }
        const failed = missing.find((k) => (this.failures.get(k)?.attempts || 0) >= 3);
        if (failed || performance.now() - started > 90000) {
          finish(new Error(failed ? `Could not load tile ${failed}: ${this.failures.get(failed)!.error}` : 'Loading this area timed out. Please try again.'));
          return true;
        }
        for (const k of missing) if (this.pending.has(k) && performance.now() - this.pending.get(k)! > 25000) this.pending.delete(k);
        for (const k of missing) if (!this.pending.has(k)) this.request(k);
        return false;
      };
      if (!check()) { this.waiters.push(check); timer = setInterval(check, 250); }
    });
  }
  onMessage(m: any) {
    const t0 = this.pending.get(m.key); this.pending.delete(m.key);
    if (m.type === 'built') { this.failures.delete(m.key); const a0 = performance.now(); this.add(m.built); this.addMs.push(Math.round(performance.now() - a0)); this.buildMs.push(m.ms); if (t0) this.buildMs.push(Math.round(performance.now() - t0)); }
    else if (m.type === 'empty') { this.failures.delete(m.key); this.empty.add(m.key); }
    else if (m.type === 'error') {
      console.error('tile', m.key, m.error);
      const attempts = (this.failures.get(m.key)?.attempts || 0) + 1;
      this.failures.set(m.key, { attempts, retryAt: performance.now() + Math.min(30000, 1000 * 2 ** Math.min(attempts - 1, 5)), error: String(m.error) });
    }
    for (const w of this.waiters.slice()) w();
    this.update(this.focus[0], this.focus[1], 0, true);
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
    this.group.add(g);
    const merge = <T>(dst: Map<string, T[]>, src: Map<string, T[]>) => { for (const [k, a] of src) { const d = dst.get(k); if (d) d.push(...a); else dst.set(k, a.slice()); } };
    merge(this.buildingGrid, b.buildingGrid); merge(this.surfaceGrid, b.surfaceGrid); merge(this.walls, b.walls); merge(this.obstacles, b.obstacles);
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
    const t: LoadedTile = { key: b.key, built: b, group: g, signs, lamps, buildings: [...buildings] };
    this.tiles.set(b.key, t);
    this.onTileAdded(t);           // boards get atlas slots on the next regular sign update (spreads the work)
  }
  unload(t: LoadedTile) {
    this.tiles.delete(t.key);
    this.group.remove(t.group);
    t.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== this.groundGeo) m.geometry.dispose(); });
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
  // how lively the streets around (x, z) are: 0 = quiet colony, 1 = RTC X Roads / Dilsukhnagar busy
  busyAt(x: number, z: number) {
    const cx = Math.floor(x / 100), cz = Math.floor(z / 100); let n = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) n += this.activity.get(`${cx + i},${cz + j}`) || 0;
    return Math.min(1, n / 900);
  }
  // buildings of the loaded tiles (for the map)
  loadedBuildings() { const out: Building[] = []; for (const t of this.tiles.values()) out.push(...t.buildings); return out; }
}

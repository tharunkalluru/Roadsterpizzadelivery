import * as THREE from 'three';
import { SignSystem, SignInst } from './signs';
import type { CityData, TileBuilt, BuiltBuffers, Surface, Wall, BusStop, WalkPath } from './city';
import type { Building, CoreData, XZ } from './types';
import { placeLandmarks } from './landmarks';
import type { LandmarkSurfaceGrid } from './landmark-support';
import { placeAirfields } from './airfields';
import { roadGradePatches, type RoadGradePatch } from './road-grades';
import { SignalLights } from './signal-lights';
import type { SignalSite } from './signals';
import { planConstruction, applyConstructionRoads, type ConstructionPlan } from './construction';
import { TileGrid, TileValues, predictedFocus, bufferBytes, type StreamFocus } from './streaming-utils';
import { TPL } from '../core/util';

interface StagedTile { built: TileBuilt; bytes: number; work: Generator<void, LoadedTile>; requestId: number }
interface TreeDetail { owner: string; near: THREE.InstancedMesh; far: THREE.InstancedMesh; matrices: Float32Array; colors: Float32Array; farFlags: Uint8Array }
interface LocalDetail { owner: string; mesh: THREE.Mesh; featureMeters: number }

export interface LoadedTile { key: string; built: TileBuilt; group: THREE.Group; signs: SignInst[]; lamps: THREE.Vector3[]; buildings: Building[]; signalLights?: SignalLights; preparedSigns?: Parameters<SignSystem['add']>[0][]; lampCells?: Map<string, THREE.Vector3[]>; buildingValues?: Map<string, Building> }

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
  buildingGrid = new TileGrid<Building>(); surfaceGrid = new TileGrid<Surface>(); walls = new TileGrid<Wall>();
  landmarkSurfaceGrid = new TileGrid<LandmarkSurfaceGrid extends Map<string, (infer T)[]> ? T : never>();
  obstacles = new TileGrid<{ x: number; z: number; r: number; top: number }>(); byBuilding = new TileValues<Building>();
  signals: SignalSite[] = []; lamps: THREE.Vector3[] = []; busStops: BusStop[] = []; walkPaths: WalkPath[] = []; rails = new Map<string, { id: string; pts: XZ[]; elev?: number[]; bridge?: boolean }>();
  private signalSeconds = 0;
  construction: ConstructionPlan;
  private preparedGrades: RoadGradePatch[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  tiles = new Map<string, LoadedTile>(); pending = new Map<string, number>(); empty = new Set<string>();
  failures = new Map<string, { attempts: number; retryAt: number; message: string }>();
  private requestIds = new Map<string, number>(); private nextRequestId = 0;
  private workerUnavailable = false; private workerRestarts = 0; private workerFailed = false;
  private workerTimer: ReturnType<typeof setTimeout> | null = null;
  packOf = new Map<string, string>(); worker: Worker | null = null; groundGeo = new THREE.PlaneGeometry(1000, 1000);
  onTileAdded: (t: LoadedTile) => void = () => {}; onTileRemoved: (t: LoadedTile) => void = () => {};
  /** Optional public-renderer upload preparation. The hook never publishes its source mesh. */
  prepareMesh?: (mesh: THREE.Mesh) => void;
  activity = new Map<string, number>();          // shop units per 100 m cell across the loaded tiles
  radius: number; waiters: (() => void)[] = []; buildMs: number[] = []; addMs: number[] = []; t = 0; focus: [number, number] | null = null;
  revision = 0; readonly worldEpoch = 1;
  staged = new Map<string, StagedTile>();
  streamStats = { stagedBytes: 0, activeBytes: 0, retiringBytes: 0, pendingReservedBytes: 0, coverageLeaseCount: 0, relocationReserveBytes: 0, installJobs: 0, installMaxMs: 0, activationMaxMs: 0, admissionFailures: 0, skylineBytes: 0, skylineStagedBytes: 0, skylineRetiringBytes: 0, decodedCacheBytes: 0 };
  private ownedBytes = new Map<string, number>();
  private retirements: (() => void)[] = [];
  private pumpFrame = 0; private pumpWindow = 0; private pumpSpent = 0;
  private streamFocus: StreamFocus | null = null;
  private tilePins = new Map<string, Set<string>>(); private roadPins = new Set<string>();
  private coverageLeaseSequence = 0;
  private coverageLeases = new Map<string, Set<string>>();
  private lampGrid = new TileGrid<THREE.Vector3>();
  private instanceGeometry = new Map<string, THREE.BufferGeometry>();
  private skylineTiles = new Map<string, { group: THREE.Group; bytes: number }>();
  private pendingSkyline = new Map<string, { id: number; at: number }>();
  private skylineReservations = new Map<string, number>();
  private skylinePreparing = new Set<string>();
  private skylineByteHistory = new Map<string, number>();
  private readonly activeBudget: number;
  private readonly stagedBudget = 96 * 1024 * 1024;
  private readonly overlapReserve = 96 * 1024 * 1024;
  private treeDetails: TreeDetail[] = []; private detailUpdated = -Infinity;
  private localDetails: LocalDetail[] = [];
  private ensureCoverage = new Map<symbol, { required: Set<string>; support: Set<string> }>();
  private pendingReservations = new Map<string, number>();
  private tileByteHistory = new Map<string, number>();
  private capacityDeferred = new Map<string, number>();
  constructor(public core: CoreData, public mats: Record<string, any>, public opts: { lowQ: boolean; base: string; prepareMesh?: (mesh: THREE.Mesh) => void }) {
    this.prepareMesh = opts.prepareMesh;
    this.preparedGrades = roadGradePatches(core.roads);
    this.construction = planConstruction(core.roads, core.origin);
    core.roads = applyConstructionRoads(core.roads, this.construction);
    this.bounds = core.bounds;
    this.radius = opts.lowQ ? 900 : 1150;
    this.activeBudget = (opts.lowQ ? 256 : 384) * 1024 * 1024;
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
    this.pendingSkyline.clear(); this.skylineReservations.clear(); this.reservedBytes();
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
    this.pendingReservations.delete(k);
    this.reservedBytes();
    const attempts = (this.failures.get(k)?.attempts || 0) + 1;
    this.failures.set(k, { attempts, retryAt: performance.now() + (attempts >= TILE_ATTEMPTS ? STREAM_RETRY_DELAY : 500 * 2 ** (attempts - 1)), message });
  }
  private expireRequests() {
    const now = performance.now();
    for (const [k, at] of this.pending) if (now - at >= TILE_TIMEOUT) this.fail(k, 'Loading this part of the city timed out.');
  }
  centroid = (b: Building): XZ => { let x = 0, z = 0; for (const p of b.ring) { x += p[0]; z += p[1]; } return [x / b.ring.length, z / b.ring.length]; };
  setStreamFocus(focus: StreamFocus) {
    this.streamFocus = focus;
    if (focus.mode !== 'flight' && focus.mode !== 'descending') for (const tile of this.skylineTiles.values()) tile.group.visible = false;
  }
  pinTiles(token: string, keys: Iterable<string>) { this.tilePins.set(token, new Set(keys)); }
  releasePin(token: string) { this.tilePins.delete(token); }
  /** Keep readiness valid across the caller's await continuation, placement and view preparation. */
  acquireCoverageLease(x: number, z: number, radius: number, support?: { x: number; z: number }, signal?: AbortSignal): { release(): void } {
    if (signal?.aborted) return { release() {} };
    const pin = `coverage-lease:${++this.coverageLeaseSequence}`;
    const current = support || (this.focus ? { x: this.focus[0], z: this.focus[1] } : null);
    const target = new Set(this.wanted(x, z, radius));
    this.coverageLeases.set(pin, target); this.updateCoverageReserve();
    this.pinTiles(pin, [...target].concat(current ? this.wanted(current.x, current.z, 350) : []));
    let released = false;
    const release = () => {
      if (released) return; released = true;
      this.releasePin(pin); this.coverageLeases.delete(pin); this.updateCoverageReserve(); signal?.removeEventListener('abort', release);
    };
    signal?.addEventListener('abort', release, { once: true });
    return { release };
  }
  setPinnedRoadIds(ids: Iterable<string>) { this.roadPins = new Set(ids); }
  private isPinned(tile: LoadedTile) {
    for (const coverage of this.ensureCoverage.values()) if (coverage.required.has(tile.key) || coverage.support.has(tile.key)) return true;
    if (this.streamFocus?.pinnedTileKeys?.includes(tile.key)) return true;
    for (const keys of this.tilePins.values()) if (keys.has(tile.key)) return true;
    return tile.built.roads.some(r => this.roadPins.has(r.id));
  }
  private required(key: string) {
    for (const value of this.ensureCoverage.values()) if (value.required.has(key)) return true;
    for (const keys of this.coverageLeases.values()) if (keys.has(key)) return true;
    return false;
  }
  private updateCoverageReserve() {
    this.streamStats.coverageLeaseCount = this.coverageLeases.size;
    // One bounded relocation allowance, never one allowance per caller/lease.
    this.streamStats.relocationReserveBytes = this.ensureCoverage.size || this.coverageLeases.size ? this.overlapReserve : 0;
  }
  private estimateTileBytes(key: string) {
    if (this.tileByteHistory.has(key)) return this.tileByteHistory.get(key)!;
    return Math.min(this.stagedBudget / 2, Math.max(16 * 1024 * 1024, ...this.tileByteHistory.values()));
  }
  private important(key: string) {
    if (this.required(key)) return true;
    const f = this.streamFocus || (this.focus ? { x: this.focus[0], z: this.focus[1], vx: 0, vz: 0, mode: 'road' as const } : null);
    if (!f) return false;
    if (this.wanted(f.x, f.z, 500).includes(key)) return true;
    const ahead = predictedFocus(f, 4); return this.wanted(ahead.x, ahead.z, 300).includes(key);
  }
  private reservedBytes() { let bytes = 0; for (const value of this.pendingReservations.values()) bytes += value; for (const value of this.skylineReservations.values()) bytes += value; this.streamStats.pendingReservedBytes = bytes; return bytes; }
  private residentBytes() { return this.streamStats.activeBytes + this.streamStats.stagedBytes + this.streamStats.retiringBytes + this.streamStats.skylineBytes + this.streamStats.skylineStagedBytes + this.streamStats.skylineRetiringBytes; }
  private releaseOptionalCapacity() {
    // Preserve contact coverage and explicit target coverage, not every formerly loaded outer tile.
    const center = this.streamFocus || (this.focus ? { x: this.focus[0], z: this.focus[1] } : null);
    const protectedKeys = center ? new Set(this.wanted(center.x, center.z, 350)) : new Set<string>();
    const candidates = [...this.tiles.values()].filter(t => !this.isPinned(t) && !protectedKeys.has(t.key));
    candidates.sort((a,b) => {
      const c = center || { x: 0, z: 0 };
      return Math.hypot(b.built.i * 1000 + 500 - c.x, b.built.j * 1000 + 500 - c.z) - Math.hypot(a.built.i * 1000 + 500 - c.x, a.built.j * 1000 + 500 - c.z);
    });
    for (const tile of candidates) this.unload(tile);
    for (const [key, stage] of this.staged) if (!this.required(key) && !protectedKeys.has(key)) {
      stage.work.return(undefined as any); this.staged.delete(key); this.streamStats.stagedBytes -= stage.bytes;
    }
  }
  nearbyLamps(x: number, z: number, radius = 70): THREE.Vector3[] {
    const out: THREE.Vector3[] = [], loX = Math.floor((x - radius) / 100), hiX = Math.floor((x + radius) / 100), loZ = Math.floor((z - radius) / 100), hiZ = Math.floor((z + radius) / 100);
    for (let i = loX; i <= hiX; i++) for (let j = loZ; j <= hiZ; j++) for (const l of this.lampGrid.get(`${i},${j}`) || []) if (Math.abs(l.x - x) < radius && Math.abs(l.z - z) < radius) out.push(l);
    return out;
  }
  /** Only sub-readable tree geometry changes; support, buildings and landmark surfaces remain authoritative. */
  updateVisualDetail(camera: THREE.PerspectiveCamera, player: { x: number; z: number }, now = performance.now()) {
    if (now - this.detailUpdated < 250) return; this.detailUpdated = now;
    const pixels = (typeof window === 'undefined' ? 720 : window.innerHeight) / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const item of this.localDetails) {
      const bound = item.mesh.geometry.boundingSphere; if (!bound) continue;
      const playerDistance = Math.max(0, Math.hypot(bound.center.x - player.x, bound.center.z - player.z) - bound.radius);
      const cameraDistance = Math.max(1, bound.center.distanceTo(camera.position) - bound.radius);
      const protectedNear = playerDistance <= 180, projected = item.featureMeters * pixels / cameraDistance;
      item.mesh.visible = protectedNear || projected > (item.mesh.visible ? 1.25 : 2);
      item.mesh.castShadow = protectedNear;
    }
    for (const item of this.treeDetails) {
      let changed = false;
      for (let i = 0; i < item.farFlags.length; i++) {
        const k = i * 16, x = item.matrices[k + 12], y = item.matrices[k + 13], z = item.matrices[k + 14];
        const distance = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z), playerDistance = Math.hypot(x - player.x, z - player.z);
        const diameter = 2 * Math.max(Math.abs(item.matrices[k]), Math.abs(item.matrices[k + 5]), Math.abs(item.matrices[k + 10]));
        const projected = diameter * pixels / Math.max(1, distance), wasFar = item.farFlags[i] === 1;
        const far = playerDistance > 180 && projected < (wasFar ? 9 : 6);
        if (far !== wasFar) { item.farFlags[i] = far ? 1 : 0; changed = true; }
      }
      if (!changed) continue;
      let nearCount = 0, farCount = 0;
      for (let i = 0; i < item.farFlags.length; i++) {
        const mesh = item.farFlags[i] ? item.far : item.near, index = item.farFlags[i] ? farCount++ : nearCount++;
        (mesh.instanceMatrix.array as Float32Array).set(item.matrices.subarray(i * 16, i * 16 + 16), index * 16);
        (mesh.instanceColor!.array as Float32Array).set(item.colors.subarray(i * 3, i * 3 + 3), index * 3);
      }
      item.near.count = nearCount; item.far.count = farCount;
      for (const mesh of [item.near, item.far]) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true; }
    }
  }
  private schedulePump() {
    if (this.pumpFrame) return;
    this.pumpFrame = requestAnimationFrame(() => { this.pumpFrame = 0; this.pumpJobs(); if (this.staged.size || this.retirements.length) this.schedulePump(); });
  }
  /** Also callable before the game's paused early return. Jobs never advance gameplay time. */
  pumpJobs(budgetMs = 1.5) {
    const start = performance.now();
    if (start - this.pumpWindow > 6) { this.pumpWindow = start; this.pumpSpent = 0; }
    const allowance = Math.max(0, budgetMs - this.pumpSpent), deadline = start + allowance;
    if (!allowance) return;
    while (performance.now() < deadline) {
      const item = [...this.staged.values()].find(item => this.required(item.built.key)) || this.staged.values().next().value as StagedTile | undefined;
      if (item) {
        const at = performance.now();
        try {
          const next = item.work.next();
          if (next.done) {
            this.activate(next.value); this.staged.delete(item.built.key);
            this.streamStats.stagedBytes -= item.bytes; this.streamStats.activeBytes += item.bytes; this.ownedBytes.set(item.built.key, item.bytes);
            this.failures.delete(item.built.key); this.notify();
          }
        } catch (error) { item.work.return(undefined as any); this.staged.delete(item.built.key); this.streamStats.stagedBytes -= item.bytes; this.fail(item.built.key, 'Could not prepare this part of the city.'); console.error(error); this.notify(); }
        const cost = performance.now() - at; this.streamStats.installJobs++; this.streamStats.installMaxMs = Math.max(this.streamStats.installMaxMs, cost); this.addMs.push(cost); if (this.addMs.length > 240) this.addMs.shift();
      } else if (this.retirements.length) this.retirements.shift()!();
      else break;
    }
    this.pumpSpent += performance.now() - start;
    if (this.focus && this.pending.size < MAX_PENDING) this.update(this.focus[0], this.focus[1], 0, true);
  }
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
    const want = [...new Set([...this.ensureCoverage.values()].flatMap(c => [...c.required]).concat([...this.coverageLeases.values()].flatMap(keys => [...keys]), this.wanted(x, z, this.radius)))];
    const f = this.streamFocus;
    if (f && !this.waiters.length) {
      const samples = this.buildMs.slice(-20).sort((a,b) => a-b), seconds = samples.length ? samples[Math.floor((samples.length - 1) * .9)] / 1000 + 1 : 4;
      const ahead = predictedFocus(f, seconds);
      for (const key of this.wanted(ahead.x, ahead.z, 400)) if (!want.includes(key)) want.push(key);
      if (f.landingBounds) {
        const b = f.landingBounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        for (const key of this.wanted(cx, cz, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 350)) if (!want.includes(key)) want.push(key);
      }
    }
    for (const k of want) this.request(k);
    for (const [k, t] of this.tiles) {
      // Explicit ensure/support pins retain the usable area while optional distant scenery may retire.
      const [i, j] = k.split('_').map(Number);
      const dx = Math.max(i * 1000 - x, 0, x - (i + 1) * 1000), dz = Math.max(j * 1000 - z, 0, z - (j + 1) * 1000);
      if (Math.hypot(dx, dz) > this.radius + 450 && !this.isPinned(t)) this.unload(t);
    }
    if (f && (f.mode === 'flight' || f.mode === 'descending')) this.updateSkyline(x, z);
  }
  request(k: string) {
    const f = this.failures.get(k), now = performance.now();
    if (this.workerUnavailable || this.workerFailed || !this.worker || !this.packOf.has(k) || this.tiles.has(k) || this.staged.has(k) || this.empty.has(k) || this.pending.has(k) || this.pending.size + this.pendingSkyline.size >= MAX_PENDING || this.streamStats.stagedBytes > this.stagedBudget * .8) return;
    if (f) {
      if (now < f.retryAt || (f.attempts >= TILE_ATTEMPTS && this.waiters.length)) return;
      if (f.attempts >= TILE_ATTEMPTS) this.failures.delete(k);   // bounded background retry window
    }
    const required = this.required(k), urgent = this.important(k), estimate = this.estimateTileBytes(k);
    if (now < (this.capacityDeferred.get(k) || 0) || !required && (this.ensureCoverage.size || this.coverageLeases.size)) return;
    if (required && estimate > this.stagedBudget) {
      this.failures.set(k, { attempts: TILE_ATTEMPTS, retryAt: now + STREAM_RETRY_DELAY, message: 'This city tile exceeds the available preparation budget.' }); return;
    }
    const limit = this.activeBudget + (required ? this.overlapReserve : 0);
    if (this.residentBytes() + this.reservedBytes() + estimate > limit || this.streamStats.stagedBytes + this.reservedBytes() + estimate > this.stagedBudget) {
      if (urgent) this.releaseOptionalCapacity();
      if (this.residentBytes() + this.reservedBytes() + estimate > limit || this.streamStats.stagedBytes + this.reservedBytes() + estimate > this.stagedBudget) return;
    }
    const requestId = ++this.nextRequestId;
    this.pending.set(k, now); this.requestIds.set(k, requestId);
    this.pendingReservations.set(k, estimate);
    this.reservedBytes();
    try { this.worker.postMessage({ type: 'build', protocolVersion: 1, worldEpoch: this.worldEpoch, key: k, url: this.packOf.get(k), requestId }); }
    catch { this.fail(k, 'Could not send this part of the city to the loader.'); }
  }
  // resolve once every tile within r of (x, z) is built (start-up, teleports, test scenes)
  ensure(x: number, z: number, r = 700, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException('Area choice cancelled', 'AbortError'));
    const previousFocus = this.focus, targetFocus: [number, number] = [x, z];
    this.focus = targetFocus;
    const want = this.wanted(x, z, r);
    const token = Symbol('ensure'), support = previousFocus ? this.wanted(previousFocus[0], previousFocus[1], 350) : [];
    this.ensureCoverage.set(token, { required: new Set(want), support: new Set(support) });
    this.updateCoverageReserve();
    // A new area choice is an explicit retry; previous failures are not permanent empty streets.
    for (const k of want) if (!this.pending.has(k)) { this.failures.delete(k); this.capacityDeferred.delete(k); }
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
        this.ensureCoverage.delete(token);
        this.updateCoverageReserve();
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
    if (m.worldEpoch !== undefined && m.worldEpoch !== this.worldEpoch) return;
    const sky = this.pendingSkyline.get(m.key);
    if (sky && sky.id === m.requestId) {
      this.pendingSkyline.delete(m.key); this.skylineReservations.delete(m.key); this.reservedBytes();
      if (m.type === 'skyline' && Array.isArray(m.buffers)) this.stageSkyline(m.key, m.buffers);
      else this.capacityDeferred.set(`skyline:${m.key}`, performance.now() + STREAM_RETRY_DELAY);
      return;
    }
    if (!this.pending.has(m.key) || m.requestId !== this.requestIds.get(m.key)) return;
    const t0 = this.pending.get(m.key); this.pending.delete(m.key); this.requestIds.delete(m.key); this.pendingReservations.delete(m.key); this.reservedBytes();
    if (m.type === 'built') {
      try {
        if (Number.isFinite(m.decodedCacheBytes)) this.streamStats.decodedCacheBytes = m.decodedCacheBytes;
        const b = m.built as TileBuilt;
        if (b?.key !== m.key || !Array.isArray(b.buffers) || !(b.surfaceGrid instanceof Map)) throw new Error('Mismatched city tile');
        const bytes = bufferBytes(b.buffers) * 2 + (b.instances || []).reduce((n, x) => n + x.matrices.byteLength + x.colors.byteLength, 0) * 5 + b.signs.length * 320 + b.buildingGrid.size * 128;
        this.tileByteHistory.set(m.key, bytes);
        const total = this.residentBytes() + this.reservedBytes() + bytes;
        const limit = this.activeBudget + (this.required(m.key) ? this.overlapReserve : 0);
        if (bytes > this.stagedBudget || this.streamStats.stagedBytes + bytes > this.stagedBudget || total > limit) {
          this.streamStats.admissionFailures++;
          if (bytes > this.stagedBudget && this.required(m.key)) {
            this.fail(m.key, 'This area exceeds the available city memory budget. Try another area.');
            const failure = this.failures.get(m.key); if (failure) failure.attempts = TILE_ATTEMPTS;
          } else {
            this.capacityDeferred.set(m.key, performance.now() + (this.important(m.key) ? 250 : 5000));
            if (this.important(m.key)) this.releaseOptionalCapacity();
          }
          this.notify(); return;
        }
        this.staged.set(m.key, { built: b, bytes, work: this.prepare(b), requestId: m.requestId });
        this.streamStats.stagedBytes += bytes;
        if (t0 !== undefined) this.buildMs.push(performance.now() - t0); if (this.buildMs.length > 120) this.buildMs.splice(0, this.buildMs.length - 120);
        this.schedulePump();
      } catch { this.fail(m.key, 'Could not display this part of the city. Please try again.'); }
    } else if (m.type === 'empty') { this.empty.add(m.key); this.failures.delete(m.key); }
    else if (m.type === 'error') { console.error('City tile loading failed.', m.key, m.error || 'Unknown worker error'); this.fail(m.key, 'Could not load this part of the city. Please try again.'); }
    else this.fail(m.key, 'The city loader returned an invalid response.');
    this.notify();
    if (this.focus) this.update(this.focus[0], this.focus[1], 0, true);
  }
  private meshBuffer(buf: BuiltBuffers) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(buf.nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(buf.col, 3));
    if (buf.bounds) geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(...buf.bounds.center), buf.bounds.radius); else geo.computeBoundingSphere();
    const r = RENDER[buf.mat] || { cast: true, receive: true }, mesh = new THREE.Mesh(geo, this.mats[buf.mat]);
    mesh.castShadow = r.cast; mesh.receiveShadow = r.receive; mesh.renderOrder = r.order || 0;
    // Static/review renders do not run the gameplay LOD pass: preserve complete High detail by default.
    // Normal gameplay evaluates protected-near/projected detail before its first visible frame.
    if (buf.detailMeters) mesh.userData.detailMeters = buf.detailMeters;
    return mesh;
  }
  private templateGeometry(name: string) {
    let geo = this.instanceGeometry.get(name); if (geo) return geo;
    if (name.endsWith(':far')) {
      const source = name.startsWith('ico0') ? new THREE.OctahedronGeometry(1, 0) : new THREE.CylinderGeometry(1, 1, 1, 3);
      geo = source.index ? source.toNonIndexed() : source;
      if (geo !== source) source.dispose();
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
      geo.computeBoundingSphere(); this.instanceGeometry.set(name, geo); return geo;
    }
    const t = TPL[name]; geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(t.nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(t.count * 3).fill(1), 3));
    geo.computeBoundingSphere(); this.instanceGeometry.set(name, geo); return geo;
  }
  private *prepare(b: TileBuilt): Generator<void, LoadedTile> {
    const g = new THREE.Group(); g.name = 'tile ' + b.key;
    let completed = false;
    try {
    const ground = new THREE.Mesh(this.groundGeo, this.mats.ground); ground.rotation.x = -Math.PI / 2; ground.position.set(b.i * 1000 + 500, 0, b.j * 1000 + 500); ground.receiveShadow = true; g.add(ground);
    yield;
    if (this.prepareMesh) { this.prepareMesh(ground); yield; }
    for (const buffer of b.buffers) {
      const mesh = this.meshBuffer(buffer); g.add(mesh);
      if (buffer.detailMeters) { g.userData.localDetails ||= []; g.userData.localDetails.push({ owner: b.key, mesh, featureMeters: buffer.detailMeters }); }
      yield;
      if (this.prepareMesh) { this.prepareMesh(mesh); yield; }
    }
    for (const item of b.instances || []) {
      const mesh = new THREE.InstancedMesh(this.templateGeometry(item.template), this.mats[item.mat], item.colors.length / 3);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(item.matrices.slice(), 16); mesh.instanceColor = new THREE.InstancedBufferAttribute(item.colors.slice(), 3);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); g.add(mesh);
      const far = new THREE.InstancedMesh(this.templateGeometry(item.template + ':far'), this.mats[item.mat], item.colors.length / 3);
      far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(item.colors.length), 3); far.count = 0; far.castShadow = false; far.receiveShadow = true;
      far.boundingSphere = mesh.boundingSphere?.clone() || null; g.add(far);
      const detail: TreeDetail = { owner: b.key, near: mesh, far, matrices: item.matrices, colors: item.colors, farFlags: new Uint8Array(item.colors.length / 3) };
      // Publish selection records only with their tile; staged meshes never participate in visible LOD updates.
      g.userData.treeDetails ||= []; g.userData.treeDetails.push(detail); yield;
      if (this.prepareMesh) { this.prepareMesh(mesh); yield; this.prepareMesh(far); yield; }
    }
    const signalLights = b.signals.length ? new SignalLights(b.signals) : undefined;
    if (signalLights) { signalLights.update(this.signalSeconds); g.add(signalLights.mesh); g.userData.signalLights = signalLights; } yield;
    if (signalLights && this.prepareMesh) { this.prepareMesh(signalLights.mesh); yield; }
    const buildings = new Set<Building>(); let buildingVisits = 0;
    for (const cell of b.buildingGrid.values()) for (const item of cell) {
      buildings.add(item);
      if (++buildingVisits % 128 === 0) yield;
    }
    const buildingValues = new Map<string, Building>(); let valueCount = 0;
    for (const building of buildings) { buildingValues.set(building.id, building); if (++valueCount % 128 === 0) yield; }
    const preparedSigns: Parameters<SignSystem['add']>[0][] = [];
    for (let i = 0; i < b.signs.length; i++) { const s = b.signs[i]; preparedSigns.push({ id: s.id, text: s.text, bg: s.bg, fg: s.fg, c: new THREE.Vector3(...s.c), right: new THREE.Vector3(...s.right), up: new THREE.Vector3(0, 1, 0), w: s.w, h: s.h }); if (i % 64 === 63) yield; }
    const lamps: THREE.Vector3[] = [], lampCells = new Map<string, THREE.Vector3[]>();
    for (let i = 0; i < b.lamps.length; i++) { lamps.push(new THREE.Vector3(...b.lamps[i])); if (i % 64 === 63) yield; }
    for (const l of lamps) { const key = `${Math.floor(l.x / 100)},${Math.floor(l.z / 100)}`, cell = lampCells.get(key); if (cell) cell.push(l); else lampCells.set(key, [l]); }
    completed = true;
    return { key: b.key, built: b, group: g, signs: [], lamps, buildings: [...buildings], signalLights, preparedSigns, lampCells, buildingValues };
    } finally {
      if (!completed) {
        this.disposePreparedGroup(g, g.userData.signalLights, this.staged.get(b.key)?.bytes || 0);
      }
    }
  }
  /** Synchronous compatibility entry point for isolated fixtures; production uses staged preparation. */
  add(b: TileBuilt) {
    if (this.tiles.has(b.key)) return;
    const work = this.prepare(b); let next = work.next(); while (!next.done) next = work.next(); this.activate(next.value);
  }
  private disposePreparedGroup(group: THREE.Group, signalLights?: SignalLights, bytes = 0) {
    if (group.userData.resourcesDisposed) return;
    group.userData.resourcesDisposed = true;
    const shared = new Set(this.instanceGeometry.values());
    group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || mesh.geometry === this.groundGeo || mesh.geometry === signalLights?.geometry) return;
      this.retirements.push(() => { if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose(); if (!shared.has(mesh.geometry)) mesh.geometry.dispose(); });
    });
    if (signalLights) this.retirements.push(() => signalLights.dispose());
    this.streamStats.retiringBytes += bytes;
    this.retirements.push(() => { this.streamStats.retiringBytes -= bytes; });
    this.schedulePump();
  }
  private activate(t: LoadedTile) {
    if (this.tiles.has(t.key)) return;
    const started = performance.now(), b = t.built;
    const previousActivity = new Map((b.activity || []).map(([key]) => [key, this.activity.get(key)]));
    const previousRails = new Map((b.rails || []).map(rail => [rail.id, this.rails.get(rail.id)]));
    const sky = this.skylineTiles.get(t.key), skyVisible = sky?.group.visible;
    let graphStarted = false;
    t.signs = [];
    try {
      // Register boards before publishing support. A failed board registration rolls back its tracked prefix.
      for (const sign of t.preparedSigns || []) t.signs.push(this.signs.add(sign));
      this.buildingGrid.attach(t.key, b.buildingGrid); this.surfaceGrid.attach(t.key, b.surfaceGrid); this.walls.attach(t.key, b.walls); this.obstacles.attach(t.key, b.obstacles);
      if (b.landmarkSurfaceGrid) this.landmarkSurfaceGrid.attach(t.key, b.landmarkSurfaceGrid);
      this.byBuilding.attach(t.key, t.buildingValues || new Map()); this.lampGrid.attach(t.key, t.lampCells || new Map());
      for (const [k, n] of b.activity || []) this.activity.set(k, (this.activity.get(k) || 0) + n);
      for (const r of b.rails || []) this.rails.set(r.id, r);
      this.lamps.push(...t.lamps); this.signals.push(...b.signals); this.busStops.push(...b.busStops); this.walkPaths.push(...b.walkPaths);
      this.tiles.set(t.key, t); this.group.add(t.group);
      this.treeDetails.push(...(t.group.userData.treeDetails || [])); this.localDetails.push(...(t.group.userData.localDetails || []));
      if (sky) sky.group.visible = false;
      graphStarted = true; this.onTileAdded(t);
      t.preparedSigns = undefined; this.detailUpdated = -Infinity; this.revision++;
      this.streamStats.activationMaxMs = Math.max(this.streamStats.activationMaxMs, performance.now() - started);
    } catch (error) {
      // This is an uncommitted transaction rollback, never ordinary eviction of a pinned committed tile.
      this.tiles.delete(t.key); this.group.remove(t.group);
      this.buildingGrid.detach(t.key); this.surfaceGrid.detach(t.key); this.walls.detach(t.key); this.obstacles.detach(t.key); this.landmarkSurfaceGrid.detach(t.key); this.byBuilding.detach(t.key); this.lampGrid.detach(t.key);
      this.treeDetails = this.treeDetails.filter(item => item.owner !== t.key); this.localDetails = this.localDetails.filter(item => item.owner !== t.key);
      this.signs.remove(t.signs); t.signs = [];
      for (const [key, value] of previousActivity) { if (value === undefined) this.activity.delete(key); else this.activity.set(key, value); }
      for (const [key, value] of previousRails) { if (value === undefined) this.rails.delete(key); else this.rails.set(key, value); }
      const lamps = new Set(t.lamps), signals = new Set(b.signals), stops = new Set(b.busStops), paths = new Set(b.walkPaths);
      this.lamps = this.lamps.filter(x => !lamps.has(x)); this.signals = this.signals.filter(x => !signals.has(x)); this.busStops = this.busStops.filter(x => !stops.has(x)); this.walkPaths = this.walkPaths.filter(x => !paths.has(x));
      if (sky && skyVisible !== undefined) sky.group.visible = skyVisible;
      if (graphStarted) { try { this.onTileRemoved(t); } catch (rollbackError) { console.error('Road graph rollback failed.', t.key, rollbackError); } }
      this.disposePreparedGroup(t.group, t.signalLights, this.staged.get(t.key)?.bytes || 0);
      this.revision++; throw error;
    }
  }
  unload(t: LoadedTile) {
    if (this.isPinned(t)) return;
    this.tiles.delete(t.key);
    this.treeDetails = this.treeDetails.filter(item => item.owner !== t.key);
    this.localDetails = this.localDetails.filter(item => item.owner !== t.key);
    this.group.remove(t.group);
    const bytes = this.ownedBytes.get(t.key) || 0; this.ownedBytes.delete(t.key); this.streamStats.activeBytes -= bytes;
    this.disposePreparedGroup(t.group, t.signalLights, bytes);
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
    this.buildingGrid.detach(t.key); this.surfaceGrid.detach(t.key); this.walls.detach(t.key); this.obstacles.detach(t.key); this.landmarkSurfaceGrid.detach(t.key);
    this.byBuilding.detach(t.key);
    for (const [k, n] of b.activity || []) { const v = (this.activity.get(k) || 0) - n; if (v > 0.5) this.activity.set(k, v); else this.activity.delete(k); }
    this.signs.remove(t.signs);
    const ls = new Set(t.lamps); this.lamps = this.lamps.filter((l) => !ls.has(l));
    this.lampGrid.detach(t.key);
    const ss = new Set(b.signals); this.signals = this.signals.filter((s) => !ss.has(s));
    const bs = new Set(b.busStops); this.busStops = this.busStops.filter((s) => !bs.has(s));
    const ws = new Set(b.walkPaths); this.walkPaths = this.walkPaths.filter((s) => !ws.has(s));
    this.onTileRemoved(t);
    this.revision++;
    const sky = this.skylineTiles.get(t.key); if (sky) sky.group.visible = this.streamFocus?.mode === 'flight' || this.streamFocus?.mode === 'descending';
  }
  private updateSkyline(x: number, z: number) {
    const now = performance.now();
    for (const [key, pending] of this.pendingSkyline) if (now - pending.at > TILE_TIMEOUT) { this.pendingSkyline.delete(key); this.skylineReservations.delete(key); }
    this.reservedBytes();
    for (const key of this.wanted(x, z, 2600)) {
      if (this.workerUnavailable || this.workerFailed || !this.worker) break;
      if (this.pending.size || this.staged.size || this.pendingSkyline.size || this.streamStats.skylineBytes > 32 * 1024 * 1024) break;
      if (this.tiles.has(key) || this.skylineTiles.has(key) || this.skylinePreparing.has(key) || now < (this.capacityDeferred.get(`skyline:${key}`) || 0)) continue;
      const estimate = this.skylineByteHistory.get(key) || 8 * 1024 * 1024;
      const skyBytes = this.streamStats.skylineBytes + this.streamStats.skylineStagedBytes + this.streamStats.skylineRetiringBytes;
      if (skyBytes + estimate > 32 * 1024 * 1024 || this.residentBytes() + this.reservedBytes() + estimate > this.activeBudget) continue;
      const requestId = ++this.nextRequestId;
      this.pendingSkyline.set(key, { id: requestId, at: now });
      this.skylineReservations.set(key, estimate); this.reservedBytes();
      try { this.worker?.postMessage({ type: 'skyline', key, requestId, worldEpoch: this.worldEpoch, protocolVersion: 1, url: this.packOf.get(key) }); }
      catch { this.pendingSkyline.delete(key); this.skylineReservations.delete(key); this.reservedBytes(); }
      break;
    }
    for (const [key, tile] of this.skylineTiles) {
      const [i, j] = key.split('_').map(Number), distant = Math.hypot(i * 1000 + 500 - x, j * 1000 + 500 - z) > 4000;
      tile.group.visible = !this.tiles.has(key) && !distant;
      if (distant) {
        this.group.remove(tile.group); this.skylineTiles.delete(key); this.streamStats.skylineBytes -= tile.bytes; this.streamStats.skylineRetiringBytes += tile.bytes;
        tile.group.traverse(o => { if ((o as THREE.Mesh).isMesh) this.retirements.push(() => (o as THREE.Mesh).geometry.dispose()); });
        this.retirements.push(() => { this.streamStats.skylineRetiringBytes -= tile.bytes; }); this.schedulePump();
      }
    }
  }
  private stageSkyline(key: string, buffers: BuiltBuffers[]) {
    const bytes = bufferBytes(buffers) * 2;
    this.skylineByteHistory.set(key, bytes);
    if (this.skylineTiles.has(key) || this.skylinePreparing.has(key)) return;
    const skyBytes = this.streamStats.skylineBytes + this.streamStats.skylineStagedBytes + this.streamStats.skylineRetiringBytes;
    if (skyBytes + bytes > 32 * 1024 * 1024 || this.residentBytes() + this.reservedBytes() + bytes > this.activeBudget) { this.capacityDeferred.set(`skyline:${key}`, performance.now() + 5000); return; }
    this.skylinePreparing.add(key); this.streamStats.skylineStagedBytes += bytes;
    const group = new THREE.Group(); group.name = `visual-only skyline ${key}`;
    let preparationError: unknown = null;
    // Queue small mesh units under the same allowance; this layer never enters gameplay grids.
    for (const buffer of buffers) {
      let mesh: THREE.Mesh | undefined;
      this.retirements.push(() => { if (preparationError) return; try { mesh = this.meshBuffer(buffer); mesh.castShadow = false; group.add(mesh); } catch (error) { preparationError = error; } });
      this.retirements.push(() => { if (preparationError || !mesh) return; try { this.prepareMesh?.(mesh); } catch (error) { preparationError = error; } });
    }
    this.retirements.push(() => {
      this.skylinePreparing.delete(key); this.streamStats.skylineStagedBytes -= bytes;
      if (preparationError) {
        this.streamStats.skylineRetiringBytes += bytes;
        group.traverse(o => { if ((o as THREE.Mesh).isMesh) this.retirements.push(() => (o as THREE.Mesh).geometry.dispose()); });
        this.retirements.push(() => { this.streamStats.skylineRetiringBytes -= bytes; });
        this.capacityDeferred.set(`skyline:${key}`, performance.now() + STREAM_RETRY_DELAY);
        console.warn('Distant skyline preparation deferred.', key, preparationError); return;
      }
      this.skylineTiles.set(key, { group, bytes }); this.streamStats.skylineBytes += bytes;
      group.visible = !this.tiles.has(key) && (this.streamFocus?.mode === 'flight' || this.streamFocus?.mode === 'descending'); this.group.add(group);
    });
    this.schedulePump();
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

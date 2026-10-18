import * as THREE from 'three';
import { FixedClock } from '../core/clock';
import { WorldLoader, LoadError, WORLD_BASE_V2 } from '../world/loader';
import { WorldPhysics } from '../world/collision';
import type { WorldCore, WorldChunk, WorldManifest } from '../world/schema';
import { Session, BUILD_VERSION, setWorldVersionKey } from '../missions/session';
import { buildLevelCatalog } from '../missions/levels';
import { buildCatalog } from '../missions/catalog';
import type { MissionDef, ResultSummary } from '../missions/types';
import { GameView } from './view';
import { InputManager } from '../ui/input';
import { Store, type Settings } from '../persistence/store';
import { AudioSystem } from '../audio/audio';
import { Hud } from '../ui/hud';
import { Screens } from '../ui/screens';
import { MapView } from '../ui/map';
import { Autopilot } from '../debug/autopilot';
import { Tutorial } from '../ui/tutorial';
import { SignalSystem } from '../traffic/signals';
import { MISSION, SIM_HZ } from '../config/gameplay';
import type { ArtApi, Quality } from '../art/api';

/** a practice run derived from the first level-1 contract (own allowance, no score) */
function withPractice(ms: MissionDef[]): MissionDef[] {
  const l1 = ms.find((m) => m.level === 1);
  if (!l1) return ms;
  return [{ ...l1, id: 'practice', templates: ['PRACTICE'], title: 'Practice run', practice: true, traffic: 'light', deadlineSeconds: Math.round(l1.deadlineSeconds * 1.2), brief: 'Steer, brake, try a flight and stop at the marked entrance. Practice has its own flight allowance and no score.' }, ...ms];
}

export type AppState = 'BOOT' | 'MENU' | 'LOADING' | 'READY' | 'PLAYING' | 'PAUSED' | 'RECOVERING' | 'RESULTS' | 'ERROR' | 'CONTEXT_LOST';

export interface FrameStats { samples: number[]; p50: number; p95: number; p99: number; fps: number }

/**
 * Top-level application: explicit state machine (MASTER §10), composition root, lifecycle,
 * streaming, persistence. Gameplay simulation only advances in PLAYING; every other state
 * freezes the authoritative clock.
 */
export class App {
  state: AppState = 'BOOT';
  renderer!: THREE.WebGLRenderer;
  view!: GameView;
  loader = new WorldLoader();
  manifest: WorldManifest | null = null;
  core: WorldCore | null = null;
  world: WorldPhysics | null = null;
  missions: MissionDef[] = [];
  session: Session | null = null;
  clock = new FixedClock();
  input: InputManager;
  store = new Store();
  settings: Settings;
  audio = new AudioSystem();
  hud: Hud;
  screens: Screens;
  map: MapView | null = null;
  autopilot: Autopilot | null = null;
  debug = new URLSearchParams(location.search).has('debug');
  /** DEBUG ONLY: simulation advances only through debugAdvance() (software-GPU test harness) */
  manualClock = this.debug && new URLSearchParams(location.search).has('manualclock');
  private abort: AbortController | null = null;
  private chunkCache = new Map<string, WorldChunk>();
  private chunkLoading = new Set<string>();
  private lastTime = 0;
  private frameTimes: number[] = [];
  private recoveryTimer = 0;
  private countdown = 0;
  private pauseReason: 'user' | 'map' | 'hidden' | 'orientation' | 'loading' | 'stall' | 'tutorial' | null = null;
  tutorial: Tutorial | null = null;
  private checkpointTimer = 0;
  private streamTimer = 0;
  private menuTime = 0;
  private lastResult: ResultSummary | null = null;
  quality: Quality = 'standard';
  private art: ArtApi | null = null;
  readonly ui: HTMLElement;

  constructor(private canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.ui = ui;
    this.settings = this.store.loadSettings();
    this.input = new InputManager(ui);
    this.input.sensitivity = this.settings.sensitivity;
    this.hud = new Hud(ui, this);
    this.screens = new Screens(ui, this);
    this.applySettings();
    (window as any).__hmd = this; // test/debug handle (no gameplay authority by itself)
  }

  applySettings() {
    const s = this.settings;
    document.documentElement.classList.toggle('large-text', s.largeText);
    this.input.sensitivity = s.sensitivity;
    this.audio.volumes = { music: s.musicVolume, sfx: s.sfxVolume, ui: s.uiVolume };
    this.audio.applyVolumes();
    if (this.view) this.view.reducedShake = s.reducedShake;
    this.hud.setHandedness(s.handedness);
    this.store.saveSettings(s);
  }

  // ------------------------------------------------------------------ boot
  async boot(): Promise<void> {
    this.screens.boot('Checking your device…');
    const gl = this.canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) as WebGL2RenderingContext | null;
    if (!gl) {
      this.fail('This browser cannot start WebGL2 graphics.', 'Try an up-to-date Chrome, Safari or Firefox, enable hardware acceleration, or close other heavy tabs, then reload.', false);
      return;
    }
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: gl, antialias: true, powerPreference: 'high-performance' });
    this.quality = this.pickQuality();
    const dprCap = this.quality === 'high' ? 2 : this.quality === 'standard' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(); });
    this.canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.technicalPause('hidden'); });
    window.addEventListener('pagehide', () => { this.technicalPause('hidden'); this.saveCheckpoint(); });
    window.addEventListener('orientationchange', () => setTimeout(() => this.onOrientation(), 120));
    this.input.onPause = () => { if (this.state === 'PLAYING') this.pause('user'); else if (this.state === 'PAUSED' && this.pauseReason === 'user') this.resume(); };
    this.input.onMap = () => { if (this.state === 'PLAYING') this.openMap(); };
    this.input.onHorn = () => this.audio.horn();
    try {
      const mod = await import('../art/index');
      this.art = mod.art;
      this.view = new GameView(this.renderer, this.art);
      this.view.reducedShake = this.settings.reducedShake;
      this.resize();
      this.screens.boot('Loading the Hyderabad metro network…');
      this.abort = new AbortController();
      // prefer the whole-network package (v2); fall back to the Uppal–Tarnaka package (v1)
      const forceV1 = new URLSearchParams(location.search).has('v1');
      if (!forceV1) {
        try { this.loader = new WorldLoader(WORLD_BASE_V2); this.manifest = await this.loader.loadManifest(this.abort.signal); }
        catch (e) { if ((e as Error).name === 'AbortError') throw e; this.loader = new WorldLoader(); this.manifest = null; }
      }
      if (!this.manifest) this.manifest = await this.loader.loadManifest(this.abort.signal);
      setWorldVersionKey(`${this.manifest.worldId}@v${this.manifest.version}`);
      this.core = await this.loader.loadCore(this.abort.signal);
      this.world = new WorldPhysics(this.core, this.manifest.chunkSizeM);
      this.world.setKnownChunks(this.manifest.chunks.map((c) => c.id));
      // station stairs/escalators: same footprints for visuals and collision (G04, S02)
      const so = (mod as any).stationObstacles as undefined | ((c: WorldCore) => { id: string; poly: [number, number][]; bottom: number; top: number }[]);
      if (so) this.world.addStructures(so(this.core));
      // whole-network structures (skywalks, foot-over-bridges): render + collision from one plan
      const so2 = (mod as any).structureObstacles as undefined | ((c: WorldCore) => { id: string; poly: [number, number][]; bottom: number; top: number }[]);
      if (so2 && (this.core as any).structures?.length) this.world.addStructures(so2(this.core));
      this.missions = this.isNetwork() ? withPractice(buildLevelCatalog(this.core, this.world)) : buildCatalog(this.core, this.world);
      this.view.artExtras = mod as any;
      await this.view.buildStatic(this.core, this.quality, (s) => this.screens.boot(s));
      this.screens.boot('Loading materials');
      await mod.texturesReady();
      this.map = new MapView(this.core, this.world);
      this.view.buildSignals(new SignalSystem(this.world), this.world);
    } catch (e) {
      this.handleLoadError(e, () => this.boot());
      return;
    }
    requestAnimationFrame((t) => this.frame(t));
    this.toMenu();
  }

  /** true when the loaded package covers the whole network (v2) */
  isNetwork(): boolean { return !!this.core && Array.isArray((this.core as any).lines); }

  private pickQuality(): Quality {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
    return mobile ? 'low' : 'standard';
  }

  private handleLoadError(e: unknown, retry: () => void) {
    if ((e as Error).name === 'AbortError') return;
    if (e instanceof LoadError) this.fail(e.message, e.detail, e.retryable, retry);
    else this.fail('Something went wrong while loading.', String((e as Error)?.stack ?? e), true, retry);
  }

  fail(message: string, detail: string, retryable: boolean, retry?: () => void) {
    this.state = 'ERROR';
    this.input.enabled = false; this.input.clearAll();
    this.screens.error(message, detail, retryable ? retry ?? (() => location.reload()) : null);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!this.renderer) return;
    if (this.state === 'PLAYING' && h > w && w < 820) this.pause('orientation'); // portrait during a delivery
    this.renderer.setSize(w, h, false);
    this.view?.resize(w, h);
  }

  // ------------------------------------------------------------------ menu / flow
  toMenu() {
    this.cancelRun();
    this.state = 'MENU';
    this.view?.clearActors();
    this.view?.setDeliveryMarker(null, 0, null);
    this.view?.setRoute(null);
    this.hud.hide();
    const cp = this.store.loadCheckpoint();
    this.screens.home(cp && 'cp' in cp ? cp.cp : null, cp && 'error' in cp ? cp.error : null);
  }

  /** start a mission: LOADING → READY (countdown) → PLAYING; cancels all previous run state (U12) */
  async startMission(m: MissionDef, opts: { seed?: number; checkpoint?: any } = {}) {
    this.cancelRun();
    this.audio.start();
    this.state = 'LOADING';
    this.screens.loading(m, 'Preparing the road', 0);
    const abort = new AbortController();
    this.abort = abort;
    try {
      let s: Session;
      if (opts.checkpoint) {
        s = Session.fromCheckpoint(this.world!, m, opts.checkpoint);
      } else {
        s = new Session(this.world!, m, { seed: opts.seed ?? m.seed });
      }
      s.debugUsed = this.debug && !!this.autopilot;
      // preload everything around the start (and the destination) before the clock exists
      const needed = this.chunksAround(s.player.x, s.player.z, 450);
      const stop = s.currentStop;
      if (stop) for (const id of this.chunksAround(stop.entrance[0], stop.entrance[1], 150)) if (!needed.includes(id)) needed.push(id);
      let done = 0;
      await Promise.all(needed.map(async (id) => {
        await this.ensureChunk(id, abort.signal);
        done++;
        this.screens.loading(m, `Loading ${this.areaLabel(s)} (${done}/${needed.length})`, done / needed.length);
      }));
      if (abort.signal.aborted) return;
      this.screens.loading(m, 'Warming up graphics', 1);
      this.session = s;
      this.tutorial = m.practice && !this.autopilot ? new Tutorial() : null;
      this.view.resetCamera();
      this.view.update(s, this.world!, 1, 0);
      this.view.warm();
      this.updateRouteVisual();
      this.state = 'READY';
      this.screens.ready(m, s.resumed);
    } catch (e) {
      this.handleLoadError(e, () => this.startMission(m, opts));
    }
  }

  private areaLabel(s: Session): string {
    const p = s.player;
    let best = '', bd = Infinity;
    for (const st of this.core!.stations) { if (!st.inCorridor) continue; const d = Math.hypot(st.x - p.x, st.z - p.z); if (d < bd) { bd = d; best = st.name; } }
    return best ? `${best} area` : 'the corridor';
  }

  /** READY → countdown (not charged) → PLAYING */
  beginCountdown() {
    if (this.state !== 'READY' || !this.session) return;
    this.audio.start();
    this.screens.clear();
    this.hud.show(this.session);
    this.countdown = MISSION.countdownSeconds;
    this.hud.countdown(Math.ceil(this.countdown));
  }

  private cancelRun() {
    this.abort?.abort();
    this.abort = null;
    this.session = null;
    this.autopilot = null;
    this.countdown = 0;
    this.input.enabled = false;
    this.input.clearAll();
    this.audio.setDriving(false, 0, 0);
    this.pauseReason = null;
  }

  pause(reason: NonNullable<App['pauseReason']>) {
    if (this.state !== 'PLAYING' && this.state !== 'RECOVERING') return;
    this.state = 'PAUSED';
    this.pauseReason = reason;
    this.input.enabled = false; this.input.clearAll();
    this.clock.reset();
    this.audio.setDriving(false, 0, 0);
    this.saveCheckpoint();
    if (reason === 'map') this.screens.map(this.map!, this.session!);
    else if (reason !== 'tutorial') this.screens.pause(reason);
  }

  technicalPause(reason: 'hidden' | 'orientation' | 'loading' | 'stall') {
    if (this.state === 'PLAYING' || this.state === 'RECOVERING') this.pause(reason);
    if (reason === 'hidden') this.audio.suspend();
  }

  openMap() { this.pause('map'); }

  resume() {
    if (this.state !== 'PAUSED' || !this.session) return;
    if (this.pauseReason === 'loading' && !this.criticalLoaded()) return;
    this.audio.resume();
    this.state = this.session.phase === 'RECOVERING' ? 'RECOVERING' : 'PLAYING';
    this.pauseReason = null;
    this.clock.reset();
    this.lastTime = performance.now();
    this.screens.clear();
    this.hud.show(this.session);
    this.input.clearAll();
    this.input.enabled = true;
  }

  retry(sameSeed: boolean) {
    const s = this.session ?? null;
    const m = s?.mission ?? this.missions.find((q) => q.id === this.lastResult?.missionId);
    if (!m) return this.toMenu();
    const seed = sameSeed ? (s?.rng.seed ?? this.lastResult?.seed ?? m.seed) : Math.floor(Math.random() * 1e9);
    this.store.clearCheckpoint();
    void this.startMission(m, { seed });
  }

  abandon() {
    if (!this.session) return this.toMenu();
    this.session.abandon();
    this.store.clearCheckpoint();
    this.finish();
  }

  private onOrientation() {
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 820;
    if (portrait && this.state === 'PLAYING') this.pause('orientation');
    this.resize();
  }

  private onContextLost() {
    const prev = this.state;
    if (prev === 'PLAYING' || prev === 'RECOVERING') this.saveCheckpoint();
    this.state = 'CONTEXT_LOST';
    this.input.enabled = false; this.input.clearAll();
    this.clock.reset();
    this.screens.contextLost(false);
  }
  private onContextRestored() {
    // three.js re-initialises GL state; geometries/textures re-upload on next render
    this.resize();
    this.screens.contextLost(true);
  }
  resumeAfterContext() {
    if (this.session && this.session.phase === 'READY') {
      // lost before the countdown finished: return to the ready card; nothing was charged
      this.state = 'READY'; this.countdown = 0; this.hud.hide();
      this.screens.ready(this.session.mission, this.session.resumed);
      return;
    }
    if (this.session && this.session.phase !== 'ENDED') {
      this.state = 'PAUSED'; this.pauseReason = 'user';
      this.resume();
    } else this.toMenu();
  }

  private saveCheckpoint() {
    const s = this.session;
    if (!s || s.phase === 'ENDED' || s.mission.practice || this.state === 'READY' || this.state === 'LOADING') return;
    this.store.saveCheckpoint({ missionId: s.mission.id, seed: s.rng.seed, cp: s.checkpoint(), build: BUILD_VERSION });
  }

  continueSaved(saved: any) {
    const m = this.missions.find((q) => q.id === saved.missionId);
    const reject = (why: string) => { this.store.clearCheckpoint(); this.screens.message('Saved delivery cannot be resumed', `${why} Your settings and records are kept.`, () => this.toMenu()); };
    if (!m) return reject('That contract is not part of this world version.');
    // validate before entering the loading flow so a bad save cannot cause a retry loop (U08)
    try { Session.fromCheckpoint(this.world!, m, saved.cp); }
    catch (e) { return reject(`The save is incompatible or damaged (${(e as Error).message}).`); }
    void this.startMission(m, { checkpoint: saved.cp, seed: saved.seed });
  }

  // ------------------------------------------------------------------ streaming
  chunksAround(x: number, z: number, r: number): string[] {
    const m = this.manifest!;
    const size = m.chunkSizeM;
    const out: string[] = [];
    for (const c of m.chunks) {
      const cx = (c.ix + 0.5) * size, cz = (c.iz + 0.5) * size;
      if (Math.hypot(cx - x, cz - z) <= r + size * 0.71) out.push(c.id);
    }
    return out;
  }

  private async ensureChunk(id: string, signal: AbortSignal) {
    if (this.view.chunkIds.includes(id)) { if (!this.world!.loadedChunkIds.includes(id)) this.world!.addChunk(this.chunkCache.get(id)!); return; }
    let c = this.chunkCache.get(id);
    if (!c) {
      if (this.chunkLoading.has(id)) { while (this.chunkLoading.has(id)) await new Promise((r) => setTimeout(r, 30)); c = this.chunkCache.get(id); }
      else {
        this.chunkLoading.add(id);
        try { c = await this.loader.loadChunk(id, signal); this.chunkCache.set(id, c); }
        finally { this.chunkLoading.delete(id); }
      }
    }
    if (!c || signal.aborted) return;
    // register collision and visuals together (no visible building without its collider)
    this.world!.addChunk(c);
    // D12: footprints conflicting with the carriageway are omitted from render and collision alike
    this.view.addChunk({ ...c, buildings: c.buildings.filter((b) => !b.intrudesCarriageway) }, this.core!);
  }

  private stream() {
    const s = this.session;
    if (!s || !this.abort) return;
    const p = s.player;
    const lookR = 420 + Math.max(0, p.speed) * 6;
    const want = new Set(this.chunksAround(p.x, p.z, lookR));
    const stop = s.currentStop;
    if (stop) for (const id of this.chunksAround(stop.entrance[0], stop.entrance[1], 120)) want.add(id);
    const signal = this.abort.signal;
    let inflight = this.chunkLoading.size;
    for (const id of want) {
      if (inflight >= 4) break;
      if (!this.view.chunkIds.includes(id) && !this.chunkLoading.has(id)) {
        inflight++;
        this.ensureChunk(id, signal).catch((e) => { if ((e as Error).name !== 'AbortError') this.hud.toast('Some scenery failed to load; retrying', 'warn'); });
      }
    }
    // unload far chunks (reference: visuals and colliders together)
    const keep = new Set(this.chunksAround(p.x, p.z, lookR + 250));
    if (stop) for (const id of this.chunksAround(stop.entrance[0], stop.entrance[1], 120)) keep.add(id);
    for (const id of this.view.chunkIds) if (!keep.has(id)) { this.view.removeChunk(id); this.world!.removeChunk(id); }
    if (this.chunkCache.size > 120) for (const id of [...this.chunkCache.keys()]) if (!keep.has(id) && this.chunkCache.size > 80) this.chunkCache.delete(id);
  }

  /** collision-critical content at the car and immediately ahead (U09, F22) */
  criticalLoaded(): boolean {
    const s = this.session;
    if (!s) return true;
    const p = s.player;
    const ahead = Math.max(25, p.speed * 2.5);
    const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
    return this.world!.isLoaded(p.x, p.z) && this.world!.isLoaded(p.x + fx * ahead, p.z + fz * ahead);
  }

  // ------------------------------------------------------------------ frame loop
  private frame(t: number) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = this.lastTime ? (t - this.lastTime) / 1000 : 0;
    this.lastTime = t;
    if (this.state === 'CONTEXT_LOST' || !this.view) return;
    if (dt > 0) { this.frameTimes.push(dt * 1000); if (this.frameTimes.length > 600) this.frameTimes.shift(); }
    const s = this.session;
    if (this.state === 'MENU' || this.state === 'ERROR' || this.state === 'BOOT' || (this.state === 'LOADING' && !s)) {
      this.menuTime += dt;
      const st = this.core?.stations.find((q) => /stadium/i.test(q.name)) ?? this.core?.stations.find((q) => q.inCorridor);
      this.view.menuCamera(this.menuTime, st?.x ?? 0, st?.z ?? 0);
      this.view.render();
      return;
    }
    if (!s) { this.view.render(); return; }

    if (this.state === 'READY' && this.countdown > 0) {
      this.countdown -= Math.min(dt, 0.5);
      this.hud.countdown(this.countdown > 0 ? Math.ceil(this.countdown) : 0);
      if (this.countdown <= 0) {
        s.start();
        this.state = 'PLAYING';
        this.input.clearAll();
        this.input.enabled = true;
        this.clock.reset();
        if (this.debug && new URLSearchParams(location.search).has('autopilot')) this.enableAutopilot();
      }
    }

    let alpha = 1;
    if (this.state === 'PLAYING' && this.manualClock) {
      alpha = 1; // debug harness drives ticks via debugAdvance()
    } else if (this.state === 'PLAYING') {
      const adv = this.clock.advance(dt);
      if (adv.stalled) {
        this.technicalPause('stall');
      } else {
        this.runTicks(adv.ticks);
        alpha = adv.alpha;
      }
    } else if (this.state === 'RECOVERING') {
      this.recoveryTimer -= dt;
      if (this.recoveryTimer <= 0) {
        s.completeRecovery();
        this.view.resetCamera();
        if (s.phase === 'ENDED') this.finish();
        else { this.state = 'PLAYING'; this.input.clearAll(); this.input.enabled = true; this.clock.reset(); this.hud.recovering(false); }
      }
    }

    this.streamTimer += dt;
    if (this.streamTimer > 0.4) { this.streamTimer = 0; this.stream(); }
    this.checkpointTimer += dt;
    if (this.checkpointTimer > 5 && this.state === 'PLAYING') { this.checkpointTimer = 0; this.saveCheckpoint(); }

    this.view.update(s, this.world!, alpha, dt);
    this.view.render();
    this.hud.update(s, dt, this);
    if (this.state === 'PLAYING' || this.state === 'RECOVERING') this.audio.setDriving(true, s.player.speed, s.player.isAirborne ? 1 : 0);
    if (this.debug) this.hud.debugText(this.debugInfo());
  }

  /** the single per-tick path used by the frame loop and the debug harness */
  runTicks(n: number): number {
    const s = this.session;
    let ran = 0;
    for (let i = 0; i < n && s && this.state === 'PLAYING'; i++) {
      if (!this.criticalLoaded()) { this.technicalPause('loading'); break; }
      const inp = this.autopilot ? this.autopilot.input() : this.input.sample();
      (s as any)._brakeHeld = inp.brake;
      s.step(inp);
      ran++;
      this.afterTick(s);
      if (s.phase !== 'PLAYING') break;
    }
    return ran;
  }

  /**
   * DEBUG ONLY (?debug): advance the simulation by `ticks` through the normal tick path,
   * independent of wall time — for automated browser tests on software-rendered GPUs where
   * real frame rates would trigger the stall pause. Marks the run as debug (not a record).
   */
  debugAdvance(ticks: number): { ran: number; state: AppState } {
    if (!this.debug || !this.session) return { ran: 0, state: this.state };
    this.session.debugUsed = true;
    if (this.state === 'RECOVERING') { this.recoveryTimer = 0; this.frame(performance.now()); }
    const ran = this.runTicks(ticks);
    this.stream();
    return { ran, state: this.state };
  }

  /** DEBUG ONLY: skip the presentation countdown */
  debugSkipCountdown() { if (this.debug && this.state === 'READY') { this.beginCountdown(); this.countdown = 0.0001; } }

  private lastRouteRef: string[] | null = null;
  private lastStopIdx = -1;

  private afterTick(s: Session) {
    if (s.route !== this.lastRouteRef || s.stopIndex !== this.lastStopIdx) {
      this.lastRouteRef = s.route; this.lastStopIdx = s.stopIndex;
      this.updateRouteVisual();
    }
    // feedback for events in the latest tick
    for (const e of s.player.events) {
      if (e.type === 'launch') this.audio.launch();
      else if (e.type === 'launch_denied' || e.type === 'land_denied') { this.audio.deny(); this.input.discardEdges(); }
      else if (e.type === 'touchdown') { this.audio.land(); if (e.hard) this.view.shake = 0.25; this.vibrate(e.hard ? 40 : 15); }
      else if (e.type === 'contact' && e.severity === 'light') { this.audio.bump(); this.view.shake = 0.12; this.vibrate(20); }
      else if (e.type === 'descent' && e.auto) this.audio.warn();
    }
    if (s.phase === 'RECOVERING' && this.state === 'PLAYING') {
      this.state = 'RECOVERING';
      this.recoveryTimer = MISSION.recoveryPresentationSeconds;
      this.input.enabled = false; this.input.clearAll();
      this.audio.crash(); this.view.shake = 0.35; this.vibrate(80);
      this.hud.recovering(true, s.pendingRecovery?.reason ?? '');
    }
    if (s.phase === 'ENDED') { this.finish(); return; }
    if (this.tutorial && !this.manualClock && this.state === 'PLAYING') {
      const lesson = this.tutorial.check(s);
      if (lesson) { this.pause('tutorial'); this.screens.lesson(lesson.title, lesson.text); }
    }
  }

  private vibrate(ms: number) { if (this.settings.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* ignore */ } }

  private finish() {
    const s = this.session;
    if (!s) return;
    this.state = 'RESULTS';
    this.input.enabled = false; this.input.clearAll();
    this.audio.setDriving(false, 0, 0);
    this.store.clearCheckpoint();
    const r = s.results();
    this.lastResult = r;
    if (r.outcome.success) { this.audio.chime(); if (!s.mission.practice && !r.debugUsed) this.store.markCompleted(s.mission.id); }
    else this.audio.fail();
    const best = s.mission.practice ? { isBest: false, previous: null } : this.store.submitBest({ comparableKey: r.comparableKey, score: r.score, chargedSeconds: r.chargedSeconds, success: r.outcome.success, resumed: r.resumed, debugUsed: r.debugUsed });
    if (s.mission.practice && r.outcome.success) { this.settings.practiceDone = true; this.applySettings(); }
    this.hud.hide();
    this.screens.results(r, s.mission, best);
  }

  updateRouteVisual() {
    const s = this.session;
    if (!s) return;
    const pts: THREE.Vector3[] = [];
    for (const id of s.route.slice(s.routeIdx, s.routeIdx + 40)) {
      const e = this.world!.nav.edges.get(id)!;
      const r = this.world!.roads.roads.get(e.roadId)!;
      const ps = e.forward ? r.points : r.points.slice().reverse();
      const ys = e.forward ? r.pointElevM : r.pointElevM.slice().reverse();
      ps.forEach(([x, z], i) => pts.push(new THREE.Vector3(x, (ys[i] ?? 0) + 0.25, z)));
    }
    this.view.setRoute(pts);
    const stop = s.currentStop;
    this.view.setDeliveryMarker(stop ? stop.stopPolygon : null, stop ? this.world!.roads.surface(stop.entrance[0], stop.entrance[1], { preferRoadId: stop.roadId, margin: 20 })?.elevation ?? 0 : 0, stop?.id ?? null);
  }

  enableAutopilot() {
    if (!this.session) return;
    this.autopilot = new Autopilot(this.session, { useFlight: new URLSearchParams(location.search).has('fly') });
    this.session.debugUsed = true;
  }

  frameStats(): FrameStats {
    const a = this.frameTimes.slice().sort((x, y) => x - y);
    const q = (p: number) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
    return { samples: this.frameTimes.slice(), p50: q(0.5), p95: q(0.95), p99: q(0.99), fps: a.length ? 1000 / q(0.5) : 0 };
  }

  private debugInfo(): string {
    const s = this.session, f = this.frameStats(), st = this.view.stats;
    const mem = (performance as any).memory?.usedJSHeapSize;
    return [
      `state ${this.state} q=${this.quality}`,
      `frame p50 ${f.p50.toFixed(1)} p95 ${f.p95.toFixed(1)} p99 ${f.p99.toFixed(1)} ms`,
      `draws ${st.drawCalls} tris ${st.triangles} chunks ${st.chunks} actors ${st.actors}`,
      mem ? `heap ${(mem / 1048576).toFixed(0)} MB` : 'heap n/a',
      s ? `tick ${s.tick} move ${s.player.move} road ${s.player.roadId} lvl ${s.player.level}` : '',
      s ? `fuel ${s.player.ledger.consumedTicks}/${s.player.ledger.initialTicks} reserve ${s.player.reserveTicks} fc ${s.player.forecast.state}` : '',
      s ? `route ${s.route.length} idx ${s.routeIdx} rem ${s.routeRemainingM().toFixed(0)}m` : '',
    ].join('\n');
  }

  ticksToSeconds(t: number) { return t / SIM_HZ; }
}

import * as THREE from 'three';
import type { Engine } from '../core/engine';
import type { CoreData, CityPoi, XZ } from '../world/types';
import type { World, LoadedTile } from '../world/world';
import type { CityData } from '../world/city';
import { moodAt } from '../core/sky';
import { rng, hash } from '../core/util';
import { labelTexture } from '../world/signs';
import { Player, Input } from './player';
import { RoadGraph, GEdge, RoadRoute } from './roadgraph';
import { clearRoadGuidance, navigationReadout } from './route-guidance';
import { Traffic } from './traffic';
import { Hud, orderOfferHtml } from '../ui/hud';
import { eligiblePickup } from './pickups';
import { FullMap } from '../ui/map';
import { AreaPicker, AreaChoice } from '../ui/areapicker';
import { TitleScreen, goFullscreen, exitFullscreen, isFullscreen, canFullscreen } from '../ui/title';
import { loadSettings, settingsHtml, bindSettings, Settings } from '../ui/settings';
import { Walkers } from './walkers';
import { MetroTrains } from './metro';
import { RailTrains } from './rail';
import { Sound } from './audio';
import { supportAt } from './physics';
import { findClearStreetSpot, staticSolidAt, clearCameraPosition } from './spatial-safety';
import { LADDER, TheatreDef, Lease, Film, FILMS, makeSlate, simulateDay, PRICES, CAMPAIGNS, projection, CINEMA_CONST } from './cinema';

// the city opens up as you level: early orders stay in the neighbourhood, later ones cross Hyderabad
const LEVELS = [
  { n: 3, dmin: 150, dmax: 500 }, { n: 4, dmin: 300, dmax: 750 }, { n: 5, dmin: 450, dmax: 1000 },
  { n: 6, dmin: 600, dmax: 1400 }, { n: 8, dmin: 800, dmax: 2000 }, { n: 8, dmin: 1500, dmax: 3500 }, { n: 10, dmin: 2500, dmax: 6000 },
];
const DAY_SECONDS = 600;                    // one in-game day = 10 real minutes
const SAVE_KEY = 'p2ph-save-v1';
const TUT_KEY = 'p2ph-tutorial-v1';
const AREA_KEY = 'p2ph-area-v1';

interface Stop { x: number; z: number; y: number; label: string; sub: string }
interface Order { pickup: Stop; drop: Stop; pickupName: string; dist: number; limit: number; t: number; state: 'offer' | 'toPickup' | 'toDrop'; heat: number; slices: number }
interface TheatreSite { def: TheatreDef; poi: CityPoi; stop: Stop; poster: THREE.MeshBasicMaterial; posterTex: THREE.CanvasTexture | null; front?: THREE.Group }

// cinema name board: deep red panel, gold letters, a running border of bulbs
function marqueeTexture(text: string) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 200; const g = c.getContext('2d')!;
  g.fillStyle = '#5a0f18'; g.fillRect(0, 0, 1024, 200);
  g.fillStyle = '#2a0509'; g.fillRect(22, 22, 980, 156);
  for (let x = 14; x < 1024; x += 28) for (const y of [11, 189]) { g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); }
  for (let y = 39; y < 180; y += 28) for (const x of [11, 1013]) { g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); }
  let s = 112; g.font = `${s}px "Bungee", sans-serif`; while (g.measureText(text).width > 940 && s > 30) { s -= 4; g.font = `${s}px "Bungee", sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFD54F'; g.shadowColor = '#ff9a1f'; g.shadowBlur = 18; g.fillText(text, 512, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function fmtTime(min: number) { const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60); const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`; }

export class Game {
  metro!: MetroTrains; rail!: RailTrains; player!: Player; graph!: RoadGraph; traffic!: Traffic; hud!: Hud; walkers!: Walkers; map: FullMap | null = null; sound = new Sound();
  orbitYaw = 0; orbitPitch = 0.38; orbitDist = 0; dragging = false; halted = false;
  keys = new Set<string>(); flyQueued = false; actHeld = false; actTap = 0;
  coins = 500; level = 0; doneInLevel = 0; streak = 1; totalDelivered = 0;
  day = 1; minutes = 8 * 60; paused = false;
  order: Order | null = null; actProgress = 0;
  nextOfferAt: number | null = null;
  rotationWasBlocked = false;
  private mapKeyboardOpener = false;
  cinemaReport: { readyAt: number; html: string } | null = null;
  route: RoadRoute | null = null; routeT = 0; routeTarget: Stop | null = null;
  routeGuidanceBlocked = false;
  routeGuide: [number, number, number][] = [];
  gps = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color('#45E3D3').multiplyScalar(1.4), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
  beacon!: THREE.Group; theatres: TheatreSite[] = []; lease: Lease | null = null; slate: Film[] = [];
  camPos = new THREE.Vector3(); camLook = new THREE.Vector3(); clock = new THREE.Clock(); t = 0; moodT = 0;
  cameraPlacementRevision = -1;
  r = rng(Date.now() & 0xffff); food: (CityPoi & { s: Stop })[] = []; residences: Stop[] = [];
  constructor(public engine: Engine, public zone: CoreData, public city: World, public opts: { lowQ: boolean; still?: boolean }) {
    this.graph = new RoadGraph(zone.roads, []);
    this.player = new Player(city, engine.mats);
    this.player.addTo(engine.scene);
    this.traffic = new Traffic(this.graph, engine.scene, engine.mats, opts.lowQ ? 32 : 55, city.busStops);
    this.metro = new MetroTrains(zone.metro as any, { body: engine.mats.vBody, lights: engine.mats.vLight }); engine.scene.add(this.metro.group);
    this.rail = new RailTrains(engine.mats.vBody); engine.scene.add(this.rail.group);
    this.traffic.onHorn = (kind, x, z) => {
      const c = this.engine.camera, dx = x - c.position.x, dz = z - c.position.z;
      const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0);
      this.sound.horn(kind, Math.hypot(dx, dz), (dx * right.x + dz * right.z) / Math.max(8, Math.hypot(dx, dz)), Math.random() < 0.4);
    };
    this.walkers = new Walkers(city, engine.mats.vBody, opts.lowQ ? 24 : 60, (x, z, hx, hz) => {
      // at a signal, people cross while the traffic on this road has red
      const n = this.graph.nearestNode(x, z);
      if (!n || !n.signal || Math.hypot(n.x - x, n.z - z) > 30) return true;
      return !this.traffic.green(n, hx, hz);
    });
    engine.scene.add(this.walkers.group);
    this.gps.renderOrder = 3; this.gps.frustumCulled = false; engine.scene.add(this.gps);
    this.beacon = this.makeBeacon(); engine.scene.add(this.beacon);
    this.prepareStops();
    this.prepareTheatres();
    // streamed tiles plug their streets, footpaths, bus stops and cinema fronts into the game as they arrive
    for (const t of city.tiles.values()) this.tileAdded(t, false);
    city.onTileAdded = (t) => this.tileAdded(t, true);
    city.onTileRemoved = (t) => this.tileRemoved(t);
  }
  tileAdded(t: LoadedTile, paths: boolean) {
    this.graph.addRoads(t.built.roads, t.built.signals.map((s) => s.p));
    this.traffic.setBusStops(this.city.busStops);
    if (paths) this.walkers.addPaths(t.built.walkPaths);
    this.buildFronts();
  }
  tileRemoved(t: LoadedTile) {
    const gone = this.graph.removeRoads(t.built.roads.map((e) => e.id));
    this.traffic.dropEdges(gone);
    this.graph.forgetSignals(t.built.signals.map((s) => s.p));
    this.traffic.setBusStops(this.city.busStops);
    this.walkers.removePaths(t.built.walkPaths);
    for (const site of this.theatres) if (site.front && !this.city.theatreFacades.has(site.poi.id)) { this.engine.scene.remove(site.front); site.front = undefined; }
  }

  // ---------- world points ----------
  roadPointNear(x: number, z: number, toward?: XZ): Stop | null {
    let best: { x: number; z: number; y: number; e: GEdge; d: number } | null = null;
    for (const g of this.graph.nearestEdges(x, z, 1)) {
      if (['service', 'living_street'].includes(g.e.cls) && g.e.w < 5) continue;
      const P = g.e.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2));
        const px = P[i][0] + dx * u, pz = P[i][1] + dz * u, d = Math.hypot(px - x, pz - z);
        const y = g.e.elev ? g.e.elev[i] + (g.e.elev[i + 1] - g.e.elev[i]) * u : 0;
        if (y > 1) continue;
        if (!best || d < best.d) best = { x: px, z: pz, y, e: g, d };
      }
    }
    if (!best || best.d > 60) return null;
    let { x: px, z: pz } = best;
    if (toward) { const vx = toward[0] - px, vz = toward[1] - pz, L = Math.hypot(vx, vz) || 1; const off = Math.min(best.e.e.w / 2 - 1.2, L); if (off > 0) { px += (vx / L) * off; pz += (vz / L) * off; } }
    return { x: px, z: pz, y: best.y, label: best.e.e.name || '', sub: '' };
  }
  areaName(x: number, z: number) {
    // nearest named neighbourhood (Overture divisions); metro stations as a fallback
    let best = '', bd = 1e9;
    for (const p of this.zone.places || []) {
      if (/^Ward \d+/.test(p.name) || p.name === 'Hyderabad' || p.name === 'Greater Hyderabad') continue;
      const d = Math.hypot(p.p[0] - x, p.p[1] - z) * (p.kind === 'locality' ? 1.25 : 1);
      if (d < bd) { bd = d; best = p.name; }
    }
    if (best) return best;
    for (const s of this.zone.metro.stations) { const d = Math.hypot(s.p[0] - x, s.p[1] - z); if (d < bd) { bd = d; best = s.name; } }
    return best;
  }
  prepareStops() {
    const toStop = (st: [number, number, number, string], label: string, sub: string): Stop => ({ x: st[0], z: st[1], y: st[2], label, sub });
    // a "shop" whose board is only a place name ("RTC X Roads") is a mis-tagged listing, not a kitchen
    const placeNames = new Set(this.zone.places.map((p) => p.name.toLowerCase()).concat(['rtc x roads', 'rtc cross roads', 'hyderabad', 'secunderabad']));
    for (const f of this.zone.food) if (eligiblePickup(f, placeNames)) this.food.push({ ...f, s: toStop(f.stop, f.board, f.stop[3] ? `on ${f.stop[3]}` : '') });
    for (const d of this.zone.drops) this.residences.push(toStop(d, '', d[3]));
  }
  // the lease ladder: each rung is a real single screen, found among the city's cinema listings near its known location
  prepareTheatres() {
    const o = this.zone.origin, NR = 6380050.094, MR = 6341141.9;
    const KX = Math.cos((o.lat * Math.PI) / 180) * NR * Math.PI / 180, KZ = MR * Math.PI / 180;
    for (const def of LADDER) {
      const ax = (def.at[1] - o.lon) * KX, az = -(def.at[0] - o.lat) * KZ;
      let poi: CityPoi | null = null, bd = 900;
      for (const t of this.zone.theatres) {
        if (!def.match.test(t.name)) continue;
        const d = Math.hypot(t.stop[0] - ax, t.stop[1] - az);
        if (d < bd) { bd = d; poi = t; }
      }
      if (!poi) continue;
      const stop: Stop = { x: poi.stop[0], z: poi.stop[1], y: poi.stop[2], label: def.name, sub: `Theatre · ${def.area}` };
      const site: TheatreSite = { def, poi, stop, poster: new THREE.MeshBasicMaterial({ toneMapped: false }), posterTex: null };
      this.theatres.push(site);
      this.paintPoster(site);
    }
  }
  // build the canopy, name board and hoarding once the theatre's tile is loaded; complexes share a frontage
  buildFronts() {
    const fkey = (t: CityPoi) => `${Math.round(t.a![0])},${Math.round(t.a![1])},${Math.round(t.b![0])},${Math.round(t.b![1])}`;
    const shared = new Map<string, string[]>();
    for (const site of this.theatres) (shared.get(fkey(site.poi)) || shared.set(fkey(site.poi), []).get(fkey(site.poi))!).push(site.def.key);
    for (const site of this.theatres) {
      if (site.front) continue;
      const fac = this.city.theatreFacades.get(site.poi.id); if (!fac) continue;
      const poi = site.poi, group = shared.get(fkey(poi)) || [site.def.key], k = group.indexOf(site.def.key);
      if (group.length > 1) {
        const tx = poi.b![0] - poi.a![0], tz = poi.b![1] - poi.a![1], L = Math.hypot(tx, tz) || 1, len = Math.max(L, fac.w);
        const off = ((k + 0.5) / group.length - 0.5) * len;
        this.buildCinemaFront(site, { ...fac, c: fac.c.clone().add(new THREE.Vector3((tx / L) * off, 0, (tz / L) * off)), w: Math.max(8, (len / group.length) * 0.92) });
      } else this.buildCinemaFront(site, fac);
    }
  }
  buildCinemaFront(site: TheatreSite, fac: { c: THREE.Vector3; n: THREE.Vector3; w: number; top: number }) {
    const grp = new THREE.Group();
    const W = Math.max(7.5, Math.min(fac.w, 17)), n = fac.n.clone().setY(0).normalize();
    grp.position.copy(fac.c).setY(0); grp.lookAt(grp.position.clone().add(n));   // local +z = out of the facade
    const steel = new THREE.MeshStandardMaterial({ color: '#4a4652', roughness: 0.6, metalness: 0.5 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; grp.add(o); return o; };
    // canopy over the gate with a light strip under it
    box(W * 0.9, 0.35, 3.2, 0, 3.7, 1.6, new THREE.MeshStandardMaterial({ color: '#7a1d2a', roughness: 0.5 }));
    box(W * 0.86, 0.05, 0.25, 0, 3.5, 3.05, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe6b0').multiplyScalar(1.6), toneMapped: false }));
    for (const sx of [-1, 1]) box(0.35, 3.6, 0.35, sx * W * 0.42, 1.8, 3.0, steel);
    // name board with bulbs
    const name = site.def.name.toUpperCase();
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, 1.9), new THREE.MeshBasicMaterial({ toneMapped: false, map: marqueeTexture(name) }));
    nb.position.set(0, 4.95, 0.42); grp.add(nb);
    // hoarding on a steel frame (rises above low roofs, as cinema cut-outs do)
    const HW = W, HH = W * 0.5, y0 = 6.1;
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(HW, HH), site.poster);
    pm.position.set(0, y0 + HH / 2, 0.55); grp.add(pm);
    box(HW + 0.4, 0.25, 0.3, 0, y0 - 0.1, 0.4, steel); box(HW + 0.4, 0.25, 0.3, 0, y0 + HH + 0.1, 0.4, steel);
    for (const sx of [-0.5, -0.17, 0.17, 0.5]) box(0.2, HH + 0.5, 0.2, sx * HW, y0 + HH / 2, 0.3, steel);
    // floodlights on arms
    for (const sx of [-0.33, 0, 0.33]) {
      box(0.08, 0.08, 1.4, sx * HW, y0 + HH + 0.4, 1.0, steel);
      box(0.5, 0.25, 0.3, sx * HW, y0 + HH + 0.35, 1.7, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d8').multiplyScalar(2), toneMapped: false }));
    }
    // ticket counter by the gate
    box(2.4, 2.2, 1.2, -W * 0.3, 1.1, 0.9, new THREE.MeshStandardMaterial({ color: '#d9cdb5', roughness: 0.8 }));
    const tk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ toneMapped: false, map: labelTexture([{ text: 'TICKETS', font: '{s}px "Bungee", sans-serif', color: '#ffffff', size: 70 }], 512, 128, '#B3202A', '#FFB627') }));
    tk.position.set(-W * 0.3, 2.45, 1.52); grp.add(tk);
    this.engine.scene.add(grp);
    site.front = grp;
  }
  paintPoster(site: TheatreSite) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d')!;
    const leased = this.lease && this.lease.theatre === site.def.key && !this.lease.done ? this.lease.film : null;
    if (leased) {
      const [a, b] = leased.colors;
      const gr = g.createLinearGradient(0, 0, 1024, 512); gr.addColorStop(0, a); gr.addColorStop(1, '#0c0a1a'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
      // rays behind the hero
      g.save(); g.translate(300, 300); g.fillStyle = b; g.globalAlpha = 0.16;
      for (let i = 0; i < 14; i++) { g.rotate(Math.PI / 7); g.beginPath(); g.moveTo(0, 0); g.lineTo(700, -40); g.lineTo(700, 40); g.fill(); }
      g.restore(); g.globalAlpha = 1;
      // hero cut-out silhouette
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.beginPath(); g.arc(300, 150, 62, 0, 7); g.fill();
      g.beginPath(); g.moveTo(190, 512); g.quadraticCurveTo(200, 250, 300, 225); g.quadraticCurveTo(400, 250, 420, 512); g.fill();
      g.beginPath(); g.moveTo(390, 270); g.lineTo(520, 180); g.lineTo(535, 200); g.lineTo(410, 300); g.fill();   // raised arm
      g.fillStyle = b; g.textAlign = 'left';
      g.font = '30px "Bungee", sans-serif'; g.fillText('NOW SHOWING', 560, 80);
      let s = 92; g.font = `${s}px "Bungee", sans-serif`; while (g.measureText(leased.title.toUpperCase()).width > 440 && s > 30) { s -= 2; g.font = `${s}px "Bungee", sans-serif`; }
      g.fillText(leased.title.toUpperCase(), 560, 230);
      g.font = '700 46px "Noto Sans Telugu", sans-serif'; g.fillText(leased.te, 560, 300);
      g.fillStyle = '#F6EEDC'; g.font = '800 30px "Baloo 2", sans-serif'; g.fillText(leased.tagline, 560, 360);
      g.fillStyle = b; g.font = '800 30px "Baloo 2", sans-serif'; g.fillText(`${leased.genre} · ${'★'.repeat(leased.star)}`, 560, 420);
    } else {
      g.fillStyle = '#1E1937'; g.fillRect(0, 0, 1024, 512);
      g.strokeStyle = '#FFB627'; g.lineWidth = 10; g.setLineDash([26, 16]); g.strokeRect(24, 24, 976, 464); g.setLineDash([]);
      g.fillStyle = '#FFB627'; g.textAlign = 'center';
      g.font = '96px "Bungee", sans-serif'; g.fillText('FOR LEASE', 512, 200);
      g.font = '800 52px "Baloo 2", sans-serif'; g.fillStyle = '#F6EEDC'; g.fillText(`${site.def.name} · ${site.def.lease.toLocaleString('en-IN')} coins / week`, 512, 300);
      g.font = '700 38px "Baloo 2", sans-serif'; g.fillStyle = '#CFC6E4'; g.fillText('Deliver pizzas, lease this screen, release your film', 512, 380);
    }
    site.posterTex?.dispose();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; site.posterTex = tex;
    site.poster.map = tex; site.poster.needsUpdate = true;
  }
  makeBeacon() {
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB627').multiplyScalar(1.6), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    col.position.y = 30; g.add(col);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB627').multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    g.visible = false; (g as any).col = col; (g as any).ring = ring;
    return g;
  }

  // ---------- persistence ----------
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: this.coins, level: this.level, doneInLevel: this.doneInLevel, day: this.day, minutes: this.minutes, lease: this.lease, total: this.totalDelivered })); } catch { /* storage unavailable */ }
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!s || typeof s !== 'object' || Array.isArray(s)) return;
      const num = (v: unknown, fallback: number, min: number, max: number, integer = true) =>
        typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fallback;
      this.coins = num(s.coins, 500, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      this.level = num(s.level, 0, 0, LEVELS.length - 1);
      this.doneInLevel = num(s.doneInLevel, 0, 0, this.level === LEVELS.length - 1 ? Number.MAX_SAFE_INTEGER : LEVELS[this.level].n - 1);
      this.day = num(s.day, 1, 1, Number.MAX_SAFE_INTEGER);
      this.minutes = num(s.minutes, 480, 0, 1439.999999, false);
      this.totalDelivered = num(s.total, 0, 0, Number.MAX_SAFE_INTEGER);
      this.lease = validSavedLease(s.lease, this.theatres.map((t) => t.def.key)) ? s.lease : null;
      if (this.lease?.days.length === 7) this.lease.done = true;
    } catch { /* corrupt or blocked storage: start fresh */ }
  }

  // ---------- orders ----------
  makeOffer(): Order | null {
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    const px = this.player.pos.x, pz = this.player.pos.z;
    let near: typeof this.food = [];
    for (const R of [380, 800, 1600, 3200, 8000]) { near = this.food.filter((f) => { const d = Math.hypot(f.s.x - px, f.s.z - pz); return d > 40 && d < R; }); if (near.length >= 3) break; }
    const pool = near.length ? near : this.food;
    const pizzaFirst = pool.filter((f) => f.pizza);
    const choices = pizzaFirst.length && this.r() < 0.45 ? pizzaFirst : pool;
    const pick = choices[Math.floor(this.r() * choices.length)];
    if (!pick) return null;
    const p = pick.s;
    const drops = this.residences.filter((d) => { const dd = Math.hypot(d.x - p.x, d.z - p.z); return dd > L.dmin && dd < L.dmax; });
    if (!drops.length) return null;
    const d = drops[Math.floor(this.r() * drops.length)];
    const rt = this.graph.route(p.x, p.z, d.x, d.z);
    const dist = rt ? rt.len : Math.hypot(d.x - p.x, d.z - p.z) * 1.3;
    const drop: Stop = { ...d, label: `Home in ${this.areaName(d.x, d.z)}`, sub: d.label ? `off ${d.label}` : '' };
    const pickup: Stop = { ...p, label: pick.board, sub: p.sub };
    return { pickup, drop, pickupName: pick.name, dist, limit: dist / 7 + 45, t: 0, state: 'offer', heat: 100, slices: 8 };
  }
  queueOffer(delayMs: number, now = performance.now()) {
    this.nextOfferAt = now + delayMs;
  }
  tickOfferQueue(now = performance.now()) {
    if (this.nextOfferAt == null) return;
    if (this.order) { this.nextOfferAt = null; return; }
    // Keep a due offer pending while any overlay owns input. Resume/map close
    // will service it on the next frame rather than discard a one-shot timer.
    if (now < this.nextOfferAt || this.paused || this.hud.modalOpen || this.hud.rotationBlocked || this.map?.open || this.choosing || this.relocating) return;
    this.showOffer();
    if (!this.order) this.nextOfferAt = now + 1000; // bounded retry if no valid route could be generated
  }
  showOffer() {
    // A delayed offer callback must not replace an accepted delivery or appear over area selection.
    if (this.paused || this.hud.modalOpen || this.hud.rotationBlocked || this.map?.open || this.choosing || this.relocating || (this.order && this.order.state !== 'offer')) return;
    // Reopening a cancelled area picker restores the same offer, including its route and pay.
    let o: Order | null = this.order;
    const restored = !!o;
    for (let k = 0; k < 6 && !o; k++) o = this.makeOffer();
    if (!o) return;
    this.order = o; this.nextOfferAt = null;
    if (!restored) this.sound.cue('offer');
    const pay = Math.round(35 + o.dist * 0.07);
    const P = this.player.pos, f = this.player.forward;
    const approach = this.graph.route(P.x, P.z, o.pickup.x, o.pickup.z, this.player.flying ? undefined : { hx: f.x, hz: f.z, y: P.y });
    this.hud.offer(orderOfferHtml({ level: this.level + 1, pickupName: o.pickup.label, pickupRoad: o.pickup.sub || '',
      customerName: o.drop.label, approachMetres: approach?.len ?? null, approachEstimated: approach?.complete === false,
      deliveryMetres: o.dist, deliverySeconds: o.limit, basePay: pay }),
      [{ label: document.documentElement.classList.contains('is-touch') ? 'Accept' : 'Accept (E)', cls: 'go', fn: () => this.acceptOffer() }, { label: 'Another', cls: 'alt', fn: () => { this.order = null; this.hud.offer(null); this.showOffer(); } }]);
  }
  acceptOffer() {
    if (!this.order || this.order.state !== 'offer') return;
    this.order.state = 'toPickup'; this.hud.offer(null); this.setTarget(this.order.pickup, '#FFB627');
    this.sound.cue('accept');
    this.hud.toast('Order accepted!', 'teal');
  }
  routeColor = '#FFB627';
  setTarget(s: Stop | null, color = '#FFB627') {
    this.routeTarget = s; this.routeT = 0; this.route = null;
    this.routeGuide = []; this.routeGuidanceBlocked = false;
    this.beacon.visible = !!s; this.routeColor = color;
    (this.gps.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(1.4);       // the road line matches the marker
    if (s) {
      this.beacon.position.set(s.x, s.y, s.z);
      const c = new THREE.Color(color).multiplyScalar(1.7);
      ((this.beacon as any).col.material as THREE.MeshBasicMaterial).color.copy(c);
      ((this.beacon as any).ring.material as THREE.MeshBasicMaterial).color.copy(c);
    }
  }
  completeDelivery() {
    const o = this.order; if (!o || o.state !== 'toDrop') return;
    const tier = o.heat >= 70 ? 1.5 : o.heat >= 40 ? 1.0 : o.heat > 0 ? 0.5 : 0;
    const fare = Math.round(35 + o.dist * 0.07);
    const tip = Math.round(fare * tier * (o.slices / 8) * this.streak);
    const total = o.slices > 0 ? fare + tip : Math.round(fare * 0.3);
    this.coins += total; this.totalDelivered++;
    this.sound.cue('delivery');
    this.streak = tier >= 1.5 && o.slices >= 6 ? Math.min(2, +(this.streak + 0.2).toFixed(1)) : 1;
    const line = tier >= 1.5 ? 'Ekdum garam! Mast hai bhai.' : tier >= 1 ? 'Hau, theek hai. Thanks!' : 'Kya re, pizza thanda hai!';
    this.hud.toast(`+${total} coins · "${line}"`, tier >= 1 ? '' : 'pink');
    this.doneInLevel++;
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    if (this.doneInLevel >= L.n && this.level < LEVELS.length - 1) { this.level++; this.doneInLevel = 0; setTimeout(() => this.hud.toast(`Level ${this.level + 1} unlocked!`, 'teal'), 2000); }
    this.player.chargeCap = 20 + this.level * 2.5;
    this.order = null; this.setTarget(null); this.save();
    this.queueOffer(2500);
  }

  // ---------- cinema ----------
  currentTheatreNear() {
    for (const s of this.theatres) if (this.canInteractAt(s.stop, 9)) return s;
    return null;
  }
  canInteractAt(stop: Stop, radius: number) {
    const p = this.player;
    return !p.flying && !p.descending && !p.glide && Math.abs(p.speed) < 2.5 &&
      Math.abs(p.pos.y - stop.y) < 3 && Math.hypot(stop.x - p.pos.x, stop.z - p.pos.z) < radius;
  }
  resetInput() {
    this.keys.clear(); this.flyQueued = false; this.actHeld = false; this.actTap = 0; this.actProgress = 0; this.dragging = false;
    this.hud?.resetControls();
    this.sound.vehicle({ speed: 0, throttle: 0, flying: false, active: false });
  }
  resume() {
    this.resetInput(); this.paused = false; this.hud.modal(null); this.clock.getDelta();
    this.engine.renderer.domElement.focus({ preventScroll: true });
  }
  openTheatres() {
    if (this.map?.open || this.choosing) return;
    this.resetInput();
    const leased = this.lease && !this.lease.done ? this.lease : null;
    const rows = this.theatres.map((s, i) => {
      const status = leased?.theatre === s.def.key ? `Running “${esc(leased.film.title)}” · day ${leased.days.length}/7` : leased ? 'One lease at a time' : this.coins >= s.def.lease ? 'Affordable now' : `Need ${(s.def.lease - this.coins).toLocaleString('en-IN')} more coins`;
      const d = Math.round(Math.hypot(s.stop.x - this.player.pos.x, s.stop.z - this.player.pos.z));
      return `<button type="button" class="opt" data-i="${i}"><span class="big">${esc(s.def.name)}</span><span class="sm">${s.def.seats} seats · ${s.def.lease.toLocaleString('en-IN')} coins / week · ${d} m away</span><span class="sm" style="color:var(--saffron)">${status}</span><span class="sm">Tap to set GPS · sign the lease at the theatre gate</span></button>`;
    }).join('');
    const hist = leased ? leased.days.map((r) => `<div class="sm">Day ${r.day}: ${r.tickets.toLocaleString('en-IN')} tickets (${Math.round(r.occupancy * 100)}%) · ₹${r.gross.toLocaleString('en-IN')} gross · <b style="color:${r.coins >= 0 ? 'var(--teal)' : 'var(--pink)'}">${r.coins >= 0 ? '+' : ''}${r.coins} coins</b> · ${esc(r.note)}</div>`).join('') : '';
    this.hud.modal(`<h2>Theatres</h2><div class="sm">You have <b>${this.coins.toLocaleString('en-IN')}</b> coins. Lease a single screen for a week, release a film, and earn your share every night. Seat counts and prices are game values; all films are fictional.</div>
      ${leased ? `<div class="card"><div class="k">This week</div>${hist || '<div class="sm">Your film releases at midnight. Collections arrive every night.</div>'}</div>` : ''}
      <div class="grid2">${rows}</div><button type="button" class="btn alt" id="close">Close</button>`, (sh) => {
      sh.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        if (this.order && this.order.state !== 'offer') { this.hud.toast('Finish this delivery before setting theatre GPS.', 'pink'); return; }
        const s = this.theatres[+(b as HTMLElement).dataset.i!];
        this.hud.offer(null); this.order = null; this.nextOfferAt = null; this.setTarget(s.stop, '#FF8FB1');
        this.resume(); this.hud.toast(`GPS set: ${s.def.name}`, 'teal');
      }));
      sh.querySelector('#close')!.addEventListener('click', () => this.resume());
    });
  }
  openLease(site: TheatreSite) {
    this.resetInput();
    if (!this.order) { this.setTarget(null); this.queueOffer(2500); }
    if (this.lease && !this.lease.done) { this.openTheatres(); return; }
    this.slate = makeSlate(this.day * 97 + hash(site.def.key));
    let fi = 0, price = 150, shows = 4, camp = 0;
    const render = () => {
      const f = this.slate[fi]; const c = CAMPAIGNS[camp]; const cost = site.def.lease + c.cost;
      const proj = projection(site.def, f, price, shows);
      this.hud.modal(`<h2>${esc(site.def.name)}</h2><div class="sm">${site.def.seats} seats · lease ${site.def.lease.toLocaleString('en-IN')} coins for 7 days · you keep ${Math.round(CINEMA_CONST.THEATRE_SHARE * 100)}% of the gross minus running costs</div>
        <div class="k">Pick a film (fictional)</div>
        <div class="grid2">${this.slate.map((s, i) => `<button type="button" class="opt" data-f="${i}" aria-pressed="${i === fi}"><span class="big">${esc(s.title)}</span><span class="sm">${esc(s.te)}</span><span class="sm">${esc(s.genre)} · star power ${'★'.repeat(s.star)}${'☆'.repeat(5 - s.star)}</span><span class="sm">${esc(s.tagline)}</span></button>`).join('')}</div>
        <div class="k">Ticket price</div><div class="seg">${PRICES.map((p) => `<button type="button" class="opt" data-p="${p}" aria-pressed="${p === price}">₹${p}</button>`).join('')}</div>
        <div class="k">Shows per day</div><div class="seg">${[3, 4, 5].map((n) => `<button type="button" class="opt" data-s="${n}" aria-pressed="${n === shows}">${n}</button>`).join('')}</div>
        <div class="k">Publicity</div><div class="seg">${CAMPAIGNS.map((cc, i) => `<button type="button" class="opt" data-c="${i}" aria-pressed="${i === camp}">${cc.label}${cc.cost ? ` · ${cc.cost}` : ''}</button>`).join('')}</div>
        <div class="card"><div class="sm">Opening-day forecast: about <b>${Math.round(proj * 100)}%</b> full before reviews. Word of mouth decides the rest of the week.</div><div class="big">Total today: ${cost.toLocaleString('en-IN')} coins (you have ${this.coins.toLocaleString('en-IN')})</div></div>
        <div style="display:flex;gap:8px"><button type="button" class="btn go" id="sign" ${this.coins < cost ? 'disabled style="opacity:.5"' : ''}>Sign lease &amp; release</button><button type="button" class="btn alt" id="close">Not now</button></div>`, (sh) => {
        sh.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { fi = +(b as HTMLElement).dataset.f!; render(); }));
        sh.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { price = +(b as HTMLElement).dataset.p!; render(); }));
        sh.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { shows = +(b as HTMLElement).dataset.s!; render(); }));
        sh.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { camp = +(b as HTMLElement).dataset.c!; render(); }));
        sh.querySelector('#close')!.addEventListener('click', () => this.hud.modal(null));
        sh.querySelector('#sign')!.addEventListener('click', () => {
          if (this.coins < cost || (this.lease && !this.lease.done)) return;
          this.coins -= cost;
          this.lease = { theatre: site.def.key, film: f, price, shows, campaign: c.id, startDay: this.day + 1, days: [], hype: 0.85 + f.star * 0.07 + c.hype, wom: 1, done: false };
          this.paintPoster(site); this.save(); this.hud.modal(null); this.sound.cue('lease');
          this.hud.toast(`${f.title} releases at midnight!`, 'teal');
        });
      });
    };
    render();
  }
  settleDay() {
    const l = this.lease; if (!l || l.done) return;
    const idx = this.day - l.startDay; if (idx < 0 || idx > 6 || l.days.length > idx) return;
    const site = this.theatres.find((s) => s.def.key === l.theatre); if (!site) return;
    const rep = simulateDay(l, site.def, idx, rng(hash(l.film.id) + this.day * 31));
    this.coins += rep.coins;
    this.hud.toast(`${site.def.name}: ${rep.tickets.toLocaleString('en-IN')} tickets, ${rep.coins >= 0 ? '+' : ''}${rep.coins} coins`, rep.coins >= 0 ? 'teal' : 'pink');
    if (idx === 6) {
      l.done = true;
      const total = l.days.reduce((a, d) => a + d.coins, 0);
      const cost = site.def.lease + (CAMPAIGNS.find((c) => c.id === l.campaign)?.cost || 0);
      const verdict = total - cost > cost * 0.6 ? 'BLOCKBUSTER' : total - cost > 0 ? 'HIT' : total - cost > -cost * 0.4 ? 'AVERAGE' : 'FLOP';
      this.cinemaReport = { readyAt: performance.now() + 2200, html: `<h2>${verdict}!</h2><div class="big">${esc(l.film.title)} at ${esc(site.def.name)}</div>
        <div class="sm">Week total ${total.toLocaleString('en-IN')} coins against ${cost.toLocaleString('en-IN')} spent: <b>${total - cost >= 0 ? 'profit' : 'loss'} of ${Math.abs(total - cost).toLocaleString('en-IN')} coins</b>.</div>
        ${l.days.map((r) => `<div class="sm">Day ${r.day}: ${r.tickets.toLocaleString('en-IN')} tickets · ${r.coins} coins · ${esc(r.note)}</div>`).join('')}
        <button type="button" class="btn go" id="close">Back to deliveries</button>` };
      this.paintPoster(site);
    }
    this.save();
  }
  tickCinemaReport(now = performance.now()) {
    const report = this.cinemaReport;
    if (!report || now < report.readyAt || document.hidden || this.paused || this.hud.modalOpen || this.hud.rotationBlocked || this.map?.open || this.choosing || this.relocating) return;
    this.cinemaReport = null;
    this.hud.modal(report.html, (sh) => sh.querySelector('#close')!.addEventListener('click', () => this.resume()));
  }

  // ---------- loop ----------
  start() {
    this.load();
    if (this.lease) { const site = this.theatres.find((s) => s.def.key === this.lease!.theatre); if (site) this.paintPoster(site); }
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.hud = new Hud(touch);
    this.hud.onInputReset = () => this.resetInput();
    this.settings = loadSettings();
    this.sound.setMuted(!this.settings.sound);
    if (touch && this.settings.steer === 'tilt') this.hud.enableTilt(true);
    this.hud.el['b-full'].hidden = !canFullscreen();
    try { this.tutStep = localStorage.getItem(TUT_KEY) ? -1 : 0; } catch { this.tutStep = -1; }
    this.hud.onButton = (id) => {
      if (this.hud.rotationBlocked) return;
      if (id === 'theatres') this.openTheatres();
      else if (id === 'pause') this.openPause();
      else if (id === 'rescue') this.rescue();
      else if (id === 'fullscreen') { if (isFullscreen()) exitFullscreen(); else goFullscreen(); }
      else if (id === 'tip-close') this.tipDismissed = this.tutStep;
      else if (id === 'fly') this.flyQueued = true;
      else if (id === 'act') { this.actTap = 1.2; if (this.order?.state === 'offer') this.acceptOffer(); }
    };
    addEventListener('keydown', (e) => this.handleKeyDown(e));
    // full map from the minimap
    this.map = new FullMap(this.hud.root, this.zone, () => ({
      player: this.area ? { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw } : null,
      canMove: !!this.area && (!this.order || this.order.state === 'offer'),
      route: this.route ? (this.routeGuidanceBlocked ? this.routeGuide : this.route.pts) : null,
      target: this.routeTarget ? { x: this.routeTarget.x, z: this.routeTarget.z, label: this.routeTarget.label } : null,
      theatres: this.theatres.map((t) => ({ x: t.stop.x, z: t.stop.z, name: t.def.name, leased: !!this.lease && !this.lease.done && this.lease.theatre === t.def.key })),
      pickups: this.food.map((f) => ({ x: f.s.x, z: f.s.z, pizza: !!f.pizza })),
    }), () => {
      this.resetInput();
      if (!this.choosing) {
        this.paused = false; this.clock.getDelta();
        // Pointer/map-shortcut players return to driving; explicit keyboard openers keep their navigation focus.
        if (!this.mapKeyboardOpener) this.engine.renderer.domElement.focus({ preventScroll: true });
      }
    }, { mapUrl: new URL('city/map.pack.wasm', location.href).href, buildings: () => this.city.loadedBuildings() });
    this.map.areaName = (x, z) => this.areaName(x, z);
    this.map.onMove = (x, z) => this.relocate({ name: this.areaName(x, z) || 'Hyderabad', x, z });
    // where to deliver: chosen at the start, changeable after any delivery
    this.picker = new AreaPicker(this.hud.root, this.zone);
    this.picker.onPick = (c) => this.relocate(c);
    this.picker.onMap = () => {
      this.choosing = true;
      this.map!.showPick({ onPick: (x, z) => this.relocate({ name: this.areaName(x, z) || 'Hyderabad', x, z }), onCancel: () => { this.map!.hide(); this.chooseArea(!this.area); } },
        this.area ? { x: this.area.x, z: this.area.z, scale: 0.12 } : { x: 0, z: 0, scale: 0.035 });
    };
    this.hud.el.minimap.addEventListener('click', () => this.openMap());
    this.hud.el.minimap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); this.openMap(true); }
    });
    // look around: drag on the scene while the car is stopped; scroll to move the camera in or out
    const cv = this.engine.renderer.domElement;
    cv.tabIndex = -1;
    let last: { x: number; y: number } | null = null;
    cv.addEventListener('pointerdown', (e) => { if (this.paused || this.choosing || this.map?.open || this.hud.modalOpen || this.hud.rotationBlocked) return; last = { x: e.clientX, y: e.clientY }; this.dragging = true; });
    addEventListener('pointerup', () => { last = null; this.dragging = false; });
    addEventListener('pointercancel', () => { last = null; this.dragging = false; });
    cv.addEventListener('pointermove', (e) => {
      if (!last || !this.dragging || this.hud.modalOpen) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
      if (Math.abs(this.player.speed) > 2 && !this.player.flying) return;
      this.orbitYaw -= dx * 0.008; this.orbitPitch = Math.max(0.05, Math.min(1.25, this.orbitPitch + dy * 0.005));
    });
    cv.addEventListener('wheel', (e) => { if (Math.abs(this.player.speed) < 2) { e.preventDefault(); this.orbitDist = Math.max(-4, Math.min(22, this.orbitDist + e.deltaY * 0.01)); } }, { passive: false });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyE') this.actHeld = false; });
    addEventListener('blur', () => this.background());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.background(); });
    addEventListener('pagehide', () => { this.resetInput(); this.save(); });
    this.player.chargeCap = 20 + this.level * 2.5;
    this.engine.camera.far = 900; this.engine.camera.updateProjectionMatrix();
    this.applyClockMood(true);
    // ?area=Uppal starts straight there (shareable links, tests); otherwise ask
    const want = new URLSearchParams(location.search).get('area');
    const hit = want ? [...this.picker.popular, ...this.picker.list].find((c) => c.name.toLowerCase() === want.toLowerCase()) : null;
    this.title = new TitleScreen(this.hud.root, touch);
    this.title.onPlay = () => { this.sound.unlock(); this.sound.cue('start'); if (touch && this.settings.steer === 'tilt') this.hud.enableTilt(true); this.chooseArea(true); };
    this.title.onSettings = () => this.openSettings(() => { this.hud.modal(null); this.title!.show(); });
    if (hit) this.relocate(hit); else { this.choosing = true; this.paused = true; this.title.show(); }
    const loop = () => { if (!this.halted) this.frame(); requestAnimationFrame(loop); };   // tests set halted and step frames themselves
    requestAnimationFrame(loop);
  }
  handleKeyDown(e: KeyboardEvent) {
    if (this.hud.rotationBlocked) return;
    if (e.repeat && ['Space', 'KeyT', 'KeyM', 'KeyN', 'KeyP', 'Escape', 'Backquote', 'Backslash'].includes(e.code)) return;
    if (this.map?.open) { this.map.handleKey(e); return; }
    if (this.choosing) return;
    if (this.hud.modalOpen && !['Escape', 'KeyP'].includes(e.code)) return;
    this.keys.add(e.code);
    if (e.code === 'Space') { this.flyQueued = true; e.preventDefault(); }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE') { this.actHeld = true; if (this.order?.state === 'offer') this.acceptOffer(); }
    if (e.code === 'KeyT') this.openTheatres();
    if (e.code === 'KeyM') { this.openMap(); return; }
    if (e.code === 'KeyH' && !e.repeat) this.sound.horn('car', 4, 0, true);
    if (e.code === 'KeyR' && !e.repeat) this.rescue();
    if (e.code === 'Backquote' || e.key === '`') { this.devOn = !this.devOn; this.hud.el.dev.hidden = !this.devOn; }
    if (e.code === 'Backslash' || e.key === '\\') { this.autopilot = !this.autopilot; this.hud.toast(this.autopilot ? 'Test autopilot ON' : 'Test autopilot off', 'teal'); }
    if (e.code === 'KeyN') {
      this.sound.setMuted(!this.sound.muted); this.settings.sound = !this.sound.muted;
      try { localStorage.setItem('p2ph-settings-v1', JSON.stringify(this.settings)); } catch { /* unavailable */ }
      this.hud.toast(this.sound.muted ? 'Sound off' : 'Sound on', 'teal');
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.hud.modalOpen) this.resume(); else this.openPause();
    }
  }
  background() {
    this.resetInput();
    if (this.area && !this.choosing && !this.paused && !this.hud.modalOpen && !this.map?.open) this.openPause();
  }
  openMap(keyboardOpener = false) {
    if (!this.map || this.hud.modalOpen || this.hud.rotationBlocked || this.choosing) return;
    this.mapKeyboardOpener = keyboardOpener;
    this.resetInput();
    this.paused = true; this.map.show();
  }

  // ---------- where to deliver ----------
  picker!: AreaPicker; area: AreaChoice | null = null; choosing = false; relocating = false;
  savedArea(): AreaChoice | null {
    try {
      const c = JSON.parse(localStorage.getItem(AREA_KEY) || 'null'), b = this.zone.bounds;
      return c && typeof c.name === 'string' && c.name.trim() && typeof c.x === 'number' && Number.isFinite(c.x) &&
        typeof c.z === 'number' && Number.isFinite(c.z) && c.x >= b[0] && c.x <= b[2] && c.z >= b[1] && c.z <= b[3] ? c : null;
    } catch { return null; }
  }
  chooseArea(first: boolean) {
    this.resetInput();
    if (!first && this.order && this.order.state !== 'offer') { this.resume(); this.hud.toast('Finish this delivery first!', 'pink'); return; }
    this.choosing = true; this.paused = true; this.hud.modal(null); this.hud.offer(null);
    this.picker.onClose = first ? null : () => { this.choosing = false; this.resume(); if (!this.order || this.order.state === 'offer') this.showOffer(); };
    this.picker.show({ first, last: first ? this.savedArea() : null, current: this.area?.name });
  }
  async relocate(c: AreaChoice) {
    if (this.relocating) return;
    this.resetInput();
    this.relocating = true; this.choosing = true; this.paused = true;
    if (this.map?.open) this.map.hide();
    this.picker.hide(); this.hud.offer(null); this.hud.modal(null);
    setLoading(`Loading ${c.name}…`);
    try { await this.city.ensure(c.x, c.z, 650); }
    catch (e) {
      console.error('relocate', e); setLoading(''); this.relocating = false;
      this.city.focus = [this.player.pos.x, this.player.pos.z];
      this.sound.cue('error');
      this.hud.toast('This area could not load. Check the connection and try again.', 'pink');
      this.chooseArea(!this.area);
      return;
    }
    if (!this.placeNear(c.x, c.z)) {
      setLoading(''); this.relocating = false;
      this.city.focus = [this.player.pos.x, this.player.pos.z];
      this.hud.toast('No clear street loaded here. Choose a nearby area.', 'pink');
      this.chooseArea(!this.area);
      return;
    }
    this.order = null; this.nextOfferAt = null; this.setTarget(null);
    // the old neighbourhood's traffic and people stay behind
    for (const car of this.traffic.cars) this.engine.scene.remove(car.g); this.traffic.cars.length = 0;
    for (const w of this.walkers.list) this.walkers.group.remove(w.g); this.walkers.list.length = 0;
    this.camPos.set(0, 0, 0); this.camLook.set(0, 0, 0); this.orbitYaw = 0; this.orbitDist = 0; this.busyT = 0;
    this.area = c;
    try { localStorage.setItem(AREA_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
    setLoading('');
    this.relocating = false; this.choosing = false; this.paused = false; this.clock.getDelta();
    this.hud.toast(`Welcome to ${c.name}!`, 'teal');
    (window as any).__game = this;                 // tests start once the first area is ready
    setTimeout(() => this.map?.build().catch(() => {}), 4000);   // the city map is ready before anyone opens it
    this.queueOffer(2200);
  }
  // A loaded ground street with room for the whole car and a clear forward exit.
  streetSpotNear(x: number, z: number): { x: number; z: number; y: number; yaw: number } | null {
    return findClearStreetSpot(this.graph, this.city, x, z, { heading: this.player.forward, vehicles: this.traffic.cars });
  }
  rescue() {
    if (this.player.glide) return;
    const P = this.player.pos, s = this.streetSpotNear(P.x, P.z);
    if (!s) { this.hud.toast('No clear street nearby yet. Try again once the area loads.', 'pink'); return; }
    this.player.glideTo(s.x, s.y, s.z, s.yaw); this.stuckT = 0; this.hud.rescue(false);
    this.hud.toast('Back to the street!', 'teal');
  }
  // stuck watch: pressing on without getting anywhere, or parked on a roof
  stuckT = 0; stuckRef: [number, number] = [0, 0];
  slowRef: [number, number] = [0, 0]; slowT = 0;
  watchStuck(dt: number, inp: Input) {
    const pl = this.player, P = pl.pos;
    if (pl.glide || pl.flying || this.paused) { this.stuckT = 0; this.hud.rescue(false); return; }
    const onRoof = pl.lastKind === 'roof';
    const trying = inp.throttle > 0 || inp.brake > 0 || Math.abs(inp.steer) > 0.3;
    if (Math.hypot(P.x - this.stuckRef[0], P.z - this.stuckRef[1]) > 4) { this.stuckRef = [P.x, P.z]; if (!onRoof) this.stuckT = 0; }
    else if (trying || onRoof) this.stuckT += dt;
    // shuffling back and forth in a tight spot never gets anywhere either: no 12 m of headway in 14 s of trying
    if (Math.hypot(P.x - this.slowRef[0], P.z - this.slowRef[1]) > 12) { this.slowRef = [P.x, P.z]; this.slowT = 0; }
    else if (inp.throttle > 0 && Math.abs(pl.speed) < 4) this.slowT += dt;
    const show = onRoof ? this.stuckT > 1.2 : this.stuckT > 3.5 || this.slowT > 14;
    this.hud.rescue(show, onRoof ? 'On a roof? Glide down to the street' : 'Stuck? Get back on the road');
    if (!onRoof && (this.stuckT > 9 || this.slowT > 26)) { this.slowT = 0; this.rescue(); }   // still wedged after a while: help without being asked
  }
  placeNear(x: number, z: number) {
    const p = findClearStreetSpot(this.graph, this.city, x, z, { preferMajor: true });
    if (!p) return false;
    this.player.place(p.x, p.z, p.yaw, p.y);
    return true;
  }
  openPause() {
    if (this.map?.open || this.choosing) return;
    this.resetInput();
    this.paused = true;
    this.hud.modal(`<h2>Paused</h2><div class="sm">Deliver pizzas around your area to earn coins; move anywhere in Hyderabad after a delivery (map → Deliver from here, or Change area below). Lease a theatre (T), pick a fictional film and watch the collections come in each night. Flight is unlimited: press Space / FLY to lift off, then press it again to land.</div>
      <div class="sm">Map and building data: © OpenStreetMap contributors (ODbL) via Overture Maps; business listings from Overture Maps Places (CDLA-Permissive 2.0) and Foursquare OS Places (Apache 2.0); building heights from Google Open Buildings / the Roadster repository. Shop names are shown as text only and remain the property of their owners.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn go" id="resume">Resume</button><button type="button" class="btn alt" id="area">Change area</button><button type="button" class="btn alt" id="unstick">Back to the road</button><button type="button" class="btn alt" id="settings">Settings</button><button type="button" class="btn alt" id="tut">Replay tips</button><button type="button" class="btn alt" id="reset">Reset progress</button></div>`, (sh) => {
      sh.querySelector('#resume')!.addEventListener('click', () => this.resume());
      sh.querySelector('#settings')!.addEventListener('click', () => this.openSettings(() => this.openPause()));
      sh.querySelector('#tut')!.addEventListener('click', () => { try { localStorage.removeItem(TUT_KEY); } catch { /* ignore */ } this.tutStep = 0; this.tipDismissed = -2; this.settings.tips = true; this.paused = false; this.hud.modal(null); this.clock.getDelta(); });
      sh.querySelector('#area')!.addEventListener('click', () => this.chooseArea(false));
      sh.querySelector('#unstick')!.addEventListener('click', () => { this.paused = false; this.hud.modal(null); this.clock.getDelta(); this.rescue(); });
      sh.querySelector('#reset')!.addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload(); });
    });
  }
  settings!: Settings; title: TitleScreen | null = null;
  openSettings(back: () => void) {
    this.resetInput();
    const touch = document.documentElement.classList.contains('is-touch');
    this.hud.modal(settingsHtml(this.settings, touch) + '<div style="display:flex;gap:8px"><button type="button" class="btn go" id="set-done">Done</button></div>', (sh) => {
      bindSettings(sh, this.settings, (st, k) => {
        if (k === 'quality') { setTimeout(() => location.reload(), 150); }
        else if (k === 'sound') this.sound.setMuted(!st.sound);
        else if (k === 'steer') this.hud.enableTilt(st.steer === 'tilt').then((ok) => { if (!ok) this.hud.toast('Tilt steering needs motion access', 'pink'); });
        else if (k === 'tips' && !st.tips) this.hud.tip(null);
      });
      sh.querySelector('#set-done')!.addEventListener('click', back);
    });
  }
  // first-delivery coaching: one tip at a time, following the order through its steps; done once per browser
  tutStep = -1; tipDismissed = -2; flewOnce = false;
  tutorialTick() {
    if (this.tutStep < 0 || !this.settings.tips || this.choosing) { if (this.tutStep >= 0 || !this.settings.tips) this.hud.tip(null); return; }
    const touch = document.documentElement.classList.contains('is-touch'), o = this.order, P = this.player.pos;
    const act = touch ? 'ACT' : 'E', fly = touch ? 'FLY' : 'Space';
    let step = this.tutStep, text: string | null = null;
    if (step <= 1 && o?.state === 'offer') { step = 1; text = touch ? 'A new order! Tap Accept to take it.' : 'A new order! Press E (or click Accept) to take it.'; }
    else if (o && o.state === 'toPickup') {
      const d = Math.hypot(o.pickup.x - P.x, o.pickup.z - P.z);
      if (d > 45) { step = 2; text = touch ? 'Hold GO and steer with the stick. Follow the orange line on the road and the minimap to the kitchen.' : 'Drive with W and steer with A / D. Follow the orange line on the road and the minimap to the kitchen.'; }
      else { step = 3; text = `Stop inside the glowing ring and hold ${act} to collect the pizza.`; }
    } else if (o && o.state === 'toDrop') {
      const d = Math.hypot(o.drop.x - P.x, o.drop.z - P.z);
      if (this.player.flying) this.flewOnce = true;
      if (d < 45) { step = 6; text = `Pull up in the teal ring and hold ${act} to hand the pizza over.`; }
      else if (!this.flewOnce) { step = 5; text = `Press ${fly} to lift off and fly over the traffic. Flight is unlimited; press it again to land.`; }
      else { step = 4; text = 'Now take it to the customer (teal). It cools down as time passes, and every bump costs a slice.'; }
    } else if (step >= 4 && !o) {
      step = -1; text = null;
      try { localStorage.setItem(TUT_KEY, '1'); } catch { /* ignore */ }
      this.hud.tip('Delivered! Open the map (tap the minimap or press M) to see the city, or lease a theatre with your coins.');
      setTimeout(() => this.hud.tip(null), 9000);
    }
    this.tutStep = step;
    if (step >= 0) this.hud.tip(this.tipDismissed === step ? null : text);
  }
  applyClockMood(force = false) {
    const m = moodAt((this.minutes / 60) % 24);
    this.engine.applyMood(m, { signs: (v) => this.city.signs.setEmissive(v) });
    void force;
  }
  // ---------- developer tools ----------
  devOn = false; autopilot = false; fpsN = 0; fpsT = 0; fps = 0; apStuck = 0; apLast: [number, number] = [0, 0]; apRev = 0;
  autoInput(): Input | null {
    const tgt = this.routeTarget, P = this.player.pos, f = this.player.forward, v = this.player.speed;
    if (!this.order || this.order.state === 'offer') { if (this.order?.state === 'offer') this.acceptOffer(); return { throttle: 0, brake: Math.abs(v) > 0.5 ? 1 : 0, steer: 0, flyPressed: false, boost: false }; }
    if (!tgt) return null;
    const dT = Math.hypot(tgt.x - P.x, tgt.z - P.z);
    if (dT < 7 || (dT < 24 && this.route && this.route.len > dT * 4 + 60)) { this.actTap = 1.2; return { throttle: 0, brake: Math.abs(v) > 0.4 ? 1 : 0, steer: 0, flyPressed: false, boost: false }; }
    let aim: [number, number] = [tgt.x, tgt.z];
    const pts = this.route?.pts;
    if (pts && pts.length > 1 && dT > 20) {
      let bi = 0, bd = 1e9; pts.forEach((p, i) => { const d = Math.hypot(p[0] - P.x, p[2] - P.z); if (d < bd) { bd = d; bi = i; } });
      let acc = 0, k = bi; const look = 8 + Math.abs(v) * 0.9;
      while (k < pts.length - 1 && acc < look) { acc += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][2] - pts[k][2]); k++; }
      aim = [pts[k][0], pts[k][2]];
    }
    const vx = aim[0] - P.x, vz = aim[1] - P.z, L = Math.hypot(vx, vz) || 1;
    const cross = (f.x * vz - f.z * vx) / L, dot = (f.x * vx + f.z * vz) / L;
    let steer = Math.max(-1, Math.min(1, cross * 2.2)); if (dot < 0) steer = cross >= 0 ? 1 : -1;
    // stuck: back up with opposite lock for a moment
    this.apStuck += 1 / 60; if (Math.hypot(P.x - this.apLast[0], P.z - this.apLast[1]) > 2) { this.apLast = [P.x, P.z]; this.apStuck = 0; }
    if (this.apStuck > 3) { this.apRev = 1.2; this.apStuck = 0; }
    if (this.apRev > 0) { this.apRev -= 1 / 60; return { throttle: 0, brake: 1, steer: -steer, flyPressed: false, boost: false }; }
    const want = dot < 0.5 ? 6 : dT < 30 ? 6 : 12;
    return { throttle: v < want ? 1 : 0, brake: v > want + 3 ? 1 : 0, steer, flyPressed: false, boost: false };
  }
  input(): Input {
    if (this.autopilot) { const a = this.autoInput(); if (a) { this.flyQueued = false; return a; } }
    const k = this.keys, h = this.hud;
    const inp: Input = {
      throttle: k.has('KeyW') || k.has('ArrowUp') || h.touchGas ? 1 : 0,
      brake: k.has('KeyS') || k.has('ArrowDown') || h.touchBrake ? 1 : 0,
      steer: Math.max(-1, Math.min(1, (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + h.steer)),
      flyPressed: this.flyQueued, boost: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
    this.flyQueued = false;
    return inp;
  }
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.hud.rotationBlocked && !this.rotationWasBlocked) this.resetInput();
    this.rotationWasBlocked = this.hud.rotationBlocked;
    this.tickCinemaReport();
    const active = !document.hidden && !this.paused && !this.hud.modalOpen && !this.hud.rotationBlocked && !this.map?.open && !this.choosing && !!this.area;
    this.sound.vehicle({ speed: this.player.speed, throttle: this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.hud.touchGas ? 1 : 0,
      flying: this.player.flying, descending: this.player.descending, active });
    this.tickOfferQueue();
    if (this.map?.open) { this.map.tick(dt); return; }
    if (!active) { this.engine.render(); return; }
    this.t += dt;
    // clock
    const before = this.minutes;
    this.minutes += dt * (1440 / DAY_SECONDS);
    if (Math.floor(before / 1440) !== Math.floor(this.minutes / 1440)) { this.minutes %= 1440; this.settleDay(); this.day++; this.save(); }
    if ((this.moodT -= dt) <= 0) { this.moodT = 0.5; this.applyClockMood(); }
    // player + traffic
    const inp = this.input();
    const wasFlying = this.player.flying;
    this.player.update(dt, inp, this.t);
    if (!wasFlying && this.player.flying) this.sound.cue('flight');
    this.watchStuck(dt, inp);
    const P = this.player.pos;
    this.city.update(P.x, P.z, dt);
    if ((this.busyT -= dt) <= 0) { this.busyT = 1; this.setStreetLife(P.x, P.z); }
    this.traffic.update(dt, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: this.player.speed }, this.walkers.list);
    this.metro.update(dt, P.x, P.z);
    this.rail.update(dt, P.x, P.z, this.city.rails);
    const fw = this.player.forward;
    this.walkers.update(dt, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: this.player.speed, fx: fw.x, fz: fw.z });
    const hit = this.player.flying ? null : this.traffic.hitTest(P.x, P.y, P.z, 1.1);
    if (!this.player.flying) this.traffic.pushOut(P, 0.75, 1.6);
    if (hit && this.player.hitCooldown <= 0) {
      this.sound.cue('bump');
      this.player.hitCooldown = 1.5; this.player.speed *= 0.35; this.player.bump = 0.6;
      if (this.order && this.order.state === 'toDrop') { this.order.slices = Math.max(0, this.order.slices - 1); this.streak = 1; this.hud.toast(this.order.slices ? 'Baigan! −1 slice' : 'Pizza ruined!', 'pink'); }
      else this.hud.toast('Arre! Watch the ' + (hit.kind.startsWith('bike') ? 'bike' : hit.kind === 'auto' ? 'auto' : 'traffic') + '!', 'pink');
    }
    // order flow
    const o = this.order;
    let promptText: string | null = null;
    if (o && o.state !== 'offer') {
      o.t += dt;
      if (o.state === 'toDrop') o.heat = Math.max(0, 100 - (o.t / (o.limit * 1.25)) * 100);
      const tgt = o.state === 'toPickup' ? o.pickup : o.drop;
      const d = Math.hypot(tgt.x - P.x, tgt.z - P.z);
      // right at the ring, or stopped just across a divided road from it (the rider walks over instead of a long U-turn)
      const across = d < 24 && !!this.route && this.route.len > d * 4 + 60;
      if (this.canInteractAt(tgt, across ? 24 : 8)) {
        const holding = this.actHeld || this.actTap > 0;
        this.actProgress = holding ? Math.min(1, this.actProgress + dt / 0.9) : Math.max(0, this.actProgress - dt);
        promptText = o.state === 'toPickup' ? (holding ? 'Collecting the pizza…' : `Hold E / ACT to collect the pizza${across ? ' (walk across the road)' : ''}`) : (holding ? 'Handing over…' : `Hold E / ACT to hand over${across ? ' (walk across the road)' : ''}`);
        if (this.actProgress >= 1) {
          this.actProgress = 0;
          if (o.state === 'toPickup') { o.state = 'toDrop'; o.t = 0; o.heat = 100; this.setTarget(o.drop, '#45E3D3'); this.hud.toast('Pizza collected! Garam garam.', ''); this.sound.cue('pickup'); }
          else this.completeDelivery();
        }
      } else this.actProgress = 0;
    }
    this.actTap = Math.max(0, this.actTap - dt);
    // theatre gate
    const th = this.currentTheatreNear();
    if (!promptText && th && Math.abs(this.player.speed) < 2.5) {
      const holding = this.actHeld || this.actTap > 0;
      promptText = `Hold E / ACT: talk to the ${th.def.name} manager`;
      if (holding) { this.actProgress += dt / 0.6; if (this.actProgress >= 1) { this.actProgress = 0; this.actHeld = false; this.actTap = 0; this.openLease(th); } }
      else this.actProgress = 0;
    }
    else if (!promptText) this.actProgress = 0;
    this.hud.prompt(promptText, this.actProgress);
    // gps
    this.updateRoute(dt);
    // camera: chase cam that the player can swing around while stopped; it never ends up inside a building or vehicle
    if (this.cameraPlacementRevision !== this.player.placementRevision) {
      this.cameraPlacementRevision = this.player.placementRevision;
      this.camPos.set(0, 0, 0); this.camLook.set(0, 0, 0);
      this.orbitYaw = 0; this.orbitPitch = 0.38; this.orbitDist = 0;
    }
    const f = this.player.forward;
    const air = this.player.pos.y - (this.player.lastSupport + 0.55) > 2;
    const moving = Math.abs(this.player.speed) > 2 || air;
    if (moving && !this.dragging) { const k2 = 1 - Math.exp(-dt * 1.8); this.orbitYaw *= 1 - k2; this.orbitPitch += (0.38 - this.orbitPitch) * k2; this.orbitDist *= 1 - k2; }
    const back = 7.6 + Math.abs(this.player.speed) * 0.06 + (air ? 4 : 0) + this.orbitDist;
    const cy = Math.cos(this.orbitYaw), sy = Math.sin(this.orbitYaw);
    const bx = f.x * cy - f.z * sy, bz = f.x * sy + f.z * cy;          // camera looks along the rotated forward
    const pitch = air ? 0.62 : this.orbitPitch;
    const hd = back * Math.cos(pitch) / Math.cos(0.38), up = 0.4 + back * Math.sin(pitch) * 0.95;
    const pivot = new THREE.Vector3(P.x, P.y + 1.4, P.z);
    let desired = new THREE.Vector3(P.x - bx * hd, P.y + up, P.z - bz * hd);
    desired = this.clearCamera(pivot, desired);
    const k = 1 - Math.exp(-dt * (this.dragging ? 14 : 5));
    if (!this.camPos.lengthSq()) this.camPos.copy(desired); else this.camPos.lerp(desired, k);
    // if the smoothed camera would sit inside something, snap to the clear point
    if (this.insideSolid(this.camPos)) this.camPos.copy(desired);
    // and if a building corner comes between the lagging camera and the car (turning in a narrow lane), pull it in
    else { const vis = this.clearCamera(pivot, this.camPos); if (vis.distanceToSquared(this.camPos) > 0.01) this.camPos.copy(vis); }
    const look = moving && Math.abs(this.orbitYaw) < 0.3 ? new THREE.Vector3(P.x + f.x * 20, P.y + 1.2, P.z + f.z * 20) : pivot.clone();
    if (!this.camLook.lengthSq()) this.camLook.copy(look); else this.camLook.lerp(look, k);
    const cam = this.engine.camera;
    cam.position.copy(this.camPos);
    if (this.player.bump > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.player.bump, (Math.random() - 0.5) * this.player.bump, 0));
    cam.lookAt(this.camLook);
    cam.fov = 60 + Math.abs(this.player.speed) * 0.3; cam.updateProjectionMatrix();
    this.traffic.hideNear(cam.position, P);
    this.engine.placeSun(new THREE.Vector3(P.x + f.x * 30, 0, P.z + f.z * 30));
    this.placeLampLights();
    this.city.signs.update(P.x, P.z);
    if (this.beacon.visible) { const s = 1 + Math.sin(this.t * 3) * 0.08; (this.beacon as any).ring.scale.setScalar(s); }
    this.engine.render();
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) { this.updateHud(); this.tutorialTick(); }
    // stats overlay (real frame rate, not game time)
    this.fpsN++; const now = performance.now();
    if (now - this.fpsT > 1000) {
      this.fps = Math.round((this.fpsN * 1000) / (now - this.fpsT)); this.fpsN = 0; this.fpsT = now;
      if (this.devOn) {
        const r = this.engine.renderer.info, w = this.city; let verts = 0; for (const t of w.tiles.values()) verts += t.built.counts.verts;
        const mem = (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1e6) + ' MB' : 'n/a';
        this.hud.el.dev.textContent = `${this.fps} fps · ${r.render.calls} draws · ${Math.round(r.render.triangles / 1000)}k tris\ntiles ${w.tiles.size} (+${w.pending.size}) · ${Math.round(verts / 1000)}k verts · heap ${mem}\ncars ${this.traffic.cars.length}/${this.traffic.max} · people ${this.walkers.list.length}/${this.walkers.max} · busy ${this.busy.toFixed(2)}\n${this.area?.name || ''} · ${this.areaName(this.player.pos.x, this.player.pos.z)}${this.autopilot ? ' · AUTOPILOT' : ''}`;
      }
    }
  }
  // street life follows the place: shop rows and markets get crowds and dense traffic, colonies stay calm,
  // and arterials keep their traffic even where nobody shops
  busyT = 0; busy = 0;
  setStreetLife(x: number, z: number) {
    const shops = this.city.busyAt(x, z);
    let road = 0;
    for (const g of this.graph.nearestEdges(x, z, 2)) {
      const c = g.e.cls;
      road = Math.max(road, /motorway|trunk|primary/.test(c) ? 0.75 : /secondary/.test(c) ? 0.55 : /tertiary/.test(c) ? 0.35 : 0.1);
    }
    this.busy = shops;
    const low = this.opts.lowQ;
    this.traffic.max = Math.round((low ? 16 : 26) + (low ? 18 : 38) * Math.max(shops, road));
    this.walkers.max = Math.round((low ? 6 : 12) + (low ? 22 : 70) * shops + (low ? 4 : 8) * road);
  }
  // Camera volume against buildings, landmark piers, poles, walls and decks.
  insideSolid(p: THREE.Vector3) {
    return staticSolidAt(this.city, p);
  }
  // walk from the car toward the wanted camera spot and stop before the first solid thing
  clearCamera(from: THREE.Vector3, to: THREE.Vector3) {
    const p = clearCameraPosition(this.city, from, to);
    return new THREE.Vector3(p.x, p.y, p.z);
  }
  lampT = 0;
  placeLampLights() {
    if ((this.lampT -= 1) > 0) return; this.lampT = 20;
    const P = this.player.pos;
    const near = this.city.lamps.filter((l) => Math.abs(l.x - P.x) < 70 && Math.abs(l.z - P.z) < 70).sort((a, b) => a.distanceTo(P) - b.distanceTo(P));
    this.engine.lampLights.forEach((L, i) => { const p = near[i]; if (p) L.position.copy(p); else L.position.set(0, -200, 0); });
  }
  updateRoute(dt: number) {
    const tgt = this.routeTarget; const P = this.player.pos;
    if (!tgt) { this.gps.visible = false; return; }
    this.routeT -= dt;
    if (this.routeT <= 0) {
      // long cross-city routes are refreshed less often (A* over the whole main-road network)
      this.routeT = this.route && this.route.len > 3000 ? 4 : 1.5;
      const f = this.player.forward;
      this.route = this.graph.route(P.x, P.z, tgt.x, tgt.z, this.player.flying ? undefined : { hx: f.x, hz: f.z, y: P.y });
      const guidance = clearRoadGuidance(this.city, this.route?.pts || []);
      this.routeGuidanceBlocked = guidance.blocked;
      this.routeGuide = guidance.pts;
      // ribbon geometry along the first ~700 m
      const pos: number[] = [];
      if (this.route) {
        let acc = 0; const pts = guidance.pts;
        for (let i = 0; i < pts.length - 1 && acc < 700; i++) {
          const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[2] - a[2]); if (L < 0.1) continue; acc += L;
          const nx = -(b[2] - a[2]) / L * 0.7, nz = (b[0] - a[0]) / L * 0.7;
          const ya = a[1] + 0.25, yb = b[1] + 0.25;
          pos.push(a[0] + nx, ya, a[2] + nz, b[0] + nx, yb, b[2] + nz, b[0] - nx, yb, b[2] - nz, a[0] + nx, ya, a[2] + nz, b[0] - nx, yb, b[2] - nz, a[0] - nx, ya, a[2] - nz);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.gps.geometry.dispose(); this.gps.geometry = g;
      const mat = this.gps.material as THREE.MeshBasicMaterial; mat.side = THREE.DoubleSide;
    }
    this.gps.visible = !!this.route && !this.player.flying && !this.player.descending;
  }
  areaNow = ''; areaCand = ''; areaCandT = 0;
  updateHud() {
    const h = this.hud, o = this.order, P = this.player.pos;
    { const a = this.areaName(P.x, P.z) || ''; if (a !== this.areaCand) { this.areaCand = a; this.areaCandT = this.t; } else if (a && a !== this.areaNow && this.t - this.areaCandT > 1.5) { if (this.areaNow) h.areaChip(a); this.areaNow = a; } }
    h.set('coins', this.coins.toLocaleString('en-IN'));
    h.set('clock', `Day ${this.day} · ${fmtTime(this.minutes)}`);
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    h.set('level', `Level ${this.level + 1} · ${this.doneInLevel}/${L.n}`);
    h.set('spd', String(Math.round(Math.abs(this.player.speed) * 3.6)));
    h.set('fly-v', 'Unlimited');
    (h.el.fly as HTMLElement).style.width = '100%';
    const navigation = (s: Stop) => navigationReadout(this.route, this.routeGuidanceBlocked, P, s, this.player.flying || this.player.descending);
    const distanceLabel = (s: Stop) => { const n = navigation(s); return `${n.approximate ? '~' : ''}${n.metres} m`; };
    const sub = (s: Stop) => [s.sub, navigation(s).note].filter(Boolean).join(' · ');
    if (!o || o.state === 'offer') {
      const t = this.routeTarget;
      h.order({ state: t ? 'GPS' : 'Waiting for an order', title: t ? t.label : 'Orders appear here', sub: t ? sub(t) : (document.documentElement.classList.contains('is-touch') ? 'Tap Theatres to lease a picture hall' : 'Press T to see theatres'), dist: t ? distanceLabel(t) : '', time: '', meters: false });
    } else if (o.state === 'toPickup') {
      h.order({ state: 'Pick up', title: o.pickup.label, sub: sub(o.pickup), dist: distanceLabel(o.pickup), time: '', meters: false });
    } else {
      const left = Math.max(0, o.limit - o.t);
      h.order({ state: 'Deliver', title: o.drop.label, sub: sub(o.drop), dist: distanceLabel(o.drop), time: left > 0 ? `${Math.ceil(left)} s` : 'Late!', heat: o.heat, slices: o.slices, meters: true });
    }
    this.drawMinimap();
  }
  drawMinimap() {
    const c = this.hud.el.minimap as HTMLCanvasElement; const g = c.getContext('2d')!;
    const W = c.width, R = 240, sc = (W / 2) / R, P = this.player.pos, yaw = this.player.yaw;
    g.clearRect(0, 0, W, W); g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.clip();
    g.fillStyle = '#1B1633'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2); g.rotate(yaw); g.scale(sc, sc); g.translate(-P.x, -P.z);
    g.lineCap = 'round';
    for (const e of this.graph.nearestEdges(P.x, P.z, 5)) {
      g.strokeStyle = e.e.elev ? '#8a80b8' : ['trunk', 'primary', 'secondary'].includes(e.e.cls) ? '#CFC6E4' : '#5a4f8a';
      g.lineWidth = Math.max(2.5, e.e.w * 0.9);
      g.beginPath(); e.e.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    }
    for (const l of this.zone.metro.lines) { g.strokeStyle = '#22B573'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); l.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.setLineDash([]); }
    if (this.route) { g.strokeStyle = this.routeColor; g.lineWidth = 7; g.beginPath(); (this.routeGuidanceBlocked ? this.routeGuide : this.route.pts).forEach((p, i) => (i ? g.lineTo(p[0], p[2]) : g.moveTo(p[0], p[2]))); g.stroke(); }
    for (const s of this.theatres) { g.fillStyle = '#FF8FB1'; g.beginPath(); g.arc(s.stop.x, s.stop.z, 9, 0, 7); g.fill(); }
    if (this.routeTarget) { g.fillStyle = '#FFB627'; g.beginPath(); g.arc(this.routeTarget.x, this.routeTarget.z, 14, 0, 7); g.fill(); }
    g.restore();
    g.fillStyle = '#FFB627'; g.beginPath(); g.moveTo(W / 2, W / 2 - 16); g.lineTo(W / 2 + 11, W / 2 + 12); g.lineTo(W / 2, W / 2 + 5); g.lineTo(W / 2 - 11, W / 2 + 12); g.closePath(); g.fill();
  }
  stillFrame(q: URLSearchParams) {
    const sr = (q.get('showroom') || '').split(',').map(Number);
    if (sr.length >= 3) {
      // line up every traffic model and a crowd of walkers for a review render
      const [x0, z0, ang] = sr, ux = Math.cos(ang), uz = -Math.sin(ang);
      let off = 0;
      for (const pr of this.traffic.protos) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(pr.body, this.engine.mats.vBody), new THREE.Mesh(pr.lights, this.engine.mats.vLight));
        for (const d of pr.decals) g.add(new THREE.Mesh(d.geo, d.mat));
        g.children.forEach((m) => { (m as THREE.Mesh).castShadow = true; });
        off += pr.size[0] / 2 + 0.6;
        g.position.set(x0 + ux * off, 0.07, z0 + uz * off); g.rotation.y = ang + Math.PI / 2 + (q.get('rot') ? +q.get('rot')! : 0);
        off += pr.size[0] / 2 + 0.6;
        this.engine.scene.add(g);
      }
      for (let i = 0; i < 28; i++) this.walkers.spawn(this.player.pos.x, this.player.pos.z);
      for (let i = 0; i < 40; i++) this.walkers.update(0.05, x0, z0, { x: 1e6, z: 1e6, y: 0, speed: 0, fx: 0, fz: 1 });
    }
    if (q.get('sim')) {
      const n = +q.get('sim')!;
      const P = this.player.pos;
      for (let i = 0; i < n; i++) { this.traffic.update(0.05, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: 0 }, this.walkers.list); this.walkers.update(0.05, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: 0, fx: 0, fz: 1 }); }
    }
    const p = (q.get('player') || '').split(',').map(Number);
    if (p.length >= 3) { this.player.place(p[0], p[1], p[2]); this.player.update(0.016, { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false }, 0.4); }
  }
}
function validSavedLease(value: any, theatres: string[]): value is Lease {
  if (!value || typeof value !== 'object' || !theatres.includes(value.theatre)) return false;
  const f = value.film;
  const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v: unknown, min: number, max: number) => finite(v, min, max) && Number.isInteger(v);
  if (!f || !FILMS.some((film) => film.id === f.id) || !finite(f.quality, 0, 1) || !integer(f.star, 1, 5) ||
    !['title', 'te', 'genre', 'tagline'].every((key) => typeof f[key] === 'string') ||
    !Array.isArray(f.colors) || f.colors.length !== 2 || !f.colors.every((c: unknown) => typeof c === 'string')) return false;
  if (!PRICES.includes(value.price) || ![3, 4, 5].includes(value.shows) || !CAMPAIGNS.some((c) => c.id === value.campaign) ||
    !integer(value.startDay, 1, Number.MAX_SAFE_INTEGER) || !finite(value.hype, 0, 3) || !finite(value.wom, 0, 3) ||
    typeof value.done !== 'boolean' || !Array.isArray(value.days) || value.days.length > 7) return false;
  return value.days.every((r: any, i: number) => r && r.day === i + 1 && integer(r.tickets, 0, Number.MAX_SAFE_INTEGER) &&
    finite(r.occupancy, 0, 1) && finite(r.gross, 0, Number.MAX_SAFE_INTEGER) &&
    integer(r.coins, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) && typeof r.note === 'string');
}
function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function setLoading(t: string) { const el = document.getElementById('loading'); if (el) { el.textContent = t; el.hidden = !t; el.style.zIndex = '30'; el.style.background = t ? 'rgba(12,10,26,.72)' : ''; } }

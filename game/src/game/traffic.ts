import * as THREE from 'three';
import * as M from '../world/traffic_models';
import { rng } from '../core/util';
import type { RoadGraph, GEdge, GNode } from './roadgraph';
import { hasCentreMedian, type BusStop, type CityData } from '../world/city';
import { segmentHitsVehicle } from './spatial-safety';
import { TrafficCurve, roundedTrafficCorner, trafficCurveClear, trafficPoseClear, trafficOverlap, turnProfile, turnSpeed } from './traffic-path';
import { isORR } from '../world/expressway';
import { BusServices, type BusRun, type BusFeed } from './bus-services';
import { signalAspect } from '../world/signals';
import { busLane, busTurn, busRoundedCorner } from './bus-path';
import { BusPassengerExchange } from './bus-passengers';
import { constructionLane } from '../world/construction';
import { DynamicSpatialIndex, vehicleBounds, type SpatialBounds } from './dynamic-spatial-index';
import { PlanningBudget } from './planning-budget';

type Group = 'car' | 'auto' | 'bike' | 'bus' | 'truck';
interface Proto { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; decals: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; size: number[]; group: Group }
interface Motion {
  kind: 'bend' | 'junction' | 'lane' | 'uturn' | 'route'; curve: TrafficCurve; startS: number; endS: number;
  edge: GEdge; dir: 1 | -1; lane: number; progress: number; cap: number; node?: string;
  busStep?: number;
  busDistance?: number;
  busPath?: BusRun['path'];
  busSpans?: { edge: GEdge; dir: 1 | -1; start: number; end: number; base: number; index: number }[];
  busStart?: number;
  busStop?: boolean;
}
export interface Car {
  id: number; generation: number; proto: Proto; order: number; routeBoardKey?: string; routeMeshes?: THREE.Mesh[]; decisionAt?: number;
  g: THREE.Group; kind: string; group: Group; size: number[]; edge: GEdge; dir: 1 | -1; s: number; speed: number; want: number;
  lane: number; laneT: number; base: number; x: number; y: number; z: number; hx: number; hz: number; wob: number;
  blockedT: number; stuckT: number; passS: number; honkT: number; filtering: boolean; dwell: number; served: Set<BusStop>;
  motion?: Motion; stopS?: number; planAfter?: number; assertive?: boolean; laneChangeAt?: number; uturnAt?: number;
  busRun?: BusRun; routeDecals?: ReturnType<typeof M.busRouteBoards>;
  passengerExchange?: BusPassengerExchange;
}
export interface Walker { x: number; z: number; crossing: boolean }
export interface TrafficVerticalBounds { bottom: number; top: number }

function playerVerticalBounds(y: number, bounds?: TrafficVerticalBounds): TrafficVerticalBounds {
  if (bounds && Number.isFinite(bounds.bottom) && Number.isFinite(bounds.top) && bounds.top >= bounds.bottom) return bounds;
  const bottom = y - .55;
  return { bottom, top: bottom + 1.2 };
}

const WEIGHT: Record<string, number> = { motorway: 6, motorway_link: 2, trunk: 6, primary: 6, secondary: 4, tertiary: 3, trunk_link: 2, primary_link: 2, secondary_link: 2, residential: 0.6, unclassified: 0.8, service: 0.15, living_street: 0.3, unknown: 0.4 };
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'motorway', 'motorway_link', 'trunk_link']);

export class Traffic {
  cars: Car[] = []; protos: Proto[] = []; byGroup: Record<Group, Proto[]> = { car: [], auto: [], bike: [], bus: [], truck: [] };
  r = rng(77); t = 0;
  private nextId = 1;
  private pools = new Map<Proto, Car[]>();
  private pooledCount = 0;
  private boards = new Map<string, { decals: ReturnType<typeof M.busRouteBoards>; refs: number; last: number; bytes: number }>();
  private boardBytes = 0;
  private index = new DynamicSpatialIndex<Car>();
  private walkerIndex = new DynamicSpatialIndex<Walker>();
  private candidates: Car[] = []; private playerCandidates: Car[] = []; private walkerCandidates: Walker[] = [];
  private byEdge = new Map<GEdge, Car[]>();
  private edgeBuckets: Car[][] = [];
  private pins = new Map<Car, { generation: number; until: number }>();
  private retained = new Set<GEdge>();
  private retentionClock = 0; private wasJumping = false;
  private budget = new PlanningBudget();
  private planningCandidates: Car[] = [];
  private planJobs = new Map<Car, { generation: number; revision: number; edge: GEdge; path?: BusRun['path']; snapshot: Car; iterator: Generator<void, void, unknown> }>();
  private focusX = 0; private focusZ = 0;
  private renderedForward = new THREE.Vector3();
  stats = { spawned: 0, reused: 0, released: 0, pooled: 0, boardEntries: 0, boardBytes: 0, plans: 0, planningMs: 0, planningOverruns: 0, collisionCandidates: 0 };
  retainedEdges() { this.retained.clear(); for (const [c, pin] of this.pins) if (pin.generation === c.generation) { this.retained.add(c.edge); if (c.motion) { this.retained.add(c.motion.edge); for (const span of c.motion.busSpans || []) this.retained.add(span.edge); } } return this.retained; }
  clearRetention() { this.pins.clear(); this.retained.clear(); this.wasJumping = false; }
  updateJumpRetention(player: { jumping: boolean; x: number; y: number; z: number; hx: number; hz: number; speed: number }, dt: number) {
    this.retentionClock += Math.max(0, dt);
    if (this.wasJumping && !player.jumping) for (const pin of this.pins.values()) pin.until = this.retentionClock + 1;
    if (player.jumping) {
      const reach = Math.max(16, Math.abs(player.speed) * (5 / 3) + 14);
      for (const c of this.cars) {
        const dx = c.x - player.x, dz = c.z - player.z;
        const along = dx * player.hx + dz * player.hz, side = dx * player.hz - dz * player.hx;
        if (along > -18 && along < reach && Math.abs(side) < 14 + c.size[0] / 2 && Math.abs(c.y - player.y) < 14)
          this.pins.set(c, { generation: c.generation, until: Infinity });
      }
    }
    for (const [c, pin] of this.pins) {
      const onSupport = Math.abs(player.x - c.x) < c.size[2] / 2 + 3 && Math.abs(player.z - c.z) < c.size[2] / 2 + 3 && Math.abs(player.y - c.y - c.size[1]) < 3;
      if (pin.generation !== c.generation || !player.jumping && this.retentionClock >= pin.until && !onSupport) this.pins.delete(c);
    }
    this.wasJumping = player.jumping;
  }
  private pinned(c: Car) { return this.pins.get(c)?.generation === c.generation; }
  private syncIndex() { for (let i = 0; i < this.cars.length; i++) { const c = this.cars[i]; c.order = i; this.index.upsert(c, vehicleBounds(c, .8), i); } }
  private queryCars(bounds: SpatialBounds, output = this.candidates) { this.index.query(bounds, output); this.stats.collisionCandidates += output.length; return output; }
  private acquire(pr: Proto): Car {
    let pool = this.pools.get(pr); const c = pool?.pop();
    if (c) { this.pooledCount--; this.stats.reused++; c.generation++; return c; }
    const g = new THREE.Group(), body = new THREE.Mesh(pr.body, this.mats.vBody);
    body.castShadow = body.receiveShadow = true; g.add(body, new THREE.Mesh(pr.lights, this.mats.vLight));
    for (const dc of pr.decals) g.add(new THREE.Mesh(dc.geo, dc.mat));
    this.stats.spawned++;
    return { id: this.nextId++, generation: 1, proto: pr, g, served: new Set<BusStop>() } as Car;
  }
  private boardAcquire(run: BusRun) {
    const key = `${run.pattern.id}|${run.pattern.direction}|${run.pattern.number}|${run.pattern.to}`;
    let value = this.boards.get(key);
    if (!value) {
      const decals = M.busRouteBoards(run.pattern.number, run.pattern.to);
      let bytes = 0; const textures = new Set<THREE.Texture>();
      for (const dc of decals) { for (const a of Object.values(dc.geo.attributes)) bytes += a.array.byteLength; const texture = (dc.mat as THREE.MeshBasicMaterial).map; if (texture) textures.add(texture); }
      for (const texture of textures) bytes += (texture.image?.width || 0) * (texture.image?.height || 0) * 4 * 4 / 3;
      value = { decals, refs: 0, last: this.t, bytes }; this.boards.set(key, value); this.boardBytes += bytes;
    }
    value.refs++; value.last = this.t; return { key, decals: value.decals };
  }
  private trimBoards(force = false) {
    if (!force && this.boards.size <= 96 && this.boardBytes <= 24 * 1024 * 1024) return;
    for (const [key, value] of [...this.boards].filter(([, v]) => !v.refs).sort((a,b) => a[1].last - b[1].last)) {
      if (!force && this.boards.size <= 96 && this.boardBytes <= 24 * 1024 * 1024) break;
      const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      for (const dc of value.decals) { dc.geo.dispose(); materials.add(dc.mat); const texture = (dc.mat as THREE.MeshBasicMaterial).map; if (texture) textures.add(texture); }
      for (const texture of textures) texture.dispose(); for (const material of materials) material.dispose();
      this.boards.delete(key); this.boardBytes -= value.bytes;
    }
  }
  private resetCar(c: Car, values: Partial<Car>) {
    c.served.clear(); c.g.visible = true;
    c.motion = undefined; c.stopS = undefined; c.planAfter = undefined; c.assertive = false;
    c.laneChangeAt = undefined; c.uturnAt = undefined; c.busRun = undefined; c.routeDecals = undefined;
    c.routeBoardKey = undefined; c.routeMeshes = undefined; c.passengerExchange = undefined; c.decisionAt = undefined;
    c.blockedT = c.stuckT = c.passS = c.dwell = 0; c.filtering = false;
    Object.assign(c, values); c.order = this.cars.length;
    c.g.userData.presentationGeneration = c.generation;
    this.scene.add(c.g); c.g.position.set(c.x, c.y + .02, c.z); c.g.rotation.set(0, Math.atan2(-c.hx, -c.hz), 0, 'YXZ');
    this.cars.push(c); this.index.upsert(c, vehicleBounds(c, .8), c.order);
  }
  stopsByEdge = new Map<string, BusStop[]>();
  services: BusServices | null = null;
  passengerExchanges: BusPassengerExchange[] = [];
  onHorn: (kind: string, x: number, z: number) => void = () => {};
  constructor(public graph: RoadGraph, public scene: THREE.Scene, public mats: Record<string, any>, public max = 55, busStops: BusStop[] = [], public city?: CityData) {
    const R = rng(4049);
    const add = (m: M.Model) => {
      const p: Proto = { body: m.body.geometry(), lights: m.lights.geometry(), decals: m.decals || [], size: m.size, group: m.kind as Group };
      this.protos.push(p); this.byGroup[p.group].push(p);
    };
    const CAR = ['#F3F2EE', '#F3F2EE', '#F3F2EE', '#C9CCD2', '#9ea3ad', '#5b5f68', '#b3202a', '#23356b', '#6b1f2a', '#1b1a1f', '#7a5a3a', '#2a5bd7'];
    for (let i = 0; i < 12; i++) add(M.car(R.pick(['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'cab'] as const), CAR[i % CAR.length], R));
    for (let i = 0; i < 10; i++) add(M.auto(R, i));
    for (let i = 0; i < 6; i++) add(M.motorbike(R));
    for (let i = 0; i < 5; i++) add(M.scooter(R));
    for (let i = 0; i < 4; i++) add(M.bus(R));
    for (let i = 0; i < 2; i++) add(M.lorry(R));
    add(M.tanker(R));
    this.setBusStops(busStops);
  }
  setBusStops(busStops: BusStop[]) {
    this.stopsByEdge.clear();
    for (const s of busStops) (this.stopsByEdge.get(s.edge) || this.stopsByEdge.set(s.edge, []).get(s.edge)!).push(s);
  }
  setBusFeed(feed: BusFeed) { this.services = new BusServices(this.graph, feed); }
  private release(c: Car) {
    this.scene.remove(c.g); this.index.remove(c); this.pins.delete(c); this.planJobs.delete(c); this.stats.released++;
    if (c.passengerExchange) {
      this.scene.remove(c.passengerExchange.group);
      const at = this.passengerExchanges.indexOf(c.passengerExchange); if (at >= 0) this.passengerExchanges.splice(at, 1);
      c.passengerExchange = undefined;
    }
    for (const mesh of c.routeMeshes || []) c.g.remove(mesh);
    if (c.routeBoardKey) { const board = this.boards.get(c.routeBoardKey); if (board) { board.refs = Math.max(0, board.refs - 1); board.last = this.t; } }
    c.routeMeshes = undefined; c.routeDecals = undefined; c.routeBoardKey = undefined;
    c.motion = undefined; c.busRun = undefined; c.served.clear();
    let pool = this.pools.get(c.proto); if (!pool) this.pools.set(c.proto, pool = []);
    if (pool.length < 6 && this.pooledCount < 96) { pool.push(c); this.pooledCount++; }
    this.trimBoards(); this.stats.pooled = this.pooledCount;
    this.stats.boardEntries = this.boards.size; this.stats.boardBytes = this.boardBytes;
  }
  clear() { this.clearRetention(); for (const c of this.cars) this.release(c); this.cars.length = 0; this.index.clear(); this.walkerIndex.clear(); this.byEdge.clear(); for (const exchange of this.passengerExchanges || []) this.scene.remove(exchange.group); this.passengerExchanges.length = 0; }
  dispose() { this.clear(); this.trimBoards(true); this.pools.clear(); this.pooledCount = 0; this.edgeBuckets.length = 0; this.planningCandidates.length = 0; }
  // vehicles on roads of an unloaded tile leave with it
  dropEdges(gone: Set<GEdge>) {
    for (let i = this.cars.length - 1; i >= 0; i--) if (!this.pinned(this.cars[i]) && (gone.has(this.cars[i].edge) || (this.cars[i].motion && (gone.has(this.cars[i].motion!.edge)
        || this.cars[i].motion!.busSpans?.some(span => gone.has(span.edge)))))) { this.release(this.cars[i]); this.cars.splice(i, 1); }
  }
  // Pedestrians and callers use the same mapped approach plan as the lamps.
  // An unbound/manual node flag cannot invent a traffic controller.
  green(node: GNode, hx: number, hz: number) {
    const controls = node.signalControls || [];
    const matched = controls.slice().sort((a, b) => (b.approach.hx * hx + b.approach.hz * hz) - (a.approach.hx * hx + a.approach.hz * hz))[0];
    return !matched || matched.approach.hx * hx + matched.approach.hz * hz < .8 || signalAspect(matched.site, matched.approach.phase, this.t) === 'green';
  }
  signalState(node: GNode, phase: number) {
    const control = node.signalControls?.find(c => c.approach.phase === phase);
    return control ? signalAspect(control.site, phase, this.t) : 'green';
  }
  private signalAhead(c: Car) {
    // Once the nose has crossed its stop bar on green, finish clearing it.
    if ((c.motion?.kind === 'junction' || c.motion?.kind === 'uturn') && c.motion.progress >= 0) return undefined;
    return this.graph.signalsFor(c.edge, c.dir).find(control => control.approach.stopS >= c.s + c.size[2] / 2 - .1);
  }
  private redStop(c: Car) {
    const control = this.signalAhead(c);
    return control && signalAspect(control.site, control.approach.phase, this.t) !== 'green' ? control.approach.stopS - c.size[2] / 2 - .35 : undefined;
  }
  laneRange(edge: GEdge, w: number, dir: 1 | -1 = 1): [number, number] {
    const work = edge.e.workZone, centre = constructionLane(edge.e, dir);
    if (work && centre !== undefined) { const room = Math.max(0, (work.width - w) / 2 - .3); return [centre - room, centre + room]; }
    const e = edge.e, half = e.w / 2;
    if (isORR(e) && e.expressway?.shoulders) return [-half + e.expressway.shoulders[1] + w / 2 + 0.15, half - e.expressway.shoulders[0] - w / 2 - 0.15];
    if (e.oneway) return [-half + w / 2 + 0.3, half - w / 2 - 0.3];
    const inner = hasCentreMedian(e) ? 0.95 : 0.35;                     // keep clear of the centre median
    return [inner + w / 2, Math.max(inner + w / 2, half - w / 2 - 0.3)];
  }
  pickLane(edge: GEdge, w: number, group: Group, dir: 1 | -1 = 1) {
    const workLane = constructionLane(edge.e, dir); if (workLane !== undefined) return workLane;
    if (group === 'bus') return busLane(edge, dir);
    const e = edge.e, half = e.oneway ? e.w : e.w / 2;
    if (isORR(e) && e.expressway?.throughLanes) {
      const lw = e.expressway.laneWidth || 3.5, left = e.w / 2 - (e.expressway.shoulders?.[0] || 0);
      const [lo, hi] = this.laneRange(edge, w);
      return Math.max(lo, Math.min(hi, left - (Math.floor(this.r() * e.expressway.throughLanes) + 0.5) * lw));
    }
    const lanes = Math.max(1, Math.floor(half / 3.2)), lw = Math.min(3.4, half / lanes);
    // k counts lanes from the left kerb (slow traffic keeps left in India)
    let k = Math.floor(this.r() * lanes);
    if ((group === 'truck' || group === 'auto') && this.r() < 0.6) k = 0;
    const [lo, hi] = this.laneRange(edge, w);
    const lane = e.oneway ? e.w / 2 - (k + 0.5) * lw : half - (k + 0.5) * lw;
    return Math.max(lo, Math.min(hi, lane + (group === 'bike' ? (this.r() - 0.5) * 1.2 : 0)));
  }
  spawn(px: number, pz: number) {
    const cand = this.graph.nearestEdges(px, pz, 4).filter((g) => (WEIGHT[g.e.cls] || 0) > 0.1 && !(g.e.elev && Math.max(...g.e.elev) > 1.2 && this.r() < 0.3));
    if (!cand.length) return;
    let tot = 0; for (const g of cand) tot += (WEIGHT[g.e.cls] || 0.2) * g.len;
    let pick = this.r() * tot, edge = cand[0];
    for (const g of cand) { pick -= (WEIGHT[g.e.cls] || 0.2) * g.len; if (pick <= 0) { edge = g; break; } }
    const dirs: (1 | -1)[] = []; if (edge.e.oneway !== 'forward') dirs.push(1); if (edge.e.oneway !== 'backward') dirs.push(-1);
    if (!dirs.length) return;
    const dir = this.r.pick(dirs);
    const s = this.r() * edge.len;
    const p = this.graph.pointAt(edge, s, dir);
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < 70 || d > 300) return;
    const big = MAJOR.has(edge.e.cls);
    // Hyderabad mix: two-wheelers dominate, then autos and cars; buses and lorries on main roads
    const roll = this.r();
    const fast = /^motorway/.test(edge.e.cls);
    let group: Group = fast ? (roll < 0.66 ? 'car' : roll < 0.82 ? 'bus' : 'truck') : big ? (roll < 0.36 ? 'bike' : roll < 0.58 ? 'auto' : roll < 0.86 ? 'car' : roll < 0.95 ? 'bus' : 'truck') : (roll < 0.5 ? 'bike' : roll < 0.78 ? 'auto' : 'car');
    const busRun = group === 'bus' ? this.services?.bind(edge, dir, s, this.r()) : null;
    if (group === 'bus' && !busRun) group = fast ? 'truck' : 'car';
    const pr = this.r.pick(this.byGroup[group]);
    const lane = this.pickLane(edge, pr.size[0], group, dir);
    const pose = this.graph.pointAt(edge, s, dir, lane);
    if ((this.city && !trafficPoseClear(this.city, pose, pr.size)) || this.cars.some(c => trafficOverlap({ ...pose, size: pr.size }, c, 2))) return;
    const c = this.acquire(pr), g = c.g;
    const want = group === 'bike' ? this.r.range(9, 13) : group === 'bus' || group === 'truck' ? this.r.range(6.5, 9) : group === 'auto' ? this.r.range(7, 10) : this.r.range(8, 12);
    const board = busRun ? this.boardAcquire(busRun) : undefined;
    const routeMeshes = board?.decals.map(dc => new THREE.Mesh(dc.geo, dc.mat));
    this.resetCar(c, { kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * .6, want, lane, laneT: lane, base: lane, ...pose, wob: this.r() * 10, honkT: this.r.range(.6, 2), assertive: group === 'auto' && this.r() < .38, laneChangeAt: group === 'bus' ? 0 : this.t + this.r.range(5, 15), uturnAt: this.t + this.r.range(25, 55), busRun: busRun || undefined, routeDecals: board?.decals, routeBoardKey: board?.key, routeMeshes });
    for (const mesh of routeMeshes || []) g.add(mesh);
  }
  // place a specific vehicle (used by tests and scripted scenes)
  spawnAt(group: Group, edge: GEdge, dir: 1 | -1, s: number, lane?: number): Car {
    const pr = this.byGroup[group][0];
    const c = this.acquire(pr), g = c.g;
    const ln = constructionLane(edge.e, dir) ?? lane ?? this.pickLane(edge, pr.size[0], group, dir);
    const p = this.graph.pointAt(edge, s, dir, ln);
    g.position.set(p.x, p.y + 0.02, p.z); g.rotation.set(0, Math.atan2(-p.hx, -p.hz), 0, 'YXZ');
    const want = group === 'bike' ? 11 : group === 'bus' ? 8 : 10;
    this.resetCar(c, { kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * .8, want, lane: ln, laneT: ln, base: ln, ...p, wob: 0, honkT: .5, assertive: group === 'auto' && this.r() < .38, laneChangeAt: group === 'bus' ? 0 : this.t + this.r.range(5, 15), uturnAt: this.t + this.r.range(25, 55) });
    return c;
  }
  private plans = 0;
  private allowed(c: Car, edge: GEdge) { return !((c.group === 'auto' || c.group === 'bike') && /^motorway/.test(edge.e.cls)); }
  private curveOK(c: Car, curve: TrafficCurve) {
    return Number.isFinite(curve.length) && curve.length > 0.05 && curve.minRadius >= turnProfile(c.group, c.assertive).minRadius &&
      Math.abs(curve.a.y - curve.b.y) < 3 && (!this.city || trafficCurveClear(curve, this.city, c.size));
  }
  private *curveOKSteps(c: Car, curve: TrafficCurve): Generator<void, boolean, unknown> {
    if (!Number.isFinite(curve.length) || curve.length <= .05 || curve.minRadius < turnProfile(c.group, c.assertive).minRadius || Math.abs(curve.a.y-curve.b.y) >= 3) return false;
    if (this.city) {
      const n = Math.max(2, Math.ceil(curve.length / .65));
      for (let i=0; i<=n; i++) { if (i % 4 === 0) yield; if (!trafficPoseClear(this.city, curve.sample(curve.length*i/n), c.size)) return false; }
    }
    return true;
  }
  private remember(c: Car, motion: Omit<Motion, 'progress' | 'cap'>) {
    c.motion = { ...motion, progress: -1, cap: turnSpeed(motion.curve, c.group, c.assertive) };
    c.stopS = undefined;
  }
  private segmentRoom(edge: GEdge, dir: 1 | -1, end: boolean) {
    const index = (dir === 1) === end ? edge.cum.length - 1 : 1;
    return edge.cum[index] - edge.cum[index - 1];
  }
  private *prepareBusSpan(c: Car): Generator<void, boolean, unknown> {
    const run = c.busRun; if (!run || run.ended) return false;
    // Tiny source split records are not physical intersections. Plan a smooth
    // swept span across their allotted chain, retaining exact edge ownership at
    // the exit. The next published stop is a hard limit; no stop can be skipped.
    this.services?.next(run, c.edge, c.dir, c.s);
    if (run.path[run.step]?.edge !== c.edge || run.path[run.step]?.dir !== c.dir) return false;
    const spans: { edge: GEdge; dir: 1 | -1; start: number; end: number; base: number; index: number }[] = [];
    let length = 0;
    // Look beyond the length of a typical motion. A corner close to the end
    // of the horizon still needs its complete outgoing turning clearance.
    const lookahead = 120;
    for (let index = run.step; index < run.path.length && length < lookahead && index < run.step + 48; index++) {
      const step = run.path[index], edge = step.edge;
      if (this.graph.byId.get(edge.e.id) !== edge) return false;
      const start = index === run.step ? c.s : 0;
      let end = index === run.path.length - 1 ? run.stopPosition.s : edge.len;
      // A source stop bar must retain the normal explicit red-light approach
      // and queue logic instead of being interpolated across another edge.
      const control = this.graph.signalsFor(edge, step.dir).find(control => control.approach.stopS >= start && control.approach.stopS <= end);
      if (control && index === run.step) break;
      if (control) end = Math.min(end, control.approach.stopS - c.size[2] / 2 - 1.35);
      end = Math.min(end, start + lookahead - length);
      if (end <= start) break;
      spans.push({ edge, dir: step.dir, start, end, base: length, index }); length += Math.max(0, end - start);
      if (control) break;
    }
    if (length < 1) return false;
    const point = (distance: number) => {
      const span = spans.find(s => distance < s.base + s.end - s.start - 1e-6) || spans[spans.length - 1];
      const at = Math.min(span.end, span.start + Math.max(0, distance - span.base));
      return { span, at, pose: this.graph.pointAt(span.edge, at, span.dir, busLane(span.edge, span.dir)) };
    };
    const corners: { at:number; trim:number }[] = [];
    const addCorner = (at:number, dot:number) => {
      if (dot >= .9995) return;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      corners.push({ at, trim:Math.max(.2, turnProfile('bus').radius * Math.tan(angle / 2)) });
    };
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      for (let k = 1; k < span.edge.cum.length - 1; k++) {
        const at = span.dir === 1 ? span.edge.cum[k] : span.edge.len - span.edge.cum[k];
        if (at <= span.start + .01 || at >= span.end) continue;
        const p = this.graph.pointAt(span.edge, at - .001, span.dir), q = this.graph.pointAt(span.edge, at + .001, span.dir);
        addCorner(span.base + at - span.start, p.hx * q.hx + p.hz * q.hz);
      }
      const next = spans[i + 1];
      if (next) {
        const p = this.graph.pointAt(span.edge, span.end - .001, span.dir), q = this.graph.pointAt(next.edge, next.start + .001, next.dir);
        addCorner(span.base + span.end - span.start, p.hx * q.hx + p.hz * q.hz);
      }
    }
    // Reserve the turning radius before the first physical corner, even when
    // several short collinear source edges sit between here and that corner.
    // Picking successive short straight spans otherwise commits the bus too
    // close to a bend for its next smooth curve to fit.
    corners.sort((a,b) => a.at - b.at);
    const corner = corners[0];
    // A shallow source bend needs a short tangent trim; reserving thirteen
    // metres for every two-degree bend merges unrelated bends and can strand
    // a bus on an otherwise smooth arterial road.
    const wantedStart = corner ? Math.max(0, corner.at - corner.trim) : 0;
    const currentRoom = c.edge.len - c.s;
    const startDistance = wantedStart < currentRoom - .01 ? wantedStart : 0;
    const waitForNextEdge = wantedStart >= currentRoom - .01;
    const a = startDistance ? this.graph.pointAt(c.edge, c.s + startDistance, c.dir, c.lane) : this.graph.pointAt(c.edge, c.s, c.dir, c.lane);
    const minimumEnd = corner && !waitForNextEdge ? corner.at + corner.trim : 0;
    const targetDistances = [...new Set((waitForNextEdge ? [Math.max(.2, wantedStart)] : [minimumEnd, 8, 12, 18, 26, 38, 52, 65, 96, lookahead, length]).map(d => Math.min(d, length)))].sort((a, b) => a - b);
    for (const distance of targetDistances) {
      yield;
      if (distance < .2 || distance < Math.min(length, minimumEnd) - .001 || distance <= startDistance + .05) continue;
      if (!waitForNextEdge && corners.some(corner => corner.at > distance + .01 && corner.at - distance < corner.trim)) continue;
      const end = point(distance), [lowLane, highLane] = this.laneRange(end.span.edge, c.size[0], end.span.dir);
      for (const lane of [...new Set([busLane(end.span.edge, end.span.dir), Math.max(lowLane, Math.min(highLane, 0)), lowLane, highLane])]) {
      const endpoint = this.graph.pointAt(end.span.edge, end.at, end.span.dir, lane), baseCurve = busRoundedCorner(a, endpoint);
      for (const [incoming, outgoing] of [[1,1],[1.25,.8],[1.5,.65],[.8,1.25],[.65,1.5]]) {
      const curve = incoming === 1 && outgoing === 1 ? baseCurve : new TrafficCurve(a, endpoint, baseCurve.handleA * incoming, baseCurve.handleB * outgoing);
      if (!(yield* this.curveOKSteps(c, curve))) continue;
      // Without a streamed city (offline tests), still reject a curve that
      // leaves its prescribed road corridor or shortcuts a parallel street.
      let follows = true;
      for (let at = 0, sample = 0; at <= curve.length + .1; at += .8, sample++) {
        if (sample % 8 === 0) yield;
        const p = curve.sample(Math.min(at, curve.length)); let nearest = Infinity;
        for (const span of spans) {
          if (span.base > distance) break;
          const lo = span.dir === 1 ? span.start : span.edge.len - span.end;
          const hi = span.dir === 1 ? span.end : span.edge.len - span.start;
          for (let k = 1; k < span.edge.cum.length; k++) {
            if (k % 32 === 0) yield;
            if (span.edge.cum[k] < lo || span.edge.cum[k - 1] > hi) continue;
            const u = span.edge.e.pts[k - 1], v = span.edge.e.pts[k], dx = v[0] - u[0], dz = v[1] - u[1];
            const t = Math.max(0, Math.min(1, ((p.x - u[0]) * dx + (p.z - u[1]) * dz) / (dx * dx + dz * dz || 1)));
            nearest = Math.min(nearest, Math.hypot(p.x - u[0] - dx * t, p.z - u[1] - dz * t) - span.edge.e.w / 2);
          }
        }
        if (nearest > .15) { follows = false; break; }
      }
      if (!follows) continue;
      this.remember(c, { kind: 'route', curve, startS: c.s + startDistance, endS: end.at, edge: end.span.edge, dir: end.span.dir, lane, busStep: end.span.index, busDistance: distance - startDistance, busPath: run.path,
        busSpans: spans.filter(span => span.base < distance + .001), busStart: startDistance,
        busStop: end.span.index === run.path.length - 1 && Math.abs(end.at - run.stopPosition.s) < .01 });
      return true;
      }
      }
    }
    return false;
  }
  // Prepare before braking distance. Pending paths remain fixed, so a new random
  // exit/lane is never selected while a vehicle is already turning.
  private prepare(c: Car) {
    let job = this.planJobs.get(c);
    if (c.motion) { if (job) this.planJobs.delete(c); return; }
    const revision = this.graph.revision || 0;
    if (job && (job.generation !== c.generation || job.revision !== revision || job.edge !== c.edge || job.path !== c.busRun?.path)) { this.planJobs.delete(c); job = undefined; }
    if (!job && ((c.planAfter || 0) > this.t || this.t < (c.decisionAt || 0) && c.stopS !== undefined)) return;
    // A deferred strategic plan never authorizes crossing an unplanned bend.
    if (!job) {
      let next = c.edge.len;
      for (let i = 1; i < c.edge.cum.length - 1; i++) {
        const at = c.dir === 1 ? c.edge.cum[i] : c.edge.len - c.edge.cum[i];
        if (at <= c.s + .015 || at >= next) continue;
        const a = this.graph.pointAt(c.edge, at - .001, c.dir), b = this.graph.pointAt(c.edge, at + .001, c.dir);
        if (a.hx * b.hx + a.hz * b.hz < .9999999) next = at;
      }
      const assignedStop = c.busRun && !c.busRun.ended && c.busRun.stopPosition.edge === c.edge && c.busRun.stopPosition.dir === c.dir ? c.busRun.stopPosition.s : Infinity;
      c.stopS = Math.min(c.stopS ?? Infinity, assignedStop < next ? assignedStop : Math.max(c.s, next - Math.min(16, c.size[2] + 3)));
      if (!this.budget.available) return;
      const snapshot: Car = { ...c, busRun: c.busRun ? { ...c.busRun } : undefined, motion: undefined };
      job = { generation: c.generation, revision, edge: c.edge, path: c.busRun?.path, snapshot, iterator: this.preparePlan(snapshot) };
      this.planJobs.set(c, job); this.plans++;
    }
    while (this.budget.available) {
      const result = this.budget.run(() => job!.iterator.next());
      if (!result?.done) { if (!result) break; continue; }
      this.planJobs.delete(c);
      const motion = job.snapshot.motion;
      if (motion && c.s <= motion.startS + 1e-5) { c.motion = motion; c.stopS = undefined; }
      else if (motion?.kind === 'route' && motion.busDistance && c.busRun?.path === motion.busPath) {
        // A bus may progress along its current straight while a plan is built.
        // Accept the old plan only at an identical pose/tangent; never snap it
        // backward to the snapshot or join a curve it has already driven past.
        const u = (c.s - job.snapshot.s - (motion.busStart || 0)) / motion.busDistance;
        if (u >= 0 && u < 1) {
          const pose = motion.curve.sample(u * motion.curve.length);
          if (Math.hypot(pose.x-c.x, pose.z-c.z) <= .02 && Math.abs(pose.y-c.y) <= .02 && pose.hx*c.hx+pose.hz*c.hz >= .9999) {
            motion.progress = u * motion.curve.length; c.motion = motion; c.stopS = undefined;
          }
        }
      }
      if (!c.motion && job.snapshot.stopS !== undefined) c.stopS = Math.max(c.s, Math.min(c.stopS ?? Infinity, job.snapshot.stopS));
      const d = Math.hypot(c.x-this.focusX,c.z-this.focusZ), urgent = this.pinned(c) || (c.stopS ?? c.edge.len)-c.s < Math.max(30,c.speed*4);
      c.decisionAt = this.t + 1 / (urgent || d < 90 ? 10 : d < 200 ? 5 : 2);
      c.planAfter = c.motion ? 0 : job.snapshot.planAfter;
      // Stale completed curves need a fresh starting pose, not a long retry delay.
      if (motion && !c.motion) { c.decisionAt = this.t; c.planAfter = 0; }
      break;
    }
  }
  private *preparePlan(c: Car): Generator<void, void, unknown> {
    if (c.motion || (c.planAfter || 0) > this.t) return;
    if (c.group === 'bus' && c.busRun && (yield* this.prepareBusSpan(c))) return;
    const profile = turnProfile(c.group, c.assertive), edge = c.edge;
    let vertex = Infinity, prev = 0, next = edge.len;
    for (let i = 1; i < edge.cum.length - 1; i++) {
      const s = c.dir === 1 ? edge.cum[i] : edge.len - edge.cum[i];
      if (s < c.s + 0.015 || s >= vertex) continue;
      const a = this.graph.pointAt(edge, s - 0.001, c.dir), b = this.graph.pointAt(edge, s + 0.001, c.dir);
      if (a.hx * b.hx + a.hz * b.hz > 0.9999999) continue;
      vertex = s;
      prev = c.dir === 1 ? edge.cum[i - 1] : edge.len - edge.cum[i + 1];
      next = c.dir === 1 ? edge.cum[i + 1] : edge.len - edge.cum[i - 1];
    }
    const at = Number.isFinite(vertex) ? vertex : edge.len;
    if (at - c.s > 75) return;
    // A same-edge published stop is the current destination, even when it sits
    // close to the junction. The next service leg is selected after the dwell;
    // the generic missing-exit buffer must not stop the bus before this stop.
    if (!Number.isFinite(vertex) && c.busRun && !c.busRun.ended && c.busRun.stopPosition.edge === edge && c.busRun.stopPosition.dir === c.dir) {
      c.stopS = Math.max(c.s, Math.min(edge.len - .02, c.busRun.stopPosition.s));
      c.planAfter = this.t + .5; return;
    }
    // An unplanned corner is a stop, never permission to snap to another heading.
    c.stopS = Math.max(c.s, at - Math.min(16, c.size[2] + 3));
    c.planAfter = this.t + 1.1;
    if (Number.isFinite(vertex)) {
      const before = this.graph.pointAt(edge, vertex - 0.001, c.dir), after = this.graph.pointAt(edge, vertex + 0.001, c.dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, before.hx * after.hx + before.hz * after.hz)));
      if (angle > Math.PI * 0.94) return;
      const wanted = Math.max(0.2, profile.radius * Math.tan(angle / 2));
      for (const factor of [1, 1.45, 0.7]) {
        const trim = Math.min(wanted * factor, (vertex - prev) * 0.46, (next - vertex) * 0.46);
        const startS = Math.max(c.s, vertex - trim), endS = vertex + trim;
        const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(edge, endS, c.dir, c.lane);
        const curve = roundedTrafficCorner(a, b);
        if (!(yield* this.curveOKSteps(c, curve))) continue;
        this.remember(c, { kind: 'bend', curve, startS, endS, edge, dir: c.dir, lane: c.lane }); return;
      }
      return;
    }
    const node = this.graph.nodes.get(c.dir === 1 ? edge.to : edge.from);
    if (!node) return;
    const assigned = c.busRun && this.services?.next(c.busRun, edge, c.dir, c.s);
    const opts = c.busRun ? (assigned ? [assigned] : []) : node.out.filter(o => o.edge !== edge && (WEIGHT[o.edge.e.cls] || 0) > 0.1 && this.allowed(c, o.edge));
    // Only some autos take opportunistic U-turns; all drivers can return at a
    // sufficiently large dead end. A one-way edge has no reverse graph exit.
    const reverse = node.out.find(o => o.edge === edge && o.dir !== c.dir);
    const opportunistic = c.assertive && this.t >= (c.uturnAt || 0) && this.r() < 0.14;
    if (!c.busRun && reverse && (!opts.length || opportunistic) && !edge.e.workZone && !isORR(edge.e) && (!hasCentreMedian(edge.e) || this.city)) {
      const trim = Math.min(Math.max(3, c.size[2] * 0.65), this.segmentRoom(edge, c.dir, true) * 0.45);
      const startS = Math.max(c.s, edge.len - trim), endS = edge.len - startS;
      const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(edge, endS, reverse.dir, c.lane);
      const curve = new TrafficCurve(a, b, Math.abs(c.lane) * 4 / 3);
      if (yield* this.curveOKSteps(c, curve)) {
        this.remember(c, { kind: 'uturn', curve, startS, endS, edge, dir: reverse.dir, lane: c.lane, node: node.id }); return;
      }
    }
    const shuffled = [...opts];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    for (const out of shuffled) {
      yield;
      if (c.group === 'bus') {
        const planned = busTurn(this.graph, edge, c.dir, out.edge, out.dir, c.s, c.lane);
        if (planned && (yield* this.curveOKSteps(c, planned.curve))) {
          this.remember(c, { kind: 'junction', ...planned, edge: out.edge, dir: out.dir, node: node.id }); return;
        }
        continue;
      }
      const entry = this.graph.pointAt(edge, edge.len - 0.001, c.dir), exit = this.graph.pointAt(out.edge, 0.001, out.dir);
      const angle = Math.acos(Math.max(-1, Math.min(1, entry.hx * exit.hx + entry.hz * exit.hz)));
      if (angle > Math.PI * 0.88) continue;
      const [lo, hi] = this.laneRange(out.edge, c.size[0], out.dir), lane = constructionLane(out.edge.e, out.dir) ?? Math.max(lo, Math.min(hi, c.lane));
      const wanted = Math.max(3, profile.radius * Math.tan(angle / 2));
      for (const factor of [1, 1.45, 0.7]) {
        const trimIn = Math.min(wanted * factor, this.segmentRoom(edge, c.dir, true) * 0.46);
        const trimOut = Math.min(wanted * factor, this.segmentRoom(out.edge, out.dir, false) * 0.46);
        const startS = Math.max(c.s, edge.len - trimIn), endS = trimOut;
        const a = this.graph.pointAt(edge, startS, c.dir, c.lane), b = this.graph.pointAt(out.edge, endS, out.dir, lane);
        const curve = roundedTrafficCorner(a, b);
        if (!(yield* this.curveOKSteps(c, curve))) continue;
        this.remember(c, { kind: 'junction', curve, startS, endS, edge: out.edge, dir: out.dir, lane, node: node.id }); return;
      }
    }
  }
  private canEnter(c: Car, m: Motion, player: { x: number; z: number; y: number; hx?: number; hz?: number }) {
    const other = this.cars;
    const body = { x: player.x, z: player.z, y: player.y - 0.55, size: [2, 1.6, 4.8], hx: player.hx ?? c.hx, hz: player.hz ?? c.hz };
    for (let s = 0; s <= m.curve.length + 0.01; s += 1.1) {
      const p = { ...m.curve.sample(Math.min(s, m.curve.length)), size: c.size };
      if (trafficOverlap(p, body, .5) || this.queryCars(vehicleBounds(p, 1)).some(o => o !== c && Math.abs(o.y - c.y) < 4 && trafficOverlap(p, o, .5))) return false;
    }
    if (m.node && other.some(o => o !== c && Math.abs(o.y - c.y) < 4 && o.motion?.node === m.node && o.motion.progress >= 0)) return false;
    return true;
  }
  private tryLane(c: Car, player: { x: number; z: number; y: number; hx?: number; hz?: number }) {
    if (c.edge.e.workZone) return false;
    if (Math.abs(c.laneT - c.lane) < 0.1 || (c.motion && c.motion.progress >= 0) || this.t < (c.laneChangeAt || 0)) return false;
    const distance = c.group === 'bus' ? 28 : c.assertive ? 6.5 : c.group === 'bike' ? 8 : 14;
    const endS = c.s + Math.max(distance, c.speed * (c.assertive ? 1.4 : 2.5));
    if (endS >= (c.motion?.startS ?? c.stopS ?? c.edge.len) - 2) return false;
    const a = this.graph.pointAt(c.edge, c.s, c.dir, c.lane), b = this.graph.pointAt(c.edge, endS, c.dir, c.laneT);
    // A lane change must stay on a straight section; intervening bends are planned first.
    if (a.hx * b.hx + a.hz * b.hz < 0.99999) return false;
    const curve = new TrafficCurve(a, b, (endS - c.s) / 3);
    if (!this.curveOK(c, curve)) { c.laneChangeAt = this.t + 2; return false; }
    const m: Motion = { kind: 'lane', curve, startS: c.s, endS, edge: c.edge, dir: c.dir, lane: c.laneT, progress: -1, cap: Math.min(c.want, turnSpeed(curve, c.group, c.assertive)) };
    if (!this.canEnter(c, m, player)) { c.laneChangeAt = this.t + 1.5; return false; }
    c.motion = m; c.stopS = undefined; c.laneChangeAt = this.t + this.r.range(c.assertive ? 8 : 14, c.assertive ? 17 : 25); return true;
  }
  private advance(c: Car, distance: number, player: { x: number; z: number; y: number; hx?: number; hz?: number }, walkers: Walker[]) {
    const body = { x: player.x, z: player.z, y: player.y - 0.55, hx: player.hx ?? c.hx, hz: player.hz ?? c.hz, size: [2, 1.6, 4.8] };
    // Small swept steps prevent a long bus or a fast auto tunnelling through a
    // crossing vehicle between frames. This is simulation collision, not a test driver.
    for (let guard = 0; distance > 1e-6 && guard < 32; guard++) {
      let m = c.motion;
      if (m && m.progress < 0 && c.s >= m.startS - 1e-6) {
        if ((m.node && this.redStop(c) !== undefined) || !this.canEnter(c, m, player)) { c.speed = 0; break; }
        m.progress = 0;
        if (m.kind === 'uturn') c.uturnAt = this.t + this.r.range(45, 85);
      }
      const active = m && m.progress >= 0;
      let available = active ? m!.curve.length - m!.progress : Math.max(0, (m?.startS ?? c.stopS ?? c.edge.len - 0.02) - c.s);
      const redStop = this.redStop(c);
      if (redStop !== undefined) {
        const roadPerCurve = active ? (m!.endS - m!.startS) / m!.curve.length : 1;
        if (roadPerCurve > 0) available = Math.min(available, Math.max(0, redStop - c.s) / roadPerCurve);
      }
      const step = Math.min(distance, 0.4, available);
      if (step < 1e-7) { c.speed = 0; break; }
      const p = active ? m!.curve.sample(m!.progress + step) : this.graph.pointAt(c.edge, c.s + step, c.dir, c.lane);
      const bounds = { ...p, size: c.size };
      const overlaps = (o: Parameters<typeof trafficOverlap>[1]) => trafficOverlap(bounds, o, 0.18) &&
        (!trafficOverlap(c, o, 0.18) || Math.hypot(p.x - o.x, p.z - o.z) <= Math.hypot(c.x - o.x, c.z - o.z));
      this.walkerIndex.query(vehicleBounds(bounds, 1), this.walkerCandidates);
      const walkerHit = this.walkerCandidates.some(w => w.crossing && trafficOverlap(bounds, { ...w, y: p.y, hx: 1, hz: 0, size: [.7, 1.8, .7] }, .5));
      if (overlaps(body) || this.queryCars(vehicleBounds(bounds, .5)).some(o => o !== c && overlaps(o)) || walkerHit || (this.city && !trafficPoseClear(this.city, p, c.size))) { c.speed = 0; break; }
      distance -= step;
      if (active) {
        m!.progress += step;
        const u = m!.progress / m!.curve.length;
        if (m!.kind === 'route') {
          const progress = m!.busStart! + m!.busDistance! * u;
          const span = m!.busSpans!.find(span => progress < span.base + span.end - span.start - 1e-6) || m!.busSpans![m!.busSpans!.length - 1];
          c.edge = span.edge; c.dir = span.dir; c.s = Math.min(span.end, span.start + Math.max(0, progress - span.base));
          if (c.busRun?.path === m!.busPath) c.busRun.step = span.index;
        } else c.s = m!.startS + ((m!.kind === 'junction' || m!.kind === 'uturn' ? c.edge.len : m!.endS) - m!.startS) * u;
        if (m!.kind === 'lane') c.lane = c.lane + (m!.lane - c.lane) * step / Math.max(step, m!.curve.length - m!.progress + step);
        if (m!.progress >= m!.curve.length - 1e-6) {
          c.edge = m!.edge; c.dir = m!.dir; c.s = m!.endS; c.lane = m!.lane;
          if (m!.busStep !== undefined && c.busRun && c.busRun.path === m!.busPath) c.busRun.step = m!.busStep;
          if (m!.kind === 'junction' || m!.kind === 'uturn' || m!.kind === 'route') { c.base = c.laneT = c.lane; c.filtering = false; c.dwell = 0; }
          c.motion = undefined; c.planAfter = 0;
          // Plan the next corner before consuming any remaining frame distance.
          this.prepare(c); m = c.motion;
        }
      } else c.s += step;
      c.x = p.x; c.y = p.y; c.z = p.z; c.hx = p.hx; c.hz = p.hz;
      this.index.upsert(c, vehicleBounds(c, .8), c.order);
    }
    c.g.position.set(c.x, c.y + 0.02, c.z);
    c.g.rotation.set(0, Math.atan2(-c.hx, -c.hz), 0, 'YXZ');
  }
  update(dt: number, px: number, pz: number, player: { x: number; z: number; y: number; speed: number; hx?: number; hz?: number }, walkers: Walker[] = []) {
    this.plans = 0;
    this.budget.beginFrame(dt);
    this.t += dt; this.focusX = px; this.focusZ = pz;
    this.walkerIndex.clear();
    for (let wi = 0; wi < walkers.length; wi++) { const w = walkers[wi]; if (w.crossing) this.walkerIndex.upsert(w, { minX: w.x - .35, maxX: w.x + .35, minZ: w.z - .35, maxZ: w.z + .35 }, wi); }
    this.syncIndex();
    for (let i = (this.passengerExchanges?.length || 0) - 1; i >= 0; i--) {
      const exchange = this.passengerExchanges[i]; exchange.update(dt);
      if (exchange.finished || Math.hypot(exchange.group.position.x - px, exchange.group.position.z - pz) > 200) {
        this.scene.remove(exchange.group); this.passengerExchanges.splice(i, 1);
      }
    }
    for (let k = 0; k < 6 && this.cars.length < this.max; k++) this.spawn(px, pz);
    // over budget (moved somewhere quieter): retire the farthest vehicle once it is well out of the way
    if (this.cars.length > this.max) {
      let far = -1, fd = 160;
      for (let i = 0; i < this.cars.length; i++) { const d = Math.hypot(this.cars[i].x - px, this.cars[i].z - pz); if (d > fd && !this.pinned(this.cars[i])) { fd = d; far = i; } }
      if (far >= 0) { this.release(this.cars[far]); this.cars.splice(far, 1); }
    }
    for (const bucket of this.byEdge.values()) { bucket.length = 0; this.edgeBuckets.push(bucket); }
    this.byEdge.clear(); const byEdge = this.byEdge;
    for (const c of this.cars) { let bucket = byEdge.get(c.edge); if (!bucket) byEdge.set(c.edge, bucket = this.edgeBuckets.pop() || []); bucket.push(c); }
    this.planningCandidates.length = 0;
    for (const c of this.cars) if (!c.motion && c.dwell <= 0 && (this.planJobs.has(c) || this.t >= (c.planAfter || 0) && this.t >= (c.decisionAt || 0))) this.planningCandidates.push(c);
    // Waiting age prevents the stable movement order from starving distant buses.
    this.planningCandidates.sort((a,b) => ((this.pinned(b) ? 1000 : 0) + this.t - (b.decisionAt || 0) - Math.hypot(b.x-px,b.z-pz)/600) - ((this.pinned(a) ? 1000 : 0) + this.t - (a.decisionAt || 0) - Math.hypot(a.x-px,a.z-pz)/600));
    for (const c of this.planningCandidates) { this.prepare(c); if (!this.budget.available) break; }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - px, c.z - pz) > 340 && !this.pinned(c)) { this.release(c); this.cars.splice(i, 1); continue; }
      const halfL = c.size[2] / 2, halfW = c.size[0] / 2;
      if (c.dwell > 0) {
        c.speed = 0; c.dwell = Math.max(0, c.dwell - dt);
        if (c.dwell <= 0) { c.laneT = c.base; c.passengerExchange = undefined; c.planAfter = 0; }
        // No path replanning, yaw, creep or lane changes while passengers use the doors.
        continue;
      }
      this.prepare(c);
      let target = Math.min(c.want, c.edge.e.workZone ? c.edge.e.workZone.speed / 3.6 : Infinity);
      // follow whatever is ahead in an overlapping lane on the same edge; remember a stopped one as an obstacle
      let obs: { lane: number; halfW: number; s: number; halfL: number } | null = null;
      for (const o of byEdge.get(c.edge) || []) {
        if (o === c || o.dir !== c.dir || Math.abs(o.lane - c.lane) > (o.size[0] + c.size[0]) / 2 + 0.25) continue;
        const gap = o.s - c.s - (o.size[2] + c.size[2]) / 2;
        if (gap > -0.5 && gap < 5 + c.speed * 1.1) {
          target = Math.min(target, o.speed * 0.9, Math.max(0, (gap - 1.6) * 0.9));
          if (gap < (c.assertive ? 17 : 7) && o.speed < (c.assertive ? c.want * 0.6 : 1) && (!obs || o.s < obs.s)) obs = { lane: o.lane, halfW: o.size[0] / 2, s: o.s, halfL: o.size[2] / 2 };
        }
      }
      // the player's car is a vehicle like any other: queue behind it, honk, and squeeze past when there is room
      const rx = player.x - c.x, rz = player.z - c.z;
      const along = rx * c.hx + rz * c.hz, lat = rx * c.hz - rz * c.hx;    // lat > 0: player is to this vehicle's left
      const sameLevel = Math.abs(player.y - 0.55 - c.y) < 2;
      let blocked = false;
      if (sameLevel && along > -halfL && along < 16 + c.speed * 1.2 && Math.abs(lat) < halfW + 1.0 + 0.3) {
        const gap = along - halfL - 2.4;
        target = Math.min(target, Math.max(0, gap * 0.9));
        blocked = gap < 7 && Math.abs(player.speed) < 1.5;
        if (blocked && (!obs || c.s + along < obs.s)) obs = { lane: c.lane + lat, halfW: 1.0, s: c.s + along, halfL: 2.3 };
      }
      c.blockedT = blocked ? c.blockedT + dt : Math.max(0, c.blockedT - dt * 2);
      c.stuckT = obs && target < (c.assertive ? c.want * 0.7 : 0.8) ? c.stuckT + dt : Math.max(0, c.stuckT - dt);
      const canFilter = !c.edge.e.workZone && (c.group === 'bike' || c.group === 'auto' || (c.group === 'car' && this.r() < 0.03));
      if (obs && c.stuckT > (c.assertive ? 0.25 : 0.6) && !c.filtering && canFilter && this.t >= (c.laneChangeAt || 0) && (!c.motion || c.motion.progress < 0)) {
        // look for a gap beside whatever is stopped ahead (the player's car or a queue), inside this carriageway
        const [lo, hi] = this.laneRange(c.edge, c.size[0]);
        const need = obs.halfW + halfW + 0.65;
        const opts = [obs.lane - need, obs.lane + need].filter((v) => v >= lo && v <= hi).sort((a, b) => Math.abs(a - c.lane) - Math.abs(b - c.lane));
        const free = opts.find((v) => !(byEdge.get(c.edge) || []).some((o) => o !== c && o.dir === c.dir && Math.abs(o.lane - v) < (o.size[0] + c.size[0]) / 2 && o.s > c.s - 6 && o.s < obs!.s + 10));
        if (free !== undefined) { c.laneT = free; c.filtering = true; c.passS = obs.s + obs.halfL + halfL + 3; }
      }
      if (c.filtering) {
        if (c.motion?.kind === 'lane') target = Math.max(target, c.assertive ? 3 : 1.6);
        if (c.s > c.passS) { c.filtering = false; c.laneT = c.base; }
      }
      if (blocked && !c.filtering && c.blockedT > 1.2) {
        if ((c.honkT -= dt) <= 0) { c.honkT = this.r.range(1.0, 3.2); this.onHorn(c.group, c.x, c.z); }
      }
      // buses pull in at their stops for a few seconds
      if (c.group === 'bus') {
        if (c.busRun?.ended) target = 0;
        for (const st of (c.busRun ? c.busRun.stopPosition.edge === c.edge && c.busRun.stopPosition.dir === c.dir && !c.busRun.ended ? [c.busRun.stopPosition.stop] : [] : this.stopsByEdge.get(c.edge.e.id) || [])) {
          if (c.served.has(st)) continue;
          const leftSign = c.dir === 1 ? st.side : -st.side;
          if (leftSign < 0 && !c.edge.e.oneway) continue;
          const sd = c.dir === 1 ? st.s : c.edge.len - st.s, ahead = sd - c.s;
          if (ahead < -2 || ahead > 45) continue;
          // Leave room for the long body's nose/tail sweep during pull-in.
          c.laneT = c.busRun ? c.base : leftSign * (c.edge.e.w / 2 - halfW - 0.7);
          target = Math.min(target, Math.max(0, ahead * 0.55));
          if (ahead < 1.5 && c.speed < 0.6) {
            c.dwell = this.r.range(5, 6); c.speed = 0; target = 0; c.served.add(st);
            const exchange = new BusPassengerExchange(c, c.dwell, this.mats.vBody);
            exchange.group.userData = { route: c.busRun?.pattern.number || '', stopId: c.busRun?.pattern.stops[c.busRun.target] || '' };
            c.passengerExchange = exchange; (this.passengerExchanges ||= []).push(exchange); this.scene.add(exchange.group);
            if (c.busRun) { this.services?.served(c.busRun, c.edge, c.dir, c.s); if (!c.motion || c.motion.progress < 0) { c.motion = undefined; c.planAfter = 0; } }
          }
          break;
        }
      }
      // give way to people crossing
      for (const w of walkers) {
        if (!w.crossing) continue;
        const wx = w.x - c.x, wz = w.z - c.z, a2 = wx * c.hx + wz * c.hz, l2 = wx * c.hz - wz * c.hx;
        if (a2 > 0 && a2 < 7 + c.speed && Math.abs(l2) < halfW + 0.8) target = Math.min(target, Math.max(0, (a2 - halfL - 1.5) * 0.8));
      }
      // Mapped controls may be at a junction or midway along an edge. Braking
      // and the swept movement cap share the rendered stop bar, with room for
      // the whole vehicle nose (including an eleven-metre bus).
      const endNode = this.graph.nodes.get(c.dir === 1 ? c.edge.to : c.edge.from);
      if (!endNode) { this.release(c); this.cars.splice(i, 1); continue; }
      const redStop = this.redStop(c);
      if (redStop !== undefined) target = Math.min(target, Math.sqrt(8 * Math.max(0, redStop - c.s)));
      this.tryLane(c, player);
      if (c.motion) {
        const m = c.motion;
        if (m.kind === 'route' && m.busStop) {
          const remaining = m.progress < 0 ? m.curve.length + Math.max(0, m.startS - c.s) : Math.max(0, m.curve.length - m.progress);
          target = Math.min(target, Math.sqrt(4 * remaining));
        }
        // Braking starts on the approach, rather than after the vehicle yaws.
        const approach = m.progress < 0 ? Math.max(0, m.startS - c.s) : 0;
        target = Math.min(target, Math.sqrt(m.cap * m.cap + 2 * (c.group === 'bus' || c.group === 'truck' ? 2 : 3) * approach));
        if (m.progress < 0 && m.node && redStop !== undefined) target = Math.min(target, Math.max(0, (approach - 0.2) * 0.8));
      } else if (c.stopS !== undefined) target = Math.min(target, Math.sqrt(4 * Math.max(0, c.stopS - c.s)));
      c.speed += Math.max(-9 * dt, Math.min(3.2 * dt, target - c.speed));
      if (c.edge.e.workZone) c.speed = Math.min(c.speed, c.edge.e.workZone.speed / 3.6);
      this.advance(c, c.speed * dt, player, walkers);
      if (c.edge.e.workZone) c.speed = Math.min(c.speed, c.edge.e.workZone.speed / 3.6);
    }
    this.stats.plans += this.plans; this.stats.planningMs = this.budget.spentMs; this.stats.planningOverruns = this.budget.overruns;
  }
  // Ordinary chase views hide a vehicle across the camera-car sightline. During
  // a jump that vehicle is the stunt's reference, so retain it unless the actual
  // camera volume enters its body. The low support root can sit inside a padded
  // bus envelope even while the rolling Roadster clears the rendered roof.
  hideNear(cam: THREE.Vector3, tgt?: { x: number; y: number; z: number }, preserveOvertake = false) {
    for (const c of this.cars) {
      // Camera visibility follows the displayed pose, including interpolation.
      // A single decomposed Euler angle does not determine a quaternion's yaw.
      const forward = this.renderedForward.set(0, 0, -1).applyQuaternion(c.g.quaternion), p = c.g.position;
      const body = { x: p.x, y: p.y - .02, z: p.z, size: c.size, hx: forward.x, hz: forward.z };
      c.g.visible = !segmentHitsVehicle(cam, cam, body, 1.2) && !(!preserveOvertake && !this.pinned(c) && tgt && segmentHitsVehicle(cam, tgt, body, 0.6));
    }
  }
  // keep the player's car out of other vehicles: push it out along the shallowest side of the overlap
  pushOut(pos: { x: number; y: number; z: number }, halfW: number, halfL: number, bounds?: TrafficVerticalBounds): Car | null {
    let hit: Car | null = null;
    const { bottom, top } = playerVerticalBounds(pos.y, bounds);
    let lastOrder = -1;
    const radius = Math.hypot(halfW, halfL);
    for (;;) {
      const c = this.queryCars({ minX: pos.x - radius, maxX: pos.x + radius, minZ: pos.z - radius, maxZ: pos.z + radius }, this.playerCandidates).find(v => v.order > lastOrder);
      if (!c) break; lastOrder = c.order;
      if (bottom >= c.y + c.size[1] || top <= c.y) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      const pa = c.size[2] / 2 + halfL - Math.abs(along), ps = c.size[0] / 2 + halfW - Math.abs(side);
      if (pa <= 0 || ps <= 0) continue;
      if (ps < pa) { const k = (Math.sign(side) || 1) * ps; pos.x += c.hz * k; pos.z -= c.hx * k; }
      else { const k = (Math.sign(along) || 1) * pa; pos.x += c.hx * k; pos.z += c.hz * k; }
      hit = c;
    }
    return hit;
  }
  // overlap test against the player; returns the vehicle hit, if any
  hitTest(x: number, y: number, z: number, r: number, bounds?: TrafficVerticalBounds): Car | null {
    const { bottom, top } = playerVerticalBounds(y, bounds);
    for (const c of this.queryCars({ minX: x - r * 1.23, maxX: x + r * 1.23, minZ: z - r * 1.23, maxZ: z + r * 1.23 }, this.playerCandidates)) {
      if (bottom >= c.y + c.size[1] || top <= c.y) continue;
      const dx = x - c.x, dz = z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      if (Math.abs(along) < c.size[2] / 2 + r && Math.abs(side) < c.size[0] / 2 + r * 0.7) return c;
    }
    return null;
  }
}

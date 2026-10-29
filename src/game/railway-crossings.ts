import type { RoadEdge } from '../world/types';
import type { RailProfile } from '../world/railway-geometry';
import type { Wall } from '../world/city';
import { projectRailwayRun, railwayPoint, type RailwayRun, type RailDirection } from './railway-flow';

export const RAILWAY_WARNING_SECONDS = 18;
export const RAILWAY_GATE_CLOSE_SECONDS = 4;
export const RAILWAY_GATE_OPEN_SECONDS = 3;
export const RAILWAY_TAIL_CLEAR_SECONDS = 2;
export interface RailwayGate { x: number; y: number; z: number; hx: number; hz: number; s: number; side: -1 | 1 }
export interface RailwayCrossingSite {
  id: string; roadId: string; roadLength: number; roadS: number; x: number; y: number; z: number;
  hx: number; hz: number; width: number; halfSpan: number; railIds: string[]; gates: RailwayGate[];
  sourceRoad?: string;
  roadStops?: { roadId: string; roadLength: number; entry: number; exit: number }[];
}
export interface RailwayApproach { id: string; run: RailwayRun; s: number; dir: RailDirection; speed: number; length: number }
export interface RailwayRoadUser { x: number; y: number; z: number; hx?: number; hz?: number; halfLength?: number; halfWidth?: number }
export interface RailwayCrossingState { site: RailwayCrossingSite; closure: number; warning: boolean; occupied: boolean; clearSeconds: number }
export interface RailwayHornEvent { x: number; y: number; z: number; trainId: string; crossingId: string }
interface Path { length: number; sample(distance: number): { x: number; y: number; z: number; hx: number; hz: number } }
interface Pose { x: number; y: number; z: number; hx: number; hz: number }
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
type RailSegment = { rail: RailProfile; i: number };
const railGrids = new WeakMap<readonly RailProfile[], Map<string, RailSegment[]>>();

// Intersect actual source XY and interpolated model elevations. A flyover,
// railway bridge, tunnel or parallel road is never a level-crossing gate.
export function buildRailwayCrossingSites(roads: readonly RoadEdge[], profiles: readonly RailProfile[]): RailwayCrossingSite[] {
  let grid = railGrids.get(profiles); const cell = 100;
  if (!grid) { grid = new Map(); railGrids.set(profiles, grid);
  for (const rail of profiles) {
    if (rail.service) continue;
    for (let i = 1; i < rail.pts.length; i++) {
      const a = rail.pts[i - 1], b = rail.pts[i];
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++) {
          const key = `${x},${z}`, list = grid.get(key) || []; list.push({ rail, i }); grid.set(key, list);
        }
    }
  }
  }
  const sites: RailwayCrossingSite[] = [];
  for (const road of roads) {
    if (/^(railway|motorway|motorway_link|footway|path|steps|pedestrian|cycleway|bridleway)$/.test(road.cls) || road.pts.length < 2) continue;
    const cum = [0];
    for (let i = 1; i < road.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][1] - road.pts[i - 1][1]));
    const hits: { s: number; y: number; rail: string; span: number }[] = [];
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = cum[i] - cum[i - 1];
      if (length < .1) continue;
      const near = new Map<string, { rail: RailProfile; i: number }>();
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++)
          for (const r of grid.get(`${x},${z}`) || []) near.set(`${r.rail.id}:${r.i}`, r);
      for (const { rail, i: j } of near.values()) {
        const p = rail.pts[j - 1], q = rail.pts[j], rx = q[0] - p[0], rz = q[1] - p[1], railLength = Math.hypot(rx, rz), denominator = cross(dx, dz, rx, rz);
        if (railLength < .1 || Math.abs(denominator) / (length * railLength) < .25) continue;
        const u = cross(p[0] - a[0], p[1] - a[1], rx, rz) / denominator;
        const v = cross(p[0] - a[0], p[1] - a[1], dx, dz) / denominator;
        if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) continue;
        const y = (road.elev?.[i - 1] || 0) + ((road.elev?.[i] || 0) - (road.elev?.[i - 1] || 0)) * u;
        const railY = rail.elev[j - 1] + (rail.elev[j] - rail.elev[j - 1]) * v;
        if (Math.abs(y - railY) > .55) continue;
        const s = cum[i - 1] + u * length;
        if (!hits.some(h => h.rail === rail.id && Math.abs(h.s - s) < .3)) hits.push({ s, y, rail: rail.id, span: 3 / (Math.abs(denominator) / (length * railLength)) });
      }
    }
    hits.sort((a, b) => a.s - b.s);
    const groups: typeof hits[] = [];
    for (const hit of hits) {
      const last = groups.at(-1);
      if (last && hit.s - last.at(-1)!.s < 24) last.push(hit); else groups.push([hit]);
    }
    const point = (s: number) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = road.pts[i - 1], b = road.pts[i], len = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / len;
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, y: (road.elev?.[i - 1] || 0) + ((road.elev?.[i] || 0) - (road.elev?.[i - 1] || 0)) * u,
        hx: (b[0] - a[0]) / len, hz: (b[1] - a[1]) / len };
    };
    for (const group of groups) {
      const lo = Math.min(...group.map(h => h.s - h.span)) - 5, hi = Math.max(...group.map(h => h.s + h.span)) + 5;
      const s = (lo + hi) / 2, p = point(s), gates = ([-1, 1] as const).map(side => ({ ...point(side < 0 ? lo : hi), s: side < 0 ? lo : hi, side }));
      sites.push({ id: `rail-crossing:${road.id}:${Math.round(s * 10)}`, roadId: road.id, roadLength: cum.at(-1)!, roadS: s, ...p,
        width: Math.max(3, road.w), halfSpan: (hi - lo) / 2, railIds: [...new Set(group.map(h => h.rail))].sort(), gates,
        sourceRoad: road.seg || road.id.replace(/_\d+$/, '') });
    }
  }
  return sites;
}

// Overture splits a real street at each railway strand. Retain every road-ID
// stop position, while drawing and operating one pair outside the whole rake.
export function mergeRailwayCrossingSites(sites: readonly RailwayCrossingSite[]) {
  const groups: RailwayCrossingSite[][] = [];
  for (const site of sites) {
    const group = groups.find(group => group.some(other => {
      const dx = site.x - other.x, dz = site.z - other.z;
      return site.sourceRoad && site.sourceRoad === other.sourceRoad && Math.hypot(dx, dz) < 30 && Math.abs(site.y - other.y) < .5 &&
        Math.abs(site.hx * other.hx + site.hz * other.hz) > .96 && Math.abs(cross(dx, dz, other.hx, other.hz)) < 3;
    }));
    if (group) group.push(site); else groups.push([site]);
  }
  return groups.map(group => {
    if (group.length === 1) return group[0];
    group.sort((a,b) => a.id.localeCompare(b.id)); const first = group[0];
    const gates = group.flatMap(site => site.gates).map(gate => ({ gate, along: (gate.x - first.x) * first.hx + (gate.z - first.z) * first.hz })).sort((a,b) => a.along - b.along);
    const lo = gates[0], hi = gates.at(-1)!, middle = (lo.along + hi.along) / 2;
    const ends = [lo.gate, hi.gate];
    return { ...first, x: first.x + first.hx * middle, z: first.z + first.hz * middle, halfSpan: (hi.along - lo.along) / 2,
      width: Math.max(...group.map(site => site.width)), railIds: [...new Set(group.flatMap(site => site.railIds))].sort(),
      gates: ends.map((gate,i) => ({ ...gate, hx: first.hx, hz: first.hz, side: (i === 0 ? -1 : 1) as -1 | 1 })),
      roadStops: group.map(site => {
        const positions = ends.map(g => site.roadS + (g.x - site.x) * site.hx + (g.z - site.z) * site.hz).sort((a,b)=>a-b);
        return { roadId: site.roadId, roadLength: site.roadLength, entry: positions[0], exit: positions[1] };
      }),
    };
  });
}

export class RailwayCrossings {
  states: RailwayCrossingState[] = [];
  revision = 0; seconds = 0;
  onHorn: (event: RailwayHornEvent) => void = () => {};
  private roads = new Map<string, { state: RailwayCrossingState; length: number; entry: number; exit: number }[]>();
  private projections = new WeakMap<RailwayRun, Map<string, { s: number; band: number } | null>>();
  private paths = new WeakMap<Path, { state: RailwayCrossingState; distance: number }[]>();
  private horned = new Set<string>();
  constructor(sites: RailwayCrossingSite[]) { this.setSites(sites); }
  setSites(sites: RailwayCrossingSite[]) {
    sites = mergeRailwayCrossingSites(sites);
    const old = new Map(this.states.map(state => [state.site.id, state]));
    this.states = sites.map(site => ({ ...(old.get(site.id) || { closure: 0, warning: false, occupied: false, clearSeconds: 0 }), site }));
    this.roads.clear();
    for (const state of this.states) {
      const approaches = state.site.roadStops || [{ roadId: state.site.roadId, roadLength: state.site.roadLength, entry: state.site.gates[0].s, exit: state.site.gates[1].s }];
      for (const approach of approaches) { const list = this.roads.get(approach.roadId) || []; list.push({ state, length: approach.roadLength, entry: approach.entry, exit: approach.exit }); this.roads.set(approach.roadId, list); }
    }
    this.projections = new WeakMap(); this.paths = new WeakMap(); this.revision++;
  }
  private projection(state: RailwayCrossingState, run: RailwayRun) {
    let cache = this.projections.get(run); if (!cache) { cache = new Map(); this.projections.set(run, cache); }
    if (cache.has(state.site.id)) return cache.get(state.site.id)!;
    const site = state.site;
    let result: { s: number; band: number } | null = null;
    if (run.ways.some(w => site.railIds.includes(w.id))) {
      const p = projectRailwayRun(run, site.x, site.z), sine = Math.abs(cross(p.hx, p.hz, site.hx, site.hz));
      if (p.d < site.halfSpan + 2 && Math.abs(p.y - site.y) < .8 && sine > .2) result = { s: p.s, band: site.width / (2 * sine) + 4 };
    }
    cache.set(site.id, result); return result;
  }
  private inside(state: RailwayCrossingState, user: RailwayRoadUser) {
    const site = state.site, dx = user.x - site.x, dz = user.z - site.z;
    if (Math.abs(user.y - site.y) > 2) return false;
    const length = user.halfLength ?? 2.4, width = user.halfWidth ?? 1.1;
    const hx = user.hx ?? site.hx, hz = user.hz ?? site.hz;
    const along = Math.abs(hx * site.hx + hz * site.hz) * length + Math.abs(cross(hx, hz, site.hx, site.hz)) * width;
    const side = Math.abs(cross(hx, hz, site.hx, site.hz)) * length + Math.abs(hx * site.hx + hz * site.hz) * width;
    return Math.abs(dx * site.hx + dz * site.hz) < site.halfSpan + along - .5 && Math.abs(cross(dx, dz, site.hx, site.hz)) < site.width / 2 + side;
  }
  update(dt: number, trains: readonly RailwayApproach[], roadUsers: readonly RailwayRoadUser[] = []) {
    this.seconds += dt;
    const active = new Set(trains.map(train => train.id));
    for (const key of this.horned) if (!active.has(key.split('|')[0])) this.horned.delete(key);
    for (const state of this.states) {
      let approaching = false;
      state.occupied = roadUsers.some(user => this.inside(state, user));
      for (const train of trains) {
        const point = this.projection(state, train.run); if (!point) continue;
        const ahead = (point.s - train.s) * train.dir, tail = ahead + train.length;
        if (ahead <= Math.max(6, train.speed) * RAILWAY_WARNING_SECONDS + point.band && tail >= -point.band) approaching = true;
        const key = `${train.id}|${state.site.id}`;
        if (ahead > point.band && ahead < Math.max(160, train.speed * 12) && !this.horned.has(key)) {
          this.horned.add(key);
          const head = railwayPoint(train.run, train.s);
          // The event is tied to the locomotive, not a stationary gate bell.
          this.onHorn({ x: head.x, y: head.y, z: head.z, trainId: train.id, crossingId: state.site.id });
        }
      }
      if (approaching) { state.warning = true; state.clearSeconds = 0; }
      else if (state.warning) { state.clearSeconds += dt; if (state.clearSeconds >= RAILWAY_TAIL_CLEAR_SECONDS) state.warning = false; }
      const closing = state.warning && !state.occupied;
      state.closure = Math.max(0, Math.min(1, state.closure + (closing ? dt / RAILWAY_GATE_CLOSE_SECONDS : -dt / RAILWAY_GATE_OPEN_SECONDS)));
    }
  }
  get barriers(): Wall[] {
    const walls: Wall[] = [];
    for (const state of this.states) if (state.closure > .01) for (const gate of state.site.gates) {
      const half = state.site.width / 2 + .65;
      const angle = (1 - state.closure) * Math.PI / 2, horizontal = half * 2 * Math.cos(angle), vertical = half * 2 * Math.sin(angle);
      const x = gate.x + gate.hz * half * gate.side, z = gate.z - gate.hx * half * gate.side;
      walls.push({ ax: x, az: z, bx: x - gate.hz * gate.side * horizontal, bz: z + gate.hx * gate.side * horizontal,
        y0a: gate.y + .95, y0b: gate.y + .95 + vertical, y1a: gate.y + 1.15, y1b: gate.y + 1.15 + vertical, kind: 'rail' });
    }
    return walls;
  }
  private blocked(state: RailwayCrossingState) { return state.warning || state.closure > .01; }
  roadStop(roadId: string, dir: RailDirection, fromS: number, halfLength: number, origin?: RailwayRoadUser) {
    let best = Infinity;
    for (const approach of this.roads.get(roadId) || []) {
      const { state } = approach;
      if (!this.blocked(state)) continue;
      if (origin && this.inside(state, origin)) continue;
      const at = dir > 0 ? approach.entry : approach.length - approach.exit;
      const stop = at - halfLength - .8;
      // A car already admitted between the gates must clear the railway.
      if (fromS <= stop + .1) best = Math.min(best, stop);
    }
    return Number.isFinite(best) ? best : undefined;
  }
  pathStop(path: Path, from: number, halfLength: number, origin?: RailwayRoadUser) {
    let entries = this.paths.get(path);
    if (!entries) {
      entries = [];
      const count = Math.max(1, Math.ceil(path.length / 2));
      const middle = path.sample(path.length / 2);
      for (const state of this.states) {
      if (Math.hypot(state.site.x - middle.x, state.site.z - middle.z) > path.length / 2 + state.site.halfSpan + state.site.width + 10) continue;
      for (const gate of state.site.gates) {
        let previous = path.sample(0);
        for (let i = 1; i <= count; i++) {
          const p = path.sample(path.length * i / count), dx = p.x - previous.x, dz = p.z - previous.z;
          const toward = (dx * gate.hx + dz * gate.hz) * -gate.side;
          const a = ((previous.x - gate.x) * gate.hx + (previous.z - gate.z) * gate.hz) * -gate.side;
          const b = ((p.x - gate.x) * gate.hx + (p.z - gate.z) * gate.hz) * -gate.side;
          if (toward > 1e-6 && a <= 0 && b >= 0) {
            const u = -a / (b - a), x = previous.x + u * dx, z = previous.z + u * dz, y = previous.y + u * (p.y - previous.y);
            if (Math.abs(cross(x - gate.x, z - gate.z, gate.hx, gate.hz)) < state.site.width / 2 + 2 && Math.abs(y - gate.y) < 1)
              entries.push({ state, distance: path.length * (i - 1 + u) / count });
          }
          previous = p;
        }
      }
      }
      this.paths.set(path, entries);
    }
    let best = Infinity;
    for (const entry of entries) if (this.blocked(entry.state) && (!origin || !this.inside(entry.state, origin))) {
      const stop = entry.distance - halfLength - .8; if (from <= stop + .1) best = Math.min(best, stop);
    }
    return Number.isFinite(best) ? best : undefined;
  }
  movementBlocked(from: Pose, to: Pose, halfLength: number, halfWidth: number) {
    for (const state of this.states) if (this.blocked(state)) for (const gate of state.site.gates) {
      if (Math.abs(from.y - gate.y) > 1.8) continue;
      const direction = ((to.x - from.x) * gate.hx + (to.z - from.z) * gate.hz) * -gate.side;
      if (direction <= 1e-8) continue;
      const nose = Math.abs(from.hx * gate.hx + from.hz * gate.hz) * halfLength + Math.abs(cross(from.hx, from.hz, gate.hx, gate.hz)) * halfWidth;
      const a = ((from.x - gate.x) * gate.hx + (from.z - gate.z) * gate.hz) * -gate.side + nose + .3;
      const b = ((to.x - gate.x) * gate.hx + (to.z - gate.z) * gate.hz) * -gate.side + nose + .3;
      if (a > .15 || b < 0) continue; // already inside: keep the exit clear
      const side = Math.abs(cross(to.x - gate.x, to.z - gate.z, gate.hx, gate.hz));
      if (side <= state.site.width / 2 + halfWidth + .5) return true;
    }
    return false;
  }
  spawnBlocked(pose: Pose, halfLength: number, halfWidth: number) {
    return this.states.some(state => this.blocked(state) && this.inside(state, { ...pose, halfLength, halfWidth }));
  }
  trainAdvance(run: RailwayRun, headS: number, dir: RailDirection, requested: number) {
    let available = requested;
    for (const state of this.states) {
      const p = this.projection(state, run); if (!p) continue;
      const ahead = (p.s - headS) * dir;
      if (ahead < -p.band) continue; // locomotive is through; clear its tail
      if (state.closure < .999 || state.occupied) available = Math.min(available, Math.max(0, ahead - p.band - 5));
    }
    return available;
  }
  safeSpawn(run: RailwayRun, headS: number, dir: RailDirection, length: number) {
    let s = headS;
    for (let guard = 0; guard < this.states.length + 1; guard++) {
      let moved = false;
      for (const state of this.states) {
        const p = this.projection(state, run); if (!p) continue;
        const ahead = (p.s - s) * dir;
        if (ahead <= p.band + 6 && ahead + length >= -p.band) {
          s = p.s - dir * (p.band + 8); moved = true;
        }
      }
      if (!moved) break;
    }
    return Math.max(0, Math.min(run.len, s));
  }
}

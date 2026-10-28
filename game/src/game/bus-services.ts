import type { GEdge, RoadGraph } from './roadgraph';
import type { BusStop } from '../world/city';
import { busTurnPossible } from './bus-path';

export interface BusPattern { id: string; number: string; direction: string; from: string; to: string; stops: string[]; tripId: string; publishedTrips: number; alignmentIds?: string[] }
export interface BusAlignment {
  status: 'inferred_legal_road_path' | 'unresolved'; fromStop: string; toStop: string; reason?: string;
  steps?: { edge: string; dir: 1 | -1; from: number; to: number }[];
  pts?: [number, number][]; lengthM?: number; maxStopSnapM?: number;
  execution?: { status:'destination_dwell_verified'; stepSeconds:number; pathSha256?:string };
}
export interface BusFeed { schema: number; origin: { lat: number; lon: number }; stops: Record<string, [string, number, number]>; patterns: BusPattern[]; attribution: string; uncertainty: string; alignments?: Record<string, BusAlignment> }
interface Step { edge: GEdge; dir: 1 | -1 }
interface StopPosition extends Step { s: number; stop: BusStop }
export interface BusRun { pattern: BusPattern; target: number; path: Step[]; step: number; stopPosition: StopPosition; ended: boolean }
interface Leg { pattern: BusPattern; index: number; ax: number; az: number; bx: number; bz: number; alignment?: BusAlignment }

const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz;
  const u = ll ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll)) : 0;
  return { d: Math.hypot(x - ax - u * dx, z - az - u * dz), u };
};

// Static agency stop order determines service identity and destination. Schema 2
// carries reproducible directed road alignments: buses must use those exact edges,
// including on bends, never a nearby parallel street. These are reconstructed
// paths, not agency-supplied shapes or live route/diversion verification.
export class BusServices {
  private cells = new Map<string, Leg[]>();
  private stopCache = new Map<string, StopPosition | null>();
  private paths = new Map<string, Step[] | null>();
  private graphEdges: GEdge[]; private graphSize: number;
  private rejectedTurns = new Set<string>();
  private rejectedEdges = new Set<string>();
  clearExecutionRejections() {
    this.rejectedTurns.clear(); this.rejectedEdges.clear(); this.paths.clear();
  }
  rejectExecution(edge: GEdge, dir: 1 | -1, next?: Step) {
    if (next) this.rejectedTurns.add(`${edge.e.id}:${dir}>${next.edge.e.id}:${next.dir}`);
    else this.rejectedEdges.add(`${edge.e.id}:${dir}`);
    this.paths.clear();
  }
  private executableTurn(before: GEdge, fromDir: 1 | -1, after: GEdge, toDir: 1 | -1, s = 0) {
    return !this.rejectedEdges.has(`${after.e.id}:${toDir}`) && !this.rejectedTurns.has(`${before.e.id}:${fromDir}>${after.e.id}:${toDir}`)
      && busTurnPossible(this.graph, before, fromDir, after, toDir, s);
  }
  constructor(public graph: RoadGraph, public feed: BusFeed) {
    this.graphEdges = graph.edges; this.graphSize = graph.edges.length;
    for (const pattern of feed.patterns) for (let i = 0; i < pattern.stops.length - 1; i++) {
      const a = feed.stops[pattern.stops[i]], b = feed.stops[pattern.stops[i + 1]];
      if (!a || !b) continue;
      const length = Math.hypot(b[1] - a[1], b[2] - a[2]);
      if (length < 12 || length > 7000) continue;
      const alignment = pattern.alignmentIds ? feed.alignments?.[pattern.alignmentIds[i]] : undefined;
      if (feed.schema >= 2 && (!alignment || alignment.status !== 'inferred_legal_road_path')) continue;
      const leg = { pattern, index: i, ax: a[1], az: a[2], bx: b[1], bz: b[2], alignment };
      const pts = alignment?.pts || [[a[1], a[2]], [b[1], b[2]]], keys = new Set<string>();
      for (let h = 1; h < pts.length; h++) {
        const u = pts[h - 1], v = pts[h], n = Math.max(1, Math.ceil(Math.hypot(v[0] - u[0], v[1] - u[1]) / 200));
        for (let k = 0; k <= n; k++) keys.add(`${Math.floor((u[0] + (v[0] - u[0]) * k / n) / 250)},${Math.floor((u[1] + (v[1] - u[1]) * k / n) / 250)}`);
      }
      for (const key of keys) { const list = this.cells.get(key) || []; list.push(leg); this.cells.set(key, list); }
    }
  }
  private refreshGraph() {
    // Streamed streets can arrive after an earlier negative lookup, or be
    // removed/replaced without changing the final edge count. Cached GEdge
    // objects cannot authorize a bus to drive onto an unloaded old road.
    if (this.graphEdges === this.graph.edges && this.graphSize === this.graph.edges.length) return;
    this.graphEdges = this.graph.edges; this.graphSize = this.graph.edges.length;
    this.stopCache.clear(); this.paths.clear();
  }
  private locate(pattern: BusPattern, index: number): StopPosition | null {
    const sid = pattern.stops[index], key = `${pattern.id}:${index}`;
    if (this.stopCache.has(key)) return this.stopCache.get(key)!;
    const stop = this.feed.stops[sid], before = this.feed.stops[pattern.stops[Math.max(0, index - 1)]], after = this.feed.stops[pattern.stops[Math.min(pattern.stops.length - 1, index + 1)]];
    if (!stop || !before || !after) return null;
    const vx = after[1] - before[1], vz = after[2] - before[2], length = Math.hypot(vx, vz) || 1;
    let best: StopPosition | null = null, score = Infinity;
    for (const edge of this.graph.nearestEdges(stop[1], stop[2], 2)) {
      if (edge.e.w < 6 || edge.e.cls === 'service' || edge.len < 12) continue;
      for (let i = 1; i < edge.e.pts.length; i++) {
        const a = edge.e.pts[i - 1], b = edge.e.pts[i], q = segmentDistance(stop[1], stop[2], ...a, ...b);
        if (q.d > 100) continue;
        // A bus cannot dwell with its centre exactly on a graph split and then
        // instantly reverse/turn its eleven-metre body. Keep the inferred stop
        // inside a usable road section, still within100m of the published stop.
        const setback = Math.min(16, edge.len / 2);
        const s = Math.max(setback, Math.min(edge.len - setback, edge.cum[i - 1] + (edge.cum[i] - edge.cum[i - 1]) * q.u));
        for (const dir of [1, -1] as const) {
          if (edge.e.oneway === (dir === 1 ? 'forward' : 'backward')) continue;
          const p = this.graph.pointAt(edge, dir === 1 ? s : edge.len - s, dir);
          if (p.y > 1.5 && !/^motorway/.test(edge.e.cls)) continue;
          const dot = (p.hx * vx + p.hz * vz) / length;
          const actualDistance = Math.hypot(p.x - stop[1], p.z - stop[2]);
          if (actualDistance > 100) continue;
          // A short residential spur beside a named bus corridor must not win
          // solely because its endpoint is a few metres closer to the GTFS pin.
          const accessPenalty = edge.e.cls === 'residential' || edge.e.cls === 'living_street' ? 28 : edge.e.cls === 'unclassified' || edge.e.cls === 'unknown' ? 14 : 0;
          const cost = actualDistance + (1 - dot) * 18 + accessPenalty;
          if (cost >= score) continue;
          score = cost;
          const foot = this.graph.pointAt(edge, s, 1);
          best = { edge, dir, s: dir === 1 ? s : edge.len - s,
            stop: { edge: edge.e.id, s, side: dir, x: foot.x, z: foot.z, hx: p.hx, hz: p.hz } };
        }
      }
    }
    this.stopCache.set(key, best);
    return best;
  }
  private plan(edge: GEdge, dir: 1 | -1, s: number, target: StopPosition, leg: Leg): Step[] | null {
    if (leg.alignment) return this.alignedPath(leg.alignment, edge, dir, s);
    const fits = (e: GEdge, heading: 1 | -1, from: number, to: number) => {
      const a = heading === 1 ? from : e.len - to, b = heading === 1 ? to : e.len - from;
      const points = [this.graph.pointAt(e, from, heading), this.graph.pointAt(e, to, heading)];
      if (points.some(p => segmentDistance(p.x, p.z, leg.ax, leg.az, leg.bx, leg.bz).d > 550)) return false;
      return e.e.pts.every((p, i) => e.cum[i] <= a || e.cum[i] >= b || segmentDistance(p[0], p[1], leg.ax, leg.az, leg.bx, leg.bz).d <= 550);
    };
    if (edge === target.edge && dir === target.dir && target.s >= s) return fits(edge, dir, s, target.s) ? [{ edge, dir }] : null;
    if (!fits(edge, dir, s, edge.len) || !fits(target.edge, target.dir, 0, target.s)) return null;
    const goal = target.dir === 1 ? target.edge.from : target.edge.to;
    const key = `${edge.e.id}:${dir}:${leg.pattern.id}:${leg.index + 1}`;
    if (this.paths.has(key)) return this.paths.get(key)!;
    // Incoming direction is part of the search state. A node-only shortest path
    // can immediately reverse its incoming road or arrive facing an impossible
    // bus turn even though all source node IDs are connected.
    const stateKey = (e: GEdge, d: 1 | -1) => `${e.e.id}:${d}`;
    const initial = stateKey(edge, dir), states = new Map<string, Step>([[initial, { edge, dir }]]);
    const distance = new Map<string, number>([[initial, 0]]), previous = new Map<string, { state: string; step: Step }>();
    const physical = new Map<string, number>([[initial, edge.len - s]]);
    const maximumPhysical = Math.hypot(leg.bx - leg.ax, leg.bz - leg.az) * 3 + 300 - target.s;
    const queue: [number, string][] = [[0, initial]];
    const push = (value: [number, string]) => { queue.push(value); let i = queue.length - 1; while (i) { const p = (i - 1) >> 1; if (queue[p][0] <= value[0]) break; queue[i] = queue[p]; i = p; } queue[i] = value; };
    const pop = () => { const top = queue[0], last = queue.pop()!; if (queue.length) { let i = 0; while (i * 2 + 1 < queue.length) { let c = i * 2 + 1; if (c + 1 < queue.length && queue[c + 1][0] < queue[c][0]) c++; if (queue[c][0] >= last[0]) break; queue[i] = queue[c]; i = c; } queue[i] = last; } return top; };
    const end = this.graph.nodes.get(goal);
    let found: string | null = null, visited = 0; const corridorEdges = new Map<GEdge, boolean>(), closed = new Set<string>();
    while (queue.length && visited++ < 24000) {
      const [, id] = pop(); if (closed.has(id)) continue; closed.add(id);
      const incoming = states.get(id)!;
      const nodeId = incoming.dir === 1 ? incoming.edge.to : incoming.edge.from;
      const node = this.graph.nodes.get(nodeId); if (!node) continue;
      if (nodeId === goal && this.executableTurn(incoming.edge, incoming.dir, target.edge, target.dir, id === initial ? s : 0)) { found = id; break; }
      for (const out of node.out) {
        if (out.edge.e.w < 6 || out.edge.e.cls === 'service') continue;
        if (!this.executableTurn(incoming.edge, incoming.dir, out.edge, out.dir, id === initial ? s : 0)) continue;
        const next = out.dir === 1 ? out.edge.to : out.edge.from, n = this.graph.nodes.get(next); if (!n) continue;
        const corridor = segmentDistance(n.x, n.z, leg.ax, leg.az, leg.bx, leg.bz).d;
        if (corridor > 550) continue;
        if (!corridorEdges.has(out.edge)) corridorEdges.set(out.edge, fits(out.edge, out.dir, 0, out.edge.len));
        if (!corridorEdges.get(out.edge)) continue;
        // Prefer an arterial only while its actual drivable distance remains
        // inside the published-stop detour bound. Rejecting the cheapest long
        // path afterwards would overlook a shorter legal alternative.
        const metres = physical.get(id)! + out.edge.len;
        if (metres > maximumPhysical) continue;
        const cls = out.edge.e.cls;
        const roadPriority = cls === 'residential' || cls === 'living_street' ? 4 : cls === 'unclassified' || cls === 'unknown' ? 2.5 : cls === 'tertiary' || cls === 'tertiary_link' ? 1.25 : 1;
        const narrowPenalty = 1 + Math.max(0, 9 - out.edge.e.w) * .4;
        const cost = distance.get(id)! + out.edge.len * roadPriority * narrowPenalty * (1 + Math.min(3, corridor / 180)), nextState = stateKey(out.edge, out.dir);
        if (cost >= (distance.get(nextState) ?? Infinity)) continue;
        distance.set(nextState, cost); physical.set(nextState, metres); previous.set(nextState, { state: id, step: out }); states.set(nextState, out);
        push([cost + (end ? Math.hypot(n.x - end.x, n.z - end.z) : 0), nextState]);
      }
    }
    let result: Step[] | null = null;
    if (found) {
      const middle: Step[] = []; let id = found;
      while (id !== initial) { const prev = previous.get(id); if (!prev) break; middle.push(prev.step); id = prev.state; }
      if (id === initial) {
        result = [{ edge, dir }, ...middle.reverse(), { edge: target.edge, dir: target.dir }];
        result = result.filter((step, i) => !i || step.edge !== result![i - 1].edge || step.dir !== result![i - 1].dir);
      }
    }
    if (this.paths.size > 1800) this.paths.clear();
    this.paths.set(key, result); return result;
  }
  private leg(pattern: BusPattern, index: number): Leg | null {
    const a = this.feed.stops[pattern.stops[index]], b = this.feed.stops[pattern.stops[index + 1]];
    if (!a || !b) return null;
    const alignment = pattern.alignmentIds ? this.feed.alignments?.[pattern.alignmentIds[index]] : undefined;
    if (this.feed.schema >= 2 && (!alignment || alignment.status !== 'inferred_legal_road_path')) return null;
    return { pattern, index, ax: a[1], az: a[2], bx: b[1], bz: b[2], alignment };
  }
  private alignedPath(alignment: BusAlignment, edge: GEdge, dir: 1 | -1, s: number): Step[] | null {
    const steps = alignment.steps;
    if (alignment.status !== 'inferred_legal_road_path' || !steps?.length) return null;
    const start = steps.findIndex(v => v.edge === edge.e.id && v.dir === dir && s >= v.from - 2 && s <= v.to + .5);
    if (start < 0) return null;
    const path: Step[] = [];
    for (const item of steps.slice(start)) {
      const road = this.graph.byId.get(item.edge);
      if (!road || road.e.w < 6 || road.e.cls === 'service' || road.e.oneway === (item.dir === 1 ? 'forward' : 'backward')
          || item.from < 0 || item.to > road.len + .5 || item.to < item.from) return null;
      const prev = path[path.length - 1];
      if (prev && ((prev.dir === 1 ? prev.edge.to : prev.edge.from) !== (item.dir === 1 ? road.from : road.to)
          || !busTurnPossible(this.graph, prev.edge, prev.dir, road, item.dir))) return null;
      path.push({ edge: road, dir: item.dir });
    }
    return path;
  }
  private target(leg: Leg): StopPosition | null {
    if (!leg.alignment) return this.locate(leg.pattern, leg.index + 1);
    const item = leg.alignment.steps?.at(-1), edge = item && this.graph.byId.get(item.edge);
    if (!item || !edge || item.to > edge.len + .5 || edge.e.oneway === (item.dir === 1 ? 'forward' : 'backward')) return null;
    const p = this.graph.pointAt(edge, item.to, item.dir), s = item.dir === 1 ? item.to : edge.len - item.to;
    return { edge, dir: item.dir, s: item.to, stop: { edge: edge.e.id, s, side: item.dir, x: p.x, z: p.z, hx: p.hx, hz: p.hz } };
  }
  // Used offline by the alignment builder against the complete shipped network.
  // A failed/long/disconnected leg remains an explicit unresolved record.
  reconstruct(pattern: BusPattern, index: number): BusAlignment {
    const result: BusAlignment = { status: 'unresolved', fromStop: pattern.stops[index], toStop: pattern.stops[index + 1] };
    const a = this.feed.stops[result.fromStop], b = this.feed.stops[result.toStop];
    if (!a || !b) return { ...result, reason: 'missing_published_stop' };
    const direct = Math.hypot(b[1] - a[1], b[2] - a[2]);
    if (direct < 12 || direct > 7000) return { ...result, reason: 'stop_separation_outside_safe_range' };
    const start = this.locate(pattern, index), target = this.locate(pattern, index + 1);
    if (!start || !target) return { ...result, reason: 'no_ground_bus_width_road_within_100m' };
    const path = this.plan(start.edge, start.dir, start.s, target, { pattern, index, ax: a[1], az: a[2], bx: b[1], bz: b[2] });
    if (!path) return { ...result, reason: 'no_continuous_legal_path_in_stop_corridor' };
    const steps = path.map((p, i) => ({ edge: p.edge.e.id, dir: p.dir, from: i ? 0 : start.s, to: i === path.length - 1 ? target.s : p.edge.len }));
    const lengthM = steps.reduce((n, p) => n + p.to - p.from, 0);
    if (lengthM < 1 || lengthM > direct * 3 + 300) return { ...result, reason: 'implausible_stop_to_stop_detour' };
    const pts: [number, number][] = [];
    const append = (x: number, z: number) => { if (!pts.length || Math.hypot(x - pts[pts.length - 1][0], z - pts[pts.length - 1][1]) > .1) pts.push([+x.toFixed(1), +z.toFixed(1)]); };
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i], edge = path[i].edge, from = this.graph.pointAt(edge, step.from, step.dir), to = this.graph.pointAt(edge, step.to, step.dir);
      append(from.x, from.z);
      const indices = Array.from({ length: edge.cum.length }, (_, k) => k); if (step.dir === -1) indices.reverse();
      for (const k of indices) { const distance = step.dir === 1 ? edge.cum[k] : edge.len - edge.cum[k]; if (distance > step.from && distance < step.to) append(...edge.e.pts[k]); }
      append(to.x, to.z);
    }
    const first = pts[0], last = pts[pts.length - 1];
    return { ...result, status: 'inferred_legal_road_path', steps: steps.map(p => ({ ...p, from: +p.from.toFixed(3), to: +p.to.toFixed(3) })), pts,
      lengthM: +lengthM.toFixed(1), maxStopSnapM: +Math.max(Math.hypot(first[0] - a[1], first[1] - a[2]), Math.hypot(last[0] - b[1], last[1] - b[2])).toFixed(1) };
  }
  bind(edge: GEdge, dir: 1 | -1, s: number, random = 0): BusRun | null {
    this.refreshGraph();
    if (this.graph.byId.get(edge.e.id) !== edge) return null;
    const p = this.graph.pointAt(edge, s, dir), cx = Math.floor(p.x / 250), cz = Math.floor(p.z / 250), seen = new Set<Leg>();
    const choices: { leg: Leg; score: number }[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const leg of this.cells.get(`${cx + i},${cz + j}`) || []) {
      if (seen.has(leg)) continue; seen.add(leg);
      const item = leg.alignment?.steps?.find(v => v.edge === edge.e.id && v.dir === dir && s >= v.from - 2 && s < v.to - 1);
      if (leg.alignment && !item) continue;
      const q = item ? { d: 0, u: 0 } : segmentDistance(p.x, p.z, leg.ax, leg.az, leg.bx, leg.bz), length = Math.hypot(leg.bx - leg.ax, leg.bz - leg.az);
      const dot = item ? 1 : ((leg.bx - leg.ax) * p.hx + (leg.bz - leg.az) * p.hz) / length;
      if (q.d > 90 || dot < 0.15 || q.u > 0.98) continue;
      choices.push({ leg, score: q.d + (1 - dot) * 25 });
    }
    choices.sort((a, b) => a.score - b.score);
    const candidates = choices.filter(c => c.score <= (choices[0]?.score ?? 0) + 18).slice(0, 10);
    if (candidates.length) { const k = Math.floor(random * candidates.length) % candidates.length; candidates.push(...candidates.splice(0, k)); }
    for (const { leg } of candidates.slice(0, 4)) {
      const stopPosition = this.target(leg); if (!stopPosition) continue;
      if (stopPosition.edge === edge && stopPosition.dir === dir && stopPosition.s < s + 8) continue;
      const path = this.plan(edge, dir, s, stopPosition, leg); if (!path) continue;
      // Ambient spawning must leave approach room for the first physical
      // corner; a bus cannot materialise two metres before a turn it otherwise
      // executes correctly when driven from its published previous stop.
      let distance = 0, safe = true;
      const needsApproach = (dot:number, room:number) => {
        if (dot >= .995) return false;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        return room + .01 < Math.max(.2, 13 * Math.tan(angle / 2));
      };
      for (let index = 0; index < path.length && distance < 75; index++) {
        const item = path[index], start = index ? 0 : s, end = index === path.length - 1 ? stopPosition.s : item.edge.len;
        for (let k = 1; k < item.edge.cum.length - 1; k++) {
          const at = item.dir === 1 ? item.edge.cum[k] : item.edge.len - item.edge.cum[k];
          if (at <= start || at >= end || distance + at - start >= 75) continue;
          const a = this.graph.pointAt(item.edge, at - .001, item.dir), b = this.graph.pointAt(item.edge, at + .001, item.dir);
          if (needsApproach(a.hx * b.hx + a.hz * b.hz, distance + at - start)) safe = false;
        }
        distance += Math.max(0, end - start);
        const next = path[index + 1];
        if (next && distance < 75) {
          const a = this.graph.pointAt(item.edge, item.edge.len - .001, item.dir), b = this.graph.pointAt(next.edge, .001, next.dir);
          if (needsApproach(a.hx * b.hx + a.hz * b.hz, distance)) safe = false;
        }
      }
      if (!safe) continue;
      return { pattern: leg.pattern, target: leg.index + 1, path, step: 0, stopPosition, ended: false };
    }
    return null;
  }
  next(run: BusRun, edge: GEdge, dir: 1 | -1, s = 0): Step | null {
    this.refreshGraph();
    if (run.ended) return null;
    if (run.path.slice(run.step).some(s => this.graph.byId.get(s.edge.e.id) !== s.edge)) {
      const leg = this.leg(run.pattern, run.target - 1), target = leg && this.target(leg);
      if (!leg || !target || this.graph.byId.get(edge.e.id) !== edge) return null;
      const path = this.plan(edge, dir, s, target, leg);
      if (!path) return null;
      run.path = path; run.step = 0; run.stopPosition = target;
    }
    if (run.path[run.step]?.edge !== edge || run.path[run.step]?.dir !== dir) {
      if (run.path[run.step + 1]?.edge === edge && run.path[run.step + 1]?.dir === dir) run.step++;
      else return null;
    }
    return run.path[run.step + 1] || null;
  }
  served(run: BusRun, edge: GEdge, dir: 1 | -1, s = 0) {
    this.refreshGraph();
    if (run.target >= run.pattern.stops.length - 1) { run.ended = true; return; }
    const leg = this.leg(run.pattern, run.target), target = leg && this.target(leg);
    if (!leg || !target) { run.ended = true; return; }
    const path = this.plan(edge, dir, s, target, leg);
    if (!path) { run.ended = true; return; }
    run.target++; run.stopPosition = target; run.path = path; run.step = 0;
  }
}

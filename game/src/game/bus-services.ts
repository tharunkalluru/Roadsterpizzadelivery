import type { GEdge, RoadGraph } from './roadgraph';
import type { BusStop } from '../world/city';

export interface BusPattern { id: string; number: string; direction: string; from: string; to: string; stops: string[]; tripId: string; publishedTrips: number }
export interface BusFeed { schema: number; origin: { lat: number; lon: number }; stops: Record<string, [string, number, number]>; patterns: BusPattern[]; attribution: string; uncertainty: string }
interface Step { edge: GEdge; dir: 1 | -1 }
interface StopPosition extends Step { s: number; stop: BusStop }
export interface BusRun { pattern: BusPattern; target: number; path: Step[]; step: number; stopPosition: StopPosition; ended: boolean }
interface Leg { pattern: BusPattern; index: number; ax: number; az: number; bx: number; bz: number }

const segmentDistance = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz;
  const u = ll ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / ll)) : 0;
  return { d: Math.hypot(x - ax - u * dx, z - az - u * dz), u };
};

// Static agency stop order determines service identity and destination. The feed
// supplies no shapes: paths between adjacent stops are inferred on legal roads,
// constrained to that stop corridor. Missing links never grant random turns.
export class BusServices {
  private cells = new Map<string, Leg[]>();
  private stopCache = new Map<string, StopPosition | null>();
  private paths = new Map<string, Step[] | null>();
  private graphEdges: GEdge[]; private graphSize: number;
  constructor(public graph: RoadGraph, public feed: BusFeed) {
    this.graphEdges = graph.edges; this.graphSize = graph.edges.length;
    for (const pattern of feed.patterns) for (let i = 0; i < pattern.stops.length - 1; i++) {
      const a = feed.stops[pattern.stops[i]], b = feed.stops[pattern.stops[i + 1]];
      if (!a || !b) continue;
      const length = Math.hypot(b[1] - a[1], b[2] - a[2]);
      if (length < 12 || length > 7000) continue;
      const leg = { pattern, index: i, ax: a[1], az: a[2], bx: b[1], bz: b[2] };
      const keys = new Set<string>(), n = Math.max(1, Math.ceil(length / 200));
      for (let k = 0; k <= n; k++) keys.add(`${Math.floor((a[1] + (b[1] - a[1]) * k / n) / 250)},${Math.floor((a[2] + (b[2] - a[2]) * k / n) / 250)}`);
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
      if (edge.e.w < 6 || edge.e.cls === 'service') continue;
      for (let i = 1; i < edge.e.pts.length; i++) {
        const a = edge.e.pts[i - 1], b = edge.e.pts[i], q = segmentDistance(stop[1], stop[2], ...a, ...b);
        if (q.d > 100) continue;
        const s = edge.cum[i - 1] + (edge.cum[i] - edge.cum[i - 1]) * q.u;
        for (const dir of [1, -1] as const) {
          if (edge.e.oneway === (dir === 1 ? 'forward' : 'backward')) continue;
          const p = this.graph.pointAt(edge, dir === 1 ? s : edge.len - s, dir);
          if (p.y > 1.5 && !/^motorway/.test(edge.e.cls)) continue;
          const dot = (p.hx * vx + p.hz * vz) / length;
          const cost = q.d + (1 - dot) * 18;
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
    const fits = (e: GEdge, heading: 1 | -1, from: number, to: number) => {
      const a = heading === 1 ? from : e.len - to, b = heading === 1 ? to : e.len - from;
      const points = [this.graph.pointAt(e, from, heading), this.graph.pointAt(e, to, heading)];
      if (points.some(p => segmentDistance(p.x, p.z, leg.ax, leg.az, leg.bx, leg.bz).d > 550)) return false;
      return e.e.pts.every((p, i) => e.cum[i] <= a || e.cum[i] >= b || segmentDistance(p[0], p[1], leg.ax, leg.az, leg.bx, leg.bz).d <= 550);
    };
    if (edge === target.edge && dir === target.dir && target.s >= s) return fits(edge, dir, s, target.s) ? [{ edge, dir }] : null;
    if (!fits(edge, dir, s, edge.len) || !fits(target.edge, target.dir, 0, target.s)) return null;
    const start = dir === 1 ? edge.to : edge.from, goal = target.dir === 1 ? target.edge.from : target.edge.to;
    const key = `${edge.e.id}:${dir}:${leg.pattern.id}:${leg.index + 1}`;
    if (this.paths.has(key)) return this.paths.get(key)!;
    const distance = new Map<string, number>([[start, 0]]), previous = new Map<string, { node: string; step: Step }>();
    const queue: [number, string][] = [[0, start]];
    const push = (value: [number, string]) => { queue.push(value); let i = queue.length - 1; while (i) { const p = (i - 1) >> 1; if (queue[p][0] <= value[0]) break; queue[i] = queue[p]; i = p; } queue[i] = value; };
    const pop = () => { const top = queue[0], last = queue.pop()!; if (queue.length) { let i = 0; while (i * 2 + 1 < queue.length) { let c = i * 2 + 1; if (c + 1 < queue.length && queue[c + 1][0] < queue[c][0]) c++; if (queue[c][0] >= last[0]) break; queue[i] = queue[c]; i = c; } queue[i] = last; } return top; };
    const end = this.graph.nodes.get(goal);
    let found = false, visited = 0; const corridorEdges = new Map<GEdge, boolean>();
    while (queue.length && visited++ < 2000) {
      const [, id] = pop(), node = this.graph.nodes.get(id); if (!node) continue;
      if (id === goal) { found = true; break; }
      for (const out of node.out) {
        if (out.edge.e.w < 6 || out.edge.e.cls === 'service') continue;
        const next = out.dir === 1 ? out.edge.to : out.edge.from, n = this.graph.nodes.get(next); if (!n) continue;
        const corridor = segmentDistance(n.x, n.z, leg.ax, leg.az, leg.bx, leg.bz).d;
        if (corridor > 550) continue;
        if (!corridorEdges.has(out.edge)) corridorEdges.set(out.edge, fits(out.edge, out.dir, 0, out.edge.len));
        if (!corridorEdges.get(out.edge)) continue;
        const cost = distance.get(id)! + out.edge.len * (1 + Math.min(3, corridor / 180));
        if (cost >= (distance.get(next) ?? Infinity)) continue;
        distance.set(next, cost); previous.set(next, { node: id, step: out });
        push([cost + (end ? Math.hypot(n.x - end.x, n.z - end.z) : 0), next]);
      }
    }
    let result: Step[] | null = null;
    if (found) {
      const middle: Step[] = []; let id = goal;
      while (id !== start) { const prev = previous.get(id); if (!prev) break; middle.push(prev.step); id = prev.node; }
      if (id === start) {
        result = [{ edge, dir }, ...middle.reverse(), { edge: target.edge, dir: target.dir }];
        result = result.filter((step, i) => !i || step.edge !== result![i - 1].edge || step.dir !== result![i - 1].dir);
      }
    }
    if (this.paths.size > 1800) this.paths.clear();
    this.paths.set(key, result); return result;
  }
  bind(edge: GEdge, dir: 1 | -1, s: number, random = 0): BusRun | null {
    this.refreshGraph();
    if (this.graph.byId.get(edge.e.id) !== edge) return null;
    const p = this.graph.pointAt(edge, s, dir), cx = Math.floor(p.x / 250), cz = Math.floor(p.z / 250), seen = new Set<Leg>();
    const choices: { leg: Leg; score: number }[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const leg of this.cells.get(`${cx + i},${cz + j}`) || []) {
      if (seen.has(leg)) continue; seen.add(leg);
      const q = segmentDistance(p.x, p.z, leg.ax, leg.az, leg.bx, leg.bz), length = Math.hypot(leg.bx - leg.ax, leg.bz - leg.az);
      const dot = ((leg.bx - leg.ax) * p.hx + (leg.bz - leg.az) * p.hz) / length;
      if (q.d > 90 || dot < 0.15 || q.u > 0.98) continue;
      choices.push({ leg, score: q.d + (1 - dot) * 25 });
    }
    choices.sort((a, b) => a.score - b.score);
    const candidates = choices.filter(c => c.score <= (choices[0]?.score ?? 0) + 18).slice(0, 10);
    if (candidates.length) { const k = Math.floor(random * candidates.length) % candidates.length; candidates.push(...candidates.splice(0, k)); }
    for (const { leg } of candidates.slice(0, 4)) {
      const stopPosition = this.locate(leg.pattern, leg.index + 1); if (!stopPosition) continue;
      if (stopPosition.edge === edge && stopPosition.dir === dir && stopPosition.s < s + 8) continue;
      const path = this.plan(edge, dir, s, stopPosition, leg); if (!path) continue;
      return { pattern: leg.pattern, target: leg.index + 1, path, step: 0, stopPosition, ended: false };
    }
    return null;
  }
  next(run: BusRun, edge: GEdge, dir: 1 | -1, s = 0): Step | null {
    this.refreshGraph();
    if (run.ended) return null;
    if (run.path.slice(run.step).some(s => this.graph.byId.get(s.edge.e.id) !== s.edge)) {
      const a = this.feed.stops[run.pattern.stops[run.target - 1]], b = this.feed.stops[run.pattern.stops[run.target]], target = this.locate(run.pattern, run.target);
      if (!a || !b || !target || this.graph.byId.get(edge.e.id) !== edge) return null;
      const path = this.plan(edge, dir, s, target, { pattern: run.pattern, index: run.target - 1, ax: a[1], az: a[2], bx: b[1], bz: b[2] });
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
    const a = this.feed.stops[run.pattern.stops[run.target]], b = this.feed.stops[run.pattern.stops[run.target + 1]];
    const target = this.locate(run.pattern, run.target + 1);
    if (!a || !b || !target) { run.ended = true; return; }
    const path = this.plan(edge, dir, s, target, { pattern: run.pattern, index: run.target, ax: a[1], az: a[2], bx: b[1], bz: b[2] });
    if (!path) { run.ended = true; return; }
    run.target++; run.stopPosition = target; run.path = path; run.step = 0;
  }
}

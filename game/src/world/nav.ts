import type { DirectedEdge, WorldCore } from './schema';
import { RoadIndex, wrapAngle, type SurfaceHit } from './roadIndex';

/** Binary-heap Dijkstra over the directed road graph (MASTER §15). Never draws straight-line shortcuts. */
export class NavGraph {
  readonly edges = new Map<string, DirectedEdge>();
  /** outgoing directed edges at node */
  readonly outAt = new Map<string, string[]>();

  constructor(public readonly core: WorldCore, public readonly roads: RoadIndex) {
    for (const d of core.directed) {
      this.edges.set(d.id, d);
      const arr = this.outAt.get(d.fromNode) ?? [];
      arr.push(d.id);
      this.outAt.set(d.fromNode, arr);
    }
  }

  /**
   * Shortest path between directed edges. `fromAlong` = distance already travelled on the
   * first edge's travel direction. Returns the list of directed edge ids including both ends.
   */
  route(fromEdge: string, toEdges: string[], fromAlong = 0): { path: string[]; lengthM: number } | null {
    const targets = new Set(toEdges);
    const start = this.edges.get(fromEdge);
    if (!start) return null;
    if (targets.has(fromEdge)) return { path: [fromEdge], lengthM: 0 };
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const heap: [number, string][] = [];
    const push = (d: number, id: string) => {
      heap.push([d, id]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = (): [number, string] | undefined => {
      if (!heap.length) return undefined;
      const top = heap[0]; const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const startCost = Math.max(0, start.lengthM - fromAlong);
    dist.set(fromEdge, startCost);
    push(startCost, fromEdge);
    while (heap.length) {
      const [d, id] = pop()!;
      if (d > (dist.get(id) ?? Infinity)) continue;
      if (targets.has(id) && id !== fromEdge) {
        const path = [id];
        let cur = id;
        while (prev.has(cur)) { cur = prev.get(cur)!; path.push(cur); }
        path.reverse();
        return { path, lengthM: d };
      }
      const e = this.edges.get(id)!;
      for (const n of e.next) {
        const ne = this.edges.get(n);
        if (!ne) continue;
        const nd = d + ne.lengthM;
        if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, id); push(nd, n); }
      }
    }
    return null;
  }

  /** directed edge id for travelling a road in a given heading */
  directedFor(hit: SurfaceHit, heading: number): { id: string; along: number; wrongWay: boolean } {
    const fwdDiff = Math.abs(wrapAngle(heading - hit.heading));
    const wantForward = fwdDiff <= Math.PI / 2;
    const fid = `${hit.roadId}:f`, bid = `${hit.roadId}:b`;
    const hasF = this.edges.has(fid), hasB = this.edges.has(bid);
    if (wantForward) {
      if (hasF) return { id: fid, along: hit.along, wrongWay: false };
      return { id: bid, along: hit.road.lengthM - hit.along, wrongWay: true };
    }
    if (hasB) return { id: bid, along: hit.road.lengthM - hit.along, wrongWay: false };
    return { id: fid, along: hit.along, wrongWay: true };
  }

  /** world point at distance `d` along a directed edge */
  pointOnDirected(id: string, d: number) {
    const e = this.edges.get(id)!;
    const len = this.roads.roadLength(e.roadId);
    const along = e.forward ? d : len - d;
    const p = this.roads.pointAlong(e.roadId, Math.max(0, Math.min(len, along)));
    return { ...p, heading: e.forward ? p.heading : wrapAngle(p.heading + Math.PI) };
  }

  /** follow the straightest continuation to predict a path ahead (used by flight forecasts) */
  straightestNext(id: string): string | null {
    const e = this.edges.get(id);
    if (!e || !e.next.length) return null;
    const endH = this.pointOnDirected(id, e.lengthM - 0.01).heading;
    let best: string | null = null, bestD = Infinity;
    for (const n of e.next) {
      const h = this.pointOnDirected(n, 0.5).heading;
      const d = Math.abs(wrapAngle(h - endH));
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** advance `dist` metres along a directed chain (straightest or along given route) */
  advance(id: string, along: number, dist: number, route?: string[]): { id: string; along: number; x: number; z: number; y: number; heading: number } {
    let cur = id, a = along + dist;
    let guard = 0;
    while (guard++ < 64) {
      const e = this.edges.get(cur)!;
      if (a <= e.lengthM) break;
      let nxt: string | null = null;
      if (route) { const i = route.indexOf(cur); if (i >= 0 && i + 1 < route.length) nxt = route[i + 1]; }
      if (!nxt) nxt = this.straightestNext(cur);
      if (!nxt) { a = e.lengthM; break; }
      a -= e.lengthM; cur = nxt;
    }
    const p = this.pointOnDirected(cur, a);
    return { id: cur, along: a, ...p };
  }
}

export type Maneuver = { kind: 'straight' | 'left' | 'right' | 'uturn' | 'arrive'; distanceM: number; roadName: string | null };

/** Next meaningful maneuver along a route (turn angle threshold 30°). */
export function nextManeuver(nav: NavGraph, route: string[], curIdx: number, along: number): Maneuver {
  let dist = nav.edges.get(route[curIdx])!.lengthM - along;
  for (let i = curIdx; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const ea = nav.edges.get(a)!;
    const ha = nav.pointOnDirected(a, Math.max(0, ea.lengthM - 3)).heading;
    const hb = nav.pointOnDirected(b, Math.min(3, nav.edges.get(b)!.lengthM)).heading;
    const turn = wrapAngle(hb - ha);
    const rb = nav.roads.roads.get(nav.edges.get(b)!.roadId)!;
    const ra = nav.roads.roads.get(ea.roadId)!;
    if (Math.abs(turn) > Math.PI * 0.8) return { kind: 'uturn', distanceM: dist, roadName: rb.name };
    // heading increases counter-clockwise seen from above (h = atan2(-dx,-dz)); positive turn = left
    if (Math.abs(turn) > 0.52 || (ra.name !== rb.name && Math.abs(turn) > 0.35)) return { kind: turn > 0 ? 'left' : 'right', distanceM: dist, roadName: rb.name };
    dist += nav.edges.get(b)!.lengthM;
  }
  return { kind: 'arrive', distanceM: dist, roadName: null };
}

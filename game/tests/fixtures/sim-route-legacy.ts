// Frozen synchronous reference from baseline bd7313d6; retained to verify resumable search identity.
import { hasCentreMedian } from '../../src/world/city';
import { constructionLane } from '../../src/world/construction';
import type { GEdge, GNode, RoadRoute, RoadGraph } from '../../src/game/roadgraph';
import type { XZ } from '../../src/world/types';
const COST: Record<string, number> = { motorway: 0.7, motorway_link: 0.8, trunk: 0.8, primary: 0.85, secondary: 0.9, tertiary: 0.95, service: 1.4, living_street: 1.3 };
function offsetHeading(pts: XZ[], low: number, high: number): XZ {
  while (Math.hypot(pts[high][0] - pts[low][0], pts[high][1] - pts[low][1]) < 1 && (low > 0 || high < pts.length - 1)) {
    if (high < pts.length - 1) high++;
    if (low > 0) low--;
  }
  const dx = pts[high][0] - pts[low][0], dz = pts[high][1] - pts[low][1], length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

// small binary heap for Dijkstra / A*
class Heap { a: [number, string][] = [];
  push(v: [number, string]) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

export function legacyRoute(this: RoadGraph, fromX: number, fromZ: number, toX: number, toZ: number, car?: { hx: number; hz: number; y: number; edgeId?: string }, targetY = 0, sourceY = car?.y || 0): RoadRoute | null {
    type Point = [number, number, number];
    const on = this.edgeAt(fromX, fromZ, sourceY, car);
    let sourceOffset = 0;
    if (on && car && on.g.e.oneway) {
      const p = this.pointAt(on.g, on.s, 1);
      const half = Math.max(0, on.g.e.w / 2 - 1.25);
      sourceOffset = Math.max(-half, Math.min(half, (fromX - p.x) * p.hz - (fromZ - p.z) * p.hx));
    }
    const sourceDir = on?.g.e.oneway === 'forward' ? -1 : 1;
    const laneFraction = on && car && on.g.e.oneway ? sourceOffset * sourceDir / Math.max(.01, on.g.e.w / 2 - 1.25) : 0;
    // HUD progress is measured along these lane-offset points, so its total must
    // use the same geometry. The final approach remains a distance estimate.
    const result = (pts: Point[], complete: boolean, edgeIds: string[] = []): RoadRoute => {
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
      const last = pts[pts.length - 1];
      if (last) len += Math.hypot(toX - last[0], toZ - last[2]);
      if (!on && pts.length) len += Math.hypot(fromX - pts[0][0], fromZ - pts[0][2]);
      return { pts, len, complete, edgeIds };
    };
    // A centreline is inside the raised divider on a two-way arterial. Keep guidance
    // on the left carriageway of the actual traversal, including the destination leg.
    // A one-way carriageway can hold several lanes. Preserve the car's travel-
    // relative lane fraction through split edges (and reversed source geometry),
    // rather than jumping back to the centre at each OSM segment boundary.
    const lane = (g: GEdge, dir: 1 | -1) => constructionLane(g.e, dir) ?? (g.e.oneway && car ? laneFraction * Math.max(0, g.e.w / 2 - 1.25) : hasCentreMedian(g.e) ? Math.min(3.5, g.e.w / 4) : 0);
    const at = (g: GEdge, s: number, dir: 1 | -1): Point => {
      const p = this.pointAt(g, dir === 1 ? s : g.len - s, dir, lane(g, dir));
      return [p.x, p.y, p.z];
    };
    const vertex = (g: GEdge, i: number, dir: 1 | -1): Point => {
      const p = g.e.pts[i], [hx, hz] = offsetHeading(g.e.pts, Math.max(0, i - 1), Math.min(g.e.pts.length - 1, i + 1)), off = lane(g, dir) * dir;
      return [p[0] + hz * off, g.e.elev?.[i] || 0, p[1] - hx * off];
    };
    const side = (g: GEdge, s: number, x: number, z: number): 1 | -1 | 0 => {
      if (!hasCentreMedian(g.e)) return 0;
      const p = this.pointAt(g, s, 1), offset = (x - p.x) * p.hz - (z - p.z) * p.hx;
      return Math.abs(offset) < 0.9 ? 0 : offset > 0 ? 1 : -1;
    };
    const legal = (g: GEdge, d: 1 | -1) => d === 1 ? g.e.oneway !== 'forward' : g.e.oneway !== 'backward';
    // A delivery lies on a road segment, not necessarily at a junction. Route to either legal
    // entrance of that segment, then follow its actual bends to the stop.
    const target = this.edgeAt(toX, toZ, targetY);
    const ends = new Map<string, { pts: Point[]; len: number; cost: number }>();
    if (target) {
      const g = target.g, foot = this.pointAt(g, target.s, 1);
      const offset = Math.hypot(toX - foot.x, toZ - foot.z);
      const targetSide = side(g, target.s, toX, toZ);
      for (const d of [1, -1] as const) {
        if (!legal(g, d) || (targetSide && d !== targetSide)) continue;
        const pts: Point[] = [];
        if (d === 1) for (let i = 0; i <= target.i; i++) pts.push(vertex(g, i, d));
        else for (let i = g.e.pts.length - 1; i > target.i; i--) pts.push(vertex(g, i, d));
        // The beacon identifies the exact stop. Do not draw an unverified driveway
        // connector from the road through a shop/compound boundary.
        pts.push(at(g, target.s, d));
        const along = d === 1 ? target.s : g.len - target.s;
        const node = d === 1 ? g.from : g.to;
        const finish = { pts, len: along + offset, cost: along * (COST[g.e.cls] || 1) + offset };
        if (!ends.has(node) || finish.cost < ends.get(node)!.cost) ends.set(node, finish);
      }
    } else {
      // Distant streets may not yet be streamed; use the permanent road network as an overview.
      const b = this.nearestNode(toX, toZ, 40, targetY, true); if (!b) return null;
      const len = Math.hypot(toX - b.x, toZ - b.z);
      ends.set(b.id, { pts: [[b.x, b.y, b.z]], len, cost: len });
    }
    const dist = new Map<string, number>(), prev = new Map<string, { node: string; edge: GEdge; dir: 1 | -1 }>();
    const open = new Heap();
    const lead = new Map<string, [number, number, number][]>();      // seed node -> points from the car to it
    const leadLen = new Map<string, number>();
    const leadEdge = new Map<string, string>();
    let direct: RoadRoute | null = null, bestCost = Infinity, endNode: string | null = null;
    // Nearest-node fallback is an overview estimate, not a drivable connection from
    // a courtyard or rooftop. Require a road surface for live grounded guidance.
    if (car && (!on || on.d > on.g.e.w / 2 + 0.25)) return null;
    if (on) {
      const g = on.g, P = g.e.pts, E = g.e.elev;
      const tx = P[on.i + 1][0] - P[on.i][0], tz = P[on.i + 1][1] - P[on.i][1];
      const roadSide = car ? side(g, on.s, fromX, fromZ) : 0;
      const ahead: 1 | -1 = roadSide || (!car || tx * car.hx + tz * car.hz >= 0 ? 1 : -1);
      for (const d of [ahead, -ahead as 1 | -1]) {
        if (!legal(g, d)) continue;
        const back = !!car && d !== ahead;
        if (back && hasCentreMedian(g.e)) continue;
        const targetSide = target?.g === g ? side(g, target.s, toX, toZ) : 0;
        if (target?.g === g && (!targetSide || targetSide === d) && (target.s - on.s) * d >= 0) {
          const foot = this.pointAt(g, target.s, 1), pts: Point[] = [];
          pts.push(at(g, on.s, d));
          if (d === 1) for (let i = on.i + 1; i <= target.i; i++) pts.push(vertex(g, i, d));
          else for (let i = on.i; i > target.i; i--) pts.push(vertex(g, i, d));
          pts.push(at(g, target.s, d));
          const along = Math.abs(target.s - on.s), offset = Math.hypot(toX - foot.x, toZ - foot.z);
          const cost = along * (COST[g.e.cls] || 1) + offset + (back ? 90 : 0);
          if (cost < bestCost) { bestCost = cost; direct = result(pts, on.d <= g.e.w / 2 + 0.25, [g.e.id]); }
        }
        const node = d === 1 ? g.to : g.from, n = this.nodes.get(node); if (!n) continue;
        const along = d === 1 ? g.len - on.s : on.s;
        const cost = along * (COST[g.e.cls] || 1) + (back ? 90 : 0);
        if (cost < (dist.get(node) ?? 1e15)) {
          dist.set(node, cost); open.push([cost, node]);
          const pts: Point[] = [at(g, on.s, d)];
          if (d === 1) for (let i = on.i + 1; i < P.length; i++) pts.push(vertex(g, i, d));
          else for (let i = on.i; i >= 0; i--) pts.push(vertex(g, i, d));
          lead.set(node, pts); leadLen.set(node, along); leadEdge.set(node, g.e.id);
        }
      }
    }
    if (!open.size) { const a = this.nearestNode(fromX, fromZ, 8, sourceY); if (!a) return null; open.push([0, a.id]); dist.set(a.id, 0); lead.set(a.id, []); leadLen.set(a.id, Math.hypot(a.x - fromX, a.z - fromZ)); }
    const heur = (n: GNode) => Math.hypot(n.x - toX, n.z - toZ) * 0.7;
    const closed = new Set<string>();
    let it = 0;
    while (open.size && it++ < 400000) {
      const [priority, id] = open.pop();
      if (priority >= bestCost) break;
      if (closed.has(id)) continue; closed.add(id);
      const n = this.nodes.get(id); if (!n) continue; const dn = dist.get(id)!;
      const end = ends.get(id);
      if (end && dn + end.cost < bestCost) { bestCost = dn + end.cost; endNode = id; direct = null; }
      for (const o of n.out) {
        const nid = o.dir === 1 ? o.edge.to : o.edge.from;
        const nn = this.nodes.get(nid); if (!nn) continue;
        const nd = dn + o.edge.len * (COST[o.edge.e.cls] || 1);
        if (nd < (dist.get(nid) ?? 1e15)) { dist.set(nid, nd); prev.set(nid, { node: id, edge: o.edge, dir: o.dir }); open.push([nd + heur(nn), nid]); }
      }
    }
    if (direct) return direct;
    if (endNode === null) return null;
    const chain: { edge: GEdge; dir: 1 | -1 }[] = [];
    let cur = endNode; while (prev.has(cur)) { const p = prev.get(cur)!; chain.unshift({ edge: p.edge, dir: p.dir }); cur = p.node; }
    if (!lead.has(cur)) return null;
    const pts: [number, number, number][] = [...lead.get(cur)!]; let len = leadLen.get(cur) || 0;
    for (const c of chain) {
      const P = c.edge.e.pts, E = c.edge.e.elev;
      const idx = c.dir === 1 ? P.map((_, i) => i) : P.map((_, i) => P.length - 1 - i);
      for (const i of idx) pts.push(vertex(c.edge, i, c.dir));
      len += c.edge.len;
    }
    const end = ends.get(endNode)!;
    pts.push(...end.pts);
    return result(pts, !!target && !!on && on.d <= on.g.e.w / 2 + 0.25, [leadEdge.get(cur), ...chain.map(c => c.edge.e.id), target?.g.e.id].filter((id): id is string => !!id));
  }

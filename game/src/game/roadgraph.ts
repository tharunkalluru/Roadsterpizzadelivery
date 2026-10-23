import type { RoadEdge, XZ } from '../world/types';
import { hasCentreMedian } from '../world/city';

export interface GEdge { e: RoadEdge; len: number; cum: number[]; from: string; to: string }
export interface GNode { id: string; x: number; z: number; out: { edge: GEdge; dir: 1 | -1 }[]; signal: boolean }

const DRIVE = new Set(['motorway', 'motorway_link', 'trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'unknown']);
const COST: Record<string, number> = { motorway: 0.7, motorway_link: 0.8, trunk: 0.8, primary: 0.85, secondary: 0.9, tertiary: 0.95, service: 1.4, living_street: 1.3 };

// small binary heap for Dijkstra / A*
class Heap { a: [number, string][] = [];
  push(v: [number, string]) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

// Directed road network. The main roads of the whole city are always present (GPS anywhere);
// streets of the tiles around the player are added and removed as tiles stream in and out.
export class RoadGraph {
  nodes = new Map<string, GNode>(); edges: GEdge[] = []; byId = new Map<string, GEdge>();
  grid = new Map<string, GEdge[]>(); permanent = new Set<string>();
  constructor(roads: RoadEdge[], signals: XZ[] = []) {
    this.addRoads(roads, signals, true);
  }
  addRoads(roads: RoadEdge[], signals: XZ[] = [], permanent = false) {
    let anon = this.edges.length;
    for (const e of roads) {
      if (!DRIVE.has(e.cls) || this.byId.has(e.id) || (e as any).ctx) continue;
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
      // a deck end and a ground road can share a node in the data (a street ending under a flyover); keep them apart
      const lv = (i: number) => (e.elev && e.elev[i] > 1.5 ? '^' : '');
      const from = e.from ? e.from + lv(0) : `x${anon++}`, to = e.to ? e.to + lv(e.pts.length - 1) : `x${anon++}`;
      const g: GEdge = { e, len: cum[cum.length - 1], cum, from, to };
      if (g.len < 1) continue;
      this.edges.push(g); this.byId.set(e.id, g);
      if (permanent) this.permanent.add(e.id);
      for (const [id, p] of [[from, e.pts[0]], [to, e.pts[e.pts.length - 1]]] as [string, XZ][]) {
        if (!this.nodes.has(id)) this.nodes.set(id, { id, x: p[0], z: p[1], out: [], signal: false });
      }
      const fwdOk = e.oneway !== 'forward', backOk = e.oneway !== 'backward';   // `oneway` names the DENIED heading
      if (fwdOk) this.nodes.get(from)!.out.push({ edge: g, dir: 1 });
      if (backOk) this.nodes.get(to)!.out.push({ edge: g, dir: -1 });
      for (const k of this.cellsOf(e.pts)) { const l = this.grid.get(k) || this.grid.set(k, []).get(k)!; l.push(g); }
    }
    this.markSignals(signals);
  }
  cellsOf(pts: XZ[]) {
    const ks = new Set<string>();
    for (let i = 0; i < pts.length; i++) {
      ks.add(`${Math.floor(pts[i][0] / 60)},${Math.floor(pts[i][1] / 60)}`);
      if (i) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 30); for (let k = 1; k < n; k++) ks.add(`${Math.floor((a[0] + (b[0] - a[0]) * k / n) / 60)},${Math.floor((a[1] + (b[1] - a[1]) * k / n) / 60)}`); }
    }
    return ks;
  }
  // Signals are remembered by position and re-applied whenever roads arrive: a junction on a tile border only
  // has all its arms once the neighbouring tile is in, and a divided road's crossing has one node per carriageway.
  signalPts = new Set<XZ>();
  markSignals(signals: XZ[]) {
    for (const s of signals) this.signalPts.add(s);
    for (const s of this.signalPts) {
      const cand: [GNode, number][] = [];
      for (const g of this.nearestEdges(s[0], s[1], 0)) for (const id of [g.from, g.to]) {
        const n = this.nodes.get(id); if (!n) continue;
        const d = Math.hypot(n.x - s[0], n.z - s[1]); if (d >= 22) continue;
        if (!cand.some((c) => c[0] === n)) cand.push([n, d]);
      }
      const deg = (n: GNode) => { let k = 0; for (const g of this.nearestEdges(n.x, n.z, 0)) { if (g.from === n.id) k++; if (g.to === n.id) k++; } return k; };
      const junctions = cand.filter((c) => deg(c[0]) >= 3).sort((a, b) => a[1] - b[1]);
      junctions.forEach(([n, d], i) => { if (i === 0 || d < 16) n.signal = true; });
    }
  }
  forgetSignals(signals: XZ[]) { for (const s of signals) this.signalPts.delete(s); }
  removeRoads(ids: string[]) {
    const gone = new Set<GEdge>();
    for (const id of ids) { const g = this.byId.get(id); if (!g || this.permanent.has(id)) continue; gone.add(g); this.byId.delete(id); }
    if (!gone.size) return gone;
    this.edges = this.edges.filter((g) => !gone.has(g));
    for (const g of gone) {
      for (const id of [g.from, g.to]) {
        const n = this.nodes.get(id); if (!n) continue;
        n.out = n.out.filter((o) => !gone.has(o.edge));
        if (!n.out.length && ![...this.nearestEdges(n.x, n.z, 0)].some((x) => !gone.has(x) && (x.from === id || x.to === id))) this.nodes.delete(id);
      }
      for (const k of this.cellsOf(g.e.pts)) { const l = this.grid.get(k); if (!l) continue; const f = l.filter((x) => !gone.has(x)); if (f.length) this.grid.set(k, f); else this.grid.delete(k); }
    }
    return gone;
  }
  pointAt(g: GEdge, s: number, dir: 1 | -1, lateral = 0): { x: number; y: number; z: number; hx: number; hz: number } {
    const d = dir === 1 ? s : g.len - s;
    let i = 1; while (i < g.cum.length - 1 && g.cum[i] < d) i++;
    const a = g.e.pts[i - 1], b = g.e.pts[i], seg = g.cum[i] - g.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (d - g.cum[i - 1]) / seg));
    let hx = (b[0] - a[0]) / seg, hz = (b[1] - a[1]) / seg;
    if (dir === -1) { hx = -hx; hz = -hz; }
    const ya = g.e.elev ? g.e.elev[i - 1] : 0, yb = g.e.elev ? g.e.elev[i] : 0;
    // drive on the left: left of heading (hx,hz) is (hz,-hx)
    return { x: a[0] + (b[0] - a[0]) * u + hz * lateral, y: ya + (yb - ya) * u, z: a[1] + (b[1] - a[1]) * u - hx * lateral, hx, hz };
  }
  nearestEdges(x: number, z: number, r = 1): GEdge[] {
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60), out = new Set<GEdge>();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const g of this.grid.get(`${cx + i},${cz + j}`) || []) out.add(g);
    return [...out];
  }
  nearestNode(x: number, z: number, maxR = 8): GNode | null {
    for (let r = 2; r <= maxR; r += 2) {
      let best: GNode | null = null, bd = 1e9;
      for (const g of this.nearestEdges(x, z, r)) for (const id of [g.from, g.to]) {
        const n = this.nodes.get(id); if (!n) continue; const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd && n.out.length) { bd = d; best = n; }
      }
      if (best) return best;
    }
    return null;
  }
  // A* over directed edges (binary heap); returns a polyline for the GPS ribbon and its length
  // the road the car is on: nearest segment at the car's height
  edgeAt(x: number, z: number, y = 0): { g: GEdge; s: number; i: number; d: number } | null {
    let best: { g: GEdge; s: number; i: number; d: number } | null = null;
    for (const g of this.nearestEdges(x, z, 1)) {
      const P = g.e.pts, E = g.e.elev;
      for (let i = 0; i < P.length - 1; i++) {
        const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2));
        const ey = E ? E[i] + (E[i + 1] - E[i]) * u : 0;
        if (Math.abs(ey - y) > 3.5) continue;
        const d = Math.hypot(P[i][0] + dx * u - x, P[i][1] + dz * u - z);
        if (d < g.e.w / 2 + 4 && (!best || d < best.d)) best = { g, s: g.cum[i] + Math.sqrt(L2) * u, i, d };
      }
    }
    return best;
  }
  // GPS route. With the car's heading, it starts along the car's own road towards the junction ahead; turning back is
  // only offered where the road has no divider and it is legal, and costs a U-turn penalty.
  route(fromX: number, fromZ: number, toX: number, toZ: number, car?: { hx: number; hz: number; y: number }): { pts: [number, number, number][]; len: number } | null {
    const b = this.nearestNode(toX, toZ, 40);
    if (!b) return null;
    const dist = new Map<string, number>(), prev = new Map<string, { node: string; edge: GEdge; dir: 1 | -1 }>();
    const open = new Heap();
    const lead = new Map<string, [number, number, number][]>();      // seed node -> points from the car to it
    const leadLen = new Map<string, number>();
    const on = car ? this.edgeAt(fromX, fromZ, car.y) : null;
    if (on) {
      const g = on.g, P = g.e.pts, E = g.e.elev;
      const tx = P[on.i + 1][0] - P[on.i][0], tz = P[on.i + 1][1] - P[on.i][1];
      const ahead: 1 | -1 = tx * car!.hx + tz * car!.hz >= 0 ? 1 : -1;
      const legal = (d: 1 | -1) => (d === 1 ? g.e.oneway !== 'forward' : g.e.oneway !== 'backward');
      for (const d of [ahead, -ahead as 1 | -1]) {
        if (!legal(d) && !(d === ahead && !legal(-ahead as 1 | -1))) continue;    // wrong way on a one-way: still let them out ahead
        const back = d !== ahead;
        if (back && hasCentreMedian(g.e)) continue;
        const node = d === 1 ? g.to : g.from, n = this.nodes.get(node); if (!n) continue;
        const along = d === 1 ? g.len - on.s : on.s;
        const cost = along * (COST[g.e.cls] || 1) + (back ? 90 : 0);
        if (cost < (dist.get(node) ?? 1e15)) {
          dist.set(node, cost); open.push([cost, node]);
          const pts: [number, number, number][] = [];
          if (d === 1) for (let i = on.i + 1; i < P.length; i++) pts.push([P[i][0], E ? E[i] : 0, P[i][1]]);
          else for (let i = on.i; i >= 0; i--) pts.push([P[i][0], E ? E[i] : 0, P[i][1]]);
          lead.set(node, pts); leadLen.set(node, along);
        }
      }
    }
    if (!open.size) { const a = this.nearestNode(fromX, fromZ); if (!a) return null; open.push([0, a.id]); dist.set(a.id, 0); lead.set(a.id, []); leadLen.set(a.id, Math.hypot(a.x - fromX, a.z - fromZ)); }
    const heur = (n: GNode) => Math.hypot(n.x - b.x, n.z - b.z) * 0.7;
    const closed = new Set<string>();
    let it = 0;
    while (open.size && it++ < 400000) {
      const [, id] = open.pop();
      if (closed.has(id)) continue; closed.add(id);
      if (id === b.id) break;
      const n = this.nodes.get(id); if (!n) continue; const dn = dist.get(id)!;
      for (const o of n.out) {
        const nid = o.dir === 1 ? o.edge.to : o.edge.from;
        const nn = this.nodes.get(nid); if (!nn) continue;
        const nd = dn + o.edge.len * (COST[o.edge.e.cls] || 1);
        if (nd < (dist.get(nid) ?? 1e15)) { dist.set(nid, nd); prev.set(nid, { node: id, edge: o.edge, dir: o.dir }); open.push([nd + heur(nn), nid]); }
      }
    }
    if (!prev.has(b.id) && !lead.has(b.id)) return null;
    const chain: { edge: GEdge; dir: 1 | -1 }[] = [];
    let cur = b.id; while (prev.has(cur)) { const p = prev.get(cur)!; chain.unshift({ edge: p.edge, dir: p.dir }); cur = p.node; }
    if (!lead.has(cur)) return null;
    const pts: [number, number, number][] = [[fromX, car?.y ?? 0, fromZ], ...lead.get(cur)!]; let len = leadLen.get(cur) || 0;
    for (const c of chain) {
      const P = c.edge.e.pts, E = c.edge.e.elev;
      const idx = c.dir === 1 ? P.map((_, i) => i) : P.map((_, i) => P.length - 1 - i);
      for (const i of idx) pts.push([P[i][0], E ? E[i] : 0, P[i][1]]);
      len += c.edge.len;
    }
    pts.push([toX, 0, toZ]);
    return { pts, len };
  }
}

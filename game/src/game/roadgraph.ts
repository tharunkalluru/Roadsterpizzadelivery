import type { RoadEdge, XZ } from '../world/types';
import { hasCentreMedian } from '../world/city';
import type { SignalApproach, SignalSite } from '../world/signals';
import { constructionLane } from '../world/construction';

export interface GEdge { e: RoadEdge; len: number; cum: number[]; from: string; to: string }
export interface SignalControl { site: SignalSite; approach: SignalApproach }
export interface GNode { id: string; x: number; y: number; z: number; out: { edge: GEdge; dir: 1 | -1 }[]; signal: boolean; signalControls?: SignalControl[] }
export interface RoadRoute { pts: [number, number, number][]; len: number; complete?: boolean; edgeIds?: string[] }

const DRIVE = new Set(['motorway', 'motorway_link', 'trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'unknown']);
const COST: Record<string, number> = { motorway: 0.7, motorway_link: 0.8, trunk: 0.8, primary: 0.85, secondary: 0.9, tertiary: 0.95, service: 1.4, living_street: 1.3 };

// Sub-metre source chords can encode a surveying kink at an otherwise straight
// road split. They must not swing a lane offset several metres sideways. Keep
// every source coordinate, but use a usable neighbouring chord for its normal.
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

// Directed road network. The main roads of the whole city are always present (GPS anywhere);
// streets of the tiles around the player are added and removed as tiles stream in and out.
export class RoadGraph {
  nodes = new Map<string, GNode>(); edges: GEdge[] = []; byId = new Map<string, GEdge>();
  grid = new Map<string, GEdge[]>(); permanent = new Set<string>();
  revision = 0;
  private levelNodes = new Map<string, { id: string; y: number }[]>();
  private nodeAtLevel(id: string, y: number) {
    const levels = this.levelNodes.get(id) || [];
    let level = levels.find(l => Math.abs(l.y - y) <= .75);
    if (!level) { level = { id: !levels.length && Math.abs(y) <= 1.5 ? id : `${id}^${Math.round(y * 10)}`, y }; levels.push(level); this.levelNodes.set(id, levels); }
    return level.id;
  }
  constructor(roads: RoadEdge[], signals: SignalSite[] = []) {
    this.addRoads(roads, signals, true);
  }
  addRoads(roads: RoadEdge[], signals: SignalSite[] = [], permanent = false) {
    let anon = this.edges.length, added = false;
    for (const e of roads) {
      if (!DRIVE.has(e.cls) || this.byId.has(e.id) || (e as any).ctx) continue;
      const cum = [0];
      for (let i = 1; i < e.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
      // a deck end and a ground road can share a node in the data (a street ending under a flyover); keep them apart
      const from = e.from ? this.nodeAtLevel(e.from, e.elev?.[0] || 0) : `x${anon++}`, to = e.to ? this.nodeAtLevel(e.to, e.elev?.[e.pts.length - 1] || 0) : `x${anon++}`;
      const g: GEdge = { e, len: cum[cum.length - 1], cum, from, to };
      if (g.len < 1) continue;
      this.edges.push(g); this.byId.set(e.id, g); added = true;
      if (permanent) this.permanent.add(e.id);
      for (const [id, p, y] of [[from, e.pts[0], e.elev?.[0] || 0], [to, e.pts[e.pts.length - 1], e.elev?.[e.pts.length - 1] || 0]] as [string, XZ, number][]) {
        if (!this.nodes.has(id)) this.nodes.set(id, { id, x: p[0], y, z: p[1], out: [], signal: false });
      }
      const fwdOk = e.oneway !== 'forward', backOk = e.oneway !== 'backward';   // `oneway` names the DENIED heading
      if (fwdOk) this.nodes.get(from)!.out.push({ edge: g, dir: 1 });
      if (backOk) this.nodes.get(to)!.out.push({ edge: g, dir: -1 });
      for (const k of this.cellsOf(e.pts)) { const l = this.grid.get(k) || this.grid.set(k, []).get(k)!; l.push(g); }
    }
    this.markSignals(signals);
    if (added) this.revision++;
  }
  cellsOf(pts: XZ[]) {
    const ks = new Set<string>();
    for (let i = 0; i < pts.length; i++) {
      ks.add(`${Math.floor(pts[i][0] / 60)},${Math.floor(pts[i][1] / 60)}`);
      if (i) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 30); for (let k = 1; k < n; k++) ks.add(`${Math.floor((a[0] + (b[0] - a[0]) * k / n) / 60)},${Math.floor((a[1] + (b[1] - a[1]) * k / n) / 60)}`); }
    }
    return ks;
  }
  // Keep the complete mapped controller while neighboring roads stream in.
  // Bind exact approach edge + legal direction; XY proximity never controls a
  // flyover or an unrelated parallel road. Rebuilding also clears stale flags.
  signalSites = new Map<string, SignalSite>();
  private signalOwners = new Map<string, Set<SignalSite>>();
  private edgeSignals = new Map<string, SignalControl[]>();
  private controlledNodes = new Set<GNode>();
  markSignals(signals: SignalSite[]) {
    for (const site of signals) {
      const owners = this.signalOwners.get(site.id) || new Set<SignalSite>(); owners.add(site); this.signalOwners.set(site.id, owners);
      // A tile-border copy is one controller, never a second phase source.
      this.signalSites.set(site.id, [...owners].sort((a, b) => b.approaches.length - a.approaches.length)[0]);
    }
    this.edgeSignals.clear();
    // Only nodes marked by the previous binding pass need clearing. Scanning
    // the whole city's permanent graph on each tile activation causes bursts.
    for (const node of this.controlledNodes) { node.signal = false; node.signalControls = []; }
    this.controlledNodes.clear();
    for (const site of this.signalSites.values()) for (const approach of site.approaches) {
      const edge = this.byId.get(approach.edge);
      if (!edge || (approach.dir === 1 ? edge.e.oneway === 'forward' : edge.e.oneway === 'backward')) continue;
      const point = this.pointAt(edge, approach.stopS, approach.dir);
      if (Math.abs(point.y - approach.y) > .75) continue;
      const control = { site, approach }, key = `${approach.edge}:${approach.dir}`;
      const controls = this.edgeSignals.get(key) || []; controls.push(control); this.edgeSignals.set(key, controls);
      if (approach.node) {
        const node = this.nodes.get(approach.dir === 1 ? edge.to : edge.from);
        const rawNode = approach.dir === 1 ? edge.e.to : edge.e.from;
        if (node && rawNode === approach.node && Math.abs(node.y - approach.y) <= 1.5) {
          node.signal = true; (node.signalControls ||= []).push(control);
          this.controlledNodes.add(node);
        }
      }
    }
    for (const controls of this.edgeSignals.values()) controls.sort((a, b) => a.approach.stopS - b.approach.stopS);
  }
  signalsFor(edge: GEdge, dir: 1 | -1) { return this.edgeSignals.get(`${edge.e.id}:${dir}`) || []; }
  forgetSignals(signals: SignalSite[]) {
    for (const site of signals) {
      const owners = this.signalOwners.get(site.id); if (!owners) continue;
      owners.delete(site);
      if (!owners.size) { this.signalOwners.delete(site.id); this.signalSites.delete(site.id); }
      else this.signalSites.set(site.id, [...owners].sort((a, b) => b.approaches.length - a.approaches.length)[0]);
    }
    this.markSignals([]);
  }
  removeRoads(ids: string[]) {
    const gone = new Set<GEdge>();
    for (const id of ids) { const g = this.byId.get(id); if (!g || this.permanent.has(id)) continue; gone.add(g); this.byId.delete(id); }
    if (!gone.size) return gone;
    this.revision++;
    this.edges = this.edges.filter((g) => !gone.has(g));
    for (const g of gone) {
      for (const id of [g.from, g.to]) {
        const n = this.nodes.get(id); if (!n) continue;
        n.out = n.out.filter((o) => !gone.has(o.edge));
        if (!n.out.length && ![...this.nearestEdges(n.x, n.z, 0)].some((x) => !gone.has(x) && (x.from === id || x.to === id))) this.nodes.delete(id);
      }
      for (const k of this.cellsOf(g.e.pts)) { const l = this.grid.get(k); if (!l) continue; const f = l.filter((x) => !gone.has(x)); if (f.length) this.grid.set(k, f); else this.grid.delete(k); }
    }
    this.markSignals([]);
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
    const [offsetX, offsetZ] = lateral ? offsetHeading(g.e.pts, i - 1, i) : [hx * dir, hz * dir];
    return { x: a[0] + (b[0] - a[0]) * u + offsetZ * dir * lateral, y: ya + (yb - ya) * u, z: a[1] + (b[1] - a[1]) * u - offsetX * dir * lateral, hx, hz };
  }
  nearestEdges(x: number, z: number, r = 1): GEdge[] {
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60), out = new Set<GEdge>();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const g of this.grid.get(`${cx + i},${cz + j}`) || []) out.add(g);
    return [...out];
  }
  nearestNode(x: number, z: number, maxR = 8, y?: number, terminal = false): GNode | null {
    for (let r = 2; r <= maxR; r += 2) {
      let best: GNode | null = null, bd = 1e9;
      for (const g of this.nearestEdges(x, z, r)) for (const id of [g.from, g.to]) {
        const n = this.nodes.get(id); if (!n || y !== undefined && Math.abs(n.y - y) > 1.6) continue; const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd && (n.out.length || terminal)) { bd = d; best = n; }
      }
      if (best) return best;
    }
    return null;
  }
  // A* over directed edges (binary heap); returns a polyline for the GPS ribbon and its length
  // the road the car is on: nearest segment at the car's height
  edgeAt(x: number, z: number, y = 0, prefer?: { hx?: number; hz?: number; edgeId?: string }): { g: GEdge; s: number; i: number; d: number } | null {
    let best: { g: GEdge; s: number; i: number; d: number } | null = null;
    let bestScore = Infinity;
    for (const g of this.nearestEdges(x, z, 1)) {
      const P = g.e.pts, E = g.e.elev;
      for (let i = 0; i < P.length - 1; i++) {
        const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2));
        const ey = E ? E[i] + (E[i + 1] - E[i]) * u : 0;
        if (Math.abs(ey - y) > 1.6) continue;
        const d = Math.hypot(P[i][0] + dx * u - x, P[i][1] + dz * u - z);
        const align = prefer?.hx !== undefined ? Math.abs((dx * prefer.hx + dz * (prefer.hz || 0)) / Math.sqrt(L2)) : 1;
        const score = d + Math.abs(ey - y) * 4 + (1 - align) * 1.5 - (prefer?.edgeId === g.e.id ? 1.25 : 0);
        if (d < g.e.w / 2 + 4 && score < bestScore) { bestScore = score; best = { g, s: g.cum[i] + Math.sqrt(L2) * u, i, d }; }
      }
    }
    return best;
  }
  // GPS route. With the car's heading, it starts along the car's own road towards the junction ahead; turning back is
  // only offered where the road has no divider and it is legal, and costs a U-turn penalty.
  private *routeNearestEdges(x: number, z: number, r: number): Generator<void, GEdge[], void> {
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60), out = new Set<GEdge>();
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      yield;
      for (const edge of this.grid.get(`${cx + i},${cz + j}`) || []) { yield; out.add(edge); }
    }
    return [...out];
  }
  private *routeNearestNode(x: number, z: number, maxR: number, y?: number, terminal = false): Generator<void, GNode | null, void> {
    for (let r = 2; r <= maxR; r += 2) {
      let best: GNode | null = null, bd = 1e9;
      for (const g of yield* this.routeNearestEdges(x, z, r)) for (const id of [g.from, g.to]) {
        yield;
        const n = this.nodes.get(id); if (!n || y !== undefined && Math.abs(n.y - y) > 1.6) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd && (n.out.length || terminal)) { bd = d; best = n; }
      }
      if (best) return best;
    }
    return null;
  }
  routeJob(...args: Parameters<RoadGraph['route']>): RoadRouteJob {
    return new RoadRouteJob(this.routeWork(...args), this.revision, () => this.revision);
  }
  // Existing offer/distance callers retain the exact synchronous result.
  route(fromX: number, fromZ: number, toX: number, toZ: number, car?: { hx: number; hz: number; y: number; edgeId?: string }, targetY = 0, sourceY = car?.y || 0): RoadRoute | null {
    const work = this.routeWork(fromX, fromZ, toX, toZ, car, targetY, sourceY);
    let next = work.next(); while (!next.done) next = work.next(); return next.value;
  }
  private *routeEdgeAt(x: number, z: number, y = 0, prefer?: { hx?: number; hz?: number; edgeId?: string }): Generator<void, { g: GEdge; s: number; i: number; d: number } | null, void> {
    let best: { g: GEdge; s: number; i: number; d: number } | null = null;
    let bestScore = Infinity;
    for (const g of yield* this.routeNearestEdges(x, z, 1)) {
      const P = g.e.pts, E = g.e.elev;
      for (let i = 0; i < P.length - 1; i++) {
        yield;
        const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2));
        const ey = E ? E[i] + (E[i + 1] - E[i]) * u : 0;
        if (Math.abs(ey - y) > 1.6) continue;
        const d = Math.hypot(P[i][0] + dx * u - x, P[i][1] + dz * u - z);
        const align = prefer?.hx !== undefined ? Math.abs((dx * prefer.hx + dz * (prefer.hz || 0)) / Math.sqrt(L2)) : 1;
        const score = d + Math.abs(ey - y) * 4 + (1 - align) * 1.5 - (prefer?.edgeId === g.e.id ? 1.25 : 0);
        if (d < g.e.w / 2 + 4 && score < bestScore) { bestScore = score; best = { g, s: g.cum[i] + Math.sqrt(L2) * u, i, d }; }
      }
    }
    return best;
  }
  private *routeWork(fromX: number, fromZ: number, toX: number, toZ: number, car?: { hx: number; hz: number; y: number; edgeId?: string }, targetY = 0, sourceY = car?.y || 0): Generator<void, RoadRoute | null, void> {
    type Point = [number, number, number];
    const on = yield* this.routeEdgeAt(fromX, fromZ, sourceY, car);
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
    const result = function*(pts: Point[], complete: boolean, edgeIds: string[] = []): Generator<void, RoadRoute, void> {
      let len = 0;
      for (let i = 1; i < pts.length; i++) { yield; len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); }
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
    const target = yield* this.routeEdgeAt(toX, toZ, targetY);
    const ends = new Map<string, { pts: Point[]; len: number; cost: number }>();
    if (target) {
      const g = target.g, foot = this.pointAt(g, target.s, 1);
      const offset = Math.hypot(toX - foot.x, toZ - foot.z);
      const targetSide = side(g, target.s, toX, toZ);
      for (const d of [1, -1] as const) {
        if (!legal(g, d) || (targetSide && d !== targetSide)) continue;
        const pts: Point[] = [];
        if (d === 1) for (let i = 0; i <= target.i; i++) { yield; pts.push(vertex(g, i, d)); }
        else for (let i = g.e.pts.length - 1; i > target.i; i--) { yield; pts.push(vertex(g, i, d)); }
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
      const b = yield* this.routeNearestNode(toX, toZ, 40, targetY, true); if (!b) return null;
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
          if (d === 1) for (let i = on.i + 1; i <= target.i; i++) { yield; pts.push(vertex(g, i, d)); }
          else for (let i = on.i; i > target.i; i--) { yield; pts.push(vertex(g, i, d)); }
          pts.push(at(g, target.s, d));
          const along = Math.abs(target.s - on.s), offset = Math.hypot(toX - foot.x, toZ - foot.z);
          const cost = along * (COST[g.e.cls] || 1) + offset + (back ? 90 : 0);
          if (cost < bestCost) { bestCost = cost; direct = yield* result(pts, on.d <= g.e.w / 2 + 0.25, [g.e.id]); }
        }
        const node = d === 1 ? g.to : g.from, n = this.nodes.get(node); if (!n) continue;
        const along = d === 1 ? g.len - on.s : on.s;
        const cost = along * (COST[g.e.cls] || 1) + (back ? 90 : 0);
        if (cost < (dist.get(node) ?? 1e15)) {
          dist.set(node, cost); open.push([cost, node]);
          const pts: Point[] = [at(g, on.s, d)];
          if (d === 1) for (let i = on.i + 1; i < P.length; i++) { yield; pts.push(vertex(g, i, d)); }
          else for (let i = on.i; i >= 0; i--) { yield; pts.push(vertex(g, i, d)); }
          lead.set(node, pts); leadLen.set(node, along); leadEdge.set(node, g.e.id);
        }
      }
    }
    if (!open.size) { const a = yield* this.routeNearestNode(fromX, fromZ, 8, sourceY); if (!a) return null; open.push([0, a.id]); dist.set(a.id, 0); lead.set(a.id, []); leadLen.set(a.id, Math.hypot(a.x - fromX, a.z - fromZ)); }
    const heur = (n: GNode) => Math.hypot(n.x - toX, n.z - toZ) * 0.7;
    const closed = new Set<string>();
    let it = 0;
    while (open.size && it++ < 400000) {
      yield;
      const [priority, id] = open.pop();
      if (priority >= bestCost) break;
      if (closed.has(id)) continue; closed.add(id);
      const n = this.nodes.get(id); if (!n) continue; const dn = dist.get(id)!;
      const end = ends.get(id);
      if (end && dn + end.cost < bestCost) { bestCost = dn + end.cost; endNode = id; direct = null; }
      for (const o of n.out) {
        yield;
        const nid = o.dir === 1 ? o.edge.to : o.edge.from;
        const nn = this.nodes.get(nid); if (!nn) continue;
        const nd = dn + o.edge.len * (COST[o.edge.e.cls] || 1);
        if (nd < (dist.get(nid) ?? 1e15)) { dist.set(nid, nd); prev.set(nid, { node: id, edge: o.edge, dir: o.dir }); open.push([nd + heur(nn), nid]); }
      }
    }
    if (direct) return direct;
    if (endNode === null) return null;
    const chain: { edge: GEdge; dir: 1 | -1 }[] = [];
    let cur = endNode; while (prev.has(cur)) { yield; const p = prev.get(cur)!; chain.unshift({ edge: p.edge, dir: p.dir }); cur = p.node; }
    if (!lead.has(cur)) return null;
    const pts: [number, number, number][] = [...lead.get(cur)!]; let len = leadLen.get(cur) || 0;
    for (const c of chain) {
      const P = c.edge.e.pts, E = c.edge.e.elev;
      const idx = c.dir === 1 ? P.map((_, i) => i) : P.map((_, i) => P.length - 1 - i);
      for (const i of idx) { yield; pts.push(vertex(c.edge, i, c.dir)); }
      len += c.edge.len;
    }
    const end = ends.get(endNode)!;
    for (const point of end.pts) { yield; pts.push(point); }
    return yield* result(pts, !!target && !!on && on.d <= on.g.e.w / 2 + 0.25, [leadEdge.get(cur), ...chain.map(c => c.edge.e.id), target?.g.e.id].filter((id): id is string => !!id));
  }
}

/** Cooperative immutable-revision search. Cancelled/stale jobs never publish a partial path. */
export class RoadRouteJob {
  state: 'pending' | 'complete' | 'cancelled' | 'invalidated' = 'pending';
  result: RoadRoute | null = null;
  operations = 0;
  constructor(private work: Generator<void, RoadRoute | null, void>, readonly graphRevision: number, private currentRevision: () => number) {}
  cancel() { if (this.state === 'pending') { this.state = 'cancelled'; this.work.return(null); } }
  step(budgetMs = 1, now: () => number = () => performance.now(), maxOperations = 4096) {
    if (this.state !== 'pending') return this.state;
    if (this.currentRevision() !== this.graphRevision) { this.state = 'invalidated'; this.work.return(null); return this.state; }
    const deadline = now() + Math.max(0, budgetMs); let operations = 0;
    while (operations < maxOperations && now() < deadline) {
      const next = this.work.next(); this.operations++; operations++;
      if (next.done) { this.result = next.value; this.state = 'complete'; break; }
    }
    return this.state;
  }
}

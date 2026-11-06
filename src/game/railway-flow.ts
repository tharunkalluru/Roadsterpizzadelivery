import type { XZ } from '../world/types';
import type { MovingRailShape } from './moving-rail';

export type RailDirection = 1 | -1;
export interface RailwayTrack { pts: XZ[]; elev?: number[]; bridge?: boolean }
export interface RailwayRun {
  pts: number[][]; cum: number[]; len: number;
  // Direction of each mapped way relative to this run, independent of OSM point order.
  ways: { id: string; dir: RailDirection }[];
}
const key = (p: readonly number[]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

export function buildRailwayRun(rails: ReadonlyMap<string, RailwayTrack>, start: RailwayTrack): RailwayRun {
  const ends = new Map<string, { id: string; track: RailwayTrack }[]>();
  let startId = '';
  for (const [id, track] of rails) {
    if (track === start) startId = id;
    if (track.pts.length < 2) continue;
    for (const p of [track.pts[0], track.pts.at(-1)!]) {
      const k = key(p); const list = ends.get(k) || []; list.push({ id, track }); ends.set(k, list);
    }
  }
  const withY = (r: RailwayTrack) => r.pts.map((p, i) => [p[0], (r.elev?.[i] ?? (r.bridge ? 6.2 : 0)) + .11, p[1]]);
  let pts = withY(start), ways: RailwayRun['ways'] = [{ id: startId, dir: 1 }];
  const used = new Set([start]);
  for (const forward of [true, false]) for (let guard = 0; guard < 120 && pts.length > 1; guard++) {
    const tip = forward ? pts.at(-1)! : pts[0], prev = forward ? pts.at(-2)! : pts[1];
    const hx = tip[0] - prev[0], hz = tip[2] - prev[2], hl = Math.hypot(hx, hz) || 1;
    let best: { id: string; track: RailwayTrack; rev: boolean; dot: number } | null = null;
    for (const item of ends.get(key([tip[0], tip[2]])) || []) {
      if (used.has(item.track)) continue;
      const rev = key(item.track.pts[0]) !== key([tip[0], tip[2]]);
      const q = rev ? item.track.pts.slice().reverse() : item.track.pts;
      const dx = q[1][0] - q[0][0], dz = q[1][1] - q[0][1];
      const dot = (dx * hx + dz * hz) / ((Math.hypot(dx, dz) || 1) * hl);
      // Continue only through a mutual straightest connection. At a turnout a
      // siding must not claim the main track merely because it reaches it.
      let back: { id: string; dot: number } | null = null;
      for (const other of ends.get(key([tip[0], tip[2]])) || []) {
        if (other.id === item.id) continue;
        const reverse = key(other.track.pts[0]) !== key([tip[0], tip[2]]);
        const points = other.track.pts, p = reverse ? points.at(-2)! : points[1];
        const ox = p[0] - tip[0], oz = p[1] - tip[2];
        const score = -(ox * dx + oz * dz) / ((Math.hypot(ox, oz) || 1) * (Math.hypot(dx, dz) || 1));
        if (!back || score > back.dot + 1e-8 || Math.abs(score - back.dot) < 1e-8 && other.id < back.id) back = { id: other.id, dot: score };
      }
      const currentId = forward ? ways.at(-1)!.id : ways[0].id;
      if (back?.id !== currentId) continue;
      if (dot > .7 && (!best || dot > best.dot + 1e-8 || Math.abs(dot - best.dot) < 1e-8 && item.id < best.id)) best = { ...item, rev, dot };
    }
    if (!best) break;
    used.add(best.track);
    const add = withY(best.track); if (best.rev) add.reverse();
    const way = { id: best.id, dir: ((best.rev ? -1 : 1) * (forward ? 1 : -1)) as RailDirection };
    pts = forward ? pts.concat(add.slice(1)) : add.slice(1).reverse().concat(pts);
    ways = forward ? [...ways, way] : [way, ...ways];
  }
  // A stable orientation makes parallel pairing independent of chosen starting way.
  if (pts.length > 1 && (pts[0][0] > pts.at(-1)![0] || pts[0][0] === pts.at(-1)![0] && pts[0][2] > pts.at(-1)![2])) {
    pts.reverse(); ways.reverse(); ways = ways.map(w => ({ id: w.id, dir: -w.dir as RailDirection }));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
  return { pts, ways, cum, len: cum.at(-1) || 0 };
}

export function railwayPoint(run: RailwayRun, distance: number) {
  if (run.pts.length < 2) return { x: run.pts[0]?.[0] || 0, y: run.pts[0]?.[1] || 0, z: run.pts[0]?.[2] || 0, hx: 0, hz: 1, pitch: 0 };
  const s = Math.max(0, Math.min(run.len, distance));
  let lo = 1, hi = run.pts.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (run.cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = run.pts[lo - 1], b = run.pts[lo], length = run.cum[lo] - run.cum[lo - 1] || 1, u = (s - run.cum[lo - 1]) / length;
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u,
    hx: (b[0] - a[0]) / length, hz: (b[2] - a[2]) / length, pitch: Math.atan2(b[1] - a[1], length) };
}
export function projectRailwayRun(run: RailwayRun, x: number, z: number) {
  let best = { d: Infinity, s: 0, ...railwayPoint(run, 0) };
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1], b = run.pts[i], dx = b[0] - a[0], dz = b[2] - a[2], length = run.cum[i] - run.cum[i - 1];
    if (length < .001) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (length * length)));
    const px = a[0] + u * dx, pz = a[2] + u * dz, d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { d, s: run.cum[i - 1] + u * length, ...railwayPoint(run, run.cum[i - 1] + u * length) };
  }
  return best;
}

export interface RailwayContinuation { run: RailwayRun; added: number; way: string; dot: number }
/** Directed routing is separate from mutual-straight chain ownership. A siding
 * may reach its actual onward junction without claiming the main line at spawn.
 * Only an exact, height-compatible source endpoint can continue the route. */
export function railwayContinuations(run: RailwayRun, direction: RailDirection, rails: ReadonlyMap<string, RailwayTrack>): RailwayContinuation[] {
  if (run.pts.length < 2) return [];
  const tip = direction > 0 ? run.pts.at(-1)! : run.pts[0];
  const before = direction > 0 ? run.pts.at(-2)! : run.pts[1];
  const dx = tip[0] - before[0], dz = tip[2] - before[2], length = Math.hypot(dx, dz);
  if (length < .001) return [];
  const used = new Set(run.ways.map(way => way.id)), choices: RailwayContinuation[] = [];
  for (const [id, track] of rails) {
    if (used.has(id) || track.pts.length < 2) continue;
    for (const reversed of [false, true]) {
      const index = reversed ? track.pts.length - 1 : 0, endpoint = track.pts[index];
      // Shared source coordinates alone form a junction. Never bridge nearby
      // but unjoined tracks, missing survey spans, or a separated railway.
      if (Math.hypot(endpoint[0] - tip[0], endpoint[1] - tip[2]) > 1e-6 || Math.abs((track.elev?.[index] ?? (track.bridge ? 6.2 : 0)) + .11 - tip[1]) > .15) continue;
      const points = track.pts.map((point, i) => [point[0], (track.elev?.[i] ?? (track.bridge ? 6.2 : 0)) + .11, point[1]]);
      if (reversed) points.reverse();
      const next = points.find(point => Math.hypot(point[0] - tip[0], point[2] - tip[2]) > .2);
      if (!next) continue;
      const nx = next[0] - tip[0], nz = next[2] - tip[2], dot = (nx * dx + nz * dz) / (Math.hypot(nx, nz) * length);
      if (dot <= .7) continue; // no wrong-track U-turn or sharp invented turn
      const pts = direction > 0 ? run.pts.concat(points.slice(1)) : points.slice(1).reverse().concat(run.pts);
      const way = { id, dir: ((reversed ? -1 : 1) * direction) as RailDirection };
      const ways = direction > 0 ? [...run.ways, way] : [way, ...run.ways], cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
      const continued = { pts, cum, ways, len: cum.at(-1)! }, added = continued.len - run.len;
      if (added > .2) choices.push({ run: continued, added, way: id, dot });
    }
  }
  return choices.sort((a,b) => b.dot - a.dot || a.way.localeCompare(b.way));
}
export const sharedRailwayWay = (a: RailwayRun, b: RailwayRun) => a.ways.some(w => b.ways.some(v => v.id === w.id));

// Only long, physically parallel mapped tracks can form an opposing pair. A
// turnout/crossing or vertically separated railway is not a second running track.
export function parallelRailwayRuns(a: RailwayRun, b: RailwayRun) {
  if (sharedRailwayWay(a, b)) return null;
  const sample = a.len <= b.len ? a : b, other = sample === a ? b : a;
  let hits = 0, distance = 0, dotSum = 0, first = Infinity, last = -Infinity;
  const count = Math.max(5, Math.min(19, Math.ceil(sample.len / 150)));
  for (let i = 0; i <= count; i++) {
    const s = sample.len * i / count, p = railwayPoint(sample, s), q = projectRailwayRun(other, p.x, p.z), dot = p.hx * q.hx + p.hz * q.hz;
    if (q.d >= 3.5 && q.d <= 12 && Math.abs(p.y - q.y) < .8 && Math.abs(dot) > .97) { hits++; distance += q.d; dotSum += dot; first = Math.min(first, s); last = Math.max(last, s); }
  }
  if (hits < 3 || last - first < Math.min(180, sample.len * .5) || Math.abs(dotSum) < hits * .95) return null;
  return { orientation: (dotSum > 0 ? 1 : -1) as RailDirection, separation: distance / hits, score: hits * 100 - distance / hits };
}

export class RailwayFlow {
  private ways = new Map<string, RailDirection>();
  direction(run: RailwayRun): RailDirection | null {
    let result: RailDirection | undefined;
    for (const w of run.ways) {
      const known = this.ways.get(w.id); if (!known) continue;
      const dir = known * w.dir as RailDirection;
      if (result && result !== dir) return null;
      result = dir;
    }
    return result || 1;
  }
  known(run: RailwayRun) { return run.ways.some(w => this.ways.has(w.id)); }
  reserve(run: RailwayRun, dir: RailDirection) {
    if (run.ways.some(w => this.ways.has(w.id) && this.ways.get(w.id) !== dir * w.dir)) return false;
    for (const w of run.ways) this.ways.set(w.id, dir * w.dir as RailDirection);
    return true;
  }
  pair(a: RailwayRun, b: RailwayRun): RailDirection | null {
    const parallel = parallelRailwayRuns(a, b); if (!parallel) return null;
    const ad = this.direction(a), bd = this.direction(b); if (!ad || !bd) return null;
    const dir = this.known(a) ? ad : this.known(b) ? -bd * parallel.orientation as RailDirection : 1;
    const opposite = -dir * parallel.orientation as RailDirection;
    if (this.known(a) && ad !== dir || this.known(b) && bd !== opposite) return null;
    this.reserve(a, dir); this.reserve(b, opposite); return dir;
  }
}

type Point = [number, number];
function corners(body: MovingRailShape): Point[] {
  const out: Point[] = [], pad = .08;
  for (const along of [-body.halfLength - pad, body.halfLength + pad]) for (const side of [-body.halfWidth - pad, body.halfWidth + pad])
    out.push([body.x + body.hx * along - body.hz * side, body.z + body.hz * along + body.hx * side]);
  return out;
}
function hull(points: Point[]) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ps: Point[]) => { const h: Point[] = []; for (const p of ps) { while (h.length >= 2 && cross(h.at(-2)!, h.at(-1)!, p) <= 0) h.pop(); h.push(p); } return h; };
  const a = half(points), b = half(points.slice().reverse()); return a.slice(0, -1).concat(b.slice(0, -1));
}
function overlaps(a: Point[], b: Point[]) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], nx = q[1] - p[1], nz = p[0] - q[0];
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const r of a) { const d = r[0] * nx + r[1] * nz; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const r of b) { const d = r[0] * nx + r[1] * nz; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}
// Swept coach envelopes include curvature, bridge grades and the whole rake.
// This interlock is independent of flow reservations, so crossing lines yield too.
export function railwaySweepsConflict(a0: readonly MovingRailShape[], a1: readonly MovingRailShape[], b0: readonly MovingRailShape[], b1: readonly MovingRailShape[]) {
  const as = new Map(a0.map(b => [b.id, b])), bs = new Map(b0.map(b => [b.id, b]));
  for (const a of a1) for (const b of b1) {
    const pa = as.get(a.id) || a, pb = bs.get(b.id) || b;
    const ar = Math.hypot(a.x - pa.x, a.z - pa.z) + a.halfLength + a.halfWidth;
    const br = Math.hypot(b.x - pb.x, b.z - pb.z) + b.halfLength + b.halfWidth;
    if (Math.hypot(a.x - b.x, a.z - b.z) > ar + br + .2) continue;
    const bottom = (body: MovingRailShape) => body.bottom - Math.abs(body.grade || 0) * body.halfLength;
    const roof = (body: MovingRailShape) => body.roof + Math.abs(body.grade || 0) * body.halfLength;
    if (Math.min(bottom(a), bottom(pa)) >= Math.max(roof(b), roof(pb)) || Math.min(bottom(b), bottom(pb)) >= Math.max(roof(a), roof(pa))) continue;
    if (overlaps(hull([...corners(pa), ...corners(a)]), hull([...corners(pb), ...corners(b)]))) return true;
  }
  return false;
}

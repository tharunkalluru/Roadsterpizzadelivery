import type { RoadEdge, XZ } from './types';

export const isORR = (e: RoadEdge) => e.expressway?.controlled === true || (e.cls === 'motorway' && e.name === 'Outer Ring Road');
export const isRamp = (e: RoadEdge) => e.expressway?.ramp === true || /_link$/.test(e.cls);
export const travelDirection = (e: RoadEdge): 1 | -1 => e.oneway === 'forward' ? -1 : 1; // value names denied heading
export function sharedNode(a: RoadEdge, b: RoadEdge) {
  return [a.from, a.to].find(n => n && (n === b.from || n === b.to)) || null;
}
export function roadLength(e: RoadEdge) {
  let length = 0;
  for (let i = 1; i < e.pts.length; i++) length += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
  return length;
}
export function roadPose(e: RoadEdge, s: number) {
  let acc = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + len >= s || i === e.pts.length - 1) {
      const u = Math.max(0, Math.min(1, (s - acc) / (len || 1)));
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u,
        y: (e.elev?.[i - 1] || 0) * (1 - u) + (e.elev?.[i] || 0) * u,
        hx: (b[0] - a[0]) / (len || 1), hz: (b[1] - a[1]) / (len || 1) };
    }
    acc += len;
  }
  return { x: e.pts[0][0], z: e.pts[0][1], y: e.elev?.[0] || 0, hx: 0, hz: 1 };
}

// A geometric crossing or nearby service road never grants expressway access.
// Only a connected mapped ramp at the same level may interrupt its barrier.
export function expresswayOpening(own: RoadEdge, other: RoadEdge, x: number, z: number, y: number) {
  if (!isORR(own) || own.id === other.id || !isRamp(other)) return false;
  const node = sharedNode(own, other);
  if (!node) return false;
  const join = node === own.from ? own.pts[0] : own.pts[own.pts.length - 1];
  if (Math.hypot(x - join[0], z - join[1]) > 330) return false;
  for (let i = 1; i < other.pts.length; i++) {
    const a = other.pts[i - 1], b = other.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll));
    const oy = (other.elev?.[i - 1] || 0) * (1 - t) + (other.elev?.[i] || 0) * t;
    if (Math.abs(oy - y) < .8 && Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) <= other.w / 2 + .5) return true;
  }
  return false;
}

export function auxiliaryLane(e: RoadEdge, roads: RoadEdge[]) {
  if (!isORR(e)) return e.pts.map(() => 0);
  const joins = new Set(roads.filter(o => o.id !== e.id && isRamp(o)).map(o => sharedNode(e, o)).filter(Boolean));
  const total = roadLength(e); let s = 0;
  return e.pts.map((p, i) => {
    if (i) s += Math.hypot(p[0] - e.pts[i - 1][0], p[1] - e.pts[i - 1][1]);
    const d = Math.min(joins.has(e.from) ? s : Infinity, joins.has(e.to) ? total - s : Infinity);
    const t = Math.max(0, Math.min(1, 1 - d / 220));
    return 3.5 * t * t * (3 - 2 * t);
  });
}

interface BoundarySegment { ax: number; az: number; bx: number; bz: number; ya: number; yb: number; segment?: number; bottom?: number; top?: number }
export interface ExpresswayBarrierSegment extends BoundarySegment { road: string }

// Rendering and collision share these intervals. A ramp centreline joins the
// mainline centreline in the source data; its two edge barriers therefore begin
// INSIDE the through carriageway and must stop until the road envelopes separate.
export function expresswayBarrierClipper(roads: RoadEdge[]) {
  const expressway = (e: RoadEdge) => isORR(e) || !!e.expressway?.ramp;
  if (!roads.some(expressway)) return (own: RoadEdge, boundary: BoundarySegment): ExpresswayBarrierSegment[] => [{ ...boundary, road: own.id }];
  const nodes = new Map<string, RoadEdge[]>(), related = new Map<string, RoadEdge[]>();
  for (const e of roads) for (const node of [e.from, e.to]) if (node) (nodes.get(node) || nodes.set(node, []).get(node)!).push(e);
  const others = (own: RoadEdge) => {
    if (related.has(own.id)) return related.get(own.id)!;
    const found = new Set<RoadEdge>(), best = new Map<string, number>(), queue: [string, number][] = [];
    for (const node of [own.from, own.to]) if (node) { best.set(node, 0); queue.push([node, 0]); }
    // Follow the local interchange component through short split source edges.
    // Never traverse ordinary streets or turn a remote geometric crossing into
    // an access opening. Full long edges are candidates, but not traversal jumps.
    for (let i = 0; i < queue.length; i++) {
      const [node, d] = queue[i]; if (d !== best.get(node)) continue;
      for (const e of nodes.get(node) || []) {
        if (e.id === own.id) continue;
        if (!expressway(e)) { if (isRamp(own) && !/footway|path|steps|pedestrian|cycleway/.test(e.cls) && (nodes.get(node) || []).some(o => o.expressway?.ramp)) found.add(e); continue; }
        found.add(e);
        const next = e.from === node ? e.to : e.from, nd = d + roadLength(e);
        if (next && nd <= 450 && nd < (best.get(next) ?? Infinity)) { best.set(next, nd); queue.push([next, nd]); }
      }
    }
    const out = [...found]; related.set(own.id, out); return out;
  };
  const clip = (range: number[], value: number, delta: number, low: number, high: number) => {
    if (Math.abs(delta) < 1e-10) return value >= low && value <= high;
    const a = (low - value) / delta, b = (high - value) / delta;
    range[0] = Math.max(range[0], Math.min(a, b)); range[1] = Math.min(range[1], Math.max(a, b));
    return range[0] < range[1] - 1e-8;
  };
  interface Corridor { e: RoadEdge; i: number; a: XZ; b: XZ; dx: number; dz: number; len: number; hw: number; extra: number[]; outer: number }
  const grid = new Map<string, Corridor[]>();
  for (const e of roads) {
    if (/footway|path|steps|pedestrian|cycleway/.test(e.cls)) continue;
    const hw = e.elev?.some(y => y > 1.2) ? Math.max(e.w / 2, 4.2) : e.w / 2;
    const extra = auxiliaryLane(e, roads);
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < .001) continue;
      const span = { e, i, a, b, dx, dz, len, hw, extra, outer: -travelDirection(e) }, margin = hw + 4;
      for (let x = Math.floor((Math.min(a[0], b[0]) - margin) / 60); x <= Math.floor((Math.max(a[0], b[0]) + margin) / 60); x++)
        for (let z = Math.floor((Math.min(a[1], b[1]) - margin) / 60); z <= Math.floor((Math.max(a[1], b[1]) + margin) / 60); z++) {
          const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(span);
        }
    }
  }
  return (own: RoadEdge, boundary: BoundarySegment): ExpresswayBarrierSegment[] => {
    const { ax, az, bx, bz, ya, yb } = boundary, cuts: number[][] = [], connected = new Set(others(own)), near = new Set<Corridor>();
    for (let x = Math.floor(Math.min(ax, bx) / 60); x <= Math.floor(Math.max(ax, bx) / 60); x++)
      for (let z = Math.floor(Math.min(az, bz) / 60); z <= Math.floor(Math.max(az, bz) / 60); z++) for (const s of grid.get(`${x},${z}`) || []) near.add(s);
    for (const { e: other, i, a, b, dx, dz, len, hw, extra, outer } of near) {
        // Foreign parapets must never fence off the mainline. This removes an
        // intruding wall, while the mainline's own access barrier still excludes
        // unrelated service roads. Also trim folded ramp boundaries against their
        // own non-current source strips, rather than cutting across a hairpin.
        if (other.id === own.id ? boundary.segment === undefined || i - 1 === boundary.segment :
          !isORR(other) && !connected.has(other) && !(!isORR(own) && expressway(other))) continue;
        if (Math.max(ax, bx) < Math.min(a[0], b[0]) - hw - 4 || Math.min(ax, bx) > Math.max(a[0], b[0]) + hw + 4 ||
          Math.max(az, bz) < Math.min(a[1], b[1]) - hw - 4 || Math.min(az, bz) > Math.max(a[1], b[1]) + hw + 4) continue;
        const u = ((ax - a[0]) * dx + (az - a[1]) * dz) / (len * len), du = ((bx - ax) * dx + (bz - az) * dz) / (len * len);
        const v = ((az - a[1]) * dx - (ax - a[0]) * dz) / len, dv = ((bz - az) * dx - (bx - ax) * dz) / len;
        const left0 = -hw - (outer === -1 ? extra[i - 1] : 0), left1 = -hw - (outer === -1 ? extra[i] : 0);
        const right0 = hw + (outer === 1 ? extra[i - 1] : 0), right1 = hw + (outer === 1 ? extra[i] : 0);
        const oa = other.elev?.[i - 1] || 0, ob = other.elev?.[i] || 0, range = [0, 1];
        if (!clip(range, u, du, -.025 / len, 1 + .025 / len) ||
          !clip(range, v - left0 - (left1 - left0) * u, dv - (left1 - left0) * du, -.35, Infinity) ||
          !clip(range, right0 + (right1 - right0) * u - v, (right1 - right0) * du - dv, -.35, Infinity) ||
          !clip(range, ya - oa - (ob - oa) * u, yb - ya - (ob - oa) * du, .1 - (boundary.top ?? .85), 1.8 - (boundary.bottom ?? -1))) continue;
        cuts.push(range);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    const keep: number[][] = []; let cursor = 0;
    for (const [lo, hi] of cuts) { if (lo > cursor + 1e-7) keep.push([cursor, lo]); cursor = Math.max(cursor, hi); }
    if (cursor < 1 - 1e-7) keep.push([cursor, 1]);
    return keep.map(([lo, hi]) => ({ road: own.id, ax: ax + (bx - ax) * lo, az: az + (bz - az) * lo,
      bx: ax + (bx - ax) * hi, bz: az + (bz - az) * hi, ya: ya + (yb - ya) * lo, yb: ya + (yb - ya) * hi }));
  };
}

export function expresswayPierClear(own: RoadEdge, roads: RoadEdge[], x: number, z: number) {
  for (const e of roads) {
    if (e.id === own.id || /footway|path|steps|pedestrian|cycleway/.test(e.cls)) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll));
      const y = (e.elev?.[i - 1] || 0) * (1 - u) + (e.elev?.[i] || 0) * u;
      if (y < 1.8 && Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u) < e.w / 2 + 1.2) return false;
    }
  }
  return true;
}

// HMDA interchange table and current ORRDistanceMatrix.pdf; Neopolis opening
// confirmed by Telangana government in September2025. Locations use mapped ramps.
export const ORR_EXITS: Record<string, string> = {
  '1': 'Kokapet', '1A': 'Neopolis · Kokapet', '2': 'Edula Nagulapally', '3': 'Patancheru',
  '4': 'Sultanpur', '4A': 'Mallampet', '5': 'Saragudem', '6': 'Medchal', '7': 'Shamirpet',
  '8': 'Keesara', '9': 'Ghatkesar', '10': 'Taramatipet', '11': 'Pedda Amberpet', '12': 'Bongulur',
  '13': 'Raviryal', '14': 'Tukkuguda', '15': 'Pedda Golconda', '16': 'Shamshabad',
  '17': 'Rajendranagar', '18': 'TGPA', '18A': 'Narsingi', '19': 'Nanakramguda',
};

export interface ExpresswayExit { id: string; ref: string; name: string; road: RoadEdge; s: number }
export function mappedExits(roads: RoadEdge[], features: { id: string; k: string; p?: XZ; t: Record<string, string> }[]) {
  const exits: ExpresswayExit[] = [];
  for (const f of features) {
    const ref = f.t.ref?.toUpperCase();
    if (f.k !== 'exit' || !f.p || !ref || !ORR_EXITS[ref]) continue;
    let best: { road: RoadEdge; s: number; d: number } | null = null;
    for (const e of roads) {
      if (!isORR(e)) continue;
      const dir = travelDirection(e), end = dir === 1 ? e.to : e.from;
      if (!roads.some(o => o.id !== e.id && isRamp(o) && (travelDirection(o) === 1 ? o.from : o.to) === end)) continue;
      const endS = dir === 1 ? roadLength(e) : 0;
      let acc = 0;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz || 1, len = Math.sqrt(ll);
        const t = Math.max(0, Math.min(1, ((f.p[0] - a[0]) * dx + (f.p[1] - a[1]) * dz) / ll));
        const d = Math.hypot(f.p[0] - a[0] - dx * t, f.p[1] - a[1] - dz * t);
        const s = acc + len * t;
        if (d < 7 && Math.abs(s - endS) < 50 && (!best || d < best.d)) best = { road: e, s, d };
        acc += len;
      }
    }
    if (!best) continue;
    // Junction nodes are also used for entries; an EXIT board belongs only at a
    // directed diverge with a connected ramp, not every nearby junction marker.
    const e = best.road, dir = travelDirection(e), end = dir === 1 ? e.to : e.from, len = roadLength(e);
    if (Math.abs(best.s - (dir === 1 ? len : 0)) > 50) continue;
    if (!roads.some(o => o.id !== e.id && isRamp(o) && (travelDirection(o) === 1 ? o.from : o.to) === end)) continue;
    if (!exits.some(x => x.road.id === e.id && x.ref === ref)) exits.push({ id: f.id, ref, name: ORR_EXITS[ref], road: e, s: best.s });
  }
  return exits;
}

// Move upstream along the mapped main carriageway, including short source edges.
// Never jump to the other carriageway or cut a straight line across a curve.
export function upstreamPose(exit: ExpresswayExit, distance: number, roads: RoadEdge[]) {
  let e = exit.road, s = exit.s, remain = distance;
  const visited = new Set<string>();
  for (let tries = 0; tries < 20; tries++) {
    const dir = travelDirection(e), available = dir === 1 ? s : roadLength(e) - s;
    if (available >= remain) return { e, ...roadPose(e, s - dir * remain), dir };
    remain -= available; visited.add(e.id);
    const node = dir === 1 ? e.from : e.to;
    const prev = roads.find(o => isORR(o) && !visited.has(o.id) && (travelDirection(o) === 1 ? o.to : o.from) === node);
    if (!prev) return null;
    e = prev; s = travelDirection(e) === 1 ? roadLength(e) : 0;
  }
  return null;
}

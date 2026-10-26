import type { RoadEdge } from './types';
import { auxiliaryLane } from './expressway';

// Solid structures must leave room for the road's full carriageway and tall
// traffic at its actual height, including ramps and roads between two decks.
// These are model clearances, not surveyed engineering dimensions.
export const ROAD_STRUCTURE_HEADROOM = 4.8;
export type StructureFootprint = { x: number; z: number; r: number } | {
  x: number; z: number; hx: number; hz: number; hw: number; hl: number;
};
export interface StructureSupport {
  source: string; part: 'bridge' | 'metro_pillar' | 'station_column' | 'station_stairs' | 'station_concourse';
  footprint: StructureFootprint; bottom: number; top: number;
  cap?: { footprint: StructureFootprint; bottom: number; top: number };
}
interface Span { id: string; ax: number; az: number; dx: number; dz: number; ya: number; yb: number; hw: number }
const CELL = 50, MARGIN = .45;
function bounds(p: StructureFootprint) {
  if ('r' in p) return [p.x - p.r, p.x + p.r, p.z - p.r, p.z + p.r];
  const x = Math.abs(p.hz) * p.hw + Math.abs(p.hx) * p.hl, z = Math.abs(p.hx) * p.hw + Math.abs(p.hz) * p.hl;
  return [p.x - x, p.x + x, p.z - z, p.z + z];
}
// Segment/circle clipping returns the whole overlapping interval; testing just
// the closest point misses a sloping road entering a column further along it.
function circleInterval(s: Span, x: number, z: number, radius: number): [number, number] | null {
  const ax = s.ax - x, az = s.az - z, a = s.dx * s.dx + s.dz * s.dz;
  if (a < 1e-9) return ax * ax + az * az <= radius * radius ? [0, 1] : null;
  const b = ax * s.dx + az * s.dz, c = ax * ax + az * az - radius * radius, d = b * b - a * c;
  if (d < 0) return null;
  const lo = Math.max(0, (-b - Math.sqrt(d)) / a), hi = Math.min(1, (-b + Math.sqrt(d)) / a);
  return lo <= hi ? [lo, hi] : null;
}
function boxInterval(s: Span, p: Exclude<StructureFootprint, { r: number }>, padding: number): [number, number] | null {
  const ax = s.ax - p.x, az = s.az - p.z;
  // Expanding the oriented rectangle by the road radius is conservative at
  // corners, so an entire stair run is kept away from bends and junctions.
  const axes = [[ax * p.hz - az * p.hx, s.dx * p.hz - s.dz * p.hx, p.hw + padding],
    [ax * p.hx + az * p.hz, s.dx * p.hx + s.dz * p.hz, p.hl + padding]];
  let lo = 0, hi = 1;
  for (const [a, d, half] of axes) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(a) > half) return null; continue; }
    const t0 = (-half - a) / d, t1 = (half - a) / d;
    lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (lo > hi) return null;
  }
  return [lo, hi];
}

export function roadStructureClearance(roads: RoadEdge[]) {
  const grid = new Map<string, Span[]>();
  for (const e of roads) {
    if (/^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;
    const extra = auxiliaryLane(e, roads);
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], ya = e.elev?.[i - 1] || 0, yb = e.elev?.[i] || 0;
      const s: Span = { id: e.id, ax: a[0], az: a[1], dx: b[0] - a[0], dz: b[1] - a[1], ya, yb,
        // An ORR merge/acceleration lane widens only one side in the renderer;
        // expanding both sides here conservatively contains that entire ribbon.
        hw: Math.max(e.w / 2, Math.max(ya, yb) > 1.2 ? 4.2 : 0) + Math.max(extra[i - 1], extra[i]) + MARGIN };
      for (let x = Math.floor((Math.min(a[0], b[0]) - s.hw) / CELL); x <= Math.floor((Math.max(a[0], b[0]) + s.hw) / CELL); x++) {
        for (let z = Math.floor((Math.min(a[1], b[1]) - s.hw) / CELL); z <= Math.floor((Math.max(a[1], b[1]) + s.hw) / CELL); z++) {
          const k = `${x},${z}`; (grid.get(k) || grid.set(k, []).get(k)!).push(s);
        }
      }
    }
  }
  const conflicts = (p: StructureFootprint, bottom: number, top: number) => {
    const [x0, x1, z0, z1] = bounds(p), seen = new Set<Span>(), ids = new Set<string>();
    for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      for (const s of grid.get(`${x},${z}`) || []) {
        if (seen.has(s)) continue; seen.add(s);
        const interval = 'r' in p ? circleInterval(s, p.x, p.z, s.hw + p.r) : boxInterval(s, p, s.hw);
        if (!interval) continue;
        const a = s.ya + (s.yb - s.ya) * interval[0], b = s.ya + (s.yb - s.ya) * interval[1];
        if (top > Math.min(a, b) + .08 && bottom < Math.max(a, b) + ROAD_STRUCTURE_HEADROOM) ids.add(s.id);
      }
    }
    return [...ids];
  };
  return { conflicts, clear: (p: StructureFootprint, bottom: number, top: number) => conflicts(p, bottom, top).length === 0 };
}

// Arc length, rather than the number of source vertices, determines support
// spacing. Grade smoothing can turn one source span into hundreds of points.
export function bridgeSupportSites(e: RoadEdge, spacing = 24) {
  const sites: { x: number; z: number; h: number; hx: number; hz: number; i: number; s: number }[] = [];
  if (!(spacing > 0)) return sites;
  let acc = 0, next = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < .0001) continue;
    while (next < acc + length - .00001) {
      const u = Math.max(0, (next - acc) / length), ya = e.elev?.[i - 1] || 0, yb = e.elev?.[i] || 0, h = ya + (yb - ya) * u - .9;
      if (h >= 2.5) sites.push({ x: a[0] + dx * u, z: a[1] + dz * u, h, hx: dx / length, hz: dz / length, i: i - 1, s: next });
      next += spacing;
    }
    acc += length;
  }
  return sites;
}

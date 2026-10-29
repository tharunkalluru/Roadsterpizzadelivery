import type { RoadEdge } from './types';
import type { RailProfile } from './railway-geometry';

// Clearance for fixed roadside furniture at genuine level crossings. This is
// deliberately separate from the animated gate arms. It is built once per tile
// from the same canonical track heights used by the coaches and crossing logic.
export const RAILWAY_ROADSIDE_HALF_WIDTH = 3.7;
export interface RailwayRoadGap { x: number; z: number; y: number; hx: number; hz: number; halfLength: number; halfWidth: number; sourceRoad: string }
type RailSpan = { profile: RailProfile; i: number };
const railGrids = new WeakMap<readonly RailProfile[], Map<string, RailSpan[]>>();
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
export function roadHeightAt(road: RoadEdge, x: number, z: number) {
  if (!road.elev) return 0;
  let distance = Infinity, height = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const u = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    const d = (x - a[0] - dx * u) ** 2 + (z - a[1] - dz * u) ** 2;
    if (d < distance) { distance = d; height = (road.elev?.[i - 1] || 0) + ((road.elev?.[i] || 0) - (road.elev?.[i - 1] || 0)) * u; }
  }
  return height;
}
export function railwayRoadClearance(roads: readonly RoadEdge[], profiles: readonly RailProfile[]) {
  let grid = railGrids.get(profiles); const cell = 100;
  if (!grid) { grid = new Map(); railGrids.set(profiles, grid);
  for (const profile of profiles) for (let i = 1; i < profile.pts.length; i++) {
    const a = profile.pts[i - 1], b = profile.pts[i];
    for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++) {
        const key = `${x},${z}`, list = grid.get(key) || []; list.push({ profile, i }); grid.set(key, list);
      }
  }
  }
  const raw: RailwayRoadGap[] = [];
  for (const road of roads) {
    if (/^(railway|footway|path|steps|pedestrian|cycleway|bridleway)$/.test(road.cls)) continue;
    for (let i = 1; i < road.pts.length; i++) {
      const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); if (length < .01) continue;
      const candidates = new Map<string, RailSpan>();
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++)
          for (const span of grid.get(`${x},${z}`) || []) candidates.set(`${span.profile.id}:${span.i}`, span);
      for (const { profile, i: j } of candidates.values()) {
        const p = profile.pts[j - 1], q = profile.pts[j], rx = q[0] - p[0], rz = q[1] - p[1], railLength = Math.hypot(rx, rz), denominator = cross(dx, dz, rx, rz);
        // Grazing/parallel source overlaps are not a transverse crossing.
        if (railLength < .01 || Math.abs(denominator) / (length * railLength) < .15) continue;
        const u = cross(p[0] - a[0], p[1] - a[1], rx, rz) / denominator, v = cross(p[0] - a[0], p[1] - a[1], dx, dz) / denominator;
        if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) continue;
        const y = (road.elev?.[i - 1] || 0) + ((road.elev?.[i] || 0) - (road.elev?.[i - 1] || 0)) * u;
        const railY = profile.elev[j - 1] + (profile.elev[j] - profile.elev[j - 1]) * v;
        if (Math.abs(y - railY) > .55) continue;
        const sine = Math.abs(denominator) / (length * railLength), cosine = Math.abs(dx * rx + dz * rz) / (length * railLength), halfWidth = road.w / 2 + 6;
        // Open the entire road/sidewalk width at an oblique crossing, not only
        // the narrow centreline intercept. Adjacent strands merge below.
        raw.push({ x: a[0] + dx * u, z: a[1] + dz * u, y, hx: dx / length, hz: dz / length,
          halfLength: (RAILWAY_ROADSIDE_HALF_WIDTH + halfWidth * cosine) / sine + .6, halfWidth, sourceRoad: road.seg || road.id.replace(/_\d+$/, '') });
      }
    }
  }
  const gaps: RailwayRoadGap[] = [];
  for (const candidate of raw) {
    let gap = candidate;
    for (let i = gaps.length - 1; i >= 0; i--) {
      const other = gaps[i], dx = other.x - gap.x, dz = other.z - gap.z;
      if (other.sourceRoad !== gap.sourceRoad || Math.abs(other.y - gap.y) > .55 || Math.abs(other.hx * gap.hx + other.hz * gap.hz) < .96 || Math.abs(cross(dx, dz, gap.hx, gap.hz)) > 3) continue;
      const s = dx * gap.hx + dz * gap.hz;
      if (Math.abs(s) > other.halfLength + gap.halfLength + 24) continue;
      const lo = Math.min(-gap.halfLength, s - other.halfLength), hi = Math.max(gap.halfLength, s + other.halfLength), mid = (lo + hi) / 2;
      gap = { ...gap, x: gap.x + gap.hx * mid, z: gap.z + gap.hz * mid, halfLength: (hi - lo) / 2, halfWidth: Math.max(gap.halfWidth, other.halfWidth) }; gaps.splice(i, 1);
    }
    gaps.push(gap);
  }
  const spanBlocked = (ax: number, az: number, bx: number, bz: number, road: RoadEdge, radius = .3) => gaps.some(gap => {
    const x = ax - gap.x, z = az - gap.z, dx = bx - ax, dz = bz - az;
    let lo = 0, hi = 1;
    for (const [a, d, half] of [[x * gap.hx + z * gap.hz, dx * gap.hx + dz * gap.hz, gap.halfLength + radius],
      [x * gap.hz - z * gap.hx, dx * gap.hz - dz * gap.hx, gap.halfWidth + radius]]) {
      if (Math.abs(d) < 1e-9) { if (Math.abs(a) > half) return false; continue; }
      const u = (-half - a) / d, v = (half - a) / d; lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v)); if (lo > hi) return false;
    }
    return Math.abs(roadHeightAt(road, (ax + bx) / 2, (az + bz) / 2) - gap.y) <= .65;
  });
  return { gaps, spanBlocked, blocked: (x: number, z: number, road: RoadEdge, radius = .3) => spanBlocked(x, z, x, z, road, radius) };
}

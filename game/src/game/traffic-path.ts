import type { CityData } from '../world/city';
import { supportAt } from './physics';
import { staticSolidAt, type VehicleBounds } from './spatial-safety';

export interface TrafficPose { x: number; y: number; z: number; hx: number; hz: number }
export type TrafficGroup = 'car' | 'auto' | 'bike' | 'bus' | 'truck';

// Gameplay dimensions, not a claim about a particular manufacturer's steering.
// Long vehicles need a larger swept envelope and a lower lateral acceleration.
export function turnProfile(group: TrafficGroup, assertive = false) {
  switch (group) {
    case 'bus': return { radius: 13, minRadius: 6.5, lateral: 1.3, maxSpeed: 3.6 };
    case 'truck': return { radius: 11, minRadius: 5.8, lateral: 1.4, maxSpeed: 3.9 };
    case 'auto': return { radius: assertive ? 3.4 : 4.5, minRadius: 1.8, lateral: assertive ? 2.8 : 2.1, maxSpeed: assertive ? 6 : 5 };
    case 'bike': return { radius: 3, minRadius: 1.4, lateral: 2.5, maxSpeed: 6.5 };
    default: return { radius: 6.5, minRadius: 3.2, lateral: 2.1, maxSpeed: 6 };
  }
}

// A curve owns position AND heading. Interpolating yaw while following a sharp
// polyline still lets the body cut corners and gives collision a different yaw.
export class TrafficCurve {
  readonly lengths = [0]; readonly length: number; readonly minRadius: number;
  constructor(readonly a: TrafficPose, readonly b: TrafficPose, readonly handleA: number, readonly handleB = handleA) {
    let last = this.at(0), length = 0, maxCurvature = 0;
    for (let i = 1; i <= 80; i++) {
      const p = this.at(i / 80);
      length += Math.hypot(p.x - last.x, p.z - last.z); this.lengths.push(length); last = p;
    }
    for (let i = 0; i <= 80; i++) maxCurvature = Math.max(maxCurvature, this.curvature(i / 80));
    this.length = length; this.minRadius = maxCurvature > 1e-6 ? 1 / maxCurvature : Infinity;
  }
  private components(t: number) {
    const { a, b, handleA: ha, handleB: hb } = this, u = 1 - t;
    const ax = a.x + a.hx * ha, az = a.z + a.hz * ha, bx = b.x - b.hx * hb, bz = b.z - b.hz * hb;
    const dx = 3 * (u * u * (ax - a.x) + 2 * u * t * (bx - ax) + t * t * (b.x - bx));
    const dz = 3 * (u * u * (az - a.z) + 2 * u * t * (bz - az) + t * t * (b.z - bz));
    return { u, ax, az, bx, bz, dx, dz,
      ddx: 6 * (u * (bx - 2 * ax + a.x) + t * (b.x - 2 * bx + ax)),
      ddz: 6 * (u * (bz - 2 * az + a.z) + t * (b.z - 2 * bz + az)) };
  }
  at(t: number): TrafficPose {
    t = Math.max(0, Math.min(1, t));
    const { a, b } = this, { u, ax, az, bx, bz, dx, dz } = this.components(t), n = Math.hypot(dx, dz) || 1;
    return { x: u ** 3 * a.x + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * b.x,
      z: u ** 3 * a.z + 3 * u * u * t * az + 3 * u * t * t * bz + t ** 3 * b.z,
      y: a.y + (b.y - a.y) * t, hx: dx / n, hz: dz / n };
  }
  curvature(t: number) {
    const { dx, dz, ddx, ddz } = this.components(t), n = Math.hypot(dx, dz);
    return n < 1e-6 ? Infinity : Math.abs(dx * ddz - dz * ddx) / n ** 3;
  }
  sample(distance: number): TrafficPose {
    distance = Math.max(0, Math.min(this.length, distance));
    let lo = 0, hi = this.lengths.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.lengths[mid] < distance) lo = mid; else hi = mid; }
    return this.at((lo + (distance - this.lengths[lo]) / (this.lengths[hi] - this.lengths[lo] || 1)) / 80);
  }
}

// Offset lanes meet at a different radius from their road centreline. Compute
// the tangent intersection from the actual lane endpoints before rounding it.
export function roundedTrafficCorner(a: TrafficPose, b: TrafficPose) {
  const angle = Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hz * b.hz)));
  const dx = b.x - a.x, dz = b.z - a.z, cross = a.hx * b.hz - a.hz * b.hx;
  if (Math.abs(cross) < 0.0001) return new TrafficCurve(a, b, Math.hypot(dx, dz) / 3);
  const incoming = (dx * b.hz - dz * b.hx) / cross, outgoing = (a.hx * dz - a.hz * dx) / cross;
  const k = 4 / 3 * Math.tan(angle / 4) / Math.tan(angle / 2);
  return new TrafficCurve(a, b, Math.max(.02, incoming * k), Math.max(.02, outgoing * k));
}

export function turnSpeed(curve: TrafficCurve, group: TrafficGroup, assertive = false) {
  const p = turnProfile(group, assertive);
  return Math.min(curve.minRadius < 30 ? p.maxSpeed : Infinity, Math.sqrt(p.lateral * curve.minRadius));
}

// OBB SAT checks every body's axes. Parallel-lane-only following misses vehicles
// entering a junction from a different edge. A flyover does not block ground traffic.
export function trafficOverlap(a: VehicleBounds, b: VehicleBounds, margin = 0.25) {
  if (a.y + a.size[1] < b.y + 0.15 || b.y + b.size[1] < a.y + 0.15) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > (a.size[2] + b.size[2] + a.size[0] + b.size[0]) / 2 + margin) return false;
  for (const [x, z] of [[a.hx, a.hz], [a.hz, -a.hx], [b.hx, b.hz], [b.hz, -b.hx]]) {
    const ar = Math.abs(x * a.hx + z * a.hz) * a.size[2] / 2 + Math.abs(x * a.hz - z * a.hx) * a.size[0] / 2;
    const br = Math.abs(x * b.hx + z * b.hz) * b.size[2] / 2 + Math.abs(x * b.hz - z * b.hx) * b.size[0] / 2;
    if (Math.abs(dx * x + dz * z) >= ar + br + margin) return false;
  }
  return true;
}

export function trafficPoseClear(city: CityData, p: TrafficPose, size: number[]) {
  const halfW = size[0] / 2 + 0.08, halfL = size[2] / 2 + 0.12;
  // Support the corners, nose, tail and middle on actual loaded carriageway,
  // rather than accepting a nearby graph edge or a road's pavement margin.
  for (const along of [-halfL, 0, halfL]) for (const side of [-halfW, 0, halfW]) {
    const x = p.x + p.hx * along + p.hz * side, z = p.z + p.hz * along - p.hx * side;
    const s = supportAt(city, x, z, p.y + 0.3, true);
    if (!s.onRoad || !s.s || Math.abs(s.y - p.y) > 1.25) return false;
    const dx = s.s.bx - s.s.ax, dz = s.s.bz - s.s.az, ll = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.s.ax) * dx + (z - s.s.az) * dz) / ll));
    if (Math.hypot(x - s.s.ax - dx * t, z - s.s.az - dz * t) > (s.s.e?.w ?? s.s.hw * 2) / 2 + 0.15) return false;
  }
  // Overlapping circles conservatively cover the body, including bus tail swing.
  const n = Math.max(2, Math.ceil((size[2] - size[0]) / Math.max(0.5, halfW)));
  const end = Math.max(0, size[2] / 2 - size[0] / 2);
  for (let i = 0; i <= n; i++) {
    const along = -end + 2 * end * i / n, x = p.x + p.hx * along, z = p.z + p.hz * along;
    const roadY = supportAt(city, x, z, p.y + 0.3, true).y;
    if (staticSolidAt(city, { x, z, y: roadY + size[1] / 2 + 0.32 }, halfW, Math.max(0.2, size[1] / 2 - 0.28))) return false;
  }
  return true;
}

export function trafficCurveClear(curve: TrafficCurve, city: CityData, size: number[]) {
  const n = Math.max(2, Math.ceil(curve.length / 0.65));
  for (let i = 0; i <= n; i++) if (!trafficPoseClear(city, curve.sample(curve.length * i / n), size)) return false;
  return true;
}

import type { CityData, Wall } from '../world/city';
import { pointInRing } from '../world/city';
import type { RoadGraph } from './roadgraph';
import { nearbyBuildings, supportAt } from './physics';

interface Point { x: number; y: number; z: number }
export interface VehicleBounds extends Point { hx: number; hz: number; size: number[] }
export interface StreetSpot extends Point { yaw: number }

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}

// Shared by camera clearance and placement: visible poles and barriers matter as
// well as building footprints. Horizontal and vertical clearance are independent.
export function staticSolidAt(city: CityData, p: Point, radius = 0.35, halfHeight = radius): boolean {
  if (p.y - halfHeight < supportAt(city, p.x, p.z, p.y, true).y + 0.02) return true;
  for (const b of nearbyBuildings(city, p.x, p.z)) {
    if (b.h < p.y - halfHeight) continue;
    if (pointInRing(p.x, p.z, b.ring)) return true;
    for (let i = 0, j = b.ring.length - 1; i < b.ring.length; j = i++) {
      if (segmentDistance(p.x, p.z, ...b.ring[j], ...b.ring[i]).d < radius) return true;
    }
  }
  const cx = Math.floor(p.x / 50), cz = Math.floor(p.z / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of city.obstacles.get(`${cx + i},${cz + j}`) || []) {
    if (p.y + halfHeight >= 0 && p.y - halfHeight <= o.top && Math.hypot(p.x - o.x, p.z - o.z) < o.r + radius) return true;
  }
  const seen = new Set<Wall>(), sx = Math.floor(p.x / 30), sz = Math.floor(p.z / 30);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const cell = `${sx + i},${sz + j}`;
    for (const w of city.walls.get(cell) || []) {
      if (seen.has(w) || w.kind === 'kerb') continue; seen.add(w);
      const { d, t } = segmentDistance(p.x, p.z, w.ax, w.az, w.bx, w.bz);
      if (d < radius && p.y + halfHeight >= w.y0a + (w.y0b - w.y0a) * t && p.y - halfHeight <= w.y1a + (w.y1b - w.y1a) * t) return true;
    }
    for (const s of city.surfaceGrid.get(cell) || []) {
      if (s.kind === 'road') continue;
      const { d, t } = segmentDistance(p.x, p.z, s.ax, s.az, s.bx, s.bz);
      const y = s.ya + (s.yb - s.ya) * t;
      if (d < s.hw + radius && p.y - halfHeight < y + 0.05 && p.y + halfHeight > y - 0.3) return true;
    }
  }
  return false;
}

// Segment/OBB slabs use the full length of buses and trucks, not a circle around
// their centre. A vehicle on a bridge does not occlude a camera below its floor.
export function segmentHitsVehicle(from: Point, to: Point, c: VehicleBounds, padding = 0.4): boolean {
  const local = (p: Point) => {
    const dx = p.x - c.x, dz = p.z - c.z;
    return [dx * c.hz - dz * c.hx, p.y - c.y, dx * c.hx + dz * c.hz];
  };
  const a = local(from), b = local(to);
  const lo = [-c.size[0] / 2 - padding, -padding, -c.size[2] / 2 - padding];
  const hi = [c.size[0] / 2 + padding, c.size[1] + padding, c.size[2] / 2 + padding];
  let enter = 0, leave = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-8) { if (a[i] < lo[i] || a[i] > hi[i]) return false; continue; }
    const t0 = (lo[i] - a[i]) / d, t1 = (hi[i] - a[i]) / d;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
    if (enter > leave) return false;
  }
  return true;
}

export function clearCameraPosition(city: CityData, from: Point, wanted: Point): Point {
  const distance = (p: Point) => Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
  const trace = (to: Point): Point => {
    const steps = Math.max(1, Math.ceil(distance(to) / 0.25)); let clear = { ...from };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
      if (staticSolidAt(city, p)) break;
      clear = p;
    }
    return clear;
  };
  const direct = trace(wanted);
  if (distance(direct) >= 2.5 || distance(wanted) < 2.5) return direct;
  // Never jump to an unchecked point above the car: that point may be a cornice
  // or a flyover. Try clear elevated/side views, retaining a verified sightline.
  const dx = wanted.x - from.x, dz = wanted.z - from.z, l = Math.hypot(dx, dz) || 1;
  const candidates = [{ x: from.x, y: from.y + 4, z: from.z }, ...[-1, 1].map(sign => ({
    x: from.x + sign * dz / l * 4, y: from.y + 2.5, z: from.z - sign * dx / l * 4,
  }))];
  let best = direct;
  for (const candidate of candidates) { const clear = trace(candidate); if (distance(clear) > distance(best)) best = clear; }
  return best;
}

function roadClearAt(city: CityData, x: number, z: number, y: number): boolean {
  const sup = supportAt(city, x, z, y + 0.5, true), s = sup.s;
  if (!s || !sup.onRoad || sup.y > 1.2 || Math.abs(sup.y - y) > 0.6) return false;
  return segmentDistance(x, z, s.ax, s.az, s.bx, s.bz).d <= Math.max(0, (s.e?.w ?? s.hw * 2) / 2 - 1.15);
}

export function streetFootprintClear(city: CityData, p: Point, hx: number, hz: number, vehicles: VehicleBounds[] = []): boolean {
  // Three overlapping circles cover the coupe's nose, body and tail.
  for (const along of [-1.25, 0, 1.25]) {
    if (staticSolidAt(city, { x: p.x + hx * along, y: p.y + 0.75, z: p.z + hz * along }, 1.15, 0.6)) return false;
  }
  return !vehicles.some(c => segmentHitsVehicle(
    { x: p.x - hx * 1.25, y: p.y + 0.75, z: p.z - hz * 1.25 },
    { x: p.x + hx * 1.25, y: p.y + 0.75, z: p.z + hz * 1.25 }, c, 1.15));
}

export function findClearStreetSpot(graph: RoadGraph, city: CityData, x: number, z: number,
  options: { preferMajor?: boolean; heading?: { x: number; z: number }; vehicles?: VehicleBounds[] } = {}): StreetSpot | null {
  const allowed = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'unknown', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'service']);
  const projections: { g: ReturnType<RoadGraph['nearestEdges']>[number]; s: number; d: number }[] = [];
  for (const g of graph.nearestEdges(x, z, 10)) {
    if (!allowed.has(g.e.cls) || g.len < 12 || g.e.w < 3 || g.e.elev?.some(y => y > 1.2)) continue;
    for (let i = 0; i < g.e.pts.length - 1; i++) {
      const a = g.e.pts[i], b = g.e.pts[i + 1], q = segmentDistance(x, z, ...a, ...b);
      if (q.d <= 550) projections.push({ g, s: g.cum[i] + (g.cum[i + 1] - g.cum[i]) * q.t, d: q.d });
    }
  }
  projections.sort((a, b) => a.d - b.d);
  let best: (StreetSpot & { score: number }) | null = null; const visited = new Set<string>();
  for (const { g, s, d } of projections.slice(0, 80)) {
    if (best && d > best.score + 5) continue;
    const maxLane = Math.max(0, g.e.w / 2 - 1.3);
    const lane = g.e.oneway ? 0 : Math.min(maxLane, Math.max(1.5, g.e.w / 4));
    for (const dir of [1, -1] as const) {
      if ((dir === 1 && g.e.oneway === 'forward') || (dir === -1 && g.e.oneway === 'backward')) continue;
      for (const shift of [0, 6, -6, 12, -12, 24, -24, 48, -48]) for (const offset of [lane, Math.max(0, lane - 0.6)]) {
        const sf = Math.max(4, Math.min(g.len - 4, s + shift)), key = `${g.e.id}:${sf.toFixed(1)}:${dir}:${offset}`;
        if (visited.has(key)) continue; visited.add(key);
        const p = graph.pointAt(g, dir === 1 ? sf : g.len - sf, dir, offset);
        const sup = supportAt(city, p.x, p.z, p.y + 0.5, true); p.y = sup.y;
        const headingCost = options.heading ? (1 - (p.hx * options.heading.x + p.hz * options.heading.z)) * 3 : 0;
        const score = Math.hypot(p.x - x, p.z - z) + headingCost + (options.preferMajor && ['residential', 'unclassified', 'unknown', 'service', 'living_street'].includes(g.e.cls) ? 20 : 0);
        if (best && score >= best.score) continue;
        let clear = true;
        // A legal tangent at a bend may face an immediately adjacent facade.
        // Require a short forward exit as well as a free final footprint.
        for (const ahead of [0, 2, 4, 6, 8]) {
          const at = { x: p.x + p.hx * ahead, y: p.y, z: p.z + p.hz * ahead };
          if (!roadClearAt(city, at.x, at.z, at.y) || !streetFootprintClear(city, at, p.hx, p.hz, options.vehicles)) { clear = false; break; }
        }
        if (clear) best = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.hx, -p.hz), score };
      }
    }
  }
  if (!best) return null;
  const { score: _, ...spot } = best; return spot;
}

import { ShapeUtils, Vector2 } from 'three';
import type { Building, RoadEdge, XZ } from './types';
import { auxiliaryLane, travelDirection } from './expressway';
import { metroCorridors, metroStationFrame, type MetroLineInput } from './metro-geometry';

// Source footprints are retained in the packs. Only the generated, solid model
// is trimmed where conflicting source layers otherwise close a transport route.
export interface BuildingCorrection { sourceId: string; corridors: string[]; sourceArea: number; retainedArea: number; fragments: number; fallback?: string }
interface Cut { id: string; ring: XZ[]; floor: number; top: number; bounds: number[] }
type Metro = { lines: MetroLineInput[]; stations: { id: string; p: XZ; lines?: string[] }[]; deckHeight: number };
export interface TransportPatch { id: string; ring: XZ[]; y: number }
export const footprintArea = (ring: readonly XZ[]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const bbox = (ring: readonly XZ[]) => [Math.min(...ring.map(p => p[0])), Math.max(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[1]))];
const overlaps = (a: number[], b: number[]) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function ccw(ring: XZ[]) { return ring.reduce((v, p, i) => { const q = ring[(i + 1) % ring.length]; return v + p[0] * q[1] - q[0] * p[1]; }, 0) < 0 ? ring.slice().reverse() : ring; }
function halfPlane(poly: XZ[], a: XZ, b: XZ, inside: boolean): XZ[] {
  const out: XZ[] = [], sign = inside ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dp = cross(a, b, p) * sign, dq = cross(a, b, q) * sign;
    const pi = dp >= -1e-8, qi = dq >= -1e-8;
    if (pi) out.push(p);
    if (pi !== qi) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out.filter((p, i) => !i || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-7);
}
function intersection(poly: XZ[], cut: XZ[]) { for (let i = 0; i < cut.length && poly.length; i++) poly = halfPlane(poly, cut[i], cut[(i + 1) % cut.length], true); return poly; }
function subtract(poly: XZ[], cut: XZ[]) {
  const out: XZ[][] = []; let remaining = poly;
  for (let i = 0; i < cut.length && remaining.length >= 3; i++) {
    const a = cut[i], b = cut[(i + 1) % cut.length], outside = halfPlane(remaining, a, b, false);
    if (outside.length >= 3 && footprintArea(outside) > 1e-6) out.push(outside);
    remaining = halfPlane(remaining, a, b, true);
  }
  return out;
}
function triangles(ring: XZ[]) { return ShapeUtils.triangulateShape(ring.map(p => new Vector2(...p)), []).map(t => t.map(i => ring[i])); }

export function buildingTransportClearance(roads: readonly RoadEdge[], metro?: Metro, extent?: number[], patches: readonly TransportPatch[] = []) {
  const grid = new Map<string, Cut[]>(), cuts: Cut[] = [];
  const add = (id: string, ring: XZ[], floor: number, top: number) => {
    const original = ring;
    ring = ccw(ring);
    // Hairpin source vertices can make a joined quad concave or folded. The
    // renderer draws this exact 0-2 diagonal, so retain its actual two triangles.
    if (ring.length === 4 && ring.some((p, i) => cross(p, ring[(i + 1) % 4], ring[(i + 2) % 4]) < -1e-7)) {
      add(id, [original[0], original[1], original[2]], floor, top); add(id, [original[0], original[2], original[3]], floor, top); return;
    }
    if (footprintArea(ring) < 1e-8) return;
    const bounds = bbox(ring); if (extent && !overlaps(bounds, extent)) return;
    const cut = { id, ring: ccw(ring), floor, top, bounds }; cuts.push(cut);
    for (let x = Math.floor(bounds[0] / 50); x <= Math.floor(bounds[1] / 50); x++) for (let z = Math.floor(bounds[2] / 50); z <= Math.floor(bounds[3] / 50); z++) {
      const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(cut);
    }
  };
  const span = (id: string, a: XZ, b: XZ, left: number, right: number, floor: number, top: number, endPadding = 0) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < .01) return;
    const nx = -dz / len, nz = dx / len;
    const ax = a[0] - dx / len * endPadding, az = a[1] - dz / len * endPadding, bx = b[0] + dx / len * endPadding, bz = b[1] + dz / len * endPadding;
    add(id, [[ax + nx * left, az + nz * left], [bx + nx * left, bz + nz * left], [bx - nx * right, bz - nz * right], [ax - nx * right, az - nz * right]], floor, top);
  };
  for (const road of roads) {
    if (/^(footway|path|steps|pedestrian|cycleway|bridleway|track)$/.test(road.cls)) continue;
    const extra = auxiliaryLane(road, roads as RoadEdge[]), outer = -travelDirection(road);
    // Match the renderer's whole-edge minimum width and shared corner vertices,
    // rather than independent square-ended strips that leave a gap at a bend.
    const elevated = !!road.elev?.some(y => y > 1.2), hw = Math.max(road.w / 2, elevated ? 4.2 : 0) + .2;
    const boundary = (side: number) => road.pts.map((p, i): XZ => {
      const a = road.pts[Math.max(0, i - 1)], b = road.pts[Math.min(road.pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
      const off = side * (hw + (side === outer ? extra[i] || 0 : 0));
      return [p[0] - dz / len * off, p[1] + dx / len * off];
    });
    const left = boundary(1), right = boundary(-1);
    for (let i = 1; i < road.pts.length; i++) {
      const ya = road.elev?.[i - 1] || 0, yb = road.elev?.[i] || 0, raised = Math.max(ya, yb) > 1.2;
      add(`road:${road.id}`, [right[i - 1], right[i], left[i], left[i - 1]], raised ? Math.min(ya, yb) - 1 : -.1, Math.max(ya, yb) + 4.8);
    }
  }
  for (const patch of patches) add(`junction:${patch.id}`, patch.ring, patch.y > 1.2 ? patch.y - 1 : -.1, patch.y + 4.8);
  if (metro) {
    const corridors = metroCorridors(metro.lines), dh = metro.deckHeight || 11;
    // Physical girders/decks/parapets overlap their segment ends by 0.1 m.
    for (const c of corridors) for (let i = 1; i < c.center.pts.length; i++) span(`metro:${c.id}`, c.center.pts[i - 1], c.center.pts[i], 4.8, 4.8, dh - 1.3, dh + 6.5, .2);
    for (const station of metro.stations) {
      const f = metroStationFrame(station, corridors); if (!f) continue;
      span(`station:${station.id}`, [f.cx - f.hx * 69, f.cz - f.hz * 69], [f.cx + f.hx * 69, f.cz + f.hz * 69], 13.4, 13.4, dh - 4.2, dh + 12.5);
    }
  }
  const nearby = (ring: XZ[], bottom: number, top: number) => {
    const b = bbox(ring), out = new Set<Cut>();
    for (let x = Math.floor(b[0] / 50); x <= Math.floor(b[1] / 50); x++) for (let z = Math.floor(b[2] / 50); z <= Math.floor(b[3] / 50); z++) for (const cut of grid.get(`${x},${z}`) || []) {
      if (top > cut.floor + .01 && bottom < cut.top - .01 && overlaps(b, cut.bounds)) out.add(cut);
    }
    return [...out];
  };
  const correct = (building: Building): { pieces: Building[]; correction: BuildingCorrection } | null => {
    if (building.ring.length < 3 || !(building.h > 0)) return null;
    const candidates = nearby(building.ring, 0, building.h + .9); if (!candidates.length) return null;
    const sourceArea = footprintArea(building.ring), original = triangles(building.ring);
    const intersecting = candidates.filter(c => original.some(t => footprintArea(intersection(t, c.ring)) > 1e-5));
    if (!intersecting.length) return null;
    let pieces = original, fallback: string | undefined;
    for (const cut of intersecting) {
      pieces = pieces.flatMap(poly => footprintArea(intersection(poly, cut.ring)) > 1e-5 ? subtract(poly, cut.ring) : [poly]);
      if (pieces.length > 2048) { pieces = []; fallback = 'fragment budget exceeded; conflicting generated model omitted'; break; }
    }
    const retainedArea = pieces.reduce((a, p) => a + footprintArea(p), 0);
    return { pieces: pieces.map((ring, i) => ({ ...building, id: `${building.id}~clear${i}`, sourceId: building.id, ring })),
      correction: { sourceId: building.id, corridors: [...new Set(intersecting.map(c => c.id))], sourceArea, retainedArea, fragments: pieces.length, ...(fallback ? { fallback } : {}) } };
  };
  const clear = (ring: XZ[], bottom: number, top: number) => {
    const candidates = nearby(ring, bottom, top); if (!candidates.length) return true;
    return triangles(ring).every(t => candidates.every(c => footprintArea(intersection(t, c.ring)) <= 1e-5));
  };
  return { correct, clear, cuts: cuts.length };
}

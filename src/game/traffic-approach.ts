import type { GEdge } from './roadgraph';
import type { XZ } from '../world/types';

// Grade sampling adds points without adding intersections. Turning room is
// the near-straight physical approach, not its final centimetres-long sample.
const LIMIT = 60, MIN_DOT = Math.cos(.12), SHORT_DOT = Math.cos(.35);
type CachedRoom = { points: XZ[]; count: number; rooms: [number, number]; bends: Map<number, [number, number]> };
const cache = new WeakMap<GEdge, CachedRoom>();
function room(points: XZ[], start: number, step: 1 | -1) {
  let i = start, distance = 0, hx = 0, hz = 0, firstLength = 0;
  // A rounded ten-centimetre endpoint can have a diagonal tiny chord even on
  // an otherwise straight road. Use a two-metre secant only for that case;
  // a genuine sharp reversal still keeps its original short approach.
  for (let at = start, span = 0; at + step >= 0 && at + step < points.length; at += step) {
    const a = points[at], b = points[at + step], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 1e-7) continue;
    if (!firstLength) { firstLength = length; hx = dx / length; hz = dz / length; if (length >= .5) break; }
    const t = Math.min(1, (2 - span) / length), x = a[0] + dx * t - points[start][0], z = a[1] + dz * t - points[start][1], norm = Math.hypot(x, z);
    if (span + length >= 2 || at + step === (step < 0 ? 0 : points.length - 1)) {
      if (norm > 1e-7 && (hx * x + hz * z) / norm >= SHORT_DOT) { hx = x / norm; hz = z / norm; }
      break;
    }
    span += length;
  }
  for (; i + step >= 0 && i + step < points.length; i += step) {
    const a = points[i], b = points[i + step], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 1e-7) continue;
    const dot = (hx * dx + hz * dz) / length;
    const tinyRoundedEnd = firstLength < .5 && distance < .5 && length < .5 && dot >= SHORT_DOT;
    if (!tinyRoundedEnd && dot < MIN_DOT) break;
    distance += length; if (distance >= LIMIT) return LIMIT;
  }
  return distance;
}
function cachedRooms(edge: GEdge) {
  let saved = cache.get(edge);
  if (!saved || saved.points !== edge.e.pts || saved.count !== edge.e.pts.length) {
    saved = { points: edge.e.pts, count: edge.e.pts.length, rooms: [room(edge.e.pts, 0, 1), room(edge.e.pts, edge.e.pts.length - 1, -1)], bends: new Map() };
    cache.set(edge, saved);
  }
  return saved;
}
export function trafficApproachRoom(edge: GEdge, dir: 1 | -1, end: boolean) {
  const saved = cachedRooms(edge);
  return saved.rooms[(dir === 1) === end ? 1 : 0];
}
export function trafficBendRoom(edge: GEdge, index: number, dir: 1 | -1): [number, number] {
  if (!Number.isInteger(index) || index <= 0 || index >= edge.e.pts.length - 1) return [0, 0];
  const saved = cachedRooms(edge); let sides = saved.bends.get(index);
  if (!sides) { sides = [room(edge.e.pts, index, -1), room(edge.e.pts, index, 1)]; saved.bends.set(index, sides); }
  return dir === 1 ? sides : [sides[1], sides[0]];
}

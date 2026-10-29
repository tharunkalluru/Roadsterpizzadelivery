import type { RoadGraph, GEdge } from '../game/roadgraph';
import { TrafficCurve, type TrafficPose } from '../game/traffic-path';
import { hasCentreMedian } from '../world/city';
import type { DeliveryPoint } from './modules/types';

export interface TruckRouteLeg { edgeId: string; dir: 1 | -1; lane: number; from: string; to: string; start: number; end: number }
export interface TruckRouteOptions { width: number; halfLength: number; centerOffset?: number; maxDistance?: number; margin?: number; joinClear?: (pose: TrafficPose) => boolean }

/** A wide one-way carriageway can fit the truck without widening any road.
 * A two-way road must fit it on its own side of the actual centre divider. */
export function truckLane(edge: GEdge, dir: 1 | -1, preferred: number, width: number): number | null {
  if (![edge.len, edge.e.w, width, preferred].every(Number.isFinite) || edge.len < 20 || width <= 0 ||
    /foot|path|steps|cycle/.test(edge.e.cls) || edge.e.workZone ||
    (dir === 1 ? edge.e.oneway === 'forward' : edge.e.oneway === 'backward') ||
    edge.e.elev?.some(y => !Number.isFinite(y) || Math.abs(y) > 1.5)) return null;
  const half = width / 2, outer = edge.e.w / 2 - half - .3;
  const inner = edge.e.oneway ? -outer : half + (hasCentreMedian(edge.e) ? .95 : .35);
  if (edge.e.w < (edge.e.oneway ? width + .6 : 12) || outer < inner) return null;
  return Math.max(inner, Math.min(outer, preferred));
}

function onCarriageway(edge: GEdge, dir: 1 | -1, x: number, y: number, z: number) {
  for (let i = 1; i < edge.e.pts.length; i++) {
    const a = edge.e.pts[i - 1], b = edge.e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .01) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
    const px = a[0] + dx * u, pz = a[1] + dz * u, elevation = (edge.e.elev?.[i - 1] || 0) * (1 - u) + (edge.e.elev?.[i] || 0) * u;
    if (Math.abs(y - elevation) > .5 || Math.hypot(x - px, z - pz) > edge.e.w / 2 - .08) continue;
    const side = ((x - px) * dz - (z - pz) * dx) / len * dir;
    if (!edge.e.oneway && side < (hasCentreMedian(edge.e) ? .8 : .1)) continue;
    return true;
  }
  return false;
}

/** Up to four kilometres of existing directed roads. Never links nearby but
 * disconnected streets, reverses a one-way lane or invents a looping road. */
export function sampleTruckRoute(graph: RoadGraph, first: GEdge, dir: 1 | -1, lane: number, options: TruckRouteOptions) {
  const points: DeliveryPoint[] = [], legs: TruckRouteLeg[] = [], visited = new Set<string>();
  const centerOffset = options.centerOffset ?? 0;
  const maximum = Math.max(80, Math.min(4000, options.maxDistance ?? 4000)), margin = options.margin ?? Math.max(6, options.halfLength + Math.abs(centerOffset) + 2);
  let length = 0, reason = 'mapped endpoint', current = first, direction = dir, offset = truckLane(first, dir, lane, options.width), start = margin;
  if (offset == null) return { points, legs, length, reason: 'carriageway too narrow or incompatible' };
  const append = (point: DeliveryPoint) => {
    const prior = points.at(-1), distance = prior ? Math.hypot(point.x - prior.x, point.z - prior.z) : 0;
    if (!prior || distance > .01) { points.push({ x: point.x, y: point.y, z: point.z }); length += distance; }
  };
  const roadPoints = (edge: GEdge, heading: 1 | -1, lateral: number, lo: number, hi: number) => {
    for (let s = lo; s < hi; s += 4) append(graph.pointAt(edge, s, heading, lateral));
    append(graph.pointAt(edge, hi, heading, lateral));
  };
  for (let n = 0; n < 96; n++) {
    visited.add(current.e.id);
    const from = direction === 1 ? current.from : current.to, to = direction === 1 ? current.to : current.from;
    const endPose = graph.pointAt(current, current.len, direction), remaining = maximum - length;
    const end = Math.min(current.len - margin, start + remaining);
    if (remaining <= 0 || start >= current.len) break;
    const possibilities = (graph.nodes.get(to)?.out || []).filter(next => !visited.has(next.edge.e.id)).map(next => {
      const lane = truckLane(next.edge, next.dir, offset!, options.width), at = graph.pointAt(next.edge, 0, next.dir);
      return { ...next, lane, at, straight: at.hx * endPose.hx + at.hz * endPose.hz };
    }).filter(next => next.lane != null && next.straight >= .9 && Math.hypot(next.at.x - endPose.x, next.at.z - endPose.z) <= .35 && Math.abs(next.at.y - endPose.y) <= .25)
      .sort((a, b) => b.straight - a.straight || Number(b.edge.e.name === current.e.name) - Number(a.edge.e.name === current.e.name) || a.edge.e.id.localeCompare(b.edge.e.id));
    let selected: typeof possibilities[number] | undefined, curve: TrafficCurve | undefined, nextStart = 0, thisEnd = 0;
    if (remaining > current.len - start + 40) for (const next of possibilities) {
      const trim = Math.min(20, (current.len - start) / 3, next.edge.len / 3), a = graph.pointAt(current, current.len - trim, direction, offset), b = graph.pointAt(next.edge, trim, next.dir, next.lane!);
      const distance = Math.hypot(b.x - a.x, b.z - a.z), candidate = new TrafficCurve(a, b, distance / 3);
      if (candidate.minRadius < options.halfLength * 1.2) continue;
      let clear = true;
      for (let s = 0; s <= candidate.length + .5 && clear; s += .8) {
        const p = candidate.sample(Math.min(s, candidate.length));
        if (options.joinClear?.(p) === false) { clear = false; break; }
        // Check nose, middle, tail and both sides of the whole body against
        // the union of these two real carriageways, including divider sides.
        for (const along of [centerOffset - options.halfLength - .12, centerOffset, centerOffset + options.halfLength + .12]) for (const side of [-options.width / 2 - .08, 0, options.width / 2 + .08]) {
          const x = p.x + p.hx * along + p.hz * side, z = p.z + p.hz * along - p.hx * side;
          // Source data may split one road into a short segment. The tail can
          // still occupy the preceding verified segment while the nose enters
          // the next, so retain that real connected carriageway in the union.
          const prior = legs.at(-1), priorEdge = prior && graph.byId.get(prior.edgeId);
          if (!onCarriageway(current, direction, x, p.y, z) && !onCarriageway(next.edge, next.dir, x, p.y, z) &&
            !(prior && priorEdge && onCarriageway(priorEdge, prior.dir, x, p.y, z))) clear = false;
        }
      }
      if (clear) { selected = next; curve = candidate; thisEnd = current.len - trim; nextStart = trim; break; }
    }
    const until = selected ? thisEnd : end;
    if (until <= start) break;
    roadPoints(current, direction, offset, start, until);
    legs.push({ edgeId: current.e.id, dir: direction, lane: offset, from, to, start, end: until });
    if (!selected || !curve) { reason = length >= maximum - 5 ? 'distance limit' : possibilities.length ? 'unsafe or bounded junction' : 'mapped endpoint'; break; }
    for (let s = .8; s < curve.length; s += .8) append(curve.sample(s));
    append(curve.sample(curve.length));
    current = selected.edge; direction = selected.dir; offset = selected.lane!; start = nextStart;
  }
  return { points, legs, length, reason };
}

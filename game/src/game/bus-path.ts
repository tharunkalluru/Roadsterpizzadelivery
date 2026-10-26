import type { GEdge, RoadGraph } from './roadgraph';
import { hasCentreMedian } from '../world/city';
import { TrafficCurve, roundedTrafficCorner, turnProfile, type TrafficPose } from './traffic-path';
import { constructionLane } from '../world/construction';

export function busRoundedCorner(a: TrafficPose, b: TrafficPose) {
  // Intersecting almost-parallel tangents can put their artificial corner
  // hundreds of metres away when lane widths change at a source split.
  const dot = a.hx * b.hx + a.hz * b.hz;
  return dot > Math.cos(.12) ? new TrafficCurve(a, b, Math.hypot(b.x - a.x, b.z - a.z) / 3) : roundedTrafficCorner(a, b);
}

// The stored service planner and the NPC use the same lane and turn envelope.
// A legal graph connection alone is not proof that an eleven-metre bus can turn.
export function busLane(edge: GEdge, dir: 1 | -1 = 1) {
  const workLane = constructionLane(edge.e, dir); if (workLane !== undefined) return workLane;
  const half = edge.e.w / 2, margin = 1.25;
  if (edge.e.oneway) return Math.max(-half + margin + .3, Math.min(half - margin - .3, edge.e.w < 9 ? 0 : 2.8));
  const low = (hasCentreMedian(edge.e) ? .95 : .35) + margin;
  return Math.max(low, Math.min(Math.max(low, half - margin - .3), 2.8));
}

export function busTurn(graph: RoadGraph, before: GEdge, fromDir: 1 | -1, after: GEdge, toDir: 1 | -1, fromS = 0, fromLane = busLane(before, fromDir)) {
  if (before === after && fromDir !== toDir) return null;
  const entry = graph.pointAt(before, before.len - .001, fromDir), exit = graph.pointAt(after, .001, toDir);
  const angle = Math.acos(Math.max(-1, Math.min(1, entry.hx * exit.hx + entry.hz * exit.hz)));
  if (angle > Math.PI * .88) return null;
  const endIndex = fromDir === 1 ? before.cum.length - 1 : 1;
  const startIndex = toDir === 1 ? 1 : after.cum.length - 1;
  const roomIn = before.cum[endIndex] - before.cum[endIndex - 1];
  const roomOut = after.cum[startIndex] - after.cum[startIndex - 1];
  const profile = turnProfile('bus'), lane = busLane(after, toDir), wanted = Math.max(3, profile.radius * Math.tan(angle / 2));
  for (const factor of [1, 1.45, .7]) {
    const startS = Math.max(fromS, before.len - Math.min(wanted * factor, roomIn * .46));
    const endS = Math.min(wanted * factor, roomOut * .46);
    const a = graph.pointAt(before, startS, fromDir, fromLane), b = graph.pointAt(after, endS, toDir, lane);
    const curve = busRoundedCorner(a, b);
    if (Number.isFinite(curve.length) && curve.length > .05 && curve.minRadius >= profile.minRadius && Math.abs(a.y - b.y) < 3) return { curve, startS, endS, lane };
  }
  return null;
}

const turnCache = new WeakMap<RoadGraph, { revision: number; cache: Map<string, boolean> }>();
export function busTurnPossible(graph: RoadGraph, before: GEdge, fromDir: 1 | -1, after: GEdge, toDir: 1 | -1, fromS = 0) {
  // Reject topological turns which production Traffic cannot execute. Radius
  // belongs to the complete physical approach, not the final tiny source
  // segment: source roads are often split into metre-long records at a junction.
  let state = turnCache.get(graph); if (!state || state.revision !== graph.revision) { state = { revision: graph.revision, cache: new Map() }; turnCache.set(graph, state); }
  const cache = state.cache;
  const key = `${before.e.id}:${fromDir}>${after.e.id}:${toDir}`;
  if (cache.has(key)) return cache.get(key)!;
  const a = graph.pointAt(before, before.len - .001, fromDir), b = graph.pointAt(after, .001, toDir);
  const angle = Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hz * b.hz)));
  const result = !(before === after && fromDir !== toDir) && angle <= Math.PI * .88 && Math.abs(a.y - b.y) < 3;
  if (cache.size > 100000) cache.clear(); cache.set(key, result); return result;
}

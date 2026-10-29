import type { GEdge, RoadGraph } from '../game/roadgraph';
import { hasCentreMedian } from '../world/city';
import type { DeliveryPoint } from './modules/types';

export interface DeliveryRoadTargetOptions {
  /** Roofs, indoor openings, water and railway customers need a street approach. */
  offRoad: boolean;
  /** A moving road vehicle supplies its actual road/deck base, not its roof. */
  roadHeight?: number;
}
const ACCESS_RADIUS = 700, MAX_EDGES = 2048, MAX_SEGMENTS = 8192;

/** Find an actual mapped carriageway endpoint. This never joins a road to a
 * roof/door/lake, edits a road grade, or relaxes the car's source-road match. */
export function resolveDeliveryRoadTarget(graph: RoadGraph, target: DeliveryPoint,
  options: DeliveryRoadTargetOptions): DeliveryPoint | null {
  if (![target.x, target.y, target.z].every(Number.isFinite)) return null;
  const height = options.offRoad ? 0 : options.roadHeight ?? target.y;
  if (!Number.isFinite(height)) return null;
  const tolerance = options.offRoad ? 1.6 : .75;
  let best: { edge: GEdge; s: number; lateral: number; distance: number } | null = null;
  let examined = 0;
  const edges = graph.nearestEdges(target.x, target.z, Math.ceil(ACCESS_RADIUS / 60));
  for (const edge of edges.slice(0, MAX_EDGES)) {
    for (let i = 1; i < edge.e.pts.length && examined < MAX_SEGMENTS; i++) {
      examined++;
      const a = edge.e.pts[i - 1], b = edge.e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const length2 = dx * dx + dz * dz;
      if (!(length2 > .0001)) continue;
      const t = Math.max(0, Math.min(1, ((target.x - a[0]) * dx + (target.z - a[1]) * dz) / length2));
      const y = (edge.e.elev?.[i - 1] ?? 0) + ((edge.e.elev?.[i] ?? 0) - (edge.e.elev?.[i - 1] ?? 0)) * t;
      if (!Number.isFinite(y) || Math.abs(y - height) > tolerance) continue;
      const s = edge.cum[i - 1] + Math.sqrt(length2) * t, center = graph.pointAt(edge, s, 1);
      const offset = (target.x - center.x) * center.hz - (target.z - center.z) * center.hx;
      const lateral = edge.e.oneway
        ? Math.max(-Math.max(0, edge.e.w / 2 - 1.25), Math.min(Math.max(0, edge.e.w / 2 - 1.25), offset))
        : hasCentreMedian(edge.e) ? (offset < 0 ? -1 : 1) * Math.min(3.5, edge.e.w / 4) : 0;
      const point = graph.pointAt(edge, s, 1, lateral), distance = Math.hypot(point.x - target.x, point.z - target.z);
      if (distance <= ACCESS_RADIUS && (!best || distance < best.distance)) best = { edge, s, lateral, distance };
    }
    if (examined >= MAX_SEGMENTS) break;
  }
  if (!best) return null;
  const point = graph.pointAt(best.edge, best.s, 1, best.lateral);
  return { x: point.x, y: point.y, z: point.z, label: target.label };
}

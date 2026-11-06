import type { RoadEdge } from './types';

/** Parallel roads normally keep their divider. A mapped shared junction is
 * different: a shallow merging lane may overlap far beyond a short node trim.
 * This grants only a candidate opening; the caller still checks actual road
 * footprint overlap and vertical separation at the divider point.
 */
export function shareRoadJunction(a: Pick<RoadEdge, 'id' | 'from' | 'to'> | null | undefined,
  b: Pick<RoadEdge, 'id' | 'from' | 'to'> | null | undefined) {
  if (!a || !b || a.id === b.id) return false;
  return !!((a.from && (a.from === b.from || a.from === b.to)) ||
    (a.to && (a.to === b.from || a.to === b.to)));
}

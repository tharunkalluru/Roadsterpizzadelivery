import type { RoadEdge } from '../world/schema';
import type { StreetSide, SurveyStorefront } from '../world/streetSurveyTypes';

/** Keep the street's two sides separate. Reversing travel swaps sides and shop order,
 * but lower/upper signs at the same position keep their vertical order. */
export function streetSequence(road: RoadEdge, fronts: readonly SurveyStorefront[], reverse = false) {
  const start = road.points[reverse ? road.points.length - 1 : 0];
  const end = road.points[reverse ? 0 : road.points.length - 1];
  const bearing = (Math.atan2(end[0] - start[0], start[1] - end[1]) * 180 / Math.PI + 360) % 360;
  const direction = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(bearing / 45) % 8];
  return {
    direction,
    sides: (['left', 'right'] as const).map(side => {
      const canonicalSide: StreetSide = reverse ? side === 'left' ? 'right' : 'left' : side;
      const ordered=fronts.filter(f => f.roadId === road.id && f.side === canonicalSide).slice().sort((a,b) =>
        (reverse ? b.alongRoadM - a.alongRoadM : a.alongRoadM - b.alongRoadM) || a.floor - b.floor || a.id.localeCompare(b.id));
      const floors=[...new Set(ordered.map(f=>f.floor))].sort((a,b)=>a===b?0:a===0?-1:b===0?1:a<0&&b<0?b-a:a-b);
      return { side, canonicalSide, fronts:ordered, floors:floors.map(floor=>({floor,fronts:ordered.filter(f=>f.floor===floor)})) };
    }),
  };
}

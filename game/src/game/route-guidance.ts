import type { CityData } from '../world/city';
import { collideBuildings, collideWalls } from './physics';

export type RoutePoint = [number, number, number];

// Only draw the locally checked portion of the road route. A straight connector
// between two graph edges is not permission to drive through a divider or facade.
export function clearRoadGuidance(city: CityData, pts: RoutePoint[], maxLength = 700): { pts: RoutePoint[]; blocked: boolean } {
  if (!pts.length) return { pts: [], blocked: false };
  const out: RoutePoint[] = [pts[0]];
  let distance = 0;
  for (let i = 1; i < pts.length && distance < maxLength; i++) {
    const a = pts[i - 1], b = pts[i], length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length < 0.01) continue;
    const covered = Math.min(length, maxLength - distance), steps = Math.ceil(covered / 1.5);
    let previous = { x: a[0], z: a[2] };
    for (let j = 1; j <= steps; j++) {
      const u = (covered / length) * j / steps;
      const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
      const probe = { x, z };
      const wall = collideWalls(city, previous, probe, 1.05, y + 0.08, y + 1.3);
      const building = collideBuildings(city, probe, 1.15, y + 0.2);
      if (wall.hit > 0 || building > 0) return { pts: out.length > 1 ? out : [], blocked: true };
      out.push([x, y, z]); previous = { x, z };
    }
    distance += covered;
  }
  return { pts: out, blocked: false };
}

// Route length already includes the first road segment. The previous HUD added
// its X component again (and ignored Z), inflating east-west distances.
export function remainingRouteDistance(pts: RoutePoint[], routeLength: number, x: number, z: number): number {
  if (pts.length < 2) return Math.max(0, routeLength);
  let traveled = 0, bestDistance = Infinity, bestAlong = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (length * length)));
    const d = Math.hypot(x - a[0] - dx * u, z - a[2] - dz * u);
    // Prefer the first matching segment where a route doubles back at a junction.
    if (d < bestDistance - 0.1) { bestDistance = d; bestAlong = traveled + length * u; }
    traveled += length;
    if (traveled > 250) break; // a refreshed route cannot have advanced across the city
  }
  return Math.max(0, routeLength - bestAlong + (Number.isFinite(bestDistance) ? bestDistance : 0));
}

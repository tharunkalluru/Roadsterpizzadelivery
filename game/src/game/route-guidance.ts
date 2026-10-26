import type { CityData } from '../world/city';
import { collideBuildings, collideWalls, supportAt } from './physics';
import type { RoadRoute } from './roadgraph';

export type RoutePoint = [number, number, number];
export const GUIDE_WIDTH = .7; // half the former 1.4 m road ribbon

// Consume only the distance reachable since the last frame. A nearby later arm
// of a hairpin/overpass is not progress along the current route.
export function advanceRoadRoute(route: RoadRoute, position: { x: number; y: number; z: number }, maxAdvance: number) {
  if (route.pts.length === 1) {
    const p = route.pts[0];
    return { route, distance: Math.hypot(position.x - p[0], position.z - p[2]), heightError: Math.abs(position.y - p[1]) };
  }
  let along = 0, bestScore = Infinity;
  let best: { i: number; p: RoutePoint; along: number; distance: number; heightError: number } | null = null;
  for (let i = 1; i < route.pts.length && along <= maxAdvance; i++) {
    const a = route.pts[i - 1], b = route.pts[i], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    if (length < .001) continue;
    const u = Math.max(0, Math.min(1, (maxAdvance - along) / length, ((position.x - a[0]) * dx + (position.z - a[2]) * dz) / (length * length)));
    const p: RoutePoint = [a[0] + dx * u, a[1] + (b[1] - a[1]) * u, a[2] + dz * u];
    const distance = Math.hypot(position.x - p[0], position.z - p[2]), heightError = Math.abs(position.y - p[1]);
    const score = distance + heightError * 4 + (along + length * u) * .002;
    if (score < bestScore - .01) { bestScore = score; best = { i, p, along: along + length * u, distance, heightError }; }
    along += length;
  }
  if (!best) {
    const p = route.pts[0];
    return p ? { route: { ...route, pts: [p] }, distance: Math.hypot(position.x - p[0], position.z - p[2]), heightError: Math.abs(position.y - p[1]) } : null;
  }
  const pts = [best.p, ...route.pts.slice(best.i)];
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[1][0], pts[0][2] - pts[1][2]) < .001) pts.shift();
  return { route: { ...route, pts, len: Math.max(0, route.len - best.along) }, distance: best.distance, heightError: best.heightError };
}

// Offset endpoints at a source split can differ by a few centimetres. Keep the
// source route, but do not draw an out-and-back ribbon around that tiny join.
// Every replacement still needs loaded, same-grade pavement and car clearance.
function compactRoadJoins(city: CityData, pts: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [pts[0]]; let travelled = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const ab = Math.hypot(b[0] - a[0], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[2] - b[2]);
    travelled += bc;
    if (travelled > 720) return [...out, ...pts.slice(i)];
    if (Math.min(ab, bc) >= .75) { out.push(b); continue; }
    const dx = c[0] - a[0], dz = c[2] - a[2], length = Math.hypot(dx, dz);
    if (length < .1 || length > 720) { out.push(b); continue; }
    const u = Math.max(0, Math.min(1, ((b[0] - a[0]) * dx + (b[2] - a[2]) * dz) / (length * length)));
    if (Math.hypot(b[0] - a[0] - dx * u, b[2] - a[2] - dz * u) > .5 || Math.abs(b[1] - a[1] - (c[1] - a[1]) * u) > .1) { out.push(b); continue; }
    let clear = true, previous = { x: a[0], z: a[2] };
    const steps = Math.max(2, Math.ceil(length / .75));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, p = { x: a[0] + dx * t, z: a[2] + dz * t }, y = a[1] + (c[1] - a[1]) * t;
      const support = supportAt(city, p.x, p.z, y + .1, true);
      if (!support.onRoad || Math.abs(support.y - y) > .35 || collideWalls(city, previous, p, 1.05, y + .08, y + 1.3).hit || collideBuildings(city, p, 1.15, y + .2)) { clear = false; break; }
      previous = p;
    }
    if (!clear) out.push(b);
  }
  out.push(pts[pts.length - 1]); return out;
}

// Small corner fillets are accepted only on loaded pavement at the same height
// and with the player's wall/facade clearance. Tight or unverified turns keep
// their legal polyline; a cosmetic spline must never invent a shortcut.
export function softenRoadCorners(city: CityData, pts: RoutePoint[]): RoutePoint[] {
  if (pts.length < 3 || !city.surfaceGrid) return pts;
  pts = compactRoadJoins(city, pts);
  const out: RoutePoint[] = [pts[0]]; let traversed = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ab = Math.hypot(b[0] - a[0], b[2] - a[2]), bc = Math.hypot(c[0] - b[0], c[2] - b[2]);
    traversed += ab;
    if (traversed > 720) { out.push(b); return out; }
    if (ab < .1 || bc < .1) { out.push(b); continue; }
    const dot = ((b[0] - a[0]) * (c[0] - b[0]) + (b[2] - a[2]) * (c[2] - b[2])) / (ab * bc);
    if (dot > .985 || dot < -.85) { out.push(b); continue; }
    const trim = Math.min(4, ab * .22, bc * .22);
    const entry = b.map((v, k) => v + (a[k] - v) * trim / ab) as RoutePoint;
    const exit = b.map((v, k) => v + (c[k] - v) * trim / bc) as RoutePoint;
    const curve: RoutePoint[] = [entry]; let valid = true;
    for (let j = 1; j <= 12; j++) {
      const u = j / 12, v = 1 - u;
      const p = b.map((n, k) => v * v * entry[k] + 2 * u * v * n + u * u * exit[k]) as RoutePoint;
      const support = supportAt(city, p[0], p[2], p[1] + .1, true);
      const prev = curve[curve.length - 1], probe = { x: p[0], z: p[2] };
      if (!support.onRoad || Math.abs(support.y - p[1]) > .35 || collideWalls(city, { x: prev[0], z: prev[2] }, probe, 1.05, p[1] + .08, p[1] + 1.3).hit || collideBuildings(city, probe, 1.15, p[1] + .2)) { valid = false; break; }
      curve.push(p);
    }
    out.push(...(valid ? curve : [b]));
  }
  out.push(pts[pts.length - 1]); return out;
}

// Shared vertices close strip joins; bounded mitres and round end caps avoid
// gaps/spikes while keeping exactly the requested half-width on straight roads.
export function guidanceRibbon(pts: RoutePoint[], width = GUIDE_WIDTH): number[] {
  if (pts.length < 2) return [];
  const out: number[] = [], sides: { l: RoutePoint; r: RoutePoint }[] = [], radius = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const al = Math.hypot(p[0] - a[0], p[2] - a[2]) || 1, bl = Math.hypot(b[0] - p[0], b[2] - p[2]) || 1;
    let ax = i ? -(p[2] - a[2]) / al : -(b[2] - p[2]) / bl, az = i ? (p[0] - a[0]) / al : (b[0] - p[0]) / bl;
    const bx = i < pts.length - 1 ? -(b[2] - p[2]) / bl : ax, bz = i < pts.length - 1 ? (b[0] - p[0]) / bl : az;
    let nx = ax + bx, nz = az + bz, n = Math.hypot(nx, nz);
    if (n < .01) { nx = ax; nz = az; n = 1; }
    nx /= n; nz /= n;
    const m = Math.min(radius * 1.5, radius / Math.max(.1, Math.abs(nx * ax + nz * az)));
    sides.push({ l: [p[0] + nx * m, p[1] + .25, p[2] + nz * m], r: [p[0] - nx * m, p[1] + .25, p[2] - nz * m] });
  }
  const tri = (a: RoutePoint, b: RoutePoint, c: RoutePoint) => out.push(...a, ...b, ...c);
  for (let i = 1; i < sides.length; i++) { const a = sides[i - 1], b = sides[i]; tri(a.l, b.l, b.r); tri(a.l, b.r, a.r); }
  for (const i of [0, pts.length - 1]) {
    const p = pts[i], q = pts[i === 0 ? 1 : i - 1], angle = Math.atan2(p[2] - q[2], p[0] - q[0]), centre: RoutePoint = [p[0], p[1] + .25, p[2]];
    for (let j = 0; j < 8; j++) {
      const a = angle - Math.PI / 2 + j * Math.PI / 8, b = a + Math.PI / 8;
      tri(centre, [p[0] + Math.cos(a) * radius, centre[1], p[2] + Math.sin(a) * radius], [p[0] + Math.cos(b) * radius, centre[1], p[2] + Math.sin(b) * radius]);
    }
  }
  return out;
}

export function navigationReadout(route: RoadRoute | null, blocked: boolean, position: { x: number; z: number }, target: { x: number; z: number }, airborne: boolean) {
  if (airborne) return {
    metres: Math.round(Math.hypot(target.x - position.x, target.z - position.z)),
    approximate: true, note: 'Flying · follow the destination beacon',
  };
  return {
    metres: Math.round(route ? remainingRouteDistance(route.pts, route.len, position.x, position.z) : Math.hypot(target.x - position.x, target.z - position.z)),
    approximate: !route || route.complete === false,
    note: blocked ? 'Road ahead blocked · check the map' : !route ? 'Return to a road for GPS · use Back to the road if stuck' : route.complete === false ? 'Route continues as nearby streets load' : '',
  };
}

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

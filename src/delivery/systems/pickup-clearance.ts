import { pointInRing, type CityData, type Surface, type Wall } from '../../world/city';
import { roadQuadHeight } from '../../world/road-surface';
import { nearbyBuildings } from '../../game/physics';
import type { JumpPickupPose, PickupMarker } from './pickup-detector';

interface Point { x: number; y: number; z: number }
const PROBE_RADIUS = .11;

function distanceToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return { distance: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}

function finiteSurfaceHeight(surface: Surface, point: Point): number | null {
  if (surface.kind === 'road' && surface.roadQuad) return roadQuadHeight(surface.roadQuad, point.x, point.z);
  const q = distanceToSegment(point.x, point.z, surface.ax, surface.az, surface.bx, surface.bz);
  if (q.distance > surface.hw + PROBE_RADIUS) return null;
  return surface.ya + (surface.yb - surface.ya) * q.t;
}

/**
 * Checks only the short reach from the actual Roadster to a candidate box.
 * Traffic is deliberately excluded: the carrier itself must not block its roof box.
 * Road/deck slabs use their finite footprint, not supportAt's driving step allowance.
 */
export function pickupPathClear(city: CityData, before: JumpPickupPose, after: JumpPickupPose,
  marker: PickupMarker, contactTime: number): boolean {
  if (!Number.isFinite(contactTime) || contactTime < 0 || contactTime > 1) return false;
  const t = contactTime, lerp = (a: number, b: number) => a + (b - a) * t;
  const hero: Point = { x: lerp(before.x, after.x), y: lerp(before.y, after.y), z: lerp(before.z, after.z) };
  const box: Point = { x: lerp(marker.previousPosition.x, marker.position.x),
    y: lerp(marker.previousPosition.y, marker.position.y), z: lerp(marker.previousPosition.z, marker.position.z) };
  const bottom = lerp(before.bottom, after.bottom), top = lerp(before.top, after.top);
  if (![hero.x, hero.y, hero.z, box.x, box.y, box.z, bottom, top].every(Number.isFinite) || top < bottom) return false;
  const margin = Math.min(.1, (top - bottom) / 2);
  const anchor = { x: hero.x, y: Math.max(bottom + margin, Math.min(top - margin, box.y)), z: hero.z };

  // At most a handful of nearby cells and a few metres are tested, only after
  // swept overlap succeeds. Query each collider once even when grids share it.
  const walls = new Set<Wall>(), surfaces = new Set<Surface>();
  const obstacles = new Set<{ x: number; z: number; r: number; top: number; bottom?: number }>();
  const mx = (hero.x + box.x) / 2, mz = (hero.z + box.z) / 2;
  const sx = Math.floor(mx / 30), sz = Math.floor(mz / 30), ox = Math.floor(mx / 50), oz = Math.floor(mz / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const wall of city.walls.get(`${sx + i},${sz + j}`) || []) if (wall.kind !== 'kerb') walls.add(wall);
    for (const surface of city.surfaceGrid.get(`${sx + i},${sz + j}`) || []) surfaces.add(surface);
    for (const obstacle of city.obstacles.get(`${ox + i},${oz + j}`) || []) obstacles.add(obstacle);
  }
  const buildings = nearbyBuildings(city, mx, mz);
  const solid = (p: Point): boolean => {
    for (const building of buildings) {
      if (p.y - PROBE_RADIUS > building.h || p.y + PROBE_RADIUS < 0) continue;
      if (pointInRing(p.x, p.z, building.ring)) return true;
      for (let i = 0, j = building.ring.length - 1; i < building.ring.length; j = i++) {
        if (distanceToSegment(p.x, p.z, ...building.ring[j], ...building.ring[i]).distance < PROBE_RADIUS) return true;
      }
    }
    for (const obstacle of obstacles) if (p.y + PROBE_RADIUS >= (obstacle.bottom ?? 0) && p.y - PROBE_RADIUS <= obstacle.top &&
      Math.hypot(p.x - obstacle.x, p.z - obstacle.z) < obstacle.r + PROBE_RADIUS) return true;
    for (const wall of walls) {
      const q = distanceToSegment(p.x, p.z, wall.ax, wall.az, wall.bx, wall.bz);
      if (q.distance < PROBE_RADIUS && p.y + PROBE_RADIUS >= wall.y0a + (wall.y0b - wall.y0a) * q.t &&
        p.y - PROBE_RADIUS <= wall.y1a + (wall.y1b - wall.y1a) * q.t) return true;
    }
    for (const surface of surfaces) {
      const y = finiteSurfaceHeight(surface, p); if (y === null) continue;
      const thickness = surface.kind === 'road' ? Math.max(surface.ya, surface.yb) > 1.2 ? .9 : .06 : .3;
      if (p.y - PROBE_RADIUS < y + (surface.paintLift || 0) + .02 && p.y + PROBE_RADIUS > y - thickness) return true;
    }
    return false;
  };
  const segmentClear = (from: Point, to: Point) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (length > 8) return false; // malformed bounds must not create an unbounded world query
    const steps = Math.max(1, Math.ceil(length / .2));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      if (solid({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, z: from.z + (to.z - from.z) * u })) return false;
    }
    return true;
  };
  // The root-to-anchor check prevents a rotating body's low bound from reaching
  // through a deck even if the broad vertical interval straddles that deck.
  return segmentClear(hero, anchor) && segmentClear(anchor, box);
}

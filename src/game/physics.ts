import type { CityData, Surface, Wall } from '../world/city';
import { pointInRing } from '../world/city';
import type { Building } from '../world/types';
import { movingRailSupport, railRoofAt, deliveryRampClimb } from './moving-rail';
import { landmarkHeightAt, landmarkRoofUnder } from '../world/landmark-support';
import { roadQuadHeight } from '../world/road-surface';
import { waterHeightAt, WATER_DRAFT } from '../world/water';

const k30 = (x: number, z: number) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
const k50 = (x: number, z: number) => `${Math.floor(x / 50)},${Math.floor(z / 50)}`;

export type SupportKind = 'ground' | 'road' | 'deck' | 'pad' | 'roof' | 'rail' | 'landmark' | 'water';
export interface Support { y: number; s: Surface | null; onRoad: boolean; kind: SupportKind; elevatedRoad: boolean }

// Reachable surface under (x,z), preserving continuous driving contact: roads, flyovers, the metro deck,
// bus-shelter roofs and building roofs. Surfaces more than 1.6 m above `fromY` are overhead and ignored.
export function supportAt(city: CityData, x: number, z: number, fromY: number, roadsOnly = false, previous?: {x:number;z:number;feet:number;road?: Surface['e']}): Support {
  let continuousHeight = -Infinity;
  const travelled = previous ? Math.hypot(x - previous.x, z - previous.z) : 0;
  let best: Support = { y: 0, s: null, onRoad: false, kind: 'ground', elevatedRoad: false }, found = false, bestScore = Math.abs(fromY);
  const water = roadsOnly ? null : waterHeightAt(city.waterGrid, x, z);
  if (water !== null) best = { y: water - WATER_DRAFT, s: null, onRoad: false, kind: 'water', elevatedRoad: false };
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const cell = city.surfaceGrid.get(`${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`);
    if (!cell) continue;
    for (const s of cell) {
      if (roadsOnly && s.kind !== 'road') continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      const rawT = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
      const t = Math.max(0, Math.min(1, rawT));
      const px = s.ax + dx * t, pz = s.az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      const exact = s.kind === 'road' && s.roadQuad ? roadQuadHeight(s.roadQuad, x, z) : undefined;
      if (exact === null || (exact === undefined && d > s.hw)) continue;
      const y = exact ?? s.ya + (s.yb - s.ya) * t;
      if (y > fromY + 1.6) continue;
      // where surfaces overlap (an up-ramp beside a down-ramp, a deck edge over a slip road) the car stays on the one
      // it is driving on: the surface nearest its own height wins, and the margin strip only counts when nothing else does
      const core = exact !== undefined || s.kind !== 'road' || ((!s.e || d <= s.e.w / 2 + 0.15) && rawT >= -1e-6 && rawT <= 1.000001);
      const oldHeight = previous && s.kind === 'road' && s.roadQuad ? roadQuadHeight(s.roadQuad, previous.x, previous.z) : null;
      // Adjacent roads need not overlap at their seam: the first ramp
      // triangle cannot contain the previous frame's point on the approach.
      // Accept a shared endpoint only locally, with a reachable matching grade.
      let joined = false;
      if (previous?.road && s.e && travelled > 1e-6) {
        const road = s.e, old = previous.road;
        for (let side = 0; side < 2; side++) {
          const end = side === 0 ? 0 : road.pts.length - 1;
          const node = end === 0 ? road.from : road.to;
          if (!node || node !== old.from && node !== old.to) continue;
          const p = road.pts[end], distance = Math.hypot(previous.x - p[0], previous.z - p[1]);
          if (distance <= travelled + 2 && Math.abs((road.elev?.[end] ?? 0) - previous.feet) <= .03 + distance * .14) joined = true;
        }
      }
      const continuous = !!previous && travelled > 1e-6 && s.kind === 'road' &&
        Math.abs(y - previous.feet) <= .03 + travelled * .14 &&
        (oldHeight !== null && Math.abs(oldHeight - previous.feet) < .025 ||
          !!s.e && s.e.id === previous.road?.id || joined);
      // At a ramp mouth a ground road often overlaps its first triangles.
      // Follow the reachable upper pavement instead of repeatedly choosing
      // the lower sheet just because it is closer to last frame's height.
      if (continuous) {
        if (y > continuousHeight) { continuousHeight = y; found = true; bestScore = 0;
          best = { y, s, onRoad: true, kind: 'road', elevatedRoad: y > 1.2 }; }
        continue;
      }
      if (continuousHeight > -Infinity) continue;
      const score = Math.abs(y - fromY) + (core ? 0 : 3);
      if (!found || score < bestScore - 0.01 || (Math.abs(score - bestScore) <= 0.01 && y > best.y)) {
        found = true; bestScore = score; best = { y, s, onRoad: s.kind === 'road', kind: s.kind, elevatedRoad: s.kind === 'road' && y > 1.2 };
      }
    }
  }
  if (!roadsOnly) for (const b of nearbyBuildings(city, x, z)) {
    if (city.landmarkSurfaceGrid && b.cls === 'landmark') continue;
    if (b.h > fromY + 1.6 || b.h < best.y - 0.01) continue;
    if (pointInRing(x, z, b.ring)) best = { y: b.h + 0.02, s: null, onRoad: false, kind: 'roof', elevatedRoad: false };
  }
  if (!roadsOnly) {
    const landmark = landmarkHeightAt(city.landmarkSurfaceGrid, x, z, fromY + 1.6);
    if (landmark !== null && landmark >= best.y - .01) best = { y: landmark, s: null, onRoad: false, kind: 'landmark', elevatedRoad: false };
    const rail = movingRailSupport(city.movingRail || [], x, z, fromY, previous);
    if (rail && (Math.abs(rail.y - fromY) < Math.abs(best.y - fromY) + .01 || deliveryRampClimb(rail.body,x,z,previous)>0 && rail.y>=best.y)) best = { y: rail.y, s: null, onRoad: false, kind: 'rail', elevatedRoad: false };
  }
  return best;
}

// A synchronous guidance build samples many positions in the same grid cell.
// Cache candidate lists only for that build; moving gates and streamed city data
// must be queried afresh on the next build. Never retain this across frames.
export class GuidanceCollisionQueries {
  private buildings = new Map<string, Building[]>();
  private wallLists = new Map<string, { walls: Wall[]; gateCount: number }>();
  constructor(readonly city: CityData) {}
  buildingsAt(x: number, z: number): Building[] {
    const key = k50(x, z);
    let list = this.buildings.get(key);
    if (!list) { list = nearbyBuildings(this.city, x, z); this.buildings.set(key, list); }
    return list;
  }
  wallsAt(x: number, z: number): { walls: Wall[]; gateCount: number } {
    const key = k30(x, z);
    let list = this.wallLists.get(key);
    if (!list) {
      const seen = new Set<Wall>(this.city.railwayWalls || []), walls = [...seen], gateCount = walls.length;
      const cx = Math.floor(x / 30), cz = Math.floor(z / 30);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const wall of this.city.walls.get(`${cx + i},${cz + j}`) || []) {
        if (!seen.has(wall)) { seen.add(wall); walls.push(wall); }
      }
      list = { walls, gateCount }; this.wallLists.set(key, list);
    }
    return list;
  }
}

export function nearbyBuildings(city: CityData, x: number, z: number): Building[] {
  const out = new Set<Building>();
  const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of city.buildingGrid.get(`${cx + i},${cz + j}`) || []) out.add(b);
  return [...out];
}
// tallest roof under any of the given points (used to lift the flight path over high-rises)
export function roofUnder(city: CityData, pts: [number, number][]): number {
  let h = 0;
  for (const [x, z] of pts) {
    for (const b of nearbyBuildings(city, x, z)) if ((!city.landmarkSurfaceGrid || b.cls !== 'landmark') && b.h > h && pointInRing(x, z, b.ring)) h = b.h;
    h = Math.max(h, landmarkRoofUnder(city.landmarkSurfaceGrid, x, z));
    h = Math.max(h, city.metroFlightClearance?.heightAt(x, z) || 0);
    // Road/metro decks and shelter pads are real overhead geometry even when
    // there is no building footprint. Keep this distinct from supportAt's
    // height-reachable tyre contact so manual train/metro landing is unchanged.
    const seen = new Set<Surface>();
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const surface of city.surfaceGrid.get(`${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`) || []) {
      if (seen.has(surface)) continue; seen.add(surface);
      const dx = surface.bx - surface.ax, dz = surface.bz - surface.az, u = Math.max(0, Math.min(1, ((x - surface.ax) * dx + (z - surface.az) * dz) / (dx * dx + dz * dz || 1)));
      const exact = surface.roadQuad ? roadQuadHeight(surface.roadQuad, x, z) : undefined;
      if (exact === null || exact === undefined && Math.hypot(x - surface.ax - dx * u, z - surface.az - dz * u) > surface.hw) continue;
      h = Math.max(h, exact ?? surface.ya + (surface.yb - surface.ya) * u);
    }
    for (const body of city.movingRail || []) h = Math.max(h, railRoofAt(body, x, z) || 0);
  }
  return h;
}

// Push a circle out of building footprints taller than the car's height. Returns penetration depth (0 = no hit).
export function collideBuildings(city: CityData, pos: { x: number; z: number }, r: number, y: number, bodyTop = y + 1.2, queries?: GuidanceCollisionQueries): number {
  let hit = 0;
  for (const b of queries?.city === city ? queries.buildingsAt(pos.x, pos.z) : nearbyBuildings(city, pos.x, pos.z)) {
    // Source building footprints start at local ground, not an infinite
    // basement through a road-under-bridge cut.
    if (bodyTop < 0) continue;
    if (city.landmarkSurfaceGrid && b.cls === 'landmark') {
      const top = landmarkHeightAt(city.landmarkSurfaceGrid, pos.x, pos.z);
      if (top !== null && Math.abs(top - y) < .8) continue;
    }
    if (b.h < y + 0.5) continue;
    const ring = b.ring;
    let inside = false, bestD = 1e9, bx = 0, bz = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j][0], az = ring[j][1], cx = ring[i][0], cz = ring[i][1];
      if ((cz > pos.z) !== (az > pos.z) && pos.x < ((ax - cx) * (pos.z - cz)) / (az - cz) + cx) inside = !inside;
      const dx = cx - ax, dz = cz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(pos.x - px, pos.z - pz);
      if (d < bestD) { bestD = d; bx = px; bz = pz; }
    }
    if (inside) {
      const nx = bx - pos.x, nz = bz - pos.z, L = Math.hypot(nx, nz) || 1;
      pos.x = bx + (nx / L) * r; pos.z = bz + (nz / L) * r; hit = Math.max(hit, bestD + r);
    } else if (bestD < r) {
      const nx = pos.x - bx, nz = pos.z - bz, L = Math.hypot(nx, nz) || 1;
      pos.x = bx + (nx / L) * r; pos.z = bz + (nz / L) * r; hit = Math.max(hit, r - bestD);
    }
  }
  const cx = Math.floor(pos.x / 50), cz = Math.floor(pos.z / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of city.obstacles.get(`${cx + i},${cz + j}`) || []) {
    if (y > o.top || bodyTop < (o.bottom ?? 0)) continue;
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + r * 0.85;
    if (d < m) { const L = d || 1; pos.x = o.x + (dx / L) * m; pos.z = o.z + (dz / L) * m; hit = Math.max(hit, m - d); }
  }
  return hit;
}

// Dividers, kerbs and bridge parapets. `bottom`/`top` is the car body's vertical extent.
// Solid walls stop the car (no tunnelling: a step that crosses the line is pulled back); kerbs only report a bump.
export function collideWalls(city: CityData, prev: { x: number; z: number }, pos: { x: number; z: number }, r: number, bottom: number, top: number,
  gateFootprint?: { hx: number; hz: number; halfLength: number; halfWidth: number }, queries?: GuidanceCollisionQueries): { hit: number; kerb: boolean; nx: number; nz: number } {
  const res = { hit: 0, kerb: false, nx: 0, nz: 0 };
  const cached = queries?.city === city ? queries.wallsAt(pos.x, pos.z) : undefined;
  const seen = cached ? null : new Set<Wall>();
  const cx = Math.floor(pos.x / 30), cz = Math.floor(pos.z / 30);
  const nearby: Wall[] = cached?.walls ?? [...(city.railwayWalls || [])];
  const gateCount = cached?.gateCount ?? nearby.length;
  if (!cached) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) nearby.push(...(city.walls.get(`${cx + i},${cz + j}`) || []));
  for (let i = 0; i < nearby.length; i++) {
    const w = nearby[i];
    if (seen?.has(w)) continue; seen?.add(w);
    const dx = w.bx - w.ax, dz = w.bz - w.az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((pos.x - w.ax) * dx + (pos.z - w.az) * dz) / L2));
    const y0 = w.y0a + (w.y0b - w.y0a) * t, y1 = w.y1a + (w.y1b - w.y1a) * t;
    if (top < y0 || bottom > y1) continue;
    const px = w.ax + dx * t, pz = w.az + dz * t;
    // which side of the line were we on, and did this step cross it?
    const nX = -dz / L, nZ = dx / L;
    // Stop the whole nose before a gate. A centre-circle contact would leave
    // bodywork inside its protected space and falsely reopen the arm as occupied.
    // A small beam clearance also absorbs the contact response's slight yaw.
    // Other walls retain the original arcade collision radius.
    const radius = gateFootprint && i < gateCount ? Math.abs(nX * gateFootprint.hx + nZ * gateFootprint.hz) * gateFootprint.halfLength +
      Math.abs(nX * gateFootprint.hz - nZ * gateFootprint.hx) * gateFootprint.halfWidth + .05 : r;
    const sPrev = (prev.x - w.ax) * nX + (prev.z - w.az) * nZ, sNow = (pos.x - w.ax) * nX + (pos.z - w.az) * nZ;
    const along = ((pos.x - w.ax) * dx + (pos.z - w.az) * dz) / L2;
    const crossingT = sPrev / (sPrev - sNow || 1);
    const crossX = prev.x + (pos.x - prev.x) * crossingT, crossZ = prev.z + (pos.z - prev.z) * crossingT;
    const crossAlong = ((crossX - w.ax) * dx + (crossZ - w.az) * dz) / L2;
    const crossed = sPrev * sNow < 0 && crossAlong >= 0 && crossAlong <= 1;
    if (w.kind === 'kerb') { if (crossed) res.kerb = true; continue; }
    // A finite divider ends where its mesh ends. Percentage-based extensions
    // made long parapets block open merges many metres beyond the visible tip.
    // Rounded end contact uses distance to the actual endpoint, not its line.
    if (!crossed && (along < 0 || along > 1)) {
      const ex = along < 0 ? w.ax : w.bx, ez = along < 0 ? w.az : w.bz;
      const endDistance = Math.hypot(pos.x - ex, pos.z - ez);
      if (endDistance >= radius || endDistance < 1e-8) continue;
      const nx = (pos.x - ex) / endDistance, nz = (pos.z - ez) / endDistance;
      pos.x = ex + nx * radius; pos.z = ez + nz * radius;
      res.hit = Math.max(res.hit, radius - endDistance); res.nx = nx; res.nz = nz;
      continue;
    }
    const d = Math.abs(sNow);
    if (!crossed && d >= radius) continue;
    const side = Math.sign(sPrev) || Math.sign(sNow) || 1;
    // put the car back on the side it came from, r away from the line
    pos.x = px + nX * side * radius; pos.z = pz + nZ * side * radius;
    res.hit = Math.max(res.hit, crossed ? radius + d : radius - d); res.nx = nX * side; res.nz = nZ * side;
  }
  return res;
}
export { k30, k50 };

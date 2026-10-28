import type { CityData, Surface, Wall } from '../world/city';
import { pointInRing } from '../world/city';
import type { Building } from '../world/types';
import { movingRailSupport, railRoofAt } from './moving-rail';
import { landmarkHeightAt, landmarkRoofUnder } from '../world/landmark-support';
import { roadQuadHeight } from '../world/road-surface';
import { buildingBounds, segmentBounds, outsideBounds, staticQueryStats } from './static-neighborhood';

const k30 = (x: number, z: number) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
const k50 = (x: number, z: number) => `${Math.floor(x / 50)},${Math.floor(z / 50)}`;

export type SupportKind = 'ground' | 'road' | 'deck' | 'pad' | 'roof' | 'rail' | 'landmark';
export interface Support { y: number; s: Surface | null; onRoad: boolean; kind: SupportKind; elevatedRoad: boolean }
const roadNeighborhoods = new WeakMap<CityData, { revision: number; cells: Map<string, Surface[]> }>();
function cachedRoadNeighborhood(city: CityData, x: number, z: number): Surface[] | undefined {
  const revision = (city as CityData & { revision?: number }).revision;
  if (revision === undefined) return undefined;
  let cache = roadNeighborhoods.get(city);
  if (!cache || cache.revision !== revision) { cache = { revision, cells: new Map() }; roadNeighborhoods.set(city, cache); }
  const key = k30(x,z), existing=cache.cells.get(key); if(existing)return existing;
  const roads: Surface[] = [], seen = new Set<Surface>();
  const cx=Math.floor(x/30), cz=Math.floor(z/30);
  // Preserve first-occurrence grid order, including coincident road-level ties.
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of city.surfaceGrid.get(`${cx+i},${cz+j}`)||[])if(s.kind==='road'&&!seen.has(s)){seen.add(s);roads.push(s);}
  if(cache.cells.size>=2048)cache.cells.delete(cache.cells.keys().next().value!);
  cache.cells.set(key,roads);return roads;
}

// Highest surface under (x,z) that the car can reach from height `fromY`: roads and flyovers, the metro deck,
// bus-shelter roofs and building roofs. Surfaces more than 1.6 m above `fromY` are overhead and ignored.
export function supportAt(city: CityData, x: number, z: number, fromY: number, roadsOnly = false): Support {
  let best: Support = { y: 0, s: null, onRoad: false, kind: 'ground', elevatedRoad: false }, found = false, bestScore = Math.abs(fromY);
  const cached = roadsOnly ? cachedRoadNeighborhood(city,x,z) : undefined;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const cell = cached ? i===-1&&j===-1 ? cached : undefined : city.surfaceGrid.get(`${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`);
    if (!cell) continue;
    for (const s of cell) {
      if (roadsOnly && s.kind !== 'road') continue;
      const shape = segmentBounds(s);
      if (outsideBounds(shape, x, z) || shape.minY > fromY + 1.6) { staticQueryStats.boundsRejects++; continue; }
      const dx = shape.dx, dz = shape.dz, L2 = shape.length2;
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
      const score = Math.abs(y - fromY) + (core ? 0 : 3);
      if (!found || score < bestScore - 0.01 || (Math.abs(score - bestScore) <= 0.01 && y > best.y)) {
        found = true; bestScore = score; best = { y, s, onRoad: s.kind === 'road', kind: s.kind, elevatedRoad: s.kind === 'road' && y > 1.2 };
      }
    }
  }
  if (!roadsOnly) for (const b of nearbyBuildings(city, x, z, supportBuildings)) {
    if (city.landmarkSurfaceGrid && b.cls === 'landmark') continue;
    if (b.h > fromY + 1.6 || b.h < best.y - 0.01) continue;
    if (!outsideBounds(buildingBounds(b), x, z) && pointInRing(x, z, b.ring)) best = { y: b.h + 0.02, s: null, onRoad: false, kind: 'roof', elevatedRoad: false };
  }
  if (!roadsOnly) {
    const landmark = landmarkHeightAt(city.landmarkSurfaceGrid, x, z, fromY + 1.6);
    if (landmark !== null && landmark >= best.y - .01) best = { y: landmark, s: null, onRoad: false, kind: 'landmark', elevatedRoad: false };
    const rail = movingRailSupport(city.movingRail || [], x, z, fromY);
    if (rail && (Math.abs(rail.y - fromY) < Math.abs(best.y - fromY) + .01)) best = { y: rail.y, s: null, onRoad: false, kind: 'rail', elevatedRoad: false };
  }
  return best;
}

const buildingStamps = new WeakMap<Building, number>();
let buildingQueryStamp = 0;
const supportBuildings: Building[] = [], roofBuildings: Building[] = [], collisionBuildings: Building[] = [];
export function nearbyBuildings(city: CityData, x: number, z: number, out: Building[] = []): Building[] {
  out.length = 0; const stamp = ++buildingQueryStamp;
  const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of city.buildingGrid.get(`${cx + i},${cz + j}`) || []) if (buildingStamps.get(b) !== stamp) { buildingStamps.set(b, stamp); out.push(b); }
  return out;
}
// tallest roof under any of the given points (used to lift the flight path over high-rises)
export function roofUnder(city: CityData, pts: [number, number][]): number {
  let h = 0;
  for (const [x, z] of pts) {
    for (const b of nearbyBuildings(city, x, z, roofBuildings)) if ((!city.landmarkSurfaceGrid || b.cls !== 'landmark') && b.h > h && !outsideBounds(buildingBounds(b), x, z) && pointInRing(x, z, b.ring)) h = b.h;
    h = Math.max(h, landmarkRoofUnder(city.landmarkSurfaceGrid, x, z));
    for (const body of city.movingRail || []) h = Math.max(h, railRoofAt(body, x, z) || 0);
  }
  return h;
}

// Push a circle out of building footprints taller than the car's height. Returns penetration depth (0 = no hit).
export function collideBuildings(city: CityData, pos: { x: number; z: number }, r: number, y: number): number {
  let hit = 0;
  for (const b of nearbyBuildings(city, pos.x, pos.z, collisionBuildings)) {
    if (city.landmarkSurfaceGrid && b.cls === 'landmark') {
      const top = landmarkHeightAt(city.landmarkSurfaceGrid, pos.x, pos.z);
      if (top !== null && Math.abs(top - y) < .8) continue;
    }
    if (b.h < y + 0.5 || outsideBounds(buildingBounds(b), pos.x, pos.z, r)) continue;
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
    if (y > o.top) continue;
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + r * 0.85;
    if (d < m) { const L = d || 1; pos.x = o.x + (dx / L) * m; pos.z = o.z + (dz / L) * m; hit = Math.max(hit, m - d); }
  }
  return hit;
}

// Dividers, kerbs and bridge parapets. `bottom`/`top` is the car body's vertical extent.
// Solid walls stop the car (no tunnelling: a step that crosses the line is pulled back); kerbs only report a bump.
export function collideWalls(city: CityData, prev: { x: number; z: number }, pos: { x: number; z: number }, r: number, bottom: number, top: number): { hit: number; kerb: boolean; nx: number; nz: number } {
  const res = { hit: 0, kerb: false, nx: 0, nz: 0 };
  const seen = new Set<Wall>();
  const cx = Math.floor(pos.x / 30), cz = Math.floor(pos.z / 30);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const w of city.walls.get(`${cx + i},${cz + j}`) || []) {
    if (seen.has(w)) continue; seen.add(w);
    const dx = w.bx - w.ax, dz = w.bz - w.az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((pos.x - w.ax) * dx + (pos.z - w.az) * dz) / L2));
    const y0 = w.y0a + (w.y0b - w.y0a) * t, y1 = w.y1a + (w.y1b - w.y1a) * t;
    if (top < y0 || bottom > y1) continue;
    const px = w.ax + dx * t, pz = w.az + dz * t;
    // which side of the line were we on, and did this step cross it?
    const nX = -dz / L, nZ = dx / L;
    const sPrev = (prev.x - w.ax) * nX + (prev.z - w.az) * nZ, sNow = (pos.x - w.ax) * nX + (pos.z - w.az) * nZ;
    const along = ((pos.x - w.ax) * dx + (pos.z - w.az) * dz) / L2;
    const crossed = sPrev * sNow < 0 && along > -0.02 && along < 1.02;
    if (w.kind === 'kerb') { if (crossed) res.kerb = true; continue; }
    const d = Math.abs(sNow);
    if (!crossed && (d >= r || along < -0.05 || along > 1.05)) continue;
    const side = Math.sign(sPrev) || Math.sign(sNow) || 1;
    // put the car back on the side it came from, r away from the line
    pos.x = px + nX * side * r; pos.z = pz + nZ * side * r;
    res.hit = Math.max(res.hit, crossed ? r + d : r - d); res.nx = nX * side; res.nz = nZ * side;
  }
  return res;
}
export { k30, k50 };

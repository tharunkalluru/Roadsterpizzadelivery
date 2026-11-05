import { collegeCampusId, COLLEGE_CAMPUSES } from '../world/college-campus-data';
import type { CityData } from '../world/city';
import type { Building, XZ } from '../world/types';
import type { GEdge, RoadGraph } from '../game/roadgraph';
import { roofUnder, supportAt, collideBuildings } from '../game/physics';
import { waterHeightAt } from '../world/water';
import type { LevelConfig } from './core/types';
import type { DeliveryPoint, ModuleParams } from './modules/types';

interface Rect { x0: number; x1: number; z0: number; z1: number; height: number }
interface Profile { props: Rect[]; drive: Rect[]; accessZ: number; street?: boolean; search: number; params?: ModuleParams }
interface Segment { ax: number; az: number; bx: number; bz: number; ya: number; yb: number; halfWidth: number; edge: GEdge }
interface Bounds { x0: number; x1: number; z0: number; z1: number }
export interface GroundScenePlacement { destination: DeliveryPoint; moduleParams: ModuleParams; attempts: number; reusedBuilding?: string }
export interface ScenePlacementOptions { isLoaded?: (x: number, z: number) => boolean; maxCandidates?: number; revision?: string }
const GROUNDED = new Set(['ropeBucket', 'gateDelivery', 'walkingHandoff', 'weddingHandoff', 'angleParking', 'classroomHandoff']);
export const needsGroundScenePlacement = (module: string) => GROUNDED.has(module);
const rect = (x0: number, x1: number, z0: number, z1: number, height = 3): Rect => ({ x0, x1, z0, z1, height });
const overlap = (a: Bounds, b: Bounds) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
const inside = (p: XZ, b: Bounds) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.z0 && p[1] <= b.z1;
const expand = (b: Bounds, amount: number): Bounds => ({ x0: b.x0 - amount, x1: b.x1 + amount, z0: b.z0 - amount, z1: b.z1 + amount });
const translated = (r: Rect, x: number, z: number): Rect => ({ ...r, x0: r.x0 + x, x1: r.x1 + x, z0: r.z0 + z, z1: r.z1 + z });
const ringBounds = (ring: readonly XZ[]): Bounds => {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [x, z] of ring) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z); }
  return b;
};
function pointIn(x: number, z: number, ring: readonly XZ[]) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
/** Liang-Barsky segment/rectangle clipping also catches a thin crossing whose
 * endpoints both lie outside the footprint. Sampling corners alone misses it. */
function crosses(ax: number, az: number, bx: number, bz: number, r: Bounds) {
  let low = 0, high = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dz, az - r.z0], [dz, r.z1 - az]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
    else { const t = q / p; if (p < 0) low = Math.max(low, t); else high = Math.min(high, t); if (low > high) return false; }
  }
  return true;
}
function polygonIntersects(r: Bounds, building: Building, bounds: Bounds) {
  if (!overlap(r, bounds)) return false;
  if (building.ring.some(p => inside(p, r))) return true;
  if ([[r.x0, r.z0], [r.x0, r.z1], [r.x1, r.z0], [r.x1, r.z1]].some(([x, z]) => pointIn(x, z, building.ring))) return true;
  return building.ring.some((a, i) => { const b = building.ring[(i + 1) % building.ring.length]; return crosses(a[0], a[1], b[0], b[1], r); });
}
const project = (x: number, z: number, s: Segment) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
  const px = s.ax + dx * t, pz = s.az + dz * t;
  return { x: px, z: pz, y: s.ya + (s.yb - s.ya) * t, d: Math.hypot(x - px, z - pz), t };
};

function profileFor(level: LevelConfig): Profile {
  const theme = level.moduleParams.theme;
  if (level.module === 'classroomHandoff' || level.module === 'gateDelivery' && ['college', 'villa'].includes(String(theme))) return {
    // A bounded architectural entrance, not an isolated sign post. The
    // fragment sits behind the clear car/receiver approach and is validated
    // against the actual city just like every other physical scene prop.
    props: [rect(-10.3, 5.3, -10.4, -3.5, level.module === 'classroomHandoff' ? 5.1 : 7.5),
      rect(-7.3, 1.3, -2.7, -1.3, theme === 'college' ? 6.2 : 4.4)],
    drive: [rect(-2.4, 2.4, 0, 6), rect(-4.2, -2, -4.3, -2.3)], accessZ: 3, search: 180,
    params: { useExistingFacade: true, ...(theme === 'college' ? { sign: /nizam/i.test(level.destination.label) ? 'NIZAM COLLEGE' : 'COLLEGE' } : {}) },
  };
  if (level.module === 'walkingHandoff') return { props: [], drive: [rect(-4.5, 2.5, -72, 8)], accessZ: 3, street: true, search: 250 };
  if (level.module === 'weddingHandoff') return { props: [-23, 2].flatMap(z => [rect(-11.3, -10.7, z - .4, z + .4, 9), rect(10.7, 11.3, z - .4, z + .4, 9)]).concat([rect(-14, -10, -5.2, 1.2, 3)]),
    drive: [rect(-7.5, 7.5, -24, 12)], accessZ: 3, street: true, search: 230 };
  if (level.module === 'angleParking') return { props: [rect(-17.5, 17.5, -29, -15, 10.5), rect(-14, -10, -14, -10, 4.2), rect(10, 14, -14, -10, 4.2), rect(-4.5, 4.5, -4.5, 4.5)], drive: [rect(-4.2, 4.2, -6, 12)], accessZ: 12, search: 220 };
  if (level.module === 'classroomHandoff') return { props: [rect(-23, -9, -28, -8.5, 10.5), rect(8, 22, -28, -8.5, 10.5), rect(-23, 23, -26, -7.2, 10.5)], drive: [rect(-4, 4, -6, 15)], accessZ: 13, search: 180 };
  if (level.module === 'gateDelivery' && theme === 'salaar') return { props: [rect(-28.5, -21.5, -51, 4.5, 33), rect(21.5, 28.5, -51, 4.5, 33), rect(-28, 28, -52, -46, 33), rect(-28, 28, -8.5, -1.5, 33), rect(-20, -14, -37, -29, 11), rect(14, 20, -43, -33, 9)].map(r => ({ ...r, x0: r.x0 * .55, x1: r.x1 * .55, z0: r.z0 * .55, z1: r.z1 * .55 })), drive: [rect(-4, 4, -14, 15)], accessZ: 13, search: 230, params: { sceneScale: .55 } };
  if (level.module === 'gateDelivery' && theme === 'college') return { props: [rect(-23, 23, -39.5, -24.5, 15), rect(-10.4, -7.6, -7.5, -4.5, 8.2), rect(7.6, 10.4, -7.5, -4.5, 8.2), rect(-35, -10, -6.7, -5.3, 5), rect(10, 35, -6.7, -5.3, 5)], drive: [rect(-4, 4, -3, 15)], accessZ: 13, search: 180 };
  if (level.module === 'gateDelivery' && theme === 'villa') return { props: [rect(-18, 14, -32, -14.4, 12), rect(-9.7, -7.3, -7.2, -4.8, 5), rect(7.3, 9.7, -7.2, -4.8, 5), rect(-29, -9, -6.7, -5.3, 4.5), rect(9, 29, -6.7, -5.3, 4.5), rect(-14, -10, -14, -10, 4), rect(10, 14, -14, -10, 4)], drive: [rect(-4, 4, -3, 15)], accessZ: 13, search: 220 };
  return { props: [rect(-17, 17, -35, -16.5, 26), rect(-10, 10, -6.5, -3.5, 8), rect(-26, -10, -5.7, -4.3, 4.5), rect(10, 26, -5.7, -4.3, 4.5), rect(-26, -14, -17, -11, 11), rect(14, 26, -17, -11, 11)].map(r => ({ ...r, x0: r.x0 * .55, x1: r.x1 * .55, z0: r.z0 * .55, z1: r.z1 * .55 })), drive: [rect(-4, 4, -1, 15)], accessZ: 13, search: 230, params: { sceneScale: .55 } };
}

/** One local, bounded preparation search. It never edits city geometry, roads,
 * collision grids or content coordinates, and never promotes a scene to a roof.
 * null means retry after streaming; it is not permission to invent a platform. */
type PlacementCity = CityData & { rails?: ReadonlyMap<string, { pts: XZ[]; elev?: number[] }> };
export function* groundScenePlacementSearch(city: PlacementCity, graph: RoadGraph, level: LevelConfig, options: ScenePlacementOptions = {}): Generator<void, GroundScenePlacement | null, void> {
  if (!needsGroundScenePlacement(level.module) || !Number.isFinite(level.destination.x) || !Number.isFinite(level.destination.z)) return null;
  const campusId=collegeCampusId(String(level.moduleParams.realCampusId||''));
  if(campusId){
    // Named campuses have one researched entrance, never a nearby vacant lot.
    // Wait for its real geometry rather than relocating the scene silently.
    const campus=COLLEGE_CAMPUSES[campusId],p=campus.delivery,loaded=options.isLoaded??(()=>true);
    for(const dx of [-1.4,0,1.4])for(const dz of [-2.6,0,2.6]){
      yield;
      const at={x:p.x+dx,z:p.z+dz};
      if(!loaded(at.x,at.z)||Math.abs(supportAt(city,at.x,at.z,.12).y)>.3||collideBuildings(city,{...at},.25,.15,2.7)>0)return null;
    }
    return {destination:{...level.destination,x:p.x,z:p.z,y:0},moduleParams:{realCampusId:campusId,sceneYaw:campus.sceneYaw,useExistingFacade:true},attempts:1};
  }
  const origin = level.destination, profile = profileFor(level), budget = Math.max(1, Math.min(768, Math.floor(options.maxCandidates ?? 384)));
  const reach = profile.search + 90, area = { x0: origin.x - reach, x1: origin.x + reach, z0: origin.z - reach, z1: origin.z + reach };
  const buildings = new Map<Building, Bounds>();
  for (let x = Math.floor(area.x0 / 50); x <= Math.floor(area.x1 / 50); x++) {
    for (let z = Math.floor(area.z0 / 50); z <= Math.floor(area.z1 / 50); z++)
      for (const b of city.buildingGrid.get(`${x},${z}`) ?? []) if (!buildings.has(b) && b.h > .3 && b.ring?.length >= 3) buildings.set(b, ringBounds(b.ring));
    yield;
  }
  const segments: Segment[] = [];
  for (const edge of graph.nearestEdges(origin.x, origin.z, 6)) { for (let i = 1; i < edge.e.pts.length; i++) {
    const a = edge.e.pts[i - 1], b = edge.e.pts[i], halfWidth = Math.max(2.5, edge.e.w / 2);
    if (!overlap(expand({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }, halfWidth), area)) continue;
    segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ya: edge.e.elev?.[i - 1] ?? 0, yb: edge.e.elev?.[i] ?? 0, halfWidth, edge });
  } yield; }
  const streets = segments.filter(s => !s.edge.e.workZone && !['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(s.edge.e.cls) && Math.max(Math.abs(s.ya), Math.abs(s.yb)) < .35 && s.halfWidth >= 2.5);
  if (!streets.length) return null;
  const staticCity = { ...city, movingRail: [] }, loaded = options.isLoaded ?? (() => true);
  const walls = new Set<CityData['railwayWalls'][number]>(), obstacles = new Set<{ x: number; z: number; r: number; top: number; bottom?: number }>();
  for (let x = Math.floor(area.x0 / 30); x <= Math.floor(area.x1 / 30); x++) { for (let z = Math.floor(area.z0 / 30); z <= Math.floor(area.z1 / 30); z++)
    for (const wall of city.walls?.get(`${x},${z}`) ?? []) walls.add(wall); yield; }
  for (const wall of city.railwayWalls ?? []) if (overlap(area, { x0: Math.min(wall.ax, wall.bx), x1: Math.max(wall.ax, wall.bx), z0: Math.min(wall.az, wall.bz), z1: Math.max(wall.az, wall.bz) })) walls.add(wall);
  for (let x = Math.floor(area.x0 / 50); x <= Math.floor(area.x1 / 50); x++) { for (let z = Math.floor(area.z0 / 50); z <= Math.floor(area.z1 / 50); z++)
    for (const obstacle of city.obstacles?.get(`${x},${z}`) ?? []) obstacles.add(obstacle); yield; }
  const railSegments: { a: XZ; b: XZ; low: number }[] = [];
  for (const rail of city.rails?.values() ?? []) { for (let i = 1; i < rail.pts.length; i++) {
    const a = rail.pts[i - 1], b = rail.pts[i];
    if (overlap(expand(area, 8), { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }))
      railSegments.push({ a, b, low: Math.min(rail.elev?.[i - 1] ?? 0, rail.elev?.[i] ?? 0) });
  } yield; }
  function* clear(r: Rect, allowRoad: boolean): Generator<void, boolean, void> {
    const padded = expand(r, .65), railBounds = expand(r, 6), wallBounds = expand(r, .3), roadBounds = { ...r };
    if (!loaded(r.x0, r.z0) || !loaded(r.x0, r.z1) || !loaded(r.x1, r.z0) || !loaded(r.x1, r.z1)) return false;
    let count = 0;
    for (const [b, bounds] of buildings) { if (polygonIntersects(padded, b, bounds)) return false; if (++count % 32 === 0) yield; }
    for (const rail of railSegments) { if (rail.low < r.height + 2 && crosses(rail.a[0], rail.a[1], rail.b[0], rail.b[1], railBounds)) return false; if (++count % 32 === 0) yield; }
    if (!allowRoad) for (const road of segments) {
      const margin = road.halfWidth + .7; roadBounds.x0 = r.x0 - margin; roadBounds.x1 = r.x1 + margin; roadBounds.z0 = r.z0 - margin; roadBounds.z1 = r.z1 + margin;
      if (Math.min(road.ya, road.yb) < r.height + 1 && Math.max(road.ya, road.yb) > -.35 && crosses(road.ax, road.az, road.bx, road.bz, roadBounds)) return false; if (++count % 16 === 0) yield;
    }
    for (const wall of walls) { if (wall.kind !== 'kerb' && Math.max(wall.y1a, wall.y1b) > .3 && Math.min(wall.y0a, wall.y0b) < 3 && crosses(wall.ax, wall.az, wall.bx, wall.bz, wallBounds)) return false; if (++count % 32 === 0) yield; }
    for (const obstacle of obstacles) { if (obstacle.top > .3 && (obstacle.bottom ?? 0) < r.height && Math.hypot(Math.max(r.x0 - obstacle.x, 0, obstacle.x - r.x1), Math.max(r.z0 - obstacle.z, 0, obstacle.z - r.z1)) < obstacle.r + .5) return false; if (++count % 32 === 0) yield; }
    for (let x = r.x0; x <= r.x1 + .001; x += Math.max(1, (r.x1 - r.x0) / Math.ceil((r.x1 - r.x0) / 6)))
      for (let z = r.z0; z <= r.z1 + .001; z += Math.max(1, (r.z1 - r.z0) / Math.ceil((r.z1 - r.z0) / 6))) {
        if (waterHeightAt(city.waterGrid, x, z) !== null || roofUnder(staticCity, [[x, z]]) > .35) return false;
        const ground = supportAt(staticCity, x, z, .12);
        if (!Number.isFinite(ground.y) || ground.y < -.35 || ground.y > .35 || ['roof', 'rail', 'water', 'landmark'].includes(ground.kind)) return false;
        for (const s of city.surfaceGrid.get(`${Math.floor(x / 30)},${Math.floor(z / 30)}`) ?? []) {
          const dx = s.bx - s.ax, dz = s.bz - s.az, t = ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1);
          const y = s.ya + (s.yb - s.ya) * t;
          if (t >= 0 && t <= 1 && y > .35 && y < r.height + 1.1 && Math.hypot(x - s.ax - t * dx, z - s.az - t * dz) <= s.hw) return false;
        }
        yield;
      }
    return true;
  }
  function* access(x: number, z: number, frontZ: number): Generator<void, boolean, void> {
    const at = { x, z: z + frontZ }; let best: ReturnType<typeof project> | null = null, count = 0;
    for (const street of streets) {
      if (++count % 16 === 0) yield;
      const projected = project(at.x, at.z, street); if (projected.d > 34 || projected.y > .35) continue;
      // End at the near carriageway edge, never draw an invented driveway
      // through a median to the opposite side of a real arterial.
      const offset = Math.max(0, street.halfWidth - 1.8), d = projected.d || 1;
      const point = { ...projected, x: projected.x + (at.x - projected.x) / d * offset, z: projected.z + (at.z - projected.z) / d * offset };
      if (!best || projected.d < best.d) best = point;
    }
    if (!best) return false;
    const length = Math.hypot(best.x - at.x, best.z - at.z), n = Math.max(1, Math.ceil(length / 3));
    for (let i = 0; i <= n; i++) {
      const px = at.x + (best.x - at.x) * i / n, pz = at.z + (best.z - at.z) * i / n;
      if (!(yield* clear(rect(px - 1.7, px + 1.7, pz - 1.7, pz + 1.7), true))) return false;
    }
    return true;
  }
  let attempts = 0;
  if (level.module === 'ropeBucket') {
    // Bind only at the known restaurant anchor, using its mapped frontage.
    // Keep the world's real building; install only a winch and lowered basket.
    const candidates: { b: Building; x: number; z: number; ax: number; az: number; nx: number; nz: number; score: number }[] = [];
    for (const [b, bounds] of buildings) {
      if (b.h < 6 || b.h > 45 || Math.hypot(Math.max(bounds.x0 - origin.x, 0, origin.x - bounds.x1), Math.max(bounds.z0 - origin.z, 0, origin.z - bounds.z1)) > 40) continue;
      for (let i = 0; i < b.ring.length; i++) {
        const a = b.ring[i], end = b.ring[(i + 1) % b.ring.length], dx = end[0] - a[0], dz = end[1] - a[1], length = Math.hypot(dx, dz); if (length < 6) continue;
        const t = Math.max(.15, Math.min(.85, ((origin.x - a[0]) * dx + (origin.z - a[1]) * dz) / (length * length)));
        const bx = a[0] + dx * t, bz = a[1] + dz * t;
        for (const side of [-1, 1]) {
          const nx = -dz / length * side, nz = dx / length * side;
          if (pointIn(bx + nx, bz + nz, b.ring)) continue;
          const x = bx + nx * 4.2, z = bz + nz * 4.2;
          candidates.push({ b, x, z, ax: bx - nx, az: bz - nz, nx, nz, score: Math.hypot(x - origin.x, z - origin.z) });
        }
      }
      yield;
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const candidate of candidates.slice(0, Math.min(32, budget))) {
      attempts++;
      yield;
      if (!(yield* clear(rect(candidate.x - 2.6, candidate.x + 2.6, candidate.z - 2.1, candidate.z + 2.1, 3.8), false)) || !(yield* access(candidate.x, candidate.z, 0))) continue;
      // Keep the complete receiver footprint safely inside the real roof,
      // including concave notches. A centre-only/corner-only test can leave a
      // foot over an edge; distance to every boundary protects the whole disc.
      const roofContains = (x: number, z: number, radius: number) => pointIn(x, z, candidate.b.ring) && candidate.b.ring.every((a, i) => {
        const b = candidate.b.ring[(i + 1) % candidate.b.ring.length], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) >= radius;
      });
      const tx = -candidate.nz, tz = candidate.nx;
      let receiver: { x: number; z: number; side: number } | undefined;
      for (const inset of [1.3, 2.2, 3.2]) {
        for (const lateral of [1.8, -1.8, 2.6, -2.6]) {
          const x = candidate.ax - candidate.nx * inset + tx * lateral, z = candidate.az - candidate.nz * inset + tz * lateral;
          const side = Math.sign(lateral);
          const lx = x + candidate.nx * 1.6 - tx * side * .4, lz = z + candidate.nz * 1.6 - tz * side * .4;
          if (roofContains(x, z, .85) && roofContains(lx, lz, .15)) { receiver = { x, z, side }; break; }
        }
        if (receiver) break;
      }
      if (!receiver) continue;
      const floor = supportAt(staticCity, candidate.x, candidate.z, .12).y, groundY = Math.max(0, floor) + .02;
      return { destination: { ...origin, x: candidate.x, z: candidate.z, y: groundY }, attempts, reusedBuilding: candidate.b.id,
        moduleParams: { useExistingFacade: true, roofHeight: candidate.b.h - groundY, winchAnchorX: candidate.ax - candidate.x, winchAnchorZ: candidate.az - candidate.z,
          rooftopActorX: receiver.x - candidate.x, rooftopActorZ: receiver.z - candidate.z, rooftopCameraSide: receiver.side,
          facadeNormalX: candidate.nx, facadeNormalZ: candidate.nz } };
    }
    return null;
  }
  const candidates: { x: number; z: number; score: number; params?: ModuleParams }[] = profile.street ? [] : [{ x: origin.x, z: origin.z, score: 0 }];
  for (const street of streets) {
    if (profile.street && !['residential', 'living_street', 'service', 'unclassified', 'tertiary'].includes(street.edge.e.cls)) continue;
    const p = project(origin.x, origin.z, street), dx = street.bx - street.ax, dz = street.bz - street.az, length = Math.hypot(dx, dz) || 1;
    if (profile.street && (length < 38 || street.halfWidth < 2.5)) continue;
    for (const shift of [0, -24, 24, -48, 48]) {
      const walkLength = Math.min(70, length - 18), minimum = profile.street ? (level.module === 'walkingHandoff' ? walkLength + 8 : 25) / length : 0;
      const maximum = profile.street ? (length - (level.module === 'walkingHandoff' ? 8 : 12)) / length : 1;
      const t = Math.max(minimum, Math.min(maximum, p.t + shift / length));
      for (const offset of profile.street ? [0] : [0, street.halfWidth - 1.6, -street.halfWidth + 1.6, street.halfWidth + 3, -street.halfWidth - 3]) {
        const x = street.ax + dx * t - dz / length * offset, z = street.az + dz * t - (profile.street ? 0 : profile.accessZ) + dx / length * offset;
        candidates.push({ x, z, score: Math.hypot(x - origin.x, z - origin.z), params: profile.street ? { streetYaw: Math.atan2(dx, dz), walkLength, walkSide: -Math.min(3.5, street.halfWidth - .6) } : undefined });
      }
    }
    yield;
  }
  if (!profile.street) for (const radius of [16, 32, 56, 88, 124, 164, 208]) for (let i = 0; i < 16; i++) {
    const x = origin.x + Math.cos(i * Math.PI / 8) * radius, z = origin.z + Math.sin(i * Math.PI / 8) * radius;
    candidates.push({ x, z, score: radius });
  }
  candidates.sort((a, b) => a.score - b.score); const seen = new Set<string>();
  for (const candidate of candidates) {
    if (attempts >= budget) break;
    if (candidate.score > profile.search) continue;
    const key = `${Math.round(candidate.x / 5)},${Math.round(candidate.z / 5)},${Math.round(Number(candidate.params?.streetYaw ?? 0) * 10)}`; if (seen.has(key)) continue; seen.add(key); attempts++;
    const { x, z } = candidate;
    yield;
    if (profile.street) {
      const yaw = Number(candidate.params?.streetYaw) || 0, local = (lx: number, lz: number) => ({ x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
      let propsClear = true;
      for (const r of profile.props) {
        const points = [[r.x0, r.z0], [r.x0, r.z1], [r.x1, r.z0], [r.x1, r.z1]].map(([x, z]) => local(x, z));
        if (!(yield* clear(rect(Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x)), Math.min(...points.map(p => p.z)), Math.max(...points.map(p => p.z)), r.height), false))) { propsClear = false; break; }
      }
      if (!propsClear) continue;
      // Authored characters may walk/dance on a real quiet carriageway, never
      // an invented parallel strip of road or a roof. Check its entire path.
      const walking = level.module === 'walkingHandoff', end = walking ? -Number(candidate.params?.walkLength ?? 70) : -24;
      let followsMappedStreet = true;
      for (let offset = end; offset <= 11; offset += 4) {
        const center = local(0, offset);
        if (!streets.some(street => { const p = project(center.x, center.z, street); return ['residential', 'living_street', 'service', 'unclassified', 'tertiary'].includes(street.edge.e.cls) && p.d <= street.halfWidth - 1.8; })) { followsMappedStreet = false; break; }
        for (const longitudinal of [-1.2, 1.2]) {
          const contact = local(0, offset + longitudinal);
          if (!(yield* clear(rect(contact.x - 1, contact.x + 1, contact.z - 1, contact.z + 1), true))) { followsMappedStreet = false; break; }
        }
        if (!followsMappedStreet) break;
        for (const side of walking ? [Number(candidate.params?.walkSide) || -3.5] : [-6, -4.8, 4.8, 6]) {
          const actor = local(side, offset);
          if (!(yield* clear(rect(actor.x - .45, actor.x + .45, actor.z - .45, actor.z + .45), true))) { followsMappedStreet = false; break; }
        }
        if (!followsMappedStreet) break;
      }
      if (!followsMappedStreet) continue;
    } else {
      let clearFootprint = true;
      for (const r of profile.props) if (!(yield* clear(translated(r, x, z), false))) { clearFootprint = false; break; }
      if (!clearFootprint) continue;
      for (const r of profile.drive) if (!(yield* clear(translated(r, x, z), true))) { clearFootprint = false; break; }
      if (!clearFootprint || !(yield* access(x, z, profile.accessZ))) continue;
    }
    const floor = supportAt(staticCity, x, z, .12).y;
    return { destination: { ...origin, x, z, y: Math.max(0, floor) + .02 }, attempts,
      moduleParams: { ...profile.params, ...candidate.params, ...(profile.street ? { useExistingStreet: true } : {}) } };
  }
  return null;
}

const failedPlacements = new WeakMap<object, Map<string, string>>();
export function groundScenePlacementKey(city: PlacementCity, graph: RoadGraph, level: LevelConfig, revision = '') {
  return [level.id, level.module, level.moduleParams.theme ?? '', level.destination.x, level.destination.z, graph.revision,
    city.buildingGrid.size, city.surfaceGrid.size, revision].join('|');
}
export interface GroundScenePlacementJob {
  readonly done: boolean;
  readonly cancelled: boolean;
  readonly result: GroundScenePlacement | null;
  readonly operations: number;
  step(budgetMs?: number, maxOperations?: number): number;
  cancel(): void;
}
/** Runtime advances this iterator on ordinary frames, without timers/promises.
 * Index construction, polygon batches and height queries all have yield points.
 * An unchanged failed world revision is an immediate cached result. */
export function createGroundScenePlacementJob(city: PlacementCity, graph: RoadGraph, level: LevelConfig, options: ScenePlacementOptions = {}): GroundScenePlacementJob {
  const signature = groundScenePlacementKey(city, graph, level, options.revision), previous = failedPlacements.get(city)?.get(level.id);
  const search = groundScenePlacementSearch(city, graph, level, options);
  let done = options.revision !== undefined && previous === signature, cancelled = false, result: GroundScenePlacement | null = null, operations = 0;
  return {
    get done() { return done; }, get cancelled() { return cancelled; }, get result() { return result; }, get operations() { return operations; },
    step(budgetMs = 1.5, maxOperations = 64) {
      if (done || cancelled || !Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isFinite(maxOperations) || maxOperations <= 0) return 0;
      if (groundScenePlacementKey(city, graph, level, options.revision) !== signature) { cancelled = true; done = true; result = null; search.return(null); return 0; }
      const deadline = performance.now() + Math.min(1.2, budgetMs), limit = Math.min(128, Math.floor(maxOperations)); let count = 0;
      while (!done && count < limit && performance.now() < deadline) {
        const next = search.next(); count++; operations++;
        if (next.done) {
          done = true; result = next.value;
          if (!result && options.revision !== undefined) {
            let failures = failedPlacements.get(city); if (!failures) failedPlacements.set(city, failures = new Map());
            if (failures.size >= 24 && !failures.has(level.id)) failures.clear(); failures.set(level.id, signature);
          }
        }
      }
      return count;
    },
    cancel() { if (cancelled) return; cancelled = true; done = true; result = null; search.return(null); },
  };
}
/** Synchronous drain for offline fit audits and unit fixtures only. Runtime uses
 * createGroundScenePlacementJob and its per-frame budget instead. */
export function findGroundScenePlacement(city: PlacementCity, graph: RoadGraph, level: LevelConfig, options: ScenePlacementOptions = {}): GroundScenePlacement | null {
  const search = groundScenePlacementSearch(city, graph, level, options);
  for (;;) { const next = search.next(); if (next.done) return next.value; }
}

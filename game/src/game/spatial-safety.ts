import type { CityData, Wall } from '../world/city';
import { pointInRing } from '../world/city';
import type { RoadGraph, GEdge } from './roadgraph';
import { nearbyBuildings, supportAt } from './physics';
import { isORR, isRamp, travelDirection } from '../world/expressway';
import type { RoadEdge } from '../world/types';

interface Point { x: number; y: number; z: number }
export interface VehicleBounds extends Point { hx: number; hz: number; size: number[] }
export interface StreetSpot extends Point { yaw: number }
export interface StreetSpotOptions { preferMajor?: boolean; heading?: { x: number; z: number }; vehicles?: VehicleBounds[] }

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}

// Shared by camera clearance and placement: visible poles and barriers matter as
// well as building footprints. Horizontal and vertical clearance are independent.
export function staticSolidAt(city: CityData, p: Point, radius = 0.35, halfHeight = radius): boolean {
  if (p.y - halfHeight < supportAt(city, p.x, p.z, p.y, true).y + 0.02) return true;
  for (const b of nearbyBuildings(city, p.x, p.z)) {
    if (b.h < p.y - halfHeight) continue;
    if (pointInRing(p.x, p.z, b.ring)) return true;
    for (let i = 0, j = b.ring.length - 1; i < b.ring.length; j = i++) {
      if (segmentDistance(p.x, p.z, ...b.ring[j], ...b.ring[i]).d < radius) return true;
    }
  }
  const cx = Math.floor(p.x / 50), cz = Math.floor(p.z / 50);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of city.obstacles.get(`${cx + i},${cz + j}`) || []) {
    if (p.y + halfHeight >= 0 && p.y - halfHeight <= o.top && Math.hypot(p.x - o.x, p.z - o.z) < o.r + radius) return true;
  }
  const seen = new Set<Wall>(), sx = Math.floor(p.x / 30), sz = Math.floor(p.z / 30);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const cell = `${sx + i},${sz + j}`;
    for (const w of city.walls.get(cell) || []) {
      if (seen.has(w) || w.kind === 'kerb') continue; seen.add(w);
      const { d, t } = segmentDistance(p.x, p.z, w.ax, w.az, w.bx, w.bz);
      if (d < radius && p.y + halfHeight >= w.y0a + (w.y0b - w.y0a) * t && p.y - halfHeight <= w.y1a + (w.y1b - w.y1a) * t) return true;
    }
    for (const s of city.surfaceGrid.get(cell) || []) {
      if (s.kind === 'road') continue;
      const { d, t } = segmentDistance(p.x, p.z, s.ax, s.az, s.bx, s.bz);
      const y = s.ya + (s.yb - s.ya) * t;
      if (d < s.hw + radius && p.y - halfHeight < y + 0.05 && p.y + halfHeight > y - 0.3) return true;
    }
  }
  return false;
}

// Segment/OBB slabs use the full length of buses and trucks, not a circle around
// their centre. A vehicle on a bridge does not occlude a camera below its floor.
export function segmentHitsVehicle(from: Point, to: Point, c: VehicleBounds, padding = 0.4): boolean {
  const local = (p: Point) => {
    const dx = p.x - c.x, dz = p.z - c.z;
    return [dx * c.hz - dz * c.hx, p.y - c.y, dx * c.hx + dz * c.hz];
  };
  const a = local(from), b = local(to);
  const lo = [-c.size[0] / 2 - padding, -padding, -c.size[2] / 2 - padding];
  const hi = [c.size[0] / 2 + padding, c.size[1] + padding, c.size[2] / 2 + padding];
  let enter = 0, leave = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-8) { if (a[i] < lo[i] || a[i] > hi[i]) return false; continue; }
    const t0 = (lo[i] - a[i]) / d, t1 = (hi[i] - a[i]) / d;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
    if (enter > leave) return false;
  }
  return true;
}

function cameraEscape(city: CityData, from: Point, wanted: Point): Point {
  const dx = wanted.x - from.x, dy = wanted.y - from.y, dz = wanted.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  const directions: Point[] = [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }];
  if (length > 0.001) directions.push({ x: dx / length, y: dy / length, z: dz / length });
  for (let i = 0; i < 8; i++) directions.push({ x: Math.cos(i * Math.PI / 4), y: 0, z: Math.sin(i * Math.PI / 4) });
  const at = (dir: Point, distance: number) => ({ x: from.x + dir.x * distance, y: from.y + dir.y * distance, z: from.z + dir.z * distance });
  // Exceptional path only: expand rings, stopping at the first clear exits.
  // At most 32 rings x 11 probes; refining only clear exits keeps the result
  // close to the obstruction without ever accepting an occupied camera volume.
  for (let radius = 0.5; radius <= 16; radius += 0.5) {
    let best: Point | null = null, bestDistance = Infinity;
    for (const dir of directions) {
      if (staticSolidAt(city, at(dir, radius))) continue;
      let lo = radius - 0.5, hi = radius;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (staticSolidAt(city, at(dir, mid))) lo = mid; else hi = mid;
      }
      if (hi < bestDistance) { bestDistance = hi; best = at(dir, hi); }
    }
    if (best) return best;
  }
  // Deep inside a large footprint (or below ground), a short radial search may
  // find no exit. Every collider tested at this XZ is finite and in these same
  // local grids, so a point above their highest extent is a clear last resort.
  let ceiling = Math.max(0, from.y);
  for (const b of nearbyBuildings(city, from.x, from.z)) ceiling = Math.max(ceiling, b.h);
  const cx = Math.floor(from.x / 50), cz = Math.floor(from.z / 50);
  const sx = Math.floor(from.x / 30), sz = Math.floor(from.z / 30);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const o of city.obstacles.get(`${cx + i},${cz + j}`) || []) ceiling = Math.max(ceiling, o.top);
    for (const w of city.walls.get(`${sx + i},${sz + j}`) || []) ceiling = Math.max(ceiling, w.y1a, w.y1b);
    for (const s of city.surfaceGrid.get(`${sx + i},${sz + j}`) || []) ceiling = Math.max(ceiling, s.ya, s.yb);
  }
  return { x: from.x, y: ceiling + 1, z: from.z };
}

export function clearCameraPosition(city: CityData, from: Point, wanted: Point): Point {
  // There is no unobstructed sightline to a target already inside a wall. Keep
  // the camera outside it while recovery/physics resolves the target position.
  // The normal branch below still checks the entire pivot-to-camera sightline.
  if (staticSolidAt(city, from)) return cameraEscape(city, from, wanted);
  const distance = (p: Point) => Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
  const trace = (to: Point): Point => {
    const steps = Math.max(1, Math.ceil(distance(to) / 0.25)); let clear = { ...from };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
      if (staticSolidAt(city, p)) break;
      clear = p;
    }
    return clear;
  };
  const direct = trace(wanted);
  if (distance(direct) >= 2.5 || distance(wanted) < 2.5) return direct;
  // Never jump to an unchecked point above the car: that point may be a cornice
  // or a flyover. Try clear elevated/side views, retaining a verified sightline.
  const dx = wanted.x - from.x, dz = wanted.z - from.z, l = Math.hypot(dx, dz) || 1;
  const candidates = [{ x: from.x, y: from.y + 4, z: from.z }, ...[-1, 1].map(sign => ({
    x: from.x + sign * dz / l * 4, y: from.y + 2.5, z: from.z - sign * dx / l * 4,
  }))];
  let best = direct;
  for (const candidate of candidates) { const clear = trace(candidate); if (distance(clear) > distance(best)) best = clear; }
  return best;
}

function roadClearAt(city: CityData, x: number, z: number, y: number): boolean {
  const sup = supportAt(city, x, z, y + 0.5, true), s = sup.s;
  if (!s || !sup.onRoad || sup.y > 1.2 || Math.abs(sup.y - y) > 0.6) return false;
  return segmentDistance(x, z, s.ax, s.az, s.bx, s.bz).d <= Math.max(0, (s.e?.w ?? s.hw * 2) / 2 - 1.15);
}

export function streetFootprintClear(city: CityData, p: Point, hx: number, hz: number, vehicles: VehicleBounds[] = []): boolean {
  // Three overlapping circles cover the coupe's nose, body and tail.
  for (const along of [-1.25, 0, 1.25]) {
    if (staticSolidAt(city, { x: p.x + hx * along, y: p.y + 0.75, z: p.z + hz * along }, 1.15, 0.6)) return false;
  }
  return !vehicles.some(c => segmentHitsVehicle(
    { x: p.x - hx * 1.25, y: p.y + 0.75, z: p.z - hz * 1.25 },
    { x: p.x + hx * 1.25, y: p.y + 0.75, z: p.z + hz * 1.25 }, c, 1.15));
}

export function findClearStreetSpot(graph: RoadGraph, city: CityData, x: number, z: number,
  options: StreetSpotOptions = {}): StreetSpot | null {
  const allowed = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'unknown', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'service']);
  const projections: { g: ReturnType<RoadGraph['nearestEdges']>[number]; s: number; d: number }[] = [];
  for (const g of graph.nearestEdges(x, z, 10)) {
    if (!allowed.has(g.e.cls) || g.len < 12 || g.e.w < 3 || g.e.elev?.some(y => y > 1.2)) continue;
    for (let i = 0; i < g.e.pts.length - 1; i++) {
      const a = g.e.pts[i], b = g.e.pts[i + 1], q = segmentDistance(x, z, ...a, ...b);
      if (q.d <= 550) projections.push({ g, s: g.cum[i] + (g.cum[i + 1] - g.cum[i]) * q.t, d: q.d });
    }
  }
  projections.sort((a, b) => a.d - b.d);
  let best: (StreetSpot & { score: number }) | null = null; const visited = new Set<string>();
  for (const { g, s, d } of projections.slice(0, 80)) {
    if (best && d > best.score + 5) continue;
    const maxLane = Math.max(0, g.e.w / 2 - 1.3);
    const lane = g.e.oneway ? 0 : Math.min(maxLane, Math.max(1.5, g.e.w / 4));
    for (const dir of [1, -1] as const) {
      if ((dir === 1 && g.e.oneway === 'forward') || (dir === -1 && g.e.oneway === 'backward')) continue;
      for (const shift of [0, 6, -6, 12, -12, 24, -24, 48, -48]) for (const offset of [lane, Math.max(0, lane - 0.6)]) {
        const sf = Math.max(4, Math.min(g.len - 4, s + shift)), key = `${g.e.id}:${sf.toFixed(1)}:${dir}:${offset}`;
        if (visited.has(key)) continue; visited.add(key);
        const p = graph.pointAt(g, dir === 1 ? sf : g.len - sf, dir, offset);
        const sup = supportAt(city, p.x, p.z, p.y + 0.5, true); p.y = sup.y;
        const headingCost = options.heading ? (1 - (p.hx * options.heading.x + p.hz * options.heading.z)) * 3 : 0;
        const score = Math.hypot(p.x - x, p.z - z) + headingCost + (options.preferMajor && ['residential', 'unclassified', 'unknown', 'service', 'living_street'].includes(g.e.cls) ? 20 : 0);
        if (best && score >= best.score) continue;
        let clear = true;
        // A legal tangent at a bend may face an immediately adjacent facade.
        // Require a short forward exit as well as a free final footprint.
        for (const ahead of [0, 2, 4, 6, 8]) {
          const at = { x: p.x + p.hx * ahead, y: p.y, z: p.z + p.hz * ahead };
          if (!roadClearAt(city, at.x, at.z, at.y) || !streetFootprintClear(city, at, p.hx, p.hz, options.vehicles)) { clear = false; break; }
        }
        if (clear) best = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.hx, -p.hz), score };
      }
    }
  }
  if (!best) return null;
  const { score: _, ...spot } = best; return spot;
}

interface RecoveryRoadPoint { g: GEdge; s: number; dir: 1 | -1 }
const recoveryExpressway = (e: RoadEdge) => isORR(e) || e.expressway?.ramp === true;

// Follow only an unambiguous directed continuation of this carriageway. Nearby
// service roads, the opposite carriageway and an exit ramp are not continuations.
function recoveryRoadPoint(graph: RoadGraph, start: RecoveryRoadPoint, distance: number, allowed?: Set<string>): RecoveryRoadPoint | null {
  let { g, dir } = start, s = (dir === 1 ? start.s : g.len - start.s) + distance;
  const seen = new Set<GEdge>();
  for (let tries = 0; tries < 12; tries++) {
    allowed?.add(g.e.id);
    if (s >= 0 && s <= g.len) return { g, s: dir === 1 ? s : g.len - s, dir };
    seen.add(g);
    const forward = s > g.len, nodeId = (dir === 1) === forward ? g.to : g.from;
    const end = graph.pointAt(g, forward ? g.len : 0, dir), node = graph.nodes.get(nodeId);
    if (!node) return null;
    const candidates: RecoveryRoadPoint[] = [];
    for (const candidate of graph.nearestEdges(node.x, node.z, 1)) {
      if (seen.has(candidate) || !recoveryExpressway(candidate.e) || !candidate.e.oneway || isRamp(candidate.e) !== isRamp(g.e)) continue;
      const nd = travelDirection(candidate.e);
      const join = (nd === 1) === forward ? candidate.from : candidate.to;
      if (join !== nodeId) continue;
      const p = graph.pointAt(candidate, forward ? 0 : candidate.len, nd);
      if (Math.hypot(p.x - end.x, p.z - end.z) > 1.5 || Math.abs(p.y - end.y) > 0.55 || p.hx * end.hx + p.hz * end.hz < 0.75) continue;
      candidates.push({ g: candidate, dir: nd, s: 0 });
    }
    if (candidates.length !== 1) return null;
    const oldLen = g.len; ({ g, dir } = candidates[0]); s = forward ? s - oldLen : g.len + s;
  }
  return null;
}

function recoveryLane(g: GEdge, index: number) {
  const e = g.e, lanes = Math.max(1, Math.min(4, e.expressway?.throughLanes || e.lanes || 4));
  const left = e.w / 2 - (e.expressway?.shoulders?.[0] ?? 2.5);
  const right = -e.w / 2 + (e.expressway?.shoulders?.[1] ?? 1);
  const width = e.expressway?.laneWidth || (left - right) / lanes;
  if (index >= lanes || width < 2.5) return null;
  const lane = left - (index + 0.5) * width;
  return lane - 1.15 >= right && lane + 1.15 <= left ? lane : null;
}

function recoveryFootprintClear(city: CityData, p: Point, hx: number, hz: number, allowed: Set<string>, vehicles: VehicleBounds[]) {
  const loadedRoad = (x: number, z: number) => {
    const sup = supportAt(city, x, z, p.y + 0.3, true), s = sup.s;
    if (!s?.e || !sup.onRoad || !allowed.has(s.e.id) || Math.abs(sup.y - p.y) > 1) return null;
    // An auxiliary lane shifts the rendered Surface centre outward. Through
    // lanes remain referenced to the original mapped carriageway centreline.
    const a = s.e.pts[s.i], b = s.e.pts[s.i + 1]; if (!a || !b) return null;
    const d = segmentDistance(x, z, ...a, ...b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dir = travelDirection(s.e);
    const tx = (b[0] - a[0]) / len * dir, tz = (b[1] - a[1]) / len * dir;
    const lateral = (x - a[0] - (b[0] - a[0]) * d.t) * tz - (z - a[1] - (b[1] - a[1]) * d.t) * tx;
    const left = s.e.w / 2 - (s.e.expressway?.shoulders?.[0] ?? 2.5), right = -s.e.w / 2 + (s.e.expressway?.shoulders?.[1] ?? 1);
    if (lateral < right + 0.05 || lateral > left - 0.05) return null;
    return sup.y;
  };
  // Support the entire car inside the through carriageway, not a shoulder or
  // the ground road beneath it. Road height is local to each point on a grade.
  for (const along of [-2.4, 0, 2.4]) for (const side of [-1.1, 0, 1.1]) {
    if (loadedRoad(p.x + hx * along + hz * side, p.z + hz * along - hx * side) === null) return false;
  }
  for (const along of [-1.25, 0, 1.25]) {
    const x = p.x + hx * along, z = p.z + hz * along, y = loadedRoad(x, z);
    if (y === null) return false;
    const at = { x, z, y: y + 0.75 };
    if (staticSolidAt(city, at, 1.15, 0.6) || vehicles.some(c => segmentHitsVehicle(at, at, c, 1.15))) return false;
  }
  return true;
}

// Recovery is different from choosing a new starting area: a barrier scrape on
// the ORR must never be answered by gliding to a ground-level service road.
// `roadY` is the car's contact height (player.pos.y - 0.55), not its roof height.
export function findClearRecoverySpot(graph: RoadGraph, city: CityData, x: number, z: number, roadY: number,
  options: StreetSpotOptions = {}): StreetSpot | null {
  let current: (RecoveryRoadPoint & { score: number }) | null = null;
  for (const g of graph.nearestEdges(x, z, 1)) {
    if (!recoveryExpressway(g.e)) continue;
    for (let i = 1; i < g.e.pts.length; i++) {
      const a = g.e.pts[i - 1], b = g.e.pts[i], q = segmentDistance(x, z, ...a, ...b);
      const s = g.cum[i - 1] + (g.cum[i] - g.cum[i - 1]) * q.t;
      const dir = travelDirection(g.e), p = graph.pointAt(g, dir === 1 ? s : g.len - s, dir);
      const height = Math.abs(p.y - roadY);
      if (height > 1.05 || q.d > g.e.w / 2 + 1.5) continue;
      const score = q.d + height * 5;
      if (!current || score < current.score) current = { g, s, dir, score };
    }
  }
  if (!current) return findClearStreetSpot(graph, city, x, z, options);
  if (!current.g.e.oneway) return null; // unknown expressway direction cannot authorize a ground-road fallback
  const allowed = new Set<string>([current.g.e.id]);
  recoveryRoadPoint(graph, current, -60, allowed); recoveryRoadPoint(graph, current, 60, allowed);
  let best: (StreetSpot & { score: number }) | null = null;
  for (const shift of [0, 6, -6, 12, -12, 24, -24, 36, -36, 48, -48]) {
    const at = recoveryRoadPoint(graph, current, shift); if (!at) continue;
    for (let laneIndex = 0; laneIndex < 4; laneIndex++) {
      const lane = recoveryLane(at.g, laneIndex); if (lane === null) continue;
      const p = graph.pointAt(at.g, at.dir === 1 ? at.s : at.g.len - at.s, at.dir, lane);
      const score = Math.hypot(p.x - x, p.z - z);
      if (best && score >= best.score) continue;
      let clear = true;
      for (const ahead of [0, 2, 4, 6, 8]) {
        const exit = recoveryRoadPoint(graph, at, ahead); if (!exit) { clear = false; break; }
        const offset = recoveryLane(exit.g, laneIndex); if (offset === null) { clear = false; break; }
        const step = graph.pointAt(exit.g, exit.dir === 1 ? exit.s : exit.g.len - exit.s, exit.dir, offset);
        if (!recoveryFootprintClear(city, step, step.hx, step.hz, allowed, options.vehicles || [])) { clear = false; break; }
      }
      if (clear) best = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.hx, -p.hz), score };
    }
  }
  if (!best) return null;
  const { score: _, ...spot } = best; return spot;
}

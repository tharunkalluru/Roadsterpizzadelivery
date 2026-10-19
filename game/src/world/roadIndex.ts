import type { RoadEdge, WorldCore, Vec2 } from './schema';
import { publicRealmHeightAt, publicRealmOf } from './publicRealm';
import { accessPitSurfaceAt } from './accessPits';

/** One straight piece of a road centreline. */
export interface Segment {
  road: RoadEdge;
  i: number; // index of start point within road.points
  ax: number; az: number; bx: number; bz: number;
  ay: number; by: number; // surface elevation at ends
  len: number;
  cumStart: number; // distance along road at segment start
  halfWidth: number;
}

export interface SurfaceHit {
  road: RoadEdge;
  roadId: string;
  surfaceId: string;
  level: number;
  /** surface elevation (m) at the projected point */
  elevation: number;
  /** signed lateral offset from centreline: + = right of forward travel (screen view from above, X east, Z south) */
  lateral: number;
  halfWidth: number;
  /** distance along road in points order */
  along: number;
  /** heading of road forward direction (convention: forward = (-sin h, 0, -cos h)) */
  heading: number;
  /** projected point on centreline */
  px: number; pz: number;
  dist: number;
  onCarriageway: boolean;
}

export interface ParapetShape {
  id: string; ax: number; az: number; bx: number; bz: number; ay: number; by: number;
  height: number; radius: number; inwardX: number; inwardZ: number;
}

/** heading h such that forward = (-sin h, -cos h) in (x,z) */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}
export function forwardOf(h: number): Vec2 {
  return [-Math.sin(h), -Math.cos(h)];
}
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Spatial index over road centrelines. The single geometric source for physics
 * support, map matching, air envelope and route following (G04: same data as render).
 */
export class RoadIndex {
  readonly cell = 40;
  private grid = new Map<string, Segment[]>();
  readonly roads = new Map<string, RoadEdge>();
  readonly segmentsByRoad = new Map<string, Segment[]>();
  private nodeById: Map<string, WorldCore['nodes'][number]>;

  constructor(public readonly core: WorldCore) {
    this.nodeById = new Map(core.nodes.map((n) => [n.id, n]));
    for (const r of core.roads) {
      this.roads.set(r.id, r);
      const segs: Segment[] = [];
      let cum = 0;
      for (let i = 0; i < r.points.length - 1; i++) {
        const [ax, az] = r.points[i];
        const [bx, bz] = r.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-6) continue;
        const ay = r.pointElevM?.[i] ?? r.elevationM ?? 0;
        const by = r.pointElevM?.[i + 1] ?? r.elevationM ?? 0;
        const s: Segment = { road: r, i, ax, az, bx, bz, ay, by, len, cumStart: cum, halfWidth: r.widthM / 2 };
        cum += len;
        segs.push(s);
        this.insert(s);
      }
      this.segmentsByRoad.set(r.id, segs);
    }
  }

  private key(ix: number, iz: number) { return ix + ',' + iz; }

  private insert(s: Segment) {
    const pad = s.halfWidth + 6;
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / this.cell);
    const x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / this.cell);
    const z0 = Math.floor((Math.min(s.az, s.bz) - pad) / this.cell);
    const z1 = Math.floor((Math.max(s.az, s.bz) + pad) / this.cell);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(s);
    }
  }

  segmentsNear(x: number, z: number): Segment[] {
    return this.grid.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? [];
  }

  private project(s: Segment, x: number, z: number) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + dx * t, pz = s.az + dz * t;
    // right of travel (viewed from above with X east, Z south): right = (-fz, fx)?? derive: forward f=(dx,dz)/len.
    // In a right-handed X-east/Z-south frame seen from above (Y up), right-hand side of f is (-dz, dx)/len.
    const rx = -dz / s.len, rz = dx / s.len;
    const lateral = (x - px) * rx + (z - pz) * rz;
    return { t, px, pz, lateral, dist: Math.hypot(x - px, z - pz) };
  }

  /**
   * Surface lookup with level/identity hysteresis (MASTER §15, F09): candidates on a different
   * level than `preferLevel`, or not connected to `preferRoadId`, are penalised so an overpass
   * or lower road is not selected merely for being slightly closer.
   */
  surface(x: number, z: number, opts: { preferRoadId?: string | null; preferLevel?: number; maxY?: number; margin?: number; heading?: number; onlyRoadId?: string } = {}): SurfaceHit | null {
    const margin = opts.margin ?? 0.5;
    let best: SurfaceHit | null = null;
    let bestScore = Infinity;
    const prefer = opts.preferRoadId ? this.roads.get(opts.preferRoadId) : undefined;
    for (const s of this.segmentsNear(x, z)) {
      if (opts.onlyRoadId && s.road.id !== opts.onlyRoadId) continue;
      const p = this.project(s, x, z);
      if (p.dist > s.halfWidth + margin) continue;
      const elevation = s.ay + (s.by - s.ay) * p.t;
      if (opts.maxY !== undefined && elevation > opts.maxY + 0.75) continue; // surface above the car is not support
      // width-normalised: at a fork, a narrow road beside a wide carriageway must not win just because its centreline is closer
      let score = p.dist <= s.halfWidth ? (p.dist / s.halfWidth) * 2 : 2 + (p.dist - s.halfWidth);
      const connected = !!prefer && (s.road.fromNode === prefer.fromNode || s.road.fromNode === prefer.toNode || s.road.toNode === prefer.fromNode || s.road.toNode === prefer.toNode);
      // a level change is legitimate only through a real connection where the surfaces meet at the car's height
      const carY = opts.maxY !== undefined ? opts.maxY - 0.3 : undefined;
      const levelTransition = connected && carY !== undefined && Math.abs(elevation - carY) < 0.6;
      if (opts.preferLevel !== undefined && s.road.level !== opts.preferLevel && !levelTransition) score += 30;
      if (prefer && s.road.id !== prefer.id) score += connected ? 0.5 : 2.0;
      if (opts.maxY !== undefined) score += Math.max(0, opts.maxY - elevation) * 0.5; // prefer the surface just below the car
      if (opts.heading !== undefined) {
        // travel-direction alignment: a crossing road at a junction is not the road we are on
        const segH = headingOf(s.bx - s.ax, s.bz - s.az);
        score += (1 - Math.abs(Math.cos(opts.heading - segH))) * 8;
      }
      if (score < bestScore) {
        bestScore = score;
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        best = {
          road: s.road, roadId: s.road.id, surfaceId: s.road.surfaceId, level: s.road.level, elevation,
          lateral: p.lateral, halfWidth: s.halfWidth, along: s.cumStart + p.t * s.len,
          heading: headingOf(dx, dz), px: p.px, pz: p.pz, dist: p.dist,
          onCarriageway: p.dist <= s.halfWidth,
        };
      }
    }
    return best;
  }

  /** point and heading at distance `along` on a road (clamped) */
  pointAlong(roadId: string, along: number): { x: number; z: number; y: number; heading: number } {
    const segs = this.segmentsByRoad.get(roadId)!;
    let s = segs[0];
    for (const c of segs) { s = c; if (along <= c.cumStart + c.len) break; }
    const t = Math.min(1, Math.max(0, (along - s.cumStart) / s.len));
    return { x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t, y: s.ay + (s.by - s.ay) * t, heading: headingOf(s.bx - s.ax, s.bz - s.az) };
  }

  roadLength(roadId: string): number { return this.roads.get(roadId)!.lengthM; }

  /** Canonical 30 cm × 1 m parapet pieces. Both road art and collision consume these exact
   * positions; joints use the polyline miter, and real branch junctions leave matching openings.
   */
  parapetSegments(roadId: string): ParapetShape[] {
    const road = this.roads.get(roadId), segs = this.segmentsByRoad.get(roadId) ?? [];
    if (!road || /^(footway|pedestrian|path|steps|cycleway|track)$/.test(road.highway)) return [];
    const out: ParapetShape[] = [];
    const offset = (index: number, fallback: Segment): Vec2 => {
      const a = segs.find((s) => s.i === index - 1) ?? fallback, b = segs.find((s) => s.i === index) ?? fallback;
      const arx = -(a.bz - a.az) / a.len, arz = (a.bx - a.ax) / a.len, brx = -(b.bz - b.az) / b.len, brz = (b.bx - b.ax) / b.len;
      const mx = arx + brx, mz = arz + brz, len = Math.hypot(mx, mz) || 1;
      const nx = mx / len, nz = mz / len, scale = Math.min(2.5, 1 / Math.max(0.4, nx * brx + nz * brz));
      return [nx * scale, nz * scale];
    };
    for (const s of segs) {
      if (Math.max(s.ay, s.by) < 0.25) continue;
      const t0 = s.ay < 0.25 ? (0.25 - s.ay) / (s.by - s.ay) : 0, t1 = s.by < 0.25 ? (0.25 - s.ay) / (s.by - s.ay) : 1;
      const [arx, arz] = offset(s.i, s), [brx, brz] = offset(s.i + 1, s);
      for (const side of [-1, 1]) {
        const lateral = side * (road.widthM / 2 + 0.15);
        const ax = s.ax + arx * lateral, az = s.az + arz * lateral, bx = s.bx + brx * lateral, bz = s.bz + brz * lateral;
        const pieces = Math.max(1, Math.ceil((t1 - t0) * s.len / 2));
        for (let piece = 0; piece < pieces; piece++) {
          const a = t0 + (t1 - t0) * piece / pieces, b = t0 + (t1 - t0) * (piece + 1) / pieces, mid = (a + b) / 2;
          if (!this.barrierClear(roadId, ax + (bx - ax) * mid, az + (bz - az) * mid, s.ay + (s.by - s.ay) * mid)) continue;
          out.push({ id: `parapet_${roadId}_${s.i}_${side}`, ax: ax + (bx - ax) * a, az: az + (bz - az) * a, bx: ax + (bx - ax) * b, bz: az + (bz - az) * b, ay: s.ay + (s.by - s.ay) * a, by: s.ay + (s.by - s.ay) * b, height: 1, radius: 0.15, inwardX: (s.bz - s.az) / s.len * side, inwardZ: -(s.bx - s.ax) / s.len * side });
        }
      }
    }
    return out;
  }

  /** A parapet must open at an actual connected, same-height road junction. Shared by art
   * and collision; a road underneath a flyover does not create an opening in its side wall.
   */
  barrierClear(roadId: string, x: number, z: number, elevation: number): boolean {
    const road = this.roads.get(roadId);
    if (!road) return true;
    for (const s of this.segmentsNear(x, z)) {
      if (s.road.id === roadId || /^(footway|pedestrian|path|steps|cycleway|track)$/.test(s.road.highway)) continue;
      const connected = s.road.fromNode === road.fromNode || s.road.fromNode === road.toNode || s.road.toNode === road.fromNode || s.road.toNode === road.toNode;
      if (!connected) continue;
      const shared = [road.fromNode, road.toNode].filter((id) => id === s.road.fromNode || id === s.road.toNode);
      const fork = shared.some((id) => (this.nodeById.get(id)?.edges.filter((edgeId) => {
        const edge = this.roads.get(edgeId);
        return edge && !/^(footway|pedestrian|path|steps|cycleway|track)$/.test(edge.highway);
      }).length ?? 0) > 2);
      const p = this.project(s, x, z);
      if (p.dist > s.halfWidth + 0.45 || Math.abs(s.ay + (s.by - s.ay) * p.t - elevation) > (fork ? 1.25 : 0.55)) continue;
      // A straight continuation keeps its outside wall. A crossing/turning carriageway opens it.
      const own = this.segmentsByRoad.get(roadId)!;
      const end = Math.hypot(x - road.points[0][0], z - road.points[0][1]) < Math.hypot(x - road.points.at(-1)![0], z - road.points.at(-1)![1]) ? own[0] : own.at(-1)!;
      const cross = Math.abs(((end.bx - end.ax) * (s.bz - s.az) - (end.bz - end.az) * (s.bx - s.ax)) / (end.len * s.len));
      if (cross > (fork ? 0.04 : 0.25)) return false;
    }
    return true;
  }

  /** Height of the rendered 16 cm footpath, excluding junction cuts and crossing streets. */
  groundHeight(x: number, z: number, preferRoadId: string | null, level: number, maxY: number): number {
    const hit = this.surface(x, z, { preferRoadId, preferLevel: level, maxY, margin: 2 });
    const pit=level<=0?accessPitSurfaceAt(this.core,x,z):undefined;
    if(pit&&(!hit||hit.elevation<.25))return pit.height;
    if (!hit) return 0;
    if (hit.onCarriageway) return hit.elevation + publicRealmHeightAt(publicRealmOf(this.core), hit.roadId, x, z);
    if (hit.elevation >= 0.25 || /^(footway|pedestrian|path|steps|cycleway|track)$/.test(hit.road.highway)) return hit.elevation;
    const fw = hit.road.widthM >= 7 ? 1.8 : 1;
    if (hit.dist > hit.halfWidth + fw) return hit.elevation;
    for (const seg of this.segmentsNear(x, z)) {
      const p = this.project(seg, x, z);
      const y = seg.ay + (seg.by - seg.ay) * p.t;
      if (p.dist <= seg.halfWidth + 0.1 && Math.abs(y - hit.elevation) < 0.3) return y;
    }
    for (const node of [hit.road.fromNode, hit.road.toNode]) {
      const n = this.nodeById.get(node);
      if (n?.isJunction && Math.hypot(x - n.x, z - n.z) < hit.road.widthM * 0.59 + 0.6) return hit.elevation;
    }
    return hit.elevation + 0.16;
  }
}

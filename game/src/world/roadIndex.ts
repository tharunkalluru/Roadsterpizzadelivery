import type { RoadEdge, WorldCore, Vec2 } from './schema';

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

  constructor(public readonly core: WorldCore) {
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
  surface(x: number, z: number, opts: { preferRoadId?: string | null; preferLevel?: number; maxY?: number; margin?: number; heading?: number } = {}): SurfaceHit | null {
    const margin = opts.margin ?? 0.5;
    let best: SurfaceHit | null = null;
    let bestScore = Infinity;
    const prefer = opts.preferRoadId ? this.roads.get(opts.preferRoadId) : undefined;
    for (const s of this.segmentsNear(x, z)) {
      const p = this.project(s, x, z);
      if (p.dist > s.halfWidth + margin) continue;
      const elevation = s.ay + (s.by - s.ay) * p.t;
      if (opts.maxY !== undefined && elevation > opts.maxY + 0.75) continue; // surface above the car is not support
      let score = p.dist;
      if (opts.preferLevel !== undefined && s.road.level !== opts.preferLevel) score += 30;
      if (prefer && s.road.id !== prefer.id) {
        const connected = s.road.fromNode === prefer.fromNode || s.road.fromNode === prefer.toNode || s.road.toNode === prefer.fromNode || s.road.toNode === prefer.toNode;
        score += connected ? 0.5 : 2.0;
      }
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
}

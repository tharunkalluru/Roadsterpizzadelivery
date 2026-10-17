import type { Building, WorldCore, WorldChunk, Vec2 } from './schema';
import { RoadIndex } from './roadIndex';
import { NavGraph } from './nav';

export type ObstacleKind = 'building' | 'pillar' | 'deck' | 'bridge' | 'parapet' | 'vehicle' | 'pedestrian';

export interface Contact {
  id: string;
  kind: ObstacleKind;
  nx: number; nz: number; // push-out direction (horizontal)
  depth: number;
  /** true when the contact is with the underside/top of an overhead volume */
  vertical?: 'below' | 'above';
}

interface PolyObstacle { id: string; poly: Vec2[]; minX: number; maxX: number; minZ: number; maxZ: number; top: number; chunk: string }
interface CircleObstacle { id: string; x: number; z: number; r: number; bottom: number; top: number }
interface OverheadBand { id: string; kind: 'deck' | 'bridge'; ax: number; az: number; bx: number; bz: number; halfWidth: number; bottom: number; top: number; level: number }

function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + dx * t, z: az + dz * t, t };
}

/**
 * Static collision + air-clearance model built from the same canonical world data as the
 * render meshes (G04, F08, F09). Heights for metro decks/bridges are provisional values from
 * the world package and are reported as such.
 */
export class WorldPhysics {
  readonly roads: RoadIndex;
  readonly nav: NavGraph;
  private cell = 50;
  private polyGrid = new Map<string, PolyObstacle[]>();
  private circles: CircleObstacle[] = [];
  private circleGrid = new Map<string, CircleObstacle[]>();
  private bands: OverheadBand[] = [];
  private bandGrid = new Map<string, OverheadBand[]>();
  private loadedChunks = new Set<string>();
  readonly chunkSize: number;

  constructor(public readonly core: WorldCore, chunkSize = 200) {
    this.chunkSize = chunkSize;
    this.roads = new RoadIndex(core);
    this.nav = new NavGraph(core, this.roads);
    const m = core.metro;
    const deckBottom = m.deckHeightM - 1.8;
    for (const p of m.pillars) {
      const c: CircleObstacle = { id: `pillar_${p.x.toFixed(1)}_${p.z.toFixed(1)}`, x: p.x, z: p.z, r: 1.0, bottom: -1, top: deckBottom };
      this.circles.push(c);
      this.addToGrid(this.circleGrid, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r, c);
    }
    for (const line of core.metroLines) {
      for (const pl of line.local) {
        for (let i = 0; i < pl.length - 1; i++) {
          const b: OverheadBand = { id: `deck_${line.id}_${i}`, kind: 'deck', ax: pl[i][0], az: pl[i][1], bx: pl[i + 1][0], bz: pl[i + 1][1], halfWidth: m.deckWidthM / 2, bottom: deckBottom, top: m.deckHeightM + 0.6, level: 99 };
          this.addBand(b);
        }
      }
    }
    for (const r of core.roads) {
      if (!r.bridge) continue;
      for (let i = 0; i < r.points.length - 1; i++) {
        const ya = r.pointElevM[i] ?? r.elevationM, yb = r.pointElevM[i + 1] ?? r.elevationM;
        const y = Math.min(ya, yb);
        if (y < 2.5) continue; // ramp ends: no usable underpass volume
        this.addBand({ id: `bridge_${r.id}_${i}`, kind: 'bridge', ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], halfWidth: r.widthM / 2 + 0.5, bottom: y - 1.2, top: Math.max(ya, yb) + 0.05, level: r.level });
      }
    }
  }

  private addToGrid<T>(grid: Map<string, T[]>, x0: number, x1: number, z0: number, z1: number, item: T) {
    for (let ix = Math.floor(x0 / this.cell); ix <= Math.floor(x1 / this.cell); ix++)
      for (let iz = Math.floor(z0 / this.cell); iz <= Math.floor(z1 / this.cell); iz++) {
        const k = ix + ',' + iz; let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(item);
      }
  }
  private addBand(b: OverheadBand) {
    this.bands.push(b);
    this.addToGrid(this.bandGrid, Math.min(b.ax, b.bx) - b.halfWidth, Math.max(b.ax, b.bx) + b.halfWidth, Math.min(b.az, b.bz) - b.halfWidth, Math.max(b.az, b.bz) + b.halfWidth, b);
  }
  private near<T>(grid: Map<string, T[]>, x: number, z: number): T[] {
    return grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)) ?? [];
  }

  addChunk(chunk: WorldChunk): void {
    if (this.loadedChunks.has(chunk.id)) return;
    this.loadedChunks.add(chunk.id);
    for (const b of chunk.buildings) if (!b.intrudesCarriageway) this.addBuilding(b, chunk.id); // D12: road precedence
  }
  removeChunk(chunkId: string): void {
    if (!this.loadedChunks.delete(chunkId)) return;
    for (const [k, arr] of this.polyGrid) {
      const f = arr.filter((o) => o.chunk !== chunkId);
      if (f.length) this.polyGrid.set(k, f); else this.polyGrid.delete(k);
    }
  }
  private addBuilding(b: Building, chunk: string) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b.footprint) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    this.addToGrid(this.polyGrid, minX, maxX, minZ, maxZ, { id: b.id, poly: b.footprint, minX, maxX, minZ, maxZ, top: b.heightM, chunk });
  }

  chunkIdAt(x: number, z: number): string { return `c_${Math.floor(x / this.chunkSize)}_${Math.floor(z / this.chunkSize)}`; }
  /** collision-critical content for the area is registered (U09/F22) */
  isLoaded(x: number, z: number): boolean {
    const id = this.chunkIdAt(x, z);
    return this.loadedChunks.has(id) || !this.chunkExists(id); // chunks absent from the manifest hold no collision content
  }
  private knownChunks: Set<string> | null = null;
  setKnownChunks(ids: string[]) { this.knownChunks = new Set(ids); }
  private chunkExists(id: string) { return this.knownChunks ? this.knownChunks.has(id) : false; }
  get loadedChunkIds(): string[] { return [...this.loadedChunks]; }

  /** lowest overhead underside above `fromY` at (x,z); Infinity if open sky */
  overheadAt(x: number, z: number, fromY: number): { bottom: number; id: string | null; kind: string | null } {
    let bottom = Infinity, id: string | null = null, kind: string | null = null;
    for (const b of this.near(this.bandGrid, x, z)) {
      if (b.bottom <= fromY + 0.3) continue; // structure at/below us (e.g. the bridge we stand on)
      const c = closestOnSeg(x, z, b.ax, b.az, b.bx, b.bz);
      if (Math.hypot(x - c.x, z - c.z) > b.halfWidth) continue;
      if (b.bottom < bottom) { bottom = b.bottom; id = b.id; kind = b.kind; }
    }
    return { bottom, id, kind };
  }

  /** building top if (x,z) is inside a building footprint (roofs are never landing surfaces) */
  buildingAt(x: number, z: number): { id: string; top: number } | null {
    for (const o of this.near(this.polyGrid, x, z)) {
      if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
      if (pointInPoly(x, z, o.poly)) return { id: o.id, top: o.top };
    }
    return null;
  }

  /**
   * Contacts for a vertical capsule-ish volume (circle radius r, from y to y+h).
   * Full-volume test: the vehicle is sampled as two circles (see player), not a centre ray (F08).
   */
  contacts(x: number, z: number, y: number, h: number, r: number, out: Contact[] = []): Contact[] {
    for (const o of this.near(this.polyGrid, x, z)) {
      if (y >= o.top) continue;
      if (x < o.minX - r || x > o.maxX + r || z < o.minZ - r || z > o.maxZ + r) continue;
      const inside = pointInPoly(x, z, o.poly);
      let best = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = o.poly.length - 1; i < o.poly.length; j = i++) {
        const c = closestOnSeg(x, z, o.poly[j][0], o.poly[j][1], o.poly[i][0], o.poly[i][1]);
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < best) { best = d; bx = c.x; bz = c.z; }
      }
      if (!inside && best >= r) continue;
      let nx = x - bx, nz = z - bz; const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      if (inside) { nx = -nx; nz = -nz; }
      out.push({ id: o.id, kind: 'building', nx, nz, depth: inside ? best + r : r - best });
    }
    for (const c of this.near(this.circleGrid, x, z)) {
      if (y >= c.top || y + h <= c.bottom) continue;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d >= c.r + r) continue;
      const l = d || 1;
      out.push({ id: c.id, kind: 'pillar', nx: (x - c.x) / l, nz: (z - c.z) / l, depth: c.r + r - d });
    }
    for (const b of this.near(this.bandGrid, x, z)) {
      if (y + h <= b.bottom || y >= b.top - 0.3) continue; // a car standing on / flying over the deck top is not hitting it
      const c = closestOnSeg(x, z, b.ax, b.az, b.bx, b.bz);
      if (Math.hypot(x - c.x, z - c.z) > b.halfWidth + r * 0.5) continue;
      // vertical overlap with an overhead volume we are not standing on
      out.push({ id: b.id, kind: b.kind, nx: 0, nz: 0, depth: y + h - b.bottom, vertical: 'below' });
    }
    return out;
  }
}

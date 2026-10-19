import type { Building, WorldCore, WorldChunk, Storefront, Vec2 } from './schema';
import { RoadIndex } from './roadIndex';
import { publicRealmOf } from './publicRealm';
import { setAccessPitsForChunk,removeAccessPitsForChunk,type AccessPit } from './accessPits';
import { NavGraph } from './nav';
import { metroAlignments } from './metroGeometry';
import { buildingAccessPlan, buildingAccessObstacles, buildingAccessCutouts } from './buildingAccess';

export type ObstacleKind = 'building' | 'pillar' | 'deck' | 'bridge' | 'parapet' | 'vehicle' | 'pedestrian';

export interface Contact {
  id: string;
  kind: ObstacleKind;
  nx: number; nz: number; // push-out direction (horizontal)
  depth: number;
  /** true when the contact is with the underside/top of an overhead volume */
  vertical?: 'below' | 'above';
}

interface BodyCutout { poly: Vec2[]; bottom: number; top: number; ceilingId?: string }
const NO_CUTOUTS: BodyCutout[] = [];
interface BoundaryEdge { a: Vec2; b: Vec2 }
interface PolyObstacle { id: string; poly: Vec2[]; holes?: Vec2[][]; cutouts?: BodyCutout[]; boundaryCache?: Map<string,BoundaryEdge[]>; minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number; chunk: string }
interface CircleObstacle { id: string; x: number; z: number; r: number; bottom: number; top: number }
interface OverheadBand { id: string; kind: 'deck' | 'bridge'; ax: number; az: number; bx: number; bz: number; halfWidth: number; bottom: number; top: number; level: number; ya?: number; yb?: number }
interface Barrier { id: string; ax: number; az: number; bx: number; bz: number; ay: number; by: number; height: number; radius: number; inwardX: number; inwardZ: number }

function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function insideBody(x: number, z: number, obstacle: PolyObstacle, cutouts: BodyCutout[] = NO_CUTOUTS): boolean {
  return pointInPoly(x,z,obstacle.poly) && !(obstacle.holes?.some(hole=>pointInPoly(x,z,hole))) && !cutouts.some(c=>pointInPoly(x,z,c.poly));
}

/** Exposed edges of polygon minus finite-height entrance pockets. Splitting at intersections
 * removes the old facade segment across an open entrance without inventing a wall across its mouth. */
function exposedEdges(o: PolyObstacle, cutouts: BodyCutout[]): BoundaryEdge[] {
  const rings=[o.poly,...(o.holes??[]),...cutouts.map(c=>c.poly)],edges:BoundaryEdge[]=[];
  const all=rings.flatMap(r=>r.map((a,i)=>({a,b:r[(i+1)%r.length]})));
  const cross=(ax:number,az:number,bx:number,bz:number)=>ax*bz-az*bx;
  for(const e of all){
    const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],len=Math.hypot(dx,dz);if(len<1e-6)continue;
    const ts=[0,1];
    for(const f of all){
      const sx=f.b[0]-f.a[0],sz=f.b[1]-f.a[1],qx=f.a[0]-e.a[0],qz=f.a[1]-e.a[1],den=cross(dx,dz,sx,sz);
      if(Math.abs(den)<1e-8){
        if(Math.abs(cross(qx,qz,dx,dz))<1e-7)for(const p of [f.a,f.b]){const t=((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dz)/(len*len);if(t>0&&t<1)ts.push(t);}
      }else{
        const t=cross(qx,qz,sx,sz)/den,u=cross(qx,qz,dx,dz)/den;if(t>0&&t<1&&u>=-1e-8&&u<=1+1e-8)ts.push(t);
      }
    }
    ts.sort((a,b)=>a-b);
    for(let i=1;i<ts.length;i++){
      if(ts[i]-ts[i-1]<1e-8)continue;
      const t=(ts[i]+ts[i-1])/2,x=e.a[0]+dx*t,z=e.a[1]+dz*t,nx=-dz/len*.0001,nz=dx/len*.0001;
      if(insideBody(x+nx,z+nz,o,cutouts)===insideBody(x-nx,z-nz,o,cutouts))continue;
      edges.push({a:[e.a[0]+dx*ts[i-1],e.a[1]+dz*ts[i-1]],b:[e.a[0]+dx*ts[i],e.a[1]+dz*ts[i]]});
    }
  }
  return edges;
}

function closestOnSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + dx * t, z: az + dz * t, t };
}

/** Resolve class-default flyover widths that overlap a separately mapped parallel carriageway.
 * This is a derived clearance correction, never a claim of surveyed road dimensions. Mutating
 * the shared canonical widths keeps the rendered slab, minimap and physical parapet in agreement.
 */
function reconcileBridgeWidths(core: WorldCore): void {
  const geometry = new RoadIndex(core);
  for (const road of core.roads) {
    if (!road.bridge || !road.oneway || road.widthM <= 3.5 || road.status.width === 'verified') continue;
    let width = road.widthM;
    for (const s of geometry.segmentsByRoad.get(road.id) ?? []) for (const t of [0, 0.5, 1]) {
      const x = s.ax + (s.bx - s.ax) * t, z = s.az + (s.bz - s.az) * t, y = s.ay + (s.by - s.ay) * t;
      for (const near of geometry.segmentsNear(x, z)) {
        if (near.road.id === road.id || /^(footway|pedestrian|path|steps|cycleway|track)$/.test(near.road.highway)) continue;
        if (near.road.fromNode === road.fromNode || near.road.fromNode === road.toNode || near.road.toNode === road.fromNode || near.road.toNode === road.toNode) continue;
        const parallel = Math.abs(((s.bx - s.ax) * (near.bx - near.ax) + (s.bz - s.az) * (near.bz - near.az)) / (s.len * near.len));
        if (parallel < 0.92) continue;
        const p = closestOnSeg(x, z, near.ax, near.az, near.bx, near.bz);
        const longitudinal = ((x - p.x) * (near.bx - near.ax) + (z - p.z) * (near.bz - near.az)) / near.len;
        if (Math.abs(longitudinal) > 0.75) continue; // an approaching endpoint is not a parallel road beside us
        if (Math.abs(y - (near.ay + (near.by - near.ay) * p.t)) > 1.2) continue;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 2.5 || d > (road.widthM + near.road.widthM) / 2 + 0.8) continue; // continuation or distant road
        // Two parallel bridge carriageways share the gap; a bridge beside a ground road must
        // leave that road's already modelled width intact.
        const half = near.road.bridge ? d / 2 - 0.3 : d - near.road.widthM / 2 - 0.4;
        width = Math.min(width, Math.max(3.5, half * 2));
      }
    }
    if (width < road.widthM - 0.1) {
      const before = road.widthM;
      road.widthM = Math.round(width * 100) / 100;
      road.status.width = 'provisional';
      road.provenance.note = `${road.provenance.note ?? ''}; derived parallel-carriageway clearance: ${before} m → ${road.widthM} m; not street-survey verified`;
    }
  }
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
  private barrierGrid = new Map<string, Barrier[]>();
  private loadedChunks = new Set<string>();
  readonly chunkSize: number;

  constructor(public readonly core: WorldCore, chunkSize = 200) {
    this.chunkSize = chunkSize;
    reconcileBridgeWidths(core);
    this.roads = new RoadIndex(core);
    this.nav = new NavGraph(core, this.roads);
    const m = core.metro;
    const deckBottom = m.deckHeightM - 2.1;
    for (const p of m.pillars) {
      const c: CircleObstacle = { id: `pillar_${p.x.toFixed(1)}_${p.z.toFixed(1)}`, x: p.x, z: p.z, r: 1.0, bottom: -1, top: deckBottom };
      this.circles.push(c);
      this.addToGrid(this.circleGrid, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r, c);
    }
    for (const [alignmentIndex, line] of metroAlignments(core).entries()) {
      for (let i = 0; i < line.samples.length - 1; i++) {
        const a = line.samples[i], b = line.samples[i + 1];
        this.addBand({ id: `deck_${line.lineId}_${alignmentIndex}_${i}`, kind: 'deck', ax: a.x, az: a.z, bx: b.x, bz: b.z, halfWidth: Math.max(4.2, m.deckWidthM / 2), bottom: deckBottom, top: m.deckHeightM + 1.1, level: 99 });
      }
    }
    for (const r of core.roads) {
      for (const b of this.roads.parapetSegments(r.id)) this.addBarrier(b);
      if (!r.bridge) continue;
      for (let i = 0; i < r.points.length - 1; i++) {
        const ya = r.pointElevM[i] ?? r.elevationM, yb = r.pointElevM[i + 1] ?? r.elevationM;
        const y = Math.min(ya, yb);
        if (y < 2.5) continue; // ramp ends: no usable underpass volume
        this.addBand({ id: `bridge_${r.id}_${i}`, kind: 'bridge', ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], halfWidth: r.widthM / 2 + 0.5, bottom: y - 1.2, top: Math.max(ya, yb) + 0.05, level: r.level, ya, yb });
      }
    }
    const publicRealm = publicRealmOf(core);
    if (publicRealm) this.addStructures(publicRealm.solids);
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
  private addBarrier(b: Barrier) {
    this.addToGrid(this.barrierGrid, Math.min(b.ax, b.bx) - 3, Math.max(b.ax, b.bx) + 3, Math.min(b.az, b.bz) - 3, Math.max(b.az, b.bz) + 3, b);
  }

  /** Register a surveyed physical median/barrier together with its rendered geometry. */
  addRoadBarriers(list: { id: string; points: [number, number][]; elevation: number; height: number; width: number }[]): void {
    for (const b of list) for (let i = 1; i < b.points.length; i++) {
      const [ax, az] = b.points[i - 1], [bx, bz] = b.points[i];
      this.addBarrier({ id: `${b.id}_${i}`, ax, az, bx, bz, ay: b.elevation, by: b.elevation, height: b.height, radius: b.width / 2, inwardX: 0, inwardZ: 0 });
    }
  }
  private near<T>(grid: Map<string, T[]>, x: number, z: number): T[] {
    return grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)) ?? [];
  }

  addChunk(chunk: WorldChunk): void {
    if (this.loadedChunks.has(chunk.id)) return;
    this.loadedChunks.add(chunk.id);
    const stores=(('storefronts' in chunk ? chunk.storefronts : []) ?? []) as Storefront[];
    const pits:AccessPit[]=[];
    for (const b of chunk.buildings) {
      if (b.intrudesCarriageway) continue; // App drops these bodies from art until an explicit survey retains them.
      const hasAccess=b.researchedProfile || ['madhapur_commercial','madhapur_brown_commercial','habsiguda_gatsi_block'].includes(b.surveyStyle ?? '');
      const plan=hasAccess?buildingAccessPlan(b,stores.filter(s=>s.buildingId===b.id),this.roads):null;
      this.addBuilding(b,chunk.id,plan?buildingAccessCutouts(plan):[]);
      if(plan){this.addStructures(buildingAccessObstacles(plan),chunk.id);pits.push(...plan.pits);}
    }
    setAccessPitsForChunk(this.core,chunk.id,pits);
  }
  removeChunk(chunkId: string): void {
    if (!this.loadedChunks.delete(chunkId)) return;
    removeAccessPitsForChunk(this.core,chunkId);
    for (const [k, arr] of this.polyGrid) {
      const f = arr.filter((o) => o.chunk !== chunkId);
      if (f.length) this.polyGrid.set(k, f); else this.polyGrid.delete(k);
    }
  }
  private addBuilding(b: Building, chunk: string, cutouts: BodyCutout[] = []) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b.footprint) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    this.addToGrid(this.polyGrid, minX, maxX, minZ, maxZ, { id: b.id, poly: b.footprint, holes: b.holes, ...(cutouts.length?{cutouts,boundaryCache:new Map()}:{}), minX, maxX, minZ, maxZ, top: b.heightM, ...(b.baseHeightM ? { bottom: b.baseHeightM } : {}), chunk });
  }

  /** static structures from the art layer (station stairs/escalators) so visuals and collision agree (G04, S02) */
  addStructures(list: { id: string; poly: [number, number][]; bottom: number; top: number }[], ownerChunk = '__static'): void {
    for (const st of list) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of st.poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      this.addToGrid(this.polyGrid, minX, maxX, minZ, maxZ, { id: st.id, poly: st.poly, minX, maxX, minZ, maxZ, top: st.top, bottom: st.bottom, chunk: ownerChunk });
    }
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

  /** deck top/bottom at the projected point (sloped ramps interpolate) */
  private bandAt(b: OverheadBand, t: number): { bottom: number; top: number } {
    if (b.ya === undefined || b.yb === undefined) return { bottom: b.bottom, top: b.top };
    const y = b.ya + (b.yb - b.ya) * t;
    return { bottom: y - 1.2, top: y + 0.05 };
  }

  /** lowest overhead underside above `fromY` at (x,z); Infinity if open sky */
  overheadAt(x: number, z: number, fromY: number): { bottom: number; id: string | null; kind: string | null } {
    let bottom = Infinity, id: string | null = null, kind: string | null = null;
    for (const b of this.near(this.bandGrid, x, z)) {
      const c = closestOnSeg(x, z, b.ax, b.az, b.bx, b.bz);
      if (Math.hypot(x - c.x, z - c.z) > b.halfWidth) continue;
      const v = this.bandAt(b, c.t);
      if (v.bottom <= fromY + 0.3) continue; // structure at/below us (e.g. the bridge we stand on)
      if (v.bottom < bottom) { bottom = v.bottom; id = b.id; kind = b.kind; }
    }
    return { bottom, id, kind };
  }

  /** building top if (x,z) is inside a building footprint (roofs are never landing surfaces) */
  buildingAt(x: number, z: number): { id: string; top: number } | null {
    for (const o of this.near(this.polyGrid, x, z)) {
      if (x < o.minX || x > o.maxX || z < o.minZ || z > o.maxZ) continue;
      if (insideBody(x, z, o)) return { id: o.id, top: o.top };
    }
    return null;
  }

  /**
   * Contacts for a vertical capsule-ish volume (circle radius r, from y to y+h).
   * Full-volume test: the vehicle is sampled as two circles (see player), not a centre ray (F08).
   */
  contacts(x: number, z: number, y: number, h: number, r: number, out: Contact[] = []): Contact[] {
    for (const o of this.near(this.polyGrid, x, z)) {
      if (y >= o.top || (o.bottom !== undefined && y + h <= o.bottom)) continue;
      if (x < o.minX - r || x > o.maxX + r || z < o.minZ - r || z > o.maxZ + r) continue;
      const active=o.cutouts?.filter(c=>y>=c.bottom-1e-6&&y<c.top)??NO_CUTOUTS;
      const inside = insideBody(x, z, o, active);
      for(const c of active)if(y+h>c.top&&insideBody(x,z,o)&&pointInPoly(x,z,c.poly))out.push({id:c.ceilingId??`${o.id}:entrance-ceiling`,kind:'building',nx:0,nz:0,depth:y+h-c.top,vertical:'below'});
      if(inside&&o.bottom!==undefined&&y<o.bottom){out.push({id:o.id,kind:'building',nx:0,nz:0,depth:y+h-o.bottom,vertical:'below'});continue;}
      let best = Infinity, bx = 0, bz = 0;
      if(active.length){
        const key=active.map(c=>o.cutouts!.indexOf(c)).join(',');let edges=o.boundaryCache!.get(key)!;
        if(!edges){edges=exposedEdges(o,active);o.boundaryCache!.set(key,edges);}
        for (const e of edges) {
          const c = closestOnSeg(x, z, e.a[0], e.a[1], e.b[0], e.b[1]);
          const d = Math.hypot(x - c.x, z - c.z);
          if (d < best) { best = d; bx = c.x; bz = c.z; }
        }
      }else for(let ri=-1;ri<(o.holes?.length??0);ri++){
        const ring=ri<0?o.poly:o.holes![ri];
        for(let i=0,j=ring.length-1;i<ring.length;j=i++){
          const c=closestOnSeg(x,z,ring[j][0],ring[j][1],ring[i][0],ring[i][1]),d=Math.hypot(x-c.x,z-c.z);
          if(d<best){best=d;bx=c.x;bz=c.z;}
        }
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
    for (const b of this.near(this.barrierGrid, x, z)) {
      const c = closestOnSeg(x, z, b.ax, b.az, b.bx, b.bz);
      const base = b.ay + (b.by - b.ay) * c.t;
      if (y >= base + b.height || y + h <= base) continue;
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
      if (d >= r + b.radius) continue;
      out.push({ id: b.id, kind: 'parapet', nx: d > 1e-6 ? dx / d : b.inwardX, nz: d > 1e-6 ? dz / d : b.inwardZ, depth: r + b.radius - d });
    }
    for (const b of this.near(this.bandGrid, x, z)) {
      const c = closestOnSeg(x, z, b.ax, b.az, b.bx, b.bz);
      if (Math.hypot(x - c.x, z - c.z) > b.halfWidth + r * 0.5) continue;
      const v = this.bandAt(b, c.t);
      // a car standing on / flying over a deck top — or on an adjoining deck at nearly the same height
      // (parallel carriageways of one flyover) — is not hitting its underside
      if (y + h <= v.bottom || y >= v.top - 1.0) continue;
      // vertical overlap with an overhead volume we are not standing on
      out.push({ id: b.id, kind: b.kind, nx: 0, nz: 0, depth: y + h - v.bottom, vertical: 'below' });
    }
    return out;
  }
}

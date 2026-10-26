import * as THREE from 'three';
import { TiledBatch, TPL, rng, hash, Rng } from '../core/util';
import { boardScheme } from './signs';
import { drawPerson, randomPerson } from './people';
import { drawLandmark, inClear, Landmark } from './landmarks';
import { drawExtras, OsmFeature, RoadHit } from './extras';
import { isORR, auxiliaryLane, expresswayBarrierClipper, travelDirection } from './expressway';
import { drawExpresswaySigns, drawRampChevrons } from './expressway-signs';
import { roadQuadHeight, type RoadQuad } from './road-surface';
import { metroCorridors, metroLineColor, metroStationFrame } from './metro-geometry';
import { bridgeSupportSites, roadStructureClearance, type StructureSupport } from './structure-clearance';
import { captureLandmarkBatches } from './landmark-support-capture';
import type { LandmarkSurfaceGrid } from './landmark-support';
import { drawAirfieldTile, airfieldClearAt, type Airfield } from './airfields';
import type { RoadEdge, Building, XZ, Board, Furniture, Area } from './types';
import type { SignSystem } from './signs';
import { resolveSignalSites, type SignalSite } from './signals';

const PALETTE = ['#E8A87C', '#F2D49B', '#9FC7C1', '#C9B6E4', '#F4B6C2', '#E7D7C1', '#B5C99A', '#F1C27D', '#D9CAB3', '#8FB9C9',
  '#E3A6A1', '#F3EFE6', '#C8D6A3', '#E9C46A', '#BFD7EA', '#F0B78F', '#EDE6DA', '#D8CFC0'];
const ROAD_Y: Record<string, number> = { motorway: 0.08, motorway_link: 0.07, trunk_link: 0.068, trunk: 0.075, primary: 0.07, secondary: 0.062, tertiary: 0.055, primary_link: 0.066, secondary_link: 0.06, tertiary_link: 0.052, unclassified: 0.048, residential: 0.045, living_street: 0.042, service: 0.038, unknown: 0.04 };
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link']);
const MOTORWAY = new Set(['motorway', 'motorway_link']);
export const GROUND_H = 4.2, FLOOR_H = 3.2;

export interface Surface { e: RoadEdge | null; i: number; ax: number; az: number; bx: number; bz: number; ya: number; yb: number; hw: number; kind: 'road' | 'deck' | 'pad'; roadQuad?: RoadQuad; paintLift?: number }
// vertical barrier along a line: bottom/top heights at each end. 'kerb' is a soft bump, the rest are solid.
export interface Wall { ax: number; az: number; bx: number; bz: number; y0a: number; y0b: number; y1a: number; y1b: number; kind: 'median' | 'parapet' | 'kerb' | 'rail' }
export interface BusStop { edge: string; s: number; side: 1 | -1; x: number; z: number; hx: number; hz: number }
// one 1 km map tile as exported by the pipeline; roads flagged ctx belong to a neighbour (kerbs/trimming context only)
export interface TileZone { i: number; j: number; roads: (RoadEdge & { ctx?: number })[]; nodes: Record<string, XZ>; buildings: Building[]; boards: Board[]; furniture: Furniture[]; areas: Area[]; osm?: OsmFeature[] }
export interface MetroData { lines: { id: string; color?: string; pts: XZ[] }[]; stations: { id: string; name: string; p: XZ }[]; pillars: { p: XZ; h: number }[]; deckHeight: number }
export interface SignEntry { id: string; text: string; bg: string; fg: string; c: number[]; right: number[]; up: number[]; w: number; h: number }
export interface BuiltBuffers { mat: string; pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array }
export interface Facade { id: string; c: number[]; n: number[]; w: number; top: number; building: string }
export interface WalkPath { pts: XZ[]; edge: string; side: 1 | -1 }
export interface TileBuilt {
  key: string; i: number; j: number; buffers: BuiltBuffers[]; roads: RoadEdge[];
  buildingGrid: Map<string, Building[]>; surfaceGrid: Map<string, Surface[]>; walls: Map<string, Wall[]>; obstacles: Map<string, { x: number; z: number; r: number; top: number }[]>;
  landmarkSurfaceGrid?: LandmarkSurfaceGrid;
  signals: SignalSite[]; lamps: number[][]; busStops: BusStop[]; walkPaths: WalkPath[]; facades: Facade[]; signs: SignEntry[];
  activity: [string, number][];       // shop units per 100 m cell: how busy the street life around a spot should be
  rails: { id: string; pts: XZ[] }[];  // railway main lines touching this tile (for running trains)
  counts: { buildings: number; boards: number; roads: number; verts: number; fillShops: number; inferredSignals: number };
  structureSupports?: StructureSupport[];
}

// Generic shop signs for street frontages where open data names no business: the kind of shop only, never an invented name.
// [text, group, weight on main roads, weight on side/market streets, Telugu text]
const FILL: [string, string, number, number, string?][] = [
  ['TIFFIN CENTRE', 'food', 3, 4, 'టిఫిన్ సెంటర్'], ['TEA & SNACKS', 'food', 2, 3], ['BAKERY', 'food', 3, 2, 'బేకరీ'], ['SWEETS', 'food', 2, 1, 'స్వీట్స్'],
  ['BIRYANI POINT', 'food', 2, 1], ['FAST FOOD', 'food', 2, 2], ['JUICE CENTRE', 'food', 2, 1], ['CHICKEN CENTRE', 'food', 1, 3, 'చికెన్ సెంటర్'],
  ['FAMILY RESTAURANT', 'food', 2, 0.3], ['IRANI CAFE', 'food', 1, 0.5],
  ['KIRANA & GENERAL STORES', 'shop', 2, 6, 'కిరాణా జనరల్ స్టోర్స్'], ['SUPERMARKET', 'shop', 1.5, 1], ['MOBILES', 'shop', 4, 1.5], ['MOBILE REPAIRS', 'shop', 1.5, 1],
  ['ELECTRONICS', 'shop', 2, 0.5], ['ELECTRICALS', 'shop', 1.5, 1], ['HARDWARE & PAINTS', 'shop', 2, 1], ['FANCY STORE', 'shop', 1, 1.5],
  ['XEROX & STATIONERY', 'shop', 1, 2], ['FOOTWEAR', 'shop', 2, 0.6], ['OPTICALS', 'shop', 1.5, 0.4], ['FURNITURE', 'shop', 1.5, 0.3],
  ['STEEL & UTENSILS', 'shop', 1, 0.4], ['FRUITS & VEGETABLES', 'shop', 1, 2, 'కూరగాయలు'], ['MILK CENTRE', 'shop', 0.5, 1.2], ['GIFT ARTICLES', 'shop', 1, 0.4],
  ['FLOUR MILL', 'shop', 0.3, 1],
  ['TEXTILES', 'fashion', 3, 0.6], ['READYMADES', 'fashion', 2, 0.6], ['LADIES TAILOR', 'fashion', 1, 2], ['TAILORS', 'fashion', 0.6, 1.5, 'టైలర్స్'],
  ['SAREE CENTRE', 'fashion', 1.5, 0.4], ['BANGLE STORE', 'fashion', 0.8, 0.6], ['JEWELLERS', 'fashion', 1.5, 0.3],
  ['MEDICAL & GENERAL', 'pharmacy', 3, 2], ['MEDICALS', 'pharmacy', 1, 2, 'మెడికల్స్'],
  ['CLINIC', 'health', 1, 1.2], ['DENTAL CLINIC', 'health', 1, 0.5], ['DIAGNOSTICS', 'health', 1, 0.3],
  ['HAIR SALON', 'service', 2, 2], ['BEAUTY PARLOUR', 'service', 1.5, 1.5], ['LAUNDRY', 'service', 0.6, 1.5], ['PHOTO STUDIO', 'service', 0.8, 0.6],
  ['TRAVELS', 'service', 1, 0.4], ['REAL ESTATE', 'service', 0.8, 0.5], ['COURIER', 'service', 0.6, 0.3], ['TUITIONS', 'education', 0.3, 1],
  ['AUTO SPARES', 'auto', 1.5, 0.3], ['BIKE MECHANIC', 'auto', 1, 1], ['TYRE WORKS', 'auto', 1, 0.3], ['LODGE', 'lodging', 0.5, 0.1],
  ['TO-LET', 'default', 0.5, 0.5],
];
const BIKE_COLS = ['#1d1c22', '#1d1c22', '#b3262b', '#1f4fa8', '#8b8f99', '#e9e6e1', '#2f2d36', '#6b1f2a'];
export interface CityData {
  movingRail?: import('../game/moving-rail').MovingRailBody[];
  group: THREE.Group; signs: SignSystem; lit: THREE.Mesh | null; glow: THREE.Mesh | null;
  buildingGrid: Map<string, Building[]>; surfaceGrid: Map<string, Surface[]>; byBuilding: Map<string, Building>;
  landmarkSurfaceGrid?: LandmarkSurfaceGrid;
  signals: SignalSite[]; lamps: THREE.Vector3[]; bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacles: Map<string, { x: number; z: number; r: number; top: number }[]>;
  centroid: (b: Building) => XZ; theatreFacades: Map<string, { c: THREE.Vector3; n: THREE.Vector3; w: number; top: number; building: Building }>;
  walls: Map<string, Wall[]>; busStops: BusStop[]; walkPaths: { pts: XZ[]; edge: string; side: 1 | -1 }[];
}

// two-way main roads wide enough for four lanes get a raised centre median (with U-turn gaps)
export function hasCentreMedian(e: RoadEdge) {
  const elevated = !!e.elev && Math.max(...e.elev) > 1.2;
  return !e.oneway && !elevated && ['trunk', 'primary', 'secondary'].includes(e.cls) && e.w >= 10.5;
}
function centroid(ring: XZ[]): XZ { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; }
function signedArea(ring: XZ[]) { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
const key = (x: number, z: number, s = 50) => `${Math.floor(x / s)},${Math.floor(z / s)}`;

// Build the geometry and gameplay data of one map tile. Pure data in, plain data out, so it runs in a worker.
export function buildTile(zone: TileZone, opts: { lowQ: boolean; metro?: MetroData; landmarks?: Landmark[]; airfields?:Airfield[] }): TileBuilt {
  const r = rng(20261021 + zone.i * 7919 + zone.j * 104729);
  const T = () => new TiledBatch(500);
  const B = { st: T(), wall: T(), shop: T(), roof: T(), road: T(), foot: T(), lit: T(), glow: T(), park: T(), water: T(), marks: T(), kerb: T() };
  const TX0 = zone.i * 1000, TZ0 = zone.j * 1000;
  const inTile = (x: number, z: number) => x >= TX0 && x < TX0 + 1000 && z >= TZ0 && z < TZ0 + 1000;
  const airClear=(x:number,z:number)=>airfieldClearAt(opts.airfields||[],x,z);
  const ownRoads = zone.roads.filter((e) => !e.ctx), ctxRoads = zone.roads.filter((e) => e.ctx);
  // Overture's ORR edges can span12km. Midpoint ownership would leave most of
  // that carriageway invisible while its distant owner tile is unloaded. Build
  // local segments from the context copy instead, with unique midpoint ownership.
  const localExpressway = (e: RoadEdge) => isORR(e) || !!e.expressway?.ramp;
  const clipExpresswayBarrier = expresswayBarrierClipper(zone.roads);
  const localGrades = new Set(zone.roads.filter(e => localExpressway(e) || e.elev?.some(y => y > .001)).map(e => e.id));
  const renderRoads = ownRoads.concat(ctxRoads.filter(e => localGrades.has(e.id)));
  const ownsRoadPoint = (e: RoadEdge, x: number, z: number) => !localGrades.has(e.id) || inTile(x, z);
  const ctxGrid = new Map<string, Surface[]>();
  const byBuilding = new Map<string, Building>();
  zone.buildings.forEach((b) => byBuilding.set(b.id, b));
  const buildingGrid = new Map<string, Building[]>();
  const surfaceGrid = new Map<string, Surface[]>();
  const landmarkSurfaceGrid: LandmarkSurfaceGrid = new Map();
  const lamps: THREE.Vector3[] = [];
  const obstacles = new Map<string, { x: number; z: number; r: number; top: number }[]>();
  const structureSupports: StructureSupport[] = [], structureClearance = roadStructureClearance(zone.roads);
  const addObstacle = (x: number, z: number, r: number, top: number) => { const k = key(x, z); (obstacles.get(k) || obstacles.set(k, []).get(k)!).push({ x, z, r, top }); };
  const walls = new Map<string, Wall[]>();
  const addWall = (w: Wall) => {
    const L = Math.hypot(w.bx - w.ax, w.bz - w.az), n = Math.max(1, Math.ceil(L / 10)), ks = new Set<string>();
    for (let i = 0; i <= n; i++) ks.add(key(w.ax + (w.bx - w.ax) * (i / n), w.az + (w.bz - w.az) * (i / n), 30));
    for (const k of ks) (walls.get(k) || walls.set(k, []).get(k)!).push(w);
  };
  const busStops: BusStop[] = [];
  const walkPaths: WalkPath[] = [];
  // a road segment's drive surface is listed in every 30 m cell it passes through
  const addSurface = (grid: Map<string, Surface[]>, s: Surface) => {
    const L = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.max(1, Math.ceil(L / 10)), ks = new Set<string>();
    for (let k = 0; k <= n; k++) ks.add(key(s.ax + (s.bx - s.ax) * (k / n), s.az + (s.bz - s.az) * (k / n), 30));
    for (const k of ks) (grid.get(k) || grid.set(k, []).get(k)!).push(s);
  };
  for (const e of ctxRoads) for (let i = 0; i < e.pts.length - 1; i++) {
    addSurface(ctxGrid, { e, i, ax: e.pts[i][0], az: e.pts[i][1], bx: e.pts[i + 1][0], bz: e.pts[i + 1][1], ya: e.elev ? e.elev[i] : 0, yb: e.elev ? e.elev[i + 1] : 0, hw: e.w / 2 + 0.6, kind: 'road' });
  }

  // ---------- parks / water ----------
  const parkPolys: XZ[][] = [], parkInfo: { ring: XZ[]; cls: string; name: string | null }[] = [], waterRings: XZ[][] = [];
  for (const a of zone.areas) {
    const green = a.kind === 'landuse' && /park|grass|garden|recreation|cemetery|meadow|pitch|playground|forest|stadium/.test(`${a.sub} ${a.cls}`);
    if (!green && a.kind !== 'water') continue;
    const pts = a.ring.map((p) => new THREE.Vector2(p[0], p[1]));
    let tris: number[][];
    try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch { continue; }
    const y = a.kind === 'water' ? 0.02 : 0.03;
    const b = a.kind === 'water' ? B.water : B.park;
    const col = a.kind === 'water' ? '#3f6f8f' : (/cemetery/.test(a.cls) ? '#7d8a5a' : '#5f8f45');
    for (const t of tris) { const p0 = a.ring[t[0]], p1 = a.ring[t[1]], p2 = a.ring[t[2]]; b.tri([p0[0], y, p0[1]], [p2[0], y, p2[1]], [p1[0], y, p1[1]], col); }
    if (green) { parkPolys.push(a.ring); parkInfo.push({ ring: a.ring, cls: `${a.sub} ${a.cls}`, name: a.name }); }
    else waterRings.push(a.ring);
  }

  // ---------- roads ----------
  const nodeDeg = new Map<string, { n: number; w: number; elev: number; ow: number }>();
  for (const e of zone.roads) for (const [nid, i] of [[e.from, 0], [e.to, e.pts.length - 1]] as [string | null, number][]) {
    if (!nid) continue;
    const d = nodeDeg.get(nid) || { n: 0, w: 0, elev: 0, ow: 0 };
    d.n++; d.w = Math.max(d.w, e.w); d.elev = Math.max(d.elev, e.elev ? e.elev[i] : 0); d.ow |= e.oneway ? 1 : 2; nodeDeg.set(nid, d);
  }
  // dividers stop short of junctions and of points where a divided road splits from or merges into a two-way one
  const medianTrim = (nid: string | null) => { const d = nid ? nodeDeg.get(nid) : null; return d && (d.n >= 3 || d.ow === 3) ? Math.max(9, d.w * 0.9) : 0; };
  const offsetLine = (pts: XZ[], off: number): XZ[] => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    return [p[0] - dz * off, p[1] + dx * off];          // right of the pts direction for positive offset (x east, z south)
  });
  // footpaths stop short of busy junctions, so walkers wait at the corner instead of strolling across the junction box
  const trimPath = (pts: XZ[], e: RoadEdge): XZ[] => {
    const cut = (nid: string | null) => { const d = nid ? nodeDeg.get(nid) : null; return d && d.n >= 3 ? d.w * 0.6 + 2 : 0; };
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = Math.min(cut(e.from), L * 0.3), b = Math.min(cut(e.to), L * 0.3);
    if (L - a - b < 6) return [];
    const at = (d: number): XZ => { let acc = 0; for (let i = 1; i < pts.length; i++) { const sl = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + sl >= d) { const u = (d - acc) / (sl || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; } acc += sl; } return pts[pts.length - 1]; };
    const out: XZ[] = [at(a)]; let acc = 0;
    for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc > a && acc < L - b) out.push(pts[i]); }
    out.push(at(L - b));
    return out;
  };
  // kerbs, footpaths and lamps are placed after every carriageway exists, so they can stop where another road crosses
  const late: (() => void)[] = [];
  const parapets: { p: XZ; q: XZ; ea: number; eb: number; e: RoadEdge; segment: number }[] = [];
  const near = (x: number, z: number) => { const out: Surface[] = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const k = `${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`; const a = surfaceGrid.get(k), b = ctxGrid.get(k); if (a) out.push(...a); if (b) out.push(...b); } return out; };
  const blocked = (x: number, z: number, own: any, pad = 0.3, hx = 0, hz = 0) => {
    for (const s of near(x, z)) {
      if (s.kind !== 'road' || !s.e || s.e === own) continue;
      const ramp = s.ya > 0.3 || s.yb > 0.3 || (!!s.e?.elev && Math.max(...s.e.elev) > 1.2);   // any piece of a flyover or its ramps: blocks where a car on it would be low
      if (!ramp && (s.ya > 1.2 || s.yb > 1.2)) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      if (!ramp && (hx || hz) && !localExpressway(s.e) && Math.abs(dx * hx + dz * hz) / Math.sqrt(L2) > 0.94) continue;      // parallel ordinary carriageway, not a mapped ramp merge
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      if (ramp && s.ya + (s.yb - s.ya) * t > 2.4) continue;    // the deck passes high over this spot
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.e!.w / 2 + pad) return true;
    }
    return false;
  };
  // the lowest flyover deck passing over a ground spot (its road surface height and the deck segment), or null
  const deckOver = (x: number, z: number, pad = 0.5): { y: number; s: Surface } | null => {
    let best: { y: number; s: Surface } | null = null;
    for (const s of near(x, z)) {
      if (s.kind !== 'road' || !s.e || (s.ya <= 1.2 && s.yb <= 1.2)) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) > s.e.w / 2 + pad) continue;
      const y = s.ya + (s.yb - s.ya) * t;
      if (y > 1.2 && (!best || y < best.y)) best = { y, s };
    }
    return best;
  };
  // the ground carriageway a spot lies on (nearest centreline point and distance), or null
  const onCarriageway = (x: number, z: number): { e: RoadEdge; d: number; cx: number; cz: number; w: number } | null => {
    let best: { e: RoadEdge; d: number; cx: number; cz: number; w: number } | null = null;
    for (const s of near(x, z)) {
      if (s.kind !== 'road' || !s.e || s.ya > 1.2 || s.yb > 1.2 || /footway|path|steps|cycleway|pedestrian/.test(s.e.cls)) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
      const cx = s.ax + dx * t, cz = s.az + dz * t, d = Math.hypot(x - cx, z - cz);
      if (d < s.e.w / 2 - 0.3 && (!best || d < best.d)) best = { e: s.e, d, cx, cz, w: s.e.w };
    }
    return best;
  };
  for (const e of renderRoads) {
    const y0 = ROAD_Y[e.cls] ?? 0.04;
    const elevAt = (i: number) => (e.elev ? e.elev[i] : 0);
    // narrow over-bridges get a deck at least 8.4 m wide between the parapets, so a car can take their bends
    const hw = e.elev && Math.max(...e.elev) > 1.2 ? Math.max(e.w / 2, 4.2) : e.w / 2;
    const extra = auxiliaryLane(e, zone.roads), outer = -travelDirection(e);
    const boundary = (side: number) => e.pts.map((p, i): XZ => {
      const a = e.pts[Math.max(0, i - 1)], b = e.pts[Math.min(e.pts.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const off = side * (hw + (side === outer ? extra[i] : 0));
      return [p[0] - (b[1] - a[1]) / len * off, p[1] + (b[0] - a[0]) / len * off];
    });
    const L = boundary(1), R = boundary(-1);
    const pierSites = new Map<number, ReturnType<typeof bridgeSupportSites>>();
    for (const site of bridgeSupportSites(e)) (pierSites.get(site.i) || pierSites.set(site.i, []).get(site.i)!).push(site);
    const roadQuads: RoadQuad[] = e.pts.slice(1).map((_, i) => [[R[i][0], elevAt(i), R[i][1]], [R[i + 1][0], elevAt(i + 1), R[i + 1][1]], [L[i + 1][0], elevAt(i + 1), L[i + 1][1]], [L[i][0], elevAt(i), L[i][1]]]);
    let v = 0;
    for (let i = 0; i < e.pts.length - 1; i++) {
      const seg = Math.hypot(e.pts[i + 1][0] - e.pts[i][0], e.pts[i + 1][1] - e.pts[i][1]);
      const ya = elevAt(i) + y0, yb = elevAt(i + 1) + y0;
      const v1 = v + seg / 6;
      if (!ownsRoadPoint(e, (e.pts[i][0] + e.pts[i + 1][0]) / 2, (e.pts[i][1] + e.pts[i + 1][1]) / 2)) { v = v1; continue; }
      B.road.quad([R[i][0], ya, R[i][1]], [R[i + 1][0], yb, R[i + 1][1]], [L[i + 1][0], yb, L[i + 1][1]], [L[i][0], ya, L[i][1]], '#ffffff',
        [[0, v], [0, v1], [e.w / 6, v1], [e.w / 6, v]]);
      v = v1;
      // collision/drive surface
      const s: Surface = { e, i, ax: (L[i][0] + R[i][0]) / 2, az: (L[i][1] + R[i][1]) / 2, bx: (L[i + 1][0] + R[i + 1][0]) / 2, bz: (L[i + 1][1] + R[i + 1][1]) / 2, ya: elevAt(i), yb: elevAt(i + 1), hw: hw + (extra[i] + extra[i + 1]) / 4 + 0.6, kind: 'road', roadQuad: roadQuads[i], paintLift: y0 };
      addSurface(surfaceGrid, s);
      // elevated deck: soffit, parapets, piers
      const ea = elevAt(i), eb = elevAt(i + 1);
      if (ea > 1.2 || eb > 1.2) {
        const th = 0.9;
        B.st.quad([L[i][0], ea - th, L[i][1]], [L[i + 1][0], eb - th, L[i + 1][1]], [R[i + 1][0], eb - th, R[i + 1][1]], [R[i][0], ea - th, R[i][1]], '#a9a4b5');
        for (const [S, sgn] of [[L, 1], [R, -1]] as [XZ[], number][]) {
          if (localExpressway(e)) continue; // one clipped visual/collision boundary for mainline AND ramps below
          const p = S[i], q = S[i + 1];
          parapets.push({ p, q, ea, eb, e, segment: i });
          void sgn;
        }
        // Spacing is shared by every bridge class and is independent of source
        // densification. A centre pier is omitted where its body or cap would
        // intersect traffic below, including traffic on another elevated road.
        for (const { x, z, h, hx, hz } of pierSites.get(i) || []) {
          if (!ownsRoadPoint(e, x, z)) continue;
          const footprint = { x, z, r: .8 }, cap = { x, z, hx, hz, hw: Math.min(e.w, 9) / 2, hl: .8 };
          if (!structureClearance.clear(footprint, 0, h) || !structureClearance.clear(cap, h - .7, h)) continue;
          B.st.add(TPL.cyl, x, h / 2, z, 0.75, h, 0.75, '#bdb8c8', { ao: true, aoH: 3 }); addObstacle(x, z, 0.8, h);
          B.st.box(x, h - 0.35, z, Math.min(e.w, 9), 0.7, 1.6, '#c4bfcf', { ry: Math.atan2(hx, hz) });
          structureSupports.push({ source: e.id, part: 'bridge', footprint, bottom: 0, top: h, cap: { footprint: cap, bottom: h - .7, top: h } });
        }
      }
    }
    const elevated = !!e.elev && Math.max(...e.elev) > 1.2;
    const centreMedian = hasCentreMedian(e);
    // lane markings
    if (!opts.lowQ || MAJOR.has(e.cls) || MOTORWAY.has(e.cls)) {
      const dash = (pts: XZ[], col: string, wid: number, on = 3, off = 6) => {
        let acc = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
          const L2 = Math.hypot(bx - ax, bz - az); if (L2 < 0.01) continue;
          const dx = (bx - ax) / L2, dz = (bz - az) / L2, ang = Math.atan2(dx, dz);
          for (let d = 0; d < L2 - 1e-6;) {
            const phase = (acc + d) % (on + off);
            if (off > 0 && phase >= on - 1e-6) { d += on + off - phase; continue; }
            const len = Math.min(off === 0 ? L2 - d : on - phase, L2 - d);
            if (len <= 1e-6) { d += .00001; continue; }
            const mx = ax + dx * (d + len / 2), mz = az + dz * (d + len / 2);
            if (!ownsRoadPoint(e, mx, mz)) { d += len; continue; }
            const x0 = ax + dx * d, z0 = az + dz * d, x1 = ax + dx * (d + len), z1 = az + dz * (d + len), nx = -dz * wid / 2, nz = dx * wid / 2;
            const vertex = (x: number, z: number) => {
              const a = e.pts[i], b = e.pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1];
              const u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1)));
              return [x, (roadQuadHeight(roadQuads[i], x, z) ?? elevAt(i) + (elevAt(i + 1) - elevAt(i)) * u) + y0 + .012, z];
            };
            // Paint is a film following the asphalt triangles, never a row of
            // horizontal boxes protruding from a descending flyover.
            B.marks.quad(vertex(x0 + nx, z0 + nz), vertex(x1 + nx, z1 + nz), vertex(x1 - nx, z1 - nz), vertex(x0 - nx, z0 - nz), col);
            d += len;
          }
          acc += L2;
        }
      };
      if (e.w >= 7.5 && !e.oneway && !centreMedian) dash(e.pts, '#ecebf0', 0.14);
      if (e.oneway && e.w >= 7) {
        // one dashed line between each pair of lanes (ORR and the expressways run four lanes a side)
        const nl = e.expressway?.controlled ? e.expressway.throughLanes : Math.max(2, Math.round(e.w / 3.3));
        for (let k = 1; k < nl; k++) {
          const off = e.expressway?.controlled ? travelDirection(e) * (-hw + (e.expressway.shoulders?.[0] || 0) + k * (e.expressway.laneWidth || 3.5)) : -hw + k * e.w / nl;
          dash(nl === 2 ? e.pts : offsetLine(e.pts, off), '#ecebf0', 0.14, MOTORWAY.has(e.cls) ? 4.5 : 3, MOTORWAY.has(e.cls) ? 7.5 : 6);
        }
      }
      if (MOTORWAY.has(e.cls)) {
        dash(offsetLine(e.pts, (hw - .45) * travelDirection(e)), '#e8c84a', .16, 50, 0);
        dash(isORR(e) ? (outer === -1 ? R : L) : offsetLine(e.pts, -(hw - .45) * travelDirection(e)), '#f4f2f6', .16, 50, 0);
      }
      if (MAJOR.has(e.cls) && e.w >= 9) { dash(offsetLine(e.pts, hw - 0.35), '#d9c25a', 0.12, 50, 0); dash(offsetLine(e.pts, -hw + 0.35), '#d9c25a', 0.12, 50, 0); }
    }
    // ORR and expressways at ground level: steel crash barriers on both sides (open wherever another road joins or
    // crosses), a planted strip along the median side, and lamps on the median side
    if ((!elevated && MOTORWAY.has(e.cls)) || localExpressway(e)) late.push(() => {
      const right = travelDirection(e);            // offsetLine:+ is right of point direction, the median side
      for (const side of [1, -1]) {
        const line = side === 1 ? L : R;
        const median = side === right && !!e.oneway;
        for (let i = 0; i < line.length - 1; i++) {
          const spans = localExpressway(e) ? clipExpresswayBarrier(e, { ax: line[i][0], az: line[i][1], bx: line[i + 1][0], bz: line[i + 1][1], ya: elevAt(i), yb: elevAt(i + 1), segment: i }) :
            [{ ax: line[i][0], az: line[i][1], bx: line[i + 1][0], bz: line[i + 1][1], ya: elevAt(i), yb: elevAt(i + 1) }];
          for (const span of spans) {
            const { ax, az, bx, bz } = span, L2 = Math.hypot(bx - ax, bz - az);
            const n = Math.max(1, Math.round(L2 / 3)); let run = -1;
            const flush = (k: number) => {
              if (run < 0) return;
              const u0 = run / n, u1 = k / n, x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1, ll = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
              if (ll > .05) {
                const ya = span.ya + (span.yb - span.ya) * u0, yb = span.ya + (span.yb - span.ya) * u1;
                B.st.box((x0 + x1) / 2, (ya + yb) / 2 + .62, (z0 + z1) / 2, 0.08, 0.32, Math.hypot(ll, yb - ya), '#b7bcc4', { ry: ang, rx: -Math.atan2(yb - ya, ll) });
                for (let q = 0; q <= Math.floor(ll / 4); q++) { const u = q / Math.max(1, Math.floor(ll / 4)); B.st.box(x0 + (x1 - x0) * u, ya + (yb - ya) * u + .38, z0 + (z1 - z0) * u, .1, .76, .1, '#8f949c'); }
                addWall({ ax: x0, az: z0, bx: x1, bz: z1, y0a: ya - 1, y0b: yb - 1, y1a: ya + .85, y1b: yb + .85, kind: 'median',
                  ...(localExpressway(e) ? { expresswayRoad: e.id } : {}) } as Wall & { expresswayRoad?: string });
              }
              run = -1;
            };
            for (let k = 0; k < n; k++) {
              const u = (k + .5) / n, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
              if (!ownsRoadPoint(e, x, z)) { flush(k); continue; }
              const opening = localExpressway(e) ? false : blocked(x, z, e, .4);
              if (opening) flush(k); else if (run < 0) run = k;
            }
            flush(n);
          }
        }
        // median shrubs and lamps
        if (median && !opts.lowQ) {
          const sl = offsetLine(e.pts, side * (hw + 1.6)); let acc = hash(e.id) % 40;
          for (let i = 0; i < sl.length - 1; i++) {
            const ax = sl[i][0], az = sl[i][1], bx = sl[i + 1][0], bz = sl[i + 1][1], L2 = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
            for (let d = 0; d < L2; d += 7) { const x = ax + (bx - ax) * d / L2, z = az + (bz - az) * d / L2; if (ownsRoadPoint(e, x, z) && elevAt(i) < .1 && !blocked(x, z, e, .6)) B.st.add(TPL.ico0, x, .6, z, .75, .6, .75, ['#4e7d33', '#5c8f3a', '#6fa14a'][Math.floor(d) % 3]); }
            for (let d = 40 - acc; d < L2; d += 40) {
              const x = ax + (bx - ax) * d / L2, z = az + (bz - az) * d / L2;
              if (!ownsRoadPoint(e, x, z) || elevAt(i) > .1) continue;
              if (blocked(x, z, e, 0.8)) continue;
              const ox = -Math.cos(ang) * 1.9 * side, oz = Math.sin(ang) * 1.9 * side;       // arm back over this carriageway
              B.st.add(TPL.cyl6, x, 5, z, 0.11, 10, 0.11, '#8d8899');
              B.st.box(x + ox / 2, 9.95, z + oz / 2, 0.08, 0.08, 1.9, '#8d8899', { ry: ang + Math.PI / 2 });
              B.st.box(x + ox, 9.85, z + oz, 0.75, 0.14, 0.3, '#3c3946', { ry: ang + Math.PI / 2 });
              B.lit.box(x + ox, 9.77, z + oz, 0.6, 0.02, 0.22, '#fff0cc', { ry: ang + Math.PI / 2 });
              B.glow.add(TPL.plane, x + ox * 1.8, y0 + 0.03, z + oz * 1.8, 9, 9, 1, '#ffb066', { rx: -Math.PI / 2 });
              lamps.push(new THREE.Vector3(x + ox, 9.6, z + oz)); addObstacle(x, z, 0.2, 10);
            }
            acc = (acc + L2) % 40;
          }
        }
      }
    });
    // flyover lamps: on the parapet, every ~35 m, arm reaching over the carriageway
    if (elevated && (MAJOR.has(e.cls) || MOTORWAY.has(e.cls))) late.push(() => {
      const sd = e.oneway === 'backward' ? 1 : -1;           // the left parapet in the direction of travel
      const lp = offsetLine(e.pts, sd * (hw + 0.15));
      let acc = hash(e.id) % 35;
      for (let i = 0; i < lp.length - 1; i++) {
        const ax = lp[i][0], az = lp[i][1], bx = lp[i + 1][0], bz = lp[i + 1][1], L2 = Math.hypot(bx - ax, bz - az);
        for (let d = 35 - acc; d < L2; d += 35) {
          const u = d / L2, el = elevAt(i) + (elevAt(i + 1) - elevAt(i)) * u;
          if (el < 3) continue;
          const x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = el + y0 + 0.95, ang = Math.atan2(bx - ax, bz - az);
          if (lamps.some((l) => Math.abs(l.x - x) < 10 && Math.abs(l.z - z) < 10)) continue;
          const ox = Math.cos(ang) * 1.6 * sd, oz = -Math.sin(ang) * 1.6 * sd;     // arm reaches in over the deck
          B.st.add(TPL.cyl6, x, y + 4, z, 0.09, 8, 0.09, '#8d8899');
          B.st.box(x + ox / 2, y + 7.95, z + oz / 2, 0.08, 0.08, 1.6, '#8d8899', { ry: ang + Math.PI / 2 });
          B.st.box(x + ox, y + 7.85, z + oz, 0.7, 0.14, 0.3, '#3c3946', { ry: ang + Math.PI / 2 });
          B.lit.box(x + ox, y + 7.77, z + oz, 0.55, 0.02, 0.22, '#fff0cc', { ry: ang + Math.PI / 2 });
          B.glow.add(TPL.plane, x + ox * 1.6, y - 0.9 + 0.03, z + oz * 1.6, 8, 8, 1, '#ffb066', { rx: -Math.PI / 2 });
          lamps.push(new THREE.Vector3(x + ox, y + 7.6, z + oz));
        }
        acc = (acc + L2) % 35;
      }
    });
    // medians (driver's right on a one-way carriageway) and footpaths with painted kerbstones
    if (!elevated && MAJOR.has(e.cls)) late.push(() => {
      const fwd = e.oneway !== 'forward';   // denied backward => travel forward along pts
      const sideRight = fwd ? 1 : -1;        // offsetLine: positive offset lies to the right of the pts direction
      // painted kerb: one striped strip per unbroken run (stripes come from the kerb texture, 1 m per stripe pair)
      const curb = (pts: XZ[], wid: number, hgt: number, pattern: string[], seg = 1, kind: Wall['kind'] | null = null, uturns = false) => {
        let along = hash(e.id) % 240, dist = 0;
        let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const trimA = kind === 'median' ? medianTrim(e.from) : 0, trimB = kind === 'median' ? medianTrim(e.to) : 0;
        let run: { a: number[]; b: number[]; d0: number; d1: number; ang: number } | null = null;
        const flush = () => {
          if (!run) return;
          const { a, b, d0, d1 } = run; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          const nx = (-dz / L) * wid / 2, nz = (dx / L) * wid / 2;
          const p0 = [a[0] - nx, a[1] - nz], p1 = [b[0] - nx, b[1] - nz], q0 = [a[0] + nx, a[1] + nz], q1 = [b[0] + nx, b[1] + nz];
          const uv = [[d0, 0], [d1, 0], [d1, 1], [d0, 1]];
          B.kerb.quad([p0[0], hgt, p0[1]], [p1[0], hgt, p1[1]], [q1[0], hgt, q1[1]], [q0[0], hgt, q0[1]], pattern[0], uv);
          B.kerb.quad([p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], hgt, p1[1]], [p0[0], hgt, p0[1]], pattern[0], uv);
          B.kerb.quad([q1[0], 0, q1[1]], [q0[0], 0, q0[1]], [q0[0], hgt, q0[1]], [q1[0], hgt, q1[1]], pattern[0], [[d1, 0], [d0, 0], [d0, 1], [d1, 1]]);
          run = null;
        };
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
          const L2 = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.round(L2 / seg));
          for (let k = 0; k < n; k++) {
            const u = (k + 0.5) / n, u0 = k / n, u1 = (k + 1) / n;
            along += L2 / n;
            const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
            const dm = dist + L2 * u;
            const skip = (uturns && along % 240 < 12) || dm < trimA || dm > total - trimB || blocked(ax + (bx - ax) * u, az + (bz - az) * u, e, 0.3, kind === 'median' ? (bx - ax) / (L2 || 1) : 0, kind === 'median' ? (bz - az) / (L2 || 1) : 0);
            if (skip) { flush(); continue; }
            if (!run) run = { a: [x0, z0], b: [x1, z1], d0: dist + L2 * u0, d1: dist + L2 * u1, ang: 0 };
            else { run.b = [x1, z1]; run.d1 = dist + L2 * u1; }
            if (kind) {
              const top = kind === 'kerb' ? hgt : 1.0;
              addWall({ ax: x0, az: z0, bx: x1, bz: z1, y0a: -1, y0b: -1, y1a: top, y1b: top, kind });
            }
          }
          flush();               // runs follow one polyline segment, so bends stay crisp
          dist += L2;
        }
      };
      const footRun = (ax: number, az: number, bx: number, bz: number, L2: number, wid: number) => {
        const n = Math.max(1, Math.round(L2 / 2)), ry = Math.atan2(bx - ax, bz - az);
        let k0 = -1;
        const flush = (k1: number) => {
          if (k0 < 0) return;
          const u0 = k0 / n, u1 = k1 / n, len = L2 * (u1 - u0);
          B.foot.add(TPL.box, ax + (bx - ax) * (u0 + u1) / 2, 0.1, az + (bz - az) * (u0 + u1) / 2, wid, 0.2, len + 0.1, '#ffffff', { ry, uvScale: [0.6, len / 4] });
          k0 = -1;
        };
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          if (blocked(ax + (bx - ax) * u, az + (bz - az) * u, e, 0.6)) flush(k); else if (k0 < 0) k0 = k;
        }
        flush(n);
      };
      if (e.oneway) {
        curb(offsetLine(e.pts, sideRight * (hw + 0.2)), 0.4, 0.42, ['#FFC21A', '#1b1a1f'], 1, 'median');
        if (!opts.lowQ) {
          const fp = offsetLine(e.pts, -sideRight * (hw + 1.2));
          for (let i = 0; i < fp.length - 1; i++) {
            const ax = fp[i][0], az = fp[i][1], bx = fp[i + 1][0], bz = fp[i + 1][1], L2 = Math.hypot(bx - ax, bz - az);
            footRun(ax, az, bx, bz, L2, 2.2);
          }
          curb(offsetLine(e.pts, -sideRight * (hw + 0.1)), 0.22, 0.26, ['#f1eff4', '#232129'], 1, 'kerb');
          { const wp = trimPath(offsetLine(e.pts, -sideRight * (hw + 1.2)), e); if (wp.length >= 2) walkPaths.push({ pts: wp, edge: e.id, side: (-sideRight) as 1 | -1 }); }
        }
      } else if (e.cls !== 'tertiary' || e.w >= 8) {
        if (centreMedian) {
          curb(e.pts, 0.9, 0.36, ['#FFC21A', '#1b1a1f'], 1.2, 'median', true);
          // shrubs in the median
          if (!opts.lowQ) { let acc = hash(e.id + 'm') % 9; for (let i = 0; i < e.pts.length - 1; i++) { const ax = e.pts[i][0], az = e.pts[i][1], bx = e.pts[i + 1][0], bz = e.pts[i + 1][1], L2 = Math.hypot(bx - ax, bz - az); for (let d = 9 - acc; d < L2; d += 9) { const x = ax + (bx - ax) * d / L2, z = az + (bz - az) * d / L2; if (!blocked(x, z, e)) B.st.add(TPL.ico0, x, 0.75, z, 0.45, 0.45, 0.45, ['#4e7d33', '#5c8f3a', '#6fa14a'][Math.floor(d) % 3]); } acc = (acc + L2) % 9; } }
        }
        for (const sgn of [1, -1]) {
          if (opts.lowQ) break;
          const fp = offsetLine(e.pts, sgn * (hw + 1.1));
          for (let i = 0; i < fp.length - 1; i++) {
            const ax = fp[i][0], az = fp[i][1], bx = fp[i + 1][0], bz = fp[i + 1][1], L2 = Math.hypot(bx - ax, bz - az);
            footRun(ax, az, bx, bz, L2, 2.0);
          }
          curb(offsetLine(e.pts, sgn * (hw + 0.05)), 0.2, 0.25, ['#f1eff4', '#232129'], 1, 'kerb');
          { const wp = trimPath(fp, e); if (wp.length >= 2) walkPaths.push({ pts: wp, edge: e.id, side: sgn as 1 | -1 }); }
        }
      }
      // street lamps along major roads, every ~30 m, on the left kerb
      const lp = offsetLine(e.pts, (e.oneway ? sideRight : 1) * (hw + (e.oneway ? 0.2 : 0.4)));
      let acc = hash(e.id) % 30;
      for (let i = 0; i < lp.length - 1; i++) {
        const ax = lp[i][0], az = lp[i][1], bx = lp[i + 1][0], bz = lp[i + 1][1], L2 = Math.hypot(bx - ax, bz - az);
        for (let d = 30 - acc; d < L2; d += 30) {
          const x = ax + (bx - ax) * d / L2, z = az + (bz - az) * d / L2;
          if (blocked(x, z, e, 0.8) || deckOver(x, z, 2)) continue;     // no poles punching up through a flyover
          const ang = Math.atan2(bx - ax, bz - az);
          const ox = Math.cos(ang) * 1.6 * (e.oneway ? -sideRight : -1), oz = -Math.sin(ang) * 1.6 * (e.oneway ? -sideRight : -1);
          B.st.add(TPL.cyl6, x, 4.5, z, 0.09, 9, 0.09, '#8d8899');
          B.st.box(x + ox / 2, 8.95, z + oz / 2, 0.08, 0.08, 1.6, '#8d8899', { ry: ang + Math.PI / 2 });
          B.st.box(x + ox, 8.85, z + oz, 0.7, 0.14, 0.3, '#3c3946', { ry: ang + Math.PI / 2 });
          B.lit.box(x + ox, 8.77, z + oz, 0.55, 0.02, 0.22, '#fff0cc', { ry: ang + Math.PI / 2 });
          B.glow.add(TPL.plane, x + ox * 1.6, y0 + 0.03, z + oz * 1.6, 8, 8, 1, '#ffb066', { rx: -Math.PI / 2 });
          lamps.push(new THREE.Vector3(x + ox, 8.6, z + oz));
        }
        acc = (acc + L2) % 30;
      }
    });
  }
  for (const f of late) f();
  // deck parapets become solid walls, except where another deck or ramp joins (merges stay open)
  for (const pp of parapets) {
    const clipped = clipExpresswayBarrier(pp.e, { ax: pp.p[0], az: pp.p[1], bx: pp.q[0], bz: pp.q[1], ya: pp.ea, yb: pp.eb, segment: pp.segment, bottom: -.9, top: .95 });
    for (const span of clipped) {
      const p = [span.ax, span.az], q = [span.bx, span.bz], ea = span.ya, eb = span.yb;
      const L2 = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(L2 / 2));
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, um = (u0 + u1) / 2;
        const mx = p[0] + (q[0] - p[0]) * um, mz = p[1] + (q[1] - p[1]) * um, my = ea + (eb - ea) * um;
        let merge = false;
        for (const s of near(mx, mz)) {
          if (merge) break;
          if (s.kind !== 'road' || s.e === pp.e || !s.e) continue;
          const shared = [s.e.from, s.e.to].filter((n) => n && (n === pp.e.from || n === pp.e.to));
          if (!shared.length || !shared.some((n) => { const q = zone.nodes[n!]; return q && Math.hypot(q[0] - mx, q[1] - mz) < 45; })) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az, LL = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((mx - s.ax) * dx + (mz - s.az) * dz) / LL));
          if (Math.hypot(mx - s.ax - dx * t, mz - s.az - dz * t) < s.e!.w / 2 - 0.3 && Math.abs(s.ya + (s.yb - s.ya) * t - my) < 1.2) { merge = true; break; }
        }
        if (merge) continue;
        const ya = ea + (eb - ea) * u0, yb = ea + (eb - ea) * u1;
        if (Math.max(ya, yb) < 1.7) continue;      // the foot of a ramp: a car can step off it, so no wall to get caught on
        const ax = p[0] + (q[0] - p[0]) * u0, az = p[1] + (q[1] - p[1]) * u0, bx = p[0] + (q[0] - p[0]) * u1, bz = p[1] + (q[1] - p[1]) * u1;
        B.st.quad([ax, ya - .9, az], [bx, yb - .9, bz], [bx, yb + .95, bz], [ax, ya + .95, az], '#d4d0dc');
        B.st.quad([bx, yb - .9, bz], [ax, ya - .9, az], [ax, ya + .95, az], [bx, yb + .95, bz], '#c4bfcf');
        addWall({ ax, az, bx, bz, y0a: ya - .9, y0b: yb - .9, y1a: ya + .95, y1b: yb + .95, kind: 'parapet' });
      }
    }
  }
  // Shared-level road ends need one real pavement patch, including flyover
  // bends. Rounded collision end-caps used to hide gaps that were never drawn.
  const caps = new Map<string, { e: RoadEdge; i: number; y: number; pts: XZ[] }[]>();
  for (const e of zone.roads) for (const [node, i, j] of [[e.from, 0, 1], [e.to, e.pts.length - 1, e.pts.length - 2]] as [string | null, number, number][]) {
    if (!node || !e.pts[i] || !e.pts[j] || !inTile(...e.pts[i])) continue;
    const p = e.pts[i], q = e.pts[j], length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const width = e.elev?.some(y => y > 1.2) ? Math.max(e.w / 2, 4.2) : e.w / 2, extra = auxiliaryLane(e, zone.roads)[i] || 0, outer = -travelDirection(e);
    const direction = i === 0 ? 1 : -1, dx = (q[0] - p[0]) / length * direction, dz = (q[1] - p[1]) / length * direction;
    const edge = (side: number): XZ => [p[0] - dz * side * (width + (side === outer ? extra : 0)), p[1] + dx * side * (width + (side === outer ? extra : 0))];
    (caps.get(node) || caps.set(node, []).get(node)!).push({ e, i: Math.min(i, e.pts.length - 2), y: e.elev?.[i] || 0, pts: [edge(1), edge(-1)] });
  }
  for (const entries of caps.values()) {
    entries.sort((a, b) => a.y - b.y); const levels: typeof entries[] = [];
    for (const entry of entries) { if (!levels.length || entry.y - levels[levels.length - 1][0].y > .25) levels.push([]); levels[levels.length - 1].push(entry); }
    for (const group of levels) {
      if (group.length < 2) continue;
      const points = group.flatMap(e => e.pts).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (a: XZ, b: XZ, c: XZ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const half = (list: XZ[]) => { const out: XZ[] = []; for (const p of list) { while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-6) out.pop(); out.push(p); } return out; };
      const hull = half(points).slice(0, -1).concat(half(points.slice().reverse()).slice(0, -1)); if (hull.length < 3) continue;
      const x = points.reduce((s, p) => s + p[0], 0) / points.length, z = points.reduce((s, p) => s + p[1], 0) / points.length, y = group.reduce((s, e) => s + e.y, 0) / group.length;
      const lift = Math.max(...group.map(e => ROAD_Y[e.e.cls] || .04));
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length], center: [number, number, number] = [x, y, z];
        B.road.tri([x, y + lift, z], [b[0], y + lift, b[1]], [a[0], y + lift, a[1]], '#ffffff');
        addSurface(surfaceGrid, { e: group[0].e, i: group[0].i, ax: x, az: z, bx: (a[0] + b[0]) / 2, bz: (a[1] + b[1]) / 2, ya: y, yb: y, hw: Math.max(Math.hypot(a[0] - x, a[1] - z), Math.hypot(b[0] - x, b[1] - z)), kind: 'road', roadQuad: [center, [b[0], y, b[1]], [a[0], y, a[1]], [a[0], y, a[1]]], paintLift: lift });
      }
    }
  }

  // ---------- junction arms (shop corners) ----------
  const RANK: Record<string, number> = { trunk: 3, primary: 3, secondary: 2, tertiary: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1 };
  const STREETS = new Set(['residential', 'unclassified', 'unknown', 'living_street']);
  const arms = new Map<string, { p: XZ; ranks: number[]; sig: number[]; ow: boolean[]; dirs: number[]; elev: number }>();
  for (const e of zone.roads) {
    if (/motorway|service|pedestrian|footway|path|track/.test(e.cls) || e.pts.length < 2) continue;
    const n = e.pts.length;
    for (const [nid, a, b, i] of [[e.from, e.pts[0], e.pts[1], 0], [e.to, e.pts[n - 1], e.pts[n - 2], n - 1]] as [string | null, XZ, XZ, number][]) {
      if (!nid) continue;
      const p = zone.nodes[nid] || a;
      const m = arms.get(nid) || arms.set(nid, { p, ranks: [], sig: [], ow: [], dirs: [], elev: 0 }).get(nid)!;
      m.ranks.push(RANK[e.cls] ?? 0); m.sig.push(/_link/.test(e.cls) ? 0 : RANK[e.cls] ?? 0); m.ow.push(!!e.oneway);
      m.dirs.push(Math.atan2(b[1] - a[1], b[0] - a[0])); m.elev = Math.max(m.elev, e.elev ? e.elev[i] : 0);
    }
  }
  const mainJunctions = new Map<string, XZ[]>();
  for (const a of arms.values()) if (a.ranks.length >= 3 && Math.max(...a.ranks) >= 1 && a.elev < 0.5) (mainJunctions.get(key(a.p[0], a.p[1], 60)) || mainJunctions.set(key(a.p[0], a.p[1], 60), []).get(key(a.p[0], a.p[1], 60))!).push(a.p);
  const junctionNear = (x: number, z: number, R: number) => {
    const cx = Math.floor(x / 60), cz = Math.floor(z / 60);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of mainJunctions.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(p[0] - x, p[1] - z) < R) return true;
    return false;
  };

  // ---------- shop frontage: ground floors facing a road become shops where Hyderabad streets have them ----------
  const NOSHOP = /industrial|school|college|university|military|hospital|railway|religious|cemetery|grave_yard|farmland|construction|stadium|aerodrome|prison|pitch/;
  const noShop = zone.areas.filter((a) => a.kind === 'landuse' && NOSHOP.test(a.cls)).map((a) => {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of a.ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    return { ring: a.ring, minx, maxx, minz, maxz, soft: a.cls === 'industrial' };
  });
  const areaRule = (x: number, z: number) => { let r = 0; for (const a of noShop) if (x >= a.minx && x <= a.maxx && z >= a.minz && z <= a.maxz && pointInRing(x, z, a.ring)) { if (!a.soft) return 2; r = 1; } return r; };
  const realCells = new Map<string, number>(); const groupCount: Record<string, number> = {};
  const activity = new Map<string, number>();
  const addActivity = (x: number, z: number, n: number) => { const k = key(x, z, 100); activity.set(k, (activity.get(k) || 0) + n); };
  for (const bd of zone.boards) if (!bd.slot || !bd.slot.floor) {
    const k = key(bd.a[0], bd.a[1], 30); realCells.set(k, (realCells.get(k) || 0) + 1); groupCount[bd.group] = (groupCount[bd.group] || 0) + 1;
    if (inTile(bd.a[0], bd.a[1])) addActivity(bd.a[0], bd.a[1], 1);
  }
  const realNear = (x: number, z: number) => { let n = 0; const cx = Math.floor(x / 30), cz = Math.floor(z / 30); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += realCells.get(`${cx + i},${cz + j}`) || 0; return n; };
  const realTotal = Object.values(groupCount).reduce((a, b) => a + b, 0) || 1;
  // shop-kind weights lean towards what the real shops of this tile sell
  const fillPick = (s: Rng, main: boolean): [string, string] => {
    let tot = 0; const w = FILL.map((f) => { const v = (main ? f[2] : f[3]) * (1 + 2 * (groupCount[f[1]] || 0) / realTotal); tot += v; return v; });
    let x = s() * tot, k = 0; for (; k < FILL.length - 1; k++) { x -= w[k]; if (x <= 0) break; }
    const f = FILL[k];
    return [f[4] && s() < 0.14 ? f[4] : f[0], f[1]];
  };
  interface Front { i: number; e: RoadEdge; d: number; nx: number; nz: number; rank: number; market: boolean }
  // footprints by 30 m cell, so a front can check that no other building stands between it and the road
  const footGrid = new Map<string, { id: string; ring: XZ[]; minx: number; maxx: number; minz: number; maxz: number }[]>();
  for (const b of zone.buildings) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of b.ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    if (Math.abs(signedArea(b.ring)) < 30) continue;          // sheds and kiosks in front of a shop don't hide it
    const f = { id: b.id, ring: b.ring, minx, maxx, minz, maxz };
    for (let i = Math.floor(minx / 30); i <= Math.floor(maxx / 30); i++) for (let j = Math.floor(minz / 30); j <= Math.floor(maxz / 30); j++) (footGrid.get(`${i},${j}`) || footGrid.set(`${i},${j}`, []).get(`${i},${j}`)!).push(f);
  }
  const occluded = (self: string, ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / 2));
    for (let k = 1; k < n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      for (const f of footGrid.get(`${Math.floor(x / 30)},${Math.floor(z / 30)}`) || []) {
        if (f.id !== self && x >= f.minx && x <= f.maxx && z >= f.minz && z <= f.maxz && pointInRing(x, z, f.ring)) return true;
      }
    }
    return false;
  };
  // ring edges that look straight onto a carriageway (parallel, facing it, within a shop-front's distance)
  const frontsOf = (self: string, ring: XZ[], cx: number, cz: number): Front[] => {
    const out: Front[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 3) continue;
      const ex = (q[0] - p[0]) / len, ez = (q[1] - p[1]) / len;
      let nx = ez, nz = -ex; const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      let best: Front | null = null, bs = 1e9, bp: XZ = [0, 0];
      for (const s of near(mx, mz)) {
        if (s.kind !== 'road' || !s.e || s.ya > 1.2 || s.yb > 1.2) continue;
        const rank = RANK[s.e.cls]; if (rank === undefined && !STREETS.has(s.e.cls)) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az, L = Math.hypot(dx, dz) || 1;
        if (Math.abs((dx * ex + dz * ez) / L) < 0.82) continue;
        const t = Math.max(0, Math.min(1, ((mx - s.ax) * dx + (mz - s.az) * dz) / (L * L)));
        const px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(px - mx, pz - mz);
        if (d > s.e.w / 2 + (rank ? 24 : 14) || d < 0.5) continue;   // main-road shops may sit behind a forecourt
        if (((px - mx) * nx + (pz - mz) * nz) / d < 0.6) continue;
        const sc = d - (rank || 0) * 5;
        if (sc < bs) { bs = sc; best = { i, e: s.e, d, nx, nz, rank: rank || 0, market: false }; bp = [px, pz]; }
      }
      if (best && !occluded(self, mx + nx * 0.6, mz + nz * 0.6, bp[0], bp[1])) out.push(best);
    }
    return out;
  };
  const unitsByEdge = new Map<string, number>();
  let fillShops = 0, bikesLeft = opts.lowQ ? 0 : 260, cartsLeft = opts.lowQ ? 0 : 20;
  const up0 = new THREE.Vector3(0, 1, 0);
  const signs: SignEntry[] = [];
  // a ground-floor board with its frame and awning, centred at (x, z) on a face with outward normal (nx, nz)
  const groundBoard = (id: string, text: string, group: string, x: number, z: number, ex: number, ez: number, nx: number, nz: number, w: number, h: number) => {
    const n = new THREE.Vector3(nx, 0, nz), right = new THREE.Vector3(ex, 0, ez);
    if (new THREE.Vector3().crossVectors(right, up0).dot(n) < 0) right.negate();
    const hh = 0.95, y = Math.min(3.55, h - 0.6), ry = Math.atan2(nx, nz);
    const c = new THREE.Vector3(x, y, z).addScaledVector(n, 0.24);
    const [bg, fg] = boardScheme(id, group);
    // flat board (one quad, kept light: there are thousands of these per km in busy areas); the atlas text sits just in front
    const rx = right.x * (w / 2 + 0.06), rz = right.z * (w / 2 + 0.06), y0 = c.y - hh / 2 - 0.06, y1 = c.y + hh / 2 + 0.06;
    B.st.quad([c.x - rx, y0, c.z - rz], [c.x + rx, y0, c.z + rz], [c.x + rx, y1, c.z + rz], [c.x - rx, y1, c.z - rz], bg);
    const cc = c.clone().addScaledVector(n, 0.02);
    signs.push({ id, text, bg, fg, c: [cc.x, cc.y, cc.z], right: [right.x, right.y, right.z], up: [0, 1, 0], w, h: hh });
    if (hash(id) % 3 === 0) B.st.box(c.x + n.x * 0.55, 2.95, c.z + n.z * 0.55, w, 0.08, 1.1, ['#E8413A', '#1F5FCC', '#22B573', '#FFB627'][hash(id + 'a') % 4], { ry });
  };
  // a parked two-wheeler, nose towards heading ang (atan2(dx, dz))
  const bike = (x: number, z: number, ang: number, s: Rng) => {
    const col = s.pick(BIKE_COLS), fx = Math.sin(ang), fz = Math.cos(ang);
    for (const k of [0.62, -0.62]) B.st.add(TPL.cyl6, x + fx * k, 0.3, z + fz * k, 0.3, 0.09, 0.3, '#18171c', { rz: Math.PI / 2, ry: ang });
    B.st.box(x, 0.6, z, 0.3, 0.36, 1.05, col, { ry: ang });
    B.st.box(x - fx * 0.18, 0.84, z - fz * 0.18, 0.3, 0.1, 0.62, '#151418', { ry: ang });
    B.st.box(x + fx * 0.5, 0.95, z + fz * 0.5, 0.08, 0.55, 0.12, col, { ry: ang, rx: -0.35 });
    B.st.box(x + fx * 0.58, 1.18, z + fz * 0.58, 0.68, 0.05, 0.05, '#2a2930', { ry: ang });
    addObstacle(x, z, 0.5, 1.1);
  };

  // ---------- buildings ----------
  const shopBuildings = new Set(zone.boards.filter((b) => b.slot && b.slot.floor === 0).map((b) => b.building));
  const theatreIds = new Set<string>();
  const facades: Facade[] = [];
  const ownsLandmark = (l: Landmark) => l.renderTile ? l.renderTile[0] * 1000 === TX0 && l.renderTile[1] * 1000 === TZ0 : inTile(l.x!, l.z!);
  const marks = (opts.landmarks || []).filter((l) => ownsLandmark(l) || (Math.abs(l.x! - (TX0 + 500)) < 950 && Math.abs(l.z! - (TZ0 + 500)) < 950));
  // how built-up each 50 m cell's surroundings are (footprint share of a 250 m square): villages and outskirts get
  // their own look (sheet roofs, compound walls, fields between the houses)
  const covCell = new Map<string, number>();
  for (const b of zone.buildings) { const [x, z] = centroid(b.ring); const k = `${Math.floor(x / 50)},${Math.floor(z / 50)}`; covCell.set(k, (covCell.get(k) || 0) + Math.abs(signedArea(b.ring))); }
  const coverAt = (x: number, z: number) => { const i = Math.floor(x / 50), j = Math.floor(z / 50); let a = 0; for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) a += covCell.get(`${i + di},${j + dj}`) || 0; return a / 62500; };
  const inFoot = (x: number, z: number, self: string | null, pad = 0) => {
    for (const f of footGrid.get(`${Math.floor(x / 30)},${Math.floor(z / 30)}`) || []) if (f.id !== self && x >= f.minx - pad && x <= f.maxx + pad && z >= f.minz - pad && z <= f.maxz + pad && (pad > 0 || pointInRing(x, z, f.ring))) return true;
    return false;
  };
  for (const b of zone.buildings) {
    if (marks.length) { const [mx, mz] = centroid(b.ring); if (marks.some((l) => inClear(l, mx, mz))) continue; }
    {const[mx,mz]=centroid(b.ring);if(airClear(mx,mz))continue;}
    let ring = b.ring.slice();
    if (ring.length < 3) continue;
    if (signedArea(ring) > 0) ring = ring.reverse();     // consistent winding (clockwise in x/z) => outward normals below
    const [cx, cz] = centroid(ring);
    for (const k of new Set(ring.map((p) => key(p[0], p[1])))) (buildingGrid.get(k) || buildingGrid.set(k, []).get(k)!).push(b);
    const br = rng(hash(b.id));
    const col = new THREE.Color(b.fc && /^#/.test(b.fc) ? b.fc : br.pick(PALETTE)).multiplyScalar(br.range(0.86, 1.04));
    const h = b.h;
    const shop = shopBuildings.has(b.id) && h > GROUND_H + 1;
    // frontages: real shops get forecourt life; other buildings on shop streets get generic shop units
    const area0 = Math.abs(signedArea(ring));
    const fr = rng(hash(b.id + 'f'));
    const fill = new Map<number, Front>();
    let fronts: Front[] = [];
    if (h > GROUND_H + 1 && area0 >= 20 && area0 <= 4000 && h <= 45 && b.hs !== 'model' && inTile(cx, cz)) {
      fronts = frontsOf(b.id, ring, cx, cz);
      const rule = fronts.length ? areaRule(cx, cz) : 0;
      if (!shop && rule < 2) for (const f of fronts) {
        const p = ring[f.i], q = ring[(f.i + 1) % ring.length], mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        const rn = f.rank ? 0 : realNear(mx, mz);
        f.market = rn >= 4;                         // named shops all around this spot: a market lane
        let pr = f.rank >= 3 ? 0.9 : f.rank === 2 ? 0.85 : f.rank === 1 ? 0.72 : f.market ? 0.75 : junctionNear(mx, mz, 35) ? 0.45 : 0.04;
        if (rule === 1) pr *= 0.35;
        if (fr.chance(pr)) fill.set(f.i, f);
      }
    }
    const cov = coverAt(cx, cz), village = cov < 0.09, suburb = cov < 0.2;
    // oriented box of the footprint (longest edge direction): sheet roofs and compound walls are laid out on it
    let ox = 1, oz = 0, bestL = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], l = Math.hypot(q[0] - p[0], q[1] - p[1]); if (l > bestL) { bestL = l; ox = (q[0] - p[0]) / l; oz = (q[1] - p[1]) / l; } }
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of ring) { const u = (p[0] - cx) * ox + (p[1] - cz) * oz, v = -(p[0] - cx) * oz + (p[1] - cz) * ox; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const OB = (u: number, v: number): XZ => [cx + u * ox - v * oz, cz + u * oz + v * ox];
    const boxFill = area0 / Math.max(1, (u1 - u0) * (v1 - v0));
    const sheet = !opts.lowQ && suburb && h < 5 && area0 >= 18 && area0 <= 220 && boxFill > 0.85 && !shop && !fill.size && br.chance(village ? 0.38 : 0.18);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.05) continue;
      if (shop || fill.has(i)) {
        B.shop.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], GROUND_H, q[1]], [p[0], GROUND_H, p[1]], col, [[0, 0], [len / 16, 0], [len / 16, 1], [0, 1]]);
        const v0 = 0, v1 = (h - GROUND_H) / (FLOOR_H * 4);
        B.wall.quad([p[0], GROUND_H, p[1]], [q[0], GROUND_H, q[1]], [q[0], h, q[1]], [p[0], h, p[1]], col, [[0, v0], [len / 12, v0], [len / 12, v1], [0, v1]]);
      } else {
        const v1 = h / (FLOOR_H * 4);
        B.wall.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h, q[1]], [p[0], h, p[1]], col, [[0, 0.02], [len / 12, 0.02], [len / 12, v1], [0, v1]]);
      }
      if (h > 3 && !opts.lowQ && !sheet) B.st.quad([p[0], h, p[1]], [q[0], h, q[1]], [q[0], h + 0.9, q[1]], [p[0], h + 0.9, p[1]], col.clone().multiplyScalar(0.92));
    }
    // shop units along the frontage: pillars between shutters, generic boards, parked bikes, carts (customers are the walkers)
    const shopFronts = shop ? fronts : [...fill.values()];
    const recent: string[] = [];
    for (const f of shopFronts) {
      const p = ring[f.i], q = ring[(f.i + 1) % ring.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]), ex = (q[0] - p[0]) / len, ez = (q[1] - p[1]) / len;
      const nU = Math.max(1, Math.round(len / fr.range(3.6, 5.4))), uw = len / nU, ang = Math.atan2(f.nx, f.nz);
      const lane = MAJOR.has(f.e.cls) ? 2.3 : 1.2;                // footpath / walking strip next to the carriageway
      const yard = f.d - f.e.w / 2 - lane - 0.4;                  // forecourt left in front of the shutters
      const pillarCol = col.clone().multiplyScalar(0.8);
      for (let u = 0; u < nU; u++) {
        const ux = p[0] + ex * uw * (u + 0.5), uz = p[1] + ez * uw * (u + 0.5);
        addActivity(ux, uz, 1);
        unitsByEdge.set(f.e.id, (unitsByEdge.get(f.e.id) || 0) + 1);
        if (!shop) {
          fillShops++;
          if (u > 0) {                                         // pillar between two shutters (front face only)
            const x = p[0] + ex * uw * u + f.nx * 0.06, z = p[1] + ez * uw * u + f.nz * 0.06, hx = ex * 0.17, hz = ez * 0.17;
            B.st.quad([x - hx, 0, z - hz], [x + hx, 0, z + hz], [x + hx, GROUND_H, z + hz], [x - hx, GROUND_H, z - hz], pillarCol);
          }
          if (uw >= 2.2 && fr.chance(f.rank ? 0.82 : 0.7)) {
            let [text, group] = fillPick(fr, f.rank >= 1);
            for (let t = 0; t < 3 && recent.includes(text); t++) [text, group] = fillPick(fr, f.rank >= 1);   // neighbours sell different things
            recent.push(text); if (recent.length > 3) recent.shift();
            groundBoard(`f_${b.id}_${f.i}_${u}`, text, group, ux, uz, ex, ez, f.nx, f.nz, Math.max(1.4, Math.min(uw - 0.35, 6.4)), h);
          }
        }
        if (opts.lowQ) continue;
        if (yard >= 2.2 && bikesLeft > 0 && fr.chance(f.rank >= 2 || f.market ? 0.42 : 0.3)) {
          const k = fr.int(1, f.rank >= 2 || f.market ? 4 : 2), off = 0.4 + 0.95;
          for (let j = 0; j < k && bikesLeft > 0; j++, bikesLeft--) {
            const along = (j - (k - 1) / 2) * 0.85;
            if (Math.abs(along) > uw / 2) continue;
            bike(ux + ex * along + f.nx * off, uz + ez * along + f.nz * off, ang + Math.PI + fr.range(-0.15, 0.15), fr);
          }
        } else if (yard >= 3.0 && cartsLeft > 0 && fr.chance(0.06)) {
          cartsLeft--;
          const x = ux + f.nx * 1.6, z = uz + f.nz * 1.6;
          bandi(B.st, B.lit, x, z, Math.atan2(ex, ez), rng(hash(b.id + 'c' + u)));
          addObstacle(x, z, 1.1, 3);
        }
      }
    }
    // roof: a corrugated sheet gable on some village houses, otherwise flat RCC
    if (sheet) {
      const sc = new THREE.Color(br.pick(['#8e9499', '#7c8a96', '#a0522d', '#9b4a35', '#6f7f8f', '#b0a89a'])), ov = 0.35, rise = Math.min(1.4, (v1 - v0) * 0.28);
      const a0 = OB(u0 - ov, v0 - ov), a1 = OB(u1 + ov, v0 - ov), b0 = OB(u0 - ov, v1 + ov), b1 = OB(u1 + ov, v1 + ov), m0 = OB(u0 - ov, (v0 + v1) / 2), m1 = OB(u1 + ov, (v0 + v1) / 2);
      const y0 = h - 0.1, yr = h + rise;
      B.roof.quad([a0[0], y0, a0[1]], [m0[0], yr, m0[1]], [m1[0], yr, m1[1]], [a1[0], y0, a1[1]], sc);
      B.roof.quad([b1[0], y0, b1[1]], [m1[0], yr, m1[1]], [m0[0], yr, m0[1]], [b0[0], y0, b0[1]], sc.clone().multiplyScalar(0.86));
      const g0 = OB(u0, v0), g1 = OB(u0, v1), gm = OB(u0, (v0 + v1) / 2), k0 = OB(u1, v0), k1 = OB(u1, v1), km = OB(u1, (v0 + v1) / 2);
      B.wall.tri([g1[0], h, g1[1]], [gm[0], yr - 0.05, gm[1]], [g0[0], h, g0[1]], col);
      B.wall.tri([k0[0], h, k0[1]], [km[0], yr - 0.05, km[1]], [k1[0], h, k1[1]], col);
    } else try {
      const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []);
      const rc = b.rc && /^#/.test(b.rc) ? b.rc : br.pick(['#9c968f', '#a8a29a', '#8f8a84', '#b3aca2', '#7f7a74']);
      for (const t of tris) { const a = ring[t[0]], c = ring[t[1]], d = ring[t[2]]; B.roof.tri([a[0], h + 0.02, a[1]], [d[0], h + 0.02, d[1]], [c[0], h + 0.02, c[1]], rc); }
    } catch { /* degenerate footprint */ }
    // rooftop clutter: black water tanks, stair rooms, rebar
    const area = Math.abs(signedArea(ring));
    // compound wall round outskirts houses with room around them, gate gap towards the nearest street
    if (!opts.lowQ && suburb && h < 9 && area0 >= 25 && area0 <= 320 && inTile(cx, cz) && br.chance(village ? 0.6 : 0.35)) {
      const gap = 2.2 + br.range(0, 1.4), wallH = br.range(1.3, 1.8), wc = new THREE.Color(br.pick(['#d9d2c3', '#cfc6b4', '#e4dccb', '#c9b9a0'])).lerp(col, 0.25);
      let gs = -1, gbest = 1e9;     // which side faces the street
      for (let sd = 0; sd < 4; sd++) {
        const m = sd === 0 ? OB((u0 + u1) / 2, v0 - gap - 4) : sd === 1 ? OB(u1 + gap + 4, (v0 + v1) / 2) : sd === 2 ? OB((u0 + u1) / 2, v1 + gap + 4) : OB(u0 - gap - 4, (v0 + v1) / 2);
        for (const sf of near(m[0], m[1])) { if (sf.kind !== 'road' || !sf.e || sf.ya > 1.2) continue; const dx = sf.bx - sf.ax, dz = sf.bz - sf.az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((m[0] - sf.ax) * dx + (m[1] - sf.az) * dz) / L2)); const d = Math.hypot(m[0] - sf.ax - dx * t, m[1] - sf.az - dz * t) - sf.e.w / 2; if (d < gbest) { gbest = d; gs = sd; } }
      }
      const corners: [number, number][] = [[u0 - gap, v0 - gap], [u1 + gap, v0 - gap], [u1 + gap, v1 + gap], [u0 - gap, v1 + gap]];
      for (let sd = 0; sd < 4; sd++) {
        const [ua, va] = corners[sd], [ub, vb] = corners[(sd + 1) % 4], L = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(L / 1.0));
        let run = -1;
        const flush = (k: number) => {
          if (run < 0) return;
          const A = OB(ua + (ub - ua) * run / n, va + (vb - va) * run / n), Bq = OB(ua + (ub - ua) * k / n, va + (vb - va) * k / n), ll = Math.hypot(Bq[0] - A[0], Bq[1] - A[1]);
          if (ll > 0.6) {
            B.st.box((A[0] + Bq[0]) / 2, wallH / 2, (A[1] + Bq[1]) / 2, 0.22, wallH, ll + 0.22, wc, { ry: Math.atan2(Bq[0] - A[0], Bq[1] - A[1]) });
            addWall({ ax: A[0], az: A[1], bx: Bq[0], bz: Bq[1], y0a: -1, y0b: -1, y1a: wallH, y1b: wallH, kind: 'median' });
          }
          run = -1;
        };
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, P = OB(ua + (ub - ua) * t, va + (vb - va) * t);
          const gate = sd === gs && Math.abs(t - 0.5) * L < 1.6;
          if (gate || blocked(P[0], P[1], null, 0.8) || inFoot(P[0], P[1], b.id) || !inTile(P[0], P[1])) flush(k); else if (run < 0) run = k;
        }
        flush(n);
      }
    }
    if (!opts.lowQ && area > 50 && !sheet) {
      if (br.chance(0.5)) {
        const n = br.int(1, area > 300 ? 2 : 1);
        for (let k = 0; k < n; k++) {
          const tx = cx + br.range(-2, 2), tz = cz + br.range(-2, 2);
          B.st.add(TPL.cyl6, tx, h + 0.95, tz, 0.62, 1.3, 0.62, '#1d1d22');      // black Sintex tank on the roof
        }
      }
      if (area > 120 && br.chance(0.45)) B.st.box(cx + br.range(-3, 3), h + 1.3, cz + br.range(-3, 3), 2.6, 2.6, 2.8, col.clone().multiplyScalar(0.9), { ao: true, aoBase: h, aoH: 1.5 });
      if (br.chance(0.08)) for (let k = 0; k < 3; k++) B.st.box(cx + br.range(-3, 3), h + 0.8, cz + br.range(-3, 3), 0.06, 1.6, 0.06, '#6b3d2a');
    }
    void cz; void theatreIds;
  }

  // ---------- boards ----------
  const up = up0;
  for (const bd of zone.boards) {
    const bld = byBuilding.get(bd.building);
    const ax = bd.a[0], az = bd.a[1], bx = bd.b[0], bz = bd.b[1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 1.5) continue;
    const dir = new THREE.Vector3((bx - ax) / len, 0, (bz - az) / len);
    let n = new THREE.Vector3(dir.z, 0, -dir.x);
    if (bld) { const [cx, cz] = centroid(bld.ring); const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (n.x * (mx - cx) + n.z * (mz - cz) < 0) n.negate(); }
    const sl = bd.slot || { floor: 0, index: 0, of: 1 };
    const of = Math.max(1, sl.of);
    const u = of > 1 ? (sl.index + 0.5) / of : bd.t;
    const floor = sl.floor || 0;
    const h = bld ? bld.h : 9;
    let w = Math.max(1.4, Math.min(len / of - 0.35, floor ? 3.6 : 6.4));
    let hh = floor ? 0.7 : 0.95;
    let y = floor ? GROUND_H + (floor - 1) * FLOOR_H + 2.75 : 3.55;
    if (y + hh / 2 > h - 0.2) { if (floor) continue; y = Math.min(y, h - 0.6); }
    const c = new THREE.Vector3(ax + (bx - ax) * u, y, az + (bz - az) * u).addScaledVector(n, floor ? 0.08 : 0.24);
    const right = dir.clone(); if (new THREE.Vector3().crossVectors(right, up).dot(n) < 0) right.negate();
    const [bg, fg] = boardScheme(bd.id, bd.group);
    // frame / backing visible from any distance
    B.st.box(c.x - n.x * 0.06, c.y, c.z - n.z * 0.06, w + 0.12, hh + 0.12, 0.1, '#1a1820', { ry: Math.atan2(n.x, n.z) });
    B.st.box(c.x + n.x * 0.005, c.y, c.z + n.z * 0.005, w, hh, 0.02, bg, { ry: Math.atan2(n.x, n.z) });
    const cc = c.clone().addScaledVector(n, 0.02);
    signs.push({ id: bd.id, text: bd.text, bg, fg, c: [cc.x, cc.y, cc.z], right: [right.x, right.y, right.z], up: [0, 1, 0], w, h: hh });
    if (!floor) {
      // awning or ledge below ground boards for depth
      if (hash(bd.id) % 3 === 0) B.st.box(c.x + n.x * 0.55, 2.95, c.z + n.z * 0.55, w, 0.08, 1.1, ['#E8413A', '#1F5FCC', '#22B573', '#FFB627'][hash(bd.id + 'a') % 4], { ry: Math.atan2(n.x, n.z) });
      else B.st.box(c.x + n.x * 0.3, 3.0, c.z + n.z * 0.3, w + 0.2, 0.12, 0.6, '#7b7480', { ry: Math.atan2(n.x, n.z) });
    }
    if (!floor && !opts.lowQ) {
      const hh2 = hash(bd.id + 'p');
      if (['food', 'shop', 'fashion', 'pharmacy', 'cinema'].includes(bd.group) && hh2 % 8 === 0) {
        const pr = rng(hh2);
        for (let k = 0; k < 1; k++) person(B.st, c.x + n.x * pr.range(1.2, 2.8) + right.x * pr.range(-1.5, 1.5), c.z + n.z * pr.range(1.2, 2.8) + right.z * pr.range(-1.5, 1.5), pr);
      }
      if (bd.group === 'food' && hh2 % 7 === 1) bandi(B.st, B.lit, c.x + n.x * 4.2, c.z + n.z * 4.2, Math.atan2(right.x, right.z), rng(hh2 + 1));
    }
    if (bd.group === 'cinema' && bld) facades.push({ id: bd.id, c: [ax + (bx - ax) * 0.5, 0, az + (bz - az) * 0.5], n: [n.x, n.y, n.z], w: Math.min(len * 0.9, 24), top: h, building: bld.id });
  }

  // ---------- street furniture ----------
  // Only mapped controls become signals. Geometry estimates where to place
  // heads/stop bars, while the original source point and IDs remain attached.
  const signals = resolveSignalSites(zone.roads, zone.furniture).sites.filter(s => inTile(...s.p));
  const inferredSignals = 0;
  for (const site of signals) for (const a of site.approaches) {
    const [x, y, z] = a.pole, face = Math.atan2(-a.hx, -a.hz);
    B.st.box(x, y + 2.9, z, .18, 5.8, .18, '#2f2d36');
    B.st.box(x, y + 5.3, z, .5, 1.25, .4, '#141317', { ry: face });
    if (y <= 1.5) addObstacle(x, z, .12, y + 5.8);
    else addWall({ ax: x - .12, az: z, bx: x + .12, bz: z, y0a: y, y0b: y, y1a: y + 5.8, y1b: y + 5.8, kind: 'rail' });
    // The white stop bar and NPC nose use this same approach stop position.
    const paint = a.paint.map(p => [p[0], p[1] + .11, p[2]]);
    B.marks.quad(paint[0], paint[3], paint[2], paint[1], '#f4f1db');
  }
  // market streets (side streets lined with shops) get walking strips along their edges for the crowds
  if (!opts.lowQ) for (const e of ownRoads) {
    if (!STREETS.has(e.cls) || (e.elev && Math.max(...e.elev) > 1.2) || (unitsByEdge.get(e.id) || 0) < 3) continue;
    for (const sgn of [1, -1] as (1 | -1)[]) { const wp = trimPath(offsetLine(e.pts, sgn * (e.w / 2 + 0.7)), e); if (wp.length >= 2) walkPaths.push({ pts: wp, edge: e.id, side: sgn }); }
  }
  for (const f of zone.furniture) {
    const [x, z] = f.p;
    const over = deckOver(x, z, 1.5), road = onCarriageway(x, z);
    if (f.kind === 'bus_stop' || f.kind === 'bus_station') {
      // snap the shelter to the kerb of the nearest street, facing the road
      let best: { d: number; e: RoadEdge; i: number; t: number } | null = null;
      for (const sf of near(x, z)) {
        if (sf.kind !== 'road' || sf.ya > 0.5 || sf.yb > 0.5 || !sf.e || ['service', 'living_street'].includes(sf.e.cls)) continue;
        const dx = sf.bx - sf.ax, dz = sf.bz - sf.az, LL = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - sf.ax) * dx + (z - sf.az) * dz) / LL));
        const d = Math.hypot(x - sf.ax - dx * t, z - sf.az - dz * t);
        if (!best || d < best.d) best = { d, e: sf.e, i: sf.i, t };
      }
      if (!best || best.d > 30) continue;
      const e = best.e, a = e.pts[best.i], b2 = e.pts[best.i + 1];
      const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]) || 1, hx = (b2[0] - a[0]) / L, hz = (b2[1] - a[1]) / L;
      const cx = a[0] + (b2[0] - a[0]) * best.t, cz = a[1] + (b2[1] - a[1]) * best.t;
      const side: 1 | -1 = (x - cx) * hz + (z - cz) * -hx >= 0 ? 1 : -1;          // left of the edge direction = (hz, -hx)
      const lx = hz * side, lz = -hx * side;
      const off = e.w / 2 + 1.7, sx = cx + lx * off, sz = cz + lz * off, ang = Math.atan2(hx, hz);
      if (busStops.some((q) => Math.hypot(q.x - sx, q.z - sz) < 12)) continue;
      let along = 0; for (let k = 0; k < best.i; k++) along += Math.hypot(e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]);
      along += L * best.t;
      busStops.push({ edge: e.id, s: along, side, x: cx + lx * (e.w / 2 - 1.5), z: cz + lz * (e.w / 2 - 1.5), hx, hz });
      const P = (u: number, v: number): [number, number] => [sx + hx * u + lx * v, sz + hz * u + lz * v];   // u along the road, v away from it
      let q = P(0, 0); B.st.box(q[0], 2.65, q[1], 2.3, 0.12, 5.2, '#2E66C9', { ry: ang });              // roof
      q = P(0, 0.95); B.st.box(q[0], 1.45, q[1], 0.06, 2.2, 4.8, '#d9dde6', { ry: ang });              // back panel
      q = P(0, 0.9); B.st.box(q[0], 1.6, q[1], 0.03, 1.1, 2.6, '#FFB627', { ry: ang });                // advert
      for (const u of [-2.4, 2.4]) { q = P(u, 0.85); B.st.box(q[0], 1.3, q[1], 0.1, 2.6, 0.1, '#9aa0ab', { ry: ang }); q = P(u, -0.95); B.st.box(q[0], 1.3, q[1], 0.08, 2.6, 0.08, '#9aa0ab', { ry: ang }); }
      q = P(0, 0.45); B.st.box(q[0], 0.55, q[1], 0.45, 0.08, 4.2, '#9aa0ab', { ry: ang });             // bench
      // the stop's name from OpenStreetMap on a board above the roof edge
      { let nmB = '', bdB = 45; for (const o of zone.osm || []) { if (o.k !== 'bus_stop' || !o.p || !o.t.name) continue; const d = Math.hypot(o.p[0] - sx, o.p[1] - sz); if (d < bdB && !/^bus ?stop$/i.test(o.t.name)) { bdB = d; nmB = o.t.name; } }
        if (nmB) { q = P(0, -1.05); B.st.box(q[0], 3.05, q[1], 0.06, 0.6, 3.4, '#1f5fae', { ry: ang });
          signs.push({ id: `bs_${f.p.join(',')}`, text: nmB.toUpperCase().replace(/\s*BUS ?STOP\s*$/i, '').slice(0, 26), bg: '#1f5fae', fg: '#ffffff', c: [q[0] - lx * 0.04, 3.05, q[1] - lz * 0.04], right: [-lz, 0, lx], up: [0, 1, 0], w: 3.2, h: 0.5 }); } }
      q = P(2.9, -0.9); B.st.add(TPL.cyl, q[0], 1.4, q[1], 0.05, 2.8, 0.05, '#6f6a76'); B.st.box(q[0], 2.75, q[1], 0.06, 0.5, 0.5, '#E8413A', { ry: ang });
      const k0 = P(-2.6, 0), k1 = P(2.6, 0);
      const pad: Surface = { e: null, i: 0, ax: k0[0], az: k0[1], bx: k1[0], bz: k1[1], ya: 2.71, yb: 2.71, hw: 1.1, kind: 'pad' };
      (surfaceGrid.get(key(sx, sz, 30)) || surfaceGrid.set(key(sx, sz, 30), []).get(key(sx, sz, 30))!).push(pad);
      addObstacle(P(-2.4, 0.85)[0], P(-2.4, 0.85)[1], 0.15, 2.6); addObstacle(P(2.4, 0.85)[0], P(2.4, 0.85)[1], 0.15, 2.6);
      addObstacle(P(-2.4, -0.95)[0], P(-2.4, -0.95)[1], 0.15, 2.6); addObstacle(P(2.4, -0.95)[0], P(2.4, -0.95)[1], 0.15, 2.6);
      // people waiting
      const pr = rng(hash(f.p.join(',')));
      for (let k = 0; k < pr.int(1, 4); k++) { const w = P(pr.range(-2, 2), pr.range(-0.6, 0.3)); drawPerson(B.st, randomPerson(pr), w[0], w[1], ang + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + pr.range(-0.4, 0.4), true, 0.2, true); }
    } else if (f.kind === 'street_lamp') {
      if (over) {
        // a lamp mapped under a flyover belongs on the deck: stand it at the deck's edge nearest the mapped spot
        const sf = over.s, dx = sf.bx - sf.ax, dz = sf.bz - sf.az, L2 = Math.hypot(dx, dz) || 1;
        const t = Math.max(0, Math.min(1, ((x - sf.ax) * dx + (z - sf.az) * dz) / (L2 * L2)));
        const cx = sf.ax + dx * t, cz = sf.az + dz * t, nx = -dz / L2, nz = dx / L2, side = (x - cx) * nx + (z - cz) * nz >= 0 ? 1 : -1;
        const off = sf.e!.w / 2 + 0.15, lx = cx + nx * off * side, lz = cz + nz * off * side, y = over.y + 0.95, ang = Math.atan2(dx, dz);
        const ox = -nx * side * 1.6, oz = -nz * side * 1.6;
        if (lamps.some((l) => Math.hypot(l.x - lx - ox, l.z - lz - oz) < 12)) continue;
        B.st.add(TPL.cyl6, lx, y + 4, lz, 0.09, 8, 0.09, '#8d8899');
        B.st.box(lx + ox / 2, y + 7.95, lz + oz / 2, 0.08, 0.08, 1.6, '#8d8899', { ry: ang + Math.PI / 2 });
        B.st.box(lx + ox, y + 7.85, lz + oz, 0.7, 0.14, 0.3, '#3c3946', { ry: ang + Math.PI / 2 });
        B.lit.box(lx + ox, y + 7.77, lz + oz, 0.55, 0.02, 0.22, '#fff0cc', { ry: ang + Math.PI / 2 });
        lamps.push(new THREE.Vector3(lx + ox, y + 7.6, lz + oz));
        continue;
      }
      let lx = x, lz = z;
      if (road && !(hasCentreMedian(road.e) && road.d < 0.8)) {     // a lamp in the traffic lane moves to the kerb (median lamps stay)
        const k = road.d > 0.01 ? (road.e.w / 2 + 0.5) / road.d : 0;
        if (!k) continue;
        lx = road.cx + (x - road.cx) * k; lz = road.cz + (z - road.cz) * k;
        if (blocked(lx, lz, road.e, 0.3)) continue;
      }
      B.st.add(TPL.cyl6, lx, 4.5, lz, 0.09, 9, 0.09, '#8d8899'); B.lit.box(lx, 8.9, lz, 0.5, 0.06, 0.5, '#fff0cc'); lamps.push(new THREE.Vector3(lx, 8.6, lz));
    } else if (f.kind === 'atm' || f.kind === 'bench') {
      if (f.kind === 'bench') B.st.box(x, 0.45, z, 1.6, 0.1, 0.5, '#7a5235');
    } else if (f.kind === 'water_tower') {
      if (over) continue;
      B.st.add(TPL.cyl, x, 9, z, 0.6, 18, 0.6, '#b4afbf'); B.st.add(TPL.cyl, x, 19, z, 4, 3, 4, '#c9c4d3');
    } else if (f.kind === 'artwork') {
      if (road || over) continue;
      B.st.add(TPL.cyl, x, 0.6, z, 1.2, 1.2, 1.2, '#9c968f'); B.st.add(TPL.capsule, x, 2.6, z, 0.8, 1.6, 0.8, '#b08d57');
    }
  }

  // ---------- trees: parks + along roads ----------
  const treeAt = (x: number, z: number, s: Rng) => {
    if(airClear(x,z))return;
    const h = s.range(2.8, 4.4), cr = s.range(1.6, 2.6), g1 = s.pick(['#4e7d33', '#5c8f3a', '#6fa14a', '#3f6e2c']);
    B.st.add(TPL.cyl6, x, h / 2, z, 0.17, h, 0.17, '#6b4a33');
    B.st.add(TPL.ico0, x, h + cr * 0.55, z, cr, cr * 0.8, cr, g1);
    B.st.add(TPL.ico0, x + 0.4, h + cr * 1.0, z - 0.5, cr * 0.7, cr * 0.6, cr * 0.7, s.pick(['#4e7d33', '#5c8f3a', '#6fa14a']));
  };
  const inWater = (x: number, z: number) => waterRings.some((r) => pointInRing(x, z, r));
  // a ring edge made by cutting the area at the tile border is not a real shore or boundary
  const cutEdge = (p: XZ, q: XZ) => { const on = (v: number, t: number) => Math.abs(v - t) < 0.6; return (on(p[0], TX0) && on(q[0], TX0)) || (on(p[0], TX0 + 1000) && on(q[0], TX0 + 1000)) || (on(p[1], TZ0) && on(q[1], TZ0)) || (on(p[1], TZ0 + 1000) && on(q[1], TZ0 + 1000)); };
  for (const pk of parkInfo) {
    const ring = pk.ring;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const p of ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
    const area = Math.abs(signedArea(ring));
    const open = /pitch|stadium|playground|golf|track/.test(pk.cls), forest = /forest|nature/.test(pk.cls);
    // trees: dense in forests and city parks, a ring along the edge of pitches and grounds
    const n = Math.min(opts.lowQ ? 60 : forest ? 900 : 600, Math.floor(area / (forest ? 140 : 260)));
    const pr = rng(hash(String(minx)));
    for (let k = 0; k < n; k++) {
      const x = pr.range(minx, maxx), z = pr.range(minz, maxz);
      if (!pointInRing(x, z, ring) || marks.some((l) => inClear(l, x, z)) || deckOver(x, z, 2.5) || blocked(x, z, null, 1.2) || inWater(x, z)) continue;
      if (open && pr() < 0.85) continue;
      treeAt(x, z, pr);
    }
    // railing round city parks and gardens, with a gate (pillars and the park's name) towards the nearest road
    if (opts.lowQ || !/park|garden/.test(pk.cls) || area < 600 || area > 450000) continue;
    let gate: { i: number; u: number; d: number } | null = null;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length]; if (cutEdge(p, q)) continue;
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      for (const sf of near(mx, mz)) { if (sf.kind !== 'road' || !sf.e || sf.ya > 0.5) continue; const dx = sf.bx - sf.ax, dz = sf.bz - sf.az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((mx - sf.ax) * dx + (mz - sf.az) * dz) / L2)), d = Math.hypot(mx - sf.ax - dx * t, mz - sf.az - dz * t) - sf.e.w / 2; if (d > 0 && (!gate || d < gate.d)) gate = { i, u: 0.5, d }; }
    }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1 || cutEdge(p, q)) continue;
      const n2 = Math.max(1, Math.round(L / 2.5)); let run = -1;
      const isGate = gate && gate.i === i && L > 8;
      const flush = (k: number) => {
        if (run < 0) return;
        const a = [p[0] + (q[0] - p[0]) * run / n2, p[1] + (q[1] - p[1]) * run / n2], b = [p[0] + (q[0] - p[0]) * k / n2, p[1] + (q[1] - p[1]) * k / n2], ll = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (ll > 0.8) { const ang = Math.atan2(b[0] - a[0], b[1] - a[1]); B.st.box((a[0] + b[0]) / 2, 0.55, (a[1] + b[1]) / 2, 0.06, 1.1, ll, '#2f4f3a', { ry: ang }); B.st.box((a[0] + b[0]) / 2, 0.15, (a[1] + b[1]) / 2, 0.3, 0.3, ll, '#c9c2b4', { ry: ang }); addWall({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y0a: -1, y0b: -1, y1a: 1.1, y1b: 1.1, kind: 'median' }); }
        run = -1;
      };
      for (let k = 0; k < n2; k++) {
        const u = (k + 0.5) / n2, x = p[0] + (q[0] - p[0]) * u, z = p[1] + (q[1] - p[1]) * u;
        const inGate = isGate && Math.abs(u - 0.5) * L < 2.4;
        if (inGate || blocked(x, z, null, 0.6) || inWater(x, z) || inFoot(x, z, null)) flush(k); else if (run < 0) run = k;
      }
      flush(n2);
      if (isGate) {
        const ex = (q[0] - p[0]) / L, ez = (q[1] - p[1]) / L, mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
        for (const s2 of [-1, 1]) { const x = mx + ex * s2 * 2.6, z = mz + ez * s2 * 2.6; B.st.box(x, 1.2, z, 0.7, 2.4, 0.7, '#d8cdb8'); addObstacle(x, z, 0.45, 2.4); }
        if (pk.name) {
          B.st.box(mx, 2.75, mz, 5.9, 0.7, 0.18, '#2f4f3a', { ry: Math.atan2(ex, ez) + Math.PI / 2 });
          // face away from the park, towards the road
          const [cx2, cz2] = centroid(ring); let fx = -ez, fz = ex; if (fx * (mx - cx2) + fz * (mz - cz2) < 0) { fx = -fx; fz = -fz; }
          signs.push({ id: `pk_${mx.toFixed(0)}_${mz.toFixed(0)}`, text: pk.name.toUpperCase().slice(0, 26), bg: '#2f4f3a', fg: '#f6eedc', c: [mx + fx * 0.11, 2.75, mz + fz * 0.11], right: [fz, 0, -fx], up: [0, 1, 0], w: 5.6, h: 0.6 });
        }
      }
    }
  }
  // lakes and tanks: a stone bund along the real shore and a paved walk round the bigger ones
  if (!opts.lowQ) for (const ring of waterRings) {
    const area = Math.abs(signedArea(ring)); if (area < 1500) continue;
    const [cx2, cz2] = centroid(ring);
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1 || cutEdge(p, q)) continue;
      const ang = Math.atan2(q[0] - p[0], q[1] - p[1]), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      let nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L; if (nx * (mx - cx2) + nz * (mz - cz2) < 0) { nx = -nx; nz = -nz; }   // outward, away from the water (roughly)
      if (blocked(mx + nx * 1.2, mz + nz * 1.2, null, 0.5)) continue;
      B.st.box(mx + nx * 0.5, 0.25, mz + nz * 0.5, 1.0, 0.5, L + 0.4, '#a59d90', { ry: ang });
      if (area > 30000 && !blocked(mx + nx * 2.8, mz + nz * 2.8, null, 0.5) && !inFoot(mx + nx * 2.8, mz + nz * 2.8, null)) B.foot.box(mx + nx * 2.4, 0.06, mz + nz * 2.4, 2.8, 0.12, L + 0.4, '#d2c9b8', { ry: ang, uvScale: [0.6, L / 4] });
    }
  }

  // ---------- green direction boards on the approaches to main junctions: the other arms' road names with arrows ----------
  {
    const byNode = new Map<string, RoadEdge[]>();
    for (const e of zone.roads) for (const n of [e.from, e.to]) if (n) (byNode.get(n) || byNode.set(n, []).get(n)!).push(e);
    const isMain = (e: RoadEdge) => MAJOR.has(e.cls) && !/_link/.test(e.cls);
    for (const e of ownRoads) {
      if (!isMain(e) || !e.name || (e.elev && Math.max(...e.elev) > 0.5)) continue;
      for (const [nid, fwd] of [[e.to, true], [e.from, false]] as [string | null, boolean][]) {
        if (!nid) continue;
        if (e.oneway && ((fwd && e.oneway === 'forward') || (!fwd && e.oneway === 'backward'))) continue;   // can't drive this way
        const others = (byNode.get(nid) || []).filter((o) => o !== e);
        if (others.length < 2 || others.filter(isMain).length < 1) continue;
        const pts = fwd ? e.pts : e.pts.slice().reverse();
        let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (L < 70) continue;
        // heading into the junction and the spot 32 m before it
        const nP = pts[pts.length - 1], pP = pts[pts.length - 2], hl = Math.hypot(nP[0] - pP[0], nP[1] - pP[1]) || 1, hx = (nP[0] - pP[0]) / hl, hz = (nP[1] - pP[1]) / hl;
        let back = 32, k = pts.length - 1, bx = nP[0], bz = nP[1];
        while (k > 0) { const sl = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (sl >= back) { const u = back / sl; bx = pts[k][0] + (pts[k - 1][0] - pts[k][0]) * u; bz = pts[k][1] + (pts[k - 1][1] - pts[k][1]) * u; break; } back -= sl; k--; }
        if (!inTile(bx, bz)) continue;
        const lines: string[] = [], seenN = new Set<string>();
        for (const o of others) {
          if (!o.name || seenN.has(o.name) || o.name === e.name || /footway|path|service/.test(o.cls)) continue;
          const q = o.from === nid ? o.pts : o.pts.slice().reverse(); if (q.length < 2) continue;
          const ax = q[1][0] - q[0][0], az = q[1][1] - q[0][1], al = Math.hypot(ax, az) || 1;
          const cr = (hx * az - hz * ax) / al, dt = (hx * ax + hz * az) / al;
          const arrow = dt > 0.75 ? '↑' : cr > 0 ? '→' : '←';
          seenN.add(o.name); lines.push(`${arrow} ${o.name.replace(/\b(Road|Rd)\b\.?/i, 'Rd').toUpperCase()}`.slice(0, 26));
        }
        if (!lines.length) continue;
        lines.sort((a, b) => '←↑→'.indexOf(a[0]) - '←↑→'.indexOf(b[0])); lines.length = Math.min(lines.length, 3);
        const lx = hz, lz = -hx, off = e.w / 2 + (e.oneway ? 1.2 : 1.6), px = bx + lx * off, pz = bz + lz * off;
        if (blocked(px, pz, e, 0.4)) continue;
        const ang = Math.atan2(hx, hz), H = 0.72 * lines.length + 0.3, top = 4.4 + H;
        B.st.box(px, top / 2, pz, 0.16, top, 0.16, '#5b5a63'); addObstacle(px, pz, 0.2, top);
        B.st.box(px - lx * 1.6, 4.4 + H / 2, pz - lz * 1.6, 3.6, H, 0.08, '#17703f', { ry: ang });
        lines.forEach((t, i) => signs.push({ id: `dir_${e.id}_${fwd}_${i}`, text: t, bg: '#17703f', fg: '#ffffff', c: [px - lx * 1.6 - hx * 0.06, 4.4 + H - 0.5 - i * 0.72, pz - lz * 1.6 - hz * 0.06], right: [-hz, 0, hx], up: [0, 1, 0], w: 3.4, h: 0.6 }));
      }
    }
  }
  // ---------- access-controlled ORR: curved approach gantries and ramp markers ----------
  {
    const C = { B, inTile, obstacle: addObstacle,
      post: (x: number, z: number, bottom: number, top: number) => addWall({ ax: x - .16, az: z, bx: x + .16, bz: z, y0a: bottom, y0b: bottom, y1a: top, y1b: top, kind: 'parapet' }),
      sign: (id: string, text: string, c: number[], f: number[], w: number, h: number, bg = '#17703f', fg = '#ffffff') => {
        signs.push({ id, text, bg, fg, c, right: [f[2], 0, -f[0]], up: [0, 1, 0], w, h });
      } };
    drawExpresswaySigns(zone.roads, zone.osm || [], C);
    drawRampChevrons(zone.roads, C);
  }
  // ---------- OpenStreetMap extras: petrol bunks, toll plazas, exits, skywalks, subways, railway, bus terminals ----------
  if (zone.osm?.length) {
    const roadsAround = (x: number, z: number, R: number) => {
      const out = new Set<Surface>(), n = Math.ceil(R / 30);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const k = `${Math.floor(x / 30) + i},${Math.floor(z / 30) + j}`; for (const s of surfaceGrid.get(k) || []) out.add(s); for (const s of ctxGrid.get(k) || []) out.add(s); }
      return out;
    };
    const NOTCAR = /footway|path|steps|cycleway|pedestrian|track/;
    drawExtras(zone.osm, {
      B, inTile, lowQ: !!opts.lowQ,
      nearestRoad: (x, z, maxD, ground = false) => {
        let best: RoadHit | null = null;
        for (const s of roadsAround(x, z, maxD)) {
          if (s.kind !== 'road' || !s.e || NOTCAR.test(s.e.cls) || (ground && (s.ya > 1.2 || s.yb > 1.2))) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2)), cx = s.ax + dx * t, cz = s.az + dz * t, d = Math.hypot(x - cx, z - cz);
          if (d <= maxD && (!best || d < best.d)) best = { e: s.e, d, cx, cz, hx: dx / L, hz: dz / L, w: s.e.w, y: s.ya + (s.yb - s.ya) * t + (ROAD_Y[s.e.cls] ?? 0.04) };
        }
        return best;
      },
      onRoad: (x, z, pad = 0) => {
        for (const s of near(x, z)) {
          if (s.kind !== 'road' || !s.e || NOTCAR.test(s.e.cls)) continue;
          const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2));
          if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.e.w / 2 + pad) return true;
        }
        return false;
      },
      inBuilding: (x, z) => inFoot(x, z, null),
      obstacle: addObstacle,
      wall: (ax, az, bx, bz, top) => addWall({ ax, az, bx, bz, y0a: -1, y0b: -1, y1a: top, y1b: top, kind: 'median' }),
      solid: (ring, h) => {
        const bld: Building = { id: `x_${ring[0][0].toFixed(0)}_${ring[0][1].toFixed(0)}`, name: null, cls: 'structure', h, hs: 'model', ring, fc: null, rc: null } as any;
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const p of ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
        const ks = new Set<string>(); for (let x = minx; x <= maxx + 49; x += 49) for (let z = minz; z <= maxz + 49; z += 49) ks.add(key(Math.min(x, maxx), Math.min(z, maxz)));
        for (const k of ks) (buildingGrid.get(k) || buildingGrid.set(k, []).get(k)!).push(bld);
      },
      sign: (id, text, bg, fg, c, f, w, h) => { const l = Math.hypot(f[0], f[2]) || 1; signs.push({ id: 'x' + id, text, bg, fg, c, right: [f[2] / l, 0, -f[0] / l], up: [0, 1, 0], w, h }); },
      lamp: (x, y, z) => lamps.push(new THREE.Vector3(x, y, z)),
      pad: (ax, az, bx, bz, y, hw) => addSurface(surfaceGrid, { e: null, i: 0, ax, az, bx, bz, ya: y, yb: y, hw, kind: 'pad' }),
    });
  }
  // ---------- outskirts: fields and scattered trees in the open land between houses ----------
  if (!opts.lowQ) {
    const FIELD = ['#7a9147', '#86a052', '#6d8a3f', '#9a9a55', '#8b7352', '#a08a5c', '#b3a46a', '#7f9a4c'];
    const skipAreas = zone.areas.filter((a) => a.kind === 'water' || /park|pitch|stadium|golf|construction|industrial|military|railway|commercial|retail|school|college|university|hospital/.test(`${a.sub} ${a.cls}`)).map((a) => {
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const p of a.ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      return { ring: a.ring, minx, maxx, minz, maxz };
    });
    const skipArea = (x: number, z: number) => airClear(x,z)||skipAreas.some((a) => x >= a.minx && x <= a.maxx && z >= a.minz && z <= a.maxz && pointInRing(x, z, a.ring));
    const G = 20;
    for (let i = 0; i < 1000 / G; i++) for (let j = 0; j < 1000 / G; j++) {
      const x = TX0 + i * G + G / 2, z = TZ0 + j * G + G / 2;
      if (coverAt(x, z) > 0.09) continue;
      const fr2 = rng(hash(`fld${zone.i},${zone.j},${i},${j}`));
      if (blocked(x, z, null, G / 2 + 1) || inFoot(x, z, null, G / 2 + 2) || skipArea(x, z)) {
        if (fr2.chance(0.05) && !blocked(x, z, null, 3) && !inFoot(x, z, null, 3)) treeAt(x + fr2.range(-6, 6), z + fr2.range(-6, 6), fr2);
        continue;
      }
      // fields come in blocks sharing a crop; a few patches stay as bare scrub
      const crop = FIELD[hash(`crop${Math.floor((TX0 + i * G) / 80)},${Math.floor((TZ0 + j * G) / 60)}`) % FIELD.length];
      if (fr2.chance(0.9)) {
        const c = new THREE.Color(crop).multiplyScalar(fr2.range(0.95, 1.04)), hs = G / 2 - 0.25;
        B.park.quad([x - hs, 0.015, z - hs], [x - hs, 0.015, z + hs], [x + hs, 0.015, z + hs], [x + hs, 0.015, z - hs], c);
      }
      if (fr2.chance(0.07)) treeAt(x + fr2.range(-8, 8), z + fr2.range(-8, 8), fr2);
    }
  }
  // ---------- landmarks ----------
  drawAirfieldTile(opts.airfields||[],zone.i,zone.j,B,landmarkSurfaceGrid);
  for (const l of marks) {
    if (!ownsLandmark(l)) continue;
    let solidN = 0;
    drawLandmark(l, {
      B: captureLandmarkBatches(B, landmarkSurfaceGrid, l.id || l.kind), obstacle: addObstacle,
      solid: (ring, h) => {
        const bld: Building = { id: `lm_${l.kind}_${l.x!.toFixed(0)}_${solidN++}`, name: l.name, cls: 'landmark', h, hs: 'model', ring, fc: null, rc: null };
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const p of ring) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
        const ks = new Set<string>(); for (let x = minx; x <= maxx + 49; x += 49) for (let z = minz; z <= maxz + 49; z += 49) ks.add(key(Math.min(x, maxx), Math.min(z, maxz)));
        for (const k of ks) (buildingGrid.get(k) || buildingGrid.set(k, []).get(k)!).push(bld);
      },
      road: (x, z, pad) => { for (const s of near(x, z)) { if (s.kind !== 'road' || !s.e || s.ya > 2 || s.yb > 2) continue; const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2)); if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.e.w / 2 + pad) return true; } return false; },
      sign: (id, text, bg, fg, c, f, w, h) => { const l2 = Math.hypot(f[0], f[2]) || 1; signs.push({ id, text, bg, fg, c, right: [f[2] / l2, 0, -f[0] / l2], up: [0, 1, 0], w, h }); },
      roadNear: (x, z, R) => { let best: any = null; for (const s of near(x, z)) { if (s.kind !== 'road' || !s.e || s.ya > 1.2 || /footway|path|steps|service/.test(s.e.cls)) continue; const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2); const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2)), cx = s.ax + dx * t, cz = s.az + dz * t, d = Math.hypot(x - cx, z - cz); if (d < R && (!best || d < best.d)) best = { d, cx, cz, hx: dx / L, hz: dz / L, w: s.e.w }; } return best; },
      roadY: (x, z) => { let best: number | null = null; for (const s of near(x, z)) { if (s.kind !== 'road') continue; const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / L2)); if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.hw) { const y = s.ya + (s.yb - s.ya) * t; if (best === null || y > best) best = y; } } return best; },
    });
  }
  // ---------- metro viaduct (pieces whose middle falls in this tile) ----------
  const M = opts.metro;
  const DH = M?.deckHeight || 11;
  const corridors = metroCorridors(M?.lines || []);
  for (const corridor of corridors) {
    const pts = corridor.center.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [px, pz] = pts[i], [qx, qz] = pts[i + 1];
      const LL = Math.hypot(qx - px, qz - pz); if (LL < 0.5) continue;
      if (Math.max(px, qx) < TX0 - 5 || Math.min(px, qx) > TX0 + 1005 || Math.max(pz, qz) < TZ0 - 5 || Math.min(pz, qz) > TZ0 + 1005) continue;
      const nseg = Math.ceil(LL / 40);
      for (let k = 0; k < nseg; k++) {
        const ax = px + (qx - px) * (k / nseg), az = pz + (qz - pz) * (k / nseg), bx = px + (qx - px) * ((k + 1) / nseg), bz = pz + (qz - pz) * ((k + 1) / nseg);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!inTile(mx, mz)) continue;
        const L2 = LL / nseg, ang = Math.atan2(bx - ax, bz - az);
        B.st.box(mx, DH - 0.6, mz, 5.4, 1.2, L2 + 0.2, '#c2bdcc', { ry: ang });
        B.st.box(mx, DH + 0.4, mz, 9, 0.8, L2 + 0.2, '#c9c4d3', { ry: ang });
        // Corridor identity accents; the real shared white/blue train livery remains unchanged.
        for (const side of [-1, 1]) B.st.box(mx + Math.cos(ang) * 4.51 * side, DH + .45, mz - Math.sin(ang) * 4.51 * side, .035, .2, L2 + .1, corridor.color, { ry: ang });
        for (const sd of [-1, 1]) {
          const ox = Math.cos(ang) * 4.35 * sd, oz = -Math.sin(ang) * 4.35 * sd;
          B.st.box(mx + ox, DH + 1.3, mz + oz, 0.3, 1.0, L2 + 0.2, '#d4d0dc', { ry: ang });
          addWall({ ax: ax + ox, az: az + oz, bx: bx + ox, bz: bz + oz, y0a: DH, y0b: DH, y1a: DH + 1.8, y1b: DH + 1.8, kind: 'rail' });
        }
        B.lit.box(mx, DH - 1.22, mz, 0.25, 0.02, L2 * 0.9, '#fff0d8', { ry: ang });
        addSurface(surfaceGrid, { e: null, i, ax, az, bx, bz, ya: DH + 0.8, yb: DH + 0.8, hw: 4.2, kind: 'deck' });
        // One viaduct per normalized corridor; its two rail paths are drawn separately below.
        const nxs = Math.cos(ang), nzs = -Math.sin(ang);
        if (!opts.lowQ) {
          for (const sd of [-1, 1]) {
            const x = mx + nxs * 4.0 * sd, z = mz + nzs * 4.0 * sd;
            B.st.box(x, DH + 3.6, z, 0.22, 5.6, 0.22, '#9aa0a8');
            B.st.box(x - nxs * sd * 1.2, DH + 6.1, z - nzs * sd * 1.2, 0.1, 0.1, 2.5, '#9aa0a8', { ry: ang + Math.PI / 2 });
          }
        }
      }
    }
  }
  // Rails and trains consume these exact same offset paths, including joined bends and source-track deduplication.
  for (const corridor of corridors) for (const track of corridor.tracks) {
    const pts = track.path.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.1) continue;
      const steps = Math.max(1, Math.ceil(length / 40));
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]), nx = Math.cos(ang), nz = -Math.sin(ang);
      for (let k = 0; k < steps; k++) {
        const u = (k + 0.5) / steps, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, len = length / steps;
        if (!inTile(x, z)) continue;
        B.st.box(x, DH + 0.88, z, 2.4, 0.16, len + 0.2, '#8f8b96', { ry: ang });
        for (const gauge of [-0.72, 0.72]) B.st.box(x + nx * gauge, DH + 1.02, z + nz * gauge, 0.07, 0.12, len + 0.2, '#7d8088', { ry: ang });
        if (!opts.lowQ) B.st.box(x, DH + 5.9, z, 0.03, 0.03, len + 0.2, '#3a3a40', { ry: ang });
      }
    }
  }
  // ---------- metro stations: a two-level box over the road, curved roof, stairs down both kerbs, name boards ----------
  for (const st of (M?.stations || []) as { id: string; name: string; te?: string; p: XZ }[]) {
    const [sx, sz] = st.p; if (!inTile(sx, sz)) continue;
    const stationLines = (st as { lines?: string[] }).lines;
    const best = metroStationFrame({ p: st.p, lines: stationLines }, corridors);
    if (!best) continue;
    const { hx, hz, cx, cz } = best, ang = Math.atan2(hx, hz), nx = -hz, nz = hx, Ls = 130, Ws = 24;
    const P = (u: number, v: number): XZ => [cx + hx * u + nx * v, cz + hz * u + nz * v];
    const cY = DH - 4.2;                                                   // concourse floor under the platforms
    // A flyover can pass between ground and station platforms. Its height must
    // also clear the concourse, not only the ground columns. Keep the station
    // deck/platforms continuous while opening the modeled concourse at a road.
    const concourse = { x: cx, z: cz, hx, hz, hw: (Ws - 4) / 2, hl: Ls * .31 };
    if (structureClearance.clear(concourse, cY, cY + 3.4)) {
      B.st.box(cx, cY + 1.7, cz, Ws - 4, 3.4, Ls * .62, '#d9d6de', { ry: ang });
      B.lit.box(cx, cY + 2, cz, Ws - 3.9, 1.1, Ls * .6, '#cfe6ff', { ry: ang });
      structureSupports.push({ source: st.id, part: 'station_concourse', footprint: concourse, bottom: cY, top: cY + 3.4 });
    } else {
      const nu = 14, nv = 5, du = Ls * .62 / nu, dv = (Ws - 4) / nv;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const q = P(-Ls * .31 + (i + .5) * du, -(Ws - 4) / 2 + (j + .5) * dv), footprint = { x: q[0], z: q[1], hx, hz, hw: dv / 2, hl: du / 2 };
        if (!structureClearance.clear(footprint, cY, cY + 3.4)) continue;
        B.st.box(q[0], cY + 1.7, q[1], dv, 3.4, du, '#d9d6de', { ry: ang });
        if (j === 0 || j === nv - 1) B.lit.box(q[0], cY + 2, q[1], dv + .02, 1.1, du, '#cfe6ff', { ry: ang });
        structureSupports.push({ source: st.id, part: 'station_concourse', footprint, bottom: cY, top: cY + 3.4 });
      }
    }
    // platforms both sides of the tracks with a parapet
    for (const s of [-1, 1]) {
      let q = P(0, s * 5.6); B.st.box(q[0], DH + 0.95, q[1], 3.4, 0.5, Ls, '#cdc8d2', { ry: ang });
      q = P(0, s * 7.4); B.st.box(q[0], DH + 2.0, q[1], 0.25, 2.6, Ls, '#e9eef2', { ry: ang });
      addSurface(surfaceGrid, { e: null, i: 0, ax: P(-Ls / 2, s * 5.6)[0], az: P(-Ls / 2, s * 5.6)[1], bx: P(Ls / 2, s * 5.6)[0], bz: P(Ls / 2, s * 5.6)[1], ya: DH + 1.2, yb: DH + 1.2, hw: 1.7, kind: 'pad' });
    }
    // the curved 'umbrella' roof: a shallow vault of slats over platforms and tracks, on tall columns
    const segs = 7;
    for (let k = 0; k < segs; k++) {
      const a0 = -1 + (2 * k) / segs, a1 = -1 + (2 * (k + 1)) / segs, am = (a0 + a1) / 2;
      const v0 = a0 * (Ws / 2 + 1), v1 = a1 * (Ws / 2 + 1), h0 = DH + 9.2 - 2.4 * a0 * a0, h1 = DH + 9.2 - 2.4 * a1 * a1;
      const vm = (v0 + v1) / 2, hm = (h0 + h1) / 2, wv = Math.hypot(v1 - v0, h1 - h0), tilt = Math.atan2(h1 - h0, v1 - v0);
      const q = P(0, vm);
      B.st.box(q[0], hm, q[1], wv + 0.05, 0.3, Ls + 4, k % 2 ? '#f2f4f6' : '#e3e8ec', { ry: ang, rz: -tilt });
      void am;
    }
    for (let u = -Ls / 2 + 6; u <= Ls / 2 - 6; u += 14) for (const s of [-1, 1]) { const q = P(u, s * 8.2); B.st.box(q[0], DH + 4.6, q[1], 0.4, 7.6, 0.4, '#a9a4b5'); }
    // station portal columns at the kerbs (not in the traffic), carrying the concourse
    for (let u = -Ls * 0.28; u <= Ls * 0.28; u += 20) for (const s of [-1, 1]) {
      let v = s * (Ws / 2 - 1.5), q = P(u, v);
      const clear = () => structureClearance.clear({ x: q[0], z: q[1], r: .85 }, 0, cY) && !inFoot(q[0], q[1], null, .9);
      for (let tries = 0; tries < 6 && !clear(); tries++) { v += s * 2; q = P(u, v); }
      if (!clear()) continue;
      B.st.add(TPL.cyl, q[0], cY / 2, q[1], 0.8, cY, 0.8, '#bdb8c8', { ao: true, aoH: 4 }); addObstacle(q[0], q[1], 0.85, cY);
      structureSupports.push({ source: st.id, part: 'station_column', footprint: { x: q[0], z: q[1], r: .85 }, bottom: 0, top: cY });
    }
    // stairs and escalators down to both footpaths at each end
    for (const ue of [-Ls * 0.3, Ls * 0.3]) for (const s of [-1, 1]) {
      const len = 16; let v = s * (Ws / 2 + 2.5), run = P(ue + Math.sign(ue) * len / 2, v);
      const footprint = () => ({ x: run[0], z: run[1], hx, hz, hw: 2.2, hl: len / 2 + .5 });
      const clear = () => structureClearance.clear(footprint(), 0, cY + 2.4) &&
        [-len / 2, 0, len / 2].every(u => { const p = P(ue + Math.sign(ue) * len / 2 + u, v); return !inFoot(p[0], p[1], null, 2.2); });
      for (let tries = 0; tries < 4 && !clear(); tries++) { v += s * 3; run = P(ue + Math.sign(ue) * len / 2, v); }
      if (!clear()) continue;
      B.st.box(run[0], cY / 2, run[1], 3.6, cY, len, '#c9c4cf', { ry: ang, ao: true, aoH: 3 });
      for (let k = 0; k < 10; k++) { const sp = P(ue + Math.sign(ue) * (len - k * 1.5), v); B.st.box(sp[0], 0.3 + k * (cY / 10), sp[1], 3.7, 0.14, 0.6, '#a8a3ae', { ry: ang }); }
      B.st.box(run[0], cY + 2.3, run[1], 4.4, 0.18, len + 1, '#e9eef2', { ry: ang });
      const c0 = P(ue, v - 1.8), c1 = P(ue + Math.sign(ue) * len, v - 1.8), c2 = P(ue + Math.sign(ue) * len, v + 1.8), c3 = P(ue, v + 1.8);
      const bld: Building = { id: `ms_${st.id}_${ue}_${s}`, name: null, cls: 'structure', h: cY, hs: 'model', ring: [c0, c1, c2, c3], fc: null, rc: null } as any;
      const xs = bld.ring.map(p => p[0]), zs = bld.ring.map(p => p[1]);
      for (let i = Math.floor(Math.min(...xs) / 50); i <= Math.floor(Math.max(...xs) / 50); i++) for (let j = Math.floor(Math.min(...zs) / 50); j <= Math.floor(Math.max(...zs) / 50); j++) {
        const kk = `${i},${j}`; (buildingGrid.get(kk) || buildingGrid.set(kk, []).get(kk)!).push(bld);
      }
      structureSupports.push({ source: st.id, part: 'station_stairs', footprint: footprint(), bottom: 0, top: cY + 2.4 });
      // people, autos and bikes waiting at the foot of the stairs
      const pr = rng(hash(st.id + ue + s));
      const foot = P(ue + Math.sign(ue) * (len + 3), v);
      for (let k = 0; k < pr.int(2, 6); k++) drawPerson(B.st, randomPerson(pr), foot[0] + pr.range(-3, 3), foot[1] + pr.range(-3, 3), pr.range(0, 6.28), true, 0.2, true);
      if (!opts.lowQ && bikesLeft > 0) for (let k = 0; k < 3; k++) { const b2 = P(ue + Math.sign(ue) * (len + 6 + k * 1.1), v + s * 1.5); bike(b2[0], b2[1], ang + Math.PI / 2, pr); bikesLeft--; }
      addActivity(foot[0], foot[1], 6);
    }
    // name boards on both long sides at concourse level, and a sign at each stair
    const nameEn = st.name.toUpperCase(), nameTe = st.te || '';
    for (const s of [-1, 1]) {
      const q = P(0, s * (Ws / 2 - 1.9));
      B.st.box(q[0], cY + 4.3, q[1], 0.2, 1.8, 26, '#ffffff', { ry: ang });
      signs.push({ id: `mst_${st.id}_${s}`, text: `${nameEn} METRO`, bg: '#ffffff', fg: '#1f3046', c: [q[0] + nx * s * 0.12, cY + 4.55, q[1] + nz * s * 0.12], right: [hx * s, 0, hz * s], up: [0, 1, 0], w: 18, h: 1.1 });
      if (nameTe) signs.push({ id: `mst_${st.id}_${s}t`, text: nameTe, bg: '#ffffff', fg: '#1f3a68', c: [q[0] + nx * s * 0.12, cY + 3.75, q[1] + nz * s * 0.12], right: [hx * s, 0, hz * s], up: [0, 1, 0], w: 9, h: 0.7 });
    }
    // End-face boards meet drivers approaching along either road direction.
    // Known line identities come from station source tags; no route is guessed at interchanges.
    const lineIds = (stationLines || []).filter(id => ['red', 'blue', 'green'].includes(id));
    // Roof-riding chase cameras sit above the canopy: a distant end board alone
    // becomes too small during the pass. Repeat the source name on light roof
    // frames, with a nearby readable face in either direction through the station.
    for (const u of [-24, 0, 24]) {
      const q = P(u, 0), boardY = DH + 11.2;
      B.st.box(q[0], boardY - .2, q[1], 18, 2.25, .14, '#f7f8fa', { ry: ang });
      B.st.box(q[0], DH + 9.8, q[1], 18.3, .14, .18, '#a9a4b5', { ry: ang });
      for (const side of [-1, 1]) {
        const post = P(u, side * 8.7);
        B.st.box(post[0], DH + 9.6, post[1], .14, 3.2, .14, '#a9a4b5', { ry: ang });
      }
      for (const face of [-1, 1]) {
        signs.push({ id: `mst_roof_${st.id}_${u}_${face}`, text: nameEn, bg: '#f7f8fa', fg: '#17304d',
          c: [q[0] + hx * face * .1, boardY + .15, q[1] + hz * face * .1], right: [hz * face, 0, -hx * face], up: [0, 1, 0], w: 17.4, h: 1.15 });
        if (nameTe) signs.push({ id: `mst_roof_${st.id}_${u}_${face}_te`, text: nameTe, bg: '#f7f8fa', fg: '#17304d',
          c: [q[0] + hx * face * .1, boardY - .7, q[1] + hz * face * .1], right: [hz * face, 0, -hx * face], up: [0, 1, 0], w: 12, h: .55 });
      }
    }
    for (const direction of [-1, 1]) {
      const q = P(direction * (Ls * .33 + .35), 0), fx = hx * direction, fz = hz * direction, w = 19;
      B.st.box(q[0], cY + 2, q[1], w + .4, 2.7, .18, '#f7f8fa', { ry: ang });
      signs.push({ id: `mst_road_${st.id}_${direction}`, text: nameEn, bg: '#f7f8fa', fg: '#17304d', c: [q[0] + fx * .11, cY + 2.5, q[1] + fz * .11], right: [fz, 0, -fx], up: [0, 1, 0], w, h: .95 });
      if (nameTe) signs.push({ id: `mst_road_${st.id}_${direction}_te`, text: nameTe, bg: '#f7f8fa', fg: '#17304d', c: [q[0] + fx * .11, cY + 1.65, q[1] + fz * .11], right: [fz, 0, -fx], up: [0, 1, 0], w: 13, h: .55 });
      for (let k = 0; k < lineIds.length; k++) {
        const id = lineIds[k], width = w / lineIds.length, off = -w / 2 + width * (k + .5);
        B.st.box(q[0] + fz * off, cY + .9, q[1] - fx * off, width, .32, .21, metroLineColor(id), { ry: ang });
      }
      // High end boards sit beyond and above the canopy, above the train/roof-
      // riding car envelope. The roof cannot mask them during the station pass.
      // Both faces remain readable when entering or leaving a station.
      const entry = P(direction * (Ls / 2 + 4), 0), boardY = DH + 11.2;
      B.st.box(entry[0], boardY - .2, entry[1], 18, 2.25, .18, '#f7f8fa', { ry: ang });
      for (const face of [-1, 1]) {
        signs.push({ id: `mst_track_${st.id}_${direction}_${face}`, text: nameEn, bg: '#f7f8fa', fg: '#17304d',
          c: [entry[0] + fx * face * .12, boardY + .15, entry[1] + fz * face * .12], right: [fz * face, 0, -fx * face], up: [0, 1, 0], w: 17.4, h: 1.15 });
        if (nameTe) signs.push({ id: `mst_track_${st.id}_${direction}_${face}_te`, text: nameTe, bg: '#f7f8fa', fg: '#17304d',
          c: [entry[0] + fx * face * .12, boardY - .7, entry[1] + fz * face * .12], right: [fz * face, 0, -fx * face], up: [0, 1, 0], w: 12, h: .55 });
      }
      for (const side of [-1, 1]) {
        const post = P(direction * (Ls / 2 + 4), side * 8.7);
        B.st.box(post[0], DH + 5.9, post[1], .18, 10.2, .18, '#a9a4b5', { ry: ang });
        // Smaller platform boards face both directions at passenger eye height;
        // their entire width stays outside the moving train's track corridor.
        const platform = P(direction * 27, side * 6);
        B.st.box(platform[0], DH + 3, platform[1], 3.2, 1.1, .12, '#f7f8fa', { ry: ang });
        for (const face of [-1, 1]) signs.push({ id: `mst_platform_${st.id}_${direction}_${side}_${face}`, text: nameEn, bg: '#f7f8fa', fg: '#17304d',
          c: [platform[0] + hx * face * .08, DH + 3, platform[1] + hz * face * .08], right: [hz * face, 0, -hx * face], up: [0, 1, 0], w: 3.1, h: .95 });
      }
    }
  }
  for (const p of M?.pillars || []) {
    const [x, z] = p.p;
    if (!inTile(x, z)) continue;
    const footprint = { x, z, r: 1.05 }, height = DH - 1.2, cap = { x, z, hx: Math.sin(-p.h), hz: Math.cos(-p.h), hw: 3.1, hl: 1.2 };
    if (!structureClearance.clear(footprint, 0, height) || !structureClearance.clear(cap, DH - 2.2, DH - 1)) continue;
    B.st.add(TPL.cyl, x, (DH - 1.2) / 2, z, 1.0, DH - 1.2, 1.0, '#bdb8c8', { ao: true, aoH: 4 }); addObstacle(x, z, 1.05, DH - 1.2);
    B.st.box(x, DH - 1.6, z, 6.2, 1.2, 2.4, '#c4bfcf', { ry: -p.h });
    structureSupports.push({ source: `metro_${x}_${z}`, part: 'metro_pillar', footprint, bottom: 0, top: height,
      cap: { footprint: cap, bottom: DH - 2.2, top: DH - 1 } });
  }

  // ---------- hand back plain buffers ----------
  const buffers: BuiltBuffers[] = [];
  let verts = 0;
  for (const [mat, tb] of Object.entries(B)) for (const bt of tb.tiles.values()) {
    if (bt.empty) continue;
    buffers.push({ mat, pos: new Float32Array(bt.pos), nor: new Float32Array(bt.nor), uv: new Float32Array(bt.uv), col: new Float32Array(bt.col) });
    verts += bt.pos.length / 3;
  }
  void r; void theatreIds; void byBuilding;
  return {
    key: `${zone.i}_${zone.j}`, i: zone.i, j: zone.j, buffers, roads: ownRoads,
    buildingGrid, surfaceGrid, landmarkSurfaceGrid, walls, obstacles, structureSupports, signals, lamps: lamps.map((v) => [v.x, v.y, v.z]), busStops, walkPaths, facades, signs,
    activity: [...activity],
    rails: (zone.osm || []).filter((f) => f.k === 'rail' && f.l && f.t.railway === 'rail' && !f.t.service && !(f.t.tunnel && f.t.tunnel !== 'no')).map((f) => ({ id: f.id, pts: f.l!, bridge: !!f.t.bridge && f.t.bridge !== 'no' } as any)),
    counts: { buildings: zone.buildings.length, boards: zone.boards.length, roads: ownRoads.length, verts, fillShops, inferredSignals },
  };
}

function person(b: TiledBatch, x: number, z: number, r: Rng) {
  drawPerson(b, randomPerson(r), x, z, r.range(0, Math.PI * 2), true, 0.2, true);
}
function bandi(b: TiledBatch, lit: TiledBatch, x: number, z: number, ang: number, r: Rng) {
  const umb = r.pick(['#E8413A', '#1F5FCC', '#22B573', '#FFB627']);
  b.box(x, 0.95, z, 1.0, 0.12, 2.0, '#b5824f', { ry: ang });
  b.box(x, 0.6, z, 0.92, 0.55, 1.9, '#7a5235', { ry: ang });
  b.add(TPL.cyl, x, 1.2, z, 0.3, 0.35, 0.3, '#c0c0c8');
  b.box(x, 1.9, z, 0.05, 1.9, 0.05, '#4a4752');
  b.add(TPL.cone, x, 2.95, z, 1.25, 0.55, 1.25, umb);
  lit.box(x, 2.55, z, 0.25, 0.08, 0.06, '#fff4d6');
  person(b, x + Math.cos(ang) * 0.8, z - Math.sin(ang) * 0.8, r);
}

export function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

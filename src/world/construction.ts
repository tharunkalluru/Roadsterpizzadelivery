import type { RoadEdge, XZ } from './types';
import { CONSTRUCTION_REVIEW_DATE, CONSTRUCTION_SITES } from './construction-data';
import { roadStructureClearance } from './structure-clearance';
import { hash, TPL, type TiledBatch } from '../core/util';
import type { SignEntry, Wall } from './city';

export interface WorkZone {
  site: string; laneOffset: number; width: number; speed: number; sources: string[]; checkedAt: string;
}
export interface ConstructionPlan {
  roads: { id: string; workZone: WorkZone }[];
  piers: { id: string; site: string; x: number; z: number; hx: number; hz: number; scaffold: boolean }[];
  sites: { id: string; name: string; x: number; z: number; phase: string }[];
}
const point = (e: RoadEdge) => {
  let length = 0, x = 0, z = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    length += l; x += (a[0] + b[0]) / 2 * l; z += (a[1] + b[1]) / 2 * l;
  }
  return { x: x / (length || 1), z: z / (length || 1), length };
};
const project = (e: RoadEdge, x: number, z: number) => {
  let best = { d: Infinity, x: 0, z: 0, hx: 0, hz: 1 };
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < .01) continue;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len))), px = a[0] + dx * u, pz = a[1] + dz * u, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, hx: dx / len, hz: dz / len };
  }
  return best;
};
const geographic = (origin: { lat: number; lon: number }, x: number, z: number): XZ => [origin.lon + x / (111320 * Math.cos(origin.lat * Math.PI / 180)), origin.lat - z / 111320];
const local = (origin: { lat: number; lon: number }, lat: number, lon: number): XZ => [(lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180), -(lat - origin.lat) * 111320];

// The offset uses RoadGraph.pointAt's convention, relative to the source point
// direction. Preserve source road width/points/IDs and route topology.
export const constructionLane = (e: RoadEdge, dir: 1 | -1) => e.workZone ? e.workZone.laneOffset * dir : undefined;
export const applyConstructionRoads = <T extends RoadEdge>(roads: T[], plan: ConstructionPlan): T[] => {
  const byId = new Map(plan.roads.map(r => [r.id, r.workZone]));
  return roads.map(e => byId.has(e.id) ? { ...e, workZone: byId.get(e.id) } : e);
};
export const constructionOpenRoads = (roads: RoadEdge[]) => roads.map(e => e.workZone ? { ...e, w: e.workZone.width, pts: e.pts.map((p, i): XZ => {
  const a = e.pts[Math.max(0, i - 1)], b = e.pts[Math.min(e.pts.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [p[0] + (b[1] - a[1]) / len * e.workZone!.laneOffset, p[1] - (b[0] - a[0]) / len * e.workZone!.laneOffset];
}) } : e);

export function planConstruction(roads: RoadEdge[], origin: { lat: number; lon: number }): ConstructionPlan {
  const plan: ConstructionPlan = { roads: [], piers: [], sites: [] };
  const source = CONSTRUCTION_SITES[0], iiit = CONSTRUCTION_SITES[1];
  const corridor = roads.filter(e => {
    if (!e.oneway || e.w < 8 || e.elev?.some(y => y > 1.2) || !['trunk', 'primary'].includes(e.cls)) return false;
    const p = point(e), [lon, lat] = geographic(origin, p.x, p.z);
    // NH163 between Uppal and the CPRI/Medipally approach, not crossing streets.
    if (lon < 78.5605 || lon > 78.6205 || lat < 17.3985 || lat > 17.4175) return false;
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    return /Hyderabad[-– ]Janagam Highway|Warangal|NH.?163/i.test(e.name || '') || e.cls === 'trunk' && Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) * 1.8;
  });
  for (const e of corridor) {
    const mid = point(e), at = project(e, mid.x, mid.z);
    let pair: ReturnType<typeof project> | undefined, pairD = Infinity;
    for (const other of corridor) {
      if (other === e) continue;
      const q = project(other, mid.x, mid.z);
      if (q.d > 4 && q.d < Math.min(28, pairD) && at.hx * q.hx + at.hz * q.hz < -.75) { pair = q; pairD = q.d; }
    }
    // Do not fence an isolated/reversed source fragment without a verified
    // opposite carriageway. This keeps side streets and uncertain slips open.
    if (!pair) continue;
    const towardPair = (pair.x - at.x) * at.hz - (pair.z - at.z) * at.hx, width = 4.5;
    const laneOffset = -Math.sign(towardPair) * Math.max(0, e.w / 2 - width / 2 - .15);
    plan.roads.push({ id: e.id, workZone: { site: source.id, laneOffset, width, speed: 25, checkedAt: CONSTRUCTION_REVIEW_DATE, sources: source.sources.map(s => s.url) } });
    // Sample actual source segments, then de-duplicate paired carriageways and
    // source edge splits. Each pier is subsequently checked against open lanes.
    let along = 0;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .01) continue;
      for (let d = 16 - along % 32; d < len; d += 32) {
        if (d < 0) continue;
        const x = a[0] + (b[0] - a[0]) * d / len, z = a[1] + (b[1] - a[1]) * d / len;
        const q = corridor.filter(o => o !== e).map(o => project(o, x, z)).filter(q => q.d > 4 && q.d < 28 && (b[0] - a[0]) / len * q.hx + (b[1] - a[1]) / len * q.hz < -.75).sort((a, b) => a.d - b.d)[0];
        if (!q) continue;
        const px = (x + q.x) / 2, pz = (z + q.z) / 2;
        if (plan.piers.some(p => Math.hypot(p.x - px, p.z - pz) < 23)) continue;
        plan.piers.push({ id: `${source.id}_${Math.round(px)}_${Math.round(pz)}`, site: source.id, x: px, z: pz, hx: (b[0] - a[0]) / len, hz: (b[1] - a[1]) / len, scaffold: hash(e.id + i) % 5 === 0 });
      }
      along += len;
    }
  }
  if (plan.roads.length) { const m = plan.piers[Math.floor(plan.piers.length / 2)]; if (m) plan.sites.push({ id: source.id, name: source.name, x: m.x, z: m.z, phase: source.phase }); }
  // The dated IIIT advisory confirms works at the junction. Keep the changing
  // DLF gate closure out of navigation until a surveyed gate binding exists.
  const anchor = local(origin, 17.4456, 78.3497), near = roads.filter(e => ['primary', 'secondary', 'trunk'].includes(e.cls) && !e.elev?.some(y => y > 1.2));
  const junction = near.map(e => ({ e, p: project(e, ...anchor) })).sort((a, b) => a.p.d - b.p.d)[0];
  if (junction && junction.p.d < 220) plan.sites.push({ id: iiit.id, name: iiit.name, x: junction.p.x, z: junction.p.z, phase: iiit.phase });
  const open = constructionOpenRoads(applyConstructionRoads(roads, plan));
  const clear = roadStructureClearance(open);
  plan.piers = plan.piers.filter(p => clear.clear({ x: p.x, z: p.z, r: 1.15 }, 0, 10.5));
  return plan;
}

interface Drawing {
  B: Record<'st' | 'marks' | 'park', TiledBatch>; signs: SignEntry[];
  wall: (wall: Wall) => void; obstacle: (x: number, z: number, radius: number, top: number) => void;
  clear: ReturnType<typeof roadStructureClearance>;
  occupied?: (x: number, z: number, padding: number) => boolean;
}
export function drawConstruction(plan: ConstructionPlan, roads: RoadEdge[], tile: [number, number], ctx: Drawing) {
  const counts = { barriers: 0, piers: 0, excavationSites: 0 };
  const { B, signs } = ctx, inside = (x: number, z: number) => Math.floor(x / 1000) === tile[0] && Math.floor(z / 1000) === tile[1];
  const openClearance = roadStructureClearance(constructionOpenRoads(roads));
  const toPoint = (e: RoadEdge, i: number, u: number, off: number): XZ => {
    const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [a[0] + (b[0] - a[0]) * u + (b[1] - a[1]) / len * off, a[1] + (b[1] - a[1]) * u - (b[0] - a[0]) / len * off];
  };
  const patch = (p: XZ, hx: number, hz: number, w: number, l: number, color: string, y = .13) => B.marks.box(p[0], y, p[1], w, .025, l, color, { ry: Math.atan2(hx, hz) });
  for (const e of roads) {
    const work = e.workZone; if (!work) continue;
    const side = Math.sign(work.laneOffset), inner = work.laneOffset - side * (work.width / 2 + .8);
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < .5) continue;
      const hx = (b[0] - a[0]) / len, hz = (b[1] - a[1]) / len;
      const n = Math.max(1, Math.ceil(len / 4));
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, mid = toPoint(e, i, (u0 + u1) / 2, inner);
        if (!inside(...mid)) continue;
        // Leave crossing-street mouths open. Never make a transverse wall.
        const crossed = roads.some(o => o.id !== e.id && !o.workZone && !o.elev?.some(y => y > 1.2) && project(o, ...mid).d < o.w / 2 + 3);
        if (crossed || !openClearance.clear({ x: mid[0], z: mid[1], hx, hz, hw: .2, hl: len / n / 2 + .02 }, 0, .93)) continue;
        const p = toPoint(e, i, u0, inner), q = toPoint(e, i, u1, inner), l = len / n;
        B.st.box(mid[0], .48, mid[1], .38, .9, l + .015, k % 2 ? '#f2eee5' : '#ed813b', { ry: Math.atan2(hx, hz) });
        counts.barriers++;
        ctx.wall({ ax: p[0], az: p[1], bx: q[0], bz: q[1], y0a: 0, y0b: 0, y1a: .93, y1b: .93, kind: 'median' });
        const closedMid = toPoint(e, i, (u0 + u1) / 2, (inner - side * e.w / 2) / 2);
        patch(closedMid, hx, hz, Math.max(.3, e.w / 2 + inner * side - .4), l, '#9b8a70', .125);
        const boundary = toPoint(e, i, (u0 + u1) / 2, work.laneOffset - side * (work.width / 2 - .15));
        patch(boundary, hx, hz, .13, l, '#f6b932', .15);
      }
      const mid = toPoint(e, i, .5, side * (e.w / 2 + 1.0));
      if (inside(...mid) && len > 32 && hash(e.id + i) % 3 === 0 && ctx.clear.clear({ x: mid[0], z: mid[1], r: .6 }, 0, 2.8)) {
        const direction = e.oneway === 'forward' ? -1 : 1, fx = hx * direction, fz = hz * direction;
        B.st.box(mid[0], 1.15, mid[1], .09, 2.3, .09, '#4e4e4e');
        signs.push({ id: `work_${e.id}_${i}`, text: 'ROAD WORKS · 25 · KEEP TO OPEN LANE', bg: '#f1aa2f', fg: '#27201c', c: [mid[0], 2.3, mid[1]], right: [-fz, 0, fx], up: [0, 1, 0], w: 2.6, h: 1.3 });
      }
    }
  }
  for (const p of plan.piers) {
    if (!inside(p.x, p.z)) continue;
    counts.piers++;
    B.st.add(TPL.cyl, p.x, 4.9, p.z, 1.05, 9.8, 1.05, '#b8b7b2');
    B.st.box(p.x, 9.9, p.z, 12, 1.15, 2.8, '#c5c3bd', { ry: Math.atan2(p.hx, p.hz) });
    ctx.obstacle(p.x, p.z, 1.1, 10.5);
    for (const side of [-1, 1]) for (const end of [-1, 1]) B.st.box(p.x + p.hz * side * 4.8 + p.hx * end, 10.8, p.z - p.hx * side * 4.8 + p.hz * end, .065, .7, .065, '#615b52');
    if (p.scaffold) for (const side of [-1, 1]) {
      const x = p.x + p.hz * side * 1.7, z = p.z - p.hx * side * 1.7;
      B.st.box(x, 4.5, z, .12, 9, .12, '#d1a22d');
      for (let y = 1; y < 9; y += 1.7) B.st.box(p.x, y, p.z, 3.5, .1, .1, '#9e7c32', { ry: Math.atan2(p.hx, p.hz) });
    }
  }
  // The IIIT construction scene occupies a clear shoulder, never a random lane.
  for (const site of plan.sites.filter(s => s.phase === 'excavation')) {
    const road = roads.filter(e => !e.elev?.some(y => y > 1.2)).map(e => ({ e, p: project(e, site.x, site.z) })).sort((a, b) => a.p.d - b.p.d)[0]; if (!road) continue;
    for (const side of [1, -1]) {
      const { p, e } = road, x = p.x + p.hz * side * (e.w / 2 + 4.8), z = p.z - p.hx * side * (e.w / 2 + 4.8);
      if (!inside(x, z) || ctx.occupied?.(x, z, 12.5) || !ctx.clear.clear({ x, z, hx: p.hx, hz: p.hz, hw: 3.4, hl: 12 }, 0, 7)) continue;
      counts.excavationSites++;
      B.park.box(x, .06, z, 6.5, .09, 23, '#9a7d56', { ry: Math.atan2(p.hx, p.hz) });
      for (let d = -10; d <= 10; d += 4) {
        const px = x + p.hx * d, pz = z + p.hz * d;
        B.st.box(px, .5, pz, .45, 1, 3.5, '#ee8b3a', { ry: Math.atan2(-p.hz, p.hx) }); ctx.obstacle(px, pz, .65, 1);
      }
      B.st.box(x, 3, z, 1.2, 6, 1.2, '#aaa69e'); ctx.obstacle(x, z, .9, 6);
      signs.push({ id: `work_site_${site.id}_${side}`, text: 'IIIT JUNCTION · FLYOVER WORKS IN PROGRESS', bg: '#e9a83a', fg: '#27201c', c: [x, 4.5, z], right: [-p.hz, 0, p.hx], up: [0, 1, 0], w: 6, h: 1.4 });
    }
  }
  return counts;
}

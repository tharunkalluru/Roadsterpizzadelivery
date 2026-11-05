import type { RoadEdge, XZ } from './types';
import { roadRibbon } from './bridge-clearance';
import { roadQuadHeight, type RoadQuad } from './road-surface';
import mapped from './bridge-level-data.json';
import type { JoinedWidthComponent } from './road-approach-widths';

// A ramp and a modeled zero-height branch can share pavement even while their
// centre lines diverge. Equal endpoint heights alone leave intersecting asphalt
// through the car body. Preserve a compatible generated datum through a bounded
// finite apron before the estimated climb. Zero is a model datum, not surveyed
// ground evidence; mapped levels and existing crossing clearances stay protected.
const MAX_RUN = 140;
export const JOIN_CONTROL_GRADE = .075;
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function overlap(a: XZ[], b: XZ[]) {
  const sign = Math.sign(cross(b[0], b[1], b[2]));
  if (!sign) return [];
  for (let i = 0; i < 3 && a.length; i++) {
    const out: XZ[] = [], p = b[i], q = b[(i + 1) % 3];
    for (let j = 0; j < a.length; j++) {
      const u = a[j], v = a[(j + 1) % a.length], du = sign * cross(p, q, u), dv = sign * cross(p, q, v);
      if (du >= -1e-8) out.push(u);
      if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
    }
    a = out;
  }
  return a;
}
export interface JoinedApproachReport {
  pairs: number; roads: number; fixedPoints: number; maximumRun: number;
  repairs: { node: string; roads: [string, string]; runs: [number, number] }[];
  unresolved: { node: string; roads: [string, string]; reason: string }[];
}
export function joinedGroundApproaches(roads: RoadEdge[], baseline?: { roads: RoadEdge[]; crossings: { roads: [string, string]; x: number; z: number }[] }, widthComponents: JoinedWidthComponent[] = []) {
  const fixed = new Map<RoadEdge, Set<number>>(), runsByRoad = new Map<RoadEdge, [number, number]>(), ends = new Map<string, { e: RoadEdge; end: number; step: number }[]>();
  const report: JoinedApproachReport = { pairs: 0, roads: 0, fixedPoints: 0, maximumRun: 0, repairs: [], unresolved: [] };
  const levels = new Map(mapped.roads.map(e => [e.id, new Map(e.points.map(p => [p[0], p[3]]))]));
  interface Span { e: RoadEdge; i: number; x: number; z: number; dx: number; dz: number; length: number; distance: number }
  const grid = new Map<string, Span[]>(), spans = new Map<RoadEdge, Span[]>();
  for (const e of roads) {
    const list: Span[] = []; let distance = 0;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < .001) continue;
      const s = { e, i, x: a[0], z: a[1], dx: b[0] - a[0], dz: b[1] - a[1], length, distance }; list.push(s); distance += length;
      for (let x = Math.floor(Math.min(a[0], b[0]) / 120); x <= Math.floor(Math.max(a[0], b[0]) / 120); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / 120); z <= Math.floor(Math.max(a[1], b[1]) / 120); z++) (grid.get(`${x},${z}`) || grid.set(`${x},${z}`, []).get(`${x},${z}`)!).push(s);
    }
    spans.set(e, list);
  }
  const headroom = new Map<RoadEdge, { lower: string; distance: number; lowerDistance: number; lowerY: number; required: number; x:number; z:number }[]>();
  const crossingControls = (e: RoadEdge) => {
    const cached = headroom.get(e); if (cached) return cached;
    const hits: { lower: string; distance: number; lowerDistance: number; lowerY: number; required: number; x:number; z:number }[] = [];
    for (const a of spans.get(e) || []) {
      const nearby = new Set<Span>();
      for (let x = Math.floor(Math.min(a.x, a.x + a.dx) / 120); x <= Math.floor(Math.max(a.x, a.x + a.dx) / 120); x++) for (let z = Math.floor(Math.min(a.z, a.z + a.dz) / 120); z <= Math.floor(Math.max(a.z, a.z + a.dz) / 120); z++) for (const b of grid.get(`${x},${z}`) || []) nearby.add(b);
      for (const b of nearby) {
        if (b.e === e) continue;
        const det = a.dx * b.dz - a.dz * b.dx; if (Math.abs(det) < 1e-7) continue;
        const dx = b.x - a.x, dz = b.z - a.z, t = (dx * b.dz - dz * b.dx) / det, u = (dx * a.dz - dz * a.dx) / det;
        if (t < -1e-7 || t > 1.0000001 || u < -1e-7 || u > 1.0000001) continue;
        const ya = (e.elev?.[a.i - 1] || 0) + ((e.elev?.[a.i] || 0) - (e.elev?.[a.i - 1] || 0)) * t;
        const yb = (b.e.elev?.[b.i - 1] || 0) + ((b.e.elev?.[b.i] || 0) - (b.e.elev?.[b.i - 1] || 0)) * u;
        if (ya - yb >= 4.5) hits.push({ lower: b.e.id, distance: a.distance + a.length * t, lowerDistance: b.distance + b.length * u, lowerY: yb, required: Math.min(5.85, ya - yb),x:a.x+a.dx*t,z:a.z+a.dz*t });
      }
    }
    headroom.set(e, hits); return hits;
  };
  // Ground constraints also travel through connected neighbouring approaches.
  // Check that finite graph distance, not just the edited edge in isolation.
  const networkEnds = new Map<string, { e: RoadEdge; end: 0 | 1; y: number }[]>(), endKeys = new Map<RoadEdge, [string, string]>(), network = new Map<string, { node: string; length: number; e: RoadEdge }[]>();
  for (const e of roads) {
    endKeys.set(e, [`${e.id}:a`, `${e.id}:b`]);
    for (const [node, end, i] of [[e.from, 0, 0], [e.to, 1, e.pts.length - 1]] as [string | null, 0 | 1, number][]) if (node) (networkEnds.get(node) || networkEnds.set(node, []).get(node)!).push({ e, end, y: e.elev?.[i] || 0 });
  }
  for (const [node, entries] of networkEnds) {
    entries.sort((a, b) => a.y - b.y); let group = 0, datum = entries[0].y;
    for (const entry of entries) { if (entry.y - datum > 1.5) { group++; datum = entry.y; } endKeys.get(entry.e)![entry.end] = `${node}:${group}`; }
  }
  const roadLength = (e: RoadEdge) => { const s = spans.get(e)?.at(-1); return s ? s.distance + s.length : 0; };
  for (const e of roads) {
    const [a, b] = endKeys.get(e)!, length = roadLength(e);
    (network.get(a) || network.set(a, []).get(a)!).push({ node: b, length, e });
    (network.get(b) || network.set(b, []).get(b)!).push({ node: a, length, e });
  }
  const constraints = roads.filter(e => e.elev?.some(y => y >= 4.5)).flatMap(e => crossingControls(e).map(c => ({ ...c, e, length: roadLength(e) })));
  if (baseline) {
    const byId = new Map(roads.map(e => [e.id, e])), oldById = new Map(baseline.roads.map(e => [e.id, e]));
    interface Triangle { quad: RoadQuad; a: XZ; dx: number; dz: number; distance: number; length: number }
    const indices = new Map<string, { triangles: Triangle[]; cells: Map<string, Triangle[]> }>();
    const index = (e: RoadEdge) => {
      const cached = indices.get(e.id); if (cached) return cached;
      const result = { triangles: [] as Triangle[], cells: new Map<string, Triangle[]>() }; let distance = 0;
      for (const [i, q] of roadRibbon(e, baseline.roads).quads.entries()) {
        const a = e.pts[i], b = e.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        for (const [u, v, w] of [[0, 1, 2], [0, 2, 3]]) {
          const quad: RoadQuad = [q[u], q[v], q[w], q[w]], triangle = { quad, a, dx, dz, distance, length }; result.triangles.push(triangle);
          for (let x = Math.floor(Math.min(...quad.map(p => p[0])) / 40); x <= Math.floor(Math.max(...quad.map(p => p[0])) / 40); x++) for (let z = Math.floor(Math.min(...quad.map(p => p[2])) / 40); z <= Math.floor(Math.max(...quad.map(p => p[2])) / 40); z++) (result.cells.get(`${x},${z}`) || result.cells.set(`${x},${z}`, []).get(`${x},${z}`)!).push(triangle);
        }
        distance += length;
      }
      indices.set(e.id, result); return result;
    };
    const along = (t: Triangle, p: XZ) => t.distance + t.length * Math.max(0, Math.min(1, ((p[0] - t.a[0]) * t.dx + (p[1] - t.a[1]) * t.dz) / (t.length * t.length || 1)));
    // Preserve all previously accepted finite overlap corners, including
    // transverse edges that never intersect another road's centreline.
    const pairs = new Map(baseline.crossings.map(c => [c.roads.join('/'), c.roads]));
    for (const pair of pairs.values()) {
      const e = byId.get(pair[0]), upper = oldById.get(pair[0]), lower = oldById.get(pair[1]); if (!e || !upper || !lower) continue;
      const A = index(upper), B = index(lower);
      for (const a of A.triangles) {
        const near = new Set<Triangle>();
        for (let x = Math.floor(Math.min(...a.quad.map(p => p[0])) / 40); x <= Math.floor(Math.max(...a.quad.map(p => p[0])) / 40); x++) for (let z = Math.floor(Math.min(...a.quad.map(p => p[2])) / 40); z <= Math.floor(Math.max(...a.quad.map(p => p[2])) / 40); z++) for (const b of B.cells.get(`${x},${z}`) || []) near.add(b);
        for (const b of near) {
          const poly = overlap(a.quad.slice(0, 3).map(p => [p[0], p[2]]), b.quad.slice(0, 3).map(p => [p[0], p[2]]));
          if (poly.length < 3 || Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2 < .025) continue;
          const center: XZ = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
          for (const p of [...poly, center]) {
            const ya = roadQuadHeight(a.quad, ...p), yb = roadQuadHeight(b.quad, ...p); if (ya === null || yb === null || ya - yb < 4.5) continue;
            constraints.push({ e, lower: lower.id, distance: along(a, p), lowerDistance: along(b, p), length: roadLength(e), lowerY: yb, required: Math.min(5.85, ya - yb),x:p[0],z:p[1] });
          }
        }
      }
    }
  }
  const roadById = new Map(roads.map(e => [e.id,e])), pavementMasks = new Map<string,Map<string,RoadQuad[]>>();
  const stillPaved = (e:RoadEdge,x:number,z:number) => {
    if(!e.joinedPavement)return true;
    let grid=pavementMasks.get(e.id);
    if(!grid){grid=new Map();for(const q of roadRibbon(e,roads).quads)for(let a=Math.floor(Math.min(...q.map(p=>p[0]))/40);a<=Math.floor(Math.max(...q.map(p=>p[0]))/40);a++)for(let b=Math.floor(Math.min(...q.map(p=>p[2]))/40);b<=Math.floor(Math.max(...q.map(p=>p[2]))/40);b++)(grid.get(`${a},${b}`)||grid.set(`${a},${b}`,[]).get(`${a},${b}`)!).push(q);pavementMasks.set(e.id,grid);}
    return(grid.get(`${Math.floor(x/40)},${Math.floor(z/40)}`)||[]).some(q=>roadQuadHeight(q,x,z)!==null);
  };
  for (const e of roads) {
    if (e.pts.length < 2 || /^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;
    for (const [node, end, step] of [[e.from, 0, 1], [e.to, e.pts.length - 1, -1]] as [string | null, number, number][]) {
      if (!node || Math.abs(e.elev?.[end] || 0) > .001) continue;
      (ends.get(node) || ends.set(node, []).get(node)!).push({ e, end, step });
    }
  }
  const ribbonCache = new Map<RoadEdge, ReturnType<typeof roadRibbon>>();
  const approach = (entry: { e: RoadEdge; end: number; step: number }) => {
    const { e, end, step } = entry, spans: { i: number; a: number; b: number; from: number; to: number; quad: XZ[] }[] = [];
    let ribbon = ribbonCache.get(e); if (!ribbon) { ribbon = roadRibbon(e, roads); ribbonCache.set(e, ribbon); }
    let distance = 0;
    for (let a = end, b = end + step; b >= 0 && b < e.pts.length && distance < MAX_RUN; a = b, b += step) {
      const length = Math.hypot(e.pts[b][0] - e.pts[a][0], e.pts[b][1] - e.pts[a][1]), i = Math.min(a, b);
      spans.push({ i, a, b, from: distance, to: distance + length, quad: ribbon.quads[i].map(p => [p[0], p[2]]) }); distance += length;
    }
    return spans;
  };
  for (const [node, entries] of ends) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const A = entries[i], B = entries[j], pair: [string, string] = [A.e.id, B.e.id];
    const raisedA = !!A.e.elev?.some(y => y > 1.2), raisedB = !!B.e.elev?.some(y => y > 1.2);
    if (raisedA === raisedB) continue; // A modeled zero-height branch joining one estimated ramp.
    if ([A.e, B.e].some(e => e.expressway || levels.has(e.id) || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || '')))) continue;
    const p = A.e.pts[A.end], q = B.e.pts[B.end]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > .15) continue;
    const a = A.e.pts[A.end + A.step], b = B.e.pts[B.end + B.step], ax = a[0] - p[0], az = a[1] - p[1], bx = b[0] - q[0], bz = b[1] - q[1];
    if ((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1) < .9) continue;
    const aa = approach(A), bb = approach(B), hits: [number, number, number, number][] = [];
    const project = (entry: typeof A, span: typeof aa[number], p: XZ) => {
      const a = entry.e.pts[span.a], b = entry.e.pts[span.b], dx = b[0] - a[0], dz = b[1] - a[1];
      return span.from + (span.to - span.from) * Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    };
    for (let ai = 0; ai < aa.length; ai++) for (let bi = 0; bi < bb.length; bi++) {
      let area = 0, runA = 0, runB = 0;
      for (const at of [[0, 1, 2], [0, 2, 3]]) for (const bt of [[0, 1, 2], [0, 2, 3]]) {
        const poly = overlap(at.map(k => aa[ai].quad[k]), bt.map(k => bb[bi].quad[k]));
        area += Math.abs(poly.reduce((v, r, k) => { const s = poly[(k + 1) % poly.length]; return v + r[0] * s[1] - r[1] * s[0]; }, 0)) / 2;
        for (const p of poly) { runA = Math.max(runA, project(A, aa[ai], p)); runB = Math.max(runB, project(B, bb[bi], p)); }
      }
      if (area > .025) hits.push([ai, bi, runA, runB]);
    }
    if (!hits.some(([a, b]) => a === 0 && b === 0)) continue;
    // Only the connected overlap at this node is a merge. A second crossing
    // farther along the same pair cannot inherit permission from a remote node.
    const connected = new Set<string>(['0,0']); let changed = true;
    while (changed) { changed = false; for (const [a, b] of hits) if (!connected.has(`${a},${b}`) && hits.some(([c, d]) => connected.has(`${c},${d}`) && Math.abs(a - c) <= 1 && Math.abs(b - d) <= 1)) { connected.add(`${a},${b}`); changed = true; } }
    const local = hits.filter(([a, b]) => connected.has(`${a},${b}`));
    const component=widthComponents.find(c=>c.node===node&&pair.includes(c.ramp)&&pair.includes(c.branch));
    const runs: [number, number] = component ? A.e.id===component.ramp ? component.runs : [component.runs[1],component.runs[0]] : [Math.max(...local.map(h => h[2])) + 2, Math.max(...local.map(h => h[3])) + 2];
    if (Math.max(...runs) > MAX_RUN) {
      report.unresolved.push({ node, roads: pair, reason: 'Merge exceeds bounded approach.' }); continue;
    }
    const upper = raisedA ? A : B, upperRun = runs[raisedA ? 0 : 1], upperLength = roadLength(upper.e), recovery = Math.max(...upper.e.elev!) / JOIN_CONTROL_GRADE + 20;
    const window: [number, number] = upper.end === 0 ? [upperRun, Math.min(upperLength, upperRun + recovery)] : [Math.max(0, upperLength - upperRun - recovery), upperLength - upperRun];
    const cost = (e: RoadEdge, from: number, to: number) => {
      const a = Math.min(from, to), b = Math.max(from, to), overlap = e === upper.e ? Math.max(0, Math.min(b, window[1]) - Math.max(a, window[0])) : 0;
      return .065 * (b - a) + (JOIN_CONTROL_GRADE - .065) * overlap;
    };
    const distances = new Map<string, number>(), queue: { node: string; distance: number }[] = [];
    const offer = (node: string, distance: number) => { if (distance < (distances.get(node) ?? Infinity) && distance < 25) { distances.set(node, distance); queue.push({ node, distance }); } };
    const floorEntries: {entry:typeof A;run:number}[]=component?[{entry:upper,run:component.runs[0]},...component.members.filter(m=>m.start<component.runs[1]).map(m=>{const e=roadById.get(m.id)!;const end=m.end===0?0:e.pts.length-1;return{entry:{e,end,step:end===0?1:-1},run:Math.min(m.length,component.runs[1]-m.start)};})]:[{entry:A,run:runs[0]},{entry:B,run:runs[1]}];
    for (const {entry,run} of floorEntries) {
      const [from, to] = endKeys.get(entry.e)!, length = roadLength(entry.e);
      offer(from, entry.end === 0 ? 0 : cost(entry.e, 0, Math.max(0, length - run))); offer(to, entry.end === 0 ? cost(entry.e, Math.min(run, length), length) : 0);
    }
    while (queue.length) { queue.sort((a, b) => b.distance - a.distance); const { node, distance } = queue.pop()!; if (distance !== distances.get(node)) continue; for (const edge of network.get(node) || []) offer(edge.node, distance + cost(edge.e, 0, edge.length)); }
    if (constraints.some(c => {
      const lowerRoad=roadById.get(c.lower);
      if(lowerRoad&&(!stillPaved(c.e,c.x,c.z)||!stillPaved(lowerRoad,c.x,c.z)))return false;
      if(component){
        const local=(id:string,s:number)=>{if(id===component.ramp){const e=roadById.get(id)!;return{ramp:true,d:component.rampEnd===0?s:roadLength(e)-s};}const m=component.members.find(m=>m.id===id);return m?{ramp:false,d:m.start+(m.end===0?s:m.length-s)}:null;};
        const a=local(c.e.id,c.distance),b=local(c.lower,c.lowerDistance);
        if(a&&b&&a.ramp!==b.ramp&&(a.ramp?a.d:b.d)<=component.runs[0]+1e-6&&(a.ramp?b.d:a.d)<=component.runs[1]+1e-6)return false;
      }
      const upperEntry = A.e === c.e ? A : B.e === c.e ? B : null, lowerEntry = A.e.id === c.lower ? A : B.e.id === c.lower ? B : null;
      if (upperEntry && lowerEntry) {
        const upperDistance = upperEntry.end === 0 ? c.distance : c.length - c.distance;
        const lowerDistance = lowerEntry.end === 0 ? c.lowerDistance : roadLength(lowerEntry.e) - c.lowerDistance;
        if (upperDistance <= runs[upperEntry === A ? 0 : 1] + 1e-6 && lowerDistance <= runs[lowerEntry === A ? 0 : 1] + 1e-6) return false;
      }
      const [from, to] = endKeys.get(c.e)!;
      let d = Math.min((distances.get(from) ?? Infinity) + cost(c.e, 0, c.distance), (distances.get(to) ?? Infinity) + cost(c.e, c.distance, c.length));
      for (const {entry,run} of floorEntries) if (entry.e === c.e) d = Math.min(d, entry.end === 0 ? cost(c.e, Math.min(run, c.distance), c.distance) : cost(c.e, c.distance, Math.max(c.distance, c.length - run)));
      return d < c.lowerY + c.required + .05;
    })) {
      report.unresolved.push({ node, roads: pair, reason: 'Insufficient remaining ramp run to preserve an independently separated crossing.' }); continue;
    }
    for (const {entry,run} of floorEntries) {
      const distances = runsByRoad.get(entry.e) || [0, 0], side = entry.end === 0 ? 0 : 1;
      distances[side] = Math.max(distances[side], run); runsByRoad.set(entry.e, distances);
    }
    report.pairs++; report.maximumRun = Math.max(report.maximumRun, ...runs); report.repairs.push({ node, roads: pair, runs });
  }
  const grades = new Map<string, [number, number][]>();
  const result = roads.map(e => {
    const runs = runsByRoad.get(e); if (!runs) return e;
    const arc = [0]; for (let i = 1; i < e.pts.length; i++) arc.push(arc[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
    const length = arc.at(-1)!, recovery = Math.max(...e.elev || [0]) / JOIN_CONTROL_GRADE + 20, ranges: [number, number][] = [];
    if (e.elev?.some(y => y > 1.2)) {
      if (runs[0]) ranges.push([runs[0], Math.min(length, runs[0] + recovery)]);
      if (runs[1]) ranges.push([Math.max(0, length - runs[1] - recovery), length - runs[1]]);
      grades.set(e.id, ranges);
    }
    const critical = [...new Set([Math.min(length, runs[0]), Math.max(0, length - runs[1]), ...ranges.flat()])], pts: XZ[] = [e.pts[0]], elev = [e.elev?.[0] || 0], distances = [0];
    for (let i = 1; i < e.pts.length; i++) {
      for (const s of [...critical.filter(s => s > arc[i - 1] + 1e-6 && s < arc[i] - 1e-6), arc[i]].sort((a, b) => a - b)) {
        const u = (s - arc[i - 1]) / (arc[i] - arc[i - 1] || 1);
        pts.push(s === arc[i] ? e.pts[i] : [e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * u, e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * u]);
        elev.push((e.elev?.[i - 1] || 0) + ((e.elev?.[i] || 0) - (e.elev?.[i - 1] || 0)) * u); distances.push(s);
      }
    }
    const model = { ...e, pts, elev }, points = new Set<number>();
    distances.forEach((s, i) => { if (runs[0] && s <= runs[0] + 1e-6 || runs[1] && length - s <= runs[1] + 1e-6) { elev[i] = 0; points.add(i); } });
    fixed.set(model, points); return model;
  });
  report.roads = fixed.size; report.fixedPoints = [...fixed.values()].reduce((n, p) => n + p.size, 0);
  return { roads: result, fixed, grades, report };
}

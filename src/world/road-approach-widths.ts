import type { RoadEdge, XZ } from './types';
import { roadRibbon } from './bridge-clearance';
import source from './road-width-source-data.json';
import mapped from './bridge-level-data.json';
import laneSource from './road-lane-source-data.json';
import sourceCuts from './road-source-geodesic-data.json';
import { sourceRoadDistanceAfter, type SourceRoadCutRepair } from './road-source-geodesic';

const SCAN = 340, TAPER = 30, WIDTH = 7;
export interface GroundBranchMember { id: string; end: number; start: number; length: number }
export interface JoinedWidthComponent {
  node: string; ramp: string; rampEnd: number; branch: string; members: GroundBranchMember[];
  originalRuns: [number, number]; runs: [number, number];
}
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function clip(a: XZ[], b: XZ[]) {
  const sign = Math.sign(cross(b[0], b[1], b[2])); if (!sign) return [];
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
const lengthOf = (e: RoadEdge) => e.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]), 0);
const mappedIds=new Set(mapped.roads.map(e=>e.id));
const protectedRoad = (e: RoadEdge) => !!e.expressway || mappedIds.has(e.id) || !!e.elev?.some(y=>y<-.001) || !!(e as RoadEdge & { laneEvidence?: unknown }).laneEvidence || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || ''));
const sourceCutById=new Map(sourceCuts.roads.map(p=>[p.id,p])),sourceSegmentById=new Map(sourceCuts.sources.map(p=>[p.id,p]));
/** Lane evidence uses the same physical source frame as the corrected cut.
 * The whole-way case retains its tagged capacity across an extended cut. */
export function joinedSourceLaneIntervals(e:RoadEdge) {
  if(e.sourceLaneIntervals?.length)return e.sourceLaneIntervals;
  const rows=laneSource.roads.find(p=>p.id===e.id)?.intervals;if(!rows)return undefined;
  const cut=sourceCutById.get(e.id);if(!cut||JSON.stringify(e.pts)!==JSON.stringify(cut.pts))return rows;
  const provenance=sourceSegmentById.get(cut.sourceSegmentID)?.provenance;
  const wholeWay=rows.length===1&&provenance?.length===1&&!provenance[0].between&&rows[0].sourceURL.endsWith('/'+provenance[0].record_id.slice(1).replace('@','/')+'.json');
  return rows.map(p=>({...p,from:wholeWay?0:sourceRoadDistanceAfter(cut as unknown as SourceRoadCutRepair,p.from).distance,
    to:wholeWay?cut.correctedArc.at(-1)!:sourceRoadDistanceAfter(cut as unknown as SourceRoadCutRepair,p.to).distance}));
}
export function prepareJoinedApproachWidths(roads: RoadEdge[]) {
  roads=roads.map(e=>{const intervals=joinedSourceLaneIntervals(e);return intervals?{...e,sourceLaneIntervals:intervals}:e;});
  const estimates = new Map(source.roads.map(r => [r.id.slice(0, 12), r])), ends = new Map<string, { e: RoadEdge; end: number }[]>();
  const supported = (e: RoadEdge) => estimates.get(e.id.split('_')[0])?.widthDeclared === false && !protectedRoad(e) && e.lanes === 2 && !!e.oneway && e.w >= WIDTH && e.w <= 10;
  for (const e of roads) if (e.pts.length >= 2) for (const [node, end] of [[e.from, 0], [e.to, e.pts.length - 1]] as [string | null, number][]) if (node) (ends.get(node) || ends.set(node, []).get(node)!).push({ e, end });
  type Entry = { e: RoadEdge; end: number };
  const raised = (e: RoadEdge) => !!e.elev?.some(y => y > 1.2);
  const heading = ({ e, end }: Entry): XZ => { const p = e.pts[end], q = e.pts[end ? end - 1 : 1], d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / d, (q[1] - p[1]) / d]; };
  interface Span { quad: XZ[]; a: XZ; dx: number; dz: number; from: number; to: number }
  const spans = (entry: Entry, narrow: boolean, offset = 0) => {
    const { e, end } = entry, model: RoadEdge = narrow ? { ...e, w: WIDTH, joinedPavement: { sourceWidth: e.w, originalWidth: WIDTH, intervals: [[-Infinity, Infinity]], taper: TAPER, release: source.release } } : e;
    const quads = roadRibbon(model, roads).quads, result: Span[] = [], step = end === 0 ? 1 : -1; let distance = offset;
    for (let a = end, b = end + step; b >= 0 && b < e.pts.length && distance < SCAN; a = b, b += step) {
      const p = e.pts[a], q = e.pts[b], dx = q[0] - p[0], dz = q[1] - p[1], length = Math.hypot(dx, dz);
      result.push({ quad: quads[Math.min(a, b)].map(p => [p[0], p[2]]), a: p, dx, dz, from: distance, to: distance + length }); distance += length;
    }
    return result;
  };
  const run = (a: Span[], b: Span[]) => {
    const hits: { a: number; b: number; x: number; y: number }[] = [];
    const project = (s: Span, p: XZ) => s.from + (s.to - s.from) * Math.max(0, Math.min(1, ((p[0] - s.a[0]) * s.dx + (p[1] - s.a[1]) * s.dz) / (s.dx * s.dx + s.dz * s.dz || 1)));
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      let area = 0, x = 0, y = 0;
      for (const ai of [[0, 1, 2], [0, 2, 3]]) for (const bi of [[0, 1, 2], [0, 2, 3]]) {
        const poly = clip(ai.map(k => a[i].quad[k]), bi.map(k => b[j].quad[k]));
        area += Math.abs(poly.reduce((s, p, n) => { const q = poly[(n + 1) % poly.length]; return s + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
        for (const p of poly) { x = Math.max(x, project(a[i], p)); y = Math.max(y, project(b[j], p)); }
      }
      if (area > .025) hits.push({ a: i, b: j, x, y });
    }
    const connected = new Set<string>(); if (hits.some(h => h.a === 0 && h.b === 0)) connected.add('0,0');
    let changed = true; while (changed) { changed = false; for (const h of hits) if (!connected.has(`${h.a},${h.b}`) && hits.some(p => connected.has(`${p.a},${p.b}`) && Math.abs(h.a - p.a) <= 1 && Math.abs(h.b - p.b) <= 1)) { connected.add(`${h.a},${h.b}`); changed = true; } }
    const local = hits.filter(h => connected.has(`${h.a},${h.b}`));
    return local.length ? [Math.max(...local.map(h => h.x)) + 2, Math.max(...local.map(h => h.y)) + 2] as [number, number] : null;
  };
  const components: JoinedWidthComponent[] = [], intervals = new Map<RoadEdge, [number, number][]>();
  const addInterval = (e: RoadEdge, interval: [number, number]) => (intervals.get(e) || intervals.set(e, []).get(e)!).push(interval);
  for (const [node, entries] of ends) for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const A = entries[i], B = entries[j]; if (raised(A.e) === raised(B.e) || !supported(A.e) || !supported(B.e) || Math.abs(A.e.elev?.[A.end] || 0) > .001 || Math.abs(B.e.elev?.[B.end] || 0) > .001) continue;
    const ramp = raised(A.e) ? A : B, branch = raised(A.e) ? B : A, h = heading(ramp), k = heading(branch);
    if (h[0] * k[0] + h[1] * k[1] < .9) continue;
    const members: { entry: Entry; start: number; length: number }[] = [], seen = new Set<string>(); let entry: Entry | undefined = branch, distance = 0, ambiguous=false;
    while (entry && distance < SCAN && members.length < 8) {
      if (seen.has(entry.e.id)) break; seen.add(entry.e.id);
      const length = lengthOf(entry.e); members.push({ entry, start: distance, length }); distance += length;
      const end = entry.end === 0 ? entry.e.pts.length - 1 : 0, far = { e: entry.e, end }, inward = heading(far), nextNode = end === 0 ? entry.e.from : entry.e.to;
      const next=nextNode ? (ends.get(nextNode) || []).filter(n => !seen.has(n.e.id) && supported(n.e) && !raised(n.e) && !n.e.elev?.some(y => Math.abs(y) > .001)).map(n => ({ n, dot: -(heading(n)[0] * inward[0] + heading(n)[1] * inward[1]) })).filter(n => n.dot > .94) : [];
      const same=next.filter(n=>n.n.e.id.split('_')[0]===entry!.e.id.split('_')[0]);
      if(next.length>1&&same.length!==1){ambiguous=true;break;}
      entry=(same.length===1?same[0]:next[0])?.n;
    }
    if(ambiguous)continue;
    const full = run(spans(ramp, false), members.flatMap(m => spans(m.entry, false, m.start)));
    if(!full)continue;
    const capacityProtected=(e:RoadEdge,interval:[number,number])=>e.sourceLaneIntervals?.some(s=>s.lanes>2&&s.to>interval[0]-TAPER&&s.from<interval[1]+TAPER);
    const rampLength = lengthOf(ramp.e),rampInterval:[number,number]=ramp.end===0?[0,full[0]]:[rampLength-full[0],rampLength];
    if(capacityProtected(ramp.e,rampInterval)||members.some(m=>m.start<=full[1]+TAPER&&capacityProtected(m.entry.e,m.entry.end===0?[-m.start,full[1]-m.start]:[m.length+m.start-full[1],m.length+m.start])))continue;
    const narrow = run(spans(ramp, true), members.flatMap(m => spans(m.entry, true, m.start)));
    if (!full || !narrow || Math.max(...full) >= SCAN - 10 || Math.max(...narrow) >= SCAN - 10) continue;
    addInterval(ramp.e, ramp.end === 0 ? [0, full[0]] : [rampLength - full[0], rampLength]);
    for (const m of members) {
      if (m.start > full[1] + TAPER) break;
      addInterval(m.entry.e, m.entry.end === 0 ? [-m.start, full[1] - m.start] : [m.length + m.start - full[1], m.length + m.start]);
    }
    components.push({ node, ramp: ramp.e.id, rampEnd: ramp.end, branch: branch.e.id, members: members.map(m => ({ id: m.entry.e.id, end: m.entry.end, start: m.start, length: m.length })), originalRuns: full, runs: narrow });
  }
  const result = roads.map(e => {
    const ranges = intervals.get(e); if (!ranges) return e;
    const originalWidth = raised(e) ? Math.max(e.w, 8.4) : e.w, profile = { sourceWidth: e.w, originalWidth, intervals: ranges, taper: TAPER, release: source.release };
    const pts:XZ[]=[e.pts[0]],elev:number[]=[e.elev?.[0]||0];let distance=0;
    const knots=ranges.flatMap(([a,b])=>[a-TAPER,a,b,b+TAPER]);
    for(let i=1;i<e.pts.length;i++){
      const a=e.pts[i-1],b=e.pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/2));
      const samples=[...Array.from({length:count},(_,j)=>distance+length*(j+1)/count),...knots.filter(s=>s>distance+1e-6&&s<distance+length-1e-6)].sort((a,b)=>a-b);let previous=distance;
      for(const s of samples){if(s-previous<1e-6)continue;previous=s;const u=(s-distance)/(length||1);pts.push(Math.abs(s-distance-length)<1e-6?b:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]);elev.push((e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*u);}
      distance+=length;
    }
    return { ...e, pts, elev:e.elev?elev:null, w: WIDTH, joinedPavement: profile };
  });
  return { roads: result, components };
}

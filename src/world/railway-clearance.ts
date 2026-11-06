import type { RoadEdge, XZ } from './types';
import type { RailProfile } from './railway-geometry';
import { railwayUnderpassAt, type RailwayUnderpassEvidence } from './railway-evidence';

// These are conservative game envelopes, not surveyed bridge altitudes.
// Coach roof4.175 + railbase.11 + half-coach grade.282 + road soffit.9
// + full-coach road-grade allowance.732 needs6.199m;6.8m leaves margin.
// The longitudinal allowance keeps an approaching coach clear of an oblique
// soffit before its center reaches the crossing. Rail girders extend1.3m down.
export const ROAD_OVER_RAIL = 6.8, RAIL_OVER_ROAD = 6.5;
const RAIL_HALF_ENVELOPE = 2.6, ROAD_GRADE = .065, CELL = 100, MAX_EXTRA_LIFT = 18;
interface Edge { pts: XZ[]; elev: number[] | null; id: string; from?: string | null; to?: string | null }
interface Ref { r: number; i: number }
interface Span extends Ref { a: XZ; b: XZ; hx: number; hz: number; len: number }
interface Constraint { road: Span; rail: Span; roadRange: [number, number]; railRange: [number, number]; above: 'road' | 'rail'; estimatedOrder: boolean; key: string }
export interface RailwayClearanceReport {
  finiteOverlaps: number; atGrade: number; separated: number; modeledOrder: number; raisedRoads: number; raisedRails: number;
  loweredRoads: number; underpassRoadIds: string[]; unverifiedRoadHumps: string[];
  unverifiedUnderpassCrossings: { road: string; rail: string; x: number; z: number; reason: string }[];
  unresolved: { road: string; rail: string; x: number; z: number; gap: number; required: number; reason: string }[];
  roadCrossings: { checked: number; repaired: number; unresolved: { upper: string; lower: string; x: number; z: number; gap: number }[] };
  uncertainty: string;
}
class Heap {
  a: (Ref & { y: number })[] = [];
  push(v: Ref & { y: number }) { let i = this.a.length; this.a.push(v); while (i) { const p = (i - 1) >> 1; if (this.a[p].y >= v.y) break; this.a[i] = this.a[p]; i = p; } this.a[i] = v; }
  pop() { const out = this.a[0], v = this.a.pop()!; if (this.a.length) { let i = 0; while (i * 2 + 1 < this.a.length) { let c = i * 2 + 1; if (c + 1 < this.a.length && this.a[c + 1].y > this.a[c].y) c++; if (this.a[c].y <= v.y) break; this.a[i] = this.a[c]; i = c; } this.a[i] = v; } return out; }
}
class Heights {
  changed = new Map<number, number[]>();
  private ceilings = new Map<number, number[]>();
  private joins = new Map<string, Ref[]>();
  private heap = new Heap();
  constructor(readonly edges: Edge[], private grade: number, private rail: boolean) {
    edges.forEach((e, r) => {
      if (e.pts.length < 2) return;
      for (const i of [0, e.pts.length - 1]) {
        const p = e.pts[i], id = rail ? `${p[0].toFixed(3)},${p[1].toFixed(3)}` : i === 0 ? e.from : e.to;
        if (id) { const list = this.joins.get(id) || []; list.push({ r, i }); this.joins.set(id, list); }
      }
    });
  }
  value(r: number, i: number) { return this.changed.get(r)?.[i] ?? this.edges[r].elev?.[i] ?? 0; }
  interval(span: Span, range: [number, number]) { const a = this.value(span.r, span.i - 1), b = this.value(span.r, span.i); return range.map(u => a + (b - a) * u); }
  private neighbors(r: number, i: number) {
    const e = this.edges[r], out: (Ref & { d: number })[] = [];
    for (const j of [i - 1, i + 1]) if (j >= 0 && j < e.pts.length) out.push({ r, i: j, d: Math.hypot(e.pts[i][0] - e.pts[j][0], e.pts[i][1] - e.pts[j][1]) });
    if (i !== 0 && i !== e.pts.length - 1) return out;
    const p = e.pts[i], id = this.rail ? `${p[0].toFixed(3)},${p[1].toFixed(3)}` : i === 0 ? e.from : e.to;
    if (id) for (const next of this.joins.get(id) || []) if (Math.abs((e.elev?.[i] || 0) - (this.edges[next.r].elev?.[next.i] || 0)) <= .2) out.push({ ...next, d: 0 });
    return out;
  }
  protect(spans: Span[], allowGroundNormalization = false) {
    const heap = new Heap();
    const cap = (r: number, i: number, y: number) => {
      if (y >= (this.edges[r].elev?.[i] || 0) + MAX_EXTRA_LIFT || y >= (this.ceilings.get(r)?.[i] ?? Infinity) - 1e-7) return;
      let values = this.ceilings.get(r); if (!values) { values = this.edges[r].pts.map(() => Infinity); this.ceilings.set(r, values); }
      values[i] = y; heap.push({ r, i, y: -y });
    };
    for (const s of spans) for (const i of [s.i - 1, s.i]) { const raw = this.edges[s.r].elev?.[i] || 0; cap(s.r, i, allowGroundNormalization ? Math.max(0,raw) : raw); }
    while (heap.a.length) {
      const { r, i, y: negative } = heap.pop(), y = -negative; if (y > (this.ceilings.get(r)?.[i] ?? Infinity) + 1e-7) continue;
      for (const next of this.neighbors(r, i)) cap(next.r, next.i, y + this.grade * next.d);
    }
  }
  lift(r: number, i: number, y: number) {
    const raw = this.edges[r].elev?.[i] || 0;
    y = Math.min(y, this.ceilings.get(r)?.[i] ?? Infinity);
    if (!Number.isFinite(y) || y > raw + MAX_EXTRA_LIFT || y <= this.value(r, i) + 1e-7) return false;
    let heights = this.changed.get(r); if (!heights) { heights = this.edges[r].pts.map((_, j) => this.edges[r].elev?.[j] || 0); this.changed.set(r, heights); }
    heights[i] = y; this.heap.push({ r, i, y }); return true;
  }
  spread() {
    while (this.heap.a.length) {
      const { r, i, y } = this.heap.pop(), e = this.edges[r]; if (y < this.value(r, i) - 1e-7) continue;
      for (const next of this.neighbors(r, i)) this.lift(next.r, next.i, y - this.grade * next.d);
    }
  }
}
function segment(a: XZ, b: XZ, r: number, i: number): Span | null { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); return len < .001 ? null : { r, i, a, b, len, hx: (b[0] - a[0]) / len, hz: (b[1] - a[1]) / len }; }
// Clip the full railway ribbon against a road span, rather than testing only
// centerline intersections. Oblique/broad bridge decks can cover a whole coach.
function interval(rail: Span, road: Span, halfWidth: number, railHalfWidth = RAIL_HALF_ENVELOPE): [number, number] | null {
  const x = rail.a[0] - road.a[0], z = rail.a[1] - road.a[1], dx = rail.b[0] - rail.a[0], dz = rail.b[1] - rail.a[1];
  const axes = [[x * road.hx + z * road.hz, dx * road.hx + dz * road.hz, -railHalfWidth, road.len + railHalfWidth],
    [-x * road.hz + z * road.hx, -dx * road.hz + dz * road.hx, -halfWidth - railHalfWidth, halfWidth + railHalfWidth]];
  let lo = 0, hi = 1;
  for (const [a, d, min, max] of axes) { if (Math.abs(d) < 1e-9) { if (a < min || a > max) return null; continue; } const u = (min - a) / d, v = (max - a) / d; lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v)); if (lo > hi) return null; }
  return [lo, hi];
}
function closestParameters(a: Span, b: Span) {
  const dx = b.a[0] - a.a[0], dz = b.a[1] - a.a[1], cross = a.hx * b.hz - a.hz * b.hx;
  if (Math.abs(cross) > 1e-7) {
    const s = (dx * b.hz - dz * b.hx) / cross, t = (dx * a.hz - dz * a.hx) / cross;
    if (s >= 0 && s <= a.len && t >= 0 && t <= b.len) return { a: s / a.len, b: t / b.len, distance: 0 };
  }
  let best = { a: 0, b: 0, distance: Infinity };
  const check = (u: number, v: number) => { const x = a.a[0] + a.hx * a.len * u - b.a[0] - b.hx * b.len * v, z = a.a[1] + a.hz * a.len * u - b.a[1] - b.hz * b.len * v, distance = Math.hypot(x, z); if (distance < best.distance) best = { a: u, b: v, distance }; };
  for (const u of [0, 1]) check(u, Math.max(0, Math.min(1, ((a.a[0] + a.hx * a.len * u - b.a[0]) * b.hx + (a.a[1] + a.hz * a.len * u - b.a[1]) * b.hz) / b.len)));
  for (const v of [0, 1]) check(Math.max(0, Math.min(1, ((b.a[0] + b.hx * b.len * v - a.a[0]) * a.hx + (b.a[1] + b.hz * b.len * v - a.a[1]) * a.hz) / a.len)), v);
  return best;
}
export interface RailwayClearanceOptions { underpasses?: readonly RailwayUnderpassEvidence[] }
const UNDERPASS_SAMPLE = 4;
function sampleUnderpassRoad(e: RoadEdge): RoadEdge {
  if (!e.pts.slice(1).some((p,i)=>Math.hypot(p[0]-e.pts[i][0],p[1]-e.pts[i][1])>UNDERPASS_SAMPLE+.001)) return e;
  const pts:XZ[]=[e.pts[0]],elev=[e.elev?.[0]||0];
  for(let i=1;i<e.pts.length;i++){
    const a=e.pts[i-1],b=e.pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/UNDERPASS_SAMPLE));
    for(let j=1;j<=n;j++){const u=j/n;pts.push(j===n?b:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u]);elev.push((e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*u);}
  }
  return {...e,pts,elev};
}
// Rail running levels are immutable. A crossing is either genuine at-grade,
// an existing road overbridge, or an evidenced road underpass. Never solve a
// conflict by raising the railway and spreading an invented viaduct approach.
export function prepareRailwayClearance(roads: RoadEdge[], profiles: RailProfile[], options: RailwayClearanceOptions = {}, sampled = false) {
  const report: RailwayClearanceReport = { finiteOverlaps: 0, atGrade: 0, separated: 0, modeledOrder: 0, raisedRoads: 0, raisedRails: 0, loweredRoads: 0, underpassRoadIds: [], unverifiedRoadHumps: [], unverifiedUnderpassCrossings: [], unresolved: [], roadCrossings: {checked:0,repaired:0,unresolved:[]},
    uncertainty: 'Original railway XY, way IDs and connectivity retained, with a flat running datum rather than inferred flyover heights. Bridge tags and road names never authorize a new underpass. Exact road/rail/location evidence authorizes road underpasses, which descend with bounded connected approaches; existing road overbridges clear full coaches. Other coplanar intersections remain gated. Depth/headroom are documented game-model estimates, not a survey; unresolved constraints are reported.' };
  const intervalAt=(edges:Edge[],span:Span,range:[number,number])=>range.map(u=>(edges[span.r].elev?.[span.i-1]||0)+((edges[span.r].elev?.[span.i]||0)-(edges[span.r].elev?.[span.i-1]||0))*u);
  const railHeights={interval:(span:Span,range:[number,number])=>intervalAt(profiles,span,range)};
  const roadHeights = new Heights(roads, ROAD_GRADE, false), grid = new Map<string, Span[]>();
  const evidence = options.underpasses || [], review = new Set<string>();
  for (let r = 0; r < profiles.length; r++) for (let i = 1; i < profiles[r].pts.length; i++) {
    const s = segment(profiles[r].pts[i - 1], profiles[r].pts[i], r, i); if (!s) continue;
    for (let x = Math.floor((Math.min(s.a[0], s.b[0]) - RAIL_HALF_ENVELOPE) / CELL); x <= Math.floor((Math.max(s.a[0], s.b[0]) + RAIL_HALF_ENVELOPE) / CELL); x++)
      for (let z = Math.floor((Math.min(s.a[1], s.b[1]) - RAIL_HALF_ENVELOPE) / CELL); z <= Math.floor((Math.max(s.a[1], s.b[1]) + RAIL_HALF_ENVELOPE) / CELL); z++) { const k = `${x},${z}`; (grid.get(k) || grid.set(k, []).get(k)!).push(s); }
  }
  const all: Constraint[] = [], constraints: Constraint[] = [], protectedRoads: Span[] = [];
  const orders = new Map<string, { distance: number; gap: number; atGrade: boolean; above: 'road' | 'rail'; estimated: boolean; lowHump: boolean }>();
  for (let r = 0; r < roads.length; r++) {
    const e = roads[r]; if (/^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;
    const maximum = Math.max(0,...(e.elev||[])), lowHump = maximum>0 && maximum<2 && !e.expressway && !/survey|explicit/.test(String((e as RoadEdge & {elevationSource?:string}).elevationSource||''));
    const raised = e.elev?.some(y => y > 1.2), width = Math.max(e.w / 2, raised ? 4.2 : 0) + (e.expressway ? 4.5 : .5);
    for (let i = 1; i < e.pts.length; i++) {
      const road = segment(e.pts[i - 1], e.pts[i], r, i); if (!road) continue;
      const nearby = new Set<Span>();
      for (let x = Math.floor((Math.min(road.a[0], road.b[0]) - width) / CELL); x <= Math.floor((Math.max(road.a[0], road.b[0]) + width) / CELL); x++)
        for (let z = Math.floor((Math.min(road.a[1], road.b[1]) - width) / CELL); z <= Math.floor((Math.max(road.a[1], road.b[1]) + width) / CELL); z++) for (const s of grid.get(`${x},${z}`) || []) nearby.add(s);
      for (const rail of nearby) {
        const railRange = interval(rail, road, width); if (!railRange) continue;
        const roadRange = railRange.map(u => Math.max(0, Math.min(1, ((rail.a[0] + (rail.b[0] - rail.a[0]) * u - road.a[0]) * road.hx + (rail.a[1] + (rail.b[1] - rail.a[1]) * u - road.a[1]) * road.hz) / road.len))).sort((a, b) => a - b) as [number, number];
        const near = closestParameters(road, rail), rh = railHeights.interval(rail, [near.b, near.b])[0], dh = roadHeights.interval(road, [near.a, near.a])[0];
        report.finiteOverlaps++;
        const x = rail.a[0] + (rail.b[0] - rail.a[0]) * near.b, z = rail.a[1] + (rail.b[1] - rail.a[1]) * near.b;
        const verified = railwayUnderpassAt(evidence, e.id, profiles[rail.r].id, x, z);
        // Keep existing above-ground road structures; only exact researched
        // road/rail/location matches may create a road-under-rail depression.
        const existingOverbridge = !verified && !lowHump && dh > rh + 1.2;
        const atGrade = !verified && !existingOverbridge;
        const estimatedOrder = false, above = verified ? 'rail' : 'road';
        if (!verified && near.distance < .01 && (profiles[rail.r].bridge || /underpass|subway|tunnel/i.test(e.name || '') || dh < rh - .55)) {
          const key = `${e.id}/${profiles[rail.r].id}/${Math.round(x)}/${Math.round(z)}`;
          if (!review.has(key)) { review.add(key); report.unverifiedUnderpassCrossings.push({road:e.id,rail:profiles[rail.r].id,x,z,reason:'No exact researched road/rail/location evidence; no new underpass permitted.'}); }
        }
        const key = `${r}/${rail.r}/${verified ? 'evidence:'+verified.name : 'unverified'}`, previous = orders.get(key);
        // A wide/oblique coach envelope reaches neighboring approach spans.
        // All those spans retain the order at the actual centerline crossing;
        // independently classifying their taper ends would create a false cycle.
        if (!previous || near.distance < previous.distance - 1e-6 || Math.abs(near.distance - previous.distance) < 1e-6 && Math.abs(rh - dh) > Math.abs(previous.gap)) orders.set(key, { distance: near.distance, gap: rh - dh, atGrade, above, estimated: estimatedOrder, lowHump });
        all.push({ road, rail, roadRange, railRange, above, estimatedOrder, key });
      }
    }
  }
  for (const c of all) {
    const order = orders.get(c.key)!;
    if (order.atGrade) { report.atGrade++; if(order.distance<.01) protectedRoads.push(c.road); }
    else { c.above = order.above; c.estimatedOrder = order.estimated; constraints.push(c); if (order.estimated) report.modeledOrder++; }
  }
  const underpassIndices = new Set(constraints.filter(c=>c.above==='rail').map(c=>c.road.r));
  if (!sampled) {
    // Pin a level crossing at the crossing itself, not at remote endpoints
    // of a long unsampled adjoining road. Those endpoints can be the portal
    // of a separately evidenced underpass.
    const portalNodes = new Set([...underpassIndices].flatMap(r=>[roads[r].from,roads[r].to]).filter(Boolean));
    const localControls = protectedRoads.filter(s=>portalNodes.has(roads[s.r].from)||portalNodes.has(roads[s.r].to));
    const sampledRoads = new Set([...underpassIndices,...localControls.map(s=>s.r)]);
    const prepared = roads.map((e,i)=>sampledRoads.has(i)?sampleUnderpassRoad(e):e);
    if (prepared.some((e,i)=>e!==roads[i])) return prepareRailwayClearance(prepared,profiles,options,true);
  }
  // Reflect the lower road problem so the same bounded grade envelope can
  // form downward approaches. Never mutate railway profiles to gain headroom.
  const reflected = roads.map(e=>({...e,elev:e.pts.map((_,i)=>-(e.elev?.[i]||0))}));
  const lowerRoadHeights = new Heights(reflected, ROAD_GRADE, false);
  roadHeights.protect([...protectedRoads,...constraints.filter(c=>c.above==='rail').map(c=>c.road)]);
  lowerRoadHeights.protect(protectedRoads,true);
  lowerRoadHeights.protect(constraints.filter(c=>c.above==='road').map(c=>c.road));
  for (const c of constraints) {
    const levels = railHeights.interval(c.rail,c.railRange), upper = c.above==='road'?roadHeights:lowerRoadHeights;
    const target = c.above==='road'?Math.max(...levels)+ROAD_OVER_RAIL:-Math.min(...levels)+RAIL_OVER_ROAD;
    upper.lift(c.road.r,c.road.i-1,target);upper.lift(c.road.r,c.road.i,target);
  }
  // A small inherited unsurveyed road hump is not proof of a road flyover.
  // Bring its crossing to the running datum instead of promoting it6.8m up.
  for(const c of all){const order=orders.get(c.key)!;if(order.atGrade&&order.lowHump&&order.distance<.01){
    report.unverifiedRoadHumps.push(roads[c.road.r].id);for(const i of[c.road.i-1,c.road.i])lowerRoadHeights.lift(c.road.r,i,0);
  }}
  roadHeights.spread();lowerRoadHeights.spread();
  // A nearby cut does not prove that another track has an underpass. Every
  // yard strand needs its own local evidence entry; at-grade controls above
  // prevent an approach from silently converting a different crossing.
  const finalSamples=roads.map((e,i)=>underpassIndices.has(i)?sampleUnderpassRoad(e):e);
  if(finalSamples.some((e,i)=>e!==roads[i]))return prepareRailwayClearance(finalSamples,profiles,options,true);
  report.unverifiedRoadHumps=[...new Set(report.unverifiedRoadHumps)];
  // Rail clearance must not squeeze a road that was already below a mapped
  // road bridge. Retain the original finite-envelope vertical order and lift
  // only that existing upper roadway, never the railway or the lower road.
  const currentRoad=(span:Span,range:[number,number])=>range.map(u=>{
    const e=roads[span.r],value=(i:number)=>roadHeights.value(span.r,i)-lowerRoadHeights.value(span.r,i)-(e.elev?.[i]||0);
    return value(span.i-1)+(value(span.i)-value(span.i-1))*u;
  });
  const roadSpans:Span[][]=roads.map((e,r)=>e.pts.slice(1).flatMap((p,i)=>{const s=segment(e.pts[i],p,r,i+1);return s?[s]:[];})),roadGrid=new Map<string,Span[]>();
  const width=(r:number)=>Math.max(roads[r].w/2,roads[r].elev?.some(y=>y>1.2)?4.2:0)+(roads[r].expressway?4.5:.5);
  for(const spans of roadSpans)for(const s of spans){const pad=width(s.r);for(let x=Math.floor((Math.min(s.a[0],s.b[0])-pad)/CELL);x<=Math.floor((Math.max(s.a[0],s.b[0])+pad)/CELL);x++)for(let z=Math.floor((Math.min(s.a[1],s.b[1])-pad)/CELL);z<=Math.floor((Math.max(s.a[1],s.b[1])+pad)/CELL);z++){const k=`${x},${z}`;(roadGrid.get(k)||roadGrid.set(k,[]).get(k)!).push(s);}}
  const tested=new Set<string>(),roadConstraints:{high:Span;low:Span;highRange:[number,number];lowRange:[number,number]}[]=[];
  for(const r of new Set([...roadHeights.changed.keys(),...lowerRoadHeights.changed.keys()]))for(const a of roadSpans[r]){
    const nearby=new Set<Span>(),pad=width(r);for(let x=Math.floor((Math.min(a.a[0],a.b[0])-pad)/CELL);x<=Math.floor((Math.max(a.a[0],a.b[0])+pad)/CELL);x++)for(let z=Math.floor((Math.min(a.a[1],a.b[1])-pad)/CELL);z<=Math.floor((Math.max(a.a[1],a.b[1])+pad)/CELL);z++)for(const b of roadGrid.get(`${x},${z}`)||[])nearby.add(b);
    for(const b of nearby){if(a.r===b.r)continue;const A=`${a.r}:${a.i}`,B=`${b.r}:${b.i}`,key=A<B?`${A}/${B}`:`${B}/${A}`;if(tested.has(key))continue;tested.add(key);
      const aRange=interval(a,b,width(b.r),width(a.r));if(!aRange)continue;
      const bRange=aRange.map(u=>Math.max(0,Math.min(1,((a.a[0]+a.hx*a.len*u-b.a[0])*b.hx+(a.a[1]+a.hz*a.len*u-b.a[1])*b.hz)/b.len))).sort((a,b)=>a-b) as[number,number];
      const ah=intervalAt(roads,a,aRange),bh=intervalAt(roads,b,bRange),gap=Math.min(...ah)-Math.max(...bh),reverse=Math.min(...bh)-Math.max(...ah);
      if(gap>=5.2)roadConstraints.push({high:a,low:b,highRange:aRange,lowRange:bRange});else if(reverse>=5.2)roadConstraints.push({high:b,low:a,highRange:bRange,lowRange:aRange});
    }
  }
  const repairedRoads=new Set<number>();
  for(let round=0;round<12;round++){
    let changed=false;
    for(const c of roadConstraints){const target=Math.max(...currentRoad(c.low,c.lowRange))+5.85;
      for(const i of[c.high.i-1,c.high.i]){const desired=target+lowerRoadHeights.value(c.high.r,i)+(roads[c.high.r].elev?.[i]||0);if(roadHeights.lift(c.high.r,i,desired)){changed=true;repairedRoads.add(c.high.r);}}
    }
    if(!changed)break;roadHeights.spread();
  }
  report.roadCrossings.checked=roadConstraints.length;report.roadCrossings.repaired=repairedRoads.size;
  for(const c of roadConstraints){const gap=Math.min(...currentRoad(c.high,c.highRange))-Math.max(...currentRoad(c.low,c.lowRange));if(gap<5.2-.001&&report.roadCrossings.unresolved.length<256)report.roadCrossings.unresolved.push({upper:roads[c.high.r].id,lower:roads[c.low.r].id,x:(c.high.a[0]+c.high.b[0])/2,z:(c.high.a[1]+c.high.b[1])/2,gap});}
  const modelRoads = roads.map((e,r)=>{
    const raised=roadHeights.changed.get(r),lowered=lowerRoadHeights.changed.get(r);
    if(!raised&&!lowered)return e;
    const elev=e.pts.map((_,i)=>{const raw=e.elev?.[i]||0;return (raised?.[i]??raw)-(lowered?.[i]??-raw)-raw;});
    return {...e,elev};
  });
  const modelRoadHeights={interval:(span:Span,range:[number,number])=>intervalAt(modelRoads,span,range)};
  for (const c of constraints) {
    const road = modelRoadHeights.interval(c.road, c.roadRange), rail = railHeights.interval(c.rail, c.railRange), required = c.above === 'road' ? ROAD_OVER_RAIL : RAIL_OVER_ROAD;
    const gap = c.above === 'road' ? Math.min(...road) - Math.max(...rail) : Math.min(...rail) - Math.max(...road);
    if (gap >= required - .0001) report.separated++;
    else if (report.unresolved.length < 256) report.unresolved.push({ road: roads[c.road.r].id, rail: profiles[c.rail.r].id, x: (c.rail.a[0] + c.rail.b[0]) / 2, z: (c.rail.a[1] + c.rail.b[1]) / 2, gap, required, reason: 'bounded connected-grade constraints conflict' });
  }
  report.raisedRoads = roadHeights.changed.size; report.loweredRoads = lowerRoadHeights.changed.size;
  report.underpassRoadIds = [...underpassIndices].map(i=>roads[i].id);
  return { roads: modelRoads, profiles, report };
}

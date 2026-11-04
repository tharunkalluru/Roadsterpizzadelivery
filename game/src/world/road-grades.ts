import type { CoreData, RoadEdge, StopTuple, XZ } from './types';
import { mappedRoadLevels, repairRoadCrossingLevels, type CrossingLevelReport } from './road-crossing-levels';
import { joinedGroundApproaches, JOIN_CONTROL_GRADE, type JoinedApproachReport } from './road-joined-approaches';
import { prepareJoinedApproachWidths, type JoinedWidthComponent } from './road-approach-widths';
import { applyVerifiedRoadProfiles } from './road-profile-corrections';
import { retainRaisedRoadExclusions } from './road-pavement';
import { canonicalAuxiliaryLaneEnds } from './expressway';

// These are gameplay estimates, not surveyed elevations. The legacy exporter
// generated6.8m decks with45m ramps; copied point profiles can be still steeper.
// Keep controlled ORR profiles and existing high-level crossings intact while
// extending estimated approaches over their connected, same-level road network.
const BASE_GRADE = .065, SAMPLE = 2, SEPARATION = 4.5;
export interface RoadGradePatch { id: string; pts: XZ[]; elev: number[] | null; w?: number; lanes?:number;laneEvidence?:RoadEdge['laneEvidence'];sourceLaneIntervals?:RoadEdge['sourceLaneIntervals'];sceneryWidth?:number;scenerySource?:RoadEdge['scenerySource']; joinedPavement?: RoadEdge['joinedPavement'];
  name?: RoadEdge['name']; expressway?: RoadEdge['expressway'] | null; auxiliaryLaneEnds?: RoadEdge['auxiliaryLaneEnds'] | null;
}
export interface RoadGradeReport {
  roads: number; repairedRoads: number; sourceSteepSegments: number; modelSteepSegments: number; maxModelGrade: number;
  protectedRoads: number; protectedRoadsChanged: number; separatedCrossings: number; minCrossingSeparation: number;
  joinedEndpointMaxDifference: number; rebasedStops?: number; ambiguousStops?: number;
  uncertainty: string;
  bridgeClearance?: CrossingLevelReport;
  mappedLevelRoads?: number;
  mappedLevelPoints?: number;
  joinedApproaches?: JoinedApproachReport;
  joinedWidths?: { roads:number; components:JoinedWidthComponent[] };
  verifiedProfiles?: ReturnType<typeof applyVerifiedRoadProfiles>['report'];
}
const reports = new WeakMap<RoadEdge[], RoadGradeReport>(), patches = new WeakMap<RoadEdge[], RoadGradePatch[]>(), prepared = new WeakMap<RoadEdge[], RoadEdge[]>();
export interface PreparedRoadCachePayload { version: 1; sourceRoadCount: number; patches: RoadGradePatch[]; report: RoadGradeReport }
export type PreparedRoadCache=PreparedRoadCachePayload;
function sameExpressway(a: RoadGradePatch['expressway'], b: RoadEdge['expressway']) {
  if (!a || !b) return a == null && b == null;
  return a.controlled === b.controlled && a.ramp === b.ramp && a.throughLanes === b.throughLanes && a.laneWidth === b.laneWidth &&
    JSON.stringify(a.shoulders ?? null) === JSON.stringify(b.shoulders ?? null) && JSON.stringify(a.sources) === JSON.stringify(b.sources) &&
    a.sourceDate === b.sourceDate && a.uncertainty === b.uncertainty;
}
/** Build verification binds generator inputs. The async loader verifies the
 * canonical source-road and decoded payload hashes before calling this hook. */
export function installPreparedRoadCache(roads:RoadEdge[],cache:PreparedRoadCachePayload):RoadEdge[]|false {
  if(!cache||cache.version!==1||cache.sourceRoadCount!==roads.length||cache.report?.roads!==roads.length||!Array.isArray(cache.patches))return false;
  const r=cache.report;
  if(!Number.isFinite(r.maxModelGrade)||r.maxModelGrade<0||!Number.isFinite(r.joinedEndpointMaxDifference)||r.joinedEndpointMaxDifference<0||
    !Number.isSafeInteger(r.repairedRoads)||r.repairedRoads<0||r.repairedRoads>roads.length||!Number.isSafeInteger(r.protectedRoads)||r.protectedRoads<0||r.protectedRoads>roads.length||
    !Number.isSafeInteger(r.protectedRoadsChanged)||r.protectedRoadsChanged<0||r.protectedRoadsChanged>r.protectedRoads||!Number.isSafeInteger(r.modelSteepSegments)||r.modelSteepSegments<0||
    !Number.isSafeInteger(r.separatedCrossings)||r.separatedCrossings<0||r.separatedCrossings>0&&!Number.isFinite(r.minCrossingSeparation)||r.verifiedProfiles&&(!Array.isArray(r.verifiedProfiles.mismatched)||r.verifiedProfiles.mismatched.length))return false;
  const sourceById=new Map(roads.map(e=>[e.id,e])),sourceIds=new Set(sourceById.keys()),seen=new Set<string>(),canonicalEnds=canonicalAuxiliaryLaneEnds(roads);
  for(const p of cache.patches){
    if(!p||!sourceIds.has(p.id)||seen.has(p.id)||!Array.isArray(p.pts)||p.pts.length<2||p.pts.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v)))||
      p.elev!==null&&(!Array.isArray(p.elev)||p.elev.length!==p.pts.length)||p.elev?.some(y=>!Number.isFinite(y))||p.w!==undefined&&(!Number.isFinite(p.w)||p.w<=0)||p.lanes!==undefined&&(!Number.isSafeInteger(p.lanes)||p.lanes<1))return false;
    if(p.sceneryWidth!==undefined&&(!Number.isFinite(p.sceneryWidth)||p.sceneryWidth<=0)||p.sourceLaneIntervals!==undefined&&(!Array.isArray(p.sourceLaneIntervals)||p.sourceLaneIntervals.some(s=>!s||!Number.isFinite(s.from)||!Number.isFinite(s.to)||s.from<0||s.to<s.from||!Number.isSafeInteger(s.lanes)||s.lanes<1||typeof s.oneway!=='boolean'||typeof s.sourceURL!=='string')))return false;
    if(p.name!==undefined&&p.name!==null&&typeof p.name!=='string'||p.auxiliaryLaneEnds!==undefined&&p.auxiliaryLaneEnds!==null&&
      (!Number.isInteger(p.auxiliaryLaneEnds)||p.auxiliaryLaneEnds<0||p.auxiliaryLaneEnds>3||p.auxiliaryLaneEnds!==canonicalEnds.get(p.id)))return false;
    const expressway=p.expressway;
    if(expressway!==undefined&&expressway!==null&&(!expressway||typeof expressway!=='object'||Array.isArray(expressway)||typeof expressway.controlled!=='boolean'||typeof expressway.ramp!=='boolean'||
      !Number.isSafeInteger(expressway.throughLanes)||expressway.throughLanes<1||expressway.laneWidth!==undefined&&(!Number.isFinite(expressway.laneWidth)||expressway.laneWidth<=0)||
      expressway.shoulders!==undefined&&(!Array.isArray(expressway.shoulders)||expressway.shoulders.length!==2||expressway.shoulders.some(v=>!Number.isFinite(v)||v<0))||
      !Array.isArray(expressway.sources)||expressway.sources.some(s=>typeof s!=='string')||typeof expressway.sourceDate!=='string'||typeof expressway.uncertainty!=='string'))return false;
    // Generic grade preparation retains classification; a cache cannot create
    // or clear an ORR/ramp declaration absent from its exact source inventory.
    const canonical=sourceById.get(p.id)!;
    if(p.name!==undefined&&p.name!==canonical.name||expressway!==undefined&&!sameExpressway(expressway,canonical.expressway))return false;
    const original=p.scenerySource;if(original!==undefined&&(!original||!Number.isFinite(original.width)||original.width<=0||!Array.isArray(original.pts)||original.pts.length<2||original.pts.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v)))||original.elev!==null&&(!Array.isArray(original.elev)||original.elev.length!==original.pts.length||original.elev.some(y=>!Number.isFinite(y)))))return false;
    const shape=p.joinedPavement;if(shape&&(p.w===undefined||!Number.isFinite(shape.sourceWidth)||shape.sourceWidth<=0||!Number.isFinite(shape.originalWidth)||shape.originalWidth<p.w||shape.physicalWidth!==undefined&&(!Number.isFinite(shape.physicalWidth)||shape.physicalWidth<p.w||shape.physicalWidth>shape.originalWidth)||shape.usableLanes!==undefined&&(!Number.isSafeInteger(shape.usableLanes)||shape.usableLanes<1)||!Number.isFinite(shape.taper)||shape.taper<=0||!Array.isArray(shape.intervals)||!shape.intervals.length||shape.intervals.some(q=>!Array.isArray(q)||q.length!==2||q.some(v=>!Number.isFinite(v))||q[0]>q[1])))return false;
    seen.add(p.id);
  }
  const result=applyRoadGradePatches(roads,cache.patches);
  prepared.set(roads,result);prepared.set(result,result);reports.set(result,cache.report);patches.set(result,cache.patches);return result;
}
class Heap {
  a: [number, number][] = [];
  push(v: [number, number]) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= v[0]) break; a[i] = a[p]; i = p; } a[i] = v; }
  pop() { const a = this.a, top = a[0], v = a.pop()!; if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= v[0]) break; a[i] = a[c]; i = c; } a[i] = v; } return top; }
}
const gradeOf = (e: RoadEdge, i: number) => e.elev?.[i] || 0;
const protectedRoad = (e: RoadEdge) => !!e.expressway || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || ''));
const harmonic = (a: number, b: number) => a * b > 0 ? 2 * a * b / (a + b) : 0;
function cubicMaximumGrade(d: number, m0: number, m1: number) {
  const a = -6 * d + 3 * m0 + 3 * m1, b = 6 * d - 4 * m0 - 2 * m1, values = [Math.abs(m0), Math.abs(m1)];
  if (Math.abs(a) > 1e-12) { const u = -b / (2 * a); if (u > 0 && u < 1) values.push(Math.abs((a * u + b) * u + m0)); }
  return Math.max(...values);
}
export function roadHeightAlong(e: RoadEdge, distance: number) {
  let acc = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const length = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    if (acc + length >= distance || i === e.pts.length - 1) return gradeOf(e, i - 1) + (gradeOf(e, i) - gradeOf(e, i - 1)) * Math.max(0, Math.min(1, (distance - acc) / (length || 1)));
    acc += length;
  }
  return gradeOf(e, 0);
}
export function roadGradePatches(roads: RoadEdge[]) { return patches.get(roads) || []; }
// A cached core can already contain the repaired profiles when another World
// is created. Publish those profiles even if this pass made no new changes.
// Zero arrays matter too: they can deliberately remove an inherited hump.
export function currentRoadGradePatches(roads: RoadEdge[], seed: RoadGradePatch[] = []): RoadGradePatch[] {
  const out = new Map(seed.map(p=>[p.id,p])), canonicalEnds=canonicalAuxiliaryLaneEnds(roads);
  for(const e of roads)if(out.has(e.id)||e.elev||e.joinedPavement||e.sourceLaneIntervals||e.sceneryWidth||e.scenerySource||e.expressway||canonicalEnds.has(e.id))out.set(e.id,{id:e.id,pts:e.pts,elev:e.elev,w:e.w,lanes:e.lanes,laneEvidence:e.laneEvidence,sourceLaneIntervals:e.sourceLaneIntervals,sceneryWidth:e.sceneryWidth,scenerySource:e.scenerySource,joinedPavement:e.joinedPavement,
    name:e.name,expressway:e.expressway??null,auxiliaryLaneEnds:canonicalEnds.get(e.id)??null});
  return [...out.values()];
}
export function roadGradeReport(roads: RoadEdge[]) { return reports.get(roads); }
export function applyRoadGradePatches(roads: RoadEdge[], changes: RoadGradePatch[]) {
  const byId = new Map(changes.map(p => [p.id, p]));
  return roads.map(e => { const p = byId.get(e.id); return p ? { ...e, pts: p.pts, elev: p.elev, w:p.w??e.w,lanes:p.lanes??e.lanes,laneEvidence:p.laneEvidence??e.laneEvidence,sourceLaneIntervals:p.sourceLaneIntervals??e.sourceLaneIntervals,sceneryWidth:p.sceneryWidth??e.sceneryWidth,scenerySource:p.scenerySource??e.scenerySource, joinedPavement:p.joinedPavement??e.joinedPavement,
    name:p.name===undefined?e.name:p.name,expressway:p.expressway===undefined?e.expressway:p.expressway??undefined,auxiliaryLaneEnds:p.auxiliaryLaneEnds===undefined?e.auxiliaryLaneEnds:p.auxiliaryLaneEnds??undefined } : e; });
}
export function prepareRoadGrades(roads: RoadEdge[], repairJoins = true, applyProfiles = true): RoadEdge[] {
  if (repairJoins && applyProfiles && prepared.has(roads)) return prepared.get(roads)!;
  // The finite reference is always generic. It must not consume an older
  // generated correction while deriving the next correction's expected input.
  const baseline = repairJoins ? prepareRoadGrades(roads, false, false) : null;
  const originalRoads = roads, mapped = mappedRoadLevels(roads);
  roads = mapped.roads;
  const widths = repairJoins ? prepareJoinedApproachWidths(roads) : { roads, components: [] };
  roads = widths.roads;
  const joins = repairJoins ? joinedGroundApproaches(roads, { roads: baseline!, crossings: roadGradeReport(baseline!)!.bridgeClearance!.crossings }, widths.components) : {
    roads, fixed: new Map<RoadEdge, Set<number>>(), grades: new Map<string, [number, number][]>(), report: { pairs: 0, roads: 0, fixedPoints: 0, maximumRun: 0, repairs: [], unresolved: [] } };
  roads = joins.roads;
  const offsets: number[] = [], edges: [number, number, number?][][] = [], raw: number[] = [], immutable: boolean[] = [], ends = new Map<string, number[]>(), groups: number[][] = [], endNeighbor = new Map<number, [number, number]>();
  for (const e of roads) {
    const offset = raw.length; offsets.push(offset); let distance = 0;
    for (let i = 0; i < e.pts.length; i++) {
      const k = raw.length, junction = joins.fixed.get(e)?.has(i); raw.push(junction ? 0 : gradeOf(e, i)); immutable.push(!!junction || protectedRoad(e) && !mapped.changed.has(e.id)); edges.push([]);
      if (i) { const d = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]), mid = distance + d / 2, grade = joins.grades.get(e.id)?.some(([a, b]) => mid >= a && mid <= b) ? JOIN_CONTROL_GRADE : BASE_GRADE; distance += d; edges[k].push([k - 1, d, grade]); edges[k - 1].push([k, d, grade]); }
    }
    if (e.pts.length < 2) continue;
    for (const [node, i, neighbor] of [[e.from, 0, 1], [e.to, e.pts.length - 1, e.pts.length - 2]] as [string | null, number, number][]) if (node) {
      (ends.get(node) || ends.set(node, []).get(node)!).push(offset + i);
      endNeighbor.set(offset + i, [offset + neighbor, Math.hypot(e.pts[i][0] - e.pts[neighbor][0], e.pts[i][1] - e.pts[neighbor][1])]);
    }
  }
  const joined = new Map<number, number[]>();
  for (const list of ends.values()) {
    list.sort((a, b) => raw[a] - raw[b]); let group: number[] = [];
    for (const k of list) { if (group.length && raw[k] - raw[group[0]] > 1.5) { groups.push(group); group = []; } group.push(k); }
    if (group.length) groups.push(group);
  }
  for (const group of groups) for (const k of group) {
    joined.set(k, group);
    if (k !== group[0]) { edges[k].push([group[0], 0]); edges[group[0]].push([k, 0]); }
  }
  const heights = raw.slice(), ceiling = raw.map((y, i) => immutable[i] ? y : Infinity), grid = new Map<string, Span[]>(), crossings: { upper: number; lower: number; upperS: number; lowerS: number }[] = [];
  interface Span { road: number; i: number; a: XZ; dx: number; dz: number; length: number; distance: number; y0: number; y1: number }
  const spans: Span[] = [];
  for (let r = 0; r < roads.length; r++) {
    const e = roads[r]; let distance = 0;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); if (length < .0001) continue;
      const span = { road: r, i, a, dx, dz, length, distance, y0: raw[offsets[r] + i - 1], y1: raw[offsets[r] + i] }; spans.push(span);
      for (let x = Math.floor(Math.min(a[0], b[0]) / 120); x <= Math.floor(Math.max(a[0], b[0]) / 120); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / 120); z <= Math.floor(Math.max(a[1], b[1]) / 120); z++) {
        const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(span);
      }
      distance += length;
    }
  }
  for (const a of spans) {
    if (Math.max(a.y0, a.y1) < SEPARATION) continue;
    const near = new Set<Span>(), b0 = roads[a.road].pts[a.i];
    for (let x = Math.floor(Math.min(a.a[0], b0[0]) / 120); x <= Math.floor(Math.max(a.a[0], b0[0]) / 120); x++) for (let z = Math.floor(Math.min(a.a[1], b0[1]) / 120); z <= Math.floor(Math.max(a.a[1], b0[1]) / 120); z++) for (const b of grid.get(`${x},${z}`) || []) near.add(b);
    for (const b of near) {
      if (a.road === b.road) continue;
      const cross = a.dx * b.dz - a.dz * b.dx; if (Math.abs(cross) < 1e-7) continue;
      const dx = b.a[0] - a.a[0], dz = b.a[1] - a.a[1], t = (dx * b.dz - dz * b.dx) / cross, u = (dx * a.dz - dz * a.dx) / cross;
      if (t < -1e-7 || t > 1.0000001 || u < -1e-7 || u > 1.0000001 || a.y0 + (a.y1 - a.y0) * t - b.y0 - (b.y1 - b.y0) * u < SEPARATION) continue;
      // Keep source ground/lower-road levels under an actual mapped crossing.
      // Otherwise a newly lengthened upper approach could lift the underpass.
      for (const k of [offsets[b.road] + b.i - 1, offsets[b.road] + b.i]) ceiling[k] = Math.min(ceiling[k], raw[k]);
      crossings.push({ upper: a.road, lower: b.road, upperS: a.distance + a.length * t, lowerS: b.distance + b.length * u });
    }
  }
  const high = new Heap(); for (let i = 0; i < heights.length; i++) if (heights[i] > 0) high.push([-heights[i], i]);
  while (high.a.length) {
    const [negative, k] = high.pop(), y = -negative; if (y < heights[k] - 1e-7) continue;
    for (const [n, length, grade] of edges[k]) { const value = y - (grade ?? BASE_GRADE) * length; if (!immutable[n] && value > heights[n] + 1e-7) { heights[n] = value; high.push([-value, n]); } }
  }
  const low = new Heap(); for (let i = 0; i < ceiling.length; i++) if (Number.isFinite(ceiling[i])) low.push([ceiling[i], i]);
  while (low.a.length) {
    const [value, k] = low.pop(); if (value > ceiling[k] + 1e-7) continue;
    for (const [n, length, grade] of edges[k]) { const limit = value + (grade ?? BASE_GRADE) * length; if (limit < ceiling[n] - 1e-7) { ceiling[n] = limit; low.push([limit, n]); } }
  }
  for (let i = 0; i < heights.length; i++) heights[i] = immutable[i] ? raw[i] : Math.max(0, Math.min(heights[i], ceiling[i]));
  // Surveyed/explicit altitudes stay fixed. Inherited expressway game estimates
  // can be extended where an independently classified crossing needs headroom.
  const fixed = roads.flatMap(e => e.pts.map((_, i) => !!joins.fixed.get(e)?.has(i) || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || ''))));
  const bridgeClearance = repairRoadCrossingLevels(roads, offsets, edges, heights, fixed);
  const report: RoadGradeReport = { roads: roads.length, repairedRoads: 0, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: 0, protectedRoads: roads.filter(protectedRoad).length, protectedRoadsChanged: 0, separatedCrossings: crossings.length, minCrossingSeparation: Infinity, joinedEndpointMaxDifference: 0,
    uncertainty: 'Estimated game road heights and eased approaches, not a survey. OriginalXY/alignment, road IDs and connectivity retained. Verified relative source layers and classified finite-envelope headroom can extend inherited game elevation estimates; explicit surveyed profiles remain fixed.', bridgeClearance, mappedLevelRoads: mapped.changed.size, mappedLevelPoints: mapped.points, joinedApproaches: joins.report, joinedWidths:{roads:widths.roads.filter(e=>e.joinedPavement).length,components:widths.components} };
  for (const group of groups) report.joinedEndpointMaxDifference = Math.max(report.joinedEndpointMaxDifference, Math.max(...group.map(k => heights[k])) - Math.min(...group.map(k => heights[k])));
  let result = roads.map((e, r) => {
    const off = offsets[r], h = e.pts.map((_, i) => heights[off + i]), lengths = e.pts.slice(1).map((p, i) => Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]));
    for (let i = 0; i < lengths.length; i++) if (lengths[i] > .001 && Math.abs(gradeOf(e, i + 1) - gradeOf(e, i)) / lengths[i] > .1) report.sourceSteepSegments++;
    if ((protectedRoad(e) && !mapped.changed.has(e.id) && h.every((y, i) => Math.abs(y - raw[off + i]) < .00001)) || (!h.some(y => y > .0001) && h.every((y, i) => Math.abs(y - gradeOf(e, i)) < .00001))) return e;
    if (protectedRoad(e)) report.protectedRoadsChanged++;
    const d = lengths.map((length, i) => (h[i + 1] - h[i]) / (length || 1)), m = h.map((_, i) => !i ? d[0] : i === h.length - 1 ? d[d.length - 1] : harmonic(d[i - 1], d[i]));
    for (const end of [0, h.length - 1]) {
      const k = off + end, own = endNeighbor.get(k), others = (joined.get(k) || []).filter(n => n !== k);
      if (!own || !others.length) continue;
      let slope = (heights[own[0]] - heights[k]) / (own[1] || 1);
      for (const n of others) { const next = endNeighbor.get(n); if (next) slope = harmonic(slope, -(heights[next[0]] - heights[n]) / (next[1] || 1)); }
      m[end] = end ? -slope : slope;
    }
    const pts: XZ[] = [e.pts[0]], elev = [h[0]];
    for (let i = 0; i < lengths.length; i++) {
      // At .075 control grade a single zero/zero Hermite span would peak at
      // .1125. A real midpoint with the secant tangent yields two spans whose
      // zero/secant transition peaks at 4/3*.075=.1; this changes the profile,
      // rather than clipping a measurement or silently allowing steeper roads.
      const parts = cubicMaximumGrade(d[i], m[i], m[i + 1]) > .1 + 1e-9 && Math.abs(d[i]) <= JOIN_CONTROL_GRADE + 1e-9 ? 2 : 1;
      for (let part = 0; part < parts; part++) {
        const length = lengths[i] / parts, ha = h[i] + (h[i + 1] - h[i]) * part / parts, hb = h[i] + (h[i + 1] - h[i]) * (part + 1) / parts;
        const ma = part ? d[i] : m[i], mb = part === parts - 1 ? m[i + 1] : d[i], count = Math.max(1, Math.ceil(length / SAMPLE));
        for (let j = 1; j <= count; j++) {
          const u = j / count, u2 = u * u, u3 = u2 * u, along = (part + u) / parts;
          const value = (2 * u3 - 3 * u2 + 1) * ha + (u3 - 2 * u2 + u) * length * ma + (-2 * u3 + 3 * u2) * hb + (u3 - u2) * length * mb;
          pts.push(part === parts - 1 && j === count ? e.pts[i + 1] : [e.pts[i][0] + (e.pts[i + 1][0] - e.pts[i][0]) * along, e.pts[i][1] + (e.pts[i + 1][1] - e.pts[i][1]) * along]);
          elev.push(Math.max(Math.min(ha, hb), Math.min(Math.max(ha, hb), value)));
        }
      }
    }
    report.repairedRoads++; return { ...e, pts, elev };
  });
  result=retainRaisedRoadExclusions(result);
  if(baseline){
    const previousExclusions=new Map(baseline.filter(e=>e.sceneryWidth).map(e=>[e.id,e.sceneryWidth!]));
    result=result.map(e=>(previousExclusions.get(e.id)||0)>(e.sceneryWidth||0)?{...e,sceneryWidth:previousExclusions.get(e.id)}:e);
  }
  if(repairJoins&&applyProfiles){const corrected=applyVerifiedRoadProfiles(result);result=corrected.roads;report.verifiedProfiles=corrected.report;}
  for (const e of result) for (let i = 1; i < e.pts.length; i++) {
    const length = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    if (length < .001) continue;
    const grade = Math.abs(gradeOf(e, i) - gradeOf(e, i - 1)) / length; report.maxModelGrade = Math.max(report.maxModelGrade, grade); if (grade > .1) report.modelSteepSegments++;
  }
  for (const c of crossings) report.minCrossingSeparation = Math.min(report.minCrossingSeparation, roadHeightAlong(result[c.upper], c.upperS) - roadHeightAlong(result[c.lower], c.lowerS));
  const changes = result.flatMap((e, i) => e === originalRoads[i] ? [] : [{ id: e.id, pts: e.pts, elev: e.elev, w:e.w,lanes:e.lanes,laneEvidence:e.laneEvidence,sourceLaneIntervals:e.sourceLaneIntervals,sceneryWidth:e.sceneryWidth,scenerySource:e.scenerySource, joinedPavement:e.joinedPavement,name:e.name,expressway:e.expressway??null }]);
  reports.set(result, report); patches.set(result, changes);
  if (repairJoins&&applyProfiles) { prepared.set(originalRoads, result); prepared.set(roads, result); prepared.set(result, result); }
  return result;
}

export function rebaseRoadStops(core: CoreData, original: RoadEdge[], model: RoadEdge[], sourceArcs?: Map<string, number[]>) {
  const byId = new Map(model.map(e => [e.id, e])), cells = new Map<string, { e: RoadEdge; i: number; distance: number }[]>();
  for (const e of original) {
    let distance = 0;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], span = { e, i, distance };
      for (let x = Math.floor((Math.min(a[0], b[0]) - e.w / 2 - 3) / 60); x <= Math.floor((Math.max(a[0], b[0]) + e.w / 2 + 3) / 60); x++) for (let z = Math.floor((Math.min(a[1], b[1]) - e.w / 2 - 3) / 60); z <= Math.floor((Math.max(a[1], b[1]) + e.w / 2 + 3) / 60); z++) {
        const key = `${x},${z}`; (cells.get(key) || cells.set(key, []).get(key)!).push(span);
      }
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  let rebased = 0, ambiguous = 0, moved = 0;
  const changedStops=new Set<StopTuple>();
  const movedStops=new Set<StopTuple>();
  const sourcePoint = (e: RoadEdge, distance: number) => {
    const arcs = sourceArcs?.get(e.id); if (!arcs) return null;
    let i = 1; while (i < arcs.length - 1 && arcs[i] < distance) i++;
    const u = Math.max(0, Math.min(1, (distance - arcs[i - 1]) / (arcs[i] - arcs[i - 1] || 1)));
    return { x: e.pts[i - 1][0] + (e.pts[i][0] - e.pts[i - 1][0]) * u,
      z: e.pts[i - 1][1] + (e.pts[i][1] - e.pts[i - 1][1]) * u,
      y: (e.elev?.[i - 1] || 0) + ((e.elev?.[i] || 0) - (e.elev?.[i - 1] || 0)) * u };
  };
  const visited = new Set<StopTuple>();
  for (const stop of [...core.food.map(p => p.stop), ...core.theatres.map(p => p.stop), ...core.drops]) {
    if (visited.has(stop)) continue; visited.add(stop);
    const candidates: { e: RoadEdge; distance: number; score: number; match: boolean; foot: XZ }[] = [];
    for (const span of cells.get(`${Math.floor(stop[0] / 60)},${Math.floor(stop[1] / 60)}`) || []) {
      const { e, i } = span, a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), u = Math.max(0, Math.min(1, ((stop[0] - a[0]) * dx + (stop[1] - a[1]) * dz) / (length * length || 1)));
      const d = Math.hypot(stop[0] - a[0] - dx * u, stop[1] - a[1] - dz * u), old = gradeOf(e, i - 1) + (gradeOf(e, i) - gradeOf(e, i - 1)) * u;
      if (d > e.w / 2 + 3 || Math.abs(old - stop[2]) > .75) continue;
      const match = !!stop[3] && e.name === stop[3];
      candidates.push({ e, distance: span.distance + length * u, score: d + Math.abs(old - stop[2]) * 8 - (match ? 4 : 0), match, foot: [a[0] + dx * u, a[1] + dz * u] });
    }
    candidates.sort((a, b) => a.score - b.score); const best = candidates[0]; if (!best || byId.get(best.e.id) === best.e) continue;
    const competitor = candidates.find(c => c.e.id !== best.e.id);
    if (!best.match && competitor && competitor.score - best.score < .35) {
      // We need the roadside level, not an invented road identity. Two nearby
      // candidate approaches may share that level despite missing road names.
      // A genuine ground/deck ambiguity is retained for review instead.
      const levels = candidates.filter(c => c.score - best.score < .35).map(c => sourcePoint(byId.get(c.e.id)!, c.distance)?.y ?? roadHeightAlong(byId.get(c.e.id)!, c.distance));
      if (Math.max(...levels) - Math.min(...levels) > .2) { ambiguous++; continue; }
    }
    const target = byId.get(best.e.id)!, point = sourcePoint(target, best.distance);
    const height = point?.y ?? roadHeightAlong(target, best.distance);
    if (point) {
      const dx = point.x - best.foot[0], dz = point.z - best.foot[1];
      if (Math.hypot(dx, dz) > .001) { stop[0] += dx; stop[1] += dz; moved++; changedStops.add(stop); movedStops.add(stop); }
    }
    if (Math.abs(height - stop[2]) > .001) { stop[2] = height; rebased++; changedStops.add(stop); }
  }
  const report = reports.get(model); if (report) { report.rebasedStops = rebased; report.ambiguousStops = ambiguous; }
  if (sourceArcs) for (const poi of [...core.food, ...core.theatres]) if(movedStops.has(poi.stop))poi.tile = [Math.floor(poi.stop[0] / 1000), Math.floor(poi.stop[1] / 1000)];
  return { rebased, ambiguous, moved, changedStops:[...changedStops] };
}

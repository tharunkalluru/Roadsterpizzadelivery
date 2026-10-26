import type { CoreData, RoadEdge, StopTuple, XZ } from './types';

// These are gameplay estimates, not surveyed elevations. The legacy exporter
// generated6.8m decks with45m ramps; copied point profiles can be still steeper.
// Keep controlled ORR profiles and existing high-level crossings intact while
// extending estimated approaches over their connected, same-level road network.
const BASE_GRADE = .065, SAMPLE = 2, SEPARATION = 4.5;
export interface RoadGradePatch { id: string; pts: XZ[]; elev: number[] | null }
export interface RoadGradeReport {
  roads: number; repairedRoads: number; sourceSteepSegments: number; modelSteepSegments: number; maxModelGrade: number;
  protectedRoads: number; protectedRoadsChanged: number; separatedCrossings: number; minCrossingSeparation: number;
  joinedEndpointMaxDifference: number; rebasedStops?: number; ambiguousStops?: number;
  uncertainty: string;
}
const reports = new WeakMap<RoadEdge[], RoadGradeReport>(), patches = new WeakMap<RoadEdge[], RoadGradePatch[]>(), prepared = new WeakMap<RoadEdge[], RoadEdge[]>();
class Heap {
  a: [number, number][] = [];
  push(v: [number, number]) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= v[0]) break; a[i] = a[p]; i = p; } a[i] = v; }
  pop() { const a = this.a, top = a[0], v = a.pop()!; if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= v[0]) break; a[i] = a[c]; i = c; } a[i] = v; } return top; }
}
const gradeOf = (e: RoadEdge, i: number) => e.elev?.[i] || 0;
const protectedRoad = (e: RoadEdge) => !!e.expressway || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || ''));
const harmonic = (a: number, b: number) => a * b > 0 ? 2 * a * b / (a + b) : 0;
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
export function roadGradeReport(roads: RoadEdge[]) { return reports.get(roads); }
export function applyRoadGradePatches(roads: RoadEdge[], changes: RoadGradePatch[]) {
  const byId = new Map(changes.map(p => [p.id, p]));
  return roads.map(e => { const p = byId.get(e.id); return p ? { ...e, pts: p.pts, elev: p.elev } : e; });
}
export function prepareRoadGrades(roads: RoadEdge[]): RoadEdge[] {
  if (prepared.has(roads)) return prepared.get(roads)!;
  const offsets: number[] = [], edges: [number, number][][] = [], raw: number[] = [], immutable: boolean[] = [], ends = new Map<string, number[]>(), groups: number[][] = [], endNeighbor = new Map<number, [number, number]>();
  for (const e of roads) {
    const offset = raw.length; offsets.push(offset);
    for (let i = 0; i < e.pts.length; i++) {
      const k = raw.length; raw.push(gradeOf(e, i)); immutable.push(protectedRoad(e)); edges.push([]);
      if (i) { const d = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); edges[k].push([k - 1, d]); edges[k - 1].push([k, d]); }
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
      const span = { road: r, i, a, dx, dz, length, distance, y0: gradeOf(e, i - 1), y1: gradeOf(e, i) }; spans.push(span);
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
    for (const [n, length] of edges[k]) { const value = y - BASE_GRADE * length; if (!immutable[n] && value > heights[n] + 1e-7) { heights[n] = value; high.push([-value, n]); } }
  }
  const low = new Heap(); for (let i = 0; i < ceiling.length; i++) if (Number.isFinite(ceiling[i])) low.push([ceiling[i], i]);
  while (low.a.length) {
    const [value, k] = low.pop(); if (value > ceiling[k] + 1e-7) continue;
    for (const [n, length] of edges[k]) { const limit = value + BASE_GRADE * length; if (limit < ceiling[n] - 1e-7) { ceiling[n] = limit; low.push([limit, n]); } }
  }
  for (let i = 0; i < heights.length; i++) heights[i] = immutable[i] ? raw[i] : Math.max(0, Math.min(heights[i], ceiling[i]));
  const report: RoadGradeReport = { roads: roads.length, repairedRoads: 0, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: 0, protectedRoads: roads.filter(protectedRoad).length, protectedRoadsChanged: 0, separatedCrossings: crossings.length, minCrossingSeparation: Infinity, joinedEndpointMaxDifference: 0,
    uncertainty: 'Estimated game road heights and eased approaches, not a survey. OriginalXY/alignment, road IDs and connectivity retained. Existing ORR profiles and source grade-separated lower roads are protected.' };
  for (const group of groups) report.joinedEndpointMaxDifference = Math.max(report.joinedEndpointMaxDifference, Math.max(...group.map(k => heights[k])) - Math.min(...group.map(k => heights[k])));
  const result = roads.map((e, r) => {
    const off = offsets[r], h = e.pts.map((_, i) => heights[off + i]), lengths = e.pts.slice(1).map((p, i) => Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]));
    for (let i = 0; i < lengths.length; i++) if (lengths[i] > .001 && Math.abs(gradeOf(e, i + 1) - gradeOf(e, i)) / lengths[i] > .1) report.sourceSteepSegments++;
    if (protectedRoad(e) || !h.some(y => y > .0001)) return e;
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
      const count = Math.max(1, Math.ceil(lengths[i] / SAMPLE));
      for (let j = 1; j <= count; j++) {
        const u = j / count, u2 = u * u, u3 = u2 * u;
        const value = (2 * u3 - 3 * u2 + 1) * h[i] + (u3 - 2 * u2 + u) * lengths[i] * m[i] + (-2 * u3 + 3 * u2) * h[i + 1] + (u3 - u2) * lengths[i] * m[i + 1];
        pts.push(j === count ? e.pts[i + 1] : [e.pts[i][0] + (e.pts[i + 1][0] - e.pts[i][0]) * u, e.pts[i][1] + (e.pts[i + 1][1] - e.pts[i][1]) * u]);
        elev.push(Math.max(Math.min(h[i], h[i + 1]), Math.min(Math.max(h[i], h[i + 1]), value)));
      }
    }
    report.repairedRoads++; return { ...e, pts, elev };
  });
  for (const e of result) for (let i = 1; i < e.pts.length; i++) {
    const length = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    if (length < .001) continue;
    const grade = Math.abs(gradeOf(e, i) - gradeOf(e, i - 1)) / length; report.maxModelGrade = Math.max(report.maxModelGrade, grade); if (grade > .1) report.modelSteepSegments++;
  }
  for (const c of crossings) report.minCrossingSeparation = Math.min(report.minCrossingSeparation, roadHeightAlong(result[c.upper], c.upperS) - roadHeightAlong(result[c.lower], c.lowerS));
  const changes = result.flatMap((e, i) => e === roads[i] ? [] : [{ id: e.id, pts: e.pts, elev: e.elev }]);
  prepared.set(roads, result); prepared.set(result, result); reports.set(result, report); patches.set(result, changes); return result;
}

export function rebaseRoadStops(core: CoreData, original: RoadEdge[], model: RoadEdge[]) {
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
  let rebased = 0, ambiguous = 0;
  const visited = new Set<StopTuple>();
  for (const stop of [...core.food.map(p => p.stop), ...core.theatres.map(p => p.stop), ...core.drops]) {
    if (visited.has(stop)) continue; visited.add(stop);
    const candidates: { e: RoadEdge; distance: number; score: number; match: boolean }[] = [];
    for (const span of cells.get(`${Math.floor(stop[0] / 60)},${Math.floor(stop[1] / 60)}`) || []) {
      const { e, i } = span, a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), u = Math.max(0, Math.min(1, ((stop[0] - a[0]) * dx + (stop[1] - a[1]) * dz) / (length * length || 1)));
      const d = Math.hypot(stop[0] - a[0] - dx * u, stop[1] - a[1] - dz * u), old = gradeOf(e, i - 1) + (gradeOf(e, i) - gradeOf(e, i - 1)) * u;
      if (d > e.w / 2 + 3 || Math.abs(old - stop[2]) > .75) continue;
      const match = !!stop[3] && e.name === stop[3];
      candidates.push({ e, distance: span.distance + length * u, score: d + Math.abs(old - stop[2]) * 8 - (match ? 4 : 0), match });
    }
    candidates.sort((a, b) => a.score - b.score); const best = candidates[0]; if (!best || byId.get(best.e.id) === best.e) continue;
    const competitor = candidates.find(c => c.e.id !== best.e.id);
    if (!best.match && competitor && competitor.score - best.score < .35) {
      // We need the roadside level, not an invented road identity. Two nearby
      // candidate approaches may share that level despite missing road names.
      // A genuine ground/deck ambiguity is retained for review instead.
      const levels = candidates.filter(c => c.score - best.score < .35).map(c => roadHeightAlong(byId.get(c.e.id)!, c.distance));
      if (Math.max(...levels) - Math.min(...levels) > .2) { ambiguous++; continue; }
    }
    const height = roadHeightAlong(byId.get(best.e.id)!, best.distance);
    if (Math.abs(height - stop[2]) > .001) { stop[2] = height; rebased++; }
  }
  const report = reports.get(model); if (report) { report.rebasedStops = rebased; report.ambiguousStops = ambiguous; }
  return { rebased, ambiguous };
}

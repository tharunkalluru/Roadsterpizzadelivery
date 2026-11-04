import type { RoadEdge, XZ } from './types';

/** Source repair precedes every estimated grade/profile/model/cache stage.
 * Deliberately has no default dataset or automatic activation. It never moves
 * actors, businesses, rail, metro or landmarks. */
export interface SourceRoadInput {
  id: string; cls: string; w: number; lanes: number | null; oneway: RoadEdge['oneway'];
  from: string | null; to: string | null; pts: XZ[]; elev: number[] | null;
}
export interface SourceRoadCutRepair {
  id: string; sourceSegmentID: string; expected: SourceRoadInput;
  pts: XZ[]; elev: number[] | null; sourceFractions: number[];
  /** Corresponding reference distance in the former packed polyline. May
   * extend outside [0, oldLength] when correcting the actual source cut. */
  sourceArc: number[];
  /** Corrected-source length coordinates: the base for subsequent inference. */
  correctedArc: number[]; legacyPointFractions: number[];
  cuts: { declared: [number, number]; actualBefore: [number, number]; actualAfter: [number, number]; repaired: [boolean, boolean]; unselectedCutsRetained: string[] };
  copies: { kind: string; pack?: string; tile?: string; context?: boolean }[];
}
export interface SourceRoadNodeRepair {
  connectorID: string; after: XZ; before: XZ[]; incidentRoadIDs: string[];
  referenceSegmentID: string; referenceAt: number;
}
export interface VerifiedSourceRoadGeometry {
  version: 1; kind: 'overture-wgs84-source-cut-repair'; generationID: string; release: string;
  sourceCorePackSHA256: string; sourceEvidenceSHA256: string; preflightSHA256: string;
  sourcePackSHA256: Record<string, string>; heightPolicy: string;
  additionalSourceEvidence?: { file: string; sha256: string }[];
  origin: { lat: number; lon: number; NR: number; MR: number };
  sources: { id: string; geometryLonLat: XZ[]; vertexFractions: number[]; geodeticLengthM: number; connectors: { connector_id: string; at: number }[]; levelRules: unknown; roadFlags: unknown; accessRestrictions?: unknown; provenance: unknown }[];
  nodes: Record<string, SourceRoadNodeRepair>; roads: SourceRoadCutRepair[];
}
const finiteXZ = (p: unknown): p is XZ => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-7;
const increasing = (a: number[]) => a.every((v, i) => Number.isFinite(v) && (!i || v > a[i - 1]));
const profileValid = (pts: XZ[], elev: number[] | null) => Array.isArray(pts) && pts.length >= 2 && pts.every(finiteXZ) &&
  (elev === null || Array.isArray(elev) && elev.length === pts.length && elev.every(Number.isFinite));

/** Build/source hashes are checked by the offline compiler and cache loader.
 * This validates the synchronous payload and exact per-road input binding. */
function validateSourceRoadGeometry(data: VerifiedSourceRoadGeometry): string[] {
  if (!data || data.version !== 1 || data.kind !== 'overture-wgs84-source-cut-repair' || !/^[a-f0-9]{64}$/.test(data.generationID) || !Array.isArray(data.roads) || !data.nodes || !Array.isArray(data.sources)) return ['source-dataset'];
  const errors: string[] = [], seen = new Set<string>(), sources = new Map(data.sources.map(s => [s.id, s]));
  if (sources.size !== data.sources.length || !data.origin || Object.values(data.origin).some(v => !Number.isFinite(v))) return ['source-dataset'];
  for (const s of sources.values()) if (!s || !Array.isArray(s.geometryLonLat) || s.geometryLonLat.length < 2 || !s.geometryLonLat.every(finiteXZ) ||
    !Array.isArray(s.vertexFractions) || s.vertexFractions.length !== s.geometryLonLat.length || !increasing(s.vertexFractions) || s.vertexFractions[0] !== 0 || s.vertexFractions.at(-1) !== 1 ||
    !Number.isFinite(s.geodeticLengthM) || s.geodeticLengthM <= 0 || !Array.isArray(s.connectors)) return ['source-dataset'];
  for (const [id, n] of Object.entries(data.nodes)) {
    if (!n || !n.connectorID?.startsWith(id) || !finiteXZ(n.after) || !Array.isArray(n.before) || !n.before.length || !n.before.every(finiteXZ) || !Array.isArray(n.incidentRoadIDs)) return [`source-node:${id}`];
    const source = sources.get(n.referenceSegmentID);
    const i = source?.vertexFractions.findIndex(f => Math.abs(f - n.referenceAt) * source.geodeticLengthM <= .00002) ?? -1;
    if (!source || i < 0 || !source.connectors.some(c => c.connector_id === n.connectorID && c.at === n.referenceAt)) return [`source-node-reference:${id}`];
    const [lon, lat] = source.geometryLonLat[i], x = (lon - data.origin.lon) * Math.cos(data.origin.lat * Math.PI / 180) * data.origin.NR * Math.PI / 180, z = -(lat - data.origin.lat) * data.origin.MR * Math.PI / 180;
    if (Math.hypot(n.after[0] - x, n.after[1] - z) > .00002) return [`source-node-position:${id}`];
  }
  for (const p of data.roads) {
    if (!p || seen.has(p.id) || p.expected?.id !== p.id || !sources.has(p.sourceSegmentID) || !profileValid(p.pts, p.elev) || !profileValid(p.expected.pts, p.expected.elev) ||
      !Array.isArray(p.sourceFractions) || p.sourceFractions.length !== p.pts.length || !increasing(p.sourceFractions) || p.sourceFractions.some(f => f < 0 || f > 1) ||
      !Array.isArray(p.sourceArc) || p.sourceArc.length !== p.pts.length || !increasing(p.sourceArc) ||
      !Array.isArray(p.correctedArc) || p.correctedArc.length !== p.pts.length || !increasing(p.correctedArc) || p.correctedArc[0] !== 0 ||
      !p.cuts || !Array.isArray(p.cuts.repaired) || p.cuts.repaired.length !== 2 || !Array.isArray(p.cuts.actualAfter) || p.cuts.actualAfter.length !== 2 ||
      Math.abs(p.sourceFractions[0] - p.cuts.actualAfter[0]) > 1e-12 || Math.abs(p.sourceFractions.at(-1)! - p.cuts.actualAfter[1]) > 1e-12) { errors.push(`source-road:${p?.id}`); continue; }
    for (let i = 1; i < p.pts.length; i++) if (Math.abs(p.correctedArc[i] - p.correctedArc[i - 1] - Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1])) > 1e-7) errors.push(`source-arc:${p.id}`);
    for (const [end, index, slot] of [['from', 0, 0], ['to', p.pts.length - 1, 1]] as const) {
      const node = p.expected[end], binding = node ? data.nodes[node] : undefined;
      if (p.cuts.repaired[slot] && (!binding || !near(p.pts[index], binding.after) || !binding.incidentRoadIDs.includes(p.id))) errors.push(`source-cut:${p.id}:${end}`);
      if (p.cuts.repaired[slot] && !sources.get(p.sourceSegmentID)!.connectors.some(c => c.connector_id === binding?.connectorID && c.at === p.cuts.declared[slot])) errors.push(`source-cut-reference:${p.id}:${end}`);
      if (!p.cuts.repaired[slot] && !equal(p.pts[index], p.expected.pts[slot ? p.expected.pts.length - 1 : 0])) errors.push(`source-unselected-cut:${p.id}:${end}`);
    }
    seen.add(p.id);
  }
  for (const [id, node] of Object.entries(data.nodes)) if (!node || !node.connectorID?.startsWith(id) || !finiteXZ(node.after) || !Array.isArray(node.before) || !node.before.length || !node.before.every(finiteXZ) || !Array.isArray(node.incidentRoadIDs) || node.incidentRoadIDs.some(road => !seen.has(road))) errors.push(`source-node:${id}`);
  return errors;
}

export function sourceRoadGeometryErrors(data: VerifiedSourceRoadGeometry): string[] {
  try { return validateSourceRoadGeometry(data); }
  catch { return ['source-dataset']; }
}

function input(road: RoadEdge, patch: SourceRoadCutRepair): SourceRoadInput {
  const lanes = (road as RoadEdge & { ctx?: number }).ctx && road.lanes === undefined ? patch.expected.lanes : road.lanes ?? null;
  return { id: road.id, cls: road.cls, w: road.w, lanes, oneway: road.oneway ?? null, from: road.from ?? null, to: road.to ?? null, pts: road.pts, elev: road.elev ?? null };
}

/** Atomic for the supplied core or tile batch. An unrelated road retains its
 * object identity. A changed owner cannot masquerade as a compressed context. */
export function applyVerifiedSourceRoadGeometry(roads: RoadEdge[], data: VerifiedSourceRoadGeometry) {
  const mismatched = sourceRoadGeometryErrors(data), applied: string[] = [], alreadyApplied: string[] = [];
  if (mismatched.length) return { roads, applied, alreadyApplied, mismatched };
  const byId = new Map(data.roads.map(p => [p.id, p]));
  const result = roads.map(road => {
    const patch = byId.get(road.id); if (!patch) return road;
    const actual = input(road, patch);
    if (equal(actual, { ...patch.expected, pts: patch.pts, elev: patch.elev })) { alreadyApplied.push(road.id); return road; }
    if (!equal(actual, patch.expected)) { mismatched.push(road.id); return road; }
    applied.push(road.id); return { ...road, pts: patch.pts.map(p => [...p] as XZ), elev: patch.elev?.slice() ?? null };
  });
  // Every supplied incidence is reviewed, including roads absent from the patch
  // map. A corrected node must never leave an old or omitted arm behind.
  if (!mismatched.length) for (const road of result) for (const [id, index] of [[road.from, 0], [road.to, road.pts.length - 1]] as const) {
    const node = id ? data.nodes[id] : undefined; if (!node) continue;
    if (!node.incidentRoadIDs.includes(road.id) || !finiteXZ(road.pts[index]) || !near(road.pts[index], node.after)) mismatched.push(`incident:${road.id}:${id}`);
  }
  return mismatched.length ? { roads, applied: [], alreadyApplied: [], mismatched } : { roads: applied.length ? result : roads, applied, alreadyApplied, mismatched };
}

/** Joint road/node application for a raw core or raw tile. Caller must run this
 * before generic grades, cache lookup and inferred node transports. */
export function applyVerifiedSourceRoadZone<T extends { roads: RoadEdge[]; nodes: Record<string, XZ> }>(source: T, data: VerifiedSourceRoadGeometry) {
  const roads = applyVerifiedSourceRoadGeometry(source.roads, data), nodesApplied: string[] = [], nodesAlreadyApplied: string[] = [];
  const mismatched = roads.mismatched.slice(); let nodes = source.nodes;
  if (!mismatched.length) for (const [id, repair] of Object.entries(data.nodes)) {
    const point = source.nodes[id]; if (!point) continue;
    if (near(point, repair.after)) { nodesAlreadyApplied.push(id); continue; }
    if (!repair.before.some(before => near(before, point))) { mismatched.push(`node:${id}`); continue; }
    if (nodes === source.nodes) nodes = { ...source.nodes };
    nodes[id] = [...repair.after]; nodesApplied.push(id);
  }
  const active = !mismatched.length;
  return { value: active && (roads.roads !== source.roads || nodes !== source.nodes) ? { ...source, roads: roads.roads, nodes } : source,
    report: { generationID: data?.generationID, applied: active ? roads.applied : [], alreadyApplied: active ? roads.alreadyApplied : [],
      nodesApplied: active ? nodesApplied : [], nodesAlreadyApplied: active ? nodesAlreadyApplied : [], mismatched } };
}

/** Reference remapping for route-distance state only. Business/stop/actor XZ
 * must not be moved through this mapping. Clipped-away old positions require
 * explicit caller handling, rather than silently pretending they still exist. */
export function sourceRoadDistanceAfter(patch: SourceRoadCutRepair, oldDistance: number) {
  if (!Number.isFinite(oldDistance)) throw Error('Invalid source road distance');
  const arc = patch.sourceArc, clipped = oldDistance < arc[0] || oldDistance > arc.at(-1)!;
  const distance = Math.max(arc[0], Math.min(arc.at(-1)!, oldDistance));
  let i = 1; while (i < arc.length - 1 && arc[i] < distance) i++;
  const u = (distance - arc[i - 1]) / (arc[i] - arc[i - 1]);
  return { distance: patch.correctedArc[i - 1] + (patch.correctedArc[i] - patch.correctedArc[i - 1]) * u, clipped };
}

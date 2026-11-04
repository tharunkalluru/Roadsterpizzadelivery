import type { RoadEdge, XZ } from './types';
import { roadClearanceWidth } from './road-pavement';

export interface ModeledRoadNode { before: XZ; after: XZ; delta: XZ }
export type ModeledRoadNodes = Record<string, ModeledRoadNode>;
export interface TileRoadSourceInput {
  id: string; cls: string; w: number; lanes: number | null; oneway: RoadEdge['oneway'];
  from: string | null; to: string | null; pts: XZ[]; elev: number[] | null;
}
export interface TileRoadNodeTransport {
  id: string; expected: TileRoadSourceInput; pts: XZ[]; elev: number[] | null;
  sourceArc: number[]; sourceXY: XZ[]; maximumDisplacement: number; minimumTransportMask: number;
  scenerySource?: RoadEdge['scenerySource'];
  /** Offline-only preservation of a flat street's pre-height physical width.
   * Prevents the generic raised-road floor from widening a ground approach. */
  joinedPavement?: RoadEdge['joinedPavement'];
}
const smooth = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const distance = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const zero: XZ = [0, 0];

export function tileRoadSourceInput(e: RoadEdge): TileRoadSourceInput {
  return { id: e.id, cls: e.cls, w: e.w, lanes: e.lanes ?? null, oneway: e.oneway ?? null,
    from: e.from ?? null, to: e.to ?? null, pts: e.pts, elev: e.elev ?? null };
}

/** The same bounded endpoint field used by the core geometry producer.
 * Its derivative is zero at both source ends; far unchanged nodes stay fixed. */
export function roadNodeDisplacement(s: number, length: number, from: XZ, to: XZ): XZ {
  const fade = Math.min(50, length / 2 || 1);
  const a = 1 - smooth(s / fade), b = 1 - smooth((length - s) / fade);
  return [from[0] * a + to[0] * b, from[1] * a + to[1] * b];
}

/** Canonical rail and metro corridors are never displaced with the road. */
export function roadTransportMask(rail: { pts: XZ[] }[], metro: { pts: XZ[] }[]) {
  const grid = new Map<string, { a: XZ; b: XZ; pad: number }[]>();
  for (const [lines, pad] of [[rail, 30], [metro, 12]] as const) for (const line of lines) for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i], span = { a, b, pad };
    for (let x = Math.floor((Math.min(a[0], b[0]) - pad) / 40); x <= Math.floor((Math.max(a[0], b[0]) + pad) / 40); x++)
      for (let z = Math.floor((Math.min(a[1], b[1]) - pad) / 40); z <= Math.floor((Math.max(a[1], b[1]) + pad) / 40); z++) {
        const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(span);
      }
  }
  return (p: XZ) => {
    let value = 1;
    for (const { a, b, pad } of grid.get(`${Math.floor(p[0] / 40)},${Math.floor(p[1] / 40)}`) || []) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(p[0] - a[0] - dx * u, p[1] - a[1] - dz * u);
      value = Math.min(value, smooth((d - pad / 2) / (pad / 2)));
    }
    return value;
  };
}

export function transportTileRoadNodes(e: RoadEdge, nodes: ModeledRoadNodes, mask: (p: XZ) => number = () => 1): TileRoadNodeTransport | null {
  const first = e.from ? nodes[e.from] : undefined, last = e.to ? nodes[e.to] : undefined;
  if (!first && !last) return null;
  if (e.pts.length < 2 || e.pts.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))) ||
    e.elev !== null && e.elev !== undefined && (e.elev.length !== e.pts.length || e.elev.some(y => !Number.isFinite(y)))) throw Error(`Invalid tile source geometry: ${e.id}`);
  for (const [node, point] of [[first, e.pts[0]], [last, e.pts[e.pts.length - 1]]] as const) if (node) {
    if (distance(node.before, point) > 1e-7 || distance([node.before[0] + node.delta[0], node.before[1] + node.delta[1]], node.after) > 1e-7 ||
      !Number.isFinite(node.delta[0]) || !Number.isFinite(node.delta[1]) || Math.hypot(...node.delta) > 5 + 1e-5) throw Error(`Modeled node does not bind tile source: ${e.id}`);
    if (Math.hypot(...node.delta) > 1e-7 && mask(point) < 1 - 1e-9) throw Error(`Tile endpoint needs a reviewed transport-mask transition: ${e.id}`);
  }
  const sourceXY: XZ[] = [e.pts[0]], sourceArc = [0], heights = [e.elev?.[0] || 0];
  let length = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], span = distance(a, b), count = Math.max(1, Math.ceil(span / 2));
    for (let j = 1; j <= count; j++) {
      const u = j / count; sourceXY.push(j === count ? b : [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      sourceArc.push(length + span * u); heights.push((e.elev?.[i - 1] || 0) * (1 - u) + (e.elev?.[i] || 0) * u);
    }
    length += span;
  }
  let maximumDisplacement = 0, minimumTransportMask = 1;
  const pts: XZ[] = sourceXY.map((p, i) => {
    let d = roadNodeDisplacement(sourceArc[i], length, first?.delta || zero, last?.delta || zero);
    if (i !== 0 && i !== sourceXY.length - 1) {
      const value = mask(p); if (!Number.isFinite(value) || value < 0 || value > 1) throw Error(`Invalid transport mask: ${e.id}`);
      minimumTransportMask = Math.min(minimumTransportMask, value); d = [d[0] * value, d[1] * value];
    }
    maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(...d));
    return [p[0] + d[0], p[1] + d[1]];
  });
  if (maximumDisplacement > 5 + 1e-5) throw Error(`Tile road exceeds modeled displacement bound: ${e.id}`);
  return { id: e.id, expected: tileRoadSourceInput(e), pts, elev: e.elev ? heights : null, sourceArc, sourceXY, maximumDisplacement, minimumTransportMask,
    scenerySource: { pts: e.pts, elev: e.elev ?? null, width: Math.max(roadClearanceWidth(e), e.elev?.some(y => y > 1.2) ? 8.4 : 0) } };
}

/** Applied identically to a source owner and every context copy. Width, lane
 * evidence, source IDs and ordinary driving behavior are retained. */
export function applyTileRoadNodeTransports(roads: RoadEdge[], transports: TileRoadNodeTransport[]) {
  const byId = new Map(transports.map(p => [p.id, p])), applied: string[] = [], mismatched: string[] = [];
  const result = roads.map(e => {
    const p = byId.get(e.id); if (!p) return e;
    const actual = tileRoadSourceInput(e);
    // Packed border context intentionally omits lane metadata retained by its
    // actual owner. Geometry still binds exactly; an owner cannot use this path.
    if ((e as RoadEdge & { ctx?: number }).ctx && e.lanes === undefined) actual.lanes = p.expected.lanes;
    const valid = Array.isArray(p.pts) && p.pts.length >= 2 && p.pts.every(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)) &&
      (p.elev === null || Array.isArray(p.elev) && p.elev.length === p.pts.length && p.elev.every(Number.isFinite));
    const width=p.joinedPavement,validWidth=!width||Number.isFinite(width.sourceWidth)&&width.sourceWidth>0&&Number.isFinite(width.originalWidth)&&width.originalWidth>=e.w&&
      Number.isFinite(width.taper)&&width.taper>0&&Array.isArray(width.intervals)&&width.intervals.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite)&&q[0]<=q[1])&&
      (width.usableLanes===undefined||Number.isSafeInteger(width.usableLanes)&&width.usableLanes>=1)&&
      (width.physicalWidth===undefined||Number.isFinite(width.physicalWidth)&&width.physicalWidth>=e.w&&width.physicalWidth<=width.originalWidth);
    if (!valid || !validWidth || JSON.stringify(actual) !== JSON.stringify(p.expected)) { mismatched.push(e.id); return e; }
    applied.push(e.id); return { ...e, pts: p.pts.map(q=>[...q] as XZ), elev: p.elev?.slice()??null, scenerySource: p.scenerySource ? structuredClone(p.scenerySource) : e.scenerySource,
      joinedPavement:p.joinedPavement?structuredClone(p.joinedPavement):e.joinedPavement };
  });
  return { roads: applied.length ? result : roads, applied, mismatched };
}

/** Rendered junction furniture and caps use the same modeled endpoints as
 * RoadGraph. Source node tables and cached source packs stay immutable. */
export function applyModeledRoadNodePositions(source: Record<string, XZ>, field: ModeledRoadNodes) {
  let result = source;
  const applied: string[] = [], mismatched: string[] = [];
  for (const [id, node] of Object.entries(field)) {
    const point = source[id]; if (!point) continue;
    if (distance(point, node.before) > 1e-7) { mismatched.push(id); continue; }
    if (result === source) result = { ...source };
    result[id] = [...node.after]; applied.push(id);
  }
  return { nodes: result, applied, mismatched };
}

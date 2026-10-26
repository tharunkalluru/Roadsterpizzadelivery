import type { RoadEdge, XZ } from './types';
import { auxiliaryLane, travelDirection } from './expressway';
import type { RoadQuad } from './road-surface';

export interface BridgeBoundary { ax: number; az: number; bx: number; bz: number; ya: number; yb: number; segment: number }
interface Triangle { e: RoadEdge; i: number; p: RoadQuad[number][] }

// These are the renderer's physical carriageway edges, including widened narrow
// decks and auxiliary lanes. The clipper uses their finite triangles instead of
// source centrelines or an arbitrary distance from a connector.
export function roadRibbon(e: RoadEdge, roads: RoadEdge[]) {
  const hw = e.elev?.some(y => y > 1.2) ? Math.max(e.w / 2, 4.2) : e.w / 2;
  const extra = auxiliaryLane(e, roads), outer = -travelDirection(e);
  const boundary = (side: number) => e.pts.map((p, i): XZ => {
    const a = e.pts[Math.max(0, i - 1)], b = e.pts[Math.min(e.pts.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const off = side * (hw + (side === outer ? extra[i] : 0));
    return [p[0] - (b[1] - a[1]) / len * off, p[1] + (b[0] - a[0]) / len * off];
  });
  const L = boundary(1), R = boundary(-1);
  const quads: RoadQuad[] = e.pts.slice(1).map((_, i) => [[R[i][0], e.elev?.[i] || 0, R[i][1]], [R[i + 1][0], e.elev?.[i + 1] || 0, R[i + 1][1]], [L[i + 1][0], e.elev?.[i + 1] || 0, L[i + 1][1]], [L[i][0], e.elev?.[i] || 0, L[i][1]]]);
  return { hw, extra, outer, L, R, quads };
}

const constrain = (range: number[], value: number, delta: number, low: number, high: number) => {
  if (Math.abs(delta) < 1e-10) return value >= low && value <= high;
  const a = (low - value) / delta, b = (high - value) / delta;
  range[0] = Math.max(range[0], Math.min(a, b)); range[1] = Math.min(range[1], Math.max(a, b));
  return range[0] < range[1] - 1e-9;
};
export function bridgeBoundaryClipper(roads: RoadEdge[], patches: { e: RoadEdge; quad: RoadQuad }[] = []) {
  const grid = new Map<string, Triangle[]>();
  const add = (t: Triangle) => {
    const p = t.p;
    for (let x = Math.floor((Math.min(...p.map(p => p[0])) - .1) / 40); x <= Math.floor((Math.max(...p.map(p => p[0])) + .1) / 40); x++)
      for (let z = Math.floor((Math.min(...p.map(p => p[2])) - .1) / 40); z <= Math.floor((Math.max(...p.map(p => p[2])) + .1) / 40); z++) {
        const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(t);
      }
  };
  for (const e of roads) {
    // These source classes all produce physical roadQuad surfaces in the city
    // renderer, including tile-only pedestrian ramps that a flying car can land
    // on. A through panel must not fence any of those finite surfaces off.
    const ribbon = roadRibbon(e, roads);
    for (let i = 0; i < ribbon.quads.length; i++) for (const indices of [[0, 1, 2], [0, 2, 3]]) {
      add({ e, i, p: indices.map(j => ribbon.quads[i][j]) });
    }
  }
  for (const patch of patches) for (const indices of [[0, 1, 2], [0, 2, 3]]) add({ e: patch.e, i: -1, p: indices.map(i => patch.quad[i]) });
  return (own: RoadEdge, wall: BridgeBoundary) => {
    const cuts: number[][] = [], near = new Set<Triangle>(), wx = wall.bx - wall.ax, wz = wall.bz - wall.az;
    for (let x = Math.floor(Math.min(wall.ax, wall.bx) / 40); x <= Math.floor(Math.max(wall.ax, wall.bx) / 40); x++)
      for (let z = Math.floor(Math.min(wall.az, wall.bz) / 40); z <= Math.floor(Math.max(wall.az, wall.bz) / 40); z++) for (const t of grid.get(`${x},${z}`) || []) near.add(t);
    for (const { e, i, p: [a, b, c] } of near) {
      const ownStrip = e.id === own.id && i === wall.segment;
      const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], determinant = bx * cz - bz * cx;
      if (Math.abs(determinant) < 1e-9) continue;
      const x = wall.ax - a[0], z = wall.az - a[2], u = (x * cz - z * cx) / determinant, v = (bx * z - bz * x) / determinant;
      const du = (wx * cz - wz * cx) / determinant, dv = (bx * wz - bz * wx) / determinant, range = [0, 1];
      // A tiny horizontal margin prevents two independently rounded tile copies
      // leaving a visible/collidable sliver at a shared edge.
      const epsilon = ownStrip ? 1e-7 : -1e-5;
      if (!constrain(range, u, du, epsilon, Infinity) || !constrain(range, v, dv, epsilon, Infinity) || !constrain(range, u + v, du + dv, -Infinity, 1 - epsilon)) continue;
      const height = a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), dh = du * (b[1] - a[1]) + dv * (c[1] - a[1]);
      if (!constrain(range, wall.ya - height, wall.yb - wall.ya - dh, .1 - .95, 4.85 + .9)) continue;
      cuts.push(range);
    }
    cuts.sort((a, b) => a[0] - b[0]); const kept: number[][] = []; let cursor = 0;
    for (const [lo, hi] of cuts) { if (lo > cursor + 1e-8) kept.push([cursor, lo]); cursor = Math.max(cursor, hi); }
    if (cursor < 1 - 1e-8) kept.push([cursor, 1]);
    return kept.map(([lo, hi]) => ({ ...wall, ax: wall.ax + wx * lo, az: wall.az + wz * lo, bx: wall.ax + wx * hi, bz: wall.az + wz * hi, ya: wall.ya + (wall.yb - wall.ya) * lo, yb: wall.ya + (wall.yb - wall.ya) * hi }));
  };
}

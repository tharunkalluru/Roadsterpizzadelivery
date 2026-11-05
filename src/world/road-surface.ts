export type RoadQuad = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

/** Clip the original rendered triangles, preserving their exact support plane.
 * A long context road retains local pavement after its owner tile unloads. */
export function clipRoadQuadToTile(quad: RoadQuad, i: number, j: number): RoadQuad[] {
  const result: RoadQuad[] = [], bounds = [[0, i * 1000, 1], [0, (i + 1) * 1000, -1], [2, j * 1000, 1], [2, (j + 1) * 1000, -1]];
  for (const indices of [[0, 1, 2], [0, 2, 3]]) {
    let polygon = indices.map(index => quad[index]);
    for (const [axis, boundary, sign] of bounds) {
      const clipped: RoadQuad[number][] = [];
      for (let n = 0; n < polygon.length; n++) {
        const a = polygon[n], b = polygon[(n + 1) % polygon.length], da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign;
        if (da >= -1e-8) clipped.push(a);
        if ((da < 0) !== (db < 0)) {
          const u = da / (da - db);
          clipped.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
        }
      }
      polygon = clipped;
    }
    for (let n = 1; n < polygon.length - 1; n++) {
      const a = polygon[0], b = polygon[n], c = polygon[n + 1];
      if (Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) > 1e-8) result.push([a, b, c, c]);
    }
  }
  return result;
}

export function roadSpansMultipleTiles(points: readonly [number, number][]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return maxX - minX > 1000 || maxZ - minZ > 1000;
}

export function clipRoadPathToTile(points: readonly [number, number][], i: number, j: number): [number, number][][] {
  const pieces: [number, number][][] = [];
  for (let n = 1; n < points.length; n++) {
    const a = points[n - 1], b = points[n], d = [b[0] - a[0], b[1] - a[1]], range = [0, 1]; let valid = true;
    for (const [axis, low, high] of [[0, i * 1000, (i + 1) * 1000], [1, j * 1000, (j + 1) * 1000]]) {
      if (Math.abs(d[axis]) < 1e-9) { if (a[axis] < low || a[axis] > high) valid = false; continue; }
      const p = (low - a[axis]) / d[axis], q = (high - a[axis]) / d[axis]; range[0] = Math.max(range[0], Math.min(p, q)); range[1] = Math.min(range[1], Math.max(p, q));
    }
    if (!valid || range[1] <= range[0] + 1e-9) continue;
    const first: [number, number] = [a[0] + d[0] * range[0], a[1] + d[1] * range[0]], last: [number, number] = [a[0] + d[0] * range[1], a[1] + d[1] * range[1]], previous = pieces[pieces.length - 1];
    if (previous && Math.hypot(previous[previous.length - 1][0] - first[0], previous[previous.length - 1][1] - first[1]) < 1e-7) previous.push(last); else pieces.push([first, last]);
  }
  return pieces;
}

// The same two triangles as Batch.quad. A finite sloped road is not a capsule:
// clamping projection to its endpoint creates a flat invisible ledge beyond it.
export function roadQuadHeight(quad: RoadQuad, x: number, z: number): number | null {
  for (let i = 0; i < 2; i++) {
    const a = quad[0], b = quad[i === 0 ? 1 : 2], c = quad[i === 0 ? 2 : 3];
    const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], det = bx * cz - bz * cx;
    if (Math.abs(det) < 1e-9) continue;
    const px = x - a[0], pz = z - a[2], u = (px * cz - pz * cx) / det, v = (bx * pz - bz * px) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
  }
  return null;
}

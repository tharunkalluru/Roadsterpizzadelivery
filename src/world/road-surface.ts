export type RoadQuad = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

// The same two triangles as Batch.quad. A finite sloped road is not a capsule:
// clamping projection to its endpoint creates a flat invisible ledge beyond it.
export function roadQuadHeight(quad: RoadQuad, x: number, z: number): number | null {
  for (const [a, b, c] of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]) {
    const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], det = bx * cz - bz * cx;
    if (Math.abs(det) < 1e-9) continue;
    const px = x - a[0], pz = z - a[2], u = (px * cz - pz * cx) / det, v = (bx * pz - bz * px) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
  }
  return null;
}

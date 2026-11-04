import type { XZ } from './types';
import type { RoadQuad } from './road-surface';

interface PaintSegment { left0: XZ; left1: XZ; right0: XZ; right1: XZ }

/** Offset-line intersections preserve stripe width on both sides of a bend.
 * A near reversal or short chord gets a bounded outer bevel, never a spike. */
export function continuousPaintStroke(points: readonly XZ[], width: number) {
  const half = width / 2, directions: XZ[] = [], lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0], dz = points[i][1] - points[i - 1][1], length = Math.hypot(dx, dz);
    lengths.push(length); directions.push(length > 1e-9 ? [dx / length, dz / length] : [0, 0]);
  }
  const offset = (p: XZ, h: XZ, side: number): XZ => [p[0] - h[1] * half * side, p[1] + h[0] * half * side];
  const segments: PaintSegment[] = directions.map((h, i) => ({ left0: offset(points[i], h, 1), left1: offset(points[i + 1], h, 1), right0: offset(points[i], h, -1), right1: offset(points[i + 1], h, -1) }));
  const bevels: { index: number; points: XZ[] }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = directions[i - 1], b = directions[i], dot = a[0] * b[0] + a[1] * b[1], denominator = 1 + dot;
    const mx = denominator > 1e-9 ? -(a[1] + b[1]) * half / denominator : Infinity;
    const mz = denominator > 1e-9 ? (a[0] + b[0]) * half / denominator : Infinity;
    const safe = lengths[i - 1] > 1e-9 && lengths[i] > 1e-9 && Math.hypot(mx, mz) <= half * 4 &&
      Math.abs(mx * a[0] + mz * a[1]) <= lengths[i - 1] * .45 && Math.abs(mx * b[0] + mz * b[1]) <= lengths[i] * .45;
    if (safe) {
      const left: XZ = [points[i][0] + mx, points[i][1] + mz], right: XZ = [points[i][0] - mx, points[i][1] - mz];
      segments[i - 1].left1 = segments[i].left0 = left;
      segments[i - 1].right1 = segments[i].right0 = right;
    } else {
      const cross = a[0] * b[1] - a[1] * b[0], side = cross > 0 ? -1 : 1;
      if (Math.abs(cross) > 1e-9) bevels.push({ index: i, points: [points[i], offset(points[i], a, side), offset(points[i], b, side)] });
    }
  }
  return { segments, bevels };
}

/** Paint is cut by each literal asphalt triangle and inherits that plane.
 * It cannot bridge a missing corner or interpolate through a twisted diagonal. */
export function paintOnRoad(polygon: readonly XZ[], road: RoadQuad, lift: number): RoadQuad[] {
  const output: RoadQuad[] = [];
  for (const indices of [[0, 1, 2], [0, 2, 3]]) {
    const [a, b, c] = indices.map(i => road[i]), bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], det = bx * cz - bz * cx;
    if (Math.abs(det) < 1e-9) continue;
    let points: XZ[] = [...polygon];
    const triangle = [a, b, c], sign = Math.sign(det);
    for (let edge = 0; edge < 3; edge++) {
      const p = triangle[edge], q = triangle[(edge + 1) % 3], clipped: XZ[] = [];
      const distance = (v: XZ) => sign * ((q[0] - p[0]) * (v[1] - p[2]) - (q[2] - p[2]) * (v[0] - p[0]));
      for (let i = 0; i < points.length; i++) {
        const x = points[i], y = points[(i + 1) % points.length], dx = distance(x), dy = distance(y);
        if (dx >= -1e-9) clipped.push(x);
        if ((dx < 0) !== (dy < 0)) { const t = dx / (dx - dy); clipped.push([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t]); }
      }
      points = clipped;
    }
    const vertex = (p: XZ): RoadQuad[number] => {
      const x = p[0] - a[0], z = p[1] - a[2], u = (x * cz - z * cx) / det, v = (bx * z - bz * x) / det;
      return [p[0], a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) + lift, p[1]];
    };
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[0], q = points[i], r = points[i + 1];
      if (Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) > 1e-10) { const a = vertex(p), b = vertex(q), c = vertex(r); output.push([a, b, c, c]); }
    }
  }
  return output;
}

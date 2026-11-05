// Exact pre-height-correction lane XZ/heading/scalarY oracle; do not update with production.
import type {GEdge} from '../../src/game/roadgraph';import type {XZ} from '../../src/world/types';
// Sub-metre source chords can encode a surveying kink at an otherwise straight
// road split. They must not swing a lane offset several metres sideways. Keep
// every source coordinate, but use a usable neighbouring chord for its normal.
function offsetHeading(pts: XZ[], low: number, high: number): XZ {
  while (Math.hypot(pts[high][0] - pts[low][0], pts[high][1] - pts[low][1]) < 1 && (low > 0 || high < pts.length - 1)) {
    if (high < pts.length - 1) high++;
    if (low > 0) low--;
  }
  const dx = pts[high][0] - pts[low][0], dz = pts[high][1] - pts[low][1], length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

export function legacyPointAt(g: GEdge, s: number, dir: 1 | -1, lateral = 0): { x: number; y: number; z: number; hx: number; hz: number } {
    const d = dir === 1 ? s : g.len - s;
    let i = 1; while (i < g.cum.length - 1 && g.cum[i] < d) i++;
    const a = g.e.pts[i - 1], b = g.e.pts[i], seg = g.cum[i] - g.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (d - g.cum[i - 1]) / seg));
    let hx = (b[0] - a[0]) / seg, hz = (b[1] - a[1]) / seg;
    if (dir === -1) { hx = -hx; hz = -hz; }
    const ya = g.e.elev ? g.e.elev[i - 1] : 0, yb = g.e.elev ? g.e.elev[i] : 0;
    // drive on the left: left of heading (hx,hz) is (hz,-hx)
    const [offsetX, offsetZ] = lateral ? offsetHeading(g.e.pts, i - 1, i) : [hx * dir, hz * dir];
    return { x: a[0] + (b[0] - a[0]) * u + offsetZ * dir * lateral, y: ya + (yb - ya) * u, z: a[1] + (b[1] - a[1]) * u - offsetX * dir * lateral, hx, hz };
  }

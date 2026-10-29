import type { RailwayRun } from '../game/railway-flow';
import type { RoadEdge } from '../world/types';

export interface VerifiedRailPassage {
  id: string; x: number; z: number; s: number; radius: number; ceiling: number;
}

/** Finds finite road decks crossing the selected, actual train run. No geometry is created. */
export function verifiedRailPassages(run: RailwayRun, roads: readonly RoadEdge[], coachRoof = 4.175,
  range = { min: 0, max: run.len }) {
  const found: VerifiedRailPassage[] = [];
  for (const road of roads) {
    if (!road.elev || road.elev.length !== road.pts.length || road.w < 3 || road.w > 60 ||
      /railway|foot|steps|path|cycle/.test(road.cls)) continue;
    for (let ri = 1; ri < road.pts.length; ri++) {
      const a = road.pts[ri - 1], b = road.pts[ri], rx = b[0] - a[0], rz = b[1] - a[1], rl = Math.hypot(rx, rz);
      if (rl < .1 || Math.max(road.elev[ri - 1], road.elev[ri]) < coachRoof + 2.8) continue;
      for (let ti = 1; ti < run.pts.length; ti++) {
        if (run.cum[ti] < range.min || run.cum[ti - 1] > range.max) continue;
        const p = run.pts[ti - 1], q = run.pts[ti], tx = q[0] - p[0], tz = q[2] - p[2], tl = Math.hypot(tx, tz);
        if (tl < .1 || Math.max(a[0], b[0]) < Math.min(p[0], q[0]) || Math.min(a[0], b[0]) > Math.max(p[0], q[0]) ||
          Math.max(a[1], b[1]) < Math.min(p[2], q[2]) || Math.min(a[1], b[1]) > Math.max(p[2], q[2])) continue;
        const cross = tx * rz - tz * rx, sine = Math.abs(cross) / (tl * rl);
        if (sine < .2) continue;
        const dx = a[0] - p[0], dz = a[1] - p[2];
        const t = (dx * rz - dz * rx) / cross, u = (dx * tz - dz * tx) / cross;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const railY = p[1] + (q[1] - p[1]) * t;
        const ceiling = road.elev[ri - 1] + (road.elev[ri] - road.elev[ri - 1]) * u - .9;
        const headroom = ceiling - railY - coachRoof;
        // A landed Roadster must genuinely fit; at-grade/road-under-rail and
        // overhead spans too high to be a ducking challenge do not qualify.
        if (!Number.isFinite(headroom) || headroom < 1.85 || headroom > 7) continue;
        const radius = (road.w / 2 + 1.6) / sine + 4;
        const s = run.cum[ti - 1] + t * tl;
        if (radius > 70 || s < range.min || s > range.max || s < radius + 20 || s > run.len - radius - 20) continue;
        if (found.some(item => item.id.startsWith(`${road.id}:`) && Math.abs(item.s - s) < 2)) continue;
        found.push({ id: `${road.id}:${ri}`, x: p[0] + tx * t, z: p[2] + tz * t, s, radius, ceiling });
      }
    }
  }
  return found.sort((a, b) => a.s - b.s);
}

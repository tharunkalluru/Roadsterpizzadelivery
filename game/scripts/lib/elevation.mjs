// Provisional vertical profile: bridges (6.5 m per layer level), tunnels (-5 m), linear ramps on approaches.
// OSM `layer` is a relative stacking order, NOT metres; the metre values below are authored provisional values.
import { cumulative, dist, r2, polyLength } from './geo.mjs';

export const RAMP_M = 120;
export const BRIDGE_ELEV_PER_LEVEL = 6.5;
export const TUNNEL_ELEV = -5;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function pointAtS(pts, cum, s) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1];
  const t = seg > 0 ? (s - cum[i - 1]) / seg : 0;
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}

/**
 * roads: [{id, bridge, tunnel, level, fromNode, toNode, points, lengthM}]
 * Mutates: points (extra collinear break points where a ramp starts/ends), lengthM, pointElevM, elevationM.
 * Rules:
 *  - bridge: base elevation = 6.5 m * max(1, layer); tunnel: -5 m flat; everything else 0.
 *  - at-grade edges connected to a bridge end ramp linearly down to 0 over up to 120 m of network distance
 *    (multi-branch Dijkstra from the bridge end node over at-grade edges, so node elevations stay continuous);
 *  - a bridge end with no connection at all ramps on the bridge's own first/last 25 % of length.
 */
export function computeElevations(roads) {
  const atGrade = (r) => !r.bridge && !r.tunnel;
  const info = new Map();
  for (const r of roads) {
    let base = 0;
    if (r.tunnel) base = TUNNEL_ELEV;
    else if (r.bridge) base = BRIDGE_ELEV_PER_LEVEL * Math.max(1, r.level);
    info.set(r, { base, ramps: [], freeStart: false, freeEnd: false });
  }
  const roadsAtNode = new Map();
  for (const r of roads) {
    for (const k of [r.fromNode, r.toNode]) {
      let a = roadsAtNode.get(k);
      if (!a) roadsAtNode.set(k, (a = []));
      if (!a.includes(r)) a.push(r);
    }
  }
  const stats = { rampApproachEdges: 0, rampOwnEdges: 0 };
  for (const b of roads.filter((x) => x.bridge && !x.tunnel)) {
    const E = info.get(b).base;
    for (const end of [{ node: b.fromNode, atStart: true }, { node: b.toNode, atStart: false }]) {
      const others = (roadsAtNode.get(end.node) || []).filter((o) => o !== b);
      const grade = others.filter(atGrade);
      const bridgeNeighbour = others.some((o) => !atGrade(o));
      if (grade.length === 0 && !bridgeNeighbour) {
        stats.rampOwnEdges++;
        info.get(b)[end.atStart ? 'freeStart' : 'freeEnd'] = true;
        continue;
      }
      if (grade.length === 0) continue;
      const d = new Map([[end.node, 0]]);
      const queue = [[0, end.node]];
      while (queue.length) {
        queue.sort((x, y) => x[0] - y[0] || cmp(x[1], y[1]));
        const [dd, nk] = queue.shift();
        if (dd > d.get(nk)) continue;
        for (const o of roadsAtNode.get(nk) || []) {
          if (!atGrade(o)) continue;
          const other = o.fromNode === nk ? o.toNode : o.fromNode;
          const nd = dd + o.lengthM;
          if (nd < RAMP_M && (!d.has(other) || nd < d.get(other))) {
            d.set(other, nd);
            queue.push([nd, other]);
          }
        }
      }
      for (const o of roads) {
        if (!atGrade(o)) continue;
        const da = d.get(o.fromNode);
        const db = d.get(o.toNode);
        if (da === undefined && db === undefined) continue;
        info.get(o).ramps.push({ E, da, db });
      }
    }
  }
  const rampedRoads = new Set();
  for (const r of roads) {
    const inf = info.get(r);
    let cum = cumulative(r.points);
    const L = cum[cum.length - 1];
    // break points where a ramp ends (elevation reaches 0) or a bridge's own ramp plateau starts/ends
    const breaks = [];
    for (const rp of inf.ramps) {
      if (rp.da !== undefined) {
        const s = RAMP_M - rp.da;
        if (s > 0.05 && s < L - 0.05 && (rp.db === undefined || rp.db + (L - s) >= RAMP_M)) breaks.push(s);
      }
      if (rp.db !== undefined) {
        const s = L - (RAMP_M - rp.db);
        if (s > 0.05 && s < L - 0.05 && (rp.da === undefined || rp.da + s >= RAMP_M)) breaks.push(s);
      }
    }
    if (inf.freeStart) breaks.push(0.25 * L);
    if (inf.freeEnd) breaks.push(0.75 * L);
    if (breaks.length) {
      const uniq = [...new Set(breaks.map((s) => Math.round(s * 100) / 100))].sort((a, b) => a - b).filter((s) => !cum.some((c) => Math.abs(c - s) < 0.05));
      if (uniq.length) {
        const pts = [];
        const all = cum.map((c, i) => ({ s: c, p: r.points[i] })).concat(uniq.map((s) => ({ s, p: pointAtS(r.points, cum, s).map((v) => r2(v)) })));
        all.sort((a, b) => a.s - b.s);
        for (const a of all) pts.push(a.p);
        r.points = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
        r.lengthM = r2(polyLength(r.points));
        cum = cumulative(r.points);
      }
    }
    const L2 = cum[cum.length - 1];
    r.pointElevM = r.points.map((_, i) => {
      const s = cum[i];
      let v = inf.base;
      if (r.bridge && (inf.freeStart || inf.freeEnd)) {
        const f0 = inf.freeStart ? Math.min(1, s / (0.25 * L2)) : 1;
        const f1 = inf.freeEnd ? Math.min(1, (L2 - s) / (0.25 * L2)) : 1;
        v = inf.base * Math.min(f0, f1);
      }
      for (const rp of inf.ramps) {
        const dd = Math.min(rp.da === undefined ? Infinity : rp.da + s, rp.db === undefined ? Infinity : rp.db + (L2 - s));
        const val = rp.E * Math.max(0, 1 - dd / RAMP_M);
        if (val > v) {
          v = val;
          rampedRoads.add(r.id);
        }
      }
      return r2(v);
    });
    r.elevationM = r.pointElevM.length ? Math.max(...r.pointElevM) : 0;
  }
  stats.rampApproachEdges = rampedRoads.size;
  return stats;
}

/** Synthetic self-test used by validate-world.mjs: one flyover with approaches, a free-ended bridge, a tunnel. */
export function elevationSelfTest() {
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const mk = (id, a, b, pts, extra = {}) => ({ id, fromNode: a, toNode: b, points: pts, lengthM: len(pts), level: 0, bridge: false, tunnel: false, ...extra });
  const roads = [
    mk('a', 'n0', 'n1', [[0, 0], [100, 0]]),
    mk('b', 'n1', 'n2', [[100, 0], [400, 0]], { bridge: true, level: 1 }),
    mk('c', 'n2', 'n3', [[400, 0], [500, 0]]),
    mk('d', 'n3', 'n4', [[500, 0], [600, 0]]),
    mk('e', 'n5', 'n6', [[0, 100], [100, 100]], { bridge: true, level: 2 }),
    mk('f', 'n7', 'n8', [[0, 200], [100, 200]], { tunnel: true }),
  ];
  const st = computeElevations(roads);
  const by = Object.fromEntries(roads.map((r) => [r.id, r]));
  const errs = [];
  const near = (x, y) => Math.abs(x - y) < 0.011;
  const ramp100 = 6.5 * (1 - 100 / 120);
  if (!by.b.pointElevM.every((v) => near(v, 6.5)) || !near(by.b.elevationM, 6.5)) errs.push('flyover must be flat 6.5 m');
  if (!(near(by.a.pointElevM[0], ramp100) && near(by.a.pointElevM[by.a.pointElevM.length - 1], 6.5))) errs.push('approach a ramp wrong: ' + by.a.pointElevM);
  if (!(near(by.c.pointElevM[0], 6.5) && near(by.c.pointElevM[1], ramp100))) errs.push('approach c ramp wrong: ' + by.c.pointElevM);
  if (!(by.d.points.length === 3 && near(by.d.pointElevM[0], ramp100) && by.d.pointElevM[1] === 0 && by.d.pointElevM[2] === 0 && near(by.d.points[1][0], 520))) errs.push('approach d should reach 0 at 120 m from the bridge end: ' + JSON.stringify(by.d.points) + by.d.pointElevM);
  if (!(by.e.points.length === 4 && near(by.e.elevationM, 13) && by.e.pointElevM[0] === 0 && near(by.e.pointElevM[1], 13) && near(by.e.pointElevM[2], 13) && by.e.pointElevM[3] === 0)) errs.push('free bridge ends must ramp on the bridge (layer 2 = 13 m): ' + by.e.pointElevM);
  if (!by.f.pointElevM.every((v) => v === -5) || by.f.elevationM !== -5) errs.push('tunnel must be -5 m');
  return { errs, stats: st };
}

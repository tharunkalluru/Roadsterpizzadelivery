// Provisional vertical profile: bridges (6.5 m per layer level), tunnels (-5 m), approach ramps.
// OSM `layer` is a relative stacking order, NOT metres; the metre values below are authored provisional values.
import { cumulative, dist, r2, polyLength } from './geo.mjs';

export const RAMP_M = 120;
export const BRIDGE_ELEV_PER_LEVEL = 6.5;
export const TUNNEL_ELEV = -5;
export const OWN_RAMP_MIN_M = 30;

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
 * Rules (all provisional):
 *  - bridge: base elevation = 6.5 m * max(1, layer); tunnel: -5 m flat; everything else 0.
 *  - bridge end whose single at-grade neighbour is a chain (nodes of degree 2) that is at least 120 m long or ends in a
 *    dead end: that chain ramps linearly down to 0 over min(120 m, chain length);
 *  - bridge end at a junction (two or more at-grade roads at the node), or whose chain reaches a junction within 120 m,
 *    or with no connection at all: the node stays at grade and the BRIDGE edge itself ramps from 0 over its first/last
 *    max(25 % of length, 30 m) (at most half of the edge).
 *  Node elevations are therefore identical for every incident edge.
 */
export function computeElevations(roads) {
  const atGrade = (r) => !r.bridge && !r.tunnel;
  const info = new Map();
  for (const r of roads) {
    let base = 0;
    if (r.tunnel) base = TUNNEL_ELEV;
    else if (r.bridge) base = BRIDGE_ELEV_PER_LEVEL * Math.max(1, r.level);
    info.set(r, { base, ramps: [], ownStart: false, ownEnd: false });
  }
  const roadsAtNode = new Map();
  for (const r of roads) {
    for (const k of [r.fromNode, r.toNode]) {
      let a = roadsAtNode.get(k);
      if (!a) roadsAtNode.set(k, (a = []));
      if (!a.includes(r)) a.push(r);
    }
  }
  const stats = { rampApproachEdges: 0, rampOwnEnds: 0, rampChainEnds: 0, rampOwnEdges: 0 };
  for (const b of roads.filter((x) => x.bridge && !x.tunnel)) {
    const E = info.get(b).base;
    for (const end of [{ node: b.fromNode, atStart: true }, { node: b.toNode, atStart: false }]) {
      const others = (roadsAtNode.get(end.node) || []).filter((o) => o !== b);
      if (others.some((o) => !atGrade(o))) continue; // continues into another elevated edge
      const grade = others.filter(atGrade);
      let chain = null;
      if (grade.length === 1) {
        // walk the chain of degree-2 nodes
        const edges = [];
        let node = end.node;
        let e = grade[0];
        let len = 0;
        let terminal = null;
        const seen = new Set();
        while (e && !seen.has(e)) {
          seen.add(e);
          const startNode = node;
          const next = e.fromNode === node ? e.toNode : e.fromNode;
          edges.push({ e, da: len, fromStart: e.fromNode === startNode });
          len += e.lengthM;
          node = next;
          const rest = (roadsAtNode.get(node) || []).filter((o) => o !== e);
          if (rest.length === 0) { terminal = 'dead'; break; }
          if (rest.length === 1 && atGrade(rest[0])) { e = rest[0]; continue; }
          terminal = 'junction';
          break;
        }
        if (terminal === 'dead' || len >= RAMP_M) chain = { edges, R: Math.min(RAMP_M, len) };
      }
      if (chain) {
        stats.rampChainEnds++;
        for (const c of chain.edges) {
          if (c.da >= chain.R) break;
          // distance from the bridge end to the edge's start/end node along its own direction
          const da = c.fromStart ? c.da : c.da + c.e.lengthM;
          const db = c.fromStart ? c.da + c.e.lengthM : c.da;
          info.get(c.e).ramps.push({ E, da, db, R: chain.R });
        }
      } else {
        stats.rampOwnEnds++;
        info.get(b)[end.atStart ? 'ownStart' : 'ownEnd'] = true;
      }
    }
  }
  const rampedRoads = new Set();
  for (const r of roads) {
    const inf = info.get(r);
    let cum = cumulative(r.points);
    const L = cum[cum.length - 1];
    const ownLen = Math.min(L / 2, Math.max(0.25 * L, OWN_RAMP_MIN_M));
    const breaks = [];
    for (const rp of inf.ramps) {
      if (rp.da !== undefined) {
        const s = rp.R - rp.da;
        if (s > 0.05 && s < L - 0.05 && rp.db + (L - s) >= rp.R) breaks.push(s);
      }
      if (rp.db !== undefined) {
        const s = L - (rp.R - rp.db);
        if (s > 0.05 && s < L - 0.05 && rp.da + s >= rp.R) breaks.push(s);
      }
    }
    if (inf.ownStart) breaks.push(ownLen);
    if (inf.ownEnd) breaks.push(L - ownLen);
    if (breaks.length) {
      const uniq = [...new Set(breaks.map((s) => Math.round(s * 100) / 100))].sort((a, b) => a - b).filter((s) => !cum.some((c) => Math.abs(c - s) < 0.05));
      if (uniq.length) {
        const all = cum.map((c, i) => ({ s: c, p: r.points[i] })).concat(uniq.map((s) => ({ s, p: pointAtS(r.points, cum, s).map((v) => r2(v)) })));
        all.sort((a, b) => a.s - b.s);
        const pts = all.map((a) => a.p);
        r.points = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
        r.lengthM = r2(polyLength(r.points));
        cum = cumulative(r.points);
      }
    }
    const L2 = cum[cum.length - 1];
    const own2 = Math.min(L2 / 2, Math.max(0.25 * L2, OWN_RAMP_MIN_M));
    r.pointElevM = r.points.map((_, i) => {
      const s = cum[i];
      let v = inf.base;
      if (r.bridge && (inf.ownStart || inf.ownEnd)) {
        const f0 = inf.ownStart ? Math.min(1, s / own2) : 1;
        const f1 = inf.ownEnd ? Math.min(1, (L2 - s) / own2) : 1;
        v = inf.base * Math.min(f0, f1);
      }
      for (const rp of inf.ramps) {
        const dd = Math.min(rp.da + s, rp.db + (L2 - s));
        const val = rp.E * Math.max(0, 1 - dd / rp.R);
        if (val > v) {
          v = val;
          rampedRoads.add(r.id);
        }
      }
      return r2(v);
    });
    r.elevationM = r.pointElevM.length ? Math.max(...r.pointElevM) : 0;
    if (inf.ownStart || inf.ownEnd) stats.rampOwnEdges++;
  }
  stats.rampApproachEdges = rampedRoads.size;
  return stats;
}

/** Synthetic self-test used by validate-world.mjs. */
export function elevationSelfTest() {
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const mk = (id, a, b, pts, extra = {}) => ({ id, fromNode: a, toNode: b, points: pts, lengthM: len(pts), level: 0, bridge: false, tunnel: false, ...extra });
  const roads = [
    // flyover with dead-end approach (100 m) and a long approach (200 m) on the other side
    mk('a', 'n0', 'n1', [[0, 0], [100, 0]]),
    mk('b', 'n1', 'n2', [[100, 0], [400, 0]], { bridge: true, level: 1 }),
    mk('c', 'n2', 'n3', [[400, 0], [500, 0]]),
    mk('d', 'n3', 'n4', [[500, 0], [600, 0]]),
    // free-ended bridge (layer 2)
    mk('e', 'n5', 'n6', [[0, 100], [100, 100]], { bridge: true, level: 2 }),
    mk('f', 'n7', 'n8', [[0, 200], [100, 200]], { tunnel: true }),
    // bridge starting at a junction (two at-grade roads) and ending on a long chain
    mk('h', 'nJ', 'nH', [[0, 300], [-50, 300]]),
    mk('i', 'nJ', 'nI', [[0, 300], [0, 350]]),
    mk('g', 'nJ', 'nK', [[0, 300], [300, 300]], { bridge: true, level: 1 }),
    mk('j', 'nK', 'nL', [[300, 300], [500, 300]]),
  ];
  const st = computeElevations(roads);
  const by = Object.fromEntries(roads.map((r) => [r.id, r]));
  const errs = [];
  const near = (x, y) => Math.abs(x - y) < 0.011;
  const ramp100 = 6.5 * (1 - 100 / 120);
  if (!by.b.pointElevM.every((v) => near(v, 6.5)) || !near(by.b.elevationM, 6.5)) errs.push('flyover b must be flat 6.5 m');
  if (!(near(by.a.pointElevM[0], 0) && near(by.a.pointElevM[by.a.pointElevM.length - 1], 6.5))) errs.push('dead-end approach a must ramp 0 -> 6.5 over its 100 m: ' + by.a.pointElevM);
  if (!(near(by.c.pointElevM[0], 6.5) && near(by.c.pointElevM[1], ramp100))) errs.push('approach c ramp wrong: ' + by.c.pointElevM);
  if (!(by.d.points.length === 3 && near(by.d.pointElevM[0], ramp100) && by.d.pointElevM[1] === 0 && by.d.pointElevM[2] === 0 && near(by.d.points[1][0], 520))) errs.push('approach d should reach 0 at 120 m from the bridge end: ' + JSON.stringify(by.d.points) + by.d.pointElevM);
  if (!(by.e.points.length === 4 && near(by.e.elevationM, 13) && by.e.pointElevM[0] === 0 && near(by.e.pointElevM[1], 13) && near(by.e.pointElevM[2], 13) && by.e.pointElevM[3] === 0)) errs.push('free bridge ends must ramp on the bridge (layer 2 = 13 m): ' + by.e.pointElevM);
  if (!by.f.pointElevM.every((v) => v === -5) || by.f.elevationM !== -5) errs.push('tunnel must be -5 m');
  // junction end: bridge g ramps itself over max(25 %, 30 m) = 75 m; roads h and i stay at grade
  if (!(by.h.pointElevM.every((v) => v === 0) && by.i.pointElevM.every((v) => v === 0))) errs.push('at-grade roads at a bridge junction must stay at 0: ' + by.h.pointElevM + ' / ' + by.i.pointElevM);
  if (!(near(by.g.pointElevM[0], 0) && near(by.g.pointElevM[by.g.pointElevM.length - 1], 6.5) && by.g.points.some((p, i) => near(p[0], 75) && near(by.g.pointElevM[i], 6.5)))) errs.push('bridge g must ramp from 0 to 6.5 within its first 75 m: ' + JSON.stringify(by.g.points) + by.g.pointElevM);
  if (!(near(by.j.pointElevM[0], 6.5) && by.j.pointElevM[by.j.pointElevM.length - 1] === 0)) errs.push('chain j must ramp from the bridge end down to 0: ' + by.j.pointElevM);
  // node continuity
  const el = new Map();
  for (const r of roads) for (const [k, v] of [[r.fromNode, r.pointElevM[0]], [r.toNode, r.pointElevM[r.pointElevM.length - 1]]]) {
    if (!el.has(k)) el.set(k, v);
    else if (Math.abs(el.get(k) - v) > 0.011) errs.push(`node ${k} elevation mismatch (${el.get(k)} vs ${v}, edge ${r.id})`);
  }
  return { errs, stats: st };
}

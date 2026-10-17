// Road candidate extraction, edge splitting and connectivity-guaranteed selection.
import { project, polyLength, nearestOnSegment, densify, dist } from './geo.mjs';
import { buildDirected, scc, isStronglyConnected } from './graph.mjs';

const CAR = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service',
]);
const OK_ACCESS = new Set(['yes', 'permissive', 'destination', 'customers', 'delivery', 'designated']);
const BAD_ACCESS = new Set(['private', 'no']);

/** returns null if drivable, else a reason string */
export function exclusionReason(tags) {
  const h = tags.highway;
  if (!h) return 'not_highway';
  if (!CAR.has(h)) return 'class:' + h;
  if (h === 'service' && ['parking_aisle', 'driveway', 'drive-through'].includes(tags.service)) return 'service:' + tags.service;
  if (tags.area === 'yes') return 'area';
  if (tags.tunnel === 'building_passage') return 'building_passage';
  const mv = tags.motor_vehicle;
  if (mv === 'no' || mv === 'private') return 'motor_vehicle:' + mv;
  if (tags.motorcar === 'no' || tags.motorcar === 'private') return 'motorcar:' + tags.motorcar;
  if (tags.vehicle === 'no' || tags.vehicle === 'private') return 'vehicle:' + tags.vehicle;
  if (BAD_ACCESS.has(tags.access) && !OK_ACCESS.has(mv) && !OK_ACCESS.has(tags.motorcar)) return 'access:' + tags.access;
  return null;
}

export function parseNum(v) {
  if (v === undefined || v === null) return null;
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function onewayOf(tags) {
  const ow = tags.oneway;
  if (ow === '-1' || ow === 'reverse') return { oneway: true, reverse: true, basis: 'tag oneway=' + ow };
  if (ow === 'yes' || ow === 'true' || ow === '1') return { oneway: true, reverse: false, basis: 'tag oneway=yes' };
  if (tags.junction === 'roundabout') return { oneway: true, reverse: false, basis: 'junction=roundabout' };
  if (ow === 'no') return { oneway: false, reverse: false, basis: 'tag oneway=no' };
  return { oneway: false, reverse: false, basis: 'untagged: treated two-way (unknown)' };
}

const DEFAULT_W = {
  motorway: [10.5, 12], trunk: [10.5, 12], primary: [10.5, 12], secondary: [9, 9], tertiary: [7.5, 7.5],
  residential: [6, 6], unclassified: [6, 6], service: [4.5, 4.5], living_street: [4.5, 4.5],
};
export function widthOf(tags, oneway) {
  const wt = parseNum(tags.width);
  if (wt && wt > 0) return { widthM: wt, basis: 'width tag (source claim)' };
  const lanes = parseNum(tags.lanes);
  if (lanes && lanes > 0) return { widthM: Math.round(lanes * 3.2 * 100) / 100, basis: 'lanes=' + lanes + ' x 3.2 m' };
  const h = tags.highway;
  if (h.endsWith('_link')) return { widthM: 5.5, basis: 'class default ' + h + ' (link) 5.5 m' };
  const d = DEFAULT_W[h];
  const w = d ? (oneway ? d[0] : d[1]) : 6;
  return { widthM: w, basis: 'class default ' + h + (oneway ? ' oneway' : ' two-way') + ' ' + w + ' m' };
}

export function layerOf(tags) {
  const l = parseNum(tags.layer);
  return l === null ? 0 : Math.trunc(l);
}

/**
 * Build RoadEdge candidates from drivable ways.
 * ways: array of {id, nodes, tags}; nodePos(id) -> [x,z] local metres (unrounded)
 */
export function buildEdges(ways, nodePos) {
  const occ = new Map();
  const clean = [];
  for (const w of ways) {
    const nodes = w.nodes.filter((n, i) => i === 0 || n !== w.nodes[i - 1]);
    if (nodes.length < 2) continue;
    clean.push({ ...w, nodes });
    for (const n of nodes) occ.set(n, (occ.get(n) || 0) + 1);
  }
  clean.sort((a, b) => a.id - b.id);
  const edges = [];
  for (const w of clean) {
    const n = w.nodes.length;
    const idxs = [0];
    for (let i = 1; i < n - 1; i++) if (occ.get(w.nodes[i]) >= 2) idxs.push(i);
    idxs.push(n - 1);
    const ow = onewayOf(w.tags);
    const wd = widthOf(w.tags, ow.oneway);
    const layer = layerOf(w.tags);
    const br = w.tags.bridge && w.tags.bridge !== 'no';
    const tu = w.tags.tunnel && w.tags.tunnel !== 'no' && w.tags.tunnel !== 'building_passage';
    for (let k = 0; k + 1 < idxs.length; k++) {
      let nodeIds = w.nodes.slice(idxs[k], idxs[k + 1] + 1);
      let pts = nodeIds.map(nodePos);
      if (ow.reverse) {
        nodeIds = nodeIds.slice().reverse();
        pts = pts.slice().reverse();
      }
      const length = polyLength(pts);
      if (length < 0.05) continue;
      edges.push({
        id: `r_${w.id}_${k}`,
        wayId: w.id,
        seg: k,
        tags: w.tags,
        highway: w.tags.highway,
        name: w.tags.name ? w.tags.name.replace(/\s+/g, ' ').trim() : null,
        oneway: ow.oneway,
        onewayBasis: ow.basis,
        lanes: parseNum(w.tags.lanes) !== null ? Math.trunc(parseNum(w.tags.lanes)) : null,
        widthM: wd.widthM,
        widthBasis: wd.basis,
        level: layer,
        bridge: !!br,
        tunnel: !!tu,
        from: nodeIds[0],
        to: nodeIds[nodeIds.length - 1],
        nodeIds,
        pts,
        length,
        version: w.version,
      });
    }
  }
  return edges;
}

/** min distance from edge geometry (densified at 10 m) to any alignment segment */
export function minDistToAlignment(pts, alignments) {
  const dense = densify(pts, 10);
  let best = Infinity;
  for (const p of dense) {
    for (const al of alignments) {
      for (let i = 0; i + 1 < al.length; i++) {
        const d = nearestOnSegment(p, al[i], al[i + 1]).d;
        if (d < best) best = d;
      }
    }
  }
  return best;
}

function largestScc(cand) {
  // iterate: keep the largest strongly connected set of directed edges; a road is kept only if ALL of its directions are inside
  let iterations = 0;
  const dropped = [];
  for (;;) {
    iterations++;
    const { d, next } = buildDirected(cand);
    const { comp, sizes } = scc(next);
    let big = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i;
    const keepEdge = new Array(cand.length).fill(true);
    for (let i = 0; i < d.length; i++) if (comp[i] !== big) keepEdge[d[i].ei] = false;
    const kept = cand.filter((_, i) => keepEdge[i]);
    if (kept.length === cand.length) return { kept, iterations, dropped };
    for (let i = 0; i < cand.length; i++) if (!keepEdge[i]) dropped.push(cand[i]);
    cand = kept;
  }
}

/**
 * Selection with guaranteed strong connectivity (directed-edge graph with the U-turn rule of buildDirected).
 *  1. candidates = edges within a reconnection radius R of the alignment (R escalates 500, 750, ... m until the number of
 *     <=200 m edges that survive the SCC phase equals what the whole acquired network would give);
 *  2. keep the largest strongly connected set (iteratively, whole roads);
 *  3. prune edges whose every point is > 200 m from the alignment, farthest first, unless removal breaks strong connectivity.
 */
export function selectEdges(allEdges, alignments, opts = {}) {
  const NEAR = opts.near ?? 200;
  for (const e of allEdges) e.minDist = minDistToAlignment(e.pts, alignments);
  const near = allEdges.filter((e) => e.minDist <= NEAR);
  const nearSurvivors = (set) => set.filter((e) => e.minDist <= NEAR).length;
  const everything = largestScc(allEdges.slice());
  const target = nearSurvivors(everything.kept);
  let R = 500;
  let phase1 = null;
  const radiusLog = [];
  for (;;) {
    const cand = allEdges.filter((e) => e.minDist <= R);
    const res = largestScc(cand);
    const n = nearSurvivors(res.kept);
    radiusLog.push({ radiusM: R, candidateEdges: cand.length, sccEdges: res.kept.length, within200mSurvivors: n });
    if (n >= target || R >= 3000) {
      phase1 = { R, cand, res };
      break;
    }
    R += 250;
  }
  let current = phase1.res.kept;
  const report = {
    candidateEdgesTotal: allEdges.length,
    edgesWithin200m: near.length,
    reconnectionRadiusM: phase1.R,
    reconnectionRadiusSearch: radiusLog,
    edgesWithinReconnectionRadius: phase1.cand.length,
    droppedBeyondReconnectionRadius: allEdges.length - phase1.cand.length,
    droppedNotInLargestScc: {
      within200m: phase1.res.dropped.filter((e) => e.minDist <= NEAR).length,
      beyond200m: phase1.res.dropped.filter((e) => e.minDist > NEAR).length,
    },
    droppedFarForRemovableConnectivity: 0,
    keptBeyond200mForConnectivity: 0,
    sccIterations: phase1.res.iterations,
  };
  if (!isStronglyConnected(current)) throw new Error('selection not strongly connected after SCC phase');
  const order = current.filter((e) => e.minDist > NEAR).sort((a, b) => b.minDist - a.minDist || (a.id < b.id ? -1 : 1));
  const removed = new Set();
  for (const e of order) {
    const trial = current.filter((x) => x !== e);
    if (trial.length > 0 && isStronglyConnected(trial)) {
      current = trial;
      removed.add(e.id);
    }
  }
  report.droppedFarForRemovableConnectivity = removed.size;
  report.keptBeyond200mForConnectivity = order.length - removed.size;
  if (!isStronglyConnected(current)) throw new Error('selection not strongly connected after pruning');
  report.droppedNearEdges = near.filter((e) => !current.includes(e));
  return { selected: current, report, droppedNotScc: phase1.res.dropped };
}

/**
 * Weak extension: keep every edge within `near` m of the alignment (and the <= `far` m edges needed to link them) that is
 * WEAKLY connected (undirected) to the strongly connected core, even if it is not strongly connected itself.
 * Links are found with a Dijkstra from the core nodes over the <= far pool (near edges cost 1x length, others 4x).
 */
export function extendWeak(allEdges, core, opts = {}) {
  const NEAR = opts.near ?? 200;
  const FAR = opts.far ?? 500;
  const coreSet = new Set(core);
  const pool = allEdges.filter((e) => !coreSet.has(e) && e.minDist <= FAR);
  const adj = new Map();
  for (const e of pool) for (const n of [e.from, e.to]) { let a = adj.get(n); if (!a) adj.set(n, (a = [])); a.push(e); }
  const dist = new Map();
  const parent = new Map();
  const queue = [];
  for (const e of core) for (const n of [e.from, e.to]) if (!dist.has(n)) { dist.set(n, 0); queue.push([0, n]); }
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0] || (String(a[1]) < String(b[1]) ? -1 : 1));
    const [d, n] = queue.shift();
    if (d > dist.get(n)) continue;
    for (const e of adj.get(n) || []) {
      const o = e.from === n ? e.to : e.from;
      const nd = d + e.length * (e.minDist <= NEAR ? 1 : 4);
      if (!dist.has(o) || nd < dist.get(o) - 1e-9) { dist.set(o, nd); parent.set(o, e); queue.push([nd, o]); }
    }
  }
  const keep = new Set();
  const trace = (n) => { while (parent.has(n)) { const e = parent.get(n); keep.add(e); n = e.from === n ? e.to : e.from; if (dist.get(n) === 0) break; } };
  let unreachableNear = 0;
  for (const e of pool) {
    if (e.minDist > NEAR) continue;
    const ends = [e.from, e.to].filter((n) => dist.has(n));
    if (!ends.length) { unreachableNear++; continue; }
    keep.add(e);
    ends.sort((a, b) => dist.get(a) - dist.get(b));
    trace(ends[0]);
  }
  const extra = [...keep];
  return { extra, report: { weakNearEdgesAdded: extra.filter((e) => e.minDist <= NEAR).length, weakLinkEdgesAdded: extra.filter((e) => e.minDist > NEAR).length, nearEdgesUnreachableWithin500m: unreachableNear } };
}

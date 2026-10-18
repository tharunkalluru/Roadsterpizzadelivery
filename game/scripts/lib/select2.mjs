// v2 road selection over the whole network (all lines): near criteria -> strongly connected core with minimal
// connector detours, plus weakly connected boundary roads. Reuses graph.mjs (directed edges, turn rule, SCC).
import { buildDirected, scc } from './graph.mjs';

/** keep the largest strongly connected set of edges (a road is kept only if ALL its directed edges are in the component); iterates to a fixed point */
export function largestScc(cand, banned) {
  let iterations = 0;
  const dropped = [];
  for (;;) {
    iterations++;
    const { d, next } = buildDirected(cand, banned);
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

/** SCC components of an edge set as arrays of edge objects (an edge belongs to the component of its first directed edge) */
function components(edges, banned) {
  const { d, next } = buildDirected(edges, banned);
  const { comp, count } = scc(next);
  const groups = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < d.length; i++) groups[comp[i]].add(edges[d[i].ei]);
  return groups.map((g) => [...g]).sort((a, b) => b.length - a.length);
}

class MinHeap {
  constructor() {
    this.a = [];
  }
  push(k, v) {
    const a = this.a;
    a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/**
 * all: every drivable candidate edge; isNear(e): the selection criterion; banned: turn-restriction pairs.
 * Returns {core (routable), weak (boundary), report}.
 */
export function selectV2(all, isNear, banned, opts = {}) {
  const FAR = opts.far ?? 450;
  const SMALL_DETOUR_M = opts.smallDetour ?? 1200;
  const BIG_COMP_M = opts.bigComp ?? 800;
  const log = opts.log || (() => {});
  const report = { poolEdges: all.length };
  // 1. strongly connected set of the whole acquired network
  const K = largestScc(all, banned);
  const Kset = new Set(K.kept);
  report.sccOfAcquired = { edges: K.kept.length, iterations: K.iterations };
  const near = all.filter(isNear);
  const nearK = near.filter((e) => Kset.has(e));
  report.nearEdges = near.length;
  report.nearEdgesInAcquiredScc = nearK.length;
  // 2. components of the near set; connect each big one to the largest through K by shortest detours
  let S = new Set(nearK);
  let comps = components([...S], banned);
  report.nearComponentsInitial = comps.slice(0, 10).map((c) => c.length);
  const KA = K.kept;
  const kIdx = new Map(KA.map((e, i) => [e, i]));
  const { d: kd, next: kn } = buildDirected(KA, banned);
  const pred = kd.map(() => []);
  kn.forEach((ns, i) => ns.forEach((j) => pred[j].push(i)));
  const len = kd.map((x) => KA[x.ei].length);
  const stateOfEdge = new Map();
  kd.forEach((x, i) => {
    let a = stateOfEdge.get(x.ei);
    if (!a) stateOfEdge.set(x.ei, (a = []));
    a.push(i);
  });
  const detours = [];
  for (let round = 0; round < 4; round++) {
    comps = components([...S], banned);
    if (comps.length <= 1) break;
    const main = comps[0];
    const inMain = new Set();
    for (const e of main) for (const si of stateOfEdge.get(kIdx.get(e)) || []) inMain.add(si);
    const n = kd.length;
    const fwd = new Float64Array(n).fill(Infinity);
    const pf = new Int32Array(n).fill(-1);
    const bwd = new Float64Array(n).fill(Infinity);
    const pb = new Int32Array(n).fill(-1);
    {
      const h = new MinHeap();
      for (const s of inMain) {
        fwd[s] = 0;
        h.push(0, s);
      }
      while (h.size) {
        const [dd, v] = h.pop();
        if (dd > fwd[v]) continue;
        for (const w of kn[v]) {
          if (inMain.has(w)) continue;
          const nd = dd + len[w];
          if (nd < fwd[w]) {
            fwd[w] = nd;
            pf[w] = v;
            h.push(nd, w);
          }
        }
      }
    }
    {
      const h = new MinHeap();
      for (const s of inMain) {
        bwd[s] = 0;
        h.push(0, s);
      }
      while (h.size) {
        const [dd, q] = h.pop();
        if (dd > bwd[q]) continue;
        const cost = inMain.has(q) ? 0 : len[q];
        for (const p of pred[q]) {
          if (inMain.has(p)) continue;
          const nd = dd + cost;
          if (nd < bwd[p]) {
            bwd[p] = nd;
            pb[p] = q;
            h.push(nd, p);
          }
        }
      }
    }
    let added = 0;
    const add = new Set();
    for (let ci = 1; ci < comps.length; ci++) {
      const c = comps[ci];
      let best = Infinity;
      let bi = -1;
      for (const e of c) for (const si of stateOfEdge.get(kIdx.get(e)) || []) {
        const t = fwd[si] + bwd[si];
        if (t < best) {
          best = t;
          bi = si;
        }
      }
      const lengthM = c.reduce((s, e) => s + e.length, 0);
      const limit = lengthM >= BIG_COMP_M ? Infinity : SMALL_DETOUR_M;
      if (bi < 0 || !(best <= limit)) continue;
      // forward path S1 -> bi, backward path bi -> S1
      for (let s = bi; s >= 0 && !inMain.has(s); s = pf[s]) add.add(KA[kd[s].ei]);
      for (let s = bi; s >= 0 && !inMain.has(s); s = pb[s]) add.add(KA[kd[s].ei]);
      for (const e of c) add.add(e);
      added++;
      detours.push({ componentEdges: c.length, componentLengthM: Math.round(lengthM), detourM: Math.round(best) });
    }
    if (!added) break;
    for (const e of add) S.add(e);
    log(`connect round ${round}: +${added} components, S=${S.size}`);
  }
  report.detours = { count: detours.length, totalDetourM: detours.reduce((s, x) => s + x.detourM, 0), biggest: detours.sort((a, b) => b.detourM - a.detourM).slice(0, 5) };
  // 3. final strongly connected core
  const fin = largestScc([...S], banned);
  const core = fin.kept;
  const coreSet = new Set(core);
  report.core = { edges: core.length, nearEdgesInCore: core.filter(isNear).length, farEdgesInCore: core.filter((e) => !isNear(e)).length, droppedByFinalScc: fin.dropped.length };
  // 4. weak extension: near edges not in the core, weakly connected to the core (links within FAR m of the alignment)
  const pool = all.filter((e) => !coreSet.has(e) && e.minDist <= FAR);
  const adj = new Map();
  for (const e of pool)
    for (const n of [e.from, e.to]) {
      let a = adj.get(n);
      if (!a) adj.set(n, (a = []));
      a.push(e);
    }
  const dist = new Map();
  const parent = new Map();
  const h = new MinHeap();
  for (const e of core)
    for (const n of [e.from, e.to])
      if (!dist.has(n)) {
        dist.set(n, 0);
        h.push(0, n);
      }
  while (h.size) {
    const [dd, n] = h.pop();
    if (dd > dist.get(n)) continue;
    for (const e of adj.get(n) || []) {
      const o = e.from === n ? e.to : e.from;
      const nd = dd + e.length * (isNear(e) ? 1 : 4);
      if (!dist.has(o) || nd < dist.get(o) - 1e-9) {
        dist.set(o, nd);
        parent.set(o, e);
        h.push(nd, o);
      }
    }
  }
  const keep = new Set();
  const trace = (n) => {
    while (parent.has(n)) {
      const e = parent.get(n);
      keep.add(e);
      n = e.from === n ? e.to : e.from;
      if (dist.get(n) === 0) break;
    }
  };
  let unreachable = 0;
  for (const e of pool) {
    if (!isNear(e)) continue;
    const ends = [e.from, e.to].filter((n) => dist.has(n));
    if (!ends.length) {
      unreachable++;
      continue;
    }
    keep.add(e);
    ends.sort((a, b) => dist.get(a) - dist.get(b));
    trace(ends[0]);
  }
  const weak = [...keep];
  report.weak = { edges: weak.length, nearEdges: weak.filter(isNear).length, linkEdges: weak.filter((e) => !isNear(e)).length, nearEdgesUnreachable: unreachable };
  return { core, weak, report };
}

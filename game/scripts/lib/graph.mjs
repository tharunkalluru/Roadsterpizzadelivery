// Directed road-graph helpers: directed edge construction, turn successors, strong connectivity.

/**
 * edges: [{id, from, to, oneway}] ; from/to are node keys (any primitive).
 * Returns { d, next } where d[i] = {id, ei, fwd, from, to, rev} and next[i] = indices of allowed successors.
 * Rule: successors at `to` = all outgoing directed edges except the immediate U-turn onto the reverse of the same road.
 * The U-turn is nevertheless allowed (a) when it is the only option (dead end) or (b) when the reverse direction would
 * otherwise be unreachable because the arriving edge is the ONLY edge arriving at that node (e.g. a two-way spur that
 * hangs off the start of a one-way road). Everywhere else U-turns are not offered.
 */
export function buildDirected(edges, banned) {
  const d = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const f = d.length;
    d.push({ id: e.id + ':f', ei: i, fwd: true, from: e.from, to: e.to, rev: -1 });
    if (!e.oneway) {
      d.push({ id: e.id + ':b', ei: i, fwd: false, from: e.to, to: e.from, rev: f });
      d[f].rev = f + 1;
    }
  }
  const out = new Map();
  for (let i = 0; i < d.length; i++) {
    let a = out.get(d[i].from);
    if (!a) out.set(d[i].from, (a = []));
    a.push(i);
  }
  const incoming = new Map();
  for (const x of d) incoming.set(x.to, (incoming.get(x.to) || 0) + 1);
  const next = new Array(d.length);
  for (let i = 0; i < d.length; i++) {
    const outs = out.get(d[i].to) || [];
    const n = outs.filter((j) => j !== d[i].rev);
    if (d[i].rev >= 0 && (n.length === 0 || incoming.get(d[i].to) === 1)) n.push(d[i].rev);
    // v2: Overture prohibited_transitions (banned = Set of "<fromDirectedId>><toDirectedId>")
    next[i] = banned && banned.size ? n.filter((j) => !banned.has(d[i].id + '>' + d[j].id)) : n;
  }
  return { d, next };
}

/** Iterative Tarjan SCC. adj[i] = array of successor indices. returns {comp:Int32Array, count, sizes} */
export function scc(adj) {
  const n = adj.length;
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const comp = new Int32Array(n).fill(-1);
  const stack = [];
  let idx = 0;
  let count = 0;
  const sizes = [];
  const callStack = [];
  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    callStack.push([s, 0]);
    index[s] = low[s] = idx++;
    stack.push(s);
    onStack[s] = 1;
    while (callStack.length) {
      const top = callStack[callStack.length - 1];
      const v = top[0];
      const a = adj[v];
      if (top[1] < a.length) {
        const w = a[top[1]++];
        if (index[w] === -1) {
          index[w] = low[w] = idx++;
          stack.push(w);
          onStack[w] = 1;
          callStack.push([w, 0]);
        } else if (onStack[w]) {
          if (index[w] < low[v]) low[v] = index[w];
        }
      } else {
        if (low[v] === index[v]) {
          let size = 0;
          let w;
          do {
            w = stack.pop();
            onStack[w] = 0;
            comp[w] = count;
            size++;
          } while (w !== v);
          sizes.push(size);
          count++;
        }
        callStack.pop();
        if (callStack.length) {
          const p = callStack[callStack.length - 1][0];
          if (low[v] < low[p]) low[p] = low[v];
        }
      }
    }
  }
  return { comp, count, sizes };
}

export function isStronglyConnected(edges, banned) {
  if (edges.length === 0) return false;
  const { next } = buildDirected(edges, banned);
  return scc(next).count === 1;
}

/** Dijkstra over directed edges (state = directed edge), cost = length of edges traversed incl. start edge. */
export function dijkstraEdges(next, len, startIdx) {
  const n = next.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = [[0, startIdx]];
  dist[startIdx] = len[startIdx];
  heap[0][0] = len[startIdx];
  const push = (it) => {
    heap.push(it);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [dd, v] = pop();
    if (dd > dist[v]) continue;
    for (const w of next[v]) {
      const nd = dd + len[w];
      if (nd < dist[w]) {
        dist[w] = nd;
        push([nd, w]);
      }
    }
  }
  return dist;
}

/**
 * Directed edges for a network where some roads are non-routable (weakly connected boundary roads).
 * edges: [{id, from, to, oneway, routable}]. Routable directed edges keep the next[] of the routable-only network
 * (so the routable subset stays strongly connected) plus every outgoing NON-routable directed edge at their end node
 * (same U-turn rule on the full network). Non-routable directed edges use the full-network rule.
 */
export function buildDirectedRoutable(edges, banned) {
  const full = buildDirected(edges, banned);
  const keepIdx = [];
  edges.forEach((e, i) => e.routable && keepIdx.push(i));
  const coreEdges = keepIdx.map((i) => edges[i]);
  const core = buildDirected(coreEdges, banned);
  const coreIdByName = new Map(core.d.map((x, i) => [x.id, i]));
  const fullIdx = new Map(full.d.map((x, i) => [x.id, i]));
  const next = full.d.map((x, i) => {
    if (!edges[x.ei].routable) return full.next[i];
    const ci = coreIdByName.get(x.id);
    const ids = new Set(core.next[ci].map((j) => core.d[j].id));
    for (const j of full.next[i]) if (!edges[full.d[j].ei].routable) ids.add(full.d[j].id);
    return [...ids].map((id) => fullIdx.get(id)).sort((a, b) => a - b);
  });
  return { d: full.d, next };
}

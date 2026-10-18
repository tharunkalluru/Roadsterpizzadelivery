// Pedestrian skywalks / foot-over-bridges from Overture footway segments flagged is_bridge (or level >= 1).
import * as G from './geo.mjs';
import { gersNum, FOOT_CLASSES, ruleAt } from './ovt.mjs';

export const DECK_ELEV_M = 6.0; // provisional
export const SUPPORT_SPACING_M = 15;
const SKYWALK_MIN_TOTAL_M = 250;
const SKYWALK_STATION_M = 400;

function bridgedRange(s) {
  // union (min..max) of the is_bridge ranges, else of the level >= 1 ranges, else null
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of s.flags || []) if (f.v.includes('is_bridge')) {
    lo = Math.min(lo, f.b ? f.b[0] : 0);
    hi = Math.max(hi, f.b ? f.b[1] : 1);
  }
  if (hi < 0) for (const l of s.levels || []) if (l.v >= 1) {
    lo = Math.min(lo, l.b ? l.b[0] : 0);
    hi = Math.max(hi, l.b ? l.b[1] : 1);
  }
  return hi < 0 ? null : [lo, hi];
}

/**
 * segs: Overture segments (interim ndjson rows); alignDist(p) -> metres to the nearest metro alignment;
 * stations: [{x,z,name}]; roads: selected roads (with _cum, widthM, pointElevM) for support clearance; nearRoads(p, r) -> roads within r
 */
export function buildStructures(segs, { alignDist, stations, nearRoads }) {
  const stats = { footBridgeSegments: 0, components: 0, supportsDropped: 0, supportsShifted: 0, outside300m: 0 };
  const deck = [];
  const stepsBySeg = [];
  for (const s of segs) {
    if (!FOOT_CLASSES.has(s.cls) && s.cls !== 'steps') continue;
    if (s.cls === 'steps') {
      stepsBySeg.push(s);
      continue;
    }
    const rg = bridgedRange(s);
    if (!rg) continue;
    const pts = s.coords.map((c) => G.project(c[1], c[0]));
    const cum = G.cumulative(pts);
    const L = cum[cum.length - 1];
    if (L < 4) continue;
    const sub = rg[0] <= 0.001 && rg[1] >= 0.999 ? pts : G.subPolyline(pts, cum, rg[0] * L, rg[1] * L);
    const path = sub.map((p) => [G.r2(p[0]), G.r2(p[1])]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (path.length < 2) continue;
    const mid = path[Math.floor(path.length / 2)];
    if (alignDist(mid) > 300) {
      stats.outside300m++;
      continue;
    }
    stats.footBridgeSegments++;
    deck.push({ seg: s, path, length: G.polyLength(path), conn: s.conn.map((c) => c[0]), ends: [s.conn[0][0], s.conn[s.conn.length - 1][0]], rg });
  }
  // components over shared connectors
  const par = deck.map((_, i) => i);
  const find = (x) => {
    while (par[x] !== x) {
      par[x] = par[par[x]];
      x = par[x];
    }
    return x;
  };
  const byConn = new Map();
  deck.forEach((d, i) => {
    for (const c of d.conn) {
      if (byConn.has(c)) par[find(i)] = find(byConn.get(c));
      else byConn.set(c, i);
    }
  });
  const comps = new Map();
  deck.forEach((d, i) => {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(d);
  });
  stats.components = comps.size;
  // connector -> steps segments touching it (to orient the stairs)
  const stepsAt = new Map();
  for (const st of stepsBySeg) for (const c of [st.conn[0][0], st.conn[st.conn.length - 1][0]]) {
    if (!stepsAt.has(c)) stepsAt.set(c, []);
    stepsAt.get(c).push(st);
  }
  const structures = [];
  const compInfo = [];
  for (const [root, list] of [...comps.entries()].sort((a, b) => (a[1][0].seg.id < b[1][0].seg.id ? -1 : 1))) {
    list.sort((a, b) => (a.seg.id < b.seg.id ? -1 : 1));
    const total = list.reduce((s, d) => s + d.length, 0);
    const names = [...new Set(list.map((d) => d.seg.name).filter(Boolean))];
    const nearStation = Math.min(Infinity, ...stations.map((st) => Math.hypot(st.x - list[0].path[0][0], st.z - list[0].path[0][1])));
    const named = names.length === 1 ? names[0] : null;
    const skywalk = (total >= SKYWALK_MIN_TOTAL_M && nearStation <= SKYWALK_STATION_M) || (named && /skywalk/i.test(named));
    const kind = skywalk ? 'skywalk' : 'footbridge';
    compInfo.push({ kind, name: named, names, totalM: Math.round(total), segments: list.length, nearestStationM: Math.round(nearStation) });
    const endCount = new Map();
    for (const d of list) for (const c of d.ends) endCount.set(c, (endCount.get(c) || 0) + 1);
    const placed = [];
    for (const d of list) {
      const { path } = d;
      const stairs = [];
      d.ends.forEach((c, k) => {
        if (endCount.get(c) > 1) return; // joint with another deck piece
        // an end that was clipped (between range) is not a stair landing unless it reaches the segment end
        if ((k === 0 && d.rg[0] > 0.01) || (k === 1 && d.rg[1] < 0.99)) return;
        const e = k === 0 ? path[0] : path[path.length - 1];
        const prev = k === 0 ? path[1] : path[path.length - 2];
        let dx = e[0] - prev[0];
        let dz = e[1] - prev[1];
        const st = (stepsAt.get(c) || [])[0];
        if (st) {
          const sp = st.coords.map((q) => G.project(q[1], q[0]));
          const atStart = st.conn[0][0] === c;
          const far = atStart ? sp[sp.length - 1] : sp[0];
          dx = far[0] - e[0];
          dz = far[1] - e[1];
        }
        const L = Math.hypot(dx, dz) || 1;
        stairs.push({ x: e[0], z: e[1], heading: G.r4(G.headingOf(dx / L, dz / L)) });
      });
      // supports every ~15 m (incl. ends), cleared of carriageways
      const cum = G.cumulative(path);
      const L = cum[cum.length - 1];
      const n = Math.max(1, Math.round(L / SUPPORT_SPACING_M));
      const supports = [];
      const clear = (p) => nearRoads(p, 30).every((r) => G.nearestOnPolyline(p, r.points).d >= r.widthM / 2 + 0.6 || r.pointElevM.every((v) => v > 2.5));
      for (let i = 0; i <= n; i++) {
        const s0 = (L * i) / n;
        let spot = null;
        for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
          const s = s0 + off;
          if (s < 0 || s > L) continue;
          const q = G.subPolyline(path, cum, s, s)[0];
          const p = [G.r2(q[0]), G.r2(q[1])];
          if (clear(p)) {
            spot = p;
            if (off) stats.supportsShifted++;
            break;
          }
        }
        if (!spot) {
          stats.supportsDropped++;
          continue;
        }
        if (placed.some((q) => Math.hypot(q[0] - spot[0], q[1] - spot[1]) < 1.5)) continue;
        placed.push(spot);
        supports.push({ x: spot[0], z: spot[1] });
      }
      structures.push({
        id: `${skywalk ? 'sw' : 'fb'}_${gersNum(d.seg.id)}`,
        kind,
        name: named || d.seg.name || null,
        path,
        elevM: path.map(() => DECK_ELEV_M),
        widthM: skywalk ? 3.0 : 2.4,
        supports: supports.map((q) => [q.x, q.z]),
        stairs,
        status: { geometry: 'provisional', ...(named || d.seg.name ? { name: 'provisional' } : {}), width: 'provisional', level: 'provisional', height: 'provisional' },
        provenance: { source: 'derived', sourceIds: ['ovt:seg/' + d.seg.id.replace(/-/g, '').slice(0, 12)], snapshot: ['overture-2026-09-23.1'], note: `${d.seg.cls} segment flagged ${d.seg.flags ? 'is_bridge' : 'level>=1'}; component total ${Math.round(total)} m, ${list.length} piece(s); deck elevation, width, supports and stair positions are authored provisional values` },
      });
    }
  }
  structures.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { structures, stats, compInfo };
}

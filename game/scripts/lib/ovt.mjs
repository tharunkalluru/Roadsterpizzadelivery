// Overture Maps transportation segments -> RoadEdge candidates (v2 pipeline).
// Field interpretation is documented in game/DATA_SOURCES.md section "v2 field interpretation".
import fs from 'node:fs';
import readline from 'node:readline';
import * as G from './geo.mjs';

export async function readNdjson(file) {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) if (line) out.push(JSON.parse(line));
  return out;
}

/** leading hex chars of a GERS uuid used as a numeric id (9 => 36 bits, 11 decimal digits; raised by the importer if the data would collide) */
let GERS_HEX = 9;
export const setGersHex = (n) => { GERS_HEX = n; };
export const getGersHex = () => GERS_HEX;
export const gersNum = (uuid) => parseInt(uuid.replace(/-/g, '').slice(0, GERS_HEX), 16);
/** smallest prefix length (9..12) for which all ids are collision free */
export function chooseGersHex(idLists) {
  for (let n = 9; n <= 12; n++) {
    let ok = true;
    for (const ids of idLists) {
      const seen = new Set();
      for (const id of ids) {
        const k = id.replace(/-/g, '').slice(0, n);
        if (seen.has(k)) { ok = false; break; }
        seen.add(k);
      }
      if (!ok) break;
    }
    if (ok) return n;
  }
  throw new Error('GERS id prefixes collide even at 12 hex chars');
}

export const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service']);
export const LINKABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
export const MAIN_HIGHWAYS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
export const FOOT_CLASSES = new Set(['footway', 'pedestrian', 'steps', 'path', 'cycleway']);
const CARISH = new Set(['car', 'motor_vehicle', 'vehicle']);
const DEST_USING = new Set(['at_destination', 'to_deliver', 'to_farm', 'as_customer']);

/** value of a "between" rule list at fraction t (last matching rule wins); b === null means whole segment */
export function ruleAt(rules, t, pick = (r) => r.v) {
  let v;
  for (const r of rules || []) {
    if (!r.b || (t >= r.b[0] - 1e-9 && t <= r.b[1] + 1e-9)) v = pick(r);
  }
  return v;
}
function flagAt(flags, name, t) {
  for (const f of flags || []) if ((!f.b || (t >= f.b[0] - 1e-9 && t <= f.b[1] + 1e-9)) && f.v.includes(name)) return true;
  return false;
}
const modeCarish = (w) => !w || !w.mode || w.mode.length === 0 || w.mode.some((m) => CARISH.has(m));
const modeOnly = (w) => w && w.mode && w.mode.length > 0;

/**
 * Car access + direction of a segment piece at fraction t.
 * returns {drivable, reason, fwdDenied, bwdDenied}
 *  - denied, no heading, car-ish (or unspecified) mode, no during/using/recognized/vehicle condition  => closed to cars
 *  - allowed with a `recognized` user class (as_private / as_permitted) and car-ish mode => private/permit only: excluded (v1 excluded access=private)
 *  - denied with heading forward|backward and car-ish (or unspecified) mode => one-way (that heading is denied)
 *  - time-limited (during), vehicle-dimension (vehicle), using=* rules are ignored (treated as open) and counted by the caller
 */
export function carAccess(seg, t) {
  let closed = null;
  let fwdDenied = false;
  let bwdDenied = false;
  let destAllowed = false;
  for (const a of seg.access || []) {
    if (a.b && !(t >= a.b[0] - 1e-9 && t <= a.b[1] + 1e-9)) continue;
    const w = a.w;
    if (a.t === 'allowed' && w && w.using && w.using.some((u) => DEST_USING.has(u)) && modeCarish(w) && modeOnly(w)) destAllowed = true;
    if (a.t === 'denied') {
      if (w && (w.during || w.vehicle || w.using || w.recognized)) continue;
      if (!modeCarish(w)) continue;
      if (w && w.heading === 'forward') fwdDenied = true;
      else if (w && w.heading === 'backward') bwdDenied = true;
      else closed = closed || 'denied' + (w && w.mode ? ':' + w.mode.join('+') : '');
    } else if (a.t === 'allowed' && w && w.recognized && !w.using && modeCarish(w)) {
      if (!(w.mode && w.mode.length && !w.mode.some((m) => CARISH.has(m)))) closed = closed || 'restricted:' + w.recognized.join('+');
    }
  }
  if (closed && destAllowed) closed = null;
  if (closed) return { drivable: false, reason: closed };
  if (fwdDenied && bwdDenied) return { drivable: false, reason: 'denied_both_directions' };
  return { drivable: true, fwdDenied, bwdDenied };
}

export function highwayOf(seg, t) {
  const c = seg.cls;
  const link = flagAt(seg.flags, 'is_link', t) || seg.subclass === 'link' || (seg.subclassRules || []).some((r) => r.v === 'link' && (!r.b || (t >= r.b[0] && t <= r.b[1])));
  return link && LINKABLE.has(c) ? c + '_link' : c;
}

const DEFAULT_W = { motorway: [10.5, 12], trunk: [10.5, 12], primary: [10.5, 12], secondary: [9, 9], tertiary: [7.5, 7.5], residential: [6, 6], unclassified: [6, 6], service: [4.5, 4.5], living_street: [4.5, 4.5] };
export function widthOfPiece(seg, t, highway, oneway) {
  const wv = ruleAt(seg.widths, t);
  if (wv && wv > 0) return { widthM: Math.round(wv * 100) / 100, basis: 'width_rules (source claim)' };
  if (highway.endsWith('_link')) return { widthM: 5.5, basis: 'class default ' + highway + ' 5.5 m' };
  const d = DEFAULT_W[highway];
  const w = d ? (oneway ? d[0] : d[1]) : 6;
  return { widthM: w, basis: 'class default ' + highway + (oneway ? ' oneway' : ' two-way') + ' ' + w + ' m' };
}

export const nameClean = (s) => (s ? s.replace(/\s+/g, ' ').trim() : null);

/**
 * Split drivable segments into edge candidates at connectors that are shared by >= 2 drivable segments.
 * Edge shape matches lib/select.mjs buildEdges() output so graph.mjs/elevation.mjs can be reused:
 *   {id, wayId, seg, highway, name, oneway, widthM, widthBasis, level, bridge, tunnel, from, to, nodeIds(from..to connector keys), pts, length}
 * from/to are connector keys "n_<gersNum>" (string) with raw connector ids in fromC/toC.
 */
export function buildOvtEdges(segs, stats, connPos) {
  stats.excluded = stats.excluded || {};
  const ex = (k) => (stats.excluded[k] = (stats.excluded[k] || 0) + 1);
  const cand = [];
  for (const s of segs) {
    if (!DRIVABLE.has(s.cls)) {
      ex('class:' + (s.cls === 'unknown' ? 'unknown' : 'non-car'));
      continue;
    }
    const sc = s.subclass;
    if (sc === 'parking_aisle' || sc === 'driveway' || sc === 'alley' || (s.subclassRules || []).some((r) => (r.v === 'parking_aisle' || r.v === 'driveway') && !r.b)) {
      ex('subclass:' + sc);
      continue;
    }
    cand.push(s);
  }
  // connector usage among candidates
  const usage = new Map();
  for (const s of cand) for (const [cid] of s.conn) usage.set(cid, (usage.get(cid) || 0) + 1);
  const edges = [];
  const wayIds = new Map();
  for (const s of cand.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const wayId = gersNum(s.id);
    if (wayIds.has(wayId) && wayIds.get(wayId) !== s.id) throw new Error('gersNum collision ' + s.id);
    wayIds.set(wayId, s.id);
    const pts = s.coords.map((c) => G.project(c[1], c[0]));
    const cum = G.cumulative(pts);
    const L = cum[cum.length - 1];
    if (L < 0.05 || s.conn.length < 2) {
      ex('degenerate');
      continue;
    }
    const cons = s.conn.slice().sort((a, b) => a[1] - b[1]);
    // split fractions: both ends + mid connectors used by >= 2 candidate segments
    const cuts = cons.filter((c, i) => i === 0 || i === cons.length - 1 || usage.get(c[0]) >= 2);
    if (cuts[0][1] > 0.0005 || cuts[cuts.length - 1][1] < 0.9995) {
      // connectors do not span the segment; treat the segment ends as cuts with the nearest connector
      ex('partial_connectors');
    }
    // vertex index nearest to each cut
    const cutIdx = cuts.map((c, k) => {
      if (k === 0) return 0;
      if (k === cuts.length - 1) return pts.length - 1;
      const sPos = c[1] * L;
      const cp = connPos && connPos.get(c[0]);
      let bi = 1;
      let bd = Infinity;
      for (let i = 1; i < pts.length - 1; i++) {
        // prefer the vertex that coincides with the connector point; fall back to the linear-reference fraction
        const d = cp ? Math.hypot(pts[i][0] - cp[0], pts[i][1] - cp[1]) : Math.abs(cum[i] - sPos);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      return bi;
    });
    // snap cut vertices / end points exactly onto the connector location so adjoining segments share identical coordinates
    if (connPos) {
      cuts.forEach((c, k) => {
        const cp = connPos.get(c[0]);
        const i = cutIdx[k];
        if (cp && Math.hypot(pts[i][0] - cp[0], pts[i][1] - cp[1]) < 2.5) pts[i] = cp.slice();
      });
    }
    let piece = 0;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const i0 = cutIdx[k];
      const i1 = cutIdx[k + 1];
      if (i1 <= i0) {
        ex('cut_order');
        continue;
      }
      const t0 = cuts[k][1];
      const t1 = cuts[k + 1][1];
      const tm = (t0 + t1) / 2;
      if (flagAt(s.flags, 'is_under_construction', tm) || flagAt(s.flags, 'is_abandoned', tm)) {
        ex('flag:under_construction/abandoned');
        piece++;
        continue;
      }
      const acc = carAccess(s, tm);
      if (!acc.drivable) {
        ex(acc.reason.startsWith('restricted') ? 'access:private/permit' : acc.reason.startsWith('denied_both') ? 'oneway_both_denied' : 'access:' + acc.reason);
        piece++;
        continue;
      }
      const highway = highwayOf(s, tm);
      const oneway = acc.fwdDenied || acc.bwdDenied;
      const reverse = acc.fwdDenied && !acc.bwdDenied;
      let pp = pts.slice(i0, i1 + 1);
      let nodeC = [cuts[k][0], cuts[k + 1][0]];
      if (reverse) {
        pp = pp.slice().reverse();
        nodeC = nodeC.slice().reverse();
      }
      const wd = widthOfPiece(s, tm, highway, oneway);
      const lv = ruleAt(s.levels, tm);
      const bridge = flagAt(s.flags, 'is_bridge', tm);
      const tunnel = flagAt(s.flags, 'is_tunnel', tm);
      const length = G.polyLength(pp);
      if (length < 0.05) {
        ex('degenerate');
        continue;
      }
      edges.push({
        id: `r_${wayId}_${piece}`,
        wayId,
        seg: piece,
        segUuid: s.id,
        highway,
        name: nameClean(s.name),
        nameTe: s.nameTe ? nameClean(s.nameTe) : null,
        oneway,
        onewayBasis: oneway ? `access_restrictions: denied heading=${acc.fwdDenied ? 'forward' : 'backward'}` : 'no directional access rule: treated two-way (unknown)',
        lanes: null,
        widthM: wd.widthM,
        widthBasis: wd.basis,
        level: lv === undefined || lv === null ? 0 : lv,
        bridge: bridge && !tunnel,
        tunnel,
        from: 'n_' + gersNum(nodeC[0]),
        to: 'n_' + gersNum(nodeC[1]),
        fromC: nodeC[0],
        toC: nodeC[1],
        pts: pp,
        length,
        src: s.src,
        range: [t0, t1],
        reversed: reverse,
      });
      piece++;
    }
  }
  return edges;
}

/** distance index of alignment polylines (local metres) */
export function buildAlignGrid(alignByLine) {
  const grid = new G.SegGrid(120);
  for (const [line, polys] of Object.entries(alignByLine)) for (const pl of polys) for (let i = 0; i + 1 < pl.length; i++) grid.add(pl[i], pl[i + 1], { line });
  return grid;
}
/** per-line minimum distance (densified at 10 m) of an edge geometry to each line's alignment, up to maxR */
export function edgeLineDistances(pts, grid, lines, maxR = 700) {
  const best = Object.fromEntries(lines.map((l) => [l, Infinity]));
  for (const p of G.densify(pts, 10)) {
    for (const h of grid.within(p, maxR)) {
      const l = h.payload.line;
      if (h.d < best[l]) best[l] = h.d;
    }
  }
  return best;
}

/**
 * Overture prohibited_transitions -> Set of "<fromDirectedId>><toDirectedId>" bans.
 * Interpretation: for a rule on segment S with when.heading H (forward = along S geometry order; absent = both) and
 * sequence[0] = {connector_id: c, segment_id: T}: a vehicle leaving S through connector c must not enter T (T's directed
 * edge that starts at c; final_heading restricts to that travel direction on T).  Rules with a longer sequence
 * (two or more consecutive transitions) cannot be expressed at directed-edge level and are counted, not enforced.
 * Rules with mode (non-car) or during (time-limited) conditions are ignored and counted.
 */
export function buildBanned(segs, edges) {
  const bySeg = new Map();
  for (const e of edges) {
    let a = bySeg.get(e.segUuid);
    if (!a) bySeg.set(e.segUuid, (a = []));
    a.push(e);
  }
  const geomFrom = (p) => (p.reversed ? p.toC : p.fromC);
  const geomTo = (p) => (p.reversed ? p.fromC : p.toC);
  const dirF = (p, geomForward) => `${p.id}:${geomForward === !p.reversed ? 'f' : 'b'}`;
  const banned = new Set();
  const st = { rules: 0, applied: 0, multiStep: 0, nonCarMode: 0, timeLimited: 0, noSource: 0, noTarget: 0, bans: 0, junctionNodes: new Set() };
  for (const s of segs) {
    if (!s.pt) continue;
    const mine = bySeg.get(s.id);
    for (const r of s.pt) {
      st.rules++;
      if (!mine) {
        st.noSource++;
        continue;
      }
      if (r.w && r.w.during) {
        st.timeLimited++;
        continue;
      }
      if (r.w && r.w.mode && !r.w.mode.some((m) => CARISH.has(m))) {
        st.nonCarMode++;
        continue;
      }
      if (r.seq.length !== 1) {
        st.multiStep++;
        continue;
      }
      const [c, tid] = r.seq[0];
      const targets = bySeg.get(tid);
      if (!targets) {
        st.noTarget++;
        continue;
      }
      const heads = r.w && r.w.heading ? [r.w.heading] : ['forward', 'backward'];
      const froms = [];
      for (const h of heads)
        for (const p of mine) {
          if (h === 'forward' && geomTo(p) === c) froms.push(dirF(p, true));
          if (h === 'backward' && geomFrom(p) === c) froms.push(dirF(p, false));
        }
      const tos = [];
      for (const q of targets) {
        if (r.fh !== 'backward' && geomFrom(q) === c) tos.push(dirF(q, true));
        if (r.fh !== 'forward' && geomTo(q) === c) tos.push(dirF(q, false));
      }
      let any = false;
      for (const f of froms)
        for (const t of tos) {
          if (f.split(':')[0] === t.split(':')[0]) continue;
          banned.add(f + '>' + t);
          any = true;
        }
      if (any) {
        st.applied++;
        st.junctionNodes.add(c);
      }
    }
  }
  st.bans = banned.size;
  return { banned, stats: st };
}

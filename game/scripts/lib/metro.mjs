// Metro network loading: route chains, stations, alignment slices.
import fs from 'node:fs';
import { project, dist, polyLength } from './geo.mjs';
import { slugify } from './io.mjs';

export const LINES = [
  { id: 'red', masterId: 8297698, name: 'Red Line', color: '#d71920' },
  { id: 'blue', masterId: 13986696, name: 'Blue Line', color: '#1f5fbf' },
  { id: 'green', masterId: 8297697, name: 'Green Line', color: '#1a9850' },
];

export const ANCHORS = ['Uppal', 'Stadium', 'NGRI', 'Habsiguda', 'Tarnaka'];

const STOP_ROLES = new Set(['stop', 'stop_entry_only', 'stop_exit_only']);

export function loadMetro(file) {
  const net = JSON.parse(fs.readFileSync(file, 'utf8'));
  const el = new Map();
  for (const e of net.elements) el.set(e.type + '/' + e.id, e);
  const lines = [];
  for (const L of LINES) {
    const master = el.get('relation/' + L.masterId);
    if (!master) throw new Error('missing route master ' + L.masterId);
    const routes = master.members.filter((m) => m.type === 'relation').map((m) => el.get('relation/' + m.ref)).filter(Boolean);
    routes.sort((a, b) => a.id - b.id);
    lines.push({ ...L, master, routes });
  }
  return { net, el, lines, osmBase: net.osm3s && net.osm3s.timestamp_osm_base };
}

/** Stitch the way members of one route relation (in member order) into node-id chains. */
export function stitchRoute(el, route, seenWays) {
  const chains = [];
  let cur = null;
  const ways = route.members.filter((m) => m.type === 'way').map((m) => el.get('way/' + m.ref)).filter(Boolean);
  for (let wi = 0; wi < ways.length; wi++) {
    const w = ways[wi];
    if (seenWays && seenWays.has(w.id)) {
      cur = null;
      continue;
    }
    if (seenWays) seenWays.add(w.id);
    let nodes = w.nodes.slice();
    if (!cur) {
      // orient first way of a chain so that it connects to the next one when possible
      const nx = ways[wi + 1];
      if (nx && !(seenWays && seenWays.has(nx.id))) {
        const ends = new Set([nx.nodes[0], nx.nodes[nx.nodes.length - 1]]);
        if (!ends.has(nodes[nodes.length - 1]) && ends.has(nodes[0])) nodes.reverse();
      }
      cur = { nodes, wayIds: [w.id] };
      chains.push(cur);
      continue;
    }
    const end = cur.nodes[cur.nodes.length - 1];
    if (nodes[0] === end) cur.nodes.push(...nodes.slice(1));
    else if (nodes[nodes.length - 1] === end) cur.nodes.push(...nodes.reverse().slice(1));
    else {
      nodes = w.nodes.slice();
      cur = { nodes, wayIds: [w.id] };
      chains.push(cur);
      continue;
    }
    cur.wayIds.push(w.id);
  }
  return chains;
}

export function stopsOf(el, route) {
  const out = [];
  for (const m of route.members) {
    if (m.type !== 'node' || !STOP_ROLES.has(m.role)) continue;
    const n = el.get('node/' + m.ref);
    if (!n) continue;
    out.push({ id: n.id, name: (n.tags && n.tags.name) || '', nameTe: (n.tags && n.tags['name:te']) || null, lat: n.lat, lon: n.lon, tags: n.tags || {} });
  }
  return out;
}

export const normStationName = (s) => s.replace(/\s*\((Red|Blue|Green) Line\)\s*$/i, '').replace(/\s+/g, ' ').trim();

/** Group stops into canonical stations (per-line by name; interchange merge across lines if same name within 400 m). */
export function buildStations(metro, extraNodes /* Map osmNodeId -> {lat,lon,tags} for station nodes in the corridor extract */, stopAreas /* [{id,name}] */) {
  const perLine = [];
  for (const L of metro.lines) {
    const groups = new Map();
    for (const r of L.routes) {
      for (const s of stopsOf(metro.el, r)) {
        const key = normStationName(s.name).toLowerCase();
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { line: L.id, name: normStationName(s.name), stops: [] }));
        g.stops.push(s);
      }
    }
    for (const key of [...groups.keys()].sort()) perLine.push(groups.get(key));
  }
  const stations = [];
  for (const g of perLine) {
    const lat = g.stops.reduce((a, s) => a + s.lat, 0) / g.stops.length;
    const lon = g.stops.reduce((a, s) => a + s.lon, 0) / g.stops.length;
    const p = project(lat, lon);
    const found = stations.find((st) => st.key === g.name.toLowerCase() && dist(st.p, p) < 400);
    if (found) {
      found.lines.add(g.line);
      found.stops.push(...g.stops.map((s) => ({ ...s, line: g.line })));
      continue;
    }
    stations.push({ key: g.name.toLowerCase(), name: g.name, lines: new Set([g.line]), stops: g.stops.map((s) => ({ ...s, line: g.line })), p });
  }
  // finalize
  const usedIds = new Set();
  const out = [];
  for (const st of stations) {
    st.stops.sort((a, b) => a.id - b.id);
    let lat = st.stops.reduce((a, s) => a + s.lat, 0) / st.stops.length;
    let lon = st.stops.reduce((a, s) => a + s.lon, 0) / st.stops.length;
    const osmIds = st.stops.map((s) => 'node/' + s.id);
    // enrich with the OSM public_transport=station node of the corridor extract (name match within 300 m)
    for (const [id, n] of extraNodes) {
      if (n.tags.name && n.tags.name.toLowerCase() === st.key && dist(project(n.lat, n.lon), st.p) < 300) {
        osmIds.push('node/' + id);
        lat = n.lat;
        lon = n.lon;
      }
    }
    for (const sa of stopAreas) if (sa.name && sa.name.toLowerCase() === st.key) osmIds.push('relation/' + sa.id);
    // source name = first line's (red, blue, green order) stop name
    const order = { red: 0, blue: 1, green: 2 };
    const bySrc = st.stops.slice().sort((a, b) => order[a.line] - order[b.line] || a.id - b.id);
    const sourceName = bySrc[0].name;
    const variants = [...new Set(st.stops.map((s) => s.name))].sort();
    const nameTe = st.stops.map((s) => s.nameTe).filter(Boolean).sort()[0] || null;
    let id = 'st_' + slugify(st.name);
    if (usedIds.has(id)) id += '_' + [...st.lines].sort().join('_');
    usedIds.add(id);
    out.push({
      id,
      name: st.name,
      sourceName,
      sourceNameVariants: variants,
      nameTe,
      lines: [...st.lines].sort(),
      lat,
      lon,
      osmIds: [...new Set(osmIds)].sort(),
      inCorridor: st.lines.has('blue') && ANCHORS.includes(st.name),
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** polyline helpers for slicing along arclength */
export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}
export function nearestVertex(pts, p) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i], p);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
/** slice pts between vertex indices i0..i1 (any order), extended by `ext` metres at both ends (limited by polyline ends) */
export function sliceExtended(pts, i0, i1, ext) {
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  const c = cumulative(pts);
  let a = lo, b = hi;
  while (a > 0 && c[lo] - c[a] < ext) a--;
  while (b < pts.length - 1 && c[b] - c[hi] < ext) b++;
  return pts.slice(a, b + 1);
}

/** point and unit tangent at arclength s of polyline */
export function pointAt(pts, c, s) {
  if (s <= 0) s = 0;
  const total = c[c.length - 1];
  if (s >= total) s = total;
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const segLen = c[i] - c[i - 1];
  const t = segLen > 0 ? (s - c[i - 1]) / segLen : 0;
  const a = pts[i - 1], b = pts[i];
  const dx = segLen > 0 ? (b[0] - a[0]) / segLen : 1;
  const dz = segLen > 0 ? (b[1] - a[1]) / segLen : 0;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx, dz };
}

/** clip polyline to rect, returning runs of consecutive inside vertices (no interpolation at borders) */
export function clipRuns(pts, rect) {
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (p[0] >= rect.minX && p[0] <= rect.maxX && p[1] >= rect.minZ && p[1] <= rect.maxZ) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

export { polyLength };

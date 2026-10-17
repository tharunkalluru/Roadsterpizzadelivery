#!/usr/bin/env node
/**
 * Hyderabad Metro Delivery: OSM -> runtime world package importer.
 *
 * Reads ONLY bundled files from hyderabad-game-handoff/resources/osm (no network).
 * Writes (relative to --out-root, default = game/):
 *   public/world/hyd-uppal-tarnaka/v1/{manifest.json, core.json, chunks/c_<ix>_<iz>.json}
 *   public/world/world-manifest.json            (ledger-style manifest bound to scope-manifest.json)
 *   sources-manifest.json, scope-manifest.json, scope.geojson, name-registry.json
 *   data/scope-baseline.json, qa/coverage.geojson
 * Deterministic: identical inputs => byte-identical outputs (no wall-clock values).
 *
 * Usage: node scripts/import-map.mjs [--out-root <dir>] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseOsmXml, mergeOsm } from './lib/osm.mjs';
import * as G from './lib/geo.mjs';
import * as M from './lib/metro.mjs';
import * as S from './lib/select.mjs';
import { buildDirectedRoutable } from './lib/graph.mjs';
import { writeOut, compact, pretty, sha256File, slugify, shortHash } from './lib/io.mjs';
import { writeProjectFiles } from './lib/outputs.mjs';
import { computeElevations } from './lib/elevation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const REPO = path.resolve(GAME, '..');
const KIT = path.join(REPO, 'hyderabad-game-handoff');
const OSM_DIR = path.join(KIT, 'resources', 'osm');

const args = process.argv.slice(2);
const argv = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT_ROOT = path.resolve(argv('--out-root', GAME));
const QUIET = args.includes('--quiet');
const log = (...a) => {
  if (!QUIET) console.error(...a);
};

export const WORLD_ID = 'hyd-uppal-tarnaka';
export const WORLD_VERSION = '1.0.0';
const PKG_DIR = path.join('public', 'world', WORLD_ID, 'v1');
const CHUNK = 200;
const OSM_FILES = [
  'corridor-01-uppal-stadium.osm',
  'corridor-02-stadium-ngri.osm',
  'corridor-03-ngri-habsiguda.osm',
  'corridor-04-habsiguda-tarnaka.osm',
];
const REF_DATE = '2026-10-17';
const SNAPSHOT_ID = 'osm-hyd-20261017';
const BUILDING_RADIUS = 120;
const POI_RADIUS = 80;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hex = (s) => crypto.createHash('sha1').update(s).digest();

// ---------------------------------------------------------------- 1. sources
const acq = JSON.parse(fs.readFileSync(path.join(OSM_DIR, 'resource-acquisition-manifest.json'), 'utf8'));
const GENERATED_AT = acq.created_at.replace(/\.\d+\+00:00$/, 'Z');
const parsedPerFile = OSM_FILES.map((f) => ({ file: f, data: parseOsmXml(path.join(OSM_DIR, f)) }));
const wayFiles = new Map();
const nodeFiles = new Map();
for (const { file, data } of parsedPerFile) {
  for (const w of data.ways) {
    let a = wayFiles.get(w.id);
    if (!a) wayFiles.set(w.id, (a = []));
    a.push(file);
  }
}
const osm = mergeOsm(parsedPerFile.map((p) => p.data));
log(`OSM merged: ${osm.nodes.size} nodes, ${osm.ways.size} ways, ${osm.relations.size} relations`);

const nodeLocal = new Map();
const nodePos = (id) => {
  let p = nodeLocal.get(id);
  if (!p) {
    const n = osm.nodes.get(id);
    if (!n) throw new Error('missing node ' + id);
    p = G.project(n.lat, n.lon);
    nodeLocal.set(id, p);
  }
  return p;
};

// ---------------------------------------------------------------- 2. metro + alignment
const metro = M.loadMetro(path.join(OSM_DIR, 'metro-network-full.json'));
const metroPos = (id) => {
  const e = metro.el.get('node/' + id);
  return G.project(e.lat, e.lon);
};
const lineChains = {}; // lineId -> [{wayIds, pts(local), latlon}]
for (const L of metro.lines) {
  const seen = new Set();
  lineChains[L.id] = [];
  for (const r of L.routes) {
    for (const c of M.stitchRoute(metro.el, r, seen)) {
      lineChains[L.id].push({
        route: r.id,
        wayIds: c.wayIds,
        pts: c.nodes.map(metroPos),
        latlon: c.nodes.map((n) => {
          const e = metro.el.get('node/' + n);
          return [G.r6(e.lat), G.r6(e.lon)];
        }),
      });
    }
  }
}
const blue = metro.lines.find((l) => l.id === 'blue');
const alignments = [];
const blueMainRoute = blue.routes.find((r) => r.id === 8297688); // Nagole -> Raidurg
let mainAlignment = null;
for (const r of blue.routes) {
  const chains = M.stitchRoute(metro.el, r, null);
  const stops = M.stopsOf(metro.el, r);
  const u = stops.find((s) => s.name === 'Uppal');
  const t = stops.find((s) => s.name === 'Tarnaka');
  for (const c of chains) {
    const pts = c.nodes.map(metroPos);
    const iu = M.nearestVertex(pts, G.project(u.lat, u.lon));
    const it = M.nearestVertex(pts, G.project(t.lat, t.lon));
    const slice = M.sliceExtended(pts, iu, it, 150);
    alignments.push(slice);
    if (r === blueMainRoute) mainAlignment = slice;
  }
}
if (!mainAlignment) throw new Error('no main Blue alignment');
const mainCum = M.cumulative(mainAlignment);

// ---------------------------------------------------------------- 3. road selection
const drivableWays = [];
const excluded = {};
for (const w of [...osm.ways.values()].sort((a, b) => a.id - b.id)) {
  if (!w.tags.highway) continue;
  const reason = S.exclusionReason(w.tags);
  if (reason) {
    const key = reason.startsWith('class:') ? 'class:non-car' : reason;
    excluded[key] = (excluded[key] || 0) + 1;
    continue;
  }
  drivableWays.push(w);
}
const allEdges = S.buildEdges(drivableWays, nodePos);
const sel = S.selectEdges(allEdges, alignments);
const weak = S.extendWeak(allEdges, sel.selected);
const coreSet = new Set(sel.selected);
for (const e of sel.selected) e.routable = true;
for (const e of weak.extra) e.routable = false;
const selected = sel.selected.concat(weak.extra).sort((a, b) => a.wayId - b.wayId || a.seg - b.seg);
sel.report.droppedNearEdges = allEdges.filter((e) => e.minDist <= 200 && !selected.includes(e));
sel.report.weakExtension = weak.report;
log(`edges: all ${allEdges.length}, selected ${selected.length}`);

// ---------------------------------------------------------------- 4. names registry helper
const REG_DATE = REF_DATE;
const hasTelugu = (s) => /[ఀ-౿]/.test(s);
const cleanName = (s) => s.replace(/\s+/g, ' ').trim();
const display = (s) => {
  const c = cleanName(s).replace(/\s*;\s*/g, ' / ');
  return c.charAt(0).toLowerCase() === c.charAt(0).toUpperCase() ? c : c.charAt(0).toUpperCase() + c.slice(1);
};
const registry = new Map(); // id -> record
const regKey = new Map(); // kind|sourceName -> id
function regName(kind, sourceName, { displayName, aliases = [], sourceIds = [], runtimeRef = null } = {}) {
  const key = kind + '|' + sourceName;
  let id = regKey.get(key);
  if (!id) {
    let slug = slugify(sourceName);
    if (!slug) slug = 'n' + shortHash(sourceName, 8);
    id = `nm_${kind}_${slug}`;
    if (registry.has(id)) id += '_' + shortHash(sourceName, 6);
    regKey.set(key, id);
    registry.set(id, {
      id,
      kind,
      sourceName,
      displayName: displayName ?? display(sourceName),
      language: hasTelugu(sourceName) ? 'te' : 'en',
      aliases: [],
      sourceIds: [],
      sourceDate: REG_DATE,
      verification: 'provisional',
      runtimeRefs: [],
    });
  }
  const rec = registry.get(id);
  for (const a of aliases) if (a.value && !rec.aliases.some((x) => x.lang === a.lang && x.value === a.value)) rec.aliases.push(a);
  for (const s of sourceIds) if (!rec.sourceIds.includes(s)) rec.sourceIds.push(s);
  if (runtimeRef && !rec.runtimeRefs.includes(runtimeRef)) rec.runtimeRefs.push(runtimeRef);
  return id;
}

// ---------------------------------------------------------------- 5. RoadEdges
const nodeIdToKey = (n) => 'n_' + n;
const dedupePts = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);

const roads = [];
for (const e of selected) {
  const pts = dedupePts(e.pts.map((p) => [G.r2(p[0]), G.r2(p[1])]));
  if (pts.length < 2) continue;
  const lengthM = G.r2(G.polyLength(pts));
  const w = e.tags;
  const nameId = e.name ? regName('road', e.name, { aliases: [w['name:te'] && { lang: 'te', value: w['name:te'] }, w.alt_name && { lang: 'en', value: cleanName(w.alt_name) }].filter(Boolean), sourceIds: ['way/' + e.wayId], runtimeRef: e.id }) : null;
  const road = {
    id: e.id,
    wayId: e.wayId,
    name: e.name,
    nameId,
    highway: e.highway,
    oneway: e.oneway,
    routable: e.routable,
    lanes: e.lanes,
    widthM: e.widthM,
    level: e.level,
    bridge: e.bridge,
    tunnel: e.tunnel,
    elevationM: 0,
    pointElevM: [],
    surfaceId: `s_${e.level}_${e.id}`,
    fromNode: nodeIdToKey(e.from),
    toNode: nodeIdToKey(e.to),
    points: pts,
    lengthM,
    status: {
      geometry: 'provisional',
      ...(e.name ? { name: 'provisional' } : {}),
      width: 'provisional',
      direction: 'provisional',
      level: 'provisional',
      ...(e.bridge || e.tunnel ? { height: 'provisional' } : {}),
      turnRestrictions: 'provisional',
    },
    provenance: {
      source: 'osm',
      sourceIds: ['way/' + e.wayId],
      snapshot: (wayFiles.get(e.wayId) || []).slice().sort(),
      note: `direction: ${e.onewayBasis}; width: ${e.widthBasis}; osm version ${e.version}` + (e.routable ? '' : '; NON-ROUTABLE boundary road: weakly connected to the routable core, not strongly connected'),
    },
    _e: e,
  };
  roads.push(road);
}

// ---------------------------------------------------------------- 7. elevation (bridges, ramps, tunnels)
const elevStats = computeElevations(roads);
for (const r of roads) r._cum = G.cumulative(r.points);
const rampApproachEdges = elevStats.rampApproachEdges;
const rampOwnEdges = elevStats.rampOwnEdges;

// ---------------------------------------------------------------- 6. graph nodes, directed edges, junctions
const nodeMap = new Map(); // key -> {osm, edges:Set, ends}
const touch = (key, osmId, roadId) => {
  let n = nodeMap.get(key);
  if (!n) nodeMap.set(key, (n = { osm: osmId, roads: new Set(), ends: 0 }));
  n.roads.add(roadId);
  n.ends++;
};
for (const r of roads) {
  touch(r.fromNode, r._e.from, r.id);
  touch(r.toNode, r._e.to, r.id);
}
const { d: dArr, next: nextArr } = buildDirectedRoutable(roads.map((r) => ({ id: r.id, from: r.fromNode, to: r.toNode, oneway: r.oneway, routable: r.routable })));
const roadById = new Map(roads.map((r) => [r.id, r]));
const directed = dArr.map((x, i) => ({
  id: x.id,
  roadId: roads[x.ei].id,
  forward: x.fwd,
  fromNode: x.from,
  toNode: x.to,
  lengthM: roads[x.ei].lengthM,
  next: nextArr[i].map((j) => dArr[j].id),
}));
const directedById = new Map(directed.map((x) => [x.id, x]));

const nodes = [...nodeMap.entries()]
  .sort((a, b) => a[1].osm - b[1].osm)
  .map(([key, n]) => {
    const p = nodePos(n.osm);
    const levels = [...n.roads].map((id) => roadById.get(id).level);
    return {
      id: key,
      osmNodeId: n.osm,
      x: G.r2(p[0]),
      z: G.r2(p[1]),
      level: Math.min(...levels),
      edges: [...n.roads].sort(),
      isJunction: n.ends >= 3,
    };
  });
const nodeByKey = new Map(nodes.map((n) => [n.id, n]));
const junctions = nodes
  .filter((n) => n.isJunction)
  .map((n) => {
    const o = osm.nodes.get(n.osmNodeId);
    return {
      id: 'j_' + n.osmNodeId,
      nodeId: n.id,
      incoming: directed.filter((d) => d.toNode === n.id).map((d) => d.id).sort(),
      outgoing: directed.filter((d) => d.fromNode === n.id).map((d) => d.id).sort(),
      movementStatus: 'provisional',
      signalled: !!(o && o.tags.highway === 'traffic_signals'),
    };
  });

// ---------------------------------------------------------------- 8. spatial index over selected roads
const grid = new G.SegGrid(60);
roads.forEach((r, ri) => {
  for (let i = 0; i + 1 < r.points.length; i++) grid.add(r.points[i], r.points[i + 1], { ri, seg: i });
});
function nearestRoad(p, radius) {
  const h = grid.nearest(p, radius);
  if (!h) return null;
  const r = roads[h.payload.ri];
  const a = r.points[h.payload.seg];
  const b = r.points[h.payload.seg + 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L;
  const dz = (b[1] - a[1]) / L;
  const side = G.sideOf(dx, dz, p[0] - h.x, p[1] - h.z);
  // arclength of foot point
  const s = r._cum[h.payload.seg] + h.t * L;
  return { road: r, d: h.d, x: h.x, z: h.z, dx, dz, side, s };
}

// ---------------------------------------------------------------- 9. buildings
function assembleRings(wayList) {
  const pool = wayList.map((w) => w.nodes.slice());
  const rings = [];
  const used = new Array(pool.length).fill(false);
  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let cur = pool[i].slice();
    let guard = 0;
    while (cur[0] !== cur[cur.length - 1] && guard++ < 1000) {
      let found = false;
      for (let j = 0; j < pool.length; j++) {
        if (used[j]) continue;
        const w = pool[j];
        if (w[0] === cur[cur.length - 1]) cur = cur.concat(w.slice(1));
        else if (w[w.length - 1] === cur[cur.length - 1]) cur = cur.concat(w.slice().reverse().slice(1));
        else continue;
        used[j] = true;
        found = true;
        break;
      }
      if (!found) break;
    }
    if (cur.length >= 4 && cur[0] === cur[cur.length - 1]) rings.push(cur);
    else return null;
  }
  return rings;
}
const ringPts = (ids) => {
  const pts = ids.slice(0, -1).map((id) => nodePos(id));
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
};
const hashStoreys = (id) => 2 + (hex(id).readUInt32BE(0) % 4); // 2..5

const buildingCandidates = []; // {id, osmId, outer(local pts), holes[], tags}
const consumedWays = new Set();
let relIncomplete = 0;
for (const rel of [...osm.relations.values()].sort((a, b) => a.id - b.id)) {
  if (rel.tags.type !== 'multipolygon' || !rel.tags.building || rel.tags.building === 'no') continue;
  const outerWays = [];
  const innerWays = [];
  let complete = true;
  for (const m of rel.members) {
    if (m.type !== 'way') continue;
    const w = osm.ways.get(m.ref);
    if (!w || w.nodes.some((n) => !osm.nodes.has(n))) {
      complete = false;
      continue;
    }
    if (m.role === 'outer' || m.role === '') outerWays.push(w);
    else if (m.role === 'inner') innerWays.push(w);
  }
  if (!complete || outerWays.length === 0) {
    relIncomplete++;
    continue;
  }
  const outers = assembleRings(outerWays);
  const inners = innerWays.length ? assembleRings(innerWays) : [];
  if (!outers || !inners) {
    relIncomplete++;
    continue;
  }
  outerWays.concat(innerWays).forEach((w) => consumedWays.add(w.id));
  outers.forEach((ring, k) => {
    const outer = ringPts(ring);
    if (outer.length < 3) return;
    const holes = inners.map(ringPts).filter((h) => h.length >= 3 && G.pointInPolygon(h[0], outer));
    buildingCandidates.push({ id: `b_r${rel.id}` + (outers.length > 1 ? `_${k}` : ''), osmId: 'relation/' + rel.id, outer, holes, tags: rel.tags });
  });
}
for (const w of [...osm.ways.values()].sort((a, b) => a.id - b.id)) {
  if (!w.tags.building || w.tags.building === 'no') continue;
  if (consumedWays.has(w.id)) continue;
  if (w.nodes.length < 4 || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
  if (w.nodes.some((n) => !osm.nodes.has(n))) continue;
  const outer = ringPts(w.nodes);
  if (outer.length < 3) continue;
  buildingCandidates.push({ id: 'b_' + w.id, osmId: 'way/' + w.id, outer, holes: [], tags: w.tags });
}
const buildings = [];
let buildingsConsidered = 0;
for (const c of buildingCandidates) {
  buildingsConsidered++;
  const area = Math.abs(G.signedAreaXZ(c.outer));
  if (area < 1) continue;
  const centroid = G.polygonCentroid(c.outer);
  const nr = nearestRoad(centroid, BUILDING_RADIUS);
  if (!nr) continue;
  const t = c.tags;
  const hT = S.parseNum(t.height);
  const lv = S.parseNum(t['building:levels']);
  let heightM, levels;
  if (hT && hT > 0) {
    heightM = hT;
    levels = lv && lv > 0 ? Math.trunc(lv) : null;
  } else if (lv && lv > 0) {
    levels = Math.trunc(lv);
    heightM = levels * 3.2 + 0.6;
  } else {
    levels = null;
    heightM = hashStoreys(c.id) * 3.2 + 0.6;
  }
  const outer = G.orientCCWFromAbove(c.outer).map((p) => [G.r2(p[0]), G.r2(p[1])]);
  const b = {
    id: c.id,
    osmId: c.osmId,
    footprint: outer,
    ...(c.holes.length ? { holes: c.holes.map((h) => G.orientCCWFromAbove(h).reverse().map((p) => [G.r2(p[0]), G.r2(p[1])])) } : {}),
    heightM: G.r2(heightM),
    heightStatus: 'provisional',
    levels,
    name: t.name ? cleanName(t.name) : null,
    kind: t.building,
    frontRoadId: nr.road.id,
    frontSide: nr.side,
    centroid: [G.r2(centroid[0]), G.r2(centroid[1])],
    _hSource: hT && hT > 0 ? 'height tag' : lv && lv > 0 ? 'building:levels' : 'hash',
  };
  buildings.push(b);
}
buildings.sort((a, b) => cmp(a.id, b.id));
const buildingById = new Map(buildings.map((b) => [b.id, b]));
// bbox grid for point-in-building queries
const bGrid = new Map();
const bKey = (ix, iz) => ix * 100003 + iz;
for (const b of buildings) {
  const xs = b.footprint.map((p) => p[0]);
  const zs = b.footprint.map((p) => p[1]);
  b._bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  for (let ix = Math.floor(b._bb[0] / 50); ix <= Math.floor(b._bb[1] / 50); ix++)
    for (let iz = Math.floor(b._bb[2] / 50); iz <= Math.floor(b._bb[3] / 50); iz++) {
      const k = bKey(ix, iz);
      let a = bGrid.get(k);
      if (!a) bGrid.set(k, (a = []));
      a.push(b);
    }
}
function buildingAt(p) {
  const a = bGrid.get(bKey(Math.floor(p[0] / 50), Math.floor(p[1] / 50))) || [];
  for (const b of a) {
    if (p[0] < b._bb[0] || p[0] > b._bb[1] || p[1] < b._bb[2] || p[1] > b._bb[3]) continue;
    if (G.pointInPolygon(p, b.footprint) && !(b.holes || []).some((h) => G.pointInPolygon(p, h))) return b;
  }
  return null;
}

// ---------------------------------------------------------------- 9b. carriageway widths vs footprints and metro alignment
// Class-default / lanes-derived widths are provisional guesses. Clamp the half width so the carriageway edge keeps >= 0.6 m from
// every source building footprint and >= 1.0 m from the Blue alignment where a road runs roughly parallel (within 25 deg, within 12 m).
const CLEAR_FOOTPRINT = 0.6;
const CLEAR_ALIGN = 1.0;
const fpAll = new G.SegGrid(30);
const candGrid = new Map();
for (const c of buildingCandidates) {
  if (Math.abs(G.signedAreaXZ(c.outer)) < 1) continue;
  const n = c.outer.length;
  for (let i = 0; i < n; i++) fpAll.add(c.outer[i], c.outer[(i + 1) % n], { id: c.id });
  const xs = c.outer.map((q) => q[0]), zs = c.outer.map((q) => q[1]);
  c._bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  for (let ix = Math.floor(c._bb[0] / 50); ix <= Math.floor(c._bb[1] / 50); ix++)
    for (let iz = Math.floor(c._bb[2] / 50); iz <= Math.floor(c._bb[3] / 50); iz++) {
      const k = bKey(ix, iz);
      let a = candGrid.get(k);
      if (!a) candGrid.set(k, (a = []));
      a.push(c);
    }
}
const insideCandidate = (q) => (candGrid.get(bKey(Math.floor(q[0] / 50), Math.floor(q[1] / 50))) || []).some((c) => q[0] >= c._bb[0] && q[0] <= c._bb[1] && q[1] >= c._bb[2] && q[1] <= c._bb[3] && G.pointInPolygon(q, c.outer));
const clearanceToFootprints = (q) => {
  if (insideCandidate(q)) return 0;
  const h = fpAll.nearest(q, 15);
  return h ? h.d : Infinity;
};
const alignSegs = [];
for (const al of alignments) for (let i = 0; i + 1 < al.length; i++) alignSegs.push([al[i], al[i + 1]]);
function alignLimit(q, dx, dz) {
  let best = null;
  for (const [a, b] of alignSegs) {
    const n = G.nearestOnSegment(q, a, b);
    if (n.d <= 12 && (!best || n.d < best.d)) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      best = { d: n.d, cos: Math.abs((dx * (b[0] - a[0]) + dz * (b[1] - a[1])) / L) };
    }
  }
  return best && best.cos >= Math.cos((25 * Math.PI) / 180) ? best.d - CLEAR_ALIGN : Infinity;
}
const widthStats = { clamped: 0, clampedByFootprint: 0, clampedByAlignment: 0, atFloor: 0, skippedWidthTag: 0 };
const widthHist = {};
for (const r of roads) {
  const e = r._e;
  if (e.widthBasis.startsWith('width tag')) {
    widthStats.skippedWidthTag++;
  } else {
    const defHalf = r.widthM / 2;
    const floorHalf = Math.min(['service', 'living_street'].includes(r.highway) ? 1.5 : 2.25, defHalf);
    let minClear = Infinity;
    let minAlign = Infinity;
    const dense = G.densify(r.points, 5);
    for (let i = 0; i < dense.length; i++) {
      const q = dense[i];
      minClear = Math.min(minClear, clearanceToFootprints(q));
      const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      minAlign = Math.min(minAlign, alignLimit(q, (b[0] - a[0]) / L, (b[1] - a[1]) / L));
    }
    const fpHalf = minClear - CLEAR_FOOTPRINT;
    const half = Math.max(floorHalf, Math.min(defHalf, fpHalf, minAlign));
    const w = G.r2(half * 2);
    if (w < r.widthM - 0.005) {
      widthStats.clamped++;
      const byFp = fpHalf < defHalf - 1e-9, byAl = minAlign < defHalf - 1e-9;
      if (byFp) widthStats.clampedByFootprint++;
      if (byAl) widthStats.clampedByAlignment++;
      if (w <= floorHalf * 2 + 0.005) widthStats.atFloor++;
      r.provenance.note += `; width: class default clamped to source footprints/metro alignment (${r.widthM} m -> ${w} m; min footprint clearance ${Number.isFinite(minClear) ? G.r2(minClear) : 'none'} m, floor ${G.r2(floorHalf * 2)} m)`;
      r.widthM = w;
    }
  }
  const bucket = r.widthM.toFixed(2);
  widthHist[bucket] = (widthHist[bucket] || 0) + 1;
}
// intrusion: kept footprints that still overlap a carriageway (edge within half width of the centreline, or centreline inside the footprint)
const keptGrid = new G.SegGrid(30);
for (const b of buildings) for (let i = 0; i < b.footprint.length; i++) keptGrid.add(b.footprint[i], b.footprint[(i + 1) % b.footprint.length], { id: b.id });
const intrudingBuildings = new Set();
const intrudingRoads = new Map();
for (const r of roads) {
  const half = r.widthM / 2;
  for (const q of G.densify(r.points, 5)) {
    const hits = new Set(keptGrid.within(q, half - 0.01).map((h) => h.payload.id));
    const inside = buildingAt(q);
    if (inside) hits.add(inside.id);
    for (const id of hits) {
      intrudingBuildings.add(id);
      let s = intrudingRoads.get(r.id);
      if (!s) intrudingRoads.set(r.id, (s = new Set()));
      s.add(id);
    }
  }
}
for (const b of buildings) if (intrudingBuildings.has(b.id)) b.intrudesCarriageway = true;
log(`widths: clamped ${widthStats.clamped} roads; intruding buildings ${intrudingBuildings.size} on ${intrudingRoads.size} roads`);

// ---------------------------------------------------------------- 10. POIs
const POI_KEYS = ['shop', 'amenity', 'office', 'tourism', 'leisure', 'craft', 'healthcare', 'historic', 'man_made'];
const NAME_REQUIRED = new Set(['historic', 'man_made', 'leisure', 'amenity']);
const JUNK_AMENITY = new Set(['bench', 'waste_basket', 'waste_disposal', 'bicycle_parking', 'motorcycle_parking', 'parking_space', 'parking_entrance', 'shelter', 'drinking_water', 'post_box', 'clock', 'street_lamp', 'parking', 'toilets', 'recycling', 'bicycle_rental', 'taxi']);
function poiCategory(tags) {
  for (const k of POI_KEYS) {
    const v = tags[k];
    if (!v || v === 'no' || v === 'yes' && k !== 'shop' && k !== 'office' && k !== 'craft' && k !== 'healthcare') continue;
    if (k === 'amenity' && JUNK_AMENITY.has(v)) continue;
    if (NAME_REQUIRED.has(k) && !tags.name) continue;
    return `${k}:${v}`;
  }
  if (tags.building && tags.name) return `building:${tags.building}`;
  return null;
}
const pois = [];
const addPoi = (type, id, tags, pos, buildingId) => {
  const cat = poiCategory(tags);
  if (!cat) return;
  const nr = nearestRoad(pos, POI_RADIUS);
  if (!nr) return;
  const ll = G.unproject(pos[0], pos[1]);
  pois.push({
    id: `p_${type}_${id}`,
    osmId: `${type}/${id}`,
    name: tags.name ? cleanName(tags.name) : null,
    nameTe: tags['name:te'] ? cleanName(tags['name:te']) : null,
    nameId: null,
    category: cat,
    x: G.r2(pos[0]),
    z: G.r2(pos[1]),
    lat: G.r6(ll[0]),
    lon: G.r6(ll[1]),
    nearestRoadId: nr.road.id,
    roadSide: nr.side,
    distanceToRoadM: G.r2(nr.d),
    buildingId: buildingId ?? null,
    status: { geometry: 'provisional', name: 'provisional' },
    _nr: nr,
  });
};
for (const n of [...osm.nodes.values()].sort((a, b) => a.id - b.id)) {
  if (Object.keys(n.tags).length === 0) continue;
  const p = nodeLocalOf(n);
  addPoi('node', n.id, n.tags, p, null);
}
function nodeLocalOf(n) {
  return nodePos(n.id);
}
for (const w of [...osm.ways.values()].sort((a, b) => a.id - b.id)) {
  if (w.tags.highway) continue;
  if (!poiCategory(w.tags)) continue;
  if (w.nodes.some((n) => !osm.nodes.has(n))) continue;
  const closed = w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1];
  const pts = (closed ? w.nodes.slice(0, -1) : w.nodes).map(nodePos);
  const c = closed ? G.polygonCentroid(pts) : [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const own = buildingById.get('b_' + w.id);
  const inside = own || buildingAt(c);
  addPoi('way', w.id, w.tags, c, inside ? inside.id : null);
}
pois.sort((a, b) => cmp(a.id, b.id));
// node POIs inside footprints
for (const p of pois) if (!p.buildingId && p.osmId.startsWith('node/')) {
  const b = buildingAt([p.x, p.z]);
  if (b) p.buildingId = b.id;
}

// ---------------------------------------------------------------- 11. metro lines / stations / pillars
const bounds = (() => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const add = (x, z) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const r of roads) for (const p of r.points) add(p[0], p[1]);
  for (const b of buildings) for (const p of b.footprint) add(p[0], p[1]);
  return { minX: G.r2(minX), maxX: G.r2(maxX), minZ: G.r2(minZ), maxZ: G.r2(maxZ) };
})();
const clipRect = { minX: bounds.minX - 300, maxX: bounds.maxX + 300, minZ: bounds.minZ - 300, maxZ: bounds.maxZ + 300 };
const metroLines = metro.lines.map((L) => {
  const chains = lineChains[L.id];
  const local = [];
  for (const c of chains) for (const run of M.clipRuns(c.pts, clipRect)) local.push(run.map((p) => [G.r2(p[0]), G.r2(p[1])]));
  return {
    id: L.id,
    name: L.name,
    color: L.color,
    osmRouteMasterId: L.masterId,
    geo: chains.map((c) => c.latlon.filter((p, i) => i === 0 || p[0] !== c.latlon[i - 1][0] || p[1] !== c.latlon[i - 1][1])),
    local,
  };
});
const stationNodes = new Map();
for (const n of osm.nodes.values()) if (n.tags.public_transport === 'station' && n.tags.station === 'subway') stationNodes.set(n.id, n);
const stopAreas = [...osm.relations.values()].filter((r) => r.tags.type === 'public_transport').map((r) => ({ id: r.id, name: r.tags.name || '' }));
const stationsRaw = M.buildStations(metro, stationNodes, stopAreas);
const stations = stationsRaw.map((s) => {
  const p = G.project(s.lat, s.lon);
  return {
    id: s.id,
    name: s.name,
    sourceName: s.sourceName,
    nameTe: s.nameTe,
    lines: s.lines,
    lat: G.r6(s.lat),
    lon: G.r6(s.lon),
    x: G.r2(p[0]),
    z: G.r2(p[1]),
    osmIds: s.osmIds,
    isDeliveryEntrance: false,
    inCorridor: s.inCorridor,
    status: { geometry: 'provisional', name: 'provisional' },
    _variants: s.sourceNameVariants,
  };
});
// pillars along the primary Blue alignment (direction Nagole -> Raidurg) inside the clip rectangle, every 30 m
const pillars = [];
{
  const chain = lineChains.blue.find((c) => c.route === 8297688);
  for (const run of M.clipRuns(chain.pts, clipRect)) {
    const c = M.cumulative(run);
    const total = c[c.length - 1];
    for (let s = 0; s <= total + 1e-6; s += 30) {
      const q = M.pointAt(run, c, s);
      pillars.push({ x: G.r2(q.x), z: G.r2(q.z), heading: G.r4(G.headingOf(q.dx, q.dz)), lineId: 'blue' });
    }
  }
}
// drop pillars whose 1.0 m radius footprint lies within 0.5 m of any selected carriageway
const PILLAR_R = 1.0, PILLAR_CLEAR = 0.5;
const pillarsGenerated = pillars.length;
const roadBox = roads.map((r) => {
  const xs = r.points.map((q) => q[0]), zs = r.points.map((q) => q[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
});
const pillarOk = (pt) => {
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i], bb = roadBox[i], reach = r.widthM / 2 + PILLAR_R + PILLAR_CLEAR + 0.01;
    if (pt.x < bb[0] - reach || pt.x > bb[1] + reach || pt.z < bb[2] - reach || pt.z > bb[3] + reach) continue;
    if (G.nearestOnPolyline([pt.x, pt.z], r.points).d - r.widthM / 2 < PILLAR_R + PILLAR_CLEAR) return false;
  }
  return true;
};
const pillarsDropped = [];
for (let i = pillars.length - 1; i >= 0; i--) if (!pillarOk(pillars[i])) pillarsDropped.push(pillars.splice(i, 1)[0]);
log(`pillars: generated ${pillarsGenerated}, dropped ${pillarsDropped.length}, kept ${pillars.length}`);
const metroStructure = { pillars, deckHeightM: 12.5, deckWidthM: 9.0, heightStatus: 'provisional' };

// ---------------------------------------------------------------- 12. deliveries
const MAIN_CLASSES = new Set(['trunk', 'primary', 'secondary', 'trunk_link', 'primary_link', 'secondary_link']);
const GOOD_AMENITY = new Set(['restaurant', 'cafe', 'fast_food', 'bank', 'pharmacy', 'clinic', 'hospital', 'doctors', 'dentist', 'ice_cream', 'bar', 'pub', 'marketplace', 'fuel']);
const alignDirAt = (p) => {
  const h = (() => {
    let best = null;
    for (let i = 0; i + 1 < mainAlignment.length; i++) {
      const n = G.nearestOnSegment(p, mainAlignment[i], mainAlignment[i + 1]);
      if (!best || n.d < best.d) {
        const L = Math.hypot(mainAlignment[i + 1][0] - mainAlignment[i][0], mainAlignment[i + 1][1] - mainAlignment[i][1]) || 1;
        best = { d: n.d, s: mainCum[i] + n.t * L, x: n.x, z: n.z, dx: (mainAlignment[i + 1][0] - mainAlignment[i][0]) / L, dz: (mainAlignment[i + 1][1] - mainAlignment[i][1]) / L };
      }
    }
    return best;
  })();
  return { s: h.s, side: G.sideOf(h.dx, h.dz, p[0] - h.x, p[1] - h.z), d: h.d };
};
// dead-end spur detection: an edge with an endpoint touched only by itself
const endDegree = (key) => nodeMap.get(key).ends;
// stop geometry: 14 m along the road (follows curvature) x 4.5 m wide strip against the curb on the POI side, inside the carriageway
function stopGeometry(road, nr, side) {
  const lat = side === 'left' ? [nr.dz, -nr.dx] : [-nr.dz, nr.dx];
  const half = road.widthM / 2;
  const lo = Math.max(half - 4.5, -half);
  const sub = G.subPolyline(road.points, road._cum, Math.max(0, nr.s - 7), Math.min(road.lengthM, nr.s + 7));
  const sgn = side === 'left' ? 1 : -1;
  const inner = G.offsetLine(sub, sgn * lo);
  const outer = G.offsetLine(sub, sgn * half);
  const ringRaw = inner.concat(outer.slice().reverse());
  const poly = G.orientCCWFromAbove(ringRaw.filter((q, i) => i === 0 || Math.hypot(q[0] - ringRaw[i - 1][0], q[1] - ringRaw[i - 1][1]) > 0.005)).map((q) => [G.r2(q[0]), G.r2(q[1])]);
  const entrance = [G.r2(nr.x + lat[0] * half), G.r2(nr.z + lat[1] * half)];
  return { poly, entrance };
}
function stopBlocked(poly) {
  const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
  const bb = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1];
  const seen = new Set();
  for (let ix = Math.floor(bb[0] / 50); ix <= Math.floor(bb[1] / 50); ix++)
    for (let iz = Math.floor(bb[2] / 50); iz <= Math.floor(bb[3] / 50); iz++)
      for (const c of candGrid.get(bKey(ix, iz)) || []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (c._bb[0] > bb[1] || c._bb[1] < bb[0] || c._bb[2] > bb[3] || c._bb[3] < bb[2]) continue;
        if (G.polygonsIntersect(poly, c.outer)) return true;
      }
  return pillars.some((q) => G.distPointPolygon([q.x, q.z], poly) < PILLAR_R);
}
const candidates = [];
for (const p of pois) {
  if (!p.name || !/[A-Za-z]{3}/.test(p.name)) continue;
  const [k, v] = p.category.split(':');
  if (k === 'building' || k === 'historic' || k === 'man_made' || k === 'leisure' || k === 'tourism') continue;
  if (k === 'amenity' && !GOOD_AMENITY.has(v)) continue;
  if (p.distanceToRoadM > 35) continue;
  const road = roadById.get(p.nearestRoadId);
  if (!road.routable || road.bridge || road.tunnel || road.highway.startsWith('trunk') || road.highway.startsWith('motorway') || road.lengthM < 26) continue;
  const nr = p._nr;
  if (nr.s < 10 || nr.s > road.lengthM - 10) continue;
  if (stopBlocked(stopGeometry(road, nr, nr.side).poly)) continue;
  const al = alignDirAt([p.x, p.z]);
  if (al.d > 450) continue;
  const spur = endDegree(road.fromNode) === 1 || endDegree(road.toNode) === 1;
  const score = (k === 'amenity' ? 3 : k === 'shop' ? 2 : k === 'healthcare' ? 3 : 1.5) - p.distanceToRoadM / 15 + (spur ? 0.5 : 0) - al.d / 400;
  candidates.push({ poi: p, road, nr, al, spur, side: !MAIN_CLASSES.has(road.highway), main: ['primary', 'secondary'].includes(road.highway) && al.d <= 60, score });
}
candidates.sort((a, b) => b.score - a.score || cmp(a.poi.id, b.poi.id));
const totalAlign = mainCum[mainCum.length - 1];
const BINS = 10;
const binOf = (c) => Math.max(0, Math.min(BINS - 1, Math.floor((c.al.s / totalAlign) * BINS)));
let picks = [];
for (let b = 0; b < BINS; b++) {
  const c = candidates.find((x) => binOf(x) === b);
  if (c) picks.push(c);
}
const countOf = (f) => picks.filter(f).length;
const need = [
  { name: 'side roads >= 3', test: (c) => c.side, min: 3 },
  { name: 'dead-end spur >= 1', test: (c) => c.spur, min: 1 },
  { name: 'alignment left >= 3', test: (c) => c.al.side === 'left', min: 3 },
  { name: 'alignment right >= 3', test: (c) => c.al.side === 'right', min: 3 },
  { name: 'main-road frontage, left of alignment >= 1', test: (c) => c.main && c.al.side === 'left', min: 1 },
  { name: 'main-road frontage, right of alignment >= 1', test: (c) => c.main && c.al.side === 'right', min: 1 },
  { name: 'road left >= 2', test: (c) => c.nr.side === 'left', min: 2 },
  { name: 'road right >= 2', test: (c) => c.nr.side === 'right', min: 2 },
];
const constraintLog = [];
for (let iter = 0; iter < 30; iter++) {
  const deficit = need.find((n) => countOf(n.test) < n.min);
  if (!deficit) break;
  // prefer replacing a pick in a bin where a satisfying candidate exists and no satisfied constraint breaks
  let done = false;
  const tryReplace = (binIdx) => {
    const cand = candidates.find((x) => binOf(x) === binIdx && deficit.test(x) && !picks.includes(x));
    if (!cand) return false;
    const old = picks.find((x) => binOf(x) === binIdx);
    const trial = old ? picks.map((x) => (x === old ? cand : x)) : picks.concat([cand]);
    const bad = need.some((n) => picks.filter(n.test).length >= n.min && trial.filter(n.test).length < n.min);
    if (bad) return false;
    picks = trial;
    constraintLog.push(`${deficit.name}: ${old ? 'replaced' : 'added'} ${cand.poi.id} in bin ${binIdx}`);
    return true;
  };
  for (let b = 0; b < BINS && !done; b++) if (picks.find((x) => binOf(x) === b) && tryReplace(b)) done = true;
  for (let b = 0; b < BINS && !done; b++) if (picks.length < 12 && tryReplace(b)) done = true;
  if (!done) {
    constraintLog.push(`UNSATISFIED: ${deficit.name}`);
    break;
  }
}
// top up to 10 deliveries with well-separated extra candidates (farthest-first, at least 250 m from every pick)
while (picks.length < 10) {
  let best = null;
  for (const c of candidates) {
    if (picks.includes(c)) continue;
    const dmin = Math.min(...picks.map((q) => Math.hypot(q.poi.x - c.poi.x, q.poi.z - c.poi.z)));
    if (dmin < 250) continue;
    const sc = c.score + dmin / 500;
    if (!best || sc > best.sc) best = { c, sc };
  }
  if (!best) break;
  picks.push(best.c);
  constraintLog.push(`top-up: added ${best.c.poi.id}`);
}
picks.sort((a, b) => a.al.s - b.al.s || cmp(a.poi.id, b.poi.id));
const deliveries = [];
const usedDeliveryIds = new Set();
for (const c of picks) {
  const p = c.poi;
  const road = c.road;
  const nr = c.nr;
  const side = nr.side;
  const forwardApproach = road.oneway ? true : side === 'left';
  const approach = `${road.id}:${forwardApproach ? 'f' : 'b'}`;
  const tdx = forwardApproach ? nr.dx : -nr.dx;
  const tdz = forwardApproach ? nr.dz : -nr.dz;
  // unit vector toward the POI side (left of forward travel is (dz,-dx))
  const lat = side === 'left' ? [nr.dz, -nr.dx] : [-nr.dz, nr.dx];
  const { poly, entrance } = stopGeometry(road, nr, side);
  let id = 'd_' + (slugify(p.name) || p.id);
  if (usedDeliveryIds.has(id)) id += '_' + p.osmId.replace('/', '');
  usedDeliveryIds.add(id);
  const nameId = regName('poi', p.name, { aliases: p.nameTe ? [{ lang: 'te', value: p.nameTe }] : [], sourceIds: [p.osmId], runtimeRef: id });
  regName('poi', p.name, { runtimeRef: p.id });
  p.nameId = nameId;
  deliveries.push({
    id,
    poiId: p.id,
    label: p.name,
    nameId,
    roadId: road.id,
    approachEdges: [approach],
    side,
    level: road.level,
    stopPolygon: poly,
    entrance,
    facingHeading: G.r4(G.headingOf(tdx, tdz)),
    status: { geometry: 'provisional', name: 'provisional' },
  });
}
log(`deliveries: ${deliveries.length}; constraint log: ${constraintLog.join(' | ') || 'initial picks satisfied all constraints'}`);

// ---------------------------------------------------------------- 13. boundary
const roadPts = [];
for (const r of roads) for (const p of r.points) roadPts.push(p);
const hull0 = G.convexHull(roadPts);
const MARGIN = 60;
const ring = [];
for (const h of hull0) for (let k = 0; k < 16; k++) ring.push([h[0] + MARGIN * Math.cos((k / 16) * 2 * Math.PI), h[1] + MARGIN * Math.sin((k / 16) * 2 * Math.PI)]);
const hull1 = G.convexHull(ring);
const boundaryPoly = G.orientCCWFromAbove(hull1).map((p) => [G.r2(p[0]), G.r2(p[1])]);
// exits: edges touching a dead-end node (selected degree 1) that either has an unselected drivable neighbour or lies at the data extent
const selectedIds = new Set(selected.map((e) => e.id));
const neighbourUnselected = new Map();
for (const e of allEdges) {
  if (selectedIds.has(e.id)) continue;
  for (const n of [e.from, e.to]) neighbourUnselected.set(nodeIdToKey(n), true);
}
const unionBoxes = acq.files.filter((f) => OSM_FILES.includes(f.file)).map((f) => f.bbox_west_south_east_north);
const boxMin = [Math.min(...unionBoxes.map((b) => b[0])), Math.min(...unionBoxes.map((b) => b[1]))];
const boxMax = [Math.max(...unionBoxes.map((b) => b[2])), Math.max(...unionBoxes.map((b) => b[3]))];
const nearExtent = (n) => {
  const o = osm.nodes.get(n.osmNodeId);
  const m = 20 / 111000;
  return o.lon < boxMin[0] + m || o.lon > boxMax[0] - m || o.lat < boxMin[1] + m || o.lat > boxMax[1] - m;
};
const exits = new Set();
for (const n of nodes) {
  const raw = nodeMap.get(n.id);
  if (raw.ends !== 1) continue;
  if (neighbourUnselected.get(n.id) || nearExtent(n)) for (const rid of n.edges) exits.add(rid);
}
const boundary = { polygon: boundaryPoly, warningMarginM: MARGIN, exits: [...exits].sort() };

// ---------------------------------------------------------------- 14. names for stations, lines, neighbourhoods
for (const s of stations) {
  const aliases = [];
  if (s.nameTe) aliases.push({ lang: 'te', value: s.nameTe });
  for (const v of s._variants) if (v !== s.sourceName && v !== s.name) aliases.push({ lang: 'en', value: v });
  regName('station', s.sourceName, { displayName: s.name, aliases, sourceIds: s.osmIds, runtimeRef: s.id });
}
for (const L of metro.lines) regName('line', L.master.tags.name, { sourceIds: ['relation/' + L.masterId], runtimeRef: L.id });
const neighbourhoodPos = new Map();
const PLACE = new Set(['neighbourhood', 'suburb', 'locality', 'quarter', 'village', 'hamlet', 'town']);
for (const n of [...osm.nodes.values()].sort((a, b) => a.id - b.id)) {
  if (!n.tags.place || !PLACE.has(n.tags.place) || !n.tags.name) continue;
  const p = nodePos(n.id);
  if (p[0] < clipRect.minX || p[0] > clipRect.maxX || p[1] < clipRect.minZ || p[1] > clipRect.maxZ) continue;
  const id = regName('neighbourhood', cleanName(n.tags.name), {
    aliases: n.tags['name:te'] ? [{ lang: 'te', value: n.tags['name:te'] }] : [],
    sourceIds: ['node/' + n.id],
    runtimeRef: 'place_node_' + n.id,
  });
  neighbourhoodPos.set(id, { lat: G.r6(n.lat), lon: G.r6(n.lon), x: G.r2(p[0]), z: G.r2(p[1]), place: n.tags.place });
}
const names = [...registry.values()]
  .map((r) => ({ ...r, aliases: r.aliases.sort((a, b) => cmp(a.lang + a.value, b.lang + b.value)), sourceIds: r.sourceIds.slice().sort(), runtimeRefs: r.runtimeRefs.slice().sort() }))
  .sort((a, b) => cmp(a.id, b.id));

// ---------------------------------------------------------------- 15. assemble + write world package
const cleanRoads = roads.map((r) => {
  const { _e, _base, _cum, _ramped, ...rest } = r;
  return rest;
});
const cleanBuildings = buildings.map((b) => {
  const { _bb, _hSource, ...rest } = b;
  return rest;
});
const cleanPois = pois.map((p) => {
  const { _nr, ...rest } = p;
  return rest;
});
const cleanStations = stations.map((s) => {
  const { _variants, ...rest } = s;
  return rest;
});

const core = {
  manifestVersion: WORLD_VERSION,
  roads: cleanRoads,
  nodes,
  directed,
  junctions,
  pois: cleanPois,
  metroLines,
  stations: cleanStations,
  metro: metroStructure,
  deliveries,
  names,
  boundary,
};

const outPkg = path.join(OUT_ROOT, PKG_DIR);
fs.rmSync(outPkg, { recursive: true, force: true });
const coreOut = writeOut(path.join(outPkg, 'core.json'), compact(core));

const chunkMap = new Map();
for (const b of cleanBuildings) {
  const ix = Math.floor(b.centroid[0] / CHUNK);
  const iz = Math.floor(b.centroid[1] / CHUNK);
  const k = `${ix}_${iz}`;
  let c = chunkMap.get(k);
  if (!c) chunkMap.set(k, (c = { id: `c_${k}`, ix, iz, buildings: [] }));
  c.buildings.push(b);
}
const chunkRefs = [];
for (const c of [...chunkMap.values()].sort((a, b) => a.ix - b.ix || a.iz - b.iz)) {
  const file = `chunks/${c.id}.json`;
  const o = writeOut(path.join(outPkg, file), compact({ id: c.id, ix: c.ix, iz: c.iz, buildings: c.buildings }));
  chunkRefs.push({ id: c.id, ix: c.ix, iz: c.iz, file, sha256: o.sha256, bytes: o.bytes, buildingCount: c.buildings.length });
}

// source files used
const usedSources = [...OSM_FILES.map((f) => 'resources/osm/' + f), 'resources/osm/metro-network-full.json', 'resources/osm/resource-acquisition-manifest.json'];
const sourceManifest = usedSources.map((f) => ({ file: 'hyderabad-game-handoff/' + f, sha256: sha256File(path.join(KIT, f)) }));

const roadLengthTotal = G.r2(cleanRoads.reduce((s, r) => s + r.lengthM, 0));
const manifest = {
  worldId: WORLD_ID,
  version: WORLD_VERSION,
  generatedAt: GENERATED_AT,
  referenceDate: REF_DATE,
  origin: { lat: G.WORLD_ORIGIN.lat, lon: G.WORLD_ORIGIN.lon },
  projection: `Local tangent-plane equirectangular about the fixed origin (${G.WORLD_ORIGIN.lat}, ${G.WORLD_ORIGIN.lon}) on WGS84: x = (lon-lon0)*cos(lat0)*N*pi/180, z = -(lat-lat0)*M*pi/180 with N=${G.N_RADIUS.toFixed(3)} m and M=${G.M_RADIUS.toFixed(3)} m at lat0. X east, Y up, Z south (z = -northing). Max length error vs WGS84 geodesic <0.03% within +-5 km. Heading h: forward = (-sin h, 0, -cos h).`,
  corridors: ['blue'],
  bounds,
  chunkSizeM: CHUNK,
  chunks: chunkRefs,
  sourceManifest,
  core: { file: 'core.json', sha256: coreOut.sha256, bytes: coreOut.bytes },
  counts: {
    roads: cleanRoads.length,
    roadLengthM: roadLengthTotal,
    nodes: nodes.length,
    directedEdges: directed.length,
    junctions: junctions.length,
    signalledJunctions: junctions.filter((j) => j.signalled).length,
    buildings: cleanBuildings.length,
    pois: cleanPois.length,
    stations: cleanStations.length,
    deliveries: deliveries.length,
    names: names.length,
    pillars: pillars.length,
    chunks: chunkRefs.length,
    bridgeRoads: cleanRoads.filter((r) => r.bridge).length,
    widthClampedRoads: widthStats.clamped,
    intrudingBuildings: intrudingBuildings.size,
    intrudingRoads: intrudingRoads.size,
    pillarsGenerated,
    pillarsDropped: pillarsDropped.length,
  },
};
const manifestOut = writeOut(path.join(outPkg, 'manifest.json'), pretty(manifest));

const ctx = {
  OUT_ROOT, GAME, REPO, KIT, OSM_DIR, WORLD_ID, WORLD_VERSION, PKG_DIR, REF_DATE, SNAPSHOT_ID, GENERATED_AT,
  core, manifest, manifestOut, coreOut, chunkRefs, buildings: cleanBuildings, names, neighbourhoodPos, acq, usedSources,
  alignments, mainAlignment, deliveries, stations: cleanStations, roadsInternal: roads,
};
const extra = writeProjectFiles(ctx);

const sizes = {
  coreBytes: coreOut.bytes,
  manifestBytes: manifestOut.bytes,
  chunkBytes: chunkRefs.reduce((s, c) => s + c.bytes, 0),
  chunkCount: chunkRefs.length,
};
const summary = {
  outRoot: OUT_ROOT,
  sizes,
  counts: manifest.counts,
  selection: { ...sel.report, droppedNearEdges: sel.report.droppedNearEdges.length, excludedWayReasons: excluded },
  routable: { roads: roads.filter((r) => r.routable).length, lengthM: G.r2(roads.filter((r) => r.routable).reduce((s, r) => s + r.lengthM, 0)), nonRoutableRoads: roads.filter((r) => !r.routable).length, nonRoutableLengthM: G.r2(roads.filter((r) => !r.routable).reduce((s, r) => s + r.lengthM, 0)) },
  ramps: { approachEdgesRamped: rampApproachEdges, bridgeEndsRampedOnBridge: rampOwnEdges },
  buildingsConsidered,
  buildingsIncompleteRelations: relIncomplete,
  buildingHeightSources: cleanBuildings.reduce((m, b, i) => ((m[buildings[i]._hSource] = (m[buildings[i]._hSource] || 0) + 1), m), {}),
  exits: boundary.exits.length,
  stationsPerLine: ['red', 'blue', 'green'].map((l) => [l, cleanStations.filter((s) => s.lines.includes(l)).length]),
  deliveries: deliveries.map((d) => ({ id: d.id, label: d.label, roadId: d.roadId, side: d.side, approach: d.approachEdges[0] })),
  deliveryConstraintLog: constraintLog,
  hashes: { core: coreOut.sha256, manifest: manifestOut.sha256, ...extra.hashes },
};
// deterministic import report (no timestamps / absolute paths) for docs and review
{
  const nearKept = selected.filter((e) => e.minDist <= 200);
  const farKept = selected.filter((e) => e.minDist > 200);
  const sumLen = (a) => G.r2(a.reduce((s, e) => s + e.length, 0));
  const droppedNear = sel.report.droppedNearEdges;
  const byName = {};
  for (const e of droppedNear) {
    const k = `${e.name || '(unnamed)'} [${e.highway}${e.oneway ? ', oneway' : ''}${e.bridge ? ', bridge' : ''}]`;
    byName[k] = (byName[k] || 0) + e.length;
  }
  const report = {
    note: 'Generated by scripts/import-map.mjs. Deterministic. Lengths in metres of OSM centreline.',
    selectedWithin200m: { edges: nearKept.length, lengthM: sumLen(nearKept), routableEdges: nearKept.filter((e) => e.routable).length, routableLengthM: sumLen(nearKept.filter((e) => e.routable)), nonRoutableEdges: nearKept.filter((e) => !e.routable).length, nonRoutableLengthM: sumLen(nearKept.filter((e) => !e.routable)) },
    selectedBeyond200mKeptForConnectivity: { edges: farKept.length, nonRoutableLinkEdges: farKept.filter((e) => !e.routable).length, lengthM: sumLen(farKept) },
    candidateEdgesWithin200m: { edges: sel.report.edgesWithin200m, lengthM: sumLen(allEdges.filter((e) => e.minDist <= 200)) },
    droppedWithin200m: { edges: droppedNear.length, lengthM: sumLen(droppedNear), topRoads: Object.entries(byName).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 15).map(([k, v]) => [k, G.r2(v)]) },
    excludedWayReasons: excluded,
    selection: { ...sel.report, droppedNearEdges: droppedNear.length },
    ramps: summary.ramps,
    buildings: { considered: buildingsConsidered, incompleteRelations: relIncomplete, kept: cleanBuildings.length, heightSources: summary.buildingHeightSources },
    counts: manifest.counts,
    deliveryConstraintLog: constraintLog,
    carriagewayWidths: {
      note: 'Class-default/lanes widths clamped to >= 0.6 m from source footprints and >= 1.0 m from the Blue alignment (parallel within 25 deg, within 12 m); floor 4.5 m total (3.0 m service/living_street).',
      ...widthStats,
      minimumWidthDistribution: Object.fromEntries(Object.entries(widthHist).sort((a, b) => a[0] - b[0])),
    },
    intrusion: {
      buildings: intrudingBuildings.size,
      roads: intrudingRoads.size,
      byRoad: [...intrudingRoads.entries()].sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => [k, [...v].sort()]),
    },
    pillars: { generated: pillarsGenerated, dropped: pillarsDropped.length, kept: pillars.length },
    boundaryExits: boundary.exits.length,
    stationsPerLine: summary.stationsPerLine,
    signalNodesInSource: [...osm.nodes.values()].filter((n) => n.tags.highway === 'traffic_signals').length,
    widthTagsOnSelectedRoads: selected.filter((e) => S.parseNum(e.tags.width)).length,
    lanesTagsOnSelectedRoads: selected.filter((e) => e.lanes !== null).length,
    bridgeWaysInSource: allEdges.filter((e) => e.bridge).map((e) => ({ id: e.id, name: e.name, selected: selectedIds.has(e.id), routable: !!e.routable })),
  };
  fs.mkdirSync(path.join(OUT_ROOT, 'data'), { recursive: true });
  writeOut(path.join(OUT_ROOT, 'data', 'import-report.json'), pretty(report));
}
if (!QUIET) console.log(JSON.stringify(summary, null, 2));
else console.log(JSON.stringify({ hashes: summary.hashes }));

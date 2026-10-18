#!/usr/bin/env node
/**
 * Hyderabad Metro Delivery: Overture Maps + OSM-kit metro -> runtime world package v2 (all three lines).
 *
 * Inputs (no network):
 *   data/interim/overture/<release>/*.ndjson   (scripts/overture/preprocess.py from data/raw/overture/<release>/*.parquet)
 *   hyderabad-game-handoff/resources/osm/metro-network-full.json (+ resource-acquisition-manifest.json)
 * Outputs (relative to --out-root, default game/):
 *   public/world/hyd-metro/v2/{manifest.json, core.json, chunks/c_<ix>_<iz>.json}
 *   qa/storefront-inventory.json, data/import-report-v2.json, qa/skywalks.json
 *   sources-manifest.json, name-registry.json  (+ scope files with --project-files)
 * Deterministic: identical inputs => byte-identical outputs (no wall-clock values).
 *
 * Usage: node scripts/import-world-v2.mjs [--lines red,blue,green] [--out-root <dir>] [--project-files] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as G from './lib/geo.mjs';
import * as M from './lib/metro.mjs';
import * as O from './lib/ovt.mjs';
import { selectV2 } from './lib/select2.mjs';
import { buildDirectedRoutable } from './lib/graph.mjs';
import { computeElevations, repairNodeElevations, limitGrades } from './lib/elevation.mjs';
import { writeOut, compact, pretty, sha256File, slugify, shortHash } from './lib/io.mjs';
import { groupOf, DELIVERY_WEIGHT, STORE_GROUPS } from './lib/stores.mjs';
import { attachStorefronts, SF_MIN_CONF, SF_MAX_ROAD_M } from './lib/storefronts.mjs';
import { buildStructures } from './lib/structures.mjs';
import { projectionReport } from './lib/projcheck.mjs';
import { writeV2ProjectFiles } from './lib/outputs2.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const REPO = path.resolve(GAME, '..');
const KIT = path.join(REPO, 'hyderabad-game-handoff');
const OSM_DIR = path.join(KIT, 'resources', 'osm');
const RELEASE = '2026-09-23.1';
const RAW_DIR = path.join(GAME, 'data', 'raw', 'overture', RELEASE);
const INTERIM = path.join(GAME, 'data', 'interim', 'overture', RELEASE);

const args = process.argv.slice(2);
const argv = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OUT_ROOT = path.resolve(argv('--out-root', GAME));
const QUIET = args.includes('--quiet');
const PROJECT_FILES = args.includes('--project-files');
const LINE_IDS = argv('--lines', 'red,blue,green').split(',');
const log = (...a) => {
  if (!QUIET) console.error(...a);
};
const t0 = Date.now();
const lap = (label) => log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

export const WORLD_ID = 'hyd-metro';
export const WORLD_VERSION = '2.0.0';
const PKG_DIR = path.join('public', 'world', 'hyd-metro', 'v2');
const CHUNK = 200;
const BUILDING_RADIUS = 120;
const NEAR_MAIN_M = 300;
const NEAR_ALL_M = 150;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hex = (s) => crypto.createHash('sha1').update(s).digest();
const hex12 = (uuid) => uuid.replace(/-/g, '').slice(0, 12);
const chooseHex = (ids, min) => {
  for (let n = min; n <= 12; n++) {
    const seen = new Set();
    let ok = true;
    for (const id of ids) {
      const k = id.replace(/-/g, '').slice(0, n);
      if (seen.has(k)) { ok = false; break; }
      seen.add(k);
    }
    if (ok) return n;
  }
  return 12;
};

// ---------------------------------------------------------------- 1. inputs
const fetchManifest = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'fetch-manifest.json'), 'utf8'));
const acq = JSON.parse(fs.readFileSync(path.join(OSM_DIR, 'resource-acquisition-manifest.json'), 'utf8'));
const GENERATED_AT = Object.values(fetchManifest.files).map((f) => f.fetched_at).sort().pop();
const REF_DATE = RELEASE.slice(0, 10);
const SNAPSHOT_ID = `overture-${RELEASE}+osm-hyd-20261017`;
const segsAll = await O.readNdjson(path.join(INTERIM, 'segments.ndjson'));
const connRows = await O.readNdjson(path.join(INTERIM, 'connectors.ndjson'));
const placeRows = await O.readNdjson(path.join(INTERIM, 'places.ndjson'));
const buildingRows = await O.readNdjson(path.join(INTERIM, 'buildings.ndjson'));
{
  const connIds = new Set(connRows.map((c) => c.id));
  for (const sg of segsAll) for (const [cid] of sg.conn) connIds.add(cid);
  O.setGersHex(O.chooseGersHex([segsAll.map((x) => x.id), [...connIds]]));
}
lap(`read interim (gers hex ${O.getGersHex()}): ${segsAll.length} segments, ${connRows.length} connectors, ${buildingRows.length} buildings, ${placeRows.length} places`);

// ---------------------------------------------------------------- 2. metro alignments (OSM kit)
const metro = M.loadMetro(path.join(OSM_DIR, 'metro-network-full.json'));
const metroPos = (id) => {
  const e = metro.el.get('node/' + id);
  return G.project(e.lat, e.lon);
};
const PRIMARY_ROUTE = { red: 8297636, blue: 8297688, green: 10692235 }; // forward direction used for pillars (Miyapur>LB Nagar, Nagole>Raidurg, JBS>MGBS)
const lineChains = {};
const alignByLine = {};
const primaryChain = {};
for (const L of metro.lines) {
  if (!LINE_IDS.includes(L.id)) continue;
  const seen = new Set();
  lineChains[L.id] = [];
  alignByLine[L.id] = [];
  for (const r of L.routes) {
    for (const c of M.stitchRoute(metro.el, r, seen)) {
      lineChains[L.id].push({
        route: r.id,
        pts: c.nodes.map(metroPos),
        latlon: c.nodes.map((n) => {
          const e = metro.el.get('node/' + n);
          return [G.r6(e.lat), G.r6(e.lon)];
        }),
      });
    }
    // selection alignments: every route chain (both directions/tracks), not de-duplicated
    for (const c of M.stitchRoute(metro.el, r, null)) alignByLine[L.id].push(c.nodes.map(metroPos));
    if (r.id === PRIMARY_ROUTE[L.id]) primaryChain[L.id] = M.stitchRoute(metro.el, r, null).map((c) => c.nodes.map(metroPos));
  }
}
const alignGrid = O.buildAlignGrid(alignByLine);
// end stations of each line (first / last stop of the primary route): the fetch added a 2 km disc around each
const TERMINUS_R = fetchManifest.terminus_radius_m || 0;
const termini = [];
for (const L of metro.lines) {
  if (!LINE_IDS.includes(L.id)) continue;
  const rt = L.routes.find((x) => x.id === PRIMARY_ROUTE[L.id]);
  const stops = M.stopsOf(metro.el, rt);
  for (const sp of [stops[0], stops[stops.length - 1]]) termini.push(G.project(sp.lat, sp.lon));
}
const terminusDist = (p) => Math.min(Infinity, ...termini.map((t) => Math.hypot(t[0] - p[0], t[1] - p[1])));
const alignDist = (p) => {
  const h = alignGrid.nearest(p, 2000);
  return h ? h.d : Infinity;
};
lap('metro alignments');

// ---------------------------------------------------------------- 3. road candidates + turn restrictions + selection
const connPos = new Map();
for (const c of connRows) connPos.set(c.id, G.project(c.p[1], c.p[0]));
const edgeStats = {};
const allEdges = O.buildOvtEdges(segsAll, edgeStats, connPos);
const { banned, stats: banStats } = O.buildBanned(segsAll, allEdges);
for (const e of allEdges) {
  e.dl = O.edgeLineDistances(e.pts, alignGrid, LINE_IDS);
  e.minDist = Math.min(...LINE_IDS.map((l) => e.dl[l]));
  e.nearLine = LINE_IDS.reduce((b, l) => (e.dl[l] < e.dl[b] ? l : b), LINE_IDS[0]);
}
// keep only what is within the fetched corridors (600 m) for the pool
const nearTerminus = (e) => TERMINUS_R > 0 && e.pts.some((p) => terminusDist(p) <= TERMINUS_R + 10);
const pool = allEdges.filter((e) => e.minDist <= 640 || nearTerminus(e));
const isNear = (e) => (O.MAIN_HIGHWAYS.has(e.highway) && e.minDist <= NEAR_MAIN_M) || e.minDist <= NEAR_ALL_M;
lap(`edges: ${allEdges.length} candidates, ${pool.length} in pool, ${banStats.bans} turn bans`);
const sel = selectV2(pool, isNear, banned, { log });
for (const e of sel.core) e.routable = true;
for (const e of sel.weak) e.routable = false;
const selected = sel.core.concat(sel.weak).sort((a, b) => a.wayId - b.wayId || a.seg - b.seg);
const selectedIds = new Set(selected.map((e) => e.id));
lap(`selected ${sel.core.length} routable + ${sel.weak.length} boundary edges`);

// ---------------------------------------------------------------- 4. names registry helper
const hasTelugu = (s) => /[ఀ-౿]/.test(s);
const cleanName = (s) => s.replace(/\s+/g, ' ').trim();
const display = (s) => {
  const c = cleanName(s).replace(/\s*;\s*/g, ' / ');
  return c.charAt(0).toLowerCase() === c.charAt(0).toUpperCase() ? c : c.charAt(0).toUpperCase() + c.slice(1);
};
const registry = new Map();
const regKey = new Map();
function regName(kind, sourceName, { displayName, aliases = [], sourceIds = [], runtimeRef = null } = {}) {
  const key = kind + '|' + sourceName;
  let id = regKey.get(key);
  if (!id) {
    let slug = slugify(sourceName);
    if (!slug) slug = 'n' + shortHash(sourceName, 8);
    id = `nm_${kind}_${slug}`;
    if (registry.has(id)) id += '_' + shortHash(sourceName, 6);
    regKey.set(key, id);
    registry.set(id, { id, kind, sourceName, displayName: displayName ?? display(sourceName), language: hasTelugu(sourceName) ? 'te' : 'en', aliases: [], sourceIds: [], sourceDate: REF_DATE, verification: 'provisional', runtimeRefs: [] });
  }
  const rec = registry.get(id);
  for (const a of aliases) if (a.value && !rec.aliases.some((x) => x.lang === a.lang && x.value === a.value)) rec.aliases.push(a);
  for (const s of sourceIds) if (!rec.sourceIds.includes(s)) rec.sourceIds.push(s);
  if (runtimeRef && !rec.runtimeRefs.includes(runtimeRef)) rec.runtimeRefs.push(runtimeRef);
  return id;
}

// ---------------------------------------------------------------- 5. RoadEdges
const dedupePts = (pts) => pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
// node positions: first selected edge touching a connector defines it; every other edge end is snapped onto it
const nodePosMap = new Map();
for (const e of selected) {
  if (!nodePosMap.has(e.from)) nodePosMap.set(e.from, e.pts[0]);
  if (!nodePosMap.has(e.to)) nodePosMap.set(e.to, e.pts[e.pts.length - 1]);
}
let snappedEnds = 0;
let maxSnap = 0;
for (const e of selected) {
  for (const [idx, key] of [[0, e.from], [e.pts.length - 1, e.to]]) {
    const np = nodePosMap.get(key);
    const d = Math.hypot(e.pts[idx][0] - np[0], e.pts[idx][1] - np[1]);
    if (d > 0) {
      snappedEnds++;
      maxSnap = Math.max(maxSnap, d);
      e.pts[idx] = np.slice();
    }
  }
}
const roads = [];
for (const e of selected) {
  const pts = dedupePts(e.pts.map((p) => [G.r2(p[0]), G.r2(p[1])]));
  if (pts.length < 2) continue;
  const lengthM = G.r2(G.polyLength(pts));
  const nameId = e.name ? regName('road', e.name, { aliases: e.nameTe ? [{ lang: 'te', value: e.nameTe }] : [], sourceIds: ['ovt:seg/' + hex12(e.segUuid)], runtimeRef: e.id }) : null;
  roads.push({
    id: e.id,
    wayId: e.wayId,
    name: e.name,
    nameId,
    highway: e.highway,
    oneway: e.oneway,
    routable: e.routable,
    lanes: null,
    widthM: e.widthM,
    level: e.level,
    bridge: e.bridge,
    tunnel: e.tunnel,
    elevationM: 0,
    pointElevM: [],
    surfaceId: `s_${e.level}_${e.id}`,
    fromNode: e.from,
    toNode: e.to,
    points: pts,
    lengthM,
    footpath: false,
    // status keys that are always 'provisional' for Overture-derived roads; keys that do not apply are omitted (compact core)
    status: {
      geometry: 'provisional',
      ...(e.name ? { name: 'provisional' } : {}),
      width: 'provisional',
      direction: 'provisional',
      ...(e.level !== 0 || e.bridge || e.tunnel ? { level: 'provisional' } : {}),
      ...(e.bridge || e.tunnel ? { height: 'provisional' } : {}),
    },
    provenance: {
      source: 'derived',
      sourceIds: ['ovt:seg/' + hex12(e.segUuid), ...(e.src && e.src[0] === 'OpenStreetMap' && e.src[1] ? ['osm:' + e.src[1]] : e.src && e.src[0] ? [e.src[0].toLowerCase() + ':' + (e.src[1] || '?')] : [])],
      // note only carries what departs from the defaults: explicit width_rules, and (added below) width clamps
      ...(e.widthBasis.startsWith('width_rules') ? { note: 'width: ' + e.widthBasis } : {}),
    },
    _e: e,
  });
}
lap(`roads ${roads.length}`);

// ---------------------------------------------------------------- 6. elevation
const elevStats = computeElevations(roads, { rampTunnels: true });
elevStats.nodeRepair = repairNodeElevations(roads);
elevStats.gradeLimit = limitGrades(roads, 0.1); // drivable grades: no 6.5 m humps over drains
// Douglas-Peucker (0.3 m) on at-grade edges only (ramps/bridges/tunnels keep every break point); end points never move
const dpSimplify = (pts, tol) => {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = G.nearestOnSegment(pts[i], pts[a], pts[b]).d;
      if (d > md) {
        md = d;
        mi = i;
      }
    }
    if (md > tol) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
};
let dpBefore = 0;
let dpAfter = 0;
for (const r of roads) {
  dpBefore += r.points.length;
  if (!r.bridge && !r.tunnel && r.pointElevM.every((v) => v === 0) && r.fromNode !== r.toNode) {
    const sp = dpSimplify(r.points, 0.3);
    if (sp.length >= 2 && sp.length < r.points.length) {
      r.points = sp;
      r.pointElevM = sp.map(() => 0);
      r.lengthM = G.r2(G.polyLength(sp));
    }
  }
  dpAfter += r.points.length;
}
for (const r of roads) r._cum = G.cumulative(r.points);
for (const r of roads) {
  r.footpath = !r.bridge && !r.tunnel && r.pointElevM.every((v) => v === 0) && !['motorway', 'motorway_link', 'trunk_link'].includes(r.highway);
}
lap('elevation');

// ---------------------------------------------------------------- 7. graph nodes, directed edges, junctions
const nodeMap = new Map();
const touch = (key, roadId, pos) => {
  let n = nodeMap.get(key);
  if (!n) nodeMap.set(key, (n = { roads: new Set(), ends: 0, pos }));
  n.roads.add(roadId);
  n.ends++;
};
for (const r of roads) {
  touch(r.fromNode, r.id, r.points[0]);
  touch(r.toNode, r.id, r.points[r.points.length - 1]);
}
const { d: dArr, next: nextArr } = buildDirectedRoutable(roads.map((r) => ({ id: r.id, from: r.fromNode, to: r.toNode, oneway: r.oneway, routable: r.routable })), banned);
const roadById = new Map(roads.map((r) => [r.id, r]));
const directed = dArr.map((x, i) => ({ id: x.id, roadId: roads[x.ei].id, forward: x.fwd, fromNode: x.from, toNode: x.to, lengthM: roads[x.ei].lengthM, next: nextArr[i].map((j) => dArr[j].id) }));
const nodes = [...nodeMap.entries()]
  .sort((a, b) => Number(a[0].slice(2)) - Number(b[0].slice(2)))
  .map(([key, n]) => ({
    id: key,
    osmNodeId: Number(key.slice(2)),
    x: G.r2(n.pos[0]),
    z: G.r2(n.pos[1]),
    level: Math.min(...[...n.roads].map((id) => roadById.get(id).level)),
    edges: [...n.roads].sort(),
    isJunction: n.ends >= 3,
  }));
const junctions = nodes
  .filter((n) => n.isJunction)
  .map((n) => ({
    id: 'j_' + n.osmNodeId,
    nodeId: n.id,
    incoming: directed.filter((d) => d.toNode === n.id).map((d) => d.id).sort(),
    outgoing: directed.filter((d) => d.fromNode === n.id).map((d) => d.id).sort(),
    movementStatus: 'provisional',
    signalled: false, // Overture transportation carries no signal nodes
  }));
// junctions whose successor lists differ from the plain turn rule because of a prohibited_transition
const plain = buildDirectedRoutable(roads.map((r) => ({ id: r.id, from: r.fromNode, to: r.toNode, oneway: r.oneway, routable: r.routable })));
const restrictedNodes = new Set();
for (let i = 0; i < dArr.length; i++) if (plain.next[i].length !== nextArr[i].length) restrictedNodes.add(dArr[i].to);
const junctionsWithRestrictions = junctions.filter((j) => restrictedNodes.has(j.nodeId)).length;
lap(`graph: ${nodes.length} nodes, ${directed.length} directed edges, ${junctions.length} junctions (${junctionsWithRestrictions} with turn restrictions)`);

// ---------------------------------------------------------------- 8. spatial index
const roadGrid = new G.SegGrid(60);
roads.forEach((r, ri) => {
  for (let i = 0; i + 1 < r.points.length; i++) roadGrid.add(r.points[i], r.points[i + 1], { ri, seg: i });
});
function nearestRoad(p, radius) {
  const h = roadGrid.nearest(p, radius);
  if (!h) return null;
  const r = roads[h.payload.ri];
  const a = r.points[h.payload.seg];
  const b = r.points[h.payload.seg + 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L;
  const dz = (b[1] - a[1]) / L;
  return { road: r, d: h.d, x: h.x, z: h.z, dx, dz, side: G.sideOf(dx, dz, p[0] - h.x, p[1] - h.z), s: r._cum[h.payload.seg] + h.t * L };
}

// ---------------------------------------------------------------- 9. buildings
const hashFloors = (id, area) => {
  const h = hex(id).readUInt32BE(0);
  if (area < 150) return 2 + (h % 3); // small shophouse 2..4
  if (area < 600) return 3 + (h % 3); // 3..5
  return 4 + (h % 5); // large footprint 4..8
};
const bldSrcCount = {};
const bldOsmId = (row) => {
  const [ds, rid] = row.src || [];
  bldSrcCount[ds || 'unknown'] = (bldSrcCount[ds || 'unknown'] || 0) + 1;
  const m = ds === 'OpenStreetMap' && rid ? /^([wr])(\d+)@/.exec(rid) : null;
  if (m) return (m[1] === 'w' ? 'way/' : 'relation/') + m[2];
  const tag = ds === 'Microsoft ML Buildings' ? 'msml' : ds === 'Google Open Buildings' ? 'gob' : 'ovt';
  return `ovt:${tag}:${row.id.replace(/-/g, '').slice(0, 12)}`;
};
const ringLocal = (ring) => {
  const pts = ring.slice(0, -1).map((c) => G.project(c[1], c[0]));
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
};
const BLD_HEX = chooseHex(buildingRows.map((r) => r.id), 10);
const buildings = [];
const candidates = []; // every building footprint within the corridors (for width clearance)
let buildingsConsidered = 0;
let stationFootprintsDropped = 0;
const heightSources = { height: 0, num_floors: 0, area_provisional: 0 };
for (const row of buildingRows) {
  row.polys.forEach((poly, k) => {
    buildingsConsidered++;
    const outer = ringLocal(poly[0]);
    if (outer.length < 3) return;
    const area = Math.abs(G.signedAreaXZ(outer));
    if (area < 1) return;
    const centroid = G.polygonCentroid(outer);
    if (row.sub === 'transportation' && (row.cls === 'train_station' || row.cls === 'transportation' || /metro|station|parade/i.test(row.name || '')) && alignDist(centroid) <= 60) {
      stationFootprintsDropped++; // elevated metro station structure drawn as a building footprint: the station model replaces it
      return;
    }
    // within 120 m of a selected road: centroid, else any vertex
    let nr = nearestRoad(centroid, 150);
    let near = nr && nr.d <= BUILDING_RADIUS;
    if (!near) {
      near = false;
      for (const v of outer) {
        const h = roadGrid.nearest(v, BUILDING_RADIUS);
        if (h) {
          near = true;
          break;
        }
      }
      if (near) nr = nearestRoad(centroid, 400) || nr;
    }
    if (!near || !nr) return;
    const holes = poly.slice(1).map(ringLocal).filter((h) => h.length >= 3 && G.pointInPolygon(h[0], outer));
    const id = `b_${row.id.replace(/-/g, '').slice(0, BLD_HEX)}` + (row.polys.length > 1 ? `_${k}` : '');
    let heightM;
    let levels = null;
    if (row.h && row.h > 0) {
      heightM = row.h;
      levels = row.nf && row.nf > 0 ? row.nf : null;
      heightSources.height++;
    } else if (row.nf && row.nf > 0) {
      levels = row.nf;
      heightM = row.nf * 3.2 + 0.6;
      heightSources.num_floors++;
    } else {
      heightM = hashFloors(id, area) * 3.2 + 0.6;
      heightSources.area_provisional++;
    }
    heightM = Math.max(2.5, Math.min(300, heightM));
    const outerCCW = G.orientCCWFromAbove(outer).map((p) => [G.r2(p[0]), G.r2(p[1])]);
    const nrc = G.nearestOnPolyline(centroid, nr.road.points);
    buildings.push({
      id,
      osmId: bldOsmId(row),
      footprint: outerCCW,
      ...(holes.length ? { holes: holes.map((h) => G.orientCCWFromAbove(h).reverse().map((p) => [G.r2(p[0]), G.r2(p[1])])) } : {}),
      heightM: G.r2(heightM),
      heightStatus: 'provisional',
      levels,
      name: row.name ? cleanName(row.name) : null,
      kind: row.sub || row.cls || 'yes',
      frontRoadId: nr.road.id,
      frontSide: G.sideOf(nrc.dx, nrc.dz, centroid[0] - nrc.x, centroid[1] - nrc.z),
      centroid: [G.r2(centroid[0]), G.r2(centroid[1])],
    });
  });
}
buildings.sort((a, b) => cmp(a.id, b.id));
{
  const seen = new Set();
  for (const b of buildings) {
    if (seen.has(b.id)) throw new Error('duplicate building id ' + b.id);
    seen.add(b.id);
  }
}
lap(`buildings ${buildings.length} of ${buildingsConsidered}`);

const bKey = (ix, iz) => ix * 100003 + iz;
const bGrid = new Map();
const fpAll = new G.SegGrid(30);
const edgeGrid = new G.SegGrid(20);
buildings.forEach((b, bi) => {
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
  const n = b.footprint.length;
  for (let i = 0; i < n; i++) {
    fpAll.add(b.footprint[i], b.footprint[(i + 1) % n], { id: b.id });
    edgeGrid.add(b.footprint[i], b.footprint[(i + 1) % n], { bi, ei: i });
  }
});
function buildingAt(p) {
  const a = bGrid.get(bKey(Math.floor(p[0] / 50), Math.floor(p[1] / 50))) || [];
  for (const b of a) {
    if (p[0] < b._bb[0] || p[0] > b._bb[1] || p[1] < b._bb[2] || p[1] > b._bb[3]) continue;
    if (G.pointInPolygon(p, b.footprint) && !(b.holes || []).some((h) => G.pointInPolygon(p, h))) return b;
  }
  return null;
}

// ---------------------------------------------------------------- 9b. carriageway widths vs footprints and metro alignment (as v1)
const CLEAR_FOOTPRINT = 0.6;
const CLEAR_ALIGN = 1.0;
const clearanceToFootprints = (q) => {
  if (buildingAt(q)) return 0;
  const h = fpAll.nearest(q, 15);
  return h ? h.d : Infinity;
};
const alignSegGrid = new G.SegGrid(40);
for (const pls of Object.values(alignByLine)) for (const al of pls) for (let i = 0; i + 1 < al.length; i++) alignSegGrid.add(al[i], al[i + 1], {});
function alignLimit(q, dx, dz) {
  let best = null;
  for (const h of alignSegGrid.within(q, 12)) {
    const s = alignSegGrid.segs[h.id];
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
    if (!best || h.d < best.d) best = { d: h.d, cos: Math.abs((dx * (s.b[0] - s.a[0]) + dz * (s.b[1] - s.a[1])) / L) };
  }
  return best && best.cos >= Math.cos((25 * Math.PI) / 180) ? best.d - CLEAR_ALIGN : Infinity;
}
const ELEV_SKIP = 2.5;
function samplesWithElev(r) {
  const out = [];
  for (let i = 0; i + 1 < r.points.length; i++) {
    const a = r.points[i], b = r.points[i + 1];
    const n = Math.max(1, Math.ceil(G.dist(a, b) / 5));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], elev: r.pointElevM[i] + (r.pointElevM[i + 1] - r.pointElevM[i]) * t });
    }
  }
  return out;
}
const widthStats = { clamped: 0, clampedByFootprint: 0, clampedByAlignment: 0, atFloor: 0, skippedWidthRule: 0, skippedBridgeDeck: 0 };
const widthHist = {};
for (const r of roads) {
  const e = r._e;
  if (e.widthBasis.startsWith('width_rules')) widthStats.skippedWidthRule++;
  else if (r.bridge) widthStats.skippedBridgeDeck++;
  else {
    const defHalf = r.widthM / 2;
    const floorHalf = Math.min(['service', 'living_street'].includes(r.highway) ? 1.5 : 2.25, defHalf);
    let minClear = Infinity;
    let minAlign = Infinity;
    const smp = samplesWithElev(r);
    for (let i = 0; i < smp.length; i++) {
      if (smp[i].elev > ELEV_SKIP) continue;
      const q = smp[i].p;
      minClear = Math.min(minClear, clearanceToFootprints(q));
      const a = smp[Math.max(0, i - 1)].p, b = smp[Math.min(smp.length - 1, i + 1)].p;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      minAlign = Math.min(minAlign, alignLimit(q, (b[0] - a[0]) / L, (b[1] - a[1]) / L));
    }
    const fpHalf = minClear - CLEAR_FOOTPRINT;
    const half = Math.max(floorHalf, Math.min(defHalf, fpHalf, minAlign));
    const w = G.r2(half * 2);
    if (w < r.widthM - 0.005) {
      widthStats.clamped++;
      if (fpHalf < defHalf - 1e-9) widthStats.clampedByFootprint++;
      if (minAlign < defHalf - 1e-9) widthStats.clampedByAlignment++;
      if (w <= floorHalf * 2 + 0.005) widthStats.atFloor++;
      r.provenance.note = (r.provenance.note ? r.provenance.note + '; ' : '') + `clamped ${r.widthM}->${w} m (footprint clearance ${Number.isFinite(minClear) ? G.r2(minClear) : 'none'} m)`;
      r.widthM = w;
    }
  }
  const bucket = r.widthM.toFixed(2);
  widthHist[bucket] = (widthHist[bucket] || 0) + 1;
}
// intrusion
const keptSegGrid = fpAll;
const intrudingBuildings = new Set();
const intrudingRoads = new Map();
const bHeight = new Map(buildings.map((b) => [b.id, b.heightM]));
for (const r of roads) {
  const half = r.widthM / 2;
  for (const sm of samplesWithElev(r)) {
    const q = sm.p;
    const hits = new Set(keptSegGrid.within(q, half - 0.01).map((h) => h.payload.id));
    const inside = buildingAt(q);
    if (inside) hits.add(inside.id);
    for (const id of hits) {
      // under a deck only buildings that would poke through it conflict (a low shed under a flyover is fine)
      if (sm.elev > ELEV_SKIP && !((bHeight.get(id) ?? Infinity) > sm.elev - 1.0)) continue;
      intrudingBuildings.add(id);
      let s = intrudingRoads.get(r.id);
      if (!s) intrudingRoads.set(r.id, (s = new Set()));
      s.add(id);
    }
  }
}
for (const b of buildings) if (intrudingBuildings.has(b.id)) b.intrudesCarriageway = true;
lap(`widths: clamped ${widthStats.clamped}; intruding buildings ${intrudingBuildings.size}`);

// ---------------------------------------------------------------- 10. storefronts
const placesLocal = placeRows.map((p) => ({ id: p.id, name: p.name ? cleanName(p.name) : null, nameTe: p.nameTe ? cleanName(p.nameTe) : null, cat: p.cat, tax: p.tax, conf: p.conf, st: p.st, sources: [...(p.src || []).filter((s) => s !== 'Overture'), 'Overture'], license: 'CDLA-Permissive-2.0', srcLicenses: p.lic, p: G.project(p.p[1], p.p[0]), lon: p.p[0], lat: p.p[1] }));
placesLocal.sort((a, b) => cmp(a.id, b.id));
const SF_HEX = chooseHex(placesLocal.map((p) => p.id), 10);
const sfIdOf = (placeId) => 'sf_' + placeId.replace(/-/g, '').slice(0, SF_HEX);
const sfCtx = { roads, roadGrid, buildings, edgeGrid, buildingAt };
const sfRes = attachStorefronts(placesLocal, sfCtx, log);
lap(`storefronts attached: ${sfRes.storefronts.length}, excluded/inventory-only ${sfRes.inventory.length}`);
const chunkOf = (x, z) => `c_${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
const storefronts = sfRes.storefronts.map((s) => {
  const rec = s.rec;
  const b = s.buildingIndex === null ? null : buildings[s.buildingIndex];
  const sf = {
    id: sfIdOf(rec.id),
    placeId: rec.id,
    name: rec.name,
    nameTe: rec.nameTe,
    category: rec.category,
    group: rec.group,
    confidence: G.r4(rec.confidence),
    sources: rec.sources,
    license: rec.license,
    x: G.r2(rec.x),
    z: G.r2(rec.z),
    buildingId: b ? b.id : null,
    roadId: s.roadId,
    side: s.side,
    facade: s.facade,
    facingHeading: s.facingHeading,
    floor: s.floor,
    status: 'provisional',
  };
  rec.status = 'provisional_listing';
  rec.sfId = sf.id;
  rec.roadId = sf.roadId;
  rec.side = sf.side;
  rec.buildingId = sf.buildingId;
  rec.floor = sf.floor;
  rec.chunk = b ? chunkOf(b.centroid[0], b.centroid[1]) : chunkOf((s.facade[0][0] + s.facade[1][0]) / 2, (s.facade[0][1] + s.facade[1][1]) / 2);
  sf._chunk = rec.chunk;
  return sf;
});
{
  const ids = new Set();
  for (const s of storefronts) {
    if (ids.has(s.id)) throw new Error('duplicate storefront id ' + s.id);
    ids.add(s.id);
  }
}
storefronts.sort((a, b) => cmp(a.id, b.id));
const sfByPlace = new Map(storefronts.map((s) => [s.placeId, s]));

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
const metroLines = metro.lines
  .filter((L) => LINE_IDS.includes(L.id))
  .map((L) => ({
    id: L.id,
    name: L.name,
    color: L.color,
    osmRouteMasterId: L.masterId,
    geo: lineChains[L.id].map((c) => c.latlon.filter((p, i) => i === 0 || p[0] !== c.latlon[i - 1][0] || p[1] !== c.latlon[i - 1][1])),
    local: lineChains[L.id].map((c) => dedupePts(c.pts.map((p) => [G.r2(p[0]), G.r2(p[1])]))).filter((pl) => pl.length >= 2),
  }));
const stationsRaw = M.buildStations(metro, new Map(), []);
const stations = stationsRaw
  .filter((s) => s.lines.some((l) => LINE_IDS.includes(l)))
  .map((s) => {
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
      inCorridor: true,
      status: { geometry: 'provisional', name: 'provisional' },
      _variants: s.sourceNameVariants,
    };
  });
// station order along each line (primary route stop order) for the ledger's viaduct spans
const stationByName = new Map(stations.map((s) => [s.name.toLowerCase(), s]));
const lineStops = {};
for (const L of metro.lines) {
  if (!LINE_IDS.includes(L.id)) continue;
  const rt = L.routes.find((x) => x.id === PRIMARY_ROUTE[L.id]);
  lineStops[L.id] = M.stopsOf(metro.el, rt).map((s) => stationByName.get(M.normStationName(s.name).toLowerCase())).filter(Boolean).map((s) => s.id).filter((id, i, a) => i === 0 || id !== a[i - 1]);
}
const PILLAR_STEP = 30;
const PILLAR_R = 1.0, PILLAR_CLEAR = 0.5;
const pillars = [];
for (const lid of LINE_IDS) {
  for (const chain of primaryChain[lid] || []) {
    const c = M.cumulative(chain);
    const total = c[c.length - 1];
    for (let s = 0; s <= total + 1e-6; s += PILLAR_STEP) {
      const q = M.pointAt(chain, c, s);
      pillars.push({ x: G.r2(q.x), z: G.r2(q.z), heading: G.r4(G.headingOf(q.dx, q.dz)), lineId: lid });
    }
  }
}
const pillarsGenerated = pillars.length;
const alignDistChain = (chain, p) => G.nearestOnPolyline(p, chain).d;
const pillarOk = (pt) => {
  for (const h of roadGrid.within([pt.x, pt.z], 40)) {
    const r = roads[h.payload.ri];
    if (h.d - r.widthM / 2 < PILLAR_R + PILLAR_CLEAR) return false;
  }
  return true;
};
const pillarsDropped = [];
let pillarsShifted = 0;
{
  // a pillar standing in a carriageway slides along the alignment (up to 12 m) to the nearest clear spot, else it is dropped
  const chainsOf = (lid) => primaryChain[lid] || [];
  const keep = [];
  for (const p of pillars) {
    if (pillarOk(p)) {
      keep.push(p);
      continue;
    }
    let moved = null;
    const chain = chainsOf(p.lineId).find((c) => alignDistChain(c, [p.x, p.z]) < 1.5);
    if (chain) {
      const c = M.cumulative(chain);
      const here = G.nearestOnPolyline([p.x, p.z], chain).s;
      for (const off of [3, -3, 6, -6, 9, -9, 12, -12]) {
        const q = M.pointAt(chain, c, here + off);
        const cand = { x: G.r2(q.x), z: G.r2(q.z), heading: G.r4(G.headingOf(q.dx, q.dz)), lineId: p.lineId, moved: true };
        if (pillarOk(cand)) {
          moved = cand;
          break;
        }
      }
    }
    if (moved) {
      pillarsShifted++;
      keep.push(moved);
    } else pillarsDropped.push(p);
  }
  // drop shifted pillars that landed within 8 m of a neighbour
  keep.sort((a, b) => cmp(a.lineId, b.lineId));
  pillars.length = 0;
  for (const p of keep) {
    if (pillars.some((q) => q.lineId === p.lineId && Math.hypot(q.x - p.x, q.z - p.z) < 8)) {
      pillarsDropped.push(p);
      if (p.moved) pillarsShifted--;
    } else pillars.push(p);
  }
  for (const p of pillars) delete p.moved;
}
const pillarsPerLine = Object.fromEntries(LINE_IDS.map((l) => [l, { generated: 0, kept: 0 }]));
for (const p of pillars) pillarsPerLine[p.lineId].kept++;
for (const p of pillarsDropped) pillarsPerLine[p.lineId].generated++;
for (const l of LINE_IDS) pillarsPerLine[l].generated += pillarsPerLine[l].kept;
const metroStructure = { pillars, deckHeightM: 12.5, deckWidthM: 9.0, heightStatus: 'provisional' };
lap(`pillars: generated ${pillarsGenerated}, shifted ${pillarsShifted}, dropped ${pillarsDropped.length}, kept ${pillars.length}; stations ${stations.length}`);

// ---------------------------------------------------------------- 12. deliveries (about 6 real named businesses per station area)
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
      for (const c of bGrid.get(bKey(ix, iz)) || []) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        if (c._bb[0] > bb[1] || c._bb[1] < bb[0] || c._bb[2] > bb[3] || c._bb[3] < bb[2]) continue;
        if (G.polygonsIntersect(poly, c.footprint)) return true;
      }
  return pillars.some((q) => G.distPointPolygon([q.x, q.z], poly) < PILLAR_R);
}
const DELIVERY_MIN_CONF = 0.6;
const AREA_R = 500;
const PER_STATION = 6;
const deliveryCands = [];
for (const sf of storefronts) {
  if (sf.confidence < DELIVERY_MIN_CONF) continue;
  if (!sf.name || (sf.name.match(/[A-Za-z]/g) || []).length < 3) continue;
  const w = DELIVERY_WEIGHT[sf.group] ?? 0;
  if (w <= 0) continue;
  // the listing's own nearest routable at-grade kerb road
  const near = roadGrid.within([sf.x, sf.z], 35).sort((a, b) => a.d - b.d || a.id - b.id);
  let pick = null;
  for (const h of near) {
    const road = roads[h.payload.ri];
    if (!road.routable || !road.footpath || road.highway.startsWith('trunk') || road.highway.startsWith('motorway') || road.lengthM < 26) continue;
    pick = road;
    break;
  }
  if (!pick) continue;
  const road = pick;
  const nrp = G.nearestOnPolyline([sf.x, sf.z], road.points);
  if (nrp.d > 35 || nrp.s < 10 || nrp.s > road.lengthM - 10) continue;
  const nr = { x: nrp.x, z: nrp.z, dx: nrp.dx, dz: nrp.dz, s: nrp.s, side: G.sideOf(nrp.dx, nrp.dz, sf.x - nrp.x, sf.z - nrp.z), d: nrp.d };
  let st = null;
  let sd = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.x - sf.x, s.z - sf.z);
    if (d < sd) {
      sd = d;
      st = s;
    }
  }
  if (!st || sd > AREA_R) continue;
  deliveryCands.push({ sf, road, nr, st, sd, w, score: w + sf.confidence - nr.d / 15 - sd / 400 - Math.max(0, sf.name.length - 32) / 40 });
}
deliveryCands.sort((a, b) => b.score - a.score || cmp(a.sf.id, b.sf.id));
const byStation = new Map();
for (const c of deliveryCands) {
  let a = byStation.get(c.st.id);
  if (!a) byStation.set(c.st.id, (a = []));
  a.push(c);
}
const deliveries = [];
const usedDeliveryIds = new Set();
const deliveryStats = { candidates: deliveryCands.length, stationsWith6: 0, stationsShort: [], blocked: 0 };
for (const st of stations.slice().sort((a, b) => cmp(a.id, b.id))) {
  const list = byStation.get(st.id) || [];
  const picks = [];
  const tried = new Set();
  while (picks.length < PER_STATION) {
    let best = null;
    for (const c of list) {
      if (picks.includes(c) || tried.has(c)) continue;
      if (picks.some((p) => Math.hypot(p.sf.x - c.sf.x, p.sf.z - c.sf.z) < 70)) continue;
      const sameGroup = picks.filter((p) => p.sf.group === c.sf.group).length;
      const sameSide = picks.filter((p) => p.nr.side === c.nr.side).length;
      const sc = c.score - 1.2 * sameGroup - (sameSide >= 4 ? 1 : 0);
      if (!best || sc > best.sc + 1e-9) best = { c, sc };
    }
    if (!best) break;
    const c = best.c;
    tried.add(c);
    const g = stopGeometry(c.road, c.nr, c.nr.side);
    if (stopBlocked(g.poly)) {
      deliveryStats.blocked++;
      continue;
    }
    c.geom = g;
    picks.push(c);
  }
  if (picks.length >= PER_STATION) deliveryStats.stationsWith6++;
  else deliveryStats.stationsShort.push([st.id, picks.length, list.length]);
  for (const c of picks) {
    const { sf, road, nr } = c;
    const side = nr.side;
    const forwardApproach = road.oneway ? true : side === 'left';
    const approach = `${road.id}:${forwardApproach ? 'f' : 'b'}`;
    const tdx = forwardApproach ? nr.dx : -nr.dx;
    const tdz = forwardApproach ? nr.dz : -nr.dz;
    let id = 'd_' + (slugify(sf.name) || sf.id);
    if (usedDeliveryIds.has(id)) id += '_' + sf.id.replace(/^sf_/, '').slice(0, 6);
    usedDeliveryIds.add(id);
    const nameId = regName('poi', sf.name, { aliases: sf.nameTe ? [{ lang: 'te', value: sf.nameTe }] : [], sourceIds: ['ovt:place/' + hex12(sf.placeId)], runtimeRef: id });
    deliveries.push({
      id,
      poiId: sf.id,
      label: sf.name,
      nameId,
      roadId: road.id,
      approachEdges: [approach],
      side,
      level: road.level,
      stopPolygon: c.geom.poly,
      entrance: c.geom.entrance,
      facingHeading: G.r4(G.headingOf(tdx, tdz)),
      status: { geometry: 'provisional', name: 'provisional' },
      _station: st.id,
      _group: sf.group,
      _line: c.road._e.nearLine,
    });
  }
}
deliveries.sort((a, b) => cmp(a.id, b.id));
lap(`deliveries ${deliveries.length} (${deliveryStats.stationsWith6} stations with ${PER_STATION})`);

// ---------------------------------------------------------------- 13. structures (skywalks / foot-over-bridges)
const stRes = buildStructures(segsAll, {
  alignDist,
  stations,
  nearRoads: (p, r) => roadGrid.within(p, r).map((h) => roads[h.payload.ri]),
});
const structures = stRes.structures;
lap(`structures ${structures.length} (${structures.filter((s) => s.kind === 'skywalk').length} skywalk pieces)`);

// ---------------------------------------------------------------- 14. boundary (union of buffered roads, concave; shapely)
const MARGIN = 60;
const interimBoundaryIn = path.join(INTERIM, 'boundary-in.json');
const interimBoundaryOut = path.join(INTERIM, 'boundary-out.json');
fs.writeFileSync(interimBoundaryIn, JSON.stringify({ lines: roads.map((r) => r.points), buffer: MARGIN, closing: 150, simplify: 5 }));
const py = path.join(GAME, '.venv-data', 'bin', 'python');
const bres = spawnSync(py, [path.join(HERE, 'overture', 'boundary.py'), interimBoundaryIn, interimBoundaryOut], { encoding: 'utf8' });
if (bres.status !== 0) throw new Error('boundary.py failed: ' + bres.stderr);
const boundaryJson = JSON.parse(fs.readFileSync(interimBoundaryOut, 'utf8'));
const boundaryPoly = G.orientCCWFromAbove(boundaryJson.ring.map((p) => [G.r2(p[0]), G.r2(p[1])]));
// exits: dead-end selected nodes that touch an unselected drivable edge or sit at the data extent
const neighbourUnselected = new Set();
for (const e of allEdges) if (!selectedIds.has(e.id)) for (const n of [e.from, e.to]) neighbourUnselected.add(n);
const exits = new Set();
for (const n of nodes) {
  const raw = nodeMap.get(n.id);
  if (raw.ends !== 1) continue;
  if (neighbourUnselected.has(n.id) || (alignDist([n.x, n.z]) > 580 && terminusDist([n.x, n.z]) > TERMINUS_R - 20)) for (const rid of n.edges) exits.add(rid);
}
const boundary = { polygon: boundaryPoly, warningMarginM: MARGIN, exits: [...exits].sort() };
lap(`boundary: ${boundaryPoly.length} vertices, ${boundary.exits.length} exits`);

// ---------------------------------------------------------------- 15. names for stations, lines
for (const s of stations) {
  const aliases = [];
  if (s.nameTe) aliases.push({ lang: 'te', value: s.nameTe });
  for (const v of s._variants) if (v !== s.sourceName && v !== s.name) aliases.push({ lang: 'en', value: v });
  regName('station', s.sourceName, { displayName: s.name, aliases, sourceIds: s.osmIds, runtimeRef: s.id });
}
for (const L of metro.lines) if (LINE_IDS.includes(L.id)) regName('line', L.master.tags.name, { sourceIds: ['relation/' + L.masterId], runtimeRef: L.id });
const names = [...registry.values()]
  .map((r) => ({ ...r, aliases: r.aliases.sort((a, b) => cmp(a.lang + a.value, b.lang + b.value)), sourceIds: r.sourceIds.slice().sort(), runtimeRefs: r.runtimeRefs.slice().sort() }))
  .sort((a, b) => cmp(a.id, b.id));

// ---------------------------------------------------------------- 16. assemble + write
const cleanRoads = roads.map((r) => {
  const { _e, _cum, ...rest } = r;
  return rest;
});
const cleanBuildings = buildings.map((b) => {
  const { _bb, ...rest } = b;
  return rest;
});
const cleanStations = stations.map((s) => {
  const { _variants, ...rest } = s;
  return rest;
});
const cleanDeliveries = deliveries.map((d) => {
  const { _station, _group, _line, ...rest } = d;
  return rest;
});
const directedIds = new Set(directed.map((d) => d.id));
const turnRestrictions = [...banned].map((k) => k.split('>')).filter(([a, b]) => directedIds.has(a) && directedIds.has(b)).sort((x, y) => cmp(x[0] + '>' + x[1], y[0] + '>' + y[1]));
const core = {
  manifestVersion: WORLD_VERSION,
  roads: cleanRoads,
  nodes,
  directed,
  junctions,
  pois: [],
  metroLines,
  stations: cleanStations,
  metro: metroStructure,
  deliveries: cleanDeliveries,
  names,
  boundary,
  structures,
  lines: LINE_IDS.slice(),
  turnRestrictions,
};
const outPkg = path.join(OUT_ROOT, PKG_DIR);
fs.rmSync(outPkg, { recursive: true, force: true });
const coreOut = writeOut(path.join(outPkg, 'core.json'), compact(core));

const chunkMap = new Map();
const chunkFor = (ix, iz) => {
  const k = `${ix}_${iz}`;
  let c = chunkMap.get(k);
  if (!c) chunkMap.set(k, (c = { id: `c_${k}`, ix, iz, buildings: [], storefronts: [] }));
  return c;
};
for (const b of cleanBuildings) chunkFor(Math.floor(b.centroid[0] / CHUNK), Math.floor(b.centroid[1] / CHUNK)).buildings.push(b);
for (const s of storefronts) {
  const m = /^c_(-?\d+)_(-?\d+)$/.exec(s._chunk);
  chunkFor(Number(m[1]), Number(m[2])).storefronts.push(s);
}
for (const s of storefronts) delete s._chunk;
const chunkRefs = [];
for (const c of [...chunkMap.values()].sort((a, b) => a.ix - b.ix || a.iz - b.iz)) {
  const file = `chunks/${c.id}.json`;
  const o = writeOut(path.join(outPkg, file), compact({ id: c.id, ix: c.ix, iz: c.iz, buildings: c.buildings, storefronts: c.storefronts }));
  chunkRefs.push({ id: c.id, ix: c.ix, iz: c.iz, file, sha256: o.sha256, bytes: o.bytes, buildingCount: c.buildings.length, storefrontCount: c.storefronts.length });
}
const usedSources = [
  ...Object.values(fetchManifest.files).map((f) => ({ file: 'game/data/raw/overture/' + RELEASE + '/' + f.file, sha256: sha256File(path.join(RAW_DIR, f.file)) })),
  { file: 'game/data/raw/overture/' + RELEASE + '/fetch-manifest.json', sha256: sha256File(path.join(RAW_DIR, 'fetch-manifest.json')) },
  { file: 'hyderabad-game-handoff/resources/osm/metro-network-full.json', sha256: sha256File(path.join(OSM_DIR, 'metro-network-full.json')) },
  { file: 'hyderabad-game-handoff/resources/osm/resource-acquisition-manifest.json', sha256: sha256File(path.join(OSM_DIR, 'resource-acquisition-manifest.json')) },
].sort((a, b) => cmp(a.file, b.file));
const proj = projectionReport({ roads, buildings, storefronts, stations, bounds });
const roadLengthTotal = G.r2(cleanRoads.reduce((s, r) => s + r.lengthM, 0));
const sfByGroup = Object.fromEntries(STORE_GROUPS.map((g) => [g, storefronts.filter((s) => s.group === g).length]));
const manifest = {
  worldId: WORLD_ID,
  version: WORLD_VERSION,
  generatedAt: GENERATED_AT,
  referenceDate: REF_DATE,
  origin: { lat: G.WORLD_ORIGIN.lat, lon: G.WORLD_ORIGIN.lon },
  projection: `Local tangent-plane equirectangular about the fixed origin (${G.WORLD_ORIGIN.lat}, ${G.WORLD_ORIGIN.lon}) on WGS84: x = (lon-lon0)*cos(lat0)*N*pi/180, z = -(lat-lat0)*M*pi/180 with N=${G.N_RADIUS.toFixed(3)} m and M=${G.M_RADIUS.toFixed(3)} m at lat0. X east, Y up, Z south (z = -northing). Heading h: forward = (-sin h, 0, -cos h). Max length error vs WGS84 geodesic over this extent: ${proj.maxRelErrPct.toFixed(3)} % (pairs up to 40 km); float32 storage error at 0.01 m quantum: <= ${proj.float32MaxErrM.toFixed(4)} m.`,
  corridors: LINE_IDS.slice(),
  bounds,
  chunkSizeM: CHUNK,
  chunks: chunkRefs,
  sourceManifest: usedSources,
  core: { file: 'core.json', sha256: coreOut.sha256, bytes: coreOut.bytes },
  counts: {
    roads: cleanRoads.length,
    roadLengthM: roadLengthTotal,
    routableRoads: roads.filter((r) => r.routable).length,
    boundaryRoads: roads.filter((r) => !r.routable).length,
    nodes: nodes.length,
    pois: 0,
    directedEdges: directed.length,
    junctions: junctions.length,
    junctionsWithTurnRestrictions: junctionsWithRestrictions,
    turnBansApplied: turnRestrictions.length,
    buildings: cleanBuildings.length,
    storefronts: storefronts.length,
    storefrontsOnBuildings: storefronts.filter((s) => s.buildingId).length,
    storefrontKiosks: storefronts.filter((s) => !s.buildingId).length,
    stations: cleanStations.length,
    deliveries: deliveries.length,
    names: names.length,
    pillars: pillars.length,
    structures: structures.length,
    chunks: chunkRefs.length,
    bridgeRoads: cleanRoads.filter((r) => r.bridge).length,
    tunnelRoads: cleanRoads.filter((r) => r.tunnel).length,
    footpathRoads: cleanRoads.filter((r) => r.footpath).length,
    widthClampedRoads: widthStats.clamped,
    intrudingBuildings: intrudingBuildings.size,
    intrudingRoads: intrudingRoads.size,
    pillarsGenerated,
    pillarsShifted,
    pillarsDropped: pillarsDropped.length,
    metroStationFootprintsRemoved: stationFootprintsDropped,
  },
};
const manifestOut = writeOut(path.join(outPkg, 'manifest.json'), pretty(manifest));

// ---- inventory (qa/storefront-inventory.json): every place within 40 m of a selected road
const nearestStation = (x, z) => {
  let best = null;
  let bd = Infinity;
  for (const s of stations) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return bd <= AREA_R ? best.id : null;
};
const lineOf = (x, z) => {
  const h = alignGrid.nearest([x, z], 3000);
  return h ? h.payload.line : null;
};
const inv = [...sfRes.inventory, ...sfRes.storefronts.map((s) => s.rec)].sort((a, b) => cmp(a.id, b.id));
let invOut = null;
const invItems = inv.map((r) => {
  const included = r.status === 'provisional_listing';
  return {
    id: included ? r.sfId : sfIdOf(r.id),
    placeId: r.id,
    name: r.name,
    category: r.category,
    group: r.group,
    confidence: G.r4(r.confidence),
    road: r.roadId,
    side: r.side,
    chunk: r.chunk,
    status: included ? 'provisional_listing' : 'excluded',
    ...(included ? {} : { reasons: r.reasons }),
    line: lineOf(r.x, r.z),
    stationArea: nearestStation(r.x, r.z),
    dRoadM: r.dRoad,
  };
});
const countBy = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
const invSummary = {
  inventoryPlaces: invItems.length,
  rendered: invItems.filter((x) => x.status === 'provisional_listing').length,
  excluded: invItems.filter((x) => x.status === 'excluded').length,
  excludedReasons: countBy(invItems.filter((x) => x.status === 'excluded').flatMap((x) => x.reasons.map((r) => ({ r }))), (x) => x.r),
  renderedByLine: countBy(invItems.filter((x) => x.status === 'provisional_listing'), (x) => x.line || 'none'),
  inventoryByLine: countBy(invItems, (x) => x.line || 'none'),
  renderedByGroup: sfByGroup,
  renderedByStationArea: Object.fromEntries(Object.entries(countBy(invItems.filter((x) => x.status === 'provisional_listing'), (x) => x.stationArea || 'outside_station_areas')).sort((a, b) => cmp(a[0], b[0]))),
  inventoryByStationArea: Object.fromEntries(Object.entries(countBy(invItems, (x) => x.stationArea || 'outside_station_areas')).sort((a, b) => cmp(a[0], b[0]))),
};
{
  const f = path.join(OUT_ROOT, 'qa', 'storefront-inventory.json');
  const header = {
    note: 'Every Overture place within 40 m of a selected road (routable or boundary). status provisional_listing = rendered as a Storefront (listing-based, NOT imagery verified); excluded = recorded here with reasons, never silently dropped. License: CDLA-Permissive-2.0 (Overture Places). Verification statuses reserved for later passes: verified_imagery | verified_field | missing.',
    worldId: WORLD_ID,
    worldVersion: WORLD_VERSION,
    release: RELEASE,
    thresholds: { maxDistanceToRoadM: SF_MAX_ROAD_M, minConfidenceRendered: SF_MIN_CONF },
    summary: invSummary,
  };
  const text = '{' + Object.entries(header).map(([k, v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',') + ',"items":[\n' + invItems.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n';
  invOut = writeOut(f, text);
}

// ---- skywalks report
writeOut(path.join(OUT_ROOT, 'qa', 'skywalks.json'), pretty({ note: 'Foot-over-bridge / skywalk components found in Overture footway segments flagged is_bridge (or level >= 1) within 300 m of a metro alignment.', stats: stRes.stats, components: stRes.compInfo }));

const sizes = {
  coreBytes: coreOut.bytes,
  manifestBytes: manifestOut.bytes,
  chunkBytes: chunkRefs.reduce((s, c) => s + c.bytes, 0),
  chunkCount: chunkRefs.length,
  chunkMaxBytes: Math.max(...chunkRefs.map((c) => c.bytes)),
  chunkMedianBytes: chunkRefs.map((c) => c.bytes).sort((a, b) => a - b)[Math.floor(chunkRefs.length / 2)],
};

// ---- km per line (nearest alignment)
const kmPerLine = {};
for (const l of LINE_IDS) {
  const mine = roads.filter((r) => r._e.nearLine === l);
  const km = (a) => G.r2(a.reduce((s, r) => s + r.lengthM, 0) / 1000);
  kmPerLine[l] = { routableKm: km(mine.filter((r) => r.routable)), boundaryKm: km(mine.filter((r) => !r.routable)), edges: mine.length };
}
const report = {
  note: 'Generated by scripts/import-world-v2.mjs. Deterministic. Lengths in metres.',
  release: RELEASE,
  lines: LINE_IDS,
  edgeCandidates: { count: allEdges.length, excluded: edgeStats.excluded },
  turnRestrictions: { ...banStats, junctionNodes: banStats.junctionNodes.size, junctionsWithRestrictions },
  selection: sel.report,
  selectionKm: (() => {
    const km = (a) => G.r2(a.reduce((t, e) => t + e.length, 0) / 1000);
    return {
      routableWithinCriteria: km(sel.core.filter(isNear)),
      routableBeyondCriteriaForConnectivity: km(sel.core.filter((e) => !isNear(e))),
      boundaryWithinCriteria: km(sel.weak.filter(isNear)),
      boundaryLinks: km(sel.weak.filter((e) => !isNear(e))),
      nearCandidatesNotSelected: km(pool.filter((e) => isNear(e) && !selectedIds.has(e.id))),
      criteria: { mainClassesWithinM: NEAR_MAIN_M, allDrivableClassesWithinM: NEAR_ALL_M, terminusDiscM: TERMINUS_R },
    };
  })(),
  kmPerLine,
  totalKm: { routable: G.r2(roads.filter((r) => r.routable).reduce((s, r) => s + r.lengthM, 0) / 1000), boundary: G.r2(roads.filter((r) => !r.routable).reduce((s, r) => s + r.lengthM, 0) / 1000) },
  nodeSnap: { snappedEnds, maxSnapM: G.r4(maxSnap) },
  douglasPeucker: { toleranceM: 0.3, pointsBefore: dpBefore, pointsAfter: dpAfter },
  ramps: elevStats,
  carriagewayWidths: { ...widthStats, minimumWidthDistribution: Object.fromEntries(Object.entries(widthHist).sort((a, b) => a[0] - b[0])) },
  intrusion: { buildings: intrudingBuildings.size, roads: intrudingRoads.size },
  buildings: { considered: buildingsConsidered, kept: cleanBuildings.length, heightSources, sourceDatasets: bldSrcCount, metroStationFootprintsRemoved: stationFootprintsDropped },
  storefronts: { summary: invSummary },
  pillars: { generated: pillarsGenerated, shifted: pillarsShifted, dropped: pillarsDropped.length, kept: pillars.length, perLine: pillarsPerLine },
  deliveries: { ...deliveryStats, perLine: countBy(deliveries, (d) => d._line), perGroup: countBy(deliveries, (d) => d._group) },
  structures: { stats: stRes.stats, components: stRes.compInfo },
  projection: proj,
  sizes,
  counts: manifest.counts,
};
fs.mkdirSync(path.join(OUT_ROOT, 'data'), { recursive: true });
writeOut(path.join(OUT_ROOT, 'data', 'import-report-v2.json'), pretty(report));

let extra = { hashes: {} };
if (PROJECT_FILES) {
  extra = writeV2ProjectFiles({ OUT_ROOT, GAME, REPO, KIT, OSM_DIR, RAW_DIR, WORLD_ID, WORLD_VERSION, PKG_DIR, REF_DATE, SNAPSHOT_ID, GENERATED_AT, RELEASE, core, manifest, manifestOut, coreOut, chunkRefs, names, acq, fetchManifest, roads, stations: cleanStations, deliveries: cleanDeliveries, deliveriesInternal: deliveries, storefronts, storefrontRecs: sfRes.storefronts, invSummary, kmPerLine, structures, LINE_IDS, usedSources, lineStops, primaryChain, alignByLine, invOut, roadsInternal: roads, sel, buildingsCount: cleanBuildings.length, stationFootprintsDropped, bldSrcCount });
}
const summary = { outRoot: OUT_ROOT, sizes, counts: manifest.counts, kmPerLine, hashes: { core: coreOut.sha256, manifest: manifestOut.sha256, ...extra.hashes } };
lap('done');
if (!QUIET) console.log(JSON.stringify(summary, null, 2));
else console.log(JSON.stringify({ hashes: summary.hashes }));

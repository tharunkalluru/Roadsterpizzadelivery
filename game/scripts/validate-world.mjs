#!/usr/bin/env node
/**
 * Validates the generated world package against the schema contract (src/world/schema.ts) and the data rules.
 *
 *   node scripts/validate-world.mjs [--root <game dir>] [--check-determinism] [--quiet]
 *
 * Exit code 0 = all checks passed, 1 = at least one error. A JSON summary is printed to stdout.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as G from './lib/geo.mjs';
import { buildDirectedRoutable, scc, dijkstraEdges } from './lib/graph.mjs';
import { sha256File, sha256Buf } from './lib/io.mjs';
import { elevationSelfTest } from './lib/elevation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argv = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const ROOT = path.resolve(argv('--root', path.resolve(HERE, '..')));
const REPO = path.resolve(path.resolve(HERE, '..'), '..');
const CHECK_DET = args.includes('--check-determinism');
const PKG = path.join(ROOT, 'public', 'world', 'hyd-uppal-tarnaka', 'v1');

const errors = [];
const warnings = [];
const err = (m) => errors.length < 200 && errors.push(m);
const warn = (m) => warnings.length < 100 && warnings.push(m);
const check = (cond, msg) => {
  if (!cond) err(msg);
  return !!cond;
};
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ------------------------------------------------------------------ tiny type DSL
const T = {
  s: (v) => typeof v === 'string',
  n: (v) => typeof v === 'number' && Number.isFinite(v),
  b: (v) => typeof v === 'boolean',
  's?': (v) => v === null || typeof v === 'string',
  'n?': (v) => v === null || (typeof v === 'number' && Number.isFinite(v)),
  a: (v) => Array.isArray(v),
  o: (v) => v && typeof v === 'object' && !Array.isArray(v),
  v2: (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)),
  'v2[]': (v) => Array.isArray(v) && v.every((p) => T.v2(p)),
  'n[]': (v) => Array.isArray(v) && v.every((x) => T.n(x)),
  's[]': (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
};
function shape(label, obj, spec) {
  if (!check(obj && typeof obj === 'object', `${label}: not an object`)) return false;
  let ok = true;
  for (const [k, t] of Object.entries(spec)) {
    if (!(k in obj)) {
      if (t.endsWith('~')) continue; // optional
      err(`${label}: missing field "${k}"`);
      ok = false;
      continue;
    }
    const tt = t.replace('~', '');
    if (!T[tt](obj[k])) {
      err(`${label}: field "${k}" has wrong type/value (${JSON.stringify(obj[k])?.slice(0, 60)}), expected ${tt}`);
      ok = false;
    }
  }
  return ok;
}
const STATUS = new Set(['verified', 'provisional', 'missing', 'scenario_overlay']);
function checkStatus(label, st) {
  if (!check(st && typeof st === 'object' && STATUS.has(st.geometry), `${label}: status.geometry invalid`)) return;
  for (const [k, v] of Object.entries(st)) if (!STATUS.has(v)) err(`${label}: status.${k} invalid "${v}"`);
}
function noNaN(label, v, depth = 0) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) err(`${label}: non-finite number`);
  } else if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) noNaN(label, v[i], depth + 1);
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) noNaN(label, v[k], depth + 1);
  }
}
function uniq(label, arr, key = (x) => x.id) {
  const m = new Set();
  for (const x of arr) {
    const k = key(x);
    if (m.has(k)) err(`${label}: duplicate id ${k}`);
    m.add(k);
  }
  return m;
}

// ------------------------------------------------------------------ convention self-tests
function selfTests() {
  // side: travelling east (dx=1,dz=0) viewed from above north-up, a point to the north (z negative) is on the LEFT
  check(G.sideOf(1, 0, 0, -1) === 'left', 'selftest: east-travel, north point should be left');
  check(G.sideOf(1, 0, 0, 1) === 'right', 'selftest: east-travel, south point should be right');
  check(G.sideOf(0, -1, -1, 0) === 'left', 'selftest: north-travel, west point should be left');
  check(G.sideOf(0, 1, 1, 0) === 'left', 'selftest: south-travel, east point should be left');
  // heading: forward = (-sin h, -cos h)
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.6, -0.8]]) {
    const h = G.headingOf(dx, dz);
    check(Math.abs(-Math.sin(h) - dx) < 1e-9 && Math.abs(-Math.cos(h) - dz) < 1e-9, `selftest: heading roundtrip failed for ${dx},${dz}`);
  }
  check(Math.abs(G.headingOf(0, -1)) < 1e-12, 'selftest: north heading must be 0');
  // CCW from above: east->north->west->south loop is CCW visually; north is -z
  check(G.isCCWFromAbove([[0, 0], [1, 0], [1, -1], [0, -1]]), 'selftest: ring (0,0)->E->N->W is CCW from above');
  { const et = elevationSelfTest(); for (const e of et.errs) err('selftest elevation: ' + e); }
  // projection roundtrip
  const p = G.project(17.4146, 78.5484);
  check(Math.abs(p[0]) < 1e-9 && Math.abs(p[1]) < 1e-9, 'selftest: origin must project to 0,0');
  const q = G.unproject(...G.project(17.42, 78.55));
  check(Math.abs(q[0] - 17.42) < 1e-9 && Math.abs(q[1] - 78.55) < 1e-9, 'selftest: projection roundtrip');
}

// ------------------------------------------------------------------ main validation
function validate() {
  selfTests();
  const summary = { root: ROOT };
  const manifestPath = path.join(PKG, 'manifest.json');
  if (!check(fs.existsSync(manifestPath), 'manifest.json missing (run npm run import:map)')) return summary;
  const manifest = readJson(manifestPath);
  shape('manifest', manifest, {
    worldId: 's', version: 's', generatedAt: 's', referenceDate: 's', origin: 'o', projection: 's', corridors: 's[]', bounds: 'o', chunkSizeM: 'n', chunks: 'a', sourceManifest: 'a', core: 'o', counts: 'o',
  });
  check(manifest.origin.lat === G.WORLD_ORIGIN.lat && manifest.origin.lon === G.WORLD_ORIGIN.lon, 'manifest.origin must equal WORLD_ORIGIN');
  check(manifest.chunkSizeM === 200, 'chunkSizeM must be 200');
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manifest.generatedAt), 'generatedAt format');
  for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) check(T.n(manifest.bounds[k]), `bounds.${k}`);

  // ---- hashes
  const coreFile = path.join(PKG, manifest.core.file);
  const coreBuf = fs.readFileSync(coreFile);
  check(sha256Buf(coreBuf) === manifest.core.sha256, 'core.json sha256 does not match manifest');
  check(coreBuf.length === manifest.core.bytes, 'core.json byte length does not match manifest');
  const core = JSON.parse(coreBuf.toString('utf8'));
  noNaN('core', core);
  const chunks = [];
  let chunkHashOk = 0;
  for (const ref of manifest.chunks) {
    shape('chunkRef ' + ref.id, ref, { id: 's', ix: 'n', iz: 'n', file: 's', sha256: 's', bytes: 'n', buildingCount: 'n' });
    const f = path.join(PKG, ref.file);
    if (!check(fs.existsSync(f), `chunk file missing ${ref.file}`)) continue;
    const buf = fs.readFileSync(f);
    if (check(sha256Buf(buf) === ref.sha256, `chunk ${ref.id} sha256 mismatch`)) chunkHashOk++;
    check(buf.length === ref.bytes, `chunk ${ref.id} bytes mismatch`);
    const ch = JSON.parse(buf.toString('utf8'));
    noNaN('chunk ' + ref.id, ch);
    check(ch.id === ref.id && ch.ix === ref.ix && ch.iz === ref.iz, `chunk ${ref.id} header mismatch`);
    check(ch.id === `c_${ch.ix}_${ch.iz}`, `chunk id format ${ch.id}`);
    check(ch.buildings.length === ref.buildingCount, `chunk ${ref.id} buildingCount mismatch`);
    chunks.push(ch);
  }
  const onDisk = fs.existsSync(path.join(PKG, 'chunks')) ? fs.readdirSync(path.join(PKG, 'chunks')) : [];
  check(onDisk.length === manifest.chunks.length, `chunk files on disk (${onDisk.length}) != manifest chunks (${manifest.chunks.length})`);
  uniq('chunks', manifest.chunks);

  // ---- core schema
  shape('core', core, { manifestVersion: 's', roads: 'a', nodes: 'a', directed: 'a', junctions: 'a', pois: 'a', metroLines: 'a', stations: 'a', metro: 'o', deliveries: 'a', names: 'a', boundary: 'o' });
  check(core.manifestVersion === manifest.version, 'core.manifestVersion != manifest.version');
  const roadSpec = { id: 's', wayId: 'n', name: 's?', nameId: 's?', highway: 's', oneway: 'b', routable: 'b', lanes: 'n?', widthM: 'n', level: 'n', bridge: 'b', tunnel: 'b', elevationM: 'n', pointElevM: 'n[]', surfaceId: 's', fromNode: 's', toNode: 's', points: 'v2[]', lengthM: 'n', status: 'o', provenance: 'o' };
  const roadIds = uniq('roads', core.roads);
  const nodeIds = uniq('nodes', core.nodes);
  const dirIds = uniq('directed', core.directed);
  const junctionIds = uniq('junctions', core.junctions);
  const poiIds = uniq('pois', core.pois);
  const stationIds = uniq('stations', core.stations);
  const deliveryIds = uniq('deliveries', core.deliveries);
  const nameIds = uniq('names', core.names);
  const buildings = chunks.flatMap((c) => c.buildings);
  const buildingIds = uniq('buildings', buildings);
  const roadById = new Map(core.roads.map((r) => [r.id, r]));
  const nodeById = new Map(core.nodes.map((n) => [n.id, n]));
  const dirById = new Map(core.directed.map((d, i) => [d.id, { d, i }]));

  let totalLen = 0;
  const CAR = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service']);
  for (const r of core.roads) {
    if (!shape('road ' + r.id, r, roadSpec)) continue;
    checkStatus('road ' + r.id, r.status);
    check(CAR.has(r.highway), `road ${r.id}: non-car highway class ${r.highway}`);
    check(r.points.length >= 2, `road ${r.id}: fewer than 2 points`);
    check(r.pointElevM.length === r.points.length, `road ${r.id}: pointElevM length != points length`);
    check(Math.abs(r.elevationM - Math.max(...r.pointElevM)) < 0.011, `road ${r.id}: elevationM != max(pointElevM)`);
    check(r.surfaceId === `s_${r.level}_${r.id}`, `road ${r.id}: surfaceId format`);
    check(/^r_\d+_\d+$/.test(r.id) && r.id === `r_${r.wayId}_${r.id.split('_')[2]}`, `road ${r.id}: id format`);
    check(nodeById.has(r.fromNode), `road ${r.id}: unknown fromNode ${r.fromNode}`);
    check(nodeById.has(r.toNode), `road ${r.id}: unknown toNode ${r.toNode}`);
    if (r.nameId !== null) check(nameIds.has(r.nameId), `road ${r.id}: unknown nameId ${r.nameId}`);
    check((r.nameId === null) === (r.name === null), `road ${r.id}: name/nameId nullability mismatch`);
    check(r.widthM > 0 && r.widthM <= 40, `road ${r.id}: implausible width ${r.widthM}`);
    let len = 0;
    for (let i = 1; i < r.points.length; i++) len += G.dist(r.points[i - 1], r.points[i]);
    check(Math.abs(len - r.lengthM) < 0.02 * r.points.length + 0.01, `road ${r.id}: lengthM ${r.lengthM} != recomputed ${len.toFixed(2)}`);
    totalLen += r.lengthM;
    // end points coincide with nodes
    const nf = nodeById.get(r.fromNode);
    const nt = nodeById.get(r.toNode);
    if (nf) check(Math.abs(nf.x - r.points[0][0]) < 0.011 && Math.abs(nf.z - r.points[0][1]) < 0.011, `road ${r.id}: first point != fromNode position`);
    if (nt) check(Math.abs(nt.x - r.points[r.points.length - 1][0]) < 0.011 && Math.abs(nt.z - r.points[r.points.length - 1][1]) < 0.011, `road ${r.id}: last point != toNode position`);
    // provenance
    const pv = r.provenance;
    check(['osm', 'authored', 'derived'].includes(pv.source), `road ${r.id}: provenance.source invalid`);
    check(Array.isArray(pv.sourceIds) && pv.sourceIds.length > 0, `road ${r.id}: provenance.sourceIds empty`);
    if (pv.source === 'osm') {
      check(pv.sourceIds.includes('way/' + r.wayId), `road ${r.id}: provenance missing way/${r.wayId}`);
      check(Array.isArray(pv.snapshot) && pv.snapshot.length > 0 && pv.snapshot.every((s) => /\.osm$/.test(s)), `road ${r.id}: provenance.snapshot missing`);
    }
    if (r.bridge || r.tunnel) check(r.status.height === 'provisional', `road ${r.id}: bridge/tunnel needs status.height provisional`);
  }
  for (const n of core.nodes) {
    shape('node ' + n.id, n, { id: 's', osmNodeId: 'n', x: 'n', z: 'n', level: 'n', edges: 's[]', isJunction: 'b' });
    check(n.id === 'n_' + n.osmNodeId, `node ${n.id}: id format`);
    for (const e of n.edges) check(roadIds.has(e), `node ${n.id}: unknown edge ${e}`);
    let ends = 0;
    for (const r of core.roads) if (r.fromNode === n.id) ends++;
    // (degree recomputed below in one pass)
  }
  {
    const deg = new Map();
    for (const r of core.roads) {
      deg.set(r.fromNode, (deg.get(r.fromNode) || 0) + 1);
      deg.set(r.toNode, (deg.get(r.toNode) || 0) + 1);
    }
    for (const n of core.nodes) {
      check((deg.get(n.id) || 0) >= 1, `node ${n.id}: no road touches it`);
      check(n.isJunction === (deg.get(n.id) >= 3), `node ${n.id}: isJunction inconsistent with degree ${deg.get(n.id)}`);
    }
    // elevation continuity at nodes
    const elev = new Map();
    for (const r of core.roads) {
      for (const [k, v] of [[r.fromNode, r.pointElevM[0]], [r.toNode, r.pointElevM[r.pointElevM.length - 1]]]) {
        if (!elev.has(k)) elev.set(k, v);
        else if (Math.abs(elev.get(k) - v) > 0.011) err(`elevation discontinuity at node ${k}: ${elev.get(k)} vs ${v} (road ${r.id})`);
      }
    }
  }

  // ---- directed edges
  const expected = (() => {
    const { d, next } = buildDirectedRoutable(core.roads.map((r) => ({ id: r.id, from: r.fromNode, to: r.toNode, oneway: r.oneway, routable: r.routable })));
    return { d, next };
  })();
  check(expected.d.length === core.directed.length, `directed edge count ${core.directed.length} != expected ${expected.d.length}`);
  for (const [i, d] of core.directed.entries()) {
    shape('directed ' + d.id, d, { id: 's', roadId: 's', forward: 'b', fromNode: 's', toNode: 's', lengthM: 'n', next: 's[]' });
    const r = roadById.get(d.roadId);
    if (!check(r, `directed ${d.id}: unknown roadId`)) continue;
    check(d.id === `${d.roadId}:${d.forward ? 'f' : 'b'}`, `directed ${d.id}: id format`);
    check(!(r.oneway && !d.forward), `directed ${d.id}: backward traversal of a one-way road`);
    check(d.fromNode === (d.forward ? r.fromNode : r.toNode) && d.toNode === (d.forward ? r.toNode : r.fromNode), `directed ${d.id}: node mismatch`);
    check(d.lengthM === r.lengthM, `directed ${d.id}: length mismatch`);
    for (const n of d.next) {
      const t = dirById.get(n);
      if (!check(t, `directed ${d.id}: unknown next ${n}`)) continue;
      check(t.d.fromNode === d.toNode, `directed ${d.id}: next ${n} does not start at toNode`);
    }
    const exp = expected.next[i].map((j) => expected.d[j].id);
    if (expected.d[i] && expected.d[i].id === d.id) check(JSON.stringify(exp.slice().sort()) === JSON.stringify(d.next.slice().sort()), `directed ${d.id}: next[] differs from turn rule (no U-turn unless only option)`);
    if (r.routable) check(d.next.length > 0, `directed ${d.id}: routable edge with empty next`);
  }
  for (const r of core.roads) {
    check(dirById.has(r.id + ':f'), `road ${r.id}: missing :f directed edge`);
    check(r.oneway ? !dirById.has(r.id + ':b') : dirById.has(r.id + ':b'), `road ${r.id}: :b directed edge presence inconsistent with oneway`);
  }
  const isRoutableDir = core.directed.map((d) => roadById.get(d.roadId)?.routable === true);
  const adj = core.directed.map((d) => d.next.map((n) => dirById.get(n)?.i).filter((x) => x !== undefined));
  // strong connectivity of the ROUTABLE subset only (successors restricted to routable edges)
  const routIdx = [];
  core.directed.forEach((d, i) => isRoutableDir[i] && routIdx.push(i));
  const remap = new Map(routIdx.map((i, k) => [i, k]));
  const adjR = routIdx.map((i) => adj[i].filter((j) => remap.has(j)).map((j) => remap.get(j)));
  const comp = scc(adjR);
  summary.stronglyConnected = { routableDirectedEdges: routIdx.length, totalDirectedEdges: core.directed.length, sccCount: comp.count, ok: comp.count === 1 };
  check(comp.count === 1, `routable subgraph is NOT strongly connected: ${comp.count} SCCs (sizes ${comp.sizes.slice(0, 5).join(',')}...)`);
  // every non-routable road must be weakly connected to the routable core
  {
    const par = new Map();
    const f = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (const r of core.roads) for (const k of [r.fromNode, r.toNode]) if (!par.has(k)) par.set(k, k);
    for (const r of core.roads) par.set(f(r.fromNode), f(r.toNode));
    const coreRoots = new Set(core.roads.filter((r) => r.routable).map((r) => f(r.fromNode)));
    let nonRoutable = 0;
    for (const r of core.roads) if (!r.routable) { nonRoutable++; check(coreRoots.has(f(r.fromNode)), `non-routable road ${r.id} is not weakly connected to the routable core`); }
    summary.nonRoutableRoads = nonRoutable;
  }

  // ---- junctions
  for (const j of core.junctions) {
    shape('junction ' + j.id, j, { id: 's', nodeId: 's', incoming: 's[]', outgoing: 's[]', movementStatus: 's', signalled: 'b' });
    const n = nodeById.get(j.nodeId);
    check(n && n.isJunction, `junction ${j.id}: node missing or not a junction`);
    check(STATUS.has(j.movementStatus), `junction ${j.id}: movementStatus invalid`);
    for (const x of j.incoming) check(dirById.has(x) && dirById.get(x).d.toNode === j.nodeId, `junction ${j.id}: bad incoming ${x}`);
    for (const x of j.outgoing) check(dirById.has(x) && dirById.get(x).d.fromNode === j.nodeId, `junction ${j.id}: bad outgoing ${x}`);
  }
  check(junctionIds.size === core.nodes.filter((n) => n.isJunction).length, 'junction count != degree>=3 node count');

  // ---- names
  for (const n of core.names) {
    shape('name ' + n.id, n, { id: 's', kind: 's', sourceName: 's', displayName: 's', language: 's', aliases: 'a', sourceIds: 's[]', sourceDate: 's', verification: 's', runtimeRefs: 's[]' });
    check(['road', 'station', 'poi', 'neighbourhood', 'landmark', 'line'].includes(n.kind), `name ${n.id}: kind`);
    check(STATUS.has(n.verification), `name ${n.id}: verification`);
    for (const a of n.aliases) check(T.s(a.lang) && T.s(a.value), `name ${n.id}: bad alias`);
  }

  // ---- buildings
  for (const b of buildings) {
    shape('building ' + b.id, b, { id: 's', osmId: 's', footprint: 'v2[]', holes: 'a~', intrudesCarriageway: 'b~', heightM: 'n', heightStatus: 's', levels: 'n?', name: 's?', kind: 's', frontRoadId: 's?', frontSide: 's?', centroid: 'v2' });
    check(b.footprint.length >= 3, `building ${b.id}: footprint < 3 points`);
    const f = b.footprint;
    check(!(f.length > 1 && f[0][0] === f[f.length - 1][0] && f[0][1] === f[f.length - 1][1]), `building ${b.id}: footprint is closed (must be unclosed)`);
    check(G.isCCWFromAbove(f), `building ${b.id}: footprint not CCW (from above, north up)`);
    for (const h of b.holes || []) {
      check(h.length >= 3, `building ${b.id}: hole < 3 points`);
      check(!G.isCCWFromAbove(h), `building ${b.id}: hole should be CW (opposite to outer)`);
    }
    check(b.heightM >= 2 && b.heightM <= 300, `building ${b.id}: implausible height ${b.heightM}`);
    check(STATUS.has(b.heightStatus), `building ${b.id}: heightStatus`);
    check(b.frontRoadId === null || roadIds.has(b.frontRoadId), `building ${b.id}: unknown frontRoadId`);
    check(b.frontSide === null || b.frontSide === 'left' || b.frontSide === 'right', `building ${b.id}: frontSide`);
    const refChunk = `c_${Math.floor(b.centroid[0] / 200)}_${Math.floor(b.centroid[1] / 200)}`;
    const holder = chunks.find((c) => c.buildings.includes(b));
    check(holder && holder.id === refChunk, `building ${b.id}: wrong chunk ${holder && holder.id} (centroid says ${refChunk})`);
    // front side recompute
    if (b.frontRoadId && roadById.has(b.frontRoadId)) {
      const r = roadById.get(b.frontRoadId);
      const nr = G.nearestOnPolyline(b.centroid, r.points);
      const side = G.sideOf(nr.dx, nr.dz, b.centroid[0] - nr.x, b.centroid[1] - nr.z);
      if (nr.d > 0.5) check(side === b.frontSide, `building ${b.id}: frontSide ${b.frontSide} != recomputed ${side}`);
    }
  }

  // ---- POIs
  for (const p of core.pois) {
    shape('poi ' + p.id, p, { id: 's', osmId: 's', name: 's?', nameTe: 's?', nameId: 's?', category: 's', x: 'n', z: 'n', lat: 'n', lon: 'n', nearestRoadId: 's?', roadSide: 's?', distanceToRoadM: 'n?', buildingId: 's?', status: 'o' });
    checkStatus('poi ' + p.id, p.status);
    check(/^p_(node|way)_\d+$/.test(p.id) && p.osmId === p.id.replace(/^p_(node|way)_/, '$1/'), `poi ${p.id}: id/osmId format`);
    check(p.nearestRoadId === null || roadIds.has(p.nearestRoadId), `poi ${p.id}: unknown nearestRoadId`);
    check(p.buildingId === null || buildingIds.has(p.buildingId), `poi ${p.id}: unknown buildingId ${p.buildingId}`);
    check(p.nameId === null || nameIds.has(p.nameId), `poi ${p.id}: unknown nameId`);
    const back = G.project(p.lat, p.lon);
    check(Math.hypot(back[0] - p.x, back[1] - p.z) < 0.2, `poi ${p.id}: lat/lon do not match x/z`);
    if (T.s(p.user) || 'phone' in p || 'email' in p || 'user' in p || 'uid' in p) err(`poi ${p.id}: contains contributor/contact metadata`);
  }

  // ---- metro
  check(core.metroLines.length === 3 && ['red', 'blue', 'green'].every((l) => core.metroLines.some((m) => m.id === l)), 'metroLines must contain red, blue, green');
  for (const L of core.metroLines) {
    shape('metroLine ' + L.id, L, { id: 's', name: 's', color: 's', osmRouteMasterId: 'n', geo: 'a', local: 'a' });
    check(L.geo.length > 0 && L.geo.every((pl) => Array.isArray(pl) && pl.length >= 2 && pl.every((p) => T.v2(p) && p[0] > 16 && p[0] < 19 && p[1] > 77 && p[1] < 80)), `metroLine ${L.id}: geo polyline invalid`);
    check(L.local.every((pl) => T['v2[]'](pl) && pl.length >= 2), `metroLine ${L.id}: local polyline invalid`);
  }
  check(core.metroLines.find((l) => l.id === 'blue').local.length > 0, 'blue line must have local polylines');
  for (const s of core.stations) {
    shape('station ' + s.id, s, { id: 's', name: 's', sourceName: 's', nameTe: 's?', lines: 's[]', lat: 'n', lon: 'n', x: 'n', z: 'n', osmIds: 's[]', isDeliveryEntrance: 'b', inCorridor: 'b', status: 'o' });
    check(s.isDeliveryEntrance === false, `station ${s.id}: isDeliveryEntrance must be false (Q04)`);
    check(/^st_[a-z0-9_]+$/.test(s.id), `station ${s.id}: id format`);
    checkStatus('station ' + s.id, s.status);
    const back = G.project(s.lat, s.lon);
    check(Math.hypot(back[0] - s.x, back[1] - s.z) < 0.2, `station ${s.id}: lat/lon do not match x/z`);
    check(nameIds.has('nm_station_' + s.id.replace(/^st_/, '')) || core.names.some((n) => n.kind === 'station' && n.runtimeRefs.includes(s.id)), `station ${s.id}: no NameRecord`);
  }
  const anchors = ['Uppal', 'Stadium', 'NGRI', 'Habsiguda', 'Tarnaka'];
  for (const a of anchors) check(core.stations.some((s) => s.name === a && s.inCorridor && s.lines.includes('blue')), `anchor station ${a} missing/inCorridor false`);
  check(core.stations.filter((s) => s.inCorridor).length === 5, 'exactly 5 inCorridor stations expected');
  summary.stationsPerLine = Object.fromEntries(['red', 'blue', 'green'].map((l) => [l, core.stations.filter((s) => s.lines.includes(l)).length]));
  const m = core.metro;
  shape('metro', m, { pillars: 'a', deckHeightM: 'n', deckWidthM: 'n', heightStatus: 's' });
  check(STATUS.has(m.heightStatus), 'metro.heightStatus');
  check(m.pillars.length > 0, 'no metro pillars');
  for (const p of m.pillars) {
    check(T.n(p.x) && T.n(p.z) && T.n(p.heading) && p.lineId === 'blue', 'bad pillar record');
  }
  {
    // pillar heading convention: forward (-sin h, -cos h) must follow successive pillar direction (same run)
    let bad = 0;
    for (let i = 0; i + 1 < m.pillars.length; i++) {
      const a = m.pillars[i], b = m.pillars[i + 1];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < 25 || d > 31) continue;
      const fx = -Math.sin(a.heading), fz = -Math.cos(a.heading);
      if (((b.x - a.x) * fx + (b.z - a.z) * fz) / d < 0.9) bad++;
    }
    check(bad === 0, `${bad} pillars have heading inconsistent with alignment direction`);
  }

  // ---- boundary
  const bd = core.boundary;
  shape('boundary', bd, { polygon: 'v2[]', warningMarginM: 'n', exits: 's[]' });
  check(bd.polygon.length >= 3, 'boundary polygon < 3 points');
  for (const e of bd.exits) check(roadIds.has(e), `boundary exit unknown road ${e}`);
  for (const r of core.roads) for (const p of r.points) if (!G.pointInPolygon(p, bd.polygon)) { err(`road ${r.id}: point outside boundary polygon`); break; }

  // ---- deliveries
  const dirLen = core.directed.map((d) => d.lengthM);
  const poiById = new Map(core.pois.map((p) => [p.id, p]));
  const stationOsm = new Set(core.stations.flatMap((s) => s.osmIds));
  for (const d of core.deliveries) {
    shape('delivery ' + d.id, d, { id: 's', poiId: 's?', label: 's', nameId: 's?', roadId: 's', approachEdges: 's[]', side: 's', level: 'n', stopPolygon: 'v2[]', entrance: 'v2', facingHeading: 'n', status: 'o' });
    checkStatus('delivery ' + d.id, d.status);
    check(/^d_/.test(d.id), `delivery ${d.id}: id format`);
    check(roadIds.has(d.roadId), `delivery ${d.id}: unknown roadId`);
    check(d.poiId === null || poiIds.has(d.poiId), `delivery ${d.id}: unknown poiId`);
    if (d.poiId) {
      const p = poiById.get(d.poiId);
      check(p && !stationOsm.has(p.osmId), `delivery ${d.id}: refers to a station (Q04)`);
      check(p && p.name === d.label, `delivery ${d.id}: label != POI name`);
    }
    check(d.nameId === null || nameIds.has(d.nameId), `delivery ${d.id}: unknown nameId`);
    check(d.approachEdges.length > 0, `delivery ${d.id}: no approachEdges`);
    check(d.side === 'left' || d.side === 'right', `delivery ${d.id}: side`);
    check(d.stopPolygon.length >= 3 && G.isCCWFromAbove(d.stopPolygon), `delivery ${d.id}: stopPolygon invalid or not CCW`);
    const r = roadById.get(d.roadId);
    if (r) {
      check(r.routable === true, `delivery ${d.id}: road is not routable`);
      check(d.level === r.level, `delivery ${d.id}: level != road level`);
      for (const a of d.approachEdges) {
        const t = dirById.get(a);
        if (!check(t && t.d.roadId === d.roadId, `delivery ${d.id}: approach ${a} not on road`)) continue;
        // geometry: stop polygon must sit on the curb of the POI side, inside the carriageway
        const fwd = t.d.forward;
        const nr = G.nearestOnPolyline(d.entrance, r.points);
        const tdx = fwd ? nr.dx : -nr.dx, tdz = fwd ? nr.dz : -nr.dz;
        const hd = G.headingOf(tdx, tdz);
        check(Math.abs(Math.atan2(Math.sin(hd - d.facingHeading), Math.cos(hd - d.facingHeading))) < 0.01, `delivery ${d.id}: facingHeading != approach travel heading`);
        // side of entrance relative to travel direction: POI must be on the driver's left for two-way roads
        const poi = d.poiId ? poiById.get(d.poiId) : null;
        const ref = poi ? [poi.x, poi.z] : d.entrance;
        const nr2 = G.nearestOnPolyline(ref, r.points);
        const sideFwd = G.sideOf(nr2.dx, nr2.dz, ref[0] - nr2.x, ref[1] - nr2.z);
        check(sideFwd === d.side, `delivery ${d.id}: side ${d.side} != recomputed ${sideFwd}`);
        if (!r.oneway) check(G.sideOf(tdx, tdz, ref[0] - nr2.x, ref[1] - nr2.z) === 'left', `delivery ${d.id}: two-way road approach must have POI on driver's left`);
      }
      for (const q of d.stopPolygon) {
        const nn = G.nearestOnPolyline(q, r.points);
        check(nn.d <= r.widthM / 2 + 0.06, `delivery ${d.id}: stopPolygon corner ${nn.d.toFixed(2)} m from centreline > half width ${r.widthM / 2}`);
      }
      const ne = G.nearestOnPolyline(d.entrance, r.points);
      check(Math.abs(ne.d - r.widthM / 2) < 0.1, `delivery ${d.id}: entrance not on curb offset`);
    }
  }
  check(core.deliveries.length >= 8 && core.deliveries.length <= 12, `deliveries count ${core.deliveries.length} not within 8..12`);
  check(core.deliveries.some((d) => d.side === 'left') && core.deliveries.some((d) => d.side === 'right'), 'deliveries must include both road sides');
  // Dijkstra pairwise reachability both ways
  {
    const nextIdx = adjR;
    const dirLenR = routIdx.map((i) => core.directed[i].lengthM);
    const starts = core.deliveries.map((d) => remap.get(dirById.get(d.approachEdges[0])?.i));
    const mat = [];
    let unreachable = 0, maxD = 0, minD = Infinity;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] === undefined) continue;
      const dist = dijkstraEdges(nextIdx, dirLenR, starts[i]);
      mat.push(starts.map((s) => (s === undefined ? null : Math.round(dist[s]))));
      for (let j = 0; j < starts.length; j++) {
        if (i === j || starts[j] === undefined) continue;
        if (!Number.isFinite(dist[starts[j]])) {
          unreachable++;
          err(`delivery ${core.deliveries[j].id} not reachable from ${core.deliveries[i].id}`);
        } else {
          maxD = Math.max(maxD, dist[starts[j]]);
          minD = Math.min(minD, dist[starts[j]]);
        }
      }
    }
    summary.deliveryRouting = { pairs: starts.length * (starts.length - 1), unreachable, minRouteM: Math.round(minD), maxRouteM: Math.round(maxD) };
  }


  // ---- carriageway vs footprint intrusion, pillars vs carriageways, stop polygons vs footprints/pillars
  {
    const keptGrid = new G.SegGrid(30);
    for (const b of buildings) for (let i = 0; i < b.footprint.length; i++) keptGrid.add(b.footprint[i], b.footprint[(i + 1) % b.footprint.length], { id: b.id });
    const bgrid = new Map();
    for (const b of buildings) {
      const xs = b.footprint.map((p) => p[0]), zs = b.footprint.map((p) => p[1]);
      b._bb = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      for (let ix = Math.floor(b._bb[0] / 50); ix <= Math.floor(b._bb[1] / 50); ix++)
        for (let iz = Math.floor(b._bb[2] / 50); iz <= Math.floor(b._bb[3] / 50); iz++) {
          const k = ix * 100003 + iz;
          (bgrid.get(k) || bgrid.set(k, []).get(k)).push(b);
        }
    }
    const containing = (q) => (bgrid.get(Math.floor(q[0] / 50) * 100003 + Math.floor(q[1] / 50)) || []).find((b) => q[0] >= b._bb[0] && q[0] <= b._bb[1] && q[1] >= b._bb[2] && q[1] <= b._bb[3] && G.pointInPolygon(q, b.footprint));
    const intr = new Set();
    const intrRoads = new Set();
    for (const r of core.roads) {
      const half = r.widthM / 2;
      for (const q of G.densify(r.points, 5)) {
        const ids = new Set(keptGrid.within(q, half - 0.01).map((h) => h.payload.id));
        const c = containing(q);
        if (c) ids.add(c.id);
        for (const id of ids) { intr.add(id); intrRoads.add(r.id); }
      }
    }
    const flagged = new Set(buildings.filter((b) => b.intrudesCarriageway === true).map((b) => b.id));
    check(intr.size === flagged.size && [...intr].every((id) => flagged.has(id)), `intrudesCarriageway flags (${flagged.size}) differ from recomputed intrusions (${intr.size})`);
    check(manifest.counts.intrudingBuildings === intr.size && manifest.counts.intrudingRoads === intrRoads.size, 'manifest intrusion counts differ from recomputed');
    summary.carriagewayIntrusion = { buildings: intr.size, roads: intrRoads.size };
    // minimum widths (non-tag widths never below the floor)
    const widths = {};
    for (const r of core.roads) {
      const floor = ['service', 'living_street'].includes(r.highway) ? 3.0 : 4.5;
      { const mm = /clamped to source footprints[^(]*\(([\d.]+) m -> ([\d.]+) m/.exec(r.provenance.note); if (mm) check(Number(mm[2]) >= Math.min(floor, Number(mm[1])) - 0.005 && Number(mm[2]) === r.widthM, `road ${r.id}: clamped width ${r.widthM} below floor ${floor} or note mismatch`); }
      widths[r.widthM.toFixed(2)] = (widths[r.widthM.toFixed(2)] || 0) + 1;
    }
    summary.widthDistribution = Object.fromEntries(Object.entries(widths).sort((a, b) => a[0] - b[0]));
    // pillars: footprint (r=1.0) must keep >= 0.5 m from every carriageway
    let badPillars = 0;
    for (const pl of core.metro.pillars) {
      for (const r of core.roads) {
        const d = G.nearestOnPolyline([pl.x, pl.z], r.points).d - r.widthM / 2;
        if (d < 1.5 - 0.011) { badPillars++; err(`pillar (${pl.x},${pl.z}) is ${d.toFixed(2)} m from carriageway of ${r.id} (needs >= 1.5 m from the road edge)`); break; }
      }
    }
    summary.pillars = { kept: core.metro.pillars.length, dropped: manifest.counts.pillarsDropped, generated: manifest.counts.pillarsGenerated, withinCarriageway: badPillars };
    check(manifest.counts.pillarsGenerated === core.metro.pillars.length + manifest.counts.pillarsDropped, 'pillar generated/dropped/kept counts inconsistent');
    // stop polygons
    for (const d of core.deliveries) {
      const r = roadById.get(d.roadId);
      const dists = d.stopPolygon.map((q) => G.nearestOnPolyline(q, r.points).d);
      check(Math.max(...dists) >= r.widthM / 2 - 0.2, `delivery ${d.id}: stopPolygon is not against the kerb (max ${Math.max(...dists).toFixed(2)} m vs half width ${r.widthM / 2})`);
      for (const b of buildings) {
        const xs = d.stopPolygon.map((q) => q[0]), zs = d.stopPolygon.map((q) => q[1]);
        if (b._bb[0] > Math.max(...xs) || b._bb[1] < Math.min(...xs) || b._bb[2] > Math.max(...zs) || b._bb[3] < Math.min(...zs)) continue;
        if (G.polygonsIntersect(d.stopPolygon, b.footprint)) err(`delivery ${d.id}: stopPolygon intersects building ${b.id}`);
      }
      for (const pl of core.metro.pillars) if (G.distPointPolygon([pl.x, pl.z], d.stopPolygon) < 1.0) err(`delivery ${d.id}: stopPolygon within 1.0 m of pillar (${pl.x},${pl.z})`);
    }
  }

  // ---- counts
  const c = manifest.counts;
  const expectCounts = { roads: core.roads.length, nodes: core.nodes.length, directedEdges: core.directed.length, junctions: core.junctions.length, buildings: buildings.length, pois: core.pois.length, stations: core.stations.length, deliveries: core.deliveries.length, names: core.names.length, pillars: m.pillars.length, chunks: manifest.chunks.length };
  for (const [k, v] of Object.entries(expectCounts)) check(c[k] === v, `manifest.counts.${k} ${c[k]} != actual ${v}`);
  check(Math.abs(c.roadLengthM - totalLen) < 0.5, 'manifest roadLengthM != sum of road lengths');

  // ---- source manifest hashes
  for (const s of manifest.sourceManifest) {
    const f = path.join(REPO, s.file);
    if (fs.existsSync(f)) check(sha256File(f) === s.sha256, `source ${s.file}: sha256 mismatch with bundled file`);
    else warn(`source file not present for hash check: ${s.file}`);
  }

  // ---- bounds
  {
    const b = manifest.bounds;
    const inside = (p) => p[0] >= b.minX - 0.01 && p[0] <= b.maxX + 0.01 && p[1] >= b.minZ - 0.01 && p[1] <= b.maxZ + 0.01;
    for (const r of core.roads) if (!r.points.every(inside)) { err(`road ${r.id} outside manifest bounds`); break; }
    for (const bb of buildings) if (!bb.footprint.every(inside)) { err(`building ${bb.id} outside manifest bounds`); break; }
  }

  // ---- project-level files
  const rd = (f) => path.join(ROOT, f);
  const sc = readJson(rd('scope-manifest.json'));
  const scopeBuf = fs.readFileSync(rd('scope-manifest.json'));
  for (const k of ['schema_version', 'project_id', 'revision', 'frozen', 'scope_extent', 'requested_corridor_ids', 'source_snapshot_id', 'reference_date', 'geometry_artifact', 'baseline_artifact', 'roads', 'junctions', 'stations', 'metro_structures', 'frontage_intervals', 'businesses', 'displayed_names', 'delivery_locations', 'route_cases', 'review_views']) check(k in sc, `scope-manifest: missing ${k}`);
  check(JSON.stringify(sc.requested_corridor_ids) === '["red","blue","green"]', 'scope: requested corridors must stay red, blue, green');
  check(sc.scope_extent !== 'requested_network', 'scope_extent must not claim requested_network (only the Blue Uppal-Tarnaka package exists)');
  const scopeRoadIds = new Set(sc.roads.map((r) => r.id));
  check(scopeRoadIds.size === core.roads.length && core.roads.every((r) => scopeRoadIds.has(r.id)), 'scope roads != core roads');
  for (const r of sc.roads) {
    const cr = roadById.get(r.id);
    check(cr && r.length_metres === cr.lengthM && r.length_metres > 0 && Array.isArray(r.corridor_ids) && r.source_refs.length > 0 && typeof r.implemented === 'boolean' && typeof r.geometry_verified === 'boolean', `scope road ${r.id} invalid`);
    check(r.implemented === false && r.geometry_verified === false, `scope road ${r.id}: must not claim implemented/verified yet`);
  }
  check(sc.roads.every((r) => r.corridor_ids.every((c) => ['red', 'blue', 'green'].includes(c))), 'scope road corridor ids');
  const fiIds = uniq('frontage_intervals', sc.frontage_intervals);
  for (const f of sc.frontage_intervals) {
    check(roadIds.has(f.road_id) && (f.side === 'left' || f.side === 'right') && f.length_metres > 0 && f.length_metres <= 100.01 && f.inspection_status === 'uninspected' && f.inventory_complete === false, `frontage interval ${f.id} invalid`);
  }
  for (const r of core.roads) {
    const sum = sc.frontage_intervals.filter((f) => f.road_id === r.id).reduce((s, f) => s + f.length_metres, 0);
    if (Math.abs(sum - 2 * r.lengthM) > 0.1 + 0.02 * Math.ceil(r.lengthM / 100)) err(`frontage intervals for ${r.id} sum ${sum.toFixed(2)} != 2 x length ${r.lengthM}`);
  }
  check(sc.businesses.length === 0, 'businesses inventory must stay empty (unknown), not fabricated');
  check(core.junctions.every((j) => sc.junctions.some((x) => x.id === j.id)) && sc.junctions.length === core.junctions.length, 'scope junctions != core junctions');
  check(sc.stations.length === 5 && sc.stations.every((s) => s.position_verified === false && s.name_verified === false), 'scope stations');
  check(sc.delivery_locations.length === core.deliveries.length, 'scope deliveries != core deliveries');
  check(sc.displayed_names.length === core.names.length && sc.displayed_names.every((n) => n.verified === false), 'scope displayed_names');
  const ach = sc.achieved_scope;
  check(ach && ach.requested_network_denominators.roads_total_metres === null && ach.requested_network_denominators.frontage_total_metres === null, 'requested-network denominators must be null (unknown)');
  check(ach.road_inventory_by_corridor.red.roads === null && ach.road_inventory_by_corridor.green.roads === null, 'red/green road inventory must be null (unknown)');
  // artifacts referenced by the scope
  for (const k of ['geometry_artifact', 'baseline_artifact']) {
    const a = sc[k];
    check(a && fs.existsSync(rd(a.path)) && sha256File(rd(a.path)) === a.sha256, `scope.${k} hash mismatch`);
  }
  const geo = readJson(rd(sc.geometry_artifact.path));
  check(geo.type === 'FeatureCollection', 'scope.geojson is not a FeatureCollection');
  const featIds = new Set(geo.features.map((f) => String(f.id)));
  check(core.roads.every((r) => featIds.has(r.id)), 'scope.geojson missing road ids');
  check(sc.frontage_intervals.every((f) => featIds.has(f.id)), 'scope.geojson missing frontage interval ids');
  const baseline = readJson(rd(sc.baseline_artifact.path));
  for (const t of ['roads', 'junctions', 'stations', 'metro_structures', 'frontage_intervals', 'businesses', 'displayed_names', 'delivery_locations', 'route_cases', 'review_views']) {
    check(JSON.stringify(baseline[t].map((x) => x.id)) === JSON.stringify(sc[t].map((x) => x.id)), `baseline.${t} ids differ from scope`);
  }
  const cov = readJson(rd('qa/coverage.geojson'));
  check(cov.type === 'FeatureCollection' && cov.features.length === geo.features.length, 'qa/coverage.geojson invalid');
  for (const f of geo.features) for (const g of [f.geometry]) {
    const flat = JSON.stringify(g.coordinates);
    if (/null|NaN/.test(flat)) err(`geojson feature ${f.id} has invalid coordinates`);
  }
  const wm = readJson(rd('public/world/world-manifest.json'));
  check(wm.kind === 'world_manifest' && wm.scope_sha256 === sha256Buf(scopeBuf) && wm.source_snapshot_id === sc.source_snapshot_id, 'world-manifest binding to scope-manifest invalid');
  for (const a of wm.artifacts) check(fs.existsSync(rd(a.path)) && sha256File(rd(a.path)) === a.sha256, `world-manifest artifact hash mismatch: ${a.path}`);
  const reg = readJson(rd('name-registry.json'));
  check(JSON.stringify(reg.records.map((r) => r.id)) === JSON.stringify(core.names.map((n) => n.id)), 'name-registry.json ids differ from core.names');
  const srcm = readJson(rd('sources-manifest.json'));
  for (const s of srcm.sources) {
    const f = path.join(REPO, s.path);
    if (fs.existsSync(f)) check(sha256File(f) === s.sha256, `sources-manifest: ${s.path} sha256 mismatch`);
    if (s.sha256_verified === false) err(`sources-manifest: ${s.path} differs from acquisition manifest hash`);
    check(s.license && s.attribution === '© OpenStreetMap contributors' && s.acquisition_date, `sources-manifest: ${s.path} lacks license/attribution/date`);
  }
  check(srcm.kit.master_prompt_sha256 === '98a0c57adf883fcf82520106c48e8f6388c4844263d5b41e1eaaa6f3808b50e9', 'kit master prompt sha256 differs from expected');
  for (const a of srcm.assets) check(a.sha256 && a.license && a.source_url, `sources-manifest asset ${a.path} incomplete`);

  summary.counts = manifest.counts;
  summary.chunkHashesOk = `${chunkHashOk}/${manifest.chunks.length}`;
  summary.sizesBytes = { core: coreBuf.length, chunks: manifest.chunks.reduce((s, c) => s + c.bytes, 0), manifest: fs.statSync(manifestPath).size };
  summary.roadLengthM = G.r2(totalLen);
  return summary;
}

// ------------------------------------------------------------------ determinism
function hashTree(root) {
  const out = {};
  const files = [
    'scope-manifest.json', 'scope.geojson', 'name-registry.json', 'sources-manifest.json', 'qa/coverage.geojson', 'data/scope-baseline.json', 'data/import-report.json', 'public/world/world-manifest.json',
  ];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(root, p)] = sha256File(p);
    }
  };
  walk(path.join(root, 'public', 'world', 'hyd-uppal-tarnaka'));
  for (const f of files) if (fs.existsSync(path.join(root, f))) out[f] = sha256File(path.join(root, f));
  return out;
}
function determinism() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-det-'));
  const res = { runs: 2, identical: false, files: 0, matchesCommitted: false };
  try {
    const trees = [];
    for (const i of [1, 2]) {
      const out = path.join(tmp, 'run' + i);
      const r = spawnSync(process.execPath, [path.join(HERE, 'import-map.mjs'), '--out-root', out, '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      if (r.status !== 0) {
        err(`determinism: import run ${i} failed: ${r.stderr.slice(0, 300)}`);
        return res;
      }
      trees.push(hashTree(out));
    }
    const a = JSON.stringify(trees[0]);
    res.files = Object.keys(trees[0]).length;
    res.identical = a === JSON.stringify(trees[1]);
    check(res.identical, 'determinism: two fresh imports produced different output hashes');
    const committed = hashTree(ROOT);
    res.matchesCommitted = a === JSON.stringify(committed);
    check(res.matchesCommitted, 'determinism: fresh import differs from the files currently on disk (re-run npm run import:map)');
    if (!res.identical) {
      for (const k of Object.keys(trees[0])) if (trees[0][k] !== trees[1][k]) err(`  differs: ${k}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return res;
}

let summary;
try {
  summary = validate();
} catch (e) {
  err('validator crashed: ' + (e && e.stack ? e.stack : e));
  summary = {};
}
if (CHECK_DET && errors.length === 0) summary.determinism = determinism();
else if (CHECK_DET) summary.determinism = 'skipped (validation errors)';
const result = { ok: errors.length === 0, errorCount: errors.length, warningCount: warnings.length, errors, warnings, summary };
console.log(JSON.stringify(result, null, 2));
process.exit(errors.length === 0 ? 0 : 1);

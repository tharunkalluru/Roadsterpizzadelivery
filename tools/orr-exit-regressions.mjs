// ORR exit/merge barrier audit. This exercises production tile construction and
// shipped source/context copies; it is not a human-style browser traversal.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'orr-exits-'));
const reportAt = process.argv.indexOf('--report'), reportPath = reportAt >= 0 ? resolve(process.argv[reportAt + 1]) : null;
let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: `export * from './game/src/world/expressway'; export {buildTile} from './game/src/world/city'; export {collideWalls} from './game/src/game/physics'; export {initTemplates} from './game/src/core/util'; export {BoxGeometry,RingGeometry,Color} from './game/node_modules/three/build/three.module.js';`, resolveDir: root, loader: 'ts' }, outfile: join(temp, 'audit.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { isORR, isRamp, travelDirection, expresswayBarrierClipper, buildTile, collideWalls, initTemplates, BoxGeometry, RingGeometry, Color } = await import(pathToFileURL(join(temp, 'audit.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const road = (id, pts, extra = {}) => ({ id, seg: id, name: 'Outer Ring Road', cls: 'motorway', w: 17.5, lanes: 4, oneway: 'backward', from: `${id}-a`, to: `${id}-b`, pts, elev: pts.map(() => 3.4), maxspeed: 100, expressway: { controlled: true, ramp: false, throughLanes: 4, laneWidth: 3.5, shoulders: [2.5, 1] }, ...extra });
  const ramp = (id, pts, extra = {}) => road(id, pts, { name: null, cls: 'motorway_link', w: 7, lanes: 2, expressway: { controlled: false, ramp: true, throughLanes: 2 }, ...extra });
  const emptyZone = (roads, i = 0, j = 0) => ({ i, j, roads, nodes: Object.fromEntries(roads.flatMap(e => [[e.from, e.pts[0]], [e.to, e.pts.at(-1)]])), buildings: [], boards: [], furniture: [], areas: [], osm: [] });
  const unique = grid => [...new Set([...grid.values()].flat())];
  const project = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll));
    return { u, distance: Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u), lateral: ((z - a[1]) * dx - (x - a[0]) * dz) / Math.sqrt(ll) };
  };
  const stripAt = (e, i, x, z) => {
    const q = project(x, z, e.pts[i], e.pts[i + 1]);
    // Ignore source-segment end caps: adjacent source strips cover junctions.
    const dx = e.pts[i + 1][0] - e.pts[i][0], dz = e.pts[i + 1][1] - e.pts[i][1], raw = ((x - e.pts[i][0]) * dx + (z - e.pts[i][1]) * dz) / (dx * dx + dz * dz || 1);
    if (raw < -1e-6 || raw > 1 + 1e-6) return null;
    const left = isORR(e) ? e.w / 2 - 2.5 : Math.min(2.5, e.w / 2 - .75), right = isORR(e) ? -e.w / 2 + 1 : -left;
    const offset = -q.lateral * travelDirection(e);
    if (offset < right + .1 || offset > left - .1) return null;
    return (e.elev?.[i] || 0) + ((e.elev?.[i + 1] || 0) - (e.elev?.[i] || 0)) * q.u;
  };
  const crossingWalls = (built, roads) => {
    const bad = [], grid = new Map();
    for (const e of roads) for (let i = 0; i < e.pts.length - 1; i++) {
      const span = { e, i }, a = e.pts[i], b = e.pts[i + 1];
      for (let x = Math.floor((Math.min(a[0], b[0]) - 12) / 60); x <= Math.floor((Math.max(a[0], b[0]) + 12) / 60); x++)
        for (let z = Math.floor((Math.min(a[1], b[1]) - 12) / 60); z <= Math.floor((Math.max(a[1], b[1]) + 12) / 60); z++) {
          const k = `${x},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(span);
        }
    }
    for (const w of unique(built.walls)) {
      const spans = new Set();
      for (let x = Math.floor(Math.min(w.ax, w.bx) / 60); x <= Math.floor(Math.max(w.ax, w.bx) / 60); x++)
        for (let z = Math.floor(Math.min(w.az, w.bz) / 60); z <= Math.floor(Math.max(w.az, w.bz) / 60); z++) for (const s of grid.get(`${x},${z}`) || []) spans.add(s);
      for (const { e, i } of spans) {
      if (Math.max(w.ax, w.bx) < Math.min(e.pts[i][0], e.pts[i + 1][0]) - 12 || Math.min(w.ax, w.bx) > Math.max(e.pts[i][0], e.pts[i + 1][0]) + 12 || Math.max(w.az, w.bz) < Math.min(e.pts[i][1], e.pts[i + 1][1]) - 12 || Math.min(w.az, w.bz) > Math.max(e.pts[i][1], e.pts[i + 1][1]) + 12) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(w.bx - w.ax, w.bz - w.az) / .25));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = w.ax + (w.bx - w.ax) * t, z = w.az + (w.bz - w.az) * t, y = stripAt(e, i, x, z);
        if (y === null || w.y0a + (w.y0b - w.y0a) * t > y + 1.65 || w.y1a + (w.y1b - w.y1a) * t < y + .2) continue;
        bad.push({ road: e.id, barrierRoad: w.expresswayRoad || null, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), kind: w.kind }); break;
      }
      }
    }
    return bad;
  };
  await test('a shallow elevated exit cannot draw or collide with diagonal barriers across through lanes', () => {
    const a = road('in', [[100, 500], [500, 500]], { to: 'join' }), b = road('out', [[500, 500], [900, 500]], { from: 'join' });
    const slip = ramp('exit', [[500, 500], [650, 485], [850, 420]], { from: 'join' });
    const built = buildTile(emptyZone([a, b, slip]), { lowQ: true });
    assert.deepEqual(crossingWalls(built, [a, b]), []);
    assert.ok(unique(built.walls).some(w => w.expresswayRoad === slip.id), 'ramp retains its protection after separating from mainline');
    // Generic concrete ramp parapets have these two colours. ORR ramps use the
    // same clipped steel geometry and collision intervals as their mainline.
    const front = new Color('#d4d0dc').toArray(); let faces = 0;
    for (const b of built.buffers.filter(b => b.mat === 'st')) for (let i = 0; i < b.col.length; i += 9) if (front.every((v, j) => Math.abs(v - b.col[i + j]) < 1e-6)) faces++;
    assert.equal(faces, 0, 'no untrimmed generic concrete ramp wall remains visible');
    for (const lane of [4.5, 1, -2.5, -6]) {
      const from = { x: 475, z: 500 - lane }, to = { x: 525, z: 500 - lane };
      assert.equal(collideWalls(built, from, to, .95, 3.55, 1.4).hit, 0, `physical through lane ${lane} stays open across the diverge`);
    }
    const high = buildTile(emptyZone([a, b, slip]), { lowQ: false });
    const bounds = built => unique(built.walls).filter(w => w.expresswayRoad).map(w => [w.expresswayRoad, w.ax, w.az, w.bx, w.bz, w.y1a, w.y1b]);
    assert.deepEqual(bounds(high), bounds(built), 'quality settings cannot restore a crossing barrier');
  });
  await test('split ramp chains and reverse-direction merges stay open beyond the old45m endpoint rule', () => {
    for (const reverse of [false, true]) {
      const a = road('in', [[100, 500], [500, 500]], { to: 'join' }), b = road('out', [[500, 500], [950, 500]], { from: 'join' });
      const first = ramp('first', [[500, 500], [560, 495]], { from: 'join', to: 'ramp-mid' }), second = ramp('second', [[560, 495], [800, 470]], { from: 'ramp-mid' });
      const roads = [a, b, first, second].map(e => reverse ? { ...e, oneway: 'forward' } : e);
      assert.deepEqual(crossingWalls(buildTile(emptyZone(roads), { lowQ: true }), [roads[0], roads[1]]), []);
    }
  });
  await test('unconnected service roads and grade-separated crossings retain their mainline barrier', () => {
    const main = road('main', [[100, 500], [900, 500]]), lower = ramp('lower', [[500, 100], [500, 900]], { elev: [0, 0] });
    const edge = { ax: 500, az: 491.25, bx: 510, bz: 491.25, ya: 3.4, yb: 3.4 };
    const service = { ...lower, id: 'service', from: main.from, cls: 'service', expressway: undefined };
    assert.deepEqual(expresswayBarrierClipper([main, lower, service])(main, edge).map(s => [s.ax, s.bx]), [[500, 510]]);
  });
  await test('foreign flyover parapets use the same clipped visible and collision geometry at an ORR overlap', () => {
    const main = road('main', [[100, 500], [900, 500]]);
    const flyover = { ...road('flyover', [[400, 450], [600, 550]]), cls: 'secondary', w: 8, lanes: 2, expressway: undefined };
    const built = buildTile(emptyZone([main, flyover]), { lowQ: true });
    assert.deepEqual(crossingWalls(built, [main]), []);
    assert.ok(unique(built.walls).some(w => w.kind === 'parapet'), 'foreign flyover keeps parapets outside the ORR footprint');
    const front = new Color('#d4d0dc').toArray(); let outsideFaces = 0;
    for (const b of built.buffers.filter(b => b.mat === 'st')) for (let i = 0; i < b.pos.length; i += 9) {
      if (!front.every((v, j) => Math.abs(v - b.col[i + j]) < 1e-6)) continue;
      outsideFaces++;
      for (const k of [i, i + 3, i + 6]) {
        const y = stripAt(main, 0, b.pos[k], b.pos[k + 2]);
        assert.ok(y === null || b.pos[k + 1] < y + .1 || b.pos[k + 1] > y + 1.8, 'a visible parapet vertex cannot cross the through carriageway');
      }
    }
    assert.ok(outsideFaces > 0);
  });

  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  const expressways = core.roads.filter(e => isORR(e) || e.expressway?.ramp), junctions = new Map();
  for (const e of expressways) for (const node of [e.from, e.to]) if (node) (junctions.get(node) || junctions.set(node, []).get(node)).push(e);
  const audit = { schema: 1, scope: 'All shipped ORR mainline/ramp road barriers from production low-quality tile construction; source/context copies included. No browser traversal claimed.', sourceEdges: expressways.length, mainlineEdges: expressways.filter(isORR).length, rampEdges: expressways.filter(e => e.expressway?.ramp).length,
    mainlineRampJunctions: [...junctions].filter(([, es]) => es.some(isORR) && es.some(e => e.expressway?.ramp)).length, tilesBuilt: 0, sourceEdgesRendered: 0, wallsChecked: 0, violations: [] };
  // Audit each real tile that owns expressway source segments. Streaming context
  // copies are rebuilt too, rather than assuming its distant owner stays loaded.
  await test('every shipped ORR exit/merge/mainline context copy keeps through corridors free of crossing walls', async () => {
    const byId = new Map(expressways.map(e => [e.id, e])), rendered = new Set();
    for (const pack of core.packs) {
      const data = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', pack.file))));
      for (const tile of Object.values(data.tiles)) {
        const local = tile.roads.filter(e => byId.has(e.id) && e.pts.some((p, i) => i && Math.floor((p[0] + e.pts[i - 1][0]) / 2 / 1000) === tile.i && Math.floor((p[1] + e.pts[i - 1][1]) / 2 / 1000) === tile.j));
        if (!local.length) continue;
        const built = buildTile({ ...tile, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true, landmarks: [] });
        audit.tilesBuilt++; audit.wallsChecked += unique(built.walls).length;
        for (const s of unique(built.surfaceGrid)) if (s.e && byId.has(s.e.id)) rendered.add(s.e.id);
        audit.violations.push(...crossingWalls(built, local).map(v => ({ ...v, tile: [tile.i, tile.j] })));
      }
    }
    audit.sourceEdgesRendered = rendered.size;
    if (reportPath) await writeFile(reportPath, JSON.stringify(audit, null, 2) + '\n');
    console.log(JSON.stringify({ ...audit, violations: audit.violations.length }));
    assert.ok(audit.tilesBuilt > 100 && audit.mainlineRampJunctions > 20, 'all mapped interchanges and streamed carriageway regions are covered');
    assert.equal(rendered.size, expressways.length, 'every shipped mainline/ramp edge is physically rebuilt in its source/context tiles');
    assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.slice(0, 30)));
  });
  console.log(`${checks} ORR exit/merge regression groups passed.`);
} finally { await rm(temp, { recursive: true, force: true }); }

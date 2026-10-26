// Dated construction snapshot: actual route/lane and draw/collision verification.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-construction-'));
let groups = 0;
const test = (name, run) => { run(); groups++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export * from './game/src/world/construction'; export * from './game/src/world/construction-data'; export * from './game/src/world/structure-clearance'; export {RoadGraph} from './game/src/game/roadgraph'; export {buildTile} from './game/src/world/city'; export {trafficPoseClear} from './game/src/game/traffic-path'; export {initTemplates} from './game/src/core/util'; export {BoxGeometry,RingGeometry} from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'check.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { planConstruction, applyConstructionRoads, constructionLane, drawConstruction, CONSTRUCTION_SITES, roadStructureClearance, RoadGraph, buildTile, trafficPoseClear, initTemplates, BoxGeometry, RingGeometry } = await import(pathToFileURL(join(temp, 'check.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  const before = JSON.stringify(core.roads), plan = planConstruction(core.roads, core.origin), roads = applyConstructionRoads(core.roads, plan);
  test('latest dated active sites bind shipped NH163 roads and exclude superseded KBR structures', () => {
    assert.ok(plan.roads.length >= 40, `only${plan.roads.length} bindings`); assert.ok(plan.piers.length > 20);
    assert.ok(plan.sites.some(s => s.id === 'uppal-narapally')); assert.ok(plan.sites.some(s => s.id === 'iiit-junction'));
    assert.ok(!plan.sites.some(s => s.id.includes('kbr'))); assert.equal(CONSTRUCTION_SITES.find(s => s.id.includes('kbr')).status, 'superseded');
    assert.ok(plan.roads.every(r => r.workZone.width === 4.5 && r.workZone.speed === 25 && r.workZone.sources.length >= 2 && r.workZone.checkedAt === '2026-10-26'));
    assert.equal(JSON.stringify(core.roads), before, 'raw source evidence remains unchanged');
    assert.deepEqual(roads.map(e => [e.id, e.pts, e.w, e.elev]), core.roads.map(e => [e.id, e.pts, e.w, e.elev]));
  });
  const graph = new RoadGraph(roads), affected = roads.filter(e => e.workZone), samples = [];
  const simple = affected.find(e => graph.byId.has(e.id) && graph.byId.get(e.id).len > 80);
  test('guidance follows the open lane rather than the barricaded source centre', () => {
    assert.ok(simple); const g = graph.byId.get(simple.id), dir = simple.oneway === 'forward' ? -1 : 1;
    const a = graph.pointAt(g, 20, dir, constructionLane(simple, dir)), b = graph.pointAt(g, g.len - 20, dir, constructionLane(simple, dir));
    const route = graph.route(a.x, a.z, b.x, b.z, { hx: a.hx, hz: a.hz }, 0, 0);
    assert.ok(route?.pts.length >= 2); assert.ok(route.pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[2])));
    for (const p of route.pts) {
      const at = graph.edgeAt(p[0], p[2], 0); if (at?.g !== g) continue;
      const lane = graph.pointAt(g, at.s, 1, simple.workZone.laneOffset);
      assert.ok(Math.hypot(lane.x - p[0], lane.z - p[2]) < .25, 'guide enters fenced work area');
    }
    assert.equal(constructionLane(simple, -1), -constructionLane(simple, 1));
  });
  const tiles = new Map();
  for (const e of affected) for (const p of e.pts) {
    const i = Math.floor(p[0] / 1000), j = Math.floor(p[1] / 1000), key = `${i}_${j}`;
    if (!tiles.has(key)) tiles.set(key, buildTile({ i, j, roads: roads.filter(r => r.pts.some(q => Math.abs(q[0] - (i + .5) * 1000) < 1500 && Math.abs(q[1] - (j + .5) * 1000) < 1500)), nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true, construction: plan }));
  }
  test('construction barriers have matching collisions and preserve a bus-width through lane in every affected tile', () => {
    let walls = 0;
    for (const built of tiles.values()) {
      walls += new Set([...built.walls.values()].flat()).size;
      for (const e of affected) {
        const g = graph.byId.get(e.id); if (!g || g.len < 5) continue;
        const dir = e.oneway === 'forward' ? -1 : 1;
        for (let s = 3; s < g.len - 2; s += 8) {
          const p = graph.pointAt(g, s, dir, constructionLane(e, dir));
          if (Math.floor(p.x / 1000) !== built.i || Math.floor(p.z / 1000) !== built.j) continue;
          assert.ok(trafficPoseClear(built, p, [2.6, 3.4, 10]), `bus lane blocked on${e.id}@${s}`); samples.push([e.id, s]);
        }
      }
    }
    assert.ok([...tiles.values()].reduce((n,t)=>n+(t.workZoneFeatures?.barriers||0),0)>100, 'real construction barrier geometry must be present');
    assert.ok(walls > 150 && samples.length > 500, `walls${walls} samples${samples.length}`);
  });
  test('unfinished piers are spaced, non-drivable and never become a finished flyover route', () => {
    assert.ok(plan.piers.every(p => p.id && Number.isFinite(p.x) && Number.isFinite(p.z)));
    for (let i = 0; i < plan.piers.length; i++) for (let j = i + 1; j < plan.piers.length; j++) assert.ok(Math.hypot(plan.piers[i].x - plan.piers[j].x, plan.piers[i].z - plan.piers[j].z) >= 23);
    assert.equal(graph.edges.filter(g => g.e.workZone).length, affected.length);
    assert.equal(graph.edges.some(g => g.e.id.startsWith('construction_')), false);
    assert.ok([...tiles.values()].every(t => ![...t.surfaceGrid.values()].flat().some(s => s.e?.id.startsWith('construction_'))));
  });
  const iiit = plan.sites.find(s => s.id === 'iiit-junction'), ii = Math.floor(iiit.x / 1000), ij = Math.floor(iiit.z / 1000);
  const pack = core.packs.find(p => p.tiles.some(t => t[0] === ii && t[1] === ij));
  const sourceTile = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', pack.file)))).tiles[`${ii}_${ij}`];
  const iiitBuilt = buildTile({ ...sourceTile, roads: applyConstructionRoads(sourceTile.roads, plan) }, { lowQ: true, metro: core.metro, construction: plan });
  test('the sourced IIIT site actually emits a clear excavation scene instead of an empty catalog entry', () => {
    assert.ok(iiitBuilt.workZoneFeatures.excavationSites > 0, 'IIIT work site has no physical representation');
    assert.ok(iiitBuilt.signs.some(s => s.id.startsWith('work_site_iiit-junction')));
  });
  console.log(`${groups} construction regression groups passed;${plan.roads.length} bound road fragments,${plan.piers.length} open-lane-safe unfinished piers,${samples.length} bus-width samples.`);
} finally { await rm(temp, { recursive: true, force: true }); }

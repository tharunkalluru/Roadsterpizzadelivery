// Offline production geometry and source-pack checks; this is not browser playtesting.
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temporary = await mkdtemp(join(tmpdir(), 'roadster-cinema-'));
let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export{Game}from'./src/game/game';export{World}from'./src/world/world';
    export{planCinemaFront,cinemaPartRing,registerCinemaGroundParts}from'./src/game/cinema-front';
    export{buildTile}from'./src/world/city';export{placeLandmarks}from'./src/world/landmarks';export{placeAirfields}from'./src/world/airfields';
    export{prepareRoadGrades,roadGradePatches,applyRoadGradePatches}from'./src/world/road-grades';
    export{roadStructureClearance}from'./src/world/structure-clearance';export{buildingTransportClearance}from'./src/world/building-clearance';
    export{RoadGraph}from'./src/game/roadgraph';export{initTemplates}from'./src/core/util';
    export{Vector3,BoxGeometry,RingGeometry,Scene,Group}from'three';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temporary, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { Game, World, planCinemaFront, cinemaPartRing, registerCinemaGroundParts, buildTile, placeLandmarks, placeAirfields, prepareRoadGrades, roadGradePatches, applyRoadGradePatches, roadStructureClearance, buildingTransportClearance, RoadGraph, initTemplates, Vector3, BoxGeometry, RingGeometry, Scene, Group } = await import(pathToFileURL(join(temporary, 'production.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const ctx = new Proxy({ measureText: text => ({ width: text.length * 8 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => k in o ? o[k] : () => {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const road = (id, pts, extra = {}) => ({ id, seg: id, pts, w: 3, cls: 'residential', lanes: 1, name: id, oneway: null, elev: null, from: `${id}-a`, to: `${id}-b`, maxspeed: null, ...extra });
  const facade = { c: new Vector3(0, 0, 0), n: new Vector3(0, 0, 1), w: 17, top: 12 };
  test('complete canopy footprint rejects an off-centre side-road clash and retains independently clear posters', () => {
    const e = road('side-road', [[7.5, -20], [7.5, 20]], { w: 1 });
    const p = planCinemaFront(facade, [e]);
    assert.equal(p.groups.canopy, false); assert.equal(p.groups.name, false); assert.equal(p.groups.poster, true);
    assert.ok(p.parts.some(x => x.id === 'post-1' && !x.clear));
    assert.ok(roadStructureClearance([e]).clear({ x: 0, z: 1.6, r: .1 }, 3.525, 3.875), 'centre-only test would miss this overlap');
    assert.equal(planCinemaFront(facade, []).parts.length, 20);
  });
  test('canopy, counter and hoarding height envelopes independently protect elevated roads and metro corridors', () => {
    const raised = road('bridge', [[-30, 0], [30, 0]], { elev: [6, 6], w: 4 });
    const p = planCinemaFront(facade, [raised]);
    assert.equal(p.groups.canopy, true); assert.equal(p.groups.counter, true); assert.equal(p.groups.poster, false);
    const metro = { lines: [{ id: 'red', pts: [[-100, 0], [100, 0]] }], stations: [], deckHeight: 11 };
    const m = planCinemaFront(facade, [], metro); assert.equal(m.groups.poster, false); assert.equal(m.groups.counter, true);
    const rotated = { ...facade, n: new Vector3(1, 0, 0) }, part = planCinemaFront(rotated, []).parts.find(p => p.id === 'counter');
    const ring = cinemaPartRing(rotated, part); assert.ok(Math.abs((ring[0][0] + ring[2][0]) / 2 - .9) < 1e-10);
    assert.ok(Math.abs((ring[0][1] + ring[2][1]) / 2 - 5.1) < 1e-10);
  });
  test('retained solid posts and ticket counters enter global and owner grids and leave with the actual World unload lifecycle', () => {
    const empty = () => new Map(), city = Object.assign(Object.create(World.prototype), { tiles: empty(), group: new Group(), groundGeo: null, rails: empty(), buildingGrid: empty(), surfaceGrid: empty(), landmarkSurfaceGrid: empty(), walls: empty(), obstacles: empty(), byBuilding: empty(), activity: empty(), signs: { remove() {} }, lamps: [], signals: [], busStops: [], walkPaths: [], theatreFacades: empty(), onTileRemoved() {} });
    const built = { buildingGrid: empty(), surfaceGrid: empty(), walls: empty(), obstacles: empty(), signals: [], busStops: [], walkPaths: [], facades: [] }, owner = { key: 'fixture', built, group: new Group(), buildings: [], signs: [], lamps: [] };
    city.tiles.set(owner.key, owner); city.group.add(owner.group);
    registerCinemaGroundParts(facade, planCinemaFront(facade, []), city, owner);
    const solids = new Set([...city.obstacles.values()].flat()), walls = new Set([...city.walls.values()].flat());
    assert.equal(solids.size, 2); assert.equal(walls.size, 4);
    assert.deepEqual(new Set([...built.obstacles.values()].flat()), solids); assert.deepEqual(new Set([...built.walls.values()].flat()), walls);
    city.unload(owner); assert.equal(city.obstacles.size, 0); assert.equal(city.walls.size, 0);
  });
  const c = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  c.roads = prepareRoadGrades(c.roads);
  const grades = roadGradePatches(c.roads), graph = new RoadGraph(c.roads), landmarks = placeLandmarks(c.origin, c.packs.flatMap(p => p.tiles)), airfields = placeAirfields(c.origin);
  const game = Object.assign(Object.create(Game.prototype), { zone: c, graph, theatres: [], paintPoster() {}, engine: { scene: new Scene() }, city: { tiles: new Map(), theatreFacades: new Map(), obstacles: new Map(), walls: new Map() } });
  game.prepareTheatres(); const packs = new Map(), scannedTiles = new Set(), leaseIds = new Set(game.theatres.map(s => s.poi.id));
  // Source stop ownership and facade-building ownership may be neighbouring
  // tiles. Visit every catalogue tile rather than dropping that boundary case.
  for (const poi of c.theatres) {
    const key = poi.tile.join('_'); if (scannedTiles.has(key)) continue; scannedTiles.add(key);
    const p = c.packs.find(p => p.tiles.some(t => t[0] === poi.tile[0] && t[1] === poi.tile[1]));
    if (!packs.has(p.file)) packs.set(p.file, JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', p.file)))));
    const raw = packs.get(p.file).tiles[key], boards = raw.boards.filter(b => b.group === 'cinema'), ids = new Set(boards.map(b => b.building));
    if (!boards.some(b => leaseIds.has(b.id))) continue;
    const built = buildTile({ ...raw, roads: applyRoadGradePatches(raw.roads, grades), boards, buildings: raw.buildings.filter(b => ids.has(b.id)), furniture: [], areas: [], osm: [] }, { lowQ: true, metro: c.metro, landmarks, airfields });
    game.city.tiles.set(key, { built });
    for (const field of ['obstacles', 'walls']) for (const [k, list] of built[field]) game.city[field].set(k, [...(game.city[field].get(k) || []), ...list]);
    const live = new Set([...built.buildingGrid.values()].flat().map(b => b.id));
    for (const f of built.facades) if (live.has(f.building)) game.city.theatreFacades.set(f.id, { ...f, c: new Vector3(...f.c), n: new Vector3(...f.n) });
  }
  const facades = new Map(), buildFront = game.buildCinemaFront;
  game.buildCinemaFront = function(site, f) { facades.set(site.def.key, f); return buildFront.call(this, site, f); };
  game.buildFronts();
  test('all actual lease-front meshes preserve facade orientation and poster material while clearing loaded source roads and metro envelopes', () => {
    assert.equal(game.theatres.length, 22); const fronts = game.theatres.filter(s => s.front); assert.equal(fronts.length, 13);
    const counts = { canopy: 0, name: 0, poster: 0, counter: 0 }, omitted = [];
    for (const site of fronts) {
      const f = facades.get(site.def.key), owner = [...game.city.tiles.values()].find(t => t.built.facades.some(x => x.id === site.poi.id));
      const roads = [...new Map([...graph.nearestEdges(f.c.x, f.c.z, 2).map(g => g.e), ...owner.built.roads].map(e => [e.id, e])).values()];
      const exact = roadStructureClearance(roads), metro = buildingTransportClearance([], c.metro, [f.c.x - 24, f.c.x + 24, f.c.z - 24, f.c.z + 24]);
      const metadata = site.front.userData.cinemaClearance; for (const k of Object.keys(counts)) if (metadata.groups[k]) counts[k]++;
      if (metadata.omitted.length) omitted.push(site.def.key);
      site.front.updateMatrixWorld(true); const normal = new Vector3(0, 0, 1).transformDirection(site.front.matrixWorld);
      assert.ok(normal.distanceTo(f.n.clone().setY(0).normalize()) < 1e-8); assert.ok(site.front.children.some(o => o.material === site.poster));
      for (const mesh of site.front.children) {
        mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox, pts = [];
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
        const center = new Vector3().setFromMatrixPosition(mesh.matrixWorld), bottom = Math.min(...pts.map(p => p.y)), top = Math.max(...pts.map(p => p.y));
        assert.ok(exact.clear({ x: center.x, z: center.z, hx: normal.x, hz: normal.z, hw: (b.max.x - b.min.x) / 2, hl: (b.max.z - b.min.z) / 2 }, bottom, top), `${site.def.key}: emitted mesh overlaps source road`);
        if (b.max.z > b.min.z) {
          const ring = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]].map(([x, z]) => { const p = new Vector3(x, 0, z).applyMatrix4(mesh.matrixWorld); return [p.x, p.z]; });
          assert.ok(metro.clear(ring, bottom, top), `${site.def.key}: emitted mesh overlaps metro`);
        }
      }
    }
    assert.deepEqual(counts, { canopy: 7, name: 12, poster: 13, counter: 8 });
    assert.deepEqual(omitted.sort(), ['mayuri', 'ramakrishna', 'saptagiri', 'shanti', 'sriramana', 'tarakarama']);
    console.log(`Source fixture: ${scannedTiles.size} catalogue tiles scanned, ${game.city.tiles.size} lease-facade tiles built, ${game.theatres.length} lease matches, ${fronts.length} mounted fronts, retained ${JSON.stringify(counts)}.`);
  });
  console.log(`${passed} cinema-front regression groups passed (production geometry, offline).`);
} finally { delete globalThis.document; await rm(temporary, { recursive: true, force: true }); }

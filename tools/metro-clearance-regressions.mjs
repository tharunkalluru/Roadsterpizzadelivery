// Offline production geometry/collider audit; this is not browser driving or a
// surveyed engineering clearance claim. Source IDs/coordinates remain intact.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-clearance-'));
let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: "export * from './game/src/world/structure-clearance'; export * from './game/src/world/metro-geometry'; export { buildTile } from './game/src/world/city'; export { prepareRoadGrades, roadGradePatches, applyRoadGradePatches } from './game/src/world/road-grades'; export { auxiliaryLane, isORR } from './game/src/world/expressway'; export { hash, initTemplates } from './game/src/core/util'; export { BoxGeometry, RingGeometry } from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { bridgeSupportSites, roadStructureClearance, metroCorridors, metroStationFrame, buildTile, prepareRoadGrades, roadGradePatches, applyRoadGradePatches, auxiliaryLane, isORR, hash, initTemplates, BoxGeometry, RingGeometry } = await import(pathToFileURL(join(temp, 'test.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const road = (id, pts, extra = {}) => ({ id, seg: id, name: null, cls: 'primary', w: 9.4, lanes: 2, oneway: null, from: `${id}_a`, to: `${id}_b`, pts, elev: null, maxspeed: 50, ...extra });
  const zone = (roads, i = 0, j = 0) => ({ i, j, roads, nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] });
  const metro = { lines: [{ id: 'red', pts: [[100, 500], [900, 500]] }], stations: [{ id: 'fixture_station', name: 'Fixture Station', te: 'స్టేషన్', p: [500, 500], lines: ['red'] }], pillars: [], deckHeight: 11 };
  const unique = grid => [...new Set([...grid.values()].flat())];
  const safeSupports = (built, roads) => {
    const clear = roadStructureClearance(roads);
    for (const s of built.structureSupports || []) {
      assert.deepEqual(clear.conflicts(s.footprint, s.bottom, s.top), [], `${s.part} ${s.source} blocks road traffic`);
      if (s.cap) assert.deepEqual(clear.conflicts(s.cap.footprint, s.cap.bottom, s.cap.top), [], `${s.part} ${s.source} cap blocks traffic`);
    }
  };
  await test('ordinary densified flyovers retain 24 m pier spacing instead of a pier at each 2 m vertex', () => {
    const points = Array.from({ length: 241 }, (_, i) => [100 + i * 2, 500]);
    const dense = road('dense_primary', points, { elev: points.map(() => 6.8) }), sparse = road('sparse_primary', [[100, 500], [580, 500]], { elev: [6.8, 6.8] });
    const built = [dense, sparse].map(e => buildTile(zone([e]), { lowQ: true }));
    const positions = built.map(b => b.structureSupports.filter(s => s.part === 'bridge').map(s => [s.footprint.x, s.footprint.z]));
    assert.equal(positions[0].length, 20); assert.deepEqual(positions[0], positions[1]);
    for (let i = 1; i < positions[0].length; i++) assert.equal(positions[0][i][0] - positions[0][i - 1][0], 24);
    assert.equal(unique(built[0].surfaceGrid).filter(s => s.kind === 'road').length, 240, 'all driveable deck segments remain');
    safeSupports(built[0], [dense]);
  });
  await test('clearance checks body width, intermediate road heights, sloping intervals and safe overhead caps', () => {
    const cross = road('cross', [[300, 100], [300, 900]], { w: 12 }), body = { x: 300, z: 500, r: 1 };
    assert.equal(roadStructureClearance([cross]).clear(body, 0, 9.8), false);
    assert.equal(roadStructureClearance([{ ...cross, elev: [6.8, 6.8] }]).clear(body, 0, 9.8), false, 'an elevated road can hit a taller metro support');
    assert.equal(roadStructureClearance([{ ...cross, elev: [14, 14] }]).clear(body, 0, 9.8), true, 'a road above a column remains separate');
    assert.equal(roadStructureClearance([cross]).clear({ x: 300, z: 500, hx: 0, hz: 1, hw: 5, hl: 1 }, 5.2, 5.9), true);
    const slope = road('slope', [[300, 490], [300, 510]], { w: 1, elev: [0, 20] });
    assert.equal(roadStructureClearance([slope]).clear({ x: 300, z: 500, r: 2 }, 6, 7), false, 'overlap interval includes the low portion, not just nearest-point height10');
  });
  await test('acceleration and merge lane envelopes also exclude a support beyond the main ORR shoulder', () => {
    const main = road('main', [[100, 500], [210, 500], [320, 500], [430, 500], [540, 500]], { name: 'Outer Ring Road', cls: 'motorway', w: 17.5, oneway: 'backward', expressway: { controlled: true, ramp: false, throughLanes: 4 } });
    const ramp = road('ramp', [[540, 500], [650, 430]], { cls: 'motorway_link', w: 7, from: main.to, expressway: { controlled: false, ramp: true } });
    assert.equal(auxiliaryLane(main, [main, ramp]).at(-1), 3.5);
    const p = { x: 510, z: 510.8, r: .4 };
    assert.equal(roadStructureClearance([main]).clear(p, 0, 6), true);
    assert.equal(roadStructureClearance([main, ramp]).clear(p, 0, 6), false);
  });
  await test('a stair endpoint being clear cannot permit its full run to cut through a road', () => {
    const e = road('stair_crossing', [[550, 510], [550, 525]], { w: 3 }), clear = roadStructureClearance([e]);
    assert.equal(clear.clear({ x: 539, z: 514.5, r: 1.2 }, 0, 6.8), true);
    assert.equal(clear.clear({ x: 547, z: 514.5, hx: 1, hz: 0, hw: 2.2, hl: 8.5 }, 0, 9.2), false);
    const built = buildTile(zone([e]), { lowQ: true, metro }); safeSupports(built, [e]);
    const stairs = built.structureSupports.filter(s => s.part === 'station_stairs');
    assert.ok(stairs.length > 0); assert.ok(stairs.every(s => s.footprint.x < 540 || s.footprint.z > 525 || s.footprint.z < 500));
    for (const b of unique(built.buildingGrid).filter(b => b.id.startsWith('ms_'))) {
      assert.ok(b.ring.every(p => Math.hypot(p[0] - 550, p[1] - 517.5) > 3));
    }
  });
  await test('station concourses and source metro columns clear a road between ground and platforms', () => {
    const e = road('intermediate_flyover', [[400, 500], [600, 500]], { w: 9.4, elev: [6.8, 6.8] });
    const input = { ...metro, pillars: [{ p: [500, 500], h: 0 }] }, built = buildTile(zone([e]), { lowQ: true, metro: input });
    safeSupports(built, [e]);
    assert.equal(built.structureSupports.some(s => s.part === 'metro_pillar'), false);
    assert.ok(built.structureSupports.filter(s => s.part === 'station_concourse').length > 0);
    assert.equal(unique(built.surfaceGrid).filter(s => s.kind === 'pad').length, 2, 'both platforms remain rideable');
    assert.ok(unique(built.surfaceGrid).some(s => s.kind === 'deck' && s.ya === 11.8));
  });
  await test('track names are readable above the canopy in both directions and on both platform faces', () => {
    const built = buildTile(zone([]), { lowQ: true, metro });
    const high = built.signs.filter(s => s.id.startsWith('mst_track_') && !s.id.endsWith('_te'));
    assert.equal(high.length, 4); assert.ok(high.every(s => s.c[1] - s.h / 2 > metro.deckHeight + 9.2));
    for (const d of [-1, 1]) {
      const faces = high.filter(s => s.id.includes(`_${d}_`));
      assert.ok(faces.some(s => s.right[2] > .99) && faces.some(s => s.right[2] < -.99));
    }
    const platform = built.signs.filter(s => s.id.startsWith('mst_platform_'));
    assert.equal(platform.length, 8); assert.ok(platform.every(s => Math.abs(s.c[2] - 500) - s.w / 2 > 4.2));
    const roof = built.signs.filter(s => s.id.startsWith('mst_roof_') && !s.id.endsWith('_te'));
    assert.equal(roof.length, 6); assert.ok(roof.every(s => s.c[1] - s.h / 2 > metro.deckHeight + 9.2));
    assert.deepEqual([...new Set(roof.map(s => Math.round(s.c[0])))].sort((a, b) => a - b), [476, 500, 524]);
    for (const side of [-1, 1]) {
      const ahead = roof.filter(s => (s.c[0] - 500) * side > 0 && s.right[2] * side < 0);
      assert.ok(ahead.some(s => Math.abs(s.c[0] - 500) <= 24.2), 'inside either direction has a readable name within25m');
    }
  });

  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  const prepared = prepareRoadGrades(core.roads), patches = roadGradePatches(prepared), globalClear = roadStructureClearance(prepared);
  const corridors = metroCorridors(core.metro.lines), rtc = core.metro.stations.find(s => s.id === 'st_rtc_cross_roads');
  const packs = new Map();
  const sourceTile = async (i, j) => {
    const p = core.packs.find(p => p.tiles.some(t => t[0] === i && t[1] === j)); assert.ok(p, `source tile ${i}_${j}`);
    if (!packs.has(p.file)) {
      if (packs.size > 3) packs.clear();
      packs.set(p.file, JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city', p.file)))).tiles);
    }
    return packs.get(p.file)[`${i}_${j}`];
  };
  const oldBridgeSites = roads => {
    const out = [];
    for (const e of roads) {
      if (!e.elev || isORR(e) || e.expressway?.ramp) continue;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.floor(len / 24);
        for (let k = 0; k <= steps; k++) {
          const u = steps ? k / steps : .5, h = e.elev[i - 1] + (e.elev[i] - e.elev[i - 1]) * u - .9;
          if (h < 2.5 || (hash(e.id + k) % 3) && k % 2) continue;
          out.push({ source: e.id, x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, h });
        }
      }
    }
    return out;
  };
  await test('actual RTC Cross Roads source tile has sparse safe supports and unchanged station identity/platforms', async () => {
    assert.ok(rtc); const i = Math.floor(rtc.p[0] / 1000), j = Math.floor(rtc.p[1] / 1000), z = await sourceTile(i, j);
    const roads = applyRoadGradePatches(z.roads, patches), built = buildTile({ ...z, roads }, { lowQ: true, metro: core.metro }); safeSupports(built, roads);
    const near = p => Math.hypot(p.x - rtc.p[0], p.z - rtc.p[1]) < 150;
    const before = oldBridgeSites(roads).filter(p => near(p) && p.x >= i * 1000 && p.x < (i + 1) * 1000 && p.z >= j * 1000 && p.z < (j + 1) * 1000);
    const after = built.structureSupports.filter(s => s.part === 'bridge' && near(s.footprint));
    assert.ok(before.length > after.length * 3, 'dense short-span pier wall is removed');
    const originalUnsafe = before.filter(p => !roadStructureClearance(roads).clear({ x: p.x, z: p.z, r: .8 }, 0, p.h));
    assert.ok(originalUnsafe.length > 0); assert.equal(after.some(s => !globalClear.clear(s.footprint, s.bottom, s.top)), false);
    assert.equal(built.signs.filter(s => s.id.startsWith(`mst_track_${rtc.id}_`) && !s.id.endsWith('_te')).length, 4);
    console.log('RTC_CLEARANCE_AUDIT', JSON.stringify({ stationId: rtc.id, sourcePoint: rtc.p, sourceLines: rtc.lines, tile: `${i}_${j}`,
      oldOrdinaryBridgePiersWithin150m: before.length, oldPiersBlockingRoad: originalUnsafe.length, newBridgePiersWithin150m: after.length,
      nearBridgeSourceIds: [...new Set(before.map(p => p.source))], allTileStructurePieces: built.structureSupports.length,
      stationColumns: built.structureSupports.filter(s => s.source === rtc.id && s.part === 'station_column').length,
      stationStairs: built.structureSupports.filter(s => s.source === rtc.id && s.part === 'station_stairs').length,
      sourceBuildings: z.buildings.length, retainedSourceBuildingColliders: unique(built.buildingGrid).filter(b => !b.id.startsWith('ms_') && z.buildings.some(s => s.id === b.id)).length,
      roadConflictsAfter: 0, validation: 'offline sourced tile geometry and colliders; not browser driving' }));
  });
  await test('all shipped metro pillar sites and elevated bridge candidates use full 3D road clearance', () => {
    let bridgeCandidates = 0, bridgeRetained = 0, bridgeOmitted = 0, metroRetained = 0, metroOmitted = 0;
    for (const e of prepared) for (const p of bridgeSupportSites(e)) {
      bridgeCandidates++;
      const body = { x: p.x, z: p.z, r: .8 }, cap = { x: p.x, z: p.z, hx: p.hx, hz: p.hz, hw: Math.min(e.w, 9) / 2, hl: .8 };
      if (globalClear.clear(body, 0, p.h) && globalClear.clear(cap, p.h - .7, p.h)) bridgeRetained++; else bridgeOmitted++;
    }
    for (const p of core.metro.pillars) {
      const [x, z] = p.p, cap = { x, z, hx: Math.sin(-p.h), hz: Math.cos(-p.h), hw: 3.1, hl: 1.2 }, dh = core.metro.deckHeight;
      if (globalClear.clear({ x, z, r: 1.05 }, 0, dh - 1.2) && globalClear.clear(cap, dh - 2.2, dh - 1)) metroRetained++; else metroOmitted++;
    }
    assert.ok(bridgeCandidates > 100 && bridgeRetained > 0 && bridgeOmitted > 0); assert.equal(metroRetained + metroOmitted, core.metro.pillars.length);
    console.log('CITY_STRUCTURE_AUDIT', JSON.stringify({ sourceRoads: prepared.length, bridgeCandidates, bridgeRetained, bridgeOmitted, sourceMetroPillars: core.metro.pillars.length, metroRetained, metroOmitted, modelHeadroomMetres: 4.8, sourceDataRewritten: false }));
  });
  await test('all sourced stations keep rideable platforms and bidirectional above-canopy names with safe modeled supports', async () => {
    let stations = 0, pieces = 0, columns = 0, stairs = 0;
    for (const st of core.metro.stations) {
      assert.ok(metroStationFrame(st, corridors), `${st.id}: source line association`);
      const i = Math.floor(st.p[0] / 1000), j = Math.floor(st.p[1] / 1000), raw = await sourceTile(i, j);
      const near = p => Math.abs(p[0] - st.p[0]) < 170 && Math.abs(p[1] - st.p[1]) < 170;
      const roads = applyRoadGradePatches(raw.roads, patches).filter(e => e.pts.some(near) || e.pts.some((p, k) => k && Math.min(p[0], e.pts[k - 1][0]) < st.p[0] + 170 && Math.max(p[0], e.pts[k - 1][0]) > st.p[0] - 170 && Math.min(p[1], e.pts[k - 1][1]) < st.p[1] + 170 && Math.max(p[1], e.pts[k - 1][1]) > st.p[1] - 170)).map(e => ({ ...e, ctx: 1 }));
      const local = { ...zone(roads, i, j), buildings: raw.buildings.filter(b => b.ring.some(near)) };
      const built = buildTile(local, { lowQ: true, metro: { ...core.metro, stations: [st], pillars: [] } });
      safeSupports(built, roads);
      const signs = built.signs.filter(s => s.id.startsWith(`mst_track_${st.id}_`) && !s.id.endsWith('_te'));
      assert.equal(signs.length, 4, `${st.id}: approaching and departing names`);
      assert.ok(signs.every(s => s.c[1] - s.h / 2 > core.metro.deckHeight + 9.2));
      const roof = built.signs.filter(s => s.id.startsWith(`mst_roof_${st.id}_`) && !s.id.endsWith('_te'));
      assert.equal(roof.length, 6, `${st.id}: repeated inside-station roof names`);
      assert.ok(roof.every(s => s.c[1] - s.h / 2 > core.metro.deckHeight + 9.2));
      assert.equal(unique(built.surfaceGrid).filter(s => s.kind === 'pad').length, 2, `${st.id}: both platform drive surfaces`);
      const own = built.structureSupports.filter(s => s.source === st.id); pieces += own.length; columns += own.filter(s => s.part === 'station_column').length; stairs += own.filter(s => s.part === 'station_stairs').length; stations++;
    }
    assert.equal(stations, core.metro.stations.length);
    console.log('STATION_STRUCTURE_AUDIT', JSON.stringify({ sourceStations: stations, sourceStationTiles: new Set(core.metro.stations.map(s => `${Math.floor(s.p[0] / 1000)}_${Math.floor(s.p[1] / 1000)}`)).size, retainedStationStructurePieces: pieces, retainedColumns: columns, retainedStairs: stairs, aboveCanopyNameFaces: stations * 10, platformNameFaces: stations * 8, roadConflictsAfter: 0, validation: 'offline source road/building station neighborhoods; not citywide browser verification' }));
  });
  console.log(`${count} metro/bridge clearance regression groups passed (offline production code and shipped city data).`);
} finally { await rm(temp, { recursive: true, force: true }); }

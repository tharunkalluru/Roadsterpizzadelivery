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
  await build({ stdin: { contents: "export * from './game/src/world/structure-clearance'; export * from './game/src/world/metro-geometry'; export { buildTile } from './game/src/world/city'; export { prepareRoadGrades, roadGradePatches, applyRoadGradePatches } from './game/src/world/road-grades'; export { auxiliaryLane, isORR } from './game/src/world/expressway'; export { hash, initTemplates, TiledBatch, TPL } from './game/src/core/util'; export { placeLandmarks } from './game/src/world/landmarks'; export { BoxGeometry, RingGeometry, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { bridgeSupportSites, bridgeSupportPlan, roadStructureClearance, metroCorridors, metroStationFrame, metroPlatformAssemblies, metroRuntimeStations, buildTile, prepareRoadGrades, roadGradePatches, applyRoadGradePatches, auxiliaryLane, isORR, hash, initTemplates, TiledBatch, TPL, placeLandmarks, BoxGeometry, RingGeometry, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } = await import(pathToFileURL(join(temp, 'test.mjs')));
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
  await test('split source edges share one equal-height physical pier independent of context order', () => {
    const a = road('a', [[100, 500], [124.5, 500]], { elev: [6.8, 6.8] }), b = road('b', [[124.5, 500], [300, 500]], { elev: [6.8, 6.8], from: a.to });
    const first = buildTile(zone([a, b]), { lowQ: true }), reversed = buildTile(zone([b, a]), { lowQ: true });
    const sites = built => built.structureSupports.filter(s => s.part === 'bridge').map(s => [s.source, s.footprint.x, s.footprint.z, s.sourceIds]).sort((a, b) => a[1] - b[1]);
    assert.deepEqual(sites(first), sites(reversed));
    const shared = first.structureSupports.find(s => s.sourceIds?.length > 1); assert.ok(shared); assert.deepEqual(shared.sourceIds, ['a', 'b']);
    const points = first.structureSupports.filter(s => s.part === 'bridge').map(s => s.footprint);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) assert.ok(Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) >= 1.7);
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
  await test('a widened bridge edge retains its real approach width when the local span reaches ground', () => {
    const narrow = road('narrow_bridge', [[100,500],[150,500],[200,500]], { w: 3, elev: [0,0,6.8] });
    const p = { x:125,z:503.7,r:.75 };
    assert.equal(roadStructureClearance([{ ...narrow,elev:null }]).clear(p,0,5.9),true);
    assert.equal(roadStructureClearance([narrow]).clear(p,0,5.9),false,'the rendered8.4m approach, rather than3m source width, excludes this support');
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
    assert.equal(unique(built.surfaceGrid).filter(s => s.kind === 'pad').length, 26, 'both curved platforms remain rideable');
    assert.ok(unique(built.surfaceGrid).some(s => s.kind === 'deck' && s.ya === 11.8));
  });
  await test('stations have exactly two exterior ends and two inward wall names without track or roof obstructions', () => {
    const built = buildTile(zone([]), { lowQ: true, metro });
    const exterior = built.signs.filter(s => s.id.startsWith('mst_exterior_'));
    const interior = built.signs.filter(s => s.id.startsWith('mst_interior_'));
    assert.equal(exterior.length, 2); assert.equal(interior.length, 2);
    assert.equal(built.signs.filter(s => s.id.startsWith('mst_')).length, 4, 'all legacy duplicate boards are removed');
    for (const s of exterior) {
      const nx = -s.right[2], nz = s.right[0];
      assert.ok(Math.abs(s.c[0] - 500) > 68, 'one board is mounted at each longitudinal end');
      assert.ok(nx * (s.c[0] - 500) + nz * (s.c[2] - 500) > 0, 'end face addresses its approaching road');
      assert.ok(s.c[1] + s.h / 2 < metro.deckHeight - 1.2, 'road-level name sits below the continuous viaduct soffit');
    }
    for (const s of interior) {
      const nx = -s.right[2], nz = s.right[0];
      assert.ok(Math.abs(s.c[2] - 500) > 7, 'platform board stays on outer railing');
      assert.ok(Math.abs(nx) < 1e-9 && nz * (500 - s.c[2]) > 0, 'board faces train windows perpendicular to travel');
      assert.ok(s.c[1] > metro.deckHeight + 2.5 && s.c[1] < metro.deckHeight + 3.5);
      assert.ok(s.w <= 7, 'complete name fits a side-window-scale field of view');
    }
    const benches = unique(built.walls).filter(w => Math.abs(w.y0a - (metro.deckHeight + 1.2)) < 1e-8 && Math.abs(w.y1a - (metro.deckHeight + 2.4)) < 1e-8);
    assert.equal(benches.length, 16, 'four bench footprints have elevated-only collision edges');
    assert.ok(benches.every(w => Math.min(Math.abs(w.az - 500), Math.abs(w.bz - 500)) > 6), 'benches stay outside tracks');
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
  await test('both actual RTC road approaches see the end names below the rendered viaduct rather than behind its girder', async () => {
    const station=core.metro.stations.find(s=>s.id==='st_rtc_cross_roads'),frame=metroStationFrame(station,corridors),meshes=[],signs=[],material=new MeshBasicMaterial({side:DoubleSide});
    const p=(u,v=0)=>new Vector3(frame.cx+frame.hx*u-frame.hz*v,0,frame.cz+frame.hz*u+frame.hx*v);
    // Both approach cameras lie across tile boundaries. Build every touched
    // tile with the actual sourced metro paths and production station builder.
    for(let i=-1;i<=0;i++)for(let j=-1;j<=0;j++){
      const raw=await sourceTile(i,j),roads=applyRoadGradePatches(raw.roads,patches),built=buildTile({...zone(roads,i,j)},{lowQ:true,metro:{...core.metro,stations:[station]}});signs.push(...built.signs);
      for(const b of built.buffers.filter(b=>!['glow','water'].includes(b.mat))){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(b.pos,3));const mesh=new Mesh(g,material);mesh.updateMatrixWorld();meshes.push(mesh);}
    }
    const blocked=(origin,target)=>{const delta=target.clone().sub(origin),distance=delta.length(),ray=new Raycaster(origin,delta.normalize(),.01,distance-.015);return ray.intersectObjects(meshes,false).length>0;};
    for(const end of[-1,1]){
      const sign=signs.find(s=>s.id===`mst_exterior_${station.id}_${end}`);assert.ok(sign);
      const camera=p(end*128);camera.y=5.8;const centre=new Vector3(...sign.c),right=new Vector3(...sign.right);
      const old=p(end*68.8);old.y=core.metro.deckHeight+8.25;console.log('RTC_NAME_SIGHTLINE',JSON.stringify({end,oldHighBlocked:blocked(camera,old),newCentreBlocked:blocked(camera,centre),camera:camera.toArray(),name:centre.toArray()}));if(end===-1)assert.equal(blocked(camera,old),true,'observed old high name really is occluded by rendered geometry');
      for(const x of[-.38,0,.38])for(const y of[-.18,.18]){const target=centre.clone().addScaledVector(right,sign.w*x);target.y+=sign.h*y;assert.equal(blocked(camera,target),false,`RTC end${end}: road-level caption is not hidden by the actual viaduct`);}
    }
    for(const mesh of meshes)mesh.geometry.dispose();material.dispose();
  });
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
    assert.equal(built.signs.filter(s => s.id.startsWith(`mst_exterior_${rtc.id}_`)).length, 2);
    assert.equal(built.signs.filter(s => s.id.startsWith(`mst_interior_${rtc.id}_`)).length, 2);
    console.log('RTC_CLEARANCE_AUDIT', JSON.stringify({ stationId: rtc.id, sourcePoint: rtc.p, sourceLines: rtc.lines, tile: `${i}_${j}`,
      oldOrdinaryBridgePiersWithin150m: before.length, oldPiersBlockingRoad: originalUnsafe.length, newBridgePiersWithin150m: after.length,
      nearBridgeSourceIds: [...new Set(before.map(p => p.source))], allTileStructurePieces: built.structureSupports.length,
      stationColumns: built.structureSupports.filter(s => s.source === rtc.id && s.part === 'station_column').length,
      stationStairs: built.structureSupports.filter(s => s.source === rtc.id && s.part === 'station_stairs').length,
      sourceBuildings: z.buildings.length, retainedSourceBuildingIdentities: new Set(unique(built.buildingGrid).map(b => b.sourceId || b.id).filter(id => z.buildings.some(s => s.id === id))).size, renderedSourceBuildingFragments: unique(built.buildingGrid).filter(b => z.buildings.some(s => s.id === (b.sourceId || b.id))).length,
      roadConflictsAfter: 0, validation: 'offline sourced tile geometry and colliders; not browser driving' }));
  });
  await test('all shipped metro pillar sites and elevated bridge candidates use full 3D road clearance', () => {
    let bridgeCandidates = 0, uniqueBridgeCandidates = 0, bridgeRetained = 0, bridgeOmitted = 0, metroRetained = 0, metroOmitted = 0;
    const bridgePlan = bridgeSupportPlan(prepared);
    for (const e of prepared) bridgeCandidates += bridgeSupportSites(e).length;
    for (const e of prepared) for (const p of bridgePlan.get(e) || []) {
      uniqueBridgeCandidates++;
      const body = { x: p.x, z: p.z, r: .8 }, cap = { x: p.x, z: p.z, hx: p.hx, hz: p.hz, hw: Math.min(e.w, 9) / 2, hl: .8 };
      if (globalClear.clear(body, 0, p.h) && globalClear.clear(cap, p.h - .7, p.h)) bridgeRetained++; else bridgeOmitted++;
    }
    for (const p of core.metro.pillars) {
      const [x, z] = p.p, cap = { x, z, hx: Math.sin(-p.h), hz: Math.cos(-p.h), hw: 3.1, hl: 1.2 }, dh = core.metro.deckHeight;
      if (globalClear.clear({ x, z, r: 1.05 }, 0, dh - 1.2) && globalClear.clear(cap, dh - 2.2, dh - 1)) metroRetained++; else metroOmitted++;
    }
    assert.ok(bridgeCandidates > 100 && bridgeRetained > 0 && bridgeOmitted > 0); assert.equal(metroRetained + metroOmitted, core.metro.pillars.length);
    console.log('CITY_STRUCTURE_AUDIT', JSON.stringify({ sourceRoads: prepared.length, bridgeCandidates, overlappingBridgeSitesMerged: bridgeCandidates - uniqueBridgeCandidates, uniqueBridgeCandidates, bridgeRetained, bridgeOmitted, sourceMetroPillars: core.metro.pillars.length, metroRetained, metroOmitted, modelHeadroomMetres: 4.8, sourceDataRewritten: false }));
  });
  await test('all sourced stations keep curved platforms, two exterior names per site and one interior name per physical platform', async () => {
    let stations = 0, pieces = 0, columns = 0, stairs = 0, offsetNameBoards = 0, physicalAssemblies = 0;
    for (const st of metroRuntimeStations(core.metro.stations)) {
      assert.ok(metroStationFrame(st, corridors), `${st.id}: source line association`);
      const i = Math.floor(st.p[0] / 1000), j = Math.floor(st.p[1] / 1000), raw = await sourceTile(i, j);
      const near = p => Math.abs(p[0] - st.p[0]) < 170 && Math.abs(p[1] - st.p[1]) < 170;
      const roads = applyRoadGradePatches(raw.roads, patches).filter(e => e.pts.some(near) || e.pts.some((p, k) => k && Math.min(p[0], e.pts[k - 1][0]) < st.p[0] + 170 && Math.max(p[0], e.pts[k - 1][0]) > st.p[0] - 170 && Math.min(p[1], e.pts[k - 1][1]) < st.p[1] + 170 && Math.max(p[1], e.pts[k - 1][1]) > st.p[1] - 170)).map(e => ({ ...e, ctx: 1 }));
      const local = { ...zone(roads, i, j), buildings: raw.buildings.filter(b => b.ring.some(near)) };
      const built = buildTile(local, { lowQ: true, metro: { ...core.metro, stations: [st], pillars: [] } });
      safeSupports(built, roads);
      const exterior = built.signs.filter(s => s.id.startsWith(`mst_exterior_${st.id}_`));
      const assemblies=metroPlatformAssemblies([st],corridors,core.metro.deckHeight);physicalAssemblies+=assemblies.length;
      const interior = built.signs.filter(s => assemblies.some(a=>s.id.startsWith(`mst_interior_${a.key}_`)));
      assert.equal(exterior.length, 2, `${st.id}: only two exterior end names`);
      assert.equal(interior.length, assemblies.length*2, `${st.id}: one interior name per actual platform`);
      assert.equal(built.signs.filter(s => s.id.startsWith('mst_')).length, 2+assemblies.length*2, `${st.id}: no duplicate legacy signs`);
      const primary=assemblies.find(a=>!a.secondary),frame=primary.frame,clear=roadStructureClearance(roads);
      for(const s of exterior){const fx=-s.right[2],fz=s.right[0],x=s.c[0]-fx*.1,z=s.c[2]-fz*.1,y=s.c[1]-.15;
        assert.deepEqual(clear.conflicts({x,z,hx:frame.hx,hz:frame.hz,hw:8,hl:.12},y-1.125,y+1.125),[],`${st.id}: hanging name plate leaves actual road headroom`);
        assert.ok(y+1.125<primary.deckHeight-1.2,'backing remains below the rendered soffit');
        if(Math.abs(-(x-frame.cx)*frame.hz+(z-frame.cz)*frame.hx)>.1)offsetNameBoards++;
      }
      assert.equal(unique(built.surfaceGrid).filter(s => s.kind === 'pad').length, assemblies.length*26, `${st.id}: all physical platform drive surfaces`);
      const own = built.structureSupports.filter(s => s.source === st.id); pieces += own.length; columns += own.filter(s => s.part === 'station_column').length; stairs += own.filter(s => s.part === 'station_stairs').length; stations++;
    }
    assert.equal(stations, 56);
    console.log('STATION_STRUCTURE_AUDIT', JSON.stringify({ sourceStations: core.metro.stations.length, activeStationSites: stations, retainedAliases: 1, sourceStationTiles: new Set(core.metro.stations.map(s => `${Math.floor(s.p[0] / 1000)}_${Math.floor(s.p[1] / 1000)}`)).size, retainedStationStructurePieces: pieces, retainedColumns: columns, retainedStairs: stairs, exteriorNameBoards: stations * 2, interiorNameBoards: physicalAssemblies * 2, physicalCorridorAssemblies: physicalAssemblies, kerbOffsetExteriorBoards:offsetNameBoards, exteriorBoardHeadroomConflicts:0, roadConflictsAfter: 0, validation: 'offline source road/building station neighborhoods; not citywide browser verification' }));
  });

  // Observe actual production draw calls rather than trusting support metadata.
  const capture = (z, opts) => {
    const bodies = [], caps = [], add = TiledBatch.prototype.add, box = TiledBatch.prototype.box;
    TiledBatch.prototype.add = function(t, x, y, z, sx, sy, sz, ...rest) {
      if (t === TPL.cyl && Math.abs(sx - .75) < 1e-8 && Math.abs(sz - .75) < 1e-8 && sy >= 2.5) bodies.push({ x, z, r: sx, bottom: y - sy / 2, top: y + sy / 2 });
      return add.call(this, t, x, y, z, sx, sy, sz, ...rest);
    };
    TiledBatch.prototype.box = function(x, y, z, sx, sy, sz, color, opts) {
      if (Math.abs(sy - .7) < 1e-8 && Math.abs(sz - 1.6) < 1e-8 && sx <= 9) {
        const a = opts?.ry || 0, hx = Math.sin(a), hz = Math.cos(a);
        caps.push({ x, z, bottom: y - sy / 2, top: y + sy / 2, ring: [[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v]) => [x + hz * u * sx / 2 + hx * v * sz / 2, z - hx * u * sx / 2 + hz * v * sz / 2]) });
      }
      return box.call(this, x, y, z, sx, sy, sz, color, opts);
    };
    try { return { built: buildTile(z, opts), bodies, caps }; }
    finally { TiledBatch.prototype.add = add; TiledBatch.prototype.box = box; }
  };
  const landmarks = placeLandmarks(core.origin, core.packs.flatMap(p => p.tiles)), ikea = landmarks.find(l => l.id === 'ikea');
  const crossing = [-12720.799447513811, -3690.6832412523017]; // Derived intersection of shipped road IDs below, not a placement patch.
  await test('four independently reproduced source pier/approach intersections stay clear without removing their roads', async () => {
    const cases = [
      { tile:[-10,-21], road:'3aa90226-25e_0', points:[[-9189.147893429536,-20756.17335994058],[-9195.88367176249,-20765.74061740962]] },
      { tile:[-13,17], road:'b19a94b6-4a5_0', points:[[-12700.577298421751,17373.794355929112]] },
      { tile:[-20,-9], road:'d99323ba-b75_0', points:[[-19726.85870127643,-8116.333397178416]] },
    ];
    for(const c of cases){const raw=await sourceTile(...c.tile),roads=applyRoadGradePatches(raw.roads,patches),observed=capture(zone(roads,...c.tile),{lowQ:true});
      assert.ok(unique(observed.built.surfaceGrid).some(s=>s.e?.id===c.road&&s.roadQuad),`${c.road}: original road surface retained`);
      for(const[x,z]of c.points)assert.ok(observed.bodies.every(p=>Math.hypot(p.x-x,p.z-z)>.2),`${c.road}: actual obstructing cylinder removed`);
    }
  });
  await test('actual IKEA/Mindspace draw calls keep the sourced junction open in raw and prepared tile geometry', async () => {
    assert.ok(ikea); const z = await sourceTile(-13, -4), results = [];
    for (const [label, roads] of [['shipped', z.roads], ['prepared', applyRoadGradePatches(z.roads, patches)]]) {
      assert.equal(new Set(roads.map(e => e.id)).size, roads.length, 'no duplicate context road IDs');
      const observed = capture({ ...z, roads }, { lowQ: true, metro: core.metro, landmarks });
      const named = observed.built.structureSupports.filter(s => s.part === 'bridge');
      assert.equal(observed.bodies.length, named.length, 'every tall bridge cylinder must have audited source metadata');
      const near = observed.bodies.filter(p => Math.hypot(p.x - crossing[0], p.z - crossing[1]) < 150);
      const blocked = near.filter(p => Math.hypot(p.x - crossing[0], p.z - crossing[1]) < 18);
      assert.equal(blocked.length, 0, 'the actual cross-junction driving corridor is open');
      for (const e of roads.filter(e => e.name === 'Mindspace Junction Flyover')) {
        const own = named.filter(s => s.source === e.id);
        for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) assert.ok(Math.hypot(own[i].footprint.x - own[j].footprint.x, own[i].footprint.z - own[j].footprint.z) > 20, `${e.id}: no short-span pier wall`);
      }
      safeSupports(observed.built, roads);
      results.push({ geometry: label, actualBridgeCylinderDraws: observed.bodies.length, bridgeCylindersWithin150m: near.length, bridgeCylindersWithin18mOfCrossing: blocked.length });
    }
    console.log('IKEA_RENDER_AUDIT', JSON.stringify({ sourceLandmark: { id: ikea.id, x: ikea.x, z: ikea.z }, tile: '-13_-4', bridgeSourceIds: ['740da8ae-7e2_0','881121ae-ac7_0'], groundSourceId: 'a4395de0-7c4_0', crossing, results, screenshotDenseWallReproducedInCurrentBuilder: false }));
  });

  if (process.argv.includes('--full-bridge-audit')) await test('all playable bridge tiles have unique actual piers and independent rendered-road clearance', async () => {
    const wanted = new Set(), available = new Set(core.packs.flatMap(p => p.tiles.map(t => t.join('_')))), elevated = prepared.filter(e => e.elev?.some(y => y > 1.2));
    for (const e of elevated) for (let i = 1; i < e.pts.length; i++) {
      if (Math.max(e.elev[i - 1], e.elev[i]) <= 1.2) continue;
      const a=e.pts[i-1],b=e.pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/250));
      for(let k=0;k<=n;k++){const key=`${Math.floor((a[0]+(b[0]-a[0])*k/n)/1000)}_${Math.floor((a[1]+(b[1]-a[1])*k/n)/1000)}`;if(available.has(key))wanted.add(key);}
    }
    // Tile packs retain additional source roads absent from the navigation
    // core. Scan every shipped pack so a tile-only bridge cannot evade audit.
    const patchById=new Map(patches.map(p=>[p.id,p]));let scannedSourceTiles=0;
    for(const pack of core.packs){
      const decoded=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city',pack.file)))).tiles;
      for(const[key,z]of Object.entries(decoded)){
        scannedSourceTiles++;const raised=z.roads.some(e=>{const p=patchById.get(e.id),pts=p?.pts||e.pts,ys=p?p.elev:e.elev;if(!ys?.some(y=>y>1.2))return false;for(let n=1;n<pts.length;n++){if(Math.max(ys[n-1],ys[n])<=1.2)continue;const x=(pts[n-1][0]+pts[n][0])/2,v=(pts[n-1][1]+pts[n][1])/2;if(Math.floor(x/1000)===z.i&&Math.floor(v/1000)===z.j)return true;}return false;});if(raised)wanted.add(key);
      }
    }
    const actualBodies=[],actualCaps=[],roadGrid=new Map(),seen=new Set(),sourceIds=new Set(),sourceById=new Map(prepared.map(e=>[e.id,e]));let tiles=0,mismatchedCopies=0,renderedRoadSegments=0;const mismatches=[],tileOnlyElevatedIds=new Set();
    const index = quad => {
      const xs=quad.map(p=>p[0]),zs=quad.map(p=>p[2]);for(let i=Math.floor(Math.min(...xs)/50);i<=Math.floor(Math.max(...xs)/50);i++)for(let j=Math.floor(Math.min(...zs)/50);j<=Math.floor(Math.max(...zs)/50);j++){const k=`${i},${j}`;(roadGrid.get(k)||roadGrid.set(k,[]).get(k)).push(quad);}
    };
    for(const key of [...wanted].sort()){
      const[i,j]=key.split('_').map(Number),raw=await sourceTile(i,j),roads=applyRoadGradePatches(raw.roads,patches);
      for(const e of roads.filter(e=>e.elev?.some(y=>y>1.2))){const original=sourceById.get(e.id);if(!original){tileOnlyElevatedIds.add(e.id);continue;}if(JSON.stringify(e.pts)!==JSON.stringify(original.pts)||JSON.stringify(e.elev)!==JSON.stringify(original.elev)){mismatchedCopies++;mismatches.push({tile:key,id:e.id,name:e.name,points:e.pts.length,corePoints:original?.pts.length,elev:e.elev?.slice(0,4),coreElev:original?.elev?.slice(0,4)});}}
      const result=capture({ ...zone(roads,i,j) },{lowQ:true});
      assert.equal(result.bodies.length,result.built.structureSupports.filter(s=>s.part==='bridge').length,`${key}: unaccounted cylinder extrusion`);
      for(const p of result.bodies){const id=`${p.x.toFixed(3)},${p.z.toFixed(3)},${p.top.toFixed(3)}`;assert.ok(!seen.has(id),`${key}: repeated actual support across source or tile boundary ${id}`);seen.add(id);p.source=result.built.structureSupports.find(s=>s.part==='bridge'&&Math.hypot(s.footprint.x-p.x,s.footprint.z-p.z)<.0001)?.source;p.tile=key;actualBodies.push(p);}
      actualCaps.push(...result.caps);for(const p of result.built.structureSupports.filter(s=>s.part==='bridge'))sourceIds.add(p.source);
      for(const s of unique(result.built.surfaceGrid)){if(s.kind==='road'&&s.roadQuad){const q=s.roadQuad.map(p=>p.slice());q.roadId=s.e?.id;q.tile=key;index(q);renderedRoadSegments++;}}
      tiles++;
    }
    // Barycentric height on the actual rendered road triangles, independently
    // of roadStructureClearance's capsule/interval implementation.
    const height=(q,x,z)=>{for(const [ia,ib,ic]of[[0,1,2],[0,2,3]]){const a=q[ia],b=q[ib],c=q[ic],d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-7)return u*a[1]+v*b[1]+w*c[1];}return null;};
    const inside=(ring,x,z)=>{let v=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]))v=!v;}return v;};
    const near=(x,z)=>{const out=new Set(),i=Math.floor(x/50),j=Math.floor(z/50);for(let a=i-1;a<=i+1;a++)for(let b=j-1;b<=j+1;b++)for(const q of roadGrid.get(`${a},${b}`)||[])out.add(q);return out;};
    const conflicts=[];
    for(const p of actualBodies)for(const q of near(p.x,p.z)){
      const points=[[p.x,p.z],...Array.from({length:16},(_,i)=>[p.x+p.r*Math.cos(i*Math.PI/8),p.z+p.r*Math.sin(i*Math.PI/8)])];
      for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[2])*dz)/(dx*dx+dz*dz||1))),x=a[0]+dx*t,z=a[2]+dz*t;if(Math.hypot(x-p.x,z-p.z)<=p.r)points.push([x,z]);}
      if(points.some(([x,z])=>{const y=height(q,x,z);return y!==null&&p.top>y+.08&&p.bottom<y+4.8;}))conflicts.push({part:'body',p:[p.x,p.z],source:p.source,supportTile:p.tile,roadId:q.roadId,roadTile:q.tile,roadQuad:q});
    }
    for(const p of actualCaps)for(const q of near(p.x,p.z)){
      const points=[...p.ring,...q.filter(v=>inside(p.ring,v[0],v[2])).map(v=>[v[0],v[2]])];
      for(let i=0;i<4;i++)for(let j=0;j<4;j++){const a=p.ring[i],b=p.ring[(i+1)%4],c=q[j],d=q[(j+1)%4],ax=b[0]-a[0],az=b[1]-a[1],bx=d[0]-c[0],bz=d[2]-c[2],det=ax*bz-az*bx;if(Math.abs(det)<1e-8)continue;const t=((c[0]-a[0])*bz-(c[2]-a[1])*bx)/det,u=((c[0]-a[0])*az-(c[2]-a[1])*ax)/det;if(t>=0&&t<=1&&u>=0&&u<=1)points.push([a[0]+ax*t,a[1]+az*t]);}
      if(points.some(([x,z])=>{const y=height(q,x,z);return y!==null&&p.top>y+.08&&p.bottom<y+4.8;}))conflicts.push({part:'cap',p:[p.x,p.z]});
    }
    console.log('ALL_BRIDGE_RENDER_AUDIT',JSON.stringify({sourceElevatedEdges:elevated.length,scannedSourcePacks:core.packs.length,scannedSourceTiles,playableSourceTiles:tiles,retainedBridgeSourceEdges:sourceIds.size,actualPierBodies:actualBodies.length,actualPierCaps:actualCaps.length,renderedRoadSegments,mismatchedKnownCoreTileCopies:mismatchedCopies,tileOnlyElevatedSourceEdges:tileOnlyElevatedIds.size,actualRoadTriangleConflicts:conflicts.length,firstMismatches:mismatches.slice(0,12),firstConflicts:conflicts.slice(0,8),validation:'offline production draw calls and independently intersected rendered road triangles; not citywide browser driving'}));
    assert.equal(mismatchedCopies,0);assert.deepEqual(conflicts,[]);
  });
  console.log(`${count} metro/bridge clearance regression groups passed (offline production code and shipped city data).`);
} finally { await rm(temp, { recursive: true, force: true }); }

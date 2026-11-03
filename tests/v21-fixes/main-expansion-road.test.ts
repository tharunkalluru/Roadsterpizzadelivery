import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildTile, type Surface } from '../../src/world/city';
import { initTemplates } from '../../src/core/util';
import { supportAt, roofUnder } from '../../src/game/physics';
import { clipRoadQuadToTile, roadQuadHeight } from '../../src/world/road-surface';
import { metroFlightClearance } from '../../src/world/metro-flight-clearance';
import { metroCorridors, metroPlatformAssemblies } from '../../src/world/metro-geometry';
import { stationVaultHeight } from '../../src/world/station-presentation';
import { roadStructureClearance } from '../../src/world/structure-clearance';
import { makeRailwayNetwork } from '../../src/world/railway-geometry';
import { testDriver, packedDriveWorld } from '../fixtures/packed-drive-world';
import type { CoreData, RoadEdge } from '../../src/world/types';

const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const road = (id: string, pts: [number, number][], elev: number[] | null = null, extra: Partial<RoadEdge> = {}): RoadEdge => ({ id, seg: id, name: id, cls: 'primary', w: 12, lanes: 4, oneway: 'backward', from: id + '-a', to: id + '-b', pts, elev, maxspeed: null, ...extra });
const emptyCity = (): any => ({ surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map(), movingRail: [], railwayWalls: [], landmarkSurfaceGrid: new Map(), waterGrid: new Map() });
const input = { throttle: 1, brake: 0, steer: 0, flyPressed: false, boost: false };
function built(roads: RoadEdge[], lowQ = true, i = 0, j = 0) { initTemplates(); return buildTile({ i, j, roads, nodes: Object.fromEntries(roads.flatMap(e => [[e.from, e.pts[0]], [e.to, e.pts[e.pts.length - 1]]])), buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ, railway: makeRailwayNetwork([]) }); }
const unique = <T>(grid: Map<string, T[]>) => [...new Set([...grid.values()].flat())];

test('all actual metro assemblies, including elevated Green interchanges, contribute their full canopy to flight clearance', t => {
  const city = emptyCity(); city.metroFlightClearance = metroFlightClearance(core.metro);
  const assemblies = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight);
  let highGreen = 0, samples = 0;
  for (const a of assemblies) for (const u of [-66, 0, 66]) for (const v of [-12.9, -6, 0, 6, 12.9]) {
    const { cx, cz, hx, hz } = a.frame, x = cx + hx * u - hz * v, z = cz + hz * u + hx * v;
    assert.ok(roofUnder(city, [[x, z]]) >= stationVaultHeight(v, a.deckHeight) + .19, `${a.key}/${u}/${v}`);
    if (a.lineId === 'green' && a.deckHeight > 20) highGreen++;
    samples++;
  }
  assert.ok(highGreen > 0); t.diagnostic(JSON.stringify({ assemblies: assemblies.length, canopySamples: samples, highGreenSamples: highGreen }));
});

test('flight anticipates high Green station canopy at 30/60/90/120Hz and bounded hitch cadence without changing speed cap', () => {
  const a = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight).find(a => a.lineId === 'green' && a.deckHeight > 20)!;
  const { cx, cz, hx, hz } = a.frame, city = emptyCity(); city.metroFlightClearance = metroFlightClearance(core.metro);
  for (const hzRate of [30, 60, 90, 120, 0]) for (const direction of [-1, 1]) {
    const p = testDriver(city); p.pos.set(cx - hx * 230 * direction, 24, cz - hz * 230 * direction); p.yaw = Math.atan2(-hx * direction, -hz * direction); p.speed = 160 / 3.6; p.flying = true;
    let elapsed = 0, frames = 0, covered = 0;
    while (covered < 300 && frames < 3000) {
      const dt = hzRate ? 1 / hzRate : frames % 17 === 0 ? .05 : 1 / 60;
      p.update(dt, input, elapsed += dt); frames++;
      const u = (p.pos.x - cx) * hx + (p.pos.z - cz) * hz;
      covered = 230 + u * direction;
      if (Math.abs(u) < 66) assert.ok(p.pos.y - .55 > stationVaultHeight(0, a.deckHeight) + 1, `canopy contact ${hzRate}/${direction}: ${p.pos.y}`);
      assert.ok(p.speed <= 160 / 3.6 + 1e-8); assert.equal(p.flying, true);
    }
    assert.ok(covered >= 300);
  }
});

test('static deck flight clearance does not turn roofs/wires into invented landing surfaces', () => {
  const city = emptyCity(); city.metroFlightClearance = metroFlightClearance(core.metro);
  const a = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight)[0], { cx: x, cz: z } = a.frame;
  assert.ok(roofUnder(city, [[x, z]]) > 10);
  assert.equal(supportAt(city, x, z, 60).kind, 'ground');
  const deck: Surface = { e: null, i: 0, ax: x - 5, az: z, bx: x + 5, bz: z, ya: a.deckHeight + .8, yb: a.deckHeight + .8, hw: 4.2, kind: 'deck' };
  city.surfaceGrid.set(`${Math.floor(x / 30)},${Math.floor(z / 30)}`, [deck]);
  assert.equal(supportAt(city, x, z, deck.ya).kind, 'deck');
  assert.equal(supportAt(city, x, z, 0).kind, 'ground');
});

test('static elevated road triangles count for flight even without any building', () => {
  const tile = built([road('high-flyover', [[100, 500], [700, 500]], [32, 32])]);
  assert.ok(roofUnder({ ...emptyCity(), surfaceGrid: tile.surfaceGrid }, [[350, 500]]) >= 32);
  assert.equal(roofUnder({ ...emptyCity(), surfaceGrid: tile.surfaceGrid }, [[750, 500]]), 0, 'finite surface has no invisible end extension');
});

test('an elevated support seam cannot accept a lower road through a matching ID or shared remote junction', () => {
  for (const related of ['same-id', 'shared-node', 'unrelated']) for (const hzRate of [30, 60, 90, 120, 0]) {
    const upper = road('upper', [[100, 500], [150, 500]], [8, 8]), lower = road(related === 'same-id' ? 'upper' : 'lower', [[150, 500], [300, 500]], null, related === 'shared-node' ? { from: upper.to } : {});
    const tile = built([upper, lower]), city = { ...emptyCity(), surfaceGrid: tile.surfaceGrid }, p = testDriver(city);
    p.place(149.8, 500, -Math.PI / 2, 8); p.speed = 120 / 3.6;
    for (let frame = 0; frame < 8; frame++) p.update(hzRate ? 1 / hzRate : .05, input, frame / 60);
    assert.ok(p.pos.x < 150, `${related}/${hzRate} left finite deck`); assert.ok(Math.abs(p.pos.y - 8.55) < 1e-8); assert.equal(p.vy, 0); assert.equal(p.onRoad, true);
  }
});

test('continuous raised ramps traverse tile boundaries in both directions at 30/60/90/120Hz and hitch cadence', () => {
  const e = road('seam-ramp', [[850, 500], [970, 500], [1000, 500], [1100, 500], [1250, 500]], [0, 6, 7.5, 12.5, 12.5]);
  const a = built([e], true, 0), b = built([{ ...e, ctx: 1 } as RoadEdge], true, 1), city = emptyCity();
  for (const tile of [a, b]) for (const [key, surfaces] of tile.surfaceGrid) city.surfaceGrid.set(key, [...(city.surfaceGrid.get(key) || []), ...surfaces]);
  for (const rate of [30, 60, 90, 120, 0]) for (const direction of [-1, 1]) for (const lateral of [-2, 0, 2]) {
    const p = testDriver(city), start = direction === 1 ? 940 : 1100;
    p.place(start, 500 + lateral, direction === 1 ? -Math.PI / 2 : Math.PI / 2, 20); p.speed = 120 / 3.6;
    let frame = 0, travel = 0;
    while (travel < 130 && frame < 1000) {
      const dt = rate ? 1 / rate : frame % 13 === 0 ? .05 : 1 / 60;
      p.update(dt, input, frame++ / 60); travel = (p.pos.x - start) * direction;
      const support = supportAt(city, p.pos.x, p.pos.z, p.pos.y - .55, true);
      assert.equal(p.onRoad, true); assert.ok(Math.abs(p.pos.y - support.y - .55) < 1e-7); assert.equal(p.vy, 0); assert.equal(p.bump, 0);
    }
    assert.ok(travel >= 130, `${rate}/${direction}/${lateral}`);
  }
});

test('road direction boards remain entirely outside carriageways on curved approaches and across other road levels', () => {
  const roads = [road('incoming', [[100, 500], [460, 500], [500, 550]], null, { to: 'junction' }), road('left', [[500, 550], [650, 550]], null, { from: 'junction' }), road('right', [[500, 550], [500, 750]], null, { from: 'junction' })];
  for (const lowQ of [true, false]) {
    const tile = built(roads, lowQ), clear = roadStructureClearance(roads), signs = tile.signs.filter(s => s.id.startsWith('dir_'));
    assert.ok(signs.length > 0);
    for (const sign of signs) {
      const [x, y, z] = sign.c, hx = sign.right[2], hz = -sign.right[0];
      assert.equal(clear.clear({ x, z, hx, hz, hw: sign.w / 2 + .1, hl: .1 }, y - sign.h / 2, y + sign.h / 2), true, sign.id);
    }
    for (const obstacle of unique(tile.obstacles)) assert.equal(clear.clear({ x: obstacle.x, z: obstacle.z, r: obstacle.r }, obstacle.bottom || 0, obstacle.top), true);
  }
});

test('long ground context roads retain finite local asphalt and tyre support with their owner tile absent', () => {
  const e = road('long-context', [[100, 500], [2200, 500], [3400, 550]], null), snapshot = JSON.stringify(e);
  for (const lowQ of [true, false]) {
    const tile = built([{ ...e, ctx: 1 } as RoadEdge], lowQ, 2, 0), city = { ...emptyCity(), surfaceGrid: tile.surfaceGrid, walls: tile.walls, obstacles: tile.obstacles };
    assert.ok(tile.buffers.some(b => b.mat === 'road'));
    const surfaces = unique(tile.surfaceGrid).filter(s => s.e?.id === e.id);
    assert.ok(surfaces.length > 0);
    for (const s of surfaces) for (const point of s.roadQuad!) assert.ok(point[0] >= 2000 - 1e-7 && point[0] <= 3000 + 1e-7 && point[2] >= 0 && point[2] <= 1000, 'context road cannot duplicate the full distant source edge');
    for (const rate of [30, 60, 90, 120, 0]) for (const direction of [-1, 1]) {
      const p = testDriver(city), x = direction === 1 ? 2020 : 2160; p.place(x, 500, direction === 1 ? -Math.PI / 2 : Math.PI / 2); p.speed = 120 / 3.6;
      let travel = 0, frame = 0;
      while (travel < 100 && frame < 1000) { p.update(rate ? 1 / rate : frame % 11 === 0 ? .05 : 1 / 60, input, frame++ / 60); travel = (p.pos.x - x) * direction; assert.equal(p.onRoad, true); assert.ok(Math.abs(p.pos.y - .55) < 1e-8); }
      assert.ok(travel >= 100);
    }
    assert.equal(supportAt(city, 1500, 500, 0).onRoad, false, 'unloaded remote part is not a ghost support');
    for (const path of tile.walkPaths) for (const [x, z] of path.pts) assert.ok(x >= 2000 - 1e-7 && x <= 3000 + 1e-7 && z >= 0 && z <= 1000);
  }
  assert.equal(JSON.stringify(e), snapshot, 'source alignment and graph links stay unchanged');
});

test('tile clipping preserves the original non-planar road triangles and exact area without gaps at a tile edge', () => {
  const original: import('../../src/world/road-surface').RoadQuad = [[950, 8, 450], [1050, 10, 450], [1052, 11, 550], [950, 8, 550]];
  const a = clipRoadQuadToTile(original, 0, 0), b = clipRoadQuadToTile(original, 1, 0);
  for (let x = 951; x < 1050; x += .75) for (let z = 451; z < 550; z += 2.5) {
    const expected = roadQuadHeight(original, x, z); if (expected === null) continue;
    const actual = (x < 1000 ? a : b).map(q => roadQuadHeight(q, x, z)).find(y => y !== null);
    assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-7, `${x}/${z}: ${actual}/${expected}`);
  }
});

test('shipped far-end context tile renders the real 4.2km trunk with its distant source-owner absent', t => {
  const i = -22, j = 8, pack = core.packs.find(p => p.tiles.some(tile => tile[0] === i && tile[1] === j))!;
  const zone = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()).tiles[`${i}_${j}`];
  const e = zone.roads.find(e => e.id === '2acaa4cb-b1e_0'); assert.ok(e?.ctx);
  const tile = buildTile(zone, { lowQ: true, railway: makeRailwayNetwork([]) }), city = { ...emptyCity(), surfaceGrid: tile.surfaceGrid };
  let samples = 0;
  for (const s of unique(tile.surfaceGrid).filter(s => s.e?.id === e.id)) {
    const q = s.roadQuad!, x = (q[0][0] + q[1][0] + q[2][0]) / 3, z = (q[0][2] + q[1][2] + q[2][2]) / 3;
    assert.equal(supportAt(city, x, z, 0, true).onRoad, true); assert.ok(x >= -22000 && x <= -21000); samples++;
  }
  assert.ok(samples > 0, 'ordinary context cannot depend on the distant -24_9 owner tile');
  t.diagnostic(JSON.stringify({ sourceId: e.id, sourceVertices: e.pts.length, renderedLocalTriangles: samples, loadedTile: '-22_8', absentOwner: '-24_9' }));
});

test('actual packed Rasoolpura flyover ribbon and tile seam support agree at centre and usable lane offsets', t => {
  const f = packedDriveWorld({ x: -2145.5, z: -4129.8 }), ids = new Set(['2f0f6c25-b5c_0', '8e927f58-ce2_0']);
  const surfaces = unique(f.city.surfaceGrid as Map<string, Surface[]>).filter(s => ids.has(s.e?.id || '') && s.roadQuad);
  let checked = 0, maximumError = 0;
  for (const s of surfaces) for (const u of [.01, .5, .99]) for (const side of [.25, .5, .75]) {
    const q = s.roadQuad!, r = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u, q[0][2] + (q[1][2] - q[0][2]) * u];
    const l = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u, q[3][2] + (q[2][2] - q[3][2]) * u];
    const x = r[0] + (l[0] - r[0]) * side, z = r[2] + (l[2] - r[2]) * side, y = r[1] + (l[1] - r[1]) * side;
    const support = supportAt(f.city, x, z, y, true); assert.equal(support.onRoad, true);
    maximumError = Math.max(maximumError, Math.abs(support.y - y)); assert.ok(Math.abs(support.y - y) < .03, `${s.e?.id}/${s.i}/${u}/${side}: ${support.y}/${y}`); checked++;
  }
  assert.ok(checked > 100); t.diagnostic(JSON.stringify({ actualRasoolpuraRibbonSamples: checked, maximumError }));
});

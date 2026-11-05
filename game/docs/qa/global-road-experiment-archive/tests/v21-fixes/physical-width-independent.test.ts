import test from 'node:test';
import assert from 'node:assert/strict';
import type { CoreData, RoadEdge } from '../../src/world/types';
import { roadPavementWidth, roadSupportWidth, roadClearanceWidth, hasDeclaredSingleLane } from '../../src/world/road-pavement';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { applyTileRoadNodeTransports, tileRoadSourceInput, type TileRoadNodeTransport } from '../../src/world/road-node-transport';
import { currentRoadGradePatches, installPreparedRoadCache, type PreparedRoadCachePayload } from '../../src/world/road-grades';
import { applyVerifiedRoadModel, type VerifiedRoadModel } from '../../src/world/road-model-overlay';
import { roadProfileInput, profileMatches } from '../../src/world/road-profile-corrections';
import { initTemplates } from '../../src/core/util';
import { buildTile } from '../../src/world/city';
import { supportAt, roofUnder, collideWalls } from '../../src/game/physics';
import { RoadGraph } from '../../src/game/roadgraph';
import { Traffic } from '../../src/game/traffic';
import { busLane } from '../../src/game/bus-path';
import { EmittedPlayerGeometry } from '../fixtures/emitted-player-contact';
import { readFileSync } from 'node:fs';

const raw = (): RoadEdge => ({ id: 'independent-explicit-width', cls: 'residential', name: null, w: 4.5, lanes: 1, from: 'from', to: 'to', oneway: null,
  pts: [[200, 200], [230, 200], [250, 210], [280, 215]], elev: [5, 5.7, 6.2, 6.8], maxspeed: 30 });
const arc = (e: RoadEdge) => { const values = [0]; for (let i = 1; i < e.pts.length; i++) values.push(values.at(-1)! + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1])); return values; };
function explicit(e = raw()): RoadEdge { return { ...e, joinedPavement: { sourceWidth: e.w, originalWidth: 8.4, physicalWidth: 8.4, intervals: [[0, arc(e).at(-1)!]], taper: 1, release: 'independent-physical-width' } }; }
const transport = (e: RoadEdge): TileRoadNodeTransport => ({ id: e.id, expected: tileRoadSourceInput(e), pts: e.pts, elev: e.elev, sourceArc: arc(e), sourceXY: e.pts, maximumDisplacement: 0, minimumTransportMask: 1, joinedPavement: explicit(e).joinedPavement });
const cache = (e: RoadEdge): PreparedRoadCachePayload => ({ version: 1, sourceRoadCount: 1, patches: currentRoadGradePatches([e]), report: { roads: 1, repairedRoads: 1, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: .065, protectedRoads: 0, protectedRoadsChanged: 0, separatedCrossings: 0, minCrossingSeparation: 0, joinedEndpointMaxDifference: 0, uncertainty: 'Independent synthetic metadata control' } });
function core(e: RoadEdge): CoreData { return { roads: [e], nodes: { from: e.pts[0], to: e.pts.at(-1) }, food: [], theatres: [], drops: [] } as unknown as CoreData; }
function overlay(e: RoadEdge): VerifiedRoadModel { return { sourceGradeModelSHA256: 'independent', sourcePrototypeSHA256: 'independent', supersedesRoadGradeProfileIds: [], nodes: {}, roads: [{ id: e.id, expected: roadProfileInput(e), model: roadProfileInput(explicit(e)), sourceArc: arc(e) }], tileRoads: [] }; }

// Literal scalar formula before optional physicalWidth was introduced. This
// oracle remains separate from the new helper and includes the old raised floor.
function absentOracle(e: RoadEdge, distance: number) {
  const p = e.joinedPavement;
  if (!p) return e.elev?.some(y => y > 1.2) && (e.expressway || !hasDeclaredSingleLane(e)) ? Math.max(e.w, 8.4) : e.w;
  let away = Infinity; for (const [a, b] of p.intervals) away = Math.min(away, distance < a ? a - distance : distance > b ? distance - b : 0);
  const u = Math.max(0, Math.min(1, away / p.taper));
  return e.w + (p.originalWidth - e.w) * u * u * (3 - 2 * u);
}
test('absent physicalWidth preserves every scalar operation and source capacity', () => {
  let comparisons = 0;
  for (const w of [4.5, 5.5, 7, 8.4, 12.8]) for (const raised of [false, true]) for (const profiled of [false, true]) {
    const e: RoadEdge = { ...raw(), w, elev: raw().pts.map(() => raised ? 2 : 0), joinedPavement: profiled ? { sourceWidth: w, originalWidth: Math.max(w, 12.8), intervals: [[4, 12], [30, 40]], taper: 17.3, release: 'absent-oracle' } : undefined };
    for (let s = -30; s <= 110; s += .37) { assert.ok(Object.is(roadPavementWidth(e, s), absentOracle(e, s))); comparisons++; }
    assert.ok(Object.is(roadSupportWidth(e), Math.max(e.w, e.joinedPavement?.sourceWidth || 0)));
    assert.ok(Object.is(roadClearanceWidth(e), Math.max(e.w, e.joinedPavement?.originalWidth || 0, e.joinedPavement?.sourceWidth || 0, e.sceneryWidth || 0)));
  }
  assert.ok(comparisons > 7500);
});

test('malformed explicit target fails closed in owner/context transfer, cache and atomic core overlay', () => {
  for (const invalid of [-1, 0, 4.49, 8.401, NaN, Infinity, null, '8.4', {}]) {
    const e = raw(), p = transport(e); (p.joinedPavement as any).physicalWidth = invalid;
    for (const context of [false, true]) {
      const source: any = { ...e, ...(context ? { ctx: 1 } : {}) }; if (context) delete source.lanes;
      const before = JSON.stringify(source), result = applyTileRoadNodeTransports([source], [p]);
      assert.deepEqual(result.mismatched, [e.id]); assert.equal(result.roads[0], source); assert.equal(JSON.stringify(source), before);
    }
    const payload = cache(explicit(e)); (payload.patches[0].joinedPavement as any).physicalWidth = invalid;
    assert.equal(installPreparedRoadCache([e], payload), false);
    const c = core(e), o = overlay(e); (o.roads[0].model.joinedPavement as any).physicalWidth = invalid;
    const before = JSON.stringify(c), result = applyVerifiedRoadModel(c, o, []);
    assert.equal(result.active, false); assert.ok(result.mismatched.length); assert.equal(JSON.stringify(c), before);
  }
});

test('valid owner/context, cache and overlay preserve exact physical target while retaining raw lanes and source bindings', () => {
  const e = raw(), original = JSON.stringify(e), p = transport(e), target = explicit(e), expectedRibbon = roadRibbon(e, [e]);
  for (const context of [false, true]) {
    const source: any = { ...e, ...(context ? { ctx: 1 } : {}) }; if (context) delete source.lanes;
    const result = applyTileRoadNodeTransports([source], structuredClone([p])); assert.deepEqual(result.mismatched, []);
    const moved = result.roads[0]; assert.equal(moved.w, e.w); assert.equal(moved.lanes, source.lanes);
    assert.deepEqual(moved.pts, e.pts); assert.deepEqual(moved.elev, e.elev); assert.deepEqual(roadRibbon(moved, [moved]).L, expectedRibbon.L);
    assert.notEqual(moved.joinedPavement, p.joinedPavement);
  }
  const installed = installPreparedRoadCache([e], structuredClone(cache(target))); assert.ok(installed);
  const c = core(e); assert.equal(applyVerifiedRoadModel(c, overlay(e), []).active, true);
  for (const restored of [installed[0], c.roads[0]]) {
    assert.equal(restored.w, e.w); assert.equal(restored.lanes, e.lanes); assert.deepEqual(roadRibbon(restored, [restored]).R, expectedRibbon.R);
    assert.ok(profileMatches(restored, roadProfileInput(target)));
    assert.equal(profileMatches({ ...restored, joinedPavement: { ...restored.joinedPavement!, physicalWidth: 8.3 } }, roadProfileInput(target)), false);
  }
  assert.equal(JSON.stringify(e), original);
});

test('actual emitted asphalt, support, graph finite Y and structural caps use the explicit physical frame', () => {
  initTemplates(); const e = explicit(), built = buildTile({ i: 0, j: 0, roads: [e], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const geometry = new EmittedPlayerGeometry({ minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }); geometry.collect(built);
  const graph = new RoadGraph([e]), edge = graph.byId.get(e.id)!; let samples = 0;
  for (const dir of [1, -1] as const) for (const lateral of [-3.8, 0, 3.8]) for (let s = 2; s < edge.len - 2; s += .75) {
    const p = graph.pointAt(edge, s, dir, lateral), actual = geometry.frame(p.x, p.z).nearestSupport(p.x, p.z, p.y);
    if (!actual) continue; // angled coarse cross-section may end before an offset root; full-body gate is separate.
    assert.ok(Math.abs(actual.y - p.y) < .001); const support = supportAt(built as any, p.x, p.z, p.y, true);
    assert.equal(support.onRoad, true); assert.ok(Math.abs(support.y - actual.y) < .001); samples++;
  }
  assert.ok(samples > 500);
  assert.equal(supportAt(built as any, 210, 196, 6, true).onRoad, true, 'support extends past raw2.25m half-width');
  assert.equal(supportAt(built as any, 210, 195.5, 6, true).onRoad, false, 'support does not extend beyond physical4.2m half-width');
  const roof = roofUnder({ ...built, movingRail: [] } as any, [[210, 196]]); assert.ok(roof > 5, 'overhead finite pavement uses same frame');
  const caps = (built.structureSupports || []).filter(s => s.part === 'bridge'); assert.ok(caps.length);
  for (const s of caps) assert.equal((s.cap!.footprint as { hw: number }).hw, 4.2);
  const shrunk = { ...e, joinedPavement: { ...e.joinedPavement! } }; delete shrunk.joinedPavement!.physicalWidth;
  assert.notDeepEqual(roadRibbon(shrunk, [shrunk]).L, roadRibbon(e, [e]).L, 'negative catches omission at a downstream consumer');
});

test('literal parapet collision follows physical pavement boundary rather than raw source half-width', () => {
  initTemplates(); const e = explicit({ ...raw(), pts: [[200, 200], [260, 200]], elev: [5, 5] });
  const built = buildTile({ i: 0, j: 0, roads: [e], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const walls = [...new Set([...built.walls.values()].flat())].filter(w => w.kind === 'parapet'); assert.ok(walls.length);
  for (const w of walls) { assert.ok(Math.abs(Math.abs(w.az - 200) - 4.2) < 1e-9); assert.ok(Math.abs(Math.abs(w.bz - 200) - 4.2) < 1e-9); }
  const from = { x: 230, z: 200 }, inside = { x: 230, z: 196.5 };
  assert.equal(collideWalls(built as any, from, inside, .3, 5, 6.2).hit, 0, 'the old raw half-width is not an invisible blocker');
  const outside = { x: 230, z: 195.5 }, hit = collideWalls(built as any, inside, outside, .3, 5, 6.2);
  assert.ok(hit.hit > 0); assert.ok(outside.z >= 196.1 - 1e-8, 'whole collision circle remains inside the real4.2m parapet');
});

test('traffic lane capacity, bus lane choice and exact path XZ/yaw remain raw-source decisions', () => {
  for (const oneway of [null, 'forward', 'backward'] as const) {
    const a = { ...raw(), oneway }, b = explicit(a);
    const before = new RoadGraph([a]), after = new RoadGraph([b]);
    const old = before.byId.get(a.id)!, target = after.byId.get(a.id)!;
    const ta = Object.create(Traffic.prototype) as Traffic, tb = Object.create(Traffic.prototype) as Traffic;
    ta.r = (() => .43) as Traffic['r']; tb.r = (() => .43) as Traffic['r'];
    for (const dir of [1, -1] as const) {
      assert.equal(busLane(old, dir), busLane(target, dir));
      for (const width of [.9, 1.5, 2.2, 2.5]) {
        assert.deepEqual(ta.laneRange(old, width, dir), tb.laneRange(target, width, dir));
        for (const group of ['car', 'auto', 'bike', 'bus', 'truck'] as const) assert.equal(ta.pickLane(old, width, group, dir), tb.pickLane(target, width, group, dir));
      }
      for (const lane of [-1.8, 0, 1.8]) for (let s = .5; s < old.len; s += 1.3) {
        const p = before.pointAt(old, s, dir, lane), q = after.pointAt(target, s, dir, lane);
        for (const key of ['x', 'z', 'hx', 'hz'] as const) assert.ok(Object.is(p[key], q[key]));
      }
    }
    assert.equal(a.w, b.w); assert.equal(a.lanes, b.lanes);
  }
});

test('narrow bus fix keeps absent-field and explicit-capacity profile branches unchanged', () => {
  for (const oneway of ['forward', 'backward'] as const) for (const w of [4.5, 5.5, 7, 10.8]) {
    const e = { ...raw(), w, oneway }, profile = { sourceWidth: w, originalWidth: Math.max(w, 12.8), intervals: [[0, arc(e).at(-1)!]] as [number, number][], taper: 30, release: 'independent-old-profile' };
    for (const usableLanes of [undefined, 1, 2, 3]) {
      const absent = { ...e, joinedPavement: { ...profile, ...(usableLanes === undefined ? {} : { usableLanes }) } };
      const expected = usableLanes === 1 ? 0 : Math.min(w / 4, w / 2 - 1.25 - .3);
      const graph = new RoadGraph([absent]);
      for (const dir of [1, -1] as const) assert.ok(Object.is(busLane(graph.byId.get(e.id)!, dir), expected));
      if (usableLanes === undefined) continue;
      const target = { ...absent, joinedPavement: { ...absent.joinedPavement, physicalWidth: Math.max(w, 8.4) } };
      const after = new RoadGraph([target]);
      for (const dir of [1, -1] as const) assert.ok(Object.is(busLane(after.byId.get(e.id)!, dir), expected));
    }
  }
});

test('all21 source-bound baseline profiles retain actual historical bus lanes', () => {
  const binding = JSON.parse(readFileSync('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/baseline21-1bed9d3c7e6e510578ce1e501d5c0f105283737899c6be96fcf91e796b59eb7a.json', 'utf8'));
  const joint = JSON.parse(readFileSync('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/jointInputBaseline21-e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f.json', 'utf8'));
  const actual = new Map<string, RoadEdge>(joint.tileRoads.map((e: RoadEdge) => [e.id, e])), differences = [];
  for (const row of binding.roads) {
    const old = new RoadGraph([row.historicalRoad]), prepared = new RoadGraph([actual.get(row.id)!]);
    for (const dir of [1, -1] as const) {
      const a = busLane(old.byId.get(row.id)!, dir), b = busLane(prepared.byId.get(row.id)!, dir);
      if (!Object.is(a, b)) differences.push({ id: row.id, dir, historicalLane: a, preparedLane: b });
    }
  }
  assert.deepEqual(differences, [], 'literal historical pavement preservation must not move bus lane paths');
});

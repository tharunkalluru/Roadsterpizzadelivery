import test from 'node:test';
import assert from 'node:assert/strict';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadClearanceWidth, roadPavementWidth, roadSupportWidth, retainRaisedRoadExclusions } from '../../src/world/road-pavement';
import { applyRoadGradePatches, currentRoadGradePatches, installPreparedRoadCache, type PreparedRoadCachePayload } from '../../src/world/road-grades';
import type { RoadEdge } from '../../src/world/types';
import { initTemplates } from '../../src/core/util';
import { buildTile } from '../../src/world/city';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { prepareJoinedApproachWidths, joinedSourceLaneIntervals } from '../../src/world/road-approach-widths';
import sourceCuts from '../../src/world/road-source-geodesic-data.json';
import type { CoreData } from '../../src/world/types';
import { profileMatches, roadProfileInput } from '../../src/world/road-profile-corrections';
import { busLane } from '../../src/game/bus-path';
import type { GEdge } from '../../src/game/roadgraph';
import * as THREE from 'three';
import { roadStructureClearance } from '../../src/world/structure-clearance';
import { buildingTransportClearance } from '../../src/world/building-clearance';
import { supportAt } from '../../src/game/physics';

const single = (): RoadEdge => ({ id: 'narrow-link', seg: 'narrow-link', name: null, cls: 'primary_link', w: 5.5, lanes: 1, oneway: 'forward', from: 'a', to: 'b', pts: [[0, 0], [20, 0]], elev: [0, 1.3], maxspeed: 40 });

test('whole-way four-lane authority follows the corrected source cut and keeps legacy source intervals unchanged', () => {
  for (const id of ['5cb4518a-9ba_0','5cb4518a-9ba_1']) {
    const patch=sourceCuts.roads.find(p=>p.id===id)!;
    const legacy={...single(),...patch.expected} as RoadEdge;
    const corrected={...legacy,pts:patch.pts,elev:patch.elev} as RoadEdge;
    const prior=joinedSourceLaneIntervals(legacy)!,fixed=joinedSourceLaneIntervals(corrected)!;
    assert.equal(fixed.length,1);assert.equal(fixed[0].lanes,4);assert.equal(fixed[0].from,0);assert.equal(fixed[0].to,patch.correctedArc.at(-1));
    assert.equal(fixed[0].sourceURL,prior[0].sourceURL);assert.ok(prior[0].from>0,'legacy raw input keeps its original rounding-bound interval');
    assert.equal(corrected.w,legacy.w,'arclength rebinding never changes physical/source width');
    const copied={...corrected,sourceLaneIntervals:fixed,pts:corrected.pts.map(p=>[...p] as [number,number])};
    assert.equal(joinedSourceLaneIntervals(copied),fixed,'prepared/cloned metadata retains its corrected source frame');
  }
});

test('a declared one-lane link keeps source pavement width; unknown lane defaults retain the prior raised envelope', () => {
  const source = { ...single(), sourceLaneIntervals: [{ from: 0, to: 20, lanes: 1, oneway: true, sourceURL: 'https://api.openstreetmap.org/api/0.6/way/1/2.json' }] }, model = retainRaisedRoadExclusions([source])[0];
  assert.equal(roadPavementWidth(model, 10), 5.5);
  const ribbon = roadRibbon(model, [model]);
  assert.equal(Math.hypot(ribbon.L[0][0] - ribbon.R[0][0], ribbon.L[0][1] - ribbon.R[0][1]), 5.5);
  assert.equal(roadSupportWidth(model), 5.5);
  assert.equal(roadClearanceWidth(model), 8.4);
  assert.equal(roadClearanceWidth({ ...model, elev: [0, 0] }), 8.4);
  assert.equal(source.sceneryWidth, undefined, 'the source object stays immutable');
  assert.equal(roadPavementWidth(single(), 10), 8.4, 'an unknown class-default lane count is not capacity evidence');
  assert.equal(roadPavementWidth({ ...model, sourceLaneIntervals: [{ ...source.sourceLaneIntervals[0], from: 5 }] }, 10), 8.4, 'partial one-lane evidence cannot narrow the whole unprofiled edge');
  assert.equal(roadPavementWidth({ ...model, lanes: 2 }, 10), 8.4, 'this change is limited to single-lane links');
  assert.equal(roadPavementWidth({ ...model, expressway: { controlled: true, ramp: true, throughLanes: 1, sources: [], sourceDate: '', uncertainty: '' } }, 10), 8.4, 'controlled expressway ramps retain their existing envelope');
  assert.equal(roadPavementWidth({ ...model, sourceLaneIntervals: [{ from: 0, to: 5, lanes: 4, oneway: true, sourceURL: 'https://api.openstreetmap.org/' }] }, 10), 8.4, 'a class-default single lane cannot narrow a source-supported multi-lane interval');
});

test('source lane intervals and conservative exclusion corridors survive ordinary worker patch transfer', () => {
  const road = { ...single(), sourceLaneIntervals: [{ from: 0, to: 20, lanes: 3, oneway: true, sourceURL: 'https://api.openstreetmap.org/api/0.6/way/1/2.json' }], sceneryWidth: 8.4, scenerySource: { pts: [[0, -5], [20, -5]] as [number, number][], elev: [0, 1.3], width: 8.4 } };
  const patches = currentRoadGradePatches([road]);
  const restored = applyRoadGradePatches([single()], structuredClone(patches))[0];
  assert.deepEqual(restored.sourceLaneIntervals, road.sourceLaneIntervals);
  assert.equal(restored.sceneryWidth, road.sceneryWidth);
  assert.deepEqual(restored.scenerySource, road.scenerySource);
  assert.deepEqual(restored.pts, road.pts);
});

test('modeled road displacement retains original prepared pier/facade exclusion without adding old pavement', () => {
  const road: RoadEdge = { ...single(), pts: [[200, 205], [220, 205]], scenerySource: { pts: [[200, 200], [220, 200]], elev: [0, 1.3], width: 8.4 } };
  const withoutSource = { ...road, scenerySource: undefined }, site = { x: 210, z: 196.5, r: .2 };
  assert.equal(roadStructureClearance([withoutSource]).clear(site, 0, 4), true);
  assert.equal(roadStructureClearance([road]).clear(site, 0, 4), false, 'the former road corridor cannot re-emit a solid column');
  const building = { id: 'original-corridor-facade', name: null, cls: null, h: 4, hs: 'fixture', ring: [[208, 196.3], [212, 196.3], [212, 196.7], [208, 196.7]] as [number, number][], fc: null, rc: null };
  assert.equal(buildingTransportClearance([withoutSource]).correct(building), null);
  assert.equal(buildingTransportClearance([road]).correct(building)?.pieces.length, 0, 'the same former facade exclusion remains conservative');
  initTemplates();
  const built = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const city: any = { surfaceGrid: built.surfaceGrid };
  assert.equal(supportAt(city, site.x, site.z, .65, true).onRoad, false, 'the original corridor is not drivable or invisible support');
  const roadZ = built.buffers.filter(b => b.mat === 'road').flatMap(b => Array.from(b.pos).filter((_, i) => i % 3 === 2));
  assert.ok(Math.min(...roadZ) > 200, 'only the modeled asphalt is drawn');
});

test('actual emitted single-lane asphalt keeps source width despite its elevated end', () => {
  initTemplates();
  const road = { ...single(), pts: [[200, 200], [220, 200]] as [number, number][], sourceLaneIntervals: [{ from: 0, to: 20, lanes: 1, oneway: true, sourceURL: 'https://api.openstreetmap.org/api/0.6/way/1/2.json' }] };
  const tile = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const positions = tile.buffers.filter(b => b.mat === 'road').flatMap(b => Array.from(b.pos));
  assert.ok(positions.length >= 18, 'exercise real emitted Float32 asphalt triangles');
  const across = positions.filter((_, i) => i % 3 === 2);
  assert.equal(Math.max(...across), 202.75);
  assert.equal(Math.min(...across), 197.25);
  const unknown = buildTile({ i: 0, j: 0, roads: [{ ...road, sourceLaneIntervals: undefined }], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const unknownAcross = unknown.buffers.filter(b => b.mat === 'road').flatMap(b => Array.from(b.pos).filter((_, i) => i % 3 === 2));
  assert.ok(Math.abs(Math.max(...unknownAcross) - Math.min(...unknownAcross) - 8.4) < 1e-4, 'actual unverified pavement keeps the historical8.4m envelope');
});

test('the actual source-network shoulder profiles preserve every tagged multi-lane interval and Durgam lane evidence', t => {
  const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const before = JSON.stringify(core.roads), result = prepareJoinedApproachWidths(core.roads);
  const source = new Map(core.roads.map(e => [e.id, e]));
  let tagged = 0, tested = 0;
  for (const e of result.roads) {
    if (e.sourceLaneIntervals) tagged++;
    for (const interval of e.sourceLaneIntervals || []) {
      if (interval.lanes <= 2) continue;
      const steps = Math.max(1, Math.ceil((interval.to - interval.from) / 2));
      for (let i = 0; i <= steps; i++) {
        const distance = interval.from + (interval.to - interval.from) * i / steps;
        assert.ok(roadPavementWidth(e, distance) >= source.get(e.id)!.w - 1e-6, `${e.id}: narrowing a tagged ${interval.lanes}-lane source interval`);
        tested++;
      }
    }
  }
  const durgam = result.roads.find(e => e.id === 'a0d993a1-f57_0')!;
  assert.ok(durgam.laneEvidence); assert.equal(durgam.w, 9.6); assert.equal(durgam.lanes, 3); assert.equal(durgam.joinedPavement, undefined);
  assert.equal(tagged, 57); assert.ok(result.components.length > 0); assert.ok(tested > 1000);
  assert.equal(JSON.stringify(core.roads), before, 'source-network widths, lane counts and XY stay immutable');
  t.diagnostic(JSON.stringify({ taggedRoads: tagged, localizedProfiles: result.roads.filter(e => e.joinedPavement).length, protectedIntervalSamples: tested }));
});

test('cache hook rejects malformed capacity or scenery metadata before installing any prepared model', () => {
  const payload: PreparedRoadCachePayload = { version: 1, sourceRoadCount: 1, patches: currentRoadGradePatches([single()]), report: { roads: 1, repairedRoads: 1, sourceSteepSegments: 0, modelSteepSegments: 0, maxModelGrade: .065, protectedRoads: 0, protectedRoadsChanged: 0, separatedCrossings: 0, minCrossingSeparation: 0, joinedEndpointMaxDifference: 0, uncertainty: 'Synthetic cache fixture' } };
  for (const change of [ { sceneryWidth: -1 }, { sceneryWidth: Infinity }, { scenerySource: null }, { scenerySource: { pts: [[0, 0], [20, 0]], elev: undefined, width: 8.4 } }, { scenerySource: { pts: [[0, 0], [20, 0]], elev: null, width: -1 } }, { scenerySource: { pts: [[0, 0], [20, Infinity]], elev: null, width: 8.4 } }, { sourceLaneIntervals: [{ from: 10, to: 0, lanes: 3, oneway: true, sourceURL: 'source' }] }, { sourceLaneIntervals: [{ from: 0, to: 10, lanes: 0, oneway: true, sourceURL: 'source' }] }, { joinedPavement: { sourceWidth: 5.5, originalWidth: 5.5, intervals: [[0, 20]], taper: 30, release: 'fixture', usableLanes: 0 } } ]) {
    const invalid = structuredClone(payload); Object.assign(invalid.patches[0], change);
    assert.equal(installPreparedRoadCache([single()], invalid), false);
  }
  const valid = structuredClone(payload), scenerySource = { pts: [[0, -4], [20, -4]] as [number, number][], elev: null, width: 8.4 };
  valid.patches[0].scenerySource = scenerySource;
  const installed = installPreparedRoadCache([single()], valid); assert.ok(installed);
  assert.deepEqual(installed[0].scenerySource, scenerySource, 'a valid source exclusion survives the same strict serialized cache hook');
});

test('solved profile bindings retain lane-capacity and protected-road metadata as part of their exact input', () => {
  const road = { ...single(), sceneryWidth: 8.4, sourceLaneIntervals: [{ from: 0, to: 20, lanes: 1, oneway: true, sourceURL: 'https://api.openstreetmap.org/api/0.6/way/1/2.json' }] };
  const expected = structuredClone(roadProfileInput(road));
  assert.ok(profileMatches(road, expected));
  assert.equal(profileMatches({ ...road, sourceLaneIntervals: [{ ...road.sourceLaneIntervals[0], lanes: 3 }] }, expected), false);
  assert.equal(profileMatches({ ...road, sceneryWidth: 9.6 }, expected), false);
  assert.equal(profileMatches({ ...road, laneEvidence: { confidence: 'source protected' } }, expected), false);
});

test('a one-way modeled single lane centers the bus without changing bidirectional or construction lane selection', () => {
  const e = { ...single(), w: 6.5, joinedPavement: { sourceWidth: 6.5, originalWidth: 12.8, intervals: [[10, 20]] as [number, number][], taper: 30, release: 'fixture', usableLanes: 1 } };
  const edge: GEdge = { e, from: 'a', to: 'b', len: 20, cum: [0, 20] };
  assert.equal(busLane(edge), 0);
  assert.equal(busLane(edge, -1), 0);
  assert.ok(busLane({ ...edge, e: { ...e, oneway: null } }) > 0, 'the opposite direction still occupies its own half of a bidirectional road');
  const workZone = { laneOffset: .7 } as RoadEdge['workZone'];
  assert.equal(busLane({ ...edge, e: { ...e, workZone } }), .7);
  assert.equal(busLane({ ...edge, e: { ...e, workZone } }, -1), -.7);
});

test('actual emitted lane paint retains a tagged four-lane span and stops its dividers in the modeled one-lane continuation', () => {
  initTemplates();
  const road: RoadEdge = { ...single(), cls: 'primary', w: 6.5, lanes: 4,
    pts: Array.from({ length: 101 }, (_, i) => [100 + i * 2, 300]), elev: Array(101).fill(0),
    joinedPavement: { sourceWidth: 6.5, originalWidth: 12.8, intervals: [[50, 200]], taper: 30, release: 'fixture', usableLanes: 1 },
    sourceLaneIntervals: [{ from: 0, to: 20, lanes: 4, oneway: true, sourceURL: 'source-four' }, { from: 20, to: 200, lanes: 1, oneway: true, sourceURL: 'source-one' }] };
  const tile = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const color = new THREE.Color('#ecebf0'), points: [number, number][] = [];
  for (const b of tile.buffers.filter(b => b.mat === 'marks')) for (let i = 0; i < b.pos.length; i += 3) {
    if (Math.abs(b.col[i] - color.r) < 1e-5 && Math.abs(b.col[i + 1] - color.g) < 1e-5 && Math.abs(b.col[i + 2] - color.b) < 1e-5) points.push([b.pos[i], b.pos[i + 2]]);
  }
  assert.ok(points.length >= 54, 'exercise actual emitted white divider triangles');
  for (const lateral of [-3.2, 0, 3.2]) assert.ok(points.some(([x, z]) => x < 120 && Math.abs(z - 300 - lateral) < .08), `retain the ${lateral} m divider inside the four-lane source span`);
  assert.ok(points.every(([x]) => x <= 120.001), 'a one-lane continuation has no invented internal lane divider');
});

test('new capacity-profile caps follow pavement while scenery keeps the larger original source exclusion', () => {
  initTemplates();
  const road: RoadEdge = { ...single(), w: 7, lanes: 2, pts: [[200, 400], [296, 400]], elev: [6.8, 6.8],
    joinedPavement: { sourceWidth: 10.8, originalWidth: 7, intervals: [[0, 96]], taper: 30, release: 'fixture', usableLanes: 2 } };
  assert.equal(roadClearanceWidth(road), 10.8, 'changing a modeled width cannot re-emit scenery inside the former source envelope');
  const tile = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const supports = (tile.structureSupports || []).filter(s => s.part === 'bridge');
  assert.ok(supports.length >= 3, 'exercise real emitted bridge supports');
  for (const s of supports) assert.equal((s.cap!.footprint as { hw: number }).hw, 3.5, 'actual cap width is the local7m pavement, not the10.8m scenery exclusion');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { actualWorldWorker } from '../../tests/fixtures/actual-world-worker';
import { verifiedProfileData } from '../../src/world/road-profile-corrections';
import { matchEmittedRoadTriangles, emittedTriangleKey } from './road-emitted-records';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadPavementWidth, roadSupportWidth } from '../../src/world/road-pavement';
import { RoadGraph } from '../../src/game/roadgraph';
import { busLane } from '../../src/game/bus-path';
import { Traffic } from '../../src/game/traffic';
import { EmittedPlayerGeometry } from '../../tests/fixtures/emitted-player-contact';
import type { RoadEdge } from '../../src/world/types';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export async function run() {
  const root = '/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/';
  const bindingPath = root + 'jointBindingBaseline21-d3256b22a8a923b862f0e0e86bd95269eba9938dfd7528062f53df633f14f128.json';
  const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
  const joint = JSON.parse(readFileSync(binding.jointGeometryInput.path, 'utf8'));
  const baseline = JSON.parse(readFileSync(binding.references.baseline21.path, 'utf8'));
  const historicalPath = '/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json';
  const historical = JSON.parse(readFileSync(historicalPath, 'utf8'));
  assert.equal(sha(readFileSync(binding.jointGeometryInput.path)), binding.jointGeometryInput.sha256);
  assert.equal(sha(readFileSync(binding.references.baseline21.path)), binding.references.baseline21.sha256);
  assert.equal(sha(readFileSync(historicalPath)), 'd746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90');
  const ids = new Set<string>(baseline.roads.map((r: any) => r.id));
  assert.equal(ids.size, 21);
  const target = new Map<string, RoadEdge>(joint.tileRoads.filter((r: RoadEdge) => ids.has(r.id)).map((r: RoadEdge) => [r.id, r]));
  const transports = joint.transports.filter((r: any) => ids.has(r.id));
  const oldGeometry = verifiedProfileData.geometry, oldTileProfiles = verifiedProfileData.tileProfiles;
  const fixture = await actualWorldWorker({ allowInactive: true });
  // Explicit CPU-only QA injection. Actual World remains inactive, files and
  // release manifests stay disabled. Only these held21 transports enter the
  // actual worker's ordinary overlay stage; no invented solvedY is supplied.
  verifiedProfileData.geometry = { sourceRoadGeometryGeneration: binding.sourceRoadGeometryGeneration, sourceGradeModelSHA256: 'independent21-leaf-only', sourcePrototypeSHA256: 'independent21-leaf-only', supersedesRoadGradeProfileIds: [], nodes: {}, roads: [], tileRoads: transports };
  verifiedProfileData.tileProfiles = [];
  fixture.initialization.modelOverlayActive = true;
  const tileKeys = [...new Set<string>([...ids].flatMap(id => joint.copies[id].map((c: any) => c.tile)))].sort();
  const expected = new Map<string, Set<string>>([...ids].map(id => [id, new Set(historical.triangles.filter((t: any) => t.road === id && !t.cap).map((t: any) => emittedTriangleKey(t.points)))]));
  const actual = new Map<string, Set<string>>([...ids].map(id => [id, new Set<string>()]));
  const scopedGeometry = new Map([...ids].map(id => { const pts = target.get(id)!.pts; return [id, new EmittedPlayerGeometry({ minX: Math.min(...pts.map(p => p[0])) - 20, maxX: Math.max(...pts.map(p => p[0])) + 20, minZ: Math.min(...pts.map(p => p[1])) - 20, maxZ: Math.max(...pts.map(p => p[1])) + 20 })] as const; }));
  const failures: any[] = [], ownerRoads = new Map<string, RoadEdge>(), observedCopies: any[] = [];
  let allBuffersFloat32 = true, supportSamples = 0, maxGraphError = 0, graphOutsideOwnRibbon = 0, physicalCrossSections = 0;
  try {
    for (const key of tileKeys) {
      const built = await fixture.build(key), matched = matchEmittedRoadTriangles(built);
      allBuffersFloat32 &&= built.buffers.every(b => b.pos instanceof Float32Array);
      for (const record of matched.matched) if (ids.has(record.surface.e!.id) && !record.triangulatedPatch) actual.get(record.surface.e!.id)!.add(emittedTriangleKey(record.points));
      const local = new Map<string, RoadEdge>();
      for (const surfaces of built.surfaceGrid.values()) for (const s of surfaces) if (s.e && ids.has(s.e.id)) local.set(s.e.id, s.e);
      for (const [id, e] of local) {
        // Observer-only own-road filter over literal emitted vertices. Combine
        // owner and context before querying; a tile-bounded oracle would miss
        // valid portions of a source road that extend across its owner border.
        const records = matched.matched.filter(r => r.surface.e?.id === id), pos = new Float32Array(records.flatMap(r => r.points.flat()));
        const ownGrid = new Map([...built.surfaceGrid].map(([cell, surfaces]) => [cell, surfaces.filter(s => s.e?.id === id)]));
        scopedGeometry.get(id)!.collect({ ...built, surfaceGrid: ownGrid, buffers: [{ mat: 'road', pos, nor: new Float32Array(0), uv: new Float32Array(0), col: new Float32Array(0) }] });
        const intended = target.get(id)!;
        observedCopies.push({ id, tile: key, context: !built.roads.some(r => r.id === id), width: e.w, lanes: e.lanes ?? null, physicalWidth: e.joinedPavement?.physicalWidth });
        assert.equal(e.w, intended.w); assert.deepEqual(e.joinedPavement, intended.joinedPavement);
        assert.deepEqual(e.pts, intended.pts); assert.deepEqual(e.elev, intended.elev);
        const ribbon = roadRibbon(e, [e]), old = baseline.roads.find((r: any) => r.id === id).historicalFootprint;
        assert.deepEqual(ribbon.L, old.L); assert.deepEqual(ribbon.R, old.R);
        for (let n = 0; n < e.pts.length; n++) { assert.equal(roadPavementWidth(e, 0), 8.4); assert.ok(Math.abs(Math.hypot(ribbon.L[n][0] - ribbon.R[n][0], ribbon.L[n][1] - ribbon.R[n][1]) - 8.4) < 1e-9); physicalCrossSections++; }
        assert.equal(roadSupportWidth(e), 8.4);
        if (!built.roads.some(r => r.id === id)) continue;
        ownerRoads.set(id, e);
      }
    }
    assert.equal(ownerRoads.size, 21, 'all real owner roads must be built through the actual worker');
    const outsideWitnesses: any[] = [], outsideByRoad: Record<string, number> = {};
    for (const [id, e] of ownerRoads) {
      const graph = new RoadGraph([e]), edge = graph.byId.get(id)!, geometry = scopedGeometry.get(id)!;
      for (const dir of [1, -1] as const) for (const lateral of [-3.8, 0, 3.8]) for (let s = .5; s < edge.len - .5; s += 1) {
        const p = graph.pointAt(edge, s, dir, lateral), support = geometry.frame(p.x, p.z).nearestSupport(p.x, p.z, p.y);
        if (!support) { graphOutsideOwnRibbon++; outsideByRoad[id] = (outsideByRoad[id] || 0) + 1; if (outsideWitnesses.length < 12) outsideWitnesses.push({ id, dir, lateral, s, p }); continue; }
        assert.equal(support.roadId, id, 'a foreign road cannot supply selected road support');
        maxGraphError = Math.max(maxGraphError, Math.abs(p.y - support.y)); supportSamples++;
      }
    }
    const rows = baseline.roads.map((r: any) => {
      const a = actual.get(r.id)!, b = expected.get(r.id)!, e = ownerRoads.get(r.id)!;
      const missing = [...b].filter(v => !a.has(v)), extra = [...a].filter(v => !b.has(v));
      const old = new RoadGraph([r.historicalRoad]), prepared = new RoadGraph([e]);
      const laneChanges = [];
      for (const dir of [1, -1] as const) { const before = busLane(old.byId.get(r.id)!, dir), after = busLane(prepared.byId.get(r.id)!, dir); if (!Object.is(before, after)) laneChanges.push({ dir, before, after }); }
      const ta = Object.create(Traffic.prototype) as Traffic, tb = Object.create(Traffic.prototype) as Traffic;
      ta.r = (() => .43) as Traffic['r']; tb.r = (() => .43) as Traffic['r'];
      const ordinaryLaneChanges = [];
      for (const group of ['car', 'auto', 'bike', 'truck'] as const) for (const dir of [1, -1] as const) {
        const before = ta.pickLane(old.byId.get(r.id)!, 2.2, group, dir), after = tb.pickLane(prepared.byId.get(r.id)!, 2.2, group, dir);
        if (!Object.is(before, after)) ordinaryLaneChanges.push({ group, dir, before, after });
      }
      if (missing.length || extra.length || laneChanges.length || ordinaryLaneChanges.length) failures.push({ id: r.id, missing: missing.length, extra: extra.length, laneChanges, ordinaryLaneChanges });
      return { id: r.id, sourceWidth: e.w, lanes: e.lanes, oneway: e.oneway, controls: e.pts.length, historicalTriangles: b.size, workerTriangles: a.size, missing: missing.length, extra: extra.length, laneChanges, ordinaryLaneChanges };
    });
    fixture.verifySources();
    assert.equal(fixture.sourceCoreSHA256, baseline.sourceCoreSHA256);
    for (const [path, hash] of Object.entries(fixture.sourcePackHashes)) { const relative = 'public/city/' + path.split('/public/city/')[1]; assert.equal(hash, joint.sourcePackSHA256[relative], 'worker pack must match held raw joint source SHA'); }
    return { pass: failures.length === 0 && allBuffersFloat32 && maxGraphError < .001,
      scope: 'Independent actual World initialization + actual tileworker transport/build emission. Only source-bound21 transports are injected in Node memory; no final height solution, activation or physical driving approval.',
      releaseApproved: false, fixtureWorldOverlayActive: fixture.world.modeledRoadReport.active, qaWorkerOverlayExplicitlyEnabled: true,
      bindingSHA256: sha(readFileSync(bindingPath)), jointSHA256: binding.jointGeometryInput.sha256, historicalSHA256: sha(readFileSync(historicalPath)),
      rows, failures, observedCopies, sourcePackHashes: fixture.sourcePackHashes, outsideByRoad, outsideWitnesses,
      summary: { roads: ownerRoads.size, builtOwnerContextTiles: tileKeys.length, observedCopies: observedCopies.length, allBuffersFloat32, historicalTriangles: rows.reduce((n: number, r: any) => n + r.historicalTriangles, 0), actualWorkerTriangles: rows.reduce((n: number, r: any) => n + r.workerTriangles, 0), supportSamples, maxGraphError, graphOutsideOwnRibbon, physicalCrossSections },
      gatesOpen: ['coarse-road off-own-ribbon graph poses are reported, not accepted as supported', 'final feasible core/tileY and actual3D joins/caps/terrain', 'full Roadster/traffic body and tyre paths', 'known30, independent headroom, native drives, cache/reuse/restart final model', 'historical outsideROI1713 unknowns and stadium aliases'] };
  } finally { verifiedProfileData.geometry = oldGeometry; verifiedProfileData.tileProfiles = oldTileProfiles; fixture.dispose(); }
}

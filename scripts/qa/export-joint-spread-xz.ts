import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initTemplates } from '../../src/core/util';
import { buildTile } from '../../src/world/city';
import { applyVerifiedSourceRoadZone } from '../../src/world/road-source-geodesic';
import { applyRoadGradePatches, currentRoadGradePatches } from '../../src/world/road-grades';
import { applyVerifiedRoadTileGeometry } from '../../src/world/road-model-overlay';
import { applyVerifiedRoadTileProfiles } from '../../src/world/road-profile-corrections';
import { applyConstructionRoads } from '../../src/world/construction';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { placeLandmarks } from '../../src/world/landmarks';
import { placeAirfields } from '../../src/world/airfields';
import { DESTINATION_IDENTITIES } from '../../src/world/destination-data';
import { roadPavementWidthAt } from '../../src/world/road-pavement';
import { matchEmittedRoadTriangles, emittedTriangleKey } from './road-emitted-records';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export function emit(minimumSpread = 0) {
  const inputs: Record<string, string> = {};
  const read = (path: string) => { const bytes = readFileSync(path); inputs[path] = sha(bytes); return bytes; };
  const bound = (path: string, expected: string) => { const bytes = read(path); assert.equal(sha(bytes), expected, path); return JSON.parse(bytes.toString()); };
  const manifest = bound('/tmp/roadster-road-freezes/source-9413-width-union-v1/manifest-43ec75a86c41175368f1d7404a6fa0f0ef4b03c82b71067a4d7796915ba6ab04.json', '43ec75a86c41175368f1d7404a6fa0f0ef4b03c82b71067a4d7796915ba6ab04');
  const model = bound(manifest.model.path, manifest.model.sha256), source = bound(manifest.sourceData.path, manifest.sourceData.sha256), supplement = bound(manifest.tileSupplement.path, manifest.tileSupplement.sha256);
  const joint = bound('/tmp/source-9413-joint-tile-input-1f989-v2.json', '740221cfb0d110ca1e4b5c9ead78d200ffa83f672c08c876470cdb074ffed7e6');
  const geo = bound('/tmp/source-9413-joint-tile-geographic-endpoints-1f989-v1.json', '94f60ce87a3aa6a50cbc8f0b777bc639aa9605dd6456a01af67f9b9ae8fb4d44');
  const idsPath = '/tmp/source-9413-selected75-spread-node-ids.json', ids: string[] = JSON.parse(read(idsPath).toString()); assert.equal(ids.length, 75);
  assert.equal(joint.sourceModelSHA256, manifest.model.sha256); assert.equal(joint.sourceRoadGeometryGeneration, source.generationID);
  const coreBytes = read('public/city/core.pack.wasm'); assert.equal(sha(coreBytes), manifest.sourceCoreSHA256);
  const core = JSON.parse(gunzipSync(coreBytes).toString()), byId = new Map<string, any>(model.roads.map(e => [e.id, e]));
  const portRoads = new Map<string, any>([...model.roads, ...joint.contextRoads, ...joint.boundaryRoads, ...joint.tileRoads].map(e => [e.id, e]));
  const selected = geo.nodes.filter(n => ids.includes(n.node) && n.currentInferredSpreadM > minimumSpread).sort((a, b) => b.currentInferredSpreadM - a.currentInferredSpreadM);
  const queries = selected.map(n => {
    const record = joint.coreAnchorNodes.find(r => r.node === n.node); assert.ok(record?.sourceConnectionVerifiedForEveryArm);
    const arms = [...record.coreArms, ...record.tileArms].map(arm => {
      const road = portRoads.get(arm.id); assert.ok(road, arm.id);
      const from = arm.end === 'from', points = from ? road.pts : [...road.pts].reverse();
      const fullLength = points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
      // A tiny source piece must not place its probe against the OTHER node's
      // terminal boundary; that would test omitted next-junction geometry.
      let remaining = Math.min(8, fullLength / 2), length = 0, port: number[] | undefined, portHeading: number[] | undefined;
      for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); length += d; if (!port && remaining <= d) { const t = remaining / (d || 1); port = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; portHeading = [(b[0] - a[0]) / (d || 1), (b[1] - a[1]) / (d || 1)]; } if (!port) remaining -= d; }
      if (!port) { const a = points[0], b = points.at(-1)!, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; port = [a[0] + (b[0] - a[0]) * .7, a[1] + (b[1] - a[1]) * .7]; portHeading = [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; }
      return { id: arm.id, end: arm.end, point: points[0], port, portHeading, portWidth: roadPavementWidthAt(road, port[0], port[1]), sourceLength: length, declaredEndpointY: road.elev?.[from ? 0 : road.pts.length - 1] ?? 0, width: road.w, cls: road.cls };
    });
    const x = arms.reduce((s, a) => s + a.point[0], 0) / arms.length, z = arms.reduce((s, a) => s + a.point[1], 0) / arms.length;
    return { node: n.node, geographic: n, fullConnectorAliases: record.fullConnectorAliases, arms, center: [x, z], triangles: [] as any[], roadsSeen: [] as string[], ownerCopies: [] as any[], unresolved: [] as string[] };
  });
  const tileQueries = new Map<string, typeof queries>();
  for (const q of queries) for (const dx of [-30, 30]) for (const dz of [-30, 30]) { const key = `${Math.floor((q.center[0] + dx) / 1000)}_${Math.floor((q.center[1] + dz) / 1000)}`, list = tileQueries.get(key) ?? []; if (!list.includes(q)) list.push(q); tileQueries.set(key, list); }
  // Short core roads are rendered by their real source owner, including
  // geometry outside that tile. A local context copy may not emit asphalt.
  // Bind actual raw owners by immutable IDs instead of guessing by proximity.
  const wanted = new Set(queries.flatMap(q => q.arms.map(a => a.id)));
  for (const pack of core.packs) {
    const file = 'public/city/' + pack.file, bytes = read(file);
    assert.equal(sha(bytes), joint.sourcePackSHA256[file], 'joint raw pack binding ' + file);
    const raw = JSON.parse(gunzipSync(bytes).toString());
    for (const [key, zone] of Object.entries(raw.tiles) as [string, any][]) for (let index = 0; index < zone.roads.length; index++) {
      const road = zone.roads[index]; if (road.ctx || !wanted.has(road.id)) continue;
      for (const q of queries) if (q.arms.some(a => a.id === road.id)) {
        const [i, j] = key.split('_').map(Number), distance = Math.hypot(Math.max(i * 1000 - q.center[0], 0, q.center[0] - (i + 1) * 1000), Math.max(j * 1000 - q.center[1], 0, q.center[1] - (j + 1) * 1000));
        q.ownerCopies.push({ road: road.id, tile: key, pack: file, rawIndex: index, rawRoadSHA256: sha(Buffer.from(JSON.stringify(road))), distanceFromQueryToOwnerBounds: distance });
        const local = tileQueries.get(key) ?? []; if (!local.includes(q)) local.push(q); tileQueries.set(key, local);
      }
    }
  }
  for (const q of queries) for (const arm of q.arms) if (!q.ownerCopies.some(c => c.road === arm.id)) q.unresolved.push('no exact raw owner for arm ' + arm.id);
  const gradient = { addColorStop() {} }, ctx = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, k) => k in o ? o[k] : () => {} });
  const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 256, height: 128, getContext: () => ctx }) } }); initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, .12), ring: new THREE.RingGeometry(1, 1.35, 40) });
  const patches = currentRoadGradePatches(model.roads), geometry: any = { nodes: model.endpointDisplacements, roads: model.geometryEdits.map(id => ({ id, model: byId.get(id) })), tileRoads: joint.transports, tileNodeSources: supplement.nodeSources };
  const railway = railwayNetwork(model.profiles.map(p => ({ id: p.id, elev: p.elev }))), landmarks = placeLandmarks(core.origin, core.packs.flatMap(p => p.tiles)), airfields = placeAirfields(core.origin);
  const packs = new Map<string, any>(), tileSummary: any[] = [], unmatched: any[] = [], dedup = new Map<string, Set<string>>();
  try {
    for (const [key, local] of [...tileQueries].sort((a, b) => a[0].localeCompare(b[0]))) {
      const owner = core.packs.find(p => p.tiles.some(ij => ij.join('_') === key));
      if (!owner) { for (const q of local) q.unresolved.push('missing source tile ' + key); continue; }
      if (!packs.has(owner.file)) packs.set(owner.file, JSON.parse(gunzipSync(read('public/city/' + owner.file)).toString()));
      const zone = packs.get(owner.file).tiles[key]; assert.ok(zone, key);
      const normalized = applyVerifiedSourceRoadZone(zone, source); assert.equal(normalized.report.mismatched.length, 0, key);
      const applied = applyVerifiedRoadTileGeometry({ ...normalized.value, roads: applyRoadGradePatches(normalized.value.roads, patches) }, geometry, []); assert.deepEqual(applied.report.mismatched, [], key);
      const profiles = applyVerifiedRoadTileProfiles(applied.zone.roads); assert.deepEqual(profiles.report.mismatched, [], key);
      const roads = model.construction ? applyConstructionRoads(profiles.roads, model.construction) : profiles.roads;
      const furniture = core.trafficSignals === undefined ? zone.furniture.filter(f => f.kind !== 'traffic_signals' || !f.synth) :
        [...zone.furniture.filter(f => f.kind !== 'traffic_signals'), ...core.trafficSignals.filter(f => f.p[0] >= zone.i * 1000 - 80 && f.p[0] < (zone.i + 1) * 1000 + 80 && f.p[1] >= zone.j * 1000 - 80 && f.p[1] < (zone.j + 1) * 1000 + 80)];
      const built = buildTile({ ...applied.zone, roads, furniture }, { lowQ: true, metro: core.metro, landmarks, airfields, construction: model.construction, destinations: DESTINATION_IDENTITIES.filter(d => d.tile[0] === zone.i && d.tile[1] === zone.j), railway });
      const actual = matchEmittedRoadTriangles(built); unmatched.push(...actual.unmatched);
      for (const q of local) {
        for (const unknown of actual.unmatched) { const xs = unknown.points.map(p => p[0]), zs = unknown.points.map(p => p[2]); if (Math.max(...xs) >= q.center[0] - 30 && Math.min(...xs) <= q.center[0] + 30 && Math.max(...zs) >= q.center[1] - 30 && Math.min(...zs) <= q.center[1] + 30) q.unresolved.push('Unbound actual road-material Float32 triangle in node neighborhood: ' + key + '/' + emittedTriangleKey(unknown.points)); }
        const allowed = new Set(q.arms.map(a => a.id)), seen = dedup.get(q.node) ?? new Set<string>(); dedup.set(q.node, seen);
        for (const r of actual.matched) {
          if (!allowed.has(r.surface.e!.id)) continue;
          const xs = r.points.map(p => p[0]), zs = r.points.map(p => p[2]);
          if (Math.max(...xs) < q.center[0] - 30 || Math.min(...xs) > q.center[0] + 30 || Math.max(...zs) < q.center[1] - 30 || Math.min(...zs) > q.center[1] + 30) continue;
          const token = r.surface.e!.id + '/' + r.surface.i + '/' + emittedTriangleKey(r.points); if (seen.has(token)) continue; seen.add(token);
          q.triangles.push({ road: r.surface.e!.id, segment: r.surface.i, tile: key, points: r.points, paintLift: r.surface.paintLift ?? 0, triangularPatch: r.triangulatedPatch });
          if (!q.roadsSeen.includes(r.surface.e!.id)) q.roadsSeen.push(r.surface.e!.id);
        }
      }
      tileSummary.push({ key, nodes: local.map(q => q.node), sourceRoads: applied.zone.roads.length, roadTriangles: actual.roadTriangles, unmatched: actual.unmatched.length });
      built.buffers.length = 0;
    }
    for (const q of queries) for (const arm of q.arms) if (!q.roadsSeen.includes(arm.id)) q.unresolved.push('no literal emitted road/cap triangles for source arm ' + arm.id);
    for (const [path, expected] of Object.entries(inputs)) assert.equal(sha(readFileSync(path)), expected, path + ' changed');
    return { scope: 'XZ-ONLY DIAGNOSTIC. Literal current-Y Float32 buildTile road/cap geometry after source9413/current1f989 core/inferred fields/prospective487 joint transports. No Y flattening, activation, 3D acceptance or implicit source repair.', minimumSpread, fullSelectorCount: 75, selectedCount: queries.length, physicalRoadsterWidth: 2.2, physicalHalfLengthForLater3D: 2.4, sourceRoadGeometryGeneration: source.generationID, modelSHA256: manifest.model.sha256, jointInputSHA256: inputs['/tmp/source-9413-joint-tile-input-1f989-v2.json'], inputs, tileSummary, unmatched, queries, releaseApproved: false };
  } finally { if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else delete (globalThis as any).document; }
}

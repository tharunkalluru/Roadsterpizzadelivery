import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { initTemplates } from '../../../../src/core/util';
import { buildTile } from '../../../../src/world/city';
import { applyVerifiedSourceRoadZone } from '../../../../src/world/road-source-geodesic';
import { applyRoadGradePatches, currentRoadGradePatches } from '../../../../src/world/road-grades';
import { applyVerifiedRoadTileGeometry } from '../../../../src/world/road-model-overlay';
import { railwayNetwork } from '../../../../src/world/railway-geometry';
import { placeLandmarks } from '../../../../src/world/landmarks';
import { placeAirfields } from '../../../../src/world/airfields';
import { DESTINATION_IDENTITIES } from '../../../../src/world/destination-data';
import { RoadGraph } from '../../../../src/game/roadgraph';
import { TrafficCurve } from '../../../../src/game/traffic-path';
import { TrafficCurveRoadSupport, trafficCurveRoadWindow } from '../../../../src/game/traffic-curve-road-support';
import { busLane } from '../../../../src/game/bus-path';

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Diagnostic replay of the current explicit unsolved prototype, not an
 * activation or final World/worker gate. It uses actual buildTile surfaces and
 * canonical metro/rail/landmark inputs to census the sampler's local budgets. */
export function census() {
  const files: Record<string, string> = {};
  const read = (path: string) => { const bytes = readFileSync(path); files[path] = hash(bytes); return bytes; };
  const manifestPath = '/tmp/roadster-road-freezes/source-9413-body-corridors-v1/manifest-8ce684a34fefedec7f3ad1184c5a8a029afc680bc02262ddb44e66bb49a13f22.json';
  const manifest = JSON.parse(read(manifestPath).toString());
  const mb = read(manifest.model.path), tb = read(manifest.tileSupplement.path);
  assert.equal(hash(mb), manifest.model.sha256); assert.equal(hash(tb), manifest.tileSupplement.sha256);
  const model = JSON.parse(mb.toString()), tile = JSON.parse(tb.toString());
  const core = JSON.parse(gunzipSync(read('public/city/core.pack.wasm')).toString());
  const source = JSON.parse(read('src/world/road-source-geodesic-data.json').toString());
  assert.equal(tile.sourceModelSHA256, hash(mb)); assert.equal(model.sourceRoadGeometryGeneration, source.generationID);
  const byId = new Map<string, any>(model.roads.map(e => [e.id, e]));
  const routes = [
    { id: '23427c8c-e37_0', start: 20, end: 200 },
    { id: 'bdf0bad3-182_0', start: 400, end: 570 },
    { id: '38a7824d-0e1_0', start: Math.max(0, byId.get('38a7824d-0e1_0').pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - byId.get('38a7824d-0e1_0').pts[i][0], p[1] - byId.get('38a7824d-0e1_0').pts[i][1]), 0) - 120), end: Infinity },
  ];
  const graph = new RoadGraph(routes.map(r => byId.get(r.id))), keys = new Set<string>();
  for (const r of routes) {
    const e = graph.byId.get(r.id)!; r.end = Math.min(r.end, e.len - 1);
    for (let s = r.start; s <= r.end; s += 10) { const p = graph.pointAt(e, s, 1); for (const dx of [-15, 15]) for (const dz of [-15, 15]) keys.add(`${Math.floor((p.x + dx) / 1000)}_${Math.floor((p.z + dz) / 1000)}`); }
  }
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o: any, k) => k in o ? o[k] : () => {} });
  const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 256, height: 128, getContext: () => context }) } });
  initTemplates();
  const grid = new Map<string, any[]>(), packs = new Map<string, any>(), built: any[] = [];
  const patches = currentRoadGradePatches(model.roads), geometry = { nodes: model.endpointDisplacements, roads: model.geometryEdits.map(id => ({ id, model: byId.get(id) })), tileRoads: tile.transports, tileNodeSources: tile.nodeSources };
  const railway = railwayNetwork(model.profiles.map(p => ({ id: p.id, elev: p.elev }))), landmarks = placeLandmarks(core.origin, core.packs.flatMap(p => p.tiles)), airfields = placeAirfields(core.origin);
  try {
    for (const key of [...keys].sort()) {
      const owner = core.packs.find(p => p.tiles.some(ij => ij.join('_') === key)); assert.ok(owner, key);
      if (!packs.has(owner.file)) packs.set(owner.file, JSON.parse(gunzipSync(read('public/city/' + owner.file)).toString()));
      const zone = packs.get(owner.file).tiles[key]; assert.ok(zone, key);
      const corrected = applyVerifiedSourceRoadZone(zone, source); assert.equal(corrected.report.mismatched.length, 0);
      const applied = applyVerifiedRoadTileGeometry({ ...corrected.value, roads: applyRoadGradePatches(corrected.value.roads, patches) }, geometry as any, []); assert.equal(applied.report.mismatched.length, 0);
      const actual = buildTile(applied.zone, { lowQ: true, metro: core.metro, landmarks, airfields, construction: model.construction, destinations: DESTINATION_IDENTITIES, railway });
      for (const [key, rows] of actual.surfaceGrid) { const previous = grid.get(key); if (previous) previous.push(...rows); else grid.set(key, rows.slice()); }
      built.push({ key, roads: applied.zone.roads.length, surfaceCells: actual.surfaceGrid.size });
    }
    const buckets = [...grid].map(([key, rows]) => { const own = new Map<string, number>(); for (const s of rows) if (s.e && s.roadQuad) own.set(s.e.id, (own.get(s.e.id) || 0) + 1); return { key, total: rows.length, maximumSameRoad: Math.max(0, ...own.values()) }; }).sort((a, b) => b.total - a.total);
    const cases: any[] = [];
    for (const r of routes) {
      const edge = graph.byId.get(r.id)!, lane = busLane(edge);
      let samples = 0, supported = 0, blockedQueries = 0, missingOrAmbiguous = 0, maximumQueriedBucket = 0, maxOwnedCell = 0;
      const witnesses: any[] = [];
      for (let start = r.start; start + 12 < r.end; start += 25) {
        const end = Math.min(start + 60, r.end), sampler = new TrafficCurveRoadSupport(grid, [trafficCurveRoadWindow(edge, 1, start, end)]);
        const a = graph.pointAt(edge, start, 1, lane), b = graph.pointAt(edge, end, 1, lane), curve = new TrafficCurve(a, b, (end - start) / 3);
        for (let d = 0; d <= curve.length; d += 1) {
          const p = curve.sample(d), y = sampler.heightAt(p.x, p.z, p.y); samples++;
          const cx = Math.floor(p.x / 30), cz = Math.floor(p.z / 30); let blocked = false;
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const key = `${cx + dx},${cz + dz}`, rows = grid.get(key); maximumQueriedBucket = Math.max(maximumQueriedBucket, rows?.length || 0);
            const cached = (sampler as any).cells.get(key); if (cached) { maxOwnedCell = Math.max(maxOwnedCell, cached.surfaces.length); if (cached.blocked) blocked = true; }
          }
          if (y !== null) supported++; else if (blocked) blockedQueries++; else missingOrAmbiguous++;
          if (y === null && witnesses.length < 4) witnesses.push({ start, end, distance: d, position: [p.x, p.y, p.z], blocked });
        }
      }
      cases.push({ id: r.id, samples, supported, blockedQueries, missingOrAmbiguous, maximumQueriedBucket, maxOwnedCell, witnesses });
    }
    for (const [path, expected] of Object.entries(files)) assert.equal(hash(readFileSync(path)), expected, 'consumed input changed: ' + path);
    return { scope: 'Current unsolved875b/source9413 prototype budget diagnostic over actual buildTile surfaces. Not final LP density, full World/worker acceptance, full vehicle traversal, or performance/FPS evidence.', files, modelSHA256: hash(mb), tileSHA256: hash(tb), sourceGeneration: source.generationID, built, totalCells: grid.size, maximumBucket: buckets[0], denseBuckets: buckets.filter(b => b.total > TrafficCurveRoadSupport.MAX_CELL_SURFACES), largestBuckets: buckets.slice(0, 16), cases };
  } finally { if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else delete (globalThis as any).document; }
}

// Offline source/renderer audit. This does not drive the game or verify delivery.
// Source packs are read-only; only the requested JSON evidence report is written.
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const argument = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const reportPath = argument('--report', join(root, 'docs/playtests/2026-10-26-building-render-audit.json'));
const deadlineMs = Number(argument('--max-ms', '240000'));
const temp = mkdtempSync(join(tmpdir(), 'roadster-render-audit-'));
const digest = value => createHash('sha256').update(value).digest('hex');
const codeFiles = ['game/src/world/city.ts', 'game/src/world/building-clearance.ts', 'game/src/world/extras.ts', 'game/src/world/destination-recognition.ts', 'game/src/world/destination-data.ts', 'game/src/world/destination-hero-models.ts', 'game/src/world/destination-hero-data.ts', 'game/src/world/landmarks.ts', 'game/src/world/landmarks2.ts', 'game/src/world/landmark_catalog.ts', 'game/src/world/landmark-corrections.ts', 'game/src/world/metro-geometry.ts', 'game/src/world/metro-service.ts', 'game/src/world/metro-station-visuals.ts', 'game/src/world/street-lamps.ts'];
const compiledSourceCodeSha256 = Object.fromEntries(codeFiles.map(file => [file, digest(readFileSync(join(root, file)))]));
const signedArea = ring => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0) / 2;
const area = ring => Math.abs(signedArea(ring));
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const bounds = ring => [Math.min(...ring.map(p => p[0])), Math.max(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[1]))];
const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];
// Independent polygon clipping against actual renderer triangles/boxes, rather
// than calling the clearance module's own clear() to grade its output.
function intersection(poly, cut) {
  if (signedArea(cut) < 0) cut = cut.slice().reverse();
  for (let k = 0; k < cut.length && poly.length; k++) {
    const a = cut[k], b = cut[(k + 1) % cut.length], out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], d = cross(a, b, p), e = cross(a, b, q);
      if (d >= 0) out.push(p);
      if ((d >= 0) !== (e >= 0)) { const t = d / (d - e); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    poly = out;
  }
  return poly;
}
const rectangle = (x, z, width, length, angle = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [
  x + Math.cos(angle) * width / 2 * u + Math.sin(angle) * length / 2 * v,
  z - Math.sin(angle) * width / 2 * u + Math.cos(angle) * length / 2 * v,
]);
const triangleKey = triangle => triangle.map(p => `${p[0].toFixed(5)},${p[2].toFixed(5)}`).sort().join(';');
const nonCar = /^(footway|path|steps|pedestrian|cycleway|bridleway|track)$/;
// These production draw colors identify girders, viaduct decks/parapets,
// concourse blocks and platform slabs. Canopies, trains and columns are outside
// this specific building-solid intersection oracle.
const metroColors = new Set(['#c2bdcc', '#c9c4d3', '#d4d0dc', '#d9d6de', '#cdc8d2']);
let destinationCalls = [];
globalThis.__destinationAudit = call => destinationCalls.push(call);

try {
  await build({ stdin: { contents: "export {buildTile} from './game/src/world/city';export {DESTINATION_IDENTITIES} from './game/src/world/destination-data';export {prepareRoadGrades,roadGradePatches,applyRoadGradePatches} from './game/src/world/road-grades';export {placeLandmarks} from './game/src/world/landmarks';export {metroCorridors,metroStationFrame} from './game/src/world/metro-geometry';export {initTemplates,TiledBatch,TPL} from './game/src/core/util';export {ShapeUtils,Vector2} from './game/node_modules/three/build/three.module.js';", resolveDir: root }, outfile: join(temp, 'audit.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
    // Observe production decorator calls in this temporary offline bundle only.
    // A transparent batch proxy records actual feature boxes; source files and
    // the renderer/clearance implementation remain untouched.
    plugins: [{ name: 'destination-audit-only', setup(b) { b.onLoad({ filter: /destination-recognition\.ts$/ }, args => ({ loader: 'ts', contents: readFileSync(args.path, 'utf8').replace('export function decorateDestinationBuilding(', 'function decorateDestinationBuildingImpl(') + `\nexport function decorateDestinationBuilding(building, records, C) {
      const boxes = [], cache = new Map();
      const B = new Proxy(C.B, { get(target, key) {
        if (!cache.has(key)) { const batch = target[key]; cache.set(key, { box(...args) { boxes.push(args); return batch.box(...args); } }); }
        return cache.get(key);
      } });
      const result = decorateDestinationBuildingImpl(building, records, { ...C, B });
      globalThis.__destinationAudit?.({ building, records, result, boxes }); return result;
    }\n` })); } }],
  });
  const m = await import(pathToFileURL(join(temp, 'audit.mjs'))); m.initTemplates();
  const core = JSON.parse(gunzipSync(readFileSync(join(root, 'game/public/city/core.pack.wasm'))));
  const changes = m.roadGradePatches(m.prepareRoadGrades(core.roads));
  const landmarks = m.placeLandmarks(core.origin, core.packs.flatMap(p => p.tiles));
  const available = new Set(core.packs.flatMap(p => p.tiles.map(t => t.join('_'))));
  const wanted = new Set();
  const includeBounds = b => {
    for (let x = Math.floor(b[0] / 1000); x <= Math.floor(b[1] / 1000); x++) for (let z = Math.floor(b[2] / 1000); z <= Math.floor(b[3] / 1000); z++) {
      const key = `${x}_${z}`; if (available.has(key)) wanted.add(key);
    }
  };
  // Conservative complete segment bounds also include long spans crossing
  // cells that contain neither endpoint. Pad roads for modeled merge lanes.
  for (const road of core.roads) if (road.elev?.some(y => y > 1.2)) for (let i = 1; i < road.pts.length; i++) {
    const b = bounds([road.pts[i - 1], road.pts[i]]), pad = Math.max(road.w / 2, 4.2) + 8;
    includeBounds([b[0] - pad, b[1] + pad, b[2] - pad, b[3] + pad]);
  }
  const corridors = m.metroCorridors(core.metro.lines);
  for (const corridor of corridors) for (let i = 1; i < corridor.center.pts.length; i++) {
    const b = bounds([corridor.center.pts[i - 1], corridor.center.pts[i]]); includeBounds([b[0] - 5, b[1] + 5, b[2] - 5, b[3] + 5]);
  }
  for (const station of core.metro.stations) {
    const frame = m.metroStationFrame(station, corridors); if (!frame) continue;
    includeBounds(bounds(rectangle(frame.cx, frame.cz, 26.8, 138, Math.atan2(frame.hx, frame.hz))));
  }
  // Architecture coverage must include every eligible source tile, including
  // campuses or offices away from the elevated-transport audit envelope.
  for (const record of m.DESTINATION_IDENTITIES) wanted.add(record.tile.join('_'));

  let draws = new Map(), metroBoxes = [], rooftopProps = [];
  const original = Object.fromEntries(['quad', 'tri', 'box', 'add'].map(method => [method, m.TiledBatch.prototype[method]]));
  for (const method of ['quad', 'tri']) m.TiledBatch.prototype[method] = function (...args) {
    (draws.get(this) || draws.set(this, []).get(this)).push({ method, points: args.slice(0, method === 'quad' ? 4 : 3) });
    return original[method].apply(this, args);
  };
  m.TiledBatch.prototype.box = function (...args) {
    const [x, y, z, w, h, length, color, options = {}] = args;
    if (metroColors.has(color)) metroBoxes.push({ ring: rectangle(x, z, w, length, options.ry || 0), bottom: y - h / 2, top: y + h / 2, kind: 'metro' });
    if ((w === 2.6 && h === 2.6 && length === 2.8) || (w === .06 && h === 1.6 && length === .06)) rooftopProps.push({ ring: rectangle(x, z, w, length, options.ry || 0), bottom: y - h / 2, top: y + h / 2, part: w === 2.6 ? 'room' : 'rebar' });
    return original.box.apply(this, args);
  };
  m.TiledBatch.prototype.add = function (...args) {
    const [template, x, y, z, w, h, length] = args;
    if (template === m.TPL.cyl6 && w === .62 && h === 1.3 && length === .62) rooftopProps.push({ ring: rectangle(x, z, w * 2, length * 2), bottom: y - h / 2, top: y + h / 2, part: 'tank' });
    return original.add.apply(this, args);
  };
  const destinationStats = { eligibleIdentityRecords: m.DESTINATION_IDENTITIES.length, eligibleSourceBuildings: new Set(m.DESTINATION_IDENTITIES.map(r => r.buildingId)).size,
    visitedSourceTiles: 0, survivingSourceBuildings: new Set(), decoratedSourceBuildings: new Set(), correctedSourceBuildings: new Set(), missingSourceBuildings: [],
    survivingSourceFragments: 0, decoratorCalls: 0, decoratedFragments: 0, zeroFeatureFragments: 0, renderedFeatures: 0, rejectedFeatures: 0, renderedRooftopSolids: 0,
    residualRoadFeatureIntersections: 0, residualMetroFeatureIntersections: 0, examples: [], byKind: {} };
  const stats = { wantedTiles: wanted.size, visitedTiles: [], sourceBuildings: 0, sourceBoards: 0, sourceDataUnchanged: true,
    retainedSourceSolids: 0, correctedSources: 0, correctedFragments: 0, fullyOmitted: [], maxFragmentsPerSource: 0,
    actualCarRoadTriangles: 0, actualNonCarTrianglesExcluded: 0, unmatchedRoadTriangles: 0, majorMetroBoxes: 0,
    residualRoadSolidIntersections: 0, residualMetroSolidIntersections: 0, residualExamples: [], maxTileBuildMs: 0, normalQualityRooftopProbes: [],
    sharedMall: { canonicalId: 'asian_amb', aliasId: 'sarath_city', sourceId: 'w574673965', canonicalSolidPieces: 0, aliasSolidPieces: 0,
      indexedSolidPlanAreaSumM2: 0, areaNote: 'Sum of indexed source-body pieces plus the clear arrival canopy, not a union or surveyed building area.', roadIntersections: 0, metroIntersections: 0 } };
  const start = performance.now(); let deadlineStopped = false;
  for (const pack of core.packs) {
    const keys = pack.tiles.map(t => t.join('_')).filter(key => wanted.has(key)); if (!keys.length) continue;
    const packedTiles = JSON.parse(gunzipSync(readFileSync(join(root, 'game/public/city', pack.file)))).tiles;
    for (const key of keys) {
      if (performance.now() - start > deadlineMs) { deadlineStopped = true; break; }
      const source = packedTiles[key]; if (!source) throw Error(`Missing source tile ${key}`);
      const before = digest(JSON.stringify(source));
      const zone = { ...source, roads: m.applyRoadGradePatches(source.roads, changes) };
      draws = new Map(); metroBoxes = []; destinationCalls = []; const tick = performance.now();
      const destinations = m.DESTINATION_IDENTITIES.filter(record => record.tile.join('_') === key);
      const city = m.buildTile(zone, { lowQ: true, metro: core.metro, landmarks, destinations });
      stats.maxTileBuildMs = Math.max(stats.maxTileBuildMs, performance.now() - tick);
      stats.visitedTiles.push(key); stats.sourceBuildings += source.buildings.length; stats.sourceBoards += source.boards.length;
      stats.sourceDataUnchanged &&= before === digest(JSON.stringify(source));
      for (const correction of city.buildingCorrections) {
        stats.correctedSources++; stats.correctedFragments += correction.fragments;
        stats.maxFragmentsPerSource = Math.max(stats.maxFragmentsPerSource, correction.fragments);
        if (!correction.fragments) stats.fullyOmitted.push({ tile: key, ...correction });
        if (destinations.some(r => r.buildingId === correction.sourceId)) destinationStats.correctedSourceBuildings.add(correction.sourceId);
      }
      const sourceIds = new Set(source.buildings.map(b => b.id));
      const allSolids = [...new Set([...city.buildingGrid.values()].flat())];
      const sourceSolids = allSolids.filter(b => sourceIds.has(b.sourceId || b.id));
      const destinationSolids = allSolids.filter(b => b.id.startsWith('destination_'));
      const sharedMallSolids = allSolids.filter(b => b.id.startsWith('lm_x_asian_amb_'));
      stats.sharedMall.canonicalSolidPieces += sharedMallSolids.length;
      stats.sharedMall.aliasSolidPieces += allSolids.filter(b => b.id.startsWith('lm_x_sarath_city_')).length;
      stats.sharedMall.indexedSolidPlanAreaSumM2 += sharedMallSolids.reduce((n, b) => n + area(b.ring), 0);
      const solids = [...sourceSolids, ...destinationSolids, ...sharedMallSolids];
      stats.retainedSourceSolids += sourceSolids.length;
      if (destinations.length) {
        destinationStats.visitedSourceTiles++;
        const surviving = new Set(sourceSolids.map(b => b.sourceId || b.id));
        for (const id of new Set(destinations.map(r => r.buildingId))) {
          if (surviving.has(id)) destinationStats.survivingSourceBuildings.add(id);
          else destinationStats.missingSourceBuildings.push({ tile: key, sourceId: id, correction: city.buildingCorrections.find(c => c.sourceId === id) || null,
            explanation: 'Source body was suppressed by existing landmark/airfield clearing, an invalid footprint, or full transport-clearance clipping; identity remains in the map inventory.' });
        }
        destinationStats.survivingSourceFragments += sourceSolids.filter(b => destinations.some(r => r.buildingId === (b.sourceId || b.id))).length;
      }
      destinationStats.renderedRooftopSolids += destinationSolids.length;
      const destinationBoxes = [];
      for (const call of destinationCalls) {
        destinationStats.decoratorCalls++;
        destinationStats.rejectedFeatures += call.result?.rejected || 0;
        if (!call.result || !call.result.features) { destinationStats.zeroFeatureFragments++; continue; }
        destinationStats.decoratedFragments++; destinationStats.decoratedSourceBuildings.add(call.building.sourceId || call.building.id);
        destinationStats.renderedFeatures += call.result.features;
        const kind = call.result.style.split('-source-')[0]; destinationStats.byKind[kind] = (destinationStats.byKind[kind] || 0) + 1;
        for (const args of call.boxes) {
          const [x,y,z,w,h,length,,options={}] = args;
          destinationBoxes.push({ ring: rectangle(x,z,w,length,options.ry || 0), bottom:y-h/2, top:y+h/2, id:call.building.id });
        }
      }
      const grid = new Map(), add = obstacle => {
        obstacle.bounds = bounds(obstacle.ring);
        const b = obstacle.bounds;
        for (let x = Math.floor(b[0] / 50); x <= Math.floor(b[1] / 50); x++) for (let z = Math.floor(b[2] / 50); z <= Math.floor(b[3] / 50); z++) {
          const cell = `${x},${z}`; (grid.get(cell) || grid.set(cell, []).get(cell)).push(obstacle);
        }
      };
      const surfaceByTriangle = new Map();
      for (const surface of new Set([...city.surfaceGrid.values()].flat())) if (surface.kind === 'road' && surface.e && surface.roadQuad) {
        const q = surface.roadQuad;
        for (const indices of [[0, 1, 2], [0, 2, 3]]) {
          const triangle = indices.map(i => q[i]); if (area(triangle.map(p => [p[0], p[2]])) < 1e-7) continue;
          const k = triangleKey(triangle), existing = surfaceByTriangle.get(k);
          // An identical paint triangle may belong to both a context road and
          // its owner. If either is a car road, retain the car classification.
          if (!existing || nonCar.test(existing.e.cls)) surfaceByTriangle.set(k, surface);
        }
      }
      const roadBuffers = city.buffers.filter(buffer => buffer.mat === 'road');
      const matches = batch => roadBuffers.some(buffer => {
        if (batch.pos.length !== buffer.pos.length) return false;
        for (let i = 0; i < batch.pos.length; i++) if (Math.fround(batch.pos[i]) !== buffer.pos[i]) return false;
        return true;
      });
      // Identify the actual road batch by exact comparison with its final
      // Float32 renderer buffers, then use its original double-precision calls.
      // This avoids float rounding turning a shared boundary into an overlap.
      for (const [batch, calls] of draws) {
        if (![...batch.tiles.values()].some(matches)) continue;
        for (const call of calls) for (const indices of call.method === 'quad' ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]]) {
          const points = indices.map(i => call.points[i]), ring = points.map(p => [p[0], p[2]]);
          if (area(ring) < 1e-7) continue;
          const surface = surfaceByTriangle.get(triangleKey(points));
          if (!surface) { stats.unmatchedRoadTriangles++; continue; }
          if (nonCar.test(surface.e.cls)) { stats.actualNonCarTrianglesExcluded++; continue; }
          const elevations = surface.roadQuad.map(p => p[1]), low = Math.min(...elevations), high = Math.max(...elevations);
          add({ ring, bottom: low > 1.2 ? low - 1 : -.1, top: high + 4.8, kind: 'road', id: surface.e.id }); stats.actualCarRoadTriangles++;
        }
      }
      for (const box of metroBoxes) { add(box); stats.majorMetroBoxes++; }
      for (const feature of destinationBoxes) {
        const b = bounds(feature.ring), nearby = new Set();
        for (let x = Math.floor(b[0] / 50); x <= Math.floor(b[1] / 50); x++) for (let z = Math.floor(b[2] / 50); z <= Math.floor(b[3] / 50); z++) for (const object of grid.get(`${x},${z}`) || []) {
          if (feature.top > object.bottom + .01 && feature.bottom < object.top - .01 && overlaps(b, object.bounds)) nearby.add(object);
        }
        const found = new Set();
        for (const object of nearby) if (!found.has(object.kind) && area(intersection(feature.ring, object.ring)) > .002) {
          found.add(object.kind);
          if (building.id.startsWith('lm_x_asian_amb_')) {
            if (object.kind === 'road') stats.sharedMall.roadIntersections++; else stats.sharedMall.metroIntersections++;
          }
          if (object.kind === 'road') destinationStats.residualRoadFeatureIntersections++; else destinationStats.residualMetroFeatureIntersections++;
          if (destinationStats.examples.length < 20) destinationStats.examples.push({tile:key,building:feature.id,kind:object.kind,sourceRoad:object.id});
        }
      }
      for (const building of solids) {
        const b = bounds(building.ring), nearby = new Set();
        for (let x = Math.floor(b[0] / 50); x <= Math.floor(b[1] / 50); x++) for (let z = Math.floor(b[2] / 50); z <= Math.floor(b[3] / 50); z++) for (const object of grid.get(`${x},${z}`) || []) {
          if (building.h > object.bottom + .01 && object.top > 0 && overlaps(b, object.bounds)) nearby.add(object);
        }
        if (!nearby.size) continue;
        const triangles = m.ShapeUtils.triangulateShape(building.ring.map(p => new m.Vector2(...p)), []).map(t => t.map(i => building.ring[i]));
        const found = new Set();
        for (const object of nearby) {
          if (found.has(object.kind)) continue;
          if (!triangles.some(triangle => area(intersection(triangle, object.ring)) > .002)) continue;
          found.add(object.kind);
          if (object.kind === 'road') stats.residualRoadSolidIntersections++; else stats.residualMetroSolidIntersections++;
          if (stats.residualExamples.length < 20) stats.residualExamples.push({ tile: key, building: building.id, kind: object.kind, ...(object.id ? { sourceRoad: object.id } : {}) });
        }
      }
      if (key === '0_-1' || key === '-13_-4') {
        draws = new Map(); metroBoxes = []; rooftopProps = [];
        m.buildTile(zone, { lowQ: false, metro: core.metro, landmarks, destinations });
        const probe = { tile: key, roomDraws: 0, tankDraws: 0, rebarDraws: 0, residualRoadOrMetroIntersections: 0 };
        for (const prop of rooftopProps) {
          probe[`${prop.part}Draws`]++;
          const b = bounds(prop.ring), nearby = new Set();
          for (let x = Math.floor(b[0] / 50); x <= Math.floor(b[1] / 50); x++) for (let z = Math.floor(b[2] / 50); z <= Math.floor(b[3] / 50); z++) for (const object of grid.get(`${x},${z}`) || []) {
            if (prop.top > object.bottom + .01 && prop.bottom < object.top - .01 && overlaps(b, object.bounds)) nearby.add(object);
          }
          if ([...nearby].some(object => area(intersection(prop.ring, object.ring)) > .002)) probe.residualRoadOrMetroIntersections++;
        }
        stats.normalQualityRooftopProbes.push(probe);
      }
      if (stats.visitedTiles.length % 75 === 0) console.log('PROGRESS', JSON.stringify({ visited: stats.visitedTiles.length, elapsedMs: Math.round(performance.now() - start), roadConflicts: stats.residualRoadSolidIntersections, metroConflicts: stats.residualMetroSolidIntersections }));
    }
    if (deadlineStopped) break;
  }
  for (const [method, fn] of Object.entries(original)) m.TiledBatch.prototype[method] = fn;
  const destinationCoverage = { ...destinationStats, survivingSourceBuildings: [...destinationStats.survivingSourceBuildings].sort(),
    decoratedSourceBuildings: [...destinationStats.decoratedSourceBuildings].sort(), correctedSourceBuildings: [...destinationStats.correctedSourceBuildings].sort(),
    survivingSourceBuildingCount: destinationStats.survivingSourceBuildings.size, decoratedSourceBuildingCount: destinationStats.decoratedSourceBuildings.size,
    correctedSourceBuildingCount: destinationStats.correctedSourceBuildings.size, suppressedSourceBuildingCount: destinationStats.missingSourceBuildings.length,
    survivingSourceBuildingsWithoutFeatures: [...destinationStats.survivingSourceBuildings].filter(id => !destinationStats.decoratedSourceBuildings.has(id)).sort().map(id => ({ sourceId: id,
      names: m.DESTINATION_IDENTITIES.filter(r => r.buildingId === id).map(r => r.name), transportCorrected: destinationStats.correctedSourceBuildings.has(id),
      explanation: 'No candidate facade/roof feature fits the surviving source fragment and clearance gates; no replacement edge or shape is invented.' })) };
  const result = { generatedAt: new Date().toISOString(), buildCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceCodeSha256: compiledSourceCodeSha256,
    sourceCodeUnchangedDuringAudit: codeFiles.every(file => digest(readFileSync(join(root, file))) === compiledSourceCodeSha256[file]),
    validation: 'Offline source and actual renderer geometry; not browser driving or delivery verification.',
    scope: 'All shipped tiles within conservative elevated-road segment, normalized metro segment and full station bounds, including intermediate cells on long spans, plus every eligible destination source tile. Source building and destination rooftop solids versus actual car-road draw triangles and major metro girder/deck/parapet/concourse/platform draw boxes; destination feature boxes also tested independently at their actual vertical range. The shared Sarath City / Asian AMB mall body is additionally checked, with zero duplicate alias bodies required. Two source tiles additionally capture actual normal-quality rooftop rooms, tanks and rebar. Canopies, columns, trains, other hero landmarks and physical-phone controls are outside this oracle.',
    tolerance: { minimumPlanarIntersectionAreaM2: .002, minimumVerticalOverlapM: .01 },
    elapsedMs: Math.round(performance.now() - start), deadlineStopped, ...stats, destinationCoverage };
  result.maxTileBuildMs = Math.round(result.maxTileBuildMs);
  writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log('AUDIT_RESULT', JSON.stringify({ ...result, visitedTiles: result.visitedTiles.length, sourceCodeSha256: undefined,
    destinationCoverage: {...destinationCoverage, survivingSourceBuildings: destinationCoverage.survivingSourceBuildings.length, decoratedSourceBuildings: destinationCoverage.decoratedSourceBuildings.length, correctedSourceBuildings:destinationCoverage.correctedSourceBuildings.length} }));
  if (deadlineStopped || !result.sourceDataUnchanged || !result.sourceCodeUnchangedDuringAudit || result.unmatchedRoadTriangles || result.residualRoadSolidIntersections || result.residualMetroSolidIntersections || destinationStats.residualRoadFeatureIntersections || destinationStats.residualMetroFeatureIntersections || !stats.sharedMall.canonicalSolidPieces || stats.sharedMall.aliasSolidPieces || result.normalQualityRooftopProbes.some(p => p.residualRoadOrMetroIntersections)) process.exitCode = 1;
} finally { delete globalThis.__destinationAudit; rmSync(temp, { recursive: true, force: true }); }

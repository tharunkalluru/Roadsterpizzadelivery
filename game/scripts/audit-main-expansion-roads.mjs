// Offline source/geometry inventory. This is not an FPS benchmark or a claim
// that every road has been manually driven on a phone.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-road-inventory-'));
const unpack = async file => JSON.parse(gunzipSync(await readFile(join(root, 'public/city', file))).toString());
try {
  await build({ stdin: { contents: `export {prepareRoadGrades,roadGradeReport} from './src/world/road-grades'; export {roadRibbon} from './src/world/bridge-clearance'; export {roadSpansMultipleTiles,clipRoadQuadToTile} from './src/world/road-surface'; export {isORR} from './src/world/expressway';`, resolveDir: root, loader: 'ts' }, outfile: join(temp, 'inventory.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { prepareRoadGrades, roadGradeReport, roadRibbon, roadSpansMultipleTiles, clipRoadQuadToTile, isORR } = await import(pathToFileURL(join(temp, 'inventory.mjs')));
  const core = await unpack('core.pack.wasm'), roads = prepareRoadGrades(core.roads), copies = new Map(), playable = new Set(core.packs.flatMap(p => p.tiles.map(([i, j]) => `${i}_${j}`)));
  const inventory = { coreRoads: roads.length, packs: 0, tiles: 0, tileRoadRecords: 0, uniqueTileRoads: 0, sourceOwnedRecords: 0, contextRecords: 0, malformedRoads: [], missingReferencedTiles: [] };
  for (const pack of core.packs) {
    const data = await unpack(pack.file); inventory.packs++;
    for (const [i, j] of pack.tiles) if (!data.tiles[`${i}_${j}`]) inventory.missingReferencedTiles.push(`${i}_${j}`);
    for (const [tile, zone] of Object.entries(data.tiles)) {
      inventory.tiles++;
      for (const e of zone.roads) {
        inventory.tileRoadRecords++; e.ctx ? inventory.contextRecords++ : inventory.sourceOwnedRecords++;
        const list = copies.get(e.id) || new Set(); list.add(tile); copies.set(e.id, list);
        if (e.pts.length < 2 || !Number.isFinite(e.w) || e.w <= 0 || e.pts.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))) || e.elev?.some(y => !Number.isFinite(y))) inventory.malformedRoads.push({ id: e.id, tile });
      }
    }
  }
  inventory.uniqueTileRoads = copies.size;
  let renderedQuads = 0, nonFiniteQuads = 0, zeroAreaQuads = 0;
  const longContextRoads = [], missingLocalCopies = [];
  const area = q => Math.abs((q[1][0] - q[0][0]) * (q[2][2] - q[0][2]) - (q[1][2] - q[0][2]) * (q[2][0] - q[0][0])) / 2 + Math.abs((q[2][0] - q[0][0]) * (q[3][2] - q[0][2]) - (q[2][2] - q[0][2]) * (q[3][0] - q[0][0])) / 2;
  for (const e of roads) {
    const ribbon = roadRibbon(e, roads), localLong = !isORR(e) && !e.expressway?.ramp && !e.elev?.some(y => Math.abs(y) > .001) && roadSpansMultipleTiles(e.pts);
    let required = new Set(), clippedTriangles = 0, originalArea = 0, clippedArea = 0;
    for (const q of ribbon.quads) {
      renderedQuads++; if (q.some(p => p.some(v => !Number.isFinite(v)))) nonFiniteQuads++;
      if (area(q) < 1e-8) zeroAreaQuads++;
      if (!localLong) continue;
      originalArea += area(q);
      const xs = q.map(p => p[0]), zs = q.map(p => p[2]);
      for (let i = Math.floor(Math.min(...xs) / 1000); i <= Math.floor(Math.max(...xs) / 1000); i++) for (let j = Math.floor(Math.min(...zs) / 1000); j <= Math.floor(Math.max(...zs) / 1000); j++) {
        const pieces = clipRoadQuadToTile(q, i, j); clippedTriangles += pieces.length;
        for (const piece of pieces) clippedArea += area(piece);
        const key = `${i}_${j}`; if (pieces.length && playable.has(key)) required.add(key);
      }
    }
    if (localLong) {
      assert.ok(Math.abs(originalArea - clippedArea) <= Math.max(.001, originalArea * 1e-7), `clipping area changed ${e.id}: ${originalArea}/${clippedArea}`);
      for (const tile of required) if (!copies.get(e.id)?.has(tile)) missingLocalCopies.push({ id: e.id, tile });
      longContextRoads.push({ id: e.id, name: e.name, sourceVertices: e.pts.length, neededPlayableTiles: required.size, availableContextTiles: copies.get(e.id)?.size || 0, clippedTriangles, maximumAreaError: Math.abs(originalArea - clippedArea) });
    }
  }
  const endpoints = new Map();
  for (const e of roads) for (const [id, i] of [[e.from, 0], [e.to, e.pts.length - 1]]) if (id) (endpoints.get(id) || endpoints.set(id, []).get(id)).push({ road: e.id, p: e.pts[i], y: e.elev?.[i] || 0 });
  let mappedEndNodes = 0, mappedJunctionNodes = 0, maximumSharedNodePositionDifference = 0;
  for (const group of endpoints.values()) {
    group.length === 1 ? mappedEndNodes++ : mappedJunctionNodes++;
    for (const e of group) maximumSharedNodePositionDifference = Math.max(maximumSharedNodePositionDifference, Math.hypot(e.p[0] - group[0].p[0], e.p[1] - group[0].p[1]));
  }
  const grades = roadGradeReport(roads), report = { date: new Date().toISOString(), inventory, geometry: { renderedQuads, nonFiniteQuads, zeroAreaQuads, mappedEndNodes, mappedJunctionNodes, maximumSharedNodePositionDifference, longContextRoadCount: longContextRoads.length, missingLocalCopies, longContextRoads }, grades: { ...grades, bridgeClearance: { ...grades.bridgeClearance, crossings: undefined, ambiguities: undefined } }, limitations: ['Source records, finite rendered ribbons and tile-context coverage are inventoried citywide; hand-driven routes and actual obstacle checks are separate regression suites.', 'Mapped end nodes are retained as source boundaries/cul-de-sacs; no road links or underpasses are invented.', 'Existing uncertain crossing heights remain explicitly listed by the grade model rather than guessed to be real surveyed geometry.'] };
  assert.equal(inventory.malformedRoads.length, 0); assert.equal(inventory.missingReferencedTiles.length, 0); assert.equal(nonFiniteQuads, 0); assert.equal(missingLocalCopies.length, 0);
  const at = process.argv.indexOf('--report'); if (at >= 0) await writeFile(resolve(process.argv[at + 1]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ inventory, geometry: { renderedQuads, nonFiniteQuads, zeroAreaQuads, mappedEndNodes, mappedJunctionNodes, maximumSharedNodePositionDifference, longContextRoadCount: longContextRoads.length, missingLocalCopies: missingLocalCopies.length }, grades: { maxModelGrade: grades.maxModelGrade, modelSteepSegments: grades.modelSteepSegments, joinedEndpointMaxDifference: grades.joinedEndpointMaxDifference, ambiguityReasons: grades.bridgeClearance.ambiguityReasons } }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }

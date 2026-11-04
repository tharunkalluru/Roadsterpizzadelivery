import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = process.argv.indexOf('--output'), output = at < 0 ? undefined : process.argv[at + 1];
const dataAt = process.argv.indexOf('--data'), candidateData = dataAt < 0 ? undefined : process.argv[dataAt + 1];
if (!output || dataAt >= 0 && (!candidateData || candidateData.startsWith('--'))) throw Error('Use [--data CANDIDATE_JSON] --output NEW_FILE; this verifier does not activate source corrections.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dataPath = candidateData ? resolve(candidateData) : join(root, 'src/world/road-source-geodesic-data.json');
const dataBytes = await readFile(dataPath), data = JSON.parse(dataBytes);
const coreBytes = await readFile(join(root, 'public/city/core.pack.wasm'));
if (hash(coreBytes) !== data.sourceCorePackSHA256) throw Error('Raw source core binding changed.');
const core = JSON.parse(gunzipSync(coreBytes)), temp = await mkdtemp(join(tmpdir(), 'source-geodesic-verify-'));
const canonical = value => JSON.stringify(value, (_key, entry) => typeof entry === 'number' && Object.is(entry, -0) ? { $roadProfileNegativeZero: true } : entry);
try {
  const file = join(temp, 'api.mjs');
  await build({ stdin: { contents: `export * from './src/world/road-source-geodesic';`, resolveDir: root, loader: 'ts' }, outfile: file, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'error' });
  const api = await import(pathToFileURL(file));
  const before = canonical(core), normalized = api.applyVerifiedSourceRoadZone(core, data);
  if (normalized.report.mismatched.length || canonical(core) !== before || api.applyVerifiedSourceRoadZone(normalized.value, data).value !== normalized.value) throw Error('Actual raw core normalization failed or mutated source.');
  for (const key of ['metro', 'food', 'theatres', 'drops', 'places', 'packs', 'trafficSignals']) if (normalized.value[key] !== core[key]) throw Error('Source stage relocated a canonical/geographic object: ' + key);
  let copies = normalized.report.applied.length, zones = 0, tileCopies = 0, nodeUpdates = normalized.report.nodesApplied.length;
  const rows = [];
  for (const [pack, expectedHash] of Object.entries(data.sourcePackSHA256)) {
    const bytes = await readFile(join(root, 'public/city', pack));
    if (hash(bytes) !== expectedHash) throw Error('Raw tile source binding changed: ' + pack);
    const tiles = JSON.parse(gunzipSync(bytes)).tiles;
    for (const [key, zone] of Object.entries(tiles)) {
      const original = canonical(zone), result = api.applyVerifiedSourceRoadZone(zone, data);
      if (result.report.mismatched.length || canonical(zone) !== original || api.applyVerifiedSourceRoadZone(result.value, data).value !== result.value) throw Error('Actual raw tile normalization failed: ' + pack + ':' + key + ':' + result.report.mismatched.join(','));
      for (const field of ['buildings', 'boards', 'furniture', 'areas', 'metro', 'theatres', 'food', 'places']) if (result.value[field] !== zone[field]) throw Error('Tile geographic objects changed: ' + pack + ':' + key + ':' + field);
      zones++; copies += result.report.applied.length; tileCopies += result.report.applied.length; nodeUpdates += result.report.nodesApplied.length;
      if (result.report.applied.length || result.report.nodesApplied.length) rows.push({ pack, tile: key, ...result.report });
    }
  }
  if (copies !== data.roads.reduce((sum, road) => sum + road.copies.length, 0)) throw Error('Not every actual core/owner/context copy was verified.');
  const report = { scope: 'Actual raw core/tile source-stage application only. No activation, generic cache/LP rebase, rendering or physical driving acceptance.', generationID: data.generationID,
    sourceDataPath: dataPath, sourceDataSHA256: hash(dataBytes), rawCorePackSHA256: hash(coreBytes), rawCanonicalRoadsSHA256: hash(canonical(core.roads)),
    correctedCanonicalRoadsSHA256: hash(canonical(normalized.value.roads)),
    summary: { coreRoadsApplied: normalized.report.applied.length, tileRoadCopiesApplied: tileCopies, allCopies: copies, sourcePacks: Object.keys(data.sourcePackSHA256).length, sourceTiles: zones, nodeUpdates, atomic: true, idempotent: true, rawObjectsUnchanged: true, geographicObjectsUnchanged: true }, coreReport: normalized.report, tiles: rows };
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ...report.summary, correctedCanonicalRoadsSHA256: report.correctedCanonicalRoadsSHA256, output: resolve(output) }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }

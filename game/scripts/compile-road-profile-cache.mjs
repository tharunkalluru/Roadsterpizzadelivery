import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { build } from 'esbuild';

const MANIFEST = 'src/world/road-profile-cache-manifest.json';
const ASSET = 'public/city/road-profiles-v1.pack.wasm';
const CORE = 'public/city/core.pack.wasm';
const SOURCE_STAGE = 'src/world/road-source-stage-manifest.json';
const SOURCE_DATA = 'src/world/road-source-geodesic-data.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => JSON.parse((bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes).toString('utf8'));
// Standard JSON erases negative zero. Preserve it explicitly so generated road
// coordinates/heights survive the cache exactly, including their IEEE sign.
const serialize = value => JSON.stringify(value, (_key, item) => {
  if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, '$roadProfileNegativeZero')) throw new Error('Reserved road profile encoding in source data.');
  return typeof item === 'number' && Object.is(item, -0) ? { $roadProfileNegativeZero: true } : item;
});
const parse = bytes => JSON.parse(bytes.toString('utf8'), (_key, item) => item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 1 && item.$roadProfileNegativeZero === true ? -0 : item);
async function sourceCore(root, coreBytes) {
  const manifest = JSON.parse(await readFile(join(root, SOURCE_STAGE), 'utf8'));
  const dataBytes = await readFile(join(root, SOURCE_DATA));
  if (manifest.version !== 1 || manifest.enabled !== true || hash(coreBytes) !== manifest.sourceCorePackSHA256 || hash(dataBytes) !== manifest.dataSHA256) throw Error('Enable and verify the bound source road stage before generating a release cache.');
  const temp = await mkdtemp(join(tmpdir(), 'roadster-source-stage-'));
  try {
    const modulePath = join(temp, 'source-stage.mjs');
    await build({ entryPoints: [join(root, 'src/world/road-source-stage.ts')], outfile: modulePath, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
    const engine = await import(pathToFileURL(modulePath).href);
    const core = engine.applySourceRoadStage(decode(coreBytes));
    if (core.sourceRoadGeometryGeneration !== manifest.generationID) throw Error('Source road generation was not installed.');
    return core;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
function validateSourceGeometry(roads) {
  if (!Array.isArray(roads) || !roads.every(e => e && typeof e.id === 'string' && e.id.length > 0 && Number.isFinite(e.w) && e.w > 0 && Number.isInteger(e.lanes) && e.lanes > 0 && Array.isArray(e.pts) && e.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v))) && (e.elev === null || Array.isArray(e.elev) && e.elev.length === e.pts.length && e.elev.every(v => typeof v === 'number' && Number.isFinite(v))))) throw new Error('Invalid source road geometry for a prepared cache.');
}
function requireFiniteNumbers(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Prepared road cache metadata contains a nonfinite number.');
  if (value && typeof value === 'object') for (const item of Object.values(value)) requireFiniteNumbers(item);
}
function requireIdenticalGeometry(a, b) {
  if (a.length !== b.length) throw new Error('Cached road inventory differs from ordinary preparation.');
  for (let r = 0; r < a.length; r++) {
    const before = a[r], after = b[r];
    if (before.id !== after.id || before.pts.length !== after.pts.length || before.elev?.length !== after.elev?.length || !Object.is(before.w, after.w) || !Object.is(before.lanes, after.lanes)) throw new Error(`Cached road shape differs: ${before.id}`);
    for (let i = 0; i < before.pts.length; i++) for (const [x, y] of [[before.pts[i][0], after.pts[i][0]], [before.pts[i][1], after.pts[i][1]], [before.elev?.[i], after.elev?.[i]]]) if (!Object.is(x, y)) throw new Error(`Cached road numeric representation differs: ${before.id}:${i}`);
  }
}
async function inputHash(root) {
  const files = [];
  const collect = async dir => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const at = join(dir, entry.name).split('\\').join('/');
      if (entry.isSymbolicLink()) throw new Error(`Linked road cache input: ${at}`);
      if (entry.isDirectory()) await collect(at);
      else if (entry.isFile() && at !== MANIFEST) files.push(at);
    }
  };
  await collect('src');
  files.push('package.json', 'package-lock.json', 'scripts/compile-road-profile-cache.mjs');
  const digest = createHash('sha256');
  for (const at of files.sort()) { const bytes = await readFile(join(root, at)); digest.update(at).update('\0').update(String(bytes.length)).update('\0').update(bytes); }
  return digest.digest('hex');
}

/** Build gate: generated data is accepted only for the exact source core and
 * preparation implementation. It never silently refreshes an unreviewed model. */
export async function verifyRoadProfileCache(root) {
  root = resolve(root);
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'));
  if (manifest.version !== 1 || manifest.enabled !== true || manifest.asset !== 'road-profiles-v1.pack.wasm') throw new Error('Generate and review the prepared road cache before release.');
  if (![manifest.payloadBytes, manifest.gzipBytes].every(n => Number.isSafeInteger(n) && n >= 2 && n <= 32 * 1024 * 1024)) throw new Error('Prepared road cache exceeds the bounded startup format.');
  const coreBytes = await readFile(join(root, CORE)), core = await sourceCore(root, coreBytes);
  validateSourceGeometry(core.roads);
  if (hash(coreBytes) !== manifest.sourceCorePackSha256 || hash(serialize(core.roads)) !== manifest.sourceRoadsSha256 || core.sourceRoadGeometryGeneration !== manifest.sourceRoadGeometryGeneration || core.roads.length !== manifest.sourceRoadCount || await inputHash(root) !== manifest.generatorInputsSha256) throw new Error('Prepared road cache is stale; regenerate and revalidate it.');
  const gzip = await readFile(join(root, ASSET));
  if (gzip.length !== manifest.gzipBytes || hash(gzip) !== manifest.gzipSha256) throw new Error('Prepared road cache transport differs from the reviewed manifest.');
  const bytes = gunzipSync(gzip, { maxOutputLength: manifest.payloadBytes });
  if (bytes.length !== manifest.payloadBytes || hash(bytes) !== manifest.payloadSha256) throw new Error('Prepared road cache payload differs from the reviewed manifest.');
  const payload = parse(bytes);
  if (payload.version !== 1 || payload.sourceRoadCount !== core.roads.length || payload.report?.roads !== core.roads.length || !Array.isArray(payload.patches) || payload.patches.length !== manifest.patchCount) throw new Error('Invalid prepared road cache inventory.');
  return { sourceRoads: core.roads.length, patches: payload.patches.length, payloadBytes: bytes.length, gzipBytes: gzip.length, payloadSha256: manifest.payloadSha256 };
}

export async function compileRoadProfileCache(root) {
  root = resolve(root);
  const before = await inputHash(root), coreBytes = await readFile(join(root, CORE)), core = await sourceCore(root, coreBytes);
  validateSourceGeometry(core.roads);
  const temp = await mkdtemp(join(tmpdir(), 'roadster-road-cache-'));
  let payload, bytes;
  try {
    const modulePath = join(temp, 'prepare.mjs');
    await build({ entryPoints: [join(root, 'src/world/road-grades.ts')], outfile: modulePath, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
    const engine = await import(pathToFileURL(modulePath).href);
    const prepared = engine.prepareRoadGrades(core.roads);
    payload = { version: 1, sourceRoadCount: core.roads.length, patches: engine.roadGradePatches(prepared), report: engine.roadGradeReport(prepared) };
    requireFiniteNumbers(payload.report);
    bytes = Buffer.from(serialize(payload));
    // Verify the serialized format actually fetched by the browser, including
    // numeric representations that JSON equality alone would conceal.
    const restored = parse(bytes);
    const cloned = structuredClone(core.roads), installed = engine.installPreparedRoadCache(cloned, restored);
    if (!installed || JSON.stringify(installed) !== JSON.stringify(prepared) || JSON.stringify(engine.roadGradePatches(installed)) !== JSON.stringify(payload.patches)) throw new Error('Cached road model differs from ordinary preparation.');
    requireIdenticalGeometry(prepared, installed);
    if (JSON.stringify(engine.roadGradeReport(installed)) !== JSON.stringify(payload.report)) throw new Error('Cached road report differs from ordinary preparation.');
  } finally { await rm(temp, { recursive: true, force: true }); }
  if (await inputHash(root) !== before) throw new Error('Road preparation source changed during cache generation. Retry from a held source.');
  const gzip = gzipSync(bytes, { level: 9 });
  if (Math.max(bytes.length, gzip.length) > 32 * 1024 * 1024) throw new Error('Prepared road cache exceeds the bounded startup format.');
  const manifest = { version: 1, enabled: true, asset: 'road-profiles-v1.pack.wasm', sourceRoadCount: core.roads.length, patchCount: payload.patches.length,
    sourceCorePackSha256: hash(coreBytes), sourceRoadsSha256: hash(serialize(core.roads)), generatorInputsSha256: before,
    sourceRoadGeometryGeneration: core.sourceRoadGeometryGeneration,
    payloadSha256: hash(bytes), payloadBytes: bytes.length, gzipSha256: hash(gzip), gzipBytes: gzip.length };
  await mkdir(join(root, 'public/city'), { recursive: true });
  await writeFile(join(root, ASSET), gzip);
  await writeFile(join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return verifyRoadProfileCache(root);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = process.cwd(), verify = process.argv.includes('--verify');
  try { console.log(JSON.stringify(await (verify ? verifyRoadProfileCache(root) : compileRoadProfileCache(root)))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

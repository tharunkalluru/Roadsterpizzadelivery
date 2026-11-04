import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url)), output = process.argv[2];
if (!output) throw Error('Provide a new output JSON path.');
const temp = await mkdtemp(join(tmpdir(), 'road-canonical-pavement-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const path = join(temp, 'review.mjs');
  const built = await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { gunzipSync } from 'node:zlib';
    import { createHash } from 'node:crypto';
    import { actualWorldWorker } from './tests/fixtures/actual-world-worker';
    import { roadRibbon } from './src/world/bridge-clearance';
    import { canonicalAuxiliaryLaneEnds } from './src/world/expressway';
    import { applyRoadGradePatches } from './src/world/road-grades';
    import { applyVerifiedSourceRoadZone, type VerifiedSourceRoadGeometry } from './src/world/road-source-geodesic';
    import sourceGeometry from './src/world/road-source-geodesic-data.json';
    export async function review() {
      const hash = b => createHash('sha256').update(b).digest('hex'), f = await actualWorldWorker({ allowInactive: true });
      try {
        const bindings = {
          '515af5fd-bd4_0': ['d889b874-28a_0', 'ca271e34-763_0'], 'c7cc1887-36e_0': ['1656d979-904_0', 'bce03595-a27_0'],
          'aa2e2270-ebc_0': [null, '059f61b3-975_0'], 'd6572402-4e2_0': ['664bfec3-f38_0', null],
          'ad427c5d-668_0': ['6be178c5-b2b_0', null], 'c32df37f-b8f_0': [null, '62e31cf5-259_0'],
        };
        const core = new Map(f.core.roads.map(e => [e.id, e])), canonical = canonicalAuxiliaryLaneEnds(f.core.roads);
        const patches = f.initialization.roadGrades, legacy = patches.map(({ name, expressway, auxiliaryLaneEnds, ...p }) => p);
        const proof = Object.entries(bindings).map(([id, neighbors]) => {
          const e = core.get(id)!;
          const ramps = neighbors.map((ramp, end) => { if (!ramp) return null; const r = core.get(ramp)!;
            assert.equal(r.cls, 'motorway_link'); assert.equal(r.expressway?.ramp, true);
            const node = end ? e.to : e.from; assert.ok(node && [r.from, r.to].includes(node));
            return { id: r.id, from: r.from, to: r.to, sharedNode: node, cls: r.cls, expressway: r.expressway };
          });
          const expectedMask = (neighbors[0] ? 1 : 0) | (neighbors[1] ? 2 : 0);
          assert.equal(canonical.get(id), expectedMask); assert.equal(patches.find(p => p.id === id).auxiliaryLaneEnds, expectedMask);
          return { id, from: e.from, to: e.to, canonicalEndpointMask: expectedMask, ramps };
        });
        const sourcePacks = {}, copies = [];
        for (const file of ['p-5_-1.pack.wasm', 'p-5_-2.pack.wasm', 'p-5_-6.pack.wasm', 'p-6_-6.pack.wasm', 'p-7_-6.pack.wasm']) {
          const path = 'public/city/packs/' + file, bytes = readFileSync(path); sourcePacks[path] = hash(bytes);
          for (const raw of Object.values(JSON.parse(gunzipSync(bytes).toString()).tiles) as any[]) {
            if (!raw.roads.some(e => bindings[e.id])) continue;
            const source = f.core.sourceRoadGeometryGeneration ? applyVerifiedSourceRoadZone(raw, sourceGeometry as unknown as VerifiedSourceRoadGeometry) : { value: raw, report: { mismatched: [] } };
            assert.deepEqual(source.report.mismatched, []);
            const roads = applyRoadGradePatches(source.value.roads, patches), previous = applyRoadGradePatches(source.value.roads, legacy);
            for (const e of roads) if (bindings[e.id]) {
              const reference = roadRibbon(core.get(e.id)!, f.core.roads), current = roadRibbon(e, roads), old = roadRibbon(previous.find(o => o.id === e.id)!, previous);
              const residual = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
              assert.deepEqual(current.L, reference.L); assert.deepEqual(current.R, reference.R); assert.deepEqual(current.quads, reference.quads);
              copies.push({ id: e.id, tile: raw.i + '_' + raw.j, pack: path, context: !!e.ctx, sourceExpresswayRetained: JSON.stringify(e.expressway) === JSON.stringify(core.get(e.id)!.expressway),
                presentGenuineRamps: bindings[e.id].filter(Boolean).filter(id => source.value.roads.some(r => r.id === id)),
                legacyMaxLMetres: residual(old.L, reference.L), legacyMaxRMetres: residual(old.R, reference.R), currentMaxLMetres: residual(current.L, reference.L), currentMaxRMetres: residual(current.R, reference.R), exactStructuralQuads: true });
            }
          }
          assert.equal(hash(readFileSync(path)), sourcePacks[path]);
        }
        const timings = [];
        for (let i = 0; i < 21; i++) { const start = performance.now(); canonicalAuxiliaryLaneEnds(f.core.roads); timings.push(performance.now() - start); }
        timings.sort((a, b) => a - b); f.verifySources();
        return { version: 1, scope: 'Current actual World constructor and captured worker initialization, then production patch application and roadRibbon over immutable packed owner/context inputs. CPU Node adapters; no browser, solver, model activation or release acceptance.',
          pass: true, releaseApproved: false, currentModelOverlay: f.world.modeledRoadReport, currentSourceRoadGeometryGeneration: f.core.sourceRoadGeometryGeneration ?? null,
          sourceCorePackSHA256: f.sourceCoreSHA256, sourcePacks, genuineRampProof: proof, copies,
          summary: { roads: proof.length, genuineRamps: proof.flatMap(p => p.ramps).filter(Boolean).length, copies: copies.length, owners: copies.filter(p => !p.context).length, contexts: copies.filter(p => p.context).length,
            legacyRightBoundaryMismatches: copies.filter(p => p.legacyMaxRMetres > 3.49).length, currentExactRibbonCopies: copies.length,
            maximumCurrentLMetres: Math.max(...copies.map(p => p.currentMaxLMetres)), maximumCurrentRMetres: Math.max(...copies.map(p => p.currentMaxRMetres)) },
          compactMetadata: { fullCoreRoads: f.core.roads.length, canonicalMainlineMasks: canonical.size, patchCount: patches.length, perVertexValuesAdded: 0,
            endpointMaskJSONBytesAdded: Buffer.byteLength(JSON.stringify(patches)) - Buffer.byteLength(JSON.stringify(patches.map(({ auxiliaryLaneEnds, ...p }) => p))),
            allMetadataJSONBytesAdded: Buffer.byteLength(JSON.stringify(patches)) - Buffer.byteLength(JSON.stringify(legacy)),
            fullInventoryIndexMedianMilliseconds: timings[Math.floor(timings.length / 2)], fullInventoryIndexMaximumMilliseconds: timings.at(-1), measurementRuns: timings.length,
            bound: 'One integer per ORR edge and explicit null clears on other patched roads; one indexed scan of full-core ramp incidence per publication; existing 3.5m/220m taper and core XZ/Y/width/lane capacity unchanged.' } };
      } finally { f.dispose(); }
    }
  ` }, outfile: path, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const inputs = {};
  for (const file of Object.keys(built.metafile.inputs).filter(p => /^(src|tests)\//.test(p))) inputs[file] = sha(await readFile(resolve(root, file)));
  inputs['scripts/qa/review-canonical-pavement-metadata.mjs'] = sha(await readFile(fileURLToPath(import.meta.url)));
  const result = await (await import(pathToFileURL(path).href)).review();
  for (const [file, hash] of Object.entries(inputs)) if (sha(await readFile(resolve(root, file))) !== hash) throw Error('Source changed during review: ' + file);
  await writeFile(resolve(output), JSON.stringify({ ...result, inputs }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: resolve(output), summary: result.summary, compactMetadata: result.compactMetadata }));
} finally { await rm(temp, { recursive: true, force: true }); }

import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { roadProfileInputFingerprint } from './road-profile-inputs.mjs';
import { loadRoadProfileLimits, bindLocalGradeChangePolicies, checkRoadProfileLimits, GLOBAL_GRADE_CHANGE_PER_METRE } from './road-profile-limits.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), data = JSON.parse(await readFile(resolve(root, 'src/world/road-profile-corrections.json'), 'utf8'));
assert.equal(data.version, 1); assert.ok(data.profiles.length, 'No verified offline profile corrections are available.');
assert.equal(data.releaseScope, 'reported-road-global-v1', 'The global reported-road model must be generated and physically reviewed before release.');
assert.equal(data.solver?.sourceMetadataCoverage?.complete, true, 'Actual crossing and used source-path metadata must be complete.');
assert.deepEqual(data.solver.sourceMetadataCoverage.unresolvedPrefixes, [], 'Unknown source records cannot become ground-level authority.');
assert.equal(data.solver.sourceMetadataCoverage.sourceReferenceSHA256, data.solver.provenance?.inputs?.additional_source_reference?.sha256, 'Crossing source metadata is not bound to the solved model.');
assert.equal(data.solver?.coreContextCoverage?.complete, true, 'Generated-profile context preparation must be complete.');
assert.equal(data.solver.coreContextCoverage.contextAdditionDoesNotGrantPrimaryHeightAuthority, true, 'Conservative context cannot become primary height authority.');
assert.equal(data.solver.coreContextCoverage.sourceCoverageSHA256, data.solver.provenance?.inputs?.complete_core_context?.sha256, 'Core context coverage is not bound to the solved model.');
assert.ok(data.geometry?.roads?.length > 2 && Object.keys(data.geometry.nodes || {}).length > 0 && data.geometry.tileRoads?.length > 0,
  'The global core/node/tile geometry overlay is absent; the earlier two-profile Tarnaka candidate cannot unlock release.');
assert.ok(data.profiles.filter(p => p.stage === 'conditionedWorld').length > 2, 'A global conditioned-world solution is required.');
assert.ok(Array.isArray(data.tileProfiles) && data.tileProfiles.length > 0, 'Source-bound detailed-street height closure is required before release.');
assert.equal(data.geometry.conditionedInputSHA256,data.sourceModelSHA256,'Conditioned profiles and geometry do not bind the same candidate model.');
for (const id of ['23427c8c-e37_0', 'bdf0bad3-182_0']) assert.ok(data.geometry.supersedesRoadGradeProfileIds.includes(id), `${id}: the original grading correction must be replaced in the atomic global install.`);
const coreBytes = await readFile(resolve(root, 'public/city/core.pack.wasm'));
const sourceManifest = JSON.parse(await readFile(resolve(root, 'src/world/road-source-stage-manifest.json'), 'utf8'));
const sourceBytes = await readFile(resolve(root, 'src/world/road-source-geodesic-data.json')), sourceData = JSON.parse(sourceBytes);
assert.equal(sourceManifest.enabled, true, 'Corrected-source startup must be enabled before final road release.');
assert.equal(sourceManifest.generationID, sourceData.generationID); assert.equal(sourceManifest.dataSHA256, createHash('sha256').update(sourceBytes).digest('hex'));
assert.equal(sourceManifest.sourceCorePackSHA256, createHash('sha256').update(coreBytes).digest('hex')); assert.equal(sourceData.sourceCorePackSHA256, sourceManifest.sourceCorePackSHA256);
assert.equal(data.sourceRoadGeometryGeneration, sourceManifest.generationID); assert.equal(data.geometry.sourceRoadGeometryGeneration, sourceManifest.generationID);
assert.equal(data.sourceCoreSHA256, createHash('sha256').update(coreBytes).digest('hex'), 'Road profile source core changed. Regenerate and revalidate the local solutions.');
assert.equal(data.generatorInputSHA256, await roadProfileInputFingerprint(root), 'Road profile generator inputs changed. Regenerate and revalidate the local solutions.');
const ids = new Set();
assert.equal(data.solver.gradeChangePerMetre,GLOBAL_GRADE_CHANGE_PER_METRE,'The global road curvature limit changed.');
const rebaseAt=process.argv.indexOf('--generated-facility-rebase-proof'),rebaseProof=rebaseAt<0?undefined:process.argv[rebaseAt+1];
assert.ok(rebaseAt<0 || (rebaseProof && !rebaseProof.startsWith('--')), 'Explicit scoped rebase proof path is missing');
const allProfiles=[...data.profiles,...data.tileProfiles],localLimitAuthority=await loadRoadProfileLimits(root,{rebaseProof,expectedModelSHA256:data.sourceModelSHA256});
if (localLimitAuthority.rebase) {
  assert.deepEqual(data.solver.generatedFacilityRebase,localLimitAuthority.rebase,'Installed local comfort proof does not match fresh verification');
  assert.equal(data.solver.provenance?.inputs?.generated_facility_rebase_proof?.sha256,localLimitAuthority.rebase.proofSHA256,'Installed local comfort proof provenance changed');
} else assert.ok(!data.solver.generatedFacilityRebase && !data.solver.provenance?.inputs?.generated_facility_rebase_proof,'Explicit --generated-facility-rebase-proof is required');
const localLimits=bindLocalGradeChangePolicies(localLimitAuthority,data.solver.localGradeChangePolicies??[],allProfiles,data.sourceModelSHA256,{requireAttached:true});
const coreIDs=new Set(JSON.parse(gunzipSync(coreBytes)).roads.map(e=>e.id)),tileGeometryIDs=new Set(data.geometry.tileRoads.map(p=>p.id));
for(const p of data.tileProfiles){assert.ok(!coreIDs.has(p.id),`${p.id}: tile profiles must not expand the core/cache inventory`);assert.ok(tileGeometryIDs.has(p.id),`${p.id}: tile heights require exact offline transport/densification geometry`);assert.equal(p.stage,'conditionedWorld');}
if (data.geometry) for (const id of data.geometry.supersedesRoadGradeProfileIds) {
  assert.ok(!data.profiles.some(p => (p.stage || 'roadGrades') === 'roadGrades' && p.id === id), `${id}: superseded grading profile would change the geometry input`);
  assert.ok(data.profiles.some(p => p.stage === 'conditionedWorld' && p.id === id), `${id}: superseded grading profile has no final conditioned replacement`);
}
for (const p of allProfiles) {
  const key = `${p.stage || 'roadGrades'}/${p.id}`; assert.ok(!ids.has(key)); ids.add(key);
  assert.equal(p.elev.length, p.expected.pts.length);
  assert.ok(p.elev.every(Number.isFinite));
  checkRoadProfileLimits(p,localLimits.get(p.id),{gradeChangePerMetre:data.solver.gradeChangePerMetre});
}
if (!process.argv.includes('--hash-only')) {
  const temp = await mkdtemp(join(tmpdir(), 'roadster-profile-verifier-'));
  try {
    const file = join(temp, 'verify.mjs');
    await build({ stdin: { contents: `export {applySourceRoadStage,SOURCE_ROAD_STAGE_DATA} from './src/world/road-source-stage'; export {applyVerifiedSourceRoadZone} from './src/world/road-source-geodesic'; export {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from './src/world/road-grades'; export {profileMatches,applyVerifiedRoadProfiles,applyVerifiedRoadTileProfiles} from './src/world/road-profile-corrections'; export {applyVerifiedRoadModel,applyVerifiedRoadTileGeometry} from './src/world/road-model-overlay'; export {retainRaisedRoadExclusions} from './src/world/road-pavement'; export {prepareRoadUnderpasses} from './src/world/road-underpasses'; export {excludeStadiumRoads,stadiumExclusions} from './src/world/stadium-roads'; export {planConstruction,applyConstructionRoads} from './src/world/construction'; export {prepareRailwayTransport} from './src/world/railway-geometry'; export {RAILWAY_UNDERPASS_EVIDENCE} from './src/world/railway-evidence';`, resolveDir: root, loader: 'ts' }, outfile: file, bundle: true, platform: 'node', format: 'esm', target: 'node22', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
    const m = await import(pathToFileURL(file)), core = JSON.parse(gunzipSync(coreBytes).toString());
    Object.assign(core,m.applySourceRoadStage(core));
    const gradeRoads = m.prepareRoadGrades(core.roads, true, false), gradeById = new Map(gradeRoads.map(e => [e.id, e]));
    for (const p of data.profiles.filter(p => (p.stage || 'roadGrades') === 'roadGrades')) assert.ok(gradeById.has(p.id) && m.profileMatches(gradeById.get(p.id), p.expected), `${p.id}: bound prepared input changed`);
    if (data.profiles.some(p => p.stage === 'conditionedWorld')) {
      let roads = m.prepareRoadGrades(core.roads);
      core.roads = roads;
      const geometry = m.applyVerifiedRoadModel(core);
      if (data.geometry) { assert.ok(geometry.active, 'The complete core geometry overlay must bind atomically.'); assert.deepEqual(geometry.mismatched, []); assert.equal(geometry.applied.length, data.geometry.roads.length); }
      roads = core.roads;
      roads = m.prepareRoadUnderpasses(roads).roads; roads = m.excludeStadiumRoads(roads, m.stadiumExclusions(core.origin));
      roads = m.applyConstructionRoads(roads, m.planConstruction(roads, core.origin));
      roads = m.prepareRailwayTransport(roads, { underpasses: m.RAILWAY_UNDERPASS_EVIDENCE }).roads;
      roads = m.retainRaisedRoadExclusions(roads);
      const byId = new Map(roads.map(e => [e.id, e]));
      for (const p of data.profiles.filter(p => p.stage === 'conditionedWorld')) assert.ok(byId.has(p.id) && m.profileMatches(byId.get(p.id), p.expected), `${p.id}: conditioned world input changed`);
      if (data.geometry) {
        const conditioned = m.applyVerifiedRoadProfiles(roads, 'conditionedWorld'); assert.deepEqual(conditioned.report.mismatched, []);
        const patches = m.currentRoadGradePatches(conditioned.roads), applied = new Set(),tileHeights=new Set();
        for (const [pack, expectedHash] of Object.entries(data.geometry.sourcePackSHA256)) {
          const bytes = await readFile(resolve(root, pack)); assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash, `Tile source changed: ${pack}`);
          for (const zone of Object.values(JSON.parse(gunzipSync(bytes).toString()).tiles)) {
            const normalized = m.applyVerifiedSourceRoadZone(zone,m.SOURCE_ROAD_STAGE_DATA); assert.deepEqual(normalized.report.mismatched, []);
            const tile = m.applyVerifiedRoadTileGeometry({ ...normalized.value, roads: m.applyRoadGradePatches(normalized.value.roads, patches) });
            assert.deepEqual(tile.report.mismatched, []); tile.report.applied.forEach(id => applied.add(id));
            const heights=m.applyVerifiedRoadTileProfiles(tile.zone.roads);assert.deepEqual(heights.report.mismatched,[]);[...heights.report.applied,...heights.report.reused].forEach(id=>tileHeights.add(id));
            for (const e of tile.zone.roads) for (const [node, i] of [[e.from, 0], [e.to, e.pts.length - 1]]) if (node && data.geometry.nodes[node]) assert.deepEqual(e.pts[i], data.geometry.nodes[node].after, `Final tile/core endpoint mismatch: ${e.id}`);
          }
        }
        assert.equal(applied.size, data.geometry.tileRoads.length, 'Every tile-only owner/context geometry must bind through the production path.');
        assert.equal(tileHeights.size,data.tileProfiles.length,'Every detailed-street height profile must bind through its real packed copies.');
      }
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ verifiedProfiles: data.profiles.length, stages: [...new Set(data.profiles.map(p => p.stage || 'roadGrades'))], sourceCoreSHA256: data.sourceCoreSHA256 }));

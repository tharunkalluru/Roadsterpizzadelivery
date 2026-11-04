import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { roadProfileInputFingerprint } from './road-profile-inputs.mjs';
import { loadRoadProfileLimits, bindLocalGradeChangePolicies, checkRoadProfileLimits, expectedLocalGradeChangeControls, GLOBAL_GRADE_CHANGE_PER_METRE } from './road-profile-limits.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceManifest = JSON.parse(await readFile(resolve(root, 'src/world/road-source-stage-manifest.json'), 'utf8'));
const sourceBytes = await readFile(resolve(root, 'src/world/road-source-geodesic-data.json'));
const sourceData = JSON.parse(sourceBytes);
const sourceStageMatches = sourceManifest.enabled && sourceManifest.generationID === sourceData.generationID &&
  sourceManifest.dataSHA256 === createHash('sha256').update(sourceBytes).digest('hex') && sourceManifest.sourceCorePackSHA256 === sourceData.sourceCorePackSHA256;
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const solutionFile = option('--solution'), inputFile = option('--input-model'), stage = option('--stage') || 'roadGrades';
const geometryFile = option('--geometry-model'), geometrySourceFile = option('--geometry-source'), tileFile = option('--tile-transports');
const tileProfileFile=option('--tile-profiles'),finalModelFile=option('--final-model');
if (!solutionFile || !inputFile || !['roadGrades', 'conditionedWorld'].includes(stage)) throw Error('Use --solution FILE --input-model FILE [--stage roadGrades|conditionedWorld].');
const solutionBytes = await readFile(resolve(solutionFile)), inputBytes = await readFile(resolve(inputFile));
const solution = JSON.parse(solutionBytes), model = JSON.parse(inputBytes), modelById = new Map(model.roads.map(e => [e.id, e]));
const inputSHA256 = createHash('sha256').update(inputBytes).digest('hex');
if (solution.sourceModelSHA256 !== inputSHA256) throw Error('The solved profiles are not bound to this exact ordinary-conditioned input model.');
if (!sourceStageMatches || model.sourceRoadGeometryGeneration !== sourceManifest.generationID) throw Error('Final profiles require the enabled, matching corrected-source stage and a rebased input model.');
solution.roads ??= solution.roadData;
if (!solution.success || !Array.isArray(solution.roads) || !solution.roads.length) throw Error('The offline solver did not return a feasible profile solution.');
if(solution.gradeChangePerMetre!==GLOBAL_GRADE_CHANGE_PER_METRE)throw Error('The global road curvature limit changed.');
const rebaseProof=option('--generated-facility-rebase-proof');
const localLimitAuthority=await loadRoadProfileLimits(root,{rebaseProof,expectedModelSHA256:inputSHA256}),solutionIDs=new Set();
if (localLimitAuthority.rebase) {
  if (!isDeepStrictEqual(solution.generatedFacilityRebase,localLimitAuthority.rebase) || solution.provenance?.inputs?.generated_facility_rebase_proof?.sha256 !== localLimitAuthority.rebase.proofSHA256) throw Error('The solved local comfort proof does not match explicit, freshly replayed consumption.');
} else if (solution.generatedFacilityRebase || solution.provenance?.inputs?.generated_facility_rebase_proof) throw Error('The solved local comfort rebase needs explicit --generated-facility-rebase-proof.');
for(const e of solution.roads){if(!e||typeof e.id!=='string'||solutionIDs.has(e.id)||!modelById.has(e.id))throw Error(`Duplicate/unknown solved profile: ${e?.id}`);solutionIDs.add(e.id);}
const file = resolve(root, 'src/world/road-profile-corrections.json'), previous = JSON.parse(await readFile(file, 'utf8'));
const input = e => {
  const p = Object.fromEntries(['pts', 'elev', 'w', 'lanes', 'from', 'to', 'oneway', 'joinedPavement', 'laneEvidence', 'sourceLaneIntervals', 'sceneryWidth', 'expressway', 'scenerySource'].map(k => [k, e[k]]));
  for (const key of ['laneEvidence', 'sourceLaneIntervals', 'sceneryWidth', 'expressway', 'scenerySource']) p[key] ??= null;
  return p;
};
let geometry = previous.geometry;
if (geometryFile || geometrySourceFile || tileFile) {
  if (!geometryFile || !geometrySourceFile || !tileFile || stage !== 'conditionedWorld') throw Error('A geometry install requires --geometry-model, --geometry-source, --tile-transports and --stage conditionedWorld.');
  if (!solution.sourceMetadataCoverage?.complete || solution.sourceMetadataCoverage.unresolvedPrefixes?.length ||
    !solution.sourceMetadataCoverage.sourceReferenceSHA256 || solution.sourceMetadataCoverage.sourceReferenceSHA256 !== solution.provenance?.inputs?.additional_source_reference?.sha256)
    throw Error('Global road geometry requires complete, source-bound crossing metadata. Missing source records cannot be treated as ground level.');
  if (!solution.coreContextCoverage?.complete || !solution.coreContextCoverage.contextAdditionDoesNotGrantPrimaryHeightAuthority ||
    solution.coreContextCoverage.sourceCoverageSHA256 !== solution.provenance?.inputs?.complete_core_context?.sha256)
    throw Error('Global road geometry requires complete, source-bound generated-profile context preparation. Context coverage cannot grant height authority.');
  const [prototypeBytes, sourceBytes, tileBytes] = await Promise.all([geometryFile, geometrySourceFile, tileFile].map(p => readFile(resolve(p))));
  const prototype = JSON.parse(prototypeBytes), source = JSON.parse(sourceBytes), tile = JSON.parse(tileBytes), hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (tile.sourceModelSHA256 !== hash(inputBytes) || !prototype.endpointDisplacements || source.roads.length !== prototype.roads.length ||
    prototype.sourceRoadGeometryGeneration !== sourceManifest.generationID || source.sourceRoadGeometryGeneration !== sourceManifest.generationID) throw Error('Geometry, ordinary-conditioned input and tile supplement are not one corrected-source-bound candidate.');
  const sourceById = new Map(source.roads.map(e => [e.id, e])), roads = [];
  for (const e of prototype.roads) {
    const old = sourceById.get(e.id); if (!old) throw Error(`Geometry adds an unbound core road: ${e.id}`);
    const expected = input(old), modeled = input(e); if (JSON.stringify(expected) === JSON.stringify(modeled)) continue;
    const sourceArc = e.sourceArc || e.pts.reduce((a, p, i) => { a.push(i ? a[i - 1] + Math.hypot(p[0] - e.pts[i - 1][0], p[1] - e.pts[i - 1][1]) : 0); return a; }, []);
    roads.push({ id: e.id, expected, model: modeled, sourceArc });
  }
  const supersedes = [...new Set([...(previous.geometry?.supersedesRoadGradeProfileIds || []), ...previous.profiles.filter(p => (p.stage || 'roadGrades') === 'roadGrades').map(p => p.id)])];
  for (const id of supersedes) if (!solution.roads.some(e => e.id === id)) throw Error(`The new conditioned solution does not replace the earlier roadGrades profile: ${id}`);
  geometry = { sourceRoadGeometryGeneration: sourceManifest.generationID, sourceGradeModelSHA256: hash(sourceBytes), sourcePrototypeSHA256: hash(prototypeBytes), conditionedInputSHA256:hash(inputBytes), sourceTileSupplementSHA256: hash(tileBytes), sourcePackSHA256: tile.sourcePackSHA256,
    supersedesRoadGradeProfileIds: supersedes, nodes: prototype.endpointDisplacements, roads, tileRoads: tile.transports, tileNodeSources:tile.nodeSources||{},
    producerMetadata:{geometryEdits:prototype.geometryEdits,corridors:prototype.corridors} };
}
if(geometry&&stage==='conditionedWorld'&&geometry.conditionedInputSHA256!==createHash('sha256').update(inputBytes).digest('hex'))throw Error('The conditioned solution input is not the installed geometry candidate. Regenerate the complete atomic candidate.');
const replacements = new Map();
for (const e of solution.roads) {
  const base = modelById.get(e.id);
  if (!base || JSON.stringify(base.pts) !== JSON.stringify(e.pts) || base.w !== e.w || base.lanes !== e.lanes ||
    JSON.stringify(base.joinedPavement) !== JSON.stringify(e.joinedPavement) || !Array.isArray(e.elev) || e.elev.length !== e.pts.length || e.elev.some(y => !Number.isFinite(y))) throw Error(`Solved profile does not match its input geometry: ${e.id}`);
  const expected = input(base);
  // Full input metadata is inspected before reducing it to ProfileInput.
  expectedLocalGradeChangeControls(localLimitAuthority,e.id,base);
  replacements.set(`${stage}/${e.id}`, { id: e.id, stage, expected, elev: e.elev, limits:{maxGrade:solution.grade,gradeChangePerMetre:solution.gradeChangePerMetre,sameLayerTolerance:solution.sameLayerTolerance} });
}
const kept = previous.profiles.filter(p => !replacements.has(`${p.stage || 'roadGrades'}/${p.id}`) && !((p.stage || 'roadGrades') === 'roadGrades' && geometry?.supersedesRoadGradeProfileIds.includes(p.id)));
let tileProfiles,sourceFinalModelSHA256,tileProfileArtifactSHA256;
if(geometry&&stage==='conditionedWorld'){
  if(!tileProfileFile||!finalModelFile)throw Error('An atomic global install requires --tile-profiles FINAL_CANDIDATE_TILES and --final-model FINAL_CORE. Core-only solve artifacts cannot activate this release.');
  const [tileProfileBytes,finalBytes]=await Promise.all([tileProfileFile,finalModelFile].map(p=>readFile(resolve(p)))),tiles=JSON.parse(tileProfileBytes),final=JSON.parse(finalBytes),hash=b=>createHash('sha256').update(b).digest('hex');
  sourceFinalModelSHA256=hash(finalBytes);tileProfileArtifactSHA256=hash(tileProfileBytes);
  if(tiles.sourceModelSHA256!==sourceFinalModelSHA256||tiles.sourceConditionedInputSHA256!==inputSHA256||tiles.sourceRoadGeometryGeneration!==sourceManifest.generationID||final.sourceRoadGeometryGeneration!==sourceManifest.generationID||tiles.sourceCoreSHA256!==sourceData.sourceCorePackSHA256)throw Error('Final tile/core profiles are not bound to the same solved corrected-source candidate.');
  const targets=new Map(solution.roads.map(e=>[e.id,e])),finals=new Map(final.roads.map(e=>[e.id,e]));
  if(finals.size!==modelById.size||final.roads.length!==model.roads.length)throw Error('Final core inventory changed.');
  for(const e of model.roads)if(JSON.stringify(input(finals.get(e.id)))!==JSON.stringify(input(targets.has(e.id)?{...e,elev:targets.get(e.id).elev}:e)))throw Error(`Final core is not exactly the solved input: ${e.id}`);
  tileProfiles=tiles.tileProfiles;
  if(!Array.isArray(tileProfiles)||!tileProfiles.length||!Array.isArray(tiles.requestedRoadIDs)||tileProfiles.length!==tiles.requestedRoadIDs.length)throw Error('A complete nonempty final detailed-street profile inventory is required.');
  const requested=new Set(tiles.requestedRoadIDs),ids=new Set(),transportIds=new Set(geometry.tileRoads.map(p=>p.id));
  for(const p of tileProfiles){if(ids.has(p.id)||modelById.has(p.id)||!requested.has(p.id)||!transportIds.has(p.id)||p.stage!=='conditionedWorld'||!p.expected||!Array.isArray(p.elev)||p.elev.length!==p.expected.pts.length||p.elev.some(y=>!Number.isFinite(y)))throw Error(`Invalid final detailed-street profile: ${p.id}`);ids.add(p.id);}
  for(const [pack,expected]of Object.entries(tiles.sourcePackSHA256||{}))if(geometry.sourcePackSHA256?.[pack]!==expected||hash(await readFile(resolve(root,pack)))!==expected)throw Error(`Final tile profile source pack changed/unbound: ${pack}`);
}
const solvedProfiles=[...replacements.values(),...(tileProfiles||[])];
const localLimits=bindLocalGradeChangePolicies(localLimitAuthority,solution.localGradeChangePolicies??[],solvedProfiles,inputSHA256);
for(const p of solvedProfiles){const local=localLimits.get(p.id);if(local)p.limits={...p.limits,localGradeChange:local.block};checkRoadProfileLimits(p,local,{gradeChangePerMetre:solution.gradeChangePerMetre});}
const out = {
  version: 1,
  sourceRoadGeometryGeneration: sourceManifest.generationID,
  ...(geometry ? { releaseScope: 'reported-road-global-v1' } : {}),
  sourceCoreSHA256: createHash('sha256').update(await readFile(resolve(root, 'public/city/core.pack.wasm'))).digest('hex'),
  generatorInputSHA256: await roadProfileInputFingerprint(root),
  sourceModelSHA256: createHash('sha256').update(inputBytes).digest('hex'),
  solutionSHA256: createHash('sha256').update(solutionBytes).digest('hex'),
  solver: Object.fromEntries(Object.entries(solution).filter(([k]) => !['roads', 'roadData'].includes(k))),
  ...(geometry ? { geometry } : {}),
  ...(tileProfiles?{tileProfiles,sourceFinalModelSHA256,tileProfileArtifactSHA256}:{}),
  profiles: [...kept, ...replacements.values()].sort((a, b) => `${a.stage}/${a.id}`.localeCompare(`${b.stage}/${b.id}`)),
};
const temporary=file+'.atomic-tmp';
try{await writeFile(temporary,JSON.stringify(out)+'\n',{flag:'wx'});await rename(temporary,file);}finally{await rm(temporary,{force:true});}
console.log(JSON.stringify({ profiles: out.profiles.length, stage, inputModelSHA256: out.sourceModelSHA256, solutionSHA256: out.solutionSHA256, bytes: (await readFile(file)).length }));

// Current-tuple proposal preparation. External six-part physical acceptance is
// still required. Synthetic mode is explicit and cannot become a numeric fit.
import assert from 'node:assert/strict';
import {validateFittedHighBranchScenery} from './validate-fitted-high-branch-scenery-v2.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),opt={};
for(let i=2;i<process.argv.length;i+=2){assert.ok(process.argv[i].startsWith('--')&&process.argv[i+1]);opt[process.argv[i].slice(2)]=process.argv[i+1];}
for(const key of['preparation','preparation-sha256','copy-inventory','copy-inventory-sha256','output'])assert.ok(opt[key],'Missing --'+key);
const synthetic=opt['protocol-fixture']==='unchanged-model';
assert.ok(synthetic!==!!opt['numeric-artifact'],'Choose a real numeric artifact OR explicit --protocol-fixture unchanged-model');
assert.ok(!opt['protocol-fixture']||synthetic,'Unknown explicit protocol fixture');
if(!synthetic)assert.ok(/^[a-f0-9]{64}$/.test(opt['numeric-sha256']),'A real numeric artifact requires its exact SHA');
const hash=b=>createHash('sha256').update(b).digest('hex'),j=JSON.stringify,held=new Map();
const read=async(path,pin)=>{path=resolve(path);const bytes=await readFile(path),digest=hash(bytes);assert.ok(!held.has(path)||held.get(path)===digest,'Input changed during fitted transaction: '+path);assert.ok(pin===undefined||pin===digest,'Bound fitted input changed: '+path);held.set(path,digest);return bytes;};
const json=async(path,pin)=>JSON.parse(await read(path,pin)),valueHash=value=>hash(j(value));
await read(fileURLToPath(import.meta.url));await read(fileURLToPath(new URL('./validate-fitted-high-branch-scenery-v2.mjs',import.meta.url)));
const preparation=await json(opt.preparation,opt['preparation-sha256']),inventory=await json(opt['copy-inventory'],opt['copy-inventory-sha256']);
assert.equal(preparation.schema,'exact-current-native-runtime-preparation-input-v1');assert.equal(inventory.schema,'actual-current-native-runtime-all304-copy-preparation-inventory-v1');
assert.equal(inventory.input.sha256,opt['preparation-sha256']);assert.equal(inventory.summary.rawPacks,304);assert.equal(inventory.summary.pointShapeMismatchCopies,0);assert.equal(inventory.unresolvedAdditionalOwners.length,0);
for(const binding of[...preparation.actualReadDependencyBindings,...inventory.actualReadDependencyBindings])await read(binding.path,binding.sha256);
assert.deepEqual(inventory.currentInputHashes,preparation.currentInputHashes);
const manifest=await json(preparation.inputs.geometryManifest.path,preparation.inputs.geometryManifest.sha256),geometryBytes=await read(manifest.data.path,manifest.binding.dataSHA256),geometry=JSON.parse(geometryBytes),canonical=await json(manifest.canonicalRails.path,manifest.binding.modelInputSHA256),projection=await json(manifest.workerProjection.path,manifest.workerProjection.sha256);
assert.equal(preparation.currentInputHashes.model,manifest.binding.modelInputSHA256);assert.equal(preparation.currentInputHashes.source,inventory.currentInputHashes.source);assert.equal(valueHash(projection.corePatches),geometry.workerCorePatchesSHA256);assert.equal(valueHash(projection.tileTransports),geometry.workerTileTransportsSHA256);
const numericBytes=synthetic?Buffer.from(j({schema:'explicit-unchanged-Y-runtime-protocol-fixture-v1',runtimePreparationSHA256:opt['preparation-sha256'],numericProposalSuccess:false,syntheticElevationFixture:true,physicalAcceptanceGranted:false,releaseApproved:false})+'\n'):await read(opt['numeric-artifact'],opt['numeric-sha256']);
const numeric=JSON.parse(numericBytes);
if(!synthetic){
 assert.equal(numeric.schema,'current-native-cutting-plane-fit-v1');assert.equal(numeric.numericProposalSuccess,true,'A failed numerical proposal cannot supply fitted heights');assert.equal(numeric.physicalAcceptanceGranted,false);assert.equal(numeric.releaseApproved,false);assert.equal(numeric.oldMixedBasisPointRowsUsedInSolve,false);
 assert.equal(numeric.inputHashes.runtimePreparation,opt['preparation-sha256'],'Fit must bind its exact current allocated columns/domains/objective preparation');
 for(const[key,value]of Object.entries(preparation.currentInputHashes))assert.equal(numeric.inputHashes[key],value,'A current numerical policy/source binding differs: '+key);
 assert.equal(numeric.finalPhysicalCensus.complete,true);assert.deepEqual(numeric.finalPhysicalCensus.unresolved,[]);assert.ok(numeric.finalPhysicalCensus.expectedGroups>0&&numeric.finalPhysicalCensus.expectedGroups===numeric.finalPhysicalCensus.groups_scanned,'A complete actual affected physical census is required');
}
const rows=new Map(preparation.owners.map(r=>[r.id,r]));assert.equal(rows.size,preparation.owners.length);const coreByID=new Map(canonical.roads.map(r=>[r.id,r])),targets=new Map();
const stripY=r=>{const value={...r};delete value.elev;return value;};
for(const target of synthetic?[]:[...numeric.roadData,...numeric.tileRoadData]){
 const row=rows.get(target.id);assert.ok(row&&!targets.has(target.id),'Repeated or unknown fitted numerical owner: '+target.id);assert.deepEqual(stripY(target),stripY(row.expectedFullRoad),'Numerical output changed full geometry/capacity/source fields: '+target.id);assert.ok(Array.isArray(target.elev)&&target.elev.length===row.expectedFullRoad.pts.length&&target.elev.every(v=>typeof v==='number'&&Number.isFinite(v)),'Invalid exact fitted Y field');targets.set(target.id,target.elev);
}
const vector=Buffer.alloc(preparation.N*8),coreRows=[],detailedRows=[];
for(const id of preparation.ownerOrder){
 const row=rows.get(id),expected=row.expectedFullRoad,n=expected.pts.length;
 assert.ok(row.role==='core'||row.role==='detailed','A raw-core owner absent from the actual MODEL needs explicit production treatment');
 let ys=targets.get(id);
 if(synthetic)ys=expected.elev??Array(n).fill(0);
 else if(!ys){ys=row.originalObjectiveY;assert.ok(row.licensedBounds.every(([lo,hi],i)=>Object.is(lo,hi)&&Object.is(lo,ys[i])),'A variable numerical owner was omitted from the actual fit: '+id);}
 assert.equal(ys.length,n);
 for(let k=0;k<n;k++){
  assert.ok(typeof ys[k]==='number'&&Number.isFinite(ys[k]));
  // JSON has a distinct generated zero checkpoint. A real numeric -0 requires
  // a separately reviewed explicit checkpoint; it is never silently changed.
  assert.ok(!Object.is(ys[k],-0),'A numerical negative zero requires an explicit serialization checkpoint: '+id+'/'+k);
  if(!synthetic)assert.ok(row.licensedBounds[k][0]<=ys[k]&&ys[k]<=row.licensedBounds[k][1],'A fitted value left its licensed source interval: '+id+'/'+k);
  vector.writeDoubleBE(ys[k],(row.offset+k)*8);
 }
 if(row.role==='core')assert.deepEqual(expected,coreByID.get(id),'Current numerical full core prototype differs from actual pre-fit MODEL: '+id);
 (row.role==='core'?coreRows:detailedRows).push({id,expected,fitted:{...expected,elev:[...ys]}});
}
if(!synthetic)assert.equal(hash(vector),numeric.candidateSHA256,'Actual binary64 fitted vector differs from the vector whose physical census completed');
assert.equal(coreRows.length,preparation.summary.roles.core);assert.equal(detailedRows.length,preparation.summary.roles.detailed);
const allFittedCore=new Map(coreRows.map(r=>[r.id,r.fitted])),fittedRoads=canonical.roads.map(r=>allFittedCore.get(r.id)??r),existingIDs=new Set(projection.tileTransports.map(r=>r.id)),detailByID=new Map(detailedRows.map(r=>[r.id,r]));
const additionalDetailedTransports=[];
for(const row of inventory.additionalLiteralIdentityOwners){
 const target=detailByID.get(row.id);assert.ok(target&&!existingIDs.has(row.id),'Additional publication must bind one actual newly detailed owner');assert.deepEqual(target.expected,row.expected);assert.ok(row.copies.some(copy=>!copy.expectedNormalized.ctx),'Context copies cannot invent an absent source owner');const e=row.expected,sourceArc=[0];
 for(let k=1;k<e.pts.length;k++)sourceArc.push(sourceArc[k-1]+Math.hypot(e.pts[k][0]-e.pts[k-1][0],e.pts[k][1]-e.pts[k-1][1]));
 const sourceInput={id:e.id,cls:e.cls,w:e.w,lanes:e.lanes??null,oneway:e.oneway??null,from:e.from??null,to:e.to??null,pts:e.pts,elev:e.elev??null};
 additionalDetailedTransports.push({id:e.id,transport:{id:e.id,expected:sourceInput,pts:e.pts,elev:e.elev??null,sourceArc,sourceXY:e.pts,maximumDisplacement:0,minimumTransportMask:1},controlMapping:{kind:'literal-source-normalized-control-identity',indices:Array.from({length:e.pts.length},(_,k)=>k)},copies:row.copies});
}
assert.equal(inventory.additionalOrdinaryPreparedOwners.length,0,'Nonidentity detail needs a separate real pre-fit preparation stage');
const additionalByID=new Map(additionalDetailedTransports.map(r=>[r.id,r]));assert.ok(detailedRows.every(r=>existingIDs.has(r.id)||additionalByID.has(r.id)),'Every actual detailed publication must have a complete real pre-fit transport');
const tileTransports=[...projection.tileTransports,...additionalDetailedTransports.map(r=>r.transport)].map(before=>{const target=detailByID.get(before.id);if(!target)return before;assert.deepEqual(before.pts,target.expected.pts);assert.deepEqual(before.elev,target.expected.elev);return{...before,elev:target.fitted.elev};});
await read(manifest.runtimeBundle.path,manifest.runtimeBundle.sha256);const runtime=await import(pathToFileURL(manifest.runtimeBundle.path)),allIDs=new Set([...geometry.roads.map(r=>r.id),...coreRows.map(r=>r.id)]),corePatches=runtime.lateModeledWorkerPatches(fittedRoads,fittedRoads.filter(r=>allIDs.has(r.id)).map(r=>({id:r.id,model:r})));
assert.ok(coreRows.every(r=>corePatches.some(p=>p.id===r.id))&&geometry.roads.every(r=>corePatches.some(p=>p.id===r.id)),'Every numeric and geometry-only core record needs an actual production patch');
let sceneryManifest=null,sceneryStage=null,actualSceneryCopies=0;
if(opt['high-branch-scenery-manifest']){
 assert.ok(/^[a-f0-9]{64}$/.test(opt['high-branch-scenery-sha256']),'Scenery manifest requires its explicit SHA');
 sceneryManifest=await json(opt['high-branch-scenery-manifest'],opt['high-branch-scenery-sha256']);
 sceneryStage=await validateFittedHighBranchScenery({root,preparation,geometryManifest:manifest,sceneryManifest,readBound:read});
}
const payload={version:1,kind:'exact-late-model-fitted-road-profiles',inputStage:'lateModelBeforeFittedHeights',numericArtifactSHA256:hash(numericBytes),geometryDataSHA256:manifest.binding.dataSHA256,modelInputSHA256:manifest.binding.modelInputSHA256,physicalSourceGeneration:manifest.binding.physicalSourceGeneration,sourceInputVariantPreparationGeneration:manifest.binding.sourceInputVariantPreparationGeneration,expectedCoreRoadsSHA256:geometry.modeledRoadsSHA256,fittedCoreRoadsSHA256:valueHash(fittedRoads),generatedJSONCheckpointZeroPaths:geometry.expectedGeneratedNegativeZeroPaths,core:coreRows,detailed:detailedRows,additionalDetailedTransports,preFitWorkerProjection:projection,workerCorePatchesSHA256:valueHash(corePatches),workerTileTransportsSHA256:valueHash(tileTransports),...(sceneryManifest?{highBranchScenerySHA256:sceneryManifest.binding.dataSHA256}:{}),approvalIsExternal:true,runtimeActivated:false};
const assetBytes=Buffer.from(j(payload)+'\n'),binding={fitDataSHA256:hash(assetBytes),numericArtifactSHA256:payload.numericArtifactSHA256,geometryDataSHA256:payload.geometryDataSHA256,modelInputSHA256:payload.modelInputSHA256,physicalSourceGeneration:payload.physicalSourceGeneration,sourceInputVariantPreparationGeneration:payload.sourceInputVariantPreparationGeneration,...(sceneryManifest?{highBranchScenerySHA256:sceneryManifest.binding.dataSHA256}:{})};
// Execute the exact existing source/ordinary/late/fitted code, including its
// truthful V13 ordinary evidence, rather than replaying an old368 inspector.
const source=await json(preparation.inputs.sourceCopyManifest.path,preparation.inputs.sourceCopyManifest.sha256);await read(source.runtimeBundle.path,source.runtimeBundle.sha256);const copyRuntime=await import(pathToFileURL(source.runtimeBundle.path)),adapter=await copyRuntime.createSourceCopyContractAdapter({sourceBytes:await read(source.sourceData.path,source.binding.sourceDataSHA256),contractBytes:await read(source.runtimeContract.path,source.binding.contractDataSHA256),binding:source.binding});
const rawCoreBytes=await read(join(root,'public/city/core.pack.wasm'),source.binding.sourceCorePackSHA256),rawCore=JSON.parse(gunzipSync(rawCoreBytes)),rawCoreToken=await adapter.verifyRawFile({kind:'core'},rawCoreBytes),normalized=adapter.applyZone(rawCore,{kind:'core'},rawCoreToken),model=await runtime.createLateConditionedRoadModel(geometryBytes,manifest.binding),ordinary=model.prepareSourceInput({...normalized.value,sourceRoadGeometryGeneration:normalized.sourceRoadGeometryGeneration,sourceInputVariantPreparationGeneration:normalized.sourceInputVariantPreparationGeneration}),installed=await model.install(ordinary),stage=await model.createFittedReviewStage(assetBytes,binding),fitted=await stage.install(installed.core);
assert.equal(fitted.state.phase,'unacceptedFittedRoadProfilesForOfflineReview');assert.equal(fitted.acceptance,null);assert.equal(fitted.releaseApproved,false);assert.deepEqual(fitted.core.roads,fittedRoads);assert.equal(valueHash(fitted.worker.corePatches),valueHash(corePatches));assert.deepEqual(fitted.worker.tileTransports,tileTransports);
const cached=await stage.recognize(JSON.parse(j(fitted.core)));assert.equal(valueHash(cached.worker.corePatches),valueHash(corePatches));assert.deepEqual(cached.worker.tileTransports,tileTransports);
const finalCorePatchByID=new Map(corePatches.map(r=>[r.id,r])),capacityLicenses=new Map([...geometry.inheritedCapacityAuthority.records,...geometry.inheritedOrdinaryCapacityAuthority].map(r=>[r.road,r.model]));
const workerProjection=await stage.compileWorkerProjection(JSON.parse(j(corePatches)),JSON.parse(j(tileTransports))),expectedCopy=new Map(inventory.copies.map(r=>[r.location.pack+'/'+r.location.tile+'/'+r.road,r])),targetY=new Map([...coreRows,...detailedRows].map(r=>[r.id,r.fitted.elev]));
let actualCopies=0,actualTiles=0;
for(const pack of rawCore.packs){
 const bytes=await read(join(root,'public/city',pack.file)),raw=JSON.parse(gunzipSync(bytes)),token=await adapter.verifyRawFile({kind:'tile',pack:pack.file,tile:Object.keys(raw.tiles)[0]},bytes);
 for(const[tile,zone]of Object.entries(raw.tiles)){
  actualTiles++;const location={kind:'tile',pack:pack.file,tile},result=stage.applyWorkerZone(zone,location,token,adapter,workerProjection);assert.equal(result.roadProfileRuntimeIdentity.fitDataSHA256,binding.fitDataSHA256);
  for(const actual of result.zone.roads)if(targetY.has(actual.id)){
   const old=expectedCopy.get(pack.file+'/'+tile+'/'+actual.id);assert.ok(old,'An allocated owner appeared outside its actual complete source-copy inventory');const cleaned=JSON.parse(j(actual)),expected={...old.preFitPublishedFullRoad,elev:targetY.get(actual.id)};
   if(coreByID.has(actual.id)){
    // The inventory's preliminary legacy publisher injected core names/lanes.
    // Current source-copy projection truthfully preserves original copy names
    // and lane presence, with only its separately bound capacity transitions.
    const original=old.sourceNormalizedFullRoad,p=finalCorePatchByID.get(actual.id),license=capacityLicenses.get(actual.id);
    if(Object.hasOwn(original,'name'))expected.name=original.name;else delete expected.name;
    if(!Object.hasOwn(original,'lanes'))delete expected.lanes;
    else expected.lanes=license&&p.lanes!==original.lanes?p.lanes:original.lanes;
   }
   assert.deepEqual(cleaned,expected,'A final real copy changed XY/metadata or missed its explicit only-Y publication: '+actual.id+'/'+tile);actualCopies++;
  }
  if(sceneryStage){
   const scenery=sceneryStage.applyZone(result.zone,location),sceneryByID=new Map(sceneryStage.data.rows.map(row=>[row.road,row]));
   assert.equal(scenery.zone.roads.length,result.zone.roads.length);
   for(let i=0;i<result.zone.roads.length;i++){
    const before=result.zone.roads[i],after=scenery.zone.roads[i],row=sceneryByID.get(before.id);
    assert.deepEqual(after,row?{...before,sceneryWidth:row.fullPreparedAfter.sceneryWidth}:before,'Scenery changed fitted Y or another physical/source field');
   }
   actualSceneryCopies+=scenery.applied.length;
  }
 }
}
if(sceneryStage)assert.equal(actualSceneryCopies,sceneryStage.data.copies.length,'Every declared scenery copy must be replayed');
assert.equal(actualCopies,inventory.copies.length);assert.equal(actualTiles,inventory.summary.rawTiles);
for(const[path,pin]of held)assert.equal(hash(await readFile(path)),pin,'A fitted preparation input changed before atomic publication: '+path);
const output=resolve(opt.output);await mkdir(output,{recursive:false});await writeFile(join(output,'fitted-proposal.json'),assetBytes,{flag:'wx'});await writeFile(join(output,'worker-projection.json'),j({corePatches,tileTransports})+'\n',{flag:'wx'});if(synthetic)await writeFile(join(output,'explicit-synthetic-numeric-artifact.json'),numericBytes,{flag:'wx'});
const result={schema:'portable-unaccepted-current-native-fitted-profile-candidate-v1',reviewBinding:binding,data:{path:join(output,'fitted-proposal.json'),sha256:hash(assetBytes)},geometryManifest:preparation.inputs.geometryManifest,numericArtifact:{path:synthetic?join(output,'explicit-synthetic-numeric-artifact.json'):resolve(opt['numeric-artifact']),sha256:hash(numericBytes)},runtimePreparation:{path:resolve(opt.preparation),sha256:opt['preparation-sha256']},sourceCopyInventory:{path:resolve(opt['copy-inventory']),sha256:opt['copy-inventory-sha256']},highBranchScenery:sceneryManifest?{path:resolve(opt['high-branch-scenery-manifest']),sha256:opt['high-branch-scenery-sha256']}:null,workerProjection:{path:join(output,'worker-projection.json'),sha256:hash(await readFile(join(output,'worker-projection.json')))},summary:{allocatedOwners:rows.size,coreRecords:coreRows.length,detailedRecords:detailedRows.length,additionalLiteralIdentityDetailedOwners:additionalDetailedTransports.length,finalCorePatches:corePatches.length,finalTileTransports:tileTransports.length,actualWorkerTiles:actualTiles,actualOnlyYMutableWorkerCopies:actualCopies,actualSceneryCopies,freshAndCacheIdentical:true},syntheticElevationFixture:synthetic,numericProposalSuccess:!synthetic,acceptanceReceipt:null,physicalAcceptanceGranted:false,runtimeActivated:false,releaseApproved:false,inputs:Object.fromEntries(held)};
await writeFile(join(output,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path:join(output,'manifest.json'),sha256:hash(await readFile(join(output,'manifest.json'))),summary:result.summary,syntheticElevationFixture:synthetic,releaseApproved:false}));

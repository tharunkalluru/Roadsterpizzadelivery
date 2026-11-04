import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {endpointLevels,compareEndpointLevels,summarizeNodeLevels} from './road-tile-boundary-inventory.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const option=name=>{const at=process.argv.indexOf(name);return at<0?undefined:process.argv[at+1];};
const root=process.cwd(),modelFile=option('--model'),oldFile=option('--historical'),tileFile=option('--tile-transports'),output=option('--output'),sourceFile=option('--source-geometry'),candidateFile=option('--candidate-tiles');
const historicalInventoryFile=option('--historical-inventory')||'docs/qa/evidence/reported-roads/all-tile-only-node-height-boundaries.json';
if(!modelFile||!oldFile||!tileFile||!output)throw Error('Use --model CONDITIONED --historical STRICT_OLD --tile-transports SUPPLEMENT [--source-geometry DATA] [--candidate-tiles FINAL] --output NEW_FILE');
const [coreBytes,modelBytes,oldBytes,tileBytes,inventoryBytes,sourceBytes,candidateBytes]=await Promise.all(['public/city/core.pack.wasm',modelFile,oldFile,tileFile,historicalInventoryFile,sourceFile,candidateFile].map(p=>p?readFile(p):undefined));
const core=JSON.parse(gunzipSync(coreBytes)),model=JSON.parse(modelBytes),old=JSON.parse(oldBytes),tile=JSON.parse(tileBytes),historicalInventory=JSON.parse(inventoryBytes),source=sourceBytes?JSON.parse(sourceBytes):undefined,candidate=candidateBytes?JSON.parse(candidateBytes):undefined;
if(tile.sourceModelSHA256!==hash(modelBytes)||tile.sourceCoreSHA256!==hash(coreBytes))throw Error('Tile supplement is not bound to this exact model/core.');
if(model.sourceRoadGeometryGeneration!==source?.generationID||tile.sourceRoadGeometryGeneration!==source?.generationID)throw Error('Model/tile inventory must use their exact explicit source geometry generation.');
if(source&&(source.sourceCorePackSHA256!==hash(coreBytes)||tile.sourceDataSHA256!==hash(sourceBytes)))throw Error('Source data/core/tile binding mismatch.');
if(candidate&&(candidate.schemaVersion!==1||candidate.sourceCoreSHA256!==hash(coreBytes)||candidate.sourceModelSHA256!==hash(modelBytes)||candidate.sourceRoadGeometryGeneration!==source?.generationID||!Array.isArray(candidate.requestedRoadIDs)||!Array.isArray(candidate.tileProfiles)))throw Error('Candidate tile profiles must bind this core/model/source with explicit expected profiles.');
const temp=await mkdtemp(join(tmpdir(),'road-tile-boundary-'));
const guarded=['src/game/roadgraph.ts','src/world/road-source-geodesic.ts','src/world/road-grades.ts','src/world/road-node-transport.ts','src/world/road-model-overlay.ts','src/world/road-profile-corrections.ts','scripts/audit-road-tile-boundaries.mjs','scripts/road-tile-boundary-inventory.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(guarded.map(async p=>[p,hash(await readFile(p))])));
try{
 await build({stdin:{contents:"export{RoadGraph}from'./src/game/roadgraph';export{applyVerifiedSourceRoadZone}from'./src/world/road-source-geodesic';export{applyRoadGradePatches,currentRoadGradePatches}from'./src/world/road-grades';export{applyVerifiedRoadTileGeometry}from'./src/world/road-model-overlay';export{applyVerifiedRoadTileProfiles}from'./src/world/road-profile-corrections';",resolveDir:root,loader:'ts'},outfile:join(temp,'graph.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error'});
 const api=await import(pathToFileURL(join(temp,'graph.mjs'))),classAllowed=new Map();
 const drive=cls=>{if(!classAllowed.has(cls))classAllowed.set(cls,new api.RoadGraph([{id:'probe',seg:'probe',name:null,cls,w:6,lanes:1,oneway:null,from:'a',to:'b',pts:[[0,0],[20,0]],elev:null,maxspeed:40}]).edges.length>0);return classAllowed.get(cls);};
 const sourceCore=source?api.applyVerifiedSourceRoadZone(core,source):{value:core,report:{mismatched:[]}};
 if(sourceCore.report.mismatched.length)throw Error('Source normalization rejected raw core.');
 const currentNodes=endpointLevels(model.roads,drive),oldNodes=endpointLevels(old.roads,drive),rawNodes=endpointLevels(core.roads,drive),sourceNodes=endpointLevels(sourceCore.value.roads,drive),coreIds=new Set(core.roads.map(e=>e.id));
 const sourceNodeIDs=new Set(Object.keys(source?.nodes||{})),historicalKeys=new Set(historicalInventory.rows.map(r=>`${r.id}/${r.end}`)),tileSourceRows=new Map(),allIDs=new Set(),owners=new Map(),packs={},requested=new Set(candidate?.requestedRoadIDs||[]),seenProfiles=new Set(),profileIds=new Set(candidate?.tileProfiles.map(p=>p.id)||[]);
 if(candidate&&(profileIds.size!==candidate.tileProfiles.length||requested.size!==candidate.requestedRoadIDs.length||[...requested].some(id=>!profileIds.has(id)||coreIds.has(id))))throw Error('Candidate tile profile inventory is incomplete/duplicate or includes a core ID.');
 const corePatches=api.currentRoadGradePatches(model.roads),corePatchById=new Map(corePatches.map(p=>[p.id,p])),geometryIDs=new Set(model.geometryEdits||[]);
 const geometry={sourceRoadGeometryGeneration:model.sourceRoadGeometryGeneration,sourceGradeModelSHA256:'inventory-explicit',sourcePrototypeSHA256:hash(modelBytes),supersedesRoadGradeProfileIds:[],nodes:model.endpointDisplacements||{},roads:model.roads.filter(e=>geometryIDs.has(e.id)).map(e=>({id:e.id,model:e})),tileRoads:tile.transports,tileNodeSources:tile.nodeSources};
 let scannedCopies=0,contextCopies=0,normalizedCopies=0,transportedCopies=0,profileCopies=0;
 for(const pack of core.packs){
  const path='public/city/'+pack.file,bytes=await readFile(path),data=JSON.parse(gunzipSync(bytes));packs[path]=hash(bytes);
  if(tile.sourcePackSHA256[path]&&tile.sourcePackSHA256[path]!==packs[path]||candidate?.sourcePackSHA256?.[path]&&candidate.sourcePackSHA256[path]!==packs[path])throw Error('Tile source pack changed: '+path);
  for(const [tileKey,rawZone]of Object.entries(data.tiles)){
   const normalized=source?api.applyVerifiedSourceRoadZone(rawZone,source):{value:rawZone,report:{mismatched:[],applied:[]}};
   if(normalized.report.mismatched.length)throw Error('Source-normalized zone mismatch: '+tileKey);
   normalizedCopies+=normalized.report.applied?.length||0;
   const patched={...normalized.value,roads:api.applyRoadGradePatches(normalized.value.roads,normalized.value.roads.flatMap(e=>corePatchById.has(e.id)?[corePatchById.get(e.id)]:[]))};
   const transported=api.applyVerifiedRoadTileGeometry(patched,geometry,[]);
   if(transported.report.mismatched.length)throw Error('Public tile/node transport mismatch: '+tileKey+' '+transported.report.mismatched.join(','));
   transportedCopies+=transported.report.applied.length;
   let finalZone=transported.zone;
   if(candidate){
    const result=api.applyVerifiedRoadTileProfiles(finalZone.roads,candidate.tileProfiles);
    if(result.report.mismatched.length)throw Error('Final candidate tile height mismatch: '+tileKey);
    finalZone={...finalZone,roads:result.roads};
    profileCopies+=result.report.applied.length+result.report.reused.length;
    for(const e of finalZone.roads)if(profileIds.has(e.id))seenProfiles.add(e.id);
   }
   const rawById=new Map(rawZone.roads.map(e=>[e.id,e])),normalizedById=new Map(normalized.value.roads.map(e=>[e.id,e]));
   for(const e of finalZone.roads){if(coreIds.has(e.id)||!drive(e.cls))continue;
    if(e.ctx){contextCopies++;continue;}scannedCopies++;allIDs.add(e.id);
    const raw=rawById.get(e.id),corrected=normalizedById.get(e.id);
    if(!raw||!corrected)throw Error('Road identity changed in tile preparation: '+e.id);
    if(!currentNodes.has(e.from)&&!currentNodes.has(e.to)&&!sourceNodeIDs.has(e.from)&&!sourceNodeIDs.has(e.to))continue;
    const previous=owners.get(e.id),copy={pack:pack.file,tile:tileKey};
    if(previous){if(JSON.stringify(previous.road)!==JSON.stringify(e))throw Error('Final owner copies disagree: '+e.id);previous.copies.push(copy);}
    else owners.set(e.id,{road:e,raw,corrected,copies:[copy]});
   }
  }
 }
 if(candidate&&[...requested].some(id=>!seenProfiles.has(id)))throw Error('Requested final tile profile has no actual packed copy.');
 const rows=[],allHistoricalBoundaries=[];let incident=0,matchingAny=0,matchingEvery=0,ambiguous=0;
 for(const{road:e,raw,corrected,copies}of owners.values())for(const[end,node,index]of[['from',e.from,0],['to',e.to,e.pts.length-1]]){
  if(!node)continue;const rawIndex=end==='from'?0:raw.pts.length-1,sourceIndex=end==='from'?0:corrected.pts.length-1,y=e.elev?.[index]??0,rawY=raw.elev?.[rawIndex]??0,sourceY=corrected.elev?.[sourceIndex]??0;
  const endpoint={id:e.id,cls:e.cls,end,node,y,xz:e.pts[index],rawY,sourceNormalizedY:sourceY,rawXZ:raw.pts[rawIndex],sourceNormalizedXZ:corrected.pts[sourceIndex],ownerCopies:copies};
  if(sourceNodeIDs.has(node)){const values=tileSourceRows.get(node)||[];values.push(endpoint);tileSourceRows.set(node,values);}
  if(!currentNodes.has(node))continue;incident++;
  const current=currentNodes.get(node),prior=oldNodes.get(node)||[],rawCore=rawNodes.get(node)||[],correctedCore=sourceNodes.get(node)||[],comparison=compareEndpointLevels(y,current),oldComparison=compareEndpointLevels(rawY,prior);
  if(comparison.matchesAnyCoreLevel)matchingAny++;if(comparison.matchesEveryCoreArm)matchingEvery++;if(comparison.ambiguousCoreLevels)ambiguous++;
  const row={id:e.id,cls:e.cls,end,node,sourceEndpointXZ:raw.pts[rawIndex],sourceEndpointY:rawY,normalizedSourceEndpointXZ:corrected.pts[sourceIndex],normalizedSourceEndpointY:sourceY,currentEndpointXZ:e.pts[index],currentEndpointY:y,currentMinimumHeightDisagreement:comparison.minimum,currentMaximumHeightDisagreement:comparison.maximum,currentCoreHeightSpread:comparison.spread,matchesAnyCoreLevel:comparison.matchesAnyCoreLevel,matchesEveryCoreArm:comparison.matchesEveryCoreArm,ambiguousCoreLevels:comparison.ambiguousCoreLevels,historicalMinimumHeightDisagreement:oldComparison.minimum,rawCoreMinimumHeightDisagreement:compareEndpointLevels(rawY,rawCore).minimum,sourceNormalizedCoreMinimumHeightDisagreement:compareEndpointLevels(sourceY,correctedCore).minimum,newSinceHistorical:oldComparison.minimum!==null&&oldComparison.minimum<=.02&&!comparison.matchesAnyCoreLevel,currentCoreLevels:current,historicalCoreLevels:prior,inModeledXYNodes:!!model.endpointDisplacements?.[node],inTileXYOverlay:tile.transports.some(p=>p.id===e.id),inFinalTileHeightProfiles:profileIds.has(e.id),ownerCopies:copies,classification:'unclassified-source-node-surface'};
  if(!comparison.matchesEveryCoreArm)rows.push(row);
  if(historicalKeys.has(`${e.id}/${end}`))allHistoricalBoundaries.push(row);
 }
 if(allHistoricalBoundaries.length!==historicalKeys.size)throw Error('Historical boundary coverage incomplete: '+allHistoricalBoundaries.length+'/'+historicalKeys.size);
 const sourceNodeHeightInventory=[...sourceNodeIDs].sort().map(node=>{const coreRows=currentNodes.get(node)||[],tiles=tileSourceRows.get(node)||[];return{node,...summarizeNodeLevels(coreRows,tiles),currentCoreLevels:coreRows,currentTileLevels:tiles,rawCoreLevels:rawNodes.get(node)||[],sourceNormalizedCoreLevels:sourceNodes.get(node)||[],historicalCoreLevels:oldNodes.get(node)||[],sourceNode:source.nodes[node]};});
 const actualMismatches=rows.filter(r=>!r.matchesAnyCoreLevel);
 const summary={packs:core.packs.length,uniqueTileOnlyDrivableRoads:allIDs.size,ownerCopies:scannedCopies,contextCopies,sourceNormalizedCopies:normalizedCopies,inferredTransportCopies:transportedCopies,finalTileProfileCopies:profileCopies,coreIncidentTileEndpoints:incident,matchingAtLeastOneCoreLevelWithin2cm:matchingAny,matchingEveryCoreArmWithin2cm:matchingEvery,ambiguousCoreLevelEndpoints:ambiguous,unresolvedAllArmEndpoints:rows.length,mismatchedEndpoints:actualMismatches.length,mismatchedRoads:new Set(actualMismatches.map(r=>r.id)).size,newMismatchEndpointsSinceHistorical:actualMismatches.filter(r=>r.newSinceHistorical).length,maximumCurrentDisagreement:Math.max(0,...actualMismatches.map(r=>r.currentMinimumHeightDisagreement)),historicalBoundaryCases:allHistoricalBoundaries.length,historicalBoundaryCasesAllArmsJoined:allHistoricalBoundaries.filter(r=>r.matchesEveryCoreArm).length,sourceRepairedNodes:sourceNodeHeightInventory.length,sourceRepairedNodesAllIncidentArmsJoined:sourceNodeHeightInventory.filter(r=>r.allIncidentArmsJoinWithin2cm).length,sourceRepairedNodesRequiringSurfaceClassification:sourceNodeHeightInventory.filter(r=>r.requiresSurfaceClassification).length};
 summary.worsenedExistingMismatchEndpoints=actualMismatches.filter(r=>r.historicalMinimumHeightDisagreement!==null&&r.currentMinimumHeightDisagreement>r.historicalMinimumHeightDisagreement+.02).length;
 summary.maximumWorsening=Math.max(0,...actualMismatches.filter(r=>r.historicalMinimumHeightDisagreement!==null).map(r=>r.currentMinimumHeightDisagreement-r.historicalMinimumHeightDisagreement));
 for(const[file,expected]of Object.entries(sourceHashes))if(hash(await readFile(file))!==expected)throw Error('Input source changed during inventory: '+file);
 const out={schemaVersion:2,scope:'All actual owner drivable tile-only endpoints after explicit source normalization, final core patches, and public inferred tile/node transport. Optional final height profiles are explicitly bound. Any-level matches remain diagnostics; every multi-level incident arm and all historical300/source50 nodes remain visible for physical source/cap/underpass classification. This endpoint inventory does not establish actual mesh or driving acceptance.',stage:candidate?'explicit-final-tile-profiles':'ordinary-unsolved-core-and-source-normalized-tile-transports',inputs:{model:modelFile,modelSHA256:hash(modelBytes),tileSupplement:tileFile,tileSupplementSHA256:hash(tileBytes),historicalWorld:oldFile,historicalSHA256:hash(oldBytes),historicalInventory:historicalInventoryFile,historicalInventorySHA256:hash(inventoryBytes),rawCoreSHA256:hash(coreBytes),sourceGeometry:sourceFile,sourceGeometrySHA256:sourceBytes?hash(sourceBytes):null,sourceRoadGeometryGeneration:source?.generationID,candidateTiles:candidateFile,candidateTilesSHA256:candidateBytes?hash(candidateBytes):null,sourceFiles:sourceHashes},summary,rows,allHistoricalBoundaries,sourceNodeHeightInventory,packSHA256:packs};
 await writeFile(resolve(output),JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary));
}finally{await rm(temp,{recursive:true,force:true});}

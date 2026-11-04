#!/usr/bin/env node
// Inactive offline input builder. Never writes a pack, profile, target or manifest.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url)),args={},extraEvidence=[];
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==='--help'){console.log('node scripts/export-joint-road-tile-input.mjs --model CORE --source-geometry SOURCE --tile-transports SUPPLEMENT --selection ASSESSMENT --output NEW_FILE [--manifest IMMUTABLE_MANIFEST] [--physical-baseline FRAME_BOUND_21_ROAD_BASELINE] [--source-evidence FULL_SOURCE_JSON ...]');process.exit(0);}
  if(key==='--source-evidence'&&process.argv[i+1]){extraEvidence.push(resolve(process.argv[++i]));continue;}
  if(!['--model','--source-geometry','--tile-transports','--selection','--output','--manifest','--physical-baseline','--fixed-tile-constraints','--owner-promotions','--physical-core-windows'].includes(key)||!process.argv[i+1])throw Error('Unknown/incomplete option '+key);
  args[key.slice(2)]=resolve(process.argv[++i]);
}
for(const key of ['model','source-geometry','tile-transports','selection','output'])if(!args[key])throw Error('Missing --'+key);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),stable=value=>JSON.stringify(value),arc=pts=>{const aa=[0];for(let i=1;i<pts.length;i++)aa.push(aa.at(-1)+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return aa;};
const inputs={},readBound=async(key,path)=>{const bytes=await readFile(path);inputs[key]={path,sha256:sha(bytes)};return JSON.parse(bytes);};
const model=await readBound('model',args.model),source=await readBound('sourceGeometry',args['source-geometry']),existing=await readBound('tileTransports',args['tile-transports']),selection=await readBound('selection',args.selection);
if(selection.inputs?.modelSHA256!==inputs.model.sha256)throw Error('Selection model mismatch');
const explicitOwners=selection.explicitCoreEndpointOwners;
if(!Array.isArray(explicitOwners)||explicitOwners.some(r=>!r||typeof r.id!=='string'||!r.id))throw Error('Invalid or missing explicit core-endpoint owner selection; regenerate the assessment');
const coreCoverage=args['physical-core-windows']?await readBound('physicalCoreCoverage',args['physical-core-windows']):null;
let coverageFootprints;
if(coreCoverage){
 if(coreCoverage.version!==1||coreCoverage.sourceModelSHA256!==inputs.model.sha256||!coreCoverage.roads||!Object.keys(coreCoverage.roads).length)throw Error('Stale or empty affected-core coverage');
 coverageFootprints=await readBound('physicalCoreFootprints',coreCoverage.sourceFootprints.path);
 if(inputs.physicalCoreFootprints.sha256!==coreCoverage.sourceFootprints.sha256)throw Error('Affected-core physical footprint binding changed');
 if(coverageFootprints.sourceModelSHA256!==inputs.model.sha256||!Array.isArray(coverageFootprints.roads))throw Error('Affected-core footprint/model mismatch');
 coverageFootprints=coverageFootprints.roads;
 const current=new Map(model.roads.map(e=>[e.id,e]));
 const footprints=new Map(coverageFootprints.map(e=>[e.id,e]));
 for(const[id,row]of Object.entries(coreCoverage.roads)){
  const e=current.get(id),f=footprints.get(id),length=e?arc(e.pts).at(-1):NaN;
  if(!e||!f||f.L.length!==e.pts.length||f.R.length!==e.pts.length||!row.ranges?.length||row.ranges.some(r=>r.length!==2||!r.every(Number.isFinite)||r[0]<0||r[1]<r[0]||r[1]>length+1e-8))throw Error('Invalid affected-core coverage road '+id);
 }
}
const fixedConstraints=args['fixed-tile-constraints']?await readBound('fixedTileConstraints',args['fixed-tile-constraints']):null,fixedRoads=new Map((fixedConstraints?.roads||[]).map(e=>[e.id,e]));
// An explicit, source-bound baseline permits an additive source frame. The
// same generation, complete 21-road census, actual source-copy and literal
// footprint guards below apply to both paths; default behavior stays exact.
const physicalBaselines=await readBound('physicalBaselines',args['physical-baseline']??join(root,'docs/qa/evidence/reported-roads/joint-tile-baseline-pavement-21-9413.json'));
if(physicalBaselines.version!==1||physicalBaselines.sourceRoadGeometryGeneration!==source.generationID||physicalBaselines.sourceDataSHA256!==inputs.sourceGeometry.sha256||physicalBaselines.sourceCoreSHA256!==source.sourceCorePackSHA256)throw Error('Stale literal tile pavement baseline');
const physicalById=new Map(physicalBaselines.roads.map(r=>[r.id,r]));
if(physicalById.size!==physicalBaselines.roads.length||physicalById.size!==21)throw Error('Incomplete literal tile pavement inventory');
const promotions=args['owner-promotions']?await readBound('ownerPromotions',args['owner-promotions']):null;
const promotionParent=promotions?await readBound('promotionParent',promotions.parentJoint.path):null;
if(promotions&&(promotions.version!==1||promotions.kind!=='source-bound-joint-owner-promotion'||inputs.promotionParent.sha256!==promotions.parentJoint.sha256||promotions.sourceModelSHA256!==inputs.model.sha256||promotions.sourceRoadGeometryGeneration!==source.generationID||promotions.sourceDataSHA256!==inputs.sourceGeometry.sha256||promotions.sourceCoreSHA256!==source.sourceCorePackSHA256))throw Error('Stale owner-promotion binding');
const promotionById=new Map((promotions?.roads||[]).map(r=>[r.id,r]));
if(promotions&&(!promotionById.size||promotionById.size!==promotions.roads.length||promotionById.size>3))throw Error('Owner promotions require a bounded unique source inventory');
for(const r of promotionById.values())if(!r.preserveCoarseControls||!Number.isFinite(r.physicalWidth)||r.physicalWidth!==r.expectedPreparedRoad.w||sha(stable(r.expectedFootprint))!==r.footprintSHA256||stable(promotionParent.contextRoads.find(e=>e.id===r.id))!==stable(r.expectedPreparedRoad)||stable(promotionParent.contextFootprints.find(e=>e.id===r.id))!==stable(r.expectedFootprint)||stable(promotionParent.contextCopies[r.id])!==stable(r.copies)||stable(promotionParent.sourceEvidence[r.id.split('_')[0]])!==stable(r.sourceProof))throw Error('Changed exact owner/source/footprint promotion '+r.id);
const corePath=join(root,'public/city/core.pack.wasm'),coreBytes=await readFile(corePath),core=JSON.parse(gunzipSync(coreBytes));inputs.rawCore={path:corePath,sha256:sha(coreBytes)};
if(source.sourceCorePackSHA256!==inputs.rawCore.sha256||model.sourceRoadGeometryGeneration!==source.generationID||existing.sourceRoadGeometryGeneration!==source.generationID||existing.sourceDataSHA256!==inputs.sourceGeometry.sha256||existing.sourceCoreSHA256!==inputs.rawCore.sha256||existing.sourceModelSHA256!==inputs.model.sha256)throw Error('Mixed source generation/core/model/supplement');
if(selection.inputs?.sourceGeometryGeneration!==source.generationID||selection.inputs?.sourceGeometrySHA256!==inputs.sourceGeometry.sha256)throw Error('Selection source generation mismatch');
if(args.manifest){const manifest=await readBound('manifest',args.manifest);for(const[key,input]of[['model','model'],['sourceData','sourceGeometry'],['tileSupplement','tileTransports']])if(manifest[key]?.sha256!==inputs[input].sha256)throw Error('Immutable manifest binding mismatch: '+key);}
const result=selection.results?.find(r=>r.summary?.grade===.065)??selection.results?.[0];
if(!result||!Array.isArray(result.changedRoads)||!Array.isArray(result.rows))throw Error('Selection must be the bound grade-envelope assessment');
const selected=new Set([...result.changedRoads,...result.rows.map(r=>r.id),...(result.sourceCorrectedNodes||[]).flatMap(r=>(r.tileLevels||[]).map(e=>e.id)),...explicitOwners.map(r=>r.id),...(existing.tileRoads||[]).map(r=>r.id)]);
for(const id of promotionById.keys()){if(selected.has(id))throw Error('Owner promotion is already selected '+id);selected.add(id);}
if(coreCoverage&&stable([...selected].sort())!==stable(coreCoverage.sourceSelectedRoadIDs))throw Error('Affected-core selection does not bind this detailed owner inventory');
const evidencePaths=[
 'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/retained-source-2026-10-21.json',
 'docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/classification.json',
 'docs/qa/evidence/reported-roads/pjr-bridge-start-source-9413.json',
 'docs/qa/evidence/reported-roads/pjr-opposing-bridge-source-9413.json',
 'docs/qa/evidence/reported-roads/pjr-connected-apron-classification-9413.json',
 'docs/qa/evidence/reported-roads/tile-unknown-subclass-source-9413.json',
 'docs/qa/evidence/reported-roads/source-node-actual-surfaces-diagnostic-9413-v2.json',
 'docs/qa/evidence/reported-roads/pv-source-family-retained.json',
 'docs/qa/evidence/reported-roads/masab-golkonda-retained-source.json',
 'docs/qa/evidence/reported-roads/remaining-apron-retained-source.json',
 'docs/qa/evidence/reported-roads/langar-de9-retained-geometry.json',
 'docs/qa/evidence/reported-roads/geodetic-source-repair-generation-2-20261103/retained-f4ca-source-2026-10-21.json',
 'docs/qa/evidence/reported-roads/geodetic-known-model-source-completion-20261103/retained-35-source-2026-10-21.json',
 ...extraEvidence,
];
const evidence={},sourceRows=new Map(),classification=new Map();
for(const rel of evidencePaths){const path=resolve(root,rel),value=await readBound(rel,path);evidence[rel]=value;
 for(const row of value.rows||[])if(row.id&&row.id.length>30&&row.connectors){const old=sourceRows.get(row.id.slice(0,12));
  for(const field of ['id','connectors','geometryWKB','level_rules','road_flags','width_rules','access_restrictions','class'])if(old&&Object.hasOwn(old.row,field)&&Object.hasOwn(row,field)&&stable(old.row[field])!==stable(row[field]))throw Error('Conflicting retained source '+field+' proof '+row.id);
  sourceRows.set(row.id.slice(0,12),{row:{...old?.row,...row},path,sha256:inputs[rel].sha256,retainedFields:[...new Set([...Object.keys(old?.row||{}),...Object.keys(row)])].sort(),allReleaseColumnsCaptured:value.query?.startsWith('SELECT * ')||old?.allReleaseColumnsCaptured||false,priorBindings:old?[...(old.priorBindings||[]),{path:old.path,sha256:old.sha256}]:[]});}
 if(rel.endsWith('/classification.json'))for(const row of value.rows)classification.set(row.id+'/'+row.node,row);
}
const coreIds=new Set(model.roads.map(r=>r.id)),coreById=new Map(model.roads.map(r=>[r.id,r])),coreIncidence=new Map();
for(const e of model.roads)for(const[node,k]of[[e.from,0],[e.to,e.pts.length-1]])if(node){const rows=coreIncidence.get(node)||[];rows.push({id:e.id,end:k===0?'from':'to',point:e.pts[k],y:e.elev?.[k]??0});coreIncidence.set(node,rows);}
const transportById=new Map((existing.transports||[]).map(r=>[r.id,r]));
const temporary=await mkdtemp(join(tmpdir(),'joint-road-tile-input-'));
try{
 const apiFile=join(temporary,'api.mjs');
 const compiled=await build({stdin:{contents:"export{applyVerifiedSourceRoadZone}from'./src/world/road-source-geodesic';export{applyTileRoadNodeTransports,transportTileRoadNodes,tileRoadSourceInput}from'./src/world/road-node-transport';export{roadRibbon}from'./src/world/bridge-clearance';export{roadPavementWidth}from'./src/world/road-pavement';",resolveDir:root,loader:'ts'},outfile:apiFile,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,logLevel:'error'});
 const api=await import(pathToFileURL(apiFile)),sourceFiles={};
 for(const path of Object.keys(compiled.metafile.inputs).filter(p=>p!=='<stdin>')){const absolute=resolve(root,path);sourceFiles[absolute]=sha(await readFile(absolute));}
 sourceFiles[fileURLToPath(import.meta.url)]=sha(await readFile(fileURLToPath(import.meta.url)));
 const packHashes={},meta=new Map(),tileIncidence=new Map(),selectedRoads=new Map(),selectedSourceRoads=new Map(),selectedCopies=new Map(),copyIssues=[];
 const copyInput=e=>api.tileRoadSourceInput(e),fullRoad=e=>({...e,name:e.name??null,seg:e.seg??e.id,lanes:e.lanes??1,oneway:e.oneway??null,maxspeed:e.maxspeed??null,elev:e.elev??null});
 const scan=async visitor=>{
  for(const pack of core.packs){const path=join(root,'public/city',pack.file),bytes=await readFile(path),hash=sha(bytes);if(packHashes[pack.file]&&packHashes[pack.file]!==hash||physicalBaselines.sourcePackSHA256['public/city/'+pack.file]&&physicalBaselines.sourcePackSHA256['public/city/'+pack.file]!==hash||promotions&&promotions.sourcePackSHA256['public/city/'+pack.file]!==hash)throw Error('Pack changed during export '+pack.file);packHashes[pack.file]=hash;
   for(const[tile,rawZone]of Object.entries(JSON.parse(gunzipSync(bytes)).tiles)){
    const normalized=api.applyVerifiedSourceRoadZone(rawZone,source);if(normalized.report.mismatched.length)throw Error('Source normalization mismatch '+tile);
    const transported=api.applyTileRoadNodeTransports(normalized.value.roads,existing.transports||[]);if(transported.mismatched.length)throw Error('Existing inferred transport mismatch '+tile+':'+transported.mismatched.join(','));
    const prepared=new Map(transported.roads.map(e=>[e.id,e])),rawById=new Map(rawZone.roads.map(e=>[e.id,e]));
    for(const e of normalized.value.roads)if(!coreIds.has(e.id))visitor({e,prepared:prepared.get(e.id),raw:rawById.get(e.id),pack:pack.file,tile,context:!!e.ctx});
   }
  }
 };
 const copyRecord=({e,raw,pack,tile,context})=>({pack,tile,context,rawRoadSHA256:sha(stable(raw)),sourceRoadSHA256:sha(stable(e)),sourceInput:copyInput(e),laneMetadataOmitted:context&&e.lanes===undefined});
 await scan(c=>{
  const{e,prepared,context}=c;
  if(!context){const actual=fullRoad(prepared),prior=meta.get(e.id),current=copyInput(actual),signature=sha(stable(current));
   if(prior&&prior.signature!==signature)copyIssues.push({id:e.id,issue:'owner geometry variant'});
   if(!prior){const aa=arc(actual.pts);meta.set(e.id,{id:e.id,from:e.from??null,to:e.to??null,cls:e.cls,w:e.w,length:aa.at(-1),start:actual.pts[0],end:actual.pts.at(-1),startY:actual.elev?.[0]??0,endY:actual.elev?.at(-1)??0,rawStartY:e.elev?.[0]??0,rawEndY:e.elev?.at(-1)??0,signature});for(const n of new Set([e.from,e.to].filter(Boolean))){const rows=tileIncidence.get(n)||[];rows.push(e.id);tileIncidence.set(n,rows);}}
  }
  if(selected.has(e.id)){
   (selectedCopies.get(e.id)||selectedCopies.set(e.id,[]).get(e.id)).push(copyRecord(c));
   if(!context){selectedRoads.set(e.id,fullRoad(prepared));selectedSourceRoads.set(e.id,e);}
  }
 });
 for(const id of selected)if(!selectedRoads.has(id))throw Error('Selected detailed owner missing '+id);
 if(copyIssues.length)throw Error('Owner variants: '+stable(copyIssues));
 const transports=[],tileRoads=[],preHeightWidths=[];
 for(const id of [...selected].sort()){
  const sourceRoad=selectedSourceRoads.get(id),prepared=selectedRoads.get(id),old=transportById.get(id),fixed=fixedRoads.get(id),physical=physicalById.get(id),promoted=promotionById.get(id);let p;
  if(fixed){if(stable(copyInput(sourceRoad))!==stable(copyInput(fixed)))throw Error('Fixed detailed source geometry changed '+id);p={id,expected:copyInput(sourceRoad),pts:structuredClone(fixed.pts),elev:structuredClone(fixed.elev??null),sourceArc:arc(fixed.pts),sourceXY:structuredClone(fixed.pts),maximumDisplacement:0,minimumTransportMask:1};}
  else if(old){const checked=api.applyTileRoadNodeTransports([sourceRoad],[old]);if(checked.mismatched.length||stable(checked.roads[0].pts)!==stable(prepared.pts))throw Error('Existing prepared points changed '+id);p=structuredClone(old);}
  else if(physical){
   if(stable(copyInput(sourceRoad))!==stable(physical.expected)||stable(prepared.pts)!==stable(sourceRoad.pts)||stable(prepared.elev??null)!==stable(sourceRoad.elev??null)||sha(stable(physical.historicalFootprint))!==physical.historicalFootprintSHA256)throw Error('Changed literal pavement source '+id);
   p={id,expected:copyInput(sourceRoad),pts:structuredClone(sourceRoad.pts),elev:structuredClone(sourceRoad.elev??null),sourceArc:arc(sourceRoad.pts),sourceXY:structuredClone(sourceRoad.pts),maximumDisplacement:0,minimumTransportMask:1,
    scenerySource:{pts:structuredClone(sourceRoad.pts),elev:structuredClone(sourceRoad.elev??null),width:physical.physicalWidth}};
  }else if(promoted){
   if(stable(copyInput(sourceRoad))!==stable(promoted.expected)||stable(fullRoad(prepared))!==stable(promoted.expectedPreparedRoad)||stable(selectedCopies.get(id))!==stable(promoted.copies))throw Error('Changed promoted owner/context source '+id);
   const length=arc(sourceRoad.pts).at(-1),width=promoted.physicalWidth;
   p={id,expected:copyInput(sourceRoad),pts:structuredClone(sourceRoad.pts),elev:structuredClone(sourceRoad.elev??null),sourceArc:arc(sourceRoad.pts),sourceXY:structuredClone(sourceRoad.pts),maximumDisplacement:0,minimumTransportMask:1,
    joinedPavement:{sourceWidth:sourceRoad.w,originalWidth:width,physicalWidth:width,intervals:[[0,length]],taper:1,release:'source-bound-facility-approach-coarse-baseline-v1'},
    scenerySource:{pts:structuredClone(sourceRoad.pts),elev:structuredClone(sourceRoad.elev??null),width}};
  }else{const identities={};if(sourceRoad.from)identities[sourceRoad.from]={before:sourceRoad.pts[0],after:sourceRoad.pts[0],delta:[0,0]};if(sourceRoad.to)identities[sourceRoad.to]={before:sourceRoad.pts.at(-1),after:sourceRoad.pts.at(-1),delta:[0,0]};p=api.transportTileRoadNodes(sourceRoad,identities,()=>1);if(!p)throw Error('Cannot bind sparse road without source endpoints '+id);}
  const before=fullRoad(prepared),width=api.roadPavementWidth(before,0),length=arc(p.pts).at(-1);
  // Explicitly preserve the physical width that existed BEFORE any future Y
  // solve. This transaction changes no height and makes no bridge declaration.
  if(physical){if(old||fixed||width!==physical.physicalWidth)throw Error('Literal baseline conflicts with prepared policy '+id);p.joinedPavement={sourceWidth:before.w,originalWidth:width,physicalWidth:width,intervals:[[0,length]],taper:1,release:'joint-tile-literal-baseline-width-v2'};}
  else if(!fixed&&!p.joinedPavement)p.joinedPavement=before.joinedPavement?structuredClone(before.joinedPavement):{sourceWidth:before.w,originalWidth:width,intervals:[[0,length]],taper:1,release:'joint-tile-baseline-width-v1'};
  const applied=api.applyTileRoadNodeTransports([sourceRoad],[p]);if(applied.mismatched.length)throw Error('Prepared transport does not bind '+id);
  const road={...fullRoad(applied.roads[0]),sourceArc:p.sourceArc,sourceXY:p.sourceXY};
  // Every raw source control must remain, every final segment is <=2m for
  // newly densified streets, and original elevations are interpolated only.
  const denseArc=arc(road.pts);if(!old&&!fixed&&!physical&&!promoted&&denseArc.slice(1).some((s,i)=>s-denseArc[i]>2.000001))throw Error('Sparse road not densified '+id);
  if(physical){const{L,R}=api.roadRibbon(road,[road]);if(stable({id,L,R})!==stable(physical.historicalFootprint))throw Error('Literal historical ribbon not preserved '+id);}
  for(const copy of selectedCopies.get(id)){const result=api.applyTileRoadNodeTransports([{...sourceRoad,...copy.sourceInput,...(copy.context?{ctx:1}:{}),...(copy.laneMetadataOmitted?{lanes:undefined}:{})}],[p]);if(result.mismatched.length||stable(result.roads[0].pts)!==stable(road.pts)||stable(result.roads[0].elev)!==stable(road.elev))throw Error('Owner/context input mismatch '+id);}
  const copies=selectedCopies.get(id);transports.push({...p,copies});tileRoads.push(road);preHeightWidths.push({id,widthBefore:width,formerlyFlat:!(before.elev||[]).some(y=>y>1.2),joinedPavement:road.joinedPavement,preservedExistingPreparedArrays:!!old,preservedFixedSourceArrays:!!fixed,...(physical?{preservedLiteralHistoricalCoarseRibbon:true,historicalFootprintSHA256:physical.historicalFootprintSHA256,coarseControlCount:road.pts.length}:{} ),...(promoted?{preservedCoarseApproachControls:true,baselineFootprintSHA256:promoted.footprintSHA256,coarseControlCount:road.pts.length,promotionReason:promoted.reason}:{})});
 }
 if(preHeightWidths.filter(r=>r.preservedLiteralHistoricalCoarseRibbon).length!==physicalById.size)throw Error('Selected literal pavement baseline inventory incomplete');
 const selectedNodes=new Set(tileRoads.flatMap(r=>[r.from,r.to]).filter(Boolean)),boundaryIds=new Set();
 for(const node of selectedNodes)for(const id of tileIncidence.get(node)||[])if(!selected.has(id))boundaryIds.add(id);
 const selectedQuadGrid=new Map(),initialRoads=[...model.roads,...tileRoads];
 const cells=(bounds,visit)=>{for(let x=Math.floor(bounds[0]/40);x<=Math.floor(bounds[1]/40);x++)for(let z=Math.floor(bounds[2]/40);z<=Math.floor(bounds[3]/40);z++)visit(x+','+z);};
 const bounds=pts=>[Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1]))];
 const pad=(b,n)=>[b[0]-n,b[1]+n,b[2]-n,b[3]+n];
 // Context must cover the affected core too. Looking only beside selected
 // detailed streets missed literal road/underpass crossings in ordinary packs.
 // These conservative source extents add fixed obstacles, never Y authority.
 const coreCoverageQuads=[];
 if(coreCoverage){const byId=new Map(coverageFootprints.map(f=>[f.id,f]));for(const[id,row]of Object.entries(coreCoverage.roads)){
  const e=coreById.get(id),f=byId.get(id),aa=arc(e.pts);
  for(let i=0;i<aa.length-1;i++)if(row.ranges.some(([a,b])=>aa[i+1]>=a-1e-8&&aa[i]<=b+1e-8))coreCoverageQuads.push([f.R[i],f.R[i+1],f.L[i+1],f.L[i]]);
 }}
 for(const q of [...tileRoads.flatMap(e=>api.roadRibbon(e,initialRoads).quads),...coreCoverageQuads]){
  const poly=q.map(p=>p.length===3?[p[0],p[2]]:p);cells(pad(bounds(poly),50),key=>(selectedQuadGrid.get(key)||selectedQuadGrid.set(key,[]).get(key)).push(poly));
 }
 const nearby=new Map(),nearbyCopies=new Map();
 await scan(c=>{if(selected.has(c.e.id))return;const b=pad(bounds(c.prepared.pts),Math.max(c.prepared.w,8.4)/2),keys=new Set();cells(b,key=>{if(selectedQuadGrid.has(key))keys.add(key);});if(!keys.size&&!boundaryIds.has(c.e.id))return;
  (nearbyCopies.get(c.e.id)||nearbyCopies.set(c.e.id,[]).get(c.e.id)).push(copyRecord(c));if(!c.context)nearby.set(c.e.id,fullRoad(c.prepared));});
 const candidates=[...nearby.values()],allRoads=[...model.roads,...tileRoads,...candidates],footprints=tileRoads.map(e=>{const{L,R}=api.roadRibbon(e,allRoads);return{id:e.id,L,R};});
 for(const r of promotionById.values())if(stable(footprints.find(f=>f.id===r.id))!==stable(r.expectedFootprint))throw Error('Promoted owner physical footprint changed '+r.id);
 const selectedFinalGrid=new Map();for(const q of [...footprints.flatMap(fr=>fr.L.slice(1).map((_,i)=>[fr.R[i],fr.R[i+1],fr.L[i+1],fr.L[i]])),...coreCoverageQuads])cells(pad(bounds(q),20),key=>(selectedFinalGrid.get(key)||selectedFinalGrid.set(key,[]).get(key)).push(q));
 const segmentDistance2=(a,b,c)=>{const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((c[0]-a[0])*dx+(c[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return(c[0]-a[0]-u*dx)**2+(c[1]-a[1]-u*dz)**2;};
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const segmentsMeet=(a,b,c,d)=>{const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);return o1*o2<0&&o3*o4<0||Math.min(segmentDistance2(a,b,c),segmentDistance2(a,b,d),segmentDistance2(c,d,a),segmentDistance2(c,d,b))<1e-16;};
 const inside=(point,polygon)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const polygonsNear=(a,b)=>{if(inside(a[0],b)||inside(b[0],a))return true;for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const aa=a[i],ab=a[(i+1)%a.length],ba=b[j],bb=b[(j+1)%b.length];if(segmentsMeet(aa,ab,ba,bb)||Math.min(segmentDistance2(aa,ab,ba),segmentDistance2(aa,ab,bb),segmentDistance2(ba,bb,aa),segmentDistance2(ba,bb,ab))<=400.000001)return true;}return false;};
 const contextRoads=[],contextFootprints=[],boundaryRoads=[];
 for(const e of candidates){const ribbon=api.roadRibbon(e,allRoads);let included=false;for(const quad of ribbon.quads){const poly=quad.map(p=>[p[0],p[2]]),others=new Set();cells(bounds(poly),key=>{for(const q of selectedFinalGrid.get(key)||[])others.add(q);});if([...others].some(q=>polygonsNear(poly,q))){included=true;break;}}
  if(included){contextRoads.push(e);contextFootprints.push({id:e.id,L:ribbon.L,R:ribbon.R});}
  if(boundaryIds.has(e.id))boundaryRoads.push(e);
 }
 if(boundaryRoads.length!==boundaryIds.size)throw Error('All incident detailed boundary arms not found');
 for(const id of coreCoverage?.requiredForeignWitnessRoadIDs||[])if(!coreIds.has(id)&&!selected.has(id)&&!contextRoads.some(e=>e.id===id))throw Error('Actual emitted foreign crossing is still missing '+id);
 // Collect ALL copies after exact spatial selection, including a border copy
 // whose metadata/bounds differ. Such variants are explicit failures, never
 // resolved by silently selecting the convenient actual owner.
 const fixedById=new Map([...contextRoads,...boundaryRoads].map(e=>[e.id,e])),completeFixedCopies=new Map();
 await scan(c=>{const owner=fixedById.get(c.e.id);if(!owner)return;const actual=copyInput(c.prepared),expected=copyInput(owner);if(c.context&&c.e.lanes===undefined)actual.lanes=expected.lanes;
  if(stable(actual)!==stable(expected))throw Error('Fixed context/incident arm physical variant '+c.e.id);
  (completeFixedCopies.get(c.e.id)||completeFixedCopies.set(c.e.id,[]).get(c.e.id)).push(copyRecord(c));
 });
 const tileById=new Map(tileRoads.map(r=>[r.id,r])),sourceProof=id=>{const record=sourceRows.get(id.split('_')[0]);return record?{state:'retained-full-source',...record}:{state:'unresolved-full-source',sourcePrefix:id.split('_')[0]};};
 const nodeRecords=[];
 for(const node of [...selectedNodes].sort()){
  const coreArms=coreIncidence.get(node)||[],arms=(tileIncidence.get(node)||[]).map(id=>{const r=tileById.get(id),p=meta.get(id),isFrom=p.from===node;return{id,end:isFrom?'from':'to',selected:!!r,point:r?r.pts[isFrom?0:r.pts.length-1]:isFrom?p.start:p.end,y:r?r.elev?.[isFrom?0:r.pts.length-1]??0:isFrom?p.startY:p.endY,rawSourceY:isFrom?p.rawStartY:p.rawEndY};});
  const proofs=[...new Set([...coreArms,...arms].map(r=>r.id))].map(id=>({id,source:sourceProof(id)}));
  const connectorAliases=[...new Set(proofs.flatMap(p=>(p.source.row?.connectors||[]).filter(c=>c.connector_id.slice(0,12)===node).map(c=>c.connector_id)))];
  nodeRecords.push({node,fullConnectorAliases:connectorAliases,coreArms,tileArms:arms,sourceProofs:proofs,allCoreHeightsAgreeWithin1cm:coreArms.length?Math.max(...coreArms.map(a=>a.y))-Math.min(...coreArms.map(a=>a.y))<=.01:null,modeledZeroIsSurveyedGround:false,classification:result.rows.filter(r=>r.node===node).map(r=>({id:r.id,category:r.category,graphAnchorCompatible:r.graphAnchorCompatible,fullGraphConflict:r.fullGraphConflict})),sourceConnectionVerifiedForEveryArm:proofs.every(p=>p.source.row&&(p.source.row.connectors||[]).some(c=>c.connector_id.slice(0,12)===node))&&connectorAliases.length===1});
 }
 const adjacency=new Map();for(const e of tileRoads)for(const[a,b]of[[e.from,e.to],[e.to,e.from]])if(a&&b)(adjacency.get(a)||adjacency.set(a,[]).get(a)).push({to:b,id:e.id,length:arc(e.pts).at(-1)});
 const components=[],visited=new Set();for(const first of [...selectedNodes].sort())if(!visited.has(first)){const todo=[first],nodes=[],roadIds=new Set();while(todo.length){const node=todo.pop();if(visited.has(node))continue;visited.add(node);nodes.push(node);for(const edge of adjacency.get(node)||[]){roadIds.add(edge.id);if(!visited.has(edge.to))todo.push(edge.to);}}components.push({nodes:nodes.sort(),tileRoadIds:[...roadIds].sort(),coreAnchorNodes:nodes.filter(n=>coreIncidence.has(n)).sort(),requiresJointCoreReconciliation:nodes.some(n=>result.rows.some(r=>r.node===n&&!r.graphAnchorCompatible)),fixedTargets:[]});}
 const shortestAnchorLinks=[];for(const comp of components)for(const start of comp.coreAnchorNodes){const queue=[[0,start,[]]],dist=new Map();while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const[d,node,path]=queue.pop();if(dist.has(node))continue;dist.set(node,d);if(node!==start&&coreIncidence.has(node)){if(start<node)shortestAnchorLinks.push({from:start,to:node,length:d,tileRoads:path});continue;}for(const edge of adjacency.get(node)||[])if(!dist.has(edge.to))queue.push([d+edge.length,edge.to,[...path,edge.id]]);}}
 if(promotions){
  for(const key of ['tileRoads','transports','footprints','preHeightWidths']){const byId=new Map(({tileRoads,transports,footprints,preHeightWidths})[key].map(r=>[r.id,r]));for(const old of promotionParent[key])if(stable(old)!==stable(byId.get(old.id)))throw Error('Prior selected owner changed during promotion '+key+':'+old.id);}
  for(const [id,old]of Object.entries(promotionParent.copies))if(stable(old)!==stable(selectedCopies.get(id)))throw Error('Prior owner/context copies changed '+id);
  const addedNodes=new Set([...promotionById.values()].flatMap(r=>[r.expected.from,r.expected.to]).filter(Boolean));
  for(const node of addedNodes){const record=nodeRecords.find(r=>r.node===node);if(!record?.sourceConnectionVerifiedForEveryArm)throw Error('Promoted endpoint lacks exact complete source-connector proof '+node);}
 }
 // Every source input, helper and pack is held through the complete export.
 for(const entry of Object.values(inputs))if(sha(await readFile(entry.path))!==entry.sha256)throw Error('Input changed during export '+entry.path);
 for(const[path,hash]of Object.entries(sourceFiles))if(sha(await readFile(path))!==hash)throw Error('Runtime helper changed during export '+path);
 for(const[file,hash]of Object.entries(packHashes))if(sha(await readFile(join(root,'public/city',file)))!==hash)throw Error('Pack changed after export '+file);
 const selectedCopiesOut=Object.fromEntries([...selectedCopies].sort()),boundaryCopies=Object.fromEntries([...boundaryIds].sort().map(id=>[id,completeFixedCopies.get(id)])),contextCopies=Object.fromEntries(contextRoads.map(e=>[e.id,completeFixedCopies.get(e.id)]));
 const output={version:1,scope:'INACTIVE joint core/detailed-road solver INPUT. Exact source-normalized baseline, existing inferred XY and offline resampling only. No solved elevations, fixed zero targets, bridge/grounded construction or release approval. Every incomplete source classification remains explicit.',sourceCoreSHA256:inputs.rawCore.sha256,sourceModelSHA256:inputs.model.sha256,sourceConditionedInputSHA256:inputs.model.sha256,sourceModelFile:args.model,sourceRoadGeometryGeneration:source.generationID,sourceDataSHA256:inputs.sourceGeometry.sha256,sourcePackSHA256:Object.fromEntries(Object.entries(packHashes).map(([file,hash])=>['public/city/'+file,hash])),inputs,helperSources:sourceFiles,selectionModelDiffersFromTarget:selection.inputs.modelSHA256!==inputs.model.sha256,requiresFreshFinalSelectionInventory:true,endpointHeightDiagnosticsOnly:true,requestedRoadIDs:[...selected].sort(),nodeSources:existing.nodeSources||{},incidentSourceOffsets:existing.incidentSourceOffsets||[],summary:{scannedPacks:core.packs.length,allDetailedOwners:meta.size,selectedRoads:tileRoads.length,existingPreparedPreserved:transports.filter(p=>transportById.has(p.id)).length,ownerCopies:[...selectedCopies.values()].flat().filter(c=>!c.context).length,contextCopies:[...selectedCopies.values()].flat().filter(c=>c.context).length,fixedContextRoads:contextRoads.length,incidentBoundaryRoads:boundaryRoads.length,selectedNodes:selectedNodes.size,coreAnchorNodes:nodeRecords.filter(n=>n.coreArms.length).length,components:components.length,unverifiedAllArmSourceNodes:nodeRecords.filter(n=>!n.sourceConnectionVerifiedForEveryArm).length},tileRoads,transports,footprints,preHeightWidths,contextRoads,contextFootprints,contextCopies,boundaryRoads,boundaryCopies,coreAnchorNodes:nodeRecords,components,shortestAnchorLinks,sourceEvidence:Object.fromEntries(sourceRows),copies:selectedCopiesOut,selectionConflictRows:result.rows.filter(r=>!r.graphAnchorCompatible)};
 if(coreCoverage)output.physicalContextCoverage={sourceCoverageSHA256:inputs.physicalCoreCoverage.sha256,sourceFootprintsSHA256:inputs.physicalCoreFootprints.sha256,affectedCoreRoads:Object.keys(coreCoverage.roads).length,affectedCoreQuads:coreCoverageQuads.length,requiredForeignWitnessRoadIDs:coreCoverage.requiredForeignWitnessRoadIDs,scope:'Conservative affected-core and selected-detailed-road coverage; additional contexts remain immutable, not variable owners'};
 await writeFile(args.output,JSON.stringify(output)+'\n',{flag:'wx'});console.log(stable({output:args.output,sha256:sha(await readFile(args.output)),...output.summary,...(output.physicalContextCoverage?{physicalContextCoverage:output.physicalContextCoverage}:{})}));
}finally{await rm(temporary,{recursive:true,force:true});}

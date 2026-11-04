import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),options={stage:'world'};
for(let i=2;i<process.argv.length;i++){
  const name=process.argv[i];
  if(name==='--help'){console.log('node scripts/export-road-world-model.mjs [--input-model PRE [--input-source-geometry DATA] | --rehydrate-corrections JSON | --source-geometry DATA] [--stage grades|world] --output FILE [--footprints FILE] [--provenance FILE] [--scenery-source ORIGINAL_WORLD] [--research-underpass-evidence PROPOSAL --research-parent-world MODEL (world/input-model only)]');process.exit(0);}
  if(!['--input-model','--input-source-geometry','--rehydrate-corrections','--source-geometry','--source-view-output','--stage','--output','--footprints','--provenance','--scenery-source','--research-underpass-evidence','--research-parent-world'].includes(name)||!process.argv[i+1])throw Error(`Unknown/incomplete option: ${name}`);
  options[name.slice(2)]=process.argv[++i];
}
if(!options.output||!['grades','world'].includes(options.stage)||options['input-model']&&options['rehydrate-corrections'])throw Error('Provide --output, a valid --stage and at most one source input.');
if(options['source-geometry']&&(options['input-model']||options['rehydrate-corrections']))throw Error('Source normalization cannot be mixed with an older pre-stage/model overlay. Export a corrected generic input first.');
if(options['input-source-geometry']&&(!options['input-model']||options['source-geometry']||options['rehydrate-corrections']))throw Error('Explicit input source geometry requires --input-model and cannot be mixed with generic source normalization or rehydration.');
if(options['source-view-output']&&!options['source-geometry'])throw Error('A corrected raw-source view requires explicit --source-geometry DATA.');
const researchOnly=!!(options['research-underpass-evidence']||options['research-parent-world']);
if(researchOnly&&(!options['research-underpass-evidence']||!options['research-parent-world']||options.stage!=='world'||!options['input-model']))throw Error('Research underpass evidence and its parent World require each other, --stage world and an explicit --input-model PRE.');
for(const key of ['input-model','input-source-geometry','rehydrate-corrections','source-geometry','source-view-output','output','footprints','provenance','scenery-source','research-underpass-evidence','research-parent-world'])if(options[key])options[key]=resolve(options[key]);
const preserveEvidence=researchOnly||!!options['input-source-geometry'];
if(preserveEvidence)for(const path of [options.output,options.footprints,options.provenance||options.output+'.provenance.json'].filter(Boolean)){
  try{await readFile(path);throw Error('Preserve research evidence; choose a new output: '+path);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const temp=await mkdtemp(join(tmpdir(),'road-world-export-')),hash=b=>createHash('sha256').update(b).digest('hex');
try{
  const moduleFile=join(temp,'export.mjs');
  const entry=`
    import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{dirname,resolve}from'node:path';import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';
    import{prepareRoadGrades,roadGradeReport}from'./src/world/road-grades';
    import{prepareRoadUnderpasses}from'./src/world/road-underpasses';import{excludeStadiumRoads,stadiumExclusions}from'./src/world/stadium-roads';
    import{planConstruction,applyConstructionRoads}from'./src/world/construction';import{prepareRailwayTransport}from'./src/world/railway-geometry';import{RAILWAY_UNDERPASS_EVIDENCE}from'./src/world/railway-evidence';
    import{retainRaisedRoadExclusions,roadClearanceWidth,roadPavementWidth}from'./src/world/road-pavement';import{roadRibbon}from'./src/world/bridge-clearance';import{auxiliaryLane}from'./src/world/expressway';
    import{applyVerifiedRoadModel}from'./src/world/road-model-overlay';
    import{applyVerifiedSourceRoadZone}from'./src/world/road-source-geodesic';
    import{applySourceRoadStage}from'./src/world/road-source-stage';
    export function exportWorldModel(sourceFiles){
    const options=${JSON.stringify(options)},researchOnly=${researchOnly},preserveEvidence=${preserveEvidence},sha=b=>createHash('sha256').update(b).digest('hex'),heldInputs={};
    const readHeld=path=>{const bytes=readFileSync(path);heldInputs[path]=sha(bytes);return bytes;};
    const coreBytes=readHeld(${JSON.stringify(resolve(root,'public/city/core.pack.wasm'))}),core=JSON.parse(gunzipSync(coreBytes));
    let input,inputReference=null,sourceGeometryReference=null;
    if(!options['source-geometry']&&!options['input-source-geometry']){
      Object.assign(core,applySourceRoadStage(core));
      if(core.sourceRoadGeometryGeneration){const path=${JSON.stringify(resolve(root,'src/world/road-source-geodesic-data.json'))},bytes=readHeld(path);sourceGeometryReference={path,sha256:sha(bytes),generationID:core.sourceRoadGeometryGeneration,publicStartupStage:true};}
    }
    if(options['source-geometry']||options['input-source-geometry']){
      const sourcePath=options['source-geometry']||options['input-source-geometry'],bytes=readHeld(sourcePath),data=JSON.parse(bytes);if(data.sourceCorePackSHA256!==sha(coreBytes))throw Error('Source geometry does not bind this raw core pack.');
      if(options['input-source-geometry']){
        const inputBytes=readHeld(options['input-model']);input=JSON.parse(inputBytes);inputReference={path:options['input-model'],sha256:sha(inputBytes)};
        if(input.sourceGeometryReference?.sha256!==sha(bytes)||input.sourceGeometryReference?.generationID!==data.generationID||input.sourceRoadGeometryGeneration!==data.generationID)throw Error('Explicit pre-stage source geometry binding is stale or has a different generation.');
      }
      const normalized=applyVerifiedSourceRoadZone(core,data);if(normalized.report.mismatched.length)throw Error('Source geometry mismatch: '+normalized.report.mismatched.join(','));
      const expectedCore=data.roads.filter(p=>p.copies.some(c=>c.kind==='core')).map(p=>p.id).sort();if(JSON.stringify([...normalized.report.applied,...normalized.report.alreadyApplied].sort())!==JSON.stringify(expectedCore))throw Error('Source geometry core inventory mismatch.');
      Object.assign(core,normalized.value);core.sourceRoadGeometryGeneration=data.generationID;sourceGeometryReference={path:sourcePath,sha256:sha(bytes),generationID:data.generationID,report:normalized.report};
      if(options['source-view-output']){
        const coreIds=new Set(core.roads.map(e=>e.id)),extraIds=new Set(data.roads.filter(p=>!coreIds.has(p.id)).map(p=>p.id)),owners=new Map();
        for(const [pack,expected]of Object.entries(data.sourcePackSHA256)){
          const raw=readFileSync(${JSON.stringify(resolve(root,'public/city'))}+'/'+pack);if(sha(raw)!==expected)throw Error('Raw source-view pack binding mismatch: '+pack);
          for(const zone of Object.values(JSON.parse(gunzipSync(raw)).tiles)){
            const result=applyVerifiedSourceRoadZone(zone,data);if(result.report.mismatched.length)throw Error('Source-view tile mismatch');
            for(const e of result.value.roads)if(!e.ctx&&extraIds.has(e.id))owners.set(e.id,e);
          }
        }
        if(owners.size!==extraIds.size)throw Error('Source-view owner inventory mismatch');
        const view={sourceRoadGeometryGeneration:data.generationID,sourceDataSHA256:sha(bytes),sourceCorePackSHA256:sha(coreBytes),origin:core.origin,metro:core.metro,nodes:core.nodes,roads:[...core.roads,...owners.values()],
          sourceFractions:Object.fromEntries(data.roads.map(p=>[p.id,{sourceSegmentID:p.sourceSegmentID,sourceFractions:p.sourceFractions,correctedArc:p.correctedArc,legacyArc:p.sourceArc}])),
          scope:'Corrected raw-source geometry only, before generic grades or inferred model. Unchanged geographic businesses/stops/rail are not copied or moved.'};
        const raw=JSON.stringify(view);writeFileSync(options['source-view-output'],raw,{flag:'wx'});sourceGeometryReference.sourceView={path:options['source-view-output'],sha256:sha(raw)};
      }
    }
    if(options['input-model']){if(!input){const bytes=readHeld(options['input-model']);input=JSON.parse(bytes);inputReference={path:options['input-model'],sha256:sha(bytes)};}
      if(input.sourceRoadGeometryGeneration&&!core.sourceRoadGeometryGeneration){const sourceBytes=readHeld(${JSON.stringify(resolve(root,'src/world/road-source-geodesic-data.json'))}),data=JSON.parse(sourceBytes);
        if(input.sourceRoadGeometryGeneration!==data.generationID||input.sourceGeometryReference?.sha256!==sha(sourceBytes)||data.sourceCorePackSHA256!==sha(coreBytes))throw Error('Pre-stage corrected-source binding is stale.');
        const normalized=applyVerifiedSourceRoadZone(core,data);if(normalized.report.mismatched.length)throw Error('Pre-stage raw-source normalization mismatch');Object.assign(core,normalized.value);core.sourceRoadGeometryGeneration=data.generationID;}
      if(input.sourceRoadGeometryGeneration!==core.sourceRoadGeometryGeneration)throw Error('Explicit pre-stage and current source frame differ.');
    }
    else{
      // Generic preparation never reads its own generated corrections. This is
      // also the independent expected input for an atomic geometry install.
      core.roads=prepareRoadGrades(core.roads,true,false);input={roads:core.roads,report:roadGradeReport(core.roads),...(sourceGeometryReference?{sourceGeometryReference,sourceRoadGeometryGeneration:core.sourceRoadGeometryGeneration}:{} )};
      if(options['rehydrate-corrections']){
        const bytes=readFileSync(options['rehydrate-corrections']),data=JSON.parse(bytes);if(!data.geometry||data.sourceCoreSHA256!==sha(coreBytes))throw Error('Unbound geometry correction input');
        const report=applyVerifiedRoadModel(core,data.geometry,[]);if(!report.active||report.mismatched.length)throw Error('Committed geometry does not bind generic source');
        const byId=new Map(data.geometry.roads.map(p=>[p.id,p]));
        const sourceXY=p=>{const points=p.expected.pts,cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));let i=1;
          return p.sourceArc.map(s=>{while(i<cumulative.length-1&&cumulative[i]<s)i++;const a=points[i-1],b=points[i],u=(s-cumulative[i-1])/(cumulative[i]-cumulative[i-1]||1);return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];});};
        input={...input,...data.geometry.producerMetadata,roads:core.roads.map(e=>{const p=byId.get(e.id);return p?{...e,sourceArc:p.sourceArc,sourceXY:sourceXY(p)}:e;}),endpointDisplacements:data.geometry.nodes,rehydratedModelReport:report};
        inputReference={path:options['rehydrate-corrections'],sha256:sha(bytes)};
      }
    }
    if(!Array.isArray(input.roads))throw Error('Input has no prepared road array');
    if(options['scenery-source']){
      const bytes=readHeld(options['scenery-source']),old=JSON.parse(bytes),byId=new Map(old.roads.map(e=>[e.id,e]));
      const ids=new Set([...(input.movedRoads||[]),...(input.loweringOnlyRestoration?.unknownStreetAndIncidentRoads||[]).map(p=>p.road)]);
      input.roads=input.roads.map(e=>{if(!ids.has(e.id))return e;const source=byId.get(e.id);if(!source)throw Error('Missing original scenery source '+e.id);const extra=auxiliaryLane(source,old.roads);return{...e,scenerySource:{pts:source.pts,elev:source.elev??null,width:Math.max(roadClearanceWidth(source),roadPavementWidth(source,0))+Math.max(0,...extra)*2}};});
      input.scenerySourceReference={path:options['scenery-source'],sha256:sha(bytes),roads:[...ids]};
    }
    let payload=input,research=null,underpassEvidence=RAILWAY_UNDERPASS_EVIDENCE,parentWorld;
    if(researchOnly){
      const parentBytes=readHeld(options['research-parent-world']),proposalBytes=readHeld(options['research-underpass-evidence']),parent=JSON.parse(parentBytes),proposal=JSON.parse(proposalBytes);parentWorld=parent;
      if(proposal.version!==1||proposal.releaseApproved!==false||proposal.sourceModelSHA256!==sha(parentBytes))throw Error('Research proposal does not bind the exact unapproved parent World.');
      if(parent.preconditioningReference?.sha256!==inputReference.sha256)throw Error('Research parent World does not bind the explicit original preconditioning input.');
      if(!input.sourceRoadGeometryGeneration||parent.sourceRoadGeometryGeneration!==input.sourceRoadGeometryGeneration||parent.sourceGeometryReference?.sha256!==input.sourceGeometryReference?.sha256)throw Error('Research parent and preconditioning source geometry differ.');
      const roadIDs=new Set(parent.roads?.map(e=>e.id)),railIDs=new Set(parent.profiles?.map(e=>e.id));
      if(!Array.isArray(proposal.proposedEntries)||!proposal.proposedEntries.length||proposal.proposedEntries.some(e=>!e.name||!Array.isArray(e.roads)||!e.roads.length||e.roads.some(id=>!roadIDs.has(id))||!Array.isArray(e.rails)||!e.rails.length||e.rails.some(id=>!railIDs.has(id))||!Array.isArray(e.anchor)||e.anchor.length!==2||!e.anchor.every(Number.isFinite)||!Number.isFinite(e.radius)||e.radius<=0))throw Error('Research proposal has an invalid exact road/rail/location inventory.');
      underpassEvidence=[...RAILWAY_UNDERPASS_EVIDENCE,...proposal.proposedEntries];
      research={parentWorld:{path:options['research-parent-world'],sha256:sha(parentBytes)},proposal:{path:options['research-underpass-evidence'],sha256:sha(proposalBytes)},preconditioning:inputReference,sourceRoadGeometryGeneration:input.sourceRoadGeometryGeneration,sourceDataSHA256:input.sourceGeometryReference.sha256,proposedEntryCount:proposal.proposedEntries.length,proposalSourceReferenceSHA256:proposal.sourceReferenceSHA256??null,proposalSourceCrossingAuditSHA256:proposal.sourceCrossingAuditSHA256??null,scope:'Explicit offline research preparation from the original preconditioning input; no runtime evidence installation, fitted-world acceptance or release approval.'};
    }
    if(options.stage==='world'){
      const under=prepareRoadUnderpasses(input.roads);let roads=excludeStadiumRoads(under.roads,stadiumExclusions(core.origin));const construction=planConstruction(roads,core.origin);roads=applyConstructionRoads(roads,construction);
      const transport=prepareRailwayTransport(roads,{underpasses:underpassEvidence});roads=retainRaisedRoadExclusions(transport.roads);
      if(researchOnly&&JSON.stringify(transport.railway.profiles)!==JSON.stringify(parentWorld.profiles))throw Error('Research preparation changed canonical parent railway geometry.');
      const before=new Map(input.roads.map(e=>[e.id,e]));const conditioningChanges=roads.filter(e=>JSON.stringify([e.pts,e.elev])!==JSON.stringify([before.get(e.id)?.pts,before.get(e.id)?.elev])).map(e=>({id:e.id,beforePoints:before.get(e.id)?.pts.length,afterPoints:e.pts.length,xyChanged:JSON.stringify(e.pts)!==JSON.stringify(before.get(e.id)?.pts),heightChanged:JSON.stringify(e.elev)!==JSON.stringify(before.get(e.id)?.elev)}));
      payload={...input,roads,profiles:transport.railway.profiles,report:transport.report,gradeReport:input.report,underpassChanges:under.changes.map(e=>e.id),construction,preconditioningReference:inputReference,conditioningChanges,canonicalRailUnchanged:input.profiles?JSON.stringify(input.profiles)===JSON.stringify(transport.railway.profiles):null};
    }
    if(preserveEvidence)for(const[path,expected]of Object.entries({...heldInputs,...sourceFiles}))if(sha(readFileSync(resolve(${JSON.stringify(root)},path)))!==expected)throw Error('Research input/source changed during export: '+path);
    if(researchOnly){research={...research,inputs:heldInputs,sourceFiles};payload={...payload,researchOnly:true,releaseApproved:false,researchUnderpassEvidence:research};}
    mkdirSync(dirname(options.output),{recursive:true});const bytes=JSON.stringify(payload);writeFileSync(options.output,bytes,preserveEvidence?{flag:'wx'}:undefined);
    if(options.footprints){mkdirSync(dirname(options.footprints),{recursive:true});writeFileSync(options.footprints,JSON.stringify({sourceModelSHA256:sha(bytes),...(researchOnly?{researchOnly:true,releaseApproved:false}:{}),roads:payload.roads.map(e=>{const{L,R}=roadRibbon(e,payload.roads);return{id:e.id,L,R};})}),preserveEvidence?{flag:'wx'}:undefined);}
    console.log(JSON.stringify({output:options.output,roads:payload.roads.length,modelSHA256:sha(bytes),canonicalRailUnchanged:payload.canonicalRailUnchanged??null}));
    return research;
    }
  `;
  const built=await build({...(options['input-source-geometry']?{absWorkingDir:root}:{}),stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:moduleFile,bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});
  const sources=Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(p=>p.startsWith('src/')).map(async p=>[p,hash(await readFile(resolve(root,p)))])));
  if(preserveEvidence)sources[fileURLToPath(import.meta.url)]=hash(await readFile(fileURLToPath(import.meta.url)));
  const research=(await import(pathToFileURL(moduleFile))).exportWorldModel(sources);
  const provenance={stage:options.stage,options,sourceCoreSHA256:hash(await readFile(resolve(root,'public/city/core.pack.wasm'))),sourceFiles:sources,outputSHA256:hash(await readFile(options.output)),footprintSHA256:options.footprints?hash(await readFile(options.footprints)):null,
    ...(options['input-source-geometry']?{offlineInputSourceGeometry:{path:options['input-source-geometry'],sha256:hash(await readFile(options['input-source-geometry'])),generationID:JSON.parse(await readFile(options['input-source-geometry'],'utf8')).generationID,rawCoreBindingVerified:true,runtimeSourceActivated:false}}:{}),
    ...(researchOnly?{researchOnly:true,releaseApproved:false,researchUnderpassEvidence:research}:{}),scope:'Ordinary road conditioning and actual helper L/R export. Generic mode excludes generated profiles; explicit pre-stage mode is a prototype input, not an actual World acceptance. Use the independent actual World/worker emitter for final parity.'};
  const output=options.provenance||options.output+'.provenance.json';await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(provenance,null,2)+'\n',preserveEvidence?{flag:'wx'}:undefined);
}finally{await rm(temp,{recursive:true,force:true});}

/** Run researched additions through the real railway preparation in isolation.
 * This never installs runtime evidence or makes the full road model approved. */
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const args={};for(let i=2;i<process.argv.length;i+=2){if(!['--model','--proposal','--output'].includes(process.argv[i])||!process.argv[i+1])throw Error('Use --model FILE --proposal FILE --output FILE');args[process.argv[i].slice(2)]=resolve(process.argv[i+1]);}
if(!args.model||!args.proposal||!args.output)throw Error('Missing explicit research inputs');
const sha=b=>createHash('sha256').update(b).digest('hex'),held={model:await readFile(args.model),proposal:await readFile(args.proposal)};
const generatorBytes=await readFile(new URL(import.meta.url));
const model=JSON.parse(held.model),proposal=JSON.parse(held.proposal);
if(proposal.releaseApproved!==false||proposal.sourceModelSHA256!==sha(held.model))throw Error('Research/source binding mismatch');
const dir=await mkdtemp(join(tmpdir(),'roadster-facility-probe-'));
try{
 const module=join(dir,'probe.mjs');
 const built=await build({stdin:{contents:`export {prepareRailwayClearance} from './src/world/railway-clearance';export {RAILWAY_UNDERPASS_EVIDENCE} from './src/world/railway-evidence';`,resolveDir:process.cwd(),loader:'ts'},outfile:module,bundle:true,platform:'node',format:'esm',logLevel:'error',metafile:true});
 const helpers=Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(p=>p.startsWith('src/')).map(async p=>[p,await readFile(p)])));
 const railwayBefore=JSON.stringify(model.profiles),bundleSHA256=sha(await readFile(module));
 const{prepareRailwayClearance,RAILWAY_UNDERPASS_EVIDENCE}=await import(pathToFileURL(module));
 const start=performance.now();
 const baseline=prepareRailwayClearance(model.roads,model.profiles,{underpasses:RAILWAY_UNDERPASS_EVIDENCE});
 const result=prepareRailwayClearance(model.roads,model.profiles,{underpasses:[...RAILWAY_UNDERPASS_EVIDENCE,...proposal.proposedEntries]});
 if(result.profiles!==model.profiles||baseline.profiles!==model.profiles)throw Error('An added facility changed canonical railway geometry');
 if(JSON.stringify(model.profiles)!==railwayBefore)throw Error('Canonical railway geometry was mutated in place');
 const grade=road=>{const yy=road.elev||road.pts.map(()=>0);return Math.max(0,...road.pts.slice(1).map((p,j)=>{const length=Math.hypot(p[0]-road.pts[j][0],p[1]-road.pts[j][1]);return length>.001?Math.abs(yy[j+1]-yy[j])/length:0;}));};
 const changes=[],baselineChanges=[],proposalChanges=[],gradeRegressions=[];let maximumGrade=0,nonfinite=0;
 for(let i=0;i<model.roads.length;i++){
  const before=model.roads[i],road=result.roads[i];
  if(road.id!==before.id)throw Error('Road inventory changed');
  const yy=road.elev||road.pts.map(()=>0);
  if(yy.length!==road.pts.length)throw Error('Road/control inventory differs');
  nonfinite+=yy.filter(y=>!Number.isFinite(y)).length;
  for(let j=1;j<road.pts.length;j++){const length=Math.hypot(road.pts[j][0]-road.pts[j-1][0],road.pts[j][1]-road.pts[j-1][1]);if(length>.001)maximumGrade=Math.max(maximumGrade,Math.abs(yy[j]-yy[j-1])/length);}
  if(JSON.stringify([road.pts,road.elev])!==JSON.stringify([before.pts,before.elev]))changes.push({id:road.id,input:before,proposed:road});
  if(JSON.stringify([baseline.roads[i].pts,baseline.roads[i].elev])!==JSON.stringify([before.pts,before.elev]))baselineChanges.push({id:road.id,input:before,baseline:baseline.roads[i]});
  if(JSON.stringify([road.pts,road.elev])!==JSON.stringify([baseline.roads[i].pts,baseline.roads[i].elev])){
   const previousGrade=grade(baseline.roads[i]),nextGrade=grade(road);
   proposalChanges.push({id:road.id,baseline:baseline.roads[i],proposed:road,baselineMaximumGrade:previousGrade,proposedMaximumGrade:nextGrade});
   if(nextGrade>Math.max(.065,previousGrade)+1e-6)gradeRegressions.push({id:road.id,baselineMaximumGrade:previousGrade,proposedMaximumGrade:nextGrade});
  }
 }
 const nodes=new Map();for(const road of result.roads)for(const end of ['from','to']){const node=road[end],k=end==='from'?0:road.pts.length-1;if(!node)continue;const list=nodes.get(node)||[];list.push({road:road.id,y:road.elev?.[k]||0});nodes.set(node,list);}
 const changedIDs=new Set(changes.map(r=>r.id)),nodeGaps=[];
 for(const[node,arms]of nodes){if(!arms.some(r=>changedIDs.has(r.road)))continue;const gap=Math.max(...arms.map(r=>r.y))-Math.min(...arms.map(r=>r.y));if(gap>.008)nodeGaps.push({node,arms,gap});}
 for(const[key,bytes]of Object.entries(held))if(!bytes.equals(await readFile(args[key])))throw Error('Research inputs changed');
 for(const[p,bytes]of Object.entries(helpers))if(!bytes.equals(await readFile(p)))throw Error('Preparation helper changed');
 if(!generatorBytes.equals(await readFile(new URL(import.meta.url))))throw Error('Probe implementation changed');
 const out={schema:'source-railway-facility-preparation-probe-v1',releaseApproved:false,scope:'Actual generic preparation only, not a fitted whole-world or driving acceptance. Source connector gaps remain explicit. Baseline reapplication is separate from the proposal delta.',inputs:Object.fromEntries(Object.entries(held).map(([k,b])=>[k,{path:args[k],sha256:sha(b)}])),generatorSHA256:sha(generatorBytes),helperSources:Object.fromEntries(Object.entries(helpers).map(([p,b])=>[p,sha(b)])),bundleSHA256,seconds:(performance.now()-start)/1000,canonicalRailObjectUnchanged:true,canonicalRailBytesUnchanged:true,baselineReport:baseline.report,baselineChanges,proposalInducedRoadChanges:proposalChanges,proposalGradeRegressions:gradeRegressions,report:result.report,changedRoads:changes,maximumGrade,nonfinite,changedNodeGaps:nodeGaps};
 await writeFile(args.output,JSON.stringify(out)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output:args.output,sha256:sha(await readFile(args.output)),baselineChangedRoads:baselineChanges.length,proposalInducedRoadChanges:proposalChanges.length,proposalGradeRegressions:gradeRegressions.length,changedRoads:changes.length,changedNodeGaps:nodeGaps.length,maximumGrade,unresolved:result.report.unresolved.length,releaseApproved:false}));
}finally{await rm(dir,{recursive:true,force:true});}

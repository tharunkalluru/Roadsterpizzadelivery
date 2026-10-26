// Record two exact, removal-only post-audit changes without relabeling the
// original full sweep as a rerun of later source. No application files change.
import assert from 'node:assert/strict';
import{build}from'../game/node_modules/esbuild/lib/main.js';
import{createHash}from'node:crypto';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{gunzipSync}from'node:zlib';
import{rendererBox}from'./audit-obb-utils.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),report='docs/playtests/2026-10-26-interchange-building-audit.json',affected='docs/playtests/2026-10-26-interchange-building-audit-affected.json';
const read=p=>readFileSync(join(root,p),'utf8'),hash=s=>createHash('sha256').update(s).digest('hex'),r=JSON.parse(read(report)),target=JSON.parse(read(affected));
const board='game/src/world/metro-station-visuals.ts',bridge='game/src/world/bridge-clearance.ts';
const current=Object.fromEntries(Object.keys(r.sourceCodeSha256).map(file=>[file,hash(read(file))]));
assert.deepEqual(Object.keys(current).filter(k=>current[k]!==r.sourceCodeSha256[k]).sort(),[board,bridge].sort(),'only the approved two runtime files may differ');
let oldBoard=read(board).replace('.14, 1.35, 4.6,','.14, 1.35, 7,').replace('w: 4.2, h: 1.15','w: 6.6, h: 1.15');
oldBoard=oldBoard.split('\n').filter(l=>!l.includes('// A compact railing board fits')&&!l.includes('// a 7m backing forced long station names')).join('\n');
assert.equal(hash(oldBoard),r.sourceCodeSha256[board],'only two dimensions plus explanatory comments changed');
const maskComments='    // These source classes all produce physical roadQuad surfaces in the city\n    // renderer, including tile-only pedestrian ramps that a flying car can land\n    // on. A through panel must not fence any of those finite surfaces off.\n';
const priorMask='    if (/^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;\n';
assert.equal(hash(read(bridge).replace(maskComments,priorMask)),r.sourceCodeSha256[bridge],'the only panel change expands the subtraction-mask inputs');
assert.deepEqual(target.tileFilter,['-4_-3']);assert.equal(target.residualRoadSolidIntersections,0);assert.equal(target.residualMetroSolidIntersections,0);assert.equal(target.unmatchedRoadTriangles,0);
assert.ok(target.sourceCodeUnchangedDuringAudit&&target.sourceDataUnchanged);
assert.deepEqual(target.sourceCodeSha256,current,'affected tile binds exact final runtime sources');
const temp=mkdtempSync(join(tmpdir(),'contained-geometry-audit-'));let plates=0,labels=0;
try{
 await build({stdin:{contents:"export{metroPlatformAssemblies,metroCorridors}from'./game/src/world/metro-geometry';export{drawMetroStationVisuals}from'./game/src/world/metro-station-visuals';",resolveDir:root},outfile:join(temp,'m.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const m=await import(pathToFileURL(join(temp,'m.mjs'))),core=JSON.parse(gunzipSync(readFileSync(join(root,'game/public/city/core.pack.wasm'))));
 const assemblies=m.metroPlatformAssemblies(core.metro.stations,m.metroCorridors(core.metro.lines),core.metro.deckHeight||11);
 for(const a of assemblies){const signs=[],boxes=[],st={...a.source,id:a.key,name:a.source.name||a.stationId};m.drawMetroStationVisuals(st,a.frame,a.deckHeight,{B:{st:{box:(...args)=>boxes.push(args)}},signs,wall(){},clearance:()=>true,exterior:!a.secondary});
  for(const b of boxes.filter(b=>b[3]===.14&&b[4]===1.35&&b[5]===4.6)){const[x,y,z,w,h,l,,o]=b,before=rendererBox(x,y,z,w,h,7,o),after=rendererBox(x,y,z,w,h,l,o),half=[w/2,h/2,3.5];
   for(const p of after.vertices)for(let k=0;k<3;k++){const d=[p[0]-x,p[1]-y,p[2]-z],v=d.reduce((n,q,i)=>n+q*before.axes[k][i],0);assert.ok(Math.abs(v)<=half[k]+1e-8);}plates++;}
  for(const s of signs.filter(s=>s.id.startsWith('mst_interior_'))){assert.equal(s.w,4.2);assert.equal(s.h,1.15);assert.ok(s.w<6.6);labels++;}
 }
 assert.equal(plates,assemblies.length*2);assert.equal(labels,plates);
}finally{rmSync(temp,{recursive:true,force:true});}
target.scope='Explicit bounded affected-tile recheck (-4_-3), not the complete citywide envelope. '+target.scope.slice(target.scope.indexOf('Source building'));
writeFileSync(join(root,affected),JSON.stringify(target,null,2)+'\n');
r.validatedFinalSourceCodeSha256=current;
r.postAuditContainedGeometryChange={reviewedAt:new Date().toISOString(),shrinkContainmentVerified:true,allOtherSourceHashesUnchanged:true,
 changes:[{file:board,beforeSha256:r.sourceCodeSha256[board],afterSha256:current[board],beforeDimensions:{backing:[.14,1.35,7],label:[6.6,1.15]},afterDimensions:{backing:[.14,1.35,4.6],label:[4.2,1.15]},preserved:['center','height','thickness','orientation','normals','count'],exactSourceReconstructionMatchesAuditedHash:true,actualProductionBackingsChecked:plates,actualProductionLabelsChecked:labels,shrinkContainmentVerified:true},
 {file:bridge,beforeSha256:r.sourceCodeSha256[bridge],afterSha256:current[bridge],operation:'Adds finite pedestrian/path surfaces to a subtraction mask. Existing panels may only shrink, split or disappear; no solid material is added.',exactSourceReconstructionMatchesAuditedHash:true,sourceEdge:'eef067f9-d2b_0',tile:'-4_-3',removedConflictPanels:2,removedConflictBoundsApproxMetres:{x:[-3552.3074,-3550.3296],z:[-2695.3019,-2692.2130]},afterConflictPanels:0,shrinkContainmentVerified:true}],
 affectedTileCheck:{report:affected,visitedTiles:target.visitedTiles,sourceBuildings:target.sourceBuildings,sourceBoards:target.sourceBoards,roadIntersections:0,metroIntersections:0,currentHashesVerified:true},
 interpretation:'The original full-sweep source hashes and sourceCodeUnchangedDuringAudit flag are retained. Final-source validity adds only the two explicitly verified contained changes and the bounded affected-tile check; this does not claim a second full-world rerun.'};
writeFileSync(join(root,report),JSON.stringify(r,null,2)+'\n');
console.log(`PASS exact source reconstruction, ${plates} contained backing volumes / ${labels} label shrinks, removal-only parapet mask and exact-final-source affected tile.`);

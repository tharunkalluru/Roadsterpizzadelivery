// Independent finite-road crossing counterexamples. Small synthetic geometry,
// explicitly not source-city or browser verification.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';import {build} from '../game/node_modules/esbuild/lib/main.js';
const root=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'bridge-grade-classification-'));
const road=(id,pts,height,extra={})=>({id,seg:id,name:id,cls:'primary',w:9.4,lanes:2,oneway:null,from:`${id}:from`,to:`${id}:to`,pts,elev:pts.map(()=>height),maxspeed:50,...extra});
function controls(roads,connections=[]){
 const offsets=[],links=[],heights=[];for(const e of roads){offsets.push(heights.length);for(let i=0;i<e.pts.length;i++){const k=heights.length;heights.push(e.elev?.[i]||0);links.push([]);if(i){const length=Math.hypot(e.pts[i][0]-e.pts[i-1][0],e.pts[i][1]-e.pts[i-1][1]);links[k].push([k-1,length]);links[k-1].push([k,length]);}}}
 for(const[a,b,length]of connections){links[a].push([b,length]);links[b].push([a,length]);}return{offsets,links,heights};
}
let groups=0;const test=(name,fn)=>{fn();groups++;console.log(`PASS ${name}`);};
try{
 await build({stdin:{contents:"export{repairRoadCrossingLevels}from'./game/src/world/road-crossing-levels';",resolveDir:root,loader:'ts'},outfile:join(temp,'test.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const{repairRoadCrossingLevels}=await import(pathToFileURL(join(temp,'test.mjs')));
 const run=(roads,connections=[],protectedIds=[])=>{const c=controls(roads,connections),before=c.heights.slice(),protectedVertices=c.heights.map((_,i)=>{let r=c.offsets.length-1;while(c.offsets[r]>i)r--;return protectedIds.includes(roads[r].id);});const report=repairRoadCrossingLevels(roads,c.offsets,c.links,c.heights,protectedVertices);return{...c,before,report};};
 test('a short slip-ramp graph path cannot turn a real perpendicular crossing into a pavement join',()=>{
  const roads=[road('flyover',[[-60,0],[60,0]],4.9),road('underpass',[[0,-60],[0,60]],0)];
  // The graph connects via a nearby ramp, rather than through the crossing.
  const x=run(roads,[[0,2,150]]);assert.equal(x.report.joinedPavements,0);assert.equal(x.report.separatedCrossings,1);assert.ok(x.report.minimumModelSeparation>=5.84);
 });
 test('same-name parallel flyover and frontage-road ribbons at different levels are not a shared surface',()=>{
  const roads=[road('upper',[[-60,0],[60,0]],4,{name:'Main Road'}),road('frontage',[[-60,4],[60,4]],0,{name:'Main Road'})],x=run(roads);
  assert.equal(x.report.joinedPavements,0);assert.equal(x.report.separatedCrossings,0);assert.deepEqual(x.heights,x.before);assert.ok(x.report.ambiguities.some(r=>r.reason==='parallel-corridor-order-unverified'));
 });
 test('independent coplanar elevated crossings remain explicit ambiguity without topology or source level evidence',()=>{
  const roads=[road('east-west',[[-60,0],[60,0]],6.8),road('north-south',[[0,-60],[0,60]],6.8)],x=run(roads);
  assert.equal(x.report.joinedPavements,0);assert.equal(x.report.separatedCrossings,0);assert.ok(x.report.ambiguousJoins>0);assert.deepEqual(x.heights,x.before);
 });
 test('protected survey/ORR controls stay immutable and infeasible candidates retain reasoned source-ID diagnostics',()=>{
  const roads=[road('protected-upper',[[-60,0],[60,0]],4.9,{elevationSource:'survey'}),road('lower',[[0,-60],[0,60]],0)],x=run(roads,[],['protected-upper']);
  assert.deepEqual(x.heights.slice(0,2),x.before.slice(0,2));assert.equal(x.report.separatedCrossings,0);assert.ok(x.report.ambiguousJoins>0);
  assert.ok(Array.isArray(x.report.ambiguities)&&x.report.ambiguities.some(r=>r.roads.includes('protected-upper')&&r.roads.includes('lower')&&typeof r.reason==='string'&&r.reason.length>0),'a skipped unsafe crossing is reported with both original road IDs and a reason');
 });
 test('an actual same-level shared-endpoint junction remains connected and is not artificially grade separated',()=>{
  const roads=[road('west',[[-60,0],[0,0]],6.8,{to:'junction'}),road('north',[[0,0],[0,60]],6.8,{from:'junction'})],x=run(roads,[[1,2,0]]);
  assert.ok(x.report.joinedPavements>0);assert.equal(x.report.separatedCrossings,0);assert.deepEqual(x.heights,x.before);
 });
 console.log(`${groups} bridge grade classification regression groups passed (independent synthetic finite-road fixtures).`);
}finally{await rm(temp,{recursive:true,force:true});}

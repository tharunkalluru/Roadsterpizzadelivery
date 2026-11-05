import test from 'node:test';
import assert from 'node:assert/strict';
import { FiniteIndex,auditFinite,overlap,polygonArea,type TriangleRecord,type ApronFragment } from '../../scripts/qa/road-release-finite';
const tri=(road:string,y:number,x=0,arc=0):TriangleRecord=>({road,points:[[x,y,0],[x+10,y,0],[x,y,10]],centre:[[x,0],[x+10,0]],arc:[arc,arc+10]});
const index=(...t:TriangleRecord[])=>new FiniteIndex(t);
test('finite reviewer detects exact reduced headroom and reversed order on surviving geometry',()=>{
  const old=index(tri('upper',6.8),tri('lower',0));
  for(const height of[4,-1]){const result=auditFinite(old,index(tri('upper',height),tri('lower',0)),new Set(['upper']));assert.ok(result.failures.some(f=>f.newGap===height));assert.ok(result.failures.some(f=>f.pass==='old'));assert.ok(result.failures.some(f=>f.pass==='new'));}
});
test('unchanged physical identity cannot report a clearance regression even if every road is audited',()=>{
  const old=index(tri('upper',6.8),tri('lower',0)),result=auditFinite(old,index(tri('upper',6.8),tri('lower',0)),new Set(['upper','lower']));
  assert.equal(result.failures.length,0);assert.equal(result.coverageChanges.length,0);assert.equal(result.newCoverage.length,0);assert.ok(result.oldSamples>0&&result.newSamples>0);
});
test('a source-backed finite apron fragment cannot exempt a remote part of the same pair',()=>{
  const old=index(tri('upper',6.8),tri('lower',0),tri('upper',6.8,30,30),tri('lower',0,30,30));
  const next=index(tri('upper',0),tri('lower',0),tri('upper',0,30,30),tri('lower',0,30,30));
  const fragment:ApronFragment={roads:['upper','lower'],node:'actual-node',polygon:[[-1,-1],[11,-1],[11,11],[-1,11]],proof:{sourcePath:['upper','link','lower'],evidence:'frozen-source-proof.json',sourceCoreSHA256:'1'.repeat(64)}};
  const result=auditFinite(old,next,new Set(['upper']),[fragment]);assert.ok(result.justifiedAprons.length);assert.ok(result.failures.length);assert.ok(result.failures.every(f=>f.point[0]>=30));
});
test('even an approved apron polygon cannot waive a positive gap through the car or reversed bridge',()=>{
  const fragment:ApronFragment={roads:['upper','lower'],node:'node',polygon:[[-1,-1],[11,-1],[11,11],[-1,11]],proof:{sourcePath:['upper','lower'],evidence:'proof.json',sourceCoreSHA256:'2'.repeat(64)}};
  for(const height of[.1,2,-1])assert.ok(auditFinite(index(tri('upper',6.8),tri('lower',0)),index(tri('upper',height),tri('lower',0)),new Set(['upper']),[fragment]).failures.length);
});
test('missing old finite coverage and new unmatched pavement remain explicit unresolved evidence',()=>{
  const result=auditFinite(index(tri('upper',6.8),tri('lower',0)),index(tri('upper',6.8,4),tri('lower',0,4)),new Set(['upper','lower']));
  assert.ok(result.coverageChanges.length);assert.ok(result.newCoverage.length);assert.equal(result.missingCoverageIsNotApproval,true);assert.equal(result.newCoverageNeedsClassification,true);
});
test('local canonical arc matching does not substitute a remote level of a looping road',()=>{
  const old=index(tri('upper',6.8),tri('lower',0)),next=index(tri('upper',4),tri('upper',6.8,0,100),tri('lower',0));
  const result=auditFinite(old,next,new Set(['upper']));assert.ok(result.failures.some(f=>f.newGap===4));
});
test('actual node-cap triangles participate rather than being discarded from finite overlap checks',()=>{
  const cap={...tri('upper',3),cap:true,tile:'3_-3'};
  const result=auditFinite(index(tri('upper',6.8),tri('lower',0)),index(cap,tri('lower',0)),new Set(['upper']));assert.ok(result.failures.some(f=>f.pass==='new'&&f.cap));
});
test('triangle boundary clipping preserves finite footprints without capsule endpoint extensions',()=>{
  assert.equal(polygonArea(overlap(tri('a',0),tri('b',0,11))),0);
  assert.equal(polygonArea(overlap(tri('a',0),tri('b',0))),50);
  assert.throws(()=>new FiniteIndex([{...tri('bad',0),points:[[NaN,0,0],[1,0,0],[0,0,1]]}]),/Invalid/);
});

test('strict finite review protects positive historical gaps below4.5m and allows only1mm serialization error',()=>{
  for(const[oldGap,newGap]of[[3.5,3.4],[.2,.198],[.05,-.05],[6.8,5.8488]]){
    const result=auditFinite(index(tri('upper',oldGap),tri('lower',0)),index(tri('upper',newGap),tri('lower',0)),new Set(['upper']));
    assert.equal(result.thresholds.historicalMinimum,.01);assert.equal(result.thresholds.regressionAllowance,.001);
    assert.ok(result.failures.some(f=>f.pass==='old'),`${oldGap}→${newGap}: historical direction`);
    assert.ok(result.failures.some(f=>f.pass==='new'),`${oldGap}→${newGap}: candidate direction`);
  }
  for(const[oldGap,newGap]of[[.2,.1995],[6.8,5.8493]])assert.equal(auditFinite(index(tri('upper',oldGap),tri('lower',0)),index(tri('upper',newGap),tri('lower',0)),new Set(['upper'])).failures.length,0);
});

test('sub4.5m positive history may become a proved co-elevated apron only inside its exact polygon',()=>{
  const fragment:ApronFragment={roads:['upper','lower'],node:'actual-node',polygon:[[-1,-1],[11,-1],[11,11],[-1,11]],proof:{sourcePath:['upper','lower'],evidence:'exact-apron-proof.json',sourceCoreSHA256:'1'.repeat(64)}};
  const old=index(tri('upper',.2),tri('lower',0),tri('upper',.2,30,30),tri('lower',0,30,30));
  const next=index(tri('upper',.005),tri('lower',0),tri('upper',.005,30,30),tri('lower',0,30,30));
  const result=auditFinite(old,next,new Set(['upper']),[fragment]);
  assert.ok(result.justifiedAprons.length);assert.ok(result.failures.length);
  assert.ok(result.failures.every(f=>f.point[0]>=30));
  assert.ok(auditFinite(index(tri('upper',.2),tri('lower',0)),index(tri('upper',.0105),tri('lower',0)),new Set(['upper']),[fragment]).failures.length,'A proved apron cannot hide a gap beyond the unchanged1cm cap');
});

test('verified sibling identity can follow a moved cut but cannot hide geographic gaps or a remote loop branch',()=>{
  const family='370065ed-0cbc-4525-9dcc-8f7dc38857cf',other='370065ed-0cbc-4525-9dcc-000000000000';
  const oldUpper={...tri('upper-old-piece',6.8),sourceReference:{id:family,arc:[100,110]as[number,number]}},lower=tri('lower',0);
  const nextUpper={...tri('upper-new-piece',4),sourceReference:{id:family,arc:[100,110]as[number,number]}};
  const result=auditFinite(index(oldUpper,lower),index(nextUpper,lower),new Set(['upper-old-piece','upper-new-piece']));
  assert.ok(result.failures.some(f=>f.newGap===4));assert.equal(result.coverageChanges.length,0);assert.equal(result.newCoverage.length,0);
  for(const variant of[{...nextUpper,points:tri('upper-new-piece',4,20).points},{...nextUpper,sourceReference:{id:family,arc:[300,310]as[number,number]}},{...nextUpper,sourceReference:{id:other,arc:[100,110]as[number,number]}}]){
    const missing=auditFinite(index(oldUpper,lower),index(variant,lower),new Set(['upper-old-piece','upper-new-piece']));
    assert.ok(missing.coverageChanges.length,'No actual finite geometry / wrong branch / full UUID lookalike stays unresolved');
  }
});

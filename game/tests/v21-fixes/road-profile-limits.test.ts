import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRoadProfileLimits, loadRoadProfileLimits, bindLocalGradeChangePolicies, checkRoadProfileLimits,
  expectedLocalGradeChangeControls, LOCAL_GRADE_CHANGE_POLICY_PATH, GLOBAL_GRADE_CHANGE_PER_METRE } from '../../scripts/road-profile-limits.mjs';

const fixture=JSON.parse(readFileSync('tests/fixtures/anandbagh-local-curvature-consumer.json','utf8'));
const source=()=>structuredClone(fixture);
const authority=()=>loadRoadProfileLimits(process.cwd());
function attach(a:any,x:any){
  const index=bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,x.sourceModelSHA256);
  for(const p of x.profiles)p.limits.localGradeChange=index.get(p.id).block;
  return index;
}

test('actual conditional authority matches the offline solver selection and accepts only comfort-valid profiles',async()=>{
  const a=await authority(),x=source();assert.equal(a.policy.releaseApproved,false,'conditional design status is not physical approval');
  const solver=readFileSync('scripts/solve-road-profiles.py','utf8'),start=solver.indexOf('def road_grade_change_limit('),end=solver.indexOf('\ndef ',start+1);
  const functionSource=solver.slice(start,end).trimEnd();assert.equal(createHash('sha256').update(functionSource).digest('hex'),fixture.solverLimitFunctionSHA256,'the independent fixture was emitted by this exact offline selection function');
  for(const p of x.profiles){const actual=expectedLocalGradeChangeControls(a,p.id,p.expected),emitted=x.localGradeChangePolicies.find((b:any)=>b.road===p.id);assert.deepEqual(actual.map((c:any)=>c.index),emitted.controls.map((c:any)=>c.index));assert.equal(actual.length,p.id.startsWith('28b')?39:40);}
  const index=attach(a,x);bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,x.sourceModelSHA256,{requireAttached:true});
  const reports=x.profiles.map((p:any)=>checkRoadProfileLimits(p,index.get(p.id)));
  const inherited=reports.flatMap((r:any)=>r.inheritedProtectedTriplets);assert.equal(inherited.length,1);assert.equal(inherited[0].index,52);assert.ok(Math.abs(inherited[0].curvature-.016306204845871825)<1e-13);
});

test('pinned source policy/classification reject corrupted or inflated authority',()=>{
  const bytes=readFileSync(LOCAL_GRADE_CHANGE_POLICY_PATH),p=JSON.parse(bytes.toString()),classification=readFileSync(p.sourceClassification);
  for(const mutate of [(x:any)=>x.roads[0].maximumGradeChangePerMetre=.02,(x:any)=>x.roads[0].curvatureIntervals[0][1]+=1,(x:any)=>x.sourceClassificationSHA256='0'.repeat(64)]){
    const changed=JSON.parse(bytes.toString());mutate(changed);assert.throws(()=>createRoadProfileLimits(Buffer.from(JSON.stringify(changed)),classification),/policy SHA/);
  }
  const changed=JSON.parse(classification.toString());changed.pass=false;assert.throws(()=>createRoadProfileLimits(bytes,Buffer.from(JSON.stringify(changed))),/classification SHA/);
});

test('full road/control inventory rejects missing, duplicate, unknown and outside-window exceptions',async()=>{
  const a=await authority();
  const mutations=[
    (x:any)=>x.localGradeChangePolicies.pop(),
    (x:any)=>x.localGradeChangePolicies.push(structuredClone(x.localGradeChangePolicies[0])),
    (x:any)=>x.localGradeChangePolicies[0].road='unreviewed-road',
    (x:any)=>x.profiles.push(structuredClone(x.profiles[0])),
    (x:any)=>x.localGradeChangePolicies[0].controls.pop(),
    (x:any)=>x.localGradeChangePolicies[0].controls[1]=structuredClone(x.localGradeChangePolicies[0].controls[0]),
    (x:any)=>x.localGradeChangePolicies[0].controls[0].index=16,
    (x:any)=>x.localGradeChangePolicies[0].controls[0].index=999,
    (x:any)=>x.localGradeChangePolicies[0].controls[0].modelArc[1]+=.001,
    (x:any)=>x.localGradeChangePolicies[0].controls[0].maximumGradeChangePerMetre=.014997,
    (x:any)=>x.localGradeChangePolicies[0].controls[0].maximumGradeChangePerMetre=NaN,
    (x:any)=>x.localGradeChangePolicies[0].sourcePolicySHA256='0'.repeat(64),
    (x:any)=>x.localGradeChangePolicies[0].sourceClassificationSHA256='0'.repeat(64),
    (x:any)=>x.localGradeChangePolicies[0].protectedControlIndices.pop(),
    (x:any)=>x.localGradeChangePolicies[0].existingHeightEnvelope=[-7,0],
    (x:any)=>x.localGradeChangePolicies[0].controlCount--,
    (x:any)=>x.localGradeChangePolicies[0].controls[0].unreviewed=true,
  ];
  for(const mutate of mutations){const x=source();mutate(x);assert.throws(()=>bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,x.sourceModelSHA256));}
  const x=source();assert.throws(()=>bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,'0'.repeat(64)),/model SHA/);
});

test('exact input XYZ/heights, canonical targets and existing facility envelope are mandatory',async()=>{
  const a=await authority();
  const mutations=[
    (x:any)=>x.profiles[0].expected.pts[3][0]+=.000001,
    (x:any)=>x.profiles[0].expected.elev[1]+=1e-12,
    (x:any)=>x.profiles[0].expected.elevationSource='surveyed',
    (x:any)=>x.profiles[0].expected.elevationSource='explicit',
    (x:any)=>x.profiles[0].expected.expressway={},
    (x:any)=>x.profiles[0].elev[0]+=1e-12,
    (x:any)=>x.profiles[0].elev[1]=-6.50000000001,
    (x:any)=>x.profiles[0].elev[54]=.00000000001,
    (x:any)=>x.profiles[0].elev.pop(),
    (x:any)=>x.profiles[0].elev[1]=Infinity,
  ];
  for(const mutate of mutations){const x=source();mutate(x);assert.throws(()=>bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,x.sourceModelSHA256));}
  const x=source(),index=attach(a,x);x.profiles[0].limits.localGradeChange.controls[0].maximumGradeChangePerMetre=.015;
  assert.throws(()=>bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,x.sourceModelSHA256,{requireAttached:true}),/does not match/);
  assert.ok(index.size===2);
});

test('protected old curvature is exact-only and never grants an inherited generated-control waiver',async()=>{
  const a=await authority(),x=source(),index=attach(a,x),p=x.profiles.find((p:any)=>p.id==='01ceee91-29b_0');
  assert.ok(checkRoadProfileLimits(p,index.get(p.id)).inheritedProtectedTriplets.some((r:any)=>r.index===52));
  const changed=source();for(const j of[51,52,53])changed.profiles[1].elev[j]+=.00001;
  assert.throws(()=>bindLocalGradeChangePolicies(a,changed.localGradeChangePolicies,changed.profiles,changed.sourceModelSHA256),/protected target/);
  const baseline=source();baseline.profiles[0].elev=baseline.profiles[0].expected.elev.slice();const baselineIndex=attach(a,baseline);
  assert.throws(()=>checkRoadProfileLimits(baseline.profiles[0],baselineIndex.get(baseline.profiles[0].id)),/grade jump/);
  assert.throws(()=>checkRoadProfileLimits(x.profiles[0]),/grade jump/,'a baseline without attached validated policy gets no local relaxation');
  assert.throws(()=>bindLocalGradeChangePolicies(a,[],x.profiles,x.sourceModelSHA256),/inventory/);
});

test('all other generated triplets retain global curvature and true grade stays unconditional',async()=>{
  const a=await authority(),x=source(),p=x.profiles[0],index=attach(a,x),limits=index.get(p.id);
  let j=-1;
  for(let k=2;k<p.elev.length-2;k++)if(limits.indexedLimits[k]===GLOBAL_GRADE_CHANGE_PER_METRE&&[k-1,k,k+1].every(i=>p.elev[i]===0&&!limits.protectedControlIndices.has(i))){j=k;break;}
  assert.ok(j>0);const before=Math.hypot(p.expected.pts[j][0]-p.expected.pts[j-1][0],p.expected.pts[j][1]-p.expected.pts[j-1][1]),after=Math.hypot(p.expected.pts[j+1][0]-p.expected.pts[j][0],p.expected.pts[j+1][1]-p.expected.pts[j][1]);
  p.elev[j]=-.01*((before+after)/2)/(1/before+1/after);
  const changedIndex=attach(a,x);assert.throws(()=>checkRoadProfileLimits(p,changedIndex.get(p.id)),/grade jump/,'a permitted road is not a whole-road curvature exception');
  const steep=source();steep.profiles[0].elev[4]=steep.profiles[0].elev[3]+.01;const steepIndex=attach(a,steep);
  assert.throws(()=>checkRoadProfileLimits(steep.profiles[0],steepIndex.get(steep.profiles[0].id)),/validated grade/);
  const flat={id:'ordinary',expected:{pts:[[0,0],[10,0],[20,0]]},elev:[0,0,0],limits:{maxGrade:.1,gradeChangePerMetre:.00625}};
  bindLocalGradeChangePolicies(a,[],[flat],'ordinary-input');assert.equal(checkRoadProfileLimits(flat).maximumCurvature,0);
  assert.throws(()=>checkRoadProfileLimits({...flat,limits:{...flat.limits,gradeChangePerMetre:.015}}),/global curvature/);
});

test('scoped model rebinding is explicit and cannot be enabled by an unverified summary',async()=>{
  const a=await authority(),x=source();
  a.rebase={sourceModelSHA256:'0'.repeat(64),releaseApproved:false,heightAuthorityGranted:false};
  assert.throws(()=>bindLocalGradeChangePolicies(a,x.localGradeChangePolicies,x.profiles,'0'.repeat(64)),/model SHA/);
  await assert.rejects(()=>loadRoadProfileLimits(process.cwd(),{rebaseProof:'unused',expectedModelSHA256:'not-a-digest'}),/candidate model SHA/);
  await assert.rejects(()=>loadRoadProfileLimits(process.cwd(),{rebaseProof:'unused'}),/candidate model SHA/);
});

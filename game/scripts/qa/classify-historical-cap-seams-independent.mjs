import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=process.argv[2],inputs={},sha=b=>createHash('sha256').update(b).digest('hex');
if(!output)throw Error('Provide a new output path');
async function held(path,expected){const b=await readFile(path),hash=sha(b);if(expected&&hash!==expected)throw Error('Input SHA mismatch '+path);inputs[path]=hash;return JSON.parse(b);}
const replayPath=resolve(root,'docs/qa/evidence/reported-roads/historical-cap-datum-independent-9413-20261103-v2.json');
const replay=await held(replayPath,'582052cbea5477c9bf2e889cd74b6f38614997b30753d2cc9609313ee7915d9e');
const historical=await held('/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json','d746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90');
const joint=await held('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/jointInputBaseline21-e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f.json','e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f');
const extraPath=resolve(root,'docs/qa/evidence/reported-roads/historical-cap-connector-source-independent-9413-20261103.json');
const extra=await held(extraPath,'fc06053ac7f0cbf6a5b587950046658691ceb1dda6358f026305a43157076663');
const source=await held(joint.inputs.sourceGeometry.path,joint.inputs.sourceGeometry.sha256),origin=source.origin;
const kx=Math.cos(origin.lat*Math.PI/180)*origin.NR*Math.PI/180,kz=origin.MR*Math.PI/180;
const oldByID=new Map(historical.roads.map(e=>[e.id,e])),sources=new Map(Object.entries(joint.sourceEvidence).map(([id,proof])=>[id,proof]));
for(const row of extra.rows)sources.set(row.id.slice(0,12),{row,path:extraPath,sha256:inputs[extraPath],release:extra.release});
const revision='a679b72bacefb751057f0282a86571e8e6ef006d',sourceProof={};
for(const path of['src/world/city.ts','src/game/physics.ts','src/world/road-surface.ts']){const bytes=execFileSync('git',['show',revision+':'+path],{cwd:root,maxBuffer:64*1024*1024});sourceProof[path]={revision,sha256:sha(bytes)};assert.equal(sha(bytes),replay.sourceFiles[path]);}
const outputGroups=[];
const key=p=>p.map(p=>p.map(Math.fround).join(',')).sort().join('|');
for(const id of['55d8e614-341_0','68824dbc-10e_0','9702ce1b-680_0']){
  const witnesses=replay.results.filter(r=>r.road===id&&r.classification==='genuine-structural-ambiguity'),own=oldByID.get(id),capRows=witnesses.flatMap(w=>w.sourceBoundRows.filter(r=>r.triangulatedPatch)),center=capRows[0].structuralQuad[0];
  const ends=[[own.from,own.pts[0]],[own.to,own.pts.at(-1)]].sort((a,b)=>Math.hypot(a[1][0]-center[0],a[1][1]-center[2])-Math.hypot(b[1][0]-center[0],b[1][1]-center[2])),node=ends[0][0];
  assert.ok(Math.hypot(ends[0][1][0]-center[0],ends[0][1][1]-center[2])<1e-8);
  const incidents=historical.roads.filter(e=>e.from===node||e.to===node),proofs=[];
  for(const e of incidents){
    const proof=sources.get(e.id.split('_')[0]);assert.ok(proof,'Missing exact retained source '+e.id);await held(proof.path,proof.sha256);
    const row=proof.row,connectors=row.connectors.filter(c=>c.connector_id.slice(0,12)===node);assert.equal(connectors.length,1);
    const c=connectors[0];assert.ok(c.at===0||c.at===1,'This local proof does not interpolate an unknown source cut');
    const bytes=Buffer.from(row.geometryWKB,'hex'),little=bytes[0]===1,read32=n=>little?bytes.readUInt32LE(n):bytes.readUInt32BE(n),read64=n=>little?bytes.readDoubleLE(n):bytes.readDoubleBE(n);assert.equal(read32(1),2);
    const count=read32(5),n=c.at===0?0:count-1,lon=read64(9+16*n),lat=read64(17+16*n),officialXZ=[(lon-origin.lon)*kx,-(lat-origin.lat)*kz],end=e.from===node?0:e.pts.length-1,point=e.pts[end],y=e.elev?.[end]??0;
    const active=rules=>(rules||[]).filter(r=>!r.between||c.at>=r.between[0]-1e-12&&c.at<=r.between[1]+1e-12);
    const level=active(row.level_rules),flags=active(row.road_flags);
    assert.ok(level.every(r=>r.value===0)&&flags.every(r=>!(r.values||[]).some(v=>/bridge|tunnel/.test(v))),'Independent layer is active at this exact connector');
    assert.ok(Math.hypot(officialXZ[0]-point[0],officialXZ[1]-point[1])<.075,'Official/source endpoint geography differs');
    proofs.push({roadID:e.id,sourceSegmentID:row.id,connectorID:c.connector_id,connectorAt:c.at,oldPoint:point,oldEndpointY:y,officialLonLat:[lon,lat],officialXZ,sourceProjectionResidualM:Math.hypot(officialXZ[0]-point[0],officialXZ[1]-point[1]),activeLevelRules:level,activeRoadFlags:flags,allLevelRules:row.level_rules,allRoadFlags:row.road_flags,sourceArtifact:{path:proof.path,sha256:proof.sha256}});
  }
  assert.equal(new Set(proofs.map(p=>p.connectorID)).size,1);
  const ys=proofs.map(p=>p.oldEndpointY),capMean=ys.reduce((a,b)=>a+b,0)/ys.length;assert.ok(Math.max(...ys)-Math.min(...ys)<=.25);
  for(const r of capRows)assert.ok(Math.abs(r.structuralSupport-capMean)<1e-12);
  const bindings=new Map();
  for(const w of witnesses)for(const r of w.sourceBoundRows){const token=r.road+'/'+r.triangleKey;const historicalRecords=historical.triangles.filter(t=>t.road===r.road&&key(t.points)===r.triangleKey);assert.ok(historicalRecords.length);bindings.set(token,{road:r.road,segment:r.segment,tile:r.tile,triangleKey:r.triangleKey,literalPoints:r.points,paintLift:r.paintLift,structuralQuad:r.structuralQuad,triangulatedPatch:r.triangulatedPatch,legacySourceBranches:historicalRecords.map(t=>({arc:t.arc,centre:t.centre}))});}
  const physics=replay.physicsQueries.filter(q=>q.road===id&&witnesses.some(w=>JSON.stringify(w.point)===JSON.stringify(q.point)));
  assert.ok(physics.some(q=>q.triangulatedPatch&&Math.abs(q.actualSupportY-capMean)<1e-12));
  assert.ok(physics.some(q=>!q.triangulatedPatch&&q.actualSupportY===0));
  outputGroups.push({node,fullConnectorID:proofs[0].connectorID,representativeRoadID:id,classification:'source-proved-local-at-grade-own-cap/strip-support-seam',witnesses:witnesses.length,incidentSourceProofs:proofs,oldEndpointYRange:[Math.min(...ys),Math.max(...ys)],actualOldCapStructuralY:capMean,actualOldOwnStripY:0,capConstruction:'stricta679 averages this same-connector group structural endpoints; maximum class paintLift is separate',literalSurfaceBindings:[...bindings.values()],oldPhysicsSupportQueries:physics,
    candidatePolicyAdvisory:'Only an explicitly authorized exact finite cap+own-strip component may form a structural reference envelope. Never average/select one old sheet, infer independent-layer headroom from this local seam, expand to whole road/pair, or waive final body/support geometry.',
    independentClearanceStillRequired:true,repairApplied:false});
}
for(const[path,expected]of Object.entries(inputs))assert.equal(sha(await readFile(path)),expected,'Input changed during classification');
const report={version:1,scope:'Source and actual old physics classification of43 genuine support ambiguities; no solver, profile, model, node or activation changes',releaseApproved:false,pass:true,groups:outputGroups,summary:{groups:outputGroups.length,witnesses:outputGroups.reduce((n,g)=>n+g.witnesses,0),fullyBoundExactSourceConnectors:true,independentLayerAtAnyConnector:false},headroomCoverage:replay.headroomCoverage,sourceProof,beforeAfterUnchangedInputs:inputs};
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,sha256:sha(await readFile(output)),summary:report.summary}));

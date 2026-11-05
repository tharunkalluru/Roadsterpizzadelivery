import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVerifiedRoadTileProfiles,roadProfileInput,type VerifiedProfileCorrection} from '../../src/world/road-profile-corrections';
import {applyTileRoadNodeTransports,transportTileRoadNodes} from '../../src/world/road-node-transport';
import type {RoadEdge} from '../../src/world/types';
import {compareEndpointLevels,summarizeNodeLevels} from '../../scripts/road-tile-boundary-inventory.mjs';
function fixture(){
 const raw:RoadEdge={id:'minor',seg:'source-minor',name:null,cls:'residential',w:5.5,lanes:1,oneway:null,from:'join',to:'far',pts:[[0,0],[24,0]],elev:null,maxspeed:30};
 const transport=transportTileRoadNodes(raw,{join:{before:[0,0],after:[0,0],delta:[0,0]}})!;
 const prepared=applyTileRoadNodeTransports([raw],[transport]).roads[0];
 const profile:VerifiedProfileCorrection={id:raw.id,stage:'conditionedWorld',expected:roadProfileInput(prepared),elev:prepared.pts.map(p=>.5*Math.cos(Math.PI*p[0]/24)+.5)};
 return{raw,transport,prepared,profile};
}
test('offline densification precedes source-bound tile heights and owner/context keep identical surfaces',()=>{
 const{raw,transport,prepared,profile}=fixture();assert.ok(prepared.pts.length>2);assert.equal(transport.maximumDisplacement,0);
 assert.ok(applyVerifiedRoadTileProfiles([raw],[profile]).report.mismatched.length,'sparse raw geometry cannot receive a dense solved profile');
 const source=JSON.stringify(raw);
 for(const context of[false,true]){
  const e:any={...raw,...(context?{ctx:1}:{})};if(context)delete e.lanes;
  const moved=applyTileRoadNodeTransports([e],[transport]);assert.deepEqual(moved.mismatched,[]);
  const before=JSON.stringify(moved.roads),result=applyVerifiedRoadTileProfiles(moved.roads,[profile]);
  assert.deepEqual(result.report.mismatched,[]);assert.deepEqual(result.roads[0].elev,profile.elev);assert.deepEqual(result.roads[0].pts,prepared.pts);
  assert.deepEqual(result.roads[0].scenerySource,prepared.scenerySource);assert.equal(result.roads[0].w,raw.w);assert.equal(result.roads[0].lanes,context?undefined:1);
  assert.equal(JSON.stringify(moved.roads),before);assert.equal(JSON.stringify(raw),source);
  const again=applyVerifiedRoadTileProfiles(structuredClone(result.roads),[profile]);assert.deepEqual(again.report.reused,['minor']);assert.deepEqual(again.roads,result.roads);
 }
});
test('one stale side street or mixed installed stage rejects every elevation in that tile',()=>{
 const{prepared,profile}=fixture();const second={...prepared,id:'minor-b'};const other={...profile,id:'minor-b'};
 for(const kind of['stale','mixed']as const){const roads=[prepared,kind==='stale'?{...second,pts:second.pts.map((p,i)=>i===2?[p[0],p[1]+.01]as[number,number]:p)}:{...second,elev:other.elev}];const before=JSON.stringify(roads),result=applyVerifiedRoadTileProfiles(roads,[profile,other]);assert.ok(result.report.mismatched.length);assert.equal(JSON.stringify(result.roads),before);assert.deepEqual(result.report.applied,[]);}
});
test('tile height stage rejects duplicate IDs, wrong stage and nonfinite targets',()=>{
 const{prepared,profile}=fixture();
 for(const profiles of[[profile,profile],[{...profile,stage:'roadGrades' as const}],[{...profile,elev:profile.elev.map((p,i)=>i===2?NaN:p)}]]){const result=applyVerifiedRoadTileProfiles([prepared],profiles);assert.ok(result.report.mismatched.length);assert.equal(result.roads[0],prepared);}
 assert.equal(applyVerifiedRoadTileProfiles([prepared],[]).roads[0],prepared);
});
test('a matching arm cannot clear an ambiguous shared source connector',()=>{
 const core=[{id:'ground',end:'from',y:0,xz:[0,0]},{id:'bridge',end:'to',y:6.8,xz:[0,0]}];const comparison=compareEndpointLevels(0,core);
 assert.equal(comparison.matchesAnyCoreLevel,true);assert.equal(comparison.matchesEveryCoreArm,false);assert.equal(comparison.ambiguousCoreLevels,true);assert.equal(comparison.maximum,6.8);
 const summary=summarizeNodeLevels(core,[{id:'side',y:0,xz:[0,0]}]);assert.equal(summary.allIncidentArmsJoinWithin2cm,false);assert.equal(summary.requiresSurfaceClassification,true);
});
test('boundary inventory retains finite source endpoint XY disagreement even when heights agree',()=>{
 const summary=summarizeNodeLevels([{id:'core',y:1,xz:[0,0]}],[{id:'tile',y:1,xz:[.3,.4]}]);assert.equal(summary.allIncidentArmsJoinWithin2cm,true);assert.equal(summary.maximumEndpointXZDisagreement,.5);
});

test('local declared lane count does not repaint an unknown three-lane approach with the conservative NPC minimum',async()=>{
 const{roadPavementLanes}=await import('../../src/world/road-pavement');const{raw}=fixture();const e={...raw,lanes:3,joinedPavement:{sourceWidth:10.8,originalWidth:10.8,intervals:[[30,70]]as[number,number][],taper:30,release:'2026-10-21.0',usableLanes:2},sourceLaneIntervals:[{from:20,to:80,lanes:2,oneway:true,sourceURL:'https://api.openstreetmap.org/api/0.6/way/380186814/6.json'}]};assert.equal(roadPavementLanes(e,10),3);assert.equal(roadPavementLanes(e,50),2);assert.equal(roadPavementLanes(e,90),3);
});

test('explicit offline transport metadata preserves a flat street physical width after the separate height stage',async()=>{
 const{roadRibbon}=await import('../../src/world/bridge-clearance');const{raw,transport}=fixture();
 transport.joinedPavement={sourceWidth:raw.w,originalWidth:raw.w,intervals:[[0,24]],taper:30,release:'2026-10-21.0'};
 for(const context of[false,true]){
  const e:any={...raw,...(context?{ctx:1}:{})};if(context)delete e.lanes;
  const moved=applyTileRoadNodeTransports([e],structuredClone([transport]));assert.deepEqual(moved.mismatched,[]);
  const owner={...moved.roads[0],lanes:1},profile={id:raw.id,stage:'conditionedWorld' as const,expected:roadProfileInput(owner),elev:owner.pts.map((_,i)=>2*(1-i/(owner.pts.length-1)))};
  const result=applyVerifiedRoadTileProfiles(moved.roads,[profile]);assert.deepEqual(result.report.mismatched,[]);
  const width=(e:RoadEdge)=>{const r=roadRibbon(e,[e]);return r.L.map((p,i)=>Math.hypot(p[0]-r.R[i][0],p[1]-r.R[i][1]));};
  assert.ok(width(result.roads[0]).every(w=>Math.abs(w-5.5)<1e-9));
  assert.ok(width({...result.roads[0],joinedPavement:undefined}).every(w=>Math.abs(w-8.4)<1e-9),'negative control reproduces the implicit elevated widening');
 }
 const invalid=structuredClone(transport);invalid.joinedPavement!.originalWidth=-1;assert.deepEqual(applyTileRoadNodeTransports([raw],[invalid]).mismatched,['minor']);
});

test('an explicit physical baseline preserves a raised street ribbon and source capacity through height changes',async()=>{
 const{roadRibbon}=await import('../../src/world/bridge-clearance');const{tileRoadSourceInput}=await import('../../src/world/road-node-transport');
 const{currentRoadGradePatches,applyRoadGradePatches}=await import('../../src/world/road-grades');
 const raw={...fixture().raw,w:4.5,pts:[[0,0],[30,0],[30,1],[31,2],[60,40]]as[number,number][],elev:[2,2,2,1,0]};
 const arc=[0];for(let i=1;i<raw.pts.length;i++)arc.push(arc[i-1]+Math.hypot(raw.pts[i][0]-raw.pts[i-1][0],raw.pts[i][1]-raw.pts[i-1][1]));
 const original=roadRibbon(raw,[raw]),transport={id:raw.id,expected:tileRoadSourceInput(raw),pts:raw.pts,elev:raw.elev,sourceArc:arc,sourceXY:raw.pts,maximumDisplacement:0,minimumTransportMask:1,
  joinedPavement:{sourceWidth:raw.w,originalWidth:8.4,physicalWidth:8.4,intervals:[[0,arc.at(-1)!]]as[number,number][],taper:1,release:'literal-baseline-fixture'}};
 for(const ctx of[false,true]){
  const source:any={...raw,...(ctx?{ctx:1}:{})};if(ctx)delete source.lanes;
  const applied=applyTileRoadNodeTransports([source],[structuredClone(transport)]);assert.deepEqual(applied.mismatched,[]);const e=applied.roads[0];
  assert.equal(e.w,raw.w);assert.equal(e.lanes,source.lanes);
  const actual=roadRibbon(e,[e]);assert.deepEqual(actual.L,original.L);assert.deepEqual(actual.R,original.R);
  const lowered={...e,elev:e.pts.map(()=>0)},patched=applyRoadGradePatches([source],structuredClone(currentRoadGradePatches([lowered])))[0];
  const flat=roadRibbon(patched,[patched]);assert.deepEqual(flat.L,original.L);assert.deepEqual(flat.R,original.R);
 }
 for(const value of[-1,NaN,Infinity,4,8.5]){
  const invalid=structuredClone(transport);invalid.joinedPavement.physicalWidth=value;
  assert.deepEqual(applyTileRoadNodeTransports([raw],[invalid]).mismatched,[raw.id]);
 }
 const bad=structuredClone(transport);delete(bad.joinedPavement as any).physicalWidth;
 const shrunk=applyTileRoadNodeTransports([raw],[bad]).roads[0];assert.notDeepEqual(roadRibbon(shrunk,[shrunk]).L,original.L,'negative detects the old scalar-width narrowing');
});

test('the cache hook retains an explicit physical target and rejects malformed targets before installation',async()=>{
 const{installPreparedRoadCache,currentRoadGradePatches}=await import('../../src/world/road-grades');const{roadRibbon}=await import('../../src/world/bridge-clearance');
 const raw={...fixture().raw,elev:[2,2]},target={...raw,joinedPavement:{sourceWidth:raw.w,originalWidth:8.4,physicalWidth:8.4,intervals:[[0,24]]as[number,number][],taper:1,release:'literal-baseline-fixture'}};
 const payload:import('../../src/world/road-grades').PreparedRoadCachePayload={version:1,sourceRoadCount:1,patches:currentRoadGradePatches([target]),report:{roads:1,repairedRoads:1,sourceSteepSegments:0,modelSteepSegments:0,maxModelGrade:0,protectedRoads:0,protectedRoadsChanged:0,separatedCrossings:0,minCrossingSeparation:0,joinedEndpointMaxDifference:0,uncertainty:'Synthetic physical baseline metadata'}};
 const installed=installPreparedRoadCache([raw],structuredClone(payload));assert.ok(installed);assert.equal(installed[0].w,raw.w);assert.equal(installed[0].lanes,raw.lanes);
 assert.deepEqual(roadRibbon(installed[0],installed).L,roadRibbon(raw,[raw]).L);
 for(const physicalWidth of[-1,NaN,Infinity,4,9]){
  const invalid=structuredClone(payload);invalid.patches[0].joinedPavement!.physicalWidth=physicalWidth;
  assert.equal(installPreparedRoadCache([raw],invalid),false);
 }
});

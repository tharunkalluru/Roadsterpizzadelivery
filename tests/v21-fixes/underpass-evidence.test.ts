import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRailwayNetwork } from '../../src/world/railway-geometry';
import { prepareRailwayClearance, RAIL_OVER_ROAD } from '../../src/world/railway-clearance';
import { railwayUnderpassAt, type RailwayUnderpassEvidence } from '../../src/world/railway-evidence';
import { buildRailwayCrossingSites } from '../../src/game/railway-crossings';
import type { RoadEdge, XZ } from '../../src/world/types';
import type { OsmFeature } from '../../src/world/extras';

const road = (id='street', pts:XZ[]=[[0,-500],[0,500]]):RoadEdge => ({id,seg:id,name:'Unverified Underpass',cls:'primary',w:8,lanes:2,oneway:null,from:null,to:null,pts,elev:null,maxspeed:40});
const track = (id='rail', l:XZ[]=[[-500,0],[500,0]]):OsmFeature => ({id,k:'rail',t:{railway:'rail',bridge:'yes',layer:'1'},l});
const site:RailwayUnderpassEvidence = {name:'Verified local fixture',roads:['street'],rails:['rail'],anchor:[0,0],radius:30,source:'fixture'};
function heightAt(e:RoadEdge,x:number,z:number) {
  let best=Infinity,y=0;
  for(let i=1;i<e.pts.length;i++){const a=e.pts[i-1],b=e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz);if(d<best){best=d;y=(e.elev?.[i-1]||0)+((e.elev?.[i]||0)-(e.elev?.[i-1]||0))*u;}}
  return y;
}

test('a bridge tag, layer number or underpass-like street name cannot create an underpass',()=>{
  const profiles=makeRailwayNetwork([track()]).profiles,input=[road()];
  const result=prepareRailwayClearance(input,profiles);
  assert.equal(result.roads[0],input[0]);assert.equal(result.report.loweredRoads,0);
  assert.deepEqual(result.report.underpassRoadIds,[]);assert.ok(result.report.unverifiedUnderpassCrossings.length>0);
  assert.equal(buildRailwayCrossingSites(result.roads,profiles).length,1,'physical coplanar crossings retain gates regardless of the street label');
});

test('road identity, rail identity and bounded location must all match before any new cut',()=>{
  assert.ok(railwayUnderpassAt([site],'street','rail',0,0));
  for(const [id,rail,x,z] of [['other','rail',0,0],['street','other',0,0],['street','rail',100,0]] as const)assert.equal(railwayUnderpassAt([site],id,rail,x,z),undefined);
  const profiles=makeRailwayNetwork([track()]).profiles;
  for(const mismatch of [{...site,roads:['other']},{...site,rails:['other']},{...site,anchor:[200,0] as const}]){
    const result=prepareRailwayClearance([road()],profiles,{underpasses:[mismatch]});
    assert.equal(result.report.loweredRoads,0);assert.deepEqual(result.report.underpassRoadIds,[]);
  }
  const result=prepareRailwayClearance([road()],profiles,{underpasses:[site]});
  assert.ok(heightAt(result.roads[0],0,0)<=-RAIL_OVER_ROAD);assert.deepEqual(result.report.unresolved,[]);
});

test('an evidenced crossing cannot authorize a distant second crossing on the same road and rail IDs',()=>{
  const e=road('street',[[-500,0],[700,0]]),profiles=makeRailwayNetwork([track('rail',[[0,-100],[0,100],[300,100],[300,-100]])]).profiles;
  const result=prepareRailwayClearance([e],profiles,{underpasses:[site]});
  assert.ok(heightAt(result.roads[0],0,0)<=-RAIL_OVER_ROAD+.001);
  assert.ok(Math.abs(heightAt(result.roads[0],300,0))<.001,'the separate crossing remains at the running datum');
  assert.ok(result.report.unverifiedUnderpassCrossings.some(c=>Math.abs(c.x-300)<.01));
  assert.ok(buildRailwayCrossingSites(result.roads,profiles).some(c=>Math.abs(c.x-300)<.01));
});

test('a connected underpass approach cannot silently depress an unevidenced crossing on a neighboring road',()=>{
  const a={...road('street',[[0,-500],[0,0],[0,100]]),to:'join'},b={...road('neighbor',[[0,100],[0,500]]),from:'join'};
  const profiles=makeRailwayNetwork([track(),track('other',[[-100,300],[100,300]])]).profiles;
  const result=prepareRailwayClearance([a,b],profiles,{underpasses:[site]});
  assert.ok(heightAt(result.roads[0],0,0)<=-RAIL_OVER_ROAD+.001);
  assert.ok(Math.abs(heightAt(result.roads[1],0,300))<.001);
  assert.ok(!result.report.underpassRoadIds.includes('neighbor'));
});

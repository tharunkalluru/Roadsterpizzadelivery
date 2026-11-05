import test from 'node:test';
import assert from 'node:assert/strict';
import {unionPhysicalRoads,type TileRoadReleaseModel}from'../../scripts/qa/road-release-inventory';
import type{RoadEdge}from'../../src/world/types';
const road=(id:string,z=0):RoadEdge=>({id,seg:id,name:null,cls:'service',w:4.5,lanes:1,oneway:null,from:id+'a',to:id+'b',maxspeed:null,pts:[[0,z],[20,z]],elev:null});
function fixture(){
  const core=[road('core')],side=road('side',5),context=structuredClone(core[0]);delete(context as Partial<RoadEdge>).lanes;
  const rows=[context,side],tile:TileRoadReleaseModel={schemaVersion:1,sourceCoreSHA256:'a'.repeat(64),requestedRoadIDs:['side'],roads:rows,
    physicalFootprints:rows.map(e=>({id:e.id,L:e.pts.map(p=>[p[0],p[1]+2.25]),R:e.pts.map(p=>[p[0],p[1]-2.25])})),sourcePackSHA256:{},
    copies:rows.map(e=>({id:e.id,tile:'0_0',pack:'packs/test',context:e.id==='core',physicalSHA256:'b'.repeat(64),footprintSHA256:'c'.repeat(64)})),
    unmatched:[],inputDisagreements:[],footprintVariants:[],requestedNotRendered:[]};return{core,tile};
}
test('physical core/tile union preserves the core and admits only matching context plus actual owned side roads',()=>{
  const{core,tile}=fixture(),before=JSON.stringify({core,tile}),merged=unionPhysicalRoads(core,tile);
  assert.equal(merged.roads.length,2);assert.equal(merged.roads[0],core[0]);assert.equal(merged.byId.get('side'),tile.roads[1]);
  assert.equal(merged.footprints.size,2);assert.equal(JSON.stringify({core,tile}),before);
});
test('stale heights, omitted owners, duplicate rows and unresolved rendering cannot masquerade as a complete physical union',()=>{
  for(const kind of['height','topology','missing-owner','duplicate-road','missing-footprint','unrendered','variant']){
    const{core,tile}=fixture();
    if(kind==='height')tile.roads[0].elev=[0,1];if(kind==='topology')tile.roads[0].from='elsewhere';
    if(kind==='missing-owner')tile.copies[1].context=true;if(kind==='duplicate-road')tile.roads.push(structuredClone(tile.roads[1]));
    if(kind==='missing-footprint')tile.physicalFootprints.pop();if(kind==='unrendered')tile.requestedNotRendered.push('side');
    if(kind==='variant')tile.footprintVariants.push({id:'side'});
    const before=JSON.stringify({core,tile});assert.throws(()=>unionPhysicalRoads(core,tile),/disagreement|inventory|unresolved/);assert.equal(JSON.stringify({core,tile}),before);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { initTemplates } from '../../src/core/util';
import { buildTile } from '../../src/world/city';
import type { RoadEdge } from '../../src/world/types';
import { matchEmittedRoadTriangles } from '../../scripts/qa/road-emitted-records';
const road=(id:string,pts:[number,number][],from:string,to:string,elev:number[]|null=null):RoadEdge=>({id,seg:id,name:null,cls:'primary',w:7,lanes:2,oneway:'backward',from,to,pts,elev,maxspeed:40});
initTemplates();
test('actual normal asphalt and shared-node caps match finite support by exact emitted vertices',()=>{
  const a=road('main',[[400,500],[500,500]],'a','join'),b=road('side',[[500,500],[500,600]],'join','b');
  const tile=buildTile({i:0,j:0,roads:[a,b],nodes:{a:[400,500],join:[500,500],b:[500,600]},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
  const result=matchEmittedRoadTriangles(tile);assert.equal(result.unmatched.length,0);assert.ok(result.roadTriangles>4);assert.ok(result.matched.some(m=>m.triangulatedPatch));
});
test('long context clipping retains exact actual Float32 triangle/source association',()=>{
  const a={...road('long',[[-100,500],[1100,500]],'a','b',[2,2]),ctx:1};
  const tile=buildTile({i:0,j:0,roads:[a],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
  const result=matchEmittedRoadTriangles(tile);assert.equal(result.unmatched.length,0);assert.ok(result.roadTriangles>0);assert.ok(result.matched.every(m=>m.surface.e?.id==='long'));
});
test('a deliberately altered emitted asphalt vertex cannot be explained by approximate metadata',()=>{
  const a=road('negative',[[400,500],[500,500]],'a','b');
  const tile=buildTile({i:0,j:0,roads:[a],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
  const buffer=tile.buffers.find(b=>b.mat==='road')!;buffer.pos[1]+=.1;
  assert.ok(matchEmittedRoadTriangles(tile).unmatched.length>0);
});

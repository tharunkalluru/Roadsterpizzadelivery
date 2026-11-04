import test from 'node:test';
import assert from 'node:assert/strict';
import { collideWalls } from '../../src/game/physics';
import type { Wall } from '../../src/world/city';
const wall:Wall={ax:0,az:0,bx:0,bz:200,y0a:0,y0b:0,y1a:1,y1b:1,kind:'median'};
function city(w=wall):any { const walls=new Map();for(let x=-1;x<2;x++)for(let z=-1;z<9;z++)walls.set(`${x},${z}`,[w]);return {walls,railwayWalls:[]}; }
test('long dividers do not form invisible walls beyond their visible ends',()=>{
 for(const length of [1,20,200])for(const offset of [1.2,3,8])for(const end of [-1,1]){
  const w={...wall,bz:length},z=end<0?-offset:length+offset,p={x:1,z};
  assert.equal(collideWalls(city(w),{x:-1,z},p,1.05,0,1).hit,0,`length ${length}, offset ${offset}`);
  assert.deepEqual(p,{x:1,z});
 }
});
test('divider endpoints remain solid with finite rounded contacts',()=>{
 const p={x:.2,z:200.5},r=collideWalls(city(),{x:.2,z:201.6},p,1.05,0,1);
 assert.ok(r.hit>0);assert.ok(Math.abs(Math.hypot(p.x,p.z-200)-1.05)<1e-8);
});
test('oblique fast steps cannot tunnel through the finite part of a parapet',()=>{
 const p={x:8,z:201},r=collideWalls(city(),{x:-8,z:195},p,1.05,0,1);
 assert.ok(r.hit>0);assert.ok(p.x<0);
});
test('open divider gaps stay traversable in both directions; real walls and overhead separation remain',()=>{
 for(const sign of [-1,1]){
  const p={x:sign*2,z:204};assert.equal(collideWalls(city(),{x:-sign*2,z:204},p,1.05,0,1).hit,0);
  const inside={x:sign*2,z:100};assert.ok(collideWalls(city(),{x:-sign*2,z:100},inside,1.05,0,1).hit>0);
  assert.equal(collideWalls(city(),{x:-sign*2,z:100},{x:sign*2,z:100},1.05,2,3).hit,0);
 }
});

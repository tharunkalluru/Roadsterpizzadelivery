import test from 'node:test';import assert from 'node:assert/strict';
import {campaignPlan,campaignDistance,campaignSession,campaignSpawn,savedCampaign} from '../../src/delivery/campaign';
// Historical seven-level campaign/save-migration fixture.
import {loadLegacyLevels as loadLevels} from './fixtures/legacy-levels';import {ProgressSystem} from '../../src/delivery/systems/progress-system';
import {RoadGraph} from '../../src/game/roadgraph';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
test('campaign visits every configured customer once, preserves opening/finale and reduces waypoint travel',()=>{
 const source=loadLevels(),ordered=campaignPlan(source);assert.equal(ordered[0].id,source[0].id);assert.equal(ordered.at(-1)!.id,source.at(-1)!.id);
 assert.equal(new Set(ordered.map(l=>l.id)).size,source.length);assert.ok(campaignDistance(ordered)<campaignDistance(source));assert.deepEqual(ordered.map(l=>l.level),source.map(l=>l.level));assert.equal(source[1].celebrity.name,'Ram Charan');
});
test('v1 completions survive optimized ordering and v2 reload without replaying completed customers',()=>{
 const levels=loadLevels(),data=new Map([['roadster-mystery-progress-v1',JSON.stringify({version:1,completed:levels.slice(0,3).map(l=>l.id)})]]);
 const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 let s=campaignSession(levels,storage),p=new ProgressSystem(s.levels,s.storage);assert.equal(p.completedIds.length,3);p.complete(p.nextLevel!.id);
 s=campaignSession(levels,storage);p=new ProgressSystem(s.levels,s.storage);assert.equal(p.completedIds.length,4);assert.ok(!p.completedIds.includes(p.nextLevel!.id));
});
test('real packed city offers a ground-level main-road start within 1–2km of opening delivery',()=>{
 const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()),target=loadLevels()[0].destination;
 const point=campaignSpawn(new RoadGraph(core.roads),target);assert.ok(point);const d=Math.hypot(point.x-target.x,point.z-target.z);assert.ok(d>=1000&&d<=2000);
});

test('v2 reload preserves the completed optimized prefix, and newly added content is still reachable', () => {
 const source=loadLevels(),ordered=campaignPlan(source),completed=ordered.slice(0,4).map(l=>l.id);
 const raw=JSON.stringify({version:2,order:ordered.map(l=>l.id),completed});
 const extra={...source[3],id:'future-delivery',campaignRole:undefined,level:8,destination:{label:'Future district',x:-2000,z:100}};
 const expanded=[...source,extra];
 const plan=campaignPlan(expanded,raw);
 assert.deepEqual(plan.slice(0,4).map(l=>l.id),completed,'completed customers cannot be shuffled or replayed');
 assert.equal(plan.at(-1)!.id,source.at(-1)!.id,'explicit finale survives a content extension');
 assert.equal(new Set(plan.map(l=>l.id)).size,8);assert.ok(plan.some(l=>l.id===extra.id));
 assert.deepEqual(plan.map(l=>l.level),[1,2,3,4,5,6,7,8]);
 const storage={getItem:()=>raw,setItem(){}};
 const session=campaignSession(expanded,storage),progress=new ProgressSystem(session.levels,session.storage);
 assert.deepEqual(progress.completedIds,completed);assert.equal(progress.restaurantIndex,4);assert.equal(progress.total,8);
 assert.ok(progress.nextLevel&&!completed.includes(progress.nextLevel.id));
});

test('malformed v2 order cannot unlock future content or erase the storage during migration', () => {
 const source=loadLevels();
 for(const order of [[source[0].id,source[0].id],['unknown-customer']]) {
  assert.deepEqual(savedCampaign(source,JSON.stringify({version:2,order,completed:order})).completed,[]);
 }
 const original=JSON.stringify({version:1,completed:[source[0].id,source[2].id]});let writes=0;
 const storage={getItem:()=>original,setItem(){writes++;}};
 const session=campaignSession(source,storage),progress=new ProgressSystem(session.levels,session.storage);
 assert.equal(writes,0,'opening a migrated game never rewrites or deletes the existing save');
 assert.deepEqual(progress.completedIds,[source[0].id],'a gap cannot unlock a later level');
});

test('retiring an uncompleted delivery preserves the known completed v2 prefix', () => {
 const source=loadLevels(),ordered=campaignPlan(source),completed=ordered.slice(0,2).map(l=>l.id);
 const raw=JSON.stringify({version:2,order:ordered.map(l=>l.id),completed});
 const remaining=source.filter(l=>l.id!==ordered[4].id).map((l,i)=>({...l,level:i+1}));
 const session=campaignSession(remaining,{getItem:()=>raw,setItem(){throw new Error('migration must remain read-only');}});
 const progress=new ProgressSystem(session.levels,session.storage);
 assert.deepEqual(progress.completedIds,completed);assert.equal(progress.total,6);
 assert.ok(progress.nextLevel&&!completed.includes(progress.nextLevel.id));
});

test('retiring a completed delivery preserves the other completed IDs without unlocking an unseen delivery', () => {
 const source=loadLevels(),ordered=campaignPlan(source),completed=ordered.slice(0,3).map(l=>l.id),retired=completed[1];
 const raw=JSON.stringify({version:2,order:ordered.map(l=>l.id),completed});
 const remaining=source.filter(l=>l.id!==retired).map((l,i)=>({...l,level:i+1}));
 const session=campaignSession(remaining,{getItem:()=>raw,setItem(){}}),progress=new ProgressSystem(session.levels,session.storage);
 assert.deepEqual(progress.completedIds,completed.filter(id=>id!==retired));
 assert.equal(progress.restaurantIndex,2);assert.equal(progress.currentLevel,3);
 assert.ok(progress.nextLevel&&!completed.includes(progress.nextLevel.id));
});

test('retirement migration rejects malformed history and retains the original completed-prefix gate', () => {
 const source=loadLevels(),order=source.map(l=>l.id);
 for(const data of [
  {order:[...order,order[0]],completed:[order[0]]},
  {order,completed:[order[0],order[0]]},
  {order:[...order,42],completed:[order[0]]},
  {order,completed:[order[0],42]},
  {order,completed:[order[0],'never-in-saved-order']},
 ])assert.deepEqual(savedCampaign(source,JSON.stringify({version:2,...data})).completed,[]);
 const retired='retired-before-unseen';
 const raw=JSON.stringify({version:2,order:[order[0],retired,...order.slice(1)],completed:[order[0],order[1]]});
 assert.deepEqual(savedCampaign(source,raw).completed,[order[0]],'a saved gap cannot be converted to completed progress by retiring the missing ID');
});

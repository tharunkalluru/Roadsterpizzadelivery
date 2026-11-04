import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadLevels,validateLevels } from '../../src/delivery/content/levels';
import { campaignPlan,campaignSession } from '../../src/delivery/campaign';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';
import { ProgressSystem,MYSTERY_SAVE_KEY } from '../../src/delivery/systems/progress-system';
import { EventBus,type DeliveryEvents } from '../../src/delivery/core/events';
import { createDeliveryModule } from '../../src/delivery/modules';
import type { StorageLike } from '../../src/delivery/core/types';
import { loadLegacyLevels } from './fixtures/legacy-levels';

const identities=['Pushpa Raj','Ram','Devara','Srikanth Odela','Arundhati','Jessie','Hasini','Bhanumathi','Sukumar','Pawan Kalyan','Maruthi','Prabhas','Arjun Reddy','Nani'];

test('production campaign preserves all fourteen approved identities, order and scene-only content',()=>{
  const levels=loadLevels();assert.equal(levels.length,14);assert.deepEqual(levels.map(l=>l.celebrity.name),identities);
  assert.equal(levels[12].level,13);assert.equal(levels[12].celebrity.name,'Arjun Reddy');assert.match(levels[12].destination.label,/Osmania Medical/i);
  assert.ok(!levels.some(l=>/Mahesh|Rajamouli|IMAX|film.city|Ramoji/i.test(`${l.celebrity.name} ${l.destination.label}`)));
  assert.deepEqual(campaignPlan(levels).map(l=>l.id),levels.map(l=>l.id),'distance optimisation cannot reorder the approved numbered scenes');
  for(const level of levels){
    assert.equal(level.callMode,'NONE');assert.deepEqual(level.script,[]);assert.equal(level.nagScript,undefined);assert.equal(level.bonusScript,undefined);assert.equal(level.revealAt,'afterDelivery');
    assert.ok(level.destination.label.trim());
  }
  assert.equal(levels[0].campaignOrder,'fixed');
  const invalid=structuredClone(levels);invalid[0].script=[{who:'customer',text:'A call was explicitly deferred.'}];assert.throws(()=>validateLevels(invalid),/call script/);
});

test('every production mechanic is registered, builds its environment, remains arrival-locked and tears down cleanly',()=>{
  const scene=new THREE.Scene();
  for(const level of loadLevels()){
    const module=createDeliveryModule(level.module),destination={...level.destination,y:level.destination.y??0},events:string[]=[];
    module.setup({scene,destination,player:()=>({...destination,y:destination.y+4,yaw:0,speed:0,flying:true}),canInteract:()=>false,
      emit:e=>events.push(e),route:[destination,{...destination,z:destination.z+1000}],metroService:()=>({bodies:[],dwells:[]})},level.moduleParams);
    module.update(.05);module.onDrop();assert.ok(!events.includes('done'),`${level.id} cannot bypass the arrival gate`);
    assert.equal(typeof module.status.instruction,'string');assert.ok(module.status.instruction.length>0);assert.ok(Number.isFinite(module.target.x));
    module.teardown();assert.equal(scene.children.length,0,`${level.id} leaves no old scenery behind`);
  }
});

test('all fourteen scene-only deliveries require arrival and complete once without a call or duplicate progress',()=>{
  const levels=loadLevels(),events=new EventBus<DeliveryEvents>(),controller=new DeliveryController(levels,events),finished:string[]=[],calls:string[]=[];
  events.on('levelComplete',e=>finished.push(e.levelId));events.on('callStarted',()=>calls.push('call'));events.on('callRinging',()=>calls.push('ring'));
  for(const level of levels){
    assert.equal(controller.pickup(),true);assert.equal(controller.activeLevel!.id,level.id);assert.equal(controller.state,'EN_ROUTE');
    assert.equal(controller.setpieceDone(),false);controller.update(10000,(level.arrivalRadius??100)+1);assert.equal(controller.canDrop,false);assert.equal(controller.call(),false);
    assert.equal(controller.calls.buttonState,'hidden');controller.update(.05,0);assert.equal(controller.state,'SETPIECE');assert.equal(controller.canDrop,true);
    assert.equal(controller.setpieceFailed('Retry the physical scene'),true);assert.equal(controller.progress.completedIds.length,level.level-1);
    assert.equal(controller.setpieceDone(),true);assert.equal(controller.setpieceDone(),false);assert.equal(controller.progress.complete(level.id),false);
    assert.equal(controller.progress.cards.length,level.level);assert.equal(controller.progress.completedIds.length,level.level);assert.equal(controller.progress.currentLevel,Math.min(level.level+1,levels.length));
    assert.equal(controller.continueAfterCompletion(),true);assert.equal(controller.continueAfterCompletion(),false);
  }
  assert.equal(controller.progress.finished,true);assert.equal(controller.canPickup,false);assert.equal(controller.pickup(),false);assert.deepEqual(calls,[]);assert.deepEqual(finished,levels.map(l=>l.id));controller.dispose();
});

test('HUD/progression totals follow content length rather than a hard-coded fourteen',()=>{
  for(const count of[1,7,14,15]){
    const levels=loadLevels();if(count===15)levels.push({...structuredClone(levels[13]),id:'future-customer',level:15});
    const configured=validateLevels(levels.slice(0,count)),progress=new ProgressSystem(configured);assert.equal(progress.total,count);
    for(const level of configured)assert.equal(progress.complete(level.id),true);
    assert.equal(progress.cards.length,count);assert.equal(progress.currentLevel,count);assert.equal(progress.finished,true);
  }
});

test('old seven-level save keeps completed Pushpa and Ram, then unlocks new Devara without erasing the original save',()=>{
  const old=loadLegacyLevels(),levels=loadLevels();
  for(const version of[1,2]){
    const original=JSON.stringify({version,order:old.map(l=>l.id),completed:old.map(l=>l.id)}),stored=new Map([[MYSTERY_SAVE_KEY,original]]);let writes=0;
    const storage:StorageLike={getItem:key=>stored.get(key)??null,setItem:(key,value)=>{writes++;stored.set(key,value);}};
    const session=campaignSession(levels,storage),progress=new ProgressSystem(session.levels,session.storage);
    assert.deepEqual(progress.completedIds,levels.slice(0,2).map(l=>l.id));assert.equal(progress.nextLevel?.celebrity.name,'Devara');assert.equal(progress.currentLevel,3);assert.equal(writes,0);assert.equal(stored.get(MYSTERY_SAVE_KEY),original);
    assert.equal(progress.complete(levels[2].id),true);assert.equal(writes,1);assert.equal(progress.complete(levels[2].id),false);
    const restored=new ProgressSystem(levels,storage);assert.equal(restored.currentLevel,4);assert.equal(restored.nextLevel?.celebrity.name,'Srikanth Odela');
  }
});

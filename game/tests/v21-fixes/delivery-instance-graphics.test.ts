import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ModuleBase } from '../../src/delivery/modules/base';
import type { SceneCharacter } from '../../src/delivery/modules/character';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
class Scene extends ModuleBase {
  actors:SceneCharacter[]=[];
  protected build(){
    this.actors=Array.from({length:4},()=>{const group=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();group.userData.releasedCharacter={identity:'fixture-only'};group.add(leftArm,rightArm);this.root.add(group);
      const actor={group,leftArm,rightArm,catchPose(){}};this.prepareActor(actor);return actor;});
  }
  update(dt:number){if(this.tick(dt))this.status.canDrop=this.unlocked();}
  onDrop(){if(this.unlocked())this.done();}
}

test('the actual ModuleBase gates handoff until every constructed actor is ready while scene time continues',async()=>{
  const scene=new THREE.Scene(),module=new Scene(),events:string[]=[],pending:(()=>void)[]=[];
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.55,z:0,yaw:0,speed:0}),emit:e=>events.push(e),prepareCharacterGraphics:async()=>{await new Promise<void>(resolve=>pending.push(resolve));}},{ });
  module.update(.1);module.onDrop();await flush();assert.equal(module.charactersReady,false);assert.deepEqual(events,[]);assert.ok(module.actors.every(actor=>!actor.group.visible));
  for(let i=0;i<4;i++){pending[i]();await flush();module.update(.1);}
  assert.equal(module.charactersReady,true);assert.equal(module.status.canDrop,true);module.onDrop();assert.deepEqual(events,['done']);module.teardown();assert.equal(scene.children.length,0);
});

test('unprepared scenes invalidate the exact-instance callback before disposing owned actors and legacy no-renderer scenes stay immediate',async()=>{
  let resolve!:()=>void,valid!:()=>boolean;const module=new Scene(),scene=new THREE.Scene(),ctx={scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.55,z:0,yaw:0,speed:0}),emit(){}};
  module.setup({...ctx,prepareCharacterGraphics:async(_root,check)=>{valid=check!;await new Promise<void>(done=>resolve=done);}},{ });await flush();assert.equal(valid(),true);module.teardown();assert.equal(valid(),false);resolve();await flush();assert.equal(scene.children.length,0);
  module.setup(ctx,{});module.update(.1);assert.equal(module.charactersReady,true);assert.equal(module.status.canDrop,true);module.teardown();
});

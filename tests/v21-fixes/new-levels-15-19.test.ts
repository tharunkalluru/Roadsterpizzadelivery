import * as THREE from 'three';
import {createDeliveryModule} from '../../src/delivery/modules';
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLevels,validateLevels} from '../../src/delivery/content/levels';
import {ProgressSystem,MYSTERY_SAVE_KEY} from '../../src/delivery/systems/progress-system';
import {StoryDialogue} from '../../src/delivery/systems/story-dialogue';
import {StoryLandingGate} from '../../src/delivery/systems/story-landing';

test('five appended identities keep the first fourteen saves and unlock the next delivery',()=>{
 const levels=loadLevels(),added=levels.slice(14);
 assert.equal(levels.length,19);assert.deepEqual(added.map(l=>l.celebrity.movie),['Chennakesava Reddy','Shankar Dada MBBS','Athadu','Raja','Magadheera']);
 assert.deepEqual(added.map(l=>l.level),[15,16,17,18,19]);assert.ok(added.every(l=>l.callMode==='NONE'&&l.script.length===0&&l.storyScript!.length>0));
 assert.equal(levels.filter(l=>l.campaignRole==='finale').length,1);assert.equal(levels[18].campaignRole,'finale');
 const store=new Map([[MYSTERY_SAVE_KEY,JSON.stringify({version:2,order:levels.slice(0,14).map(l=>l.id),completed:levels.slice(0,14).map(l=>l.id)})]]);
 const progress=new ProgressSystem(levels,{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)});
 assert.equal(progress.completedIds.length,14);assert.equal(progress.currentLevel,15);assert.equal(progress.finished,false);
 assert.equal(progress.complete(levels[15].id),false);assert.equal(progress.complete(levels[14].id),true);assert.equal(progress.currentLevel,16);
 assert.equal(added[4].moduleParams.keepPizzaOnCompletion,true);assert.equal(added[4].module,'induBusDelivery');
});
test('cinematic subtitles wait for readiness, pause cleanly, and finish the fixed script without calls or input',()=>{
 const dialogue=new StoryDialogue();dialogue.start([{who:'customer',text:'Hello'},{who:'player',text:'Pizza delivery'}]);
 for(let i=0;i<100;i++)dialogue.update(.1,false);assert.equal(dialogue.line?.text,'Hello');
 dialogue.update(NaN,true);assert.equal(dialogue.line?.text,'Hello');assert.ok(dialogue.speechEnvelope>0);
 for(let i=0;i<29;i++)dialogue.update(.1,true);assert.equal(dialogue.line?.text,'Pizza delivery');assert.equal(dialogue.speechEnvelope,0);
 for(let i=0;i<29;i++)dialogue.update(.1,true);assert.equal(dialogue.done,true);assert.equal(dialogue.line,null);
 dialogue.reset();assert.equal(dialogue.done,true);
 const bad=JSON.parse(JSON.stringify(loadLevels()));bad[14].storyScript=[{who:'invented',text:'x'}];assert.throws(()=>validateLevels(bad),/cinematic script/);
});
test('moving scene exception still requires ground contact, matching speed and heading; ordinary destinations stay stationary',()=>{
 const gate=new StoryLandingGate(),p={x:0,y:.55,z:0,yaw:0,speed:8,verticalSpeed:0,flying:false};
 const frame={entry:true,allowMovingEntry:true,point:{x:0,y:.55,z:0},yaw:0,speed:8};
 for(let i=0;i<10;i++)assert.equal(gate.update(.1,{...p,flying:true},frame,0,true),false);
 for(let i=0;i<3;i++)assert.equal(gate.update(.1,p,frame,0,true),false);
 assert.equal(gate.update(.1,p,frame,0,true),true);
 assert.equal(gate.update(.1,{...p,yaw:Math.PI},frame,0,true),false);
 assert.equal(gate.update(.1,{...p,speed:25},frame,0,true),false);
 for(let i=0;i<10;i++)assert.equal(gate.update(.1,p,{...frame,allowMovingEntry:false},0,true),false);
});

test('Prasads visibly places the carton on the actual side steps and leaves Mahesh in the booth',()=>{
 const level=loadLevels()[16],scene=new THREE.Scene(),module=createDeliveryModule(level.module),destination={...level.destination,y:0};let done=0;
 const p={...destination,y:.55,yaw:Number(level.moduleParams.sceneYaw),speed:0,flying:false};
 module.setup({scene,destination,player:()=>p,automaticStories:true,storyActive:()=>true,canInteract:()=>true,storyDialogueComplete:()=>true,emit:e=>{if(e==='done')done++;}},level.moduleParams);
 module.update(.05);assert.equal(module.status.canDrop,true);module.onDrop();assert.equal(done,0,'pizza placement must be visible before completion');
 const carton=scene.getObjectByName('delivery-steps-pizza')!;assert.ok(carton);
 for(let i=0;i<20;i++)module.update(.05);assert.equal(done,0);
 for(let i=0;i<40;i++)module.update(.05);assert.equal(done,1);
 assert.ok(carton.position.distanceTo(new THREE.Vector3(...level.moduleParams.dropOffset as [number,number,number]))<1e-9);
 const actor=scene.getObjectByName('withheld-character-mahesh-athadu');
 if(actor){assert.ok(actor.position.z < -10,'even a withheld test rig remains inside the booth');assert.equal(actor.position.y,6,'receiver stands on upper first floor');}
 assert.ok(module.cameraFocus!.target.distanceTo(carton.getWorldPosition(new THREE.Vector3()))<1e-9,'completion holds on exterior pizza, not booth');
 for(let i=0;i<100;i++)module.update(.05);assert.equal(done,1);assert.equal(carton.parent!==null,true);
 module.teardown();assert.equal(scene.children.length,0);
});

test('Prasads reverse shots move from parked street to upper booth for the current speaker',()=>{
 const level=loadLevels()[16],scene=new THREE.Scene(),module=createDeliveryModule(level.module);
 let speaker:'player'|'customer'='player';
 module.setup({scene,destination:level.destination,player:()=>({...level.destination,yaw:0,speed:0,flying:false}),
   automaticStories:true,storyActive:()=>true,storySpeaker:()=>speaker,emit(){}},level.moduleParams);
 const street=module.cameraFocus!;assert.ok(street.position.y<3);
 speaker='customer';const booth=module.cameraFocus!;assert.ok(booth.position.y>7);assert.ok(booth.target.y>7);
 assert.ok(street.position.distanceTo(booth.position)>12);module.teardown();
});

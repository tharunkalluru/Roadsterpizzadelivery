import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadLevels } from '../../src/delivery/content/levels';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { CampaignQARecorder, type CampaignQANextObservation, type CampaignQAStoryObservation } from '../../src/delivery/qa/campaign-recorder';
import { campaignRequiredFacts, campaignScenario } from '../../src/delivery/qa/campaign-scenarios';
import { StoryDirector } from '../../src/delivery/systems/story-director';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';
import { RopeBucket } from '../../src/delivery/modules/street-scenes';
import { campaignCartonInView, createCampaignCartonViewProbe } from '../../src/delivery/qa/campaign-observer';

const observation=(changes:Partial<CampaignQAStoryObservation>={}):CampaignQAStoryObservation=>({
  levelId:loadLevels()[0].id,phase:'playing',captured:true,controllerState:'SETPIECE',modulePresent:true,
  charactersReady:true,sceneVisible:true,visiblePizzaTransfer:false,paused:false,pauseVisible:true,
  nextVisible:false,gameplayVisible:false,...changes,
});
function fixture(){
  let now=0;const levels=loadLevels(),r=new CampaignQARecorder(levels,{mode:'full-campaign',layout:'touch-layout',environment:'Synthetic observer-accounting fixture; no physical device'},[],()=>now);
  r.sample({x:0,y:.55,z:0,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:1,support:null,action:'',ready:false,instruction:''});
  r.begin(levels[0].id);r.picked('actual-jump-test-carrier',true);
  return {r,levels,advance:(ms:number)=>now+=ms};
}
function finish(f:ReturnType<typeof fixture>){
  f.r.observeStory(observation({visiblePizzaTransfer:true}));
  assert.equal(f.r.setpieceFinished(f.levels[0].id,observation({controllerState:'REVEAL'})),true);
  f.r.complete(f.levels[0].id);
  const held=observation({phase:'viewing',controllerState:'LEVEL_COMPLETE',nextVisible:true});
  f.r.observeStory(held);f.advance(1001);f.r.observeStory(held);
}
const nextView=(nextId:string,changes:Partial<CampaignQANextObservation>={}):CampaignQANextObservation=>({
  loading:true,relocating:true,oldSceneReleased:true,nextLevelId:nextId,paused:true,choosing:true,
  x:0,y:.55,z:0,placementRevision:1,onRoad:false,surface:'ground',...changes,
});

test('automatic current content replaces manual/exit requirements while legacy calls retain them',()=>{
  const levels=loadLevels();
  for(const level of levels){
    const required=campaignRequiredFacts(level,level===levels.at(-1));
    for(const fact of ['story-captured','physical-pizza-transfer','automatic-handoff','story-viewing-hold'])assert.ok(required.includes(fact));
    for(const fact of ['manual-handoff','truck-exit','compound-exit','resurfaced','dive-action'])assert.equal(required.includes(fact),false);
    assert.equal(required.includes('next-road-ready'),level!==levels.at(-1));
    assert.deepEqual(campaignRequiredFacts({...level,callMode:'PLAYER_CALLS'},false),[...campaignScenario(level.id)!.requiredFacts]);
  }
  assert.ok(campaignRequiredFacts(levels[2],false).includes('automatic-dive'));
  assert.equal(campaignRequiredFacts(levels[1],false).includes('rail-multiple-coaches'),false,'landing on the marked customer coach is also a valid manual landing');
});

test('controller completion and fake physical events cannot certify an uncaptured or unobserved transfer',()=>{
  for(const invalid of [observation(),observation({captured:false,visiblePizzaTransfer:true}),observation({modulePresent:false,visiblePizzaTransfer:true}),observation({charactersReady:false,visiblePizzaTransfer:true}),observation({sceneVisible:false,visiblePizzaTransfer:true})]){
    const f=fixture();f.r.observeStory(invalid);
    assert.equal(f.r.setpieceFinished(f.levels[0].id,{...invalid,controllerState:'REVEAL'}),false);
    f.r.complete(f.levels[0].id);assert.equal(f.r.report().rows[0].automaticHandoff,false);
    assert.equal(f.r.report().acceptance.fullCampaignAccepted,false);
  }
});

test('a physical setpiece event must match the active level, director phase and reveal ordering',()=>{
  for(const invalid of [observation({levelId:'wrong-scene',controllerState:'REVEAL'}),observation({phase:'viewing',controllerState:'REVEAL'}),observation({controllerState:'LEVEL_COMPLETE'}),observation({controllerState:'SETPIECE'})]){
    const f=fixture();f.r.observeStory(observation({visiblePizzaTransfer:true}));
    assert.equal(f.r.setpieceFinished(f.levels[0].id,invalid),false);
  }
  const f=fixture();f.r.observeStory(observation({visiblePizzaTransfer:true}));
  assert.equal(f.r.setpieceFinished(f.levels[1].id,observation({controllerState:'REVEAL'})),false);
});

test('the real bucket module, director and controller emit a physical automatic handoff without manual input',()=>{
  let now=0;const level=loadLevels()[3],events=new EventBus<DeliveryEvents>(),controller=new DeliveryController([level],events,{getItem:()=>null,setItem(){}});
  const recorder=new CampaignQARecorder([level],{mode:'isolated-scene',layout:'desktop',environment:'Actual module/controller physics fixture, not a visual or phone test'},[],()=>now);
  const director=new StoryDirector(),scene=new THREE.Scene(),module=new RopeBucket();
  const player={x:0,y:.55,z:0,yaw:0,speed:0};
  const snap=(visible:boolean):CampaignQAStoryObservation=>observation({levelId:level.id,phase:director.phase,captured:director.captured,controllerState:controller.state,visiblePizzaTransfer:visible});
  events.on('locationSet',()=>recorder.begin(level.id));
  events.on('setpieceDone',event=>recorder.setpieceFinished(event.levelId,snap(false)));
  events.on('levelComplete',()=>{director.complete();recorder.complete(level.id);});
  controller.pickup();controller.update(.01,0);recorder.picked('jump-carrier',true);
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>player,automaticStories:true,storyActive:()=>director.captured,
    canInteract:()=>controller.canDrop,emit:type=>{if(type==='done')controller.setpieceDone();}}, {roofHeight:6});
  assert.equal(director.tryStart(module.story,controller.canDrop),true);
  for(let i=0;i<250&&!controller.complete;i++){
    now+=50;module.update(.05);
    const pizza=scene.getObjectByName('delivery-scene-pizza');
    recorder.observeStory(snap(!!pizza?.visible));
    if(module.status.canDrop)module.onDrop();
  }
  assert.equal(controller.complete,true);assert.equal(director.phase,'viewing');
  const row=recorder.report().rows[0];assert.equal(row.automaticHandoff,true);assert.equal(row.manualHandoff,false);
  assert.ok(recorder.active!.facts.includes('physical-pizza-transfer'));assert.equal(row.allScenarioEvidence,false);
  assert.equal(recorder.report().inputEvidence.trustedTouchObserved,false);module.teardown();controller.dispose();
});

test('viewing proof requires a clean real scene for over one active second and does not advance while paused',()=>{
  const f=fixture();f.r.observeStory(observation({visiblePizzaTransfer:true}));f.r.setpieceFinished(f.levels[0].id,observation({controllerState:'REVEAL'}));f.r.complete(f.levels[0].id);
  const held=observation({phase:'viewing',controllerState:'LEVEL_COMPLETE',nextVisible:true});
  f.r.observeStory(held);f.advance(500);f.r.observeStory(held);assert.equal(f.r.active!.facts.includes('story-viewing-hold'),false);
  f.r.observeStory({...held,paused:true,nextVisible:false});
  for(let i=0;i<100;i++)f.r.observeStory({...held,paused:true,nextVisible:false});
  f.r.observeStory(held);f.advance(999);f.r.observeStory(held);assert.equal(f.r.active!.facts.includes('story-viewing-hold'),false);
  f.advance(2);f.r.observeStory(held);assert.ok(f.r.active!.facts.includes('story-viewing-hold'));
});

test('visible gameplay controls during capture remain a report violation even after the hold becomes clean',()=>{
  const f=fixture();f.r.observeStory(observation({gameplayVisible:true}));finish(f);
  assert.deepEqual(f.r.report().rows[0].storyViolations,['Gameplay controls were visible during a captured story.']);
  assert.equal(f.r.report().rows[0].allScenarioEvidence,false);
});

test('automatic underwater descent requires observing the ordinary surface before submerged story motion',()=>{
  const f=fixture(),level=f.levels[2];f.r.begin(level.id);
  f.r.observeStory(observation({levelId:level.id,submerged:true}));assert.equal(f.r.active!.facts.includes('automatic-dive'),false);
  f.r.observeStory(observation({levelId:level.id,atDiveSurface:true}));
  f.r.observeStory(observation({levelId:level.id,submerged:true}));assert.ok(f.r.active!.facts.includes('automatic-dive'));
});

test('only a trusted visible Next after retained viewing can queue progression',()=>{
  const f=fixture();assert.equal(f.r.requestNext(f.levels[1].id,{x:0,y:.55,z:0,placementRevision:1},true),false);
  finish(f);assert.equal(f.r.requestNext(f.levels[1].id,{x:0,y:.55,z:0,placementRevision:1},false),false);
  assert.equal(f.r.requestNext('unknown-level',{x:0,y:.55,z:0,placementRevision:1},true),false);
  assert.equal(f.r.requestNext(f.levels[1].id,{x:0,y:.55,z:0,placementRevision:1},true),true);
});

test('Next loading must release the old scene directly while the car still holds its completed pose',()=>{
  for(const invalid of [{loading:false},{oldSceneReleased:false},{relocating:false},{paused:false},{choosing:false},{x:8},{placementRevision:2},{nextLevelId:'other-level'}]){
    const f=fixture();finish(f);f.r.requestNext(f.levels[1].id,{x:0,y:.55,z:0,placementRevision:1},true);
    f.r.observeNext(nextView(f.levels[1].id,invalid));assert.equal(f.r.active!.facts.includes('next-loading'),false);
  }
});

test('a genuine loader then prepared on-road spawn within four kilometres records progression without hiding unrelated recovery',()=>{
  const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);
  f.r.observeNext(nextView(next.id));
  const ready=nextView(next.id,{loading:false,relocating:false,paused:false,choosing:false,x:next.destination.x+1000,z:next.destination.z,y:.55,placementRevision:2,onRoad:true,surface:'road'});
  f.r.observeNext(ready);assert.ok(f.r.active!.facts.includes('next-road-ready'));assert.ok(f.r.active!.facts.includes('direct-next-transition'));
  f.r.sample({x:ready.x,y:.55,z:ready.z,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:2,support:null,action:'',ready:false,instruction:''});
  assert.equal(f.r.report().assistance.length,0,'expected prepared Next placement is progression');
  f.r.sample({x:ready.x,y:.55,z:ready.z,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:3,support:null,action:'',ready:false,instruction:''});
  assert.deepEqual(f.r.report().assistance.map(a=>a.kind),['player-relocated'],'R or other unobserved moves remain assistance');
});

test('teleporting without a loader, spawning offroad or over four kilometres away cannot validate Next',()=>{
  for(const invalid of [{x:loadLevels()[1].destination.x+4001},{onRoad:false},{surface:'roof'},{oldSceneReleased:false},{placementRevision:1}]){
    const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);f.r.observeNext(nextView(next.id));
    f.r.observeNext(nextView(next.id,{loading:false,relocating:false,paused:false,choosing:false,x:next.destination.x,z:next.destination.z,placementRevision:2,onRoad:true,surface:'road',...invalid}));
    assert.equal(f.r.active!.facts.includes('next-road-ready'),false);
  }
  const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);
  f.r.observeNext(nextView(next.id,{loading:false,relocating:false,paused:false,choosing:false,x:next.destination.x,z:next.destination.z,placementRevision:2,onRoad:true,surface:'road'}));
  assert.equal(f.r.active!.facts.includes('next-road-ready'),false);
});

test('final Next is distinct from a new-road transition and never proves restaurant opening by itself',()=>{
  const f=fixture();finish(f);assert.equal(f.r.requestNext(null,{x:0,y:.55,z:0,placementRevision:1},true),true);
  assert.ok(f.r.active!.facts.includes('final-next-requested'));assert.equal(f.r.active!.facts.includes('final-opening'),false);
  assert.equal(f.r.active!.facts.includes('next-road-ready'),false);assert.equal(f.r.report().acceptance.fullCampaignAccepted,false);
});

test('carton frustum telemetry requires attachment, an enabled render branch and nonempty actual bounds',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(60,2,.1,100),probe=createCampaignCartonViewProbe();
  const carton=new THREE.Mesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshBasicMaterial());carton.position.z=-4;root.add(carton);
  camera.updateMatrixWorld(true);root.updateMatrixWorld(true);
  assert.equal(campaignCartonInView(carton,scene,camera,probe),false,'a detached visible-flag branch is not rendered');
  scene.add(root);scene.updateMatrixWorld(true);assert.equal(campaignCartonInView(carton,scene,camera,probe),true);
  root.visible=false;assert.equal(campaignCartonInView(carton,scene,camera,probe),false);root.visible=true;
  carton.material.visible=false;assert.equal(campaignCartonInView(carton,scene,camera,probe),false);carton.material.visible=true;
  carton.position.x=100;scene.updateMatrixWorld(true);assert.equal(campaignCartonInView(carton,scene,camera,probe),false);
  carton.geometry.dispose();carton.material.dispose();
});

test('carton bounds telemetry explicitly leaves opaque occlusion to actual visual review',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,2,.1,100);
  const carton=new THREE.Mesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshBasicMaterial());carton.position.z=-4;
  const wall=new THREE.Mesh(new THREE.BoxGeometry(10,10,1),new THREE.MeshBasicMaterial());wall.position.z=-2;scene.add(carton,wall);
  camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  assert.equal(campaignCartonInView(carton,scene,camera,createCampaignCartonViewProbe()),true,'a camera frustum is not a pixel occlusion test');
  assert.match(fixture().r.report().observationLimits.carton,/pixel visibility and occlusion require explicit human visual review/);
  carton.geometry.dispose();carton.material.dispose();wall.geometry.dispose();wall.material.dispose();
});

test('one observed placement may warm under the loader without counting clean Next too early or hiding a later rescue',()=>{
  const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);f.r.observeNext(nextView(next.id));
  const placed=nextView(next.id,{x:next.destination.x+1000,z:next.destination.z,placementRevision:2,onRoad:true,surface:'road'});
  f.r.observeNext(placed);f.r.sample({x:placed.x,y:placed.y,z:placed.z,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:2,support:null,action:'',ready:false,instruction:''});
  assert.equal(f.r.report().assistance.length,0);assert.equal(f.r.active!.facts.includes('next-road-ready'),false,'a warm asset loader is not yet a prepared playable road');
  f.r.observeNext({...placed,placementRevision:3,loading:false,relocating:false,paused:false,choosing:false});
  f.r.sample({x:placed.x,y:placed.y,z:placed.z,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:3,support:null,action:'',ready:false,instruction:''});
  assert.equal(f.r.active!.facts.includes('next-road-ready'),false);
  assert.ok(f.r.report().assistance.some(event=>event.kind==='next-unexpected-placement-count'));
  assert.ok(f.r.report().assistance.some(event=>event.kind==='player-relocated'));
});

test('a single stable prepared placement can finish loading and then become verified progression',()=>{
  const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);f.r.observeNext(nextView(next.id));
  const placed=nextView(next.id,{x:next.destination.x+1000,z:next.destination.z,placementRevision:2,onRoad:true,surface:'road'});
  f.r.observeNext(placed);f.r.sample({x:placed.x,y:placed.y,z:placed.z,yaw:0,speed:0,flying:false,descending:false,jumping:false,placementRevision:2,support:null,action:'',ready:false,instruction:''});
  f.r.observeNext({...placed,loading:false,relocating:false,paused:false,choosing:false});
  assert.ok(f.r.active!.facts.includes('next-road-ready'));assert.equal(f.r.report().assistance.length,0);
});

test('the original held altitude cannot change before Next placement and an interrupted transaction cannot revive',()=>{
  const f=fixture();finish(f);const next=f.levels[1];f.r.requestNext(next.id,{x:0,y:.55,z:0,placementRevision:1},true);f.r.observeNext(nextView(next.id));
  f.r.observeNext(nextView(next.id,{y:6.55}));
  f.r.observeNext(nextView(next.id,{loading:false,relocating:false,paused:false,choosing:false,x:next.destination.x,z:next.destination.z,placementRevision:2,onRoad:true,surface:'road'}));
  assert.equal(f.r.active!.facts.includes('next-road-ready'),false);
  assert.ok(f.r.report().assistance.some(event=>event.kind==='next-unexpected-old-scene-motion'));
});

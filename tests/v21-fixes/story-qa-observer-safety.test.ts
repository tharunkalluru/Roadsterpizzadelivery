import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { loadLevels } from '../../src/delivery/content/levels';
import { WeddingCrowd } from '../../src/delivery/art/wedding-crowd';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';
import { attachCampaignQA } from '../../src/delivery/qa/campaign-observer';
import { CampaignQARecorder } from '../../src/delivery/qa/campaign-recorder';
import type { Game } from '../../src/game/game';

/** Actual observer/event-bus/controller, with minimal DOM fixture only. This
 * does not establish native pixels, real input, hardware or campaign acceptance. */
function withObserver(run:(fixture:any)=>void){
  class Element{
    hidden=false;style:any={};textContent='';value='';children:Element[]=[];parent:Element|null=null;attrs=new Map<string,string>();
    setAttribute(name:string,value:string){this.attrs.set(name,value);}getAttribute(name:string){return this.attrs.get(name)??null;}
    append(...children:Element[]){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceChildren(...children:Element[]){this.children=[];this.append(...children);}
    contains(other:Element):boolean{return other===this||this.children.some(child=>child.contains(other));}
    addEventListener(){}removeEventListener(){}closest(selector:string){return selector==='[hidden]'&&this.hidden?this:null;}
    getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:50,bottom:50,width:50,height:50};}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
  }
  const original=new Map<string,PropertyDescriptor|undefined>();
  const install=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});};
  const body=new Element(),pause=new Element();body.append(pause);let frame:FrameRequestCallback|null=null,scheduled=0;
  const document={body,hidden:false,createElement:()=>new Element(),getElementById:()=>null,
    querySelector:(selector:string)=>selector==='#b-help'?pause:null,addEventListener(){},removeEventListener(){}};
  install('document',document);install('getComputedStyle',()=>({display:'block',visibility:'visible',opacity:'1'}));
  install('requestAnimationFrame',(callback:FrameRequestCallback)=>{scheduled++;frame=callback;return scheduled;});install('cancelAnimationFrame',()=>{});
  install('addEventListener',()=>{});install('removeEventListener',()=>{});
  const level=loadLevels()[7],events=new EventBus<DeliveryEvents>(),controller=new DeliveryController([level],events,{getItem:()=>null,setItem(){}});
  const scene=new THREE.Scene(),root=new THREE.Group();root.name='delivery-setpiece';scene.add(root);
  const pizza=new THREE.Mesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshBasicMaterial());pizza.name='delivery-handoff-pizza';pizza.position.z=-10;root.add(pizza);
  const camera=new THREE.PerspectiveCamera(60,2,.1,100);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  const story:any={controller,module:{charactersReady:true,supports:[],status:{canDrop:false,instruction:'',actionLabel:''}},director:{phase:'playing'},cinematic:true};
  const game:any={story,deliveryEvents:events,engine:{scene,camera},t:0,paused:false,choosing:false,relocating:false,
    railContacts:{supportId:null},city:{movingRail:[]},metro:{stationDwells:[]},
    player:{pos:new THREE.Vector3(0,.55,0),yaw:0,speed:0,vy:0,placementRevision:1,flying:false,descending:false,jumping:false,onRoad:false,lastKind:'ground'}};
  let observer:ReturnType<typeof attachCampaignQA>|null=null;
  try{
    observer=attachCampaignQA(game as Game,{full:true,touch:false});controller.pickup();controller.update(.01,0);
    run({observer,controller,events,root,pizza,game,body,
      poll(at:number){game.t=at/1000;frame?.(at);},scheduled:()=>scheduled,
      updateWorld(){scene.updateMatrixWorld(true);}});
  }finally{
    observer?.dispose();controller.dispose();pizza.geometry.dispose();pizza.material.dispose();
    for(const[name,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete(globalThis as any)[name];
  }
}

test('the actual observer reads all four real WeddingCrowd batches without assuming the named Group is an InstancedMesh',()=>withObserver(f=>{
  const crowd=new WeddingCrowd();f.root.add(crowd.group);f.updateWorld();
  try{
    assert.equal(crowd.meshes.length,4);assert.ok(crowd.group instanceof THREE.Group);
    f.poll(250);assert.ok(f.observer.report().attempts[0].facts.includes('street-procession'));
    assert.equal(f.observer.report().attempts[0].facts.includes('crowd-animation'),false,'presence alone is not moving transforms');
    const before=crowd.meshes.map(mesh=>mesh.instanceMatrix.version);crowd.update(1);f.poll(500);
    assert.ok(crowd.meshes.every((mesh,index)=>mesh.instanceMatrix.version!==before[index]));
    const report=f.observer.report();assert.ok(report.attempts[0].facts.includes('crowd-animation'));
    assert.ok(report.attempts[0].notes.some((note:string)=>note.includes('all 4 visible instanced')));
    assert.equal(report.observer.healthy,true);assert.equal(report.observer.failureCount,0);
  }finally{crowd.dispose();}
}));

test('legacy single-instanced wedding crowds retain actual matrix-motion evidence',()=>withObserver(f=>{
  const geometry=new THREE.BoxGeometry(1,2,1),material=new THREE.MeshBasicMaterial(),crowd=new THREE.InstancedMesh(geometry,material,2);
  crowd.name='delivery-wedding-crowd';f.root.add(crowd);f.poll(250);crowd.instanceMatrix.needsUpdate=true;f.poll(500);
  assert.ok(f.observer.report().attempts[0].facts.includes('crowd-animation'));assert.equal(f.observer.report().observer.healthy,true);
  crowd.dispose();geometry.dispose();material.dispose();
}));

test('every currently visible wedding draw must change its matrix version before group animation is certified',()=>withObserver(f=>{
  const group=new THREE.Group();group.name='delivery-wedding-crowd';f.root.add(group);
  const geometry=new THREE.BoxGeometry(1,2,1),material=new THREE.MeshBasicMaterial(),meshes=Array.from({length:4},()=>new THREE.InstancedMesh(geometry,material,4));
  group.add(...meshes);f.poll(250);meshes[0].instanceMatrix.needsUpdate=true;f.poll(500);
  assert.equal(f.observer.report().attempts[0].facts.includes('crowd-animation'),false,'one moving template does not prove all four draws animate');
  for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;f.poll(750);
  assert.ok(f.observer.report().attempts[0].facts.includes('crowd-animation'));
  for(const mesh of meshes)mesh.dispose();geometry.dispose();material.dispose();
}));

test('an empty or hidden named crowd Group supplies neither procession nor animation evidence',()=>withObserver(f=>{
  const crowd=new THREE.Group();crowd.name='delivery-wedding-crowd';f.root.add(crowd);f.poll(250);f.poll(500);
  assert.equal(f.observer.report().attempts[0].facts.includes('street-procession'),false);
  const geometry=new THREE.BoxGeometry(1,2,1),material=new THREE.MeshBasicMaterial(),mesh=new THREE.InstancedMesh(geometry,material,2);crowd.add(mesh);crowd.visible=false;
  mesh.instanceMatrix.needsUpdate=true;f.poll(750);
  assert.equal(f.observer.report().attempts[0].facts.includes('crowd-animation'),false);
  mesh.dispose();geometry.dispose();material.dispose();
}));

test('a passive observer exception cannot cancel real synchronous controller completion or downstream event listeners',()=>withObserver(f=>{
  const original=f.root.getObjectByName;f.root.getObjectByName=()=>{throw new Error('Injected diagnostic tree failure');};
  let downstream=0,completed=0;f.events.on('setpieceDone',()=>downstream++);f.events.on('levelComplete',()=>completed++);
  assert.doesNotThrow(()=>assert.equal(f.controller.setpieceDone(),true));
  assert.equal(f.controller.state,'LEVEL_COMPLETE');assert.equal(f.controller.progress.finished,true);assert.equal(downstream,1);assert.equal(completed,1);
  f.root.getObjectByName=original;f.poll(250);
  const report=f.observer.report();assert.equal(report.observer.healthy,false);assert.equal(report.acceptance.observerHealthy,false);
  assert.ok(report.observer.failures.some((failure:any)=>failure.context==='event:setpieceDone'&&failure.message.includes('Injected diagnostic')));
  assert.equal(report.acceptance.fullCampaignAccepted,false);assert.equal(report.acceptance.allScenarioEvidence,false);
  assert.equal(report.acceptance.observedSceneMechanicsAll,false);
}));

test('a polling exception stays visibly invalid, keeps scheduling observations and cannot be erased by recovery or a new attempt',()=>withObserver(f=>{
  const panel=f.body.children.at(-1),status=panel.children[1],before=f.scheduled(),original=f.root.getObjectByName;
  panel.hidden=true;f.root.getObjectByName=()=>{throw new Error('Injected poll failure');};
  assert.doesNotThrow(()=>f.poll(250));assert.equal(f.scheduled(),before+1);assert.equal(panel.hidden,false);
  assert.match(status.textContent,/QA INVALID/);assert.match(status.textContent,/Injected poll failure/);
  f.root.getObjectByName=original;f.poll(500);assert.equal(f.scheduled(),before+2);assert.match(status.textContent,/QA INVALID/);
  f.events.emit('locationSet',{levelId:f.controller.activeLevel.id,destination:f.controller.activeLevel.destination});f.poll(750);
  const report=f.observer.report();assert.equal(report.observer.healthy,false);assert.equal(report.observer.failureCount,1);
  assert.equal(report.acceptance.fullCampaignAccepted,false);assert.match(status.textContent,/QA INVALID/);
}));

test('observer diagnostics remain bounded and permanently fail closed across attempts',()=>{
  const levels=loadLevels(),recorder=new CampaignQARecorder(levels,{mode:'full-campaign',layout:'desktop',environment:'Synthetic recorder failure accounting'},[],()=>10);
  recorder.begin(levels[0].id);for(let i=0;i<1000;i++)recorder.observerFailed('same poll',new Error('same failure'));
  assert.equal(recorder.report().observer.failures.length,1);assert.equal(recorder.report().observer.failures[0].occurrences,1000);
  for(let i=0;i<100;i++)recorder.observerFailed('distinct-'+i,new Error('distinct diagnostic'));
  recorder.begin(levels[1].id);const report=recorder.report();assert.equal(report.observer.failureCount,1100);assert.equal(report.observer.failures.length,64);
  assert.equal(report.acceptance.observerHealthy,false);assert.equal(report.acceptance.allScenarioEvidence,false);assert.equal(report.acceptance.fullCampaignAccepted,false);
});

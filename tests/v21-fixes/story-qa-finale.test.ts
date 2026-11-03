import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadLevels } from '../../src/delivery/content/levels';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { attachCampaignQA } from '../../src/delivery/qa/campaign-observer';
import type { Game } from '../../src/game/game';

/** Executes the actual passive observer against computed-style/hit-test fixture
 * data. This is accounting regression coverage, never native rendering, real
 * touch, likeness, phone performance or completed-campaign acceptance. */
function withFinaleObserver(run:(fixture:ReturnType<typeof prepare>)=>void){
  class Element {
    hidden=false;style:any={};textContent='';value='';id='';className='';
    attributes=new Map<string,string>();children:Element[]=[];parentElement:Element|null=null;
    bounds={left:0,top:0,right:1000,bottom:600,width:1000,height:600};
    get dataset(){return Object.fromEntries([...this.attributes].filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5),value]));}
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    getAttribute(name:string){return this.attributes.get(name)??null;}
    append(...children:Element[]){for(const child of children){child.parentElement=this;this.children.push(child);}}
    replaceChildren(...children:Element[]){this.children=[];this.append(...children);}
    contains(other:Element):boolean{return other===this||this.children.some(child=>child.contains(other));}
    addEventListener(){}removeEventListener(){}
    getBoundingClientRect(){return this.bounds;}
    matches(selector:string){
      if(selector==='[hidden]')return this.hidden;
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector==='[data-du="story-next"]')return this.getAttribute('data-du')==='story-next';
      if(selector==='.du-grand-opening')return this.className==='du-grand-opening';
      if(selector==='.du-completion[data-du="completion"][data-final="true"]')return this.className==='du-completion'&&this.getAttribute('data-du')==='completion'&&this.getAttribute('data-final')==='true';
      if(selector==='.du-overlay[data-du="overlay"][aria-modal="true"]')return this.className==='du-overlay'&&this.getAttribute('data-du')==='overlay'&&this.getAttribute('aria-modal')==='true';
      return false;
    }
    closest(selector:string):Element|null{return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  }
  const original=new Map<string,PropertyDescriptor|undefined>();
  const install=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});};
  const body=new Element(),hud=new Element(),delivery=new Element(),pause=new Element(),next=new Element(),map=new Element();
  const overlay=new Element(),sheet=new Element(),wrapper=new Element(),opening=new Element();
  pause.id='b-help';map.id='minimap';map.hidden=true;next.setAttribute('data-du','story-next');next.hidden=true;
  map.bounds={left:800,top:100,right:980,bottom:280,width:180,height:180};
  overlay.className='du-overlay';overlay.setAttribute('data-du','overlay');overlay.setAttribute('aria-modal','true');overlay.hidden=true;
  overlay.style.backgroundColor='rgb(23, 17, 37)';sheet.className='du-completion';sheet.setAttribute('data-du','completion');sheet.setAttribute('data-final','true');
  opening.className='du-grand-opening';opening.setAttribute('data-opening','closed');
  body.append(hud);hud.append(pause,map,delivery);delivery.append(next,overlay);overlay.append(sheet);sheet.append(wrapper);wrapper.append(opening);
  let frame:FrameRequestCallback|null=null,wall=0,controlAbove=false;
  const listeners=new Map<string,Set<(event:any)=>void>>();
  const query=(selector:string):Element|null=>{
    const find=(element:Element):Element|null=>element.matches(selector)?element:element.children.map(find).find(Boolean)??null;
    return find(body);
  };
  const document={body,documentElement:{clientWidth:1000,clientHeight:600},hidden:false,querySelector:query,
    getElementById:(id:string)=>query('#'+id),createElement:()=>new Element(),
    elementFromPoint:()=>controlAbove?map:overlay.hidden||!body.contains(overlay)?map:opening,
    addEventListener(name:string,fn:(event:any)=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);},
    removeEventListener(name:string,fn:(event:any)=>void){listeners.get(name)?.delete(fn);}};
  install('document',document);
  install('getComputedStyle',(element:Element)=>({display:'block',visibility:'visible',opacity:'1',filter:'none',mixBlendMode:'normal',backgroundColor:'rgba(0, 0, 0, 0)',...element.style}));
  install('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});install('cancelAnimationFrame',()=>{});
  install('performance',{now:()=>wall});install('addEventListener',()=>{});install('removeEventListener',()=>{});
  function prepare(){
    const levels=loadLevels(),level=levels.at(-1)!,events=new EventBus<DeliveryEvents>();
    const scene=new THREE.Scene(),root=new THREE.Group();root.name='delivery-setpiece';scene.add(root);
    const pizza=new THREE.Mesh(new THREE.BoxGeometry(1,.2,1),new THREE.MeshBasicMaterial());pizza.name='delivery-handoff-pizza';pizza.position.z=-10;root.add(pizza);
    const camera=new THREE.PerspectiveCamera(60,2,.1,100);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
    const story:any={controller:{levels,activeLevel:level,nextLevel:null,state:'SETPIECE',progress:{completedIds:[],nextLevel:null,finished:false}},
      module:{charactersReady:true,supports:[],status:{canDrop:false,instruction:'',actionLabel:''}},director:{phase:'playing'},cinematic:true};
    const game:any={story,deliveryEvents:events,engine:{scene,camera},t:0,paused:false,choosing:false,relocating:false,
      railContacts:{supportId:null},city:{movingRail:[]},metro:{stationDwells:[]},
      player:{pos:new THREE.Vector3(0,.55,0),yaw:0,speed:0,vy:0,placementRevision:1,flying:false,descending:false,jumping:false,onRoad:false,lastKind:'ground'}};
    const observer=attachCampaignQA(game as Game,{full:true,touch:false});
    events.emit('locationSet',{levelId:level.id,destination:level.destination});
    const poll=(at:number)=>{wall=at;game.t=at/1000;frame?.(at);};
    const complete=()=>{
      story.controller.state='REVEAL';events.emit('setpieceDone',{levelId:level.id});
      story.controller.state='LEVEL_COMPLETE';story.controller.progress.finished=true;story.controller.progress.completedIds=levels.map(level=>level.id);
      story.director.phase='viewing';next.hidden=false;
      events.emit('levelComplete',{levelId:level.id,level:level.level,total:levels.length,restaurantStage:levels.length,finished:true});
      poll(1000);poll(2100);
      assert.ok(observer.report().attempts[0].facts.includes('story-viewing-hold'));
    };
    return {observer,game,story,complete,poll,map,opening,overlay,sheet,wrapper,document,
      clickNext(){listeners.get('click')?.forEach(fn=>fn({target:next,isTrusted:true}));assert.ok(observer.report().attempts[0].facts.includes('final-next-requested'));},
      showOpening(phase='closed'){overlay.hidden=false;map.hidden=false;next.hidden=true;opening.setAttribute('data-opening',phase);},
      controlAbove(){controlAbove=true;},
      dispose(){observer.dispose();pizza.geometry.dispose();pizza.material.dispose();}};
  }
  let fixture:ReturnType<typeof prepare>|null=null;
  try{fixture=prepare();run(fixture);}finally{
    fixture?.dispose();for(const[name,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete(globalThis as any)[name];
  }
}

test('the actual observer excludes only the opaque final presentation covering underlying controls, through all opening phases',()=>withFinaleObserver(f=>{
  f.complete();f.clickNext();
  for(const[step,phase]of ['closed','lights','doors','open'].entries()){f.showOpening(phase);f.poll(2350+step*250);}
  const attempt=f.observer.report().attempts[0];
  assert.equal(attempt.facts.includes('story-controls-visible'),false,'controls behind the actual opaque final overlay are not gameplay visible');
  assert.equal(attempt.facts.includes('final-opening'),false,'covering HUD is not ceremony exposure or acceptance');
}));

for(const[caseName,alter]of [
  ['hidden opening',(f:any)=>f.opening.hidden=true],
  ['hidden completion ancestor',(f:any)=>f.sheet.hidden=true],
  ['detached final overlay',(f:any)=>f.overlay.remove()],
  ['translucent overlay',(f:any)=>f.overlay.style.backgroundColor='rgba(23, 17, 37, 0.8)'],
  ['transparent ancestor',(f:any)=>f.wrapper.style.opacity='.7'],
  ['undersized overlay',(f:any)=>f.overlay.bounds={left:0,top:0,right:900,bottom:600,width:900,height:600}],
  ['arbitrary modal',(f:any)=>f.overlay.className='unrelated-modal'],
  ['nonfinal completion',(f:any)=>f.sheet.setAttribute('data-final','false')],
  ['control painted above overlay',(f:any)=>f.controlAbove()],
  ['invalid opening phase',(f:any)=>f.opening.setAttribute('data-opening','unrelated')],
]as const)test(`a ${caseName} cannot conceal genuine story HUD overlap from QA`,()=>withFinaleObserver(f=>{
  f.complete();f.clickNext();f.showOpening();alter(f);f.poll(2350);
  assert.ok(f.observer.report().attempts[0].facts.includes('story-controls-visible'));
}));

test('an actual opaque final overlay cannot excuse HUD overlap while the physical story is playing',()=>withFinaleObserver(f=>{
  f.showOpening();f.poll(250);
  assert.ok(f.observer.report().attempts[0].facts.includes('story-controls-visible'));
}));

test('an actual opaque final overlay cannot excuse retained-view HUD overlap before trusted final Next',()=>withFinaleObserver(f=>{
  f.complete();f.showOpening();f.poll(2350);
  assert.ok(f.observer.report().attempts[0].facts.includes('story-controls-visible'));
  assert.equal(f.observer.report().attempts[0].facts.includes('final-next-requested'),false);
}));

test('the narrow overlay exception preserves continuous visible-open ceremony exposure gates',()=>withFinaleObserver(f=>{
  f.complete();f.clickNext();f.showOpening('closed');
  for(let time=2350;time<=4850;time+=250)f.poll(time);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'),false,'a closed but opaque presentation is not an open ceremony');
  f.showOpening('open');
  for(let time=5100;time<=7100;time+=250)f.poll(time);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'),false,'continuous visible-open exposure remains required');
  f.poll(7350);
  const attempt=f.observer.report().attempts[0];
  assert.ok(attempt.facts.includes('final-opening'));
  assert.equal(attempt.facts.includes('story-controls-visible'),false);
}));

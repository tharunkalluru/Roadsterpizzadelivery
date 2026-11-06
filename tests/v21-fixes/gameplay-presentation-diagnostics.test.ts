import test from 'node:test';
import assert from 'node:assert/strict';
import type { Game } from '../../src/game/game';
import { gameplayPresentationDiagnostics,gameplayPresentationSnapshot } from '../../src/delivery/qa/performance-observer';

function fixture(run:(world:{game:Game;hudClasses:Set<string>;htmlClasses:Set<string>;map:{hidden:boolean};camera:any;styleReads:()=>number;rectReads:()=>number})=>void){
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),previousStyle=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle');
  const hudClasses=new Set<string>(),htmlClasses=new Set(['solid-ui','is-touch']),map={hidden:true};let styles=0,rects=0;
  const rect={x:0,y:0,width:891,height:411,top:0,right:891,bottom:411,left:0};
  const element=(selector:string)=>({selector,getBoundingClientRect(){rects++;return rect;}});
  const elements=new Map(['#game','#game canvas','#hud'].map(s=>[s,element(s)]));
  const camera={position:{toArray:()=>[1,2,3]},quaternion:{toArray:()=>[0,0,0,1]},aspect:891/411,near:.3,far:2500,projectionMatrix:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}};
  const canvas={width:1559,height:719,style:{width:'891px',height:'411px'}};
  const game={hud:{root:{className:'compact-map',classList:{contains:(n:string)=>hudClasses.has(n)},querySelectorAll:()=>[map]}},engine:{camera,renderer:{domElement:canvas,info:{render:{calls:903}},getContext:()=>({isContextLost:()=>false})}}} as unknown as Game;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{className:'solid-ui is-touch',classList:{contains:(n:string)=>htmlClasses.has(n)}},hidden:false,hasFocus:()=>true,querySelector:(s:string)=>elements.get(s)}});
  Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:(el:{selector:string})=>{styles++;return {display:'block',visibility:el.selector==='#game'?'hidden':'visible',opacity:'1',backgroundColor:'rgba(0, 0, 0, 0)',zIndex:el.selector==='#hud'?'5':'auto'};}});
  try{run({game,hudClasses,htmlClasses,map,camera,styleReads:()=>styles,rectReads:()=>rects});}
  finally{if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else Reflect.deleteProperty(globalThis,'document');if(previousStyle)Object.defineProperty(globalThis,'getComputedStyle',previousStyle);else Reflect.deleteProperty(globalThis,'getComputedStyle');}
}

test('live paint diagnostics distinguish logical blockers without forcing layout or computed style',()=>fixture(({game,hudClasses,htmlClasses,map,styleReads,rectReads})=>{
  const clear=gameplayPresentationDiagnostics(game);assert.equal(clear.worldPaintBlocked,false);assert.deepEqual(clear.blockers,[]);assert.equal(clear.renderCalls,903);assert.equal(clear.camera.poseFinite,true);
  hudClasses.add('has-tip');htmlClasses.add('ui-blocks-world');map.hidden=false;
  const blocked=gameplayPresentationDiagnostics(game);assert.equal(blocked.worldPaintBlocked,true);assert.deepEqual(blocked.blockers,['has-tip','map-open']);assert.equal(styleReads(),0);assert.equal(rectReads(),0);
  assert.deepEqual([...hudClasses],['has-tip'],'readout never changes a gate to make rendering pass');
}));

test('explicit presentation export can expose a CSS-hidden canvas even when logical gates are clear',()=>fixture(({game,styleReads,rectReads})=>{
  const report=gameplayPresentationSnapshot(game);assert.equal(report.worldPaintBlocked,false);assert.equal(report.blockers.length,0);
  const world=report.elements.find(el=>el.selector==='#game');assert.ok(world&&'style'in world);assert.equal(world.style?.visibility,'hidden');assert.equal(world.rect?.width,891);
  assert.equal(styleReads(),3);assert.equal(rectReads(),3);
}));

test('camera diagnostics flag non-finite pose and projection instead of silently serializing an apparently valid view',()=>fixture(({game,camera})=>{
  camera.position.toArray=()=>[NaN,2,3];camera.projectionMatrix.elements[4]=Infinity;
  const report=gameplayPresentationDiagnostics(game);assert.equal(report.camera.poseFinite,false);assert.equal(report.camera.projectionFinite,false);assert.equal(report.contextLost,false);
}));

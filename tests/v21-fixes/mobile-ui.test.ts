import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobileHudLayout } from '../../src/ui/hud-layout';
import { Hud, orderOfferHtml } from '../../src/ui/hud';
import { settingsHtml, pauseMenuHtml, type Settings } from '../../src/ui/settings';
import { goFullscreen, exitFullscreen, canFullscreen, fullscreenFallbackHtml } from '../../src/ui/title';

const overlaps = (a: any, b: any) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
test('raised arrows and paired jump/brake and fly/go preserve usable, separate touch targets', () => {
  for (const [width,height,left,right,bottom] of [[568,320,18,18,18],[640,280,18,18,18],[640,360,18,18,18],[800,360,18,18,34],[844,390,59,59,21],[915,412,18,18,18],[1280,720,18,18,18]]) {
    const l = mobileHudLayout(width,height,62,106,left,right,bottom);
    assert.equal(l.jump.left,l.brake.left); assert.equal(l.jump.width,l.brake.width);
    assert.equal(l.fly.left,l.gas.left); assert.equal(l.fly.width,l.gas.width); assert.equal(l.jump.top,l.fly.top);
    assert.ok(l.jump.top + l.jump.height < l.brake.top);
    assert.ok(l.rightSteer.left-l.leftSteer.left-l.leftSteer.width>=24);
    assert.ok(l.leftSteer.left>left); assert.ok(Math.abs(l.leftSteer.top+l.leftSteer.height/2-l.fly.top-l.fly.height/2)<=1);
    assert.ok(l.context.width>=120,`${width}: collection hold has enough width`);
    assert.equal(l.brake.height,l.gas.height); assert.equal(l.brake.width,l.oldBrake*1.5);
    const names = ['leftSteer','rightSteer','brake','gas','fly','jump','speed','map','context'] as const;
    for (const name of names) { const r=l[name]; assert.ok(r.width>0 && r.left>=left && r.top>=0 && r.left+r.width<=width-right+1 && r.top+r.height<=height-bottom+1,`${width}x${height}: ${name} stays in safe bounds`); }
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.equal(overlaps(l[names[i]],l[names[j]]),false,`${width}x${height}: ${names[i]} / ${names[j]}`);
  }
});
test('settings owns its top Done button and pause has a simple hierarchy without replay tips', () => {
  const s:Settings={quality:'auto',sound:true,steer:'stick',tips:true};
  const html=settingsHtml(s,true),pause=pauseMenuHtml();
  assert.match(html,/^<header class="sheet-header">.*id="set-done">Done<\/button><\/header>/);
  assert.equal((html.match(/id="set-done"/g)||[]).length,1);
  assert.match(pause,/id="resume">Resume driving/);assert.match(pause,/class="pause-grid"/);
  for(const id of ['settings','area','unstick','reset'])assert.match(pause,new RegExp(`id="${id}"`));
  assert.doesNotMatch(pause,/Replay|id="tut"/);
});
test('persistent order banner is removed while dispatch and contextual interactions remain', () => {
  const hudSource=readFileSync('src/ui/hud.ts','utf8');
  assert.doesNotMatch(hudSource,/<(?:section|div)[^>]+id="order"/);
  assert.match(hudSource,/<button[^>]+id="b-full"[^>]+aria-label="Full screen options">/);
  assert.doesNotMatch(hudSource,/<button[^>]+id="b-full"[^>]+hidden/);
  assert.match(hudSource,/<div class="flight-navigation"/);
  assert.doesNotThrow(()=>Hud.prototype.order.call({}, {state:'Pickup',title:'Kitchen',sub:'Street',dist:'100 m',time:'',meters:false}));
  const offer=orderOfferHtml({level:1,pickupName:'Kitchen',pickupRoad:'Road',customerName:'Customer',approachMetres:100,deliveryMetres:200,deliverySeconds:80,basePay:100});
  assert.match(offer,/New delivery/);assert.match(offer,/Kitchen/);assert.match(offer,/Customer/);
  let action:string|null=null;
  const classes={contains:()=>false,toggle:()=>{}};
  const element=()=>({hidden:true,classList:classes,style:{setProperty:()=>{}},setAttribute:()=>{}});
  const el:any={prompt:element(),'t-act':element(),ring:element()};
  const fixture:any={el,root:{classList:classes},contextAction:null,releaseAction:()=>{},set:(id:string,value:string)=>{if(id==='action-title')action=value;}};
  Hud.prototype.prompt.call(fixture,'Hold to collect',.5,'collect');assert.equal(action,'Collect pizza');assert.equal(el['t-act'].hidden,false);
  Hud.prototype.prompt.call(fixture,'Hold to hand over',.5,'handover');assert.equal(action,'Hand over pizza');assert.equal(el['t-act'].hidden,false);
});
test('fullscreen returns actual API state and never claims unsupported or denied requests succeeded',async()=>{
  const previousDocument=(globalThis as any).document,previousScreen=(globalThis as any).screen;
  try {
    let requests=0,locks=0;
    const doc:any={documentElement:{},fullscreenElement:null};
    (globalThis as any).document=doc;(globalThis as any).screen={orientation:{lock:async()=>{locks++;}}};
    assert.equal(canFullscreen(),false);assert.equal(await goFullscreen(),false);assert.equal(locks,1);
    doc.documentElement.requestFullscreen=async()=>{requests++;throw Error('Denied');};
    assert.equal(canFullscreen(),true);assert.equal(await goFullscreen(),false);assert.equal(requests,1);
    doc.documentElement.requestFullscreen=async()=>{requests++;doc.fullscreenElement=doc.documentElement;};
    assert.equal(await goFullscreen(),true);assert.equal(requests,2);assert.equal(await goFullscreen(),true);assert.equal(requests,2);
    doc.exitFullscreen=async()=>{doc.fullscreenElement=null;};await exitFullscreen();assert.equal(doc.fullscreenElement,null);
    delete doc.documentElement.requestFullscreen;doc.documentElement.webkitRequestFullscreen=()=>{doc.webkitFullscreenElement=doc.documentElement;};
    assert.equal(await goFullscreen(),true);
    doc.webkitExitFullscreen=async()=>{throw Error('Browser closed it already');};delete doc.exitFullscreen;await assert.doesNotReject(exitFullscreen());
  } finally {(globalThis as any).document=previousDocument;(globalThis as any).screen=previousScreen;}
});
test('iPhone fullscreen fallback gives honest Home Screen and landscape guidance',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'iPhone Safari',platform:'iPhone',maxTouchPoints:5}});
    const html=fullscreenFallbackHtml();assert.match(html,/does not allow/);assert.match(html,/Add to Home Screen/);assert.match(html,/sideways/);assert.match(html,/depends on your iOS version/);assert.match(html,/id="fullscreen-done"/);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Android Chrome',platform:'Linux',maxTouchPoints:5}});
    assert.match(fullscreenFallbackHtml(),/not available or the browser declined/);assert.doesNotMatch(fullscreenFallbackHtml(),/iOS version/);
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete(globalThis as any).navigator;}
});

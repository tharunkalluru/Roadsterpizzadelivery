// DOM state contracts only; real phone compositing still needs browser evidence.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=await mkdtemp(join(tmpdir(),'roadster-v21-paint-'));
const keys=['document','window','navigator','MutationObserver','screen'],saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
class Element {
  hidden=false;inert=false;id='';textContent='';children=[];attributes=new Map();events=new Map();parent=null;classes=new Set();
  classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),contains:name=>this.classes.has(name),toggle:(name,force)=>{const on=force??!this.classes.has(name);on?this.classes.add(name):this.classes.delete(name);return on;}};
  setAttribute(name,value){this.attributes.set(name,value);}getAttribute(name){return this.attributes.get(name)??null;}
  querySelectorAll(selector){return selector==='.fmap'?this.children:this.children.filter(c=>c.attributes.has('data-load-step'));}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}appendChild(child){this.append(child);return child;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}focus(){document.activeElement=this;}
  addEventListener(name,listener){this.events.set(name,listener);}click(){this.events.get('click')?.();}
}
let checks=0;const test=async(label,run)=>{await run();checks++;console.log(`PASS ${label}`);};
try {
  await build({stdin:{contents:"export * from './src/ui/loading';export * from './src/ui/paint-safety';",resolveDir:root,loader:'ts'},outfile:join(out,'production.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
  const {showLoading,hideLoading,loadingRetry,installPaintSafety,worldPaintBlocked,guardWorldPaint,paintDiagnostics,graphicsDiagnostics}=await import(pathToFileURL(join(out,'production.mjs')));
  const html=new Element(),head=new Element(),hud=new Element(),loading=new Element(),status=new Element(),actions=new Element();
  const all=new Map([['hud',hud],['loading',loading],['loading-status',status],['loading-actions',actions]]);
  for(let i=0;i<4;i++){const step=new Element();step.setAttribute('data-load-step',String(i));loading.append(step);}
  Object.defineProperties(globalThis,{
    document:{configurable:true,value:{documentElement:html,head,activeElement:null,fullscreenElement:null,getElementById:id=>all.get(id)||head.children.find(c=>c.id===id)||null,createElement:()=>new Element()}},
    window:{configurable:true,value:{visualViewport:{width:850,height:380,scale:1,offsetLeft:0,offsetTop:0}}},navigator:{configurable:true,value:{userAgent:'fixture'}},screen:{configurable:true,value:{orientation:{type:'landscape-primary'}}},
  });
  await test('staged loading keeps the partial world covered until explicit ready release',()=>{
    showLoading('Fonts','fonts');assert.equal(loading.hidden,false);assert.equal(loading.getAttribute('aria-busy'),'true');assert.equal(hud.inert,true);assert.equal(html.classList.contains('game-loading'),true);
    showLoading('View','view');assert.equal(status.textContent,'View');assert.deepEqual(loading.children.map(c=>c.getAttribute('data-state')),['done','done','done','current']);
    hideLoading();assert.equal(loading.hidden,true);assert.equal(hud.inert,false);assert.equal(html.classList.contains('game-loading'),false);
  });
  await test('failed loading retains its cover and waits for an explicit retry gesture',async()=>{
    let resolved=false;const retry=loadingRetry('Network unavailable').then(()=>{resolved=true;});await Promise.resolve();
    assert.equal(resolved,false);assert.equal(loading.hidden,false);assert.equal(loading.getAttribute('data-state'),'error');assert.equal(hud.inert,true);assert.equal(actions.children.length,1);assert.equal(document.activeElement,actions.children[0]);
    actions.children[0].click();await retry;assert.equal(resolved,true);assert.equal(actions.children.length,0);assert.equal(loading.hidden,false,'Retry is not a render-ready release');hideLoading();
  });
  await test('opaque touch paint is installed once and overlay state consistently hides the world',()=>{
    let callback=()=>{},observed;globalThis.MutationObserver=class{constructor(run){callback=run;}observe(root,options){observed={root,options};}};
    installPaintSafety(true);installPaintSafety(true);assert.equal(html.classList.contains('solid-ui'),true);assert.equal(head.children.filter(c=>c.id==='ui-paint-safety').length,1);
    guardWorldPaint(hud);assert.equal(worldPaintBlocked(hud),false);assert.equal(observed.root,hud);assert.deepEqual(observed.options.attributeFilter,['class','hidden']);
    for(const name of ['title-open','area-picker-open','has-modal','has-tip','rotation-blocked']){hud.classList.add(name);callback();assert.equal(worldPaintBlocked(hud),true);assert.equal(html.classList.contains('ui-blocks-world'),true);hud.classList.remove(name);callback();assert.equal(html.classList.contains('ui-blocks-world'),false);}
    const map=new Element();hud.append(map);callback();assert.equal(html.classList.contains('ui-blocks-world'),true);map.hidden=true;callback();assert.equal(html.classList.contains('ui-blocks-world'),false);
    assert.equal(paintDiagnostics().mode,'opaque-touch');assert.equal(paintDiagnostics().orientation,'landscape-primary');assert.deepEqual(graphicsDiagnostics(null),{unavailable:true});
  });
  console.log(`${checks} Version21 loading and paint-state regressions passed.`);
} finally {
  for(const key of keys){const original=saved.get(key);original?Object.defineProperty(globalThis,key,original):delete globalThis[key];}
  await rm(out,{recursive:true,force:true});
}

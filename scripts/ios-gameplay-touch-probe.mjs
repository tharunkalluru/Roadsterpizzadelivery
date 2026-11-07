const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
const p=await b.newPage({viewport:{width:1100,height:650},hasTouch:true,isMobile:true,userAgent:process.env.TEST_USER_AGENT || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
const result={engine:'Desktop Chromium CDP touch; NOT physical Safari or Android',userAgentOverride:process.env.TEST_USER_AGENT || 'iPhone Safari UA',checks:[]};
try{
await p.goto((process.env.GAME_URL || 'http://127.0.0.1:4403/')+'?qaDelivery=1&qaTouch=1&q=low&qaTouchDiagnostics=1');
await p.waitForFunction(()=>!!window.__game && !!document.querySelector('#t-gas'),null,{timeout:120000});
await p.waitForTimeout(3000);
for(const name of ['Hide QA controls','Hide (F4 restores)','Play']){const x=p.getByRole('button',{name,exact:true});if(await x.isVisible())await x.click();}
const c=await p.context().newCDPSession(p);
const point=async(id,n)=>{const r=await p.locator('#'+id).boundingBox();assert.ok(r);return{x:r.x+r.width/2,y:r.y+r.height/2,id:n};};
const go=await point('t-gas',1),left=await point('t-left',2),right=await point('t-right',2);
const touch=(type,points)=>c.send('Input.dispatchTouchEvent',{type,touchPoints:points});
await touch('touchStart',[go]);await p.waitForTimeout(30000);
assert.equal(await p.locator('#t-gas').getAttribute('aria-pressed'),'true');result.checks.push('GO held 30 seconds');
for(const mode of ['left','right','alternating']){
for(let i=0;i<50;i++){const s=mode==='left'?left:mode==='right'?right:i%2?left:right;await touch('touchStart',[go,s]);await touch('touchEnd',[s]);}
assert.equal(await p.locator('#t-gas').getAttribute('aria-pressed'),'true');result.checks.push(mode+' 50 taps retains GO');}
await touch('touchStart',[go,left]);await touch('touchEnd',[go]);assert.equal(await p.locator('#t-left').getAttribute('aria-pressed'),'true');result.checks.push('GO release retains steering');await touch('touchEnd',[]);
for(const id of ['t-brake','t-fly','t-jump']){await touch('touchStart',[go]);const action=await point(id,2);await touch('touchStart',[go,action]);await touch('touchEnd',[action]);assert.equal(await p.locator('#t-gas').getAttribute('aria-pressed'),'true');await touch('touchEnd',[]);result.checks.push('GO + '+id);}
result.viewport=await p.evaluate(()=>({scale:visualViewport.scale,width:visualViewport.width,height:visualViewport.height,diagnostics:window.__touchDiagnostics.records}));assert.equal(result.viewport.scale,1);
await p.setViewportSize({width:650,height:1100});await p.waitForTimeout(300);
await p.setViewportSize({width:1100,height:650});await p.waitForTimeout(500);
result.layout=await p.evaluate(()=>{const c=document.querySelector('#game canvas').getBoundingClientRect(),h=document.querySelector('#hud').getBoundingClientRect();return {canvas:[c.width,c.height],hud:[h.width,h.height],scale:visualViewport.scale};});
assert.deepEqual(result.layout.canvas,result.layout.hud);assert.equal(result.layout.scale,1);result.checks.push('orientation roundtrip aligns HUD and canvas');
await p.screenshot({path:'/tmp/roadster-ios-touch.png'});result.ok=true;
}catch(e){result.diagnostic=await p.evaluate(()=>({log:window.__touchDiagnostics?.records,modal:window.__game?.hud?.modalOpen}));result.error=String(e);process.exitCode=1;}finally{await writeFile('/tmp/roadster-ios-touch.json',JSON.stringify(result,null,2));await b.close();console.log(JSON.stringify({ok:result.ok,checks:result.checks,error:result.error}));}

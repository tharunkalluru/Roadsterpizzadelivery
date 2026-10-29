// Sequential, same-browser production-build observations. No application source transforms.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const cli = '/Users/tharun/.codex/skills/playwright/scripts/playwright_cli.sh';
const stamp = new Date().toISOString().replaceAll(':', '-');
const out = `output/playwright/ab-${stamp}`;
mkdirSync(out, { recursive: true });
const session = 'roadster-ab';
const run = async args => (await exec(cli, [`-s=${session}`, ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 210000 })).stdout;
function callback(config) {
  return `async(page)=> {
    const cfg=${JSON.stringify(config)}, errors=[], warnings=[];
    const onError=e=>errors.push(String(e)), onConsole=m=>{if(m.type()==='error')errors.push(m.text());if(m.type()==='warning')warnings.push(m.text());};
    page.on('pageerror',onError);page.on('console',onConsole);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    await page.setViewportSize({width:1280,height:592});
    await page.addInitScript(()=>{
      localStorage.setItem('p2ph-settings-v1',JSON.stringify({quality:'low',sound:false,steer:'stick',tips:false,targetFPS:60,adaptiveResolution:false}));
      localStorage.setItem('p2ph-tutorial-v1','1');
      localStorage.setItem('p2ph-save-v1',JSON.stringify({coins:500,level:0,doneInLevel:0,day:1,minutes:480,total:1,acceptingOrders:false}));
    });
    const prefix=cfg.variant==='baseline'?'http://127.0.0.1:4201/':'http://127.0.0.1:4199/';
    const query=cfg.kind==='static'?'?still=1&cam=30,6,40,0,2,-60&w=1280&h=592&r=650&mood=day':'?area=RTC%20X%20Roads&q=low&perf=1';
    try{
      await page.goto(prefix+query);
      await page.waitForFunction(kind=>kind==='static'?window.__done===true:!!window.__game&&!window.__game.relocating&&!document.documentElement.classList.contains('game-loading'),cfg.kind,{timeout:90000});
      await page.waitForTimeout(1200);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cfg.cpu});
      await page.evaluate(cfg=>{
        const game=window.__game, engine=cfg.kind==='static'?window.__engine:game.engine, world=window.__world||game.city;
        const test={cfg,startedAt:new Date().toISOString(),start:performance.now(),calls:[],frames:[],longTasks:[],samples:[],lastRender:0,done:false,visibility:[{at:0,state:document.visibilityState}]};
        const state=()=>({position:game?{...game.player.pos}:null,speed:game?.player.speed,simTime:game?.t,area:game?.area?.name,order:game?.order?.state,accepting:game?.acceptingOrders,autopilot:game?.autopilot,paused:game?.paused,tip:game?.hud.tipOpen,modal:game?.hud.modalOpen,
          tiles:[...world.tiles.keys()].sort(),pending:world.pending.size,staged:world.staged?.size,render:{...engine.renderer.info.render},memory:{...engine.renderer.info.memory},heap:performance.memory?.usedJSHeapSize,stream:world.streamStats?{...world.streamStats}:null,refresh:game?.refreshPolicy?.snapshot(),camera:{position:{...engine.camera.position},fov:engine.camera.fov},lowQ:engine.opts.lowQ,drawBuffer:[engine.renderer.domElement.width,engine.renderer.domElement.height],dpr:devicePixelRatio,fonts:document.fonts.status});
        test.before=state();
        const render=engine.render, frame=game?.frame;
        engine.render=function(...args){const start=performance.now(),before=this.renderer.info.render.frame;const result=render.apply(this,args),end=performance.now();if(this.renderer.info.render.frame!==before){if(start-test.start>=cfg.warmMs&&start-test.start<cfg.warmMs+cfg.measureMs){test.calls.push({at:start-test.start,cpuMs:end-start,interval:test.lastRender?start-test.lastRender:null,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles});}test.lastRender=start;}return result;};
        if(game)game.frame=function(...args){const start=performance.now();try{return frame.apply(this,args);}finally{const end=performance.now();if(start-test.start>=cfg.warmMs&&start-test.start<cfg.warmMs+cfg.measureMs)test.frames.push({at:start-test.start,cpuMs:end-start});}};
        const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.startTime-test.start>=cfg.warmMs&&e.startTime-test.start<cfg.warmMs+cfg.measureMs)test.longTasks.push({at:e.startTime-test.start,duration:e.duration});});
        try{observer.observe({type:'longtask',buffered:false});}catch{}
        const visibility=()=>test.visibility.push({at:performance.now()-test.start,state:document.visibilityState});document.addEventListener('visibilitychange',visibility);
        let raf=0;
        const loop=()=>{if(!test.done){if(cfg.kind==='static')engine.render(true);raf=requestAnimationFrame(loop);}};
        if(cfg.kind==='static')raf=requestAnimationFrame(loop);
        const sampler=setInterval(()=>test.samples.push({at:performance.now()-test.start,...state()}),5000);
        test.stop=()=>{if(test.done)return;test.done=true;test.endedAt=new Date().toISOString();test.elapsed=performance.now()-test.start;cancelAnimationFrame(raf);clearInterval(sampler);observer.disconnect();document.removeEventListener('visibilitychange',visibility);engine.render=render;if(game)game.frame=frame;test.after=state();};
        test.timeout=setTimeout(test.stop,cfg.warmMs+cfg.measureMs+100);window.__ab=test;
      },cfg);
      await page.waitForFunction(()=>window.__ab?.done,null,{timeout:cfg.warmMs+cfg.measureMs+15000});
      await page.screenshot({path:cfg.shot});
      const result=await page.evaluate(()=>{const {stop,timeout,...data}=window.__ab;return data;});
      const buffers=await cdp.send('Performance.getMetrics').catch(()=>null);
      return {...result,errors,warnings,cdpMetrics:buffers?.metrics||null,url:page.url(),bundle:await page.locator('script[type=module]').evaluateAll(xs=>xs.map(x=>x.src)),userAgent:await page.evaluate(()=>navigator.userAgent)};
    }finally{
      await page.evaluate(()=>window.__ab?.stop?.()).catch(()=>{});
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();
      page.off('pageerror',onError);page.off('console',onConsole);
    }
  }`;
}
const kinds = process.argv.includes('--full-only') ? ['idle-game'] : process.argv.includes('--static-only') ? ['static'] : ['static', 'idle-game'];
const configs=[];
for(const kind of kinds)for(let pair=1;pair<=3;pair++)for(const variant of(pair%2?['baseline','candidate']:['candidate','baseline']))configs.push({kind,pair,variant,cpu:4.04,warmMs:kind==='static'?15000:25000,measureMs:kind==='static'?45000:90000});
writeFileSync(`${out}/manifest.json`,JSON.stringify({createdAt:new Date().toISOString(),configs,scope:'Static High renderer at real RAF, then live stationary Low Game, with matching fixture save and no input. No deterministic Game/traffic replay, driving, phone, thermal or battery claims.',baselineCommit:'bd7313d6d20cb3f6a448bedb2e52bccd269b1bba',candidateSource:'200af62af70dc4b682d601e11ff51db04d2f67d9',fixturesAreNotCompletedDeliveries:true},null,2)+'\n');
for(const cfg of configs){
  const id=`${cfg.kind}-${cfg.pair}-${cfg.variant}`;cfg.shot=`${out}/${id}.png`;
  const code=callback(cfg);writeFileSync(`${out}/${id}.callback.js`,code);
  console.log(JSON.stringify({event:'starting',id,at:new Date().toISOString(),out}));
  const raw=await run(['run-code',code]);writeFileSync(`${out}/${id}.cli.txt`,raw);
  const match=raw.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);if(!match)throw new Error(`Missing result ${id}: ${raw.slice(0,1000)}`);
  const result=JSON.parse(match[1]);result.harnessSha256=createHash('sha256').update(code).digest('hex');
  writeFileSync(`${out}/${id}.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({event:'finished',id,at:new Date().toISOString(),renders:result.calls?.length,errors:result.errors,position:result.after?.position}));
}
console.log(JSON.stringify({event:'complete',out}));

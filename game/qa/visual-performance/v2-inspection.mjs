import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL(`../../output/visual-performance/${process.argv[2] ?? 'v2-after'}/`, import.meta.url);
const config = JSON.parse(await readFile(new URL('../../config/provisional-preview.json', import.meta.url)));
await mkdir(output, {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const context = await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  await context.addInitScript(id=>localStorage.setItem(`hmd.provisional.${id}.settings`,JSON.stringify({schema:1,data:{quality:'low',practiceDone:true,musicVolume:0,sfxVolume:0,uiVolume:0}})),config.zone.id);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5486/preview.html?debug&manualclock');
  await page.locator('[data-preview-start]').tap();
  await page.waitForFunction(()=>window.__hmd?.state==='MENU');
  await page.locator('[data-play]').tap();await page.locator('[data-m]').first().tap();await page.locator('[data-go]').tap();
  await page.waitForFunction(()=>window.__hmd?.state==='READY');await page.locator('[data-start]').tap();
  await page.waitForFunction(()=>window.__hmd?.state==='PLAYING');
  await page.evaluate(()=>{const a=window.__hmd;a.debugAdvance(30);a.debug=false;document.querySelector('.debug').classList.add('hidden');});
  await page.waitForTimeout(300);
  const visible=()=>page.locator('.world-label:not([hidden])').count();
  if(await visible())throw Error('Passive view displayed a helper');
  for(const width of [568,667,844]) {
    await page.setViewportSize({width,height:width===568?320:390});await page.waitForTimeout(250);
    await page.screenshot({path:new URL(`clean-phone-${width}.png`,output).pathname});
  }
  await page.mouse.move(430,190);await page.mouse.down();await page.mouse.move(330,190,{steps:5});
  await page.waitForTimeout(80);await page.mouse.up();await page.waitForTimeout(450);
  await page.mouse.down();await page.waitForTimeout(100);await page.mouse.up();
  const afterInterruptedHolds=await visible();
  if(afterInterruptedHolds)throw Error('Two short holds accumulated into inspection');
  await page.waitForTimeout(100);
  await page.mouse.down();await page.waitForTimeout(700);
  const inspected=await page.evaluate(()=>{
    const reserved=[...document.querySelectorAll('.hud-top,[data-steer],.rbtns,.flightmeter,[data-interact],.hold,.pilot-zone-label')].map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height);
    const labels=[...document.querySelectorAll('.world-label:not([hidden])')].map(n=>{
      const r=n.getBoundingClientRect(),name=n.querySelector('.world-label__name'),range=document.createRange();range.selectNodeContents(name);
      const textRects=[...range.getClientRects()].map(rect=>rect.toJSON());
      return {text:n.textContent,rect:r.toJSON(),textRects,
        fullTextFits:name.scrollWidth<=name.clientWidth+1&&name.scrollHeight<=name.clientHeight+1&&textRects.every(t=>t.left>=r.left&&t.right<=r.right&&t.top>=r.top&&t.bottom<=r.bottom),
        roadside:r.right<=innerWidth*.34||r.left>=innerWidth*.66,
        avoidsHUD:reserved.every(t=>r.right<=t.left||r.left>=t.right||r.bottom<=t.top||r.top>=t.bottom)};
    });
    return {speed:window.__hmd.session.player.speed,labels,stats:{...window.__hmd.view.worldLabels.stats}};
  });
  if(inspected.labels.length!==1)throw Error('Held inspection did not reveal one roadside name: '+JSON.stringify(inspected));
  if(inspected.labels.some(l=>!l.fullTextFits||!l.roadside||!l.avoidsHUD||l.rect.height>60))throw Error('Full parked name was clipped or obstructed the road/HUD: '+JSON.stringify(inspected));
  await page.screenshot({path:new URL('parked-inspection.png',output).pathname});
  await page.mouse.up();await page.waitForTimeout(1700);
  const afterLinger=await visible();if(afterLinger)throw Error('Reading linger did not expire');
  const result={at:new Date().toISOString(),normalSpawn:true,teleports:false,afterInterruptedHolds,inspected,afterLinger,pageErrors:errors};
  await writeFile(new URL('inspection.json',output),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}

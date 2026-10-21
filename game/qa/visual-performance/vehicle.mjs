import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out=new URL('../../output/visual-performance/after/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
  for(const view of ['front','rear','flight']){
    const page=await browser.newPage({viewport:{width:1100,height:720},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:5486/qa/visual-performance/vehicle.html?view=${view}&quality=low`);
    await page.waitForFunction(()=>window.__vehicleQa);await page.waitForTimeout(1200);
    const result=await page.evaluate(()=>{const a=window.__vehicleQa,u=a.hero.root.userData;return{mode:a.mode,quality:a.quality,info:{...a.renderer.info.render},resources:{...a.renderer.info.memory},metadata:{dimensions:u.dimensions,designReference:u.designReference,coldGas:{...u.coldGas,jetGains:Array.from(u.coldGas.jetGains)}}};});
    await page.screenshot({path:new URL(`roadster-${view}.png`,out).pathname});results.push({...result,errors});await page.close();
  }
  await writeFile(new URL('vehicle.json',out),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}

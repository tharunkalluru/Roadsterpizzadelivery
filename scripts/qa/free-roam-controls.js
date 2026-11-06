async(page)=>{
 const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4.04});
 const start=Date.now(),samples=[],held=new Set();
 async function press(k,ms){await page.keyboard.down(k);held.add(k);await page.waitForTimeout(ms);await page.keyboard.up(k);held.delete(k);}
 async function sample(label){samples.push({label,at:new Date().toISOString(),...await page.evaluate(()=>{const g=window.__game;return{t:g.t,area:g.area,position:{...g.player.pos},speed:g.player.speed,jumping:g.player.jumping,flying:g.player.flying,surface:g.player.lastKind,stream:g.city.streamStats,tiles:g.city.tiles.size,traffic:g.traffic.stats,orders:g.acceptOrders,order:g.order?.state,totalDelivered:g.totalDelivered,autopilot:g.autopilot,perf:g.performanceMonitor.summary(),resources:g.engine.renderer.info.memory};})});}
 try{
 await page.locator('#game canvas').click({position:{x:450,y:250}});
 await sample('start');await press('w',6000);await page.keyboard.press('j');await press('w',2800);await sample('jump landed');
 await press('s',3500);await page.keyboard.press('Space');await page.keyboard.down('w');held.add('w');await press('d',3500);await page.waitForTimeout(10000);await sample('flight boundary');
 await press('a',3000);await page.waitForTimeout(10000);await page.keyboard.up('w');held.delete('w');await page.keyboard.press('Space');await press('s',4500);await page.waitForTimeout(7000);await sample('landed');
 await page.screenshot({path:'output/playwright/free-roam-'+start+'.png'});
 }finally{for(const k of held)await page.keyboard.up(k);await session.send('Emulation.setCPUThrottlingRate',{rate:1});await session.detach();}
 return{started:new Date(start).toISOString(),ended:new Date().toISOString(),environment:'desktop Chrome,4.04xCPU, external workloads recorded separately in run manifest',samples};
}

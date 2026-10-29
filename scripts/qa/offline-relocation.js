async(page)=>{
 const started=new Date().toISOString(),before=await page.evaluate(()=>({area:window.__game.area,coins:window.__game.coins,total:window.__game.totalDelivered,p:{...window.__game.player.pos}}));
 await page.locator('#game canvas').click({position:{x:450,y:250}});await page.keyboard.press('p');await page.getByRole('button',{name:'Change area',exact:true}).click();
 let failure,after;
 try{
  await page.context().setOffline(true);await page.getByRole('button',{name:'Kompally',exact:true}).click();await page.getByRole('button',{name:'Retry this destination',exact:true}).waitFor({timeout:90000});
  failure=await page.evaluate(()=>({area:window.__game.area,coins:window.__game.coins,p:{...window.__game.player.pos},text:document.querySelector('.modal')?.textContent||document.body.innerText.slice(-800),choosing:window.__game.choosing}));
  await page.screenshot({path:'output/playwright/offline-retry.png'});
 }finally{await page.context().setOffline(false);}
 await page.getByRole('button',{name:'Retry this destination',exact:true}).click();await page.waitForFunction(()=>window.__game.area?.name==='Kompally'&&!window.__game.choosing,{timeout:90000});
 after=await page.evaluate(()=>({area:window.__game.area,coins:window.__game.coins,total:window.__game.totalDelivered,p:{...window.__game.player.pos},stream:window.__game.city.streamStats}));
 await page.screenshot({path:'output/playwright/offline-recovered.png'});return{started,ended:new Date().toISOString(),kind:'explicit offline/reconnect failure injection using visible picker and retry',before,failure,after};
}

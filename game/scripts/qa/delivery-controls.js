async (page) => {
  const cdp=await page.context().newCDPSession(page);
  const params=new URL(page.url()).searchParams;
  const rate=Number(params.get('cpu')||1);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  const start=Date.now(); const held=new Set(); let ticks=0; const events=[]; let lastFly=-10000, lastRecovery=-10000;
  async function key(k,on){if(on&&!held.has(k)){await page.keyboard.down(k);held.add(k);}if(!on&&held.has(k)){await page.keyboard.up(k);held.delete(k);}}
  async function release(){for(const k of [...held])await key(k,false);}
  try {
    while(Date.now()-start<55000){
      const s=await page.evaluate(()=>{const g=window.__game;if(!g)return null;const p=g.player;return {x:p.pos.x,y:p.pos.y,z:p.pos.z,yaw:p.yaw,speed:p.speed,flying:p.flying,descending:p.descending,jumping:p.jumping,gliding:!!p.glide,surface:p.lastKind,tip:g.hud.tipOpen,modal:g.hud.modalOpen,paused:g.paused,choosing:g.choosing,offer:g.order?.state==='offer',state:g.order?.state,delivered:g.totalDelivered,target:g.routeTarget,approach:(()=>{const t=g.routeTarget;if(!t)return null;const e=g.graph.edgeAt(t.x,t.z,t.y);return e?g.graph.pointAt(e.g,e.s,1):null;})(),route:g.route?.pts?.slice(0,25),prompt:g.hud.activeAction,buttons:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.textContent.trim()).filter(Boolean).slice(-18)};});
      if(!s){await page.waitForTimeout(250);continue;}
      if(s.tip){await release();await page.getByRole('button',{name:'Got it',exact:true}).click();events.push({at:Date.now()-start,event:'acknowledge-tip'});await page.locator('#game canvas').click({position:{x:450,y:250}});continue;}
      if(s.modal||s.paused||s.choosing){await release(); const resume=page.getByRole('button',{name:'Resume',exact:true});const close=page.getByRole('button',{name:'Close map',exact:true});if(await resume.isVisible()){await resume.click();continue;}if(await close.isVisible()){await close.click();continue;}events.push({at:Date.now()-start,blocked:s});break;}
      if(s.offer){await release();await page.keyboard.press('e');events.push({at:Date.now()-start,event:'accept-keyboard'});await page.waitForTimeout(250);continue;}
      if(!s.target){await release();events.push({at:Date.now()-start,idle:s});await page.waitForTimeout(700);continue;}
      const dx=s.target.x-s.x,dz=s.target.z-s.z,distance=Math.hypot(dx,dz);const landing=s.approach&&Math.hypot(s.approach.x-s.target.x,s.approach.z-s.target.z)<7?s.approach:s.target;const landingDistance=Math.hypot(landing.x-s.x,landing.z-s.z);
      if(s.gliding){await release();await page.waitForTimeout(200);continue;}
      if(distance<25&&s.surface==='roof'&&!s.flying&&!s.descending&&Date.now()-lastRecovery>9000){await release();await page.locator('#game canvas').click({position:{x:450,y:250}});await page.keyboard.press('r');lastRecovery=Date.now();events.push({at:Date.now()-start,event:'roof-recovery-keyboard'});continue;}
      if((distance>90||Math.abs(s.target.y+.55-s.y)>3&&distance<60)&&!s.flying&&!s.descending&&!s.jumping&&Date.now()-lastFly>3000){await page.locator('#game canvas').click({position:{x:450,y:250}});await page.keyboard.press('Space');lastFly=Date.now();events.push({at:Date.now()-start,event:'fly-keyboard'});}
      if(landingDistance<8&&s.flying&&Date.now()-lastFly>2000){await page.locator('#game canvas').click({position:{x:450,y:250}});await page.keyboard.press('Space');lastFly=Date.now();events.push({at:Date.now()-start,event:'land-keyboard'});}
      let aim=s.flying||s.descending?{x:landing.x,z:landing.z}:{x:s.target.x,z:s.target.z};
      if(!s.flying&&!s.descending&&distance>30&&s.route){const q=s.route.find(q=>Math.hypot(q[0]-s.x,q[2]-s.z)>14);if(q)aim={x:q[0],z:q[2]};}
      const desired=Math.atan2(-(aim.x-s.x),-(aim.z-s.z)); const delta=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw));
      await key('a',delta>.07);await key('d',delta<-.07);
      const targetSpeed=s.prompt?0:distance<3.5?0:distance<25?2.8:Math.abs(delta)>1?4:Math.abs(delta)>.5?8:s.flying?26:17;
      await key('w',s.speed<targetSpeed-.5);await key('s',s.speed>targetSpeed+.5);
      if(distance<8&&!s.flying&&!s.descending&&Math.abs(s.speed)<1.4){await key('w',false);await key('s',false);await key('a',false);await key('d',false);await key('e',true);}
      else await key('e',false);
      ticks++; await page.waitForTimeout(120);
    }
  }finally{await release();await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();}
  return {started:new Date(start).toISOString(),ended:new Date().toISOString(),seconds:(Date.now()-start)/1000,rate,ticks,events,after:await page.evaluate(()=>{const g=window.__game;return g?{delivered:g.totalDelivered,state:g.order?.state,area:g.area?.name,position:g.player.pos,speed:g.player.speed,tiles:g.city.tiles.size,stream:g.city.streamStats,traffic:g.traffic.stats,perf:g.performanceMonitor?.summary(),render:g.engine.renderer.info.render,resources:g.engine.renderer.info.memory,heap:performance.memory?.usedJSHeapSize}:null;})};
}

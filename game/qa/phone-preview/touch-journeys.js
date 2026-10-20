async page => {
  const out={touchEmulation:true,physicalDevice:false,normalSpawn:true,teleports:false,driver:'Reference agent through real physics; actual touch for selection/collection/handover',runs:[]};
  await page.waitForFunction(()=>document.querySelector('[data-preview-start]'),null,{timeout:60000});
  await page.locator('[data-preview-start]').tap();
  const tap=async selector=>page.locator(selector).tap();
  const wait=async state=>page.waitForFunction(s=>window.__hmd?.state===s,state,{timeout:180000});
  await wait('MENU');
  async function driveToAction(){
    for(let i=0;i<1500;i++){
      const st=await page.evaluate(()=>{
        const a=window.__hmd,s=a.session;
        if(a.state==='PAUSED'&&a.pauseReason==='loading'&&a.criticalLoaded())a.resume();
        if(a.state==='RECOVERING')a.debugAdvance(0);
        if(a.state==='PLAYING'){for(let n=0;n<120&&!s.canInteract&&a.state==='PLAYING';n++)a.debugAdvance(1);a.hud.update(s,1,a);}
        return {state:a.state,can:s?.canInteract,hold:s?.holdActive,cargo:s?.cargoLoaded,stage:s?.deliveryStage,outcome:s?.outcome,tick:s?.tick,position:s?{x:s.player.x,z:s.player.z}:null};
      });
      if(st.state==='RESULTS')throw Error('Ended before action: '+JSON.stringify(st));
      if(st.state==='PLAYING'&&st.can&&!st.hold)return st;
      if(i%10===0)await page.waitForTimeout(40);
    }
    throw Error('No action reached');
  }
  async function startReady(){
    await wait('READY');await tap('[data-start]');await wait('PLAYING');
    await page.evaluate(()=>{const a=window.__hmd;a.enableAutopilot();const d=a.autopilot,original=d.input.bind(d);d.input=()=>{const plan=original(),manual=a.input.sample();return {...plan,accel:plan.accel||manual.accel,brake:plan.brake||manual.brake,interactPress:manual.interactPress};};});
  }
  async function action(expected){
    const hit=await page.locator('[data-interact]').evaluate(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,pointerEvents:getComputedStyle(b).pointerEvents,hitSelf:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
    if(!hit.hitSelf||hit.pointerEvents==='none')throw Error('Action not touch hittable: '+JSON.stringify(hit));
    await tap('[data-interact]');
    const result=await page.evaluate(()=>{const a=window.__hmd;for(let i=0;i<90&&a.state==='PLAYING';i++)a.debugAdvance(1);a.hud.update(a.session,1,a);return {state:a.state,cargoLoaded:a.session.cargoLoaded,stage:a.session.deliveryStage,outcome:a.session.outcome};});
    if(expected==='pickup'&&!result.cargoLoaded)throw Error('Collect failed: '+JSON.stringify(result));
    if(expected==='delivery'&&!result.outcome?.success)throw Error('Handover failed: '+JSON.stringify(result));
    return {hit,result};
  }
  async function finishRun(name,cancel){
    const pickup=await driveToAction();let cancellation=null;
    if(cancel){
      await tap('[data-interact]');await page.evaluate(()=>window.__hmd.debugAdvance(3));
      const before=await page.evaluate(()=>window.__hmd.session.holdActive);if(!before)throw Error('Collection did not start');
      const rect=await page.locator('[data-accel]').boundingBox(),cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
      await page.evaluate(()=>window.__hmd.debugAdvance(1));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      const cancelled=await page.evaluate(()=>({hold:window.__hmd.session.holdActive,cargo:window.__hmd.session.cargoLoaded}));
      if(cancelled.hold||cancelled.cargo)throw Error('Collection cancellation failed');
      await driveToAction();cancellation={before,cancelled};
    }
    const collect=await action('pickup');await page.evaluate(()=>window.__hmd.debugAdvance(1));
    const arrival=await driveToAction(),handover=await action('delivery');await wait('RESULTS');
    const result=await page.evaluate(()=>{const a=window.__hmd,s=a.session;return {outcome:s.outcome,events:s.eventLog.filter(e=>/collected|delivered/.test(e.e)),recoveries:s.recoveries,distance:s.distanceTravelled,mission:s.mission.id,zoneMode:a.pilotZone.mode,inside:a.pilotZone.allowsPose(s.player)};});
    out.runs.push({name,pickup,arrival,cancellation,collect,handover,result});
  }
  await tap('[data-play]');await page.locator('[data-m]').first().tap();
  const selected=await page.locator('[data-go]').isVisible();await tap('.screen [data-back]');
  out.selectionBackReturned=await page.locator('[data-m]').first().isVisible();if(!selected||!out.selectionBackReturned)throw Error('Selection/back failed');
  await page.locator('[data-m]').first().tap();await tap('[data-go]');await startReady();await finishRun('first job; cancelled/retried pickup',true);
  await tap('[data-retry]');await startReady();await finishRun('same job restarted',false);
  await tap('[data-another]');await page.locator('[data-m]').nth(1).tap();await tap('[data-go]');await startReady();await finishRun('second job',false);
  await tap('[data-retry]');await startReady();await tap('[data-pause]');await tap('[data-abandon]');await wait('RESULTS');
  out.abandon=await page.evaluate(()=>window.__hmd.session.outcome);
  return out;
}

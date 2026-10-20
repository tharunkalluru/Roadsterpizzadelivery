async page => {
  return await page.evaluate(async () => {
    const { fixture, hash } = await import('/tests/unit/pilot-fixture.ts');
    const { PilotZone } = await import('/src/pilot/zone.ts');
    const { Session } = await import('/src/missions/session.ts');
    const { Autopilot } = await import('/src/debug/autopilot.ts');
    const { InputManager } = await import('/src/ui/input.ts');
    const results = [];
    for (const mode of ['keyboard', 'touch-pointer']) for (const job of [0, 1]) {
      const f = fixture(), zone = new PilotZone(f.definition, f.core, f.survey, hash);
      const session = new Session(f.world, zone.missions[job], {pilotZone:zone,trafficEnabled:false});
      session.start(); const ap = new Autopilot(session);
      const root = document.createElement('div'); root.style.cssText='position:fixed;left:0;top:0;visibility:hidden'; document.body.append(root);
      const controls = {};
      for (const name of ['steer','steerKnob','brake','accel','fly','interact']) { controls[name]=document.createElement('button');controls[name].style.width='200px';root.append(controls[name]); }
      const input = new InputManager(root); input.enabled=true;input.bindTouch(controls);controls.interact.addEventListener('click',()=>input.requestInteraction());
      const held = new Map();
      const key=(code,on)=>{if(held.get(code)===on)return;held.set(code,on);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));};
      const ptr=(name,on,id)=>{if(held.get(name)===on)return;held.set(name,on);controls[name].dispatchEvent(new PointerEvent(on?'pointerdown':'pointerup',{pointerId:id,pointerType:'touch',clientX:100,bubbles:true,cancelable:true}));};
      if(mode==='touch-pointer')controls.steer.dispatchEvent(new PointerEvent('pointerdown',{pointerId:10,pointerType:'touch',clientX:100,bubbles:true,cancelable:true}));
      let ticks=0, interactions=0;
      for(;ticks<60000&&session.phase!=='ENDED';ticks++){
        if(session.phase==='RECOVERING'){session.completeRecovery();continue;}
        const desired=ap.input();
        if(mode==='keyboard'){
          key('KeyW',desired.accel);key('KeyS',desired.brake);key('KeyA',desired.steer<-.05);key('KeyD',desired.steer>.05);
          if(desired.interactPress){key('KeyE',true);key('KeyE',false);interactions++;}
        }else{
          ptr('accel',desired.accel,11);ptr('brake',desired.brake,12);
          controls.steer.dispatchEvent(new PointerEvent('pointermove',{pointerId:10,pointerType:'touch',clientX:100+desired.steer*56+(desired.steer?Math.sign(desired.steer)*6:0),bubbles:true}));
          if(desired.interactPress){controls.interact.click();interactions++;}
        }
        session.step(input.sample());
        if(!zone.allowsPose(session.player))throw Error('Outside pose reached');
      }
      results.push({mode,job,ticks,interactions,success:session.outcome?.success??false,stage:session.deliveryStage,recoveries:session.recoveries});
      input.clearAll();input.dispose();root.remove();
    }
    return {syntheticOnly:true,physicalDevice:false,results};
  });
}

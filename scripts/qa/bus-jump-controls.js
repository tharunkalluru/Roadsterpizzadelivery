async (page) => {
  // Run only when this agent owns browser input. All game changes below use
  // visible keyboard controls; __game is observed, never assigned or stepped.
  const started = Date.now(), deadline = started + 51000;
  const samples = [], events = [], screenshots = [], held = new Set();
  let target = null, landingGap = 100, stage = 'navigate-behind', jumpBefore = null;
  let jumpObserved = false, landedAt = null, crossedAbove = false;
  let missingDuringInteraction = false, invisibleInView = false, lastToggle = -Infinity;
  let midShot = false, lateShot = false, lastBusHeading = null, stableHeadingSince = started;

  const key = async (k, down) => {
    if (down && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    else if (!down && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
  };
  const release = async () => { for (const k of [...held]) { await page.keyboard.up(k); held.delete(k); } };
  const snap = async label => {
    const path = `output/playwright/bus-jump-${started}-${label}.png`;
    try { await page.screenshot({path, timeout:1800}); screenshots.push({label,path,atMs:Date.now()-started}); }
    catch(error) { events.push({event:'screenshot-failed',label,error:String(error).slice(0,180)}); }
  };
  const observe = async () => page.evaluate(handle => {
    const g = window.__game;
    if (!g?.player) return null;
    const p=g.player;
    // Read finite loaded collision surfaces; never choose a point beneath a
    // station/flyover deck, where SPACE landing would stop on the upper surface.
    const surfaceHeight=(s,x,z)=>{
      if(s.kind==='road'&&s.roadQuad){
        const q=s.roadQuad;
        for(const [a,b,c] of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]]){
          const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
          if(Math.abs(det)<1e-9)continue;
          const px=x-a[0],pz=z-a[2],u=(px*cz-pz*cx)/det,v=(bx*pz-bz*px)/det;
          if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
        }
        return null;
      }
      const dx=s.bx-s.ax,dz=s.bz-s.az,l2=dx*dx+dz*dz||1;
      const t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/l2));
      if(Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)>s.hw)return null;
      return s.ya+(s.yb-s.ya)*t;
    };
    const uncoveredLanding=(c,gap,point=null)=>{
      const x=point?.x??c.x-c.hx*gap,z=point?.z??c.z-c.hz*gap,cx=Math.floor(x/30),cz=Math.floor(z/30);
      let road=false,overhead=false,maxSurface=-Infinity,finite=0;
      const seen=new Set();
      for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of g.city.surfaceGrid.get(`${cx+i},${cz+j}`)||[]){
        if(seen.has(s))continue;seen.add(s);
        const h=surfaceHeight(s,x,z);if(h===null||!Number.isFinite(h))continue;
        finite++;maxSurface=Math.max(maxSurface,h);
        if(s.kind==='road'&&Math.abs(h-c.y)<1.2)road=true;
        if(h>c.y+2)overhead=true;
      }
      return {gap,x,z,valid:road&&!overhead,road,overhead,finite,maxSurface:Number.isFinite(maxSurface)?maxSurface:null};
    };
    const busState=c=>{
      const projected=c.g.position.clone(); projected.y+=c.size[1]/2; projected.project(g.engine.camera);
      return {id:c.id,generation:c.generation,x:c.x,y:c.y,z:c.z,hx:c.hx,hz:c.hz,speed:c.speed,
        size:[...c.size],visible:c.g.visible,inView:Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&projected.z>=-1&&projected.z<=1,
        screenNDC:{x:projected.x,y:projected.y},edge:c.edge?.e?.id,turn:c.motion?.kind||null,
        route:c.busRun?.pattern?.number||null,dwell:c.dwell,
        landingOptions:[70,100,140].map(gap=>uncoveredLanding(c,gap)),
        belowCar:uncoveredLanding(c,0,{x:p.pos.x,z:p.pos.z})};
    };
    const buses=g.traffic.cars.filter(c=>c.group==='bus');
    const bus=handle?buses.find(c=>c.id===handle.id&&c.generation===handle.generation):null;
    return {simTime:g.t,paused:g.paused,choosing:g.choosing,modal:g.hud.modalOpen,tip:g.hud.tipOpen,
      portrait:g.hud.rotationBlocked,offer:g.order?.state==='offer',autopilot:g.autopilot,
      car:{x:p.pos.x,y:p.pos.y,z:p.pos.z,yaw:p.yaw,hx:-Math.sin(p.yaw),hz:-Math.cos(p.yaw),speed:p.speed,
        jumping:p.jumping,flying:p.flying,descending:p.descending,onRoad:p.onRoad,surface:p.lastKind,
        cooldown:p.jumpCooldown,canJump:p.canJump,
        cachedBodyBounds:p.jumping&&!p.jumpBoundsDirty&&p.jumpBounds?{bottom:p.jumpBounds.bottom,top:p.jumpBounds.top}:null},
      bus:bus?busState(bus):null,
      buses:handle?undefined:buses.map(busState).sort((a,b)=>Math.hypot(a.x-p.pos.x,a.z-p.pos.z)-Math.hypot(b.x-p.pos.x,b.z-p.pos.z)).slice(0,12)};
  },target);
  const relative = s => {
    if(!s?.bus)return null;
    const dx=s.bus.x-s.car.x,dz=s.bus.z-s.car.z;
    return {ahead:dx*s.bus.hx+dz*s.bus.hz,lateral:dx*s.bus.hz-dz*s.bus.hx,
      headingDot:s.car.hx*s.bus.hx+s.car.hz*s.bus.hz,relativeSpeed:s.car.speed-s.bus.speed,
      roadLevelDifference:s.car.y-.55-s.bus.y,
      cachedBodyClearance:s.car.cachedBodyBounds?s.car.cachedBodyBounds.bottom-(s.bus.y+s.bus.size[1]):null};
  };
  let last = null, reason = 'time-limit';
  try {
    let s=await observe();
    if(!s)return {attempted:false,provenOverjump:false,reason:'game-not-ready'};
    if(s.autopilot)return {attempted:false,provenOverjump:false,reason:'developer-autopilot-active; root must disable through supported UI'};
    if(s.portrait||s.modal||s.choosing||s.paused)return {attempted:false,provenOverjump:false,reason:'game-ui-blocked',state:s};
    if(s.tip){const button=page.getByRole('button',{name:'Got it',exact:true});if(await button.isVisible())await button.click({timeout:1000});}
    if(s.offer){await page.keyboard.press('e');events.push({event:'offer-accepted-keyboard',atMs:Date.now()-started});await page.waitForTimeout(200);}
    s=await observe();
    const choices=(s?.buses||[]).filter(b=>Math.hypot(b.x-s.car.x,b.z-s.car.z)<320&&Math.abs(b.y-(s.car.y-.55))<35)
      .flatMap(bus=>bus.landingOptions.filter(p=>p.valid).map(landing=>({bus,landing,
        cost:Math.hypot(landing.x-s.car.x,landing.z-s.car.z)+(bus.turn?90:0)+landing.gap*.12})))
      .sort((a,b)=>a.cost-b.cost);
    const choice=choices[0],selected=choice?.bus;
    if(!selected)return {attempted:false,provenOverjump:false,reason:'no-nearby-bus-with-loaded-uncovered-rear-road',observed:s};
    target={id:selected.id,generation:selected.generation};landingGap=choice.landing.gap;
    events.push({event:'selected-existing-bus-and-uncovered-landing',target,route:selected.route,landing:choice.landing,atMs:Date.now()-started});
    const canvas=page.locator('#game canvas').first(),box=await canvas.boundingBox();
    if(!box)return {attempted:false,provenOverjump:false,reason:'game-canvas-not-visible',target};
    await canvas.click({position:{x:box.width*.5,y:box.height*.48},timeout:1200});

    while(Date.now()<deadline){
      s=await observe();last=s;
      if(!s){reason='game-disappeared';break;}
      if(s.autopilot||s.portrait||s.modal||s.choosing||s.paused){reason='ui-or-autopilot-interrupted';samples.push({atMs:Date.now()-started,stage,state:s});break;}
      if(s.tip){await release();const button=page.getByRole('button',{name:'Got it',exact:true});if(await button.isVisible()){await button.click({timeout:1000});events.push({event:'tip-acknowledged',atMs:Date.now()-started});continue;}reason='tip-blocked';break;}
      if(s.offer){await release();await page.keyboard.press('e');events.push({event:'offer-accepted-keyboard',atMs:Date.now()-started});continue;}
      if(!s.bus){if(jumpObserved||stage==='jump'){missingDuringInteraction=true;}reason='selected-bus-handle-not-resident';samples.push({atMs:Date.now()-started,stage,state:s});break;}
      const rel=relative(s);
      samples.push({atMs:Date.now()-started,stage,simTime:s.simTime,car:s.car,bus:s.bus,relative:rel});
      if(lastBusHeading&&s.bus.hx*lastBusHeading.hx+s.bus.hz*lastBusHeading.hz<.997)stableHeadingSince=Date.now();
      lastBusHeading={hx:s.bus.hx,hz:s.bus.hz};

      if(s.car.jumping){
        jumpObserved=true;stage='jump';
        if(!s.bus.visible&&s.bus.inView)invisibleInView=true;
        if(Math.abs(rel.ahead)<s.bus.size[2]/2&&Math.abs(rel.lateral)<s.bus.size[0]/2+.8&&rel.cachedBodyClearance!==null&&rel.cachedBodyClearance>=-.03)crossedAbove=true;
        await key('w',false);await key('s',false);await key('a',false);await key('d',false);
        if(!midShot&&s.simTime-(jumpBefore?.simTime||s.simTime)>.35){midShot=true;await snap('midjump');}
        else if(!lateShot&&s.simTime-(jumpBefore?.simTime||s.simTime)>1){lateShot=true;await snap('late-jump');}
        await page.waitForTimeout(90);continue;
      }
      if(jumpObserved){
        stage='landing';
        if(landedAt===null){landedAt=s.simTime;events.push({event:'observed-ground-contact-after-jump',atMs:Date.now()-started,relative:rel,surface:s.car.surface});await snap('landing');}
        if(!s.bus.visible&&s.bus.inView)invisibleInView=true;
        // Explicitly retain observations beyond the one-second landing grace.
        await key('w',false);await key('a',false);await key('d',false);await key('s',s.car.speed>1);
        if(s.simTime-landedAt>=1.1){reason='observed-jump-and-landing-window';break;}
        await page.waitForTimeout(100);continue;
      }
      if(stage==='jump-requested'){
        if(jumpBefore&&s.simTime-jumpBefore.simTime>1){reason='jump-key-did-not-start-jump';break;}
        await page.waitForTimeout(60);continue;
      }

      const behindGap=stage==='approach'?20:landingGap;
      const point={x:s.bus.x-s.bus.hx*behindGap,z:s.bus.z-s.bus.hz*behindGap};
      const distance=Math.hypot(point.x-s.car.x,point.z-s.car.z);
      // Flight is used only through SPACE to reach the real lane behind the bus.
      // No placement/rescue/teleport APIs or simulation stepping are used.
      if(stage==='navigate-behind'&&!s.car.flying&&!s.car.descending&&(distance>35||!s.car.onRoad||Math.abs(rel.roadLevelDifference)>1.5)&&Date.now()-lastToggle>2200){
        await release();await page.keyboard.press('Space');lastToggle=Date.now();events.push({event:'fly-keyboard',atMs:Date.now()-started});
      }
      const landing=s.bus.landingOptions.find(p=>p.gap===landingGap);
      if(s.car.flying&&landing?.valid&&s.bus.belowCar.valid&&Math.abs(rel.lateral)<3&&rel.headingDot>.9&&rel.ahead>landingGap-22&&rel.ahead<landingGap+25&&Date.now()-lastToggle>2200){
        await page.keyboard.press('Space');lastToggle=Date.now();events.push({event:'land-keyboard-behind-bus',landing,atMs:Date.now()-started});
      }
      if(!s.car.flying&&!s.car.descending&&s.car.onRoad&&Math.abs(rel.roadLevelDifference)<1&&Math.abs(rel.lateral)<2.5&&rel.headingDot>.9&&rel.ahead>24&&rel.ahead<landingGap+40){stage='approach';}

      const wantedYaw=stage==='approach'?Math.atan2(-s.bus.hx,-s.bus.hz)+Math.max(-.16,Math.min(.16,rel.lateral*.035)):Math.atan2(-(point.x-s.car.x),-(point.z-s.car.z));
      const delta=Math.atan2(Math.sin(wantedYaw-s.car.yaw),Math.cos(wantedYaw-s.car.yaw));
      await key('a',delta>.035);await key('d',delta<-.035);
      const desiredSpeed=stage==='approach'?Math.min(33.2,s.bus.speed+23):Math.abs(delta)>1?5:s.car.descending?Math.max(8,s.bus.speed+2):Math.min(26,Math.max(s.bus.speed+1,distance*.7));
      await key('w',s.car.speed<desiredSpeed-.5);await key('s',s.car.speed>desiredSpeed+.8);
      const requiredGap=s.bus.size[2]/2+2.4+Math.max(0,rel.relativeSpeed)*.34+1;
      if(stage==='approach'&&s.car.canJump&&s.car.speed>=22&&rel.relativeSpeed>=15&&Math.abs(rel.lateral)<1.1&&rel.headingDot>.985&&Date.now()-stableHeadingSince>450&&rel.ahead<=requiredGap+3&&rel.ahead>=requiredGap-2){
        await release();jumpBefore={simTime:s.simTime,car:s.car,bus:s.bus,relative:rel};
        await snap('before-jump');await page.keyboard.press('j');stage='jump-requested';
        events.push({event:'jump-keyboard',atMs:Date.now()-started,requiredGap,before:jumpBefore});
      }
      if(stage==='approach'&&rel.ahead<s.bus.size[2]/2+3&&!s.car.jumping){await key('w',false);await key('s',true);reason='too-close-to-bus-for-safe-launch';break;}
      await page.waitForTimeout(90);
    }
  } catch(error){reason='controller-error';events.push({event:'controller-error',error:String(error).slice(0,300),atMs:Date.now()-started});}
  finally{await release();}
  const final=last?.bus?relative(last):null;
  const provenOverjump=!!(jumpBefore&&jumpObserved&&crossedAbove&&landedAt!==null&&last?.car.onRoad&&
    jumpBefore.relative.ahead>jumpBefore.bus.size[2]/2+2.4&&final&&final.ahead<-(last.bus.size[2]/2+2.4)&&
    !missingDuringInteraction&&!invisibleInView);
  return {started:new Date(started).toISOString(),ended:new Date().toISOString(),seconds:(Date.now()-started)/1000,
    technique:'External controller sends visible keyboard inputs; read-only game observations. No developer autopilot, teleportation, hidden-state mutation or simulation stepping.',
    attempted:!!jumpBefore,provenOverjump,reason,target,landingGap,jumpObserved,crossedAbove,landedAt,missingDuringInteraction,invisibleInView,
    proofCriteria:'behind whole bus before launch; actual jumping; cached physical body clears roof while crossing bus footprint; land ahead of whole bus; same handle resident/visible when in view through landing+1.1s',
    samples,events,screenshots};
}

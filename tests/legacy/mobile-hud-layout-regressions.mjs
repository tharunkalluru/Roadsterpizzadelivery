// Production layout geometry, not a browser or physical-phone acceptance claim.
import assert from 'node:assert/strict';
import { build } from '../../node_modules/esbuild/lib/main.js';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const tmp = mkdtempSync(join(tmpdir(), 'mobile-hud-layout-'));
const hit = (a,b) => a.left < b.left+b.width && b.left < a.left+a.width && a.top < b.top+b.height && b.top < a.top+a.height;
try {
  await build({ entryPoints:[new URL('../../src/ui/hud-layout.ts',import.meta.url).pathname],outfile:join(tmp,'m.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error' });
  const {mobileHudLayout}=await import(pathToFileURL(join(tmp,'m.mjs')));
  await build({entryPoints:[new URL('../../src/ui/flight-navigation.ts',import.meta.url).pathname],outfile:join(tmp,'nav.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
  const {flightNavigationLayout}=await import(pathToFileURL(join(tmp,'nav.mjs')));
  const assertIntegratedSpeed=(layout)=>{
    const speed=layout.speed,map=layout.map;
    assert.ok(Math.abs(speed.left+speed.width/2-map.left-map.width/2)<=.5,'speed stays centered inside the minimap');
    assert.ok(speed.left>=map.left&&speed.left+speed.width<=map.left+map.width&&speed.top>=map.top+map.height/2&&speed.top+speed.height<=map.top+map.height,'speed occupies the minimap bottom arc');
  };
  const assertSeparate=(layout,names,label)=>{
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
      if(names[i]==='speed'&&names[j]==='map')continue; // speed is intentionally contained by the map
      assert.ok(!hit(layout[names[i]],layout[names[j]]),`${label}: ${names[i]} overlaps ${names[j]}`);
    }
  };
  const assertNavigation=(layout,width,height,left=18,right=18)=>{
    const toolbar={left:width-right-148,top:10,width:148,height:44};
    const nav=flightNavigationLayout(width,height,54,0,{left,top:10,width:0,height:0},{...layout.map,left:toolbar.left},layout.leftSteer.top,height<=520?44:48);
    assert.ok(nav,'supported landscape keeps its navigation guidance');assert.equal(nav.top,10);
    assert.ok(Math.abs(nav.left+nav.width/2-width/2)<=.5,'guidance uses the fixed top center');
    for(const obstacle of [toolbar,layout.map,layout.leftSteer,layout.rightSteer,layout.brake,layout.gas,layout.fly,layout.jump,layout.context,...(layout.call?[layout.call]:[])])assert.ok(!hit(nav,obstacle),'guidance clears the toolbar, map and actions');
    return nav;
  };
  const scenarios=[];
  for(const [width,height] of [[800,360],[900,400],[844,390],[640,360],[568,320],[667,375],[1024,768],[1280,720]]) {
    const portrait=height>width, layout=mobileHudLayout(width,height,portrait?148:62,portrait?height<=650?330:400:220);
    assert.equal(layout.brake.width,Math.round(layout.oldBrake*1.5));assert.equal(layout.brake.height,layout.gas.height);
    assert.equal(layout.brake.top,layout.gas.top);
    assertIntegratedSpeed(layout);assert.equal(layout.map.left+layout.map.width,width-18,'minimap stays at the right edge');
    assert.equal(layout.fly.left,layout.gas.left); assert.equal(layout.fly.width,layout.gas.width);
    assert.equal(layout.jump.left,layout.brake.left); assert.equal(layout.jump.width,layout.brake.width);
    const names=['leftSteer','rightSteer','brake','gas','fly','jump','speed','map','context',...(layout.call?['call']:[])];
    for(const name of names){const r=layout[name];assert.ok(r.left>=0&&r.top>=0&&r.left+r.width<=width&&r.top+r.height<=height,`${width}x${height} ${name} stays in viewport`);}
    assertSeparate(layout,names,`${width}x${height}`);const navigation=assertNavigation(layout,width,height);
    assert.ok(layout.map.width>=100,'phone map keeps a usable diameter');assert.ok(layout.context.width>=120,'context hold remains usable');
    assert.ok(layout.fly.top===layout.jump.top && layout.fly.top+layout.fly.height<layout.gas.top && layout.jump.top+layout.jump.height<layout.brake.top,'FLY and JUMP pair above GO and BRAKE');
    scenarios.push({viewport:[width,height],rects:{...Object.fromEntries(names.map(name=>[name,layout[name]])),navigation},oldBrakeLinearPx:layout.oldBrake,newBrakeWidthPx:layout.brake.width,inBounds:true,controlMapContextOverlaps:0});
    console.log(`PASS ${width}x${height}:150% brake width, map-integrated speed and top-center navigation with separate actions`);
  }
  const safeAreaScenarios=[];
  for(const [width,height,left,right,bottom,mapTop,taskBottom] of [[844,390,59,59,21,95,220],[800,360,18,18,34,95,220]]){
    const layout=mobileHudLayout(width,height,mapTop,taskBottom,left,right,bottom),names=['leftSteer','rightSteer','brake','gas','fly','jump','speed','map','context',...(layout.call?['call']:[])];
    const safeLeft=left>18?left:12,safeRight=right>18?right:12;
    for(const name of names){const r=layout[name];assert.ok(r.left>=safeLeft&&r.left+r.width<=width-safeRight+1&&r.top+r.height<=height-bottom+1,`${name} respects notch/home-indicator safe area`);}
    assertIntegratedSpeed(layout);assertSeparate(layout,names,'safe area');assertNavigation(layout,width,height,left,right);assert.equal(layout.map.left+layout.map.width,width-right);
    safeAreaScenarios.push({viewport:[width,height],safeInsets:{left,right,bottom},rects:Object.fromEntries(names.map(name=>[name,layout[name]])),overlaps:0});
    console.log(`PASS ${width}x${height}:resolved safe-area insets preserve all control/map/context lanes`);
  }
  const report=process.argv.indexOf('--report');
  if(report>=0){
    const files=['src/ui/hud.ts','src/ui/hud-layout.ts','src/ui/theme.ts'];
    writeFileSync(process.argv[report+1],JSON.stringify({generatedAt:new Date().toISOString(),validation:'Offline production layout geometry only; DOM input handlers, browser screenshots and physical phone testing are separate.',
      sourceCodeSha256:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex')])),
      reviewTableMarkdown:'| Before | After | Why |\n| --- | --- | --- |\n| Standalone Flight/Unlimited card | Reserve fill inside FLY/LAND | Frees top-right map space without duplicate status |\n| Day and Level HUD pills | Fixed top-center navigation | Keeps directions clear while progress remains in Pause |\n| Toggle inside an idle Free roam card | Compact Accept orders toggle; idle task hidden | Removes redundant idle panel |\n| Small rounded-square brake | Same height as GO with 150% width | Gives braking a wider thumb target |\n| Standalone bottom speed | Speed integrated into minimap bottom arc | Frees the center action lane without covering driving controls |',
      checks:{geometryViewports:scenarios.length,safeAreaVariants:safeAreaScenarios.length,fixedNavigationProfiles:scenarios.length+safeAreaScenarios.length,minimapIntegratedSpeed:true,otherOverlayOverlaps:0},scenarios,safeAreaScenarios,
      browserReview:{status:'pending root visible-browser review',fixture:'/tests/browser/hud-notices.html',states:['none','area','area-refresh','area-expired','toast','delivery-failure','rescue','all-active'],resultAttribute:'data-hud-layout-result'},
      limits:['These computed rectangles do not claim rendered-browser text bounds or physical-phone touch acceptance.','Production bug-report submission is owned and validated separately by the root task.']},null,2)+'\n');
  }
}finally{rmSync(tmp,{recursive:true,force:true});}

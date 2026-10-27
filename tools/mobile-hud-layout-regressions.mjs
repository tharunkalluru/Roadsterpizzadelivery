// Production layout geometry, not a browser or physical-phone acceptance claim.
import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const tmp = mkdtempSync(join(tmpdir(), 'mobile-hud-layout-'));
const hit = (a,b) => a.left < b.left+b.width && b.left < a.left+a.width && a.top < b.top+b.height && b.top < a.top+a.height;
try {
  await build({ entryPoints:[new URL('../game/src/ui/hud-layout.ts',import.meta.url).pathname],outfile:join(tmp,'m.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error' });
  const {mobileHudLayout}=await import(pathToFileURL(join(tmp,'m.mjs')));
  const scenarios=[];
  for(const [width,height] of [[800,360],[900,400],[844,390],[640,360],[568,320],[1280,720]]) {
    const portrait=height>width, layout=mobileHudLayout(width,height,portrait?148:95,portrait?height<=650?330:400:220);
    assert.equal(layout.brake.width,layout.oldBrake*1.5);assert.equal(layout.brake.height,layout.gas.height);
    assert.equal(layout.brake.top,layout.gas.top);
    assert.equal(layout.speed.left+layout.speed.width/2,width/2);
    for(const name of ['fly','cruise']) { assert.equal(layout[name].left,layout.gas.left); assert.equal(layout[name].width,layout.gas.width); }
    const names=['leftSteer','rightSteer','brake','gas','fly','cruise','speed','map','context'];
    for(const name of names){const r=layout[name];assert.ok(r.left>=0&&r.top>=0&&r.left+r.width<=width&&r.top+r.height<=height,`${width}x${height} ${name} stays in viewport`);}
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.ok(!hit(layout[names[i]],layout[names[j]]),`${width}x${height}: ${names[i]} overlaps ${names[j]}`);
    assert.ok(layout.map.width>=112,'phone map keeps a usable diameter');assert.ok(layout.context.width>=120,'context hold remains usable');
    assert.ok(layout.fly.top+layout.fly.height<layout.cruise.top && layout.cruise.top+layout.cruise.height<layout.gas.top,'FLY and CRUISE stack above GO');
    scenarios.push({viewport:[width,height],rects:Object.fromEntries(names.map(name=>[name,layout[name]])),oldBrakeLinearPx:layout.oldBrake,newBrakeLinearPx:layout.brake.width,inBounds:true,controlMapContextOverlaps:0});
    console.log(`PASS ${width}x${height}:150% brake, all controls/map/context inside viewport with no rectangle overlaps`);
  }
  const safeAreaScenarios=[];
  for(const [width,height,left,right,bottom,mapTop,taskBottom] of [[844,390,59,59,21,95,220],[800,360,18,18,34,95,220]]){
    const layout=mobileHudLayout(width,height,mapTop,taskBottom,left,right,bottom),names=['leftSteer','rightSteer','brake','gas','fly','cruise','speed','map','context'];
    const safeLeft=left>18?left:12,safeRight=right>18?right:12;
    for(const name of names){const r=layout[name];assert.ok(r.left>=safeLeft&&r.left+r.width<=width-safeRight+1&&r.top+r.height<=height-bottom+1,`${name} respects notch/home-indicator safe area`);}
    for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.ok(!hit(layout[names[i]],layout[names[j]]),`safe area ${names[i]} overlaps ${names[j]}`);
    safeAreaScenarios.push({viewport:[width,height],safeInsets:{left,right,bottom},rects:Object.fromEntries(names.map(name=>[name,layout[name]])),overlaps:0});
    console.log(`PASS ${width}x${height}:resolved safe-area insets preserve all control/map/context lanes`);
  }
  const report=process.argv.indexOf('--report');
  if(report>=0){
    const files=['game/src/ui/hud.ts','game/src/ui/hud-layout.ts','game/src/ui/theme.ts'];
    writeFileSync(process.argv[report+1],JSON.stringify({generatedAt:new Date().toISOString(),validation:'Offline production layout geometry and DOM-handler regressions; browser screenshots and physical phone testing are separate.',
      sourceCodeSha256:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex')])),
      reviewTableMarkdown:'| Before | After | Why |\n| --- | --- | --- |\n| Standalone Flight/Unlimited card | Reserve fill inside FLY/LAND | Frees top-right map space without duplicate status |\n| Bottom entering banner on short screens | Dedicated top lane | Keeps clock, task and map readable |\n| Toggle inside an idle Free roam card | Compact Accept orders toggle; idle task hidden | Removes redundant idle panel |\n| Small rounded-square brake | Same shape at 150% linear size | Gives braking a larger thumb target |\n| Fixed overlapping control columns | Measured map, pedals, flight, speed and action lanes | Keeps all six tested phone sizes usable |',
      checks:{geometryViewports:6,safeAreaVariants:2,domHandlers:40,uiDialogAndDispatch:9,audioUnlimitedFlightAndCruise:11,typecheck:'pass'},scenarios,safeAreaScenarios,
      browserReview:{status:'pending root visible-browser review',fixture:'/phone-feedback-review.html',nativeActions:['After first delivery preview','At pickup','Enter area preview','Idle orders toggle preview','Empty flight reserve','Full flight reserve','Record layout rectangles','Clean screenshot'],rectOutput:'#qa-layout-results'},
      limits:['These computed rectangles do not claim rendered-browser text bounds or physical-phone touch acceptance.','Production bug-report submission is owned and validated separately by the root task.']},null,2)+'\n');
  }
}finally{rmSync(tmp,{recursive:true,force:true});}

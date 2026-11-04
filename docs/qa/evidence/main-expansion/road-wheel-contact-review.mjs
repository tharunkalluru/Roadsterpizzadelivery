import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const folder=dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(join(tmpdir(),'road-wheel-review-'));
const baseline=JSON.parse(await readFile(join(folder,'reported-road-actual-player-baseline.json'),'utf8'));
const playerFile=resolve('src/game/player.ts'),currentSource=await readFile(playerFile,'utf8');
const oldSource=currentSource.replace(/^import \{ roadWheelContact \} from '\.\/road-wheel-contact';\n/m,'')
  .replace(/    if \(s\.kind === 'road' && this\.wheels\?\.length === 4 && roadWheelContact\([\s\S]*?    \} else this\.resetWheelSuspension\(\);\n/,'')
  .replace(/ else if \(grounded && sup2\.kind === 'road' && this\.wheels\?\.length === 4\) \{[\s\S]*?\n    \}/,'');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(oldSource),baseline.hashes['src/game/player.ts'],'helper-disabled reference must match preserved pre-edit Player source exactly');
try{
  const common={entryPoints:[join(folder,'road-wheel-contact-review-lib.ts')],bundle:true,platform:'node',format:'esm',target:'node22',
    define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'};
  await build({...common,outfile:join(temp,'on.mjs')});
  await build({...common,outfile:join(temp,'off.mjs'),plugins:[{name:'exact-pre-edit-player',setup(b){b.onLoad({filter:/\/src\/game\/player\.ts$/},()=>({contents:oldSource,loader:'ts',resolveDir:dirname(playerFile)}));}}]});
  const on=await import(pathToFileURL(join(temp,'on.mjs'))),off=await import(pathToFileURL(join(temp,'off.mjs')));
  const controls={allowReverse:false,throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
  const negative=on.negativeChecks(),ramp=on.rampPlacement();
  const parity=[];
  for(const hz of[30,60]){
    const fixture=on.makeSynthetic(),a=on.actualPlayer(fixture.city),b=off.actualPlayer(fixture.city);let mismatch=null;
    try{
      for(const p of[a.player,b.player])p.place(0,0,0,3);
      if(JSON.stringify(on.pose(a.player))!==JSON.stringify(off.pose(b.player)))mismatch={frame:0,on:on.pose(a.player),off:off.pose(b.player)};
      for(let frame=1;frame<=hz*6;frame++){
        const t=frame/hz,input={...controls,throttle:t<2?1:0,brake:t>=2&&t<3?1:0,steer:t>1&&t<2?.2:0,
          flyPressed:frame===hz*4||frame===hz*5};
        a.player.update(1/hz,input,t);b.player.update(1/hz,input,t);
        if(JSON.stringify(on.pose(a.player))!==JSON.stringify(off.pose(b.player))){mismatch={frame,on:on.pose(a.player),off:off.pose(b.player)};break;}
      }
      parity.push({hz,frames:hz*6,bitIdenticalRootMotion:mismatch===null,mismatch});
    }finally{a.dispose();b.dispose();}
  }
  console.log(JSON.stringify({stage:'focused-controls',negative,placementBadWheel:ramp.placed.badWheel,firstUpdateBadWheel:ramp.afterFirstUpdate.badWheel,parity}));
  if(process.argv.includes('--focused-only')){
    const report={measuredAt:new Date().toISOString(),sourceHashes:{player:hash(currentSource),helper:hash(await readFile('src/game/road-wheel-contact.ts','utf8')),exactDisabledPlayer:hash(oldSource)},
      negativeControls:negative,firstFrameRamp:ramp,rootParity:parity,cpu:'Prior update-only CPU evidence retained; no timing repeated for one-time place() call.'};
    const output=join(folder,'road-wheel-contact-placement-review.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,allNegativeControlsPass:negative.every(c=>c.pass),rampPlacementBadWheel:ramp.placed.badWheel,rampFirstUpdateBadWheel:ramp.afterFirstUpdate.badWheel,rootMotionBitIdentical:parity.every(p=>p.bitIdenticalRootMotion)}));
    process.exitCode=negative.some(c=>!c.pass)||parity.some(p=>!p.bitIdenticalRootMotion)||ramp.placed.badWheel||ramp.afterFirstUpdate.badWheel?1:0;
  }else{
  // Same packed, emitted city fixture for both real production Players. The
  // oracle is deliberately absent from every warmed/timed update loop.
  const world=on.packedDriveWorld({x:3983.1,z:-2073.2},true),edge=world.graph.byId.get('ad6f78f1-dc9_0'),start=world.graph.pointAt(edge,45,1,0);
  const a=on.actualPlayer(world.city),b=off.actualPlayer(world.city),yaw=Math.atan2(-start.hx,-start.hz),samples=[];
  const prepare=(p,moving)=>{p.place(start.x,start.z,yaw,start.y);for(let n=0;n<300;n++)p.update(1/60,controls,n/60);if(moving)p.speed=6;};
  const timed=(p,moving)=>{
    const chunk=moving?100:2000,chunks=moving?10:1,input=moving?{...controls,throttle:1}:controls;let elapsed=0;
    for(let c=0;c<chunks;c++){prepare(p,moving);const before=performance.now();for(let n=0;n<chunk;n++)p.update(1/60,input,n/60);elapsed+=performance.now()-before;}
    return{updates:chunk*chunks,elapsedMs:elapsed,microsecondsPerUpdate:elapsed*1000/(chunk*chunks)};
  };
  try{
    // Discard order-balanced warm samples before retaining paired observations.
    for(let n=0;n<2;n++){timed(a.player,false);timed(b.player,false);timed(b.player,true);timed(a.player,true);}
    for(const moving of[false,true])for(let sample=0;sample<10;sample++){
      const order=sample%2?['off','on']:['on','off'],values={};
      for(const label of order)values[label]=timed(label==='on'?a.player:b.player,moving);
      samples.push({mode:moving?'forward':'stationary',sample,order,...values,deltaMicroseconds:values.on.microsecondsPerUpdate-values.off.microsecondsPerUpdate});
    }
  }finally{a.dispose();b.dispose();}
  const median=values=>{const v=[...values].sort((a,b)=>a-b);return(v[(v.length-1)>>1]+v[v.length>>1])/2;};
  const cpuSummary=['stationary','forward'].map(mode=>{const rows=samples.filter(s=>s.mode===mode);return{mode,pairedSamples:rows.length,
    onMedianMicroseconds:median(rows.map(s=>s.on.microsecondsPerUpdate)),offMedianMicroseconds:median(rows.map(s=>s.off.microsecondsPerUpdate)),
    pairedDeltaMedianMicroseconds:median(rows.map(s=>s.deltaMicroseconds)),pairedDeltaRangeMicroseconds:[Math.min(...rows.map(s=>s.deltaMicroseconds)),Math.max(...rows.map(s=>s.deltaMicroseconds))]};});
  const report={measuredAt:new Date().toISOString(),sourceHashes:{player:hash(currentSource),helper:hash(await readFile('src/game/road-wheel-contact.ts','utf8')),exactDisabledPlayer:hash(oldSource)},
    negativeControls:negative,firstFrameRamp:ramp,rootParity:parity,cpu:{scope:'paired warmed local Node CPU per actual Player.update; no oracle inside timed loops; not FPS/device evidence',samples,summary:cpuSummary}};
  const output=join(folder,'road-wheel-contact-independent-review.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,allNegativeControlsPass:negative.every(c=>c.pass),rampPlacementBadWheel:ramp.placed.badWheel,rampFirstUpdateBadWheel:ramp.afterFirstUpdate.badWheel,
    rootMotionBitIdentical:parity.every(p=>p.bitIdenticalRootMotion),cpuSummary}));
  process.exitCode=negative.some(c=>!c.pass)||parity.some(p=>!p.bitIdenticalRootMotion)?1:0;
  }
}finally{await rm(temp,{recursive:true,force:true});}

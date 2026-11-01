import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {metroCorridors,metroPlatformAssemblies,projectMetroPath,sampleMetroPath} from '/Users/tharun/Documents/Codex/2026-10-29/roadster-v21-fixes/src/world/metro-geometry.ts';
import {supportedMetroHandoffParking,METRO_DELIVERY_WALK_DISTANCE} from '/Users/tharun/Documents/Codex/2026-10-29/roadster-v21-fixes/src/delivery/metro-platform.ts';
const root='/Users/tharun/Documents/Codex/2026-10-29/roadster-v21-fixes';
const core=JSON.parse(gunzipSync(readFileSync(root+'/public/city/core.pack.wasm')).toString());
const assemblies=metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight);
const eps=1e-7;
function strips(a,side,v){
 const path=a.corridor.center,stationS=projectMetroPath(path,[a.frame.cx,a.frame.cz]).s;
 const point=u=>{const p=sampleMetroPath(path,stationS+u);return{x:p.x-p.hz*side*v,z:p.z+p.hx*side*v};};
 const out=[];for(let u=-65;u<65;u+=10){const p=point(u),q=point(Math.min(65,u+10)),length=Math.hypot(q.x-p.x,q.z-p.z);if(length>1e-8)out.push({a:p,b:q,hx:(q.x-p.x)/length,hz:(q.z-p.z)/length,length});}return out;
}
function supported(p,pads){return pads.some(s=>{const dx=p.x-s.a.x,dz=p.z-s.a.z,along=dx*s.hx+dz*s.hz,cross=-dx*s.hz+dz*s.hx;return along>=-eps&&along<=s.length+eps&&Math.abs(cross)<=1.7+eps;});}
function guardClearance(p,guards){return Math.min(...guards.map(s=>{const cx=(s.a.x+s.b.x)/2,cz=(s.a.z+s.b.z)/2,dx=p.x-cx,dz=p.z-cz,along=Math.abs(dx*s.hx+dz*s.hz)-(s.length/2+.01),cross=Math.abs(-dx*s.hz+dz*s.hx)-.125;return Math.hypot(Math.max(along,0),Math.max(cross,0))+Math.min(Math.max(along,cross),0);}));}
const failures=[],allCameraFailures=[],rowFailures=[],rows=[];let candidateDoors=0,acceptedDoors=0,actorFeet=0,footSamples=0,cameraSamples=0;
let minimumCameraGuard=Infinity,worstCamera=null,minimumFootGuard=Infinity,worstFoot=null,minimumCameraEnvelopeGuard=Infinity,cameraEnvelopeGuardIntersections=0;
for(const a of assemblies)for(const track of a.corridor.tracks){
 let available=0;const stationS=projectMetroPath(track.path,[a.frame.cx,a.frame.cz]).s,side=-track.dir,pads=strips(a,side,5.6),guards=strips(a,side,7.4);
 for(const coach of[-22.1,0,22.1])for(const offset of[-6.5,0,6.5]){
  candidateDoors++;
  const q=sampleMetroPath(track.path,stationS+track.dir*(coach+offset),8),outward={x:-q.hz*side,z:q.hx*side};
  const door={x:q.x+outward.x*1.5,y:a.deckHeight+1.2,z:q.z+outward.z*1.5,hx:q.hx,hz:q.hz};
  const parking=supportedMetroHandoffParking(a,door,outward);if(!parking)continue;
  acceptedDoors++;available++;
  const label={assembly:a.key,station:a.source.name||a.stationId,stationId:a.stationId,line:a.lineId,direction:track.dir,side,coach,offset};let badFeet=0;
  for(let actor=0;actor<4;actor++){
   actorFeet++;const along=(actor-1.5)*.65,center={x:door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE+door.hx*along,z:door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE+door.hz*along};let badPoints=0;
   // A conservative 0.5x0.5m square per standing person, sampled every0.05m,
   // aligned with the actual source door heading and outward-facing pose.
   for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++){
    const p={x:center.x+door.hx*i*.05+outward.x*j*.05,z:center.z+door.hz*i*.05+outward.z*j*.05};footSamples++;
    if(!supported(p,pads)){badPoints++;if(failures.length<40)failures.push({...label,actor,point:p,center,footOffsetMetres:[i*.05,j*.05]});}
    const clearance=guardClearance(p,guards);if(clearance<minimumFootGuard){minimumFootGuard=clearance;worstFoot={...label,actor,point:p,clearance};}
   }
   if(badPoints)badFeet++;
  }
  if(badFeet)rowFailures.push({...label,badFeet});
  const camera={x:door.x+outward.x*(METRO_DELIVERY_WALK_DISTANCE+1.65)-door.hx*.15,y:door.y+2.1,z:door.z+outward.z*(METRO_DELIVERY_WALK_DISTANCE+1.65)-door.hz*.15};
  const cameraGuardClearance=guardClearance(camera,guards);if(cameraGuardClearance<minimumCameraGuard){minimumCameraGuard=cameraGuardClearance;worstCamera={...label,camera,clearance:cameraGuardClearance};}
  if(!supported(camera,pads)||cameraGuardClearance<=0)allCameraFailures.push({...label,camera,supported:supported(camera,pads),guardClearance:cameraGuardClearance});
  // Check a15cm camera near-field envelope too; this is geometry, not a
  // claim about the final rendered camera/culling result.
  let cameraEnvelopeUnsupported=0;for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){cameraSamples++;const point={x:camera.x+door.hx*i*.05+outward.x*j*.05,z:camera.z+door.hz*i*.05+outward.z*j*.05};if(!supported(point,pads))cameraEnvelopeUnsupported++;const clearance=guardClearance(point,guards);minimumCameraEnvelopeGuard=Math.min(minimumCameraEnvelopeGuard,clearance);if(clearance<=0)cameraEnvelopeGuardIntersections++;}
  rows.push({...label,footSupported:badFeet===0,cameraSupported:supported(camera,pads),cameraGuardClearance,cameraEnvelopeUnsupported});
 }
 if(!available)throw Error('No accepted doors for '+a.key+'/'+track.dir);
}
const hash=path=>createHash('sha256').update(readFileSync(root+'/'+path)).digest('hex');
const report={recordedAt:new Date().toISOString(),kind:'Independent source-geometry sample audit only; no repository/UI/art/device changes or approvals',inputs:{walkDistance:METRO_DELIVERY_WALK_DISTANCE,sourceHashes:Object.fromEntries(['src/delivery/metro-platform.ts','src/delivery/modules/metro-ride.ts','src/world/city.ts','public/city/core.pack.wasm'].map(p=>[p,hash(p)]))},counts:{assemblies:assemblies.length,directions:assemblies.length*2,candidateDoors,acceptedDoors,actorFeet,footSamples,cameraSamples,invalidActorRows:rowFailures.length,invalidCameraPoints:allCameraFailures.length,unsupportedCameraEnvelopes:rows.filter(r=>r.cameraEnvelopeUnsupported).length,cameraEnvelopeGuardIntersections},footprint:{shape:'0.5x0.5m standing foot square centred on each actor, actual door/outward axes',sampleStepMetres:.05,support:'Union of actual finite10m City platform-pad strips, hw1.7; no rounded endpoint extension',guard:'Actual finite outerguard7.4m offset, halfwidth0.125m and0.01m endpoint extension'},minimumCameraGuardClearance:minimumCameraGuard,minimumCameraEnvelopeGuardClearance:minimumCameraEnvelopeGuard,worstCamera,minimumFootGuardClearance:minimumFootGuard,worstFoot,invalidActorRows:rowFailures,invalidFootSamples:failures,invalidCameras:allCameraFailures,rows,limitations:['Finite dense footprint samples, not a proof for arbitrary imported mesh shoe outlines.','No camera art/framing, lighting or rendered occlusion verdict.','No device performance, thermal or battery claim.']};
writeFileSync('/tmp/roadster-metro-final-foot-camera-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,minimumCameraGuardClearance:minimumCameraGuard,minimumCameraEnvelopeGuardClearance:minimumCameraEnvelopeGuard,worstCamera,minimumFootGuardClearance:minimumFootGuard,worstFoot,invalidActorRows:rowFailures.slice(0,10),invalidFootSamples:failures.slice(0,5),invalidCameras:allCameraFailures.slice(0,5)},null,2));

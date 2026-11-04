import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { actualWorldWorker } from '../../tests/fixtures/actual-world-worker';
import { actualPlayer } from '../../tests/fixtures/actual-player';
import { EmittedPlayerGeometry, actualPlayerContactProbe } from '../../tests/fixtures/emitted-player-contact';
import { verifiedProfileData } from '../../src/world/road-profile-corrections';
import { currentRoadGradePatches } from '../../src/world/road-grades';
import { matchEmittedRoadTriangles } from './road-emitted-records';
import { initTemplates } from '../../src/core/util';
import type { RoadEdge } from '../../src/world/types';

const folder='/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/';
const oldFile=folder+'model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json';
const newFile='/tmp/anandbagh-two-road-physical-candidate-model-v1.json';
const tileFile=folder+'tileSupplement-c1e34a47bd09936c31359885c1d5ebef4a59556301035d9408e29c5ec7e8a2d0.json';
const sha=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
const ids=['28b00d08-4ff_1','01ceee91-29b_0'];
const idle={allowReverse:false,throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
function route(e:RoadEdge,reverse:boolean){
 const pts=e.pts.map((p,i)=>({x:p[0],y:e.elev?.[i]??0,z:p[1]}));if(reverse)pts.reverse();
 const arcs=[0];for(let i=1;i<pts.length;i++)arcs.push(arcs[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z));
 function at(s:number){let i=1;while(i<arcs.length-1&&arcs[i]<s)i++;const a=pts[i-1],b=pts[i],u=Math.max(0,Math.min(1,(s-arcs[i-1])/(arcs[i]-arcs[i-1])));return{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u};}
 function nearest(x:number,z:number){let best=Infinity,s=0;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(d<best){best=d;s=arcs[i-1]+t*(arcs[i]-arcs[i-1]);}}return{s,error:best};}
 return{at,nearest,total:arcs.at(-1)!};
}
function drive(city:any,geometry:EmittedPlayerGeometry,e:RoadEdge,hz:number,reverse:boolean,targetKmh:number,seeded:boolean){
 const path=route(e,reverse),start=path.at(5),ahead=path.at(6),actual=actualPlayer(city),p=actual.player,probe=actualPlayerContactProbe(p,geometry);
 p.place(start.x,start.z,Math.atan2(-(ahead.x-start.x),-(ahead.z-start.z)),start.y);
 let frames=0,time=0,progress=5,maxDeviation=0,airFrames=0,offRoad=0,maxSpeed=0,maxPitch=0,maxPitchRate=0,previousPitch=0,maxRootError=0;
 const events:any[]=[];
 const inspect=()=>{const contact=probe.measure(frames);const root=geometry.frame(p.pos.x,p.pos.z).nearestSupport(p.pos.x,p.pos.z,p.pos.y-.55);if(root)maxRootError=Math.max(maxRootError,Math.abs(p.pos.y-.55-root.y));
  if(events.length<12&&(contact.slab||contact.badWheel||contact.missingWheel))events.push({frame:frames,progress,pos:p.pos.toArray(),speed:p.speed,roadPitch:p.roadPitch,wheels:contact.wheels,slab:contact.slab});};
 try{
  inspect();for(let i=0;i<hz/2;i++){time+=1/hz;p.update(1/hz,idle,time);frames++;inspect();}
  if(seeded)p.speed=targetKmh/3.6;
  const maxFrames=hz*(path.total/Math.max(2,targetKmh/3.6)+25);
  while(progress<path.total-5&&frames<maxFrames){
   const n=path.nearest(p.pos.x,p.pos.z);progress=Math.max(progress,n.s);maxDeviation=Math.max(maxDeviation,n.error);
   const lookahead=Math.max(4,p.speed*.32),q=path.at(Math.min(path.total,progress+lookahead)),desired=Math.atan2(-(q.x-p.pos.x),-(q.z-p.pos.z));
   // Pure-pursuit input controller, not a pose/physics replacement. Compensate
   // for production speed-dependent steering rather than understeering at120.
   const sf=Math.min(1,Math.abs(p.speed)/6)/(1+Math.abs(p.speed)*.045);
   const steer=Math.max(-1,Math.min(1,-2*p.speed*Math.sin(angle(desired-p.yaw))/(lookahead*Math.max(.01,sf)*2.1)));
   const target=targetKmh/3.6,throttle=p.speed<target?1:0,brake=p.speed>target+.15?1:0;
   time+=1/hz;p.update(1/hz,{...idle,throttle,brake,steer},time);frames++;if(p.airborne||p.glide)airFrames++;if(!p.onRoad)offRoad++;
   maxSpeed=Math.max(maxSpeed,p.speed);maxPitch=Math.max(maxPitch,Math.abs(p.roadPitch));maxPitchRate=Math.max(maxPitchRate,Math.abs(p.roadPitch-previousPitch)*hz);previousPitch=p.roadPitch;inspect();
   if(n.error>15||events.some(v=>v.slab))break;
  }
  const contact=probe.result(),complete=progress>=path.total-5;
  const failures=[...(!complete?['incomplete drive']:[]),...(airFrames?['unexpected flight/glide']:[]),...(offRoad?['lost road support']:[]),...(maxDeviation>1?['centerline deviation exceeds1m']:[]),...(contact.slabFrames?['actual body inside emitted slab']:[]),...(contact.wheelFramesOutside1cm?['wheel datum outside1cm']:[]),...(contact.missingWheelFrames?['missing finite tyre support']:[]),...(contact.minTyreSupport!==null&&contact.minTyreSupport<-.01?['actual tyre penetration beyond1cm']:[]),...(contact.minBodySupport!==null&&contact.minBodySupport<-.01?['actual body penetration beyond1cm']:[])];
  return{road:e.id,hz,reverse,targetKmh,initialSpeedCondition:seeded?'seeded after stationary settle':'standing start with actual GO',complete,progress,total:path.total,frames,seconds:frames/hz,airFrames,offRoad,maxDeviation,maxSpeedKmh:maxSpeed*3.6,maxPitchRad:maxPitch,maxPitchRateRadPerSecond:maxPitchRate,maxRootError,placementRevision:p.placementRevision,contact,events,failures};
 }finally{actual.dispose();}
}
function stationary(city:any,geometry:EmittedPlayerGeometry,e:RoadEdge,hz:number,reverse:boolean){
 const path=route(e,reverse),actual=actualPlayer(city),p=actual.player,probe=actualPlayerContactProbe(p,geometry);let frame=0,samples=0;
 try{for(let s=3;s<path.total-3;s+=2){const a=path.at(s),b=path.at(s+.2);p.place(a.x,a.z,Math.atan2(-(b.x-a.x),-(b.z-a.z)),a.y);
   for(let n=0;n<hz/2;n++){p.update(1/hz,idle,++frame/hz);}probe.measure(frame);samples++;
  }return{road:e.id,hz,reverse,samples,contact:probe.result()};
 }finally{actual.dispose();}
}
export async function run(quick=false){
 const emitOnly=process.argv.includes('--emit-only');
 const oldBytes=readFileSync(oldFile),newBytes=readFileSync(newFile),tileBytes=readFileSync(tileFile),old=JSON.parse(oldBytes.toString()),candidate=JSON.parse(newBytes.toString()),tile=JSON.parse(tileBytes.toString());
 assert.equal(sha(oldBytes),'be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7');assert.equal(sha(newBytes),'86d78905d0eff2a153f292a73145762755d1beb87b9b6beed4eea8a5008c9c99');assert.equal(tile.sourceModelSHA256,sha(oldBytes));
 const changed=old.roads.filter((e:RoadEdge,i:number)=>JSON.stringify(e)!==JSON.stringify(candidate.roads[i])).map((e:RoadEdge)=>e.id);assert.deepEqual([...changed].sort(),[...ids].sort());
 for(const id of ids){const a=old.roads.find((e:RoadEdge)=>e.id===id),b=candidate.roads.find((e:RoadEdge)=>e.id===id);assert.deepEqual({...a,elev:null},{...b,elev:null});}
 assert.deepEqual(old.profiles,candidate.profiles);assert.deepEqual(old.endpointDisplacements,candidate.endpointDisplacements);assert.deepEqual(old.construction,candidate.construction);
 initTemplates();const saved={geometry:verifiedProfileData.geometry,tileProfiles:verifiedProfileData.tileProfiles};
 const sourcePackHashes:Record<string,string>={},versions:any[]=[];
 try{for(const[label,model]of[['old',old],['candidate',candidate]]as const){
  const fixture=await actualWorldWorker({allowInactive:true});
  try{
   // Explicit offline model-only adapter AFTER World conditioning. Never enable
   // source/profile files, and never feed these arrays back through underpasses.
   const byID=new Map<string,any>(model.roads.map((e:RoadEdge)=>[e.id,e]));
   verifiedProfileData.geometry={sourceRoadGeometryGeneration:model.sourceRoadGeometryGeneration,sourceGradeModelSHA256:sha(label==='old'?oldBytes:newBytes),sourcePrototypeSHA256:'independent-Anandbagh-diagnostic-only',supersedesRoadGradeProfileIds:[],nodes:model.endpointDisplacements,roads:model.geometryEdits.map((id:string)=>({id,model:byID.get(id)})),tileRoads:tile.transports,tileNodeSources:tile.nodeSources};
   verifiedProfileData.tileProfiles=[];
   Object.assign(fixture.initialization,{sourceRoadGeometryGeneration:model.sourceRoadGeometryGeneration,roadGrades:currentRoadGradePatches(model.roads),modelOverlayActive:true,railwayPatches:model.profiles.map((e:any)=>({id:e.id,elev:e.elev})),construction:model.construction});
   const selected=ids.map(id=>byID.get(id)as RoadEdge),points=selected.flatMap(e=>e.pts),bounds={minX:Math.min(...points.map(p=>p[0]))-20,maxX:Math.max(...points.map(p=>p[0]))+20,minZ:Math.min(...points.map(p=>p[1]))-20,maxZ:Math.max(...points.map(p=>p[1]))+20};
   const geometry=new EmittedPlayerGeometry(bounds),city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),waterGrid:new Map(),landmarkSurfaceGrid:new Map(),movingRail:[]},tiles=[...new Set(points.flatMap(p=>[-15,15].flatMap(dx=>[-15,15].map(dz=>`${Math.floor((p[0]+dx)/1000)}_${Math.floor((p[1]+dz)/1000)}`))))].sort();
   const emitted:any[]=[],contextEmitted:any[]=[],solidEmitted:any[]=[];let matched=0,unmatchedInBounds=0;
   const intersects=(p:number[][])=>Math.max(...p.map(p=>p[0]))>=bounds.minX&&Math.min(...p.map(p=>p[0]))<=bounds.maxX&&Math.max(...p.map(p=>p[2]))>=bounds.minZ&&Math.min(...p.map(p=>p[2]))<=bounds.maxZ;
   for(const key of tiles){const built=await fixture.build(key),records=matchEmittedRoadTriangles(built);geometry.collect(built);for(const name of['surfaceGrid','buildingGrid','walls','obstacles','waterGrid','landmarkSurfaceGrid'])for(const[k,list]of(built as any)[name])city[name].set(k,[...(city[name].get(k)||[]),...list]);
    for(const surfaces of built.surfaceGrid.values())for(const s of surfaces)if(s.e&&ids.includes(s.e.id))assert.deepEqual(s.e.elev,byID.get(s.e.id).elev,'actual worker must retain exact post-conditioned candidate');
    for(const r of records.matched){const row={tile:key,road:r.surface.e!.id,cap:r.triangulatedPatch,lift:r.surface.paintLift??0,segment:r.surface.i,points:r.points,quad:r.surface.roadQuad,centre:[[r.surface.ax,r.surface.az],[r.surface.bx,r.surface.bz]]};
     if(ids.includes(r.surface.e!.id)){matched++;emitted.push(row);}if(intersects(r.points))contextEmitted.push(row);
    }
    for(const b of built.buffers)if(b.mat==='st')for(let n=0;n<b.pos.length;n+=9){const points=[Array.from(b.pos.slice(n,n+3)),Array.from(b.pos.slice(n+3,n+6)),Array.from(b.pos.slice(n+6,n+9))];if(intersects(points))solidEmitted.push({tile:key,points});}
    unmatchedInBounds+=records.unmatched.filter(r=>intersects(r.points)).length;
   }
   const cases:any[]=[],staticCases:any[]=[];for(const e of(emitOnly?[]:selected))for(const hz of[30,60])for(const reverse of[false,true]){
    for(const targetKmh of(quick?[120]:[20,60,90,120])){const result=drive(city,geometry,e,hz,reverse,targetKmh,true);cases.push(result);console.log(JSON.stringify({stage:'drive',version:label,road:e.id,hz,reverse,targetKmh,complete:result.complete,failures:result.failures,maxSpeedKmh:result.maxSpeedKmh}));}
    if(!quick){const result=drive(city,geometry,e,hz,reverse,120,false);cases.push(result);staticCases.push(stationary(city,geometry,e,hz,reverse));}
   }
   fixture.verifySources();Object.assign(sourcePackHashes,fixture.sourcePackHashes);versions.push({label,modelSHA256:sha(label==='old'?oldBytes:newBytes),tiles,bounds,emittedGeometry:geometry.counts,matchedOwnRoadTriangles:matched,unmatchedInBounds,emitted,contextEmitted,solidEmitted,cases,staticCases});
  }finally{fixture.dispose();}
 }
 }finally{verifiedProfileData.geometry=saved.geometry;verifiedProfileData.tileProfiles=saved.tileProfiles;}
 return{measuredAt:new Date().toISOString(),scope:'Independent bounded CPU actual tileworker + raw pack/source9413 + literal Float32 + real Player constructor/update/body/tyres. Explicit post-conditioning model-only Node injection; NOT active World/release/native/device acceptance.',releaseApproved:false,quick,sourcePackHashes,inputs:{old:{path:oldFile,sha256:sha(oldBytes)},candidate:{path:newFile,sha256:sha(newBytes)},tiles:{path:tileFile,sha256:sha(tileBytes)}},versions,summary:{oldFailedCases:versions[0].cases.filter((r:any)=>r.failures.length).length,candidateFailedCases:versions[1].cases.filter((r:any)=>r.failures.length).length,casesPerVersion:versions[0].cases.length},gatesOpen:['standing-start and static full contact grid','independent finite own/co-elevation/grade and cross-road/rail clearance comparison','full joint feasibility/active World parity/cache/reuse/native driving']};
}

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { packedDriveWorld } from '../../../../tests/fixtures/packed-drive-world';
import { actualPlayer } from '../../../../tests/fixtures/actual-player';
import { EmittedPlayerGeometry, actualPlayerContactProbe } from '../../../../tests/fixtures/emitted-player-contact';
import { buildTile } from '../../../../src/world/city';
import type { RoadEdge } from '../../../../src/world/types';
import { initTemplates } from '../../../../src/core/util';

const args=process.argv.slice(2),option=(name:string,fallback:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const output=option('--output','docs/qa/evidence/main-expansion/reported-road-actual-player-current.json');
const quick=args.includes('--quick'),failFast=args.includes('--fail-fast'),lowQ=!args.includes('--full-quality');
const target={x:3983.1,z:-2073.2,yaw:280.3*Math.PI/180};
const bounds={minX:3430,maxX:4090,minZ:-2440,maxZ:-2010};
const idle={allowReverse:false,throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
const signed=(a:number)=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
type Point=[number,number,number];
function path(points:Point[]){
  const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2]));
  const total=cumulative.at(-1)!;
  const at=(s:number)=>{let i=1;while(i<cumulative.length-1&&cumulative[i]<s)i++;const a=points[i-1],b=points[i],u=Math.max(0,Math.min(1,(s-cumulative[i-1])/(cumulative[i]-cumulative[i-1]||1)));return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,z:a[2]+(b[2]-a[2])*u};};
  return{points,cumulative,total,at};
}
function clip(points:Point[],length:number){const p=path(points);if(p.total<=length)return points;const last=p.at(length);return[...points.filter((_,i)=>p.cumulative[i]<length),[last.x,last.y,last.z] as Point];}
function join(roads:RoadEdge[],ids:string[],reverseFirst=false){
  const points:Point[]=[];
  for(const [index,id]of ids.entries()){
    const e=roads.find(e=>e.id===id);assert.ok(e,`retain road ${id}`);
    const next=e.pts.map((p,i)=>[p[0],e.elev?.[i]??0,p[1]] as Point);
    if(index===0&&reverseFirst)next.reverse();
    if(points.length){const tail=points.at(-1)!,distance=(p:Point)=>Math.hypot(p[0]-tail[0],p[2]-tail[2]);if(distance(next.at(-1)!)<distance(next[0]))next.reverse();assert.ok(distance(next[0])<=.01,`source chain has a physical endpoint gap at ${id}`);next.shift();}
    points.push(...next);
  }
  return points;
}
function drive(city:any,geometry:EmittedPlayerGeometry,points:Point[],hz:number,label:string,reported=false){
  const route=path(points),startDistance=reported?0:2,goal=route.total-2,start=route.at(startDistance),ahead=route.at(startDistance+1);
  const actual=actualPlayer(city),p=actual.player,probe=actualPlayerContactProbe(p,geometry);
  p.place(start.x,start.z,reported?target.yaw:Math.atan2(-(ahead.x-start.x),-(ahead.z-start.z)),start.y);
  let frames=0,progress=startDistance,time=0,offRoad=0,onRoadMetres=0,maxDeviation=0,brakeFrames=0,throttleFrames=0,steerFrames=0,airFrames=0,stoppedForGeometry=false;
  let checkpoint=0;const stops=reported?[13,28]:[],snapshots:any[]=[];
  const inspect=()=>{
    const result=probe.measure(frames);
    if(snapshots.length===0||frames%hz===0||result.slab&&snapshots.length<12)snapshots.push({frame:frames,progress,position:p.pos.toArray(),speed:p.speed,onRoad:p.onRoad,yaw:p.yaw,matrixWorld:p.group.matrixWorld.toArray()});
    if(failFast&&result.slab)stoppedForGeometry=true;
  };
  try{
    inspect();
    for(let f=0;f<hz/2&&!stoppedForGeometry;f++){time+=1/hz;p.update(1/hz,idle,time);frames++;inspect();}
    const deadline=hz*(route.total/4+20);
    while(progress<goal&&frames<deadline&&!stoppedForGeometry){
      let nearest=progress,best=Infinity;
      for(let d=Math.max(startDistance,progress-2);d<=Math.min(route.total,progress+10);d+=.1){const q=route.at(d),error=Math.hypot(q.x-p.pos.x,q.z-p.pos.z);if(error<best){nearest=d;best=error;}}
      progress=Math.max(progress,nearest);maxDeviation=Math.max(maxDeviation,best);
      const q=route.at(Math.min(route.total,progress+4)),yaw=Math.atan2(-(q.x-p.pos.x),-(q.z-p.pos.z));
      const stop=stops[checkpoint],braking=stop!==undefined&&progress>=stop;
      if(braking&&p.speed<.05){checkpoint++;continue;}
      const throttle=braking?0:p.speed<6?1:0,brake=braking||p.speed>7.5?1:0,steer=Math.max(-1,Math.min(1,-signed(yaw-p.yaw)*2.7));
      if(throttle)throttleFrames++;if(brake)brakeFrames++;if(Math.abs(steer)>.01)steerFrames++;
      const before=p.pos.clone();time+=1/hz;p.update(1/hz,{...idle,throttle,brake,steer},time);frames++;if(!p.onRoad)offRoad++;else onRoadMetres+=Math.hypot(p.pos.x-before.x,p.pos.z-before.z);if(p.airborne||p.glide)airFrames++;inspect();
    }
    // Space is an ordinary stop and must not obtain progress through reversal.
    for(let f=0;f<hz*2&&p.speed>.02&&!stoppedForGeometry;f++){time+=1/hz;p.update(1/hz,{...idle,brake:1},time);frames++;brakeFrames++;inspect();}
    const contact=probe.result(),complete=progress>=goal;
    return{label,hz,reported,routeMetres:route.total,progress,complete,seconds:frames/hz,frames,offRoad,onRoadMetres,airFrames,maxDeviation,throttleFrames,brakeFrames,steerFrames,
      stoppedForGeometry,placementRevision:p.placementRevision,finalSpeed:p.speed,contact,snapshots,
      gateFailures:[...(!complete?['incomplete ordinary drive']:[]),...(airFrames?['unexpected airborne/rescue motion']:[]),...(p.placementRevision!==1?['unexpected relocation']:[]),...(contact.slabFrames?['actual visible Player vertices inside emitted slab']:[]),...(!reported&&offRoad?['required continuation leaves finite road support']:[]),
        ...(reported&&onRoadMetres<10?['reported approach does not drive at least10m on actual pavement']:[]),
        ...(contact.wheelFramesOutside1cm?['actual wheel-bottom contact exceeds1cm']:[]),...(!reported&&contact.missingWheelFrames?['required continuation lacks finite wheel support']:[]),
        ...(contact.minTyreSupport!==null&&contact.minTyreSupport<-.01?['actual tyre mesh penetrates emitted support by more than1cm']:[]),
        ...(contact.minBodySupport!==null&&contact.minBodySupport<-.02?['actual non-tyre body penetrates emitted support by more than2cm']:[])]};
  }finally{actual.dispose();}
}
function negativeControl(){
  const saved=JSON.parse(readFileSync('tests/fixtures/tarnaka-original-road-negative-control.json','utf8')),roads=saved.roads as RoadEdge[];
  const geometry=new EmittedPlayerGeometry(bounds),city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
  const nodes=Object.fromEntries(roads.flatMap(e=>[[e.from,e.pts[0]],[e.to,e.pts.at(-1)]]).filter(p=>p[0]));
  for(const i of[3,4]){
    const tile=buildTile({i,j:-3,roads,nodes,buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});geometry.collect(tile);
    for(const key of['surfaceGrid','buildingGrid','walls','obstacles']as const)for(const[cell,list]of tile[key])city[key].set(cell,[...(city[key].get(cell)||[]),...list]);
  }
  const actual=actualPlayer(city),p=actual.player,probe=actualPlayerContactProbe(p,geometry),distance=18;
  try{
    // Explicit negative calibration at the previously documented slab witness,
    // not a successful-driving claim. All pose settling is production update.
    p.place(target.x-Math.sin(target.yaw)*distance,target.z-Math.cos(target.yaw)*distance,target.yaw,1.6);
    probe.measure(0);for(let frame=1;frame<=30;frame++){p.update(1/60,idle,frame/60);probe.measure(frame);}
    const contact=probe.result();assert.ok(contact.slabFrames>0,'negative old-road control must detect the documented actual car/slab overlap');
    return{detected:true,provenance:saved.provenance,geometry:geometry.counts,contact};
  }finally{actual.dispose();}
}

initTemplates();
console.log(JSON.stringify({stage:'negative-control'}));
const negative=negativeControl();
console.log(JSON.stringify({stage:'negative-control-detected',frames:negative.contact.slabFrames,first:negative.contact.witnesses[0]}));
console.log(JSON.stringify({stage:'production-parity-tile-build',lowQ}));
const geometry=new EmittedPlayerGeometry(bounds),world=packedDriveWorld(target,lowQ,{onBuiltTile:tile=>geometry.collect(tile)});
assert.ok(geometry.counts.road>0&&geometry.counts.solid>0,'collect actual road/soffit buffers before fixture clears them');
const reportedPoints:Point[]=[[target.x,0,target.z],[target.x-Math.sin(target.yaw)*40,0,target.z-Math.cos(target.yaw)*40]];
const routes=[
  {label:'reported-bypass-130m',points:clip(join(world.roads,['ad6f78f1-dc9_0']),130)},
  {label:'tarnaka-flyover-170m',points:clip(join(world.roads,['23427c8c-e37_0']),170)},
  {label:'opposite-carriageway-170m',points:clip(join(world.roads,['bdf0bad3-182_0'],true),170)},
  {label:'west-two-edge-fork',points:join(world.roads,['38a7824d-0e1_0','38a7824d-0e1_1'])},
  {label:'east-two-edge-fork',points:join(world.roads,['37e421d1-548_0','37e421d1-548_1'])},
];
const results:any[]=[];
for(const hz of[30,60]){
  const reported=drive(world.city,geometry,reportedPoints,hz,'exact-reported-W-Space-steer',true);results.push(reported);console.log(JSON.stringify({case:reported.label,hz,complete:reported.complete,progress:reported.progress,slabFrames:reported.contact.slabFrames,gateFailures:reported.gateFailures}));
  for(const route of(quick?routes.slice(0,1):routes))for(const reverse of[false,true]){
    const result=drive(world.city,geometry,reverse?[...route.points].reverse():route.points,hz,route.label+(reverse?'-reverse':'-forward'));results.push(result);
    console.log(JSON.stringify({case:result.label,hz,complete:result.complete,progress:result.progress,slabFrames:result.contact.slabFrames,gateFailures:result.gateFailures}));
  }
}
const hashes:Record<string,string>=process.env.ROAD_ACTUAL_PLAYER_SOURCE_HASHES?JSON.parse(process.env.ROAD_ACTUAL_PLAYER_SOURCE_HASHES):{};
const sourceChangedDuringRun=Object.keys(hashes).filter(file=>createHash('sha256').update(readFileSync(file)).digest('hex')!==hashes[file]);
const report={measuredAt:new Date().toISOString(),scope:'CPU actual Player frames + bounded actual Float32 emitted road/soffit; no browser/device/publication acceptance',hashes,sourceChangedDuringRun,
  thresholds:{legacySlabMinimumTopAboveFeet:.45,legacyVertexClearance:.02,legacyTopToSoffit:[.85,1.05],additionalWheelContactGate:.01,minimumReportedPavementDrive:10},
  options:{quick,failFast,lowQ,bounds},geometry:geometry.counts,negativeControl:negative,results,
  completedCases:results.filter(r=>r.complete).length,failedCases:results.filter(r=>r.gateFailures.length).length,
  wheelContactGate:'Signed wheel-bottom contact and actual tyre mesh penetration are gated at1cm without excluding startup frames or weakening any existing slab gate. Existing support paintLift is separately declared metadata; heights are emitted triangle planes. Missing wheel support at the exact reported shoulder is recorded, while required continuation wheels must have finite pavement.',
  stagedForFinalCandidate:true};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,cases:results.length,completedCases:report.completedCases,failedCases:report.failedCases,negativeControlDetected:negative.detected,geometry:geometry.counts,sourceChangedDuringRun}));
process.exitCode=report.failedCases||geometry.counts.missingLift||sourceChangedDuringRun.length?1:0;

import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';import{build}from'esbuild';
const temp=await mkdtemp(join(tmpdir(),'actual-roof-rider-'));
let count=0;async function test(name,run){await run();count++;console.log('PASS '+name);}
try{
 const outfile=join(temp,'api.mjs');await build({stdin:{contents:"export*from'./src/game/rail-rider-clearance';export*from'./src/game/rail-rider-native-soffits';export*from'./src/game/rail-rider-car-envelope';export{buildRailwayRun}from'./src/game/railway-flow';export{MovingRailInteraction}from'./src/game/moving-rail';export{Game}from'./src/game/Game';export{actualPlayer}from'./tests/fixtures/actual-player';export{buildTile}from'./src/world/city';export{roadster}from'./src/world/vehicles';export{RailTrains}from'./src/game/rail';export{TakeoffKickflip}from'./src/game/takeoff-kickflip';export{initTemplates}from'./src/core/util';export*as THREE from'three';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true'},logLevel:'error'});
 const A=await import(pathToFileURL(outfile));A.initTemplates();
 const material=new A.THREE.MeshBasicMaterial(),car=A.roadster(new Proxy({},{get:(_,k)=>k==='jet'?null:material}),{logo:material,plate:material,side:material,rear:material});
 car.cargo.visible=true;car.group.updateMatrixWorld(true);const box=new A.THREE.Box3().setFromObject(car.group),center=(box.min.y+box.max.y)/2;
 // The circumsphere about the real model's roll centre bounds every roll/yaw.
 // Deployment is a separate measured conservative union, not a thinner car.
 let radius=0,launchRadius=0,minimum=Infinity,maximum=-Infinity;
 for(let pose=0;pose<=100;pose++){
  car.setDeployment(pose/100);car.group.updateMatrixWorld(true);
  car.group.traverse(node=>{if(!node.isMesh||node.userData.roadsterDecal)return;const p=node.geometry.getAttribute('position');for(let i=0;i<p.count;i++){const v=new A.THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(node.matrixWorld);radius=Math.max(radius,Math.hypot(v.x,v.z));launchRadius=Math.max(launchRadius,Math.hypot(v.x,v.y-center,v.z));minimum=Math.min(minimum,v.y);maximum=Math.max(maximum,v.y);}});
 }
 // Positive numerical/launch reserve; it does not relax physical clearance.
 const envelope={radius:radius+.02,launchRadius:Math.max(radius,launchRadius)+.1,bottom:minimum,top:maximum,launchBottom:minimum-1,launchTop:maximum+2};
 const revision='fixture-actual-City-source385-fitted-Y-5.7';
 function tile(height=5.7){return A.buildTile({i:0,j:0,roads:[{id:'source-road',cls:'secondary',w:9.2,lanes:2,pts:[[200,350],[800,350]],elev:[height,height],from:'a',to:'b'}],nodes:{a:[200,350],b:[800,350]},buildings:[],boards:[],furniture:[],areas:[]},{lowQ:true});}
 const actual=tile(),prepared=A.prepareNativeSoffitTile(actual,revision),geometry=new A.LoadedNativeSoffits(revision,[prepared]);
 const track={pts:[[500,100],[500,900]],elev:[0,0]},run=A.buildRailwayRun(new Map([['actual-flat-track',track]]),track);
 const train={id:'rail:ordinary:4',story:false,run,direction:1,speed:20};
 const rider=(extra={})=>({pos:{x:500,y:.11+4.175+.55,z:200},placementRevision:0,supportId:'rail:ordinary:4:7',flying:false,descending:false,jumping:false,...extra});
 const cityText=await readFile('src/world/City.ts','utf8');
 await test('actual native slab triangles match current City thickness and source road, not fictitious cap solids',()=>{
  assert.ok(cityText.includes('const th = 0.9;'));assert.equal(prepared.slabs.length,2);assert.equal(prepared.unknown.length,0);
  for(const s of prepared.slabs){assert.equal(s.road,'source-road');assert.equal(s.geometryRevision,revision);for(const p of s.triangle)assert.equal(p[1],Math.fround(5.7-.9));}
 });
 await test('cooperative cold preparation yields before publishing and returns the identical complete native index',()=>{
  const steps=A.prepareNativeSoffitTileSteps(actual,revision);let yielded=0,result;
  for(;;){const next=steps.next();if(next.done){result=next.value;break;}yielded++;}
  assert.ok(yielded>0);assert.deepEqual(result,prepared);
  const cancelled=A.prepareNativeSoffitTileSteps(actual,revision);assert.equal(cancelled.next().done,false);assert.equal(cancelled.return().done,true,'A retired native tile can cancel its partial job without publishing');
 });
 await test('thin diagonal and endpoint disks detect high-speed complete capsule sweeps',()=>{
  const triangle=[[40,5,0],[40.0001,5,0],[40,5,100]],a={x:0,y:0,z:20},b={x:100,y:0,z:20};const hit=A.sweptDiskTriangle(a,b,.5,triangle);assert.ok(hit&&hit[0]<.4&&hit[1]>.4);
  assert.ok(A.sweptDiskTriangle({x:39.6,y:0,z:-.3},{x:39.6,y:0,z:-.3},.5,triangle));
  assert.equal(A.sweptDiskTriangle({x:39,y:0,z:-1},{x:39,y:0,z:-1},.5,triangle),null);
 });
 await test('real coach rider stops upstream while the actual bare train envelope remains a separate test',()=>{
  const guard=new A.RailRiderClearance(),stop=guard.prepare(rider(),[train],geometry,envelope,0);assert.ok(stop&&stop.reason==='soffit');assert.ok(stop.distance>100&&stop.distance<150);assert.equal(stop.train,train.id);
  assert.ok(.11+4.6<5.7-.9,'bare train can pass while car rider cannot');assert.ok(rider().pos.y+envelope.top>5.7-.9);
 });
 await test('relative GO cannot tunnel into the slab even when the occupied train is stationary',()=>{
  const guard=new A.RailRiderClearance(),r=rider();guard.prepare(r,[train],geometry,envelope,120/3.6);const result=guard.guardRelativeMotion(geometry,r.pos,{...r.pos,z:700},envelope);assert.equal(result.reason,'soffit');assert.ok(result.fraction>0&&result.fraction<.4);
  const top={...r.pos,y:9};assert.equal(guard.guardRelativeMotion(geometry,top,{...top,z:700},envelope).reason,'clear');
 });
 await test('Fly detachment preserves the hold until the whole measured car clears, and placement resets the latch',()=>{
  const guard=new A.RailRiderClearance(),r=rider();const first=guard.prepare(r,[train],geometry,envelope,0);assert.ok(first);
  assert.ok(guard.prepare({...r,flying:true,supportId:null},[train],geometry,envelope,0),'Fly flag alone cannot restart the train');
  const airborne={...r,pos:{...r.pos,y:15},flying:true,supportId:null};assert.equal(guard.prepare(airborne,[train],geometry,envelope,0),null);
  guard.prepare(r,[train],geometry,envelope,0);assert.equal(guard.prepare({...r,placementRevision:1,supportId:null},[train],geometry,envelope,0),null);
 });
 await test('full loaded swept domain and actual source matches are mandatory; unknown blocks only an occupied train',()=>{
  const empty=new A.LoadedNativeSoffits(revision,[]),guard=new A.RailRiderClearance();assert.equal(guard.prepare(rider({supportId:null}),[train],empty,envelope,0),null);assert.equal(guard.prepare(rider(),[train],empty,envelope,0).reason,'unknown');
  const broken=A.prepareNativeSoffitTile({...actual,buffers:[]},revision);assert.ok(broken.unknown.length);const g=new A.LoadedNativeSoffits(revision,[broken]);assert.equal(g.known({x:500,y:0,z:200},{x:500,y:0,z:700},2),false);
  assert.equal(geometry.known({x:500,y:0,z:200},{x:2500,y:0,z:200},2),false,'loaded endpoints cannot prove a missing middle tile');
 });
 await test('safe overhead, story trains and camera-independent support IDs do not inherit a false low-bridge stop',()=>{
  const high=new A.LoadedNativeSoffits(revision,[A.prepareNativeSoffitTile(tile(12),revision)]),guard=new A.RailRiderClearance();assert.equal(guard.prepare(rider(),[train],high,envelope,0),null);
  assert.ok(new A.RailRiderClearance().prepare(rider(),[{...train,story:true}],geometry,envelope,0),'A story label alone cannot waive rider clearance');
  assert.equal(new A.RailRiderClearance().prepare(rider(),[{...train,story:true,storyClearanceVerified:true}],geometry,envelope,0),null);
  const a=guard.prepare(rider(),[train],geometry,envelope,0),b=guard.prepare({...rider(),cameraYaw:Math.PI},[train],geometry,envelope,0);assert.deepEqual(a,b);
 });
 await test('same measured whole-mesh launch disk encloses cargo, deployed equipment and every kickflip phase',()=>{
  const flip=new A.TakeoffKickflip(Math.max(Math.abs(box.min.x),Math.abs(box.max.x))+.04,(box.max.y-box.min.y)/2+.04);flip.begin();
  for(let step=0;step<100;step++){
   const p=flip.update(.82/100);for(let ix=0;ix<8;ix++){const x=ix&1?box.min.x:box.max.x,y=(ix&2?box.min.y:box.max.y)-center,z=ix&4?box.min.z:box.max.z;const horizontal=Math.hypot(x*Math.cos(p.roll)-y*Math.sin(p.roll),z);assert.ok(horizontal<=envelope.launchRadius+.15);}
  }
 });
 await test('production car measurement preserves every local transform and bounds actual deployment/kickflip vertices',()=>{
  car.setDeployment(0);car.group.updateMatrixWorld(true);const original=new A.THREE.Box3().setFromObject(car.group),rollCenter=(original.min.y+original.max.y)/2,pivot=new A.THREE.Group();pivot.name='Takeoff kickflip';pivot.position.y=rollCenter;
  for(const child of[...car.group.children]){child.position.y-=rollCenter;pivot.add(child);}car.group.add(pivot);car.group.updateMatrixWorld(true);
  const transforms=()=>{const rows=[];car.group.traverse(n=>rows.push([n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));return rows;};const before=transforms();
  const measured=A.measureRailRiderEnvelope({...car,thrusterDeployment:0});assert.deepEqual(transforms(),before);
  for(let step=0;step<=40;step++){
   car.setDeployment(step/40);pivot.rotation.z=step/40*Math.PI*2;pivot.position.y=rollCenter+.8;car.group.updateMatrixWorld(true);
   car.group.traverse(node=>{if(!node.isMesh||node.userData.roadsterDecal)return;const p=node.geometry.getAttribute('position');for(let i=0;i<p.count;i++){const v=new A.THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(node.matrixWorld);assert.ok(Math.hypot(v.x,v.z)<=measured.launchRadius+1e-7);assert.ok(v.y>=measured.launchBottom&&v.y<=measured.launchTop);}});
  }
  pivot.rotation.z=0;pivot.position.y=rollCenter;
 });
 await test('actual RailTrains brakes before the rider stop and resumes its saved cruise; null stop retains identical motion',()=>{
  function fleet(){const r=new A.RailTrains(material),cars=Array.from({length:8},()=>new A.THREE.Mesh(r.geo('#2277bb'),material));r.trains.push({id:train.id,run,s:400,dir:1,v:20,cars});return r;}
  const normal=fleet(),untouched=fleet();for(let k=0;k<50;k++){normal.setRiderStop(null);normal.update(.02,500,500,new Map());untouched.update(.02,500,500,new Map());assert.equal(normal.trains[0].s,untouched.trains[0].s);assert.equal(normal.trains[0].v,untouched.trains[0].v);}
  const held=fleet(),start=held.trains[0].s;held.setRiderStop({train:train.id,distance:80});for(let k=0;k<1500;k++)held.update(.02,500,500,new Map());assert.ok(held.trains[0].s<=start+80+1e-9,`${held.trains[0].s} exceeds ${start+80}`);assert.ok(held.trains[0].v<.01);
  held.setRiderStop(null);for(let k=0;k<100;k++)held.update(.02,500,500,new Map());assert.ok(held.trains[0].s>start+80&&held.trains[0].v>0);
 });
 await test('an unprepared frontier gives the occupied train a stable braking distance, not repeated zero/resume jitter',()=>{
  const live=new A.RailTrains(material),cars=Array.from({length:8},()=>new A.THREE.Mesh(live.geo('#2277bb'),material));live.trains.push({id:train.id,run,s:275.05,dir:1,v:20,cars});live.update(0,500,200,new Map());
  const pending={revision,known:(a,b,r)=>Math.max(a.z,b.z)+r<=350,near:()=>[]},guard=new A.RailRiderClearance();let beganBraking=false,previous=20;
  for(let i=0;i<1600;i++){
   const body=live.bodies[7],r=rider({pos:{x:body.x,y:body.roof+.55,z:body.z}}),stop=guard.prepare(r,live.roofRiderTrains,pending,envelope,0);live.setRiderStop(stop);live.update(.02,500,r.pos.z,new Map());
   const speed=live.trains[0].v;if(speed<19.9)beganBraking=true;if(beganBraking)assert.ok(speed<=previous+1e-8,'Pending preparation cannot alternate braking and resumption');previous=speed;
  }
  assert.ok(live.trains[0].v<.01);assert.ok(live.bodies[7].z+envelope.launchRadius<350);
 });
 await test('production Player, carry frames and Game guard stop safely, then manual Fly plus held GO escape without Y deadlock',()=>{
  const city={...actual,movingRail:[]},live=new A.RailTrains(material),cars=Array.from({length:8},()=>new A.THREE.Mesh(live.geo('#2277bb'),material));live.trains.push({id:train.id,run,s:275.05,dir:1,v:20,cars});live.update(0,500,200,new Map());city.movingRail=live.bodies;
  const fixture=A.actualPlayer(city),p=fixture.player;try{
   p.setCarryingPizza(true);const measured=A.measureRailRiderEnvelope(p),contacts=new A.MovingRailInteraction(),guard=new A.RailRiderClearance(),body=live.bodies[7];p.pos.set(body.x,body.roof+.55,body.z);p.yaw=Math.PI;p.group.position.copy(p.pos);contacts.beforePlayer(p,city.movingRail,false,0);assert.equal(contacts.afterPlayer(p,0).carried,true);
   const game={player:p,railRiderClearance:guard,railRiderEnvelope:measured,riderGeometry:()=>geometry};let elapsed=0;
   const tick=inp=>{
    const start={x:p.pos.x,y:p.pos.y,z:p.pos.z};const stop=guard.prepare({pos:p.pos,placementRevision:p.placementRevision,supportId:contacts.supportId,flying:p.flying,descending:p.descending,jumping:p.jumping},live.roofRiderTrains,geometry,measured,p.speed);live.setRiderStop(stop);live.update(.02,p.pos.x,p.pos.z,new Map());city.movingRail=live.bodies;contacts.beforePlayer(p,city.movingRail,!!inp.flyPressed,.02);p.update(.02,inp,elapsed);A.Game.prototype.guardRoofRiderPose.call(game,start);contacts.afterPlayer(p,.02);A.Game.prototype.guardRoofRiderPose.call(game,start);elapsed+=.02;
    p.group.updateMatrixWorld(true);const bounds=new A.THREE.Box3().setFromObject(p.group);if(bounds.max.z>=345.4&&bounds.min.z<=354.6&&bounds.max.x>=200&&bounds.min.x<=800)assert.ok(bounds.max.y<4.8||bounds.min.y>5.7,'Actual full car box penetrated native slab volume');
   };
   const idle={throttle:0,brake:0,steer:0,boost:false,flyPressed:false};for(let i=0;i<1600;i++)tick(idle);assert.ok(live.trains[0].v<.01);assert.ok(p.pos.z<345.4-measured.launchRadius);const stoppedY=p.pos.y;
   tick({...idle,throttle:1,flyPressed:true});assert.equal(p.flying,true);for(let i=0;i<150;i++)tick({...idle,throttle:1});assert.ok(p.pos.y>stoppedY+8,'Manual Fly must keep climbing even when GO is held at the safety boundary');assert.equal(guard.active,false);assert.ok(live.trains[0].v>0,'Ordinary train resumes after actual whole-car departure');
  }finally{fixture.dispose();}
 });
 await test('stale native revision and invalid measured envelopes reject instead of silently passing',()=>{
  assert.throws(()=>new A.LoadedNativeSoffits('other',[prepared]),/Mixed native/);
  assert.throws(()=>A.limitRiderSweep(geometry,rider().pos,rider().pos,{...envelope,top:NaN}),/Invalid measured/);
  const bad={...geometry,revision:'other',known:()=>true,near:()=>prepared.slabs};assert.throws(()=>A.limitRiderSweep(bad,rider().pos,{...rider().pos,z:700},envelope),/Stale/);
 });
 console.log(JSON.stringify({groups:count,actualCitySlabs:prepared.slabs.length,structureTrianglesInspected:prepared.structureTrianglesInspected,measuredEnvelope:envelope,gameMovementGuardWired:true}));
}finally{await rm(temp,{recursive:true,force:true});}

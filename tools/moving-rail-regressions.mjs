// Production train impacts, moving roofs and route-identity regressions; offline, no browser state.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os'; import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from '../game/node_modules/esbuild/lib/main.js';
const root=fileURLToPath(new URL('../',import.meta.url)),out=await mkdtemp(join(tmpdir(),'roadster-moving-rail-'));
let checks=0; const test=async(name,run)=>{await run();checks++;console.log(`PASS ${name}`);};
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} differs from ${b}`);
try {
 await build({stdin:{contents:"export * from './game/src/game/moving-rail';export{supportAt,roofUnder,collideBuildings}from'./game/src/game/physics';export{addLandmarkSurface}from'./game/src/world/landmark-support';export{Player}from'./game/src/game/player';export{MetroTrains}from'./game/src/game/metro';export{RailTrains}from'./game/src/game/rail';export{buildTile}from'./game/src/world/city';export{FullMap}from'./game/src/ui/map';export*from'./game/src/world/metro-geometry';export{initTemplates}from'./game/src/core/util';export{Group,Mesh,MeshBasicMaterial,Vector3,BoxGeometry,RingGeometry}from'./game/node_modules/three/build/three.module.js';",resolveDir:root,loader:'ts'},outfile:join(out,'production.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const {MovingRailFrames,MovingRailInteraction,railLocal,railRoofAt,movingRailSupport,supportAt,roofUnder,collideBuildings,addLandmarkSurface,Player,MetroTrains,RailTrains,buildTile,FullMap,metroCorridors,METRO_LINE_COLORS,metroLineColor,initTemplates,Group,Mesh,MeshBasicMaterial,Vector3,BoxGeometry,RingGeometry}=await import(pathToFileURL(join(out,'production.mjs')));
 initTemplates({rbox:new BoxGeometry(1,1,1),ring:new RingGeometry(1,1.35,12)});
 const shape=(extra={})=>({id:'coach',x:0,y:0,z:0,hx:1,hz:0,halfWidth:1.5,halfLength:11,bottom:.15,roof:4.2,...extra});
 const city=()=>({surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[]});
 const player=(c=city(),extra={})=>Object.assign(Object.create(Player.prototype),{city:c,pos:new Vector3(0,.55,0),yaw:-Math.PI/2,speed:0,vy:0,steerVis:0,flying:false,descending:false,charge:0,chargeCap:20,earnT:0,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,lastEdge:null,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,placementRevision:0,group:new Group(),glow:new Group(),light:new Group(),wheels:[],wheelRollers:[],animateThrusters(){},...extra});
 const input={throttle:0,brake:0,steer:0,boost:false,flyPressed:false};
 const tick=(p,c,f,controller,s,inp=input,dt=.02,t=0)=>{c.movingRail=f.set([s]);controller.beforePlayer(p,c.movingRail,inp.flyPressed,dt);p.update(dt,inp,t);return controller.afterPlayer(p,dt);};
 await test('shared corridor colors override mislabeled source colors without recoloring the physical train model',()=>{
   assert.deepEqual(Object.keys(METRO_LINE_COLORS).sort(),['blue','green','red']);
   for(const id of ['red','blue','green']) assert.equal(metroCorridors([{id,color:'#ffffff',pts:[[0,0],[800,0]]}])[0].color,METRO_LINE_COLORS[id]);
   assert.equal(metroLineColor('RED'),METRO_LINE_COLORS.red);assert.equal(metroLineColor('unknown'),'#697587');
 });
 await test('station name boards face both road approaches and carry the shared route identity',()=>{
   const built=buildTile({i:0,j:0,roads:[],nodes:{},buildings:[],boards:[],furniture:[],areas:[]},{lowQ:true,metro:{lines:[{id:'red',pts:[[100,500],[900,500]]}],stations:[{id:'test',name:'Ameerpet',te:'అమీర్‌పేట్',lines:['red','blue'],p:[500,500]}],pillars:[],deckHeight:11}});
   const signs=built.signs.filter(s=>/^mst_road_test_-?1$/.test(s.id));assert.equal(signs.length,2);
   for(const sign of signs){assert.equal(sign.text,'AMEERPET');const f=[-sign.right[2],sign.right[0]];assert.ok(Math.abs(f[0])>.999&&Math.abs(f[1])<1e-8);assert.ok((sign.c[0]-500)*f[0]>0,'board faces the approaching road direction');assert.ok(sign.c[1]>7&&sign.c[1]<12);}
   assert.ok(signs[0].right[2]*signs[1].right[2]<0);
   assert.ok(built.signs.filter(s=>s.id.startsWith('mst_road_test_')&&s.id.endsWith('_te')).length===2);
 });
 await test('map loading assigns each normalized route its own shared color rather than painting all lines green',async()=>{
   const priorFetch=globalThis.fetch,priorPath=globalThis.Path2D;
   globalThis.fetch=async()=>new Response(JSON.stringify({roads:{},areas:[],metro:[]}));
   globalThis.Path2D=class {points=[];moveTo(x,z){this.points.push([x,z]);}lineTo(x,z){this.points.push([x,z]);}closePath(){}};
   try {
     const lines=['red','blue','green'].map((id,i)=>({id,color:'#ffffff',pts:[[100,i*100],[900,i*100]]}));
     const map=Object.assign(Object.create(FullMap.prototype),{zone:{metro:{lines}},src:{mapUrl:'http://fixture.map/'}});
     await map.load();assert.equal(map.layers.metro.length,3);assert.deepEqual(map.layers.metro.map(x=>x.color),['red','blue','green'].map(id=>METRO_LINE_COLORS[id]));
     for(let i=0;i<3;i++){near(map.layers.metro[i].p.points[0][1],i*100);near(map.layers.metro[i].p.points.at(-1)[0],900);}
   }finally{globalThis.fetch=priorFetch;globalThis.Path2D=priorPath;}
 });
 await test('moving roofs are height-gated and static streets below a train retain their own support',()=>{
   const c=city(),f=new MovingRailFrames();c.movingRail=f.set([shape({y:10,bottom:10.15,roof:14.2})]);
   assert.equal(supportAt(c,0,0,0).kind,'ground');assert.equal(movingRailSupport(c.movingRail,0,0,0),null);
   const high=supportAt(c,0,0,15);assert.equal(high.kind,'rail');near(high.y,14.2);
   assert.equal(railRoofAt(c.movingRail[0],12,0),null);near(roofUnder(c,[[0,0]]),14.2);
   assert.equal(movingRailSupport(c.movingRail,0,0,13.5),null,'a car touching the side below roof height must not step through the chassis onto its roof');
 });
 await test('a car falling onto a train roof lands using production Player physics and rides without clipping',()=>{
   const c=city(),f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(c,{pos:new Vector3(0,8,0),descending:true,vy:-4});
   for(let i=0;i<200;i++)tick(p,c,f,controller,shape(),input,.02,i*.02);
   near(p.pos.y,4.75);assert.equal(p.descending,false);assert.equal(p.lastKind,'rail');assert.equal(p.onRoad,false);
   const start=p.pos.x;
   for(let i=1;i<=100;i++)tick(p,c,f,controller,shape({x:i*.2}),input,.02,4+i*.02);
   near(p.pos.x-start,20);near(p.pos.y,4.75);assert.equal(p.speed,0);assert.ok(p.group.position.distanceTo(p.pos)<1e-6);
 });
 await test('a parked car follows coach rotation in its moving local frame',()=>{
   const c=city(),f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(c,{pos:new Vector3(3,4.75,.2)});
   tick(p,c,f,controller,shape());const old=railLocal(c.movingRail[0],p.pos.x,p.pos.z);
   const s=shape({x:2,z:1,hx:Math.cos(.2),hz:Math.sin(.2)});tick(p,c,f,controller,s);
   const local=railLocal(c.movingRail[0],p.pos.x,p.pos.z);near(local.along,old.along);near(local.side,old.side);near(p.yaw,-Math.PI/2-.2);
 });
 await test('a carried car can drive relative to the roof, leave the end and take off without staying glued',()=>{
   const c=city(),f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(c,{pos:new Vector3(0,4.75,0)});tick(p,c,f,controller,shape());
   for(let i=1;i<=40;i++)tick(p,c,f,controller,shape({x:i*.1}),{...input,throttle:1},.02,i*.02);
   assert.ok(p.pos.x-4>1,'throttle moves the car along the roof instead of replacing the carrier displacement');
   const before=p.pos.x;const hit=tick(p,c,f,controller,shape({x:4.1}),{...input,flyPressed:true});assert.equal(p.flying,true);assert.equal(hit.carried,false);assert.ok(p.pos.y>4.75);assert.ok(p.pos.x-before<.2,'takeoff does not inherit a sticky carrier transform');
   const q=player(c,{pos:new Vector3(10.8,4.75,0),speed:14}),endController=new MovingRailInteraction();
   for(let i=0;i<30;i++)tick(q,c,f,endController,shape(),input,.02,i*.02);
   assert.ok(q.pos.x>11);assert.ok(q.pos.y<4.7,'driving off the roof returns to falling physics');
 });
 await test('train front impact pushes the car forward rather than moving through it',()=>{
   const f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player();f.set([shape({x:-15})]);const bodies=f.set([shape({x:-12})]);
   controller.beforePlayer(p,bodies,false,.1);const result=controller.afterPlayer(p,.1);
   assert.equal(result.hit,true);assert.ok(result.impact>20);assert.ok(p.pos.x>1);assert.ok(p.speed>20);assert.ok(p.pos.x-bodies[0].x>=13.3);
 });
 await test('a fast car cannot tunnel through a coach side and lateral train motion imparts a push',()=>{
   const f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(city(),{pos:new Vector3(0,.55,6),yaw:0,speed:60});const bodies=f.set([shape()]);
   controller.beforePlayer(p,bodies,false,.1);p.pos.z=-6;const result=controller.afterPlayer(p,.1);
   assert.equal(result.hit,true);assert.ok(p.pos.z>3.8);assert.ok(Math.abs(p.speed)<1e-5);
   const side=player(city(),{pos:new Vector3(0,.55,3.2)}),sideController=new MovingRailInteraction(),frames=new MovingRailFrames();frames.set([shape()]);const moved=frames.set([shape({z:1})]);
   sideController.beforePlayer(side,moved,false,.1);const pushed=sideController.afterPlayer(side,.1);assert.equal(pushed.hit,true);assert.ok(side.pos.z>3.5);assert.ok(pushed.impact>9);
   const z=side.pos.z;sideController.beforePlayer(side,frames.set([shape({z:1})]),false,.1);assert.ok(side.pos.z>z,'lateral impulse persists briefly instead of only drawing a bump');
 });
 await test('grade separation and roof clearance prevent ghost side impacts above or below trains',()=>{
   for(const y of [.55,20]){const f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(city(),{pos:new Vector3(0,y,0),flying:y>10});controller.beforePlayer(p,f.set([shape({y:10,bottom:10.15,roof:14.2})]),false,.1);const hit=controller.afterPlayer(p,.1);assert.equal(hit.hit,false);near(p.pos.x,0);near(p.pos.y,y);}
   const f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(city(),{pos:new Vector3(0,10.05,0)});controller.beforePlayer(p,f.set([shape({y:10,bottom:10.15,roof:14.2})]),false,.1);assert.equal(controller.afterPlayer(p,.1).hit,true,'a car whose roof intersects the chassis cannot phase through its underside');
 });
 await test('recovery placement invalidates carrier attachment and a removed train never drags the car away',()=>{
   const c=city(),f=new MovingRailFrames(),controller=new MovingRailInteraction(),p=player(c,{pos:new Vector3(0,4.75,0)});tick(p,c,f,controller,shape());
   p.place(100,100,0);controller.beforePlayer(p,f.set([shape({x:1})]),false,.02);near(p.pos.x,100);near(p.pos.z,100);
   const q=player(c,{pos:new Vector3(1,4.75,0)}),cc=new MovingRailInteraction();tick(q,c,f,cc,shape({x:1}));cc.beforePlayer(q,[],false,.02);assert.equal(cc.afterPlayer(q,.02).carried,false);near(q.pos.x,1);
 });
 await test('metro and ordinary rail contact bodies use the exact rendered coach poses and disappear with hidden coaches',()=>{
   const mat=new MeshBasicMaterial(),metro=new MetroTrains({lines:[{id:'red',pts:[[100,100],[900,100]]}],stations:[],deckHeight:11},{body:mat,lights:mat});metro.update(.05,500,100);assert.equal(metro.bodies.length,6);
   for(const body of metro.bodies){const train=metro.trains.find(t=>body.id.startsWith(t.id+':')),k=Number(body.id.split(':').at(-1)),coach=train.mesh.children[k];near(body.x,train.mesh.position.x+coach.position.x);near(body.z,train.mesh.position.z+coach.position.z);assert.ok(body.roof>body.bottom);}
   const rail=new RailTrains(mat),run=rail.buildRun(new Map(),{pts:[[-500,0],[500,0]]}),cars=[new Mesh(rail.geo('loco'),mat),new Mesh(rail.geo('#2f5d9a'),mat)];rail.group.add(...cars);rail.trains.push({id:'fixture-rail',run,s:600,dir:1,v:12,cars});rail.update(.1,0,0,new Map());assert.equal(rail.bodies.length,2);
   for(let k=0;k<2;k++){near(rail.bodies[k].x,cars[k].position.x);near(rail.bodies[k].z,cars[k].position.z);assert.equal(cars[k].visible,true);}
   assert.ok(-Math.sin(cars[0].rotation.y)>.999,'the locomotive cab faces its direction of travel');
   const bend=rail.buildRun(new Map(),{pts:[[0,0],[100,0],[100,100]]});
   assert.ok(Math.abs(rail.at(bend,99.95).yaw-rail.at(bend,100.05).yaw)<.02,'coach and carried car headings do not snap at a track vertex');
   rail.update(.1,10000,10000,new Map());assert.equal(rail.bodies.length,0);
 });
 await test('a lower landmark plinth cannot disable a taller facade collision while actual curved tops remain landable',()=>{
   const c=city();c.landmarkSurfaceGrid=new Map();const flat=y=>({id:'landmark-fixture',a:[-10,y,-10],b:[-10,y,10],c:[10,y,-10]});
   addLandmarkSurface(c.landmarkSurfaceGrid,flat(4));addLandmarkSurface(c.landmarkSurfaceGrid,flat(12));
   const b={id:'wall',cls:'landmark',h:12,ring:[[-10,-10],[10,-10],[10,10],[-10,10]]};c.buildingGrid.set('0,0',[b]);
   const under={x:0,z:0};assert.ok(collideBuildings(c,under,1.1,4.15)>0,'the low plinth must not make the taller solid facade disappear');
   c.landmarkSurfaceGrid=new Map();addLandmarkSurface(c.landmarkSurfaceGrid,flat(8));const atop={x:0,z:0};assert.equal(collideBuildings(c,atop,1.1,8.15),0,'actual top geometry overrides an overbroad old height bound');
   near(roofUnder(c,[[0,0]]),8);assert.equal(supportAt(c,0,0,8).kind,'landmark');
 });
 console.log(`${checks} moving-rail and metro identity regression groups passed.`);
}finally{await rm(out,{recursive:true,force:true});}

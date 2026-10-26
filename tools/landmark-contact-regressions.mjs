// Production landmark support/Player integration, including actual wheel travel.
// This is offline simulation; normal-browser driving is tracked separately.
import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const bundle=await build({stdin:{contents:"export * from './game/src/game/landmark-contact'; export * from './game/src/world/landmark-support'; export * from './game/src/world/landmarks'; export * from './game/src/world/landmark-support-capture'; export * from './game/src/core/util'; export {Player} from './game/src/game/player'; export {supportAt} from './game/src/game/physics'; export {Vector3,Group} from './game/node_modules/three/build/three.module.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,format:'esm',platform:'node',write:false});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);m.initTemplates();
let groups=0;const test=(name,run)=>{run();groups++;console.log(`PASS ${name}`);};
const empty=()=>({surfaceGrid:new Map(),buildingGrid:new Map(),landmarkSurfaceGrid:new Map(),obstacles:new Map(),walls:new Map(),movingRail:[]});
const addPlane=(c,a,b,h=10,id='fixture',extent=500)=>{
  const p=(x,z)=>[x,h+a*x+b*z,z],v=[p(-extent,-extent),p(-extent,extent),p(extent,extent),p(extent,-extent)];
  m.addLandmarkSurface(c.landmarkSurfaceGrid,{id,a:v[0],b:v[1],c:v[2]});m.addLandmarkSurface(c.landmarkSurfaceGrid,{id,a:v[0],b:v[2],c:v[3]});
};
const player=(city,x=0,z=0,h=10,yaw=0)=>Object.assign(Object.create(m.Player.prototype),{
  city,pos:new m.Vector3(x,h+.55,z),yaw,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:h,lastKind:'landmark',lastElevRoad:false,lastEdge:null,
  hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,placementRevision:0,roadPitch:0,landmarkRoll:0,wheelSuspension:[0,0,0,0],group:new m.Group(),glow:new m.Group(),light:new m.Group(),
  wheels:Array.from({length:4},()=>{const g=new m.Group();g.position.y=.36;return g;}),wheelRollers:[],animateThrusters(){},
});
const idle={throttle:0,brake:0,steer:0,flyPressed:false,boost:false};
const step=(p,n,input={},hz=60)=>{for(let i=0;i<n;i++)p.update(1/hz,{...idle,...input},i/hz);};
function wheelErrors(p,maxY=Infinity){
  p.group.updateMatrixWorld(true);const out=[];
  for(let i=0;i<4;i++){
    const c=m.ROADSTER_WHEEL_CONTACTS[i],v=new m.Vector3(c[0],c[1]+(p.wheelSuspension?.[i]||0),c[2]).applyMatrix4(p.group.matrixWorld);
    const y=m.landmarkHeightAt(p.city.landmarkSurfaceGrid,v.x,v.z,maxY);
    if(y!==null)out.push(Math.abs(v.y-y));
    assert.ok(Math.abs((p.wheels?.[i]?.position.y??.36)-.36-(p.wheelSuspension?.[i]||0))<1e-8,'stored travel is applied to the rendered wheel');
  }return out;
}
test('actual four-wheel posture follows compound slopes at eight headings without penetration or floating',()=>{
  for(const a of [-.55,-.25,0,.25,.55])for(const b of [-.4,0,.4])for(let k=0;k<8;k++){
    const c=empty();addPlane(c,a,b);const p=player(c,0,0,10,k*Math.PI/4);step(p,150);
    assert.equal(p.lastKind,'landmark');assert.equal(p.onRoad,false);assert.equal(p.vy,0);
    assert.ok(Math.max(...wheelErrors(p))<.0001,JSON.stringify({a,b,k,errors:wheelErrors(p)}));
  }
});
test('driving uphill downhill and across a landmark keeps continuous contact at30and60Hz',()=>{
  for(const hz of [30,60])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const c=empty();addPlane(c,.23,-.31,30);const p=player(c,0,0,30,yaw);step(p,Math.round(hz*2));p.speed=6;
    for(let i=0;i<hz*3;i++){
      p.update(1/hz,{...idle,throttle:4/9},i/hz);
      assert.equal(p.vy,0,JSON.stringify({hz,yaw,i,pos:p.pos,lastKind:p.lastKind,lastSupport:p.lastSupport}));assert.equal(p.descending,false);assert.equal(p.lastKind,'landmark');assert.ok(Math.max(...wheelErrors(p))<.025);
    }
    assert.ok(p.pos.distanceTo(new m.Vector3(0,30.55,0))>15);assert.equal(p.bump,0);
  }
});
test('a descent lands onto a slope with actual wheel contact and takeoff resets terrain suspension',()=>{
  const c=empty();addPlane(c,.3,.19);const p=player(c);p.pos.y=22;p.descending=true;p.vy=-3;
  step(p,220);assert.equal(p.descending,false);assert.equal(p.lastKind,'landmark');assert.ok(Math.max(...wheelErrors(p))<.001);
  step(p,1,{flyPressed:true});assert.equal(p.flying,true);assert.ok(p.wheelSuspension.every(v=>v===0));
});
test('upper roofs and an adjacent ledge cannot pull lower wheels through an overhead surface',()=>{
  const c=empty();addPlane(c,.1,0);addPlane(c,0,0,18,'fixture');const p=player(c);step(p,120);
  assert.ok(p.pos.y<11);assert.ok(Math.max(...wheelErrors(p,12))<.001);
  const [x,z]=[1.8,0],q=[[x,11.5,z-4],[x,11.5,z+4],[x+5,11.5,z+4],[x+5,11.5,z-4]];
  m.addLandmarkSurface(c.landmarkSurfaceGrid,{id:'fixture',a:q[0],b:q[1],c:q[2]});m.addLandmarkSurface(c.landmarkSurfaceGrid,{id:'fixture',a:q[0],b:q[2],c:q[3]});
  step(p,60);assert.ok(p.pos.y<11);assert.ok(Math.max(...wheelErrors(p,11))<.001);
});
test('a missing corner never invents contact on air or permits a separate landmark layer',()=>{
  const c=empty();addPlane(c,0,0,10,'platform',1);
  assert.equal(m.landmarkCarContact(c.landmarkSurfaceGrid,0,0,0,10),null);
  assert.equal(m.landmarkCarContact(c.landmarkSurfaceGrid,0,0,0,18),null);
});
test('ordinary road and moving-rail support do not inherit landmark roll or suspension',()=>{
  const c=empty(),s={e:{id:'road',w:20},i:0,ax:-40,az:0,bx:40,bz:0,ya:0,yb:0,hw:10,kind:'road'};c.surfaceGrid.set('0,0',[s]);
  const p=player(c,0,0,0,-Math.PI/2);p.onRoad=true;p.lastKind='road';p.landmarkRoll=.3;p.wheelSuspension=[.1,-.1,0,0];step(p,120);
  assert.equal(p.lastKind,'road');assert.ok(Math.abs(p.landmarkRoll)<1e-8);assert.ok(p.wheelSuspension.every(v=>v===0));
  const rail=empty();rail.movingRail=[{id:'train',x:0,y:0,z:0,hx:1,hz:0,halfWidth:2,halfLength:10,bottom:.1,roof:4,previous:{x:0,y:0,z:0,hx:1,hz:0}}];
  const q=player(rail,0,0,4);q.lastKind='rail';step(q,120);assert.equal(q.lastKind,'rail');assert.ok(Math.abs(q.pos.y-4.55)<1e-8);assert.ok(q.wheelSuspension.every(v=>v===0));
});
test('recovery placement clears old landmark posture and wheel travel',()=>{
  const c=empty(),p=player(c);p.roadPitch=.3;p.landmarkRoll=.4;p.wheelSuspension=[.1,.1,-.1,-.1];p.place(0,0,0);
  assert.equal(p.roadPitch,0);assert.equal(p.landmarkRoll,0);assert.ok(p.wheelSuspension.every(v=>v===0));assert.ok(p.wheels.every(w=>w.position.y===.36));
});
const batches=Object.fromEntries(['st','wall','park','water','roof','lit','glow','road','marks','foot','kerb','shop'].map(k=>[k,new m.TiledBatch()]));
const actual=empty(),solids=[],landmark=m.placeLandmarks({lat:17.4063,lon:78.4966}).find(p=>p.id==='golconda');
const context={B:m.captureLandmarkBatches(batches,actual.landmarkSurfaceGrid,'golconda'),obstacle(){},solid(ring,h){solids.push({id:`fort${solids.length}`,cls:'landmark',h,ring});},road:()=>false,roadY:()=>null};m.drawLandmark(landmark,context);
for(const s of solids){const xs=s.ring.map(p=>p[0]),zs=s.ring.map(p=>p[1]);for(let i=Math.floor(Math.min(...xs)/50);i<=Math.floor(Math.max(...xs)/50);i++)for(let j=Math.floor(Math.min(...zs)/50);j<=Math.floor(Math.max(...zs)/50);j++){const key=`${i},${j}`;if(!actual.buildingGrid.has(key))actual.buildingGrid.set(key,[]);actual.buildingGrid.get(key).push(s);}}
const frame=new m.Kit(landmark.x,landmark.z,landmark.rot,context);
test('the real Golconda hillside uses four rendered wheel contacts across eight headings',()=>{
  for(let k=0;k<8;k++){
    const[x,z]=frame.P(-18,182),h=m.landmarkHeightAt(actual.landmarkSurfaceGrid,x,z),p=player(actual,x,z,h,k*Math.PI/4);step(p,150);
    assert.equal(p.lastKind,'landmark');assert.ok(Math.max(...wheelErrors(p,h+2))<.025,JSON.stringify({k,errors:wheelErrors(p,h+2)}));
  }
});
test('the real Golconda hillside landing drive brake and parked contacts remain stable',()=>{
  const[x,z]=frame.P(-18,182),h=m.landmarkHeightAt(actual.landmarkSurfaceGrid,x,z),p=player(actual,x,z,h,Math.PI/2);p.pos.y+=7;p.descending=true;p.vy=-2;step(p,180);
  assert.equal(p.descending,false);assert.ok(Math.max(...wheelErrors(p,h+2))<.025);const start=p.pos.clone();
  step(p,65,{throttle:1});step(p,35,{brake:1});step(p,120);assert.ok(p.pos.distanceTo(start)>5);assert.ok(Math.max(...wheelErrors(p,p.pos.y+2))<.025);
  const parked=p.pos.clone();step(p,300);assert.ok(p.pos.distanceTo(parked)<1e-5);assert.ok(Math.max(...wheelErrors(p,p.pos.y+2))<.025);
});
console.log(`${groups} landmark contact regression groups passed, including compound slopes, real wheel suspension, layer gating, road/rail controls and actual Golconda.`);

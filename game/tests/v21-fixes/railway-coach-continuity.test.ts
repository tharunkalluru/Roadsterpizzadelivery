import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, type Input } from '../../src/game/player';
import { RailTrains } from '../../src/game/rail';
import { initTemplates } from '../../src/core/util';
import { MovingRailFrames, MovingRailInteraction, movingRailSupport, railLocal, railRoofAt, railWorld } from '../../src/game/moving-rail';

const idle: Input = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false };
initTemplates({rbox:new THREE.BoxGeometry(1,1,1)});
function car() {
  return Object.assign(Object.create(Player.prototype), {
    city: { group:new THREE.Group(), surfaceGrid:new Map(), buildingGrid:new Map(), walls:new Map(), obstacles:new Map(), movingRail:[] },
    pos:new THREE.Vector3(), yaw:0, speed:0, vy:0, steerVis:0, flying:false, descending:false, onRoad:false,
    lastSupport:0, lastKind:'ground', lastElevRoad:false, hitCooldown:0, bump:0, flyAlt:24, altT:0, kerbT:0, glide:null,
    jumpActive:false, jumpHeld:false, jumpCooldown:0, jumpBodyTop:2.4, jumpStartY:0, jumpElapsed:0,
    jumpForcedFall:false, jumpCooldownPendingLanding:false, jumpCollisionMeshes:[], jumpBoundsDirty:true,
    jumpBounds:{bottom:0,top:0}, placementRevision:0, group:new THREE.Group(), glow:new THREE.Group(), light:new THREE.Group(),
    wheels:[], wheelRollers:[], animateThrusters() {},
  }) as Player;
}
function fixture(dir:1|-1, points:number[][] = [[0,0],[2400,0]], elev?:number[]) {
  const rail=new RailTrains(new THREE.MeshBasicMaterial()),run=rail.buildRun(new Map(),{pts:points as [number,number][],elev});
  const cars=Array.from({length:5},(_,index)=>new THREE.Mesh(rail.geo(index?'#2f5d9a':'loco'),rail.mat));
  const train={id:'rail:fixture',run,s:dir===1?Math.min(700,run.len*.55):Math.min(1300,run.len*.7),dir,v:12,cars};
  rail.group.add(...cars);rail.trains.push(train);rail.update(0,700,0,new Map());
  const player=car(),contacts=new MovingRailInteraction();let time=0;
  const tick=(input=idle,dt=1/60)=>{
    time+=dt;rail.update(dt,player.pos.x,player.pos.z,new Map());player.city.movingRail=rail.bodies;
    contacts.beforePlayer(player,rail.bodies,input.flyPressed,dt);player.update(dt,input,time);
    return contacts.afterPlayer(player,dt);
  };
  return {rail,train,player,tick};
}

for (const dt of [1/30,1/60,1/120,.1]) for(const dir of [1,-1] as const) for(const forward of [true,false])
test(`real Player crosses all moving coach gaps and locomotive step ${forward?'rear-to-front':'front-to-rear'} dir${dir} dt${dt}`,()=>{
  const f=fixture(dir),{rail,player}=f,start=rail.bodies[forward?4:0],seen=new Set<string>();
  player.pos.set(start.x,start.roof+.55,start.z);player.yaw=Math.atan2(-start.hx,-start.hz)+(forward?0:Math.PI);
  const target=forward?0:4;let reached=false,hits=0,unsupported=0;
  for(let frame=0;frame<Math.ceil(22/dt);frame++){
    const result=f.tick({...idle,throttle:player.speed<8?1:0},dt);
    if(result.hit)hits++;
    if(!result.carried)unsupported++;
    if(result.body)seen.add(result.body.id);
    assert.ok(player.pos.y>4.1,`car fell between coaches: frame${frame},body${result.body?.id},y${player.pos.y}`);
    const body=rail.bodies.find(body=>body.id===`rail:fixture:${target}`)!;
    if(result.body?.id===body.id&&(forward?railLocal(body,player.pos.x,player.pos.z).along>=-1:railLocal(body,player.pos.x,player.pos.z).along<=1)){reached=true;break;}
  }
  assert.equal(reached,true,`never reached target coach: ${[...seen]}`);
  assert.equal(hits,0,'a supported roof transition never collides with the next coach end');
  assert.equal(unsupported,0,'the tyre footprint retains physical support across every coupling');
  assert.equal(seen.size,5);assert.equal(rail.bodies.length,5,'joins do not become selectable delivery or train-collision bodies');
});

for(const dir of [1,-1] as const)test(`falling onto a rear coach then driving to the customer remains continuous dir${dir}`,()=>{
  const f=fixture(dir),rear=f.rail.bodies[4],p=f.player;
  p.pos.set(rear.x+rear.hx*5,rear.roof+3,rear.z+rear.hz*5);p.yaw=Math.atan2(-rear.hx,-rear.hz);p.descending=true;p.vy=-3;
  let landed=false;
  for(let n=0;n<90;n++){const r=f.tick();if(r.carried){landed=true;assert.equal(r.body?.id,'rail:fixture:4');break;}}
  assert.equal(landed,true,'normal gravity lands on a rear coach');assert.equal(p.flying,false);assert.equal(p.descending,false);
  let reached=false;
  for(let n=0;n<1200;n++){const r=f.tick({...idle,throttle:p.speed<8?1:0});assert.equal(r.hit,false);assert.equal(r.carried,true);if(r.body?.id==='rail:fixture:0'){reached=true;break;}}
  assert.equal(reached,true);
});

test('curved and graded mapped rail keeps a slow car supported while its rear coach rounds the join',()=>{
  for(const dir of [1,-1] as const){
    const points=Array.from({length:121},(_,i)=>{const angle=(i-60)*.008;return[1000+500*Math.sin(angle),500-500*Math.cos(angle)];});
    const f=fixture(dir,points,points.map((_,i)=>i*.04)),{player:p,rail}=f;f.train.s=dir===1?230:350;rail.update(0,1000,0,new Map());
    assert.ok(rail.bodies.every(body=>body.y>0&&Math.abs(body.grade||0)>.005),'the fixture includes actual elevation and coach pitch');
    const rear=rail.bodies[4];p.pos.set(rear.x,rear.roof+.55,rear.z);p.yaw=Math.atan2(-rear.hx,-rear.hz);
    let crossed=false;
    for(let frame=0;frame<600;frame++){
      const nearest=rail.bodies.reduce((a,b)=>Math.hypot(p.pos.x-a.x,p.pos.z-a.z)<Math.hypot(p.pos.x-b.x,p.pos.z-b.z)?a:b);
      const angle=Math.atan2(-nearest.hx,-nearest.hz)-p.yaw,turn=Math.atan2(Math.sin(angle),Math.cos(angle));
      const r=f.tick({...idle,throttle:p.speed<5?1:0,steer:Math.max(-1,Math.min(1,-turn*4))});
      assert.equal(r.hit,false);assert.equal(r.carried,true,`curve lost contact dir${dir} frame${frame}`);
      if(r.body?.id==='rail:fixture:2'){crossed=true;break;}
    }
    assert.equal(crossed,true,'the car crosses two joins on a curve using actual rotating coach frames');
  }
});

test('only small consecutive same-rake gaps gain roof contact; streets, train sides, missing coaches and other trains remain solid',()=>{
  const shape=(index:number,x:number,extra={})=>({id:`rake:${index}`,roofGroup:'rake',roofIndex:index,x,y:0,z:0,hx:1,hz:0,halfWidth:1.57,halfLength:11.25,bottom:.2,roof:4.175,...extra});
  for(const mode of ['normal','other-rake','missing','too-far','sharp-bend'] as const){
    const frames=new MovingRailFrames(),a=shape(0,23.4),b=shape(1,0,mode==='other-rake'?{roofGroup:'other'}:mode==='missing'?{roofIndex:2}:mode==='too-far'?{x:-8}:mode==='sharp-bend'?{hx:0,hz:1}:{});
    const bodies=frames.set([a,b]);
    assert.equal(railRoofAt(bodies[0],11.7,0)!==null,mode==='normal');
    assert.equal(movingRailSupport(bodies,11.7,0,0),null,'a car beneath a coupling cannot snap onto its roof');
    assert.equal(movingRailSupport(bodies,15,0,3.975,{x:11.7,z:0,feet:3.975}),null,'even a car20cm below the roof cannot claim tyre contact');
    const p=car();p.pos.set(11.7,.55,0);p.yaw=-Math.PI/2;p.speed=8;
    const contacts=new MovingRailInteraction();contacts.beforePlayer(p,bodies,false,.1);p.pos.x=15;
    assert.equal(contacts.afterPlayer(p,.1).hit,true,`${mode}: below-roof end collision must stay solid`);
  }
});

test('outside tyre paths remain supported across angled coach end faces on tight actual track curves',()=>{
  for(const dir of [1,-1] as const){
    const points=Array.from({length:201},(_,i)=>{const angle=-2+i*.02;return[1000+75*Math.sin(angle),75-75*Math.cos(angle)];});
    const f=fixture(dir,points),{rail}=f;f.train.s=dir===1?170:130;rail.update(0,1000,0,new Map());rail.update(0,1000,0,new Map());
    for(let index=0;index<4;index++){
      const a=rail.bodies[index],b=rail.bodies[index+1],start=railWorld(b,b.halfLength,0),end=railWorld(a,-a.halfLength,0);
      const length=Math.hypot(end.x-start.x,end.z-start.z),hx=(end.x-start.x)/length,hz=(end.z-start.z)/length;
      for(const side of [-.5,.5])for(let d=-.4;d<=length+.4;d+=.004){
        const x=start.x+hx*d-hz*side,z=start.z+hz*d+hx*side;
        assert.ok(railRoofAt(a,x,z)!==null||railRoofAt(b,x,z)!==null,`unsupported curve wedge dir${dir} coupling${index} side${side} distance${d}`);
      }
    }
  }
});

test('a120km/h roof traverse at100ms frames does not miss the coupling or locomotive step',()=>{
  for(const dir of [1,-1] as const)for(const forward of [true,false]){
    const f=fixture(dir),p=f.player,first=f.rail.bodies[forward?4:0];
    p.pos.set(first.x,first.roof+.55,first.z);p.yaw=Math.atan2(-first.hx,-first.hz)+(forward?0:Math.PI);p.speed=120/3.6;
    let reached=false;
    for(let n=0;n<40;n++){
      const r=f.tick({...idle,throttle:1},.1);assert.equal(r.hit,false);assert.equal(r.carried,true);
      if(r.body?.id===`rail:fixture:${forward?0:4}`){reached=true;break;}
    }
    assert.equal(reached,true);
  }
});

test('stopping in a coupling retains carried motion, while leaving the actual roof side or taking off detaches',()=>{
  const f=fixture(1),{player:p,rail}=f,a=rail.bodies[2],b=rail.bodies[3];
  p.pos.set((a.x-a.halfLength+b.x+b.halfLength)/2,4.725,0);p.yaw=-Math.PI/2;
  assert.equal(f.tick().carried,true);const start=p.pos.x;
  for(let n=0;n<60;n++)assert.equal(f.tick().carried,true);
  assert.ok(Math.abs(p.pos.x-start-12)<1e-6,'parked car follows the real train instead of falling through the gap');
  const takeoff=f.tick({...idle,flyPressed:true});assert.equal(p.flying,true);assert.equal(takeoff.carried,false);
  p.flying=false;p.descending=false;p.pos.z=4;p.pos.y=4.725;p.vy=0;
  assert.equal(f.tick().carried,false,'roof joins do not widen the train into an invisible platform');
});

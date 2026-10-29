// Original Version21 jump, roll and traffic-visibility behavior. No NextLab runtime.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { playerFixtureState } from './current-fixture-state.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), out = await mkdtemp(join(tmpdir(), 'roadster-v21-jump-'));
let checks = 0;
const test = (label, run) => { run(); checks++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: "export {Player} from './src/game/player';export {Traffic} from './src/game/traffic';export * from './src/game/jump-motion';export * from './src/game/takeoff-kickflip';export {Vector3,Group} from 'three';", resolveDir: root, loader: 'ts' }, outfile: join(out, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const {Player,Traffic,Vector3,Group,TakeoffKickflip,TAKEOFF_KICKFLIP_SECONDS,jumpProfile,advanceJump,jumpCeiling,JUMP_HEIGHT,JUMP_AIRTIME,JUMP_COOLDOWN_SECONDS} = await import(pathToFileURL(join(out, 'production.mjs')));
  const idle = { throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false };
  const city = () => {
    const c = { buildingGrid:new Map(),surfaceGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[] };
    const road = {e:null,ax:0,az:1000,bx:0,bz:-1000,ya:0,yb:0,hw:1000,kind:'road'};
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)c.surfaceGrid.set(`${x},${z}`,[road]);
    return c;
  };
  const player = (c=city()) => Object.assign(Object.create(Player.prototype), {
    ...playerFixtureState(), city:c,pos:new Vector3(0,.55,0),yaw:0,speed:0,vy:0,steerVis:0,
    flying:false,descending:false,charge:2.5,chargeCap:20,earnT:0,onRoad:true,lastSupport:0,lastKind:'road',lastElevRoad:false,lastEdge:null,hitCooldown:0,bump:0,
    flyAlt:24,altT:0,kerbT:0,glide:null,placementRevision:0,group:new Group(),glow:new Group(),light:new Group(),wheels:[],wheelRollers:[],animateThrusters(){},
  });
  test('kickflip makes one simulation-timed turn, pauses exactly and cannot restart mid-roll',()=>{
    const flip=new TakeoffKickflip(1.2,.7);flip.begin();assert.equal(flip.update(0).roll,0);
    const quarter=flip.update(TAKEOFF_KICKFLIP_SECONDS/4);assert.ok(quarter.active&&quarter.roll>0&&quarter.roll<Math.PI);
    assert.deepEqual(flip.update(0),quarter);assert.deepEqual(flip.update(NaN),quarter);flip.begin();
    assert.ok(Math.abs(flip.update(TAKEOFF_KICKFLIP_SECONDS/4).roll-Math.PI)<1e-9);
    flip.update(TAKEOFF_KICKFLIP_SECONDS/2);assert.equal(flip.active,false);assert.equal(flip.update(0).roll,0);
  });
  test('early and late kickflip cancellation settle without residual rotation or lift',()=>{
    for(const phase of [.1,.3,.6,.9]){const flip=new TakeoffKickflip();flip.begin();const before=flip.update(TAKEOFF_KICKFLIP_SECONDS*phase);flip.cancel();const midway=flip.update(.09);assert.ok(Math.abs(midway.roll-before.roll)<Math.PI);flip.update(.09);assert.deepEqual(flip.update(0),{active:false,roll:0,lift:0});}
  });
  test('jump height, airtime, cooldown and smooth low trajectory retain the Version21 rules',()=>{
    assert.equal(JUMP_HEIGHT,3.125);assert.equal(JUMP_AIRTIME,5/3);assert.equal(JUMP_COOLDOWN_SECONDS,5);
    assert.equal(jumpProfile(-1).rise,0);assert.equal(jumpProfile(JUMP_AIRTIME+1).rise,0);assert.equal(jumpProfile(JUMP_AIRTIME/2).rise,JUMP_HEIGHT);
    let previous=jumpProfile(0);for(let i=1;i<=1000;i++){const q=jumpProfile(i/1000*JUMP_AIRTIME);assert.ok(q.rise>=0&&q.rise<=JUMP_HEIGHT);assert.ok(Math.abs(q.rise-previous.rise)<.03);previous=q;}
    assert.deepEqual(advanceJump(2,.2),{rise:2*.2-.5*9*.2*.2,velocity:2-9*.2});
  });
  test('production Player preserves jump momentum, low apex and landing across 30–120 Hz',()=>{
    for(const hz of [30,60,90,120]){const p=player();p.speed=20;let duration=0,max=.55;
      for(let frame=0;frame<hz*2;frame++){p.update(1/hz,{...idle,jumpPressed:frame===0},frame/hz);max=Math.max(max,p.pos.y);if(p.jumping)duration+=1/hz;}
      assert.ok(Math.abs(duration-JUMP_AIRTIME)<=1/hz+1e-8);assert.ok(Math.abs(max-(.55+JUMP_HEIGHT))<1e-8);
      assert.ok(-p.pos.z>=20*JUMP_AIRTIME-.8,'jump retains launch momentum instead of cancelling forward travel');
      assert.equal(p.flying,false);assert.equal(p.descending,false);assert.equal(p.jumping,false);assert.ok(p.jumpCooldown>4.5&&p.jumpCooldown<=5);
    }
  });
  test('held JUMP never chains, cooldown begins at landing, and a later release/press works',()=>{
    const p=player();p.speed=10;let t=0;
    for(let i=0;i<60*8;i++){t+=1/60;p.update(1/60,{...idle,jumpPressed:true},t);}
    assert.equal(p.jumping,false);assert.equal(p.jumpCooldown,0);
    p.update(1/60,idle,t+=1/60);p.update(1/60,{...idle,jumpPressed:true},t+=1/60);assert.equal(p.jumping,true);
  });
  test('an overhead slab refuses jump and FLY wins a simultaneous launch input',()=>{
    const c=city();c.surfaceGrid.get('0,0').push({ax:-20,az:0,bx:20,bz:0,ya:3,yb:3,hw:12,kind:'pad'});const p=player(c);
    assert.equal(jumpCeiling(c,0,0,1.2),2.65);assert.equal(p.canJump,false);p.update(1/60,{...idle,jumpPressed:true},0);assert.equal(p.jumping,false);
    const open=player();open.update(1/60,{...idle,jumpPressed:true,flyPressed:true},0);assert.equal(open.flying,true);assert.equal(open.jumping,false);
  });
  test('overtaken bus stays visible during JUMP while camera-inside protection still applies',()=>{
    const bus={x:5,z:0,y:0,hx:1,hz:0,size:[2.6,3.2,12],g:new Group()};bus.g.rotation.y=-Math.PI/2;
    const traffic=Object.assign(Object.create(Traffic.prototype),{cars:[bus]});const cam=new Vector3(0,2.5,-10),target={x:0,y:.55,z:10};
    traffic.hideNear(cam,target);assert.equal(bus.g.visible,false);
    traffic.hideNear(cam,target,true);assert.equal(bus.g.visible,true,'jump must not hide the bus being cleared');
    traffic.hideNear(new Vector3(5,2,0),target,true);assert.equal(bus.g.visible,false,'camera physically inside bus still needs protection');
    traffic.hideNear(cam,target,false);assert.equal(bus.g.visible,false,'ordinary chase occlusion resumes after landing');
  });
  console.log(`${checks} Version21 jump and kickflip regressions passed.`);
} finally { await rm(out,{recursive:true,force:true}); }

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { Player } from '../../src/game/player';
import { DRIVING_CAMERA, drivingCameraLookAhead, speedCameraDistance } from '../../src/game/camera';

function fixture(speed=0, flight=false) {
  // Production Player pose/getters and the actual Game camera method. No
  // browser renderer or alternative camera implementation runs in this test.
  const player=Object.assign(Object.create(Player.prototype),{pos:new THREE.Vector3(0,flight?40:.55,0),yaw:0,
    speed,lastSupport:0,placementRevision:0,flying:flight,descending:false,jumpActive:false,bump:0});
  const hidden:THREE.Vector3[]=[];
  const g:any=Object.assign(Object.create(Game.prototype),{player,cameraPlacementRevision:0,
    camPos:new THREE.Vector3(),camLook:new THREE.Vector3(),orbitYaw:0,orbitPitch:.38,orbitDist:0,
    airOrbitPitch:.62,airOrbitDist:0,dragging:false,
    engine:{camera:new THREE.PerspectiveCamera(60,16/9,.1,900),placeSun(){}},
    traffic:{hideNear(p:THREE.Vector3){hidden.push(p.clone());}},city:{signs:{update(){}}},
    clearCamera:(_from:THREE.Vector3,to:THREE.Vector3)=>to.clone(),insideSolid:()=>false,placeLampLights(){}});
  return {g,player,hidden};
}
function move(g:any,dt:number,displacement?:THREE.Vector3) {
  g.player.pos.add(displacement??g.player.forward.multiplyScalar(g.player.speed*dt));g.updateCamera(dt);
}
test('actual moving Game camera keeps a bounded car-relative gap through 30/60/120Hz at road maximum',()=>{
  for(const hz of [30,60,120]){
    const {g,player}=fixture(120/3.6);g.updateCamera(0);
    const back=DRIVING_CAMERA.distance+speedCameraDistance(player.speed);
    for(let i=0;i<hz*8;i++){
      move(g,1/hz);
      assert.ok(Math.abs(g.engine.camera.position.z-player.pos.z-back)<1e-8,'world translation must not accumulate speed/damping lag');
    }
    assert.ok(g.engine.camera.position.y-player.pos.y<2,'driver eye remains near the Roadster roof');
    assert.ok(Math.abs(g.engine.camera.fov-62.5)<1e-8,'existing speed lens remains unchanged');
  }
});
test('stopped, accelerating and braking traces use continuous look-ahead across the former 2m/s threshold',()=>{
  assert.ok(Math.abs(drivingCameraLookAhead(2.01)-drivingCameraLookAhead(1.99))<.01);
  const {g,player}=fixture();g.updateCamera(0);
  let previousAhead=g.camLook.z-player.pos.z;
  for(let i=0;i<400;i++){
    player.speed=i<200?Math.min(120/3.6,i*.2):Math.max(0,(400-i)*.2);
    move(g,1/60);const ahead=g.camLook.z-player.pos.z;
    assert.ok(Math.abs(ahead-previousAhead)<.15,'aim must not jump twenty metres when starting to drive');
    assert.ok(g.engine.camera.position.distanceTo(player.pos)<10,'braking does not leave the camera behind');
    previousAhead=ahead;
  }
});
test('train carry and collision-limited movement use actual displacement rather than nominal throttle speed',()=>{
  const carry=fixture(0);carry.g.updateCamera(0);
  for(let i=0;i<300;i++)move(carry.g,1/60,new THREE.Vector3(.2,0,-.3));
  assert.ok(Math.abs(carry.g.camPos.x-carry.player.pos.x)<1e-8);
  assert.ok(Math.abs(carry.g.camPos.z-carry.player.pos.z-DRIVING_CAMERA.distance)<1e-8);
  const blocked=fixture(120/3.6);blocked.g.updateCamera(0);
  for(let i=0;i<180;i++)move(blocked.g,1/60,new THREE.Vector3());
  assert.ok(Math.abs(blocked.g.camPos.z-(DRIVING_CAMERA.distance+.5))<1e-8,'speed alone cannot translate the camera through a wall');
});
test('flight retains its existing pitch, zoom, lens and hover orbit while translation does not shrink the car',()=>{
  const {g,player}=fixture(160/3.6,true);g.updateCamera(0);
  const expected=(7.6+4+speedCameraDistance(player.speed))*Math.cos(.62)/Math.cos(.38);
  for(let i=0;i<360;i++)move(g,1/60);
  assert.ok(Math.abs(g.camPos.z-player.pos.z-expected)<1e-8);
  player.speed=0;g.orbitYaw=1;g.airOrbitPitch=.95;g.airOrbitDist=5;
  for(let i=0;i<90;i++)g.updateCamera(1/60);
  assert.equal(g.orbitYaw,1);assert.equal(g.airOrbitPitch,.95);assert.equal(g.airOrbitDist,5);
});
test('a world-anchored authored handoff never gets translated with a nearby moving player',()=>{
  const {g,player}=fixture();g.updateCamera(0);
  const focus={context:'stationary-handoff',position:{x:2,y:2,z:5},target:{x:0,y:1,z:0}};
  g.story={supports:[],cameraFocus:focus};
  for(let i=0;i<180;i++)move(g,1/60,new THREE.Vector3(.001,0,0));
  assert.ok(g.camPos.distanceTo(new THREE.Vector3(2,2,5))<.001);
  assert.ok(g.camLook.distanceTo(new THREE.Vector3(0,1,0))<.001);
  g.story={supports:[]};player.speed=5;move(g,1/60);
  assert.ok(Number.isFinite(g.engine.camera.position.x));
});
test('relocation revisions and unannounced large jumps reset follow history instead of applying an old delta',()=>{
  for(const revision of [false,true]){
    const {g,player}=fixture(20);g.updateCamera(0);for(let i=0;i<20;i++)move(g,1/60);
    player.pos.set(800,.55,-1200);if(revision)player.placementRevision++;
    g.updateCamera(1/60);
    assert.ok(Math.abs(g.camPos.x-player.pos.x)<1e-8);
    assert.ok(Math.abs(g.camPos.z-player.pos.z-(DRIVING_CAMERA.distance+speedCameraDistance(20)))<1e-8);
  }
});
test('collision clearance still constrains the smoothed, advected camera on every moving frame',()=>{
  const {g,player}=fixture(25);
  g.clearCamera=(from:THREE.Vector3,to:THREE.Vector3)=>new THREE.Vector3(to.x,to.y,Math.min(to.z,from.z+3));
  g.updateCamera(0);
  for(let i=0;i<180;i++){move(g,1/60);assert.ok(g.camPos.z-player.pos.z<=3+1e-9);}
});
test('every legal low-pitch ground orbit and near/far zoom requests an above-road eye before clearance',()=>{
  for(const distance of [-4,0,22]){
    let previousY:number|undefined;
    for(let step=0;step<=120;step++){
      const {g,player}=fixture();g.orbitDist=distance;g.orbitPitch=.05+step*.01;g.dragging=true;
      let requestedY=Infinity;
      g.clearCamera=(_from:THREE.Vector3,to:THREE.Vector3)=>{requestedY=Math.min(requestedY,to.y);return to.clone();};
      g.updateCamera(0);
      assert.ok(requestedY>=player.pos.y+.55-1e-9,'legal orbit must not depend on an underground-camera recovery');
      if(previousY!==undefined)assert.ok(Math.abs(g.camPos.y-previousY)<.8,'driver/orbit blend remains continuous');
      previousY=g.camPos.y;
    }
  }
});

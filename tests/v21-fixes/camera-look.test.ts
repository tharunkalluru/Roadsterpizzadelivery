import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {Game} from '../../src/game/game';
import {dragCameraOrbit,zoomCameraOrbit,installCameraLook,type CameraOrbitState} from '../../src/game/camera-look';
const orbit=():CameraOrbitState=>({orbitYaw:0,orbitPitch:.38,orbitDist:0,airOrbitPitch:.62,airOrbitDist:0,dragging:false});
function fixture(speed=0,flight=true){
 const g:any=Object.assign(Object.create(Game.prototype),orbit(),{cameraPlacementRevision:0,camPos:new THREE.Vector3(),camLook:new THREE.Vector3(),
  player:{pos:new THREE.Vector3(0,flight?40:.55,0),lastSupport:0,placementRevision:0,forward:new THREE.Vector3(0,0,-1),speed,flying:flight,descending:false,jumping:false,bump:0,takeoffAnimating:false},
  engine:{camera:new THREE.PerspectiveCamera(60,16/9,.1,900),placeSun:()=>{}},traffic:{hideNear:()=>{}},city:{signs:{update:()=>{}}},
  clearCamera:(_from:THREE.Vector3,to:THREE.Vector3)=>to.clone(),insideSolid:()=>false,placeLampLights:()=>{}});
 return g;
}
test('actual hovering Game camera preserves a released full orbit, vertical angle and zoom',()=>{
 const g=fixture();dragCameraOrbit(g,-Math.PI/.008,90,true);zoomCameraOrbit(g,800,true);
 const expected={yaw:g.orbitYaw,pitch:g.airOrbitPitch,distance:g.airOrbitDist};
 for(let i=0;i<180;i++)g.updateCamera(1/60);
 assert.equal(g.orbitYaw,expected.yaw);assert.equal(g.airOrbitPitch,expected.pitch);assert.equal(g.airOrbitDist,expected.distance);
 assert.ok(g.engine.camera.position.y>g.player.pos.y+10);assert.ok(g.engine.camera.position.z<0,'half-turn shows the car from its front');
 assert.ok(Math.abs(g.camLook.y-41.4)<1e-8);assert.ok(Math.abs(g.camLook.z)<1e-8,'hover look target remains at car, not twenty metres ahead');
});
test('actual flight camera responds to vertical drag above and below the car without changing ground pitch',()=>{
 const low=fixture(),high=fixture();dragCameraOrbit(low,0,-240,true);dragCameraOrbit(high,0,140,true);
 low.updateCamera(0);high.updateCamera(0);
 assert.ok(low.engine.camera.position.y<40);assert.ok(high.engine.camera.position.y>49);
 assert.equal(low.orbitPitch,.38);assert.equal(high.orbitPitch,.38);
});
test('normal moving flight still recenters smoothly while stationary ground keeps its original view',()=>{
 const air=fixture(20),ground=fixture(0,false);air.orbitYaw=1.5;air.airOrbitPitch=1.2;air.airOrbitDist=12;
 ground.orbitYaw=1;ground.orbitPitch=.9;ground.orbitDist=6;
 for(let i=0;i<180;i++){air.updateCamera(1/60);ground.updateCamera(1/60);}
 assert.ok(Math.abs(air.orbitYaw)<.01);assert.ok(Math.abs(air.airOrbitPitch-.62)<.01);assert.ok(air.airOrbitDist<.1);
 assert.equal(ground.orbitYaw,1);assert.equal(ground.orbitPitch,.9);assert.equal(ground.orbitDist,6);
});
test('default grounded framing, damping opportunity and speed-based field of view stay compatible with Version21',()=>{
 const g=fixture(0,false);g.updateCamera(0);assert.ok(Math.abs(g.engine.camera.position.z-7.6)<1e-9);
 assert.ok(Math.abs(g.engine.camera.position.y-(.55+.4+7.6*Math.sin(.38)*.95))<1e-9);assert.equal(g.engine.camera.fov,60);
 const moving=fixture(12,false);moving.updateCamera(0);assert.equal(moving.engine.camera.fov,63.6);
});
test('accelerating after multiple hover orbits recenters by the shortest arc',()=>{
 for(const turns of [-3,-1,1,4]){
  const g=fixture();g.orbitYaw=turns*Math.PI*2+.2;g.updateCamera(1/60);
  assert.equal(g.orbitYaw,turns*Math.PI*2+.2,'hover retains the selected orbit');
  g.player.speed=10;g.updateCamera(1/60);
  assert.ok(g.orbitYaw>0&&g.orbitYaw<.2,'GO uses the short arc, not the number of accumulated turns');
 }
});
class Canvas extends EventTarget{captures=new Set<number>();focused=false;focus(){this.focused=true;}setPointerCapture(id:number){this.captures.add(id);}releasePointerCapture(id:number){this.captures.delete(id);}}
const pointer=(type:string,id:number,x=0,y=0)=>Object.assign(new Event(type,{cancelable:true}),{pointerId:id,clientX:x,clientY:y});
test('another touch cannot steal or end an active camera gesture; cancellation and map reset release capture',()=>{
 const canvas=new Canvas(),events=new EventTarget(),state=orbit();let blocked=false;
 const release=installCameraLook(canvas as any,state,{blocked:()=>blocked,flight:()=>true,speed:()=>0},events);
 canvas.dispatchEvent(pointer('pointerdown',1));assert.equal(canvas.focused,true,'scene input returns keyboard focus from a HUD button');canvas.dispatchEvent(pointer('pointermove',2,100,100));assert.equal(state.orbitYaw,0);
 events.dispatchEvent(pointer('pointerup',2));assert.equal(state.dragging,true);
 canvas.dispatchEvent(pointer('pointermove',1,120,60));assert.equal(state.orbitYaw,-.96);assert.equal(state.airOrbitPitch,.9199999999999999);
 events.dispatchEvent(pointer('pointercancel',1));assert.equal(state.dragging,false);assert.equal(canvas.captures.size,0);
 canvas.dispatchEvent(pointer('pointerdown',3));blocked=true;canvas.dispatchEvent(pointer('pointermove',3,20,20));assert.equal(state.dragging,false);
 blocked=false;canvas.dispatchEvent(pointer('pointerdown',4));release();assert.equal(state.dragging,false);assert.equal(canvas.captures.size,0);
});
test('blocked views and driving on the ground do not start a camera drag; flight and ground bounds are separate',()=>{
 const canvas=new Canvas(),events=new EventTarget(),state=orbit();let blocked=true,flight=false,speed=0;
 installCameraLook(canvas as any,state,{blocked:()=>blocked,flight:()=>flight,speed:()=>speed},events);
 canvas.dispatchEvent(pointer('pointerdown',1));assert.equal(state.dragging,false);blocked=false;speed=30;
 canvas.dispatchEvent(pointer('pointerdown',2));assert.equal(state.dragging,false);flight=true;
 canvas.dispatchEvent(pointer('pointerdown',3));canvas.dispatchEvent(pointer('pointermove',3,10000,10000));assert.equal(state.airOrbitPitch,1.45);assert.equal(state.orbitPitch,.38);
 dragCameraOrbit(state,0,-10000,true);assert.equal(state.airOrbitPitch,-.7);zoomCameraOrbit(state,100000,true);assert.equal(state.airOrbitDist,26);assert.equal(state.orbitDist,0);
});

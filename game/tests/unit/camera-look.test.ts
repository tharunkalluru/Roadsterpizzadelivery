import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { GameView } from '../../src/app/view';
import type { ArtApi } from '../../src/art/api';
import type { WorldPhysics } from '../../src/world/collision';

class Canvas extends EventTarget {
  captured:number|null=null;
  setPointerCapture(id:number){this.captured=id;}
  releasePointerCapture(id:number){if(this.captured===id)this.captured=null;}
}
const pointer=(target:EventTarget,type:string,x:number,id=1,button=0,y=0)=>{
  const e=new Event(type,{cancelable:true});Object.assign(e,{clientX:x,clientY:y,pointerId:id,button});target.dispatchEvent(e);
};
const clearWorld={buildingAt:()=>null,overheadAt:()=>({bottom:Infinity})} as unknown as WorldPhysics;
const create=(canvas=new Canvas())=>{
  const view=new GameView({domElement:canvas} as unknown as THREE.WebGLRenderer,{} as ArtApi);
  const update=(speed=0,dt=1,world=clearWorld)=>(view as unknown as {updateCamera(x:number,y:number,z:number,h:number,air:boolean,speed:number,world:WorldPhysics,dt:number):void}).updateCamera(0,0,0,0,false,speed,world,dt);
  update(0,0);return {view,canvas,update};
};
const angle=(view:GameView)=>Math.atan2(view.camera.position.x,view.camera.position.z);

describe('canvas look-around camera',()=>{
  it('orbits with a horizontal drag while stopped, holds the view, and eases behind the car when driving',()=>{
    const {view,canvas,update}=create();
    pointer(canvas,'pointerdown',100);pointer(canvas,'pointermove',250);update();
    const stopped=angle(view);expect(stopped).toBeGreaterThan(.85);expect(canvas.captured).toBe(1);
    const beforeTilt=view.camera.position.clone();
    pointer(canvas,'pointermove',250,1,0,150);update();
    const direction=new THREE.Vector3();view.camera.getWorldDirection(direction);
    expect(direction.y).toBeGreaterThan(.4);expect(direction.y).toBeLessThan(.6);
    expect(view.camera.position.distanceTo(beforeTilt)).toBeLessThan(.04);
    pointer(canvas,'pointermove',250,1,0,1500);update();view.camera.getWorldDirection(direction);
    expect(direction.y).toBeLessThan(.6); // bounded upward inspection, regardless of drag distance
    pointer(canvas,'pointerup',250,1,0,1500);update();expect(angle(view)).toBeCloseTo(.9,2);expect(canvas.captured).toBeNull();
    update(8,1);expect(Math.abs(angle(view))).toBeLessThan(stopped*.25);
    view.camera.getWorldDirection(direction);expect(direction.y).toBeLessThan(.1);
    pointer(canvas,'pointerdown',100);pointer(canvas,'pointermove',500);update(8,1);
    expect(Math.abs(angle(view))).toBeLessThan(.05);expect(canvas.captured).toBeNull();
    view.resetCamera();update(0,0);expect(angle(view)).toBe(0);
    view.camera.getWorldDirection(direction);expect(direction.y).toBeLessThan(0);
    view.disposeCameraControls();
  });
  it('ignores other controls and right clicks, cancels capture, and replaces old canvas listeners safely',()=>{
    const {view,canvas,update}=create(),button=new EventTarget();
    pointer(button,'pointerdown',0);pointer(button,'pointermove',300);
    pointer(canvas,'pointerdown',0,1,2);pointer(canvas,'pointermove',300);update();expect(angle(view)).toBe(0);
    pointer(canvas,'pointerdown',0);pointer(canvas,'pointermove',50);pointer(canvas,'pointercancel',50);pointer(canvas,'pointermove',350);update();
    expect(angle(view)).toBeCloseTo(.3,2);expect(canvas.captured).toBeNull();
    const replacement=create(canvas);
    pointer(canvas,'pointerdown',0);pointer(canvas,'pointermove',100);pointer(canvas,'pointerup',100);replacement.update();
    update();expect(angle(view)).toBeCloseTo(.3,2);expect(angle(replacement.view)).toBeGreaterThan(.59);
    replacement.view.disposeCameraControls();view.disposeCameraControls();
  });
  it('retains the building boom and overhead clearance checks around the orbited view',()=>{
    const {view,canvas,update}=create();
    pointer(canvas,'pointerdown',0);pointer(canvas,'pointermove',200);pointer(canvas,'pointerup',200);
    const world={buildingAt:(x:number,z:number)=>Math.hypot(x,z)>3,overheadAt:()=>({bottom:2.5})} as unknown as WorldPhysics;
    update(0,1,world);
    expect(view.camera.position.x).toBeGreaterThan(1.5);
    expect(Math.hypot(view.camera.position.x,view.camera.position.z)).toBeLessThan(3.1);
    expect(view.camera.position.y).toBeLessThan(2);
    view.disposeCameraControls();
  });

  it('keeps chase settling consistent across frame rates and bounds its turn anticipation',()=>{
    const run=(fps:number)=>{
      const {view}=create();
      const update=(view as unknown as {updateCamera(x:number,y:number,z:number,h:number,air:boolean,speed:number,world:WorldPhysics,dt:number,steer:number):void}).updateCamera.bind(view);
      for(let i=0;i<fps;i++)update(10,0,-10,.3,false,18,clearWorld,1/fps,.4);
      return view;
    };
    const a=run(30),b=run(120);
    expect(a.camera.position.distanceTo(b.camera.position)).toBeLessThan(.00001);
    expect(a.camera.quaternion.angleTo(b.camera.quaternion)).toBeLessThan(.00001);
    expect(a.camera.fov).toBeCloseTo(b.camera.fov,6);
    expect(a.camera.position.y).toBeGreaterThan(2.6);
    expect(a.camera.position.y).toBeLessThan(3);
    expect(a.camera.fov).toBeLessThan(66);
    a.disposeCameraControls();b.disposeCameraControls();
  });

  it('keeps reduced-motion driving centred and the flight boom clear of a low deck',()=>{
    const {view}=create();view.reducedShake=true;
    const update=(view as unknown as {updateCamera(x:number,y:number,z:number,h:number,air:boolean,speed:number,world:WorldPhysics,dt:number,steer:number):void}).updateCamera.bind(view);
    update(0,0,0,0,false,24,clearWorld,5,.6);
    const direction=new THREE.Vector3();view.camera.getWorldDirection(direction);
    expect(direction.x).toBeCloseTo(0,8);
    expect(view.camera.fov).toBeCloseTo(58,3);
    const underDeck={buildingAt:()=>null,overheadAt:()=>({bottom:8})} as unknown as WorldPhysics;
    update(0,3,0,0,true,14,underDeck,5,.6);
    expect(view.camera.position.y).toBeLessThanOrEqual(7.4);
    expect(view.camera.position.z).toBeCloseTo(11.5,3);
    expect(view.camera.fov).toBeCloseTo(66,3);
    view.disposeCameraControls();
  });
});

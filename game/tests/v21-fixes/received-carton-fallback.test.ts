import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ModuleBase} from '../../src/delivery/modules/base';
import type {SceneCharacter} from '../../src/delivery/modules/character';
class Transfer extends ModuleBase{
 receiver!:SceneCharacter;
 protected build(){this.receiver=this.character('extra',0,0,-2);}
 update(dt:number){if(this.tick(dt))this.advanceHandoff(dt);}
 onDrop(){this.beginHandoff(this.receiver,()=>this.done());}
}
for(const result of [undefined,false,true])test(`new opt-in receiver retains carton only when meal layer does not accept it (${result})`,()=>{
 const scene=new THREE.Scene(),module=new Transfer(),group=new THREE.Group(),anchor=new THREE.Object3D();
 anchor.rotation.set(.3,.4,.7);anchor.position.set(0,1,.3);group.add(anchor);let done=0;
 const receiver:SceneCharacter={group,leftArm:new THREE.Group(),rightArm:new THREE.Group(),catchPoint:anchor,catchPose(){},...(result!==undefined?{receivePizza:()=>result}:{})};
 module.setup({scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.55,z:0,yaw:0,speed:0}),characterFactory:()=>receiver,canInteract:()=>true,emit:type=>{if(type==='done')done++;}},{immersiveHandoff:true,retainReceivedCarton:true});
 module.onDrop();for(let i=0;i<20;i++)module.update(.05);assert.equal(done,1);
 const carton=scene.getObjectByName(result===true?'delivery-handoff-pizza':'delivery-received-carton')!;
 assert.ok(carton);assert.equal(carton.visible,result!==true);
 if(result!==true){assert.equal(carton.parent,anchor);scene.updateMatrixWorld(true);const q=carton.getWorldQuaternion(new THREE.Quaternion());assert.ok(Math.abs(q.x)+Math.abs(q.y)+Math.abs(q.z)<1e-8,'rotated wrist cannot tilt the horizontal received carton');}
 module.teardown();assert.equal(scene.children.length,0);
});

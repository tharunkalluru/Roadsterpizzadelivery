import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone as cloneSkeleton}from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createMealGeometry,prepareActorPerformanceGeometry}from '../../src/delivery/art/actor-meal-geometry';
function fixture(){
 const root=new THREE.Group(),head=new THREE.Bone();head.name='Head';head.position.y=1.5;root.add(head);
 const bones=['Spine','Spine1','LeftHand','RightArm'].map((name,i)=>{const b=new THREE.Bone();b.name=name;b.position.set(i*.03,0,0);root.add(b);return b;});
 const count=4096,position=new Float32Array(count*3),indices=new Uint16Array(count*4),weights=new Float32Array(count*4);let seed=7421;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<count;i++){position.set([(random()-.5)*.7,.9+random()*.5,random()*.8],i*3);const a=random(),b=random()*.3,scale=i%7===0?1.7:i%11===0?.73:1;indices.set([0,1,2,3],i*4);weights.set([a*scale,(1-a-b)*scale,b*scale,0],i*4);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3));geometry.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());root.add(mesh);root.updateWorldMatrix(true,true);mesh.bind(new THREE.Skeleton(bones));return{root,head,bones,mesh};
}
function full(root:THREE.Group,head:THREE.Object3D,drop:number){root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),point=new THREE.Vector3(),headY=head.getWorldPosition(point).applyMatrix4(inverse).y;let front=-Infinity;root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=node;p&&p!==root;p=p.parent)if(!p.visible)return;const si=node.geometry.getAttribute('skinIndex'),sw=node.geometry.getAttribute('skinWeight');if(node instanceof THREE.SkinnedMesh)node.skeleton.update();for(let i=0;i<node.geometry.getAttribute('position').count;i++){if(node instanceof THREE.SkinnedMesh&&si&&sw){let arms=0;for(let k=0;k<4;k++)if(/Shoulder|Arm|Hand|Index|Middle|Ring|Pinky|Thumb/.test(node.skeleton.bones[si.getComponent(i,k)]?.name??''))arms+=sw.getComponent(i,k);if(arms>.2)continue;}node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);if(point.x<-.095||point.x>.305||point.y<headY-drop+.012||point.y>headY-.12)continue;front=Math.max(front,point.z);}});return Number.isFinite(front)?Math.max(.4,front+.205):.43;}
test('conservative chunks preserve the exact CURRENT posed maximum with blends, non-unit weights, negative weights and transformed roots',async()=>{
 const f=fixture();await prepareActorPerformanceGeometry(f.root,()=>true,()=>Promise.resolve());const scan=createMealGeometry(f.root),base=scan.depth(f.head,.47);let changed=false;
 for(let i=0;i<30;i++){f.root.position.set(3983.1,.66,-2073.2);f.root.rotation.set(.11,i*.27,-.06);f.root.scale.set(.91,1.13,1.04);f.bones[0].rotation.set(i*.07,i*.03,-i*.04);f.bones[1].position.set(.03,.1*Math.sin(i),i*.05);const expected=full(f.root,f.head,.47),actual=scan.depth(f.head,.47);assert.ok(Math.abs(expected-actual)<1e-10,`${i}: ${actual} vs ${expected}`);changed||=Math.abs(expected-base)>.02;}
 assert.ok(changed,'negative control: a cached initial/idle maximum cannot pass this fixture');f.mesh.visible=false;assert.equal(scan.depth(f.head,.47),.43,'current visibility remains authoritative');
});
test('cancelled immutable preprocessing leaves pose untouched, can retry, and shared cloned geometry reuses the completed cache',async()=>{
 const f=fixture(),positions=Array.from(f.mesh.geometry.getAttribute('position').array),quaternions=f.bones.map(b=>b.quaternion.toArray());let valid=true,yields=0;
 await assert.rejects(prepareActorPerformanceGeometry(f.root,()=>valid,async()=>{yields++;valid=false;}),/cancelled/);assert.ok(yields>0);assert.deepEqual(f.bones.map(b=>b.quaternion.toArray()),quaternions);assert.deepEqual(Array.from(f.mesh.geometry.getAttribute('position').array),positions);
 valid=true;yields=0;await prepareActorPerformanceGeometry(f.root,()=>valid,async()=>{yields++;});assert.ok(yields>0,'incomplete job must not masquerade as a prepared cache');
 const clone=cloneSkeleton(f.root)as THREE.Group;yields=0;await prepareActorPerformanceGeometry(clone,()=>true,async()=>{yields++;});assert.equal(yields,0,'clone shares immutable source cache');f.mesh.geometry.dispose();await assert.rejects(prepareActorPerformanceGeometry(clone,()=>false),/cancelled/);
});

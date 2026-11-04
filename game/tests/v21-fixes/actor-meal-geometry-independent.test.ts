import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createMealGeometry,prepareActorPerformanceGeometry} from '../../src/delivery/art/actor-meal-geometry';

function actor(){
  const root=new THREE.Group(),head=new THREE.Object3D();head.name='Head';head.position.y=1.75;root.add(head);
  const spine=new THREE.Bone(),hand=new THREE.Bone();spine.name='Spine';hand.name='LeftHand';root.add(spine,hand);
  const count=1536,p=new Float32Array(count*3),si=new Uint16Array(count*4),sw=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    p.set([-.25+(i%31)/44,1.0+(i%37)/60,-.1+(i%43)/40],i*3);si.set([0,1,0,0],i*4);
    const pair=i%7===0?[1.1,-.1]:i%5===0?[.2,.8]:i%3===0?[1.5,.1]:i%2===0?[.6,.1]:[.9,.1];sw.set([...pair,0,0],i*4);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(p,3));geometry.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());mesh.position.set(.03,-.04,.02);root.add(mesh);root.updateWorldMatrix(true,true);
  mesh.bindMode='detached';mesh.bind(new THREE.Skeleton([spine,hand]),new THREE.Matrix4().set(1.2,.15,0,.07,0,.85,.12,-.03,.08,0,1.1,.05,0,0,0,1));
  return{root,head,spine,hand,mesh};
}

/** Literal current posed-vertex oracle: no cached bounds or helper vertex code. */
function literal(root:THREE.Group,head:THREE.Object3D,drop=.47){
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),point=new THREE.Vector3(),headY=head.getWorldPosition(point).applyMatrix4(inverse).y;let maximum=-Infinity;
  root.traverse(n=>{if(!(n instanceof THREE.Mesh))return;
    for(let a:THREE.Object3D|null=n;a&&a!==root;a=a.parent){if(!a.visible||a.name.startsWith('received-'))return;if(a instanceof THREE.Bone&&/^(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|Index|Middle|Ring|Pinky|Thumb)/.test(a.name))return;}
    const si=n.geometry.getAttribute('skinIndex'),sw=n.geometry.getAttribute('skinWeight');if(n instanceof THREE.SkinnedMesh)n.skeleton.update();
    for(let i=0;i<n.geometry.getAttribute('position').count;i++){
      if(n instanceof THREE.SkinnedMesh&&si&&sw){let excluded=0;for(let k=0;k<4;k++)if(/Shoulder|Arm|Hand|Index|Middle|Ring|Pinky|Thumb/.test(n.skeleton.bones[si.getComponent(i,k)]?.name??''))excluded+=sw.getComponent(i,k);if(excluded>.2)continue;}
      n.getVertexPosition(i,point).applyMatrix4(n.matrixWorld).applyMatrix4(inverse);
      if(point.x>=-.095&&point.x<=.305&&point.y>=headY-drop+.012&&point.y<=headY-.12)maximum=Math.max(maximum,point.z);
    }
  });return Number.isFinite(maximum)?Math.max(.4,maximum+.205):.43;
}

test('independent literal oracle: detached affine bind and non-unit/negative weights remain conservative in changing poses',async()=>{
  const a=actor();await prepareActorPerformanceGeometry(a.root,()=>true,async()=>{});const q=createMealGeometry(a.root);let changing=false,previous=literal(a.root,a.head);
  for(let i=0;i<35;i++){
    a.root.position.set(7381+i,.7,-2973);a.root.rotation.set(.09,i*.19,-.04);a.root.scale.set(.81,1.17,1.09);
    a.spine.rotation.set(.12*Math.sin(i),.09*Math.cos(i),.05*Math.sin(i*.4));a.hand.position.set(.1*Math.sin(i),-.02,.15*Math.cos(i));
    const expected=literal(a.root,a.head),actual=q.depth(a.head,.47);assert.ok(Math.abs(actual-expected)<1e-10,`${i}: ${actual} != ${expected}`);changing ||=Math.abs(expected-previous)>.05;previous=expected;
  }assert.ok(changing,'an idle cached maximum is not an acceptable oracle');
});

test('independent morph and hidden rigid-arm decoys cannot be pruned using the idle source boxes',async()=>{
  const a=actor(),delta=new Float32Array(a.mesh.geometry.getAttribute('position').count*3);for(let i=0;i<delta.length;i+=3)delta[i+2]=2.4;
  a.mesh.geometry.morphAttributes.position=[new THREE.BufferAttribute(delta,3)];a.mesh.geometry.morphTargetsRelative=true;a.mesh.updateMorphTargets();
  const decoy=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial());decoy.position.set(.1,1.45,100);a.hand.add(decoy);
  await prepareActorPerformanceGeometry(a.root,()=>true,async()=>{});const q=createMealGeometry(a.root),before=q.depth(a.head,.47);
  a.mesh.morphTargetInfluences![0]=.9;assert.ok(q.depth(a.head,.47)>before+1,'morph exceeds any nominal .016m mouth allowance');assert.ok(Math.abs(q.depth(a.head,.47)-literal(a.root,a.head))<1e-10);
  a.mesh.visible=false;assert.equal(q.depth(a.head,.47),.43,'rigid hand attachment is not a torso despite its far-forward decoy');
});

test('independent source cache respects bone semantic aliases and does not let a clone pose contaminate another clone',async()=>{
  const a=actor();await prepareActorPerformanceGeometry(a.root,()=>true,async()=>{});
  const clone=cloneSkeleton(a.root)as THREE.Group,mesh=clone.children.find(n=>n instanceof THREE.SkinnedMesh)as THREE.SkinnedMesh,head=clone.getObjectByName('Head')!;
  mesh.skeleton.bones[0].name='RightArm';mesh.skeleton.bones[1].name='Spine';let yields=0;
  await prepareActorPerformanceGeometry(clone,()=>true,async()=>{yields++;});assert.ok(yields>0,'same geometry with different exclusion semantics needs its own classification');
  const original=createMealGeometry(a.root),other=createMealGeometry(clone),before=original.depth(a.head,.47);mesh.skeleton.bones[1].position.z=.7;
  assert.ok(Math.abs(other.depth(head,.47)-literal(clone,head))<1e-10);assert.equal(original.depth(a.head,.47),before);
  a.mesh.geometry.dispose();assert.ok(Math.abs(other.depth(head,.47)-literal(clone,head))<1e-10,'one disposal notification cannot invalidate a live clone source');
});

test('independent preprocessing cancellation never caches a partial mesh or modifies source attributes',async()=>{
  const a=actor(),positions=Array.from(a.mesh.geometry.getAttribute('position').array);let active=true;
  await assert.rejects(prepareActorPerformanceGeometry(a.root,()=>active,async()=>{active=false;}),/cancelled/);
  assert.deepEqual(Array.from(a.mesh.geometry.getAttribute('position').array),positions);active=true;let retryYields=0;
  await prepareActorPerformanceGeometry(a.root,()=>active,async()=>{retryYields++;});assert.ok(retryYields>=3);
  assert.ok(Math.abs(createMealGeometry(a.root).depth(a.head,.47)-literal(a.root,a.head))<1e-10);
});

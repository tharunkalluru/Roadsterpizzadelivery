import * as THREE from 'three';
import type { PersonSpec } from './people';

// One skinned draw replaces the three rigid torso/leg draws for moving walkers.
// Indices are stable across all wardrobe/age appearances; no runtime retargeting.
const B = { root:0, hips:1, spine:2, neck:3, head:4, armL:5, elbowL:6, handL:7, armR:8, elbowR:9, handR:10, thighL:11, kneeL:12, ankleL:13, thighR:14, kneeR:15, ankleR:16 };
export function skinWalkingGeometry(g: THREE.BufferGeometry, wrapped: boolean) {
  if(!g.getAttribute('skinIndex')||!g.getAttribute('skinWeight'))throw new Error('Walking humans require retained anatomical source weights');
  g.computeBoundingBox();g.boundingBox?.expandByScalar(.22);g.computeBoundingSphere();if(g.boundingSphere)g.boundingSphere.radius+=.22;
  return g;
}

export interface HumanWalkRig { mesh: THREE.SkinnedMesh; bones: readonly THREE.Bone[]; update(phase:number,moving:boolean,dt:number):void; dispose():void }
export function makeHumanWalkRig(geometry: THREE.BufferGeometry, material: THREE.Material, spec: PersonSpec, wrapped: boolean): HumanWalkRig {
  const bones=Array.from({length:17},(_,i)=>{const b=new THREE.Bone();b.name=`pedestrian-${Object.keys(B)[i]}`;return b;});
  const attach=(i:number,parent:number,x:number,y:number,z=0)=>{bones[i].position.set(x,y,z);bones[parent].add(bones[i]);};
  attach(B.hips,B.root,0,.84);attach(B.spine,B.hips,0,.31);attach(B.neck,B.spine,0,.24);attach(B.head,B.neck,0,.17);
  for(const right of [false,true]) {
    const side=right?1:-1,arm=right?B.armR:B.armL,elbow=right?B.elbowR:B.elbowL,hand=right?B.handR:B.handL,thigh=right?B.thighR:B.thighL,knee=right?B.kneeR:B.kneeL,ankle=right?B.ankleR:B.ankleL;
    attach(arm,B.spine,side*.19,.18);attach(elbow,arm,side*.055,-.245,-.008);attach(hand,elbow,side*.010,-.240,-.017);
    attach(thigh,B.hips,side*.085,0);attach(knee,thigh,0,-.39);attach(ankle,knee,0,-.36);
  }
  const skeleton=new THREE.Skeleton(bones),mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=`Articulated ${spec.age??spec.kind} pedestrian`;mesh.add(bones[0]);mesh.bind(skeleton);mesh.castShadow=true;mesh.receiveShadow=true;
  // The geometry lease owns its buffers; this figure owns only its bone texture.
  let amplitude=0,lastPhase=0,disposed=false;
  return {mesh,bones,update(phase,moving,dt){
    // A first rAF timestamp can precede a performance.now() sampled after
    // loading. Negative dt made the exponential response negative/unbounded,
    // turning a small walk into many-radian spins. Guard the shared runtime,
    // not only the fixture; app-resume hitches and invalid phases are safe too.
    const step=Number.isFinite(dt)?THREE.MathUtils.clamp(dt,0,.05):0;
    if(Number.isFinite(phase))lastPhase=phase%(Math.PI*2);
    amplitude=THREE.MathUtils.clamp(amplitude+(Number(moving)-amplitude)*(-Math.expm1(-step*10)),0,1);
    const wave=Math.sin(lastPhase),age=spec.age??(spec.kind.startsWith('elder')?'elder':'adult'),stride=(age==='elder'?.24:age==='child'?.38:.34)*amplitude;
    bones[B.hips].rotation.y=wave*.028*amplitude;bones[B.spine].rotation.y=-wave*.035*amplitude;
    bones[B.spine].rotation.x=age==='elder'?-.075:0;
    for(const right of [false,true]) {
      const sign=right?-1:1,w=wave*sign,thigh=right?B.thighR:B.thighL,knee=right?B.kneeR:B.kneeL,ankle=right?B.ankleR:B.ankleL,arm=right?B.armR:B.armL,elbow=right?B.elbowR:B.elbowL;
      const clothStride=wrapped?.62:1;
      bones[thigh].rotation.x=w*stride*clothStride;bones[knee].rotation.x=-Math.max(0,-w)*.68*amplitude*clothStride;
      bones[ankle].rotation.x=Math.max(0,w)*.12*amplitude*clothStride;
      bones[arm].rotation.x=-w*stride*.78;bones[elbow].rotation.x=-.10-Math.max(0,w)*.18*amplitude;
    }
  },dispose(){if(!disposed){disposed=true;skeleton.dispose();}}};
}

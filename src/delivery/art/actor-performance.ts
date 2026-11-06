import * as THREE from 'three';
import type { SceneCharacter } from '../modules/character';
import type { ReleasedCharacterResources } from './released-gltf';
import { CharacterSculpt } from '../modules/character-sculpt';
import {createMealGeometry,registerMealGeometrySource,prepareActorPerformanceGeometry as prepareGeometry} from './actor-meal-geometry';
import { faceMesh,reviewedFaceAnnotation,validFaceAnnotation,type FaceAnnotation } from './face-annotations';

const EATERS = new Set(['pushpa-raj','ram-vvr','jessie','hasini','bhanumathi','sukumar','nani-jersey','arjun-reddy','maruthi','vakeel-saab','srikanth-odela','balayya-chennakesava','shankar-dada']);
const clamp = THREE.MathUtils.clamp;
const smooth = (value:number) => { const t=clamp(value,0,1);return t*t*(3-2*t); };
const step = (dt:number) => Number.isFinite(dt)?clamp(dt,0,.1):0;

export async function prepareActorPerformanceGeometry(root:THREE.Group,identity:string,valid:()=>boolean=()=>true){if(EATERS.has(identity))await prepareGeometry(root,valid);}

/** Sparse, clone-owned displacement. Source GLB, skin weights, textures and all
 * unrelated vertices stay immutable. This is not an audio phoneme generator:
 * an audio player will supply the explicit 0..1 speech envelope later. */
export interface MouthPerformance {
  readonly point:THREE.Object3D;
  readonly bytes:number;
  readonly vertices:number;
  set(amount:number):void;
  dispose():void;
}
export function createMouthPerformance(root:THREE.Group,resources:ReleasedCharacterResources,annotation?:FaceAnnotation,allowPicked=false):MouthPerformance|null {
  if(!annotation||!validFaceAnnotation(root,annotation,annotation.characterId,allowPicked))return null;
  const head=root.getObjectByName(annotation.headNode)!,mesh=faceMesh(root,annotation)!;
  root.updateWorldMatrix(true,true);
  // Anatomical placement is explicit and independently viewed. A proportional
  // head-height guess was rejected natively because it aimed pizza at a nose.
  const anchor=new THREE.Object3D();anchor.name=root.getObjectByName('delivery-mouth-anchor')?'delivery-speech-anchor':'delivery-mouth-anchor';anchor.position.fromArray(annotation.anchorHeadLocal);head.add(anchor);
  const edits=new Map([[mesh,annotation.mask]]);
  const buffers:{attribute:THREE.BufferAttribute;source:THREE.BufferAttribute;edits:{index:number;weight:number;lower:boolean}[];delta:THREE.Vector3;low:number;high:number}[]=[];
  let bytes=0,vertices=0,disposed=false,previous=-1;
  for(const [mesh,entries]of edits){
    const source=mesh.geometry,geometry=new THREE.BufferGeometry();
    for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
    if(source.index)geometry.setIndex(source.index);
    geometry.groups=source.groups.map(group=>({...group}));geometry.drawRange={...source.drawRange};
    geometry.boundingBox=source.boundingBox?.clone()??null;geometry.boundingSphere=source.boundingSphere?.clone()??null;
    if(geometry.boundingSphere)geometry.boundingSphere.radius+=.009;
    const original=source.getAttribute('position') as THREE.BufferAttribute;
    const position=new THREE.BufferAttribute(new Float32Array(original.array),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',position);geometry.name=`${source.name}:instance-mouth`;
    geometry.userData={...source.userData,deliveryMouthInstance:true};registerMealGeometrySource(geometry,source);mesh.geometry=resources.geometry(geometry);
    // The native annotation's reviewed up direction is in mesh coordinates; skinning still follows
    // the original head. No world coordinate enters a vertex buffer.
    const delta=new THREE.Vector3(...annotation.displacementUp);
    buffers.push({attribute:position,source:original,edits:entries,delta,low:Math.min(...entries.map(e=>e.index))*3,high:(Math.max(...entries.map(e=>e.index))+1)*3});
    bytes+=position.array.byteLength;vertices+=entries.length;
    // Eight millimetres of face displacement; IK is separately bounded below.
    if(mesh instanceof THREE.SkinnedMesh&&mesh.boundingSphere)mesh.boundingSphere.radius+=.009;
  }
  return {point:anchor,bytes,vertices,set(amount){
    if(disposed)return;const value=Number.isFinite(amount)?clamp(amount,0,1):0;if(value===previous)return;previous=value;
    for(const buffer of buffers){
      for(const entry of buffer.edits){const d=value*entry.weight*(entry.lower?-.008:.0015),i=entry.index;
        buffer.attribute.setXYZ(i,buffer.source.getX(i)+buffer.delta.x*d,buffer.source.getY(i)+buffer.delta.y*d,buffer.source.getZ(i)+buffer.delta.z*d);}
      buffer.attribute.clearUpdateRanges();buffer.attribute.addUpdateRange(buffer.low,buffer.high-buffer.low);buffer.attribute.needsUpdate=true;
    }
  },dispose(){if(disposed)return;this.set(0);disposed=true;anchor.removeFromParent();}};
}

/** CCD rotates existing bones only: no detached replacement hands or stretch. */
const ikScratch=new WeakMap<THREE.Group,{palm:THREE.Vector3;joint:THREE.Vector3;from:THREE.Vector3;to:THREE.Vector3;world:THREE.Quaternion;parent:THREE.Quaternion;turn:THREE.Quaternion}>();
export function solveHandTarget(root:THREE.Group,side:'Left'|'Right',target:THREE.Vector3,iterations=5,palmOrientation?:THREE.Quaternion,elbowPole?:THREE.Vector3,palmOffset=new THREE.Vector3(0,.035,0)){
  const hand=root.getObjectByName(`${side}Hand`),elbow=root.getObjectByName(`${side}ForeArm`),shoulder=root.getObjectByName(`${side}Arm`);
  if(!hand||!elbow||!shoulder)return false;
  let scratch=ikScratch.get(root);if(!scratch){scratch={palm:new THREE.Vector3(),joint:new THREE.Vector3(),from:new THREE.Vector3(),to:new THREE.Vector3(),world:new THREE.Quaternion(),parent:new THREE.Quaternion(),turn:new THREE.Quaternion()};ikScratch.set(root,scratch);}
  const {palm,joint,from,to,world,parent,turn}=scratch;
  const orientHand=()=>{
    if(!palmOrientation)return;
    parent.identity();hand.parent?.getWorldQuaternion(parent);
    hand.quaternion.copy(parent.invert().multiply(palmOrientation));hand.updateWorldMatrix(true,false);
  };
  if(elbowPole&&palmOrientation){
    // A controlled outboard elbow keeps the holding forearm beside the finite
    // box/lid. Unconstrained CCD could cut straight through its rear panel.
    orientHand();const start=shoulder.getWorldPosition(new THREE.Vector3()),middle=elbow.getWorldPosition(new THREE.Vector3()),end=hand.getWorldPosition(new THREE.Vector3());
    const wrist=target.clone().sub(palmOffset.clone().applyQuaternion(palmOrientation));
    const upper=start.distanceTo(middle),lower=middle.distanceTo(end),axis=wrist.clone().sub(start),length=axis.length();
    if(upper>1e-6&&lower>1e-6&&length>1e-6){
      axis.divideScalar(length);const distance=clamp(length,Math.abs(upper-lower)+1e-5,upper+lower-1e-5),along=(upper*upper-lower*lower+distance*distance)/(2*distance),radius=Math.sqrt(Math.max(0,upper*upper-along*along));
      const pole=elbowPole.clone().addScaledVector(axis,-elbowPole.dot(axis)).normalize(),goal=start.clone().addScaledVector(axis,along).addScaledVector(pole,radius);
      const aim=(bone:THREE.Object3D,fromPoint:THREE.Vector3,toPoint:THREE.Vector3)=>{
        bone.getWorldPosition(joint);from.subVectors(fromPoint,joint).normalize();to.subVectors(toPoint,joint).normalize();turn.setFromUnitVectors(from,to);
        bone.getWorldQuaternion(world);world.premultiply(turn);parent.identity();bone.parent?.getWorldQuaternion(parent);bone.quaternion.copy(parent.invert().multiply(world));bone.updateWorldMatrix(true,true);
      };
      aim(shoulder,middle,goal);elbow.getWorldPosition(middle);hand.getWorldPosition(end);aim(elbow,end,start.clone().addScaledVector(axis,distance));orientHand();return true;
    }
  }
  for(let pass=0;pass<iterations;pass++)for(const bone of [elbow,shoulder]){
    // Position-only CCD leaves an upright palm across the recipient's face.
    // Reapply the desired wrist world orientation as each parent rotates, so
    // the palm-offset target stays correct throughout the solve.
    orientHand();
    hand.updateWorldMatrix(true,false);palm.copy(palmOffset).applyMatrix4(hand.matrixWorld);bone.getWorldPosition(joint);
    from.subVectors(palm,joint);to.subVectors(target,joint);if(from.lengthSq()<1e-9||to.lengthSq()<1e-9)continue;
    turn.setFromUnitVectors(from.normalize(),to.normalize());bone.getWorldQuaternion(world);world.premultiply(turn);
    parent.identity();bone.parent?.getWorldQuaternion(parent);bone.quaternion.copy(parent.invert().multiply(world));
  }
  orientHand();hand.updateWorldMatrix(true,false);return true;
}

/** Bind the upper skin of the supporting finger pads, rather than assuming
 * the wrist offset is the surface. Nails and wedding bangles do not determine
 * the anchor. This scan runs once while preparing the actor. */
function supportPalmSurface(root:THREE.Group,mealGeometry:ReturnType<typeof createMealGeometry>){
  mealGeometry.update();const hand=root.getObjectByName('LeftHand'),point=new THREE.Vector3();
  const samples:{mesh:THREE.SkinnedMesh;indices:number[]}[]=[];
  if(!hand)return {offset:new THREE.Vector3(0,.035,0),samples};
  const inverse=hand.matrixWorld.clone().invert(),best=new THREE.Vector3(0,.105,.02);let highest=-Infinity;
  for(const {mesh,source}of mealGeometry.entries){if(!(mesh instanceof THREE.SkinnedMesh)||!source.left.length)continue;
    samples.push({mesh,indices:source.left});for(const i of source.left){mealGeometry.vertex(mesh,i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
      if(Math.abs(point.x)>.026||point.y<.085||point.y>.125||point.z<highest)continue;highest=point.z;best.copy(point);}
  }return {offset:best,samples};
}

export function installActorPerformance(actor:SceneCharacter,identity:string,resources:ReleasedCharacterResources,previewAnnotation?:FaceAnnotation){
  const root=actor.group,head=root.getObjectByName('Head');if(!head)return {bytes:0,dispose(){}};
  const annotation=previewAnnotation?.characterId===identity?previewAnnotation:reviewedFaceAnnotation(identity);
  const mouth=createMouthPerformance(root,resources,annotation,!!previewAnnotation),eligible=!!mouth&&EATERS.has(identity)&&!!root.getObjectByName('LeftHand')&&!!root.getObjectByName('RightHand');
  const state={phase:'idle',time:0,mouth:0,speech:0,eligible,mouthVertices:mouth?.vertices??0};root.userData.deliveryPerformance=state;
  const baseAnimate=actor.animate,baseCatch=actor.catchPose,up=new THREE.Vector3(),leftTarget=new THREE.Vector3(),rightTarget=new THREE.Vector3(),mouthTarget=new THREE.Vector3();
  const handPoint=new THREE.Vector3(),sliceTip=new THREE.Vector3(),sliceGrip=new THREE.Vector3();
  const restingSlice=new THREE.Quaternion(),biteSlice=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,Math.PI,0));
  const palmUpLocal=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),palmUpWorld=new THREE.Quaternion();
  // Palm faces up; fingers point inward beneath the actor's left tray edge.
  const leftGripLocal=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-1),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0))),leftGripWorld=new THREE.Quaternion();
  const mealGeometry=eligible?createMealGeometry(root):null;
  const leftSupport=eligible?supportPalmSurface(root,mealGeometry!):{offset:new THREE.Vector3(0,.035,0),samples:[]};
  const leftElbowPole=new THREE.Vector3(),rightElbowPole=new THREE.Vector3();
  const carton=new THREE.Group(),hinge=new THREE.Group(),slice=new THREE.Group();carton.name='received-pizza-openable-carton';hinge.name='received-carton-lid';slice.name='received-pizza-slice';
  let fullPizza:THREE.Mesh|undefined,remainingPizza:THREE.Mesh|undefined;
  const cartonDrop=.47;
  let built=false,received=false,disposed=false,speech=0,meal=0,bookVisible=actor.book?.visible??true,cartonDepth=.43,dancing=false;
  const material=(key:string,color:string)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0});resources.material(`delivery-meal-${identity}-${key}`,m);return m;};
  const addBox=(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(resources.geometry(new THREE.BoxGeometry(w,h,d)),m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const build=()=>{
    if(built)return;built=true;
    // Reviewed clip spheres cover those clips, not this new arm articulation.
    // Expand clone-owned skin spheres by the chain's full reachable volume;
    // keep normal frustum culling rather than hiding clipping with culling off.
    root.updateWorldMatrix(true,true);
    const reach:THREE.Sphere[]=[];
    for(const side of ['Left','Right']){
      const arm=root.getObjectByName(`${side}Arm`),fore=root.getObjectByName(`${side}ForeArm`),hand=root.getObjectByName(`${side}Hand`);if(!arm||!fore||!hand)continue;
      const a=arm.getWorldPosition(new THREE.Vector3()),b=fore.getWorldPosition(new THREE.Vector3()),c=hand.getWorldPosition(new THREE.Vector3());
      reach.push(new THREE.Sphere(a,a.distanceTo(b)+b.distanceTo(c)+.18));
    }
    root.traverse(node=>{if(!(node instanceof THREE.SkinnedMesh))return;
      if(!node.boundingSphere)node.computeBoundingSphere();else node.boundingSphere=node.boundingSphere.clone();
      const inverse=node.matrixWorld.clone().invert();for(const sphere of reach)node.boundingSphere!.union(sphere.clone().applyMatrix4(inverse));
    });
    const card=material('card','#DBBD88'),lid=material('lid','#BB3D2E'),cheese=material('cheese','#F1BC40'),crust=material('crust','#C98232');
    addBox(carton,.32,.018,.32,0,0,0,card);for(const x of[-.154,.154])addBox(carton,.012,.04,.32,x,.024,0,card);for(const z of[-.154,.154])addBox(carton,.32,.04,.012,0,.024,z,card);
    hinge.position.set(0,.025,-.16);carton.add(hinge);addBox(hinge,.32,.012,.32,0,.014,.16,lid);
    addBox(hinge,.15,.001,.15,0,.0205,.16,card);
    const pizzaMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9});resources.material(`delivery-meal-${identity}-pizza-top`,pizzaMaterial);
    const makeRoundPizza=(cut:boolean)=>{
      const sculpture=new CharacterSculpt(),length=cut?Math.PI*2-.8:Math.PI*2,start=cut?.4:0;
      const crustGeometry=new THREE.CylinderGeometry(.168,.168,.014,32,1,false,start,length);crustGeometry.translate(0,.023,0);sculpture.add(crustGeometry,'#BF762A');
      const cheeseGeometry=new THREE.CylinderGeometry(.151,.151,.004,32,1,false,start,length);cheeseGeometry.translate(0,.032,0);sculpture.add(cheeseGeometry,'#EABD45');
      for(const [x,z]of [[-.07,-.06],[.06,-.07],[-.09,.04],[.08,.05],[0,-.02]]as const){const disc=new THREE.CylinderGeometry(.018,.018,.002,10);disc.translate(x,.035,z);sculpture.add(disc,'#A73B27');}
      const mesh=new THREE.Mesh(resources.geometry(sculpture.finish()),pizzaMaterial);mesh.scale.setScalar(.84);carton.add(mesh);return mesh;
    };
    fullPizza=makeRoundPizza(false);remainingPizza=makeRoundPizza(true);remainingPizza.visible=false;
    const shape=new THREE.Shape();shape.moveTo(-.085,-.085);shape.lineTo(.085,-.085);shape.lineTo(0,.13);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.011,bevelEnabled:false});geometry.rotateX(Math.PI/2);slice.add(new THREE.Mesh(resources.geometry(geometry),cheese));
    addBox(slice,.17,.019,.025,0,.008,-.079,crust);slice.name='received-pizza-slice';root.add(carton,slice);carton.visible=slice.visible=false;
  };
  const apply=()=>{
    if(disposed)return;
    if(received&&eligible){
      const t=meal,opening=smooth((t-.45)/.9),lifting=smooth((t-1.8)/1.15),lowering=smooth((t-4.4)/1.05),lift=lifting*(1-lowering);
      const sliceScale=(t>3.65?.73:1)*.70;
      slice.quaternion.slerpQuaternions(restingSlice,biteSlice,lift);slice.scale.setScalar(sliceScale);
      // Pushpa's seated reach supports the underside just ahead of the crust;
      // his wrist then clears the actual 12mm lid thickness at the bite pose.
      sliceGrip.set(0,.008,identity==='pushpa-raj'?-.039:-.079).applyQuaternion(slice.quaternion).multiplyScalar(sliceScale);
      head.getWorldPosition(up);root.worldToLocal(up);
      // Held on the left palm in front of the torso, clear of the reviewed
      // clothing. The right palm opens the lid, then carries the slice.
      carton.position.set(.105,up.y-cartonDrop,cartonDepth);hinge.rotation.x=-1.55*opening;carton.visible=true;
      if(fullPizza)fullPizza.visible=t<1.75;if(remainingPizza)remainingPizza.visible=t>=1.75;
      root.updateWorldMatrix(true,true);
      root.getWorldQuaternion(palmUpWorld);palmUpWorld.multiply(palmUpLocal);
      root.getWorldQuaternion(leftGripWorld);leftGripWorld.multiply(leftGripLocal);
      // Grip the outer carton edge. An upward-facing thumb under the middle
      // of the tray previously pierced the pizza in the native close-up.
      leftElbowPole.set(1,0,0).transformDirection(root.matrixWorld);
      // Support the lower outer edge, not the closed lid. The approved wedding
      // bangles and Hasini's continuous bare-arm mesh need a wider grip; their
      // actual triangles remain in the contact audit rather than being hidden.
      leftTarget.set(carton.position.x+.14,carton.position.y-.0115,cartonDepth-.14);root.localToWorld(leftTarget);solveHandTarget(root,'Left',leftTarget,9,leftGripWorld,leftElbowPole,leftSupport.offset);
      // Pull the lid at its actual right side, then withdraw around that
      // outside edge before reaching into the tray. A straight middle-to-face
      // chord previously sent the forearm through the open red lid.
      const angle=hinge.rotation.x,release=smooth((t-1.05)/.35),pick=smooth((t-1.4)/.35);
      const gripY=carton.position.y+.025+.014*Math.cos(angle)-.12*Math.sin(angle)-.03;
      const gripZ=cartonDepth-.16+.014*Math.sin(angle)+.12*Math.cos(angle)+.015;
      rightTarget.set(-.145+pick*.035,THREE.MathUtils.lerp(gripY,carton.position.y+.06,release),THREE.MathUtils.lerp(gripZ,cartonDepth-.07,release));root.localToWorld(rightTarget);
      if(t>=4.4){rightTarget.set(-.40,up.y-.45,.23);root.localToWorld(rightTarget);}
      if(mouth){
        // Aim the edible tip, not the palm, at the lips. Holding the slice's
        // centre against the mouth put its crust through the face and left
        // the point 13cm out in the air. The palm stays in front of the face.
        mouth.point.getWorldPosition(mouthTarget);root.worldToLocal(mouthTarget);
        mouthTarget.y-=.006;mouthTarget.z+=.022;
        sliceTip.set(0,0,.13).applyQuaternion(slice.quaternion).multiplyScalar(sliceScale);
        mouthTarget.sub(sliceTip).add(sliceGrip);mouthTarget.y-=.035;
        root.localToWorld(mouthTarget);
        // Go around the side of the real finite lid in three stages. A single
        // diagonal lift cut through Pushpa's lid because his seated mouth is
        // below its top. First withdraw sideways, then pass behind the panel,
        // then move inward to the lips. Reverse the route before lowering.
        root.worldToLocal(rightTarget);root.worldToLocal(mouthTarget);
        const extraction=smooth((t-1.8)/.4),around=smooth((t-2.2)/.4),inward=smooth((t-2.6)/.4);
        if(t<4.4){
          rightTarget.x=THREE.MathUtils.lerp(rightTarget.x,-.205,extraction);
          rightTarget.y=THREE.MathUtils.lerp(rightTarget.y,mouthTarget.y,extraction);
          rightTarget.z=THREE.MathUtils.lerp(rightTarget.z,mouthTarget.z,around);
          rightTarget.x=THREE.MathUtils.lerp(rightTarget.x,mouthTarget.x,inward);
        }else{
          const outward=smooth((t-4.4)/.3),forwards=smooth((t-4.7)/.3),down=smooth((t-5)/.4);
          rightTarget.set(THREE.MathUtils.lerp(mouthTarget.x,-.40,outward),THREE.MathUtils.lerp(mouthTarget.y,up.y-.45,down),THREE.MathUtils.lerp(mouthTarget.z,.23,forwards));
        }
        root.localToWorld(rightTarget);
      }
      rightElbowPole.set(-1,0,0).transformDirection(root.matrixWorld);
      solveHandTarget(root,'Right',rightTarget,9,palmUpWorld,rightElbowPole);
      root.updateWorldMatrix(true,true);
      // The flat palm supports the crust, rather than intersecting the middle
      // of the pizza. Fingers point beneath the slice, away from the eyes.
      const hand=root.getObjectByName('RightHand')!;slice.position.copy(root.worldToLocal(handPoint.set(0,.035,0).applyMatrix4(hand.matrixWorld))).sub(sliceGrip);slice.position.y+=.035;
      slice.visible=t>1.75&&t<5.5;
      state.phase=t<.45?'holding':t<1.4?'opening':t<3?'lifting':t<4.4?'eating':t<5.5?'lowering':'enjoying';
      const chewing=t>3.05&&t<4.4?.25+.55*Math.abs(Math.sin((t-3.05)*Math.PI*4)):0;
      state.mouth=Math.max(speech,chewing);
    }else state.mouth=speech;
    mouth?.set(state.mouth);root.updateWorldMatrix(true,true);
  };
  actor.setSpeechEnvelope=amount=>{state.speech=Number.isFinite(amount)?clamp(amount,0,1):0;};
  actor.receivePizza=()=>{
    if(disposed||!eligible||received)return false;
    // The authored catch is finished. Calibrating while that upper-body clip
    // still owns the fingers gives the subsequent catch fade a different
    // supporting surface. Stop it before measuring, and let the meal layer
    // own the received hands from here on.
    baseCatch(0);
    // Received dancers already use Idle below. Finish that authored150ms pose
    // crossfade before the one-time torso/palm measurements, not afterwards.
    // Only the actor pose is sampled; story time and the six-second meal are
    // unchanged, and an unreceived actor's original motion is untouched.
    if(dancing){baseAnimate?.(.1,'idle',0);baseAnimate?.(.051,'idle',0);}
    build();if(actor.book){bookVisible=actor.book.visible;actor.book.visible=false;}
    cartonDepth=mealGeometry!.depth(head,cartonDrop);received=true;meal=0;state.phase='holding';apply();
    // Skin blended across the wrist can sit above a rigid wrist-space guess.
    // Calibrate once against the actual posed hand under the actual tray. No
    // source geometry, finger lengths or per-frame vertex scans are changed.
    const inverse=root.matrixWorld.clone().invert(),point=new THREE.Vector3();
    for(let pass=0;pass<3;pass++){
      mealGeometry!.update();let top=-Infinity;
      for(const sample of leftSupport.samples){sample.mesh.skeleton.update();for(const index of sample.indices){mealGeometry!.vertex(sample.mesh,index,point).applyMatrix4(sample.mesh.matrixWorld).applyMatrix4(inverse);
        if(Math.abs(point.x-carton.position.x)<.159&&Math.abs(point.z-carton.position.z)<.159)top=Math.max(top,point.y);}}
      const correction=top-(carton.position.y-.0115);if(!Number.isFinite(correction)||correction<.0001)break;
      leftSupport.offset.z+=Math.min(.025,correction);apply();
    }return true;
  };
  actor.animate=(dt,mode,speed)=>{
    if(disposed)return;const elapsed=step(dt);dancing=mode==='dance';baseAnimate?.(elapsed,received&&dancing?'idle':mode,speed);
    // Bound the sequence instead of running a hidden perpetual meal loop.
    if(received)meal=Math.min(6,meal+elapsed);state.time=meal;
    speech+=(state.speech-speech)*(1-Math.exp(-elapsed*25));if(Math.abs(speech)<1e-5)speech=0;apply();
  };
  actor.catchPose=amount=>{if(!received)baseCatch(amount);apply();};
  // Construct while the host's existing actor preparation screen is active.
  // Hidden meshes are included in the exact-instance GPU warm-up, avoiding new
  // geometry/material creation at the handover beat itself.
  if(eligible)build();
  return {bytes:mouth?.bytes??0,dispose(){
    if(disposed)return;disposed=true;mouth?.dispose();carton.removeFromParent();slice.removeFromParent();
    if(actor.book)actor.book.visible=bookVisible;
    delete root.userData.deliveryPerformance;
  }};
}

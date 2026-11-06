import * as THREE from 'three';
import type { RiderEnvelope } from './rail-rider-clearance';

const measuredModels=new WeakMap<RiderEnvelope,{radius:number;bottom:number;top:number;rotationRadius:number}>();

/** One cheap bound for the actual smoothed posture. On a confirmed ordinary
 * flat train roof, roadPitch/landmarkRoll target zero, so their absolute values
 * cannot grow before the next check. Steering may still add either .06 lean.
 * A missing/foreign support receives the angle-independent hard envelope. */
export function railRiderEnvelopeAtPose(measured:RiderEnvelope,pose:{roadPitch:number;landmarkRoll:number;airborne:boolean},confirmedFlatRoof:boolean):RiderEnvelope {
  const model=measuredModels.get(measured);if(!model)throw Error('Unmeasured rider model');
  if(!confirmedFlatRoof)return measured;
  if(!Number.isFinite(pose.roadPitch+pose.landmarkRoll))throw Error('Invalid rider posture');
  const angle=pose.airborne?.12:Math.abs(pose.roadPitch)+Math.abs(pose.landmarkRoll)+.06;
  // Rotation through total angular distance theta moves every vertex at most
  // 2R*sin(theta/2). Clamp at pi for a global diameter bound, never at a smaller
  // expected road slope; inherited landmark transitions remain covered.
  const delta=2*model.rotationRadius*Math.sin(Math.min(Math.PI,angle)/2);
  return{radius:Math.min(measured.radius,model.radius+delta),bottom:Math.max(measured.bottom,model.bottom-delta),top:Math.min(measured.top,model.top+delta),
    launchRadius:measured.launchRadius,launchBottom:measured.launchBottom,launchTop:measured.launchTop};
}

/** Actual immutable car vertices, including hidden pizza cargo, at the two
 * equipment endpoints. vehicles.ts moves equipment linearly in eased amount;
 * its only equipment rotation is the spoiler's 0.1 radian X rotation. The
 * interpolation remainder for each rotating vertex is <= radius*angle²/8.
 * Thus endpoint union plus that measured bound covers every intermediate
 * deployment without a sampled-only safety claim. Roll/yaw preserve the
 * circumsphere about the actual kickflip centre. */
export function measureRailRiderEnvelope(player:{group:THREE.Group;setDeployment:(n:number)=>void;thrusterDeployment:number;nozzles:readonly{jet?:THREE.Object3D|null}[]}):RiderEnvelope {
  const root=player.group,excluded=new Set<THREE.Object3D>();
  for(const n of player.nozzles)n.jet?.traverse(node=>excluded.add(node));
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  const transforms:{node:THREE.Object3D;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}[]=[];
  root.traverse(node=>transforms.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));
  let bottom=Infinity,top=-Infinity,radius=0,rootRadius=0,pivotRadius=0;const points:[number,number,number][]=[];
  try{
    for(const deployment of[null,0,1]){
      if(deployment!==null)player.setDeployment(deployment);root.updateMatrixWorld(true);
      root.traverse(node=>{
        if(excluded.has(node)||node.userData.roadsterDecal)return;
        matrix.multiplyMatrices(inverse,node.matrixWorld);point.setFromMatrixPosition(matrix);pivotRadius=Math.max(pivotRadius,point.length());
        if(!(node instanceof THREE.Mesh))return;
        const positions=node.geometry.getAttribute('position');if(!positions)return;
        for(let i=0;i<positions.count;i++){
          point.set(positions.getX(i),positions.getY(i),positions.getZ(i)).applyMatrix4(matrix);
          if(!Number.isFinite(point.x+point.y+point.z))throw Error('Invalid physical Roadster vertex');
          points.push([point.x,point.y,point.z]);bottom=Math.min(bottom,point.y);top=Math.max(top,point.y);radius=Math.max(radius,Math.hypot(point.x,point.z));rootRadius=Math.max(rootRadius,point.length());
        }
      });
    }
  }finally{
    // Restore actual local transforms, not just a nominal deployment amount:
    // Player has reparented these same parts beneath its kickflip pivot.
    for(const t of transforms){t.node.position.copy(t.position);t.node.quaternion.copy(t.quaternion);t.node.scale.copy(t.scale);}root.updateMatrixWorld(true);
  }
  if(!points.length)throw Error('A measured physical Roadster is required');
  const pivot=root.children.find(n=>n.name==='Takeoff kickflip');
  if(!pivot||pivot.rotation.z!==0)throw Error('Measure the actual upright kickflip root before gameplay');
  const reserve=(rootRadius+pivotRadius)*(.1*.1/8),center=pivot.position.y;
  let launch=0;for(const[x,y,z]of points)launch=Math.max(launch,Math.hypot(x,y-center,z));
  const sphere=launch+reserve;
  // max(|sin|*halfWidth+|cos|*halfHeight)-halfHeight <= halfWidth.
  // Include Player's .04 bound padding, the .45 takeoff accent, the separate
  // <=.45 jump accent and the actual .06 flight bob below.
  let maximumHalfWidth=0;for(const p of points)maximumHalfWidth=Math.max(maximumHalfWidth,Math.abs(p[0]));maximumHalfWidth+=reserve+.04;
  const maximumLift=maximumHalfWidth+.9;
  // Player also pitches by .06 and banks by at most .06. Those root rotations
  // rotate the lifted pivot itself about the physical origin. A sphere about
  // the pivot alone misses this horizontal translation; bound its displacement
  // by the summed angular excursion without changing any actual animation.
  const rootAngle=.12,pivotShift=(Math.abs(center)+maximumLift)*Math.sin(rootAngle);
  // Ordinary support can retain a smoothed landmark pose while landing onto a
  // train. The landmark contact gradient bound is 2 (far beyond .06 airborne
  // pitch/bank), and independent pitch/roll smoothing can retain a combination
  // that does not describe a single current ground plane. Use the measured
  // origin-centred sphere: it covers EVERY root rotation, including this real
  // transition, without assuming the car is already upright on its first roof
  // frame. This is deliberately a conservative rider stop, never a clearance
  // permission or an alteration to the player's visual pose.
  const ordinaryRadius=rootRadius+reserve;
  const measured=Object.freeze({radius:ordinaryRadius,launchRadius:Math.max(ordinaryRadius,Math.max(radius,launch)+reserve+pivotShift),bottom:-ordinaryRadius,top:ordinaryRadius,
    launchBottom:Math.min(-ordinaryRadius,center-sphere-Math.abs(center)*(1-Math.cos(rootAngle))-.06),
    launchTop:Math.max(ordinaryRadius,center+sphere+maximumLift+.06)});
  measuredModels.set(measured,{radius:radius+reserve,bottom:bottom-reserve,top:top+reserve,rotationRadius:ordinaryRadius});return measured;
}

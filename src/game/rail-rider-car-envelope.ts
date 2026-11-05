import * as THREE from 'three';
import type { RiderEnvelope } from './rail-rider-clearance';

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
  // Takeoff lift is <= max(width,height)-height + .45. The sphere is also
  // >= width, so sphere+.45 is a conservative lift bound. Include the actual
  // flight bob amplitude (.06) without shrinking the collision envelope.
  return Object.freeze({radius:radius+reserve,launchRadius:Math.max(radius,launch)+reserve,bottom:bottom-reserve,top:top+reserve,
    launchBottom:Math.min(bottom-reserve,center-sphere)-.06,launchTop:Math.max(top+reserve,center+2*sphere+.45)+.06});
}

import * as THREE from 'three';
import data from './face-annotations.json';
import assets from './character-assets.json';

export interface FaceAnnotation {
  schemaVersion:1;
  characterId:string;
  glbSha256:string;
  meshName:string;
  nodePath:number[];
  positionCount:number;
  headNode:string;
  /** Absent retains the original actor-local mask; explicit for turned heads. */
  coordinateSpace?:'head-local';
  anchorHeadLocal:[number,number,number];
  sourceTriangle:{indices:[number,number,number];barycentric:[number,number,number]};
  displacementUp:[number,number,number];
  mask:{index:number;weight:number;lower:boolean}[];
  review:{status:'picked'|'approved';method:'native-visible-face-pick';pickedAt:string;approvedAt?:string};
}

export function faceMesh(root:THREE.Group,annotation:FaceAnnotation):THREE.Mesh|null {
  let node:THREE.Object3D=root;
  for(const index of annotation.nodePath){if(!Number.isInteger(index)||index<0||!node.children[index])return null;node=node.children[index];}
  return node instanceof THREE.Mesh&&node.name===annotation.meshName&&node.geometry.getAttribute('position')?.count===annotation.positionCount?node:null;
}
export function validFaceAnnotation(root:THREE.Group,annotation:FaceAnnotation,identity:string,allowPicked=false){
  const expected=assets.assets.find(asset=>asset.characterId===identity)?.glb.sha256;
  const bound=root.userData.releasedCharacter?.glbSha256;
  const triple=(v:unknown):v is [number,number,number]=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(annotation?.schemaVersion!==1||annotation.characterId!==identity||!expected||annotation.glbSha256!==expected||bound!==expected||
    (annotation.coordinateSpace!==undefined&&annotation.coordinateSpace!=='head-local')||
    (annotation.coordinateSpace==='head-local'&&annotation.headNode!=='Head')||
    !Array.isArray(annotation.nodePath)||annotation.nodePath.length>32||!triple(annotation.anchorHeadLocal)||!triple(annotation.displacementUp)||
    !triple(annotation.sourceTriangle?.indices)||!triple(annotation.sourceTriangle?.barycentric)||!Array.isArray(annotation.mask)||
    !['picked','approved'].includes(annotation.review?.status)||(!allowPicked&&annotation.review?.status!=='approved')||annotation.review?.method!=='native-visible-face-pick'||
    !root.getObjectByName(annotation.headNode)||!faceMesh(root,annotation)||!annotation.mask.length||annotation.mask.length>2000)return false;
  if([...annotation.anchorHeadLocal,...annotation.displacementUp,...annotation.sourceTriangle.barycentric].some(n=>!Number.isFinite(n)))return false;
  if(Math.hypot(...annotation.anchorHeadLocal)>.45||Math.hypot(...annotation.displacementUp)<.5||Math.hypot(...annotation.displacementUp)>2)return false;
  if(annotation.sourceTriangle.indices.some(i=>!Number.isInteger(i)||i<0||i>=annotation.positionCount)||
    annotation.sourceTriangle.barycentric.some(v=>v<-.0001||v>1.0001)||Math.abs(annotation.sourceTriangle.barycentric.reduce((a,b)=>a+b,0)-1)>.0001)return false;
  const unique=new Set<number>();
  for(const entry of annotation.mask){if(!Number.isInteger(entry.index)||entry.index<0||entry.index>=annotation.positionCount||unique.has(entry.index)||!Number.isFinite(entry.weight)||entry.weight<=0||entry.weight>1||typeof entry.lower!=='boolean')return false;unique.add(entry.index);}
  const mesh=faceMesh(root,annotation)!,head=root.getObjectByName(annotation.headNode)!;
  const [a,b,c]=annotation.sourceTriangle.indices,index=mesh.geometry.index;
  if(a===b||b===c||a===c)return false;
  let triangle=false;
  if(index){for(let i=0;i<index.count;i+=3)if(index.getX(i)===a&&index.getX(i+1)===b&&index.getX(i+2)===c){triangle=true;break;}}
  else triangle=a%3===0&&b===a+1&&c===a+2;
  if(!triangle)return false;
  root.updateWorldMatrix(true,true);if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();
  const bary=annotation.sourceTriangle.barycentric,reconstructed=new THREE.Vector3(),point=new THREE.Vector3();
  for(let i=0;i<3;i++){mesh.getVertexPosition(annotation.sourceTriangle.indices[i],point).applyMatrix4(mesh.matrixWorld);reconstructed.addScaledVector(point,bary[i]);}
  const picked=head.localToWorld(new THREE.Vector3(...annotation.anchorHeadLocal));
  if(reconstructed.distanceTo(picked)>.002)return false;
  const frame=annotation.coordinateSpace==='head-local'?head:root;
  const inverse=frame.matrixWorld.clone().invert(),local=picked.clone().applyMatrix4(inverse),headAt=head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
  if(Math.abs(local.x-headAt.x)>.16||Math.abs(local.y-headAt.y)>.24)return false;
  const byIndex=new Map(annotation.mask.map(entry=>[entry.index,entry]));let expectedCount=0;
  for(let i=0;i<annotation.positionCount;i++){
    mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
    const x=(point.x-local.x)/.035,y=(point.y-local.y)/.018,radius=x*x+y*y;
    if(radius>=1||Math.abs(point.z-local.z)>.015)continue;
    const entry=byIndex.get(i);if(!entry||Math.abs(entry.weight-(1-radius)**2)>.01||entry.lower!==(y<=0))return false;expectedCount++;
  }
  if(expectedCount!==annotation.mask.length)return false;
  const inverseMesh=mesh.matrixWorld.clone().invert(),base=new THREE.Vector3().applyMatrix4(frame.matrixWorld).applyMatrix4(inverseMesh);
  const up=new THREE.Vector3(0,1,0).applyMatrix4(frame.matrixWorld).applyMatrix4(inverseMesh).sub(base);
  if(up.distanceTo(new THREE.Vector3(...annotation.displacementUp))>.0001)return false;
  return true;
}
export function reviewedFaceAnnotation(identity:string):FaceAnnotation|undefined {
  return (data.entries as FaceAnnotation[]).find(entry=>entry.characterId===identity&&entry.review?.status==='approved');
}

/** Development viewer only: the native click supplies the anatomical point.
 * No head proportions, URLs or caller-selected model bytes are inferred. */
export function pickFaceAnnotation(root:THREE.Group,identity:string,hit:THREE.Intersection,coordinateSpace?:'head-local'):FaceAnnotation {
  const mesh=hit.object,head=root.getObjectByName('Head'),asset=assets.assets.find(entry=>entry.characterId===identity);
  if(!(mesh instanceof THREE.Mesh)||!hit.face||!head||!asset)throw Error('Pick the visible lip surface on this exact approved actor.');
  const path:number[]=[];for(let node:THREE.Object3D=mesh;node!==root;){const parent=node.parent;if(!parent)throw Error('Picked surface is outside the actor.');path.unshift(parent.children.indexOf(node));node=parent;}
  const source=mesh.geometry.getAttribute('position');
  root.updateWorldMatrix(true,true);if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();
  if(coordinateSpace!==undefined&&coordinateSpace!=='head-local')throw Error('Unsupported native face coordinate space.');
  const frame=coordinateSpace==='head-local'?head:root,inverse=frame.matrixWorld.clone().invert();
  const local=hit.point.clone().applyMatrix4(inverse),headAt=head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
  if(Math.abs(local.x-headAt.x)>.16||Math.abs(local.y-headAt.y)>.24)throw Error('The click must be on the face, not a hand, box or costume.');
  const point=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const worldVertex=(index:number,target:THREE.Vector3)=>mesh.getVertexPosition(index,target).applyMatrix4(mesh.matrixWorld);
  worldVertex(hit.face.a,a);worldVertex(hit.face.b,b);worldVertex(hit.face.c,c);
  const bary=THREE.Triangle.getBarycoord(hit.point,a,b,c,new THREE.Vector3());
  const mask:FaceAnnotation['mask']=[];
  for(let index=0;index<source.count;index++){
    worldVertex(index,point).applyMatrix4(inverse);
    const x=(point.x-local.x)/.035,y=(point.y-local.y)/.018,radius=x*x+y*y;
    if(radius>=1||Math.abs(point.z-local.z)>.015)continue;
    mask.push({index,weight:(1-radius)**2,lower:y<=0});
  }
  if(mask.length<4||mask.length>2000)throw Error('This pick has no bounded usable lip region. Reframe and pick again.');
  const meshInverse=mesh.matrixWorld.clone().invert(),base=new THREE.Vector3().applyMatrix4(frame.matrixWorld).applyMatrix4(meshInverse);
  const up=new THREE.Vector3(0,1,0).applyMatrix4(frame.matrixWorld).applyMatrix4(meshInverse).sub(base);
  return {schemaVersion:1,characterId:identity,glbSha256:asset.glb.sha256,meshName:mesh.name,nodePath:path,positionCount:source.count,headNode:'Head',...(coordinateSpace?{coordinateSpace}:{}),
    anchorHeadLocal:head.worldToLocal(hit.point.clone()).toArray()as[number,number,number],
    sourceTriangle:{indices:[hit.face.a,hit.face.b,hit.face.c],barycentric:bary.toArray()as[number,number,number]},
    displacementUp:up.toArray()as[number,number,number],mask,review:{status:'picked',method:'native-visible-face-pick',pickedAt:new Date().toISOString()}};
}

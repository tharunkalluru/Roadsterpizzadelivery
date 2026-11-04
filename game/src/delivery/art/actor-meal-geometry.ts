import * as THREE from 'three';

type Attr=THREE.BufferAttribute|THREE.InterleavedBufferAttribute;
interface Chunk {indices:Uint32Array;bounds:{bone:number;box:THREE.Box3}[];minimumWeight:number;maximumWeight:number;bounded:boolean}
interface Source {left:number[];chunks:Chunk[]}
interface Entry {mesh:THREE.Mesh;source:Source;ancestors:THREE.Object3D[];rigidArm:boolean;mouth:boolean}
const sources=new WeakMap<THREE.BufferGeometry,Map<string,Source>>();
const originalGeometry=new WeakMap<THREE.BufferGeometry,THREE.BufferGeometry>();
const armName=/Shoulder|Arm|Hand|Index|Middle|Ring|Pinky|Thumb/;
const leftName=/^Left(?:Hand|Index|Middle|Ring|Pinky|Thumb)/;
export function registerMealGeometrySource(clone:THREE.BufferGeometry,source:THREE.BufferGeometry){originalGeometry.set(clone,source);}
const key=(mesh:THREE.Mesh)=>mesh instanceof THREE.SkinnedMesh?mesh.skeleton.bones.map(b=>b.name).join('|')+';'+mesh.bindMatrix.elements.join(','):'rigid';
const geometry=(mesh:THREE.Mesh)=>originalGeometry.get(mesh.geometry)??mesh.geometry;
function cached(mesh:THREE.Mesh){return sources.get(geometry(mesh))?.get(key(mesh));}
function *build(mesh:THREE.Mesh):Generator<void,Source>{
 const source=geometry(mesh),position=source.getAttribute('position')as Attr,indices=source.getAttribute('skinIndex')as Attr,weights=source.getAttribute('skinWeight')as Attr;
 const skin=mesh instanceof THREE.SkinnedMesh&&indices&&weights?mesh:null;
 const arms=skin?.skeleton.bones.map(b=>armName.test(b.name)),left=skin?.skeleton.bones.map(b=>leftName.test(b.name));
 const result:Source={left:[],chunks:[]};let chunk:(Omit<Chunk,'indices'>&{indices:number[]})|undefined,boxes:Map<number,THREE.Box3>;
 const point=new THREE.Vector3();const finish=()=>{if(chunk){result.chunks.push({...chunk,indices:Uint32Array.from(chunk.indices),bounds:[...boxes].map(([bone,box])=>({bone,box}))});}};
 for(let i=0;i<position.count;i++){
  let armWeight=0,leftWeight=0,total=0;
  if(skin)for(let k=0;k<4;k++){const bone=indices.getComponent(i,k),weight=weights.getComponent(i,k);total+=weight;if(arms![bone])armWeight+=weight;if(left![bone])leftWeight+=weight;}
  if(leftWeight>=.6)result.left.push(i);
  if(armWeight<=.2){
   if(!chunk||chunk.indices.length>=256){finish();chunk={indices:[],bounds:[],minimumWeight:Infinity,maximumWeight:-Infinity,bounded:!source.morphAttributes.position?.length};boxes=new Map();}
   chunk.indices.push(i);point.fromBufferAttribute(position,i);if(skin)point.applyMatrix4(skin.bindMatrix);
   chunk.minimumWeight=Math.min(chunk.minimumWeight,skin?total:1);chunk.maximumWeight=Math.max(chunk.maximumWeight,skin?total:1);
   if(skin){for(let k=0;k<4;k++){const bone=indices.getComponent(i,k),weight=weights.getComponent(i,k);if(weight<0||!Number.isFinite(weight))chunk.bounded=false;if(weight<=0)continue;let box=boxes.get(bone);if(!box){box=new THREE.Box3();boxes.set(bone,box);}box.expandByPoint(point);}}
   else{let box=boxes.get(-1);if(!box){box=new THREE.Box3();boxes.set(-1,box);}box.expandByPoint(point);}
  }
  if(i%512===511)yield;
 }
 finish();return result;
}
function store(mesh:THREE.Mesh,source:Source){const g=geometry(mesh);let entries=sources.get(g);if(!entries){entries=new Map();sources.set(g,entries);}entries.set(key(mesh),source);}
function collect(root:THREE.Group){const meshes:THREE.Mesh[]=[];root.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let n:THREE.Object3D|null=node;n&&n!==root;n=n.parent)if(n.name.startsWith('received-'))return;if(node.geometry.getAttribute('position'))meshes.push(node);});return meshes;}
/** Immutable classification only. No pose, visibility, material or bone state
 * changes. Completed caches are weakly owned by the shared source geometry. */
export async function prepareActorPerformanceGeometry(root:THREE.Group,valid:()=>boolean=()=>true,yieldTask:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,0))){
 for(const mesh of collect(root)){
  if(!valid())throw Error('Character meal preparation was cancelled.');if(cached(mesh))continue;
  const job=build(mesh);let next=job.next();while(!next.done){await yieldTask();if(!valid())throw Error('Character meal preparation was cancelled.');next=job.next();}
  if(!valid())throw Error('Character meal preparation was cancelled.');store(mesh,next.value);
 }
}
export function createMealGeometry(root:THREE.Group){
 const entries:Entry[]=collect(root).map(mesh=>{let source=cached(mesh);if(!source){const job=build(mesh);let next=job.next();while(!next.done)next=job.next();source=next.value;store(mesh,source);}
  const ancestors:THREE.Object3D[]=[];let rigidArm=false;for(let n:THREE.Object3D|null=mesh;n&&n!==root;n=n.parent){ancestors.push(n);if(n instanceof THREE.Bone&&/^(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|Index|Middle|Ring|Pinky|Thumb)/.test(n.name))rigidArm=true;}
  return{mesh,source,ancestors,rigidArm,mouth:originalGeometry.has(mesh.geometry)};
 });
 const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),scratch=new THREE.Box3(),bounds=new THREE.Box3(),point=new THREE.Vector3();
 const frames=new Map<THREE.Skeleton,THREE.Matrix4[]>(),baseVertex=new THREE.Vector3(),influenceVertex=new THREE.Vector3();
 const skeletons=new Set(entries.flatMap(e=>e.mesh instanceof THREE.SkinnedMesh?[e.mesh.skeleton]:[]));
 const groups:{skeleton:THREE.Skeleton;bones:THREE.Matrix4[]}[]=[];
 for(const skeleton of skeletons){let group=groups.find(g=>g.skeleton.bones.length===skeleton.bones.length&&g.skeleton.bones.every((bone,i)=>bone===skeleton.bones[i]&&g.skeleton.boneInverses[i].equals(skeleton.boneInverses[i])));if(!group){group={skeleton,bones:skeleton.bones.map(()=>new THREE.Matrix4())};groups.push(group);}frames.set(skeleton,group.bones);}
 const update=()=>{root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();for(const skeleton of skeletons)skeleton.update();for(const group of groups)for(let i=0;i<group.bones.length;i++)group.bones[i].multiplyMatrices(group.skeleton.bones[i].matrixWorld,group.skeleton.boneInverses[i]);};
 const vertex=(mesh:THREE.Mesh,index:number,target:THREE.Vector3)=>{
  THREE.Mesh.prototype.getVertexPosition.call(mesh,index,target);if(!(mesh instanceof THREE.SkinnedMesh))return target;
  baseVertex.copy(target).applyMatrix4(mesh.bindMatrix);target.set(0,0,0);const indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight'),bones=frames.get(mesh.skeleton)!;
  for(let i=0;i<4;i++){const weight=weights.getComponent(index,i);if(weight!==0)target.addScaledVector(influenceVertex.copy(baseVertex).applyMatrix4(bones[indices.getComponent(index,i)]),weight);}return target.applyMatrix4(mesh.bindMatrixInverse);
 }; 
 return{entries,update,vertex,depth(head:THREE.Object3D,drop:number){
  update();const headY=head.getWorldPosition(point).applyMatrix4(inverse).y,low=headY-drop+.012,high=headY-.12;let front=-Infinity;
  for(const entry of entries){const{mesh,source}=entry;if(entry.rigidArm||entry.ancestors.some(n=>!n.visible))continue;
   matrix.multiplyMatrices(inverse,mesh.matrixWorld);const skin=mesh instanceof THREE.SkinnedMesh?mesh:null;
   const transforms=skin?frames.get(skin.skeleton)!:[],post=skin?matrix.clone().multiply(skin.bindMatrixInverse):matrix;
   for(const chunk of source.chunks){
    if(chunk.bounded){bounds.makeEmpty();for(const part of chunk.bounds){scratch.copy(part.box);if(entry.mouth)scratch.expandByScalar(.016*(skin?.bindMatrix.getMaxScaleOnAxis()??1));scratch.applyMatrix4(part.bone<0?matrix:transforms[part.bone]);bounds.union(scratch);}
     if(bounds.isEmpty()){bounds.min.set(0,0,0);bounds.max.set(0,0,0);}
     // A weighted blend is in this hull after normalization. Scaling the hull
     // by the exact observed weight-sum interval also covers non-unit sums.
     for(const axis of ['x','y','z']as const){const a=bounds.min[axis],b=bounds.max[axis],lo=chunk.minimumWeight,hi=chunk.maximumWeight;bounds.min[axis]=Math.min(a*lo,a*hi,b*lo,b*hi)-1e-7;bounds.max[axis]=Math.max(a*lo,a*hi,b*lo,b*hi)+1e-7;}
     if(skin)bounds.applyMatrix4(post);
     if(bounds.max.x<-.095||bounds.min.x>.305||bounds.max.y<low||bounds.min.y>high)continue;
    }
    for(const i of chunk.indices){vertex(mesh,i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);if(point.x<-.095||point.x>.305||point.y<low||point.y>high)continue;front=Math.max(front,point.z);}
   }
  }
  return Number.isFinite(front)?Math.max(.40,front+.16+.045):.43;
 }};
}

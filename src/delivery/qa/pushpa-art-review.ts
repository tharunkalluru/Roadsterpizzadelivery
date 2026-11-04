import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterRigContract } from '../art/released-gltf';
import { createAuthoredMotionPlayer, validateAuthoredMotions } from '../art/authored-motion';
import { applyCharacterMotionBounds, validateCharacterMotionBounds } from '../art/motion-bounds';
import { prepareCharacterGpu, type CharacterGpuContext } from '../art/gpu-preparation';
import { TruckInterior } from '../modules/truck-interior';
import { createDeliveryModule } from '../modules';
import type { SceneCharacter } from '../modules/character';
import type { DeliveryModule, DeliveryModuleContext, ModuleParams, ModuleStoryLandingZone } from '../modules/types';

export const PUSHPA_ART_REVIEW = {
  query: 'pushpa-reader-v1', id: 'pushpa-reader-in-container-v5', characterId: 'pushpa-raj',
  descriptor: '/docs/delivery/character-review/candidates/pushpa-reader-in-container-v5.json',
  glb: '/docs/delivery/character-review/candidates/pushpa-reader-in-container-v5.glb',
  rig: '/docs/delivery/character-review/candidates/pushpa-reader-in-container-v5.rig.json',
} as const;
export interface LocalArtReviewEvidence { id: string; characterId: string; descriptor: string; glbSha256: string; rigSha256: string }
export interface LocalArtReviewRecord { id:string; characterId:string; descriptor:string; glb:string; rig:string }
interface Descriptor {
  schemaVersion: 1; id: string; characterId: string;
  glb: { url: string; sha256: string }; rig: { url: string; sha256: string };
}
export interface LocalArtReviewDependencies {
  fetchBytes(url: string): Promise<ArrayBuffer>;
  parse(bytes: ArrayBuffer): Promise<GLTF>;
  digest(bytes: ArrayBuffer): Promise<string>;
  prepareGpu?(root: THREE.Group,valid?:()=>boolean): Promise<void>;
}
const digest = async (bytes: ArrayBuffer) => {
  if (!globalThis.crypto?.subtle) throw new Error('Local art comparison needs secure fingerprint verification.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
};
const json = (bytes: ArrayBuffer, limit: number) => {
  if (bytes.byteLength > limit) throw new Error('Local art descriptor exceeds its review budget.');
  return JSON.parse(new TextDecoder().decode(bytes));
};
export function validateLocalArtDescriptor(value: unknown, expected:LocalArtReviewRecord=PUSHPA_ART_REVIEW): Descriptor {
  const d = value as Descriptor, sha = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  if (d?.schemaVersion !== 1 || d.id !== expected.id || d.characterId !== expected.characterId ||
    d.glb?.url !== expected.glb || d.rig?.url !== expected.rig || !sha(d.glb.sha256) || !sha(d.rig.sha256))
    throw new Error('This local art comparison descriptor is not in the fixed review allowlist.');
  return d;
}
function embeddedGlb(bytes: ArrayBuffer) {
  if(bytes.byteLength<20||bytes.byteLength>64*1024*1024)throw new Error('Invalid local comparison GLB size.');
  const view=new DataView(bytes),size=view.getUint32(12,true);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength||view.getUint32(16,true)!==0x4e4f534a||20+size>bytes.byteLength)
    throw new Error('Expected an embedded GLB2 local comparison asset.');
  const document=json(bytes.slice(20,20+size),16*1024*1024);
  if([...document.buffers??[],...document.images??[]].some(entry=>entry.uri!==undefined))
    throw new Error('Local art comparison cannot fetch external model or image resources.');
}
function validateRig(gltf:GLTF,contract:CharacterRigContract,requireReader:boolean):THREE.Group {
  const unskinnedStatic=contract?.requireSkin===false&&contract.pose?.mode==='authored-static'&&!contract.motions;
  if(contract?.catchPointSpace!==undefined&&!['palm-contact','box-center'].includes(contract.catchPointSpace))throw new Error('Unknown local catch-point coordinate convention.');
  if(!contract?.id||!contract.sceneName||!(contract.requireSkin===true||unskinnedStatic)||contract.materialTreatment!=='as-authored'||
    !contract.nodes?.leftArm||!contract.nodes.rightArm||!contract.nodes.catchPoint||
    !['authored-static','handoff-clip'].includes(contract.pose?.mode)||
    (requireReader&&(!contract.nodes.book||contract.pose?.mode!=='handoff-clip'||!contract.motions?.required?.includes('read')))||
    !Number.isFinite(contract.height?.min)||!Number.isFinite(contract.height?.max)||contract.height.min<=0||contract.height.max<contract.height.min)
    throw new Error('Local comparison requires its complete authored pose and anchor contract; animated actors require skin, and readers also require a book and handoff.');
  const roots=gltf.scenes.filter(scene=>scene.name===contract.sceneName);
  if(gltf.scenes.length!==1||roots.length!==1)throw new Error('Local comparison requires one unambiguous authored scene.');
  const root=roots[0],seen=new Set<string>(),bound=new Set<THREE.Bone>();let skins=0,materials=0;
  root.traverse(node=>{
    if(node.name){if(seen.has(node.name))throw new Error('Local comparison rig has duplicate named anchors.');seen.add(node.name);}
    if(node instanceof THREE.SkinnedMesh){skins++;node.skeleton.bones.forEach(bone=>bound.add(bone));}
    if(node instanceof THREE.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(!(material instanceof THREE.Material))throw new Error('Local comparison is missing an authored material.');materials++;
    }
  });
  for(const name of Object.values(contract.nodes))if(name&&!root.getObjectByName(name))throw new Error(`Local comparison anchor is absent: ${name}.`);
  if(!materials||(!unskinnedStatic&&(!skins||![contract.nodes.leftArm,contract.nodes.rightArm].every(name=>bound.has(root.getObjectByName(name) as THREE.Bone)))))throw new Error('Animated local comparison arms must belong to its actual skinned rig; static actors still require authored materials.');
  const height=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  if(!Number.isFinite(height)||height<contract.height.min||height>contract.height.max)throw new Error('Local comparison model units are outside its authored contract.');
  validateAuthoredMotions(root,gltf.animations,contract.motions,contract.pose.mode==='handoff-clip'?contract.pose:undefined);return root;
}
function disposeTemplate(root:THREE.Group){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
  root.traverse(node=>{if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material]){
    materials.add(material);Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value);});
  }if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton);}});
  geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());skeletons.forEach(value=>value.dispose());
  const images=new Set<ImageBitmap>();textures.forEach(texture=>{if(typeof ImageBitmap!=='undefined'&&texture.image instanceof ImageBitmap)images.add(texture.image);});images.forEach(value=>value.close());
}

/** Isolated owner of one unpublished template. Never registers an approved asset
 * or installs a production character hook. Clones share immutable buffers until
 * the last module-owned material (and its skeleton/mixer) has been disposed. */
export class LocalPushpaArtReview {
  private instances=0;private gpuBorrows=0;private retired=false;private disposed=false;
  constructor(private root:THREE.Group,private animations:THREE.AnimationClip[],private contract:CharacterRigContract,readonly evidence:LocalArtReviewEvidence,
    private prepareGpu?:LocalArtReviewDependencies['prepareGpu']){}
  async prepareGraphics(instance?:THREE.Group,valid?:()=>boolean){
    if(this.retired)throw new Error('This local comparison session has ended.');
    this.gpuBorrows++;
    try{await this.prepareGpu?.(instance??this.root,valid);if(this.retired)throw new Error('This local comparison session has ended.');}
    finally{this.gpuBorrows--;this.collect();}
  }
  createCharacter(ownMaterial:(key:string,material:THREE.Material)=>void):SceneCharacter{
    if(this.retired)throw new Error('This local comparison session has ended.');
    const group=cloneSkeleton(this.root) as THREE.Group,copies=new Map<THREE.Material,THREE.Material>(),skeletons=new Set<THREE.Skeleton>();
    if(this.contract.motionBounds)applyCharacterMotionBounds(group,this.contract.motionBounds,this.evidence.glbSha256);
    group.traverse(node=>{if(node instanceof THREE.Mesh){const copy=(source:THREE.Material)=>{let owned=copies.get(source);if(!owned){owned=source.clone();copies.set(source,owned);}return owned;};
      node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton);
    }});
    const nodes=this.contract.nodes,motion=createAuthoredMotionPlayer(group,this.animations,this.contract.motions,this.contract.pose.mode==='handoff-clip'?this.contract.pose:undefined);
    this.instances++;let remaining=copies.size,released=false;
    const release=()=>{if(released||--remaining>0)return;released=true;motion.dispose();skeletons.forEach(value=>value.dispose());this.instances--;this.collect();};
    for(const material of copies.values()){
      let disposed=false;material.addEventListener('dispose',()=>{if(!disposed){disposed=true;release();}});
    }
    try{for(const [i,material] of [...copies.values()].entries())ownMaterial(`local-unreviewed-${group.uuid}-${i}`,material);}
    catch(error){copies.forEach(value=>value.dispose());throw error;}
    group.userData.characterRelease='local-unreviewed-preview';group.userData.localCharacterArtPreview={...this.evidence};
    const character:SceneCharacter={group,leftArm:group.getObjectByName(nodes.leftArm)! as THREE.Group,rightArm:group.getObjectByName(nodes.rightArm)! as THREE.Group,
      catchPoint:group.getObjectByName(nodes.catchPoint)!,catchPointSpace:this.contract.catchPointSpace??'palm-contact',book:nodes.book?group.getObjectByName(nodes.book):undefined,
      catchPose:value=>{if(!released)motion.catchPose(value);},animate:motion.animate?(dt,mode,speed)=>{if(!released)motion.animate!(dt,mode,speed);}:undefined};
    character.catchPose(0);return character;
  }
  createModule=(name:string):DeliveryModule=>name==='matchAndLand'?new LocalArtMatchAndLand(this):createDeliveryModule(name);
  dispose(){this.retired=true;this.collect();}
  private collect(){if(this.retired&&!this.instances&&!this.gpuBorrows&&!this.disposed){this.disposed=true;disposeTemplate(this.root);}}
}
class LocalArtTruckInterior extends TruckInterior {
  constructor(private review:LocalPushpaArtReview){super();}
  override setup(ctx:DeliveryModuleContext,params:ModuleParams){super.setup({...ctx,prepareCharacterGraphics:(instance,valid)=>this.review.prepareGraphics(instance,valid)},params);}
  protected override character(style:string,x:number,y:number,z:number,seated=false,parent=this.root):SceneCharacter{
    if(style!=='pushpa')return super.character(style,x,y,z,seated,parent);
    const character=this.review.createCharacter((key,material)=>this.materials.set(key,material));
    character.group.position.set(x,y,z);parent.add(character.group);return character;
  }
}
class LocalArtMatchAndLand implements DeliveryModule {
  private inner=createDeliveryModule('matchAndLand');
  constructor(private review:LocalPushpaArtReview){}
  get target(){return this.inner.target;}get status(){return this.inner.status;}get supports(){return this.inner.supports;}
  get movement(){return this.inner.movement;}get arrival(){return this.inner.arrival;}get trafficBodies(){return this.inner.trafficBodies;}get trafficReservations(){return this.inner.trafficReservations;}
  get exitPending(){return this.inner.exitPending;}get sceneryPending(){return this.inner.sceneryPending;}
  get hideWorldGuidance(){return this.inner.hideWorldGuidance;}
  get cameraFocus(){return this.inner.cameraFocus;}
  get charactersReady(){return this.inner.charactersReady;}
  get headlightGain(){return this.inner.headlightGain;}
  get story(){return this.inner.story;}
  get storyArrivalReady(){return this.inner.storyArrivalReady;}
  setStoryPresentation(active:boolean,landing?:ModuleStoryLandingZone){this.inner.setStoryPresentation?.(active,landing);}
  get sceneLamp(){return this.inner.sceneLamp;}
  setup(ctx:DeliveryModuleContext,params:ModuleParams){this.inner.teardown();this.inner=params.scene==='truckInterior'?new LocalArtTruckInterior(this.review):createDeliveryModule('matchAndLand');this.inner.setup(ctx,params);}
  update(dt:number){this.inner.update(dt);}onDrop(){this.inner.onDrop();}teardown(){this.inner.teardown();}
}

export const preparePushpaArtReview=(gpu?:CharacterGpuContext,overrides?:LocalArtReviewDependencies)=>prepareLocalCharacterArtReview(PUSHPA_ART_REVIEW,gpu,overrides,true);

export async function prepareLocalCharacterArtReview(expected:LocalArtReviewRecord,gpu?:CharacterGpuContext,overrides?:LocalArtReviewDependencies,requireReader=false):Promise<LocalPushpaArtReview>{
  const dependencies:LocalArtReviewDependencies=overrides??{
    async fetchBytes(url){const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error(`Local comparison resource HTTP ${response.status}.`);return response.arrayBuffer();},
    async parse(bytes){const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');return new GLTFLoader().parseAsync(bytes,'');},digest,
    prepareGpu:gpu?(root,valid)=>prepareCharacterGpu(root,gpu,valid):undefined,
  };
  const descriptor=validateLocalArtDescriptor(json(await dependencies.fetchBytes(expected.descriptor),16*1024),expected);
  const [glb,rig]=await Promise.all([dependencies.fetchBytes(descriptor.glb.url),dependencies.fetchBytes(descriptor.rig.url)]);
  if(await dependencies.digest(glb)!==descriptor.glb.sha256||await dependencies.digest(rig)!==descriptor.rig.sha256)throw new Error('Local comparison bytes differ from the requested GLB/rig fingerprints.');
  embeddedGlb(glb);const contract=json(rig,128*1024) as CharacterRigContract,gltf=await dependencies.parse(glb);
  let root:THREE.Group|undefined;
  try{root=validateRig(gltf,contract,requireReader);if(contract.motionBounds)validateCharacterMotionBounds(root,contract.motionBounds,descriptor.glb.sha256);await dependencies.prepareGpu?.(root);
    return new LocalPushpaArtReview(root,gltf.animations,contract,{id:descriptor.id,characterId:descriptor.characterId,descriptor:expected.descriptor,glbSha256:descriptor.glb.sha256,rigSha256:descriptor.rig.sha256},dependencies.prepareGpu);
  }catch(error){for(const scene of gltf.scenes)disposeTemplate(scene);throw error;}
}

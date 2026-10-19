/** Scene-local terrain excavation. Surface holes and physical stairs share the same AccessPit. */
import * as THREE from 'three';
import type { WorldCore } from '../world/schema';
import { getAccessPits,accessPitsVersion,type AccessPit } from '../world/accessPits';

export const MAX_TERRAIN_CUTOUTS=32;
const flag='accessPitTerrain';
type Shader=Parameters<THREE.Material['onBeforeCompile']>[0];
interface CutoutUniforms {
  uAccessPitCount:{value:number};uAccessPitPose:{value:THREE.Vector4[]};uAccessPitShape:{value:THREE.Vector4[]};
}
/** Only terrain is tagged. Building walls, basement floors/treads and furniture stay solid and visible. */
export function markTerrainMaterial<T extends THREE.Material>(material:T):T {material.userData[flag]=true;return material;}
export function terrainCutoutContains(pit:Pick<AccessPit,'centre'|'yaw'|'widthM'|'depthM'|'floorM'|'rimM'>,x:number,y:number,z:number):boolean {
  const dx=x-pit.centre[0],dz=z-pit.centre[1],c=Math.cos(pit.yaw),s=Math.sin(pit.yaw),u=dx*c-dz*s,v=dx*s+dz*c;
  return Math.abs(u)<pit.widthM/2&&Math.abs(v)<pit.depthM/2&&y>=pit.floorM+.02&&y<=pit.rimM+.02;
}
export function applyTerrainCutoutShader(shader:Shader,uniforms:CutoutUniforms):void {
  Object.assign(shader.uniforms,uniforms);
  // MeshDepthMaterial does not contain worldpos_vertex; project_vertex is present in every supported pass.
  const anchor=shader.vertexShader.includes('#include <worldpos_vertex>')?'#include <worldpos_vertex>':'#include <project_vertex>';
  if(!shader.vertexShader.includes(anchor)||!shader.fragmentShader.includes('#include <clipping_planes_fragment>'))throw new Error('Terrain material does not support world-space access-pit clipping');
  shader.vertexShader=`varying vec3 vAccessPitWorld;\n${shader.vertexShader}`.replace(anchor,`${anchor}
    vec4 accessPitLocal=vec4(transformed,1.0);
    #ifdef USE_BATCHING
      accessPitLocal=batchingMatrix*accessPitLocal;
    #endif
    #ifdef USE_INSTANCING
      accessPitLocal=instanceMatrix*accessPitLocal;
    #endif
    vAccessPitWorld=(modelMatrix*accessPitLocal).xyz;`);
  shader.fragmentShader=`varying vec3 vAccessPitWorld;
    uniform int uAccessPitCount;
    uniform vec4 uAccessPitPose[${MAX_TERRAIN_CUTOUTS}];
    uniform vec4 uAccessPitShape[${MAX_TERRAIN_CUTOUTS}];\n${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    for(int pitIndex=0;pitIndex<${MAX_TERRAIN_CUTOUTS};pitIndex++){
      if(pitIndex>=uAccessPitCount)break;
      vec4 pose=uAccessPitPose[pitIndex],extent=uAccessPitShape[pitIndex];
      vec2 delta=vAccessPitWorld.xz-pose.xy;
      float pitU=delta.x*pose.z-delta.y*pose.w;
      float pitV=delta.x*pose.w+delta.y*pose.z;
      if(abs(pitU)<extent.x&&abs(pitV)<extent.y&&vAccessPitWorld.y>=extent.z&&vAccessPitWorld.y<=extent.w)discard;
    }`);
}

interface BoundMesh {mesh:WeakRef<THREE.Mesh>;original:THREE.Material|THREE.Material[];depth:THREE.Material|undefined;distance:THREE.Material|undefined}
/** Cached global materials are never patched. Each view owns its cloned terrain and shadow materials. */
export class TerrainCutoutController {
  readonly uniforms:CutoutUniforms={uAccessPitCount:{value:0},uAccessPitPose:{value:Array.from({length:MAX_TERRAIN_CUTOUTS},()=>new THREE.Vector4())},uAccessPitShape:{value:Array.from({length:MAX_TERRAIN_CUTOUTS},()=>new THREE.Vector4())}};
  private clones=new Map<THREE.Material,THREE.Material>();private depthClones=new Map<THREE.Material,THREE.Material>();private distanceClones=new Map<THREE.Material,THREE.Material>();
  private bound=new WeakSet<THREE.Mesh>();private meshes:BoundMesh[]=[];private previous:THREE.Scene['onBeforeRender'];
  private hook:THREE.Scene['onBeforeRender'];private disposed=false;private version=-1;private target=new THREE.Vector3(Infinity,0,Infinity);
  private defaultDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});private defaultDistance=new THREE.MeshDistanceMaterial();
  constructor(private scene:THREE.Scene,private core:WorldCore){
    this.previous=scene.onBeforeRender;
    this.hook=(...args)=>{this.previous.apply(scene,args);if(this.disposed)return;this.update(args[2].position);this.syncMaterials();};
    scene.onBeforeRender=this.hook;
  }
  private clone(base:THREE.Material,map=this.clones):THREE.Material {
    let material=map.get(base);if(material)return material;
    material=base.clone();const previous=base.onBeforeCompile,key=base.customProgramCacheKey.call(base);
    material.onBeforeCompile=(shader,renderer)=>{previous.call(material!,shader,renderer);applyTerrainCutoutShader(shader,this.uniforms);};
    material.customProgramCacheKey=()=>`${key}|world-access-pits-v1-${MAX_TERRAIN_CUTOUTS}`;
    map.set(base,material);return material;
  }
  /** Bind a newly built terrain subtree once; streamed builders call this before their first render. */
  bind(root:THREE.Object3D):void {
    root.traverse(o=>{
      if(!(o instanceof THREE.Mesh)||this.bound.has(o))return;
      const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>m.userData[flag]))return;
      this.meshes.push({mesh:new WeakRef(o),original:o.material,depth:o.customDepthMaterial,distance:o.customDistanceMaterial});
      o.material=Array.isArray(o.material)?materials.map(m=>m.userData[flag]?this.clone(m):m):this.clone(o.material);
      if(o.castShadow){o.customDepthMaterial=this.clone(o.customDepthMaterial??this.defaultDepth,this.depthClones);o.customDistanceMaterial=this.clone(o.customDistanceMaterial??this.defaultDistance,this.distanceClones);}
      this.bound.add(o);
    });
    this.syncMaterials();
  }
  syncMaterials():void {
    // Weather changes the source material; synchronize only render properties, retaining each scene's shader/uniforms.
    for(const [base,clone]of this.clones){
      const a=base as THREE.MeshStandardMaterial,b=clone as THREE.MeshStandardMaterial;
      if(a.color&&b.color)b.color.copy(a.color);if(a.emissive&&b.emissive)b.emissive.copy(a.emissive);
      for(const prop of ['roughness','metalness','opacity','emissiveIntensity']as const)if(prop in a)b[prop]=a[prop];
    }
  }
  update(target:THREE.Vector3):void {
    if(this.disposed)return;
    const version=accessPitsVersion(this.core);if(version===this.version&&this.target.distanceToSquared(target)<4)return;
    this.version=version;this.target.copy(target);
    const pits=[...getAccessPits(this.core)].sort((a,b)=>(a.centre[0]-target.x)**2+(a.centre[1]-target.z)**2-((b.centre[0]-target.x)**2+(b.centre[1]-target.z)**2)).slice(0,MAX_TERRAIN_CUTOUTS);
    this.uniforms.uAccessPitCount.value=pits.length;
    pits.forEach((p,i)=>{this.uniforms.uAccessPitPose.value[i].set(p.centre[0],p.centre[1],Math.cos(p.yaw),Math.sin(p.yaw));this.uniforms.uAccessPitShape.value[i].set(p.widthM/2,p.depthM/2,p.floorM+.02,p.rimM+.02);});
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    if(this.scene.onBeforeRender===this.hook)this.scene.onBeforeRender=this.previous;
    for(const record of this.meshes){const mesh=record.mesh.deref();if(!mesh)continue;mesh.material=record.original;mesh.customDepthMaterial=record.depth;mesh.customDistanceMaterial=record.distance;}
    for(const map of [this.clones,this.depthClones,this.distanceClones]){for(const m of map.values())m.dispose();map.clear();}
    this.defaultDepth.dispose();this.defaultDistance.dispose();this.meshes=[];this.uniforms.uAccessPitCount.value=0;
  }
}

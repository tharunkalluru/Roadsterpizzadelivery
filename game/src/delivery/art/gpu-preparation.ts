import * as THREE from 'three';
import { warmCharacterGeometry } from './gpu-geometry';
import { compileCharacterPrograms } from './gpu-compilation';
import { warmAuthoredCharacterDraw } from './gpu-authored-draw';

export interface CharacterGpuContext { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera; composer?:{readBuffer:THREE.WebGLRenderTarget}|null }
const prepared = new WeakMap<THREE.Object3D, WeakMap<THREE.WebGLRenderer, { epoch: number; lighting:string; promise: Promise<void> }>>();
const renderers = new WeakMap<THREE.WebGLRenderer, { epoch: number }>();
const uploaded = new WeakMap<THREE.Texture,WeakMap<THREE.WebGLRenderer,number>>();

/** Shader variants depend on visible light counts, not their intensity/position.
 * Called on preparation/scene construction, never by the gameplay frame loop. */
function lightingSignature(scene:THREE.Scene,renderer:THREE.WebGLRenderer,camera:THREE.Camera,target:THREE.WebGLRenderTarget|null){
  const counts=new Map<string,number>();
  scene.traverseVisible(node=>{if(node instanceof THREE.Light&&node.layers.test(camera.layers)){const key=`${node.type}:${node.castShadow?1:0}:${'map' in node&&node.map?1:0}`;counts.set(key,(counts.get(key)??0)+1);}});
  return JSON.stringify([...[...counts].sort(([a],[b])=>a.localeCompare(b)),camera.layers.mask,scene.environment?.uuid,scene.fog instanceof THREE.FogExp2?'exp2':scene.fog?'linear':'none',renderer.toneMapping,target?THREE.LinearSRGBColorSpace:renderer.outputColorSpace,renderer.shadowMap.enabled,renderer.shadowMap.type]);
}

const yieldPreparation = () => new Promise<void>(resolve => {
  // Upload one texture at a time between gameplay tasks. A timeout also lets
  // loading/paused screens progress when no game frame is being rendered.
  if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:100});
  else setTimeout(resolve,0);
});

/** Borrowed authored assets remain owned by the registry, including programs. */
export function prepareCharacterGpu(root: THREE.Group, context: CharacterGpuContext, valid:()=>boolean=()=>true): Promise<void> {
  const {renderer,scene,camera}=context;
  let state=renderers.get(renderer);
  if(!state){
    state={epoch:0};renderers.set(renderer,state);
    renderer.domElement.addEventListener('webglcontextrestored',()=>{state!.epoch++;});
  }
  let cache=prepared.get(root);if(!cache){cache=new WeakMap();prepared.set(root,cache);}
  const sceneTarget=context.composer?.readBuffer??null;
  const lighting=lightingSignature(scene,renderer,camera,sceneTarget);
  const previous=cache.get(renderer);
  if(previous?.epoch===state.epoch&&previous.lighting===lighting)return previous.promise;
  const epoch=state.epoch;
  const promise=(async()=>{
    if(!valid())throw new Error('Character graphics preparation was cancelled.');
    if(renderer.getContext().isContextLost())throw new Error('Graphics context is temporarily unavailable.');
    const textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
    root.traverse(node=>{if(node instanceof THREE.Mesh)for(const material of Array.isArray(node.material)?node.material:[node.material])for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);});
    root.traverse(node=>{if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton);});
    if(skeletons.size){
      root.updateWorldMatrix(true,true);
      for(const skeleton of skeletons){skeleton.update();if(!skeleton.boneTexture)skeleton.computeBoneTexture();textures.add(skeleton.boneTexture!);}
    }
    for(const texture of textures){
      let owners=uploaded.get(texture);if(!owners){owners=new WeakMap();uploaded.set(texture,owners);}
      if(owners.get(renderer)===epoch)continue;
      await yieldPreparation();if(!valid()||state!.epoch!==epoch||renderer.getContext().isContextLost())throw new Error('Character graphics preparation was interrupted.');renderer.initTexture(texture);owners.set(renderer,epoch);
    }
    // High-quality gameplay uses the composer's linear render target; low
    // quality draws to the sRGB canvas. Compile for the actual scene pass.
    const priorTarget=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    let compiling:Promise<void>;
    try{renderer.setRenderTarget(sceneTarget);compiling=compileCharacterPrograms(renderer,root,camera,scene,()=>valid()&&state!.epoch===epoch);}
    finally{renderer.setRenderTarget(priorTarget,face,mip);}
    await compiling;
    await warmCharacterGeometry(root,renderer,yieldPreparation,()=>valid()&&state!.epoch===epoch);
    await warmAuthoredCharacterDraw(root,context,yieldPreparation,()=>valid()&&state!.epoch===epoch);
    if(!valid()||state!.epoch!==epoch||renderer.getContext().isContextLost())throw new Error('Character graphics preparation was interrupted.');
  })();
  cache.set(renderer,{epoch,lighting,promise});
  void promise.catch(()=>{if(cache!.get(renderer)?.promise===promise)cache!.delete(renderer);});
  return promise;
}

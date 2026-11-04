import * as THREE from 'three';
import { compileCharacterPrograms } from './gpu-compilation';

interface WarmResources {
  scene:THREE.Scene; camera:THREE.OrthographicCamera; mesh:THREE.Mesh;
  empty:THREE.BufferGeometry; target:THREE.WebGLRenderTarget;
  jobs:WeakMap<THREE.BufferGeometry,Promise<void>>; tail:Promise<void>; epoch:number;
}
const resources=new WeakMap<THREE.WebGLRenderer,WarmResources>();
function scratch(renderer:THREE.WebGLRenderer){
  let value=resources.get(renderer);if(value)return value;
  const scene=new THREE.Scene(),empty=new THREE.BufferGeometry();
  // This persistent, unlit preparation program is compiled once per variant,
  // rather than synchronously rebuilding a disposable shader at every level.
  const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
  const mesh=new THREE.Mesh(empty,material);mesh.frustumCulled=false;scene.add(mesh);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,100);camera.position.set(0,1,5);camera.lookAt(0,1,0);camera.layers.enableAll();
  const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
  target.viewport.set(0,0,1,1);target.scissor.set(0,0,1,1);target.scissorTest=false;
  value={scene,camera,mesh,empty,target,jobs:new WeakMap(),tail:Promise.resolve(),epoch:0};resources.set(renderer,value);
  const state=value;renderer.domElement.addEventListener('webglcontextrestored',()=>{state.epoch++;state.jobs=new WeakMap();});
  return value;
}

/** Upload exact shared geometry/index buffers through public rendering APIs.
 * A plain proxy needs no source bones, materials, callbacks or reparenting:
 * Three uploads every geometry attribute, including skin weights and normals.
 * Per-instance bone textures and authored-program vertex bindings remain
 * instance work; this does not claim those are shared/prepared by the proxy.
 */
export async function warmCharacterGeometry(root:THREE.Group,renderer:THREE.WebGLRenderer,yieldTask:()=>Promise<void>,valid:()=>boolean){
  const state=scratch(renderer),epoch=state.epoch,geometries=new Set<THREE.BufferGeometry>();
  root.traverse(node=>{if(node instanceof THREE.Mesh)geometries.add(node.geometry);});
  const check=()=>{if(!valid()||state.epoch!==epoch||renderer.getContext().isContextLost())throw new Error('Character geometry preparation was interrupted.');};
  for(const geometry of geometries){
    let job=state.jobs.get(geometry);
    if(!job){
      job=state.tail.then(async()=>{
        await yieldTask();check();state.mesh.geometry=geometry;state.mesh.updateMorphTargets();
        try{
          // Output colour-space is a shader variant too. Compile for the
          // offscreen target, but restore it synchronously before awaiting.
          const compileTarget=renderer.getRenderTarget(),compileFace=renderer.getActiveCubeFace(),compileMip=renderer.getActiveMipmapLevel();
          let compiling:Promise<void>;
          try{renderer.setRenderTarget(state.target);compiling=compileCharacterPrograms(renderer,state.scene,state.camera,undefined,()=>valid()&&state.epoch===epoch);}
          finally{renderer.setRenderTarget(compileTarget,compileFace,compileMip);}
          await compiling;check();
          await yieldTask();check();
          const priorTarget=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
          const sorted=renderer.sortObjects,xr=renderer.xr.enabled,shadows=renderer.shadowMap.enabled,autoReset=renderer.info.autoReset;
          const counts={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,points:renderer.info.render.points,lines:renderer.info.render.lines};
          try{
            // Sorting would compute a bounding sphere on the borrowed geometry.
            // Target binding supplies/restores framebuffer viewport/scissor;
            // default logical rectangles and device pixel ratio stay untouched.
            renderer.sortObjects=false;renderer.xr.enabled=false;renderer.shadowMap.enabled=false;renderer.info.autoReset=false;
            renderer.setRenderTarget(state.target);renderer.render(state.scene,state.camera);check();
          }finally{
            renderer.setRenderTarget(priorTarget,face,mip);renderer.sortObjects=sorted;renderer.xr.enabled=xr;renderer.shadowMap.enabled=shadows;renderer.info.autoReset=autoReset;
            Object.assign(renderer.info.render,counts);
            // Never rewind info.render.frame: Three uses that monotonic value
            // to decide when shared geometry/skeleton updates are necessary.
          }
        }finally{state.mesh.geometry=state.empty;state.mesh.morphTargetDictionary=undefined;state.mesh.morphTargetInfluences=undefined;}
      });
      state.tail=job.then(()=>{},()=>{});state.jobs.set(geometry,job);
      const tracked=job;
      const invalidated=()=>{state.jobs.delete(geometry);geometry.removeEventListener('dispose',invalidated);};
      geometry.addEventListener('dispose',invalidated);
      void job.catch(()=>{if(state.jobs.get(geometry)===tracked)state.jobs.delete(geometry);geometry.removeEventListener('dispose',invalidated);});
    }
    await job;check();
  }
  return geometries.size;
}

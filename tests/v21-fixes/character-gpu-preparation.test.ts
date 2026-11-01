import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareCharacterGpu } from '../../src/delivery/art/gpu-preparation';

function fixture(){
  const root=new THREE.Group(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),canvas=new EventTarget(),map=new THREE.Texture(),normalMap=new THREE.Texture();
  const material=new THREE.MeshStandardMaterial({map,normalMap,metalness:.1,roughness:.8}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);root.add(mesh);
  const calls:{textures:THREE.Texture[];compiles:unknown[][];draws:THREE.BufferGeometry[];authored:THREE.BufferGeometry[]}={textures:[],compiles:[],draws:[],authored:[]};
  let lost=false,fail=false,target:THREE.WebGLRenderTarget|null=null;
  const scissor=new THREE.Vector4(0,0,80,40);let scissorTest=false;
  const renderer={domElement:canvas,sortObjects:true,xr:{enabled:false},autoClear:true,shadowMap:{enabled:false,type:THREE.PCFShadowMap,autoUpdate:true,needsUpdate:false},info:{autoReset:true,render:{frame:0,calls:0,triangles:0,points:0,lines:0}},
    extensions:{get:()=>null},getContext:()=>({isContextLost:()=>lost}),initTexture:(texture:THREE.Texture)=>calls.textures.push(texture),
    getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,setRenderTarget:(value:THREE.WebGLRenderTarget|null)=>{target=value;},
    getScissor:(out:THREE.Vector4)=>out.copy(scissor),getScissorTest:()=>scissorTest,
    setScissor:(x:number|THREE.Vector4,y?:number,w?:number,h?:number)=>{if(x instanceof THREE.Vector4)scissor.copy(x);else scissor.set(x,y!,w!,h!);},setScissorTest:(v:boolean)=>{scissorTest=v;},
    render:(scene:THREE.Scene)=>{const mesh=scene.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh;calls.draws.push(mesh.geometry);if(mesh.material===material)calls.authored.push(mesh.geometry);renderer.info.render.frame++;},
    compile:(...args:unknown[])=>{calls.compiles.push(args);if(fail)throw new Error('simulated compile failure');}} as unknown as THREE.WebGLRenderer;
  return {root,scene,camera,renderer,canvas,calls,material,map,normalMap,setLost(value:boolean){lost=value;},setFail(value:boolean){fail=value;}};
}

test('GPU prep uploads each shared texture once and compiles exact authored materials against the real scene',async()=>{
  const f=fixture(),position=f.root.position.clone();
  await Promise.all([prepareCharacterGpu(f.root,f),prepareCharacterGpu(f.root,f)]);
  assert.deepEqual(f.calls.textures,[f.map,f.normalMap]);assert.deepEqual(f.calls.compiles.filter(call=>call[0]===f.root),[[f.root,f.camera,f.scene]]);
  const geometry=(f.root.children[0] as THREE.Mesh).geometry;
  assert.deepEqual(f.calls.draws,[geometry,geometry]);assert.deepEqual(f.calls.authored,[geometry],'readiness includes the exact authored-material draw, not only the unlit upload proxy');
  assert.equal((f.root.children[0] as THREE.Mesh).material,f.material);assert.ok(f.root.position.equals(position));assert.equal(f.material.metalness,.1);assert.equal(f.root.parent,null);
  await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,1);assert.equal(f.calls.draws.length,2);assert.equal(f.calls.authored.length,1);
});

test('failed preparation retries and a restored graphics context invalidates old GPU readiness',async()=>{
  const f=fixture();f.setFail(true);await assert.rejects(prepareCharacterGpu(f.root,f),/compile failure/);
  f.setFail(false);await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,2);
  f.setLost(true);f.canvas.dispatchEvent(new Event('webglcontextrestored'));
  await assert.rejects(prepareCharacterGpu(f.root,f),/temporarily unavailable/);
  f.setLost(false);await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,3);assert.equal(f.calls.draws.length,4);assert.equal(f.calls.authored.length,2);
});

test('a real scene-local lamp warms the new authored shader variant without reuploading shared textures or geometry',async()=>{
  const f=fixture();await prepareCharacterGpu(f.root,f);
  const lamp=new THREE.PointLight(0xffe0b0,0,5.5);f.scene.add(lamp);
  await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,2);
  assert.equal(f.calls.draws.length,3);assert.equal(f.calls.authored.length,2,'new lighting warms its authored draw without repeating the shared-buffer proxy');assert.equal(f.calls.textures.length,2);
  lamp.intensity=8;await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,2,'intensity/position are uniforms, not new shader variants');
  lamp.visible=false;await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,3);
  lamp.visible=true;lamp.layers.set(1);await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,3,'a light outside the camera layer does not add a shader light');
  f.camera.layers.enable(1);await prepareCharacterGpu(f.root,f);assert.equal(f.calls.compiles.filter(call=>call[0]===f.root).length,4);
  assert.equal((f.root.children[0] as THREE.Mesh).material,f.material);assert.equal(f.material.metalness,.1);
});

test('each real instance prepares its own bone texture and high-quality shaders use the composer scene target',async()=>{
  const f=fixture(),geometry=new THREE.BoxGeometry(),count=geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const bone=new THREE.Bone(),skin=new THREE.SkinnedMesh(geometry,f.material),skeleton=new THREE.Skeleton([bone]);
  f.root.clear();f.root.add(skin);skin.add(bone);skin.bind(skeleton);
  const sceneTarget=new THREE.WebGLRenderTarget(80,40),current=new THREE.WebGLRenderTarget(30,20);
  f.renderer.setRenderTarget(current);const targets:(THREE.WebGLRenderTarget|null)[]=[],compile=f.renderer.compile.bind(f.renderer);
  f.renderer.compile=(object,camera,scene)=>{if(object===f.root)targets.push(f.renderer.getRenderTarget());return compile(object,camera,scene);};
  await prepareCharacterGpu(f.root,{...f,composer:{readBuffer:sceneTarget}});
  assert.ok(skeleton.boneTexture);assert.ok(f.calls.textures.includes(skeleton.boneTexture));assert.deepEqual(targets,[sceneTarget]);assert.equal(f.renderer.getRenderTarget(),current,'async preparation cannot keep the composer framebuffer bound');
  const uploads=f.calls.textures.length;await prepareCharacterGpu(f.root,{...f,composer:{readBuffer:sceneTarget}});assert.equal(f.calls.textures.length,uploads);
  await prepareCharacterGpu(f.root,f);assert.deepEqual(targets,[sceneTarget,null],'switching between the linear scene pass and sRGB canvas needs the correct separate program variant');assert.equal(f.calls.textures.length,uploads,'a new colour-space variant retains texture allocations');
});

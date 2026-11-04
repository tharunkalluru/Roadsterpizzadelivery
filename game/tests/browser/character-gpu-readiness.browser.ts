import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { applySceneLamp } from '../../src/game/scene-lamp-pool';
import { preparePushpaArtReview, type LocalPushpaArtReview } from '../../src/delivery/qa/pushpa-art-review';

interface Calls { bufferData:number; bufferBytes:number; bufferSubData:number; textureImages:number; textureStorage:number; shaderCompiles:number; programLinks:number; nativeDrawCalls:number }
interface Phase extends Calls { phase:string; elapsedMs:number; geometries:number; textures:number; programs:number; drawCalls:number }
const zero=():Calls=>({bufferData:0,bufferBytes:0,bufferSubData:0,textureImages:0,textureStorage:0,shaderCompiles:0,programLinks:0,nativeDrawCalls:0});
const phases:Phase[]=[],ownedMaterials=new Set<THREE.Material>();
const parityEnabled=new URLSearchParams(location.search).get('parity')!=='0';
interface PixelSnapshot { surface:string; target:string|null; width:number; height:number; format:number; type:number; storageType:number|null; typedArray:string; bytes:number; sha256:string }
interface FramebufferSnapshot { canvas:PixelSnapshot; scene:PixelSnapshot|null; readbackMs:number }
interface FramebufferParity { phase:string; before:FramebufferSnapshot; after?:FramebufferSnapshot; canvasUnchanged?:boolean; sceneUnchanged?:boolean|null; unchanged?:boolean; error?:string }
const framebufferParity:FramebufferParity[]=[];
const output=document.getElementById('report')!,status=document.getElementById('status')!,download=document.getElementById('download')! as HTMLButtonElement;
let review:LocalPushpaArtReview|undefined,renderer:THREE.WebGLRenderer|undefined,composer:EffectComposer|undefined;
let active:Calls|null=null,restore=()=>{},result:unknown;

/** Observe only this fixture's own context. No city, traffic or gameplay loop is
 * present, so a shared buffer allocation cannot be confused with streamed roads.
 * The instrumentation is removed before the downloadable result is displayed. */
function countCalls(gl:WebGLRenderingContext|WebGL2RenderingContext){
  const methods=gl as unknown as Record<string,(...args:any[])=>any>,undo:(()=>void)[]=[];
  const wrap=(name:string,observe:(args:unknown[])=>void)=>{
    const original=methods[name];if(typeof original!=='function')return;
    const prior=Object.getOwnPropertyDescriptor(gl,name);
    Object.defineProperty(gl,name,{configurable:true,writable:true,value:function(...args:unknown[]){if(active)observe(args);return original.apply(gl,args);}});
    undo.push(()=>{if(prior)Object.defineProperty(gl,name,prior);else delete methods[name];});
  };
  try{
    wrap('bufferData',args=>{active!.bufferData++;const value=args[1];active!.bufferBytes+=typeof value==='number'?value:typeof(value as ArrayBufferView)?.byteLength==='number'?(value as ArrayBufferView).byteLength:0;});
    wrap('bufferSubData',()=>active!.bufferSubData++);
    wrap('texImage2D',()=>active!.textureImages++);wrap('texStorage2D',()=>active!.textureStorage++);
    wrap('compileShader',()=>active!.shaderCompiles++);wrap('linkProgram',()=>active!.programLinks++);
    for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])wrap(method,()=>active!.nativeDrawCalls++);
  }catch(error){undo.reverse().forEach(fn=>fn());throw error;}
  return()=>undo.reverse().forEach(fn=>fn());
}
async function measure(name:string,job:()=>void|Promise<void>){
  status.textContent=name;active=zero();const started=performance.now();
  try{await job();}finally{
    const calls=active;active=null;
    phases.push({...calls!,phase:name,elapsedMs:Math.round((performance.now()-started)*100)/100,
      geometries:renderer!.info.memory.geometries,textures:renderer!.info.memory.textures,
      programs:renderer!.info.programs?.length??0,drawCalls:renderer!.info.render.calls});
    output.textContent=JSON.stringify(phases,null,2);
  }
}

/** Readback is diagnostic, never gameplay work. Borrow framebuffer binding only
 * synchronously, and inspect native errors so an untouched zero-filled buffer
 * cannot be passed off as successful framebuffer parity. */
function readSurface(surface:string,target:THREE.WebGLRenderTarget|null){
  const r=renderer!,gl=r.getContext(),prior=r.getRenderTarget(),face=r.getActiveCubeFace(),mip=r.getActiveMipmapLevel();
  const checkError=(operation:string)=>{const error=gl.getError();if(error!==gl.NO_ERROR||gl.isContextLost())throw new Error(`${surface} ${operation} failed (WebGL error ${error}).`);};
  checkError('before readback');
  try{
    if(target&&(target.texture.format!==THREE.RGBAFormat||target.samples!==0))throw new Error(`${surface} readback requires a single-sample RGBA target; no parity claim is made.`);
    r.setRenderTarget(target);checkError('framebuffer binding');
    const width=target?.width??gl.drawingBufferWidth,height=target?.height??gl.drawingBufferHeight;
    let format:number=gl.RGBA,type:number=gl.UNSIGNED_BYTE,buffer:Uint8Array|Uint16Array|Float32Array;
    if(target){
      format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);checkError('read-format query');
      if(format!==gl.RGBA)throw new Error(`${surface} implementation read format ${format} is unsupported by this RGBA diagnostic.`);
      if(type===gl.FLOAT)buffer=new Float32Array(width*height*4);
      else if(type===(gl as WebGL2RenderingContext).HALF_FLOAT)buffer=new Uint16Array(width*height*4);
      else if(type===gl.UNSIGNED_BYTE)buffer=new Uint8Array(width*height*4);
      else throw new Error(`${surface} implementation read type ${type} is unsupported; no parity claim is made.`);
    }else buffer=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,format,type,buffer);checkError('readPixels');
    return {surface,target:target?.texture.uuid??null,width,height,format,type,storageType:target?.texture.type??null,typedArray:buffer.constructor.name,bytes:new Uint8Array(buffer.buffer,buffer.byteOffset,buffer.byteLength)};
  }finally{r.setRenderTarget(prior,face,mip);}
}

async function snapshotFramebuffers():Promise<FramebufferSnapshot>{
  const started=performance.now();
  const canvas=readSurface('canvas-RGBA8',null),scene=composer?readSurface('composer-readBuffer-RGBA16F',composer.readBuffer):null;
  const hash=async(value:ReturnType<typeof readSurface>):Promise<PixelSnapshot>=>{
    const digest=await crypto.subtle.digest('SHA-256',value.bytes);
    const {bytes,...metadata}=value;
    return {...metadata,bytes:bytes.byteLength,sha256:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
  };
  // No framebuffer remains borrowed while WebCrypto or any other await runs.
  return {canvas:await hash(canvas),scene:scene?await hash(scene):null,readbackMs:Math.round((performance.now()-started)*100)/100};
}

async function measurePreparation(name:string,job:()=>void|Promise<void>){
  if(!parityEnabled){await measure(name,job);return;}
  const record:FramebufferParity={phase:name,before:await snapshotFramebuffers()};framebufferParity.push(record);
  try{
    await measure(name,job);record.after=await snapshotFramebuffers();
    const same=(a:PixelSnapshot,b:PixelSnapshot)=>a.target===b.target&&a.width===b.width&&a.height===b.height&&a.format===b.format&&a.type===b.type&&a.bytes===b.bytes&&a.sha256===b.sha256;
    record.canvasUnchanged=same(record.before.canvas,record.after.canvas);
    record.sceneUnchanged=record.before.scene&&record.after.scene?same(record.before.scene,record.after.scene):record.before.scene===record.after.scene?null:false;
    record.unchanged=record.canvasUnchanged&&record.sceneUnchanged!==false;
    if(!record.unchanged)throw new Error(`${name} changed an existing framebuffer; authored warmup is not safe.`);
  }catch(error){record.error=String(error);throw error;}
}
try{
  // Diagnostic fixture only. Production keeps its normal presentation options.
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,540);renderer.outputColorSpace=THREE.SRGBColorSpace;
  if(parityEnabled&&!renderer.getContext().getContextAttributes()?.preserveDrawingBuffer)throw new Error('Framebuffer parity requires an actually preserved diagnostic canvas.');
  document.getElementById('scene')!.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#15131d');
  const camera=new THREE.PerspectiveCamera(42,960/540,.05,100);camera.position.set(2.6,1.9,-4);camera.lookAt(0,1,0);
  scene.add(new THREE.HemisphereLight('#bfcbdc','#302219',1));
  const sun=new THREE.DirectionalLight('#fff0da',1);sun.position.set(-2,4,-3);scene.add(sun);
  // A fixed pool slot exists before character preparation, exactly as in Engine.
  const lamp=new THREE.PointLight('#ffcf8a',0,26,1.6);scene.add(lamp);
  const high=new URLSearchParams(location.search).get('mode')==='high';
  if(high){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new OutputPass());}
  const draw=()=>composer?composer.render():renderer!.render(scene,camera);
  // Prime both empty composer buffers before observing character work. The
  // parity reads must not silently allocate the alternate buffer mid-phase.
  draw();draw();restore=countCalls(renderer.getContext());
  await measurePreparation('Initial exact-template preparation',async()=>{review=await preparePushpaArtReview({renderer:renderer!,scene,camera,composer});});
  const actor=review!.createCharacter((_key,material)=>ownedMaterials.add(material));actor.group.rotation.y=Math.PI;actor.group.visible=false;scene.add(actor.group);actor.animate?.(.016,'read');
  const lightCount=scene.getObjectsByProperty('isPointLight',true).length;
  applySceneLamp(lamp,{position:{x:.15,y:1.84,z:-.55}},null,6,0);
  await measurePreparation('Constructed-cabin preparation using an existing light slot',()=>review!.prepareGraphics(actor.group));
  actor.group.visible=true;
  await measure('First visible authored clone frame',()=>{actor.animate?.(.016,'read');draw();});
  await measure('Second visible authored clone frame',()=>{actor.animate?.(.016,'read');draw();});
  const second=review!.createCharacter((_key,material)=>ownedMaterials.add(material));second.group.position.x=1.5;second.group.rotation.y=Math.PI;second.animate?.(.016,'read');scene.add(second.group);
  await measurePreparation('Second independent clone preparation',()=>review!.prepareGraphics(second.group));
  await measure('First frame with a second independently skinned clone',draw);
  const initial=phases[0],lampPhase=phases[1],first=phases[2],steady=phases[3],another=phases[5];
  result={schemaVersion:2,environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],context:renderer.capabilities.isWebGL2?'WebGL2':'WebGL',sceneOutput:high?'composer-linear':'canvas-sRGB',physicalDeviceVerified:false,preserveDrawingBufferDiagnosticOnly:true,preserveDrawingBufferActual:renderer.getContext().getContextAttributes()?.preserveDrawingBuffer,framebufferReadbackEnabled:parityEnabled,emptyPrimingFrames:2},candidate:review!.evidence,
    scope:'Isolated actual candidate and native WebGL calls; no city streaming, physical-phone benchmark or visual approval.',phases,framebufferParity:{enabled:parityEnabled,passed:parityEnabled?framebufferParity.length===3&&framebufferParity.every(record=>record.unchanged):null,records:framebufferParity},
    checks:{templateActuallyUploaded:initial.bufferData>0,pooledLightCountUnchanged:scene.getObjectsByProperty('isPointLight',true).length===lightCount,constructedCabinReusesSharedBuffers:lampPhase.bufferData===0,constructedCabinNeedsNoNewShaders:lampPhase.shaderCompiles===0,
      firstVisibleCloneReusesSharedBuffers:first.bufferData===0,secondFrameReusesSharedBuffers:steady.bufferData===0,
      secondCloneReusesSharedBuffers:another.bufferData===0,actualAuthoredDraws:first.nativeDrawCalls>=20,firstVisibleCloneNeedsNoTextures:first.textureStorage===0,firstVisibleCloneNeedsNoNewShaders:first.shaderCompiles===0,preparedSecondCloneNeedsNoNewTextures:another.textureStorage===0,
      ...(parityEnabled?{preparationPreservesFramebuffers:framebufferParity.length===3&&framebufferParity.every(record=>record.unchanged)}:{})},
    limitations:['Per-instance bone textures and authored-program vertex-array bindings remain instance work.','bufferBytes counts requested bufferData array sizes, not resident GPU memory; WebGL2 offset overloads can request a subset.','Shader and texture counts include native renderer housekeeping; they are not FPS measurements.','Framebuffer readback synchronizes GPU work outside phase timings. Use a separate ?parity=0 run for timing-only comparison; that run does not verify parity.','preserveDrawingBuffer:true and two empty priming frames belong only to this diagnostic, not production gameplay.','A passing shared-buffer/framebuffer check does not prove whole-world shader readiness, production frame timing or device thermal behaviour.']};
  status.textContent=Object.values((result as {checks:Record<string,boolean>}).checks).every(Boolean)?parityEnabled?'Native allocation and framebuffer checks passed. Inspect the phase counts below.':'Timing-only native checks passed; framebuffer parity was not tested.':'One or more native checks need investigation. Inspect the phase counts below.';
}catch(error){result={schemaVersion:2,error:String(error),phases,framebufferParity:{enabled:parityEnabled,passed:false,records:framebufferParity},physicalDeviceVerified:false};status.textContent='Native check failed; no readiness approval is claimed.';}
finally{active=null;restore();output.textContent=JSON.stringify(result,null,2);download.disabled=false;}
download.addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=`character-gpu-readiness-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
addEventListener('pagehide',()=>{ownedMaterials.forEach(material=>material.dispose());review?.dispose();composer?.passes.forEach(pass=>pass.dispose?.());composer?.dispose();renderer?.dispose();},{once:true});

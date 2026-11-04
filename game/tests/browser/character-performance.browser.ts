import * as THREE from 'three';
import catalog from '../../src/delivery/art/character-assets.json';
import { prewarmReleasedGltfAssets,createReleasedGltfCharacter,retainReleasedGltfAssets,disposeReleasedGltfAssets } from '../../src/delivery/art/released-gltf';
import type { SceneCharacter } from '../../src/delivery/modules/character';
import {faceMesh,pickFaceAnnotation,reviewedFaceAnnotation,type FaceAnnotation} from '../../src/delivery/art/face-annotations';

const canvas=document.querySelector('canvas')!,output=document.querySelector('#state')!,select=document.querySelector<HTMLSelectElement>('#identity')!;
const query=new URLSearchParams(location.search),requested=query.get('character')??'arjun-reddy';
for(const entry of catalog.assets){const option=document.createElement('option');option.value=entry.characterId;option.textContent=entry.characterId;select.add(option);}
select.value=catalog.assets.some(e=>e.characterId===requested)?requested:'arjun-reddy';
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b7c1c5');scene.add(new THREE.HemisphereLight('#f5f4ef','#85878b',2));
const sun=new THREE.DirectionalLight('#fff4e4',2);sun.position.set(-4,7,5);scene.add(sun);
const floorGeometry=new THREE.PlaneGeometry(30,30),floorMaterial=new THREE.MeshStandardMaterial({color:'#777c7e',roughness:1}),floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
const camera=new THREE.PerspectiveCamera(35,1,.02,100),target=new THREE.Vector3(0,1.30,.05);
let distance=3.2,orbit=.12,elevation=.10,paused=false,previous:number|null=null,actor:SceneCharacter|null=null,epoch=0;
let geometry:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
const annotations=new Map<string,FaceAnnotation>(),annotationLabel=document.getElementById('annotation')!,approve=document.getElementById('approve')as HTMLButtonElement;
const localKey='roadster-native-face-annotations-v1';
try{for(const entry of JSON.parse(localStorage.getItem(localKey)??'{"entries":[]}').entries??[])if(catalog.assets.some(asset=>asset.characterId===entry.characterId&&asset.glb.sha256===entry.glbSha256))annotations.set(entry.characterId,entry);}catch{}
for(const entry of catalog.assets){const reviewed=reviewedFaceAnnotation(entry.characterId);if(reviewed&&!annotations.has(entry.characterId))annotations.set(entry.characterId,reviewed);}
const markerGeometry=new THREE.SphereGeometry(.0035,10,8),markerMaterial=new THREE.MeshBasicMaterial({color:'#ff1f62',depthTest:false}),marker=new THREE.Mesh(markerGeometry,markerMaterial);marker.renderOrder=100;
const maskGeometry=new THREE.BufferGeometry(),maskMaterial=new THREE.PointsMaterial({color:'#22ffee',size:.0025,depthTest:false}),maskPoints=new THREE.Points(maskGeometry,maskMaterial);maskPoints.renderOrder=99;scene.add(marker,maskPoints);
let picking=false;
const serialized=()=>JSON.stringify({schemaVersion:1,entries:catalog.assets.map(entry=>annotations.get(entry.characterId)).filter(Boolean)},null,2);
function saveAnnotations(){try{localStorage.setItem(localKey,serialized());}catch{};}
function annotationStatus(){const a=annotations.get(select.value),approved=[...annotations.values()].filter(entry=>entry.review.status==='approved').length;
  annotationLabel.textContent=a?`${a.review.status.toUpperCase()} · ${a.meshName} · ${a.mask.length} lip vertices · head point ${a.anchorHeadLocal.map(n=>n.toFixed(4)).join(', ')} · ${approved}/${catalog.assets.length} approved`:`No explicit mouth annotation · ${approved}/${catalog.assets.length} approved`;
  approve.disabled=!a||a.review.status==='approved';
}
const buttons=['meal','reset'].map(id=>document.getElementById(id)as HTMLButtonElement);
function release(){if(actor)scene.remove(actor.group);actor=null;geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());geometry=[];materials=[];}
async function load(){const current=++epoch;buttons.forEach(b=>b.disabled=true);output.textContent='Loading exact approved appearance…';release();retainReleasedGltfAssets([select.value]);
  try{const report=await prewarmReleasedGltfAssets([select.value]);if(current!==epoch)return;if(!report.ready.includes(select.value))throw Error('Released appearance unavailable');
    actor=createReleasedGltfCharacter(select.value,{geometry:g=>{geometry.push(g);return g;},material:(_,m)=>materials.push(m)},annotations.get(select.value));if(!actor)throw Error('No approved actor');scene.add(actor.group);actor.animate?.(0,'idle',0);actor.setSpeechEnvelope?.(Number((document.getElementById('speech')as HTMLInputElement).value));
    buttons.forEach(b=>b.disabled=false);renderer.compile(scene,camera);
    annotationStatus();
  }catch(error){if(current===epoch)output.textContent=String(error);}
}
select.onchange=()=>{void load();};document.getElementById('reset')!.onclick=()=>{void load();};document.getElementById('meal')!.onclick=()=>{const started=actor?.receivePizza?.()??false;if(!started)output.textContent='This special pose does not eat; use the speech envelope only.';};
document.getElementById('pause')!.onclick=()=>{paused=!paused;document.getElementById('pause')!.textContent=paused?'Resume animation':'Pause animation';};
document.getElementById('close')!.onclick=()=>{const head=actor?.group.getObjectByName('Head');const y=head?head.getWorldPosition(new THREE.Vector3()).y:1.55;target.set(0,y-.14,.10);distance=1.7;elevation=.12;};
document.getElementById('full')!.onclick=()=>{target.set(0,.9,0);distance=4.6;elevation=.03;};
const panel=document.querySelector('aside')!;
document.getElementById('hide')!.onclick=()=>{panel.hidden=true;};
window.addEventListener('keydown',event=>{if(event.code==='KeyH'&&!(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)){panel.hidden=!panel.hidden;event.preventDefault();}});
const phase=document.getElementById('phase')as HTMLInputElement;
phase.oninput=()=>{document.getElementById('phase-value')!.textContent=Number(phase.value).toFixed(2)+'s';};
document.getElementById('inspect')!.onclick=async()=>{
  paused=true;document.getElementById('pause')!.textContent='Resume animation';await load();
  const selected=actor;if(!selected?.receivePizza?.())return;
  let remaining=Math.max(0,Math.min(6,Number(phase.value)));
  while(remaining>1e-8){const dt=Math.min(.05,remaining);selected.animate?.(dt,'idle',0);remaining-=dt;}
};
(document.getElementById('speech')as HTMLInputElement).oninput=e=>{actor?.setSpeechEnvelope?.(Number((e.target as HTMLInputElement).value));if(paused)actor?.animate?.(.1,'idle',0);};
document.getElementById('pick')!.onclick=async()=>{
  paused=true;picking=false;(document.getElementById('speech')as HTMLInputElement).value='0';document.getElementById('pause')!.textContent='Resume animation';await load();if(!actor)return;
  const head=actor.group.getObjectByName('Head'),p=head?.getWorldPosition(new THREE.Vector3());if(p){target.set(p.x,p.y,p.z+.08);distance=.85;orbit=0;elevation=.015;}
  picking=true;canvas.style.cursor='crosshair';panel.hidden=true;document.getElementById('hint')!.textContent='Click the centre of the visible closed lips · H restores controls';
};
approve.onclick=()=>{const a=annotations.get(select.value);if(!a)return;a.review={...a.review,status:'approved',approvedAt:new Date().toISOString()};saveAnnotations();annotationStatus();};
document.getElementById('download')!.onclick=()=>{
  const text=serialized();(document.getElementById('annotation-json')as HTMLTextAreaElement).value=text;
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`roadster-face-annotations-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),maskPoint=new THREE.Vector3();
async function pickAt(event:PointerEvent){if(!actor)return;try{
  const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);actor.group.updateWorldMatrix(true,true);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObject(actor.group,true).find(hit=>{let n:THREE.Object3D|null=hit.object;while(n&&n!==actor!.group){if(!n.visible||n.name.startsWith('received-')||n.name==='delivery-mouth-anchor')return false;n=n.parent;}return n===actor!.group;});
  if(!hit)throw Error('No visible actor surface at that click.');const annotation=pickFaceAnnotation(actor.group,select.value,hit);annotations.set(select.value,annotation);saveAnnotations();
  picking=false;canvas.style.cursor='';document.getElementById('hint')!.textContent='H · show/hide controls';await load();panel.hidden=false;annotationStatus();
}catch(error){annotationLabel.textContent=String(error);panel.hidden=false;}}
let drag:{x:number;y:number}|null=null;canvas.onpointerdown=e=>{if(picking){void pickAt(e);return;}drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;orbit-=(e.clientX-drag.x)*.006;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.2,.8);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance*(e.deltaY>0?1.08:.92),.5,10);};
const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);resize();
function frame(now:number){const dt=previous===null?0:Math.max(0,Math.min(.05,(now-previous)/1000));previous=now;if(!paused)actor?.animate?.(dt,'idle',0);
  const a=annotations.get(select.value),show=(document.getElementById('markers')as HTMLInputElement).checked,head=actor?.group.getObjectByName(a?.headNode??'Head');
  marker.visible=maskPoints.visible=!!(a&&actor&&head&&show);
  if(a&&actor&&head&&show){head.localToWorld(marker.position.fromArray(a.anchorHeadLocal));const mesh=faceMesh(actor.group,a);if(mesh){let attr=maskGeometry.getAttribute('position')as THREE.BufferAttribute;if(attr?.count!==a.mask.length){attr=new THREE.BufferAttribute(new Float32Array(a.mask.length*3),3);maskGeometry.setAttribute('position',attr);}if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.update();for(let i=0;i<a.mask.length;i++){mesh.getVertexPosition(a.mask[i].index,maskPoint).applyMatrix4(mesh.matrixWorld);attr.setXYZ(i,maskPoint.x,maskPoint.y,maskPoint.z);}attr.needsUpdate=true;maskGeometry.computeBoundingSphere();}}
  camera.position.set(target.x+Math.sin(orbit)*distance,target.y+Math.sin(elevation)*distance,target.z+Math.cos(orbit)*Math.cos(elevation)*distance);camera.lookAt(target);renderer.render(scene,camera);
  const state=actor?.group.userData.deliveryPerformance;if(state)output.textContent=`${select.value} · ${state.phase} ${state.time.toFixed(2)}s · mouth ${state.mouth.toFixed(2)} · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles`;
  requestAnimationFrame(frame);
}requestAnimationFrame(frame);void load();
window.addEventListener('pagehide',()=>{epoch++;release();disposeReleasedGltfAssets();floorGeometry.dispose();floorMaterial.dispose();markerGeometry.dispose();markerMaterial.dispose();maskGeometry.dispose();maskMaterial.dispose();renderer.dispose();});

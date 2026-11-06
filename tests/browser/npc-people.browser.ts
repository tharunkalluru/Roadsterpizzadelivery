import * as THREE from 'three';
import {Batch,initTemplates} from '../../src/core/util';
import {drawPerson,drawSeatedPerson,walkerGeometry,walkerGeometryCacheStats,trimWalkerGeometryCache,type PersonSpec,legsVisible} from '../../src/world/people';
import {makeHumanWalkRig,type HumanWalkRig} from '../../src/world/human-gait';
import {continuousHumanStats} from '../../src/world/human-body';

initTemplates();const query=new URLSearchParams(location.search),view=query.get('view')??'front',isSeated=view.startsWith('seated'),compare=query.has('cpuReference'),canvas=document.querySelector('canvas')!,output=document.querySelector('output')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#aab7bc');scene.add(new THREE.HemisphereLight('#f5f4ef','#85878b',2.0));const sun=new THREE.DirectionalLight('#fff4e4',2.0);sun.position.set(-4,7,-5);scene.add(sun);
// Exact gameplay material properties, including its existing metalness/roughness.
const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.18});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,100),new THREE.MeshStandardMaterial({color:'#817f79',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.006;scene.add(ground);
const base:PersonSpec={kind:'shirt',s:1,walk:1.2,skin:'#9c6644',hair:'#201916',a:'#91acbf',b:'#353d4a',c:'#ece9dd',sleeve:'short',pattern:'plain',age:'adult',build:'average',face:0,hairstyle:0};
const specs:PersonSpec[]=[
 {...base,kind:'schoolboy',age:'child',s:.73,a:'#eeeeea',b:'#283955',face:2},
 {...base,kind:'teen_m',age:'teen',s:.94,build:'slim',a:'#993d36',b:'#324359',face:3},
 {...base,kind:'teen_f',age:'teen',s:.91,build:'slim',a:'#487c80',b:'#343944',face:2},
 {...base,kind:'shirt',s:1.06,build:'broad',face:1,facialHair:true,sleeve:'long',pattern:'check'},
 {...base,kind:'sari',s:.95,skin:'#6e452f',a:'#754471',b:'#b69559',c:'#d6bc82',bindi:true,face:4},
 {...base,kind:'salwar',s:.98,a:'#987b98',b:'#dfd4be',c:'#684c65',face:2,hairstyle:1},
 {...base,kind:'elder_m',age:'elder',s:.98,skin:'#7d5135',hair:'#b7b5ac',a:'#d8d6c7',b:'#b6b7ac',face:5,facialHair:true},
 {...base,kind:'elder_f',age:'elder',s:.92,hair:'#a8a59e',skin:'#b97f55',a:'#9bacae',b:'#e1dece',face:1},
 {...base,kind:'burqa',s:.95,a:'#24262a',b:'#24262a',c:'#3e4046',face:2},
];
const rigs:HumanWalkRig[]=[],leases:ReturnType<typeof walkerGeometry>[]=[],owned:THREE.BufferGeometry[]=[];
const references:{rig:HumanWalkRig;geometry:THREE.BufferGeometry}[]=[],referenceMaterial=new THREE.MeshBasicMaterial({color:'#ffd65a',wireframe:true,depthTest:false,depthWrite:false});
let width=7.7,height=3.1,target=new THREE.Vector3(0,.83,0),distance=10,orbit=0,elevation=0,playing=!query.has('phase');
if(view==='faces') {width=3.1;height=.90;target.set(0,1.55,0);distance=5;}
else if(view==='driving'){width=12;height=6;target.set(0,.8,0);distance=15;elevation=.17;}
else if(isSeated){width=8.0;height=3.1;target.set(0,.70,0);distance=10;}
const selected=view==='faces'?[specs[1],specs[3],specs[5],specs[6]]:isSeated?[specs[3],specs[5],specs[4],specs[1],specs[5],specs[4],specs[2]]:specs;
for(let i=0;i<selected.length;i++) {
 const spec=selected[i],x=(i-(selected.length-1)/2)*(view==='faces'?.70:isSeated?1.05:.72),g=new THREE.Group();
 if(isSeated) {const batch=new Batch();drawSeatedPerson(batch,spec,0,.60,0,(['bike','scooter','bench','auto','pillion','pillionSide','scooterPillion'] as const)[i]);const geo=batch.geometry();owned.push(geo);g.add(new THREE.Mesh(geo,material));}
 else if(view==='faces') {const batch=new Batch();drawPerson(batch,{...spec,s:1},0,0,0);const geo=batch.geometry();owned.push(geo);g.add(new THREE.Mesh(geo,material));}
 else {const lease=walkerGeometry(spec,true),rig=makeHumanWalkRig(lease.rigged!,material,spec,!legsVisible(spec.kind));leases.push(lease);rigs.push(rig);g.add(rig.mesh);g.scale.setScalar(spec.s);if(compare){const geometry=lease.rigged!.clone(),reference=new THREE.Mesh(geometry,referenceMaterial);references.push({rig,geometry});owned.push(geometry);reference.renderOrder=10;g.add(reference);}}
 g.position.x=x;if(view==='profile'||view==='seated-side')g.rotation.y=Math.PI/2;else if(view==='seated-quarter')g.rotation.y=.60;scene.add(g);
}
const camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,100),resize=()=>{renderer.setSize(innerWidth,innerHeight,false);const aspect=innerWidth/innerHeight;camera.left=-Math.max(width,height*aspect)/2;camera.right=-camera.left;camera.top=Math.max(height,width/aspect)/2;camera.bottom=-camera.top;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);resize();
let drag:{x:number;y:number}|null=null;canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;orbit-=(e.clientX-drag.x)*.006;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.15,.8);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
document.querySelector<HTMLButtonElement>('#motion')!.onclick=()=>{playing=!playing;document.querySelector('#motion')!.textContent=playing?'Pause gait':'Resume gait';};
const referencePoint=new THREE.Vector3();let previous:number|null=null,phase=Number(query.get('phase')??0);function frame(now:number){const dt=previous===null?0:THREE.MathUtils.clamp((now-previous)/1000,0,.05);previous=now;if(playing)phase+=dt*6;rigs.forEach((r,i)=>r.update(phase+i*.39,query.get('idle')!=='1',dt));
 // Optional exact same-pose CPU wire overlay. It shares each person's ancestor
 // scale/orientation but has no GPU skinning, exposing bind/palette mismatch.
 if(references.length){scene.updateMatrixWorld(true);for(const {rig,geometry} of references){rig.mesh.skeleton.update();const source=rig.mesh.geometry.getAttribute('position'),target=geometry.getAttribute('position');for(let i=0;i<source.count;i++){rig.mesh.applyBoneTransform(i,referencePoint.fromBufferAttribute(source,i));target.setXYZ(i,referencePoint.x,referencePoint.y,referencePoint.z);}target.needsUpdate=true;geometry.computeBoundingSphere();}}
 camera.position.set(target.x+Math.sin(orbit)*distance,target.y+Math.sin(elevation)*distance,target.z-Math.cos(orbit)*Math.cos(elevation)*distance);camera.lookAt(target);renderer.render(scene,camera);output.textContent=`${view}: ${selected.length} figures · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles · native closed human ${continuousHumanStats.bodyTriangles}/${continuousHumanStats.lowBodyTriangles} detail/reduced${compare?' · gold wire = CPU same-pose reference':''}`;document.documentElement.dataset.npcReview=JSON.stringify({view,phase,cpuReference:compare,figures:selected.length,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,cacheBytes:walkerGeometryCacheStats.estimatedBytes,bodyTemplates:continuousHumanStats.bodyTemplates});requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{rigs.forEach(r=>r.dispose());leases.forEach(l=>l.release());trimWalkerGeometryCache(true);owned.forEach(g=>g.dispose());material.dispose();referenceMaterial.dispose();ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();});

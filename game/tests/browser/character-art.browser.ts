/** Optional baseline: git show 40345bd:src/delivery/modules/character.ts >
 * tests/browser/.character-before.generated.ts
 * Open /tests/browser/character-art.html?compare=1. The generated baseline is
 * test-only, should not be staged, and may be removed after visual comparison. */
import * as THREE from 'three';
import { createSceneCharacter, type CharacterStyle, type SceneCharacter } from '../../src/delivery/modules/character';

const canvas=document.querySelector<HTMLCanvasElement>('#art')!,stats=document.querySelector<HTMLOutputElement>('#stats')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scenes:THREE.Scene[]=[],actors:SceneCharacter[]=[],owners:{geometry:Set<THREE.BufferGeometry>;materials:Set<THREE.Material>}[]=[];
let baseline:typeof createSceneCharacter|undefined;
if(new URLSearchParams(location.search).has('compare')){
  try{baseline=(await import(/* @vite-ignore */'/tests/browser/.character-before.generated.ts')).createSceneCharacter;document.body.classList.add('compare');}
  catch{stats.textContent='Baseline unavailable; see fixture source command.';}
}
let mode='face',angle=.25,catchAmount=0;
function build(){
  owners.forEach(o=>{o.geometry.forEach(g=>g.dispose());o.materials.forEach(m=>m.dispose());});scenes.length=0;actors.length=0;owners.length=0;
  const style=document.querySelector<HTMLSelectElement>('#actor')!.value as CharacterStyle,seated=document.querySelector<HTMLInputElement>('#seated')!.checked;
  for(const create of baseline?[baseline,createSceneCharacter]:[createSceneCharacter]){
    const scene=new THREE.Scene();scene.background=new THREE.Color('#BDBBB3');const owner={geometry:new Set<THREE.BufferGeometry>(),materials:new Set<THREE.Material>()};
    const actor=create(style,seated,{geometry:g=>{owner.geometry.add(g);return g;},material:(_,m)=>owner.materials.add(m)});scene.add(actor.group);actor.catchPose(catchAmount);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10),new THREE.MeshBasicMaterial({color:'#A9A79F'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.004;scene.add(floor);owner.geometry.add(floor.geometry);owner.materials.add(floor.material);
    if(seated){const chair=new THREE.Mesh(new THREE.BoxGeometry(.39,.06,.38),new THREE.MeshBasicMaterial({color:'#736557'}));chair.position.set(0,.57,0);scene.add(chair);owner.geometry.add(chair.geometry);owner.materials.add(chair.material);}
    actors.push(actor);scenes.push(scene);owners.push(owner);
  }
  const measures=actors.map(actor=>{let triangles=0,draws=0;actor.group.traverse(n=>{if(n instanceof THREE.Mesh){draws++;triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;}});return{draws,triangles};});
  stats.textContent=measures.map((m,i)=>`${baseline&&i===0?'Before':'Current'}: ${m.triangles.toLocaleString()} triangles · ${m.draws} actor/prop draws`).join('\n');
  document.documentElement.dataset.characterMetrics=JSON.stringify(measures);
}
const camera=new THREE.PerspectiveCamera(32,1,.02,100),box=new THREE.Box3(),target=new THREE.Vector3();
function frame(){
  const w=innerWidth,h=innerHeight;renderer.setScissorTest(true);
  for(let i=0;i<scenes.length;i++){
    const partW=w/scenes.length,available=Math.max(180,partW-(i===scenes.length-1?190:0));
    box.setFromObject(actors[i].group);const height=box.max.y,old=!!baseline&&i===0;
    target.set(0,mode==='face'?height-(old?.29:.13):height*.52,mode==='face'?.025:0);
    const distance=mode==='face'?(old?1.3:.77):3.6,viewWidth=partW;
    camera.aspect=viewWidth/h;camera.setViewOffset(viewWidth,h,(partW-available)*.38,0,viewWidth,h);
    camera.position.set(Math.sin(angle)*distance,target.y+(mode==='face'?.02:.1),Math.cos(angle)*distance);camera.lookAt(target);camera.updateProjectionMatrix();
    renderer.setViewport(i*partW,0,partW,h);renderer.setScissor(i*partW,0,partW,h);renderer.render(scenes[i],camera);
  }
  requestAnimationFrame(frame);
}
for(const id of['face','body'])document.getElementById(id)!.addEventListener('click',()=>{mode=id;for(const other of['face','body'])document.getElementById(other)!.setAttribute('aria-pressed',String(other===id));});
for(const[id,a]of[['front',0],['three',.6],['side',Math.PI/2]] as const)document.getElementById(id)!.addEventListener('click',()=>angle=a);
document.getElementById('actor')!.addEventListener('change',()=>{const style=document.querySelector<HTMLSelectElement>('#actor')!.value;document.querySelector<HTMLInputElement>('#seated')!.checked=style==='pushpa'||style==='imax';build();});
document.getElementById('seated')!.addEventListener('change',build);
document.getElementById('catch')!.addEventListener('input',event=>{catchAmount=Number((event.target as HTMLInputElement).value);actors.forEach(a=>a.catchPose(catchAmount));});
let drag:number|null=null;canvas.addEventListener('pointerdown',e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag===null)return;angle+=(e.clientX-drag)*.012;drag=e.clientX;});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
const resize=()=>renderer.setSize(innerWidth,innerHeight,false);window.addEventListener('resize',resize);resize();
window.addEventListener('pagehide',()=>{owners.forEach(o=>{o.geometry.forEach(g=>g.dispose());o.materials.forEach(m=>m.dispose());});renderer.dispose();});build();frame();

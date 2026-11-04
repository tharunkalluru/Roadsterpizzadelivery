import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initTemplates,rng } from '../../src/core/util';
import * as M from '../../src/world/traffic_models';

initTemplates({rbox:new RoundedBoxGeometry(1,1,1,2,.08)});
const query=new URLSearchParams(location.search),key=query.get('model')??'hatch',view=query.get('view')??'three-quarter',night=query.get('night')==='1';
const factories:Record<string,()=>M.Model>={hatch:()=>M.car('hatch','#b83636',rng(144)),sedan:()=>M.car('sedan','#eeeae1',rng(145)),suv:()=>M.car('suv','#3d5756',rng(146)),cab:()=>M.car('cab','#efeee7',rng(147)),auto:()=>M.auto(rng(148)),motorbike:()=>M.motorbike(rng(149)),scooter:()=>M.scooter(rng(150)),bus:()=>M.bus(rng(151)),lorry:()=>M.lorry(rng(152)),tanker:()=>M.tanker(rng(153)),'mini-truck':()=>M.miniTruck(rng(154)),'passenger-van':()=>M.passengerVan(rng(155))};
const model=(factories[key]??factories.hatch)(),canvas=document.querySelector('canvas')!,output=document.querySelector('output')!;
const controls=document.querySelector('aside')!;
document.querySelector<HTMLButtonElement>('#hide-controls')!.onclick=()=>{controls.hidden=true;};
addEventListener('keydown',event=>{if(event.code==='KeyH')controls.hidden=!controls.hidden;});
document.body.dataset.night=String(night);
const link=(model:string,v=view,n=night)=>`?model=${model}&view=${v}${n?'&night=1':''}`;
document.querySelector('#models')!.innerHTML=Object.keys(factories).map(k=>`<a href="${link(k)}">${k}</a>`).join('');
document.querySelector('#views')!.innerHTML=['three-quarter','front','side','left-side','rear','cabin'].map(v=>`<a href="${link(key,v)}">${v}</a>`).join('')+`<a href="${link(key,view,!night)}">${night?'Day':'Night'}</a>`;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color(night?'#182733':'#aab7bc');scene.add(new THREE.HemisphereLight(night?'#8392ad':'#f5f4ef',night?'#32353c':'#85878b',night?.65:2));
const sun=new THREE.DirectionalLight(night?'#a3b9d1':'#fff4e4',night?.35:2);sun.position.set(-4,7,-5);scene.add(sun);
const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.18}),lampMaterial=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
const car=new THREE.Group(),owned:THREE.BufferGeometry[]=[];
for(const [batch,mat]of [[model.body,material],[model.lights,lampMaterial]]as const){const geo=batch.geometry();owned.push(geo);car.add(new THREE.Mesh(geo,mat));}
for(const dc of model.decals??[])car.add(new THREE.Mesh(dc.geo,dc.mat));scene.add(car);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,100),new THREE.MeshStandardMaterial({color:'#5b6064',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.008;scene.add(ground);
const L=model.size[2],H=model.size[1];let target=new THREE.Vector3(0,H*.48,0),distance=Math.max(6,L*1.5),orbit=.62,elevation=.16;
if(view==='front'){orbit=0;elevation=.02;}else if(view==='side'){orbit=Math.PI/2;elevation=.02;}else if(view==='left-side'){orbit=-Math.PI/2;elevation=.02;}else if(view==='rear'){orbit=Math.PI;elevation=.06;}else if(view==='cabin'){orbit=.83;elevation=.02;distance=Math.max(3,L*.6);target.set(0,H*.56,-L*.20);}
const camera=new THREE.PerspectiveCamera(38,1,.03,200),resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};addEventListener('resize',resize);resize();
let drag:{x:number;y:number}|null=null;canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;orbit-=(e.clientX-drag.x)*.006;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.12,.8);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance*(e.deltaY>0?1.08:.92),1,35);};
function frame(){camera.position.set(target.x+Math.sin(orbit)*distance,target.y+Math.sin(elevation)*distance,target.z-Math.cos(orbit)*Math.cos(elevation)*distance);camera.lookAt(target);renderer.render(scene,camera);output.textContent=`${key}: ${model.size.map(n=>n.toFixed(2)).join(' × ')} m (W/H/L) · ${model.occupants?.length??'existing'} occupants · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles`;requestAnimationFrame(frame);}requestAnimationFrame(frame);
addEventListener('pagehide',()=>{owned.forEach(g=>g.dispose());material.dispose();lampMaterial.dispose();ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();});

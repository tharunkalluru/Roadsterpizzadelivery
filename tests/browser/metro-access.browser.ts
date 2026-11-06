import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {Engine} from '../../src/core/engine';
import {moodAt} from '../../src/core/sky';
import {initTemplates} from '../../src/core/util';
import {fetchPack} from '../../src/world/packs';
import {buildTile,type TileZone} from '../../src/world/city';
import type {CoreData} from '../../src/world/types';
import {metroCorridors,metroPlatformAssemblies,type MetroPlatformAssembly} from '../../src/world/metro-geometry';
import {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from '../../src/world/road-grades';
import {SignSystem} from '../../src/world/signs';

initTemplates({rbox:new RoundedBoxGeometry(1,1,1,3,.12),ring:new THREE.RingGeometry(1,1.35,40)});
const query=new URLSearchParams(location.search),lowQ=query.get('q')!=='high',engine=new Engine(document.querySelector('#world')!,{lowQ}),output=document.querySelector('output')!,select=document.querySelector<HTMLSelectElement>('#station')!;
const group=new THREE.Group();engine.scene.add(group);const signs=new SignSystem();engine.scene.add(signs.group);
const renderedView=document.querySelector<HTMLOutputElement>('#view-state')!;
let assembly:MetroPlatformAssembly,angle=.8,elevation=.3,distance=115,night=false,currentView='overview',sceneLoaded=false,look=new THREE.Vector3(),epoch=0;
let actualEntry:THREE.Vector3|null=null,actualEntrySide=1;
const core=await fetchPack<CoreData>('/city/core.pack.wasm');core.roads=prepareRoadGrades(core.roads);const patches=currentRoadGradePatches(core.roads);
const assemblies=metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight);
for(const a of assemblies){const option=document.createElement('option');option.value=a.key;option.textContent=`${a.source.name} · ${a.lineId}`;select.append(option);}
select.value=assemblies.find(a=>a.key===(query.get('station')??'st_madhapur'))?.key??assemblies[0].key;
function frameAt(u:number,v:number,y:number){const {cx,cz,hx,hz}=assembly.frame;return new THREE.Vector3(cx+hx*u-hz*v,y,cz+hz*u+hx*v);}
function view(mode:string){currentView=mode;const DH=assembly.deckHeight;if(mode==='overview'){look.copy(frameAt(0,0,DH*.65));distance=115;angle=Math.atan2(-assembly.frame.hz,-assembly.frame.hx)+.5;elevation=.3;}
  if(mode==='street'){look.copy(frameAt(0,0,6));distance=95;angle=Math.atan2(-assembly.frame.hx,-assembly.frame.hz);elevation=-.035;}
  if(mode==='entrance'){look.set(actualEntry?.x??assembly.frame.cx,3.2,actualEntry?.z??assembly.frame.cz);distance=14;angle=Math.atan2(assembly.frame.hz*actualEntrySide,-assembly.frame.hx*actualEntrySide)+.65;elevation=.12;}
  if(mode==='concourse'){look.copy(frameAt(-22,1,assembly.deckHeight-2.75));distance=13;angle=Math.atan2(-assembly.frame.hx,-assembly.frame.hz)+.25;elevation=0;}
  if(mode==='platform'){look.copy(frameAt(-12,5.6,DH+2.5));distance=20;angle=Math.atan2(-assembly.frame.hx,-assembly.frame.hz)+.03;elevation=0;}}
async function load(){const id=++epoch;sceneLoaded=false;renderedView.textContent='Loading view…';output.textContent='Loading the actual packed city tile…';assembly=assemblies.find(a=>a.key===select.value)!;
  const [sx,sz]=assembly.source.p,i=Math.floor(sx/1000),j=Math.floor(sz/1000),pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;
  const data=await fetchPack<{tiles:Record<string,TileZone>}>(`/city/${pack.file}`);if(id!==epoch)return;
  for(const object of [...group.children]){group.remove(object);if(object instanceof THREE.Mesh)object.geometry.dispose();}signs.remove(signs.signs.slice());
  const zone=data.tiles[`${i}_${j}`],roads=applyRoadGradePatches(zone.roads,patches),tile=buildTile({...zone,roads},{lowQ,metro:core.metro});let vertices=0;
  // Frame an entry that survived the production road/building checks. An
  // unchecked preferred arm can be on the opposite end or entirely omitted.
  const access=tile.structureSupports.filter(s=>s.source===assembly.key&&s.part==='station_stairs');
  const entry=access.find(s=>s.bottom===0&&'hw'in s.footprint&&Math.abs(s.footprint.hw-1.35)<.001&&Math.abs(s.footprint.hl-1.35)<.001)
    ??access.find(s=>s.bottom<=.05&&s.top>0);
  actualEntry=entry?new THREE.Vector3(entry.footprint.x,0,entry.footprint.z):null;
  actualEntrySide=entry?Math.sign(-(entry.footprint.x-assembly.frame.cx)*assembly.frame.hz+(entry.footprint.z-assembly.frame.cz)*assembly.frame.hx)||1:1;
  for(const b of tile.buffers){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(b.pos,3));g.setAttribute('normal',new THREE.BufferAttribute(b.nor,3));g.setAttribute('uv',new THREE.BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.BufferAttribute(b.col,3));g.computeBoundingSphere();const mesh=new THREE.Mesh(g,engine.mats[b.mat]??engine.mats.st);mesh.castShadow=!['road','marks','lit'].includes(b.mat);mesh.receiveShadow=true;group.add(mesh);vertices+=b.pos.length/3;}
  for(const sign of tile.signs)signs.add({...sign,c:new THREE.Vector3(...sign.c),right:new THREE.Vector3(...sign.right),up:new THREE.Vector3(...sign.up)});signs.update(assembly.frame.cx,assembly.frame.cz,true);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),engine.mats.ground);ground.rotation.x=-Math.PI/2;ground.position.set(assembly.frame.cx,-.16,assembly.frame.cz);ground.receiveShadow=true;group.add(ground);
  engine.sun.position.copy(frameAt(-60,-40,130));engine.sun.target.position.set(assembly.frame.cx,0,assembly.frame.cz);engine.applyMood(moodAt(night?0:12));view(query.get('view')??'overview');sceneLoaded=true;
  const supports=tile.structureSupports.filter(s=>s.source===assembly.key&&s.part==='station_stairs');output.textContent=`${assembly.source.name} · ${assembly.lineId}\nDeck ${assembly.deckHeight.toFixed(2)} m · actual tile ${i}_${j}\n${supports.length} checked access sections · ${Math.round(vertices/3).toLocaleString()} tile triangles\nQuality: ${lowQ?'Low':'High'} · private candidate`;
}
select.onchange=()=>void load();for(const mode of ['overview','street','entrance','concourse','platform'])document.querySelector(`#${mode}`)!.addEventListener('click',()=>view(mode));
document.querySelector('#night')!.addEventListener('click',()=>{night=!night;engine.applyMood(moodAt(night?0:12));});
let drag:{x:number;y:number}|null=null;const canvas=engine.renderer.domElement;
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;angle-=(e.clientX-drag.x)*.006;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.2,1.3);drag={x:e.clientX,y:e.clientY};};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;canvas.onwheel=e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.035,3,250);};
await load();function render(){if(assembly){engine.camera.position.set(look.x+Math.sin(angle)*Math.cos(elevation)*distance,look.y+Math.sin(elevation)*distance,look.z+Math.cos(angle)*Math.cos(elevation)*distance);engine.camera.lookAt(look);engine.sky.position.copy(engine.camera.position);signs.update(engine.camera.position.x,engine.camera.position.z);engine.render();const label=sceneLoaded?`Rendered view: ${assembly.key} / ${currentView} / ${night?'night':'day'}`:'Loading view…';if(renderedView.textContent!==label)renderedView.textContent=label;}requestAnimationFrame(render);}requestAnimationFrame(render);

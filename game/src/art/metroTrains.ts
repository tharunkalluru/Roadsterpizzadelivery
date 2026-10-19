import * as THREE from 'three';
import type { Quality } from './api';
import { GeoBuilder, addBox, boxMatrix, hex, sampleAt, polyLength, type PSample } from './geo';
import { MetroTimetable } from '../traffic/metroTimetable';

interface Alignment { samples: PSample[]; color: string; stations: number[] }
/** Three articulated 19.5 m coaches, copied from shared geometry; doors slide while dwelling. */
export function createMetroService(alignments: Alignment[], quality: Quality,trackOffsetM:number) {
  const root = new THREE.Group(); root.name='metro-moving-service';
  root.userData.nearbySound=0;
  root.userData.fidelity='scenario_overlay';
  root.userData.note='Authored 150-second headway and 20-second station dwell; not a live timetable.';
  const silver = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.5});
  const glass = new THREE.MeshStandardMaterial({color:0x233b4a,roughness:.16,metalness:.5});
  const dark = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75});
  const lamp = new THREE.MeshStandardMaterial({color:0xfff8de,emissive:0xffedbf,emissiveIntensity:1.5});
  const base = new GeoBuilder(true), windows = new GeoBuilder(), detail = new GeoBuilder(true), lights=new GeoBuilder();
  const box=(b:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,c=0xd8d9d6)=>addBox(b,w,h,d,boxMatrix(x,y,z),1,hex(c));
  box(base,2.85,2.75,19.4,0,1.85,0);box(base,2.75,.2,18.8,0,3.32,0,0xb7bfc0);
  box(detail,2.65,.28,19,0,.55,0,0x313c42);
  for(const side of [-1,1]) {
    box(detail,.025,.26,19.1,side*1.438,1.1,0,0x2089ba);
    for(let z=-7.9;z<8;z+=2.35) box(windows,.035,1.1,1.75,side*1.444,2.25,z);
    for(const z of [-6.4,6.4]) {box(detail,.22,.38,1.4,side*1.1,.28,z,0x171b20);}
    box(lights,.2,.12,.025,side*.88,1.02,-9.73);
  }
  box(windows,2.3,1.15,.03,0,2.25,-9.72);box(windows,2.3,1.15,.03,0,2.25,9.72);
  for (const z of [-4.7,4.7]) box(detail,1.8,.45,2.4,0,3.6,z,0x8c989e);
  const doorB = [new GeoBuilder(true),new GeoBuilder(true)];
  for (const side of [-1,1]) for(const z of [-6.8,-2.2,2.2,6.8]) for(const leaf of [-1,1]) {
    const b=doorB[leaf===-1?0:1];
    box(b,.055,2.05,.65,side*1.47,1.85,z+leaf*.33,0xaebec4);
    box(b,.058,.85,.46,side*1.48,2.25,z+leaf*.33,0x314d5d);
    box(b,.06,1.95,.025,side*1.49,1.85,z,0xe1b339);
  }
  const geometries=[base.build(),windows.build(),detail.build(),lights.build(),...doorB.map(b=>b.build())];
  geometries.forEach(g=>{g.userData.shared=true;});
  const services: {al:Alignment;timetable:MetroTimetable;direction:number;offset:number;cars:{g:THREE.Group;doors:THREE.Mesh[]}[];container:THREE.Group}[]=[];
  for (const al of alignments) {
    const length=polyLength(al.samples); if(length<120) continue;
    for(const direction of [1,-1]) {
      const stops=al.stations.map(s=>direction===1?s:length-s);
      const timetable=new MetroTimetable(length,stops);
      const count=Math.max(1,Math.ceil((timetable.duration+24)/150));
      for(let k=0;k<count;k++) {
        const container=new THREE.Group();container.name=`metro-${direction===1?'outbound':'inbound'}-${k}`;
        const cars:{g:THREE.Group;doors:THREE.Mesh[]}[]=[];
        for(let c=0;c<3;c++) {
          const g=new THREE.Group();g.name=`coach-${c+1}`;
          const mats=[silver,glass,dark,lamp,silver,silver]; const doors:THREE.Mesh[]=[];
          geometries.forEach((geo,i)=>{const mesh=new THREE.Mesh(geo,mats[i]);mesh.castShadow=quality==='high';g.add(mesh);if(i>=4)doors.push(mesh);});
          cars.push({g,doors});container.add(g);
        }
        root.add(container);services.push({al,timetable,direction,offset:k*150+(direction===1?0:75),cars,container});
      }
    }
  }
  root.userData.update=(time:number,target:THREE.Vector3)=>{
    let sound=0;
    for(const service of services) {
      const {al,timetable,direction,cars,container}=service;
      const cycle=Math.ceil((timetable.duration+24)/150)*150;
      const elapsed=((time+service.offset)%cycle+cycle)%cycle;
      if(elapsed>timetable.duration){container.visible=false;continue;}
      const run=timetable.sample(elapsed);
      const centerS=direction===1?run.distance:timetable.length-run.distance;
      const center=sampleAt(al.samples,centerS);
      const distance=Math.hypot(center.x-target.x,center.z-target.z,center.y-target.y),falloff=Math.max(0,1-distance/180);
      sound=Math.max(sound,falloff*falloff*(run.dwelling?.08:Math.min(1,run.speed/18)));
      container.visible=Math.hypot(center.x-target.x,center.z-target.z)<(quality==='low'?700:1400);
      if(!container.visible)continue;
      const open=run.dwelling ? Math.min(1,run.dwellProgress*8,(1-run.dwellProgress)*8) : 0;
      cars.forEach(({g,doors},i)=>{
        const s=centerS-direction*(i-1)*20.1;
        g.visible=s>10&&s<timetable.length-10;
        const p=sampleAt(al.samples,Math.max(0,Math.min(timetable.length,s)));
        const yaw=Math.atan2(-p.tx*direction,-p.tz*direction);
        const track=direction*trackOffsetM;
        g.position.set(p.x-p.tz*track,p.y+.25,p.z+p.tx*track);g.rotation.y=yaw;
        doors[0].position.z=-open*.66;doors[1].position.z=open*.66;
      });
    }
    root.userData.nearbySound=sound;
  };
  root.userData.dispose=()=>{geometries.forEach(g=>g.dispose());[silver,glass,dark,lamp].forEach(m=>m.dispose());};
  return root;
}

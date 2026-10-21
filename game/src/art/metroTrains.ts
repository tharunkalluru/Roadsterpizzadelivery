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
  type TrainRig = { container: THREE.Group; cars: { g: THREE.Group; doors: THREE.Mesh[] }[] };
  type Service = { al: Alignment; timetable: MetroTimetable; direction: number; offset: number; name: string; rig: TrainRig | null; centerS: number; open: number };
  const services: Service[] = [];
  // Timetables cover the full network; only visible services need scene objects.
  // A small detached reserve avoids churn when trains cross the visibility boundary.
  const pool: TrainRig[] = [];
  const visible: Service[] = [];
  const MAX_POOLED_TRAINS = 4;
  const stats = { services: 0, active: 0, pooled: 0, created: 0 };
  root.userData.trainStats = stats;
  let disposed = false;
  const createRig = (): TrainRig => {
    const container = new THREE.Group();
    const cars: TrainRig['cars'] = [];
    const mats = [silver, glass, dark, lamp, silver, silver];
    for (let c = 0; c < 3; c++) {
      const g = new THREE.Group(); g.name = `coach-${c + 1}`;
      const doors: THREE.Mesh[] = [];
      geometries.forEach((geo, i) => {
        const mesh = new THREE.Mesh(geo, mats[i]); mesh.castShadow = quality === 'high';
        // Rigid coach parts keep a constant local matrix, but their world matrix
        // must still follow the coach. Sliding doors retain automatic updates.
        if (i < 4) { mesh.updateMatrix(); mesh.matrixAutoUpdate = false; }
        g.add(mesh); if (i >= 4) doors.push(mesh);
      });
      cars.push({ g, doors }); container.add(g);
    }
    stats.created++;
    return { container, cars };
  };
  const release = (service: Service): void => {
    if (!service.rig) return;
    root.remove(service.rig.container);
    if (pool.length < MAX_POOLED_TRAINS) pool.push(service.rig);
    service.rig = null;
  };
  for (const al of alignments) {
    const length = polyLength(al.samples); if (length < 120) continue;
    for (const direction of [1, -1]) {
      const stops = al.stations.map(s => direction === 1 ? s : length - s);
      const timetable = new MetroTimetable(length, stops);
      const count = Math.max(1, Math.ceil((timetable.duration + 24) / 150));
      for (let k = 0; k < count; k++) services.push({
        al, timetable, direction, offset: k * 150 + (direction === 1 ? 0 : 75),
        name: `metro-${direction === 1 ? 'outbound' : 'inbound'}-${k}`,
        rig: null, centerS: 0, open: 0,
      });
    }
  }
  stats.services = services.length;
  root.userData.update = (time: number, target: THREE.Vector3) => {
    if (disposed) return;
    let sound = 0;
    visible.length = 0;
    // Release all out-of-range rigs before acquiring replacements. A camera jump
    // reuses the old set instead of temporarily allocating another full set.
    for (const service of services) {
      const { al, timetable, direction } = service;
      const cycle = Math.ceil((timetable.duration + 24) / 150) * 150;
      const elapsed = ((time + service.offset) % cycle + cycle) % cycle;
      if (elapsed > timetable.duration) { release(service); continue; }
      const run = timetable.sample(elapsed);
      const centerS = direction === 1 ? run.distance : timetable.length - run.distance;
      const center = sampleAt(al.samples, centerS);
      const distance = Math.hypot(center.x - target.x, center.z - target.z, center.y - target.y);
      const falloff = Math.max(0, 1 - distance / 180);
      sound = Math.max(sound, falloff * falloff * (run.dwelling ? .08 : Math.min(1, run.speed / 18)));
      if (Math.hypot(center.x - target.x, center.z - target.z) >= (quality === 'low' ? 700 : 1400)) {
        release(service); continue;
      }
      service.centerS = centerS;
      service.open = run.dwelling ? Math.min(1, run.dwellProgress * 8, (1 - run.dwellProgress) * 8) : 0;
      visible.push(service);
    }
    for (const service of visible) {
      const { al, timetable, direction, centerS, open } = service;
      const rig = service.rig ?? (service.rig = pool.pop() ?? createRig());
      rig.container.name = service.name;
      for (let i = 0; i < rig.cars.length; i++) {
        const { g, doors } = rig.cars[i];
        const s = centerS - direction * (i - 1) * 20.1;
        g.visible = s > 10 && s < timetable.length - 10;
        const p = sampleAt(al.samples, Math.max(0, Math.min(timetable.length, s)));
        const yaw = Math.atan2(-p.tx * direction, -p.tz * direction);
        const track = direction * trackOffsetM;
        g.position.set(p.x - p.tz * track, p.y + .25, p.z + p.tx * track); g.rotation.y = yaw;
        doors[0].position.z = -open * .66; doors[1].position.z = open * .66;
      }
      // Complete every reused pose before attachment and the next render.
      if (rig.container.parent !== root) root.add(rig.container);
    }
    stats.active = visible.length; stats.pooled = pool.length;
    root.userData.nearbySound = sound;
  };
  root.userData.dispose = () => {
    if (disposed) return; disposed = true;
    root.clear(); pool.length = 0; visible.length = 0;
    for (const service of services) service.rig = null;
    services.length = 0;
    stats.active = 0; stats.pooled = 0; root.userData.nearbySound = 0;
    geometries.forEach(g => g.dispose()); [silver, glass, dark, lamp].forEach(m => m.dispose());
  };
  return root;
}

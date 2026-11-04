import * as THREE from 'three';
import { metroTrain } from '../world/vehicles';
import { metroCorridors, projectMetroPath, sampleMetroPath, metroPlatformAssemblies, metroTrackDeckHeight, metroTrackDeckGrade, METRO_DOOR_SIDE_OFFSET, MetroPath, MetroTrack, MetroCorridor, MetroLineInput, type MetroPlatformAssembly } from '../world/metro-geometry';
import type { XZ } from '../world/types';
import { MovingRailFrames, type MovingRailShape, type MovingRailBody } from './moving-rail';
import { metroServiceForRun, type MetroStationSource, type MetroService } from '../world/metro-service';
import { MetroTrainDisplays } from './metro-display';

interface Run {
  corridor: MetroCorridor; track: MetroTrack; path: MetroPath; dir: 1 | -1;
  min: number; max: number; stops: number[]; peer: Run;
  stationStops: { s: number; source: MetroStationSource; id: string; platform:MetroPlatformAssembly }[];
}
interface Train { id: string; run: Run; s: number; v: number; dwell: number; next: number; terminal: boolean; mesh: THREE.Group | null }
interface CoachGeometry { body: THREE.BufferGeometry; lights: THREE.BufferGeometry }
const VMAX = 22, ACC = 1, BRAKE = 1.5, DWELL = 18, NEAR = 1300;
export const METRO_TRAIN_LENGTH = 69, METRO_HEADWAY_GAP = 28;
export interface MetroStationDwell {
  trainId: string; stationId: string; lineId: string; direction: 1 | -1; platformSide: 1 | -1;
  elapsed: number; remaining: number; doors: { x: number; z: number; y: number; hx: number; hz: number }[];
  /** Exact rendered pad geometry; immutable source references, not a replacement platform. */
  platform?:MetroPlatformAssembly;
}
const COACH_SPACING = 22.1, FRONT = (METRO_TRAIN_LENGTH - COACH_SPACING * 2) / 2, END_CLEARANCE = 5;

// Split the existing three-coach model at its coach centres, retaining its cabs, colours and lights.
// Each coach can then follow the same curved rail geometry instead of rotating the entire rake at once.
function coachGeometries(source: THREE.BufferGeometry) {
  const attrs = ['position', 'normal', 'uv', 'color'];
  const parts = Array.from({ length: 3 }, () => Object.fromEntries(attrs.map((name) => [name, [] as number[]])));
  const pos = source.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const coach = Math.max(0, Math.min(2, Math.round(z / COACH_SPACING)));
    for (const name of attrs) {
      const attr = source.getAttribute(name), values = parts[coach][name];
      for (let j = i; j < i + 3; j++) for (let c = 0; c < attr.itemSize; c++)
        values.push(attr.array[j * attr.itemSize + c] - (name === 'position' && c === 2 ? coach * COACH_SPACING : 0));
    }
  }
  source.dispose();
  return parts.map((part) => {
    const geometry = new THREE.BufferGeometry();
    for (const name of attrs) geometry.setAttribute(name, new THREE.Float32BufferAttribute(part[name], name === 'uv' ? 2 : 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  });
}

export class MetroTrains {
  group = new THREE.Group(); trains: Train[] = []; runs: Run[] = []; pool: THREE.Group[] = [];
  geo: { coaches: CoachGeometry[]; length: number } | null = null;
  dh: number;
  private frames = new MovingRailFrames();
  private displays = new MetroTrainDisplays();
  stationDwells: MetroStationDwell[] = [];
  get bodies() { return this.frames.bodies; }
  private storyBoardable(train:Train){
    return !train.terminal&&train.run.stationStops.some(stop=>(stop.s-train.s)*train.run.dir>60);
  }
  private coachShape(train:Train,k:number):MovingRailShape{
    const run=train.run,s=train.s-run.dir*(FRONT+k*COACH_SPACING),p=sampleMetroPath(run.path,s,8);
    const y=metroTrackDeckHeight(run.corridor,run.path,s,this.dh)+.95,grade=metroTrackDeckGrade(run.corridor,run.path,s,this.dh)*run.dir;
    return{id:`${train.id}:${k}`,x:p.x,y,z:p.z,hx:p.hx*run.dir,hz:p.hz*run.dir,
      halfWidth:1.5,halfLength:k===1?10.75:12.2,bottom:y+.15,roof:y+3.775,grade,roofGroup:train.id,roofIndex:k};
  }
  /** Story navigation observes the existing global service, including trains
   * beyond mesh streaming distance. Virtual poses are never landing supports.
   * A watched terminal service is ineligible because it cannot depart on-screen. */
  storyBoardingBody(preferredCoachId:string,x:number,z:number):MovingRailBody|null{
    if(!Number.isFinite(x)||!Number.isFinite(z))return null;
    const body=(train:Train,index:number):MovingRailBody=>{
      const live=this.bodies.find(coach=>coach.id===`${train.id}:${index}`);if(live)return live;
      const shape=this.coachShape(train,index);return{...shape,previous:{x:shape.x,y:shape.y,z:shape.z,hx:shape.hx,hz:shape.hz,grade:shape.grade}};
    };
    const split=preferredCoachId.lastIndexOf(':'),preferred=this.trains.find(train=>train.id===preferredCoachId.slice(0,split)),index=Number(preferredCoachId.slice(split+1));
    if(preferred&&Number.isInteger(index)&&index>=0&&index<3&&this.storyBoardable(preferred))return body(preferred,index);
    let nearest:MovingRailBody|null=null,distance=Infinity;
    for(const train of this.trains){if(!this.storyBoardable(train))continue;for(let k=0;k<3;k++){
      const candidate=body(train,k),d=Math.hypot(candidate.x-x,candidate.z-z);if(d<distance){distance=d;nearest=candidate;}
    }}
    return nearest;
  }
  constructor(public metro: { lines: MetroLineInput[]; stations: MetroStationSource[]; deckHeight: number }, public mats: { body: THREE.Material; lights: THREE.Material }) {
    this.dh = metro.deckHeight || 11;
    const corridors = metroCorridors(metro.lines), platforms = metroPlatformAssemblies(metro.stations, corridors, this.dh);
    for (const corridor of corridors) {
      if (corridor.center.len < 400) continue;
      const pair = corridor.tracks.map((track): Run => {
        const dir = track.dir, path = track.path;
        // s is the leading nose. Keep all three coaches within the finite track.
        let min = dir > 0 ? METRO_TRAIN_LENGTH + END_CLEARANCE : END_CLEARANCE;
        let max = dir > 0 ? path.len - END_CLEARANCE : path.len - METRO_TRAIN_LENGTH - END_CLEARANCE;
        // The retained legacy Green shape continues beyond its actual nine-
        // station service. Bound trains to the verified JBS/MGBS assemblies;
        // keep the raw extension as source evidence without serving a ghost stop.
        if (corridor.lineId === 'green') {
          const termini = platforms.filter(p => p.corridor === corridor && ['st_parade_grounds', 'st_mahatma_gandhi_bus_station'].includes(p.stationId));
          if (termini.length === 2) { const ends = termini.map(p => projectMetroPath(path, [p.frame.cx, p.frame.cz]).s + dir * METRO_TRAIN_LENGTH / 2).sort((a, b) => a - b); min = Math.max(min, ends[0]); max = Math.min(max, ends[1]); }
        }
        const stops = [min, max];
        const stationStops: Run['stationStops'] = [];
        for (const platform of platforms) {
          if (platform.corridor !== corridor) continue;
          const station = platform.source, projection = projectMetroPath(path, [platform.frame.cx, platform.frame.cz]);
          if (projection.d < 60) {
            const s = Math.max(min, Math.min(max, projection.s + dir * METRO_TRAIN_LENGTH / 2)); stops.push(s);
            stationStops.push({ s, source: station, id: platform.stationId, platform });
          }
        }
        stops.sort((a, b) => a - b);
        return { corridor, track, path, dir, min, max, stops: stops.filter((s, i) => !i || s - stops[i - 1] > 2), stationStops, peer: null! };
      });
      pair[0].peer = pair[1]; pair[1].peer = pair[0]; this.runs.push(...pair);
      for (const run of pair) {
        const n = Math.max(1, Math.round(run.path.len / 2400));
        for (let k = 0; k < n; k++) {
          const s = run.min + (k + (run.dir > 0 ? 0.25 : 0.75)) / n * (run.max - run.min);
          this.trains.push({ id: `metro:${run.track.id}:${k}`, run, s, v: 0, dwell: 0, next: this.nextStop(run, s), terminal: false, mesh: null });
        }
      }
    }
  }
  nextStop(run: Run, s: number) {
    if (run.dir > 0) { for (const stop of run.stops) if (stop > s + 0.2) return stop; return run.max; }
    for (let i = run.stops.length - 1; i >= 0; i--) if (run.stops[i] < s - 0.2) return run.stops[i];
    return run.min;
  }
  at(run: Run, s: number) { return sampleMetroPath(run.path, s); }
  serviceForRun(run: Run) { return metroServiceForRun(run.corridor, run.dir, this.metro.stations); }
  private releaseMesh(train: Train) {
    if (train.mesh) { this.group.remove(train.mesh); this.pool.push(train.mesh); train.mesh = null; }
  }
  mesh() {
    if (!this.geo) {
      const model = metroTrain(3), body = coachGeometries(model.body.geometry()), lights = coachGeometries(model.lights.geometry());
      this.geo = { coaches: body.map((geometry, i) => ({ body: geometry, lights: lights[i] })), length: METRO_TRAIN_LENGTH };
    }
    const group = this.pool.pop() || (() => {
      const root = new THREE.Group();
      for (const geometry of this.geo!.coaches) {
        const coach = new THREE.Group(), body = new THREE.Mesh(geometry.body, this.mats.body);
        body.castShadow = true; coach.add(body, new THREE.Mesh(geometry.lights, this.mats.lights)); root.add(coach);
      }
      return root;
    })();
    this.group.add(group); return group;
  }
  private turnback(train: Train, px: number, pz: number) {
    const peer = train.run.peer, entry = peer.dir > 0 ? peer.min : peer.max;
    const before = this.at(train.run, train.s - train.run.dir * METRO_TRAIN_LENGTH / 2);
    const after = this.at(peer, entry - peer.dir * METRO_TRAIN_LENGTH / 2);
    // The source has no verified crossover geometry. Never invent an on-screen lateral jump or reverse in a live track.
    // A watched terminal train waits; its opposite-direction service resumes only outside the visible area.
    if (Math.hypot(before.x - px, before.z - pz) < NEAR + 100 || Math.hypot(after.x - px, after.z - pz) < NEAR + 100) return;
    if (this.trains.some((other) => other !== train && other.run === peer && Math.abs(other.s - entry) < METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP)) return;
    this.releaseMesh(train);
    train.run = peer; train.s = entry; train.v = 0; train.terminal = false; train.next = this.nextStop(peer, entry);
  }
  update(dt: number, px: number, pz: number) {
    dt = Math.max(0, Math.min(0.1, dt));
    for (const train of this.trains) if (train.terminal) {
      train.dwell = Math.max(0, train.dwell - dt);
      if (!train.dwell) this.turnback(train, px, pz);
    }
    for (const run of this.runs) {
      // Leading trains update first; followers cannot overtake or enter an occupied platform.
      const queue = this.trains.filter((train) => train.run === run).sort((a, b) => (b.s - a.s) * run.dir);
      let leader: Train | null = null;
      for (const train of queue) {
        if (!train.terminal) {
          if (train.dwell > 0) {
            train.dwell = Math.max(0, train.dwell - dt);
            if (!train.dwell) train.next = this.nextStop(run, train.s);
          } else {
            const stationDistance = Math.max(0, (train.next - train.s) * run.dir);
            const clearDistance = leader ? Math.max(0, (leader.s - train.s) * run.dir - METRO_TRAIN_LENGTH - METRO_HEADWAY_GAP) : Infinity;
            const brakingDistance = Math.min(stationDistance, clearDistance);
            const want = Math.min(VMAX, Math.sqrt(2 * BRAKE * Math.max(0, brakingDistance - 0.1)));
            train.v += Math.max(-BRAKE * dt, Math.min(ACC * dt, want - train.v));
            const step = Math.min(stationDistance, clearDistance, Math.max(0, train.v) * dt);
            train.s += run.dir * step;
            if (step < train.v * dt) train.v = dt ? step / dt : 0;
            if (stationDistance - step < 0.15 && stationDistance <= clearDistance) {
              train.s = train.next; train.v = 0; train.dwell = DWELL;
              train.terminal = Math.abs(train.s - (run.dir > 0 ? run.max : run.min)) < 0.2;
            }
          }
        }
        leader = train;
      }
    }
    const bodies: MovingRailShape[] = [], visibleServices: MetroService[] = []; this.stationDwells = [];
    for (const train of this.trains) {
      const run = train.run, center = this.at(run, train.s - run.dir * METRO_TRAIN_LENGTH / 2);
      const near = Math.hypot(center.x - px, center.z - pz) < NEAR;
      if (near && !train.mesh) train.mesh = this.mesh();
      if (!near) this.releaseMesh(train);
      const centerHeight = metroTrackDeckHeight(run.corridor, run.path, train.s - run.dir * METRO_TRAIN_LENGTH / 2, this.dh);
      if (train.mesh) train.mesh.position.set(center.x, centerHeight + 0.95, center.z);
      if (train.mesh) {
        const service = this.serviceForRun(run); this.displays.assign(train.mesh, service);
        if (service && !visibleServices.some(s => s.lineId === service.lineId && s.text === service.text)) visibleServices.push(service);
      }
      const stopped = near && train.v < .05 && train.dwell > 0 ? run.stationStops.find(stop => Math.abs(stop.s - train.s) < .25) : undefined;
      const dwell: MetroStationDwell | null = stopped ? { trainId: train.id, stationId: stopped.id, lineId: run.corridor.lineId, direction: run.dir,
        platformSide: -run.dir as 1 | -1, elapsed: Math.max(0, DWELL - train.dwell), remaining: train.dwell, doors: [], platform:stopped.platform } : null;
      for (let k = 0; k < 3; k++) {
        const shape=this.coachShape(train,k),y=shape.y,grade=shape.grade??0;
        if (near) bodies.push(shape);
        if (train.mesh) {
          const coach = train.mesh.children[k];
          coach.position.set(shape.x - center.x, y - centerHeight - .95, shape.z - center.z);
          // The existing model's cab faces local -z.
          coach.rotation.set(Math.atan(grade), Math.atan2(-shape.hx, -shape.hz), 0, 'YXZ');
        }
        if (dwell) for (const offset of [-6.5, 0, 6.5]) {
          const door = sampleMetroPath(run.path, train.s - run.dir * (FRONT + k * COACH_SPACING + offset), 8), side = dwell.platformSide;
          const doorS = train.s - run.dir * (FRONT + k * COACH_SPACING + offset);
          dwell.doors.push({ x: door.x - door.hz * side * METRO_DOOR_SIDE_OFFSET, z: door.z + door.hx * side * METRO_DOOR_SIDE_OFFSET, y: metroTrackDeckHeight(run.corridor, run.path, doorS, this.dh) + 1.2, hx: door.hx, hz: door.hz });
        }
      }
      if (dwell) this.stationDwells.push(dwell);
      if (train.mesh) this.displays.setDoors(train.mesh, dwell ? dwell.platformSide * run.dir : null,
        dwell ? Math.min(1, dwell.elapsed / .8, dwell.remaining / .8) : 0);
    }
    this.displays.update(dt, visibleServices);
    this.frames.set(bodies);
  }
}

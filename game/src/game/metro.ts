import * as THREE from 'three';
import { metroTrain } from '../world/vehicles';
import { metroCorridors, projectMetroPath, sampleMetroPath, MetroPath, MetroTrack, MetroCorridor, MetroLineInput } from '../world/metro-geometry';
import type { XZ } from '../world/types';

interface Run {
  corridor: MetroCorridor; track: MetroTrack; path: MetroPath; dir: 1 | -1;
  min: number; max: number; stops: number[]; peer: Run;
}
interface Train { run: Run; s: number; v: number; dwell: number; next: number; terminal: boolean; mesh: THREE.Group | null }
interface CoachGeometry { body: THREE.BufferGeometry; lights: THREE.BufferGeometry }
const VMAX = 22, ACC = 1, BRAKE = 1.5, DWELL = 18, NEAR = 1300;
export const METRO_TRAIN_LENGTH = 69, METRO_HEADWAY_GAP = 28;
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
  constructor(metro: { lines: MetroLineInput[]; stations: { p: XZ; lines?: string[] }[]; deckHeight: number }, public mats: { body: THREE.Material; lights: THREE.Material }) {
    this.dh = metro.deckHeight || 11;
    for (const corridor of metroCorridors(metro.lines)) {
      if (corridor.center.len < 400) continue;
      const pair = corridor.tracks.map((track): Run => {
        const dir = track.dir, path = track.path;
        // s is the leading nose. Keep all three coaches within the finite track.
        const min = dir > 0 ? METRO_TRAIN_LENGTH + END_CLEARANCE : END_CLEARANCE;
        const max = dir > 0 ? path.len - END_CLEARANCE : path.len - METRO_TRAIN_LENGTH - END_CLEARANCE;
        const stops = [min, max];
        for (const station of metro.stations) {
          if (station.lines?.length && !station.lines.includes(corridor.lineId)) continue;
          const projection = projectMetroPath(path, station.p);
          if (projection.d < 60) stops.push(Math.max(min, Math.min(max, projection.s + dir * METRO_TRAIN_LENGTH / 2)));
        }
        stops.sort((a, b) => a - b);
        return { corridor, track, path, dir, min, max, stops: stops.filter((s, i) => !i || s - stops[i - 1] > 2), peer: null! };
      });
      pair[0].peer = pair[1]; pair[1].peer = pair[0]; this.runs.push(...pair);
      for (const run of pair) {
        const n = Math.max(1, Math.round(run.path.len / 2400));
        for (let k = 0; k < n; k++) {
          const s = run.min + (k + (run.dir > 0 ? 0.25 : 0.75)) / n * (run.max - run.min);
          this.trains.push({ run, s, v: 0, dwell: 0, next: this.nextStop(run, s), terminal: false, mesh: null });
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
    for (const train of this.trains) {
      const run = train.run, center = this.at(run, train.s - run.dir * METRO_TRAIN_LENGTH / 2);
      const near = Math.hypot(center.x - px, center.z - pz) < NEAR;
      if (near && !train.mesh) train.mesh = this.mesh();
      if (!near) this.releaseMesh(train);
      if (train.mesh) {
        train.mesh.position.set(center.x, this.dh + 0.95, center.z);
        for (let k = 0; k < 3; k++) {
          const p = sampleMetroPath(run.path, train.s - run.dir * (FRONT + k * COACH_SPACING), 8);
          const coach = train.mesh.children[k];
          coach.position.set(p.x - center.x, 0, p.z - center.z);
          // The existing model's cab faces local -z.
          coach.rotation.set(0, Math.atan2(-p.hx * run.dir, -p.hz * run.dir), 0);
        }
      }
    }
  }
}

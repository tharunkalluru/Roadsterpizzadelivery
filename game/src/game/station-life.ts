import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, hash, rng } from '../core/util';
import { metroCorridors, metroPlatformAssemblies, sampleMetroPath, projectMetroPath, type MetroLineInput } from '../world/metro-geometry';
import { metroCrowdDemand, STATION_CROWD_MODEL, type MetroStationSource } from '../world/metro-service';
import { randomPerson, walkerGeometry, type PersonSpec } from '../world/people';
import type { StationVisualFrame } from '../world/metro-station-visuals';
import type { MetroStationDwell } from './metro';

type Door = MetroStationDwell['doors'][number];
interface Actor { group: THREE.Group; legs: THREE.Mesh[]; phase: number }
interface ResolvedStation { id: string; stationId: string; frame: StationVisualFrame; lineId: string; source: MetroStationSource; deckHeight: number }
interface Transfer { kind: 'boarding' | 'alighting'; door: Door; index: number; actor: Actor }
interface LiveStation { source: ResolvedStation; group: THREE.Group; waiting: { actor: Actor; side: 1 | -1; index: number }[]; transfers: Map<string, Transfer[]>; waitingBatch: THREE.Mesh | null; waitingCount: number }
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const point = (frame: StationVisualFrame, u: number, v: number) => { if (frame.path && frame.s !== undefined) { const p = sampleMetroPath(frame.path, frame.s + u); return { x: p.x - p.hz * v, z: p.z + p.hx * v }; } return { x: frame.cx + frame.hx * u - frame.hz * v, z: frame.cz + frame.hz * u + frame.hx * v }; };

// Analytic movement follows actual stopped-train doors. No station timetable or
// random free-running boarding loop can send people into a moving train.
export function stationPassengerPose(frame: StationVisualFrame, door: Door, side: 1 | -1, kind: 'boarding' | 'alighting', index: number, elapsed: number) {
  const dx = door.x - frame.cx, dz = door.z - frame.cz, projected = frame.path && frame.s !== undefined ? projectMetroPath(frame.path, [door.x, door.z]) : null;
  const u = projected ? projected.s - frame.s! : dx * frame.hx + dz * frame.hz, v = projected ? -(door.x - projected.x) * projected.hz + (door.z - projected.z) * projected.hx : -dx * frame.hz + dz * frame.hx;
  const waitV = side * (5.65 + index % 2 * .25), insideV = v - side * .6;
  let aU: number, aV: number, bU: number, bV: number, progress: number, visible: boolean;
  if (kind === 'boarding') {
    const start = 6 + index * .4; progress = clamp((elapsed - start) / 4.2);
    aU = u + (index % 3 - 1) * 1.15; aV = waitV; bU = u; bV = insideV; visible = elapsed < start + 4.2;
  } else {
    const start = .5 + index * .28, t = elapsed - start; visible = t >= 0 && t < 12;
    if (t < 3) { progress = clamp(t / 3); aU = u; aV = insideV; bU = u + (index % 2 ? .5 : -.5); bV = waitV; }
    else { progress = clamp((t - 3) / 9); aU = u + (index % 2 ? .5 : -.5); aV = waitV; bU = clamp(u + (u >= 0 ? 9 : -9), -57, 57); bV = side * 6.1; }
  }
  const p = point(frame, aU + (bU - aU) * progress, aV + (bV - aV) * progress), a = point(frame, aU, aV), b = point(frame, bU, bV);
  return { ...p, y: door.y, yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), moving: progress > 0 && progress < 1, visible };
}

export class MetroStationLife {
  group = new THREE.Group();
  readonly densityModel = STATION_CROWD_MODEL;
  readonly stations: ResolvedStation[] = [];
  readonly unmodeledServices: { stationId: string; modeledLineId: string; lineId: string; directions: readonly [1, -1]; reason: string }[] = [];
  readonly active = new Map<string, LiveStation>();
  private seconds = 0;
  private lowQ: boolean;
  private figures = new Map<string, ReturnType<typeof walkerGeometry>>();
  private seatedLegs = new Map<string, THREE.BufferGeometry>();
  constructor(metro: { lines: MetroLineInput[]; stations: MetroStationSource[]; deckHeight: number }, private material: THREE.Material, private options: { lowQ?: boolean; isStationLoaded?: (station: MetroStationSource) => boolean } = {}) {
    this.lowQ = !!options.lowQ; this.deckHeight = metro.deckHeight || 11;
    const corridors = metroCorridors(metro.lines);
    for (const a of metroPlatformAssemblies(metro.stations, corridors, this.deckHeight))
      this.stations.push({ id: a.key, stationId: a.stationId, frame: a.frame, lineId: a.lineId, source: a.source, deckHeight: a.deckHeight });
    this.group.name = 'Metro station passengers · heuristic simulation';
  }
  private deckHeight: number;
  private actor(seed: string, seated = false): Actor {
    const index = hash(seed) % 24, random = rng(hash(seed)), original = randomPerson(rng(index + 3049));
    const spec: PersonSpec = seated ? { ...original, kind: hash(seed) % 2 ? 'shirt' : 'western_f', s: .98 } : original;
    const key = `${index}:${seated ? spec.kind : 'standing'}`;
    let geometry = this.figures.get(key); if (!geometry) { geometry = walkerGeometry(spec); this.figures.set(key, geometry); }
    const group = new THREE.Group(), body = new THREE.Mesh(geometry.body, this.material), legs: THREE.Mesh[] = [];
    body.castShadow = true; group.add(body);
    if (seated) {
      body.position.y = -.34;
      let lowerGeometry = this.seatedLegs.get(spec.b);
      if (!lowerGeometry) {
        const lower = new Batch();
        for (const side of [-1, 1]) {
          lower.box(side * .085, .49, -.17, .13, .13, .4, spec.b);
          lower.box(side * .085, .25, -.35, .12, .46, .12, spec.b);
          lower.box(side * .085, .035, -.42, .14, .07, .23, '#312c2a');
        }
        lowerGeometry = lower.geometry(); this.seatedLegs.set(spec.b, lowerGeometry);
      }
      const mesh = new THREE.Mesh(lowerGeometry, this.material); mesh.castShadow = true; group.add(mesh);
    } else if (geometry.leg) {
      for (const side of [-1, 1]) { const leg = new THREE.Mesh(geometry.leg, this.material); leg.position.set(side * .085, .84, 0); leg.castShadow = true; group.add(leg); legs.push(leg); }
    }
    group.scale.setScalar(spec.s); return { group, legs, phase: random() * Math.PI * 2 };
  }
  private create(station: ResolvedStation) {
    const state: LiveStation = { source: station, group: new THREE.Group(), waiting: [], transfers: new Map(), waitingBatch: null, waitingCount: -1 };
    const maximum = this.lowQ ? 8 : 12;
    for (const side of [-1, 1] as const) for (let index = 0; index < maximum; index++) {
      const seated = index < 4, actor = this.actor(`${station.id}:wait:${side}:${index}`, seated);
      const u = seated ? (index < 2 ? -32 : 32) + (index % 2 ? .8 : -.8) : -48 + (index - 4) * 12;
      const v = side * (seated ? 6.6 : 5.45 + index % 2 * .25), p = point(station.frame, u, v);
      actor.group.position.set(p.x, station.deckHeight + 1.2, p.z);
      actor.group.rotation.y = Math.atan2(-side * station.frame.hz, side * station.frame.hx);
      state.waiting.push({ actor, side, index });
    }
    this.group.add(state.group); this.active.set(station.id, state); return state;
  }
  update(dt: number, minutes: number, dwellFrames: readonly MetroStationDwell[] | undefined, px: number, pz: number) {
    this.seconds += Math.max(0, dt);
    const demand = metroCrowdDemand(minutes, this.lowQ), dwells = dwellFrames || [];
    const nearby = this.stations.filter(s => Math.hypot(s.frame.cx - px, s.frame.cz - pz) < 300 && (!this.options.isStationLoaded || this.options.isStationLoaded(s.source)))
      .sort((a, b) => Math.hypot(a.frame.cx - px, a.frame.cz - pz) - Math.hypot(b.frame.cx - px, b.frame.cz - pz)).slice(0, this.lowQ ? 2 : 3);
    const wanted = new Set(nearby.map(s => s.id));
    for (const [id, state] of this.active) if (!wanted.has(id)) { this.group.remove(state.group); state.waitingBatch?.geometry.dispose(); this.active.delete(id); }
    for (const source of nearby) {
      const state = this.active.get(source.id) || this.create(source);
      const stopped = dwells.filter(d => d.stationId === source.stationId && d.lineId === source.lineId && d.remaining > .05 && d.doors.length > 0);
      const activeKeys = new Set(stopped.map(d => d.trainId));
      for (const [key, passengers] of state.transfers) if (!activeKeys.has(key)) {
        for (const passenger of passengers) state.group.remove(passenger.actor.group);
        state.transfers.delete(key);
      }
      for (const waiting of state.waiting) {
        waiting.actor.group.visible = waiting.index < demand.waitingPerSide;
        // Waiting figures are intentionally stationary, including seated people.
        for (const leg of waiting.actor.legs) leg.rotation.x = 0;
      }
      // Stationary crowds use one mesh per active station; only the small
      // boarding/alighting group needs individual animated draw calls.
      if (state.waitingCount !== demand.waitingPerSide) {
        if (state.waitingBatch) { state.group.remove(state.waitingBatch); state.waitingBatch.geometry.dispose(); }
        const pieces: THREE.BufferGeometry[] = [];
        for (const waiting of state.waiting) if (waiting.actor.group.visible) {
          waiting.actor.group.updateMatrixWorld(true);
          waiting.actor.group.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) pieces.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)); });
        }
        const geometry = pieces.length ? mergeGeometries(pieces, false) : null; for (const piece of pieces) piece.dispose();
        state.waitingBatch = geometry ? new THREE.Mesh(geometry, this.material) : null;
        if (state.waitingBatch) { state.waitingBatch.castShadow = true; state.waitingBatch.name = 'Stationary waiting passengers'; state.group.add(state.waitingBatch); }
        state.waitingCount = demand.waitingPerSide;
      }
      for (const dwell of stopped) {
        let passengers = state.transfers.get(dwell.trainId);
        if (!passengers) {
          passengers = [];
          for (const kind of ['alighting', 'boarding'] as const) for (let index = 0; index < demand[kind]; index++) {
            const door = dwell.doors[index % dwell.doors.length], actor = this.actor(`${dwell.trainId}:${source.id}:${kind}:${index}`);
            state.group.add(actor.group); passengers.push({ kind, door, index, actor });
          }
          state.transfers.set(dwell.trainId, passengers);
        }
        for (const passenger of passengers) {
          const pose = stationPassengerPose(source.frame, passenger.door, dwell.platformSide, passenger.kind, passenger.index, dwell.elapsed);
          passenger.actor.group.visible = pose.visible;
          passenger.actor.group.position.set(pose.x, pose.y, pose.z); passenger.actor.group.rotation.y = pose.yaw;
          for (let k = 0; k < passenger.actor.legs.length; k++) passenger.actor.legs[k].rotation.x = pose.moving ? Math.sin(this.seconds * 7 + passenger.actor.phase + k * Math.PI) * .35 : 0;
        }
      }
    }
  }
}

import * as THREE from 'three';
import { Batch } from '../core/util';
import { buildRailwayRun, railwayPoint, projectRailwayRun, parallelRailwayRuns, sharedRailwayWay, RailwayFlow, railwaySweepsConflict, type RailwayTrack, type RailwayRun, type RailDirection } from './railway-flow';
import { MovingRailFrames, type MovingRailShape } from './moving-rail';
import type { RailwayCrossings, RailwayApproach } from './railway-crossings';

// Suburban and express trains on the railway lines around the player: a locomotive and a rake of coaches that
// follow the curves of the track, spawned a little way off and running through.
type Track = RailwayTrack;
type Run = RailwayRun;
interface Train { id: string; run: Run; s: number; dir: 1 | -1; v: number; cars: THREE.Mesh[] }
const CAR = 22.5, GAP = 0.9, MAXT = 2;

function coachGeo(kind: 'loco' | 'coach', livery: string) {
  const b = new Batch();
  if (kind === 'loco') {
    b.box(0, 2.25, 0, 3.05, 3.3, CAR - 4, '#c8352e'); b.box(0, 1.35, 0, 3.08, 0.5, CAR - 4, '#f2f2ee');
    b.box(0, 2.9, -(CAR - 4) / 2 - 0.4, 2.8, 1.2, 0.8, '#1c2533'); b.box(0, 4.3, 0, 0.3, 0.6, 3, '#55565c');
  } else {
    b.box(0, 2.3, 0, 3.1, 3.4, CAR, livery); b.box(0, 2.6, 0, 3.14, 0.9, CAR - 2, '#1c2533');
    b.box(0, 4.05, 0, 2.9, 0.25, CAR - 0.6, '#9a9aa2');
  }
  b.box(0, 0.45, 0, 2.4, 0.5, (kind === 'loco' ? CAR - 4 : CAR) - 2, '#2b2a30');
  return b.geometry();
}

export class RailTrains {
  group = new THREE.Group(); trains: Train[] = []; t = 0; geos: Record<string, THREE.BufferGeometry> = {};
  private nextTrain = 0; private frames = new MovingRailFrames();
  get bodies() { return this.frames.bodies; }
  private crossings?: RailwayCrossings;
  setCrossings(crossings: RailwayCrossings) { this.crossings = crossings; }
  get approaches(): RailwayApproach[] { return this.trains.map(t => ({ id: t.id, run: t.run, s: t.s, dir: t.dir, speed: t.v, length: t.cars.length * (CAR + GAP) })); }
  constructor(public mat: THREE.Material) {}
  geo(k: string) { return this.geos[k] || (this.geos[k] = k === 'loco' ? coachGeo('loco', '') : coachGeo('coach', k)); }
  private flow = new RailwayFlow();
  private runSnapshot: Map<string, Track> | null = null;
  private canonicalRuns: Run[] = [];
  // Both the physical mapped rails and the trains retain their source geometry.
  buildRun(rails: Map<string, Track>, start: Track): Run { return buildRailwayRun(rails, start); }
  private runsFor(rails: Map<string, Track>) {
    // Streamed track objects are immutable. A neighboring tile can replace a
    // way without changing the Map's size, so compare keys and object identity.
    if (this.runSnapshot && this.runSnapshot.size === rails.size &&
      [...rails].every(([id, track]) => this.runSnapshot!.get(id) === track)) return this.canonicalRuns;
    const runs: Run[] = [], used = new Set<string>();
    for (const [id, track] of rails) {
      if (track.pts.length < 2 || used.has(id)) continue;
      const run = this.buildRun(rails, track); runs.push(run);
      for (const way of run.ways) used.add(way.id);
    }
    this.runSnapshot = new Map(rails); this.canonicalRuns = runs;
    return runs;
  }
  private point(run: Run, s: number) {
    const p = railwayPoint(run, s); return { ...p, yaw: Math.atan2(p.hx, p.hz) };
  }
  at(run: Run, s: number) {
    const p = this.point(run, s), a = this.point(run, s - 7), b = this.point(run, s + 7);
    if (Math.hypot(b.x - a.x, b.z - a.z) > .01) { p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)); }
    return p;
  }
  private shapes(t: Pick<Train, 'id' | 'run' | 'dir' | 'cars'>, distance: number): MovingRailShape[] {
    const bodies: MovingRailShape[] = [];
    t.cars.forEach((_, k) => {
      const s = distance - t.dir * (k * (CAR + GAP) + CAR / 2);
      if (s < 0 || s > t.run.len) return;
      const p = this.at(t.run, s);
      bodies.push({ id: `${t.id}:${k}`, x: p.x, y: p.y, z: p.z,
        hx: Math.sin(p.yaw) * t.dir, hz: Math.cos(p.yaw) * t.dir, grade: Math.tan(p.pitch) * t.dir,
        halfWidth: 1.57, halfLength: k === 0 ? 10.05 : CAR / 2, bottom: p.y + .2, roof: p.y + (k === 0 ? 3.9 : 4.175),
        roofGroup: t.id, roofIndex: k });
    });
    return bodies;
  }
  private spawn(px: number, pz: number, rails: Map<string, Track>) {
    const nearby: { run: Run; distance: number; pair: number }[] = [];
    for (const run of this.runsFor(rails)) {
      const distance = projectRailwayRun(run, px, pz).d;
      if (run.len <= 700 || distance > 900 || this.trains.some(t => sharedRailwayWay(t.run, run))) continue;
      const pair = this.trains.reduce((score, t) => Math.max(score, parallelRailwayRuns(t.run, run)?.score || 0), 0);
      nearby.push({ run, distance, pair });
    }
    // When one train is present, fill its other mapped track first. No random
    // direction can send two rakes toward each other on a shared source way.
    nearby.sort((a, b) => b.pair - a.pair || a.distance - b.distance || a.run.ways[0].id.localeCompare(b.run.ways[0].id));
    for (const { run } of nearby) {
      let dir: RailDirection | null = this.flow.direction(run); if (!dir) continue;
      const partners = [...this.trains.map(t => t.run), ...nearby.map(t => t.run)]
        .map(other => ({ other, pair: parallelRailwayRuns(run, other) }))
        .filter(p => p.pair).sort((a, b) => b.pair!.score - a.pair!.score);
      if (partners.length) {
        let paired = false;
        for (const partner of partners) {
          const selected = this.flow.pair(run, partner.other);
          if (selected) { dir = selected; paired = true; break; }
        }
        if (!paired) continue;
      }
      if (!this.flow.reserve(run, dir)) continue;
      const ns = projectRailwayRun(run, px, pz).s;
      const n = 8 + Math.floor(Math.random() * 6);
      let s = Math.max(0, Math.min(run.len, ns - dir * 550));
      s = this.crossings?.safeSpawn(run, s, dir, n * (CAR + GAP)) ?? s;
      const id = `rail:${this.nextTrain}`, draft = { id, run, dir, cars: Array(n).fill(null) as THREE.Mesh[] };
      const shape = this.shapes(draft, s);
      if (this.trains.some(t => railwaySweepsConflict(shape, shape, this.shapes(t, t.s), this.shapes(t, t.s)))) continue;
      const livery = ['#2f5d9a', '#7b2d26', '#2f5d9a', '#3d6b4f'][Math.floor(Math.random() * 4)], cars: THREE.Mesh[] = [];
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(this.geo(k === 0 ? 'loco' : livery), this.mat); m.castShadow = true; this.group.add(m); cars.push(m); }
      this.trains.push({ id, run, dir, s, v: 12 + Math.random() * 8, cars }); this.nextTrain++; return;
    }
  }
  update(dt: number, px: number, pz: number, rails: Map<string, Track>) {
    this.t += dt;
    if (this.trains.length < MAXT && this.t > 6 && rails.size) { this.t = 0; this.spawn(px, pz, rails); }
    // At turnouts or genuinely crossing mapped lines, reserve the swept whole
    // rake before moving. Substeps bound rotation while priority lets one pass.
    const steps = Math.max(1, Math.ceil(dt / .05)), step = dt / steps;
    for (let i = 0; i < steps; i++) {
      const current = this.trains.map(t => this.shapes(t, t.s));
      const distances = this.trains.map(t => this.crossings?.trainAdvance(t.run, t.s, t.dir, t.v * step) ?? t.v * step);
      const next = this.trains.map((t, i) => this.shapes(t, t.s + t.dir * distances[i]));
      const advance = this.trains.map(() => true);
      for (let a = 0; a < this.trains.length; a++) for (let b = a + 1; b < this.trains.length; b++) {
        if (!railwaySweepsConflict(current[a], next[a], current[b], next[b])) continue;
        if (!railwaySweepsConflict(current[a], next[a], current[b], current[b])) advance[b] = false;
        else if (!railwaySweepsConflict(current[a], current[a], current[b], next[b])) advance[a] = false;
        else { advance[a] = false; advance[b] = false; }
      }
      this.trains.forEach((t, i) => { if (advance[i]) t.s += t.dir * distances[i]; });
    }
    const bodies: MovingRailShape[] = [];
    for (const t of [...this.trains]) {
      const head = this.at(t.run, t.s);
      const gone = t.dir > 0 ? t.s - t.cars.length * (CAR + GAP) > t.run.len : t.s + t.cars.length * (CAR + GAP) < 0;
      if (gone || Math.hypot(head.x - px, head.z - pz) > 2600) { for (const c of t.cars) this.group.remove(c); this.trains.splice(this.trains.indexOf(t), 1); continue; }
      t.cars.forEach((c, k) => {
        const s = t.s - t.dir * (k * (CAR + GAP) + CAR / 2);
        if (s < 0 || s > t.run.len) { c.visible = false; return; }
        const p = this.at(t.run, s); c.visible = true;
        c.position.set(p.x, p.y, p.z); c.rotation.set(t.dir * p.pitch, p.yaw + (t.dir > 0 ? Math.PI : 0), 0, 'YXZ');
      });
      bodies.push(...this.shapes(t, t.s));
    }
    this.frames.set(bodies);
  }
}

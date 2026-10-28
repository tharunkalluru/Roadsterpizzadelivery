import * as THREE from 'three';
import { Batch } from '../core/util';
import type { XZ } from '../world/types';
import { MovingRailFrames, type MovingRailShape } from './moving-rail';

// Suburban and express trains on the railway lines around the player: a locomotive and a rake of coaches that
// follow the curves of the track, spawned a little way off and running through.
type Track = { pts: XZ[]; elev?: number[]; bridge?: boolean };
interface Run { pts: number[][]; cum: number[]; len: number }
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
  constructor(public mat: THREE.Material) {}
  geo(k: string) { return this.geos[k] || (this.geos[k] = k === 'loco' ? coachGeo('loco', '') : coachGeo('coach', k)); }
  // chain connected ways into one long run through the given way
  buildRun(rails: Map<string, Track>, start: Track): Run {
    const key = (p: XZ) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const ends = new Map<string, Track[]>();
    for (const r of rails.values()) for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) (ends.get(key(p)) || ends.set(key(p), []).get(key(p))!).push(r);
    const used = new Set([start]);
    const withY = (r: Track) => r.pts.map((p, i) => [p[0], (r.elev?.[i] ?? (r.bridge ? 6.2 : 0)) + .11, p[1]]);
    let pts = withY(start);
    for (const forward of [true, false]) {
      for (let guard = 0; guard < 60; guard++) {
        const tip = forward ? pts[pts.length - 1] : pts[0], prev = forward ? pts[pts.length - 2] : pts[1];
        const hx = tip[0] - prev[0], hz = tip[2] - prev[2], hl = Math.hypot(hx, hz) || 1;
        let best: { r: Track; rev: boolean; dot: number } | null = null;
        for (const r of ends.get(key([tip[0], tip[2]])) || []) {
          if (used.has(r)) continue;
          const atStart = key(r.pts[0]) === key([tip[0], tip[2]]), q = atStart ? r.pts : r.pts.slice().reverse();
          if (q.length < 2) continue;
          const dx = q[1][0] - q[0][0], dz = q[1][1] - q[0][1], dot = (dx * hx + dz * hz) / ((Math.hypot(dx, dz) || 1) * hl);
          if (dot > 0.7 && (!best || dot > best.dot)) best = { r, rev: !atStart, dot };
        }
        if (!best) break;
        used.add(best.r);
        const add = withY(best.r); if (best.rev) add.reverse();          // add[0] is the shared end
        pts = forward ? pts.concat(add.slice(1)) : add.slice(1).reverse().concat(pts);
      }
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  private point(run: Run, s: number) {
    let lo = 1, hi = run.pts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (run.cum[mid] < s) lo = mid + 1; else hi = mid; }
    const i = lo;
    const a = run.pts[i - 1], b = run.pts[i], seg = run.cum[i] - run.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (s - run.cum[i - 1]) / seg));
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, yaw: Math.atan2(b[0] - a[0], b[2] - a[2]), pitch: Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])) };
  }
  at(run: Run, s: number) {
    const p = this.point(run, s), a = this.point(run, s - 7), b = this.point(run, s + 7);
    if (Math.hypot(b.x - a.x, b.z - a.z) > .01) { p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)); }
    return p;
  }
  update(dt: number, px: number, pz: number, rails: Map<string, Track>) {
    this.t += dt;
    // spawn: a line within ~900 m of the player, the train entering 500-700 m away
    if (this.trains.length < MAXT && this.t > 6 && rails.size) {
      this.t = 0;
      let cand: Track | null = null, bd = 900;
      for (const r of rails.values()) { const m = r.pts[Math.floor(r.pts.length / 2)], d = Math.hypot(m[0] - px, m[1] - pz); if (d < bd && Math.random() < 0.5) { bd = d; cand = r; } }
      if (cand) {
        const run = this.buildRun(rails, cand);
        if (run.len > 700) {
          const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
          // start at the end farther from the player
          // enter ~550 m up the line from where the player is closest to it
          let ns = 0, nd = 1e9; for (let i = 0; i < run.pts.length; i++) { const d = Math.hypot(run.pts[i][0] - px, run.pts[i][2] - pz); if (d < nd) { nd = d; ns = run.cum[i]; } }
          const s = Math.max(0, Math.min(run.len, ns - dir * 550)), n = 8 + Math.floor(Math.random() * 6);
          const livery = ['#2f5d9a', '#7b2d26', '#2f5d9a', '#3d6b4f'][Math.floor(Math.random() * 4)];
          const cars: THREE.Mesh[] = [];
          for (let k = 0; k < n; k++) { const m = new THREE.Mesh(this.geo(k === 0 ? 'loco' : livery), this.mat); m.castShadow = true; this.group.add(m); cars.push(m); }
          this.trains.push({ id: `rail:${this.nextTrain++}`, run, s, dir, v: 12 + Math.random() * 8, cars });
        }
      }
    }
    const bodies: MovingRailShape[] = [];
    for (const t of [...this.trains]) {
      t.s += t.dir * t.v * dt;
      const head = this.at(t.run, t.s);
      const gone = t.dir > 0 ? t.s - t.cars.length * (CAR + GAP) > t.run.len : t.s + t.cars.length * (CAR + GAP) < 0;
      if (gone || Math.hypot(head.x - px, head.z - pz) > 2600) { for (const c of t.cars) this.group.remove(c); this.trains.splice(this.trains.indexOf(t), 1); continue; }
      t.cars.forEach((c, k) => {
        const s = t.s - t.dir * (k * (CAR + GAP) + CAR / 2);
        if (s < 0 || s > t.run.len) { c.visible = false; return; }
        const p = this.at(t.run, s); c.visible = true;
        // The locomotive's cab is local-z negative; it faces the actual direction of travel.
        c.position.set(p.x, p.y, p.z); c.rotation.set(t.dir * p.pitch, p.yaw + (t.dir > 0 ? Math.PI : 0), 0, 'YXZ');
        bodies.push({ id: `${t.id}:${k}`, x: p.x, y: p.y, z: p.z, hx: -Math.sin(c.rotation.y), hz: -Math.cos(c.rotation.y),
          halfWidth: 1.57, halfLength: k === 0 ? 10.05 : CAR / 2, bottom: p.y + .2, roof: p.y + (k === 0 ? 3.9 : 4.175) });
      });
    }
    this.frames.set(bodies);
  }
}

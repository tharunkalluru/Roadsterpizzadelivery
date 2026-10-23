import * as THREE from 'three';
import { metroTrain } from '../world/vehicles';
import type { XZ } from '../world/types';

// Metro trains running on the viaducts: each line part carries trains both ways on its own track, braking into every
// station, dwelling with doors open, then pulling away. Only the trains near the player get a mesh.
interface Run { pts: XZ[]; cum: number[]; len: number; stops: number[]; color: string }
interface Train { run: Run; s: number; dir: 1 | -1; v: number; dwell: number; next: number; mesh: THREE.Group | null }
const VMAX = 22, ACC = 1.0, DWELL = 18, TRACK = 1.95, NEAR = 1300;

export class MetroTrains {
  group = new THREE.Group(); trains: Train[] = []; pool: THREE.Group[] = []; geo: { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; length: number } | null = null;
  constructor(metro: { lines: { id: string; color?: string; pts: XZ[] }[]; stations: { p: XZ }[]; deckHeight: number }, public mats: { body: THREE.Material; lights: THREE.Material }) {
    this.dh = metro.deckHeight || 11;
    for (const line of metro.lines) {
      if (line.pts.length < 2) continue;
      const cum = [0]; for (let i = 1; i < line.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(line.pts[i][0] - line.pts[i - 1][0], line.pts[i][1] - line.pts[i - 1][1]));
      const len = cum[cum.length - 1]; if (len < 400) continue;
      // stations along this run, by distance along it
      const stops: number[] = [];
      for (const st of metro.stations) {
        let bd = 1e9, bs = 0;
        for (let i = 0; i < line.pts.length - 1; i++) {
          const [ax, az] = line.pts[i], [bx, bz] = line.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((st.p[0] - ax) * dx + (st.p[1] - az) * dz) / L2)), d = Math.hypot(st.p[0] - ax - dx * t, st.p[1] - az - dz * t);
          if (d < bd) { bd = d; bs = cum[i] + Math.sqrt(L2) * t; }
        }
        if (bd < 60) stops.push(bs);
      }
      stops.sort((a, b) => a - b);
      if (!stops.length || stops[0] > 30) stops.unshift(0);
      if (stops[stops.length - 1] < len - 30) stops.push(len);
      const run: Run = { pts: line.pts, cum, len, stops, color: line.color || '#3B7BF0' };
      // one train every ~2.4 km each way, spread along the run
      const n = Math.max(1, Math.round(len / 2400));
      for (let k = 0; k < n; k++) for (const dir of [1, -1] as const) {
        const s = ((k + (dir > 0 ? 0.25 : 0.75)) / n) * len;
        this.trains.push({ run, s, dir, v: VMAX * 0.8, dwell: 0, next: this.nextStop(run, s, dir), mesh: null });
      }
    }
  }
  dh: number;
  nextStop(run: Run, s: number, dir: 1 | -1) {
    if (dir > 0) { for (const x of run.stops) if (x > s + 1) return x; return run.len; }
    for (let i = run.stops.length - 1; i >= 0; i--) if (run.stops[i] < s - 1) return run.stops[i];
    return 0;
  }
  at(run: Run, s: number) {
    let i = 1; while (i < run.pts.length - 1 && run.cum[i] < s) i++;
    const a = run.pts[i - 1], b = run.pts[i], seg = run.cum[i] - run.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (s - run.cum[i - 1]) / seg));
    return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx: (b[0] - a[0]) / seg, hz: (b[1] - a[1]) / seg };
  }
  mesh(color: string) {
    if (!this.geo) { const t = metroTrain(3); this.geo = { body: t.body.geometry(), lights: t.lights.geometry(), length: t.length }; }
    const g = this.pool.pop() || (() => { const m = new THREE.Group(); const b = new THREE.Mesh(this.geo!.body, this.mats.body); b.castShadow = true; m.add(b, new THREE.Mesh(this.geo!.lights, this.mats.lights)); return m; })();
    void color; this.group.add(g); return g;
  }
  update(dt: number, px: number, pz: number) {
    for (const t of this.trains) {
      const run = t.run;
      if (t.dwell > 0) {
        t.dwell -= dt;
        if (t.dwell <= 0) {
          if ((t.dir > 0 && t.s >= run.len - 1) || (t.dir < 0 && t.s <= 1)) t.dir = (t.dir > 0 ? -1 : 1) as 1 | -1;   // end of the line: reverse
          t.next = this.nextStop(run, t.s, t.dir);
        }
      } else {
        const d = Math.abs(t.next - t.s), want = Math.min(VMAX, Math.sqrt(2 * ACC * Math.max(0, d - 0.5)));
        t.v += Math.max(-ACC * 1.5 * dt, Math.min(ACC * dt, want - t.v));
        t.s += t.dir * Math.min(d, Math.max(0.4, t.v) * dt);
        if (d < 0.6) { t.s = t.next; t.v = 0; t.dwell = DWELL; }
      }
      // meshes for trains near the player only
      const p = this.at(run, t.s), near = Math.hypot(p.x - px, p.z - pz) < NEAR;
      if (near && !t.mesh) t.mesh = this.mesh(run.color);
      if (!near && t.mesh) { this.group.remove(t.mesh); this.pool.push(t.mesh); t.mesh = null; }
      if (t.mesh) {
        // the train's middle sits at s; it runs on the left track of its direction (Indian practice)
        const off = TRACK * (t.dir > 0 ? -1 : 1), nx = -p.hz, nz = p.hx;
        const L = this.geo!.length, mid = this.at(run, t.s - t.dir * L * 0.0);
        const yaw = Math.atan2(p.hx * t.dir, p.hz * t.dir);
        t.mesh.position.set(mid.x + nx * off - Math.sin(yaw) * (L / 2 - 11), this.dh + 0.95, mid.z + nz * off - Math.cos(yaw) * (L / 2 - 11));
        t.mesh.rotation.set(0, yaw, 0);
      }
    }
  }
}

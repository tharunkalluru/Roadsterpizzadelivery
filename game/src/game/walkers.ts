import * as THREE from 'three';
import { rng } from '../core/util';
import { randomPerson, walkerGeometry, legsVisible, PersonSpec } from '../world/people';
import type { CityData, WalkPath } from '../world/city';
import type { XZ } from '../world/types';
import type { Walker as TrafficWalker } from './traffic';

// People walking the footpaths around the player. They cross side streets where the footpath does,
// cross main roads at the ends of a block (waiting for the red light at signals), and step aside for the car.
interface W extends TrafficWalker {
  spec: PersonSpec; g: THREE.Group; legL: THREE.Mesh | null; legR: THREE.Mesh | null;
  path: WalkPath; i: number; u: number; dir: 1 | -1; speed: number; phase: number;
  cross: { ax: number; az: number; bx: number; bz: number; t: number; to: WalkPath; hx: number; hz: number } | null;
  wait: number; ox: number; oz: number; vx: number; vz: number; dodgeT: number; pause: number;
}

export class Walkers {
  list: W[] = []; group = new THREE.Group(); r = rng(9917);
  grid = new Map<string, [WalkPath, number][]>();
  byEdge = new Map<string, WalkPath[]>();
  constructor(public city: CityData, public mat: THREE.Material, public max = 60, public canCross: (x: number, z: number, hx: number, hz: number) => boolean = () => true) {
    this.addPaths(city.walkPaths);
  }
  addPaths(paths: WalkPath[]) {
    for (const p of paths) {
      (this.byEdge.get(p.edge) || this.byEdge.set(p.edge, []).get(p.edge)!).push(p);
      for (let i = 0; i < p.pts.length - 1; i++) {
        const k = `${Math.floor(p.pts[i][0] / 60)},${Math.floor(p.pts[i][1] / 60)}`;
        (this.grid.get(k) || this.grid.set(k, []).get(k)!).push([p, i]);
      }
    }
  }
  removePaths(paths: WalkPath[]) {
    const gone = new Set(paths);
    for (const [k, l] of this.grid) { const f = l.filter((e) => !gone.has(e[0])); if (f.length) this.grid.set(k, f); else this.grid.delete(k); }
    for (const [k, l] of this.byEdge) { const f = l.filter((p) => !gone.has(p)); if (f.length) this.byEdge.set(k, f); else this.byEdge.delete(k); }
    for (let n = this.list.length - 1; n >= 0; n--) { const w = this.list[n]; if (gone.has(w.path) || (w.cross && gone.has(w.cross.to))) { this.group.remove(w.g); this.list.splice(n, 1); } }
  }
  spawn(px: number, pz: number) {
    const cx = Math.floor(px / 60) + this.r.int(-2, 2), cz = Math.floor(pz / 60) + this.r.int(-2, 2);
    const cell = this.grid.get(`${cx},${cz}`); if (!cell || !cell.length) return;
    const [pi, i] = this.r.pick(cell);
    const pts = pi.pts, a = pts[i], b = pts[i + 1];
    const u = this.r(), x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < 25 || d > 140) return;
    const spec = randomPerson(this.r);
    const geo = walkerGeometry(spec);
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo.body, this.mat); body.castShadow = true; g.add(body);
    let legL: THREE.Mesh | null = null, legR: THREE.Mesh | null = null;
    if (geo.leg && legsVisible(spec.kind)) {
      legL = new THREE.Mesh(geo.leg, this.mat); legR = new THREE.Mesh(geo.leg, this.mat);
      legL.position.set(-0.085, 0.84, 0); legR.position.set(0.085, 0.84, 0); legL.castShadow = legR.castShadow = true;
      g.add(legL, legR);
    }
    g.scale.setScalar(spec.s);
    this.group.add(g);
    this.list.push({ spec, g, legL, legR, path: pi, i, u, dir: this.r() < 0.5 ? 1 : -1, speed: spec.walk, phase: this.r() * 6, x, z, crossing: false, cross: null, wait: 0, ox: 0, oz: 0, vx: 0, vz: 0, dodgeT: 0, pause: 0 });
  }
  update(dt: number, px: number, pz: number, player: { x: number; z: number; speed: number; fx: number; fz: number; y: number }) {
    for (let k = 0; k < 3 && this.list.length < this.max; k++) this.spawn(px, pz);
    if (this.list.length > this.max) {
      let far = -1, fd = 90;
      for (let i = 0; i < this.list.length; i++) { const d = Math.hypot(this.list[i].x - px, this.list[i].z - pz); if (d > fd) { fd = d; far = i; } }
      if (far >= 0) { this.group.remove(this.list[far].g); this.list.splice(far, 1); }
    }
    for (let n = this.list.length - 1; n >= 0; n--) {
      const w = this.list[n];
      if (Math.hypot(w.x - px, w.z - pz) > 170) { this.group.remove(w.g); this.list.splice(n, 1); continue; }
      let hx = 0, hz = 0, moving = true;
      // step aside when the car comes at them
      const rx = w.x - player.x, rz = w.z - player.z, ahead = rx * player.fx + rz * player.fz, side = rx * player.fz - rz * player.fx;
      if (player.y < 3 && Math.abs(player.speed) > 1.5 && ahead > -1 && ahead < 9 && Math.abs(side) < 2.2) {
        const sg = side >= 0 ? 1 : -1; w.vx = player.fz * sg * 3.4; w.vz = -player.fx * sg * 3.4; w.dodgeT = 0.7; w.pause = 0.9;
      }
      if (w.dodgeT > 0) { w.dodgeT -= dt; w.ox += w.vx * dt; w.oz += w.vz * dt; }
      else { const k = Math.max(0, 1 - dt * 0.7); w.ox *= k; w.oz *= k; }
      if (w.pause > 0) { w.pause -= dt; moving = false; }
      if (w.cross) {
        // crossing a road
        const c = w.cross;
        if (w.wait > 0) { w.wait -= dt; moving = false; if (w.wait <= 0 && !this.canCross(c.ax, c.az, c.hx, c.hz)) w.wait = 0.5; }
        else if (moving) c.t += (w.speed * 1.15 * dt) / Math.max(1, Math.hypot(c.bx - c.ax, c.bz - c.az));
        hx = c.bx - c.ax; hz = c.bz - c.az;
        w.x = c.ax + hx * Math.min(1, c.t) + w.ox; w.z = c.az + hz * Math.min(1, c.t) + w.oz;
        w.crossing = w.wait <= 0 && c.t > 0 && c.t < 1;
        if (c.t >= 1) {
          // continue along the other side, walking back the way we came
          const pts = c.to.pts; let bi = 0, bd = 1e9;
          for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - w.x, pts[i][1] - w.z); if (d < bd) { bd = d; bi = i; } }
          w.path = c.to; w.dir = bi === 0 ? 1 : -1; w.i = bi === 0 ? 0 : Math.max(0, pts.length - 2); w.u = bi === 0 ? 0 : 1; w.cross = null; w.crossing = false;
        }
      } else {
        const pts = w.path.pts;
        const a = pts[w.i], b = pts[w.i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        if (moving) w.u += (w.dir * w.speed * dt) / L;
        if (w.u > 1 || w.u < 0) {
          const ni = w.i + w.dir;
          if (ni >= 0 && ni < pts.length - 1) { w.i = ni; w.u = w.dir > 0 ? 0 : 1; }
          else this.blockEnd(w, pts[w.dir > 0 ? pts.length - 1 : 0], pts[w.dir > 0 ? pts.length - 2 : 1]);
        }
        const a2 = pts[w.i], b2 = pts[Math.min(pts.length - 1, w.i + 1)], u = Math.max(0, Math.min(1, w.u));
        hx = (b2[0] - a2[0]) * w.dir; hz = (b2[1] - a2[1]) * w.dir;
        const L2 = Math.hypot(hx, hz) || 1;
        // walkers keep to their side of the path and step out of the way
        const off = (hash01(w.spec.walk) - 0.5) * 0.9;
        w.x = a2[0] + (b2[0] - a2[0]) * u + (hz / L2) * off + w.ox; w.z = a2[1] + (b2[1] - a2[1]) * u - (hx / L2) * off + w.oz;
      }
      // pose
      if (moving && !(w.cross && w.wait > 0)) w.phase += dt * w.speed * 5.2;
      const sw = moving ? Math.sin(w.phase) : 0;
      if (w.legL && w.legR) { w.legL.rotation.x = sw * 0.5; w.legR.rotation.x = -sw * 0.5; }
      w.g.position.set(w.x, (w.cross ? 0.08 : 0.2) + Math.abs(sw) * 0.025, w.z);
      if (hx || hz) w.g.rotation.y = Math.atan2(-hx, -hz);
      w.g.rotation.z = w.legL ? 0 : sw * 0.03;
    }
  }
  // at the end of a footpath: turn back, or cross to the far side of the same road
  blockEnd(w: W, end: XZ, prev: XZ) {
    const p = w.path;
    const others = (this.byEdge.get(p.edge) || []).filter((q) => q !== w.path);
    if (others.length && this.r() < 0.6) {
      const to = others[0], pts = to.pts;
      let best = pts[0], bd = 1e9; for (const q of [pts[0], pts[pts.length - 1]]) { const d = Math.hypot(q[0] - end[0], q[1] - end[1]); if (d < bd) { bd = d; best = q; } }
      if (bd < 40) {
        const hx = end[0] - prev[0], hz = end[1] - prev[1], L = Math.hypot(hx, hz) || 1;
        w.cross = { ax: end[0], az: end[1], bx: best[0], bz: best[1], t: 0, to, hx: hx / L, hz: hz / L };
        w.wait = this.canCross(end[0], end[1], hx / L, hz / L) ? 0 : 0.5;
        return;
      }
    }
    w.dir = (w.dir * -1) as 1 | -1; w.u = Math.max(0, Math.min(1, w.u));
  }
  asTraffic(): TrafficWalker[] { return this.list; }
}
function hash01(v: number) { const s = Math.sin(v * 12.9898) * 43758.5453; return s - Math.floor(s); }

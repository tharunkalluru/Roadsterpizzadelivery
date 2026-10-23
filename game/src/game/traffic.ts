import * as THREE from 'three';
import * as M from '../world/traffic_models';
import { rng } from '../core/util';
import type { RoadGraph, GEdge, GNode } from './roadgraph';
import { hasCentreMedian, BusStop } from '../world/city';
import { segmentHitsVehicle } from './spatial-safety';

type Group = 'car' | 'auto' | 'bike' | 'bus' | 'truck';
interface Proto { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; decals: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; size: number[]; group: Group }
export interface Car {
  g: THREE.Group; kind: string; group: Group; size: number[]; edge: GEdge; dir: 1 | -1; s: number; speed: number; want: number;
  lane: number; laneT: number; base: number; x: number; y: number; z: number; hx: number; hz: number; wob: number;
  blockedT: number; stuckT: number; passS: number; honkT: number; filtering: boolean; dwell: number; served: Set<BusStop>;
}
export interface Walker { x: number; z: number; crossing: boolean }

const WEIGHT: Record<string, number> = { trunk: 6, primary: 6, secondary: 4, tertiary: 3, primary_link: 2, secondary_link: 2, residential: 0.6, unclassified: 0.8, service: 0.15, living_street: 0.3, unknown: 0.4 };
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'motorway', 'motorway_link', 'trunk_link']);

export class Traffic {
  cars: Car[] = []; protos: Proto[] = []; byGroup: Record<Group, Proto[]> = { car: [], auto: [], bike: [], bus: [], truck: [] };
  r = rng(77); t = 0; phaseLen = 22;
  stopsByEdge = new Map<string, BusStop[]>();
  onHorn: (kind: string, x: number, z: number) => void = () => {};
  constructor(public graph: RoadGraph, public scene: THREE.Scene, public mats: Record<string, any>, public max = 55, busStops: BusStop[] = []) {
    const R = rng(4049);
    const add = (m: M.Model) => {
      const p: Proto = { body: m.body.geometry(), lights: m.lights.geometry(), decals: m.decals || [], size: m.size, group: m.kind as Group };
      this.protos.push(p); this.byGroup[p.group].push(p);
    };
    const CAR = ['#F3F2EE', '#F3F2EE', '#F3F2EE', '#C9CCD2', '#9ea3ad', '#5b5f68', '#b3202a', '#23356b', '#6b1f2a', '#1b1a1f', '#7a5a3a', '#2a5bd7'];
    for (let i = 0; i < 12; i++) add(M.car(R.pick(['hatch', 'hatch', 'sedan', 'sedan', 'suv', 'cab'] as const), CAR[i % CAR.length], R));
    for (let i = 0; i < 7; i++) add(M.auto(R));
    for (let i = 0; i < 6; i++) add(M.motorbike(R));
    for (let i = 0; i < 5; i++) add(M.scooter(R));
    for (let i = 0; i < 4; i++) add(M.bus(R));
    for (let i = 0; i < 2; i++) add(M.lorry(R));
    add(M.tanker(R));
    this.setBusStops(busStops);
  }
  setBusStops(busStops: BusStop[]) {
    this.stopsByEdge.clear();
    for (const s of busStops) (this.stopsByEdge.get(s.edge) || this.stopsByEdge.set(s.edge, []).get(s.edge)!).push(s);
  }
  // vehicles on roads of an unloaded tile leave with it
  dropEdges(gone: Set<GEdge>) {
    for (let i = this.cars.length - 1; i >= 0; i--) if (gone.has(this.cars[i].edge)) { this.scene.remove(this.cars[i].g); this.cars.splice(i, 1); }
  }
  // signal phase for an approach heading at a node: two groups by axis, 22 s each with 3 s amber
  green(node: GNode, hx: number, hz: number) {
    if (!node.signal) return true;
    const axis = Math.abs(hx) > Math.abs(hz) ? 0 : 1;
    const ph = Math.floor(this.t / this.phaseLen) % 2, within = this.t % this.phaseLen;
    return ph === axis && within < this.phaseLen - 3;
  }
  signalState(node: GNode, axis: number) { const ph = Math.floor(this.t / this.phaseLen) % 2, w = this.t % this.phaseLen; return ph !== axis ? 'red' : w < this.phaseLen - 3 ? 'green' : 'amber'; }
  laneRange(edge: GEdge, w: number): [number, number] {
    const e = edge.e, half = e.w / 2;
    if (e.oneway) return [-half + w / 2 + 0.3, half - w / 2 - 0.3];
    const inner = hasCentreMedian(e) ? 0.95 : 0.35;                     // keep clear of the centre median
    return [inner + w / 2, Math.max(inner + w / 2, half - w / 2 - 0.3)];
  }
  pickLane(edge: GEdge, w: number, group: Group) {
    const e = edge.e, half = e.oneway ? e.w : e.w / 2;
    const lanes = Math.max(1, Math.floor(half / 3.2)), lw = Math.min(3.4, half / lanes);
    // k counts lanes from the left kerb (slow traffic keeps left in India)
    let k = Math.floor(this.r() * lanes);
    if ((group === 'bus' || group === 'truck' || group === 'auto') && this.r() < 0.6) k = 0;
    const [lo, hi] = this.laneRange(edge, w);
    const lane = e.oneway ? e.w / 2 - (k + 0.5) * lw : half - (k + 0.5) * lw;
    return Math.max(lo, Math.min(hi, lane + (group === 'bike' ? (this.r() - 0.5) * 1.2 : 0)));
  }
  spawn(px: number, pz: number) {
    const cand = this.graph.nearestEdges(px, pz, 4).filter((g) => (WEIGHT[g.e.cls] || 0) > 0.1 && !(g.e.elev && Math.max(...g.e.elev) > 1.2 && this.r() < 0.3));
    if (!cand.length) return;
    let tot = 0; for (const g of cand) tot += (WEIGHT[g.e.cls] || 0.2) * g.len;
    let pick = this.r() * tot, edge = cand[0];
    for (const g of cand) { pick -= (WEIGHT[g.e.cls] || 0.2) * g.len; if (pick <= 0) { edge = g; break; } }
    const dirs: (1 | -1)[] = []; if (edge.e.oneway !== 'forward') dirs.push(1); if (edge.e.oneway !== 'backward') dirs.push(-1);
    if (!dirs.length) return;
    const dir = this.r.pick(dirs);
    const s = this.r() * edge.len;
    const p = this.graph.pointAt(edge, s, dir);
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < 70 || d > 300) return;
    const big = MAJOR.has(edge.e.cls);
    // Hyderabad mix: two-wheelers dominate, then autos and cars; buses and lorries on main roads
    const roll = this.r();
    const fast = /^motorway/.test(edge.e.cls);            // ORR / expressways: cars, buses and lorries, few bikes, no autos
    const group: Group = fast ? (roll < 0.08 ? 'bike' : roll < 0.62 ? 'car' : roll < 0.78 ? 'bus' : 'truck') : big ? (roll < 0.36 ? 'bike' : roll < 0.58 ? 'auto' : roll < 0.86 ? 'car' : roll < 0.95 ? 'bus' : 'truck') : (roll < 0.5 ? 'bike' : roll < 0.78 ? 'auto' : 'car');
    const pr = this.r.pick(this.byGroup[group]);
    const g = new THREE.Group();
    const b = new THREE.Mesh(pr.body, this.mats.vBody); b.castShadow = true; b.receiveShadow = true;
    g.add(b, new THREE.Mesh(pr.lights, this.mats.vLight));
    for (const dc of pr.decals) g.add(new THREE.Mesh(dc.geo, dc.mat));
    this.scene.add(g);
    const lane = this.pickLane(edge, pr.size[0], group);
    const want = group === 'bike' ? this.r.range(9, 13) : group === 'bus' || group === 'truck' ? this.r.range(6.5, 9) : group === 'auto' ? this.r.range(7, 10) : this.r.range(8, 12);
    this.cars.push({ g, kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * 0.6, want, lane, laneT: lane, base: lane, x: p.x, y: p.y, z: p.z, hx: p.hx, hz: p.hz, wob: this.r() * 10, blockedT: 0, stuckT: 0, passS: 0, honkT: this.r.range(0.6, 2), filtering: false, dwell: 0, served: new Set() });
  }
  // place a specific vehicle (used by tests and scripted scenes)
  spawnAt(group: Group, edge: GEdge, dir: 1 | -1, s: number, lane?: number): Car {
    const pr = this.byGroup[group][0];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pr.body, this.mats.vBody), new THREE.Mesh(pr.lights, this.mats.vLight));
    for (const dc of pr.decals) g.add(new THREE.Mesh(dc.geo, dc.mat));
    this.scene.add(g);
    const ln = lane ?? this.pickLane(edge, pr.size[0], group);
    const p = this.graph.pointAt(edge, s, dir, ln);
    const want = group === 'bike' ? 11 : group === 'bus' ? 8 : 10;
    const c: Car = { g, kind: pr.group, group, size: pr.size, edge, dir, s, speed: want * 0.8, want, lane: ln, laneT: ln, base: ln, x: p.x, y: p.y, z: p.z, hx: p.hx, hz: p.hz, wob: 0, blockedT: 0, stuckT: 0, passS: 0, honkT: 0.5, filtering: false, dwell: 0, served: new Set() };
    this.cars.push(c);
    return c;
  }
  update(dt: number, px: number, pz: number, player: { x: number; z: number; y: number; speed: number }, walkers: Walker[] = []) {
    this.t += dt;
    for (let k = 0; k < 6 && this.cars.length < this.max; k++) this.spawn(px, pz);
    // over budget (moved somewhere quieter): retire the farthest vehicle once it is well out of the way
    if (this.cars.length > this.max) {
      let far = -1, fd = 160;
      for (let i = 0; i < this.cars.length; i++) { const d = Math.hypot(this.cars[i].x - px, this.cars[i].z - pz); if (d > fd) { fd = d; far = i; } }
      if (far >= 0) { this.scene.remove(this.cars[far].g); this.cars.splice(far, 1); }
    }
    const byEdge = new Map<GEdge, Car[]>();
    for (const c of this.cars) (byEdge.get(c.edge) || byEdge.set(c.edge, []).get(c.edge)!).push(c);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - px, c.z - pz) > 340) { this.scene.remove(c.g); this.cars.splice(i, 1); continue; }
      const halfL = c.size[2] / 2, halfW = c.size[0] / 2;
      let target = c.want;
      // follow whatever is ahead in an overlapping lane on the same edge; remember a stopped one as an obstacle
      let obs: { lane: number; halfW: number; s: number; halfL: number } | null = null;
      for (const o of byEdge.get(c.edge) || []) {
        if (o === c || o.dir !== c.dir || Math.abs(o.lane - c.lane) > (o.size[0] + c.size[0]) / 2 + 0.25) continue;
        const gap = o.s - c.s - (o.size[2] + c.size[2]) / 2;
        if (gap > -0.5 && gap < 5 + c.speed * 1.1) {
          target = Math.min(target, o.speed * 0.9, Math.max(0, (gap - 1.6) * 0.9));
          if (gap < 7 && o.speed < 1 && (!obs || o.s < obs.s)) obs = { lane: o.lane, halfW: o.size[0] / 2, s: o.s, halfL: o.size[2] / 2 };
        }
      }
      // the player's car is a vehicle like any other: queue behind it, honk, and squeeze past when there is room
      const rx = player.x - c.x, rz = player.z - c.z;
      const along = rx * c.hx + rz * c.hz, lat = rx * c.hz - rz * c.hx;    // lat > 0: player is to this vehicle's left
      const sameLevel = Math.abs(player.y - 0.55 - c.y) < 2;
      let blocked = false;
      if (sameLevel && along > -halfL && along < 16 + c.speed * 1.2 && Math.abs(lat) < halfW + 1.0 + 0.3) {
        const gap = along - halfL - 2.4;
        target = Math.min(target, Math.max(0, gap * 0.9));
        blocked = gap < 7 && Math.abs(player.speed) < 1.5;
        if (blocked && (!obs || c.s + along < obs.s)) obs = { lane: c.lane + lat, halfW: 1.0, s: c.s + along, halfL: 2.3 };
      }
      c.blockedT = blocked ? c.blockedT + dt : Math.max(0, c.blockedT - dt * 2);
      c.stuckT = obs && target < 0.8 ? c.stuckT + dt : Math.max(0, c.stuckT - dt);
      const canFilter = c.group === 'bike' || c.group === 'auto' || (c.group === 'car' && this.r() < 0.03);
      if (obs && c.stuckT > 0.6 && !c.filtering && canFilter) {
        // look for a gap beside whatever is stopped ahead (the player's car or a queue), inside this carriageway
        const [lo, hi] = this.laneRange(c.edge, c.size[0]);
        const need = obs.halfW + halfW + 0.65;
        const opts = [obs.lane - need, obs.lane + need].filter((v) => v >= lo && v <= hi).sort((a, b) => Math.abs(a - c.lane) - Math.abs(b - c.lane));
        const free = opts.find((v) => !(byEdge.get(c.edge) || []).some((o) => o !== c && o.dir === c.dir && Math.abs(o.lane - v) < (o.size[0] + c.size[0]) / 2 && o.s > c.s - 6 && o.s < obs!.s + 10));
        if (free !== undefined) { c.laneT = free; c.filtering = true; c.passS = obs.s + obs.halfL + halfL + 3; }
      }
      if (c.filtering) {
        if (Math.abs(c.lane - c.laneT) > 0.25) target = Math.min(target, 1.6);          // creep while edging sideways
        if (c.s > c.passS) { c.filtering = false; c.laneT = c.base; }
      }
      if (blocked && !c.filtering && c.blockedT > 1.2) {
        if ((c.honkT -= dt) <= 0) { c.honkT = this.r.range(1.0, 3.2); this.onHorn(c.group, c.x, c.z); }
      }
      // buses pull in at their stops for a few seconds
      if (c.group === 'bus') {
        if (c.dwell > 0) { target = 0; c.dwell -= dt; if (c.dwell <= 0) c.laneT = c.base; }
        else for (const st of this.stopsByEdge.get(c.edge.e.id) || []) {
          if (c.served.has(st)) continue;
          const leftSign = c.dir === 1 ? st.side : -st.side;
          if (leftSign < 0 && !c.edge.e.oneway) continue;
          const sd = c.dir === 1 ? st.s : c.edge.len - st.s, ahead = sd - c.s;
          if (ahead < -2 || ahead > 45) continue;
          c.laneT = leftSign * (c.edge.e.w / 2 - halfW - 0.25);
          target = Math.min(target, Math.max(0, ahead * 0.55));
          if (ahead < 1.5 && c.speed < 0.6) { c.dwell = this.r.range(4, 7); c.served.add(st); }
          break;
        }
      }
      // give way to people crossing
      for (const w of walkers) {
        if (!w.crossing) continue;
        const wx = w.x - c.x, wz = w.z - c.z, a2 = wx * c.hx + wz * c.hz, l2 = wx * c.hz - wz * c.hx;
        if (a2 > 0 && a2 < 7 + c.speed && Math.abs(l2) < halfW + 0.8) target = Math.min(target, Math.max(0, (a2 - halfL - 1.5) * 0.8));
      }
      // signals at the end of the edge
      const endNode = this.graph.nodes.get(c.dir === 1 ? c.edge.to : c.edge.from);
      if (!endNode) { this.scene.remove(c.g); this.cars.splice(i, 1); continue; }
      const left = c.edge.len - c.s;
      if (endNode.signal && left < 16 && left > 3 && !this.green(endNode, c.hx, c.hz)) target = Math.min(target, Math.max(0, (left - 5) * 0.7));
      c.speed += Math.max(-9 * dt, Math.min(3.2 * dt, target - c.speed));
      c.s += c.speed * dt;
      c.lane += Math.max(-1.4 * dt, Math.min(1.4 * dt, c.laneT - c.lane));
      if (c.s >= c.edge.len) {
        const opts = endNode.out.filter((o) => o.edge !== c.edge && (WEIGHT[o.edge.e.cls] || 0) > 0.1);
        const nxt = opts.length ? opts[Math.floor(this.r() * opts.length)] : endNode.out.find((o) => o.edge === c.edge) || null;
        if (!nxt) { this.scene.remove(c.g); this.cars.splice(i, 1); continue; }
        c.s -= c.edge.len; c.edge = nxt.edge; c.dir = nxt.dir;
        c.base = c.laneT = c.lane = this.pickLane(c.edge, c.size[0], c.group); c.filtering = false; c.dwell = 0;
      }
      const wob = c.group === 'bike' && !c.filtering ? Math.sin(this.t * 1.1 + c.wob) * 0.3 : 0;
      const p = this.graph.pointAt(c.edge, Math.min(c.s, c.edge.len), c.dir, c.lane + wob);
      c.x += (p.x - c.x) * Math.min(1, dt * 10); c.z += (p.z - c.z) * Math.min(1, dt * 10); c.y = p.y;
      c.hx = p.hx; c.hz = p.hz;
      c.g.position.set(c.x, c.y + 0.02, c.z);
      c.g.rotation.y = Math.atan2(-p.hx, -p.hz) + (c.laneT - c.lane) * 0.12;
    }
  }
  // Hide the whole vehicle whenever its oriented body crosses the camera-car
  // sightline. A bus nose can obstruct the view while its centre is far to one side.
  hideNear(cam: THREE.Vector3, tgt?: { x: number; y: number; z: number }) {
    for (const c of this.cars) {
      // Lane-changing adds a visual yaw on top of the road tangent.
      const body = { x: c.x, y: c.y, z: c.z, size: c.size, hx: -Math.sin(c.g.rotation.y), hz: -Math.cos(c.g.rotation.y) };
      c.g.visible = !segmentHitsVehicle(cam, cam, body, 1.2) && !(tgt && segmentHitsVehicle(cam, tgt, body, 0.6));
    }
  }
  // keep the player's car out of other vehicles: push it out along the shallowest side of the overlap
  pushOut(pos: { x: number; y: number; z: number }, halfW: number, halfL: number): Car | null {
    let hit: Car | null = null;
    for (const c of this.cars) {
      if (Math.abs(c.y - (pos.y - 0.55)) > 2) continue;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      const pa = c.size[2] / 2 + halfL - Math.abs(along), ps = c.size[0] / 2 + halfW - Math.abs(side);
      if (pa <= 0 || ps <= 0) continue;
      if (ps < pa) { const k = Math.sign(side) * ps; pos.x += c.hz * k; pos.z -= c.hx * k; }
      else { const k = Math.sign(along) * pa; pos.x += c.hx * k; pos.z += c.hz * k; }
      hit = c;
    }
    return hit;
  }
  // overlap test against the player; returns the vehicle hit, if any
  hitTest(x: number, y: number, z: number, r: number): Car | null {
    for (const c of this.cars) {
      if (Math.abs(c.y - (y - 0.55)) > 2) continue;
      const dx = x - c.x, dz = z - c.z;
      const along = dx * c.hx + dz * c.hz, side = dx * c.hz - dz * c.hx;
      if (Math.abs(along) < c.size[2] / 2 + r && Math.abs(side) < c.size[0] / 2 + r * 0.7) return c;
    }
    return null;
  }
}

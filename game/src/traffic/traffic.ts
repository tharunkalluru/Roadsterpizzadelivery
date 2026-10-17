import { TRAFFIC, SIM_HZ } from '../config/gameplay';
import { TICK_SECONDS } from '../core/clock';
import type { Rng } from '../core/rng';
import type { WorldPhysics, Contact } from '../world/collision';
import type { DynamicWorld } from '../player/player';
import { forwardOf, wrapAngle } from '../world/roadIndex';

export type ActorKind = 'car' | 'auto' | 'bus' | 'bike' | 'truck';

const DIMS: Record<ActorKind, { length: number; width: number; height: number; vmax: number; accel: number }> = {
  car: { length: 4.2, width: 1.8, height: 1.5, vmax: 11.5, accel: 2.2 },
  auto: { length: 2.9, width: 1.4, height: 1.8, vmax: 9.0, accel: 1.6 },
  bus: { length: 11.5, width: 2.6, height: 3.2, vmax: 9.5, accel: 0.9 },
  bike: { length: 2.0, width: 0.8, height: 1.5, vmax: 12.0, accel: 2.6 },
  truck: { length: 7.5, width: 2.4, height: 3.0, vmax: 9.0, accel: 1.0 },
};

export interface Actor {
  id: number;
  kind: ActorKind;
  edge: string;
  along: number;
  speed: number;
  lateral: number; // signed offset from centreline (+ right of travel)
  laneLateral: number;
  vmax: number;
  length: number; width: number; height: number;
  state: 'drive' | 'yield' | 'curb' | 'merge';
  stateTicks: number;
  waitTicks: number;
  stalledTicks?: number;
  braking: boolean;
  x: number; z: number; y: number; heading: number;
  px: number; pz: number; py: number; pheading: number;
}

export interface Pedestrian {
  id: number;
  edge: string; // road id for footpath
  along: number;
  side: 1 | -1;
  dir: 1 | -1;
  speed: number;
  state: 'walk' | 'wait' | 'cross';
  stateTicks: number;
  crossT: number;
  x: number; z: number; y: number; heading: number;
  px: number; pz: number; pheading: number;
}

/**
 * Traffic: kinematic, path-controlled actors with application-level avoidance (MASTER §14).
 * Left-hand road organisation: on two-way roads actors keep left of the centreline.
 * Stable integer IDs; actors are owned by the traffic system, not by chunks, so chunk
 * crossing never duplicates or deletes them (M11).
 */
export class TrafficSystem implements DynamicWorld {
  actors: Actor[] = [];
  peds: Pedestrian[] = [];
  private nextId = 1;
  private tickCount = 0;
  density = 1;
  /** forbidden spawn zones (stopping polygons, active landing forecast) */
  reserved: { x: number; z: number; r: number }[] = [];
  log: string[] = [];

  constructor(private world: WorldPhysics, private rng: Rng) {}

  reset(): void { this.actors = []; this.peds = []; this.nextId = 1; this.tickCount = 0; this.reserved = []; }

  private dims(kind: ActorKind) { return DIMS[kind]; }

  private pose(edge: string, along: number, lateral: number) {
    const p = this.world.nav.pointOnDirected(edge, along);
    const [fx, fz] = forwardOf(p.heading);
    return { x: p.x + -fz * lateral, z: p.z + fx * lateral, y: p.y, heading: p.heading };
  }

  private laneFor(edge: string, kind: ActorKind): number {
    const e = this.world.nav.edges.get(edge)!;
    const road = this.world.roads.roads.get(e.roadId)!;
    const hw = road.widthM / 2;
    const w = this.dims(kind).width;
    if (road.oneway) {
      // multi-lane one-way: spread across, buses/autos favour the kerb (left)
      const lanes = Math.max(1, Math.round(road.widthM / 3.3));
      const laneW = road.widthM / lanes;
      const lane = kind === 'bus' || kind === 'auto' ? 0 : this.rng.int(0, lanes);
      const jitter = kind === 'bike' ? this.rng.range(-0.25, 0.25) * laneW : 0;
      return -hw + laneW * (lane + 0.5) + jitter;
    }
    // two-way: keep left half
    const centre = -hw / 2;
    const jitter = kind === 'bike' ? this.rng.range(-hw / 4 + w, hw / 4 - w) : 0;
    return Math.max(-hw + w / 2 + 0.3, Math.min(-w / 2 - 0.2, centre + jitter));
  }

  spawnAround(px: number, pz: number, pheading: number, maxActors = TRAFFIC.maxActors): void {
    const want = Math.round(maxActors * this.density);
    let attempts = 0;
    while (this.actors.length < want && attempts++ < 12) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(TRAFFIC.minSpawnDistance, TRAFFIC.spawnRadius);
      const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
      const s = this.world.roads.surface(x, z, { margin: 0 });
      if (!s) continue;
      // avoid spawning in the player's near forward view (no pop-in in stopping distance)
      const [fx, fz] = forwardOf(pheading);
      const ahead = (x - px) * fx + (z - pz) * fz;
      if (ahead > 0 && ahead < 120 && Math.abs((x - px) * -fz + (z - pz) * fx) < 25) continue;
      if (this.reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 8)) continue;
      const dirs = [`${s.roadId}:f`, `${s.roadId}:b`].filter((d) => this.world.nav.edges.has(d));
      if (!dirs.length) continue;
      const edge = this.rng.pick(dirs);
      const e = this.world.nav.edges.get(edge)!;
      const along = e.forward ? s.along : e.lengthM - s.along;
      const roll = this.rng.next();
      const kind: ActorKind = roll < 0.36 ? 'car' : roll < 0.66 ? 'bike' : roll < 0.86 ? 'auto' : roll < 0.94 ? 'bus' : 'truck';
      const road = this.world.roads.roads.get(e.roadId)!;
      if ((kind === 'bus' || kind === 'truck') && road.widthM < 7) continue;
      const d = this.dims(kind);
      if (this.actors.some((a) => a.edge === edge && Math.abs(a.along - along) < (a.length + d.length) / 2 + 4)) continue;
      const lane = this.laneFor(edge, kind);
      const p = this.pose(edge, along, lane);
      const a: Actor = {
        id: this.nextId++, kind, edge, along, speed: d.vmax * 0.7, lateral: lane, laneLateral: lane,
        vmax: d.vmax * this.rng.range(0.8, 1.05), length: d.length, width: d.width, height: d.height,
        state: 'drive', stateTicks: 0, waitTicks: 0, braking: false, ...p, px: p.x, pz: p.z, py: p.y, pheading: p.heading,
      };
      this.actors.push(a);
    }
    const wantPeds = Math.round(TRAFFIC.maxPedestrians * this.density);
    attempts = 0;
    while (this.peds.length < wantPeds && attempts++ < 8) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(40, 160);
      const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
      const s = this.world.roads.surface(x, z, { margin: 0 });
      if (!s) continue;
      const side: 1 | -1 = this.rng.next() < 0.5 ? 1 : -1;
      const ped: Pedestrian = { id: this.nextId++, edge: s.roadId, along: s.along, side, dir: this.rng.next() < 0.5 ? 1 : -1, speed: this.rng.range(1.0, 1.5), state: 'walk', stateTicks: 0, crossT: 0, x, z, y: s.elevation, heading: 0, px: x, pz: z, pheading: 0 };
      this.placePed(ped);
      ped.px = ped.x; ped.pz = ped.z;
      this.peds.push(ped);
    }
  }

  private placePed(p: Pedestrian) {
    const road = this.world.roads.roads.get(p.edge)!;
    const pt = this.world.roads.pointAlong(p.edge, p.along);
    const [fx, fz] = forwardOf(pt.heading);
    const hw = road.widthM / 2;
    let lat: number;
    if (p.state === 'cross') lat = p.side * (hw + 1.4) * (1 - 2 * p.crossT);
    else lat = p.side * (hw + 1.4);
    p.x = pt.x + -fz * lat; p.z = pt.z + fx * lat; p.y = pt.y;
    p.heading = p.state === 'cross' ? wrapAngle(pt.heading + (p.side > 0 ? Math.PI / 2 : -Math.PI / 2)) : (p.dir > 0 ? pt.heading : wrapAngle(pt.heading + Math.PI));
  }

  /** IDM-style follow on own edge and the next; includes the player as a leader when ahead in lane */
  step(player: { x: number; z: number; y: number; speed: number; heading: number; airborne: boolean }): void {
    this.tickCount++;
    const dt = TICK_SECONDS;
    const nav = this.world.nav;
    // despawn far actors (outside interaction horizon only)
    this.actors = this.actors.filter((a) => Math.hypot(a.x - player.x, a.z - player.z) < TRAFFIC.despawnRadius);
    this.peds = this.peds.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < TRAFFIC.despawnRadius - 60);
    // stable update order by id (M12)
    this.actors.sort((a, b) => a.id - b.id);
    for (const a of this.actors) {
      a.px = a.x; a.pz = a.z; a.py = a.y; a.pheading = a.heading;
      const e = nav.edges.get(a.edge)!;
      // gap to leader
      let gap = Infinity, leaderSpeed = 0;
      for (const b of this.actors) {
        if (b === a) continue;
        let d: number | null = null;
        if (b.edge === a.edge && b.along > a.along && Math.abs(b.lateral - a.lateral) < (a.width + b.width) / 2 + 0.3) d = b.along - a.along;
        else if (e.next.includes(b.edge) && Math.abs(b.lateral - a.lateral) < (a.width + b.width) / 2 + 0.6) d = e.lengthM - a.along + b.along;
        if (d !== null) { d -= (a.length + b.length) / 2; if (d < gap) { gap = d; leaderSpeed = b.speed; } }
      }
      if (!player.airborne) {
        const [fx, fz] = forwardOf(a.heading);
        const dx = player.x - a.x, dz = player.z - a.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
        const sameDir = Math.abs(wrapAngle(player.heading - a.heading)) < 1.0;
        // follow the player when travelling the same way; for crossing conflicts only avoid imminent contact
        if (ahead > 0 && side < a.width / 2 + 1.3 && (sameDir ? ahead < 40 : ahead < a.length / 2 + 6)) { const d = ahead - (a.length / 2 + 2.0); if (d < gap) { gap = d; leaderSpeed = sameDir ? Math.max(0, player.speed) : 0; } }
      }
      // junction yield: approaching a junction node with a conflicting actor already inside it
      const distToEnd = e.lengthM - a.along;
      a.state = a.state === 'curb' ? 'curb' : 'drive';
      if (distToEnd < 12 && this.world.core.junctions.length) {
        const conflict = this.actors.some((b) => b !== a && b.id < a.id && b.edge !== a.edge && nav.edges.get(b.edge)!.toNode === e.toNode && nav.edges.get(b.edge)!.lengthM - b.along < 8 && b.speed > 0.5);
        if (conflict && a.waitTicks < 4 * SIM_HZ) { a.state = 'yield'; gap = Math.min(gap, Math.max(0, distToEnd - 6)); leaderSpeed = 0; a.waitTicks++; }
        else if (!conflict) a.waitTicks = 0;
        // waitTicks >= 4 s: deadlock breaker — proceed (M10)
      }
      // autos: occasional curb stop with readable intent (drift to kerb, brake lights)
      if (a.kind === 'auto' && a.state === 'drive' && this.rng.next() < 0.0008) { a.state = 'curb'; a.stateTicks = 0; }
      let targetV = a.vmax;
      let targetLat = a.laneLateral;
      if (a.state === 'curb') {
        a.stateTicks++;
        const road = this.world.roads.roads.get(e.roadId)!;
        targetLat = -road.widthM / 2 + a.width / 2 + 0.3;
        if (a.stateTicks > 60) targetV = 0;
        if (a.stateTicks > 60 + 4 * SIM_HZ) { a.state = 'drive'; a.stateTicks = 0; }
      }
      // IDM
      const s0 = 2.0, T = 1.2, b = 3.0;
      const sStar = s0 + Math.max(0, a.speed * T + (a.speed * (a.speed - leaderSpeed)) / (2 * Math.sqrt(this.dims(a.kind).accel * b)));
      let acc = this.dims(a.kind).accel * (1 - Math.pow(a.speed / Math.max(0.1, targetV), 4) - (gap < Infinity ? Math.pow(sStar / Math.max(0.1, gap), 2) : 0));
      acc = Math.max(-8, Math.min(this.dims(a.kind).accel, acc));
      a.braking = acc < -0.8 || a.speed < 0.3;
      a.speed = Math.max(0, a.speed + acc * dt);
      if (gap < 0.3) a.speed = 0;
      a.lateral += Math.max(-0.6 * dt, Math.min(0.6 * dt, targetLat - a.lateral));
      a.along += a.speed * dt;
      while (a.along > nav.edges.get(a.edge)!.lengthM) {
        const cur = nav.edges.get(a.edge)!;
        const opts = cur.next;
        if (!opts.length) { a.along = cur.lengthM; a.speed = 0; (a as any).exited = true; break; } // leaves the acquired area
        // prefer straight continuation; seeded choice among others
        const straight = nav.straightestNext(a.edge);
        const nxt = this.rng.next() < 0.65 && straight ? straight : this.rng.pick(opts);
        a.along -= cur.lengthM;
        a.edge = nxt;
        a.laneLateral = this.laneFor(nxt, a.kind);
        a.waitTicks = 0;
      }
      const p = this.pose(a.edge, a.along, a.lateral);
      a.x = p.x; a.z = p.z; a.y = p.y; a.heading = p.heading;
    }
    // pathological deadlock recovery (M10): an actor stalled > 10 s is recycled (it "turns off" out of the scene);
    // stalls caused by an intentional curb stop are excluded. Logged for diagnostics.
    for (const a of this.actors) {
      a.stalledTicks = a.speed < 0.2 && a.state !== 'curb' ? (a.stalledTicks ?? 0) + 1 : 0;
      if (a.stalledTicks > 10 * SIM_HZ) { (a as any).exited = true; this.log.push(`deadlock-recycle ${a.id} ${a.kind} ${a.edge}`); if (this.log.length > 100) this.log.shift(); }
    }
    this.actors = this.actors.filter((a) => !(a as any).exited);
    // pedestrians: walk footpaths; occasionally wait at the edge, then cross (readable intent)
    this.peds.sort((a, b) => a.id - b.id);
    for (const p of this.peds) {
      p.px = p.x; p.pz = p.z; p.pheading = p.heading;
      const len = this.world.roads.roadLength(p.edge);
      p.stateTicks++;
      if (p.state === 'walk') {
        p.along += p.dir * p.speed * dt;
        if (p.along < 0 || p.along > len) { p.dir = (p.dir * -1) as 1 | -1; p.along = Math.max(0, Math.min(len, p.along)); }
        if (p.stateTicks > 5 * SIM_HZ && this.rng.next() < 0.002) { p.state = 'wait'; p.stateTicks = 0; }
      } else if (p.state === 'wait') {
        // wait for a gap: no actor on this road within 30 m
        const clear = !this.actors.some((a) => nav.edges.get(a.edge)!.roadId === p.edge && Math.hypot(a.x - p.x, a.z - p.z) < 30) && Math.hypot(player.x - p.x, player.z - p.z) > 35;
        if (p.stateTicks > 90 && clear) { p.state = 'cross'; p.stateTicks = 0; p.crossT = 0; }
        if (p.stateTicks > 20 * SIM_HZ) { p.state = 'walk'; p.stateTicks = 0; }
      } else {
        const road = this.world.roads.roads.get(p.edge)!;
        p.crossT += (p.speed * dt) / (road.widthM + 2.8);
        if (p.crossT >= 1) { p.crossT = 0; p.side = (p.side * -1) as 1 | -1; p.state = 'walk'; p.stateTicks = 0; }
      }
      this.placePed(p);
    }
  }

  contacts(x: number, z: number, y: number, h: number, r: number, out: Contact[]): Contact[] {
    for (const a of this.actors) {
      if (y >= a.y + a.height || y + h <= a.y) continue;
      const [fx, fz] = forwardOf(a.heading);
      const n = Math.max(1, Math.round(a.length / a.width));
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : -a.length / 2 + a.width / 2 + (i * (a.length - a.width)) / (n - 1);
        const cx = a.x + fx * off, cz = a.z + fz * off;
        const d = Math.hypot(x - cx, z - cz);
        const rr = a.width / 2 + r;
        if (d < rr) {
          const l = d || 1;
          // coming down onto the top of a vehicle: a roof is never a landing surface (F09)
          const fromAbove = y > a.y + a.height - 0.9;
          out.push({ id: `actor_${a.id}`, kind: 'vehicle', nx: (x - cx) / l, nz: (z - cz) / l, depth: fromAbove ? a.y + a.height - y : rr - d, vertical: fromAbove ? 'above' : undefined });
          break;
        }
      }
    }
    for (const p of this.peds) {
      if (y >= p.y + 1.8 || y + h <= p.y) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < r + 0.3) { const l = d || 1; out.push({ id: `ped_${p.id}`, kind: 'pedestrian', nx: (x - p.x) / l, nz: (z - p.z) / l, depth: r + 0.3 - d }); }
    }
    return out;
  }

  /** rolling forecast, ~2.5 s horizon; a forecast, not a guarantee (MASTER §12.5) */
  occupancy(x: number, z: number, r: number): number {
    let occ = 0;
    for (const a of this.actors) {
      for (const t of [0, 1.25, 2.5]) {
        const ahead = this.world.nav.advance(a.edge, a.along, a.speed * t);
        const d = Math.hypot(ahead.x - x, ahead.z - z);
        if (d < r + a.length / 2) occ = Math.max(occ, t === 0 ? 1 : 0.6);
        else if (d < r + a.length / 2 + 4) occ = Math.max(occ, 0.3);
      }
    }
    return occ;
  }

  snapshot() {
    return { nextId: this.nextId, tick: this.tickCount, actors: this.actors.map((a) => ({ ...a })), peds: this.peds.map((p) => ({ ...p })) };
  }
  restore(s: ReturnType<TrafficSystem['snapshot']>) {
    this.nextId = s.nextId; this.tickCount = s.tick; this.actors = s.actors.map((a) => ({ ...a })); this.peds = s.peds.map((p) => ({ ...p }));
  }
}

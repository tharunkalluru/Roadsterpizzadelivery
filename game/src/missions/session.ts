import { CONTACT, FLIGHT, MISSION, SIM_HZ, TRAFFIC } from '../config/gameplay';
import { RngStreams } from '../core/rng';
import { FlightLedger } from '../player/flightLedger';
import { Player, type PlayerEvent, type TickInput, type PlayerSnapshot } from '../player/player';
import { TrafficSystem } from '../traffic/traffic';
import type { WorldPhysics } from '../world/collision';
import type { DeliveryLocation, Vec2 } from '../world/schema';
import { nextManeuver, type Maneuver } from '../world/nav';
import { wrapAngle } from '../world/roadIndex';
import type { MissionDef, Outcome, ResultSummary } from './types';

export const WORLD_VERSION_KEY = 'hyd-uppal-tarnaka@v1';
export const BUILD_VERSION = '0.1.0';
export const CHECKPOINT_SCHEMA = 1;

function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Anchor { x: number; z: number; heading: number; roadId: string | null; tick: number }

export type SessionPhase = 'READY' | 'PLAYING' | 'RECOVERING' | 'ENDED';

export interface SessionNotice { text: string; kind: 'info' | 'warn' | 'bad' | 'good'; tick: number }

/**
 * One delivery run (MASTER §10, §13, §15). Owns the authoritative mission clock and ledger.
 * Tick order: player.step (inputs→metering→motion→contacts→surface) → traffic.step →
 * contact consequences → mission triggers (delivery hold) → penalties → outcome
 * (critical contact > success > deadline/cargo failure on the same tick).
 */
export class Session {
  readonly runId: string;
  readonly rng: RngStreams;
  readonly player: Player;
  readonly traffic: TrafficSystem;
  phase: SessionPhase = 'READY';
  tick = 0;
  elapsedTicks = 0;
  penaltyTicks = 0;
  cargo = 100;
  stopIndex = 0;
  holdTicks = 0;
  holdActive = false;
  private holdArmed = true;
  outcome: Outcome | null = null;
  recoveries = 0;
  penalties: { reason: string; seconds: number; cargo: number }[] = [];
  anchors: Anchor[] = [];
  route: string[] = [];
  routeIdx = 0;
  routeAlong = 0;
  maneuver: Maneuver | null = null;
  wrongWay = false;
  offRouteTicks = 0;
  /** metres driven continuously on non-routable boundary roads */
  boundaryDist = 0;
  outOfArea: 'ok' | 'warn' = 'ok';
  notices: SessionNotice[] = [];
  pendingRecovery: { reason: string; cargoCost: number } | null = null;
  distanceTravelled = 0;
  resumed = false;
  debugUsed = false;
  holdHint: string | null = null;
  lastDenial: string | null = null;
  private lastEdge: string | null = null;
  eventLog: { tick: number; e: string }[] = [];
  /** active scenario encounters (bounded: at most TRAFFIC.maxConflictEvents) */
  encounters: { id: string; kind: 'queue'; edge: string; untilTick: number; why: string }[] = [];
  nextEncounterTick = 20 * SIM_HZ;

  constructor(public world: WorldPhysics, public mission: MissionDef, opts: { runId?: string; seed?: number; trafficEnabled?: boolean } = {}) {
    this.runId = opts.runId ?? `run_${mission.id}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.rng = new RngStreams(opts.seed ?? mission.seed);
    this.player = new Player(world, new FlightLedger(mission.flightSeconds));
    this.traffic = new TrafficSystem(world, this.rng.traffic);
    this.traffic.density = mission.traffic === 'light' ? 0.5 : mission.traffic === 'busy' ? 1.0 : 0.75;
    if (opts.trafficEnabled === false) this.traffic.density = 0;
    this.player.dyn = this.traffic;
    const pickup = this.delivery(mission.pickupId);
    const start = this.stagingPose(pickup);
    this.player.place(start.x, start.z, start.heading, pickup.roadId);
    this.reroute();
  }

  delivery(id: string): DeliveryLocation {
    const d = this.world.core.deliveries.find((q) => q.id === id);
    if (!d) throw new Error(`unknown delivery ${id}`);
    return d;
  }

  get currentStop(): DeliveryLocation | null {
    return this.stopIndex < this.mission.stops.length ? this.delivery(this.mission.stops[this.stopIndex]) : null;
  }

  /** staging pose: on the approach carriageway at the pickup's curb entrance, facing travel */
  stagingPose(d: DeliveryLocation) {
    let cx = 0, cz = 0;
    for (const [x, z] of d.stopPolygon) { cx += x; cz += z; }
    cx /= d.stopPolygon.length; cz /= d.stopPolygon.length;
    return { x: cx, z: cz, heading: d.facingHeading };
  }

  get chargedTicks(): number { return this.elapsedTicks + this.penaltyTicks; }
  get deadlineTicks(): number { return this.mission.deadlineSeconds * SIM_HZ; }
  get remainingTicks(): number { return this.deadlineTicks - this.chargedTicks; }

  start(): void {
    if (this.phase !== 'READY') return;
    this.phase = 'PLAYING';
    this.traffic.spawnAround(this.player.x, this.player.z, this.player.heading);
    this.notify('Parcel collected. Go!', 'good');
  }

  notify(text: string, kind: SessionNotice['kind'] = 'info') {
    this.notices.push({ text, kind, tick: this.tick });
    if (this.notices.length > 8) this.notices.shift();
  }

  private log(e: string) { this.eventLog.push({ tick: this.tick, e }); if (this.eventLog.length > 400) this.eventLog.shift(); }

  /** distance along a directed approach edge at which the stop polygon centre lies */
  stopAlong(stop: DeliveryLocation, edgeId: string): number {
    const e = this.world.nav.edges.get(edgeId);
    if (!e) return 0;
    const c = this.stagingPose(stop);
    const segs = this.world.roads.segmentsByRoad.get(e.roadId) ?? [];
    let best = Infinity, along = 0;
    for (const sg of segs) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
      let t = ((c.x - sg.ax) * dx + (c.z - sg.az) * dz) / (sg.len * sg.len);
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(sg.ax + dx * t - c.x, sg.az + dz * t - c.z);
      if (d < best) { best = d; along = sg.cumStart + t * sg.len; }
    }
    return e.forward ? along : e.lengthM - along;
  }

  reroute(): void {
    const stop = this.currentStop;
    const p = this.player;
    if (!stop || !p.surface) { this.route = []; return; }
    const d = this.world.nav.directedFor(p.surface, p.heading);
    const passed = stop.approachEdges.includes(d.id) && d.along > this.stopAlong(stop, d.id) + 8;
    const r = this.world.nav.route(d.id, stop.approachEdges, d.along, passed);
    if (r) { this.route = r.path; this.routeIdx = 0; this.routeAlong = d.along; }
    else if (!this.route.length || this.world.nav.inCore(d.id)) this.route = [];
    // on a boundary road with no route back: keep the last route so guidance points to the return
  }

  /** route length remaining in metres (for HUD) */
  routeRemainingM(): number {
    if (!this.route.length) return 0;
    let d = -this.routeAlong;
    for (let i = this.routeIdx; i < this.route.length; i++) d += this.world.nav.edges.get(this.route[i])!.lengthM;
    const stop = this.currentStop;
    const last = this.route[this.route.length - 1];
    if (stop) d -= this.world.nav.edges.get(last)!.lengthM - this.stopAlong(stop, last);
    return Math.max(0, d);
  }

  step(input: TickInput): void {
    if (this.phase !== 'PLAYING') return;
    this.tick++;
    const p = this.player;
    const stop = this.currentStop;
    const holdInput: TickInput = { ...input, holdStop: this.holdActive };
    if (this.holdActive && input.accel) {
      // explicit resume-driving action cancels the hold and restores control
      this.holdActive = false; this.holdTicks = 0; this.holdArmed = false; holdInput.holdStop = false;
      this.notify('Delivery hold cancelled', 'info');
    }
    const px = p.x, pz = p.z;
    const events = p.step(holdInput);
    this.distanceTravelled += Math.hypot(p.x - px, p.z - pz);
    this.elapsedTicks++;
    this.traffic.reserved = stop ? [{ x: stop.entrance[0], z: stop.entrance[1], r: 12 }] : [];
    if (p.isAirborne && p.forecast.state !== 'hidden') this.traffic.reserved.push({ x: p.forecast.x, z: p.forecast.z, r: 10 });
    this.traffic.step({ x: p.x, z: p.z, y: p.y, speed: p.speed, heading: p.heading, airborne: p.isAirborne });
    if (this.tick % 30 === 0) this.traffic.spawnAround(p.x, p.z, p.heading);
    this.scheduleEncounters();

    // consequences of player events
    let criticalThisTick = false;
    for (const e of events) this.handleEvent(e, () => { criticalThisTick = true; });

    // guidance + anchors
    this.updateGuidance();
    if (p.move === 'GROUNDED' && p.surface?.onCarriageway && p.speed > 1 && !this.wrongWay && this.tick % MISSION.anchorIntervalTicks === 0
      && this.world.nav.inCore(this.world.nav.directedFor(p.surface, p.heading).id)) {
      this.anchors.push({ x: p.x, z: p.z, heading: p.heading, roadId: p.roadId, tick: this.tick });
      if (this.anchors.length > 30) this.anchors.shift();
    }
    // boundary (only when grounded or airborne off the network)
    const s = p.surface;
    const onBoundary = !!s && !p.isAirborne && !this.world.nav.inCore(this.world.nav.directedFor(s, p.heading).id);
    if (onBoundary) this.boundaryDist += Math.hypot(p.x - px, p.z - pz); else if (s) this.boundaryDist = 0;
    const wide = s ?? this.world.roads.surface(p.x, p.z, { margin: 60 });
    const off = wide ? Math.max(0, wide.dist - wide.halfWidth) : Infinity;
    if (!criticalThisTick && off > MISSION.outOfAreaRecoverM && !p.isAirborne) {
      this.requestRecovery('Outside delivery area', 0);
      criticalThisTick = true;
    } else if (!criticalThisTick && onBoundary && (this.boundaryDist > 150 || (Math.abs(p.speed) < 0.3 && this.boundaryDist > 20))) {
      // continued past the supported network (boundary roads lead out of the acquired area)
      this.requestRecovery('Outside delivery area', 0);
      criticalThisTick = true;
    } else if (off > MISSION.outOfAreaWarnM || onBoundary) {
      if (this.outOfArea !== 'warn') this.notify('Outside delivery area. Follow the marked return.', 'warn');
      this.outOfArea = 'warn';
    } else this.outOfArea = 'ok';

    // delivery hold (mission trigger)
    let delivered = false;
    this.holdHint = null;
    if (stop && !criticalThisTick) {
      const inside = pointInPoly(p.x, p.z, stop.stopPolygon);
      if (!inside) { this.holdActive = false; this.holdTicks = 0; this.holdArmed = true; }
      else {
        const grounded = p.move === 'GROUNDED';
        const levelOk = p.level === stop.level;
        const dir = s ? this.world.nav.directedFor(s, p.heading) : null;
        const approachOk = (dir && stop.approachEdges.includes(dir.id)) || Math.abs(wrapAngle(p.heading - stop.facingHeading)) < Math.PI / 3;
        if (!grounded) this.holdHint = p.isAirborne ? 'Land on the road to deliver' : 'Confirming landing…';
        else if (!levelOk) this.holdHint = 'Wrong road level for this entrance';
        else if (!approachOk) this.holdHint = 'Wrong side — approach from the marked direction';
        else if (!this.holdActive && this.holdArmed && Math.abs(p.speed) < MISSION.holdSpeed) { this.holdActive = true; this.holdTicks = 0; }
        else if (!this.holdActive) this.holdHint = 'Stop here to deliver';
        if (this.holdActive) {
          if (!grounded || !levelOk || !approachOk) { this.holdActive = false; this.holdTicks = 0; }
          else if (Math.abs(p.speed) < MISSION.holdSpeed) { this.holdTicks++; if (this.holdTicks >= MISSION.holdTicks) delivered = true; }
        }
      }
      if (Math.abs(p.speed) > 2) this.holdArmed = true;
    }

    // outcome — critical contact > success > deadline/cargo
    if (this.cargo <= this.mission.cargo.failThreshold) { this.end({ success: false, reason: 'Cargo damaged beyond delivery', code: 'cargo' }); return; }
    if (delivered && !criticalThisTick && this.chargedTicks <= this.deadlineTicks) {
      this.log(`delivered ${stop!.id}`);
      this.holdActive = false; this.holdTicks = 0;
      this.stopIndex++;
      if (this.stopIndex >= this.mission.stops.length) { this.end({ success: true, reason: 'Delivered' }); return; }
      this.notify(`Stop ${this.stopIndex} delivered. Next: ${this.currentStop!.label}`, 'good');
      this.reroute();
    }
    if (this.chargedTicks > this.deadlineTicks) { this.end({ success: false, reason: 'Time ran out before delivery.', code: 'deadline' }); return; }
  }

  /**
   * Bounded encounter scheduler (MASTER §14, S04/M07): seeded from the traffic stream; places a
   * temporary queue on a main-road edge of the route 160–260 m ahead (outside stopping distance and
   * the near view). Every queue releases on a timer, so waiting/braking always remains a feasible
   * response; flight is optional and never assumed. Logged with its reason.
   */
  private scheduleEncounters() {
    this.encounters = this.encounters.filter((e) => e.untilTick > this.tick);
    if (this.mission.traffic === 'light' || this.mission.practice) return;
    if (this.tick < this.nextEncounterTick || this.encounters.length >= TRAFFIC.maxConflictEvents || !this.route.length) return;
    const r = this.rng.traffic;
    this.nextEncounterTick = this.tick + Math.round(r.range(25, 45) * SIM_HZ);
    const p = this.player;
    const ahead = this.world.nav.advance(this.route[this.routeIdx], this.routeAlong, r.range(160, 260), this.route);
    const e = this.world.nav.edges.get(ahead.id)!;
    const road = this.world.roads.roads.get(e.roadId)!;
    if (!/^(trunk|primary|secondary|tertiary)/.test(road.highway) || ahead.along < 25) return;
    const stop = this.currentStop;
    if (stop && Math.hypot(stop.entrance[0] - ahead.x, stop.entrance[1] - ahead.z) < 60) return;
    const hold = Math.round(r.range(14, 24) * SIM_HZ);
    const id = `enc_${this.tick}`;
    const n = this.traffic.spawnQueue(ahead.id, ahead.along, r.int(3, 6), hold, id);
    if (n > 0) {
      const why = `queue x${n} on ${road.name ?? road.highway} ${Math.round(Math.hypot(ahead.x - p.x, ahead.z - p.z))} m ahead; releases in ${(hold / SIM_HZ).toFixed(0)} s; responses: wait, side route, or optional flight (${p.ledger.remainingSeconds.toFixed(1)} s left)`;
      this.encounters.push({ id, kind: 'queue', edge: ahead.id, untilTick: this.tick + hold + 120, why });
      this.log(`encounter ${id}: ${why}`);
    }
  }

  private handleEvent(e: PlayerEvent, critical: () => void) {
    const p = this.player;
    this.log(e.type + ('reason' in e ? `:${e.reason}` : ''));
    switch (e.type) {
      case 'launch': this.notify(`Flight ${p.ledger.remainingSeconds.toFixed(1)} s left — use it together or in parts`, 'info'); break;
      case 'launch_denied': this.lastDenial = e.reason; this.notify(e.reason === 'Flight power used' ? 'Flight power used. Keep driving.' : e.reason, 'warn'); break;
      case 'land_denied': this.notify(`Can't land here: ${e.reason}`, 'warn'); break;
      case 'descent': if (e.auto) this.notify('Landing soon', 'warn'); break;
      case 'takeoff_abort': this.notify(`Takeoff aborted: ${e.reason}`, 'warn'); break;
      case 'touchdown':
        if (e.hard) { this.applyCargo(CONTACT.hardLandingCargo, 'Hard landing'); }
        break;
      case 'contact':
        if (e.severity === 'light') this.applyCargo(CONTACT.lightCargo, `Bump: ${e.kind}`);
        break;
      case 'crash': {
        critical();
        const cargoCost = e.reason === 'Pedestrian contact' ? CONTACT.pedestrianCargo : CONTACT.severeCargo;
        this.requestRecovery(e.reason, cargoCost);
        break;
      }
      default: break;
    }
  }

  private applyCargo(base: number, reason: string) {
    const cost = Math.round(base * this.mission.cargo.fragility * 10) / 10;
    this.cargo = Math.max(0, Math.round((this.cargo - cost) * 10) / 10);
    this.penalties.push({ reason, seconds: 0, cargo: cost });
  }

  private requestRecovery(reason: string, cargoCost: number) {
    this.phase = 'RECOVERING';
    this.player.move = 'RECOVERING';
    this.pendingRecovery = { reason, cargoCost };
    this.holdActive = false; this.holdTicks = 0;
    this.notify(`${reason} — recovering`, 'bad');
  }

  /**
   * Apply a pending recovery exactly once: previously reached anchor (no forward gain), flight
   * transaction terminated, consumed ticks preserved, +3 s ledger penalty, cargo consequence.
   * The presentation delay is wall-clock only (simulation frozen), so it is not double charged.
   */
  completeRecovery(): void {
    if (!this.pendingRecovery) return;
    const { reason, cargoCost } = this.pendingRecovery;
    this.pendingRecovery = null;
    const anchor = this.chooseAnchor();
    this.player.recoverTo(anchor);
    this.boundaryDist = 0;
    this.recoveries++;
    this.penaltyTicks += MISSION.recoveryPenaltyTicks;
    this.penalties.push({ reason, seconds: MISSION.recoveryPenaltyTicks / SIM_HZ, cargo: 0 });
    if (cargoCost > 0) this.applyCargo(cargoCost, reason);
    this.phase = 'PLAYING';
    this.reroute();
    if (this.cargo <= this.mission.cargo.failThreshold) this.end({ success: false, reason: 'Cargo damaged beyond delivery', code: 'cargo' });
    else if (this.chargedTicks > this.deadlineTicks) this.end({ success: false, reason: 'Time ran out before delivery.', code: 'deadline' });
  }

  private chooseAnchor(): Anchor {
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      const pedNear = this.traffic.peds.some((q) => Math.hypot(q.x - a.x, q.z - a.z) < 4);
      if (!pedNear && this.traffic.occupancy(a.x, a.z, 3) < 0.85 && !this.world.buildingAt(a.x, a.z)) return a;
    }
    const d = this.delivery(this.mission.pickupId);
    const s = this.stagingPose(d);
    return { x: s.x, z: s.z, heading: s.heading, roadId: d.roadId, tick: 0 };
  }

  /** manual stuck recovery (player request) */
  requestManualRecovery(): void {
    if (this.phase === 'PLAYING') this.requestRecovery('Manual recovery', 0);
  }

  private updateGuidance() {
    const p = this.player;
    const s = p.surface;
    if (!s) return;
    if (p.isAirborne) {
      // keep route progress while flying over route edges (no rerouting until touchdown)
      const da = this.world.nav.directedFor(s, p.heading);
      const ia = this.route.indexOf(da.id, this.routeIdx);
      if (ia >= 0 && ia <= this.routeIdx + 3) { this.routeIdx = ia; this.routeAlong = da.along; }
      if (this.route.length) {
        const m = nextManeuver(this.world.nav, this.route, this.routeIdx, this.routeAlong);
        const rem = this.routeRemainingM();
        this.maneuver = m.kind === 'arrive' || m.distanceM > rem ? { kind: 'arrive', distanceM: rem, roadName: null } : m;
      }
      return;
    }
    let d = this.world.nav.directedFor(s, p.heading);
    // route-aware matching with hysteresis: at junctions prefer the current/next route edge when we are on it
    if (this.route.length && !this.route.slice(this.routeIdx, this.routeIdx + 2).includes(d.id)) {
      for (const rid of this.route.slice(this.routeIdx, this.routeIdx + 2)) {
        const e = this.world.nav.edges.get(rid)!;
        const hit = this.world.roads.surface(p.x, p.z, { preferRoadId: e.roadId, margin: 2 });
        if (hit && hit.roadId === e.roadId && hit.dist <= hit.halfWidth + 1.5) {
          const dd = this.world.nav.directedFor(hit, p.heading);
          if (dd.id === rid) { d = dd; break; }
        }
      }
    }
    this.wrongWay = d.wrongWay && Math.abs(p.speed) > 1.5;
    if (!this.route.length) { if (this.tick % 60 === 0) this.reroute(); return; }
    const idx = this.route.indexOf(d.id, this.routeIdx);
    const stop = this.currentStop;
    const passedStop = idx === this.route.length - 1 && !!stop && d.along > this.stopAlong(stop, d.id) + 8 && !this.holdActive;
    if (passedStop) {
      this.offRouteTicks++;
      this.reroute();
      this.log('reroute:passed');
    } else if (idx >= 0) {
      this.routeIdx = idx; this.routeAlong = d.along; this.offRouteTicks = 0;
    } else if (d.id !== this.lastEdge) {
      // missed turn / deviation: recalculate from the actual edge on real connections
      this.offRouteTicks++;
      this.reroute();
      this.log('reroute');
    }
    this.lastEdge = d.id;
    if (this.route.length) {
      const m = nextManeuver(this.world.nav, this.route, this.routeIdx, this.routeAlong);
      const rem = this.routeRemainingM();
      this.maneuver = m.kind === 'arrive' || m.distanceM > rem ? { kind: 'arrive', distanceM: rem, roadName: null } : m;
    }
  }

  abandon(): void { if (this.phase !== 'ENDED') this.end({ success: false, reason: 'Delivery abandoned', code: 'abandoned' }); }

  private end(o: Outcome) {
    this.outcome = o;
    this.phase = 'ENDED';
    this.holdActive = false;
    this.log(`end:${o.reason}`);
  }

  results(): ResultSummary {
    const l = this.player.ledger;
    const o = this.outcome ?? { success: false, reason: 'In progress', code: 'abandoned' as const };
    const charged = this.chargedTicks / SIM_HZ;
    const breakdown: { label: string; value: number }[] = [];
    if (o.success) {
      breakdown.push({ label: 'Delivered', value: 1000 });
      breakdown.push({ label: 'Time left ×5/s', value: Math.round(5 * Math.max(0, this.mission.deadlineSeconds - charged)) });
      breakdown.push({ label: 'Cargo ×3', value: Math.round(this.cargo * 3) });
      breakdown.push({ label: 'Recoveries ×−50', value: -50 * this.recoveries });
    }
    const score = breakdown.reduce((a, b) => a + b.value, 0);
    return {
      missionId: this.mission.id, runId: this.runId, seed: this.rng.seed, outcome: o,
      activeSeconds: this.elapsedTicks / SIM_HZ, penaltySeconds: this.penaltyTicks / SIM_HZ, chargedSeconds: charged,
      deadlineSeconds: this.mission.deadlineSeconds, cargo: this.cargo, routeDistanceM: Math.round(this.distanceTravelled),
      flightInitialSeconds: l.allocationSeconds, flightUsedSeconds: l.consumedSeconds, flightLeftSeconds: l.remainingSeconds,
      launches: l.launches, recoveries: this.recoveries, penalties: this.penalties.slice(), score, scoreBreakdown: breakdown,
      resumed: this.resumed, debugUsed: this.debugUsed,
      comparableKey: `${this.mission.id}@v${this.mission.version}|${WORLD_VERSION_KEY}|seed:${this.rng.seed}|traffic:${this.mission.traffic}`,
    };
  }

  // ------------------------------------------------------------- checkpoints (F21, M13)
  checkpoint() {
    return {
      schema: CHECKPOINT_SCHEMA, build: BUILD_VERSION, world: WORLD_VERSION_KEY,
      missionId: this.mission.id, missionVersion: this.mission.version, runId: this.runId,
      tick: this.tick, elapsedTicks: this.elapsedTicks, penaltyTicks: this.penaltyTicks, cargo: this.cargo,
      stopIndex: this.stopIndex, recoveries: this.recoveries, penalties: this.penalties, anchors: this.anchors,
      distance: this.distanceTravelled, player: this.player.snapshot() as PlayerSnapshot,
      rng: this.rng.snapshot(), traffic: this.traffic.snapshot(), phase: this.phase === 'RECOVERING' ? 'PLAYING' : this.phase,
      encounters: this.encounters, nextEncounterTick: this.nextEncounterTick, seed: this.rng.seed,
      pendingRecovery: this.pendingRecovery,
    };
  }

  static fromCheckpoint(world: WorldPhysics, mission: MissionDef, cp: ReturnType<Session['checkpoint']>, exact = true): Session {
    if (cp.schema !== CHECKPOINT_SCHEMA || cp.world !== WORLD_VERSION_KEY || cp.missionId !== mission.id || cp.missionVersion !== mission.version) {
      throw new Error('Incompatible checkpoint');
    }
    // validate the ledger against the advertised contract (a save can never grant fuel)
    const l = cp.player?.ledger;
    const initial = mission.flightSeconds * SIM_HZ;
    if (!l || l.allocationSeconds !== mission.flightSeconds || !Number.isInteger(l.consumed) || l.consumed < 0 || l.consumed > initial) throw new Error('Incompatible checkpoint: flight ledger does not match the contract');
    if (![cp.elapsedTicks, cp.penaltyTicks, cp.cargo, cp.stopIndex].every((v) => typeof v === 'number' && isFinite(v) && v >= 0) || cp.stopIndex > mission.stops.length) throw new Error('Incompatible checkpoint: invalid mission ledger');
    const s = new Session(world, mission, { runId: cp.runId, seed: cp.seed ?? mission.seed });
    s.tick = cp.tick; s.elapsedTicks = cp.elapsedTicks; s.penaltyTicks = cp.penaltyTicks; s.cargo = cp.cargo;
    s.stopIndex = cp.stopIndex; s.recoveries = cp.recoveries; s.penalties = cp.penalties.slice(); s.anchors = cp.anchors.slice();
    s.distanceTravelled = cp.distance;
    s.rng.restore(cp.rng);
    if (Array.isArray(cp.encounters)) s.encounters = cp.encounters.map((e: any) => ({ ...e }));
    if (typeof cp.nextEncounterTick === 'number') s.nextEncounterTick = cp.nextEncounterTick;
    s.traffic.restore(cp.traffic);
    s.player.restore(cp.player);
    s.resumed = true;
    if (!exact || s.player.isAirborne || s.player.move === 'LANDING_CONFIRM' || s.player.move === 'RECOVERING') {
      // documented ground-recovery path: terminate airborne state, keep consumed ticks, no crash penalty
      const a = s.anchors.length ? s.anchors[s.anchors.length - 1] : null;
      if (a) s.player.recoverTo(a);
      else { const d = s.delivery(mission.pickupId); const st = s.stagingPose(d); s.player.recoverTo({ x: st.x, z: st.z, heading: st.heading, roadId: d.roadId }); }
    }
    s.phase = cp.pendingRecovery ? 'RECOVERING' : 'PLAYING';
    s.pendingRecovery = cp.pendingRecovery;
    if (s.pendingRecovery) s.player.move = 'RECOVERING';
    s.reroute();
    return s;
  }
}

export const RESERVE_MARGIN_TICKS = FLIGHT.uncertaintyMarginTicks;

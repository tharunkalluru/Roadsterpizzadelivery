import { FLIGHT, VEHICLE, CONTACT, SIM_HZ } from '../config/gameplay';
import { TICK_SECONDS } from '../core/clock';
import type { WorldPhysics, Contact } from '../world/collision';
import { forwardOf, wrapAngle, headingOf, type SurfaceHit } from '../world/roadIndex';
import { FlightLedger } from './flightLedger';

export type MoveState = 'GROUNDED' | 'TAKEOFF' | 'FLYING' | 'DESCENDING' | 'LANDING_CONFIRM' | 'RECOVERING';

export type DenialReason =
  | 'Low clearance'
  | 'Landing area blocked'
  | 'Not enough flight time to launch here'
  | 'Road data loading'
  | 'Flight power used'
  | 'Not on the road'
  | 'Not while reversing'
  | 'Landing not confirmed yet'
  | 'Not available now';

export interface TickInput {
  /** -1 = full left, +1 = full right */
  steer: number;
  /** ▲ accelerate (forward drive / faster flight). With no input the car brakes and holds. */
  accel: boolean;
  /** ▼ brake; held while stopped engages reverse (no separate reverse control) */
  brake: boolean;
  /** a FRESH press of the Fly/Land control on this tick (edge, never a held state) */
  flyPress: boolean;
  /** hold the car stationary for a delivery (mission sets this) */
  holdStop: boolean;
  /** Fresh E / collection button press, consumed only at an eligible stopped entrance. */
  interactPress?: boolean;
}

export const NO_INPUT: TickInput = { steer: 0, accel: false, brake: false, flyPress: false, holdStop: false };

export type PlayerEvent =
  | { type: 'launch'; transaction: number }
  | { type: 'launch_denied'; reason: DenialReason }
  | { type: 'land_denied'; reason: string }
  | { type: 'descent'; auto: boolean }
  | { type: 'takeoff_abort'; reason: string }
  | { type: 'touchdown'; hard: boolean; vy: number }
  | { type: 'landed' }
  | { type: 'support_lost' }
  | { type: 'contact'; kind: string; id: string; severity: 'light' | 'severe'; closing: number }
  | { type: 'crash'; reason: string }
  | { type: 'exhausted_unsupported' }
  | { type: 'air_edge' };

/** Dynamic actors (traffic/pedestrians) as seen by the player controller. */
export interface DynamicWorld {
  contacts(x: number, z: number, y: number, h: number, r: number, out: Contact[]): Contact[];
  /** 0..1 rolling-forecast occupancy near a point over the next few seconds */
  occupancy(x: number, z: number, r: number): number;
}

export const NO_DYNAMICS: DynamicWorld = { contacts: (_x, _z, _y, _h, _r, out) => out, occupancy: () => 0 };

export type ForecastState = 'clear' | 'uncertain' | 'blocked' | 'hidden';

export interface LandingForecast {
  state: ForecastState;
  x: number; z: number; y: number;
  reason: string | null;
  ticksToTouchdown: number;
}

export interface PlayerSnapshot {
  x: number; y: number; z: number; heading: number; speed: number; vy: number; steerAngle: number;
  move: MoveState; roadId: string | null; level: number; takeoffTicks: number; confirmTicks: number; stabilityTicks: number;
  reverseEngaged: boolean; landingSoon: boolean; ledger: ReturnType<FlightLedger['snapshot']>;
  protectedLandingUsed?: number;
}

/** ▼ must be held this long while stopped before reverse engages (no accidental reverse) */
const REVERSE_DELAY_TICKS = 18;

const AIRBORNE: ReadonlySet<MoveState> = new Set(['TAKEOFF', 'FLYING', 'DESCENDING']);

/** ticks to reach touchdown from altitude `alt` with vertical speed `vy` under the descent controller (conservative) */
export function predictTicksToTouchdown(alt: number, vy: number): number {
  const up = Math.max(0, vy);
  const stopUp = up / FLIGHT.ascentAccel;
  const extra = (up * up) / (2 * FLIGHT.ascentAccel);
  const h = Math.max(0, alt + extra);
  const t = stopUp + h / FLIGHT.descentRate;
  return Math.ceil(t * SIM_HZ) + FLIGHT.flareTicks;
}

/** ticks to climb from the ground to the minimum flight altitude */
export function predictAscentTicks(): number {
  const tAcc = FLIGHT.maxClimbRate / FLIGHT.ascentAccel;
  const dAcc = 0.5 * FLIGHT.ascentAccel * tAcc * tAcc;
  const t = dAcc >= FLIGHT.minFlightAltitude ? Math.sqrt((2 * FLIGHT.minFlightAltitude) / FLIGHT.ascentAccel) : tAcc + (FLIGHT.minFlightAltitude - dAcc) / FLIGHT.maxClimbRate;
  return Math.ceil(t * SIM_HZ);
}

/**
 * Player vehicle: arcade chassis on canonical road surfaces plus the shared-budget flight
 * state machine (MASTER §11–13). One authoritative writer for vehicle state and consumed ticks.
 *
 * Tick order (documented, F24): 1 inputs/requests → 2 flight metering → 3 controllers+integration
 * → 4 static/dynamic contacts → 5 surface/touchdown resolution → 6 auto-descent/reserve update.
 * Mission triggers, penalties and outcome are evaluated afterwards by the session.
 */
export class Player {
  x = 0; y = 0; z = 0; heading = 0; speed = 0; vy = 0; steerAngle = 0;
  prev = { x: 0, y: 0, z: 0, heading: 0 };
  move: MoveState = 'GROUNDED';
  surface: SurfaceHit | null = null;
  roadId: string | null = null;
  level = 0;
  takeoffTicks = 0;
  confirmTicks = 0;
  /** grounded stability ticks remaining after recovery/spawn before a launch is allowed */
  stabilityTicks = 0;
  reverseEngaged = false;
  landingSoon = false;
  airborneAltitude = 0;
  ledger: FlightLedger;
  events: PlayerEvent[] = [];
  forecast: LandingForecast = { state: 'hidden', x: 0, z: 0, y: 0, reason: null, ticksToTouchdown: 0 };
  reserveTicks = 0;
  protectedLandingUsed = 0;
  suspensionPitch = 0;
  suspensionRoll = 0;
  curbImpact = 0;
  wheelHeights = [0, 0, 0, 0];
  private rideHeight = 0;
  private cooldown = new Map<string, number>();
  private tick = 0;
  private contactsBuf: Contact[] = [];
  /** last horizontal position known to be inside the air envelope */
  private lastAirOk = { x: 0, z: 0 };

  constructor(public world: WorldPhysics, ledger: FlightLedger, public dyn: DynamicWorld = NO_DYNAMICS) {
    this.ledger = ledger;
  }

  get isAirborne(): boolean { return AIRBORNE.has(this.move); }
  get altitude(): number { return this.y - this.surfaceY(); }

  place(x: number, z: number, heading: number, roadId: string | null = null): void {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0; this.vy = 0; this.steerAngle = 0;
    this.roadId = roadId;
    const hint = roadId ? this.world.roads.roads.get(roadId) : undefined;
    const lvl = hint ? hint.level : 0;
    const maxY = hint ? Math.max(...hint.pointElevM, hint.elevationM) + 0.5 : 0.5;
    this.surface = this.world.roads.surface(x, z, { preferRoadId: roadId, preferLevel: lvl, maxY, margin: 4 });
    if (this.surface) { this.roadId = this.surface.roadId; this.level = this.surface.level; }
    this.y = this.surface ? this.surface.elevation : 0;
    this.move = 'GROUNDED';
    this.takeoffTicks = 0; this.confirmTicks = 0; this.stabilityTicks = FLIGHT.groundConfirmTicks;
    this.reverseEngaged = false; this.landingSoon = false;
    this.protectedLandingUsed = 0;
    this.suspensionPitch = 0; this.suspensionRoll = 0; this.curbImpact = 0; this.rideHeight = this.y;
    this.prev = { x: this.x, y: this.y, z: this.z, heading: this.heading };
    this.lastAirOk = { x, z };
    this.cooldown.clear();
  }

  private surfaceY(): number {
    return this.surface ? this.surface.elevation : 0;
  }

  private updateSurface(margin: number): void {
    const s = this.world.roads.surface(this.x, this.z, { preferRoadId: this.roadId, preferLevel: this.level, maxY: this.y + 0.3, margin, heading: Math.abs(this.speed) > 0.5 ? this.heading : undefined });
    this.surface = s;
    if (s) { this.roadId = s.roadId; if (!this.isAirborne) this.level = s.level; }
  }

  private supported(): boolean {
    const sy = this.surface ? this.surface.elevation : 0;
    return this.y <= sy + 0.05;
  }

  // ---------------------------------------------------------------- launch planning

  /** whole-car footprint sample points (corners + centre + mid-sides) at a pose */
  private footprint(x: number, z: number, h: number): [number, number][] {
    const [fx, fz] = forwardOf(h);
    const rx = -fz, rz = fx;
    const hl = VEHICLE.length / 2, hw = VEHICLE.width / 2;
    const pts: [number, number][] = [];
    for (const a of [-hl, 0, hl]) for (const b of [-hw, 0, hw]) pts.push([x + fx * a + rx * b, z + fz * a + rz * b]);
    return pts;
  }

  /** overhead-only free height (decks, bridges, gantries) along the whole footprint — drives cruise altitude */
  private overheadFree(x: number, z: number, h: number, surfY: number): number {
    let minFree = Infinity;
    for (const [px, pz] of this.footprint(x, z, h)) minFree = Math.min(minFree, this.world.overheadAt(px, pz, surfY).bottom - surfY);
    return minFree;
  }

  /** free vertical space above road surface along the whole car footprint (launch check: buildings count) */
  private clearanceAt(x: number, z: number, h: number, surfY: number): number {
    let minFree = Infinity;
    for (const [px, pz] of this.footprint(x, z, h)) {
      const o = this.world.overheadAt(px, pz, surfY);
      minFree = Math.min(minFree, o.bottom - surfY);
      const b = this.world.buildingAt(px, pz);
      if (b && b.top > surfY) minFree = 0;
    }
    return minFree;
  }

  /** predicted path point `dist` metres ahead following the road graph from the current pose */
  private aheadPoint(dist: number) {
    const s = this.surface;
    if (!s) return null;
    const d = this.world.nav.directedFor(s, this.heading);
    if (!this.world.nav.edges.has(d.id)) return null;
    return this.world.nav.advance(d.id, d.along, dist);
  }

  evaluateLaunch(): { ok: true; landing: LandingForecast } | { ok: false; reason: DenialReason } {
    if (this.move !== 'GROUNDED') return { ok: false, reason: this.move === 'LANDING_CONFIRM' ? 'Landing not confirmed yet' : 'Not available now' };
    if (this.stabilityTicks > 0) return { ok: false, reason: 'Landing not confirmed yet' };
    if (this.ledger.remainingTicks <= 0) return { ok: false, reason: 'Flight power used' };
    if (!this.supported() || !this.surface || !this.surface.onCarriageway) return { ok: false, reason: 'Not on the road' };
    if (this.speed < -0.3) return { ok: false, reason: 'Not while reversing' };
    const surfY = this.surface.elevation;
    const ascent = predictAscentTicks();
    // Affordability from the PREDICTED POST-TAKEOFF state (alt = minFlightAltitude, vy = climb rate).
    const descent = predictTicksToTouchdown(FLIGHT.minFlightAltitude, FLIGHT.maxClimbRate);
    const need = ascent + descent + FLIGHT.uncertaintyMarginTicks;
    // Whole-car clearance at the launch point and along the ascent path.
    const required = FLIGHT.minFlightAltitude + FLIGHT.carHeight + FLIGHT.overheadMargin;
    const v = Math.max(0, this.speed);
    const ascentDist = (v * ascent) / SIM_HZ;
    if (this.clearanceAt(this.x, this.z, this.heading, surfY) < required) return { ok: false, reason: 'Low clearance' };
    for (let d = 3; d <= ascentDist + 3; d += 3) {
      const p = this.aheadPoint(d);
      if (!p) break;
      if (!this.world.isLoaded(p.x, p.z)) return { ok: false, reason: 'Road data loading' };
      if (this.clearanceAt(p.x, p.z, p.heading, p.y) < required) return { ok: false, reason: 'Low clearance' };
    }
    if (need > this.ledger.remainingTicks) return { ok: false, reason: 'Not enough flight time to launch here' };
    const landDist = (v * (ascent + descent)) / SIM_HZ;
    const lp = this.aheadPoint(landDist);
    const landing = lp ? this.classifyLanding(lp.x, lp.z, lp.y, descent + ascent, this.level) : null;
    if (!landing || landing.state === 'blocked') return { ok: false, reason: landing && landing.reason === 'Road data loading' ? 'Road data loading' : 'Landing area blocked' };
    return { ok: true, landing };
  }

  private classifyLanding(x: number, z: number, yHint: number, ticks: number, level: number): LandingForecast {
    const s = this.world.roads.surface(x, z, { preferLevel: level, maxY: Math.max(yHint, this.y) + 0.5, margin: 0.2 });
    if (!this.world.isLoaded(x, z)) return { state: 'blocked', x, z, y: yHint, reason: 'Road data loading', ticksToTouchdown: ticks };
    if (!s || !s.onCarriageway) return { state: 'blocked', x, z, y: yHint, reason: 'No road surface', ticksToTouchdown: ticks };
    if (this.world.buildingAt(x, z)) return { state: 'blocked', x, z, y: s.elevation, reason: 'Building', ticksToTouchdown: ticks };
    const occ = this.dyn.occupancy(x, z, 3.0);
    if (occ > 0.85) return { state: 'blocked', x, z, y: s.elevation, reason: 'Traffic in landing area', ticksToTouchdown: ticks };
    if (occ > 0.2) return { state: 'uncertain', x, z, y: s.elevation, reason: 'Traffic nearby', ticksToTouchdown: ticks };
    return { state: 'clear', x, z, y: s.elevation, reason: null, ticksToTouchdown: ticks };
  }

  /** landing forecast if descent began now */
  private forecastNow(): LandingForecast {
    const alt = Math.max(0, this.altitude);
    const ticks = predictTicksToTouchdown(alt, this.vy);
    const v = Math.max(0, this.speed);
    const dist = (v * ticks) / SIM_HZ;
    const p = this.aheadPoint(dist);
    if (!p) {
      const [fx, fz] = forwardOf(this.heading);
      return this.classifyLanding(this.x + fx * dist, this.z + fz * dist, this.surfaceY(), ticks, this.level);
    }
    return this.classifyLanding(p.x, p.z, p.y, ticks, this.level);
  }

  // ---------------------------------------------------------------- main tick

  step(input: TickInput): PlayerEvent[] {
    this.tick++;
    this.events.length = 0;
    this.prev.x = this.x; this.prev.y = this.y; this.prev.z = this.z; this.prev.heading = this.heading;
    if (this.move === 'RECOVERING') return this.events;
    const dt = TICK_SECONDS;

    // 1. requests
    if (input.flyPress) {
      if (this.move === 'GROUNDED') {
        const ev = this.evaluateLaunch();
        if (ev.ok) {
          this.move = 'TAKEOFF';
          this.takeoffTicks = 0;
          this.protectedLandingUsed = 0;
          this.vy = 0;
          this.reverseEngaged = false; this.backHeldStopped = 0;
          this.events.push({ type: 'launch', transaction: this.ledger.beginTransaction() });
        } else {
          this.events.push({ type: 'launch_denied', reason: ev.reason }); // spends nothing, queues nothing
        }
      } else if (this.move === 'FLYING' || this.move === 'TAKEOFF') {
        const f = this.forecastNow();
        if (f.state === 'blocked') this.events.push({ type: 'land_denied', reason: f.reason ?? 'Landing area blocked' });
        else { this.move = 'DESCENDING'; this.events.push({ type: 'descent', auto: false }); }
      } else if (this.move === 'LANDING_CONFIRM') {
        this.events.push({ type: 'launch_denied', reason: 'Landing not confirmed yet' });
      }
    }

    // 2. metering — one resource tick per actively flying tick, from activation through touchdown
    if (this.move === 'LANDING_CONFIRM' && !this.supported()) {
      this.move = 'DESCENDING'; // same transaction, no refund
      this.events.push({ type: 'support_lost' });
    }
    if (this.isAirborne) {
      if (!this.ledger.spendTick()) {
        if (this.supported() && this.move === 'TAKEOFF') {
          this.abortTakeoff('Flight power used');
        } else if (!this.supported()) {
          // A bounded descent reserve protects a short boost from prediction error. It cannot
          // prolong cruise, hover, or become charge for a subsequent launch.
          if (this.move !== 'DESCENDING') this.events.push({ type: 'descent', auto: true });
          this.move = 'DESCENDING'; this.landingSoon = true;
          this.protectedLandingUsed++;
          if (this.protectedLandingUsed > FLIGHT.protectedLandingTicks) {
            this.events.push({ type: 'crash', reason: 'No safe landing surface' });
            this.move = 'RECOVERING'; return this.events;
          }
        } else {
          // within ground contact when the budget runs out: the same touchdown validation applies
          if (!this.validateTouchdown()) return this.events;
        }
      }
    }

    // 3. controllers + integration
    if (this.isAirborne) this.integrateAir(input, dt);
    else this.integrateGround(input, dt);

    // 4. contacts
    this.resolveContacts();
    if ((this.move as MoveState) === 'RECOVERING') return this.events;

    // 5. surface / touchdown
    this.resolveSurface();
    if ((this.move as MoveState) === 'RECOVERING') return this.events;

    if (this.move === 'GROUNDED' && this.surface?.onCarriageway && this.supported() && this.speed >= FLIGHT.rechargeMinSpeed && !input.holdStop && !this.events.some((e) => e.type === 'contact')) {
      this.ledger.earnRoadTick(FLIGHT.rechargeFlightTicksPerRoadTick);
    }

    // 6. reserve + automatic descent
    if (this.isAirborne) {
      this.reserveTicks = predictTicksToTouchdown(Math.max(0, this.altitude), this.vy) + FLIGHT.uncertaintyMarginTicks;
      this.forecast = this.forecastNow();
      if ((this.move === 'FLYING' || this.move === 'TAKEOFF') && this.ledger.remainingTicks <= this.reserveTicks + FLIGHT.autoDescentLeadTicks) {
        this.move = 'DESCENDING';
        this.landingSoon = true;
        this.events.push({ type: 'descent', auto: true });
      }
    } else {
      this.reserveTicks = 0;
      this.forecast = { ...this.forecast, state: 'hidden' };
    }
    if (this.stabilityTicks > 0 && this.move === 'GROUNDED' && this.supported()) this.stabilityTicks--;
    for (const [k, v] of this.cooldown) { if (v <= this.tick) this.cooldown.delete(k); }
    return this.events;
  }

  private abortTakeoff(reason: string) {
    this.events.push({ type: 'takeoff_abort', reason });
    this.vy = 0;
    if (this.supported()) { this.move = 'LANDING_CONFIRM'; this.confirmTicks = 0; }
    else { this.move = 'DESCENDING'; }
  }

  /** ticks ▼ has been held while stopped (reverse engages after REVERSE_DELAY) */
  private backHeldStopped = 0;

  private integrateGround(input: TickInput, dt: number) {
    const s = this.surface;
    const onRoad = !!s && s.dist <= s.halfWidth + 3.5;
    const vmax = onRoad ? VEHICLE.maxSpeed : VEHICLE.offRoadMaxSpeed;
    const approach = (target: number, up: number, down: number) => {
      const diff = target - this.speed;
      const rate = Math.sign(diff) === Math.sign(this.speed) || this.speed === 0 ? up : down;
      this.speed += Math.max(-rate * dt, Math.min(rate * dt, diff));
    };
    // ▼ held while (nearly) stopped → reverse; releasing ▼ or pressing ▲ leaves reverse
    if (input.brake && Math.abs(this.speed) < 0.3) this.backHeldStopped++;
    else if (!input.brake) this.backHeldStopped = 0;
    if (this.backHeldStopped >= REVERSE_DELAY_TICKS) this.reverseEngaged = true;
    if (!input.brake) this.reverseEngaged = false;
    if (this.move === 'LANDING_CONFIRM') {
      // keep landing momentum during the short confirmation; only explicit braking slows it
      if (input.brake) approach(0, VEHICLE.brakeDecel, VEHICLE.brakeDecel);
    } else if (input.holdStop) {
      approach(0, VEHICLE.brakeDecel * 0.6, VEHICLE.brakeDecel * 0.6);
    } else if (this.reverseEngaged) {
      approach(-VEHICLE.reverseMaxSpeed, VEHICLE.accel * 0.8, VEHICLE.brakeDecel);
    } else if (input.brake) {
      approach(0, VEHICLE.brakeDecel, VEHICLE.brakeDecel); // ▼ wins over ▲ when both are pressed
    } else if (input.accel) {
      approach(vmax, VEHICLE.accel, VEHICLE.brakeDecel);
    } else {
      // no input: the car slows and holds (engine braking + hold brake at low speed)
      approach(0, VEHICLE.idleDecel, VEHICLE.idleDecel);
    }
    const v = Math.abs(this.speed);
    const k = Math.min(1, v / VEHICLE.maxSpeed);
    const maxSteer = VEHICLE.maxSteerLow + (VEHICLE.maxSteerHigh - VEHICLE.maxSteerLow) * k;
    const targetSteer = Math.max(-1, Math.min(1, input.steer)) * maxSteer;
    const ds = VEHICLE.steerRate * dt;
    this.steerAngle += Math.max(-ds, Math.min(ds, targetSteer - this.steerAngle));
    const yawRate = (this.speed / VEHICLE.wheelbase) * Math.tan(this.steerAngle);
    this.heading = wrapAngle(this.heading - yawRate * dt); // +steer = right = heading decreases
    const [fx, fz] = forwardOf(this.heading);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
  }

  private integrateAir(input: TickInput, dt: number) {
    // horizontal: ▲ speeds up, ▼ slows toward a (metered) hover, no input keeps the current speed
    if (input.brake) this.speed = Math.max(0, this.speed - FLIGHT.airBrakeDecel * dt);
    else if (input.accel) this.speed = Math.min(FLIGHT.airMaxSpeed, this.speed + FLIGHT.airAccel * dt);
    if (this.speed < 0) this.speed = 0;
    let steer = Math.max(-1, Math.min(1, input.steer));
    // Assisted flight (MASTER §12.2/§12.4): with no steering input the controller follows the road
    // tangent; during descent it also centres the car on the carriageway so the forecast stays valid.
    const near = this.world.roads.surface(this.x, this.z, { preferLevel: this.level, margin: 30, heading: this.heading });
    let lateralNudge = 0, roadH = this.heading;
    if (near) {
      roadH = Math.abs(wrapAngle(near.heading - this.heading)) <= Math.PI / 2 ? near.heading : wrapAngle(near.heading + Math.PI);
      const sign = roadH === near.heading ? 1 : -1; // lateral is measured relative to the road's forward direction
      const lat = near.lateral * sign;
      const limit = Math.max(0.3, near.halfWidth - 1.3);
      if (this.move === 'DESCENDING') {
        const target = Math.max(-limit, Math.min(limit, lat));
        lateralNudge = Math.max(-4, Math.min(4, (target - lat) * 2.5)) * sign;
      } else if (Math.abs(lat) > near.halfWidth) {
        // keep the flight over the carriageway so an affordable landing stays available
        lateralNudge = Math.max(-1.5, Math.min(1.5, (Math.sign(lat) * near.halfWidth - lat) * 1.5)) * sign;
      }
    }
    const assisting = Math.abs(steer) < 0.15 || this.move === 'DESCENDING';
    this.steerAngle = steer * 0.25;
    const yawCmd = -steer * 1.0 * FLIGHT.airSteerScale * (0.6 + Math.min(1, this.speed / 10));
    let yaw = yawCmd;
    if (assisting && near) yaw += Math.max(-0.9, Math.min(0.9, wrapAngle(roadH - this.heading) * 1.8)) * (Math.abs(steer) < 0.15 ? 1 : 0.5);
    this.heading = wrapAngle(this.heading + yaw * dt);
    const [fx, fz] = forwardOf(this.heading);
    let nx = this.x + fx * this.speed * dt;
    let nz = this.z + fz * this.speed * dt;
    if (near && lateralNudge !== 0) {
      // right vector of the road forward direction is (-fz_r, fx_r)
      const [rfx, rfz] = forwardOf(near.heading);
      nx += -rfz * lateralNudge * dt; nz += rfx * lateralNudge * dt;
    }
    // supported air envelope: over selected roads (+ footpath margin) and never inside a building
    // volume. Moves that bring the car back toward the road are always allowed (visible assisted edge,
    // not a late wall); outward moves past the edge are refused.
    const buildingHit = (px: number, pz: number) => {
      const buf: Contact[] = [];
      for (const off of [VEHICLE.circleOffset, -VEHICLE.circleOffset]) this.world.contacts(px + fx * off, pz + fz * off, this.y + 0.05, FLIGHT.carHeight, VEHICLE.collisionRadius + 0.3, buf);
      return buf.some((c) => c.kind === 'building');
    };
    const excess = (px: number, pz: number) => {
      const w = this.world.roads.surface(px, pz, { margin: FLIGHT.airEnvelopeMarginM + 30, preferLevel: this.level });
      return w ? Math.max(0, w.dist - (w.halfWidth + FLIGHT.airEnvelopeMarginM)) : Infinity;
    };
    const cur = excess(this.x, this.z);
    const tryMove = (px: number, pz: number) => !buildingHit(px, pz) && (excess(px, pz) <= 0 || excess(px, pz) < cur - 1e-6);
    if (tryMove(nx, nz)) {
      this.x = nx; this.z = nz; this.lastAirOk = { x: nx, z: nz };
    } else {
      this.events.push({ type: 'air_edge' });
      // keep only the inward (centring) part of the motion and slide along the edge
      const within = this.world.roads.surface(this.x, this.z, { margin: FLIGHT.airEnvelopeMarginM + 30, preferLevel: this.level });
      if (within) {
        const d = Math.hypot(within.px - this.x, within.pz - this.z) || 1;
        const inward = Math.max(1.5, Math.abs(lateralNudge));
        const sx = this.x + ((within.px - this.x) / d) * inward * dt, sz = this.z + ((within.pz - this.z) / d) * inward * dt;
        // tangential slide component along the road
        const [tfx, tfz] = forwardOf(within.heading);
        const along = (fx * tfx + fz * tfz) * this.speed * dt;
        const ax = sx + tfx * along, az = sz + tfz * along;
        if (!buildingHit(ax, az)) { this.x = ax; this.z = az; }
        else if (!buildingHit(sx, sz)) { this.x = sx; this.z = sz; }
        const toRoad = Math.abs(wrapAngle(within.heading - this.heading)) <= Math.PI / 2 ? within.heading : wrapAngle(within.heading + Math.PI);
        this.heading = wrapAngle(this.heading + Math.max(-0.04, Math.min(0.04, wrapAngle(toRoad - this.heading))));
      }
      this.speed *= 0.985;
    }
    // committed descent: bound steering so a static landing on the carriageway stays feasible (§12.5)
    if (this.move === 'DESCENDING' && this.altitude < 3.5) {
      const r = this.world.roads.surface(this.x, this.z, { margin: FLIGHT.airEnvelopeMarginM + 30, preferLevel: this.level, heading: this.heading });
      if (r) {
        const lim = Math.max(0.2, r.halfWidth - 0.9);
        if (Math.abs(r.lateral) > lim) {
          const [rfx, rfz] = forwardOf(r.heading);
          const corr = Math.min(Math.abs(r.lateral) - lim, 6 * dt) * Math.sign(r.lateral);
          const cx = this.x - -rfz * corr, cz = this.z - rfx * corr;
          if (!buildingHit(cx, cz)) { this.x = cx; this.z = cz; }
        }
      }
    }
    // vertical controller
    this.updateSurface(FLIGHT.airEnvelopeMarginM + 8);
    const surfY = this.surfaceY();
    const alt = this.y - surfY;
    if (this.move === 'TAKEOFF') {
      this.takeoffTicks++;
      this.vy = Math.min(FLIGHT.maxClimbRate, this.vy + FLIGHT.ascentAccel * dt);
      const free = this.overheadFree(this.x, this.z, this.heading, surfY);
      if (free < FLIGHT.minFlightAltitude + FLIGHT.carHeight + 0.2 && alt < 1.0) {
        this.abortTakeoff('New obstruction above');
        if ((this.move as MoveState) === 'LANDING_CONFIRM') { this.y = surfY; return; }
      } else if (this.takeoffTicks >= FLIGHT.takeoffProgressTimeoutTicks && alt < FLIGHT.takeoffMinProgressM) {
        this.abortTakeoff('Could not lift off');
        if ((this.move as MoveState) === 'LANDING_CONFIRM') { this.y = surfY; return; }
      } else if (alt >= FLIGHT.minFlightAltitude) {
        this.move = 'FLYING';
      }
    } else if (this.move === 'FLYING') {
      const [hx, hz] = forwardOf(this.heading);
      const look = Math.max(6, this.speed * 1.2);
      const free = Math.min(this.overheadFree(this.x, this.z, this.heading, surfY), this.overheadFree(this.x + hx * look, this.z + hz * look, this.heading, surfY));
      // never let the cruise target sink to the ground: a structure lower than this is collided with (and forecast)
      const target = Math.max(FLIGHT.minFlightAltitude * 0.75, Math.min(FLIGHT.cruiseAltitude, free - FLIGHT.carHeight - FLIGHT.overheadMargin));
      const want = Math.max(-FLIGHT.descentRate, Math.min(FLIGHT.maxClimbRate, (target - alt) * 1.6));
      this.vy += Math.max(-FLIGHT.ascentAccel * dt, Math.min(FLIGHT.ascentAccel * dt, want - this.vy));
    } else if (this.move === 'DESCENDING') {
      const want = alt < 1.3 ? -Math.max(1.2, Math.min(FLIGHT.descentRate, alt * 1.6)) : -FLIGHT.descentRate;
      this.vy += Math.max(-FLIGHT.ascentAccel * dt, Math.min(FLIGHT.ascentAccel * dt, want - this.vy));
    }
    this.y += this.vy * dt;
    if (this.move === 'TAKEOFF' && this.y < surfY) { this.y = surfY; if (this.vy < 0) this.vy = 0; }
    this.airborneAltitude = this.y - surfY;
  }

  private resolveContacts() {
    const out = this.contactsBuf; out.length = 0;
    const h = FLIGHT.carHeight;
    // Sweep both collision volumes through the entire movement, including yaw. This catches
    // narrow parapets, ramp-wall ends and poles before the final position can cross them.
    const travel = Math.hypot(this.x - this.prev.x, this.z - this.prev.z);
    const yaw = wrapAngle(this.heading - this.prev.heading);
    const steps = Math.max(1, Math.ceil((travel + Math.abs(yaw) * VEHICLE.circleOffset) / 0.3));
    const endX = this.x, endZ = this.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = this.prev.x + (endX - this.prev.x) * t, z = this.prev.z + (endZ - this.prev.z) * t;
      const [sx, sz] = forwardOf(this.prev.heading + yaw * t);
      const y = this.prev.y + (this.y - this.prev.y) * t;
      for (const off of [VEHICLE.circleOffset, -VEHICLE.circleOffset]) {
        const cx=x+sx*off,cz=z+sz*off;
        this.world.contacts(cx,cz,y+.05,h-.1,VEHICLE.collisionRadius,out);
        this.dyn.contacts(cx,cz,y+.05,h-.1,VEHICLE.collisionRadius,out);
      }
      if(out.length){this.x=x;this.z=z;this.y=y;this.heading=wrapAngle(this.prev.heading+yaw*t);break;}
    }
    if (!out.length) return;
    const [fx,fz]=forwardOf(this.heading);
    const deepest = new Map<string, Contact>();
    for (const c of out) {
      const previous = deepest.get(c.id);
      if (!previous || c.depth > previous.depth || (c.vertical === 'above' && previous.vertical !== 'above')) deepest.set(c.id, c);
    }
    for (const c of deepest.values()) {
      let closing: number;
      if (c.vertical === 'above') {
        if (this.isAirborne) {
          this.events.push({ type: 'contact', kind: c.kind, id: c.id, severity: 'severe', closing: -this.vy });
          this.events.push({ type: 'crash', reason: 'Landed on a vehicle roof' });
          this.move = 'RECOVERING';
          return;
        }
        closing = 0;
        this.x += c.nx * 0.2; this.z += c.nz * 0.2;
      } else if (c.vertical === 'below') {
        closing = Math.max(0, this.vy) + 2;
        this.y -= Math.max(0, c.depth); this.vy = Math.min(0, this.vy);
      } else {
        const vdotn = (fx * this.speed) * c.nx + (fz * this.speed) * c.nz;
        closing = Math.max(0, -vdotn);
        this.x += c.nx * c.depth; this.z += c.nz * c.depth;
        if (c.kind === 'parapet') this.speed *= Math.max(0, 1 - Math.abs(fx * c.nx + fz * c.nz));
      }
      // a pedestrian stepping into a stationary/creeping car is not a player crash
      const severe = closing >= CONTACT.severeSpeed || (c.vertical === 'below' && this.isAirborne && closing > 3) || (c.kind === 'pedestrian' && Math.abs(this.speed) > 1.5);
      if (!this.cooldown.has(c.id)) {
        this.cooldown.set(c.id, this.tick + CONTACT.contactCooldownTicks);
        this.events.push({ type: 'contact', kind: c.kind, id: c.id, severity: severe ? 'severe' : 'light', closing });
        if (severe) {
          this.events.push({ type: 'crash', reason: c.kind === 'pedestrian' ? 'Pedestrian contact' : this.isAirborne ? `Hit ${c.kind} in flight` : `Crashed into ${c.kind}` });
          this.move = 'RECOVERING';
          return;
        }
        this.speed *= 1 - CONTACT.lightSpeedLoss;
      } else {
        // sustained contact: bounded drag; the episode stays one event while contact persists
        this.cooldown.set(c.id, this.tick + CONTACT.contactCooldownTicks);
        this.speed *= 0.98;
      }
    }
  }

  private resolveSurface() {
    if (this.isAirborne) {
      const surfY = this.surfaceY();
      if (this.move !== 'TAKEOFF' && this.y <= surfY) {
        // touchdown attempt
        this.validateTouchdown();
      }
      return;
    }
    // ground: follow road surface identity with hysteresis
    this.updateSurface(4.5);
    const s = this.surface;
    const [fx, fz] = forwardOf(this.heading), rx = -fz, rz = fx;
    let wi = 0;
    for (const front of [1, -1]) for (const side of [-1, 1]) {
      this.wheelHeights[wi++] = this.world.roads.groundHeight(this.x + fx * front * VEHICLE.wheelbase / 2 + rx * side * VEHICLE.width * 0.4, this.z + fz * front * VEHICLE.wheelbase / 2 + rz * side * VEHICLE.width * 0.4, this.roadId, this.level, this.y + 0.5);
    }
    const surfY = this.wheelHeights.reduce((a, b) => a + b, 0) / 4;
    const step = surfY - this.rideHeight;
    this.curbImpact = Math.max(this.curbImpact * 0.82, Math.min(1, Math.abs(step) * Math.abs(this.speed) * 1.5));
    if (step > 0.03 && Math.abs(this.speed) > 1) this.speed *= 1 - Math.min(0.15, step * 0.6);
    this.rideHeight = surfY;
    const targetPitch = Math.atan2((this.wheelHeights[0] + this.wheelHeights[1] - this.wheelHeights[2] - this.wheelHeights[3]) / 2, VEHICLE.wheelbase);
    const targetRoll = Math.atan2((this.wheelHeights[0] + this.wheelHeights[2] - this.wheelHeights[1] - this.wheelHeights[3]) / 2, VEHICLE.width * 0.8);
    this.suspensionPitch += (targetPitch - this.suspensionPitch) * 0.24;
    this.suspensionRoll += (targetRoll - this.suspensionRoll) * 0.24;
    if (this.y > surfY + 0.05) {
      // ground-vehicle gravity (not powered flight)
      this.vy -= 9.81 * TICK_SECONDS;
      this.y += this.vy * TICK_SECONDS;
      if (this.y <= surfY) { this.y = surfY; this.vy = 0; }
    } else {
      this.y = Math.abs(surfY - this.y) < 0.0001 ? surfY : this.y + (surfY - this.y) * 0.35; this.vy = 0;
    }
    if (this.move === 'LANDING_CONFIRM') {
      if (this.supported()) {
        this.confirmTicks++;
        if (this.confirmTicks >= FLIGHT.groundConfirmTicks) {
          this.move = 'GROUNDED';
          this.events.push({ type: 'landed' });
        }
      }
    }
  }

  /**
   * Qualified touchdown (MASTER §12.6): eligible carriageway at the correct level, not a roof, and an
   * acceptable vertical speed. On success enters LANDING_CONFIRM; otherwise invokes recovery.
   */
  private validateTouchdown(): boolean {
    const s = this.world.roads.surface(this.x, this.z, { margin: 0.3, maxY: this.y + 0.5, preferLevel: this.level, heading: this.heading }) ?? this.surface;
    if (s) { this.surface = s; this.roadId = s.roadId; }
    const vyAtContact = this.vy;
    const validSurface = !!s && s.dist <= s.halfWidth + 0.3 && !this.world.buildingAt(this.x, this.z);
    if (!validSurface) { this.events.push({ type: 'crash', reason: 'Invalid landing surface' }); this.move = 'RECOVERING'; return false; }
    if (vyAtContact < -FLIGHT.maxTouchdownVy) { this.events.push({ type: 'crash', reason: 'Landing too hard' }); this.move = 'RECOVERING'; return false; }
    this.y = s!.elevation; this.vy = 0;
    this.level = s!.level;
    this.move = 'LANDING_CONFIRM';
    this.confirmTicks = 0;
    this.landingSoon = false;
    this.events.push({ type: 'touchdown', hard: vyAtContact < -FLIGHT.hardLandingVy, vy: vyAtContact });
    return true;
  }

  /** Gameplay recovery: terminate flight, keep ledger, place at a previously reached anchor (F19). */
  recoverTo(anchor: { x: number; z: number; heading: number; roadId: string | null }): void {
    this.place(anchor.x, anchor.z, anchor.heading, anchor.roadId);
    this.landingSoon = false;
    this.forecast = { ...this.forecast, state: 'hidden' };
  }

  snapshot(): PlayerSnapshot {
    return { x: this.x, y: this.y, z: this.z, heading: this.heading, speed: this.speed, vy: this.vy, steerAngle: this.steerAngle, move: this.move, roadId: this.roadId, level: this.level, takeoffTicks: this.takeoffTicks, confirmTicks: this.confirmTicks, stabilityTicks: this.stabilityTicks, reverseEngaged: this.reverseEngaged, landingSoon: this.landingSoon, protectedLandingUsed: this.protectedLandingUsed, ledger: this.ledger.snapshot() };
  }

  restore(s: PlayerSnapshot): void {
    Object.assign(this, { x: s.x, y: s.y, z: s.z, heading: s.heading, speed: s.speed, vy: s.vy, steerAngle: s.steerAngle, move: s.move, roadId: s.roadId, level: s.level, takeoffTicks: s.takeoffTicks, confirmTicks: s.confirmTicks, stabilityTicks: s.stabilityTicks, reverseEngaged: s.reverseEngaged, landingSoon: s.landingSoon });
    this.ledger = FlightLedger.restore(s.ledger);
    this.protectedLandingUsed = s.protectedLandingUsed ?? 0;
    this.surface = this.world.roads.surface(this.x, this.z, { preferRoadId: this.roadId, preferLevel: this.level, maxY: this.y + 0.3, margin: 12 });
    this.prev = { x: this.x, y: this.y, z: this.z, heading: this.heading };
    // reserve is recomputed from restored state on the next tick (never restored as a number)
  }
}

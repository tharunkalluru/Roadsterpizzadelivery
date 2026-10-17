import type { Session } from '../missions/session';
import { NO_INPUT, type TickInput } from '../player/player';
import { headingOf, wrapAngle, forwardOf } from '../world/roadIndex';
import { VEHICLE } from '../config/gameplay';

/**
 * Reference driving agent (MASTER §15 deadline calibration; §30 runtime traversal).
 * It drives through the real physics on the directed route — no teleporting — keeping left,
 * slowing for turns and traffic, and stopping inside the stop polygon. Used for deadline
 * calibration, route-case tests and the browser smoke test. Marks runs as debug.
 */
export class Autopilot {
  private stuckTicks = 0;
  private lostTicks = 0;
  constructor(public s: Session, public opts: { useFlight?: boolean; cruiseBoost?: boolean } = {}) {}

  private laneOffset(roadId: string): number {
    const r = this.s.world.roads.roads.get(roadId)!;
    const hw = r.widthM / 2;
    return r.oneway ? -Math.max(0, hw - 2.0) : -hw / 2;
  }

  /** point `d` metres ahead along the current route, offset into the left lane */
  private target(d: number) {
    const s = this.s, nav = s.world.nav;
    if (!s.route.length) return null;
    const p = nav.advance(s.route[s.routeIdx], s.routeAlong, d, s.route);
    const e = nav.edges.get(p.id)!;
    const off = this.laneOffset(e.roadId);
    const [fx, fz] = forwardOf(p.heading);
    return { x: p.x + -fz * off, z: p.z + fx * off, heading: p.heading, id: p.id };
  }

  input(): TickInput {
    const s = this.s, p = s.player;
    const stop = s.currentStop;
    if (!stop || !s.route.length || !p.surface) {
      // lost (e.g. strayed onto a boundary road): use recovery like a player would
      if (++this.lostTicks > 120) { this.lostTicks = 0; s.requestManualRecovery(); }
      return { ...NO_INPUT, brake: true };
    }
    this.lostTicks = 0;
    const v = Math.max(0, p.speed);
    const remaining = s.routeRemainingM();
    const c = s.stagingPose(stop);
    const distStop = Math.hypot(p.x - c.x, p.z - c.z);
    let t = this.target(Math.max(5, v * 0.8 + 3));
    if (!t) return { ...NO_INPUT, brake: true };
    // final approach: aim at the stop polygon centre
    const finalApproach = remaining < 25 && distStop < 30;
    if (finalApproach) t = { ...t, x: c.x, z: c.z };
    const desired = headingOf(t.x - p.x, t.z - p.z);
    const err = wrapAngle(desired - p.heading);
    const steer = Math.max(-1, Math.min(1, -err * 2.2));
    // speed planning from upcoming curvature
    let maxTurn = 0;
    const h0 = this.target(1)?.heading ?? p.heading;
    for (const d of [8, 16, 26, 38]) { const q = this.target(d); if (q) maxTurn = Math.max(maxTurn, Math.abs(wrapAngle(q.heading - h0))); }
    let vt = this.opts.cruiseBoost ? VEHICLE.maxSpeed : VEHICLE.cruiseSpeed;
    if (maxTurn > 1.3) vt = 4.5; else if (maxTurn > 0.8) vt = 6.5; else if (maxTurn > 0.4) vt = 9;
    // traffic ahead in our lane
    const [fx, fz] = forwardOf(p.heading);
    for (const a of s.traffic.actors) {
      const dx = a.x - p.x, dz = a.z - p.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      const sameDir = Math.abs(wrapAngle(a.heading - p.heading)) < 1.0;
      if (ahead > 0 && side < 2.2 && (sameDir ? ahead < v * 1.6 + 9 : ahead < 6)) vt = Math.min(vt, sameDir ? Math.max(0, a.speed - 0.5) : 0);
    }
    for (const q of s.traffic.peds) {
      const dx = q.x - p.x, dz = q.z - p.z;
      const ahead = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && ahead < v * 1.4 + 6 && side < 2.0) vt = 0;
    }
    // stop inside the polygon
    if (remaining < 60 || distStop < 40) {
      const dStop = finalApproach ? distStop : remaining + 2;
      const vStop = Math.sqrt(Math.max(0, 2 * 5.5 * Math.max(0, dStop - 1.0)));
      vt = Math.min(vt, vStop);
      if (distStop < 2.5) vt = 0;
    }
    if (s.holdActive) return { ...NO_INPUT, steer: 0, brake: true };
    const brake = v > vt + 0.6;
    const boost = !brake && vt > VEHICLE.cruiseSpeed + 0.1;
    // simple unstick: if blocked for long, use recovery like a player would
    if (v < 0.2 && vt > 1) this.stuckTicks++; else this.stuckTicks = 0;
    if (this.stuckTicks > 600) { this.stuckTicks = 0; s.requestManualRecovery(); }
    let flyPress = false;
    if (this.opts.useFlight && p.move === 'GROUNDED' && v > 8 && remaining > 250 && maxTurn < 0.3 && p.ledger.remainingSeconds > 6) flyPress = (s.tick % 240) === 0;
    if (this.opts.useFlight && p.move === 'FLYING' && (maxTurn > 0.5 || remaining < 120)) flyPress = true;
    return { ...NO_INPUT, steer, brake: brake || (vt === 0 && v > 0.05), boost, flyPress };
  }
}

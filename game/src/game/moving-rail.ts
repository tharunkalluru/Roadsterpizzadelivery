// Shared kinematic train geometry. Gameplay consumes these same coach poses as rendering.
export interface RailPose { x: number; y: number; z: number; hx: number; hz: number }
export interface MovingRailShape extends RailPose { id: string; halfWidth: number; halfLength: number; bottom: number; roof: number }
export interface MovingRailBody extends MovingRailShape { previous: RailPose }
interface Point { x: number; y: number; z: number }
export interface RailPlayer {
  pos: Point; yaw: number; speed: number; vy: number; flying: boolean; descending: boolean;
  placementRevision?: number; glide?: unknown; bump?: number; lastKind?: string; lastSupport?: number;
  lastElevRoad?: boolean; onRoad?: boolean;
  group?: { position: Point }; glow?: { position: Point }; light?: { position: Point };
}
const FOOT = .55, CAR_HALF_WIDTH = 1.05, CAR_HALF_LENGTH = 2.3, CAR_HEIGHT = 1.2;
const pose = (body: RailPose): RailPose => ({ x: body.x, y: body.y, z: body.z, hx: body.hx, hz: body.hz });
export class MovingRailFrames {
  private prior = new Map<string, RailPose>();
  bodies: MovingRailBody[] = [];
  set(shapes: MovingRailShape[]) {
    const next = new Map<string, RailPose>();
    this.bodies = shapes.map(shape => {
      const length = Math.hypot(shape.hx, shape.hz) || 1;
      const body = { ...shape, hx: shape.hx / length, hz: shape.hz / length, previous: this.prior.get(shape.id) || pose(shape) };
      next.set(shape.id, pose(body)); return body;
    });
    this.prior = next; return this.bodies;
  }
}
export function railLocal(body: RailPose, x: number, z: number) {
  const dx = x - body.x, dz = z - body.z;
  return { along: dx * body.hx + dz * body.hz, side: -dx * body.hz + dz * body.hx };
}
export function railWorld(body: RailPose, along: number, side: number) {
  return { x: body.x + body.hx * along - body.hz * side, z: body.z + body.hz * along + body.hx * side };
}
export function railRoofAt(body: MovingRailBody, x: number, z: number) {
  const p = railLocal(body, x, z);
  return Math.abs(p.along) <= body.halfLength && Math.abs(p.side) <= body.halfWidth ? body.roof : null;
}
export function movingRailSupport(bodies: readonly MovingRailBody[], x: number, z: number, fromY: number) {
  let best: { body: MovingRailBody; y: number } | null = null;
  for (const body of bodies) {
    const y = railRoofAt(body, x, z);
    // A car beneath the chassis cannot snap through it onto the roof.
    if (y === null || y > fromY + .12) continue;
    if (!best || (Number.isFinite(fromY) ? Math.abs(y - fromY) < Math.abs(best.y - fromY) : y > best.y)) best = { body, y };
  }
  return best;
}
function extents(body: RailPose, yaw: number) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  return { along: Math.abs(fx * body.hx + fz * body.hz) * CAR_HALF_LENGTH + Math.abs(rx * body.hx + rz * body.hz) * CAR_HALF_WIDTH,
    side: Math.abs(-fx * body.hz + fz * body.hx) * CAR_HALF_LENGTH + Math.abs(-rx * body.hz + rz * body.hx) * CAR_HALF_WIDTH };
}
function sweep(a: { along: number; side: number }, b: { along: number; side: number }, along: number, side: number) {
  let enter = 0, exit = 1, axis: 'along' | 'side' = 'side', sign = 1;
  for (const key of ['along', 'side'] as const) {
    const half = key === 'along' ? along : side, d = b[key] - a[key];
    if (Math.abs(d) < 1e-9) { if (Math.abs(a[key]) > half) return null; continue; }
    let t0 = (-half - a[key]) / d, t1 = (half - a[key]) / d;
    const face = d > 0 ? -1 : 1;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > enter) { enter = t0; axis = key; sign = face; }
    exit = Math.min(exit, t1); if (enter > exit) return null;
  }
  return enter >= 0 && enter <= 1 ? { t: enter, axis, sign } : null;
}
export interface RailContactResult { hit: boolean; impact: number; body: MovingRailBody | null; carried: boolean }

export class MovingRailInteraction {
  private bodies: readonly MovingRailBody[] = [];
  private attached: string | null = null;
  private previous: Point = { x: 0, y: 0, z: 0 };
  private revision: number | undefined;
  private drift = { x: 0, z: 0 };
  beforePlayer(player: RailPlayer, bodies: readonly MovingRailBody[], flyPressed = false, dt = 0) {
    this.bodies = bodies;
    this.previous = { ...player.pos };
    if (this.revision !== player.placementRevision) { this.attached = null; this.drift = { x: 0, z: 0 }; }
    this.revision = player.placementRevision;
    if (player.glide || player.flying || flyPressed) this.attached = null;
    if (this.attached) {
      const body = bodies.find(b => b.id === this.attached);
      if (!body) this.attached = null;
      else {
        const local = railLocal(body.previous, player.pos.x, player.pos.z);
        if (Math.abs(local.along) > body.halfLength || Math.abs(local.side) > body.halfWidth || Math.abs(player.pos.y - FOOT - (body.roof - body.y + body.previous.y)) > .4) this.attached = null;
        else {
          const next = railWorld(body, local.along, local.side);
          player.pos.x = next.x; player.pos.z = next.z; player.pos.y += body.y - body.previous.y;
          const turn = Math.atan2(body.hz, body.hx) - Math.atan2(body.previous.hz, body.previous.hx);
          player.yaw -= Math.atan2(Math.sin(turn), Math.cos(turn));
        }
      }
    }
    if (!player.glide && dt > 0) {
      player.pos.x += this.drift.x * dt; player.pos.z += this.drift.z * dt;
      const damping = Math.exp(-4 * dt); this.drift.x *= damping; this.drift.z *= damping;
    }
  }
  afterPlayer(player: RailPlayer, dt: number): RailContactResult {
    const start = { ...player.pos }, result: RailContactResult = { hit: false, impact: 0, body: null, carried: false };
    if (player.glide) { this.attached = null; return result; }
    for (let pass = 0; pass < 3; pass++) for (const body of this.bodies) {
      if (Math.hypot(player.pos.x - body.x, player.pos.z - body.z) > body.halfLength + 40) continue;
      const feet = player.pos.y - FOOT, oldFeet = this.previous.y - FOOT;
      if (feet >= body.roof - .12 && oldFeet >= body.roof - body.y + body.previous.y - .12) continue;
      if (feet + CAR_HEIGHT < body.bottom || oldFeet > body.roof + .2 && feet > body.roof + .2) continue;
      const ex = extents(body, player.yaw), along = body.halfLength + ex.along, side = body.halfWidth + ex.side;
      const a = railLocal(body.previous, this.previous.x, this.previous.z), b = railLocal(body, player.pos.x, player.pos.z);
      const inside = Math.abs(b.along) < along && Math.abs(b.side) < side;
      const contact = sweep(a, b, along, side);
      if (!inside && !contact) continue;
      let axis: 'along' | 'side', sign: number;
      if (contact && contact.t > 1e-6) { axis = contact.axis; sign = contact.sign; }
      else if (inside) {
        axis = along - Math.abs(b.along) < side - Math.abs(b.side) ? 'along' : 'side'; sign = Math.sign(b[axis]) || 1;
      } else continue;
      // Check vertical overlap at the swept impact time, not only at the final XY.
      const t = contact?.t || 0, hitFeet = oldFeet + (feet - oldFeet) * t;
      const base = body.bottom - (body.y - body.previous.y) * (1 - t), roof = body.roof - (body.y - body.previous.y) * (1 - t);
      if (hitFeet >= roof - .12 || hitFeet + CAR_HEIGHT <= base) continue;
      const fixed = { ...b }; fixed[axis] = sign * ((axis === 'along' ? along : side) + .02);
      const p = railWorld(body, fixed.along, fixed.side);
      const nx = sign * (axis === 'along' ? body.hx : -body.hz), nz = sign * (axis === 'along' ? body.hz : body.hx);
      const prevAt = railWorld(body.previous, b.along, b.side), inv = dt > 0 ? 1 / dt : 0;
      const vx = (player.pos.x - prevAt.x) * inv, vz = (player.pos.z - prevAt.z) * inv;
      const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), closing = Math.min(0, (fx * player.speed + this.drift.x - vx) * nx + (fz * player.speed + this.drift.z - vz) * nz);
      const ix = -closing * nx, iz = -closing * nz, forwardImpulse = ix * fx + iz * fz;
      player.speed += forwardImpulse;
      this.drift.x = Math.max(-35, Math.min(35, this.drift.x + ix - forwardImpulse * fx));
      this.drift.z = Math.max(-35, Math.min(35, this.drift.z + iz - forwardImpulse * fz));
      player.pos.x = p.x; player.pos.z = p.z;
      result.hit = true; result.body = body; result.impact = Math.max(result.impact, -closing);
      player.bump = Math.max(player.bump || 0, .35);
    }
    this.attached = null;
    if (!player.flying && !player.glide && player.vy <= .1) {
      const roof = movingRailSupport(this.bodies, player.pos.x, player.pos.z, player.pos.y - FOOT);
      if (roof && Math.abs(player.pos.y - FOOT - roof.y) <= .2) {
        this.attached = roof.body.id; player.pos.y = roof.y + FOOT; player.vy = 0; player.descending = false;
        player.lastSupport = roof.y; player.lastKind = 'rail'; player.lastElevRoad = false; player.onRoad = false;
        result.body = roof.body; result.carried = true; this.drift = { x: 0, z: 0 };
      }
    }
    const shift = { x: player.pos.x - start.x, y: player.pos.y - start.y, z: player.pos.z - start.z };
    for (const visual of [player.group, player.glow, player.light]) if (visual) { visual.position.x += shift.x; visual.position.y += shift.y; visual.position.z += shift.z; }
    return result;
  }
}

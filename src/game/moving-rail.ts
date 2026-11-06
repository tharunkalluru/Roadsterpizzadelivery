// Shared kinematic train geometry. Gameplay consumes these same coach poses as rendering.
export interface RailPose { x: number; y: number; z: number; hx: number; hz: number; grade?: number }
export interface MovingRailShape extends RailPose {
  id: string; halfWidth: number; halfLength: number; bottom: number; roof: number;
  /** Explicit rake membership prevents nearby/parallel trains sharing support. */
  roofGroup?: string; roofIndex?: number;
}
interface RailRoofSpan extends RailPose { halfWidth: number; halfLength: number; roof: number }
interface RailRoofJoin { a: string; b: string; current: RailRoofSpan; previous: RailRoofSpan }
export interface MovingRailBody extends MovingRailShape { previous: RailPose; roofJoins?: RailRoofJoin[] }
interface Point { x: number; y: number; z: number }
export interface RailPlayer {
  pos: Point; yaw: number; speed: number; vy: number; flying: boolean; descending: boolean; jumping?: boolean;
  placementRevision?: number; glide?: unknown; bump?: number; lastKind?: string; lastSupport?: number;
  lastElevRoad?: boolean; onRoad?: boolean;
  group?: { position: Point }; glow?: { position: Point }; light?: { position: Point };
}
const FOOT = .55, CAR_HALF_WIDTH = 1.05, CAR_HALF_LENGTH = 2.3, CAR_HEIGHT = 1.2;
const pose = (body: RailPose): RailPose => ({ x: body.x, y: body.y, z: body.z, hx: body.hx, hz: body.hz, grade: body.grade });
function roofJoin(a: MovingRailBody, b: MovingRailBody, previous = false): RailRoofSpan | null {
  const pa = previous ? a.previous : a, pb = previous ? b.previous : b;
  if (pa.hx * pb.hx + pa.hz * pb.hz < .87) return null;
  const start = railWorld(pb, b.halfLength, 0), end = railWorld(pa, -a.halfLength, 0);
  const dx = end.x - start.x, dz = end.z - start.z, length = Math.hypot(dx, dz);
  // Only an actual adjacent coupling gap is rideable, never a missing coach,
  // another train, or a sharp turnout that separates the rendered roofs.
  if (length < .02 || length > 3.5 || (dx * pa.hx + dz * pa.hz) / length < .5) return null;
  const ya = a.roof - a.y + pa.y - a.halfLength * (pa.grade || 0);
  const yb = b.roof - b.y + pb.y + b.halfLength * (pb.grade || 0);
  const grade = (ya - yb) / length;
  if (Math.abs(grade) > .3) return null;
  const hx=dx/length,hz=dz/length,halfWidth=Math.min(a.halfWidth,b.halfWidth)-.03;
  // Angled end faces leave a small wedge outside the centre line. Extend only
  // into those existing faces so an offset tyre path stays joined on curves.
  const endOverlap=halfWidth*Math.max(
    Math.abs(hx*pa.hz-hz*pa.hx)/Math.max(.5,hx*pa.hx+hz*pa.hz),
    Math.abs(hx*pb.hz-hz*pb.hx)/Math.max(.5,hx*pb.hx+hz*pb.hz))+.03;
  return { x: (start.x + end.x) / 2, y: (pa.y + pb.y) / 2, z: (start.z + end.z) / 2,
    hx, hz, halfLength: length / 2 + endOverlap,halfWidth,roof: (ya + yb) / 2, grade };
}
function addRoofJoins(bodies: MovingRailBody[]) {
  const groups = new Map<string, Map<number, MovingRailBody>>();
  for (const body of bodies) {
    if (!body.roofGroup || !Number.isInteger(body.roofIndex)) continue;
    let group = groups.get(body.roofGroup);
    if (!group) groups.set(body.roofGroup, group = new Map());
    group.set(body.roofIndex!, body);
  }
  for (const group of groups.values()) for (const [index, a] of group) {
    const b = group.get(index + 1); if (!b) continue;
    const current = roofJoin(a, b), previous = roofJoin(a, b, true);
    if (!current || !previous) continue;
    const join = { a:a.id, b:b.id, current, previous };
    (a.roofJoins ||= []).push(join); (b.roofJoins ||= []).push(join);
  }
}
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
    addRoofJoins(this.bodies);
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
function spanRoofAt(span: RailRoofSpan, x: number, z: number) {
  const p = railLocal(span, x, z);
  return Math.abs(p.along) <= span.halfLength && Math.abs(p.side) <= span.halfWidth ? span.roof + p.along * (span.grade || 0) : null;
}
function bodyRoofAt(body: MovingRailBody, x: number, z: number, previous = false) {
  const frame = previous ? body.previous : body, p = railLocal(frame, x, z);
  if (Math.abs(p.along) <= body.halfLength && Math.abs(p.side) <= body.halfWidth)
    return body.roof - body.y + frame.y + p.along * (frame.grade || 0);
  return null;
}
export function railRoofAt(body: MovingRailBody, x: number, z: number, previous = false) {
  const own = bodyRoofAt(body,x,z,previous);
  if (own !== null) return own;
  for (const join of body.roofJoins || []) {
    const roof = spanRoofAt(previous ? join.previous : join.current, x, z);
    if (roof !== null) return roof;
  }
  return null;
}
/** The tyres bridge only the small coupling between this coach and its real
 * neighbour. Height checks keep cars below the chassis out of this exception. */
function nearRoofJoin(span: RailRoofSpan, point: { x:number; z:number }) {
  const p = railLocal(span, point.x, point.z);
  return Math.abs(p.along) <= span.halfLength + CAR_HALF_LENGTH + .2 && Math.abs(p.side) <= span.halfWidth;
}
function joinHasContact(join: RailRoofJoin, bodies:readonly MovingRailBody[], point:{x:number;z:number;feet:number}, previous=false) {
  const span = previous ? join.previous : join.current;
  const y = spanRoofAt(span,point.x,point.z);
  if(y !== null && Math.abs(point.feet-y)<=.08) return true;
  for(const body of bodies) if(body.id===join.a||body.id===join.b) {
    const own=bodyRoofAt(body,point.x,point.z,previous);
    if(own!==null&&Math.abs(point.feet-own)<=.08)return true;
  }
  return false;
}
function roofJoinClimb(body: MovingRailBody, bodies:readonly MovingRailBody[], x: number, z: number, previous?: {x:number;z:number;feet:number}) {
  if (!previous || Math.hypot(x - previous.x, z - previous.z) > 3.5) return 0;
  return body.roofJoins?.some(join => nearRoofJoin(join.current, {x,z}) &&
    (joinHasContact(join,bodies,previous,true)||joinHasContact(join,bodies,previous))) ? .35 : 0;
}
export function deliveryRampClimb(body:MovingRailBody,x:number,z:number,previous?:{x:number;z:number;feet:number}) {
  if(!previous||!body.id.startsWith('delivery-interior-ramp')||Math.abs(body.grade||0)>.3)return 0;
  const old=railLocal(body.previous,previous.x,previous.z);
  const oldRoof=body.roof-body.y+body.previous.y+old.along*(body.previous.grade??body.grade??0);
  const distance=Math.hypot(x-previous.x,z-previous.z);
  return distance<=3&&Math.abs(old.side)<=body.halfWidth+.1&&Math.abs(old.along)<=body.halfLength+1.2&&Math.abs(previous.feet-oldRoof)<=.2
    ?Math.min(.6,.12+distance*Math.abs(body.grade||0)):0;
}
export function movingRailSupport(bodies: readonly MovingRailBody[], x: number, z: number, fromY: number, previous?: {x:number;z:number;feet:number}) {
  let best: { body: MovingRailBody; y: number } | null = null;
  for (const body of bodies) {
    const y = railRoofAt(body, x, z);
    // A car beneath the chassis cannot snap through it onto the roof.
    if (y === null) continue;
    const climb=Math.max(.12,deliveryRampClimb(body,x,z,previous),roofJoinClimb(body,bodies,x,z,previous));
    if(y>fromY+climb)continue;
    if (!best || (Number.isFinite(fromY) ? Math.abs(y - fromY) < Math.abs(best.y - fromY) : y > best.y)) best = { body, y };
  }
  return best;
}
function extents(body: RailPose, yaw: number) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  return { along: Math.abs(fx * body.hx + fz * body.hz) * CAR_HALF_LENGTH + Math.abs(rx * body.hx + rz * body.hz) * CAR_HALF_WIDTH,
    side: Math.abs(-fx * body.hz + fz * body.hx) * CAR_HALF_LENGTH + Math.abs(-rx * body.hz + rz * body.hx) * CAR_HALF_WIDTH };
}
/** The joined open ramp/bed seam has neither a rear wall nor an extended slope. */
function deliveryRampFloorJoin(body: MovingRailBody, bodies: readonly MovingRailBody[], player: RailPlayer, previous: Point) {
  if (body.id !== 'delivery-interior-floor' && body.id !== 'delivery-interior-ramp' || player.flying || player.descending || player.jumping || player.vy > .1) return false;
  const ramp = body.id === 'delivery-interior-ramp' ? body : bodies.find(candidate => candidate.id === 'delivery-interior-ramp');
  const floor = body.id === 'delivery-interior-floor' ? body : bodies.find(candidate => candidate.id === 'delivery-interior-floor');
  if (!ramp || !floor || Math.abs(ramp.grade || 0) > .3 || ramp.hx * floor.hx + ramp.hz * floor.hz < .995) return false;
  const join = railWorld(ramp, ramp.halfLength, 0), rear = railWorld(floor, -floor.halfLength, 0);
  if (Math.hypot(join.x - rear.x, join.z - rear.z) > .05 ||
    Math.abs(ramp.roof + ramp.halfLength * (ramp.grade || 0) - (floor.roof - floor.halfLength * (floor.grade || 0))) > .05) return false;
  const local = railLocal(ramp, player.pos.x, player.pos.z), old = railLocal(ramp.previous, previous.x, previous.z);
  const width = extents(ramp, player.yaw).side;
  const seamReach = CAR_HALF_LENGTH + .25;
  if (Math.abs(local.side) + width > Math.min(ramp.halfWidth, floor.halfWidth) - .02 ||
    Math.abs(local.along - ramp.halfLength) > seamReach ||
    Math.abs(old.along - ramp.halfLength) > seamReach + .25 || Math.abs(old.side) + width > ramp.halfWidth) return false;
  const floorLocal = railLocal(floor, player.pos.x, player.pos.z), oldFloor = railLocal(floor.previous, previous.x, previous.z);
  const roof = local.along <= ramp.halfLength ? ramp.roof + local.along * (ramp.grade || 0) : floor.roof + floorLocal.along * (floor.grade || 0);
  const oldRoof = old.along <= ramp.halfLength
    ? ramp.roof - ramp.y + ramp.previous.y + old.along * (ramp.previous.grade ?? ramp.grade ?? 0)
    : floor.roof - floor.y + floor.previous.y + oldFloor.along * (floor.previous.grade ?? floor.grade ?? 0);
  // Require actual continuous tyre contact, so neither a car below the bed
  // nor a missing/closed ramp can use this small rear-seam exception.
  return Math.abs(player.pos.y - FOOT - roof) <= .2 && Math.abs(previous.y - FOOT - oldRoof) <= .2;
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
  /** Actual contact established by the shared collision/support pass. */
  get supportId() { return this.attached; }
  private previous: Point = { x: 0, y: 0, z: 0 };
  private revision: number | undefined;
  private drift = { x: 0, z: 0 };
  beforePlayer(player: RailPlayer, bodies: readonly MovingRailBody[], flyPressed = false, dt = 0) {
    this.bodies = bodies;
    this.previous = { ...player.pos };
    if (this.revision !== player.placementRevision) { this.attached = null; this.drift = { x: 0, z: 0 }; }
    this.revision = player.placementRevision;
    if (player.glide || player.flying || player.jumping || flyPressed) this.attached = null;
    if (this.attached) {
      const body = bodies.find(b => b.id === this.attached);
      if (!body) this.attached = null;
      else {
        const local = railLocal(body.previous, player.pos.x, player.pos.z);
        const oldRoof = railRoofAt(body, player.pos.x, player.pos.z, true);
        if (oldRoof === null || Math.abs(player.pos.y - FOOT - oldRoof) > .4) this.attached = null;
        else {
          const next = railWorld(body, local.along, local.side);
          player.pos.x = next.x; player.pos.z = next.z; player.pos.y += body.y - body.previous.y + local.along * ((body.grade || 0) - (body.previous.grade || 0));
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
      const a = railLocal(body.previous, this.previous.x, this.previous.z), b = railLocal(body, player.pos.x, player.pos.z);
      const currentRoof = body.roof + b.along * (body.grade || 0), previousRoof = body.roof - body.y + body.previous.y + a.along * (body.previous.grade || 0);
      if (feet >= currentRoof - .12 && oldFeet >= previousRoof - .12) continue;
      if (deliveryRampFloorJoin(body, this.bodies, player, this.previous)) continue;
      if (!player.flying && !player.descending && !player.jumping && player.vy <= .1 &&
        body.roofJoins?.some(join => nearRoofJoin(join.current,player.pos) &&
          joinHasContact(join,this.bodies,{x:player.pos.x,z:player.pos.z,feet}) &&
          joinHasContact(join,this.bodies,{x:this.previous.x,z:this.previous.z,feet:oldFeet},true))) continue;
      if (feet + CAR_HEIGHT < body.bottom + b.along * (body.grade || 0) || oldFeet > previousRoof + .2 && feet > currentRoof + .2) continue;
      const ex = extents(body, player.yaw), along = body.halfLength + ex.along, side = body.halfWidth + ex.side;
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
      const gradeAt = (body.previous.grade || 0) + ((body.grade || 0) - (body.previous.grade || 0)) * t, alongAt = a.along + (b.along - a.along) * t;
      const base = body.bottom - (body.y - body.previous.y) * (1 - t) + alongAt * gradeAt, roof = body.roof - (body.y - body.previous.y) * (1 - t) + alongAt * gradeAt;
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
    if (!player.flying && !player.jumping && !player.glide && player.vy <= .1) {
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

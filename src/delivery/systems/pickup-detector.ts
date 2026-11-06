import { EventBus, type DeliveryEvents, type OrderPicked } from '../core/events';
import { PICKUP_CONFIG, type PickupConfig } from '../core/pickup-config';

export interface JumpPickupPose {
  x: number; y: number; z: number;
  /** Actual rotating Roadster bounds; snapshot values before the next player update. */
  bottom: number; top: number;
  jumping: boolean;
}

export interface PickupMarker {
  carrierId: string;
  position: { x: number; y: number; z: number };
  previousPosition: { x: number; y: number; z: number };
}

function validPoint(p: { x: number; y: number; z: number }) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function validPose(p: JumpPickupPose) {
  return validPoint(p) && Number.isFinite(p.bottom) && Number.isFinite(p.top) && p.top >= p.bottom;
}

/** Continuous overlap of two moving objects, with interpolated hero vertical bounds. */
function overlapTime(before: JumpPickupPose, after: JumpPickupPose, marker: PickupMarker, radius: number): number | null {
  const ax = marker.previousPosition.x - before.x, az = marker.previousPosition.z - before.z;
  const bx = marker.position.x - after.x, bz = marker.position.z - after.z;
  const vx = bx - ax, vz = bz - az;
  // The configurable grab radius extends the hero footprint, not only its root point.
  const horizontal = radius + 1.1;
  const a = vx * vx + vz * vz, b = 2 * (ax * vx + az * vz), c = ax * ax + az * az - horizontal * horizontal;
  let lo = 0, hi = 1;
  if (a < 1e-12) { if (c > 0) return null; }
  else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    lo = Math.max(lo, (-b - root) / (2 * a));
    hi = Math.min(hi, (-b + root) / (2 * a));
    if (lo > hi) return null;
  }
  // Intersect the horizontal time interval with both vertical half-spaces.
  // This avoids catching an upper-deck box simply because its XZ crosses the car.
  const clip = (start: number, end: number): boolean => {
    const velocity = end - start;
    if (Math.abs(velocity) < 1e-12) return start >= 0;
    const crossing = -start / velocity;
    if (velocity > 0) lo = Math.max(lo, crossing);
    else hi = Math.min(hi, crossing);
    return lo <= hi;
  };
  if (!clip(marker.previousPosition.y - before.bottom + radius, marker.position.y - after.bottom + radius)) return null;
  if (!clip(before.top - marker.previousPosition.y + radius, after.top - marker.position.y + radius)) return null;
  return lo <= hi ? lo : null;
}

export class PickupDetector {
  enabled = true;
  private picked = false;
  get caught(): boolean { return this.picked; }

  constructor(private events: EventBus<DeliveryEvents>, private config: Readonly<PickupConfig> = PICKUP_CONFIG) {}

  /** Call only for a continuous simulation frame; reset after relocation or a new delivery. */
  update(before: JumpPickupPose, after: JumpPickupPose, markers: readonly PickupMarker[],
    canCollect?: (marker: PickupMarker, contactTime: number) => boolean): OrderPicked | null {
    if (!this.enabled || this.picked || (!before.jumping && !after.jumping) || !validPose(before) || !validPose(after)) return null;
    let nearest: PickupMarker | null = null, firstTime = Infinity;
    for (const marker of markers) {
      if (!marker.carrierId || !validPoint(marker.position) || !validPoint(marker.previousPosition)) continue;
      const time = overlapTime(before, after, marker, this.config.grabRadius);
      if (time !== null && time < firstTime && (!canCollect || canCollect(marker, time))) { nearest = marker; firstTime = time; }
    }
    if (!nearest) return null;
    // Latch before synchronous callbacks can re-enter update or remove markers.
    this.picked = true;
    const event: OrderPicked = { carrierId: nearest.carrierId, position: {
      x: nearest.previousPosition.x + (nearest.position.x - nearest.previousPosition.x) * firstTime,
      y: nearest.previousPosition.y + (nearest.position.y - nearest.previousPosition.y) * firstTime,
      z: nearest.previousPosition.z + (nearest.position.z - nearest.previousPosition.z) * firstTime,
    } };
    this.events.emit('orderPicked', event);
    return event;
  }

  /** A direct impact with a marked auto collects the same anonymous order. */
  collectMarkedAuto(carrierId: string, position: { x: number; y: number; z: number }): OrderPicked | null {
    if (!this.enabled || this.picked || !carrierId || !validPoint(position)) return null;
    this.picked = true;
    const event: OrderPicked = { carrierId, position: { ...position } };
    this.events.emit('orderPicked', event);
    return event;
  }

  reset(): void { this.picked = false; }
}

import type { CityData } from '../world/city';
import { supportAt } from './physics';
import type { TrafficPose } from './traffic-path';

/** The mesh follows finite, reachable road beneath its nose and tail. This is
 * visual posture only: graph height, heading, progress and avoidance stay owned
 * by Traffic. Missing pavement and another road layer never supply a tilt. */
export function trafficRoadPitch(city: CityData | undefined, p: TrafficPose, length: number) {
  if (!city || !Number.isFinite(length) || length <= 0) return 0;
  const span = Math.min(4, Math.max(.5, length * .35));
  const front = supportAt(city, p.x + p.hx * span, p.z + p.hz * span, p.y, true);
  const rear = supportAt(city, p.x - p.hx * span, p.z - p.hz * span, p.y, true);
  if (!front.onRoad || !rear.onRoad || !front.s?.roadQuad || !rear.s?.roadQuad ||
    Math.abs(front.y - p.y) > span * .12 + .03 || Math.abs(rear.y - p.y) > span * .12 + .03) return 0;
  const grade = (front.y - rear.y) / (2 * span);
  return Math.abs(grade) <= .12 ? Math.atan(grade) : 0;
}

/** Exact vertical section of the existing traffic body box after road pitch.
 * Clip to the player's local longitudinal footprint, so the lower end does not
 * inherit the higher end's roof. The flat interval retains its prior datum. */
export function trafficBodySection(base: number, height: number, length: number, pitch: number, along: number, halfSpan: number) {
  if (!Number.isFinite(pitch)) pitch = 0;
  const halfLength = length / 2;
  if (pitch === 0) return along + halfSpan < -halfLength || along - halfSpan > halfLength ? null :
    { bottom: base, top: base + height, minimumAlong: -halfLength, maximumAlong: halfLength };
  const cosine = Math.cos(pitch), sine = Math.sin(pitch);
  const a = [cosine * halfLength, -cosine * halfLength, -cosine * halfLength - sine * height, cosine * halfLength - sine * height];
  const y = [sine * halfLength, -sine * halfLength, cosine * height - sine * halfLength, cosine * height + sine * halfLength];
  const minimumAlong = Math.min(...a), maximumAlong = Math.max(...a), lo = Math.max(minimumAlong, along - halfSpan), hi = Math.min(maximumAlong, along + halfSpan);
  if (lo > hi) return null;
  let bottom = Infinity, top = -Infinity;
  const add = (value: number) => { bottom = Math.min(bottom, value); top = Math.max(top, value); };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (a[i] >= lo && a[i] <= hi) add(y[i]);
    if (Math.abs(a[j] - a[i]) < 1e-12) continue;
    for (const edge of [lo, hi]) {
      const t = (edge - a[i]) / (a[j] - a[i]);
      if (t >= 0 && t <= 1) add(y[i] + (y[j] - y[i]) * t);
    }
  }
  return Number.isFinite(bottom) ? { bottom: base + bottom, top: base + top, minimumAlong, maximumAlong } : null;
}

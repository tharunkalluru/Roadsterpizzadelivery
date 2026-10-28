import type { CityData } from '../world/city';
import { roadQuadHeight } from '../world/road-surface';

export const JUMP_COOLDOWN_SECONDS = 5;
// Keep the original hang time and momentum-based reach at half the old height.
// A broad, low apex leaves enough real clearance to pass over a moving bus.
export const JUMP_HEIGHT = 3.125;
export const JUMP_GRAVITY = 9;
export const JUMP_AIRTIME = 5 / 3;
const JUMP_RAMP = .2;

export function jumpProfile(elapsed: number) {
  const phase = Math.max(0, Math.min(1, elapsed / JUMP_AIRTIME));
  const rising = phase < JUMP_RAMP, falling = phase > 1 - JUMP_RAMP;
  const ramp = rising ? phase / JUMP_RAMP : falling ? (1 - phase) / JUMP_RAMP : 1;
  const envelope = ramp * ramp * (3 - 2 * ramp);
  const velocity = rising || falling ? (rising ? 1 : -1) * JUMP_HEIGHT * 6 * ramp * (1 - ramp) / (JUMP_RAMP * JUMP_AIRTIME) : 0;
  return { rise: JUMP_HEIGHT * envelope, velocity, envelope };
}

// A ceiling contact or a landing below the launch level ends the planned arc
// and falls onto the next real support. No part of the stunt adds forward speed.
export function advanceJump(velocity: number, dt: number) {
  return { rise: velocity * dt - .5 * JUMP_GRAVITY * dt * dt, velocity: velocity - JUMP_GRAVITY * dt };
}

// Find a real overhead deck at this XY. Unlike supportAt, this is a ceiling
// query: a road above the launch lane must not become an upward landing snap.
export function jumpCeiling(city: CityData, x: number, z: number, above: number): number | null {
  let ceiling: number | null = null;
  const seen = new Set<unknown>(), cx = Math.floor(x / 30), cz = Math.floor(z / 30);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of city.surfaceGrid.get(`${cx + i},${cz + j}`) || []) {
    if (seen.has(s)) continue; seen.add(s);
    const dx = s.bx - s.ax, dz = s.bz - s.az, length2 = dx * dx + dz * dz || 1;
    const raw = ((x - s.ax) * dx + (z - s.az) * dz) / length2, t = Math.max(0, Math.min(1, raw));
    const exact = s.kind === 'road' && s.roadQuad ? roadQuadHeight(s.roadQuad, x, z) : undefined;
    if (exact === null || exact === undefined && (raw < 0 || raw > 1 || Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) > s.hw)) continue;
    const underside = (exact ?? s.ya + (s.yb - s.ya) * t) - .35;
    if (underside > above + .05 && (ceiling === null || underside < ceiling)) ceiling = underside;
  }
  return ceiling;
}

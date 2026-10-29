import type { HudRect } from './hud-layout';

export interface FlightNavigationInput {
  x: number;
  z: number;
  yaw: number;
  flying: boolean;
  descending?: boolean;
  target: { x: number; z: number; kind: 'pickup' | 'customer' };
}

export interface FlightNavigationReadout {
  bearing: number;
  metres: number;
  distance: string;
  target: 'Pickup' | 'Customer';
  kind: 'pickup' | 'customer';
  hint: string;
}

const TAU = Math.PI * 2;
export function signedFlightAngle(angle: number) {
  if (!Number.isFinite(angle)) return 0;
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

// The Roadster faces (-sin(yaw), -cos(yaw)). Positive screen rotation points
// right, matching right steering rather than a camera's temporary orbit.
export function flightNavigationReadout(input: FlightNavigationInput | null): FlightNavigationReadout | null {
  if (!input || (!input.flying && !input.descending) || !input.target ||
    !['pickup', 'customer'].includes(input.target.kind) ||
    ![input.x, input.z, input.yaw, input.target.x, input.target.z].every(Number.isFinite)) return null;
  const dx = input.target.x - input.x, dz = input.target.z - input.z;
  const metres = Math.hypot(dx, dz);
  if (!Number.isFinite(metres)) return null;
  const bearing = metres < .01 ? 0 : signedFlightAngle(input.yaw - Math.atan2(-dx, -dz));
  const target = input.target.kind === 'pickup' ? 'Pickup' : 'Customer';
  const angle = Math.abs(bearing);
  const hint = input.descending ? 'Landing' : metres <= 35 ? `Land for ${target.toLowerCase()}` :
    angle < Math.PI / 15 ? 'Straight ahead' : angle > Math.PI * 5 / 6 ? 'Turn around' : bearing < 0 ? 'Steer left' : 'Steer right';
  return { bearing, metres, distance: metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`, target, kind: input.target.kind, hint };
}

// Keep a continuous angle across +/-180 degrees, avoiding a full-circle spin.
export function smoothFlightBearing(previous: number | null, wanted: number, dt: number) {
  if (!Number.isFinite(wanted)) return Number.isFinite(previous) ? previous! : 0;
  if (previous == null || !Number.isFinite(previous)) return wanted;
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  return previous + signedFlightAngle(wanted - previous) * (1 - Math.exp(-elapsed * 16));
}

// A separate central lane; existing controls, minimap and task panel never move.
export function flightNavigationLayout(width: number, height: number, headerBottom: number, areaBottom: number,
  tasks: HudRect, map: HudRect, controlsTop: number, panelHeight = 64): HudRect | null {
  if (![width, height, headerBottom, areaBottom, tasks.left, tasks.width, map.left, controlsTop].every(Number.isFinite)) return null;
  const left = Math.max(12, tasks.left + tasks.width + 12), right = Math.min(width - 12, map.left - 12);
  const available = right - left, top = Math.max(12, headerBottom + 8, areaBottom + 8);
  if (!Number.isFinite(panelHeight) || panelHeight < 44 || panelHeight > 64 || available < 156 || top + panelHeight > Math.min(height - 24, controlsTop - 12)) return null;
  const w = Math.min(180, available);
  return { left: Math.round(Math.max(left, Math.min(right - w, (width - w) / 2))), top: Math.round(top), width: Math.floor(w), height: panelHeight };
}

import type { HudRect } from './hud-layout';

export interface FlightNavigationInput {
  x: number;
  z: number;
  yaw: number;
  flying: boolean;
  descending?: boolean;
  road?: { metres:number; hint:string; bearing:number };
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
  if (!input || (!input.flying && !input.descending && !input.road) || !input.target ||
    !['pickup', 'customer'].includes(input.target.kind) ||
    ![input.x, input.z, input.yaw, input.target.x, input.target.z].every(Number.isFinite)) return null;
  if(!input.flying&&!input.descending&&input.road) { const r=input.road;return {bearing:r.bearing,metres:r.metres,distance:r.metres>=1000?`${(r.metres/1000).toFixed(1)} km`:`${Math.round(r.metres)} m`,target:input.target.kind==='pickup'?'Pickup':'Customer',kind:input.target.kind,hint:r.hint}; }
  const dx = input.target.x - input.x, dz = input.target.z - input.z;
  const metres = Math.hypot(dx, dz);
  if (!Number.isFinite(metres)) return null;
  const bearing = metres < .01 ? 0 : signedFlightAngle(input.yaw - Math.atan2(-dx, -dz));
  const target = input.target.kind === 'pickup' ? 'Pickup' : 'Customer';
  const angle = Math.abs(bearing);
  const hint = input.descending ? 'Landing' : metres <= 35 ? 'Descend to marker' :
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

const MIN_NAVIGATION_WIDTH = 156;
const navigationLane = (width:number,taskRight:number,mapLeft:number) => ({
  left:Math.max(12,taskRight+12),right:Math.min(width-12,mapLeft-12),
});
/** Pick the compact rail from measured free space, including safe-area insets.
 * A viewport breakpoint left 600–618px phones without either navigation lane. */
export function flightNavigationNeedsCompactLane(width:number,steeringRight:number,mapLeft:number,brakeLeft:number) {
  const lane=navigationLane(width,steeringRight,Math.min(mapLeft,brakeLeft));
  return width<600||lane.right-lane.left<MIN_NAVIGATION_WIDTH;
}

// A separate central lane; existing controls, minimap and task panel never move.
export function flightNavigationLayout(width: number, height: number, headerBottom: number, _areaBottom: number,
  tasks: HudRect, map: HudRect, controlsTop: number, panelHeight = 48): HudRect | null {
  if (![width, height, headerBottom, tasks.left, tasks.width, map.left, controlsTop].every(Number.isFinite)) return null;
  const { left, right } = navigationLane(width,tasks.left+tasks.width,map.left);
  const available = right - left, top = Math.max(12, headerBottom + 8);
  if (!Number.isFinite(panelHeight) || panelHeight < 44 || panelHeight > 64 || available < MIN_NAVIGATION_WIDTH || top + panelHeight > Math.min(height - 24, controlsTop - 12)) return null;
  const w = Math.min(180, available);
  return { left: Math.round(Math.max(left, Math.min(right - w, (width - w) / 2))), top: Math.round(top), width: Math.floor(w), height: panelHeight };
}

type RoadPoint = readonly [number, number, number];
const MANOEUVRE_RANGE = 700, JOIN_TOLERANCE = 1.25, HEADING_SPAN = 18, TURN_ANGLE = .7;

/** Simplify only the instruction's geometry. The driven/drawn path stays intact.
 * Finite-segment distance preserves reversals, unlike an infinite-line test. */
function manoeuvrePath(source: readonly RoadPoint[]) {
  const points: RoadPoint[] = [];
  let distance = 0, visited = 0;
  for (const point of source) {
    if (++visited > 16384) return [];
    if (!point || !point.every(Number.isFinite)) return [];
    const previous = points[points.length - 1];
    if (!previous) { points.push(point); continue; }
    const length = Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    if (length < .01) continue;
    if (distance + length > MANOEUVRE_RANGE) {
      const t = (MANOEUVRE_RANGE - distance) / length;
      points.push([previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t, previous[2] + (point[2] - previous[2]) * t]);
      break;
    }
    points.push(point); distance += length;
    // More than the production guide's densest local sampling, still bounded.
    if (points.length >= 4096) break;
  }
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length), stack = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  while (stack.length) {
    const [first, last] = stack.pop()!, a = points[first], b = points[last];
    const dx = b[0] - a[0], dz = b[2] - a[2], length2 = dx * dx + dz * dz;
    let maximum = JOIN_TOLERANCE * JOIN_TOLERANCE, chosen = -1;
    for (let i = first + 1; i < last; i++) {
      const px = points[i][0] - a[0], pz = points[i][2] - a[2];
      const t = length2 ? Math.max(0, Math.min(1, (px * dx + pz * dz) / length2)) : 0;
      const error = (px - dx * t) ** 2 + (pz - dz * t) ** 2;
      if (error > maximum) { maximum = error; chosen = i; }
    }
    if (chosen >= 0) { keep[chosen] = 1; stack.push([first, chosen], [chosen, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Read the checked road ribbon, ignoring lane seams and gradual road curvature. */
export function roadNavigationCue(pts: readonly RoadPoint[] | undefined, remaining: number, view?: { yaw: number }) {
  const metres = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const unavailable = () => ({ metres, hint: 'Follow the map marker', bearing: 0 });
  if (!pts || pts.length < 2) return unavailable();
  const path = manoeuvrePath(pts);
  if (path.length < 2) return unavailable();
  const along = [0];
  for (let i = 1; i < path.length; i++) along.push(along[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][2] - path[i - 1][2]));
  const total = along[along.length - 1];
  const at = (distance: number) => {
    distance = Math.max(0, Math.min(total, distance));
    let lo = 1, hi = path.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (along[mid] < distance) lo = mid + 1; else hi = mid; }
    const a = path[lo - 1], b = path[lo], t = (distance - along[lo - 1]) / Math.max(.001, along[lo] - along[lo - 1]);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[2] + (b[2] - a[2]) * t };
  };
  const direction = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.atan2(b.z - a.z, b.x - a.x);
  const first = at(0), ahead = at(Math.min(HEADING_SPAN, total));
  const initial = direction(first, ahead);
  if (view && Number.isFinite(view.yaw) && total > 8) {
    // Use the current leg, not the net position beyond an upcoming hairpin.
    const leg = path[1];
    const bearing = signedFlightAngle(view.yaw - Math.atan2(-(leg[0] - first.x), -(leg[2] - first.z)));
    if (Math.abs(bearing) > Math.PI * .8) return { metres: 0, hint: 'Turn around', bearing };
  }
  let bend = false;
  for (let i = 1; i < path.length - 1; i++) {
    const distance = along[i], vertex = { x: path[i][0], z: path[i][2] };
    const before = at(distance - HEADING_SPAN), after = at(distance + HEADING_SPAN);
    if (Math.hypot(vertex.x - before.x, vertex.z - before.z) < 3 || Math.hypot(after.x - vertex.x, after.z - vertex.z) < 3) continue;
    const incoming = direction(before, vertex), outgoing = direction(vertex, after);
    const angle = signedFlightAngle(outgoing - incoming);
    if (Math.abs(signedFlightAngle(outgoing - initial)) > .35) bend = true;
    // A short lateral join turns back immediately. A real corner changes the
    // sustained direction on both sides, independent of source vertex density.
    if (Math.abs(angle) < TURN_ANGLE) continue;
    if (Math.abs(angle) > Math.PI * .82) return { metres: distance, hint: 'Turn around', bearing: angle };
    return { metres: distance, hint: angle < 0 ? 'Turn left' : 'Turn right', bearing: angle < 0 ? -Math.PI / 2 : Math.PI / 2 };
  }
  return { metres, hint: bend ? 'Follow the road' : 'Continue straight', bearing: 0 };
}

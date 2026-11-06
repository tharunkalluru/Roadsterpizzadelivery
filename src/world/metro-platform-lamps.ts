import type { TiledBatch } from '../core/util';
import { METRO_PLATFORM_HALF_LENGTH, projectMetroPath, sampleMetroPath, type MetroPlatformAssembly } from './metro-geometry';

interface Position { x: number; y: number; z: number }
interface PlanPosition { x: number; z: number }
export interface MetroPlatformLampFixture {
  id: string; side: -1 | 1; u: number; position: Position; hx: number; hz: number;
  rods: { x: number; z: number; bottom: number; top: number }[];
}
type LampBatches = { st: Pick<TiledBatch, 'box'>; lit: Pick<TiledBatch, 'box'> };
const fixtures = new WeakMap<MetroPlatformAssembly, readonly MetroPlatformLampFixture[]>();
const ROW_OFFSET = 6.9, ROW_STEP = 10, LAMP_HEIGHT = 3, ROD_OFFSET = 1.15;
const finite = (...values: number[]) => values.every(Number.isFinite);

/** Intersect a vertical hanger with City's existing seven straight-frame roof
 * slats. The platform path bends beneath this roof: use the actual hanger's
 * station-frame coordinates, not its requested path offset. No roof is moved. */
function canopyUnderside(assembly: MetroPlatformAssembly, point: PlanPosition): number | null {
  const { cx, cz, hx, hz } = assembly.frame, dx = point.x - cx, dz = point.z - cz;
  const u = dx * hx + dz * hz, v = -dx * hz + dz * hx;
  if (Math.abs(u) > METRO_PLATFORM_HALF_LENGTH + 2) return null;
  let lower = Infinity;
  for (let k = 0; k < 7; k++) {
    const a0 = -1 + 2 * k / 7, a1 = -1 + 2 * (k + 1) / 7;
    const v0 = a0 * 13, v1 = a1 * 13;
    const h0 = assembly.deckHeight + 9.2 - 2.4 * a0 * a0, h1 = assembly.deckHeight + 9.2 - 2.4 * a1 * a1;
    const vm = (v0 + v1) / 2, hm = (h0 + h1) / 2, tilt = Math.atan2(h1 - h0, v1 - v0);
    const cosine = Math.cos(tilt), localX = (vm - v + .15 * Math.sin(tilt)) / cosine;
    if (Math.abs(localX) > (Math.hypot(v1 - v0, h1 - h0) + .05) / 2) continue;
    lower = Math.min(lower, hm + (v - vm) * Math.tan(tilt) - .15 / cosine);
  }
  return Number.isFinite(lower) ? lower : null;
}

/** New physical fluorescent fixtures, batched once with the station tile.
 * Their diffusers follow the same real corridor as the existing platform pads.
 * No Light, collision surface, platform extension or per-frame mesh is created. */
export function metroPlatformLampFixtures(assembly: MetroPlatformAssembly): readonly MetroPlatformLampFixture[] {
  const prior = fixtures.get(assembly); if (prior) return prior;
  const path = assembly.corridor.center, { cx, cz, hx, hz } = assembly.frame;
  if (!finite(cx, cz, hx, hz, assembly.deckHeight, path.len) || path.pts.length < 2 || path.len <= 0 ||
      Math.abs(Math.hypot(hx, hz) - 1) > 1e-6 || path.pts.some(point => !finite(...point))) return [];
  const stationS = projectMetroPath(path, [cx, cz]).s, lamps: MetroPlatformLampFixture[] = [];
  const y = assembly.deckHeight + 1.2 + LAMP_HEIGHT;
  for (const side of [-1, 1] as const) for (let u = -60; u <= 60; u += ROW_STEP) {
    if (stationS + u - ROD_OFFSET < 0 || stationS + u + ROD_OFFSET > path.len) continue;
    const point = sampleMetroPath(path, stationS + u);
    const position = { x: point.x - point.hz * side * ROW_OFFSET, y, z: point.z + point.hx * side * ROW_OFFSET };
    const rods: MetroPlatformLampFixture['rods'] = [];
    for (const along of [-ROD_OFFSET, ROD_OFFSET]) {
      const rod = { x: position.x + point.hx * along, z: position.z + point.hz * along };
      const top = canopyUnderside(assembly, rod), bottom = y + .16;
      if (top === null || top <= bottom) break;
      rods.push({ ...rod, bottom, top });
    }
    // Do not invent a floating luminaire when a future source path misses the roof.
    if (rods.length === 2) lamps.push({ id: `metro-platform-lamp:${assembly.key}:${side}:${u}`, side, u, position, hx: point.hx, hz: point.hz, rods });
  }
  fixtures.set(assembly, lamps); return lamps;
}

export function drawMetroPlatformLamps(assembly: MetroPlatformAssembly, B: LampBatches) {
  const lamps = metroPlatformLampFixtures(assembly);
  for (const lamp of lamps) {
    const { x, y, z } = lamp.position, yaw = Math.atan2(lamp.hx, lamp.hz);
    B.st.box(x, y + .09, z, .42, .14, 3.2, '#89939d', { ry: yaw });
    B.lit.box(x, y, z, .34, .045, 3.0, '#f3f8ff', { ry: yaw });
    for (const rod of lamp.rods) B.st.box(rod.x, (rod.bottom + rod.top) / 2, rod.z, .035, rod.top - rod.bottom, .035, '#a5adb5');
  }
  return lamps;
}

/** Resolve once at a real station door. A pooled light may borrow precisely
 * this rendered diffuser position; the actor does not carry a floating light. */
export function nearestActualMetroPlatformLamp(assembly: MetroPlatformAssembly, door: PlanPosition, outward: PlanPosition,recipient?:PlanPosition): MetroPlatformLampFixture | null {
  if (!finite(door.x, door.z, outward.x, outward.z)||(recipient&&!finite(recipient.x,recipient.z))) return null;
  const length = Math.hypot(outward.x, outward.z); if (length < 1e-8) return null;
  const lamps = metroPlatformLampFixtures(assembly); if (!lamps.length) return null;
  const path = assembly.corridor.center, stationS = projectMetroPath(path, [assembly.frame.cx, assembly.frame.cz]).s;
  const projection = projectMetroPath(path, [door.x, door.z]);
  if (Math.abs(projection.s - stationS) > METRO_PLATFORM_HALF_LENGTH + 4 || projection.d > 9.3) return null;
  const tangent = sampleMetroPath(path, projection.s), ox = outward.x / length, oz = outward.z / length;
  const lateral = -tangent.hz * ox + tangent.hx * oz; if (Math.abs(lateral) < .5) return null;
  const side = lateral > 0 ? 1 : -1, target = recipient??{ x: door.x + ox * 2.8, z: door.z + oz * 2.8 };
  let nearest: MetroPlatformLampFixture | null = null, distance = Infinity;
  for (const lamp of lamps) if (lamp.side === side) {
    const squared = (lamp.position.x - target.x) ** 2 + (lamp.position.z - target.z) ** 2;
    if (squared < distance) { nearest = lamp; distance = squared; }
  }
  return nearest;
}

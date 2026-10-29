import type { OsmFeature } from './extras';
import type { makeRailwayNetwork } from './railway-geometry';
import type { XZ } from './types';

export interface StationBoardAnchor {
  x: number; z: number; y: number; hx: number; hz: number; side: number;
  source: 'mapped-platform' | 'trackside-model'; platform?: string;
}
export const railwayStationCode = (station: OsmFeature) => /^[A-Z]{2,5}$/.test(station.t.ref || '') ? station.t.ref : '';
function inside(p: XZ, ring: XZ[]) {
  let value = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) value = !value;
  }
  return value;
}
function platformCenter(f: OsmFeature): XZ | null {
  const line = f.l || f.r?.[0]; if (!line?.length) return f.p || null;
  const ring = line.length > 2 && line[0][0] === line.at(-1)![0] && line[0][1] === line.at(-1)![1] ? line.slice(0, -1) : line;
  const center = ring.reduce((p, q) => [p[0] + q[0] / ring.length, p[1] + q[1] / ring.length], [0, 0]) as XZ;
  if (!f.r || inside(center, ring)) return center;
  // A concave station platform can have its vertex average outside its mapped
  // footprint. Choose a point inside the source polygon, never shift the ring.
  for (let i = 1; i + 1 < ring.length; i++) {
    const p: XZ = [(ring[0][0] + ring[i][0] + ring[i + 1][0]) / 3, (ring[0][1] + ring[i][1] + ring[i + 1][1]) / 3];
    if (inside(p, ring)) return p;
  }
  return null;
}
// Platform polygons are source evidence, whereas a railway=station point is an
// identity/stop location, not a building footprint (OSM Railway_stations).
export function railwayStationBoards(network: ReturnType<typeof makeRailwayNetwork>, station: OsmFeature): StationBoardAnchor[] {
  const anchors: StationBoardAnchor[] = [];
  for (const platform of network.stationPlatforms.get(station.id) || []) {
    const p = platformCenter(platform); if (!p) continue;
    const rail = network.closest(...p, 35); if (!rail) continue;
    const side = Math.sign(-(p[0] - rail.x) * rail.hz + (p[1] - rail.z) * rail.hx);
    if (!side || rail.d < 2) continue; // a source footprint crossing the running rail is not a board site
    anchors.push({ x: p[0], z: p[1], y: rail.y, hx: rail.hx, hz: rail.hz, side, source: 'mapped-platform', platform: platform.id });
  }
  const at = network.center(station);
  anchors.sort((a, b) => Math.hypot(a.x - at[0], a.z - at[1]) - Math.hypot(b.x - at[0], b.z - at[1]) || a.platform!.localeCompare(b.platform!));
  if (anchors.length) return anchors.slice(0, 4);
  const rail = network.closest(...at, 150); if (!rail) return [];
  return [-1, 1].map(side => ({ x: rail.x - rail.hz * side * 4.5, z: rail.z + rail.hx * side * 4.5,
    y: rail.y, hx: rail.hx, hz: rail.hz, side, source: 'trackside-model' }));
}

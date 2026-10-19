import { WORLD_ORIGIN } from './schema';

// WGS84 radii at the origin latitude (same projection as scripts/import-map.mjs; see DATA_SOURCES.md)
const a = 6378137, e2 = 6.69437999014e-3;
const phi = (WORLD_ORIGIN.lat * Math.PI) / 180;
const sin2 = Math.sin(phi) ** 2;
const M = (a * (1 - e2)) / Math.pow(1 - e2 * sin2, 1.5);
const N = a / Math.sqrt(1 - e2 * sin2);

/** lat/lon → local metres (X east, Z south) */
export function project(lat: number, lon: number): [number, number] {
  const x = ((lon - WORLD_ORIGIN.lon) * Math.PI / 180) * Math.cos(phi) * N;
  const z = -((lat - WORLD_ORIGIN.lat) * Math.PI / 180) * M;
  return [x, z];
}

/** Exact inverse of the package projection, used for street-reference links citywide. */
export function unproject(x: number, z: number): [number, number] {
  return [WORLD_ORIGIN.lat - z / M * 180 / Math.PI, WORLD_ORIGIN.lon + x / (Math.cos(phi) * N) * 180 / Math.PI];
}

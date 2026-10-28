interface CoverageWorld {
  packOf: ReadonlyMap<string, unknown>;
  tiles: ReadonlyMap<string, unknown>;
  empty: ReadonlySet<string>;
}
export interface MovementCoverageNeed { x: number; z: number; radius: number; missing: string[] }

// The full prefetch radius remains asynchronous. Only the current body footprint
// and a short movement envelope must be coherent before another physics step.
export function movementCoverageNeed(city: CoverageWorld, x: number, z: number, vx: number, vz: number): MovementCoverageNeed | null {
  const px = x + vx * .15, pz = z + vz * .15, margin = 5;
  const minX = Math.min(x, px) - margin, maxX = Math.max(x, px) + margin;
  const minZ = Math.min(z, pz) - margin, maxZ = Math.max(z, pz) + margin;
  let missing: string[] | undefined;
  for (let i = Math.floor(minX / 1000); i <= Math.floor(maxX / 1000); i++)
    for (let j = Math.floor(minZ / 1000); j <= Math.floor(maxZ / 1000); j++) {
      const key = `${i}_${j}`;
      if (city.packOf.has(key) && !city.tiles.has(key) && !city.empty.has(key)) (missing ||= []).push(key);
    }
  return missing ? { x: (x + px) / 2, z: (z + pz) / 2, radius: Math.hypot(px - x, pz - z) / 2 + Math.SQRT2 * margin, missing } : null;
}

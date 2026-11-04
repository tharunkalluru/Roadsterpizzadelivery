import { stadiumExclusions } from '../world/stadium-roads';

// Cached map packs retain their original road polylines. A small world-space
// clip gives those paths the same bowl exclusion as the playable streets,
// without scanning or rebuilding the city source on each map redraw.
export function createStadiumRoadMask(origin: { lat: number; lon: number },
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): Path2D {
  // Leave a generous exterior margin: this is a bowl mask, not a new playable
  // bounds crop of the cached map's wider source coverage.
  const path = new Path2D(), pad = 1_000_000;
  path.rect(bounds.minX - pad, bounds.minZ - pad, bounds.maxX - bounds.minX + pad * 2, bounds.maxZ - bounds.minZ + pad * 2);
  for (const stadium of stadiumExclusions(origin)) {
    path.moveTo(stadium.x + stadium.rx, stadium.z);
    path.ellipse(stadium.x, stadium.z, stadium.rx, stadium.rz, 0, 0, Math.PI * 2);
    path.closePath();
  }
  return path;
}

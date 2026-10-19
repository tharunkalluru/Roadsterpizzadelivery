type Point = readonly [number, number];
interface ReferenceSource {
  id: string;
  kind: string;
  url: string;
  position?: { lat: number; lon: number };
}
interface ReferenceOptions<T extends ReferenceSource> {
  road: { points: readonly Point[] };
  sources: readonly T[];
  associatedSourceIds: ReadonlySet<string>;
  project: (lat: number, lon: number) => Point;
  fallbackUrl: string;
  maxDistanceM?: number;
}

function distanceToRoad(point: Point, points: readonly Point[]): number {
  if (!points.length) return Infinity;
  let distance = Math.hypot(point[0] - points[0][0], point[1] - points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2)) : 0;
    distance = Math.min(distance, Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t));
  }
  return distance;
}

/** A batch-wide review source is context, not proof that its camera belongs to every road.
 * Keep source URLs and their captured framing intact; proximity never assigns a shop or side.
 * Cameras farther than 150 m from this road stay available in Reference notes, but are not the
 * primary link. Legacy unpositioned references remain usable only without a local camera. */
export function streetViewReference<T extends ReferenceSource>(options: ReferenceOptions<T>): {
  source?: T;
  url: string;
  basis: 'road_evidence' | 'nearby_camera' | 'unpositioned_reference' | 'road_location';
} {
  const { road, sources, associatedSourceIds, project, fallbackUrl, maxDistanceM = 150 } = options;
  const positioned: { source: T; distance: number }[] = [], unpositioned: T[] = [];
  for (const source of sources) {
    if (source.kind !== 'street_view' || !source.url) continue;
    if (!source.position) { unpositioned.push(source); continue; }
    const { lat, lon } = source.position;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const point = project(lat, lon);
    if (!point.every(Number.isFinite)) continue;
    positioned.push({ source, distance: distanceToRoad(point, road.points) });
  }
  const nearby = positioned.filter(p => p.distance <= maxDistanceM).sort((a, b) => a.distance - b.distance);
  const associated = nearby.find(p => associatedSourceIds.has(p.source.id));
  const selected = associated ?? nearby[0];
  if (selected) return { source: selected.source, url: selected.source.url, basis: associated ? 'road_evidence' : 'nearby_camera' };
  const legacy = unpositioned.find(s => associatedSourceIds.has(s.id)) ?? (!positioned.length ? unpositioned[0] : undefined);
  if (legacy) return { source: legacy, url: legacy.url, basis: 'unpositioned_reference' };
  return { url: fallbackUrl, basis: 'road_location' };
}

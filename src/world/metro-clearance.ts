import { metroDeckHeight, type MetroCorridor } from './metro-geometry';
import { roadStructureClearance } from './structure-clearance';
import type { RoadEdge } from './types';
const cache = new WeakMap<readonly MetroCorridor[], Map<number, ReturnType<typeof roadStructureClearance>>>();

// Supports of one interchange level must also leave the other service's train
// and a roof-riding car clear. Decks/rails themselves sit below this volume.
export function metroStructureClearance(corridors: readonly MetroCorridor[], baseline: number) {
  const saved = cache.get(corridors)?.get(baseline); if (saved) return saved;
  const paths: RoadEdge[] = corridors.map(c => ({ id: `metro:${c.id}`, seg: c.id, name: null, cls: 'metro', w: 9,
    lanes: 2, oneway: null, from: null, to: null, maxspeed: null, pts: c.center.pts,
    elev: c.center.cum.map(s => metroDeckHeight(c, s, baseline) + .99) }));
  const result = roadStructureClearance(paths, 5.6), entries = cache.get(corridors) || new Map(); entries.set(baseline, result); cache.set(corridors, entries); return result;
}

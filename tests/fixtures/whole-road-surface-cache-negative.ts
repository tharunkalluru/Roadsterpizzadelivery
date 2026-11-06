import type { RoadEdge } from '../../src/world/types';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadQuadHeight, type RoadQuad } from '../../src/world/road-surface';

/** Negative control for the retired whole-ribbon residency policy. It retains
 * the same96-edge/131072-point limits and rebuilds a full varying road on a miss.
 * This fixture is not production code and is not used to measure phone FPS. */
export class WholeRoadSurfaceCacheNegative {
  readonly entries = new Map<RoadEdge, { quads: RoadQuad[]; points: number }>();
  points = 0;
  builds = 0;
  height(e: RoadEdge, segment: number, x: number, z: number, scalar: number) {
    let entry = this.entries.get(e);
    if (!entry) {
      const quads = roadRibbon(e, [e]).quads;
      entry = { quads, points: quads.length * 4 };
      this.builds++;
      this.entries.set(e, entry); this.points += entry.points;
      while (this.entries.size > 96 || this.points > 131072) {
        const oldest = this.entries.keys().next().value!;
        this.points -= this.entries.get(oldest)!.points;
        this.entries.delete(oldest);
      }
    } else { this.entries.delete(e); this.entries.set(e, entry); }
    let value = scalar, error = Infinity;
    for (const offset of [0, -1, 1]) {
      const q = entry.quads[segment + offset]; if (!q) continue;
      const y = roadQuadHeight(q, x, z); if (y === null) continue;
      const d = Math.abs(y - scalar); if (d < error) { value = y; error = d; }
    }
    return value;
  }
}

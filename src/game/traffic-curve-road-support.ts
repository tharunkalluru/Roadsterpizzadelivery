import type { Surface } from '../world/city';
import { roadQuadHeight } from '../world/road-surface';
import type { GEdge } from './roadgraph';

/** Segment indices are in the conditioned source road, never a nearest-road
 * guess. Callers supply only the spans the planned maneuver actually follows. */
export interface TrafficCurveRoadWindow {
  roadId: string;
  firstSegment: number;
  lastSegment: number;
}

/** Convert directed maneuver progress to a local source-segment window. One
 * adjacent segment retains the same finite miter seam used by RoadGraph. */
export function trafficCurveRoadWindow(edge: GEdge, dir: 1 | -1, start: number, end: number): TrafficCurveRoadWindow {
  if (!Number.isFinite(start) || !Number.isFinite(end) || edge.cum.length < 2) return { roadId: edge.e.id, firstSegment: -1, lastSegment: -1 };
  const a = dir === 1 ? start : edge.len - start, b = dir === 1 ? end : edge.len - end;
  const low = Math.max(0, Math.min(edge.len, Math.min(a, b))), high = Math.max(0, Math.min(edge.len, Math.max(a, b)));
  const segmentAt = (distance: number) => {
    let lo = 0, hi = edge.cum.length - 1;
    while (hi - lo > 1) { const middle = (lo + hi) >> 1; if (edge.cum[middle] < distance) lo = middle; else hi = middle; }
    return lo;
  };
  return { roadId: edge.e.id, firstSegment: Math.max(0, segmentAt(low) - 1), lastSegment: Math.min(edge.cum.length - 2, segmentAt(high) + 1) };
}

interface CachedCell {
  source: Surface[];
  sourceLength: number;
  surfaces: Surface[];
  blocked: boolean;
}

/** Y-only support for an existing traffic curve. The horizontal curve, its
 * length, speed, timing and heading remain the caller's responsibility.
 *
 * A maneuver reads nine local surface cells. It cannot choose an unrelated
 * crossing deck, another part of a looping road, or an unloaded tile's old
 * surface. Cached lists contain references, not copied/generated geometry. */
export class TrafficCurveRoadSupport {
  // A bus route may cross up to 48 short source pieces in its 120 m horizon.
  static readonly MAX_WINDOWS = 64;
  static readonly MAX_CACHED_CELLS = 32;
  static readonly MAX_CELL_SURFACES = 512;
  static readonly MAX_OWN_SURFACES = 256;
  static readonly MAX_VERTICAL_CORRECTION = 1.25;

  private readonly windows = new Map<string, TrafficCurveRoadWindow[]>();
  private readonly cells = new Map<string, CachedCell>();
  private valid = true;

  constructor(private readonly grid: Map<string, Surface[]>, windows: readonly TrafficCurveRoadWindow[]) {
    if (!windows.length || windows.length > TrafficCurveRoadSupport.MAX_WINDOWS) { this.valid = false; return; }
    for (const window of windows) {
      if (!window.roadId || !Number.isSafeInteger(window.firstSegment) || !Number.isSafeInteger(window.lastSegment) ||
          window.firstSegment < 0 || window.lastSegment < window.firstSegment) {
        this.valid = false;
        break;
      }
      const owned = this.windows.get(window.roadId) ?? [];
      owned.push({ ...window });
      this.windows.set(window.roadId, owned);
    }
  }

  private cell(key: string): CachedCell | undefined {
    const source = this.grid.get(key);
    if (!source) {
      this.cells.delete(key);
      return;
    }
    const cached = this.cells.get(key);
    // World merges append to a cell and unloads replace its array. Both must
    // invalidate the local list before an old surface can be sampled.
    if (cached?.source === source && cached.sourceLength === source.length) return cached;
    const entry: CachedCell = { source, sourceLength: source.length, surfaces: [], blocked: source.length > TrafficCurveRoadSupport.MAX_CELL_SURFACES };
    if (!entry.blocked) for (let i = 0; i < source.length; i++) {
      const surface = source[i];
      if (surface.kind !== 'road' || !surface.e || !surface.roadQuad) continue;
      const windows = this.windows.get(surface.e.id);
      if (!windows) continue;
      let own = false;
      for (let j = 0; j < windows.length; j++) {
        if (surface.i >= windows[j].firstSegment && surface.i <= windows[j].lastSegment) { own = true; break; }
      }
      if (!own) continue;
      if (entry.surfaces.length === TrafficCurveRoadSupport.MAX_OWN_SURFACES) { entry.blocked = true; entry.surfaces.length = 0; break; }
      entry.surfaces.push(surface);
    }
    this.cells.delete(key);
    this.cells.set(key, entry);
    while (this.cells.size > TrafficCurveRoadSupport.MAX_CACHED_CELLS) this.cells.delete(this.cells.keys().next().value!);
    return entry;
  }

  /** Returns null when the intended loaded road has no finite support, when
   * two plausible owned layers are ambiguous, or when a local budget is hit.
   * The caller must retain/reject its existing path rather than invent a ramp. */
  heightAt(x: number, z: number, guideY: number): number | null {
    if (!this.valid || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(guideY)) return null;
    const cx = Math.floor(x / 30), cz = Math.floor(z / 30);
    let height: number | null = null, bestError = Infinity, ambiguous = false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const cell = this.cell(`${cx + dx},${cz + dz}`);
      if (cell?.blocked) return null;
      if (!cell) continue;
      for (let i = 0; i < cell.surfaces.length; i++) {
        const y = roadQuadHeight(cell.surfaces[i].roadQuad!, x, z);
        if (y === null || !Number.isFinite(y)) continue;
        const error = Math.abs(y - guideY);
        if (error > TrafficCurveRoadSupport.MAX_VERTICAL_CORRECTION) continue;
        if (error < bestError - .01) { height = y; bestError = error; ambiguous = false; }
        else if (height !== null && Math.abs(error - bestError) <= .01 && Math.abs(y - height) > .01) ambiguous = true;
      }
    }
    return ambiguous ? null : height;
  }
}

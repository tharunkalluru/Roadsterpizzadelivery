export interface SpatialBounds { minX: number; minZ: number; maxX: number; maxZ: number }
interface Entry<T> { value: T; bounds: SpatialBounds; order: number; keys: string[]; stamp: number; x0: number; x1: number; z0: number; z1: number }

/** Conservative X/Z broadphase. Height and precise collision stay with callers. */
export class DynamicSpatialIndex<T> {
  private cells = new Map<string, Set<Entry<T>>>();
  private entries = new Map<T, Entry<T>>();
  private stamp = 0;
  private selected: Entry<T>[] = [];
  queries = 0; candidates = 0;
  constructor(readonly cellSize = 20) {}
  clear() { this.cells.clear(); this.entries.clear(); }
  remove(value: T) {
    const e = this.entries.get(value); if (!e) return;
    for (const key of e.keys) { const cell = this.cells.get(key); cell?.delete(e); if (!cell?.size) this.cells.delete(key); }
    this.entries.delete(value);
  }
  upsert(value: T, bounds: SpatialBounds, order: number) {
    const x0 = Math.floor(bounds.minX / this.cellSize), x1 = Math.floor(bounds.maxX / this.cellSize);
    const z0 = Math.floor(bounds.minZ / this.cellSize), z1 = Math.floor(bounds.maxZ / this.cellSize);
    let e = this.entries.get(value);
    if (e && e.x0 === x0 && e.x1 === x1 && e.z0 === z0 && e.z1 === z1) { Object.assign(e.bounds, bounds); e.order = order; return; }
    if (e) { for (const key of e.keys) { const cell = this.cells.get(key); cell?.delete(e); if (!cell?.size) this.cells.delete(key); } e.keys.length = 0; }
    else { e = { value, bounds: { ...bounds }, order, keys: [], stamp: 0, x0, x1, z0, z1 }; this.entries.set(value, e); }
    Object.assign(e.bounds, bounds); e.order = order;
    e.x0 = x0; e.x1 = x1; e.z0 = z0; e.z1 = z1;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const key = `${x},${z}`; let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, cell = new Set()); cell.add(e); e.keys.push(key);
    }
  }
  query(bounds: SpatialBounds, output: T[]): number {
    output.length = 0; this.queries++;
    if (++this.stamp >= Number.MAX_SAFE_INTEGER) { this.stamp = 1; for (const e of this.entries.values()) e.stamp = 0; }
    const selected = this.selected; selected.length = 0;
    const x0 = Math.floor(bounds.minX / this.cellSize), x1 = Math.floor(bounds.maxX / this.cellSize);
    const z0 = Math.floor(bounds.minZ / this.cellSize), z1 = Math.floor(bounds.maxZ / this.cellSize);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const e of this.cells.get(`${x},${z}`) || []) {
      if (e.stamp === this.stamp) continue; e.stamp = this.stamp;
      if (e.bounds.maxX < bounds.minX || e.bounds.minX > bounds.maxX || e.bounds.maxZ < bounds.minZ || e.bounds.minZ > bounds.maxZ) continue;
      selected.push(e);
    }
    selected.sort((a, b) => a.order - b.order);
    for (const e of selected) output.push(e.value);
    this.candidates += output.length; return output.length;
  }
}

export function vehicleBounds(p: { x: number; z: number; hx: number; hz: number; size: number[] }, margin = 0): SpatialBounds {
  const x = Math.abs(p.hz) * p.size[0] / 2 + Math.abs(p.hx) * p.size[2] / 2 + margin;
  const z = Math.abs(p.hx) * p.size[0] / 2 + Math.abs(p.hz) * p.size[2] / 2 + margin;
  return { minX: p.x - x, maxX: p.x + x, minZ: p.z - z, maxZ: p.z + z };
}

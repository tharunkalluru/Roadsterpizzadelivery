/** Read-through tile-owned grids make tile publication/removal independent of its cell count. */
export class TileGrid<T> extends Map<string, T[]> {
  private owners = new Map<string, Map<string, T[]>>();
  private cache = new Map<string, T[] | undefined>();
  attach(owner: string, cells: Map<string, T[]>) { this.owners.set(owner, cells); this.cache.clear(); }
  detach(owner: string) { this.owners.delete(owner); this.cache.clear(); }
  override get(key: string): T[] | undefined {
    if (this.cache.has(key)) return this.cache.get(key);
    let result = super.get(key);
    for (const cells of this.owners.values()) {
      const cell = cells.get(key);
      if (cell?.length) result = result ? result.concat(cell) : cell;
    }
    if (this.cache.size >= 8192) this.cache.clear();
    this.cache.set(key, result); return result;
  }
  override has(key: string) { return this.get(key) !== undefined; }
  override set(key: string, values: T[]) { this.cache.delete(key); return super.set(key, values); }
  override delete(key: string) { this.cache.delete(key); return super.delete(key); }
  override clear() { super.clear(); this.owners.clear(); this.cache.clear(); }
  override *keys(): MapIterator<string> {
    const seen = new Set<string>();
    for (const key of super.keys()) { seen.add(key); yield key; }
    for (const cells of this.owners.values()) for (const key of cells.keys()) if (!seen.has(key)) { seen.add(key); yield key; }
  }
  override *values(): MapIterator<T[]> { for (const key of this.keys()) yield this.get(key)!; }
  override *entries(): MapIterator<[string, T[]]> { for (const key of this.keys()) yield [key, this.get(key)!]; }
  override [Symbol.iterator](): MapIterator<[string, T[]]> { return this.entries(); }
  override get size() { let size = 0; for (const _ of this.keys()) size++; return size; }
  override forEach(callback: (value: T[], key: string, map: Map<string, T[]>) => void, thisArg?: any) {
    for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this);
  }
}

/** Immutable per-tile value directories avoid copying thousands of building IDs at activation. */
export class TileValues<T> extends Map<string, T> {
  private owners = new Map<string, Map<string, T>>();
  private cache = new Map<string, T | undefined>();
  attach(owner: string, values: Map<string, T>) { this.owners.set(owner, values); this.cache.clear(); }
  detach(owner: string) { this.owners.delete(owner); this.cache.clear(); }
  override get(key: string): T | undefined {
    if (this.cache.has(key)) return this.cache.get(key);
    let result = super.get(key);
    for (const values of this.owners.values()) if (values.has(key)) result = values.get(key);
    if (this.cache.size >= 8192) this.cache.clear(); this.cache.set(key, result); return result;
  }
  override has(key: string) { return this.get(key) !== undefined; }
  override set(key: string, value: T) { this.cache.delete(key); return super.set(key, value); }
  override delete(key: string) { this.cache.delete(key); return super.delete(key); }
  override clear() { super.clear(); this.owners.clear(); this.cache.clear(); }
  override *keys(): MapIterator<string> {
    const seen = new Set<string>();
    for (const key of super.keys()) { seen.add(key); yield key; }
    for (const values of this.owners.values()) for (const key of values.keys()) if (!seen.has(key)) { seen.add(key); yield key; }
  }
  override *values(): MapIterator<T> { for (const key of this.keys()) yield this.get(key)!; }
  override *entries(): MapIterator<[string, T]> { for (const key of this.keys()) yield [key, this.get(key)!]; }
  override [Symbol.iterator](): MapIterator<[string, T]> { return this.entries(); }
  override get size() { let size = 0; for (const _ of this.keys()) size++; return size; }
  override forEach(callback: (value: T, key: string, map: Map<string, T>) => void, thisArg?: any) { for (const [key, value] of this.entries()) callback.call(thisArg, value, key, this); }
}

export interface StreamFocus {
  x: number; z: number; vx: number; vz: number;
  mode: 'road' | 'jump' | 'flight' | 'descending';
  landingBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  pinnedTileKeys?: readonly string[];
}

export function predictedFocus(focus: StreamFocus, preparationSeconds: number) {
  // Bounded supplemental lookahead never replaces the existing surrounding ring.
  const seconds = Math.max(2, Math.min(8, preparationSeconds));
  const length = Math.hypot(focus.vx, focus.vz), reach = Math.min(800, length * seconds);
  return { x: focus.x + (length ? focus.vx / length * reach : 0), z: focus.z + (length ? focus.vz / length * reach : 0) };
}

export function bufferBytes(buffers: { pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array }[]) {
  let bytes = 0; for (const b of buffers) bytes += b.pos.byteLength + b.nor.byteLength + b.uv.byteLength + b.col.byteLength; return bytes;
}

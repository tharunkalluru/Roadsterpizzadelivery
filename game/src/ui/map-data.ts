// The map owns this compact representation. Float64 preserves every shipped
// coordinate exactly; transfer avoids cloning hundreds of thousands of arrays.
export interface MapPack { roads: Record<string, number[][]>; areas: { k: 'park' | 'water'; r: number[] }[]; metro: number[][] }
export interface PackedMapPaths { points: Float64Array; offsets: Uint32Array }
export interface MinorMapCell { key: string; paths: PackedMapPaths }
export interface PreparedMapData {
  park: PackedMapPaths; water: PackedMapPaths;
  roads: { kind: string; paths: PackedMapPaths }[];
  minor: MinorMapCell[];
  polylines: number; points: number;
}
export interface MapPath { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void }
export const MAP_CELL = 2000;
export const MAP_STYLES: Record<string, [number, string]> = { minor: [6, '#8F86B8'], ter: [9, '#CFC6E4'], major: [14, '#F3EEDF'], elev: [13, '#B9A9F0'] };

export function packMapPaths(lines: readonly number[][]): PackedMapPaths {
  let count = 0;
  for (const line of lines) { if (line.length < 2 || line.length % 2) throw new Error('Invalid map geometry'); count += line.length; }
  const points = new Float64Array(count), offsets = new Uint32Array(lines.length + 1);
  let at = 0;
  for (let i = 0; i < lines.length; i++) { offsets[i] = at; points.set(lines[i], at); at += lines[i].length; }
  offsets[lines.length] = at;
  return { points, offsets };
}
export function prepareMapData(pack: MapPack): PreparedMapData {
  if (!pack || !pack.roads || !Array.isArray(pack.areas)) throw new Error('Invalid map data');
  const park = packMapPaths(pack.areas.filter(a => a.k !== 'water').map(a => a.r));
  const water = packMapPaths(pack.areas.filter(a => a.k === 'water').map(a => a.r));
  const roads = ['ter', 'major', 'elev'].filter(kind => pack.roads[kind]).map(kind => ({ kind, paths: packMapPaths(pack.roads[kind]) }));
  const cells = new Map<string, number[][]>();
  for (const line of pack.roads.minor || []) {
    if (line.length < 2) throw new Error('Invalid map road');
    // Retain V21's exact first-vertex cell ownership and per-cell source order.
    const key = `${Math.floor(line[0] / MAP_CELL)},${Math.floor(line[1] / MAP_CELL)}`;
    (cells.get(key) || cells.set(key, []).get(key)!).push(line);
  }
  const minor = [...cells].map(([key, lines]) => ({ key, paths: packMapPaths(lines) }));
  const groups = [park, water, ...roads.map(r => r.paths), ...minor.map(c => c.paths)];
  return { park, water, roads, minor,
    polylines: groups.reduce((n, g) => n + g.offsets.length - 1, 0), points: groups.reduce((n, g) => n + g.points.length / 2, 0) };
}
export function mapDataTransfers(data: PreparedMapData): ArrayBuffer[] {
  const groups = [data.park, data.water, ...data.roads.map(r => r.paths), ...data.minor.map(c => c.paths)];
  return [...new Set(groups.flatMap(g => [g.points.buffer as ArrayBuffer, g.offsets.buffer as ArrayBuffer]))];
}
// A generator boundary is never farther than 512 native path commands apart.
// The caller also enforces a wall-time slice; no work is scheduled while closed.
export function* appendMapPaths(path: MapPath, data: PackedMapPaths, close = false): Generator<void> {
  let commands = 0;
  for (let line = 0; line + 1 < data.offsets.length; line++) {
    const start = data.offsets[line], end = data.offsets[line + 1];
    path.moveTo(data.points[start], data.points[start + 1]);
    if (++commands >= 512) { commands = 0; yield; }
    for (let i = start + 2; i < end; i += 2) { path.lineTo(data.points[i], data.points[i + 1]); if (++commands >= 512) { commands = 0; yield; } }
    if (close) { path.closePath(); if (++commands >= 512) { commands = 0; yield; } }
  }
}

export class MinorMapPaths<P extends MapPath> {
  readonly ready = new Map<string, P>();
  private source: Map<string, PackedMapPaths>;
  private visible = new Set<string>();
  private pending = new Map<string, { path: P; job: Generator<void> }>();
  private order: string[] = [];
  constructor(cells: MinorMapCell[], private create: () => P, readonly idleLimit = 32) { this.source = new Map(cells.map(c => [c.key, c.paths])); }
  request(cx: number, cz: number, scale: number, width: number, height: number) {
    const wanted: string[] = [];
    if (scale >= .07) {
      const x0 = Math.floor((cx - width / 2 / scale) / MAP_CELL), x1 = Math.floor((cx + width / 2 / scale) / MAP_CELL);
      const z0 = Math.floor((cz - height / 2 / scale) / MAP_CELL), z1 = Math.floor((cz + height / 2 / scale) / MAP_CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = `${x},${z}`; if (this.source.has(key)) wanted.push(key); }
    }
    this.visible = new Set(wanted); this.order = wanted;
    for (const key of this.pending.keys()) if (!this.visible.has(key)) this.pending.delete(key);
    for (const key of wanted) {
      const old = this.ready.get(key);
      if (old) { this.ready.delete(key); this.ready.set(key, old); }
      else if (!this.pending.has(key)) { const path = this.create(); this.pending.set(key, { path, job: appendMapPaths(path, this.source.get(key)!) }); }
    }
    let idle = [...this.ready.keys()].filter(key => !this.visible.has(key));
    while (idle.length > this.idleLimit) this.ready.delete(idle.shift()!);
  }
  step() {
    const key = this.order.find(k => this.pending.has(k)); if (!key) return false;
    const item = this.pending.get(key)!;
    if (item.job.next().done) { this.pending.delete(key); this.ready.set(key, item.path); }
    return true;
  }
  get pendingCount() { return this.pending.size; }
  get sourceCellCount() { return this.source.size; }
  get visibleReady() { return [...this.visible].every(key => this.ready.has(key)); }
}

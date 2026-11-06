import { railwayNetwork } from '../world/railway-geometry';

export interface RailwayMapTrack {
  pts: readonly (readonly [number, number])[];
  service: boolean;
  bounds?: readonly number[];
}
export interface RailwayMapStroke { path: Path2D; service: boolean }
const CELL = 500;

// The same canonical railway coordinates feed the world, full map and minimap.
// Native paths are retained; moving the car never replays the city rail data.
export class RailwayMapLayer {
  private cells = new Map<string, number[]>();
  private paths = new Map<number, RailwayMapStroke>();
  private full: RailwayMapStroke[] | null = null;
  private fullJob: Generator<void> | null = null;
  private nearKey = '';
  private near: RailwayMapStroke[] = [];
  readonly trackCount: number;
  constructor(private tracks: readonly RailwayMapTrack[], private Path: typeof Path2D = Path2D) {
    this.trackCount = tracks.filter(t => t.pts.length > 1).length;
    tracks.forEach((t, index) => {
      if (t.pts.length < 2) return;
      const bounds = t.bounds || [Math.min(...t.pts.map(p => p[0])), Math.max(...t.pts.map(p => p[0])), Math.min(...t.pts.map(p => p[1])), Math.max(...t.pts.map(p => p[1]))];
      for (let x = Math.floor(bounds[0] / CELL); x <= Math.floor(bounds[1] / CELL); x++)
        for (let z = Math.floor(bounds[2] / CELL); z <= Math.floor(bounds[3] / CELL); z++) {
          const key = `${x},${z}`, ids = this.cells.get(key) || [];
          ids.push(index); this.cells.set(key, ids);
        }
    });
  }
  private append(path: Path2D, track: RailwayMapTrack) {
    path.moveTo(track.pts[0][0], track.pts[0][1]);
    for (let i = 1; i < track.pts.length; i++) path.lineTo(track.pts[i][0], track.pts[i][1]);
  }
  private *buildAll(): Generator<void> {
    const running = new this.Path(), yard = new this.Path(); let commands = 0;
    for (const t of this.tracks) if (t.pts.length > 1) {
      const path = t.service ? yard : running;
      path.moveTo(t.pts[0][0], t.pts[0][1]); if (++commands >= 512) { commands = 0; yield; }
      for (let i = 1; i < t.pts.length; i++) { path.lineTo(t.pts[i][0], t.pts[i][1]); if (++commands >= 512) { commands = 0; yield; } }
    }
    this.full = [{ path: running, service: false }, { path: yard, service: true }];
  }
  *prepareAll(): Generator<void> {
    while (!this.full) { this.fullJob ??= this.buildAll(); this.fullJob.next(); if (!this.full) yield; }
    this.fullJob = null;
  }
  all(): readonly RailwayMapStroke[] {
    for (const _ of this.prepareAll()) { /* synchronous use only during initial loading */ }
    return this.full!;
  }
  nearby(x: number, z: number, radius: number): readonly RailwayMapStroke[] {
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL), z1 = Math.floor((z + radius) / CELL);
    const key = `${x0},${x1},${z0},${z1}`;
    if (key !== this.nearKey) {
      this.nearKey = key;
      const ids = new Set<number>();
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) for (const id of this.cells.get(`${i},${j}`) || []) ids.add(id);
      this.near = [...ids].sort((a, b) => a - b).map(id => {
        let cached = this.paths.get(id);
        if (!cached) { const path = new this.Path(); this.append(path, this.tracks[id]); cached = { path, service: this.tracks[id].service }; this.paths.set(id, cached); }
        return cached;
      });
    }
    return this.near;
  }
}

const layers = new WeakMap<object, WeakMap<object, RailwayMapLayer>>();
export function railwayMapLayer(profiles: readonly RailwayMapTrack[] = railwayNetwork().profiles, Path: typeof Path2D = Path2D): RailwayMapLayer {
  let constructors = layers.get(profiles);
  if (!constructors) { constructors = new WeakMap(); layers.set(profiles, constructors); }
  let layer = constructors.get(Path);
  if (!layer) { layer = new RailwayMapLayer(profiles, Path); constructors.set(Path, layer); }
  return layer;
}

// Screen-space strokes remain legible while the source alignment stays exact.
// Short pale sleepers over a dark bed distinguish railways from colored Metro.
export function drawRailways(g: CanvasRenderingContext2D, paths: readonly RailwayMapStroke[], scale: number, showYard = true) {
  g.save(); g.lineCap = 'butt'; g.lineJoin = 'round';
  for (const stroke of paths) {
    if (stroke.service && !showYard) continue;
    g.globalAlpha = stroke.service ? .65 : 1;
    g.setLineDash([]); g.strokeStyle = '#30263F'; g.lineWidth = (stroke.service ? 2.5 : 3.8) / scale; g.stroke(stroke.path);
    g.strokeStyle = '#D9C7A6'; g.lineWidth = (stroke.service ? 1.2 : 2) / scale;
    g.setLineDash([5 / scale, 4 / scale]); g.stroke(stroke.path);
  }
  g.restore();
}

import type { GEdge, RoadGraph } from '../game/roadgraph';
import { metroCorridors, type MetroLineInput } from '../world/metro-geometry';

type GraphSource = Pick<RoadGraph, 'revision' | 'nearestEdges'>;
interface StaticTile {
  image: HTMLCanvasElement;
  x: number; z: number; revision: number; edges: GEdge[]; used: number;
}

// A bounded world-aligned base layer. Draw inside the caller's existing
// world-to-minimap transform; the route, destination and player remain overlays.
// Keeping raster tiles, rather than a screen-aligned image, reuses them through
// camera rotation and small movements without blurring or exposing blank corners.
export class MinimapBaseCache {
  readonly stats = { builds: 0, hits: 0, bytes: 0 };
  private tiles = new Map<string, StaticTile>();
  private graph: GraphSource | null = null;
  private lines: readonly MetroLineInput[] | null = null;
  private density = 1;
  private serial = 0;
  constructor(private tileSize = 256, private maxTiles = 32,
    private makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}

  invalidate() { this.tiles.clear(); this.stats.bytes = 0; }

  draw(g: CanvasRenderingContext2D, graph: GraphSource, lines: readonly MetroLineInput[],
    px: number, pz: number, radius = 240, pixelsPerWorld = 1) {
    if (![px, pz, radius, pixelsPerWorld].every(Number.isFinite) || radius <= 0) return;
    // Discrete raster buckets avoid rebuilds from minor layout/zoom rounding.
    const density = Math.max(1, Math.min(2, Math.ceil(pixelsPerWorld * 2) / 2));
    if (this.graph !== graph || this.lines !== lines || this.density !== density) {
      this.invalidate(); this.graph = graph; this.lines = lines; this.density = density;
    }
    const size = this.tileSize, turn = ++this.serial;
    const minX = Math.floor((px - radius) / size), maxX = Math.floor((px + radius) / size);
    const minZ = Math.floor((pz - radius) / size), maxZ = Math.floor((pz + radius) / size);
    for (let ix = minX; ix <= maxX; ix++) for (let iz = minZ; iz <= maxZ; iz++) {
      const key = `${ix},${iz}`, x = ix * size, z = iz * size;
      let tile = this.tiles.get(key);
      if (!tile || tile.revision !== graph.revision) {
        const edges = graph.nearestEdges(x + size / 2, z + size / 2, Math.ceil((size / 2 + 80) / 60));
        // A remote graph revision does not repaint unaffected local tiles.
        if (tile && sameEdges(tile.edges, edges)) tile.revision = graph.revision;
        else {
          if (tile) this.stats.bytes -= tile.image.width * tile.image.height * 4;
          tile = this.build(x, z, edges, lines, graph.revision);
          this.tiles.set(key, tile);
        }
      }
      tile.used = turn; this.stats.hits++;
      g.drawImage(tile.image, x, z, size, size);
    }
    while (this.tiles.size > this.maxTiles) {
      let oldestKey: string | undefined, oldest = Infinity;
      for (const [key, tile] of this.tiles) if (tile.used < oldest) { oldest = tile.used; oldestKey = key; }
      if (oldestKey === undefined) break;
      const tile = this.tiles.get(oldestKey)!;
      this.stats.bytes -= tile.image.width * tile.image.height * 4;
      this.tiles.delete(oldestKey);
    }
  }

  private build(x: number, z: number, edges: GEdge[], lines: readonly MetroLineInput[], revision: number): StaticTile {
    const image = this.makeCanvas(), size = this.tileSize;
    image.width = image.height = Math.ceil(size * this.density);
    const g = image.getContext('2d')!;
    g.scale(this.density, this.density); g.translate(-x, -z);
    g.lineCap = 'round';
    for (const e of edges) {
      g.strokeStyle = e.e.elev ? '#8a80b8' : ['trunk', 'primary', 'secondary'].includes(e.e.cls) ? '#CFC6E4' : '#5a4f8a';
      g.lineWidth = Math.max(2.5, e.e.w * .9);
      g.beginPath();
      for (let i = 0; i < e.e.pts.length; i++) { const p = e.e.pts[i]; if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
    }
    for (const line of metroCorridors(lines)) {
      g.strokeStyle = line.color; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath();
      for (let i = 0; i < line.center.pts.length; i++) { const p = line.center.pts[i]; if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
    }
    g.setLineDash([]);
    this.stats.builds++; this.stats.bytes += image.width * image.height * 4;
    return { image, x, z, revision, edges, used: this.serial };
  }

  dispose() { this.invalidate(); this.graph = null; this.lines = null; }
}

function sameEdges(a: readonly GEdge[], b: readonly GEdge[]) {
  if (a.length !== b.length) return false;
  // RoadGraph returns stable references for an unchanged road. A small local
  // membership check tolerates grid insertion order after an unrelated update.
  const set = new Set(a);
  return b.every(edge => set.has(edge));
}

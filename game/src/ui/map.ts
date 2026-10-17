import type { WorldCore } from '../world/schema';
import type { WorldPhysics } from '../world/collision';
import type { Session } from '../missions/session';
import { project } from '../world/geo';

/**
 * Geographic overview drawn from canonical data (MASTER §15, G11): all three operating metro
 * alignments with stations, the selected playable street network, deliveries, route and player,
 * plus the planned-but-unbuilt scope. Opening it pauses the single-player simulation.
 */
export class MapView {
  private lines: { color: string; name: string; pts: [number, number][][] }[] = [];
  cx = 0; cz = 0; scale = 0.12;
  private boundsAll: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(public core: WorldCore, public world: WorldPhysics) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const l of core.metroLines) {
      const pts = l.geo.map((pl) => pl.map(([la, lo]) => project(la, lo)));
      for (const pl of pts) for (const [x, z] of pl) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      this.lines.push({ color: l.color, name: l.name, pts });
    }
    this.boundsAll = { minX, maxX, minZ, maxZ };
  }

  fitCorridor(w: number, h: number) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of this.core.roads) for (const [x, z] of r.points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    this.cx = (minX + maxX) / 2; this.cz = (minZ + maxZ) / 2;
    this.scale = Math.min(w / (maxX - minX + 200), h / (maxZ - minZ + 200));
  }
  fitNetwork(w: number, h: number) {
    const b = this.boundsAll;
    if (!isFinite(b.minX)) return this.fitCorridor(w, h);
    this.cx = (b.minX + b.maxX) / 2; this.cz = (b.minZ + b.maxZ) / 2;
    this.scale = Math.min(w / (b.maxX - b.minX + 2000), h / (b.maxZ - b.minZ + 2000));
  }

  draw(c: HTMLCanvasElement, s: Session | null) {
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height, dpr = W / c.clientWidth || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0a0e13'; g.fillRect(0, 0, W, H);
    const sc = this.scale * dpr;
    const X = (x: number) => W / 2 + (x - this.cx) * sc, Y = (z: number) => H / 2 + (z - this.cz) * sc;
    // playable boundary (available area)
    const bp = this.core.boundary.polygon;
    if (bp.length > 2) {
      g.fillStyle = 'rgba(61,220,132,0.06)'; g.strokeStyle = 'rgba(61,220,132,0.45)'; g.setLineDash([6 * dpr, 4 * dpr]); g.lineWidth = 1.5 * dpr;
      g.beginPath(); bp.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath(); g.fill(); g.stroke(); g.setLineDash([]);
    }
    // selected streets
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of this.core.roads) {
      const major = /^(trunk|primary|secondary|motorway)/.test(r.highway);
      g.strokeStyle = r.level > 0 ? '#c9d3dd' : major ? '#a7b3bf' : '#5d6873';
      g.lineWidth = Math.max(1 * dpr, Math.min(r.widthM * sc, (major ? 4 : 2) * dpr));
      g.beginPath(); r.points.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke();
    }
    // metro lines (full operating alignments)
    for (const l of this.lines) {
      g.strokeStyle = l.color; g.lineWidth = 3.5 * dpr; g.globalAlpha = 0.9;
      for (const pl of l.pts) { g.beginPath(); pl.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke(); }
      g.globalAlpha = 1;
    }
    // stations
    g.font = `${11 * dpr}px system-ui, sans-serif`; g.textBaseline = 'middle';
    for (const st of this.core.stations) {
      const [x, z] = project(st.lat, st.lon);
      g.fillStyle = '#fff'; g.strokeStyle = '#0a0e13'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(X(x), Y(z), (st.inCorridor ? 4.5 : 3) * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
      if (st.inCorridor || this.scale > 0.05) { g.fillStyle = st.inCorridor ? '#fff' : '#9aa6b2'; g.fillText(st.name, X(x) + 7 * dpr, Y(z)); }
    }
    // route
    if (s && s.route.length) {
      g.strokeStyle = '#35d0ff'; g.lineWidth = 4 * dpr; g.beginPath(); let first = true;
      for (const id of s.route.slice(s.routeIdx)) {
        const e = this.world.nav.edges.get(id)!; const r = this.world.roads.roads.get(e.roadId)!;
        for (const [x, z] of e.forward ? r.points : r.points.slice().reverse()) { if (first) { g.moveTo(X(x), Y(z)); first = false; } else g.lineTo(X(x), Y(z)); }
      }
      g.stroke();
    }
    // deliveries
    for (const d of this.core.deliveries) {
      const active = s?.currentStop?.id === d.id;
      g.fillStyle = active ? '#ffb020' : 'rgba(255,176,32,0.45)';
      g.beginPath(); g.rect(X(d.entrance[0]) - 4 * dpr, Y(d.entrance[1]) - 4 * dpr, 8 * dpr, 8 * dpr); g.fill();
      if (active) { g.fillStyle = '#ffb020'; g.fillText(d.label, X(d.entrance[0]) + 8 * dpr, Y(d.entrance[1])); }
    }
    if (s) {
      const p = s.player;
      g.save(); g.translate(X(p.x), Y(p.z)); g.rotate(-p.heading);
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath(); g.fill();
      g.restore();
    }
  }
}

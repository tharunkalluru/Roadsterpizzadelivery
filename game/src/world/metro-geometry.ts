import type { XZ } from './types';

export interface MetroLineInput { id: string; color?: string; name?: string; pts: XZ[] }
export interface MetroPath { pts: XZ[]; cum: number[]; len: number }
export interface MetroTrack { id: string; dir: 1 | -1; path: MetroPath }
export interface MetroCorridor { id: string; lineId: string; color: string; center: MetroPath; tracks: [MetroTrack, MetroTrack]; sourceParts: number }
export const METRO_TRACK_OFFSET = 1.95;
// HMRL corridor identities: Red=Miyapur–LB Nagar, Blue=Nagole–Raidurg, Green=JBS–MGBS.
// https://hmrl.co.in/about-hmrl/  These display colors are shared by map and world signage.
export const METRO_LINE_COLORS: Readonly<Record<string, string>> = { red: '#d71920', blue: '#1f5fbf', green: '#1a9850' };
export const metroLineColor = (id: string, fallback = '#697587') => METRO_LINE_COLORS[id.toLowerCase()] || fallback;
const cache = new WeakMap<readonly MetroLineInput[], MetroCorridor[]>();

export function metroPath(points: readonly XZ[]): MetroPath {
  const pts: XZ[] = [];
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.05) pts.push([p[0], p[1]]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] || 0 };
}

function position(path: MetroPath, distance: number) {
  if (path.pts.length < 2) return { x: path.pts[0]?.[0] || 0, z: path.pts[0]?.[1] || 0, hx: 0, hz: 1 };
  const s = Math.max(0, Math.min(path.len, distance));
  let lo = 1, hi = path.pts.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (path.cum[mid] < s) lo = mid + 1; else hi = mid; }
  const a = path.pts[lo - 1], b = path.pts[lo], len = path.cum[lo] - path.cum[lo - 1] || 1, u = (s - path.cum[lo - 1]) / len;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx: (b[0] - a[0]) / len, hz: (b[1] - a[1]) / len };
}

// Position remains on the exact rail path; a short chord avoids heading snaps at its vertices.
export function sampleMetroPath(path: MetroPath, s: number, look = 4) {
  const p = position(path, s), a = position(path, s - look), b = position(path, s + look);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return len > 0.001 ? { x: p.x, z: p.z, hx: (b.x - a.x) / len, hz: (b.z - a.z) / len } : p;
}

export function projectMetroPath(path: MetroPath, point: XZ) {
  let best = { d: Infinity, s: 0, ...position(path, 0) };
  for (let i = 1; i < path.pts.length; i++) {
    const a = path.pts[i - 1], b = path.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l = path.cum[i] - path.cum[i - 1];
    if (l <= 0) continue;
    const u = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (l * l)));
    const x = a[0] + dx * u, z = a[1] + dz * u, d = Math.hypot(point[0] - x, point[1] - z);
    if (d < best.d) best = { d, s: path.cum[i - 1] + u * l, x, z, hx: dx / l, hz: dz / l };
  }
  return best;
}

// A source station can only attach to a nearby corridor with matching line
// tags. The same frame is used for geometry, signs and offline clearance audits.
export function metroStationFrame(station: { p: XZ; lines?: string[] }, corridors: readonly MetroCorridor[]) {
  let best: { d: number; hx: number; hz: number; cx: number; cz: number; lineId: string } | null = null;
  for (const corridor of corridors) {
    if (station.lines?.length && !station.lines.includes(corridor.lineId)) continue;
    const p = projectMetroPath(corridor.center, station.p);
    if (!best || p.d < best.d) best = { d: p.d, hx: p.hx, hz: p.hz, cx: p.x, cz: p.z, lineId: corridor.lineId };
  }
  return best && best.d <= 60 ? best : null;
}

function densify(points: readonly XZ[]) {
  const out: XZ[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 35));
    if (!out.length) out.push(a);
    for (let k = 1; k <= steps; k++) out.push([a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps]);
  }
  return out;
}

// A miter keeps the two rails joined through a polyline bend instead of offsetting every segment independently.
export function offsetMetroPath(center: MetroPath, offset: number) {
  return metroPath(center.pts.map((p, i): XZ => {
    const a = center.pts[Math.max(0, i - 1)], b = center.pts[Math.min(center.pts.length - 1, i + 1)];
    const before = Math.hypot(p[0] - a[0], p[1] - a[1]), after = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const h0 = before ? [(p[0] - a[0]) / before, (p[1] - a[1]) / before] : [(b[0] - p[0]) / after, (b[1] - p[1]) / after];
    const h1 = after ? [(b[0] - p[0]) / after, (b[1] - p[1]) / after] : h0;
    let nx = -h0[1] - h1[1], nz = h0[0] + h1[0], n = Math.hypot(nx, nz);
    if (n < 0.01) { nx = -h1[1]; nz = h1[0]; n = 1; }
    nx /= n; nz /= n;
    const scale = Math.max(0.4, nx * -h1[1] + nz * h1[0]);
    return [p[0] + nx * offset / scale, p[1] + nz * offset / scale];
  }));
}

function pairScore(a: MetroPath, b: MetroPath) {
  if (!a.len || !b.len || Math.min(a.len, b.len) / Math.max(a.len, b.len) < 0.94) return Infinity;
  const first = a.pts[0], last = a.pts[a.pts.length - 1], bf = b.pts[0], bl = b.pts[b.pts.length - 1];
  const same = Math.max(Math.hypot(first[0] - bf[0], first[1] - bf[1]), Math.hypot(last[0] - bl[0], last[1] - bl[1]));
  const reverse = Math.max(Math.hypot(first[0] - bl[0], first[1] - bl[1]), Math.hypot(last[0] - bf[0], last[1] - bf[1]));
  if (Math.min(same, reverse) > 75) return Infinity;
  let total = 0;
  for (let i = 0; i <= 24; i++) {
    const p = position(a, a.len * i / 24), d = projectMetroPath(b, [p.x, p.z]).d;
    if (d > 50) return Infinity;
    total += d;
  }
  return total / 25 <= 12 ? total / 25 : Infinity;
}

/** Source geometry may already contain two physical tracks. Collapse that pair before making a twin-track deck. */
export function metroCorridors(lines: readonly MetroLineInput[]): MetroCorridor[] {
  const prior = cache.get(lines); if (prior) return prior;
  const parts = lines.map((line) => ({ line, path: metroPath(line.pts) })).filter((p) => p.path.len > 1), used = new Set<number>();
  const corridors: MetroCorridor[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (used.has(i)) continue;
    used.add(i); const a = parts[i]; let peer = -1, score = Infinity;
    for (let j = i + 1; j < parts.length; j++) if (!used.has(j) && a.line.id === parts[j].line.id) {
      const candidate = pairScore(a.path, parts[j].path);
      if (candidate < score) { score = candidate; peer = j; }
    }
    let pts = a.path.pts;
    if (peer !== -1) {
      used.add(peer); const b = parts[peer].path;
      // Nearest projection, rather than distance fraction, preserves bends even when opposite track endpoints differ.
      pts = pts.map((p): XZ => { const q = projectMetroPath(b, p); return [(p[0] + q.x) / 2, (p[1] + q.z) / 2]; });
    }
    const first = pts[0], last = pts[pts.length - 1];
    if (first[0] > last[0] || (first[0] === last[0] && first[1] > last[1])) pts = pts.slice().reverse();
    const center = metroPath(densify(pts)), id = `${a.line.id}:${corridors.filter((c) => c.lineId === a.line.id).length}`;
    const tracks = ([1, -1] as const).map((dir): MetroTrack => ({ id: `${id}:${dir}`, dir, path: offsetMetroPath(center, -dir * METRO_TRACK_OFFSET) })) as [MetroTrack, MetroTrack];
    corridors.push({ id, lineId: a.line.id, color: metroLineColor(a.line.id, a.line.color), center, tracks, sourceParts: peer === -1 ? 1 : 2 });
  }
  cache.set(lines, corridors); return corridors;
}

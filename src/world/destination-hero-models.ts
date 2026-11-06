import * as THREE from 'three';
import type { Kit } from './landmarks';
import { DESTINATION_HERO_PLANS } from './destination-hero-data';
type HeroId = keyof typeof DESTINATION_HERO_PLANS;
type XZ = [number, number];
const inRing = (ring: readonly (readonly number[])[], x: number, z: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
export function destinationHeroClearAt(l: { id?: string; x?: number; z?: number }, x: number, z: number): boolean | null {
  const plan = DESTINATION_HERO_PLANS[l.id as HeroId];
  return plan && l.x != null && l.z != null ? inRing(plan.ring, x - l.x, z - l.z) : null;
}
const area = (ring: XZ[]) => ring.reduce((n, a, i) => { const b = ring[(i + 1) % ring.length]; return n + a[0] * b[1] - a[1] * b[0]; }, 0);
function roof(K: Kit, ring: XZ[], y: number, color: string) {
  const r = area(ring) > 0 ? ring.slice().reverse() : ring;
  for (const triangle of THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(...p)), [])) {
    const [a, b, c] = triangle.map(i => r[i]);
    K.k.B.roof.tri([a[0], y, a[1]], [c[0], y, c[1]], [b[0], y, b[1]], color);
  }
}
const rect = (x: number, z: number, hx: number, hz: number, w: number, d: number): XZ[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + hz * u * w / 2 + hx * v * d / 2, z - hx * u * w / 2 + hz * v * d / 2]);
function box(K: Kit, x: number, z: number, bottom: number, w: number, h: number, d: number, color: string, angle = 0, solid = false) {
  const ring = rect(x, z, Math.sin(angle), Math.cos(angle), w, d);
  if (K.k.clear && !K.k.clear(ring, bottom, bottom + h)) return false;
  K.k.B.st.box(x, bottom + h / 2, z, w, h, d, color, { ry: angle });
  if (solid) K.k.solid(ring, bottom + h);
  return true;
}

// Exact named OSM outlines replace the old generic rectangles. These are
// recognizable stylized exteriors, not measured facades or mall interiors.
export function drawDestinationMall(K: Kit, id: Exclude<HeroId, 'uppal_stadium'>) {
  const plan = DESTINATION_HERO_PLANS[id], h = plan.height;
  const source: XZ[] = plan.ring.map(([x, z]) => [K.x0 + x, K.z0 + z] as XZ);
  const pieces = K.k.trim?.(source, h) ?? [source];
  const floors = id === 'lulu' || id === 'asian_amb' ? 6 : id === 'forum' ? 5 : 4;
  const palette = id === 'inorbit' ? ['#f0ede5', '#658b9c', '#a32d35'] : id === 'forum' ? ['#e1ded6', '#557d97', '#3c456e'] : id === 'lulu' ? ['#e6e3da', '#648c83', '#26734e'] : ['#d9d4c8', '#4b7088', '#704532'];
  for (const piece of pieces) {
    const ring = area(piece) > 0 ? piece.slice().reverse() : piece;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < .05) continue;
      // Real plan concavities/curves survive. Floor ribbons and tinted glazed
      // panels are illustrative, rather than measured facade reproductions.
      for (let floor = 0; floor < floors; floor++) {
        const low = h * floor / floors, top = h * (floor + 1) / floors;
        K.k.B.wall.quad([a[0], low, a[1]], [b[0], low, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], floor % 2 ? palette[0] : palette[1]);
        K.k.B.st.quad([a[0], top - .35, a[1]], [b[0], top - .35, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], palette[0]);
      }
      if (len > 8) for (let u = 2; u < len - 1; u += 5) {
        const x = a[0] + (b[0] - a[0]) * u / len, z = a[1] + (b[1] - a[1]) * u / len;
        box(K, x, z, .3, .22, h - .5, .32, palette[0]);
      }
    }
    roof(K, ring, h + .02, '#b9b7ae'); K.k.solid(ring, h);
  }
  // Entrance/name treatment binds to the existing geographic outline's long
  // edge; it is a legible recognition cue, not a surveyed entrance assignment.
  let front = 0, longest = 0;
  for (let i = 0; i < source.length; i++) { const a = source[i], b = source[(i + 1) % source.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > longest) { front = i; longest = l; } }
  const a = source[front], b = source[(front + 1) % source.length], hx = (b[0] - a[0]) / longest, hz = (b[1] - a[1]) / longest, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  let nx = -hz, nz = hx; if (inRing(source, mx + nx, mz + nz)) { nx = -nx; nz = -nz; }
  const boardWidth = Math.min(27, longest * .68), boardH = id === 'asian_amb' ? 2.7 : 2.2, y = Math.min(h - 3.2, 17);
  const label = id === 'inorbit' ? 'INORBIT MALL CYBERABAD' : id === 'forum' ? 'NEXUS HYDERABAD' : id === 'lulu' ? 'LULU MALL' : 'ASIAN AMB CINEMAS';
  const boardRing = rect(mx + nx * .2, mz + nz * .2, nx, nz, boardWidth, .3);
  if (!K.k.clear || K.k.clear(boardRing, y - boardH / 2, y + boardH / 2)) {
    box(K, mx + nx * .18, mz + nz * .18, y - boardH / 2, boardWidth + .4, boardH + .3, .2, palette[2], Math.atan2(nx, nz));
    K.k.sign?.(`destination_${id}`, label, palette[2], '#fff7dc', [mx + nx * .32, y, mz + nz * .32], [nx, 0, nz], boardWidth, boardH);
  }
  // Broad glazed arrival bay and shallow canopy change the silhouette while
  // each part independently clears roads/metro and its collar remains bounded.
  const angle = Math.atan2(nx, nz), bay = Math.min(longest * .32, 24);
  box(K, mx + nx * .16, mz + nz * .16, .2, bay, Math.min(7, h * .33), .25, palette[1], angle);
  box(K, mx + nx * 1.1, mz + nz * 1.1, Math.min(7.4, h * .34), bay + 2, .45, 2.6, palette[0], angle, true);
}

// HCA primary reference confirms six floodlight towers and cricket facilities.
// The source site's geometry controls location/extent; row counts, canopy arc
// and all vertical dimensions below are an explicitly stylized playable model.
export function drawUppalStadium(K: Kit) {
  const plan = DESTINATION_HERO_PLANS.uppal_stadium;
  const xs = plan.ring.map(p => p[0]), zs = plan.ring.map(p => p[1]);
  const ru = (Math.max(...xs) - Math.min(...xs)) * .46, rv = (Math.max(...zs) - Math.min(...zs)) * .46;
  const n = 56, inner = .73, tiers = 10;
  const P = (angle: number, scale = 1): XZ => [K.x0 + Math.cos(angle) * ru * scale, K.z0 + Math.sin(angle) * rv * scale];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2, m = (a + b) / 2;
    const p = P(m), tangent = Math.atan2(-Math.sin(m) * ru, Math.cos(m) * rv) - Math.PI / 2, length = Math.hypot(P(a)[0] - P(b)[0], P(a)[1] - P(b)[1]);
    // Open bowl: no full-footprint collider or roof over the playing field.
    box(K, p[0], p[1], 0, length + .25, 20, 2.1, '#d6d6d3', tangent, true);
    for (let tier = 0; tier < tiers; tier++) {
      const f = inner + (1 - inner) * (tier + .5) / tiers, q = P(m, f), y = 1.8 + tier * 1.65;
      box(K, q[0], q[1], y, length * f + .12, .48, Math.min(ru, rv) * (1 - inner) / tiers + .3, i % 9 < 3 ? '#e9b14b' : i % 9 < 6 ? '#4c6f9c' : '#b44c42', tangent, true);
    }
    if ((i >= 4 && i < 20) || (i >= 32 && i < 48)) {
      const q = P(m, .9); box(K, q[0], q[1], 21.5, length + .4, .4, Math.min(ru, rv) * .17, '#e4e8e8', tangent, true);
    }
  }
  // Oval outfield, rather than the old rectangular green slab.
  for (let i = 0; i < n; i++) {
    const a = P(i / n * Math.PI * 2, inner - .025), b = P((i + 1) / n * Math.PI * 2, inner - .025);
    K.k.B.park.tri([K.x0, .035, K.z0], [b[0], .035, b[1]], [a[0], .035, a[1]], i % 2 ? '#529648' : '#5da14d');
  }
  // MCC Law6 provides the standard20.12m ×3.05m cricket pitch. The specific
  // stadium wicket's bearing and surrounding square are still illustrative.
  box(K, K.x0, K.z0, .04, 3.05, .03, 20.12, '#c5ae7b');
  for (const end of [-1, 1]) {
    box(K, K.x0, K.z0 + end * 10.06, .09, 5.6, .02, .08, '#f1ebd4');
    for (const u of [-.3, 0, .3]) box(K, K.x0 + u, K.z0 + end * 10.06, .12, .055, .65, .055, '#e7d9ab');
  }
  for (let i = 0; i < 6; i++) {
    const angle = (i + .35) / 6 * Math.PI * 2, p = P(angle, 1.06);
    box(K, p[0], p[1], 0, .65, 37, .65, '#b8bec4', 0, true);
    box(K, p[0], p[1], 35, 8, 3.8, .8, '#dae1e2', angle);
    for (let u = -3; u <= 3; u += 1.5) for (let y = 0; y < 3; y++) box(K, p[0] + Math.cos(angle) * u, p[1] - Math.sin(angle) * u, 35.3 + y * 1.05, .7, .65, .9, '#fff8cd', angle);
  }
  K.k.sign?.('destination_uppal_stadium', 'RAJIV GANDHI INTERNATIONAL STADIUM', '#334c67', '#fff6df', [K.x0, 8, K.z0 + rv + .5], [0, 0, 1], 30, 2.1);
}

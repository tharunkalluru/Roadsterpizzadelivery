import type { RoadEdge } from './types';
import type { OsmFeature } from './extras';
import { mappedExits, upstreamPose, auxiliaryLane } from './expressway';
import { roadStructureClearance, type StructureFootprint } from './structure-clearance';

interface SignContext {
  B: any;
  inTile: (x: number, z: number) => boolean;
  sign: (id: string, text: string, c: number[], facing: number[], w: number, h: number, bg?: string, fg?: string) => void;
  obstacle: (x: number, z: number, r: number, top: number) => void;
  post?: (x: number, z: number, bottom: number, top: number) => void;
  structureClear?: (footprint: StructureFootprint, bottom: number, top: number) => boolean;
}

export function drawExpresswaySigns(roads: RoadEdge[], features: OsmFeature[], C: SignContext) {
  const clear = C.structureClear || roadStructureClearance(roads).clear;
  const list = features.slice();
  // The Neopolis trumpet is present in the shipped road network as two secondary
  // ramps. Its exit marker predates the2025 opening. Attach the verified1A label
  // to the existing diverge, retaining the actual road geometry.
  const neopolis = roads.find(e => e.id === '779c4ba6-e7f_0');
  if (neopolis) {
    const point = neopolis.pts[0];
    if (!list.some(f => f.k === 'exit' && f.t.ref === '1A' && f.p && Math.hypot(f.p[0] - point[0], f.p[1] - point[1]) < 100)) {
      list.push({ id: 'orr-neopolis-verified-2025', k: 'exit', p: point, t: { ref: '1A' } });
    }
  }
  for (const exit of mappedExits(roads, list)) {
    const source = list.find(f => f.id === exit.id)?.p;
    if (!source || !C.inTile(source[0], source[1])) continue;
    for (const distance of [500, 250, 25]) {
      const p = upstreamPose(exit, distance, roads);
      if (!p) continue; // no fabricated straight-line sign placement
      const hx = p.hx * p.dir, hz = p.hz * p.dir, lx = hz, lz = -hx;
      const x = p.x, z = p.z, y = p.y, ang = Math.atan2(hx, hz), extra = Math.max(0, ...auxiliaryLane(p.e, roads));
      const left = p.e.w / 2 + extra + 1.2, right = -p.e.w / 2 - extra - 1.2;
      const postClear = (off: number) => clear({ x: x + lx * off, z: z + lz * off, r: .25 }, y, y + 9.6);
      // Check every support against all carriageways and intermediate bridge levels.
      // An outer cantilever replaces a blocked median post; no post is moved into traffic.
      if (!postClear(left)) continue;
      const both = postClear(right), end = both ? right : -.3;
      if (!clear({ x: x + lx * (left + end) / 2, z: z + lz * (left + end) / 2, hx, hz, hw: (left - end) / 2, hl: .2 }, y + 9.3, y + 9.7)) continue;
      const boardOff = p.e.w / 4, boardX = x + lx * boardOff, boardZ = z + lz * boardOff, w = Math.min(6.8, p.e.w * .46), h = 2.4;
      if (!clear({ x: boardX + hx * .14, z: boardZ + hz * .14, hx, hz, hw: (w + .3) / 2, hl: .1 }, y + 6.7, y + 9.5)) continue;
      for (const off of both ? [left, right] : [left]) {
        const px = x + lx * off, pz = z + lz * off;
        C.B.st.box(px, y + 4.8, pz, .32, 9.6, .32, '#9ca4ad');
        if (C.post) C.post(px, pz, y, y + 9.6);
        else C.obstacle(px, pz, .22, y + 9.6);
      }
      C.B.st.box(x + lx * (left + end) / 2, y + 9.5, z + lz * (left + end) / 2, left - end, .25, .3, '#a8afb6', { ry: ang });
      C.B.st.box(boardX + hx * .14, y + 8.1, boardZ + hz * .14, w + .3, h + .25, .18, '#17703f', { ry: ang });
      const suffix = distance === 25 ? '↖ EXIT' : `↖ ${distance} m`;
      C.sign(`orr_${exit.id}_${distance}`, `EXIT ${exit.ref}`,
        [boardX - hx * .02, y + 8.9, boardZ - hz * .02], [-hx, 0, -hz], w, .6);
      C.sign(`orr_${exit.id}_${distance}_name`, exit.name.toUpperCase(),
        [boardX - hx * .02, y + 8.1, boardZ - hz * .02], [-hx, 0, -hz], w, .8);
      C.sign(`orr_${exit.id}_${distance}_distance`, suffix,
        [boardX - hx * .02, y + 7.4, boardZ - hz * .02], [-hx, 0, -hz], w, .55);
      // Through direction is deliberately generic: do not guess a distant city
      // destination or paint a real-world direction that has not been verified.
      if (both) {
        const throughOff = -p.e.w / 4, throughWidth = Math.min(5.5, p.e.w * .37), tx = x + lx * throughOff, tz = z + lz * throughOff;
        if (clear({ x: tx + hx * .14, z: tz + hz * .14, hx, hz, hw: (throughWidth + .3) / 2, hl: .1 }, y + 7.2, y + 9)) {
          C.B.st.box(tx + hx * .14, y + 8.1, tz + hz * .14, throughWidth + .3, 1.65, .18, '#17703f', { ry: ang });
          C.sign(`orr_${exit.id}_${distance}_through`, '↑ OUTER RING ROAD', [tx - hx * .02, y + 8.1, tz - hz * .02], [-hx, 0, -hz], throughWidth, 1.4);
        }
      }
    }
  }
}

// Chevrons show mapped ramp curves. They face approaching traffic and keep their
// supports outside the drivable width; the existing source XY defines the bend.
export function drawRampChevrons(roads: RoadEdge[], C: SignContext) {
  const clear = C.structureClear || roadStructureClearance(roads).clear;
  const seen = new Set<string>();
  for (const e of roads) {
    if (!e.expressway?.ramp || e.pts.length < 3 || seen.has(e.id)) continue;
    seen.add(e.id);
    let acc = 0, last = -35;
    for (let i = 1; i < e.pts.length - 1; i++) {
      const a = e.pts[i - 1], b = e.pts[i], c = e.pts[i + 1];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]); acc += ab;
      if (!ab || !bc || acc - last < 32 || !C.inTile(b[0], b[1])) continue;
      const dot = ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / ab / bc;
      if (dot > .997) continue;
      const dir = e.oneway === 'forward' ? -1 : 1, hx = (c[0] - a[0]) * dir, hz = (c[1] - a[1]) * dir, len = Math.hypot(hx, hz), dx = hx / len, dz = hz / len;
      const cross = ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) * dir;
      const side = cross > 0 ? 1 : -1, hw = Math.max(e.w / 2, e.elev?.some(y => y > 1.2) ? 4.2 : 0);
      const off = (hw + 1.7) / Math.max(.35, Math.sqrt((1 + dot) / 2));
      const x = b[0] + dz * side * off, z = b[1] - dx * side * off, y = e.elev?.[i] || 0;
      if (!clear({ x, z, r: .15 }, y, y + 2.2) || !clear({ x, z, hx: dx, hz: dz, hw: .85, hl: .1 }, y + 1.45, y + 2.35)) continue;
      C.B.st.box(x, y + 1.1, z, .08, 2.2, .08, '#8a919b');
      C.sign(`orr_curve_${e.id}_${i}`, cross > 0 ? '❯ ❯' : '❮ ❮', [x - dx * .06, y + 1.9, z - dz * .06], [-dx, 0, -dz], 1.6, .8, '#f2cf47', '#18212d');
      last = acc;
    }
  }
}

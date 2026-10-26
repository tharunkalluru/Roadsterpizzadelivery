import type { TiledBatch } from '../core/util';
import { metroLineColor } from './metro-geometry';
import type { SignEntry, Wall } from './city';
import type { XZ } from './types';
import type { StructureFootprint } from './structure-clearance';

export interface StationVisualSource { id: string; name: string; te?: string | null; lines?: string[]; p: XZ }
export interface StationVisualFrame { cx: number; cz: number; hx: number; hz: number }
interface StationVisualContext { B: { st: TiledBatch; lit?: TiledBatch }; signs: SignEntry[]; wall?: (wall: Wall) => void; clearance?: (footprint: StructureFootprint, bottom: number, top: number) => boolean }

// Exactly four physical nameboards: two exterior end faces and one inward-
// facing board per platform. No roof-repeat or duplicate side/end names.
export function drawMetroStationVisuals(station: StationVisualSource, frame: StationVisualFrame, deckHeight: number, C: StationVisualContext) {
  const { cx, cz, hx, hz } = frame, nx = -hz, nz = hx, angle = Math.atan2(hx, hz), name = station.name.toUpperCase();
  const P = (u: number, v: number): XZ => [cx + hx * u + nx * v, cz + hz * u + nz * v];
  const exterior: string[] = [], interior: string[] = [];
  for (const end of [-1, 1]) {
    const y = deckHeight - 2.6, fx = hx * end, fz = hz * end, id = `mst_exterior_${station.id}_${end}`;
    // A name above the roof is hidden by the continuous viaduct from street
    // level. Hang the end face below its soffit, toward the kerb so the
    // continuous central pier row does not mask the name on either approach.
    // Raised roads can require a different kerb-side position at an end.
    const offset = [-5, 5, 0, -12, 12, -18, 18, -24, 24].find(v => {
      const p = P(end * 68.8, v); return !C.clearance || C.clearance({ x: p[0], z: p[1], hx, hz, hw: 8, hl: .12 }, y - 1.125, y + 1.125);
    }) ?? -5;
    const p = P(end * 68.8, offset);
    C.B.st.box(p[0], y, p[1], 16, 2.25, .16, '#f8fafb', { ry: angle });
    C.signs.push({ id, text: name, bg: '#f8fafb', fg: '#17304d', c: [p[0] + fx * .1, y + .15, p[1] + fz * .1], right: [fz, 0, -fx], up: [0, 1, 0], w: 15.4, h: 1.3 });
    exterior.push(id);
    const lines = (station.lines || []).filter(id => ['red', 'blue', 'green'].includes(id));
    for (let i = 0; i < lines.length; i++) {
      const width = 15.4 / lines.length, off = -7.7 + width * (i + .5);
      C.B.st.box(p[0] + fz * off, y - .84, p[1] - fx * off, width, .13, .18, metroLineColor(lines[i]), { ry: angle });
    }
    const beam = P(end * 68.8, offset / 2); C.B.st.box(beam[0], deckHeight - .3, beam[1], 16.2 + Math.abs(offset), .12, .16, '#a9a8b2', { ry: angle });
    for (const side of [-1, 1]) { const q = P(end * 68.8, offset + side * 6.8), bottom = y + 1.125, top = deckHeight - .3;
      C.B.st.box(q[0], (bottom + top) / 2, q[1], .07, top - bottom, .07, '#a9a8b2', { ry: angle }); }
  }
  for (const side of [-1, 1]) {
    const p = P(0, side * 7.24), y = deckHeight + 3.35, id = `mst_interior_${station.id}_${side}`;
    C.B.st.box(p[0], y, p[1], .14, 1.35, 7, '#f8fafb', { ry: angle });
    C.signs.push({ id, text: name, bg: '#f8fafb', fg: '#17304d', c: [p[0] - nx * side * .09, y, p[1] - nz * side * .09], right: [-hx * side, 0, -hz * side], up: [0, 1, 0], w: 6.6, h: 1.15 });
    interior.push(id);
    // Benches stay against the outer railing, leaving the platform edge clear.
    for (const u of [-32, 32]) {
      const q = P(u, side * 6.6), floor = deckHeight + 1.2;
      C.B.st.box(q[0], floor + .47, q[1], .66, .14, 4.2, '#626b76', { ry: angle });
      const back = P(u, side * 6.88); C.B.st.box(back[0], floor + .86, back[1], .1, .65, 4.2, '#7d8791', { ry: angle });
      for (const leg of [-1.5, 1.5]) { const a = P(u + leg, side * 6.6); C.B.st.box(a[0], floor + .22, a[1], .46, .44, .14, '#aeb5bf', { ry: angle }); }
      const ring = [P(u - 2.1, side * 6.6 - .35), P(u + 2.1, side * 6.6 - .35), P(u + 2.1, side * 6.6 + .35), P(u - 2.1, side * 6.6 + .35)];
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; C.wall?.({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y0a: floor, y0b: floor, y1a: floor + 1.2, y1b: floor + 1.2, kind: 'parapet' }); }
    }
  }
  return { exterior, interior, benches: 4 };
}

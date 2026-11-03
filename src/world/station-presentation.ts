import type { TiledBatch } from '../core/util';
import { metroLineColor, projectMetroPath, sampleMetroPath, type MetroPlatformAssembly } from './metro-geometry';
import type { XZ } from './types';
import type { StructureFootprint } from './structure-clearance';

type BoxBatch = Pick<TiledBatch, 'box'>;
type QuadBatch = Pick<TiledBatch, 'quad'>;
export interface StationPresentationBatches { st: BoxBatch & QuadBatch }

/** Presentation only. The retained 130 m platforms, canopy liner, lamp
 * hangers, train clearance and delivery surfaces remain owned by city.ts. */
export const STATION_PRESENTATION = Object.freeze({ halfLength: 67, halfSpan: 13, windowOffset: 10.75, windowBottom: 3.5, windowTop: 6.5, windowEnd: 56 });
export function stationVaultHeight(v: number, deckHeight: number) { return deckHeight + 9.47 - 2.4 * (v / 13) ** 2; }

export interface StationWindowBay { side: number; a: XZ; b: XZ; u0: number; u1: number }
/** Sample the same mapped curve as platforms/metro doors, never a guessed
 * straight facade across a curved station. Keep terminal ends open. */
export function stationWindowBays(assembly: MetroPlatformAssembly): StationWindowBay[] {
  const path = assembly.corridor.center, { cx, cz, hx, hz } = assembly.frame;
  const stationS = projectMetroPath(path, [cx, cz]).s, bays: StationWindowBay[] = [];
  const point = (u: number, side: number): XZ => { const p = sampleMetroPath(path, stationS + u); return [p.x - p.hz * side * STATION_PRESENTATION.windowOffset, p.z + p.hx * side * STATION_PRESENTATION.windowOffset]; };
  const underCanopy = (p: XZ) => Math.abs((p[0] - cx) * hx + (p[1] - cz) * hz) <= 65 && Math.abs(-(p[0] - cx) * hz + (p[1] - cz) * hx) <= 12.4;
  for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
    const u0 = -56 + i * 112 / 12, u1 = -56 + (i + 1) * 112 / 12, a = point(u0, side), b = point(u1, side);
    // A tight terminal curve may leave the retained roof. Omit the bay frame
    // rather than extend unsupported structure across a mapped platform.
    if (underCanopy(a) && underCanopy(b) && Math.hypot(b[0] - a[0], b[1] - a[1]) > .1) bays.push({ side, a, b, u0, u1 });
  }
  return bays;
}

export function drawStationPresentation(assembly: MetroPlatformAssembly, B: StationPresentationBatches, lowQ: boolean, clear: (footprint: StructureFootprint, bottom: number, top: number) => boolean = () => true) {
  const { cx, cz, hx, hz } = assembly.frame, DH = assembly.deckHeight, yaw = Math.atan2(hx, hz);
  const P = (u: number, v: number, y: number) => [cx + hx * u - hz * v, y, cz + hz * u + hx * v];
  const color = metroLineColor(assembly.lineId, assembly.corridor.color), panels = lowQ ? 16 : 24;
  // A continuous shallow vault covers the retained seven-slat structural
  // liner. Fine seams and ribs read as one Hyderabad-style canopy at speed.
  for (let i = 0; i < panels; i++) {
    const a = -13 + i * 26 / panels, b = -13 + (i + 1) * 26 / panels;
    const middle = P(0, (a + b) / 2, 0), y0 = stationVaultHeight(a, DH), y1 = stationVaultHeight(b, DH);
    if (!clear({ x: middle[0], z: middle[2], hx, hz, hw: (b - a) / 2, hl: 67 }, Math.min(y0, y1), Math.max(y0, y1))) continue;
    B.st.quad(P(-67, a, stationVaultHeight(a, DH)), P(-67, b, stationVaultHeight(b, DH)), P(67, b, stationVaultHeight(b, DH)), P(67, a, stationVaultHeight(a, DH)), i % 4 === 0 ? '#e0e5e8' : '#edf0f1');
  }
  const ribSegments = lowQ ? 8 : 12, ribs = lowQ ? [-66, -33, 0, 33, 66] : [-66, -44, -22, 0, 22, 44, 66];
  for (const u of ribs) for (let i = 0; i < ribSegments; i++) {
    const a = -13 + i * 26 / ribSegments, b = -13 + (i + 1) * 26 / ribSegments, y0 = stationVaultHeight(a, DH), y1 = stationVaultHeight(b, DH), p = P(u, (a + b) / 2, (y0 + y1) / 2 + .09);
    if (!clear({ x: p[0], z: p[2], hx, hz, hw: (b - a) / 2 + .04, hl: .12 }, Math.min(y0, y1), Math.max(y0, y1) + .2)) continue;
    B.st.box(p[0], p[1], p[2], Math.hypot(b - a, y1 - y0), .14, .24, '#b7c5cb', { ry: yaw, rz: -Math.atan2(y1 - y0, b - a) });
  }
  for (const side of [-1, 1]) {
    const p = P(0, side * 13, DH + 6.81);
    if (clear({ x: p[0], z: p[2], hx, hz, hw: .15, hl: 67 }, p[1] - .23, p[1] + .23)) B.st.box(p[0], p[1], p[2], .3, .46, 134, color, { ry: yaw });
    const q = P(0, side * 13.02, DH + 6.55);
    if (clear({ x: q[0], z: q[2], hx, hz, hw: .16, hl: 67 }, q[1] - .035, q[1] + .035)) B.st.box(q[0], q[1], q[2], .32, .07, 134, '#e1e8eb', { ry: yaw });
  }
  const frameEnds = new Set<string>();
  for (const bay of stationWindowBays(assembly)) {
    const { a, b } = bay, bottom = DH + STATION_PRESENTATION.windowBottom, top = DH + STATION_PRESENTATION.windowTop;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const bayHx = (b[0] - a[0]) / length, bayHz = (b[1] - a[1]) / length;
    if (!clear({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, hx: bayHx, hz: bayHz, hw: .09, hl: length / 2 + .09 }, bottom - .06, top + .06)) continue;
    // Open platform bays. An opaque painted pane here acts as a visual wall
    // between an orbiting car camera and the delivery recipient even though
    // it is outside the collision envelope. Keep the slender architectural
    // rhythm; painted glazing belongs to the lower concourse only.
    for (const [u, p] of [[bay.u0, a], [bay.u1, b]] as const) {
      const key = `${bay.side}:${u}`; if (frameEnds.has(key)) continue; frameEnds.add(key);
      B.st.box(p[0], (bottom + top) / 2, p[1], .12, top - bottom + .12, .12, '#d4dfe1', { ry: angle });
    }
    for (const y of [bottom, top]) B.st.box((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, .13, .12, length, '#d4dfe1', { ry: angle });
  }
}

/** Add entrance identity only inside the existing checked stair canopy. No
 * new ground footprint, obstacle or gameplay surface is introduced. */
export function drawStationEntrancePresentation(x: number, z: number, yaw: number, roofY: number, lineId: string, B: { st: BoxBatch & QuadBatch }, groundEnd: number) {
  const hx = Math.sin(yaw), hz = Math.cos(yaw), color = metroLineColor(lineId);
  for (const side of [-1, 1]) B.st.box(x + hz * side * 2.12, roofY - .1, z - hx * side * 2.12, .13, .3, 16.7, color, { ry: yaw });
  // Recessed grey underside and clean bright leading edges distinguish the
  // real entrance from an adjacent shop awning without additional signs.
  for (const u of [-8.1, 8.1]) B.st.box(x + hx * u, roofY - .1, z + hz * u, 4.2, .3, .12, '#e3e9eb', { ry: yaw });
  const P = (u: number, v: number, y: number) => [x + hx * u + hz * v, y, z + hz * u - hx * v];
  const direction = groundEnd < 0 ? -1 : 1, end = direction * 8.035, housingTop = roofY - 2.3;
  // The retained stair housing is solid. Depict closed glazed doors rather
  // than a dark open passage the unchanged car collider would not allow.
  const front = (v0: number, y0: number, v1: number, y1: number, tint: string, layer = 0) => {
    const u = end + direction * layer;
    B.st.quad(P(u, v0, y0), P(u, v1, y0), P(u, v1, y1), P(u, v0, y1), tint);
  };
  front(-1.42, .16, 1.42, 2.88, '#304550');
  front(-1.55, .12, -1.42, 3.44, color, .004); front(1.42, .12, 1.55, 3.44, color, .004);
  front(-1.55, 2.88, 1.55, 3.44, color, .004); front(-1.55, .12, 1.55, .22, '#acb7ba', .006);
  front(-.025, .22, .025, 2.88, '#a9b7bc', .008);
  for (const side of [-1, 1]) front(side * .24 - .025, 1.24, side * .24 + .025, 1.52, '#d7dedc', .012);
  // Painted opaque reflection streaks retain the mobile-stable treatment.
  for (const v of [-1.23, .18]) B.st.quad(P(end + direction * .01, v, 2.7), P(end + direction * .01, v + .3, 2.7), P(end + direction * .01, v + .67, .35), P(end + direction * .01, v + .48, .35), '#58717e');
  // A geometric train pictogram identifies transit at driver eye level. No
  // extra station names, font atlas, material or light is required.
  front(-.29, 3.01, .29, 3.35, '#f0f4ef', .008);
  front(-.22, 3.13, .22, 3.29, color, .012);
  for (const side of [-1, 1]) {
    front(side * .17 - .035, 3.05, side * .17 + .035, 3.09, color, .012);
    front(side * .15 - .04, 2.96, side * .15 + .04, 3.02, '#f0f4ef', .014);
  }
  // Mark the enclosed stairwell on its solid side faces. The stepped profile
  // rises from the actual ground end toward the station, never into the road.
  const low = .8, high = Math.min(4.2, housingTop - .5), u0 = direction * 5.9, run = -direction * 11.8;
  for (const side of [-1, 1]) {
    const v = side * 1.815;
    for (let i = 0; i < 10; i++) {
      const a = u0 + run * i / 10, b = u0 + run * (i + 1) / 10, y0 = low + (high - low) * i / 10, y1 = low + (high - low) * (i + 1) / 10;
      B.st.quad(P(a, v, y0), P(b, v, y0), P(b, v, y0 + .075), P(a, v, y0 + .075), '#83969e');
      B.st.quad(P(b, v, y0), P(b + direction * .075, v, y0), P(b + direction * .075, v, y1 + .075), P(b, v, y1 + .075), '#83969e');
    }
    B.st.quad(P(u0, v + side * .004, low + .38), P(u0 + run, v + side * .004, high + .38), P(u0 + run, v + side * .004, high + .49), P(u0, v + side * .004, low + .49), color);
  }
}

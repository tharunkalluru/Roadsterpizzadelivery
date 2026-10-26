import type { TiledBatch } from '../core/util';
import type { Building, XZ } from './types';
import type { DestinationIdentity } from './destination-identity';

export interface DestinationRecognitionCtx {
  B: Record<string, TiledBatch>;
  clear: (ring: XZ[], bottom: number, top: number) => boolean;
  sign: (id: string, text: string, bg: string, fg: string, c: number[], facing: number[], w: number, h: number) => void;
  solid?: (ring: XZ[], top: number) => void;
  inOtherBuilding?: (x: number, z: number, selfId: string) => boolean;
}
export interface DestinationRecognitionResult { identity: string; features: number; rejected: number; style: string }
const inside = (ring: XZ[], x: number, z: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
const priority = { university: 5, college: 4, mall: 3, cinema: 2, office: 1 };
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const crosses = (a: XZ, b: XZ, c: XZ, d: XZ) => cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9;

// Source footprints remain the base model and collider. Architecture is a
// bounded recognition vocabulary, not a claim of measured facade replication.
// No whole-site rectangle, guessed neighbouring building or nearest-road move.
export function decorateDestinationBuilding(building: Building, records: readonly DestinationIdentity[], C: DestinationRecognitionCtx): DestinationRecognitionResult | null {
  const candidates = records.filter(record => record.buildingId === (building.sourceId || building.id));
  if (!candidates.length || building.ring.length < 3 || building.h < 2) return null;
  const record = [...candidates].sort((a, b) => priority[b.kind] - priority[a.kind] || b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
  const [a, b] = [record.a, record.b], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 2) return null;
  const hx = (b[0] - a[0]) / length, hz = (b[1] - a[1]) / length, angle = Math.atan2(hx, hz), nx0 = -hz, nz0 = hx;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const inward = inside(building.ring, mx + nx0 * .5, mz + nz0 * .5) ? 1 : -1;
  const nx = nx0 * inward, nz = nz0 * inward;
  const P = (u: number, v: number): XZ => [mx + hx * u + nx * v, mz + hz * u + nz * v];
  const result = { identity: record.id, features: 0, rejected: 0, style: `${record.kind}-source-footprint-typology` };
  const box = (u: number, v: number, low: number, along: number, height: number, depth: number, color: string, material = 'st', roofSupport = false, facade = false) => {
    const ring = [P(u - along / 2, v - depth / 2), P(u + along / 2, v - depth / 2), P(u + along / 2, v + depth / 2), P(u - along / 2, v + depth / 2)];
    if (!facade && ring.some((a, i) => building.ring.some((c, j) => crosses(a, ring[(i + 1) % ring.length], c, building.ring[(j + 1) % building.ring.length])))) { result.rejected++; return; }
    // Include all edges/interior samples so a narrow concavity cannot become
    // an invented courtyard cover or a structure on an adjacent property.
    const samples = Math.max(2, Math.ceil(along / 2)), rows = Math.max(2, Math.ceil(depth / 2));
    for (let i = 0; i <= samples; i++) for (let j = 0; j <= rows; j++) {
      const p = P(u - along / 2 + along * i / samples, v - depth / 2 + depth * j / rows);
      // Facade trims may stand up to a metre outside their own existing edge,
      // but their rear sample must still bind to this exact source footprint.
      const back = P(u - along / 2 + along * i / samples, Math.max(.12, v + depth / 2));
      if ((!facade && !inside(building.ring, p[0], p[1])) || (facade && (!inside(building.ring, back[0], back[1]) || C.inOtherBuilding?.(p[0], p[1], building.sourceId || building.id)))) { result.rejected++; return; }
    }
    if (!C.clear(ring, low, low + height)) { result.rejected++; return; }
    const p = P(u, v); C.B[material].box(p[0], low + height / 2, p[1], depth, height, along, color, { ry: angle });
    if (roofSupport) C.solid?.(ring, low + height);
    result.features++;
  };
  const width = Math.min(length * .85, record.kind === 'mall' ? 60 : 38), h = building.h;
  const academic = record.kind === 'college' || record.kind === 'university';
  const color = academic ? '#d6b58c' : record.kind === 'mall' ? '#d9d6cf' : record.kind === 'cinema' ? '#8e263a' : '#7194a8';
  // Recessed glazed entrance bay and portico use the already assigned source
  // board edge. Their exact actual entrance location remains explicitly unsure.
  const entranceHeight = Math.min(5.8, h * .6), bayWidth = Math.max(2, Math.min(width * .4, 14));
  box(0, -.04, .2, bayWidth, entranceHeight, .12, academic ? '#345666' : '#243f54', 'st', false, true);
  box(0, -.3, entranceHeight + .15, bayWidth + 1, .35, .9, color, 'st', false, true);
  if (academic) {
    // A columned academic entrance and repeated classroom bays; retain any
    // real source courtyard/wing outline instead of placing a new U-shaped site.
    for (const u of [-bayWidth / 2 + .5, bayWidth / 2 - .5]) box(u, -.2, .2, .5, entranceHeight, .6, '#eee6d5', 'st', false, true);
    for (let u = -width / 2; u <= width / 2; u += 3.5) for (let y = 3; y < h - 1; y += 3.4) box(u, -.05, y, 1.5, 1.35, .15, '#3e5964', 'st', false, true);
    box(0, 3, h, Math.min(width * .65, 20), 1.1, 3, '#b9aa90', 'st', true);
  } else if (record.kind === 'mall') {
    // Layered retail ribbons, recessed glazing, broad canopy and parapet make
    // the commercial mass distinct without changing the inherited footprint.
    for (let y = 3.6; y < h - .7; y += 4.4) { box(0, -.1, y, width, .55, .35, '#eee9df', 'st', false, true); box(0, -.04, y + .65, width * .96, 2.4, .12, '#5b8492', 'st', false, true); }
    box(0, 2, h, width * .72, .75, 2.7, '#c7c0b5', 'st', true);
  } else if (record.kind === 'cinema') {
    // Auditorium crown and marquee, without fabricated film posters or brands.
    box(0, -.25, Math.max(1.5, h * .45), width * .75, 2.2, .7, '#712538', 'st', false, true);
    box(0, 3, h, width * .72, 1.6, 3.5, '#6b4353', 'st', true);
    for (const u of [-width * .3, width * .3]) box(u, -.12, .25, .6, Math.min(h - .5, 8), .35, '#d9c096', 'st', false, true);
  } else {
    // Corporate fins and a set-back rooftop crown use the existing tower's
    // own footprint; a low office is not promoted into a fictional skyscraper.
    for (let u = -width / 2; u <= width / 2; u += 3.2) box(u, -.1, .5, .32, h - 1, .35, '#c1d0d8', 'st', false, true);
    for (let y = 3.4; y < h - 1; y += 3.4) box(0, -.08, y, width, .18, .25, '#355d74', 'st', false, true);
    box(0, 3, h, width * .65, 1.4, 3, '#59798b', 'st', true);
  }
  return result;
}

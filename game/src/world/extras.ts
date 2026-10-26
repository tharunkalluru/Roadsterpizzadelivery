import * as THREE from 'three';
import { TPL, rng, hash } from '../core/util';
import type { XZ } from './types';
import { isORR } from './expressway';
import type { StructureFootprint } from './structure-clearance';

// OpenStreetMap extras drawn into a tile: petrol bunks, toll plazas, motorway exit signs, skywalks and foot
// overbridges, pedestrian subways, railway lines and stations, bus terminals, bus-stop names.
// Features arrive in game coordinates (see pipeline/add_osm.py); lines and areas can span tiles, so each piece is
// drawn by the tile that holds its middle.
export interface OsmFeature { id: string; k: string; t: Record<string, string>; p?: XZ; l?: XZ[]; r?: XZ[][]; h?: XZ[][] }
export interface RoadHit { e: any; d: number; cx: number; cz: number; hx: number; hz: number; w: number; y: number }
export interface ExtrasCtx {
  B: any; inTile: (x: number, z: number) => boolean;
  nearestRoad: (x: number, z: number, maxD: number, ground?: boolean) => RoadHit | null;
  onRoad: (x: number, z: number, pad?: number) => boolean;
  inBuilding: (x: number, z: number) => boolean;
  structureClear?: (footprint: StructureFootprint, bottom: number, top: number) => boolean;
  obstacle: (x: number, z: number, r: number, top: number) => void;
  wall: (ax: number, az: number, bx: number, bz: number, top: number) => void;
  solid: (ring: XZ[], h: number) => void;
  sign: (id: string, text: string, bg: string, fg: string, c: number[], facing: number[], w: number, h: number) => void;   // facing: the board's front normal (x, 0, z)
  lamp: (x: number, y: number, z: number) => void;
  pad: (ax: number, az: number, bx: number, bz: number, y: number, hw: number) => void;
  lowQ: boolean;
}
const nm = (f: OsmFeature) => (f.t['name:en'] || f.t.name || '').trim();
const upper = (s: string) => s.toUpperCase().replace(/\s+/g, ' ');
const mid = (f: OsmFeature): XZ => {
  if (f.p) return f.p;
  const pts = f.l || (f.r ? f.r[0] : []); let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length];
};

// Decorative structures must clear the whole road ribbon, including junctions
// and ramps, before either their mesh or their matching collider is emitted.
// The tile uses exact segment/footprint clipping; the sampled fallback keeps
// older contexts conservative instead of reverting to a centre-only check.
export function extrasFootprintClear(C: ExtrasCtx, footprint: StructureFootprint, bottom: number, top: number, buildings = true) {
  if (C.structureClear && !C.structureClear(footprint, bottom, top)) return false;
  if (C.structureClear && !buildings) return true;
  const circle = 'r' in footprint, hw = circle ? footprint.r : footprint.hw, hl = circle ? footprint.r : footprint.hl;
  const hx = circle ? 0 : footprint.hx, hz = circle ? 1 : footprint.hz;
  const nu = Math.max(1, Math.ceil(hl * 2)), nv = Math.max(1, Math.ceil(hw * 2));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = -hl + hl * 2 * i / nu, v = -hw + hw * 2 * j / nv;
    if (circle && u * u + v * v > (hw + .71) ** 2) continue;
    const x = footprint.x + hx * u + hz * v, z = footprint.z + hz * u - hx * v;
    if ((!C.structureClear && C.onRoad(x, z, .8)) || (buildings && C.inBuilding(x, z))) return false;
  }
  return true;
}
const boxFootprint = (x: number, z: number, angle: number, width: number, length: number): StructureFootprint => ({ x, z, hx: Math.sin(angle), hz: Math.cos(angle), hw: width / 2, hl: length / 2 });

// Match pipeline/osm_path_kind.py. Roof cover is independent of vertical level.
export function osmPathKind(tags: Record<string, string>): 'footbridge' | 'subway' | 'covered_path' | null {
  if (!['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'corridor'].includes(tags.highway)) return null;
  const parsed = Number(tags.layer || 0), layer = Number.isFinite(parsed) ? parsed : 0;
  const active = (value?: string) => !!value && !['no', 'false', '0'].includes(value.toLowerCase());
  if (active(tags.tunnel) || layer < 0) return 'subway';
  if (active(tags.bridge) || layer > 0) return 'footbridge';
  return tags.covered === 'yes' ? 'covered_path' : null;
}

export function drawExtras(list: OsmFeature[], C: ExtrasCtx) {
  const placedFuel: XZ[] = [];
  const placedToll: { x: number; z: number; road: RoadHit }[] = [];
  for (const f of list) {
    try {
      if (f.k === 'fuel') fuel(f, C, placedFuel);
      else if (f.k === 'toll') {
        const q = mid(f); if (!C.inTile(...q)) continue;
        const r = C.nearestRoad(q[0], q[1], 25); if (!r) continue;
        // Lane nodes describe one canopy, but the opposite carriageway is a
        // different plaza. An out-of-tile context node cannot suppress its owner.
        const duplicate = placedToll.some(t => Math.hypot(t.x - q[0], t.z - q[1]) < 70 && Math.abs(t.road.y - r.y) < .8 &&
          (t.road.e.id === r.e.id || (Math.abs(t.road.hx * r.hx + t.road.hz * r.hz) > .95 &&
            Math.abs((t.road.cx - r.cx) * r.hz - (t.road.cz - r.cz) * r.hx) < 1.5)));
        if (!duplicate) { placedToll.push({ x: q[0], z: q[1], road: r }); toll(f, C, r); }
      }
      else if (f.k === 'exit') exitSign(f, C);
      else if (f.k === 'footbridge' || f.k === 'covered_path' || f.k === 'subway') {
        // Existing packs predate covered_path. Read their original tags without rewriting source evidence.
        const kind = osmPathKind(f.t) || f.k;
        if (kind === 'covered_path') coveredPath(f, C);
        else if (kind === 'subway') subway(f, C);
        else footbridge(f, C);
      }
      else if (f.k === 'rail') rail(f, C);
      else if (f.k === 'platform') platform(f, C);
      else if (f.k === 'station') station(f, C);
      else if (f.k === 'bus_station') busStation(f, C);
    } catch { /* one odd feature never breaks the tile */ }
  }
}

// ---------- covered paths at ground level; Healthway has the verified solar roof ----------
function coveredPath(f: OsmFeature, C: ExtrasCtx) {
  const line = f.l; if (!line || line.length < 2) return;
  const solar = f.t.highway === 'cycleway' && /^healthway$/i.test(nm(f));
  const mappedWidth = Number(f.t.width), wd = Number.isFinite(mappedWidth) && mappedWidth >= 1 && mappedWidth <= 8 ? mappedWidth : solar ? 4.5 : f.t.highway === 'cycleway' ? 3 : 2.4;
  // Source: Akashvani, 2 Oct 2023: Healthway is 4.5m/three lanes with solar roofing
  // between ORR and its service road. Roofheight/column spacing below are a model approximation.
  // https://newsonair.gov.in/indias-first-solar-roof-cycling-track-inaugurated-in-hyderabad/
  const B = C.B, deck = .055, roof = 3.2; let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < .05) continue;
    const hx = (b[0] - a[0]) / len, hz = (b[1] - a[1]) / len, nx = hz, nz = -hx, ang = Math.atan2(hx, hz);
    // Short pieces give long source ways local tile ownership instead of a distant midpoint owner.
    const n = Math.max(1, Math.ceil(len / 12));
    for (let k = 0; k < n; k++) {
      const u = (k + .5) / n, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, span = len / n;
      if (!C.inTile(x, z)) continue;
      const ax = a[0] + (b[0] - a[0]) * k / n, az = a[1] + (b[1] - a[1]) * k / n, bx = a[0] + (b[0] - a[0]) * (k + 1) / n, bz = a[1] + (b[1] - a[1]) * (k + 1) / n;
      B.foot.box(x, deck / 2, z, wd, deck, span + .05, solar ? '#a75464' : '#c9c4bb', { ry: ang });
      C.pad(ax, az, bx, bz, deck, wd / 2);
      B.st.box(x, roof, z, wd + .65, .12, span + .08, '#d6dce1', { ry: ang });
      if (solar) {
        B.st.box(x, roof + .08, z, wd + .45, .035, Math.max(.05, span - .12), '#24405e', { ry: ang });
        if (!C.lowQ) for (const off of [-wd / 6, wd / 6]) B.st.box(x + nx * off, roof + .105, z + nz * off, .025, .012, span, '#9eaebc', { ry: ang });
        for (const off of [-wd / 6, wd / 6]) B.marks.box(x + nx * off, deck + .008, z + nz * off, .055, .012, span, '#f1e9d7', { ry: ang });
      }
    }
    for (let d = (8 - acc % 8) % 8; d < len - .001; d += 8) for (const side of [-1, 1]) {
      const x = a[0] + hx * d + nx * side * (wd / 2 + .2), z = a[1] + hz * d + nz * side * (wd / 2 + .2);
      if (!C.inTile(x, z) || !extrasFootprintClear(C, { x, z, r: .11 }, 0, roof + .06)) continue;
      B.st.box(x, roof / 2, z, .12, roof, .12, '#c4ccd2'); C.obstacle(x, z, .11, roof + .06);
    }
    acc += len;
  }
}

// ---------- petrol bunk: forecourt, canopy on four columns, two pump islands, kiosk, tall name pylon ----------
function fuel(f: OsmFeature, C: ExtrasCtx, placed: XZ[]) {
  const [px, pz] = mid(f); if (!C.inTile(px, pz)) return;
  if (placed.some((q) => Math.hypot(q[0] - px, q[1] - pz) < 45)) return;
  const r = C.nearestRoad(px, pz, 60, true); if (!r) return;
  // forecourt sits beside the carriageway on the side of the mapped point, long side along the road
  let side = (px - r.cx) * -r.hz + (pz - r.cz) * r.hx >= 0 ? 1 : -1;      // left of the road direction = (-hz, hx)
  const off = r.w / 2 + 2.5 + 8;                                           // kerb gap, then half the forecourt depth
  const ang = Math.atan2(r.hx, r.hz);
  const free = (sd: number) => {
    // Include the entire rear kiosk and near kerb, not merely the forecourt
    // centre. A side street may cross either end even when that centre is clear.
    const x = r.cx - r.hz * sd * (off + 1), z = r.cz + r.hx * sd * (off + 1);
    return extrasFootprintClear(C, boxFootprint(x, z, ang, 18, 25), 0, 7.3);
  };
  if (!free(side)) { if (free(-side)) side = -side; else return; }
  placed.push([px, pz]);
  const nx = -r.hz * side, nz = r.hx * side;
  const cx = r.cx + nx * off, cz = r.cz + nz * off;
  const P = (u: number, v: number): XZ => [cx + r.hx * u + nx * v, cz + r.hz * u + nz * v];   // u along the road, v away from it
  const name = nm(f) || (f.t.brand ? `${f.t.brand} Petrol Bunk` : 'Petrol Bunk');
  const B = C.B, rr = rng(hash(f.id));
  // paving
  const a = P(-12, -7.5), b = P(12, -7.5), c = P(12, 8), d = P(-12, 8);
  B.foot.quad([a[0], 0.06, a[1]], [d[0], 0.06, d[1]], [c[0], 0.06, c[1]], [b[0], 0.06, b[1]], '#c9c3b8');
  // canopy
  const top = 5.6, cw = 16, cd = 10;
  let q = P(0, 0); B.st.box(q[0], top, q[1], cd, 0.9, cw, '#f2f2ee', { ry: ang });
  B.lit.box(q[0], top - 0.47, q[1], cd - 1.2, 0.02, cw - 1.2, '#fff6e0', { ry: ang });
  for (const s of [-1, 1]) {                      // coloured fascia band on the road-facing and back sides
    q = P(0, s * (cd / 2 + 0.02)); B.st.box(q[0], top + 0.05, q[1], 0.06, 0.55, cw, ['#1f5fae', '#d9531e', '#1d8a4a', '#c7a116'][hash(f.id) % 4], { ry: ang });
  }
  q = P(0, -(cd / 2 + 0.09)); C.sign(f.id + 'c', upper(name).slice(0, 34), '#f2f2ee', '#1b1a22', [q[0], top + 0.05, q[1]], [-nx, 0, -nz], Math.min(13, 4 + name.length * 0.42), 0.55);
  for (const u of [-5, 5]) for (const v of [-2.8, 2.8]) { q = P(u, v); B.st.box(q[0], top / 2, q[1], 0.45, top, 0.45, '#dcdcd6'); C.obstacle(q[0], q[1], 0.35, top); }
  // pump islands
  for (const u of [-4.2, 4.2]) {
    q = P(u, 0); B.st.box(q[0], 0.15, q[1], 1.4, 0.3, 4.6, '#efe8d8', { ry: ang + Math.PI / 2 }); C.obstacle(q[0], q[1], 0.8, 1.9);
    for (const v of [-1.2, 1.2]) { const p2 = P(u, v); B.st.box(p2[0], 1.15, p2[1], 0.55, 1.7, 0.9, '#e9e9e4', { ry: ang }); B.lit.box(p2[0], 1.55, p2[1], 0.58, 0.32, 0.5, '#9fe0ff', { ry: ang }); }
  }
  // kiosk at the back
  const k0 = P(-6, 6.2), k1 = P(-1, 6.2), k2 = P(-1, 9.6), k3 = P(-6, 9.6);
  q = P(-3.5, 7.9); B.st.box(q[0], 1.7, q[1], 3.4, 3.4, 5, '#e6e1d6', { ry: ang }); C.solid([k0, k1, k2, k3], 3.4);
  // name pylon at the kerb with lit price panel
  q = P(10.5, -6.2); B.st.box(q[0], 3.4, q[1], 0.3, 6.8, 0.3, '#5b5a63'); B.st.box(q[0], 6.2, q[1], 2.0, 2.2, 0.25, '#f2f2ee', { ry: ang });
  B.lit.box(q[0], 5.3, q[1], 1.6, 0.6, 0.27, '#ffe9b0', { ry: ang }); C.obstacle(q[0], q[1], 0.3, 7);
  for (const s of [-1, 1]) C.sign(f.id + 'p' + s, upper(f.t.brand || name).slice(0, 20), '#f2f2ee', '#1b1a22', [q[0] + r.hx * s * 0.14, 6.6, q[1] + r.hz * s * 0.14], [r.hx * s, 0, r.hz * s], 1.8, 0.6);
  void rr; C.lamp(cx, top - 0.6, cz);
}

// ---------- toll plaza across the carriageway: canopy, booths between lanes, name fascia ----------
export function tollLaneLayout(r: RoadHit) {
  // HMDA's closed system has entry/exit ramp lanes. Do not split a narrow
  // one-lane slip road into two impassable booth gaps. Island width is a model
  // assumption; mapped lane count wins where whole vehicles still fit.
  const width = Math.max(3.4, r.w), capacity = Math.max(1, Math.floor(width / 3.4));
  const mapped = Number.isInteger(r.e.lanes) && r.e.lanes > 0 ? r.e.lanes : capacity;
  const lanes = Math.min(mapped, capacity);
  return { lanes, laneWidth: width / lanes, width };
}
function toll(f: OsmFeature, C: ExtrasCtx, r: RoadHit) {
  const layout = tollLaneLayout(r), nx = -r.hz, nz = r.hx, wid = layout.width + 6, lanes = layout.lanes, lw = layout.laneWidth, y = r.y;
  const B = C.B, ang = Math.atan2(r.hx, r.hz);
  B.st.box(r.cx, y + 6.4, r.cz, wid, 1.0, 9, '#eeeeea', { ry: ang });
  B.lit.box(r.cx, y + 5.88, r.cz, wid - 1, 0.02, 8, '#fff3d6', { ry: ang });
  for (let k = 0; k <= lanes; k++) {
    const v = -layout.width / 2 + k * lw, x = r.cx + nx * v, z = r.cz + nz * v;
    B.st.box(x, y + 0.2, z, 1.2, 0.4, 7, '#f4c21b', { ry: ang });                  // island with kerb paint
    B.st.box(x, y + 1.6, z, 1.0, 2.6, 2.2, '#dfe3e8', { ry: ang }); B.lit.box(x + r.hx * 1.11, y + 2.1, z + r.hz * 1.11, 0.8, 0.5, 0.02, '#bfffd0', { ry: ang });
    B.st.box(x, y + 3.6, z, 0.35, 5.6, 0.35, '#b9bec6');
    C.obstacle(x, z, 0.75, y + 3);
  }
  const t = nm(f) || 'Toll Plaza';
  for (const s of [-1, 1]) C.sign(f.id + s, upper(t.includes('oll') ? t : `${t} Toll Plaza`).slice(0, 30), '#1d6b3a', '#ffffff', [r.cx + r.hx * s * 4.53, y + 6.4, r.cz + r.hz * s * 4.53], [r.hx * s, 0, r.hz * s], Math.min(wid - 2, 16), 0.8);
}

// ---------- motorway exit: green gantry sign before the junction ----------
function exitSign(f: OsmFeature, C: ExtrasCtx) {
  const [px, pz] = mid(f); if (!C.inTile(px, pz)) return;
  const r = C.nearestRoad(px, pz, 20); if (!r) return;
  if (isORR(r.e)) return; // the ORR uses directed, curve-following advance gantries
  const dir = r.e.oneway === 'forward' ? -1 : 1;             // traffic heading along (hx, hz) * dir
  const ax = r.cx - r.hx * dir * 120, az = r.cz - r.hz * dir * 120;      // 120 m before the exit
  const rb = C.nearestRoad(ax, az, 12) || r;
  const nx = -rb.hz, nz = rb.hx, x = rb.cx, z = rb.cz, y = rb.y, ang = Math.atan2(rb.hx, rb.hz);
  const B = C.B, span = rb.w + 3;
  if ([-1, 1].some(s => !extrasFootprintClear(C, { x: x + nx * s * span / 2, z: z + nz * s * span / 2, r: .3 }, y, y + 7.6))) return;
  for (const s of [-1, 1]) { const qx = x + nx * s * span / 2, qz = z + nz * s * span / 2; B.st.box(qx, y + 3.8, qz, 0.35, 7.6, 0.35, '#9aa0a8'); C.obstacle(qx, qz, 0.3, y + 7); }
  B.st.box(x, y + 7.5, z, span, 0.25, 0.25, '#9aa0a8', { ry: ang });
  const ref = f.t.ref ? `EXIT ${f.t.ref}` : 'EXIT', to = f.t.exit_to || f.t.destination || nm(f) || '';
  const text = to ? `${ref} · ${to}` : ref;
  const fx = -rb.hx * dir, fz = -rb.hz * dir;                 // the board faces oncoming traffic
  B.st.box(x - fx * 0.1, y + 6.4, z - fz * 0.1, Math.min(span - 1, 12), 1.9, 0.12, '#17703f', { ry: ang });
  C.sign(f.id, upper(text).slice(0, 32), '#17703f', '#ffffff', [x + fx * 0.02, y + 6.4, z + fz * 0.02], [fx, 0, fz], Math.min(span - 1.4, 11.4), 1.4);
}

// ---------- skywalks and foot overbridges (decks over roads); low path bridges over drains are left alone ----------
function footbridge(f: OsmFeature, C: ExtrasCtx) {
  const L = f.l; if (!L || L.length < 2) return;
  let overRoad = false; for (let i = 0; i < L.length - 1 && !overRoad; i++) for (let u = 0; u <= 1; u += 0.25) { const x = L[i][0] + (L[i + 1][0] - L[i][0]) * u, z = L[i][1] + (L[i + 1][1] - L[i][1]) * u; if (C.onRoad(x, z, 0)) { overRoad = true; break; } }
  const sky = /sky ?walk/i.test(nm(f)) || f.t.covered === 'yes';
  if (!overRoad && !sky) return;
  const B = C.B, y = 6.6, wd = sky ? 4.2 : 3.0;
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i], [bx, bz] = L[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (!C.inTile(mx, mz)) continue;
    const ang = Math.atan2(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    B.st.box(mx, y, mz, wd, 0.45, len + 0.3, '#c9c4cf', { ry: ang });
    for (const s of [-1, 1]) {
      B.st.box(mx + nx * s * wd / 2, y + 0.75, mz + nz * s * wd / 2, 0.08, 1.1, len + 0.3, sky ? '#8fb7c9' : '#9aa0a8', { ry: ang });
      if (sky) B.st.box(mx + nx * s * wd / 2, y + 1.6, mz + nz * s * wd / 2, 0.1, 2.8, 0.1, '#8d8899', { ry: ang });
    }
    if (sky) { B.st.box(mx, y + 3.15, mz, wd + 0.8, 0.18, len + 0.3, '#e9eef2', { ry: ang }); B.lit.box(mx, y + 3.04, mz, 0.4, 0.02, len * 0.8, '#fff3d6', { ry: ang }); }
    // pillars where they don't stand in the traffic
    for (let d = 8; d < len; d += 16) {
      const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
      if (!extrasFootprintClear(C, { x, z, r: .5 }, 0, y)) continue;
      B.st.add(TPL.cyl, x, y / 2, z, 0.45, y, 0.45, '#bdb8c8'); C.obstacle(x, z, 0.5, y);
    }
    C.pad(ax, az, bx, bz, y + 0.23, wd / 2);
  }
  // stair towers at the free ends (off the carriageway)
  for (const [p, q] of [[L[0], L[1]], [L[L.length - 1], L[L.length - 2]]] as [XZ, XZ][]) {
    if (!C.inTile(p[0], p[1])) continue;
    const ang = Math.atan2(p[0] - q[0], p[1] - q[1]);
    // Include both the stair body and its collision radius.
    if (!extrasFootprintClear(C, boxFootprint(p[0], p[1], ang, wd + .9, Math.max(3.2, wd + .6)), 0, y)) continue;
    B.st.box(p[0], y / 2, p[1], wd + 0.6, y, 3.2, '#bfb9c6', { ry: ang, ao: true, aoH: 3 });
    for (let k = 0; k < 8; k++) B.st.box(p[0], 0.4 + k * 0.8, p[1], wd + 0.9, 0.12, 0.5, '#9e98a6', { ry: ang + Math.PI / 2 });
    C.obstacle(p[0], p[1], Math.max(1.6, wd / 2 + 0.3), y);
  }
  const t = nm(f);
  if (t) { const [mx, mz] = L[Math.floor(L.length / 2)]; if (C.inTile(mx, mz)) { const [a, b] = [L[Math.max(0, Math.floor(L.length / 2) - 1)], L[Math.min(L.length - 1, Math.floor(L.length / 2) + 1)]], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
    for (const s of [-1, 1]) C.sign(f.id + s, upper(t).slice(0, 24), '#1f3a68', '#ffffff', [mx + nx * s * (wd / 2 + 0.12), y + 0.1, mz + nz * s * (wd / 2 + 0.12)], [nx * s, 0, nz * s], 5, 0.7); } }
}

// ---------- pedestrian subway: stair entrances going down at both ends ----------
function subway(f: OsmFeature, C: ExtrasCtx) {
  const L = f.l; if (!L || L.length < 2) return;
  for (const [p, q] of [[L[0], L[1]], [L[L.length - 1], L[L.length - 2]]] as [XZ, XZ][]) {
    if (!C.inTile(p[0], p[1])) continue;
    const ang = Math.atan2(q[0] - p[0], q[1] - p[1]), B = C.B;
    if (!extrasFootprintClear(C, boxFootprint(p[0], p[1], ang, 3.8, 5.7), 0, 2.7)) continue;
    for (const s of [-1, 1]) B.st.box(p[0] + Math.cos(ang) * s * 1.6, 0.6, p[1] - Math.sin(ang) * s * 1.6, 0.25, 1.2, 5, '#c7c1cd', { ry: ang });
    B.st.box(p[0], 0.02, p[1], 3, 0.04, 5, '#2b2833', { ry: ang });
    B.st.box(p[0], 2.6, p[1], 3.8, 0.2, 5.6, '#e9eef2', { ry: ang });
    C.sign(f.id + p[0], 'SUBWAY', '#1f3a68', '#ffffff', [p[0] - Math.sin(ang) * 2.85, 2.25, p[1] - Math.cos(ang) * 2.85], [-Math.sin(ang), 0, -Math.cos(ang)], 2.6, 0.55);
    C.obstacle(p[0], p[1], 1.9, 2.6);
  }
}

// ---------- railway lines: ballast, sleepers and broad-gauge rails; on bridges, a girder deck ----------
function rail(f: OsmFeature, C: ExtrasCtx) {
  const L = f.l; if (!L || L.length < 2) return;
  const t = f.t.railway; if (t === 'subway' || t === 'light_rail' || t === 'monorail') return;   // the metro is drawn with its viaduct
  if (f.t.tunnel && f.t.tunnel !== 'no') return;
  const bridge = !!f.t.bridge && f.t.bridge !== 'no', y = bridge ? 6.2 : 0, B = C.B, siding = !!f.t.service;
  let acc = 0;
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i], [bx, bz] = L[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 0.3) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ang = Math.atan2(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len;
    if (C.inTile(mx, mz)) {
      if (bridge) {
        B.st.box(mx, y - 0.6, mz, 5.2, 1.4, len + 0.2, '#8e8a93', { ry: ang });
        for (const s of [-1, 1]) B.st.box(mx + nx * s * 2.5, y + 0.6, mz + nz * s * 2.5, 0.3, 1.2, len + 0.2, '#6e6a74', { ry: ang });
      } else B.foot.box(mx, 0.09, mz, 3.4, 0.18, len + 0.2, '#8b8179', { ry: ang, uvScale: [0.6, len / 4] });
      for (const s of [-1, 1]) B.st.box(mx + nx * s * 0.84, y + 0.26, mz + nz * s * 0.84, 0.08, 0.1, len + 0.05, '#8c8f96', { ry: ang });
      if (!C.lowQ && !siding) for (let d = (1.2 - (acc % 1.2)) % 1.2; d < len; d += 1.2) {
        const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
        B.st.box(x, y + 0.2, z, 2.6, 0.07, 0.24, '#6b6460', { ry: ang });
      }
      // overhead line masts on electrified main lines
      if (!siding && !C.lowQ) for (let d = (60 - (acc % 60)) % 60; d < len; d += 60) {
        const x = ax + (bx - ax) * d / len + nx * 2.6, z = az + (bz - az) * d / len + nz * 2.6;
        if (!extrasFootprintClear(C, { x, z, r: .25 }, y, y + 7)) continue;
        B.st.box(x, y + 3.5, z, 0.22, 7, 0.22, '#7c7f86'); B.st.box(x - nx * 1.4, y + 6.8, z - nz * 1.4, 0.12, 0.12, 3, '#7c7f86', { ry: ang + Math.PI / 2 });
        C.obstacle(x, z, 0.25, y + 7);
      }
    }
    acc += len;
  }
}

// ---------- railway / metro platforms ----------
function platform(f: OsmFeature, C: ExtrasCtx) {
  const B = C.B;
  if (f.r && f.r[0] && f.r[0].length > 2) {
    const ring = f.r[0]; const [mx, mz] = mid(f); if (!C.inTile(mx, mz)) return;
    try {
      const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []);
      for (const t of tris) { const a = ring[t[0]], b = ring[t[1]], c = ring[t[2]]; B.foot.tri([a[0], 0.95, a[1]], [c[0], 0.95, c[1]], [b[0], 0.95, b[1]], '#cfc8bb'); }
    } catch { /* odd outline */ }
    return;
  }
  const L = f.l; if (!L || L.length < 2) return;
  for (let i = 0; i < L.length - 1; i++) {
    const [ax, az] = L[i], [bx, bz] = L[i + 1], len = Math.hypot(bx - ax, bz - az); if (len < 1) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (!C.inTile(mx, mz)) continue;
    const ang = Math.atan2(bx - ax, bz - az);
    B.st.box(mx, 0.48, mz, 6, 0.96, len, '#cfc8bb', { ry: ang });
    B.st.box(mx, 5.2, mz, 7, 0.25, len, '#b8b2a6', { ry: ang });
    for (let d = 4; d < len; d += 9) { const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len; B.st.box(x, 3, z, 0.25, 4.4, 0.25, '#7c7f86'); }
  }
}

// ---------- stations: name boards (Indian Railways yellow), concourse box where no building is mapped ----------
function station(f: OsmFeature, C: ExtrasCtx) {
  const [px, pz] = mid(f); if (!C.inTile(px, pz)) return;
  const name = nm(f); if (!name) return;
  if (f.t.station === 'subway' || f.t.subway === 'yes' || /metro/i.test(name + (f.t.network || ''))) return;   // metro stations are drawn with the metro
  const B = C.B, te = f.t['name:te'] || '', hi = f.t['name:hi'] || '';
  const r = C.nearestRoad(px, pz, 80, true);
  const ang = r ? Math.atan2(r.hx, r.hz) : 0, hx = r ? r.hx : 0, hz = r ? r.hz : 1;
  if (extrasFootprintClear(C, boxFootprint(px, pz, ang, 16, 36), 0, 8.6)) {
    B.st.box(px, 4, pz, 14, 8, 34, '#e4d7c3', { ry: ang, ao: true, aoH: 4 });
    B.st.box(px, 8.3, pz, 16, 0.6, 36, '#a8442f', { ry: ang });
    const a = (u: number, v: number): XZ => [px + hx * u - hz * v, pz + hz * u + hx * v];
    C.solid([a(-17, -7), a(17, -7), a(17, 7), a(-17, 7)], 8);
  }
  // big yellow board on two legs by the road, three languages
  const bx = r ? r.cx + (-hz) * (r.w / 2 + 3) : px + 12, bz = r ? r.cz + hx * (r.w / 2 + 3) : pz;
  if (!extrasFootprintClear(C, boxFootprint(bx, bz, ang, 1.2, 6.2), 0, 4.8)) return;
  for (const s of [-1, 1]) B.st.box(bx + hx * s * 2.6, 1.6, bz + hz * s * 2.6, 0.18, 3.2, 0.18, '#2b2a30');
  B.st.box(bx, 3.6, bz, 0.14, 2.4, 6.2, '#1b1a20', { ry: ang });
  const lines = [te, hi, name.replace(/ (railway )?station$/i, '')].filter(Boolean).slice(-3);
  lines.forEach((t, k) => C.sign(f.id + k, upper(t).slice(0, 24), '#f7d21d', '#121116', [bx + hz * 0.09, 4.4 - k * 0.78, bz - hx * 0.09], [hz, 0, -hx], 5.8, 0.7));
  C.obstacle(bx, bz, 0.6, 4.8);
}

// ---------- bus terminals: long shelters over the bays, a terminal block, name board ----------
function busStation(f: OsmFeature, C: ExtrasCtx) {
  const name = nm(f); const [px, pz] = mid(f); if (!C.inTile(px, pz)) return;
  if (!name || /^(bus ?stop|auto stand)$/i.test(name)) return;
  const area = f.r && f.r[0] && f.r[0].length > 3;
  const B = C.B, r = C.nearestRoad(px, pz, 120, true), ang = r ? Math.atan2(r.hx, r.hz) : 0, hx = r ? r.hx : 0, hz = r ? r.hz : 1;
  // bay shelters: rows of long canopies; skip spots that fall on a road or inside a mapped building
  const span = area ? Math.max(...f.r![0].map((p) => Math.hypot(p[0] - px, p[1] - pz))) : 0;
  const rows = area ? Math.min(8, Math.max(3, Math.round(span / 22))) : 2, len = area ? Math.min(110, Math.max(50, span)) : 40;
  for (let k = 0; k < rows; k++) {
    const v = (k - (rows - 1) / 2) * 13, cx = px - hz * v, cz = pz + hx * v;
    if (!extrasFootprintClear(C, boxFootprint(cx, cz, ang, 9.6, len), 0, 5.4)) continue;
    B.st.box(cx, 5.2, cz, 8, 0.35, len, '#e7e3dd', { ry: ang });
    B.st.box(cx, 0.15, cz, 2.2, 0.3, len - 4, '#d9cfbf', { ry: ang });
    for (let u = -len / 2 + 3; u <= len / 2 - 3; u += 8) { const x = cx + hx * u, z = cz + hz * u; B.st.box(x, 2.6, z, 0.3, 5.2, 0.3, '#8f949c'); C.obstacle(x, z, 0.3, 5.2); }
    // parked buses in the bays
    const rr = rng(hash(f.id + k));
    for (let u = -len / 2 + 6; u <= len / 2 - 6; u += 12) {
      if (rr() < 0.35) continue;
      const x = cx + hx * u - hz * 3.2, z = cz + hz * u + hx * 3.2;
      B.st.box(x, 1.65, z, 2.5, 2.9, 11, rr() < 0.5 ? '#c8352e' : '#2f6bb4', { ry: ang });
      B.st.box(x, 2.25, z, 2.54, 0.8, 10, '#1c2533', { ry: ang });
      C.obstacle(x, z, 1.6, 3.2);
    }
  }
  const t = upper(name.replace(/^T[GS]S?RTC\s*/i, '').replace(/^,\s*/, '')) || 'BUS STATION';
  const bx = r ? r.cx + (-hz) * (r.w / 2 + 2.5) : px, bz = r ? r.cz + hx * (r.w / 2 + 2.5) : pz;
  if (!extrasFootprintClear(C, boxFootprint(bx, bz, ang, 1, 7.4), 0, 5.4)) return;
  for (const s of [-1, 1]) B.st.box(bx + hx * s * 3.2, 2.2, bz + hz * s * 3.2, 0.2, 4.4, 0.2, '#2b2a30');
  B.st.box(bx, 4.6, bz, 0.14, 1.6, 7.4, '#b8322b', { ry: ang });
  C.sign(f.id, t.slice(0, 26), '#b8322b', '#ffffff', [bx + hz * 0.09, 4.6, bz - hx * 0.09], [hz, 0, -hx], 7, 1.2);
  C.obstacle(bx, bz, 0.5, 5.4);
}

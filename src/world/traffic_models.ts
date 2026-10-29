import * as THREE from 'three';
import { Batch, TPL, toTpl, Tpl, Rng, AddOpts } from '../core/util';
import { labelTexture } from './signs';
import { PersonSpec } from './people';
import { autoQuote } from './auto-quotes';

// Hyderabad street traffic. Each builder returns a body batch, a lights batch (emissive at night),
// optional text decals and its footprint size [width, height, length]. Local frame: ground y=0, front toward -z.
const PI = Math.PI;
export interface Model { body: Batch; lights: Batch; size: number[]; decals?: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; kind: string; quoteId?: string }

// side profile (z, y pairs, front = +z in the list) extruded across the width -> template in local frame
const profCache = new Map<string, Tpl>();
function profile(pts: number[][], width: number, bevel = 0.05): Tpl {
  const key = JSON.stringify(pts) + width + bevel;
  let t = profCache.get(key); if (t) return t;
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const d = Math.max(0.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -d / 2);
  geo.rotateY(PI / 2);          // shape x -> -z (front ends up at -z), extrude depth -> x
  t = toTpl(geo); profCache.set(key, t);
  return t;
}
function wheel(b: Batch, x: number, y: number, z: number, r: number, w: number, rim = '#a7a4ad') {
  b.add(TPL.cyl, x, y, z, r, w, r, '#151418', { rz: PI / 2 });
  b.add(TPL.cyl, x + Math.sign(x || 1) * 0.01, y, z, r * 0.58, w + 0.02, r * 0.58, rim, { rz: PI / 2 });
  b.add(TPL.cyl, x + Math.sign(x || 1) * 0.02, y, z, r * 0.2, w + 0.03, r * 0.2, '#5d5a63', { rz: PI / 2 });
}
const plateTex = new Map<string, THREE.Material>();
function plateMat(text: string, bg: string) {
  const k = text + bg; let m = plateTex.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: labelTexture([{ text, font: '800 {s}px "Baloo 2", sans-serif', color: '#141216', size: 64 }], 256, 64, bg, '#141216') }); plateTex.set(k, m); }
  return m;
}
function decal(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z); return { geo: g, mat };
}

// ---------------- cars ----------------
type CarKind = 'hatch' | 'sedan' | 'suv' | 'cab';
export function car(kind: CarKind, color: string, r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const S = {
    hatch: { L: 3.85, W: 1.70, lower: [[1.93, 0.36], [1.96, 0.72], [1.55, 0.9], [0.9, 0.98], [-1.75, 1.02], [-1.92, 0.92], [-1.94, 0.38], [-1.6, 0.26], [1.6, 0.26]], cab: [[0.95, 0.96], [0.32, 1.44], [-1.15, 1.5], [-1.8, 1.08], [-1.78, 0.98]], roof: [0.3, -1.12, 1.5] },
    sedan: { L: 4.0, W: 1.72, lower: [[2.0, 0.36], [2.03, 0.72], [1.55, 0.9], [1.0, 0.98], [-1.35, 1.02], [-2.0, 1.0], [-2.03, 0.42], [-1.7, 0.26], [1.7, 0.26]], cab: [[1.02, 0.97], [0.38, 1.44], [-0.75, 1.46], [-1.38, 1.02]], roof: [0.36, -0.73, 1.46] },
    suv: { L: 4.35, W: 1.80, lower: [[2.17, 0.45], [2.2, 0.85], [1.75, 1.08], [1.2, 1.15], [-2.08, 1.15], [-2.18, 1.0], [-2.18, 0.45], [-1.8, 0.32], [1.8, 0.32]], cab: [[1.22, 1.13], [0.62, 1.68], [-2.0, 1.72], [-2.12, 1.14]], roof: [0.6, -2.0, 1.72] },
    cab: { L: 4.0, W: 1.72, lower: [[2.0, 0.36], [2.03, 0.72], [1.55, 0.9], [1.0, 0.98], [-1.35, 1.02], [-2.0, 1.0], [-2.03, 0.42], [-1.7, 0.26], [1.7, 0.26]], cab: [[1.02, 0.97], [0.38, 1.44], [-0.75, 1.46], [-1.38, 1.02]], roof: [0.36, -0.73, 1.46] },
  }[kind];
  const W = S.W;
  b.add(profile(S.lower, W, 0.07), 0, 0, 0, 1, 1, 1, color);
  b.add(profile(S.cab, W * 0.86, 0.05), 0, 0, 0, 1, 1, 1, '#1d2433');                                   // glasshouse
  const [rf, rb, ry] = S.roof, rl = rf - rb;
  b.box(0, ry + 0.015, -(rf + rb) / 2, W * 0.84, 0.05, rl, color);                                          // roof skin
  for (const s of [-1, 1]) {
    // A pillar along the windscreen edge (profile x maps to -z)
    const [c0, c1] = [S.cab[0], S.cab[1]], z0 = -c0[0], z1 = -c1[0], len = Math.hypot(z1 - z0, c1[1] - c0[1]);
    b.box(s * W * 0.425, (c0[1] + c1[1]) / 2, (z0 + z1) / 2, 0.07, len, 0.07, color, { rx: Math.atan2(z1 - z0, c1[1] - c0[1]) });
    b.box(s * W * 0.432, (ry + 1.0) / 2, -(rf + rb) / 2 + 0.1, 0.05, ry - 0.98, 0.1, color);                        // B pillar
    b.box(s * (W / 2 + 0.02), 0.62, 0, 0.02, 0.05, S.L * 0.82, '#2a2930');                                     // door crease
    b.box(s * (W / 2 + 0.06), 1.0, -(rf - 0.1), 0.1, 0.08, 0.14, color);                                         // mirror
  }
  if (kind === 'suv') b.box(0, 1.76, -0.6, W * 0.7, 0.04, 2.0, '#2a2930');                                       // roof rails
  if (kind === 'cab') { b.box(0, 1.56, -0.2, 0.6, 0.16, 0.3, '#FFC107'); }                                          // taxi light
  b.box(0, 0.4, -S.L / 2 - 0.02, W * 0.94, 0.2, 0.08, '#2a2930');                                              // bumpers
  b.box(0, 0.4, S.L / 2 + 0.02, W * 0.94, 0.2, 0.08, '#2a2930');
  b.box(0, 0.6, -S.L / 2 - 0.03, W * 0.4, 0.14, 0.03, '#1b1a1f');                                              // grille
  const wy = kind === 'suv' ? 0.36 : 0.31, wz = S.L / 2 - (kind === 'suv' ? 0.78 : 0.7);
  for (const s of [-1, 1]) for (const z of [-wz, wz]) wheel(b, s * (W / 2 - 0.12), wy, z, wy, 0.22);
  for (const s of [-1, 1]) {
    l.box(s * W * 0.34, 0.72, -S.L / 2 - 0.035, 0.34, 0.11, 0.03, '#fff8e1');
    l.box(s * W * 0.38, 0.8, S.L / 2 + 0.035, 0.3, 0.12, 0.03, '#ff2236');
  }
  const plate = plateMat(`TS ${r.int(7, 15).toString().padStart(2, '0')} ${String.fromCharCode(65 + r.int(0, 25))}${String.fromCharCode(65 + r.int(0, 25))} ${r.int(1000, 9999)}`, kind === 'cab' ? '#FFD600' : '#F6F4EE');
  const decals = [decal(0.52, 0.13, plate, 0, 0.5, S.L / 2 + 0.07), decal(0.52, 0.13, plate, 0, 0.45, -S.L / 2 - 0.07, PI)];
  return { body: b, lights: l, size: [W, kind === 'suv' ? 1.75 : 1.5, S.L], decals, kind: 'car' };
}

// ---------------- auto rickshaw (three-wheeler) ----------------
export function auto(r: Rng, quoteIndex = r.int(0, 9)): Model {
  const b = new Batch(), l = new Batch();
  const Y = r.pick(['#F2C21B', '#F4C81F', '#E9B514']), K = '#17161b', G = r() < 0.55 ? '#1E8F4E' : Y;
  // floor pan + rear tub
  b.box(0, 0.44, 0.25, 1.22, 0.1, 2.0, '#2a2930');
  for (const s of [-1, 1]) b.box(s * 0.61, 0.7, 0.62, 0.06, 0.5, 1.28, Y);
  b.box(0, 0.83, 1.27, 1.28, 0.78, 0.06, Y);                                                // rear panel
  b.box(0, 1.0, 1.29, 1.24, 0.08, 0.02, G);                                                 // stripe
  for (const s of [-1, 1]) b.box(s * 0.62, 0.98, 0.62, 0.065, 0.08, 1.28, G);
  // front cowl: narrow nose widening to the cabin
  b.box(0, 0.86, -1.08, 0.84, 0.9, 0.1, Y, { rx: -0.14 });
  for (const s of [-1, 1]) b.box(s * 0.53, 0.78, -0.75, 0.06, 0.66, 0.72, Y, { ry: s * 0.36 });
  b.box(0, 0.52, -1.18, 0.34, 0.24, 0.3, K);                                                 // mudguard over the single front wheel
  // windscreen and frame
  b.box(0, 1.46, -0.98, 1.04, 0.56, 0.04, '#26354f', { rx: -0.14 });
  b.box(0, 1.76, -0.94, 1.18, 0.08, 0.1, K);
  // canopy: rounded black hood on rails
  b.add(TPL.halfCyl, 0, 1.6, 0.18, 0.7, 2.25, 0.3, K, { rx: -PI / 2 });
  b.box(0, 1.62, -0.93, 1.38, 0.1, 0.08, K); b.box(0, 1.62, 1.29, 1.38, 0.1, 0.08, K);
  for (const s of [-1, 1]) { b.box(s * 0.66, 1.3, -0.4, 0.05, 0.62, 0.05, K); b.box(s * 0.66, 1.3, 1.27, 0.05, 0.62, 0.05, K); b.box(s * 0.67, 1.6, 0.44, 0.04, 0.06, 1.66, K); }
  b.box(0, 1.3, 1.31, 1.2, 0.55, 0.03, K);                                                   // rear canvas with window
  b.box(0, 1.32, 1.33, 0.6, 0.22, 0.01, '#26354f');
  // handlebar, driver in khaki, passenger bench
  b.box(0, 1.1, -0.82, 0.62, 0.04, 0.04, '#3a3840');
  rider(b, { kind: 'shirt', s: 1, skin: r.pick(['#6e452f', '#7d5135', '#8d5a3b', '#9c6644']), hair: '#141216', a: '#A3895A', b: '#6f6a60', c: '#1b1a1f', walk: 1 }, 0, 0.78, -0.42, 'auto');
  b.box(0, 0.8, 0.78, 1.16, 0.12, 0.5, '#5a2a24'); b.box(0, 1.08, 1.05, 1.16, 0.5, 0.08, '#5a2a24');
  const pax = r.int(0, 3);
  for (let i = 0; i < pax; i++) rider(b, passenger(r), -0.4 + i * 0.4, 0.86, 0.82, 'bench');
  wheel(b, 0, 0.24, -1.12, 0.24, 0.13); wheel(b, -0.6, 0.24, 0.8, 0.24, 0.14); wheel(b, 0.6, 0.24, 0.8, 0.24, 0.14);
  l.add(TPL.cyl, 0, 1.0, -1.15, 0.1, 0.04, 0.1, '#fff6d8', { rx: PI / 2 });
  for (const s of [-1, 1]) { l.box(s * 0.5, 0.62, 1.31, 0.14, 0.1, 0.03, '#ff2a2a'); l.box(s * 0.36, 1.02, -1.15, 0.08, 0.06, 0.03, '#ffb030'); }
  const plate = plateMat(`TS 09 U${String.fromCharCode(65 + r.int(0, 25))} ${r.int(1000, 9999)}`, '#FFD600');
  const quote = autoQuote(quoteIndex);
  const quoteMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, map: labelTexture(quote.lines.map(text => ({ text, font: '700 {s}px "Noto Sans Telugu", sans-serif', color: '#FFF6DC', size: 52 })), 768, 224, K) });
  return { body: b, lights: l, size: [1.36, 1.85, 2.65], decals: [decal(0.42, 0.11, plate, 0, 0.62, 1.31), decal(1.17, 0.5, quoteMaterial, 0, 1.34, 1.35)], kind: 'auto', quoteId: quote.id };
}

// ---------------- two-wheelers ----------------
export function motorbike(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const paint = r.pick(['#c62828', '#1b1a1f', '#1F5FCC', '#e9e9ef', '#6a6f78', '#2E7D32', '#8E1F1F']);
  b.box(0, 0.62, 0.0, 0.1, 0.1, 1.2, '#2a2930', { rx: -0.08 });                               // frame
  b.add(TPL.capsule, 0, 0.92, -0.25, 0.3, 0.38, 0.26, paint, { rx: PI / 2 + 0.1 });           // tank
  b.box(0, 0.88, 0.32, 0.26, 0.09, 0.72, '#141317');                                            // long seat
  b.box(0, 0.5, -0.08, 0.26, 0.3, 0.42, '#9b9aa3');                                             // engine
  b.add(TPL.cyl, 0.16, 0.42, 0.42, 0.045, 0.75, 0.045, '#c8c6cf', { rx: PI / 2 - 0.12 });       // silencer
  b.box(0, 0.72, 0.62, 0.32, 0.16, 0.3, paint);                                                // side panels / tail
  b.box(0, 0.86, 0.85, 0.18, 0.06, 0.2, '#2a2930');                                            // grab rail
  b.box(0, 0.7, -0.66, 0.05, 0.62, 0.05, '#9b9aa3', { rx: 0.42 });                             // forks
  b.box(0, 1.08, -0.6, 0.72, 0.035, 0.035, '#2a2930');                                         // handlebar
  b.box(0, 1.0, -0.72, 0.24, 0.2, 0.14, paint);                                                 // headlamp nacelle
  b.box(0, 0.62, -0.78, 0.12, 0.04, 0.32, paint); b.box(0, 0.64, 0.8, 0.12, 0.04, 0.36, '#2a2930');   // mudguards
  wheel(b, 0, 0.31, -0.78, 0.31, 0.09, '#8d8a93'); wheel(b, 0, 0.31, 0.68, 0.31, 0.1, '#8d8a93');
  const rd = riderSpec(r, false);
  rider(b, rd, 0, 0.9, 0.18, 'bike');
  if (r() < 0.35) rider(b, passenger(r), 0, 0.92, 0.6, r() < 0.5 ? 'pillionSide' : 'pillion');
  l.box(0, 1.0, -0.8, 0.14, 0.12, 0.03, '#fff8e1');
  l.box(0, 0.86, 0.96, 0.12, 0.06, 0.03, '#ff2236');
  return { body: b, lights: l, size: [0.75, 1.9, 2.0], kind: 'bike' };
}
export function scooter(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const paint = r.pick(['#e9e9ef', '#1b1a1f', '#8E1F1F', '#2a5bd7', '#7a7f88', '#c9b38a', '#d81b60']);
  b.box(0, 0.75, -0.6, 0.46, 0.82, 0.12, paint, { rx: 0.18 });                                 // front apron
  b.box(0, 0.32, -0.05, 0.36, 0.08, 0.7, '#2a2930');                                           // floorboard
  b.add(TPL.rbox, 0, 0.62, 0.5, 0.48, 0.42, 0.78, paint);                                       // rear body
  b.box(0, 0.88, 0.42, 0.34, 0.08, 0.62, '#141317');                                           // seat
  b.box(0, 1.14, -0.62, 0.6, 0.06, 0.12, paint);                                                // handlebar cover
  b.box(0, 0.48, -0.78, 0.16, 0.06, 0.3, paint);                                               // front mudguard
  wheel(b, 0, 0.24, -0.72, 0.24, 0.1, '#bdbac4'); wheel(b, 0, 0.24, 0.58, 0.24, 0.12, '#bdbac4');
  const rd = riderSpec(r, true);
  rider(b, rd, 0, 0.9, 0.3, 'scooter');
  if (r() < 0.25) rider(b, passenger(r, true), 0, 0.92, 0.72, 'pillion');
  l.box(0, 1.15, -0.7, 0.2, 0.1, 0.03, '#fff8e1');
  l.box(0, 0.78, 0.9, 0.18, 0.06, 0.03, '#ff2236');
  return { body: b, lights: l, size: [0.75, 1.85, 1.8], kind: 'bike' };
}
function riderSpec(r: Rng, scooterRide: boolean): PersonSpec {
  const woman = r() < (scooterRide ? 0.55 : 0.12);
  const skin = r.pick(['#5b3a29', '#6e452f', '#7d5135', '#8d5a3b', '#9c6644', '#a8704b', '#b97f55', '#c68f62', '#d1a074']);
  if (woman) return { kind: r() < 0.7 ? 'salwar' : 'western_f', s: 0.95, skin, hair: '#141216', a: r.pick(['#F48FB1', '#FFCC80', '#80CBC4', '#B39DDB', '#E8413A', '#1F5FCC']), b: r.pick(['#ffffff', '#1b1a1f', '#3b5998']), c: r.pick(['#C2185B', '#2E7D32', '#F9A825', '#00838F']), walk: 1 };
  return { kind: r() < 0.6 ? 'shirt' : 'tee', s: 1, skin, hair: '#141216', a: r.pick(['#E9EEF5', '#9EC1E8', '#2F4A7A', '#E8413A', '#1b1a1f', '#22B573', '#F2E6C9']), b: r.pick(['#2b2a31', '#3f4b6b', '#2e4a7a']), c: '#1b1a1f', walk: 1 };
}
function passenger(r: Rng, woman = r() < 0.6): PersonSpec {
  const skin = r.pick(['#5b3a29', '#6e452f', '#7d5135', '#8d5a3b', '#9c6644', '#a8704b', '#b97f55', '#c68f62', '#d1a074']);
  if (woman) {
    const kind = r.pick(['sari', 'sari', 'salwar', 'burqa'] as const);
    return { kind, s: 0.95, skin, hair: '#141216', a: kind === 'burqa' ? '#16151a' : r.pick(['#C2185B', '#E65100', '#2E7D32', '#6A1B9A', '#F9A825', '#00838F', '#1565C0']), b: r.pick(['#F48FB1', '#FFCC80', '#80CBC4', '#C2185B']), c: '#E6B422', walk: 1 };
  }
  return { kind: r.pick(['shirt', 'tee', 'kurta_cap'] as const), s: 1, skin, hair: '#141216', a: r.pick(['#E9EEF5', '#9EC1E8', '#2F4A7A', '#ffffff', '#E8413A']), b: r.pick(['#2b2a31', '#3f4b6b', '#ffffff']), c: '#1b1a1f', walk: 1 };
}

// seated figure: hips at (x, y, z), facing -z
type Seat = 'bike' | 'scooter' | 'auto' | 'bench' | 'pillion' | 'pillionSide';
export function rider(b: Batch, p: PersonSpec, x: number, y: number, z: number, seat: Seat) {
  const k = p.kind, top = k === 'sari' ? p.b : p.a, low = k === 'sari' || k === 'burqa' ? p.a : p.b;
  const side = seat === 'pillionSide';
  const lean = seat === 'bike' ? 0.32 : seat === 'scooter' ? 0.12 : 0.05;
  const ang = side ? PI / 2 : 0, cs = Math.cos(ang), sn = Math.sin(ang);
  const put = (t: Tpl, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col: string, o: AddOpts = {}) =>
    b.add(t, x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs, sx, sy, sz, col, { ...o, ry: ang + (o.ry || 0) });
  // torso and head
  put(TPL.taper, 0, 0.32, -lean * 0.4, 0.2, 0.5, 0.13, top, { rx: lean });
  const hz = -lean * 0.75;
  put(TPL.sph, 0, 0.72, hz, 0.11, 0.13, 0.115, p.skin);
  const helmet = seat === 'bike' || seat === 'scooter';
  if (k === 'burqa') put(TPL.sph, 0, 0.73, hz + 0.01, 0.13, 0.15, 0.13, p.a);
  else if (helmet && p.walk > 0) put(TPL.sph, 0, 0.77, hz + 0.01, 0.15, 0.15, 0.16, k === 'salwar' || k === 'western_f' ? '#f1eff4' : '#1b1a1f');
  else put(TPL.sph, 0, 0.75, hz + 0.01, 0.118, 0.11, 0.118, p.hair);
  if (k === 'salwar') put(TPL.box, 0, 0.5, 0.1, 0.06, 0.4, 0.04, p.c, { rx: -0.6 });                 // dupatta trailing
  if (k === 'sari') put(TPL.box, 0.05, 0.35, 0, 0.4, 0.5, 0.05, p.a, { rz: 0.5 });
  // thighs, shins
  for (const s of [-1, 1]) {
    put(TPL.pill, s * 0.11, 0.02, -0.18, 0.17, 0.44, 0.17, low, { rx: PI / 2 });
    const shinZ = seat === 'bike' ? -0.32 : seat === 'scooter' ? -0.48 : -0.4;
    put(TPL.pill, s * (seat === 'bike' ? 0.16 : 0.11), -0.3, shinZ, 0.14, 0.46, 0.14, k === 'shirt' || k === 'tee' || k === 'salwar' || k === 'western_f' ? low : p.a, { rx: seat === 'bike' ? 0.4 : 0.1 });
    // arms reach the handlebar (drivers) or rest on the lap
    const reach = seat === 'bike' || seat === 'scooter' || seat === 'auto';
    put(TPL.pill, s * 0.22, 0.38, reach ? -0.28 : -0.08, 0.11, 0.44, 0.11, k === 'burqa' ? p.a : top, { rx: reach ? 1.1 : 0.4 });
  }
}

// ---------------- buses, lorries, tankers ----------------
export function busRouteBoards(number: string, destination: string) {
  const texture = labelTexture([
    { text: number.toUpperCase(), font: '{s}px "Bungee", sans-serif', color: '#FFB030', size: 102 },
    { text: destination.toUpperCase(), font: '800 {s}px "Baloo 2", sans-serif', color: '#FFF5DB', size: 34 },
  ], 768, 192, '#09090D', '#FFB030');
  const material = new THREE.MeshBasicMaterial({ toneMapped: false, map: texture });
  // One service identity, readable from either direction; no random prototype route.
  return [decal(2.2, 0.55, material, 0, 2.96, -5.56, PI), decal(2.2, 0.55, material, 0, 2.96, 5.56)];
}
export function bus(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const L = 11, W = 2.5, red = r() < 0.75 ? '#B7322C' : '#2E6FB7';                // ordinary (red) or AC / Metro Luxury (blue)
  b.add(TPL.rbox, 0, 0.95, 0, W, 1.3, L, red);                                        // lower body
  b.box(0, 1.62, 0, W + 0.02, 0.14, L + 0.02, '#F3EEDF');                             // cream belt
  b.box(0, 2.25, 0, W - 0.02, 1.15, L - 0.3, '#1d2433');                              // window band
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) b.box(s * (W / 2 - 0.005), 2.25, -L / 2 + 0.9 + i * 1.18, 0.03, 1.15, 0.12, '#e9e3d4');   // window pillars
  b.add(TPL.rbox, 0, 3.0, 0, W, 0.5, L, '#F3EEDF');                                   // roof band
  b.box(0, 3.28, 0.6, W * 0.75, 0.12, L * 0.6, '#d9d3c3');
  // left-side doors (front and middle), driver on the right
  for (const dz of [-L / 2 + 1.4, 0.6]) b.box(-W / 2 - 0.01, 1.55, dz, 0.03, 2.3, 1.0, '#2a2930');
  b.box(0, 1.95, -L / 2 - 0.01, W - 0.25, 1.35, 0.04, '#1d2433');                    // windscreen
  b.box(0, 1.25, -L / 2 - 0.02, W - 0.1, 0.06, 0.05, '#F3EEDF');
  b.box(0, 0.5, -L / 2 - 0.05, W, 0.32, 0.1, '#2a2930'); b.box(0, 0.5, L / 2 + 0.05, W, 0.32, 0.1, '#2a2930');
  b.box(0, 2.1, L / 2 + 0.01, W - 0.4, 0.9, 0.04, '#1d2433');
  for (const s of [-1, 1]) b.box(s * (W / 2 + 0.18), 2.3, -L / 2 + 0.1, 0.08, 0.5, 0.06, '#1b1a1f');   // mirrors
  for (const s of [-1, 1]) for (const z of [-3.4, 3.3]) wheel(b, s * (W / 2 - 0.2), 0.5, z, 0.5, 0.32, '#c9c6cf');
  for (let i = 0; i < 10; i++) b.add(TPL.sph, (i % 2 ? 0.75 : -0.75), 2.3, -4.2 + i * 0.95, 0.17, 0.2, 0.17, ['#6b4430', '#8d5a3b', '#a8704b', '#5b3a29'][i % 4]);
  for (const s of [-1, 1]) { l.box(s * 0.95, 0.85, L / 2 + 0.06, 0.3, 0.2, 0.03, '#ff2236'); l.box(s * 0.95, 0.8, -L / 2 - 0.06, 0.3, 0.18, 0.03, '#fff8e1'); }
  const label = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: red === '#B7322C' ? 'TGSRTC  CITY ORDINARY' : 'TGSRTC  METRO LUXURY', font: '{s}px "Bungee", sans-serif', color: '#F3EEDF', size: 40 }], 512, 64, red) });
  const decals = [decal(4.2, 0.5, label, W / 2 + 0.02, 1.15, -0.5, PI / 2), decal(4.2, 0.5, label, -W / 2 - 0.02, 1.15, 1.6, -PI / 2)];
  return { body: b, lights: l, size: [W, 3.3, L], decals, kind: 'bus' };
}
export function lorry(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const cab = r.pick(['#E8731F', '#F2C14E', '#C62828', '#1E88E5']), bed = r.pick(['#8B5A2B', '#1E8F4E', '#1F5FCC', '#C62828']);
  b.add(TPL.rbox, 0, 1.55, -3.15, 2.35, 2.1, 1.9, cab);
  b.box(0, 2.05, -4.11, 2.0, 0.75, 0.05, '#1d2433');                                    // split windscreen
  b.box(0, 2.05, -4.13, 0.06, 0.75, 0.04, cab);
  b.box(0, 2.62, -3.15, 2.4, 0.3, 1.95, '#F6EEDC');                                    // painted visor
  for (let i = 0; i < 5; i++) b.box(-0.9 + i * 0.45, 1.25, -4.12, 0.3, 0.5, 0.03, ['#E53935', '#FFB627', '#1F5FCC', '#22B573', '#ffffff'][i]);   // decorated grille
  b.box(0, 0.62, -4.18, 2.3, 0.3, 0.12, '#c0c0c8');
  b.box(0, 0.86, 1.0, 2.3, 0.3, 6.1, '#2a2930');                                       // chassis
  b.box(0, 1.06, 1.0, 2.5, 0.12, 6.1, '#6b4a2b');                                       // deck
  for (const s of [-1, 1]) b.box(s * 1.22, 1.85, 1.0, 0.08, 1.5, 6.1, bed);             // high sides
  b.box(0, 1.85, -2.05, 2.5, 1.5, 0.08, bed); b.box(0, 1.85, 4.02, 2.5, 1.5, 0.08, bed);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.box(s * 1.27, 1.4 + i * 0.4, 1.0, 0.02, 0.07, 6.0, ['#FFB627', '#ffffff', '#E53935'][i]);
  if (r() < 0.5) b.add(TPL.halfCyl, 0, 2.6, 1.0, 1.25, 6.0, 0.45, '#2E5E9E', { rx: -PI / 2 });   // tarpaulin
  for (const s of [-1, 1]) for (const z of [-3.15, 2.2, 3.3]) wheel(b, s * 1.08, 0.5, z, 0.5, 0.34, '#c9c6cf');
  l.box(0, 0.75, -4.25, 1.9, 0.12, 0.03, '#fff8e1');
  for (const s of [-1, 1]) l.box(s * 0.95, 0.9, 4.08, 0.28, 0.16, 0.03, '#ff2236');
  const hok = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'HORN OK PLEASE', font: '{s}px "Bungee", sans-serif', color: '#E53935', size: 60 }], 512, 96, '#FFD54F') });
  return { body: b, lights: l, size: [2.5, 3.1, 8.4], decals: [decal(2.0, 0.38, hok, 0, 1.75, 4.08)], kind: 'truck' };
}
let waterMat: THREE.Material | null = null;
export function tanker(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  b.add(TPL.rbox, 0, 1.5, -2.95, 2.3, 2.1, 2.0, '#2E66C9');
  b.box(0, 2.0, -3.96, 2.0, 0.75, 0.05, '#1d2433');
  b.box(0, 0.85, 0.6, 1.0, 0.35, 6.6, '#2a2930');
  b.add(TPL.cyl, 0, 2.0, 1.1, 1.12, 5.2, 1.12, '#3E7CE0', { rx: PI / 2 });
  b.add(TPL.sph, 0, 2.0, 3.7, 1.12, 1.12, 0.35, '#3E7CE0'); b.add(TPL.sph, 0, 2.0, -1.5, 1.12, 1.12, 0.35, '#3E7CE0');
  b.box(0, 2.0, 1.1, 2.26, 0.14, 5.0, '#F6EEDC');
  b.add(TPL.cyl, 0, 3.15, 1.1, 0.3, 0.12, 0.3, '#2a2930');
  for (const s of [-1, 1]) for (const z of [-2.95, 1.6, 2.9]) wheel(b, s * 1.05, 0.48, z, 0.48, 0.3, '#c9c6cf');
  l.box(0, 0.75, -4.02, 1.6, 0.14, 0.03, '#fff8e1');
  for (const s of [-1, 1]) l.box(s * 0.8, 0.8, 3.95, 0.3, 0.16, 0.03, '#ff2236');
  if (!waterMat) waterMat = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'DRINKING WATER', font: '{s}px "Bungee", sans-serif', color: '#ffffff', size: 56 }], 512, 80, '#2E66C9') });
  void r;
  return { body: b, lights: l, size: [2.3, 3.1, 8.2], decals: [decal(3.2, 0.5, waterMat, 1.13, 1.55, 1.1, PI / 2), decal(3.2, 0.5, waterMat, -1.13, 1.55, 1.1, -PI / 2)], kind: 'truck' };
}

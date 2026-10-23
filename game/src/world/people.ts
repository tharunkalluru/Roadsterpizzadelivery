import * as THREE from 'three';
import { Batch, TPL, Rng, AddOpts, Tpl } from '../core/util';

// People of Hyderabad: one builder for the static crowds at shop fronts and for animated walkers.
// Local frame: feet at y=0, facing -z. `s` scales the whole figure (1 = adult of about 1.65 m).

export type Kind = 'sari' | 'salwar' | 'burqa' | 'western_f' | 'schoolgirl' | 'schoolboy' | 'shirt' | 'lungi' | 'kurta_cap' | 'elder_m' | 'elder_f' | 'tee';
export interface PersonSpec { kind: Kind; s: number; skin: string; hair: string; a: string; b: string; c: string; walk: number }

const SKIN = ['#5b3a29', '#6e452f', '#7d5135', '#8d5a3b', '#9c6644', '#a8704b', '#b97f55', '#c68f62', '#d1a074', '#e0b48a'];
const SARI = ['#C2185B', '#E65100', '#2E7D32', '#6A1B9A', '#F9A825', '#00838F', '#AD1457', '#1565C0', '#D84315', '#7B1FA2', '#EC407A', '#00897B'];
const KURTI = ['#F48FB1', '#FFCC80', '#80CBC4', '#B39DDB', '#FFF59D', '#EF9A9A', '#A5D6A7', '#90CAF9', '#FFAB91', '#CE93D8'];
const SHIRT = ['#E9EEF5', '#9EC1E8', '#F2E6C9', '#C9D9B5', '#E3B9B4', '#2F4A7A', '#7A2F3B', '#4A6B3A', '#ffffff', '#D7C4E8', '#F3C567'];
const TROUSER = ['#2b2a31', '#3f4b6b', '#5d4b3c', '#6f6a60', '#2e3b55', '#1f2433'];
const TEE = ['#E8413A', '#1F5FCC', '#22B573', '#1b1a1f', '#F06A9B', '#FFB627', '#8E5BD0', '#2BA39A', '#ffffff'];

// adult mix: about half women, with kids and elders; weights tuned to look like a busy Hyderabad footpath
const MIX: [Kind, number][] = [['sari', 15], ['salwar', 14], ['burqa', 7], ['western_f', 6], ['schoolgirl', 4], ['schoolboy', 4],
  ['shirt', 17], ['lungi', 6], ['kurta_cap', 6], ['elder_m', 5], ['elder_f', 5], ['tee', 11]];

export function randomPerson(r: Rng): PersonSpec {
  let tot = 0; for (const [, w] of MIX) tot += w;
  let p = r() * tot, kind: Kind = 'shirt';
  for (const [k, w] of MIX) { p -= w; if (p <= 0) { kind = k; break; } }
  const kid = kind === 'schoolgirl' || kind === 'schoolboy';
  const elder = kind === 'elder_m' || kind === 'elder_f';
  const female = ['sari', 'salwar', 'burqa', 'western_f', 'schoolgirl', 'elder_f'].includes(kind);
  const s = kid ? r.range(0.68, 0.8) : (female ? r.range(0.9, 1.0) : r.range(0.97, 1.08)) * (elder ? 0.97 : 1);
  const hair = elder ? r.pick(['#d9d6d0', '#bdb8b0', '#9e9a94']) : r.pick(['#141216', '#1d1714', '#2a1d16', '#191515']);
  let a = '#fff', b = '#fff', c = '#fff';
  switch (kind) {
    case 'sari': a = r.pick(SARI); b = r.pick(SARI); c = r.pick(['#E6B422', '#F5D76E', '#ffffff', '#C9A227']); break;
    case 'elder_f': a = r.pick(['#ffffff', '#E7E1D3', '#B0BEC5', '#8D6E63', '#5C6BC0']); b = r.pick(['#ffffff', '#ECEFF1']); c = '#C9A227'; break;
    case 'salwar': a = r.pick(KURTI); b = r.pick(['#ffffff', '#1b1a1f', '#F3E5AB', '#5D4037', ...KURTI]); c = r.pick(SARI); break;
    case 'burqa': a = r.pick(['#121114', '#18161c', '#1c1a22', '#22202a']); b = a; c = r.pick(['#121114', '#3a2f4a', '#2b3a4a']); break;
    case 'western_f': a = r.pick(TEE); b = r.pick(['#2e4a7a', '#3b5998', '#1b1a1f', '#d8cfc0']); c = r.pick(['#ffffff', '#1b1a1f']); break;
    case 'schoolgirl': a = '#ffffff'; b = r.pick(['#1E3A6E', '#5B2C6F', '#2E5E3E', '#7A1F2B']); c = '#E53935'; break;
    case 'schoolboy': a = '#ffffff'; b = r.pick(['#1E3A6E', '#4E4A45', '#2E5E3E']); c = r.pick(['#1F5FCC', '#E8413A', '#FFB627']); break;
    case 'shirt': a = r.pick(SHIRT); b = r.pick(TROUSER); c = '#1b1a1f'; break;
    case 'lungi': a = r.pick(['#ffffff', '#E9EEF5', ...SHIRT]); b = r.pick(['#1565C0', '#2E7D32', '#ffffff', '#6A1B9A', '#B71C1C', '#37474F']); c = '#ffffff'; break;
    case 'kurta_cap': a = r.pick(['#ffffff', '#F2EFE6', '#E9EEF5', '#D7E3D0']); b = a; c = '#ffffff'; break;
    case 'elder_m': a = r.pick(['#ffffff', '#F2EFE6']); b = '#ffffff'; c = '#7a5a3a'; break;
    case 'tee': a = r.pick(TEE); b = r.pick(['#2e4a7a', '#3b5998', '#1b1a1f', '#6f6a60']); c = r.pick(['#E8413A', '#1b1a1f', '#ffffff']); break;
  }
  const walk = (kid ? 1.35 : elder ? 0.85 : 1.15) * r.range(0.9, 1.15);
  return { kind, s, skin: r.pick(SKIN), hair, a, b, c, walk };
}

function tpl(): Record<string, Tpl> { return TPL; }

// legs are drawn separately for walkers so they can swing; static figures include them in the body
export function legsVisible(k: Kind) { return !['sari', 'burqa', 'elder_f', 'lungi'].includes(k); }

interface Sink { add(t: Tpl, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts?: AddOpts): void }

// Draw a figure into `sink` at (x, z) facing `ry`. When `legs` is false, leg columns are left out (walkers add their own).
// `lo` draws a light version for static crowds: low-poly parts and no small details
export function drawPerson(sink: Sink, p: PersonSpec, x: number, z: number, ry: number, legs = true, y0 = 0, lo = false) {
  const T = tpl(), s = p.s, cs = Math.cos(ry), sn = Math.sin(ry);
  const LO = new Map<Tpl, Tpl>([[T.sph, T.sphL], [T.pill, T.pillL], [T.taper, T.taperL], [T.skirt, T.skirtL], [T.cyl, T.cyl6]]);
  const put = (t: Tpl, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col: string, o: AddOpts = {}) => {
    if (lo) { if (Math.max(sx, sy, sz) < 0.09) return; t = LO.get(t) || t; }
    sink.add(t, x + lx * s * cs + lz * s * sn, y0 + ly * s, z - lx * s * sn + lz * s * cs, sx * s, sy * s, sz * s, col, { ...o, ry: ry + (o.ry || 0) });
  };
  const k = p.kind, skin = p.skin;
  const stoop = k === 'elder_m' || k === 'elder_f' ? 0.12 : 0;
  // ---- legs (static) ----
  if (legs && legsVisible(k)) for (const sx of [-1, 1]) legPart(put, p, sx);
  // ---- lower garment ----
  if (k === 'sari' || k === 'elder_f') {
    put(T.skirt, 0, 0.5, 0, 0.5, 1.0, 0.46, p.a);
    put(T.box, 0, 0.05, -0.02, 0.44, 0.06, 0.4, p.c);                      // border at the hem
    put(T.box, 0.02, 0.98, 0, 0.3, 0.06, 0.2, skin);                           // midriff
  } else if (k === 'burqa') {
    put(T.skirt, 0, 0.62, 0, 0.56, 1.24, 0.5, p.a);
  } else if (k === 'lungi') {
    put(T.skirt, 0, 0.62, 0, 0.42, 0.72, 0.38, p.b);
    for (let i = 0; i < 3; i++) put(T.box, 0, 0.4 + i * 0.22, -0.18, 0.4, 0.035, 0.02, '#ffffff');   // check lines
    for (const sx of [-1, 1]) put(T.cyl, sx * 0.08, 0.13, 0, 0.06, 0.26, 0.06, skin);
    for (const sx of [-1, 1]) put(T.box, sx * 0.08, 0.02, -0.04, 0.09, 0.04, 0.22, '#3b2a20');
  } else if (k === 'salwar') {
    put(T.skirt, 0, 0.98, 0, 0.42, 0.76, 0.34, p.a);                           // kurta flares to the knee
  } else if (k === 'kurta_cap' || k === 'elder_m') {
    put(T.skirt, 0, 1.0, 0, 0.4, 0.72, 0.32, p.a);
  } else if (k === 'schoolgirl') {
    put(T.skirt, 0, 0.84, 0, 0.42, 0.42, 0.34, p.b);
  } else if (k === 'schoolboy') {
    put(T.box, 0, 0.84, 0, 0.34, 0.24, 0.22, p.b);
  }
  // ---- torso ----
  const torsoCol = k === 'sari' || k === 'elder_f' ? p.b : k === 'burqa' ? p.a : k === 'lungi' ? p.a : p.a;
  put(T.taper, 0, 1.16 - stoop * 0.3, -stoop * 0.6, 0.2, 0.5, 0.13, torsoCol, { rx: stoop });
  if (k === 'shirt') put(T.box, 0, 0.96, 0, 0.36, 0.05, 0.24, '#2a211c');           // belt
  // ---- arms ----
  for (const sx of [-1, 1]) {
    const sleeve = k === 'sari' || k === 'elder_f' ? p.b : k === 'burqa' ? p.a : p.a;
    put(T.pill, sx * 0.23, 1.26, 0, 0.1, 0.22, 0.1, sleeve);
    put(T.pill, sx * 0.25, 0.98, 0, 0.085, 0.3, 0.085, k === 'burqa' || k === 'kurta_cap' || k === 'elder_m' ? sleeve : skin);
    put(T.sph, sx * 0.25, 0.8, 0, 0.055, 0.06, 0.055, skin);
  }
  // ---- drapes and accessories ----
  if (k === 'sari' || k === 'elder_f') {
    put(T.box, 0.05, 1.18, 0.0, 0.42, 0.62, 0.05, p.a, { rz: 0.55, ry: 0.15 });        // pallu across the chest
    put(T.box, -0.16, 1.05, 0.14, 0.2, 0.72, 0.04, p.a, { rx: -0.12 });               // pallu falling behind the shoulder
    put(T.box, -0.16, 0.7, 0.16, 0.2, 0.04, 0.045, p.c);
  }
  if (k === 'salwar') {
    put(T.box, 0, 1.36, -0.08, 0.5, 0.06, 0.06, p.c);                                 // dupatta over the chest
    for (const sx of [-1, 1]) put(T.box, sx * 0.2, 1.1, 0.1, 0.07, 0.6, 0.04, p.c, { rx: -0.1 });
  }
  if (k === 'schoolgirl' || k === 'schoolboy') put(T.box, 0, 1.15, 0.17, 0.3, 0.36, 0.14, p.c);   // school bag
  if (k === 'elder_m') { put(T.cyl, 0.32, 0.5, -0.12, 0.022, 1.0, 0.022, '#6b4a2b', { rz: -0.05 }); }
  // ---- head ----
  const hy = 1.56 - stoop * 0.5, hz = -stoop * 0.9;
  put(T.cyl, 0, hy - 0.12, hz, 0.05, 0.08, 0.05, skin);
  if (k === 'burqa') {
    put(T.sph, 0, hy, hz, 0.135, 0.15, 0.135, p.a);
    put(T.sph, 0, hy - 0.005, hz - 0.075, 0.075, 0.09, 0.06, skin);                     // face framed by the hijab
    put(T.skirt, 0, hy - 0.2, hz + 0.01, 0.3, 0.14, 0.26, p.c);                        // scarf over the shoulders
  } else {
    put(T.sph, 0, hy, hz, 0.11, 0.13, 0.115, skin);
    const female = k === 'sari' || k === 'salwar' || k === 'western_f' || k === 'schoolgirl' || k === 'elder_f';
    put(T.sph, 0, hy + 0.035, hz + 0.012, 0.118, 0.11, 0.118, p.hair);                 // hair cap
    if (female) {
      if (k === 'sari' || k === 'elder_f') put(T.sph, 0, hy + 0.0, hz + 0.13, 0.075, 0.07, 0.06, p.hair);   // bun
      else if (k === 'western_f') put(T.pill, 0, hy - 0.08, hz + 0.13, 0.07, 0.22, 0.06, p.hair);           // ponytail
      else if (k === 'schoolgirl') for (const sx of [-1, 1]) { put(T.pill, sx * 0.08, hy - 0.16, hz + 0.08, 0.05, 0.24, 0.05, p.hair); put(T.sph, sx * 0.08, hy - 0.06, hz + 0.08, 0.045, 0.03, 0.045, p.c); }
      else put(T.pill, 0, hy - 0.22, hz + 0.12, 0.06, 0.4, 0.05, p.hair);                                     // long braid
      if (k === 'sari' || k === 'salwar') put(T.sph, 0, hy + 0.035, hz - 0.11, 0.012, 0.012, 0.006, '#c62828');  // bindi
    } else {
      if (k === 'kurta_cap') { put(T.cyl, 0, hy + 0.1, hz + 0.01, 0.105, 0.06, 0.105, '#ffffff'); put(T.sph, 0, hy - 0.09, hz - 0.06, 0.07, 0.07, 0.05, p.hair); }   // cap + beard
      else if (k !== 'schoolboy') put(T.box, 0, hy - 0.035, hz - 0.108, 0.08, 0.018, 0.012, p.hair);                                                      // moustache
      if (k === 'tee' && p.c === '#E8413A') put(T.cyl, 0, hy + 0.1, hz - 0.02, 0.12, 0.04, 0.13, p.c);                                                     // cap
    }
  }
}

// one leg column (pivot at the hip, y = 0.84 * s)
function legPart(put: (t: Tpl, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col: string, o?: AddOpts) => void, p: PersonSpec, sx: number, swing = 0) {
  const T = TPL, k = p.kind;
  const pant = k === 'schoolboy' || k === 'schoolgirl' ? p.skin : k === 'salwar' ? p.b : k === 'kurta_cap' || k === 'elder_m' ? p.b : p.b;
  const ly = 0.48, lz = Math.sin(swing) * 0.2;
  put(T.pill, sx * 0.085, ly, lz, 0.14, 0.86, 0.14, pant, { rx: swing });
  put(T.box, sx * 0.085, 0.04, lz - 0.05, 0.11, 0.07, 0.24, k === 'schoolboy' || k === 'schoolgirl' ? '#1b1a1f' : '#3b2a20');
  if (k === 'schoolboy' || k === 'schoolgirl') put(T.cyl, sx * 0.085, 0.16, lz, 0.065, 0.14, 0.065, '#f1eff4');      // socks
}

// ---------- animated walkers ----------
const cache = new Map<string, { body: THREE.BufferGeometry; leg: THREE.BufferGeometry | null }>();
export function walkerGeometry(p: PersonSpec) {
  const key = JSON.stringify({ ...p, s: 1, walk: 0 });
  let g = cache.get(key);
  if (g) return g;
  const body = new Batch(); drawPerson(body, { ...p, s: 1 }, 0, 0, 0, false);
  let leg: THREE.BufferGeometry | null = null;
  if (legsVisible(p.kind)) {
    const lb = new Batch();
    // leg modelled hanging from a hip pivot at y = 0
    const put = (t: Tpl, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, col: string, o: AddOpts = {}) => lb.add(t, 0, ly - 0.84, lz, sx, sy, sz, col, o);
    legPart(put, { ...p, s: 1 }, 1);
    leg = lb.geometry();
  }
  g = { body: body.geometry(), leg };
  if (cache.size > 400) cache.clear();
  cache.set(key, g);
  return g;
}

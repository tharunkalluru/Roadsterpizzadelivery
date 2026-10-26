import { TPL } from '../core/util';
import { drawIndianFlag } from './indian_flag';
import { drawNilaChakra, drawTemplePennant, drawFurledNishanSahib, JAGANNATH_HEIGHT } from './landmark_symbols';
import type { Kit, Landmark } from './landmarks';
import { LM_DATA, LmData } from './landmarks_data';
import { drawAirportTerminal } from './airfields';
import { correctedLandmarkData } from './landmark-corrections';
import { drawMappedLandmarkPlan } from './landmark-source-plans';

// 159 additional stylised Hyderabad places; dimensions and decorative details require per-place verification: temples, mosques and dargahs,
// churches, palaces, heritage buildings, stations and bus terminals, civic buildings, hospitals, campuses, IT parks,
// malls and cinemas, parks and lakes, stadiums, the airport, statues and memorials.
// Existing anchors/footprint estimates came from OSM / Overture resolution; that is not street/photo verification.
// Per-place gaps, source confidence and review needs are recorded in docs/landmark-audit.json.
// rot is the bearing of the front; v points out of the front, u to its right.

type R = (K: Kit, D: LmData) => void;
interface Recipe { draw: R; rot?: number; clear?: number | [number, number] | [number, number, number, number]; keepBuildings?: boolean }

// ------------------------------------------------------------------------------------------------------------------
// building blocks (all in the monument's local frame; y is height above its base)
// ------------------------------------------------------------------------------------------------------------------
const W = (D: LmData, def: number) => D.w || def, Dp = (D: LmData, def: number) => D.d || def;
function addRaw(K: Kit, t: string, u: number, v: number, y: number, sx: number, sy: number, sz: number, col: string, rx = 0, ry = 0, rz = 0) {
  const [x, z] = K.P(u, v); K.k.B.st.add(TPL[t], x, K.y0 + y, z, sx, sy, sz, col, { rx, ry: K.ry0 + ry, rz });
}
// Dravidian gopuram: a tall stepped pyramid of storeys, each with a cornice and niches, a barrel-vault crown and kalashas
function gopuram(K: Kit, u: number, v: number, y: number, w: number, d: number, h: number, tiers: number, col: string, band: string, painted = false, ry = 0) {
  const base = h * 0.22; K.box(u, v, y, w, base, d, col, ry);
  K.shape('arch', u, v + Math.cos(ry) * (d / 2 + 0.05), y, w * 0.32, base * 0.85, 0.3, '#3b3330', ry);    // the doorway
  const th = (h - base) * 0.86 / tiers;
  const pal = ['#d9543c', '#2c7fb8', '#e0b23a', '#3d9b5a', '#c94f8a', '#e3e0d6'];
  for (let i = 0; i < tiers; i++) {
    const f = 1 - (i / tiers) * 0.55, ww = w * f, dd = d * (0.55 + 0.45 * f), yy = y + base + i * th;
    K.box(u, v, yy, ww, th * 0.82, dd, painted ? pal[i % pal.length] : col, ry);
    K.box(u, v, yy + th * 0.82, ww + 0.5, th * 0.18, dd + 0.5, band, ry);
    for (let k = -2; k <= 2; k++) K.box(u + Math.cos(ry) * k * ww * 0.18, v - Math.sin(ry) * k * ww * 0.18 + Math.cos(ry) * dd / 2, yy + th * 0.15, ww * 0.1, th * 0.6, 0.35, painted ? pal[(i + k + 6) % pal.length] : band, ry);
  }
  const top = y + base + tiers * th, cw = w * 0.42;
  addRaw(K, 'cyl', u, v, top + d * 0.18, d * 0.22, cw, d * 0.22, col, 0, ry, Math.PI / 2);   // barrel crown
  for (let k = -2; k <= 2; k++) K.shape('bulb', u + Math.cos(ry) * k * cw * 0.22, v - Math.sin(ry) * k * cw * 0.22, top + d * 0.36, 0.7, 1.6, 0.7, '#d6a93a', ry);
}
// a Dravidian vimana over the sanctum: square stepped storeys and a domed cupola
function vimana(K: Kit, u: number, v: number, y: number, s: number, h: number, tiers: number, col: string, cap = '#d6a93a') {
  const th = h * 0.75 / tiers;
  for (let i = 0; i < tiers; i++) { const f = 1 - (i / tiers) * 0.5; K.box(u, v, y + i * th, s * f, th * 0.85, s * f, col); K.box(u, v, y + i * th + th * 0.85, s * f + 0.3, th * 0.15, s * f + 0.3, '#b9a98c'); }
  K.shape('dome', u, v, y + tiers * th, s * 0.45, h * 0.18, s * 0.45, col); K.shape('bulb', u, v, y + tiers * th + h * 0.17, 0.5, 1.3, 0.5, cap);
}
// a north-Indian curvilinear shikhara with its amalaka and finial
function shikhara(K: Kit, u: number, v: number, y: number, r: number, h: number, col: string, flag = '#e8762b') {
  K.shape('shikhara', u, v, y, r * 2, h, r * 2, col);
  K.shape('melon', u, v, y + h * 0.97, r * 0.9, r * 0.35, r * 0.9, col);
  K.shape('bulb', u, v, y + h * 0.97 + r * 0.33, r * 0.3, r * 0.7, r * 0.3, '#d6a93a');
  K.box(u + r * 0.15, v, y + h + r * 0.9, 0.06, 2.5, 0.06, '#5b5a63'); K.box(u + r * 0.15 + 0.5, v, y + h + r * 0.9 + 2.0, 1.0, 0.5, 0.03, flag);
}
// a pillared hall: plinth, a grid of columns, flat roof with parapet
function mandapa(K: Kit, u: number, v: number, y: number, w: number, d: number, h: number, col: string, roof: string, nu = 0, nv = 0) {
  K.box(u, v, y, w + 1, 0.9, d + 1, '#cbbfa8');
  const cu = nu || Math.max(2, Math.round(w / 3.5)), cv = nv || Math.max(2, Math.round(d / 3.5));
  for (let i = 0; i < cu; i++) for (let j = 0; j < cv; j++) {
    if (i > 0 && i < cu - 1 && j > 0 && j < cv - 1) continue;
    K.box(u - w / 2 + 0.6 + (i * (w - 1.2)) / (cu - 1), v - d / 2 + 0.6 + (j * (d - 1.2)) / (cv - 1), y + 0.9, 0.55, h, 0.55, col);
  }
  K.box(u, v, y + 0.9 + h, w + 0.8, 0.7, d + 0.8, roof); K.box(u, v, y + 1.6 + h, w + 0.8, 0.6, d + 0.8, col);
  K.box(u, v, y + 0.9, w - 2, h, d - 2, '#5b4a3f');                   // shaded inner hall
}
function minaret(K: Kit, u: number, v: number, y: number, r: number, h: number, col: string, balconies = 2, cap = 'onion', capCol = col) {
  K.cyl(u, v, y, r, h, col, 'cyl8');
  for (let b = 1; b <= balconies; b++) K.cyl(u, v, y + (h * b) / (balconies + 0.4), r * 1.35, 0.5, col, 'cyl8');
  K.shape(cap, u, v, y + h, r * 2.1, r * 2.6, r * 2.1, capCol); K.box(u, v, y + h + r * 2.5, 0.08, 1.4, 0.08, '#8c7a4c');
  K.ob(u, v, r + 0.2, y + h);
}
function domeDrum(K: Kit, u: number, v: number, y: number, r: number, col: string, kind = 'dome', drum = 0.5) {
  K.cyl(u, v, y, r * 0.95, r * drum, col, 'cyl8'); K.shape(kind, u, v, y + r * drum, r * 2, r * (kind === 'onion' ? 2.3 : 1.7), r * 2, col);
  K.box(u, v, y + r * drum + r * (kind === 'onion' ? 2.25 : 1.65), 0.1, 1.2, 0.1, '#b08d57');
}
// a Qutb Shahi style mosque: prayer hall with an arcade of pointed arches, a parapet of merlons, minarets at the
// corners of the facade, optional central dome
function mosque(K: Kit, w: number, d: number, h: number, col: string, o: { arches?: number; minarets?: number; mh?: number; dome?: number; domeKind?: string; trim?: string; cap?: string } = {}) {
  const trim = o.trim || '#e8e1d0';
  K.box(0, 0, 0, w + 2, 0.8, d + 2, '#bdb3a2');
  K.box(0, 0, 0.8, w, h, d, col);
  K.arcade('arch', -w / 2 + 1, d / 2 + 0.02, w / 2 - 1, d / 2 + 0.02, o.arches || 5, 0.8, h * 0.72, 0.6, '#3d3934');
  K.box(0, d / 2 - 0.2, 0.8 + h * 0.74, w, 0.5, 0.6, trim);
  for (let i = -w / 2 + 0.8; i <= w / 2 - 0.8; i += 1.6) K.box(i, d / 2 - 0.1, 0.8 + h, 0.7, 0.9, 0.5, trim);
  const n = o.minarets ?? 2, mh = o.mh || h * 2.2;
  if (n >= 2) for (const s of [-1, 1]) minaret(K, s * (w / 2 - 0.6), d / 2 - 0.6, 0.8, Math.max(1.1, w * 0.035), mh, col, 2, o.cap || 'onion');
  if (n >= 4) for (const s of [-1, 1]) minaret(K, s * (w / 2 - 0.6), -d / 2 + 0.6, 0.8, Math.max(1, w * 0.03), mh * 0.85, col, 1, o.cap || 'onion');
  if (o.dome) domeDrum(K, 0, -d * 0.05, 0.8 + h, o.dome, col, o.domeKind || 'onion', 0.6);
  K.solidRect(0, 0, w, d, h + 0.8);
}
// a Gothic church: nave with lancet windows and a steep roof, a square tower and spire on the front
function church(K: Kit, w: number, d: number, h: number, col: string, roof: string, o: { tower?: 'centre' | 'left' | 'right' | 'twin' | 'none'; th?: number; spire?: number; trim?: string; cross?: boolean } = {}) {
  const trim = o.trim || '#efe9dc';
  // nave runs along v (front at +v): width across the front is the narrower dimension
  const nw = Math.min(w, d), nl = Math.max(w, d);
  K.box(0, 0, 0, nw, h, nl, col);
  addRaw(K, 'prism', 0, 0, h, nw + 0.6, h * 0.55, nl + 0.4, roof);
  for (let i = -nl / 2 + 3; i <= nl / 2 - 3; i += 4) for (const s of [-1, 1]) K.shape('arch', s * (nw / 2 + 0.03), i, h * 0.2, 1.4, h * 0.6, 0.12, '#384a66', Math.PI / 2);
  K.shape('arch', 0, nl / 2 + 0.03, 0, nw * 0.25, h * 0.55, 0.2, '#3b3330');
  const tw = Math.max(4, nw * 0.32), th = o.th || h * 2.2, sp = o.spire ?? th * 0.6;
  const towers = o.tower === 'twin' ? [-1, 1] : o.tower === 'left' ? [-1] : o.tower === 'right' ? [1] : o.tower === 'none' ? [] : [0];
  for (const s of towers) {
    const tu = s * (nw / 2 - tw / 2), tv = nl / 2 - tw / 2;
    K.box(tu, tv, 0, tw, th, tw, col); K.box(tu, tv, th - 0.6, tw + 0.5, 0.6, tw + 0.5, trim);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box(tu + a * tw * 0.42, tv + b * tw * 0.42, th, 0.5, 2.2, 0.5, trim);
    K.shape('arch', tu, tv + tw / 2 + 0.03, th * 0.7, tw * 0.45, th * 0.2, 0.12, '#2b2a30');
    if (sp > 0) { K.shape('cone', tu, tv, th, tw * 0.9, sp, tw * 0.9, roof); if (o.cross !== false) { K.box(tu, tv, th + sp, 0.15, 2.2, 0.15, '#e8e1d0'); K.box(tu, tv, th + sp + 1.4, 1.1, 0.15, 0.15, '#e8e1d0'); } }
    K.ob(tu, tv, tw / 2, th);
  }
  if (o.cross !== false && !towers.length) { K.box(0, nl / 2 - 1, h + h * 0.55, 0.15, 2.2, 0.15, '#e8e1d0'); K.box(0, nl / 2 - 1, h + h * 0.55 + 1.4, 1.1, 0.15, 0.15, '#e8e1d0'); }
  K.solidRect(0, 0, nw, nl, h);
}
// a colonial / Indo-European block: storeys with windows, cornice and parapet, a columned portico with pediment
function colonial(K: Kit, w: number, d: number, h: number, col: string, trim: string, o: { storeys?: number; portico?: number; cols?: number; pediment?: boolean; dome?: number; domeCol?: string; wings?: boolean; turrets?: boolean; arches?: boolean } = {}) {
  const st = o.storeys || Math.max(1, Math.round(h / 5));
  K.box(0, 0, 0, w + 1.5, 0.9, d + 1.5, '#c9c0ad');
  K.box(0, 0, 0.9, w, h, d, col);
  for (let k = 0; k < st; k++) {
    const y = 0.9 + (k + 0.25) * (h / st);
    for (let i = -w / 2 + 2.2; i <= w / 2 - 2.2; i += 3.2) K.shape(o.arches ? 'arch' : 'niche', i, d / 2 + 0.03, y, 1.3, h / st * 0.55, 0.1, '#3d4552');
    K.box(0, d / 2 - 0.2, 0.9 + (k + 1) * (h / st) - 0.35, w + 0.4, 0.35, 0.8, trim);
    // the back and the ends have plainer rows of windows
    for (let i = -w / 2 + 3; i <= w / 2 - 3; i += 4.5) K.shape('niche', i, -d / 2 - 0.03, y, 1.2, h / st * 0.5, 0.1, '#3d4552', Math.PI);
    for (let j = -d / 2 + 3; j <= d / 2 - 3; j += 4.5) for (const s of [-1, 1]) K.shape('niche', s * (w / 2 + 0.03), j, y, 1.2, h / st * 0.5, 0.1, '#3d4552', s * Math.PI / 2);
    K.box(0, 0, 0.9 + (k + 1) * (h / st) - 0.35, w + 0.3, 0.3, d + 0.3, trim);
  }
  K.box(0, 0, 0.9 + h, w + 0.8, 1.0, d + 0.8, trim);
  for (let i = -w / 2 + 0.6; i <= w / 2 - 0.6; i += 1.5) K.box(i, d / 2 + 0.1, 1.9 + h, 0.5, 0.8, 0.3, trim);
  if (o.portico) {
    const pw = o.portico, nc = o.cols || 6, pd = 5;
    K.box(0, d / 2 + pd / 2, 0, pw + 1, 1.3, pd + 1, '#d9d2c1');
    for (let i = 0; i < nc; i++) K.cyl(-pw / 2 + 0.6 + (i * (pw - 1.2)) / (nc - 1), d / 2 + pd - 0.5, 1.3, 0.42, h - 0.4, '#f4efe4', 'cyl10');
    K.box(0, d / 2 + pd / 2, 0.9 + h, pw + 0.6, 1.0, pd + 0.4, trim);
    if (o.pediment !== false) addRaw(K, 'prism', 0, d / 2 + pd - 0.4, 1.9 + h, pw + 0.6, 2.4, 0.9, trim);
    for (let i = 0; i < nc; i++) K.ob(-pw / 2 + 0.6 + (i * (pw - 1.2)) / (nc - 1), d / 2 + pd - 0.5, 0.5, h);
  }
  if (o.dome) domeDrum(K, 0, 0, 1.9 + h, o.dome, o.domeCol || trim, 'dome', 0.8);
  if (o.turrets) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { K.cyl(a * w / 2, b * d / 2, 0.9, 1.8, h + 4, col, 'cyl8'); K.shape('cone', a * w / 2, b * d / 2, h + 4.9, 4, 3.4, 4, '#7a3b2e'); }
  K.solidRect(0, 0, w, d, h + 0.9);
}
// Indo-Saracenic: colonial bones with chhatris on the corners, a central dome and pointed arcades
function indoSaracenic(K: Kit, w: number, d: number, h: number, col: string, trim: string, o: { dome?: number; chhatris?: number; towers?: number; storeys?: number; domeCol?: string } = {}) {
  colonial(K, w, d, h, col, trim, { storeys: o.storeys || 2, arches: true });
  const ch = o.chhatris ?? 4;
  if (ch >= 4) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.chhatri(a * (w / 2 - 1.5), b * (d / 2 - 1.5), h + 1.9, 3, trim);
  if (ch >= 6) for (const a of [-1, 1]) K.chhatri(a * w / 4, d / 2 - 1.5, h + 1.9, 2.6, trim);
  if (o.towers) for (const a of [-1, 1]) { K.box(a * (w / 2 - 2.5), d / 2 - 2.5, 0.9, 5, h + o.towers, 5, col); K.chhatri(a * (w / 2 - 2.5), d / 2 - 2.5, h + o.towers + 0.9, 4.2, trim); }
  if (o.dome) domeDrum(K, 0, 0, 1.9 + h, o.dome, o.domeCol || trim, 'onion', 0.7);
}
// glass and concrete tower with floor bands and a crown
function tower(K: Kit, u: number, v: number, w: number, d: number, h: number, glass: string, frame: string, o: { crown?: boolean; fins?: boolean; y?: number } = {}) {
  const y = o.y || 0;
  K.box(u, v, y, w, h, d, glass);
  for (let f = 4; f < h; f += 4) K.box(u, v, y + f, w + 0.15, 0.35, d + 0.15, frame);
  if (o.fins) for (let i = -w / 2; i <= w / 2; i += 2.4) K.box(u + i, v + d / 2 + 0.1, y, 0.25, h, 0.3, frame);
  if (o.crown) { K.box(u, v, y + h, w * 0.7, 3, d * 0.7, frame); K.box(u, v, y + h + 3, w * 0.3, 2, d * 0.3, glass); }
  K.solidRect(u, v, w, d, y + h);
}
function clockTower(K: Kit, u: number, v: number, s: number, h: number, col: string, trim: string, cap = 'dome') {
  K.box(u, v, 0, s + 1, 1, s + 1, '#bdb3a2'); K.box(u, v, 1, s, h, s, col);
  for (let y = h * 0.3; y < h; y += h * 0.3) K.box(u, v, y, s + 0.4, 0.35, s + 0.4, trim);
  for (const [a, b, r] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]] as [number, number, number][]) {
    K.shape('cyl', u + a * (s / 2 + 0.06), v + b * (s / 2 + 0.06), h * 0.82, s * 0.32, 0.1, s * 0.32, '#f6f1e2', r, 'st', Math.PI / 2);
  }
  K.box(u, v, h + 1, s + 0.6, 0.6, s + 0.6, trim); K.shape(cap, u, v, h + 1.6, s * 0.9, s * 1.1, s * 0.9, trim);
  K.solidRect(u, v, s, s, h + 1);
}
// a campus or park gate: two towers joined by an arch beam, the name on the beam
function gate(K: Kit, u: number, v: number, span: number, h: number, col: string, trim: string, name: string, ry = 0) {
  const cu = Math.cos(ry), cv = -Math.sin(ry);
  for (const s of [-1, 1]) { const pu = u + cu * s * span / 2, pv = v + cv * s * span / 2; K.box(pu, pv, 0, 2.4, h, 2.4, col, ry); K.shape('dome', pu, pv, h, 2.4, 1.6, 2.4, trim, ry); K.ob(pu, pv, 1.4, h); }
  K.box(u, v, h - 2.2, span, 2.2, 1.6, trim, ry);
  K.board(name, u, v + Math.cos(ry) * 0.85, h - 0.4, Math.min(span - 1.6, 14), 1.1, '#2f3a4a', '#ffffff', ry);
}
function statue(K: Kit, u: number, v: number, h: number, base: number, col: string, plinth = '#cfc7b8') {
  K.box(u, v, 0, base * 1.6, base, base * 1.6, plinth); K.box(u, v, base, base * 1.1, base * 0.5, base * 1.1, plinth);
  K.shape('robe', u, v, base * 1.5, h * 0.32, h * 0.62, h * 0.24, col);
  K.sph(u, v, base * 1.5 + h * 0.7, h * 0.09, col); K.solidRect(u, v, base * 1.6, base * 1.6, base * 1.5);
}
function stadiumBowl(K: Kit, ru: number, rv: number, h: number, col: string, seats: string, roofCol: string, roofArc = 0.5) {
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2, am = (a0 + a1) / 2;
    const u = Math.cos(am) * ru, v = Math.sin(am) * rv, L = Math.hypot(Math.cos(a1) * ru - Math.cos(a0) * ru, Math.sin(a1) * rv - Math.sin(a0) * rv);
    const ry = Math.atan2(-(Math.sin(a1) * rv - Math.sin(a0) * rv), Math.cos(a1) * ru - Math.cos(a0) * ru);
    K.box(u, v, 0, L + 0.3, h, 3, col, ry);
    K.box(u * 0.93, v * 0.93, h * 0.25, L, h * 0.6, 8, seats, ry, 'st');
    if (i / 40 < roofArc) K.box(u * 0.9, v * 0.9, h + 1.5, L + 0.5, 0.5, 16, roofCol, ry);
    K.solidRect(u, v, L, 3, h);
  }
  K.box(0, 0, 0, ru * 1.6, 0.06, rv * 1.6, '#5f9a45');
}
function nameAt(K: Kit, D: LmData, dist: number, y = 3.2, text = D.name) { K.board(text, 0, dist, y, Math.min(16, 3 + text.length * 0.36), 0.9); }
const front = (D: LmData, def: number) => Dp(D, def) / 2;

// ------------------------------------------------------------------------------------------------------------------
// the places
// ------------------------------------------------------------------------------------------------------------------
const STONE = '#d8c8a8', WHITE = '#f1eee6', CREAM = '#ecdcb8', SAND = '#d9b98c', GRANITE = '#8f877c';
const R_: Record<string, Recipe> = {
  // ---- temples ----
  // Owner reference:72 ft, east-facing; dated2017/2021 photos show a ribbed rekha deul, stepped pidha roofs
  // and separate eight-spoke Nilachakra finials. Fine carvings and festive flag details remain approximate.
  jagannath: { draw: (K) => {
    const S = '#c58f69', trim = '#b47e59';
    K.box(0, 0, 0, 26, 1.2, 40, '#b9a38a');
    K.shape('shikhara', 0, -6, 1.2, 12, 16.4, 12, S);
    // Horizontal stone courses follow the existing curved tower rather than a smooth generic cone.
    for (let i = 0; i < 24; i++) {
      const t = (i + .5) / 24, f = t < .32 ? 1 - .05 * t / .32 : t < .56 ? .95 - .15 * (t-.32)/.24 : t < .78 ? .8 - .36*(t-.56)/.22 : .44 - .24*(t-.78)/.22;
      K.box(0, -6, 1.3 + t * 16.2, 12 * f + .18, .16, 12 * f + .18, trim);
    }
    K.shape('melon', 0, -6, 17.5, 5.5, 1.4, 5.5, S);
    K.shape('bulb', 0, -6, 18.9, 1.6, 1.35, 1.6, S);
    K.box(0, -6, 20.1, .11, JAGANNATH_HEIGHT - 20.1, .11, '#76634b');
    drawNilaChakra(K, 0, -6, JAGANNATH_HEIGHT - .85, .85);
    K.box(0,-6,JAGANNATH_HEIGHT-.1,.06,1.5,.06,'#76634b');
    drawTemplePennant(K,0,-6,JAGANNATH_HEIGHT+1.3,1.5,.6,'#b94d40');
    drawTemplePennant(K,0,-6,JAGANNATH_HEIGHT+.65,1.2,.5,'#d4b839');
    // Jagamohana: layered pidha roof, as documented by the temple trust and visible in both photographs.
    K.box(0, 6, 1.2, 11, 7, 11, S);
    K.box(0,11.56,1.2,3.2,4.4,.06,'#493d33'); K.box(0,11.62,5.6,3.8,.3,.12,trim);
    for(const side of [-1,1]) K.box(side*1.85,11.6,1.2,.3,4.7,.18,trim);
    for (let i=0;i<8;i++) { const w=12-i*1.08, y=8.2+i*.72; K.box(0,6,y,w,.6,w,S); K.box(0,6,y+.6,w+.3,.12,w+.3,trim); }
    K.shape('melon',0,6,14,4.1,1.1,4.1,S); K.shape('bulb',0,6,15.1,1.3,1.0,1.3,S);
    drawNilaChakra(K,0,6,16.7,.6); K.box(0,6,17,.06,1.5,.06,'#76634b'); drawTemplePennant(K,0,6,18.4,1.1,.5,'#b94d40');
    for (const z of [10, 13.5, 17]) K.box(0, z, 1.2, 5, .5, 2.5, '#b9a38a');
    for (const side of [-1, 1]) { K.shape('shikhara', side * 9, -10, 1.2, 4, 7, 4, S); }
    K.solidRect(0, -6, 12, 12, 17.6); K.solidRect(0, 6, 11, 11, 8.2); nameAt(K, { name: 'Sri Jagannath Temple' } as any, 19.5, 3);
  }, rot: 90, clear: [34, 46] },
  // Peddamma Temple, Jubilee Hills: big painted rajagopuram on Road No. 36 and the shrine behind
  peddamma: { draw: (K, D) => { gopuram(K, 0, front(D, 27) - 4, 0, 14, 9, 26, 7, WHITE, '#d8a34a', true); mandapa(K, 0, -4, 0, 18, 16, 4.5, WHITE, '#c98b3a'); vimana(K, 0, -10, 0, 6, 11, 4, '#e7c66b'); K.solidRect(0, front(D, 27) - 4, 14, 9, 26); nameAt(K, { name: 'Sri Peddamma Thalli Temple' } as any, front(D, 27) + 2, 3); }, clear: [64, 34] },
  balkampet: { draw: (K) => { gopuram(K, 0, 6, 0, 9, 6, 15, 5, WHITE, '#c8432b', true); mandapa(K, 0, -2, 0, 14, 10, 4, '#f3e3b6', '#c8432b'); vimana(K, 0, -8, 0, 5, 8, 3, '#e9c24e'); nameAt(K, { name: 'Balkampet Yellamma Temple' } as any, 9.5, 3); }, clear: [30, 26] },
  // Chilkur Balaji: old temple with a white gopuram and a stone mandapa among trees
  chilkur: { draw: (K) => { gopuram(K, 0, 14, 0, 10, 7, 17, 5, WHITE, '#bfa37a'); mandapa(K, 0, 0, 0, 22, 18, 4, STONE, '#b5a07c'); vimana(K, 0, -10, 0, 7, 12, 4, WHITE); nameAt(K, { name: 'Chilkur Balaji Temple' } as any, 18.5, 3); }, clear: [58, 40] },
  // Sanghi Temple: on Paramananda Giri hill, a tall white Chola-style rajagopuram over a temple complex
  sanghi: { draw: (K) => { K.hill(0, 0, 70, 60, 18, '#8C7E6A', '#6B7F4A', 41); K.y0 = 18; gopuram(K, 0, 20, 0, 16, 11, 36, 9, WHITE, '#d9b25a'); mandapa(K, 0, 0, 0, 26, 18, 5, WHITE, '#d9b25a'); for (const s of [-1, 1]) vimana(K, s * 12, -12, 0, 7, 13, 4, WHITE); vimana(K, 0, -14, 0, 8, 16, 5, WHITE); K.solidRect(0, 20, 16, 11, 36); K.y0 = 0; nameAt(K, { name: 'Sanghi Temple' } as any, 75, 3); }, clear: [150, 130] },
  karmanghat: { draw: (K) => { gopuram(K, 0, 8, 0, 10, 7, 18, 5, WHITE, '#d0662e', true); mandapa(K, 0, -3, 0, 16, 12, 4, '#f1d9a4', '#d0662e'); vimana(K, 0, -10, 0, 6, 10, 4, '#e8b94a'); nameAt(K, { name: 'Karmanghat Hanuman Temple' } as any, 12, 3); }, clear: [30, 30] },
  ujjaini: { draw: (K, D) => { gopuram(K, 0, 4, 0, Math.min(14, W(D, 20) * 0.7), 6, 16, 5, '#f0e2c4', '#c7372d', true); mandapa(K, 0, -4, 0, 14, 8, 4, '#f6e0b0', '#c7372d'); nameAt(K, { name: 'Ujjaini Mahankali Temple' } as any, 7.5, 3); }, clear: [24, 18] },
  laldarwaza: { draw: (K) => { gopuram(K, 0, 5, 0, 9, 6, 14, 4, '#f2e6c8', '#cf3b2b', true); mandapa(K, 0, -3, 0, 12, 9, 4, '#f6e0b0', '#cf3b2b'); nameAt(K, { name: 'Lal Darwaza Mahankali Temple' } as any, 8.5, 3); }, clear: [22, 22] },
  // Bhagyalakshmi: the small shrine against the south-east minaret of Charminar
  bhagyalakshmi: { draw: (K) => { K.box(0, 0, 0, 4.4, 3.2, 4, '#f3eee2'); K.box(0, 0, 3.2, 4.8, 0.4, 4.4, '#d6a93a'); K.shape('dome', 0, 0, 3.6, 2.6, 1.6, 2.6, '#f3eee2'); K.box(0, 2.1, 0, 4.6, 2.8, 0.3, '#e2a63a'); for (let i = -2; i <= 2; i++) K.box(i * 0.9, 2.4, 2.5, 0.12, 0.8, 0.12, '#e8762b'); }, clear: 0, keepBuildings: true },
  // ISKCON Abids: white temple with three Odisha-style towers and saffron flags
  iskcon_abids: { draw: (K, D) => { K.box(0, 0, 0, W(D, 25), 9, Dp(D, 16), WHITE); for (const s of [-1, 0, 1]) shikhara(K, s * 7, -1, 9, s === 0 ? 3.4 : 2.6, s === 0 ? 11 : 8, '#f4ede0', '#ef8a1f'); K.arcade('arch', -9, front(D, 16) + 0.03, 9, front(D, 16) + 0.03, 5, 0, 6, 0.3, '#7a4a2a'); nameAt(K, { name: 'ISKCON Hare Krishna Temple' } as any, front(D, 16) + 1.5, 7.6); K.solidRect(0, 0, W(D, 25), Dp(D, 16), 9); }, clear: [32, 24] },
  // Keesaragutta: Ramalingeswara temple on a hillock with a gopuram
  keesaragutta: { draw: (K) => { K.hill(0, 0, 45, 40, 12, '#8C7E6A', '#6B7F4A', 52); K.y0 = 12; gopuram(K, 0, 12, 0, 10, 7, 18, 5, WHITE, '#c9a04a'); mandapa(K, 0, 0, 0, 16, 12, 4, STONE, '#b49a6a'); vimana(K, 0, -8, 0, 6, 10, 4, WHITE); K.y0 = 0; nameAt(K, { name: 'Keesaragutta Temple' } as any, 46, 3); }, clear: [96, 86] },
  ramalayam: { draw: (K) => { gopuram(K, 0, 10, 0, 10, 7, 16, 5, STONE, '#a98f68'); mandapa(K, 0, -2, 0, 20, 16, 4, STONE, '#a98f68'); vimana(K, 0, -12, 0, 6, 9, 3, STONE); nameAt(K, { name: 'Seetharambagh Temple' } as any, 14, 3); }, clear: [34, 38] },
  ashtalakshmi: { draw: (K) => { K.box(0, 0, 0, 22, 1.2, 22, '#cfc3ad'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; vimana(K, Math.cos(a) * 7, Math.sin(a) * 7, 1.2, 3.2, 7, 3, '#f3e2ac', '#d6a93a'); } vimana(K, 0, 0, 1.2, 7, 18, 5, '#f6e7b8'); nameAt(K, { name: 'Ashtalakshmi Temple' } as any, 13, 3); K.solidCircle(0, 0, 10, 4); }, clear: 18 },
  venkateswara_jh: { draw: (K) => { gopuram(K, 0, 10, 0, 12, 8, 22, 6, WHITE, '#d8b24c'); mandapa(K, 0, -2, 0, 18, 14, 4.5, '#f3ead6', '#c79a3c'); vimana(K, 0, -11, 0, 7, 12, 4, '#e6be4c'); nameAt(K, { name: 'Sri Venkateswara Temple (TTD)' } as any, 14.5, 3); }, clear: [34, 38] },
  // Hare Krishna Golden Temple, Banjara Hills: hilltop temple with a gilded vimana
  hare_krishna: { draw: (K) => { K.hill(0, 0, 30, 30, 8, '#8C7E6A', '#6B7F4A', 63); K.y0 = 8; mandapa(K, 0, 4, 0, 16, 10, 4, '#f2e4c4', '#c9952f'); vimana(K, 0, -5, 0, 8, 16, 5, '#d4a42c', '#f1cf5a'); K.y0 = 0; nameAt(K, { name: 'Hare Krishna Golden Temple' } as any, 31, 3); }, clear: [64, 64] },
  ganesh_khairatabad: { draw: (K, D) => { K.box(0, 0, 0, W(D, 26), 0.6, Dp(D, 10) + 6, '#b8b0a0'); K.box(0, -2, 0.6, 14, 10, 6, '#e7c35a'); K.shape('dome', 0, -2, 10.6, 8, 4, 5, '#e88a2a'); K.board('KHAIRATABAD GANESH', 0, 2, 9.5, 12, 1.2, '#d9472b', '#fff7d6'); }, clear: [30, 18] },
  // Statue of Equality, Muchintal: 66 m seated Ramanuja in panchaloha gold on a lotus over a three-storey base
  chinna_jeeyar: { draw: (K) => {
    K.box(0, 0, 0, 120, 0.8, 120, '#d6cdbd'); K.box(0, 0, 0.8, 70, 16, 70, '#e9dfc9'); K.box(0, 0, 16.8, 54, 4, 54, '#d8b35c');
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; K.shape('bulb', Math.cos(a) * 21, Math.sin(a) * 21, 20.8, 8, 6, 8, '#e7bb46'); }
    // the seated figure: crossed legs, robed torso, folded hands, head with the tall namam, the staff at his side
    const G = '#d9a93a', G2 = '#c8962c', f = 1.4, Y = (y: number) => 24.5 + (y - 24.5) * f;
    K.shape('dome', 0, 1 * f, Y(24.5), 26 * f, 6.5 * f, 20 * f, G2);                       // the lap and crossed legs
    K.box(0, 3 * f, Y(24.5), 24 * f, 2.4 * f, 14 * f, G2);
    K.shape('robe', 0, -1.5 * f, Y(27), 15 * f, 17 * f, 11 * f, G);                        // torso under the robe
    K.shape('dome', 0, -1.5 * f, Y(42.5), 15.5 * f, 4.5 * f, 11 * f, G);                   // shoulders
    for (const s of [-1, 1]) K.box(s * 6.2 * f, 1.5 * f, Y(31), 3 * f, 11 * f, 3.5 * f, G2, s * 0.25);   // upper arms
    K.box(0, 4.5 * f, Y(34.5), 3.2 * f, 5.5 * f, 2.2 * f, G);                              // hands folded in anjali
    K.cyl(0, -1.5 * f, Y(44.5), 2.4 * f, 2.6 * f, G, 'cyl10');                              // neck
    K.sph(0, -1.2 * f, Y(50.5), 4.4 * f, G, 0, 5 * f);                                     // head
    K.box(0, 3.2 * f, Y(50.5), 0.9 * f, 3.2 * f, 0.2 * f, '#f4efe4');                       // the namam
    K.box(11 * f, 2 * f, Y(24.5), 0.8 * f, 34 * f, 0.8 * f, G2); K.shape('cone', 11 * f, 2 * f, Y(58.5), 2.4 * f, 3 * f, 2.4 * f, G2);   // the tridanda
    for (let k = 0; k < 108; k += 4) { const a = (k / 108) * Math.PI * 2; K.box(Math.cos(a) * 52, Math.sin(a) * 52, 0.8, 4, 6, 4, '#efe4cc'); }
    K.solidRect(0, 0, 70, 70, 16.8); nameAt(K, { name: 'Statue of Equality' } as any, 62, 3);
  }, clear: 75 },
  akkanna: { draw: (K) => { K.box(0, 0, 0, 10, 6, 8, '#f2e6c8'); K.box(0, 4.2, 0, 10.5, 4.5, 0.4, '#d34a2c'); vimana(K, 0, -1, 6, 4, 6, 2, '#e9c24e'); }, clear: [12, 10] },
  jain_mandir: { draw: (K, D) => { K.box(0, 0, 0, W(D, 18), 8, Dp(D, 10), '#f5efe3'); shikhara(K, 0, -1, 8, 2.8, 9, '#f5efe3', '#e2382d'); for (const s of [-1, 1]) K.shape('dome', s * 6, 2, 8, 3, 2.2, 3, '#f5efe3'); K.arcade('arch', -6, front(D, 10) + 0.02, 6, front(D, 10) + 0.02, 3, 0, 5.5, 0.3, '#8a6a4a'); nameAt(K, { name: 'Jain Mandir' } as any, front(D, 10) + 1.5, 7); }, clear: [22, 16] },
  // Dated exterior photograph2025-10-14: entrance stairs, stacked three-arch white pavilions, shallow gold domes.
  // Flag cloth is furled in this view, so its specific emblem/color is not inferred from the photograph.
  gurudwara: { draw: (K) => {
    const gold='#d4b44b', W=WHITE;
    K.box(0,0,0,20,8,16,'#ab9480'); K.shape('archRound',0,8.05,2.0,9,5.5,.3,'#453d36');
    for(let i=0;i<9;i++) K.box(0,12.5-i*.5,i*.23,7,.23,.6,'#c3b5a1');
    // Open gallery bays must stay visibly open; a solid core behind the arcade would fill every arch.
    K.box(0,-6.5,8,17,6,1.5,W); for(const side of [-1,1]) K.box(side*8,-1,8,1,6,13,W);
    K.box(0,-4,14,11,3,6,W);
    for (const [y,w,v] of [[8,13,6.0],[17,11,-1.8]]) {
      K.arcade('archRound',-w/2,v,w/2,v,3,y,4.2,.55,W);
      K.box(0,v-1,y+4.2,w+1,.6,3,W); K.shape('melon',0,v-1,y+4.8,w*.94,2.7,w*.68,gold);
      K.cyl(0,v-1,y+7.4,.09,1.3,'#b0a58a');
    }
    for (const [u,v,y] of [[-8,6.5,8],[8,6.5,8],[-7,-2,18],[7,-2,18]]) {
      for(const a of [-1,1]) for(const b of [-1,1]) K.box(u+a*.8,v+b*.8,y,.22,3,.22,W);
      K.box(u,v,y+3,2.5,.4,2.5,W); K.shape('melon',u,v,y+3.4,2.6,1.8,2.6,gold); K.cyl(u,v,y+5.2,.06,.9,'#b0a58a');
    }
    drawFurledNishanSahib(K,13,6,18);
    nameAt(K,{name:'Central Gurudwara Saheb'} as any,9.5,6.5); K.solidRect(0,0,20,16,8); K.solidRect(0,-1,17,13,14);
  }, clear: [26,20] },
  // ---- mosques and dargahs ----
  // Spanish Mosque (Masjid Iqbal ud-Daula), Begumpet, 1906: Moorish, grey, a cluster of octagonal spires over the hall
  spanish: { draw: (K, D) => {
    const G = '#c9c3b6', w = W(D, 34) * 0.8, d = Dp(D, 23) * 0.8;
    K.box(0, 0, 0, w, 9, d, G); K.arcade('arch', -w / 2 + 1, d / 2 + 0.03, w / 2 - 1, d / 2 + 0.03, 7, 0, 6.5, 0.3, '#3d3934');
    for (const [u, v, h] of [[0, -2, 14], [-6, -4, 10], [6, -4, 10], [-6, 3, 9], [6, 3, 9]]) { K.cyl(u, v, 9, 1.5, h - 9 + 4, G, 'cyl8'); K.shape('cone', u, v, h + 4, 3.4, 7, 3.4, '#7c776e'); }
    for (const s of [-1, 1]) { K.cyl(s * (w / 2), d / 2, 0, 1.4, 20, G, 'cyl8'); K.shape('cone', s * (w / 2), d / 2, 20, 3.2, 6, 3.2, '#7c776e'); K.ob(s * w / 2, d / 2, 1.5, 20); }
    K.solidRect(0, 0, w, d, 9); nameAt(K, { name: 'Spanish Mosque' } as any, d / 2 + 2.5, 3);
  }, clear: [40, 30] },
  // Toli Masjid (1671): five-arched facade, two minarets with bulbous domes, ornate stucco
  toli: { draw: (K) => { mosque(K, 22, 14, 9, '#d6c7a6', { arches: 5, minarets: 2, mh: 21, trim: '#ece2c8' }); nameAt(K, { name: 'Toli Masjid' } as any, 10, 3); }, clear: [28, 22] },
  khairatabad_mosque: { draw: (K) => { mosque(K, 26, 16, 9, '#e8e0cf', { arches: 5, minarets: 2, mh: 22, trim: '#f3eee3' }); }, clear: [32, 24] },
  // Jama Masjid near Charminar (1597): small Qutb Shahi mosque with three arches and two minarets
  jama_masjid: { draw: (K) => { mosque(K, 18, 12, 7.5, '#d9cfb7', { arches: 3, minarets: 2, mh: 17 }); }, clear: [22, 18] },
  // Moula Ali Dargah: on a granite hill reached by ~500 steps, a small domed dargah on top
  moula_ali: { draw: (K) => { K.hill(0, 0, 55, 55, 36, '#8a8172', '#6c7a4a', 71); K.y0 = 36; K.box(0, 0, 0, 12, 7, 12, WHITE); domeDrum(K, 0, 0, 7, 4.5, WHITE, 'onion', 0.4); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) minaret(K, a * 6, b * 6, 0, 0.6, 9, WHITE, 1); K.y0 = 0; for (let k = 0; k < 30; k++) K.box(0, 58 - k * 1.6, (k / 30) * 34, 3, 0.4, 1.6, '#d9d1c3'); nameAt(K, { name: 'Moula Ali Dargah' } as any, 60, 3); }, clear: 60 },
  pahadi: { draw: (K) => { K.hill(0, 0, 60, 50, 22, '#8a8172', '#6c7a4a', 81); K.y0 = 22; K.box(0, 0, 0, 18, 8, 18, '#f3efe6'); domeDrum(K, 0, 0, 8, 5, '#3f9a5a', 'onion', 0.4); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) minaret(K, a * 9, b * 9, 0, 0.7, 12, '#f3efe6', 1); K.y0 = 0; nameAt(K, { name: 'Pahadi Shareef Dargah' } as any, 55, 3); }, clear: 62 },
  yousufain: { draw: (K) => { K.box(0, 0, 0, 16, 7, 16, '#f2efe8'); domeDrum(K, 0, 0, 7, 5, '#3c8c56', 'onion', 0.4); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) minaret(K, a * 8, b * 8, 0, 0.7, 12, '#f2efe8', 1); nameAt(K, { name: 'Yousufain Dargah' } as any, 10, 3); K.solidRect(0, 0, 16, 16, 7); }, clear: [22, 22] },
  // Hayat Bakshi Begum mosque (Hayathnagar, 1672): Qutb Shahi mosque with five arches and two tall minarets
  shah_hatim: { draw: (K) => { mosque(K, 30, 18, 11, '#cdbf9f', { arches: 5, minarets: 2, mh: 28 }); }, clear: [36, 26] },
  masjid_e_aam: { draw: (K) => { mosque(K, 40, 24, 10, '#e3dccb', { arches: 7, minarets: 2, mh: 26, dome: 5, domeKind: 'onion' }); }, clear: [48, 34] },
  // ---- churches ----
  // St Joseph's Cathedral, Gun Foundry (1869-1891): Italian style, twin bell towers flanking the front
  st_joseph: { draw: (K, D) => { church(K, W(D, 32), Dp(D, 26), 12, '#efe3c8', '#b8452f', { tower: 'twin', th: 28, spire: 4, trim: '#ffffff' }); nameAt(K, { name: "St Joseph's Cathedral" } as any, Math.max(W(D, 32), Dp(D, 26)) / 2 + 3, 3); }, clear: [40, 40] },
  st_george: { draw: (K, D) => { church(K, W(D, 27), Dp(D, 18), 10, '#d9d1c0', '#5b5f6b', { tower: 'centre', th: 22, spire: 10 }); }, clear: [34, 30] },
  // St Mary's Basilica, Secunderabad (1850): Gothic, tall twin-spired front
  st_mary: { draw: (K, D) => { church(K, W(D, 56), Dp(D, 26), 15, '#e9e3d6', '#6a5d52', { tower: 'twin', th: 32, spire: 14 }); nameAt(K, { name: "St Mary's Basilica" } as any, W(D, 56) / 2 + 3, 3); }, clear: [64, 36] },
  wesley: { draw: (K) => { church(K, 30, 16, 10, '#b5523d', '#4f4a46', { tower: 'centre', th: 24, spire: 12, trim: '#e6dcc8' }); }, clear: [36, 24] },
  holy_trinity: { draw: (K) => { church(K, 30, 14, 8, '#e3dccd', '#6b6158', { tower: 'centre', th: 18, spire: 0, trim: '#ffffff' }); }, clear: [36, 22] },
  all_saints: { draw: (K, D) => { church(K, W(D, 40), Dp(D, 16), 9, '#dad4c6', '#6a6057', { tower: 'centre', th: 20, spire: 9 }); }, clear: [46, 24] },
  methodist: { draw: (K, D) => { church(K, W(D, 50), Dp(D, 25), 11, '#c76f4f', '#5a4d44', { tower: 'right', th: 26, spire: 10, trim: '#efe7d6' }); }, clear: [56, 32] },
  // ---- palaces and heritage ----
  // King Kothi (Nazri Bagh), the seventh Nizam's palace: European style, pale yellow, with the 'KH' monograms
  king_kothi: { draw: (K) => { colonial(K, 70, 32, 13, '#e9d9a8', '#ffffff', { storeys: 2, portico: 22, cols: 8, arches: true }); K.board('KING KOTHI PALACE', 0, 21.5, 4, 12); }, clear: [80, 50] },
  purani_haveli: { draw: (K) => { colonial(K, 110, 22, 11, '#e7d7ad', '#ffffff', { storeys: 2, arches: true }); for (const s of [-1, 1]) K.box(s * 50, -30, 0, 12, 11, 60, '#e7d7ad'); K.board("NIZAM'S MUSEUM · PURANI HAVELI", 0, 12.5, 3.5, 15); }, clear: [130, 90] },
  // Errum Manzil (1870): Indo-European palace on a hillock, pink and white
  errum_manzil: { draw: (K, D) => { K.hill(0, 0, 70, 60, 6, '#8a8172', '#6c7a4a', 91); K.y0 = 6; colonial(K, W(D, 110) * 0.7, Dp(D, 90) * 0.5, 12, '#d79a8d', '#f4ece2', { storeys: 2, portico: 24, cols: 8, arches: true }); K.y0 = 0; }, clear: [120, 110] },
  // Bella Vista (ASCI): white European palace with Ionic columns
  bella_vista: { draw: (K, D) => { colonial(K, W(D, 100) * 0.8, Dp(D, 28), 11, '#f2efe8', '#ffffff', { storeys: 2, portico: 20, cols: 6 }); }, clear: [96, 40] },
  // Hill Fort Palace (1915): Gothic castle-like building on Naubat Pahad's neighbour, turrets with conical roofs
  hill_fort: { draw: (K) => { K.hill(0, 0, 60, 50, 10, '#8a8172', '#6c7a4a', 33); K.y0 = 10; colonial(K, 46, 26, 13, '#d9c7a6', '#efe6d2', { storeys: 2, turrets: true, arches: true }); K.y0 = 0; nameAt(K, { name: 'Hill Fort Palace' } as any, 52, 3); }, clear: [120, 100] },
  raj_bhavan: { draw: (K, D) => { colonial(K, W(D, 90) * 0.8, Dp(D, 49) * 0.7, 11, '#f4efe6', '#ffffff', { storeys: 2, portico: 18, cols: 6, dome: 5, domeCol: '#e9e2d3' }); K.board('RAJ BHAVAN', 0, Dp(D, 49) * 0.35 + 7, 4, 8); }, clear: [96, 56] },
  // British Residency (Koti, 1803): Palladian mansion with a huge Corinthian portico, yellow with white columns
  residency: { draw: (K, D) => { colonial(K, Math.min(W(D, 144), 80), 34, 18, '#e8c35a', '#fbf6ea', { storeys: 2, portico: 34, cols: 6 }); for (const s of [-1, 1]) K.box(s * 50, 0, 0, 22, 10, 26, '#e8c35a'); K.board('BRITISH RESIDENCY', 0, 22.6, 5, 12); }, clear: [150, 56] },
  // Jubilee Hall, Public Gardens (1913): Indo-Saracenic with a central dome and corner chhatris (now the Legislative Council)
  jubilee_hall: { draw: (K, D) => { indoSaracenic(K, W(D, 100) * 0.8, Dp(D, 58) * 0.6, 12, '#ece2cc', '#fbf6ea', { dome: 6, chhatris: 6 }); K.board('JUBILEE HALL · LEGISLATIVE COUNCIL', 0, Dp(D, 58) * 0.3 + 2, 4, 15); }, clear: [104, 62] },
  archaeology_museum: { draw: (K, D) => { indoSaracenic(K, W(D, 68), Dp(D, 27), 12, '#f0e6cc', '#ffffff', { dome: 5.5, chhatris: 4 }); nameAt(K, { name: 'State Archaeology Museum' } as any, Dp(D, 27) / 2 + 2, 3.2); }, clear: [74, 34] },
  // State Central Library, Afzal Gunj (1891): Indo-Saracenic, red-ochre and cream with a central dome
  state_library: { draw: (K, D) => { indoSaracenic(K, W(D, 72), Dp(D, 45) * 0.7, 13, '#c98a5c', '#f2e7d0', { dome: 7, chhatris: 6 }); nameAt(K, { name: 'State Central Library' } as any, Dp(D, 45) * 0.35 + 2, 3.2); }, clear: [78, 50] },
  city_college: { draw: (K, D) => { indoSaracenic(K, W(D, 85), Dp(D, 75) * 0.45, 12, '#e3d3ad', '#ffffff', { dome: 6, towers: 8, chhatris: 4 }); nameAt(K, { name: 'Government City College' } as any, Dp(D, 75) * 0.23 + 2, 3.2); }, clear: [92, 80] },
  // Moazzam Jahi Market (1935): granite market square with arcades and a clock tower over the corner entrance
  mozamjahi: { draw: (K, D) => { const w = W(D, 100) * 0.8, d = Dp(D, 76) * 0.8; K.wall(-w / 2, d / 2, w / 2, d / 2, 0, 7, 5, GRANITE, true, false); K.wall(-w / 2, -d / 2, w / 2, -d / 2, 0, 7, 5, GRANITE, true, false); K.wall(-w / 2, -d / 2, -w / 2, d / 2, 0, 7, 5, GRANITE, true, false); K.wall(w / 2, -d / 2, w / 2, d / 2, 0, 7, 5, GRANITE, true, false); K.arcade('arch', -w / 2, d / 2 + 2.55, w / 2, d / 2 + 2.55, 12, 0, 5, 0.4, '#3b3833'); clockTower(K, w / 2 - 3, d / 2 - 3, 7, 22, GRANITE, '#b5ad9f', 'dome'); nameAt(K, { name: 'Moazzam Jahi Market' } as any, d / 2 + 3.2, 7.6); }, clear: [110, 90] },
  mahboob_chowk: { draw: (K) => { clockTower(K, 0, 0, 7, 22, '#e6d8b8', '#f6efe0', 'onion'); }, clear: [12, 12] },
  sultan_bazar_clock: { draw: (K) => { clockTower(K, 0, 0, 5, 18, '#d9c49c', '#efe3c9', 'dome'); }, clear: [9, 9] },
  fatehmaidan_clock: { draw: (K) => { clockTower(K, 0, 0, 5, 20, '#e3d6bb', '#f7f1e3', 'dome'); }, clear: [9, 9] },
  monda_market: { draw: (K, D) => { mandapa(K, 0, 0, 0, W(D, 40) + 20, Dp(D, 20) + 10, 5, '#9a8f80', '#7f8790', 10, 5); nameAt(K, { name: 'Monda Market' } as any, (Dp(D, 20) + 10) / 2 + 2, 6.5); }, clear: [64, 34] },
  // Badshahi Ashurkhana (1594): the Qutb Shahi royal hall of mourning, tile-mosaic facade under a pointed arch
  badshahi_ashurkhana: { draw: (K) => { K.box(0, 0, 0, 20, 12, 14, '#c9b48c'); K.shape('archBig', 0, 7.05, 0, 12, 11, 0.4, '#2c6a8a'); K.box(0, 7.2, 10.5, 20, 1.2, 0.5, '#e0cfae'); nameAt(K, { name: 'Badshahi Ashurkhana' } as any, 9, 3); K.solidRect(0, 0, 20, 14, 12); }, clear: [24, 18] },
  // Purana Pul (1578): the oldest bridge over the Musi, 22 arches, with the Purana Pul Darwaza at its end
  purana_pul: { draw: (K) => { K.box(0, 0, 0, 14, 12, 8, '#a59985'); K.shape('archBig', 0, 4.05, 0, 9, 10, 0.4, '#3a3530'); for (const s of [-1, 1]) { K.cyl(s * 6, 0, 0, 1.4, 15, '#a59985', 'cyl8'); K.shape('dome', s * 6, 0, 15, 2.8, 2, 2.8, '#a59985'); } nameAt(K, { name: 'Purana Pul Darwaza' } as any, 5.5, 3); }, clear: [16, 12], keepBuildings: true },
  darushifa: { draw: (K) => { colonial(K, 60, 40, 10, '#cdb995', '#e9dcc2', { storeys: 2, arches: true }); }, clear: [66, 46] },
  // Gun Park: the Telangana martyrs' memorial column (Amarula Stupam) by the Assembly
  gun_park: { draw: (K) => { K.box(0, 0, 0, 12, 1.2, 12, '#cfc7b8'); K.box(0, 0, 1.2, 4, 3, 4, '#bfb6a5'); K.cyl(0, 0, 4.2, 1.1, 14, '#e8e1d2', 'cyl8'); K.shape('cone', 0, 0, 18.2, 2.2, 3, 2.2, '#e8e1d2'); K.board('AMARULA STUPAM · GUN PARK', 0, 6.2, 2.4, 9); K.solidRect(0, 0, 4, 4, 18); }, clear: 10 },
  // Paradise, Secunderabad: the biryani landmark, a tall white building with green trim at Paradise Circle
  paradise: { draw: (K, D) => { tower(K, 0, 0, W(D, 50) * 0.8, Dp(D, 49) * 0.8, 24, '#f3f1ec', '#2f8a52'); K.board('PARADISE', 0, Dp(D, 49) * 0.4 + 0.2, 20, 18, 3, '#ffffff', '#1f7a43'); K.board('PARADISE BIRYANI', 0, Dp(D, 49) * 0.4 + 0.2, 4.5, 12, 1.2, '#1f7a43', '#ffffff'); }, clear: [46, 46] },
  cafe_bahar: { draw: (K, D) => { tower(K, 0, 0, W(D, 30), Dp(D, 13), 14, '#efe9dc', '#c33a2e'); K.board('CAFE BAHAR', 0, Dp(D, 13) / 2 + 0.2, 4.5, 9, 1.2, '#c33a2e', '#ffffff'); }, clear: [34, 18] },
  nimrah: { draw: (K) => { K.box(0, 0, 0, 10, 8, 8, '#e3d6b6'); K.box(0, 4.3, 0, 10.4, 0.3, 1.6, '#3f6b4a'); K.board('NIMRAH CAFE & BAKERY', 0, 4.2, 4.8, 8, 0.9, '#2f5d3f', '#f6eedc'); }, clear: [10, 8], keepBuildings: true },
  shadab: { draw: (K) => { tower(K, 0, 0, 22, 14, 14, '#efe7d4', '#a3332a'); K.board('HOTEL SHADAB', 0, 7.2, 4.5, 9, 1.2, '#a3332a', '#ffffff'); }, clear: [26, 18] },
  clocktower_james: { draw: (K, D) => { colonial(K, W(D, 26), Dp(D, 18), 7, '#c9573f', '#f1e6d2', { storeys: 1, arches: true }); clockTower(K, 0, Dp(D, 18) / 2 - 2, 4.5, 16, '#c9573f', '#f1e6d2', 'cone'); }, clear: [30, 24] },
  // ---- stations and bus terminals ----
  // Nampally (Hyderabad Deccan, 1874): long Indo-Saracenic facade, cream with domed towers
  nampally_station: { draw: (K, D) => { const w = Math.min(W(D, 200), 140); indoSaracenic(K, w, 20, 10, '#efd9a6', '#fbf4e2', { dome: 5, towers: 7, chhatris: 6 }); K.board('HYDERABAD DECCAN · NAMPALLY', 0, 11.5, 13, 16, 1.4, '#f7d21d', '#121116'); }, clear: [150, 30] },
  // Secunderabad Junction: the long white-and-ochre frontage with the central arched portal
  secunderabad_station: { draw: (K, D) => { const w = Math.min(W(D, 204), 160); colonial(K, w, 18, 9, '#f1ece2', '#c98a3a', { storeys: 2, arches: true }); K.box(0, 4, 0, 34, 16, 26, '#f1ece2'); K.shape('archBig', 0, 17.05, 0, 14, 13, 0.4, '#5a4e44'); K.board('SECUNDERABAD JN', 0, 17.3, 15.2, 16, 1.6, '#f7d21d', '#121116'); }, clear: [170, 32] },
  // Kacheguda (1916): Gothic-revival station with domed corner turrets and minarets, cream and maroon
  kacheguda_station: { draw: (K, D) => { indoSaracenic(K, W(D, 79), 20, 10, '#f0e2c0', '#9b3b2e', { towers: 9, chhatris: 4, dome: 4.5, domeCol: '#f0e2c0' }); K.board('KACHEGUDA', 0, 11.5, 13, 12, 1.4, '#f7d21d', '#121116'); }, clear: [86, 28] },
  begumpet_station: { draw: (K) => { colonial(K, 30, 12, 6, '#e8dcc2', '#b8432f', { storeys: 1 }); K.board('BEGUMPET', 0, 7, 5, 8, 1, '#f7d21d', '#121116'); }, clear: [34, 16] },
  // Charlapalli Terminal (2024): new terminal with a sweeping metal roof over a glass concourse
  charlapalli_station: { draw: (K) => { K.box(0, 0, 0, 90, 10, 30, '#cfe1ea'); for (let k = 0; k < 7; k++) addRaw(K, 'cyl', 0, -12 + k * 4, 10.5 + Math.sin((k / 6) * Math.PI) * 3, 1.2, 92, 1.2, '#e9eef2', 0, 0, Math.PI / 2); K.board('CHERLAPALLY TERMINAL', 0, 15.2, 8, 16, 1.4, '#f7d21d', '#121116'); K.solidRect(0, 0, 90, 30, 10); }, clear: [96, 36] },
  lingampally_station: { draw: (K) => { colonial(K, 26, 10, 6, '#e6dcc6', '#b8432f', { storeys: 1 }); K.board('LINGAMPALLY', 0, 6, 5, 8, 1, '#f7d21d', '#121116'); }, clear: [30, 14] },
  // MGBS (Imlibun): the giant bus station with rows of white umbrella shell roofs over the platforms
  mgbs: { draw: (K, D) => {
    const w = Math.min(W(D, 260), 220), d = Math.min(Dp(D, 170), 140);
    for (let i = -w / 2 + 12; i < w / 2; i += 22) for (let j = -d / 2 + 12; j < d / 2; j += 22) {
      // one inverted-umbrella shell: a central column, the shell rising to its square rim, a gap to the next
      K.cyl(i, j, 0, 0.8, 8.2, '#dcd8cf', 'cyl8'); K.shape('cone', i, j, 6.2, 4, 2.2, 4, '#e4e0d8');
      K.box(i, j, 8.2, 19.2, 0.35, 19.2, '#f4f1ea'); K.box(i, j, 8.55, 19.4, 0.5, 0.5, '#c9c4ba'); K.box(i, j, 8.55, 0.5, 0.5, 19.4, '#c9c4ba');
      for (const [a, b] of [[0, 9.6], [0, -9.6], [9.6, 0], [-9.6, 0]]) K.box(i + a, j + b, 7.9, a ? 0.4 : 19.4, 0.9, a ? 19.4 : 0.4, '#d9d4ca');
      K.ob(i, j, 0.9, 8.2);
      if ((Math.round(i + j) & 3) === 0) K.box(i + 4, j, 0, 2.6, 3.1, 11, ((Math.round(i) & 1) ? '#c4372d' : '#2f6a9a'));   // a bus at the bay
    }
    K.board('MAHATMA GANDHI BUS STATION · MGBS', 0, d / 2 + 4, 6, 16, 1.4, '#b8322b', '#ffffff');
  }, clear: [230, 150] },
  jbs: { draw: (K) => { for (let i = -60; i <= 60; i += 20) { K.box(i, 0, 7, 18, 0.5, 80, '#ece8e0'); for (const j of [-35, 0, 35]) { K.box(i, j, 0, 0.6, 7, 0.6, '#9aa0a8'); K.ob(i, j, 0.5, 7); } } K.board('JUBILEE BUS STATION · JBS', 0, 44, 6, 14, 1.4, '#b8322b', '#ffffff'); }, clear: [140, 96] },
  // ---- government and civic ----
  ghmc: { draw: (K, D) => { tower(K, 0, 0, W(D, 44), Dp(D, 18), 34, '#c9d3da', '#f2efe8', { crown: true }); K.board('GHMC HEAD OFFICE', 0, Dp(D, 18) / 2 + 0.2, 4.5, 10); }, clear: [50, 24] },
  // Police Integrated Command and Control Centre, Banjara Hills (2022): glass towers joined high up, the tallest about 84 m
  dgp_office: { draw: (K) => { tower(K, -14, 0, 18, 18, 84, '#5d8fae', '#d9e2e8', { fins: true }); tower(K, 14, 0, 18, 18, 60, '#5d8fae', '#d9e2e8', { fins: true }); tower(K, 0, -18, 16, 16, 38, '#5d8fae', '#d9e2e8'); K.box(0, 0, 50, 12, 6, 8, '#d9e2e8'); K.board('POLICE COMMAND & CONTROL CENTRE', 0, 10, 5, 15); }, clear: [60, 60] },
  rbi: { draw: (K) => { colonial(K, 60, 40, 18, '#d7cfc0', '#f4efe6', { storeys: 4, portico: 20, cols: 6, pediment: false }); K.board('RESERVE BANK OF INDIA', 0, 26, 4.5, 12); }, clear: [66, 54] },
  // Ravindra Bharathi (1961): auditorium with its stepped facade and the long canopy over the entrance
  ravindra_bharathi: { draw: (K, D) => { K.box(0, 0, 0, W(D, 52) * 0.8, 16, Dp(D, 44) * 0.8, '#e2d8c6'); K.box(0, Dp(D, 44) * 0.4 + 4, 4.5, 30, 0.5, 8, '#f2efe8'); for (let i = -14; i <= 14; i += 4) K.box(i, Dp(D, 44) * 0.4 + 7.5, 0, 0.5, 4.5, 0.5, '#c9c1b2'); K.board('RAVINDRA BHARATHI', 0, Dp(D, 44) * 0.4 + 0.1, 11, 14, 1.6, '#7a2e26', '#f6eedc'); K.solidRect(0, 0, W(D, 52) * 0.8, Dp(D, 44) * 0.8, 16); }, clear: [56, 50] },
  lalitha_kala: { draw: (K) => { for (let k = 0; k < 8; k++) { const a = Math.PI * (0.15 + (k / 7) * 0.7); K.box(Math.cos(a) * (14 + k * 0.1), -Math.sin(a) * 14, 0, 6, 1 + k * 0.5, 3, '#c9bfae', a); } K.box(0, 4, 0, 18, 1.2, 8, '#bdb3a2'); K.board('LALITHA KALA THORANAM', 0, 9, 3, 10); }, clear: 22 },
  nizam_college: { draw: (K) => { indoSaracenic(K, 80, 26, 12, '#e7d6ae', '#fbf4e2', { dome: 6, chhatris: 6, towers: 7 }); nameAt(K, { name: 'Nizam College' } as any, 15, 3.2); }, clear: [90, 34] },
  gandhi_bhavan: { draw: (K, D) => { colonial(K, W(D, 28), 12, 8, '#f3efe6', '#ffffff', { storeys: 2 }); K.board('GANDHI BHAVAN', 0, 7, 4.5, 9); }, clear: [32, 16] },
  ou_library: { draw: (K, D) => { indoSaracenic(K, W(D, 92) * 0.8, Dp(D, 71) * 0.6, 12, '#c9b392', '#e6d8bc', { dome: 6, chhatris: 4 }); }, clear: [80, 50] },
  // ---- hospitals ----
  nims: { draw: (K) => { tower(K, 0, 0, 70, 30, 40, '#e9eef2', '#9cb4c8'); tower(K, 50, -10, 30, 30, 28, '#e9eef2', '#9cb4c8'); K.board("NIZAM'S INSTITUTE OF MEDICAL SCIENCES", 0, 15.2, 4.5, 16); }, clear: [130, 50] },
  gandhi_hospital: { draw: (K) => { tower(K, 0, 0, 120, 28, 36, '#efe8da', '#c9a36a'); for (const s of [-1, 1]) tower(K, s * 50, -40, 24, 50, 30, '#efe8da', '#c9a36a'); K.board('GANDHI HOSPITAL', 0, 14.2, 4.5, 12); }, clear: [140, 110] },
  apollo_jh: { draw: (K) => { tower(K, 0, 0, 80, 34, 30, '#eef1f4', '#2a5e8c'); tower(K, 30, -30, 30, 26, 46, '#7fa6c2', '#e9eef2', { fins: true }); K.board('APOLLO HOSPITALS', 0, 17.2, 26, 14, 1.8, '#ffffff', '#1f4f88'); }, clear: [100, 80] },
  yashoda_sec: { draw: (K, D) => { tower(K, 0, 0, W(D, 40), Dp(D, 20), 44, '#e9eef2', '#3a6ea5'); K.board('YASHODA HOSPITALS', 0, Dp(D, 20) / 2 + 0.2, 40, 14, 1.8, '#ffffff', '#24589a'); }, clear: [50, 30] },
  kims: { draw: (K) => { tower(K, 0, 0, 60, 34, 42, '#eef1f4', '#2a7a6a'); K.board('KIMS HOSPITALS', 0, 17.2, 38, 12, 1.8, '#ffffff', '#1f6a5a'); }, clear: [70, 44] },
  lvpei: { draw: (K, D) => { tower(K, 0, 0, W(D, 90) * 0.8, Dp(D, 65) * 0.8, 24, '#f1ece2', '#a06a3a'); K.board('L V PRASAD EYE INSTITUTE', 0, Dp(D, 65) * 0.4 + 0.2, 5, 14); }, clear: [96, 70] },
  niloufer: { draw: (K, D) => { indoSaracenic(K, W(D, 125) * 0.7, Dp(D, 103) * 0.4, 12, '#e3d1a6', '#fbf4e2', { chhatris: 6, dome: 5 }); nameAt(K, { name: 'Niloufer Hospital' } as any, Dp(D, 103) * 0.2 + 2, 3.2); }, clear: [120, 80] },
  mnj: { draw: (K, D) => { tower(K, 0, 0, W(D, 94) * 0.7, Dp(D, 92) * 0.5, 28, '#ece6da', '#8a5a9a'); K.board('MNJ CANCER HOSPITAL', 0, Dp(D, 92) * 0.25 + 0.2, 5, 12); }, clear: [80, 60] },
  // ---- campuses ----
  uoh: { draw: (K) => { gate(K, 0, 0, 22, 9, '#c9a77c', '#efe3c9', 'UNIVERSITY OF HYDERABAD'); }, clear: 0, keepBuildings: true },
  iiit: { draw: (K) => { gate(K, 0, 0, 18, 7, '#b5523d', '#efe3c9', 'IIIT HYDERABAD'); tower(K, 0, -60, 60, 24, 18, '#b5523d', '#efe3c9'); }, clear: [70, 30, 0, -60], keepBuildings: true },
  isb: { draw: (K) => { gate(K, 0, 0, 20, 7, '#c4a27a', '#efe3c9', 'INDIAN SCHOOL OF BUSINESS'); }, clear: 0, keepBuildings: true },
  jntu: { draw: (K) => { gate(K, 0, 0, 22, 9, '#d9cdb2', '#b5523d', 'JNTU HYDERABAD'); }, clear: 0, keepBuildings: true },
  iict: { draw: (K) => { gate(K, 0, 0, 18, 7, '#cfc7b8', '#2f5d9a', 'CSIR-IICT'); }, clear: 0, keepBuildings: true },
  nalsar: { draw: (K) => { gate(K, 0, 0, 18, 7, '#c9a77c', '#efe3c9', 'NALSAR UNIVERSITY OF LAW'); }, clear: 0, keepBuildings: true },
  ccmb: { draw: (K) => { gate(K, 0, 0, 18, 7, '#cfc7b8', '#2f5d9a', 'CSIR-CCMB'); }, clear: 0, keepBuildings: true },
  // ---- IT and business ----
  mindspace: { draw: (K) => { for (const [u, v, h] of [[-50, 0, 60], [0, 10, 70], [50, 0, 55], [-25, -45, 45], [30, -45, 50]] as number[][]) tower(K, u, v, 34, 30, h, '#4f7d9c', '#dfe7ec', { fins: true }); K.board('MINDSPACE IT PARK', 0, 30, 5, 12); }, clear: [150, 110] },
  dlf: { draw: (K) => drawMappedLandmarkPlan(K, 'dlf'), rot: 0, clear: [300, 190, 0, 0] },
  microsoft: { draw: (K) => { for (const [u, v] of [[-50, 0], [0, 0], [50, 0], [-25, -50], [25, -50]]) tower(K, u, v, 38, 30, 20, '#7d9aaa', '#e5ebef'); K.board('MICROSOFT INDIA DEVELOPMENT CENTER', 0, 18, 5, 16); }, clear: [150, 100] },
  google: { draw: (K) => { tower(K, 0, 0, 140, 70, 34, '#7fa5b8', '#f2efe8', { fins: true }); K.board('GOOGLE', 0, 35.2, 26, 10, 2.4, '#ffffff', '#3b5f9a'); }, clear: [150, 80] },
  // Amazon's Hyderabad campus (2019): one of the largest office buildings in the world, glass with a spiral roof garden
  amazon: { draw: (K) => { tower(K, 0, 0, 180, 90, 58, '#6f97ad', '#e8edf0', { fins: true }); K.box(0, 0, 58, 120, 3, 60, '#5f8f45'); K.board('AMAZON', 0, 45.2, 46, 14, 2.6, '#1d2330', '#f2a93a'); }, clear: [190, 100] },
  infosys: { draw: (K) => { for (const [u, v] of [[-40, 0], [40, 0], [0, -50]]) tower(K, u, v, 40, 34, 26, '#8aa6b6', '#efeae2'); K.cyl(0, 30, 0, 14, 18, '#9fbccb', 'cyl24'); K.board('INFOSYS', 0, 48, 5, 8); }, clear: [130, 120] },
  wipro_circle: { draw: (K) => { for (const [u, h] of [[-30, 40], [30, 46]]) tower(K, u, 0, 40, 30, h, '#6b90a8', '#f0ece4'); K.board('WIPRO', 0, 16, 5, 8); }, clear: [110, 40] },
  tcs_synergy: { draw: (K) => drawMappedLandmarkPlan(K, 'tcs_synergy'), rot: 0, clear: [110, 110, 0, 0] },
  // HICC (2006): convention centre under a great curved metal roof, glass fronts
  hicc: { draw: (K, D) => { const w = W(D, 147) * 0.85, d = Dp(D, 140) * 0.85; K.box(0, 0, 0, w, 14, d, '#9fbccb'); for (let k = 0; k < 9; k++) addRaw(K, 'cyl', 0, -d / 2 + (k + 0.5) * (d / 9), 14 + Math.sin(((k + 0.5) / 9) * Math.PI) * 6, 1.6, w + 6, 1.6, '#c9ced4', 0, 0, Math.PI / 2); K.board('HYDERABAD INTERNATIONAL CONVENTION CENTRE', 0, d / 2 + 0.2, 6, 16); K.solidRect(0, 0, w, d, 14); }, clear: [150, 146] },
  hitex: { draw: (K) => { for (const u of [-90, -30, 30, 90]) { K.box(u, 0, 0, 54, 14, 100, '#d9dde3'); addRaw(K, 'prism', u, 0, 14, 56, 6, 102, '#9aa3ad'); K.solidRect(u, 0, 54, 100, 14); } K.board('HITEX EXHIBITION CENTRE', 0, 56, 6, 14); }, clear: [250, 120] },
  tworks: { draw: (K, D) => { tower(K, 0, 0, W(D, 75), Dp(D, 39), 22, '#2f3a48', '#e8762b', { fins: true }); K.board('T-WORKS', 0, Dp(D, 39) / 2 + 0.2, 16, 10, 2, '#e8762b', '#ffffff'); }, clear: [80, 44] },
  kohinoor: { draw: (K) => { for (const [u, v, h] of [[-30, 0, 90], [0, -30, 100], [30, 0, 90]] as number[][]) tower(K, u, v, 26, 26, h, '#567f9c', '#e1e7ec', { fins: true, crown: true }); K.board('KNOWLEDGE CITY', 0, 16, 5, 10); }, clear: [96, 90] },
  phoenix: { draw: (K, D) => { tower(K, 0, 0, W(D, 62) * 0.8, Dp(D, 58) * 0.8, 70, '#4e7896', '#e1e7ec', { fins: true, crown: true }); }, clear: [60, 56] },
  lodha_bellezza: { draw: (K) => { for (const [u, v] of [[-36, 0], [-12, 8], [12, 0], [36, 8], [0, -30]]) tower(K, u, v, 18, 22, 104, '#ece8e0', '#9a958c', { crown: true }); }, clear: [110, 80] },
  my_home_bhooja: { draw: (K) => { for (const [u, v] of [[-30, 0], [0, -10], [30, 0]]) tower(K, u, v, 22, 24, 112, '#f0ece4', '#a8a297', { crown: true }); }, clear: [100, 60] },
  // ---- shopping and cinema ----
  inorbit: { draw: (K, D) => { tower(K, 0, 0, W(D, 232) * 0.85, Dp(D, 87) * 0.85, 24, '#e5e2dc', '#c4372d'); K.board('INORBIT MALL', 0, Dp(D, 87) * 0.43 + 0.2, 18, 16, 2.4, '#c4372d', '#ffffff'); }, clear: [220, 84] },
  gvk: { draw: (K, D) => { tower(K, 0, 0, W(D, 143) * 0.85, Dp(D, 62) * 0.85, 26, '#2f3a48', '#c9a24a'); K.board('GVK ONE', 0, Dp(D, 62) * 0.43 + 0.2, 20, 12, 2.4, '#2f3a48', '#e8c46a'); }, clear: [130, 60] },
  sarath_city: { draw: (K, D) => { tower(K, 0, 0, W(D, 173) * 0.9, Dp(D, 154) * 0.9, 30, '#e8e5df', '#7a2e5a'); K.board('SARATH CITY CAPITAL MALL', 0, Dp(D, 154) * 0.45 + 0.2, 24, 16, 2.4, '#7a2e5a', '#ffffff'); }, clear: [170, 150] },
  ikea: { draw: (K, D) => { K.box(0, 0, 0, W(D, 206) * 0.85, 22, Dp(D, 156) * 0.85, '#3f5a78'); K.board('IKEA HYDERABAD', 0, Dp(D, 156) * 0.43 + 0.2, 17, 16, 2.6, '#3f5a78', '#ffffff'); K.solidRect(0, 0, W(D, 206) * 0.85, Dp(D, 156) * 0.85, 22); }, clear: [190, 140] },
  forum: { draw: (K, D) => { tower(K, 0, 0, W(D, 175) * 0.85, Dp(D, 97) * 0.85, 26, '#e7e3dc', '#2a5e8c'); K.board('NEXUS HYDERABAD', 0, Dp(D, 97) * 0.43 + 0.2, 20, 14, 2.4, '#2a5e8c', '#ffffff'); }, clear: [160, 90] },
  city_center: { draw: (K, D) => { tower(K, 0, 0, W(D, 87) * 0.85, Dp(D, 77) * 0.85, 24, '#e6e1d8', '#b83a2e'); K.board('CITY CENTER MALL', 0, Dp(D, 77) * 0.43 + 0.2, 18, 12, 2, '#b83a2e', '#ffffff'); }, clear: [80, 72] },
  hyderabad_central: { draw: (K, D) => { tower(K, 0, 0, W(D, 101) * 0.85, Dp(D, 48) * 0.85, 22, '#e9e6df', '#2a6a5a'); K.board('HYDERABAD CENTRAL', 0, Dp(D, 48) * 0.43 + 0.2, 16, 14, 2, '#2a6a5a', '#ffffff'); }, clear: [92, 46] },
  // Prasads IMAX (2003): the drum of the IMAX screen beside the multiplex block, at NTR Gardens
  prasads: { draw: (K, D) => { tower(K, -8, 0, W(D, 97) * 0.6, Dp(D, 65) * 0.8, 22, '#e1dbd0', '#2f3a48'); K.cyl(W(D, 97) * 0.3, 0, 0, 16, 26, '#3a4a5e', 'cyl24'); K.board('PRASADS IMAX', W(D, 97) * 0.3, 16.1, 20, 12, 2, '#3a4a5e', '#ffffff'); K.solidCircle(W(D, 97) * 0.3, 0, 16, 26); }, clear: [100, 68] },
  // Sudarshan 35mm, RTC X Roads: the single-screen landmark with its tall name board
  sudarshan: { draw: (K, D) => { K.box(0, 0, 0, W(D, 38), 16, Dp(D, 25), '#e7d9bd'); K.box(0, Dp(D, 25) / 2 + 0.3, 8, 18, 6, 0.4, '#7a1f22'); K.board('SUDARSHAN 35MM', 0, Dp(D, 25) / 2 + 0.55, 11, 16, 2.2, '#7a1f22', '#ffd86a'); K.solidRect(0, 0, W(D, 38), Dp(D, 25), 16); }, clear: [42, 28] },
  // Shilparamam: crafts village, its entrance arch and thatched pavilions
  shilparamam: { draw: (K) => { gate(K, 0, 0, 14, 8, '#b9763e', '#e2c48a', 'SHILPARAMAM'); for (let k = 0; k < 8; k++) { const u = -40 + (k % 4) * 26, v = -30 - Math.floor(k / 4) * 26; K.box(u, v, 0, 8, 3, 8, '#c9a77c'); K.shape('cone', u, v, 3, 12, 4, 12, '#8a6a3a'); } }, clear: [110, 80, 0, -30] },
  shilpakala: { draw: (K, D) => { K.box(0, 0, 0, W(D, 80) * 0.8, 14, Dp(D, 73) * 0.8, '#d9c6a6'); K.arcade('archBig', -24, Dp(D, 73) * 0.4 + 0.05, 24, Dp(D, 73) * 0.4 + 0.05, 5, 0, 10, 0.4, '#5a4636'); K.board('SHILPAKALA VEDIKA', 0, Dp(D, 73) * 0.4 + 0.3, 12.8, 14); K.solidRect(0, 0, W(D, 80) * 0.8, Dp(D, 73) * 0.8, 14); }, clear: [76, 70] },
  lulu: { draw: (K, D) => { tower(K, 0, 0, W(D, 86) * 0.9, Dp(D, 78) * 0.9, 26, '#e7e3dc', '#2a7a4a'); K.board('LULU MALL', 0, Dp(D, 78) * 0.45 + 0.2, 20, 12, 2.2, '#2a7a4a', '#ffffff'); }, clear: [84, 76] },
  ameerpet_metro_mall: { draw: (K, D) => { tower(K, 0, 0, W(D, 182) * 0.85, Dp(D, 63) * 0.85, 24, '#e5e1da', '#3b5f9a'); K.board('NEXT GALLERIA MALL', 0, Dp(D, 63) * 0.43 + 0.2, 18, 14, 2, '#3b5f9a', '#ffffff'); }, clear: [170, 60] },
  // ---- parks, lakes, leisure ----
  ntr_gardens: { draw: (K) => { gate(K, 0, 0, 16, 9, '#d6b26a', '#f2e6c8', 'NTR GARDENS'); for (let k = 0; k < 6; k++) K.shape('dome', -40 + k * 16, -40, 0, 8, 6, 8, '#c95a8a'); }, clear: 0, keepBuildings: true },
  lumbini: { draw: (K) => { gate(K, 0, 0, 14, 8, '#c9a77c', '#efe3c9', 'LUMBINI PARK'); clockTower(K, 20, -30, 4, 14, '#efe3c9', '#c9a77c', 'cone'); }, clear: 0, keepBuildings: true },
  indira_park: { draw: (K) => { gate(K, 0, 0, 16, 8, '#c9a77c', '#efe3c9', 'INDIRA PARK'); }, clear: 0, keepBuildings: true },
  // Sanjeevaiah Park flag: retained 88 m mast; national flag proportions and Chakra follow the Flag Code.
  sanjeevaiah: { draw: (K) => { K.box(0, 0, 0, 12, 1.5, 12, '#cfc7b8'); K.cyl(0, 0, 1.5, 0.9, 88, '#c9ced4', 'cyl8'); drawIndianFlag(K, 1, 0, 88, 30); K.ob(0, 0, 1, 90); K.board('SANJEEVAIAH PARK', 0, 8, 3, 10); }, clear: 0, keepBuildings: true },
  kbr: { draw: (K) => { gate(K, 0, 0, 16, 8, '#8a6a4a', '#d9c6a6', 'KBR NATIONAL PARK'); }, clear: 0, keepBuildings: true },
  zoo: { draw: (K) => { gate(K, 0, 0, 20, 10, '#7a5a3a', '#d6b26a', 'NEHRU ZOOLOGICAL PARK'); for (const s of [-1, 1]) statue(K, s * 16, 4, 6, 1.5, '#8a8a86'); }, clear: 0, keepBuildings: true },
  botanical: { draw: (K) => { gate(K, 0, 0, 16, 8, '#6a8a4a', '#d9e6c6', 'BOTANICAL GARDENS'); }, clear: 0, keepBuildings: true },
  public_gardens: { draw: (K) => { gate(K, 0, 0, 14, 8, '#c9a77c', '#efe3c9', 'PUBLIC GARDENS'); }, clear: 0, keepBuildings: true },
  necklace_road: { draw: (K) => { for (let k = -3; k <= 3; k++) { K.box(k * 14, 0, 0, 0.3, 6, 0.3, '#5b5a63'); K.shape('sph', k * 14, 0, 6, 0.6, 0.6, 0.6, '#fff2cc', 0, 'lit'); } K.board('NECKLACE ROAD', 0, 2, 3, 8); }, clear: 0, keepBuildings: true },
  eat_street: { draw: (K) => { mandapa(K, 0, 0, 0, 40, 10, 3.5, '#d9a65a', '#a8422d', 8, 3); K.board('EAT STREET', 0, 6, 5.5, 8, 1, '#a8422d', '#fff2cc'); }, clear: [44, 14] },
  jalavihar: { draw: (K) => { gate(K, 0, 0, 14, 8, '#2f8ab8', '#e9eef2', 'JALAVIHAR WATER PARK'); for (let k = 0; k < 4; k++) addRaw(K, 'cyl', -20 + k * 12, -30, 6 + k * 2, 1.2, 24, 1.2, ['#e8762b', '#2f8ab8', '#e0b23a', '#3d9b5a'][k], 0.6, 0.3 * k, 0); }, clear: 0, keepBuildings: true },
  snow_world: { draw: (K, D) => { K.box(0, 0, 0, W(D, 72) * 0.8, 10, Dp(D, 48) * 0.8, '#dfe9f0'); K.shape('dome', 0, 0, 10, W(D, 72) * 0.7, 8, Dp(D, 48) * 0.7, '#f4f8fb'); K.board('SNOW WORLD', 0, Dp(D, 48) * 0.4 + 0.2, 7, 10, 1.4, '#2f8ab8', '#ffffff'); K.solidRect(0, 0, W(D, 72) * 0.8, Dp(D, 48) * 0.8, 10); }, clear: [64, 44] },
  // Tank Bund: the statues of Telugu luminaries along the bund road
  tank_bund: { draw: (K) => { for (let k = -6; k <= 6; k++) statue(K, k * 22, 0, 4.2, 1.6, '#4a4a48'); K.board('TANK BUND', 0, 2.4, 3, 7); }, clear: 0, keepBuildings: true },
  // The source establishes a dam POI, not a 205m spillway footprint. Preserve
  // the mapped reservoir/roads; a small visitor marker replaces invented bays.
  osman_sagar: { draw: (K) => { for (const u of [-3.5, 3.5]) K.box(u, 0, 0, .16, 3.3, .16, '#64706c'); K.board('OSMAN SAGAR DAM · GANDIPET', 0, 0, 2.8, 8, 1.1, '#226447'); }, rot: 0, clear: 0, keepBuildings: true },
  himayat_sagar: { draw: (K) => { for (let k = -8; k <= 8; k++) { K.box(k * 12, 0, 0, 12.2, 9, 8, '#a59d90'); K.shape('arch', k * 12, 4.05, 0, 6, 6, 0.3, '#5a544c'); } K.box(0, 0, 9, 205, 1, 9, '#bdb3a2'); K.board('HIMAYAT SAGAR', 0, 5, 12, 10); K.solidRect(0, 0, 205, 8, 9); }, clear: 0, keepBuildings: true },
  ramoji: { draw: (K) => { gate(K, 0, 0, 26, 12, '#c9a77c', '#f2e6c8', 'RAMOJI FILM CITY'); for (const s of [-1, 1]) statue(K, s * 20, 6, 7, 2, '#d6b26a'); }, clear: 0, keepBuildings: true },
  wonderla: { draw: (K) => { gate(K, 0, 0, 20, 10, '#2f8ab8', '#e8c46a', 'WONDERLA'); K.box(30, -40, 0, 0.6, 40, 0.6, '#8a8f99'); K.cyl(30, -40, 40, 18, 1, '#e8762b', 'cyl24'); }, clear: 0, keepBuildings: true },
  // The lake already renders from the actual OSM water polygon w28131043.
  // A previous invented promenade at its centre put concrete slabs in the water.
  durgam_lake: { draw: () => {}, clear: 0, keepBuildings: true },
  biodiversity: { draw: (K) => { gate(K, 0, 0, 14, 7, '#5f8a45', '#d9e6c6', 'BIODIVERSITY PARK'); }, clear: 0, keepBuildings: true },
  nizam_sagar_chowk: { draw: (K, D) => { colonial(K, W(D, 80) * 0.8, Dp(D, 35) * 0.8, 9, '#f2efe8', '#ffffff', { storeys: 1, portico: 16, cols: 6 }); K.board('THE NIZAM CLUB', 0, Dp(D, 35) * 0.4 + 6, 3.5, 9); }, clear: [70, 34] },
  // ---- sport ----
  uppal_stadium: { draw: (K) => { stadiumBowl(K, 95, 85, 22, '#d6d2ca', '#5d6d8a', '#e8ecef', 0.55); K.board('RAJIV GANDHI INTERNATIONAL CRICKET STADIUM', 0, 92, 6, 16); }, clear: [200, 180] },
  lb_stadium: { draw: (K) => { stadiumBowl(K, 95, 75, 16, '#d9d1c0', '#a8442f', '#eceae4', 0.3); K.board('LAL BAHADUR SHASTRI STADIUM', 0, 82, 6, 14); }, clear: [196, 160] },
  gachibowli_indoor: { draw: (K, D) => { K.cyl(0, 0, 0, W(D, 98) * 0.45, 14, '#d9dde3', 'cyl24'); K.shape('dome', 0, 0, 14, W(D, 98) * 0.9, 10, W(D, 98) * 0.9, '#c9ced4'); K.board('GACHIBOWLI INDOOR STADIUM', 0, W(D, 98) * 0.45 + 0.4, 6, 14); K.solidCircle(0, 0, W(D, 98) * 0.45, 14); }, clear: [100, 100] },
  saroornagar_indoor: { draw: (K) => { K.cyl(0, 0, 0, 40, 14, '#d9dde3', 'cyl24'); K.shape('dome', 0, 0, 14, 80, 9, 80, '#c9ced4'); K.board('SAROORNAGAR INDOOR STADIUM', 0, 40.4, 6, 14); K.solidCircle(0, 0, 40, 14); }, clear: 84 },
  gymkhana: { draw: (K) => { colonial(K, 30, 12, 7, '#f2efe8', '#2f5d3f', { storeys: 1, portico: 12, cols: 4 }); K.board('SECUNDERABAD GYMKHANA', 0, 12, 3.5, 11); }, clear: [34, 20] },
  parade: { draw: (K) => { colonial(K, 24, 10, 6, '#e9e3d6', '#b8432f', { storeys: 1 }); K.board('PARADE GROUNDS', 0, 6, 4, 9); }, clear: [28, 14] },
  race_course: { draw: (K) => { colonial(K, 80, 18, 12, '#f2efe8', '#2f5d3f', { storeys: 3, portico: 30, cols: 8, pediment: false }); K.box(0, 14, 12.9, 84, 0.5, 10, '#2f5d3f'); K.board('HYDERABAD RACE CLUB', 0, 20, 4, 12); }, clear: [90, 30] },
  hca_fateh: { draw: (K) => { colonial(K, 40, 14, 9, '#efe8da', '#2f5d3f', { storeys: 2, portico: 16, cols: 6 }); K.board('FATEH MAIDAN CLUB', 0, 14.5, 3.5, 10); }, clear: [44, 26] },
  // ---- airport and transport hubs ----
  // RGIA terminal: long glass terminal under a wave roof, the elevated departures road in front
  rgia: { draw: (K) => drawAirportTerminal(K,'vohs'), rot:0, clear: [360, 170, 0, 0] },
  begumpet_airport: { draw: (K) => drawAirportTerminal(K,'vohy'), rot:0, clear: [280, 80, 0, 0] },
  parade_metro: { draw: (K) => { K.board('PARADE GROUND · METRO INTERCHANGE', 0, 0, 3.5, 14, 1, '#ffffff', '#c4282d'); }, clear: 0, keepBuildings: true },
  ameerpet_interchange: { draw: (K) => { K.board('AMEERPET · METRO INTERCHANGE', 0, 0, 3.5, 13, 1, '#ffffff', '#c4282d'); }, clear: 0, keepBuildings: true },
  mgbs_metro: { draw: (K) => { K.board('MG BUS STATION · METRO INTERCHANGE', 0, 0, 3.5, 14, 1, '#ffffff', '#c4282d'); }, clear: 0, keepBuildings: true },
  // ---- statues and memorials ----
  ntr_ghat: { draw: (K) => { K.box(0, 0, 0, 30, 1, 30, '#d6cdbd'); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; K.box(Math.cos(a) * 11, Math.sin(a) * 11, 1, 1.4, 12, 1.4, '#f2efe8'); } K.shape('dome', 0, 0, 13, 26, 6, 26, '#f2efe8'); K.board('NTR GHAT', 0, 16, 3, 7); K.solidCircle(0, 0, 12, 1); }, clear: 18 },
  pv_ghat: { draw: (K) => { K.box(0, 0, 0, 24, 1, 24, '#d6cdbd'); statue(K, 0, 0, 6, 2, '#5a5a58'); K.board('PV GYAN BHOOMI', 0, 13, 3, 9); }, clear: 14 },
  // Official Secretariat unveiling photographs,2024-12-09: green sari/red blouse, raised right palm,
  // left hand holding crops. Keep inherited scale/anchor; this changes the generic gold figure's visible identity.
  thalli: { draw: (K) => {
    const green='#287540',red='#ac3038',gold='#d6b34b',skin='#c99472',hair='#282022';
    K.box(0,0,0,4.8,3,4.8,'#cfc7b8'); K.box(0,0,3,3.3,1.5,3.3,'#cfc7b8');
    K.shape('robe',0,0,4.5,4.5,7.3,3.3,green); K.box(0,.05,11.5,3.3,1.35,2.0,red);
    K.shape('robe',-.25,.4,10.0,3.0,2.7,2.2,green); K.cyl(0,0,12.8,.38,.6,skin,'cyl8');
    K.sph(0,0,14.25,1.05,skin,0,1.2); K.sph(0,-.5,14.45,1.09,hair,0,1.16); K.sph(0,1.02,14.7,.10,red);
    // Diagonal sari border, waist band and necklace are coloured garment details, not invented inscriptions.
    addRaw(K,'box',.1,1.12,9.1,.16,6.9,.09,gold,0,0,-.35); K.box(0,.95,9.5,3.25,.17,.12,gold);
    for(let i=0;i<11;i++){const a=i*Math.PI/10;K.sph(Math.cos(a)*1.1,1.08,12.3-Math.sin(a)*.75,.09,gold);}
    // Positive u is the figure's own right (viewer-left from the front).
    K.box(1.9,.2,10.7,.65,1.9,.7,red); K.box(2.05,.85,11.8,.55,1.4,.6,skin); K.box(2.0,1.18,13.0,.6,1.25,.25,skin);
    K.box(-1.9,.2,10.7,.65,1.9,.7,red); K.box(-1.95,.85,12.1,.55,1.2,.55,skin); K.sph(-1.9,1.2,13.15,.43,skin);
    for(let i=0;i<5;i++){const u=-1.8+(i-2)*.17;K.box(u,1.1,12.7,.06,2.5+(i%2)*.3,.06,green);K.shape('bulb',u,1.1,15.1+(i%2)*.3,.22,.7,.22,gold);}
    K.solidRect(0,0,4.8,4.8,4.5); K.ob(0,0,2.4,15.8); K.board('TELANGANA THALLI',0,3.5,2.4,8);
  }, clear: 8 },
  gandhi_statue: { draw: (K) => { statue(K, 0, 0, 6, 2, '#5a5a58'); }, clear: 0, keepBuildings: true },
  victory_mahakali: { draw: (K) => { K.box(0, 0, 0, 10, 1.4, 10, '#cfc7b8'); K.cyl(0, 0, 1.4, 1.3, 16, '#e8e1d2', 'cyl8'); K.shape('dome', 0, 0, 17.4, 3, 2.4, 3, '#d6a93a'); K.board('VICTORY WAR MEMORIAL', 0, 5.2, 2.4, 8); K.solidRect(0, 0, 4, 4, 17); }, clear: 9 },
  sardar_patel: { draw: (K) => { statue(K, 0, 0, 8, 2.5, '#4a4a48'); K.board('SARDAR PATEL', 0, 3, 2.4, 7); }, clear: 0, keepBuildings: true },
};

export const EXTRA_MODELS: Record<string, (K: Kit, l: Landmark) => void> = {};
for (const [k, r] of Object.entries(R_)) EXTRA_MODELS[`x_${k}`] = (K, l) => r.draw(K, l.d!);

export function EXTRA_LANDMARKS(): Landmark[] {
  const out: Landmark[] = [];
  for (const original of LM_DATA) {
    const D = correctedLandmarkData(original);
    const r = R_[D.key]; if (!r) continue;
    const rot = r.rot ?? D.rot ?? D.srot ?? 0;
    out.push({ kind: `x_${D.key}` as any, name: D.name, lat: D.lat, lon: D.lon, rot, clear: r.keepBuildings ? 0 : (r.clear ?? (D.w ? [D.w + 6, (D.d || D.w) + 6] : 14)), d: D });
  }
  return out;
}

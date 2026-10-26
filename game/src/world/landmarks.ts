import { TPL, TiledBatch, rng } from '../core/util';
import type { LmData } from './landmarks_data';
import { EXTRA_LANDMARKS, EXTRA_MODELS } from './landmarks2';
import { drawDurgamBridge } from './durgam-bridge';
import { drawLionCapital } from './landmark_symbols';
import { drawGolcondaSummit } from './golconda-summit';

// Stylised monument models with inherited anchors and proportions. Per-feature evidence and unresolved accuracy
// gaps are recorded in docs/landmark-audit.json; source coverage alone is not street verification.
// Plain map footprints inside each monument's clear zone are removed.
// rot = compass bearing (deg, clockwise from north) of the monument's front; the local frame has v towards the front
// and u to the right of someone looking out of the front.
export type { LmKind } from './landmark_catalog';
import { BASE_LANDMARKS, landmarkId, placeCatalogue, assignRenderTiles } from './landmark_catalog';
import type { LmKind } from './landmark_catalog';
export { BASE_LANDMARKS as LANDMARKS } from './landmark_catalog';
export interface Landmark { id?: string; renderTile?: [number, number]; kind: LmKind; name: string; lat: number; lon: number; rot: number; clear: number | [number, number] | [number, number, number, number]; p?: Record<string, number>; x?: number; z?: number; d?: LmData }


export function placeLandmarks(origin: { lat: number; lon: number }, availableTiles?: readonly (readonly number[])[]) {
  const catalogue = new Map(placeCatalogue(origin).map((p) => [p.id, p]));
  const models = [...BASE_LANDMARKS, ...EXTRA_LANDMARKS()].map((l) => {
    const id = landmarkId(l), p = catalogue.get(id)!;
    return { ...l, id, x: p.x, z: p.z };
  });
  return availableTiles ? assignRenderTiles(models, availableTiles) : models;
}
// does a landmark's clear zone cover (x, z)? (plain map buildings there are replaced by the model)
export function inClear(l: Landmark, x: number, z: number) {
  const dx = x - l.x!, dz = z - l.z!;
  if (typeof l.clear === 'number') return l.clear > 0 && dx * dx + dz * dz < l.clear * l.clear;
  const r = (l.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const u = dx * c + dz * s - (l.clear[2] || 0), v = dx * s - dz * c - (l.clear[3] || 0);
  return Math.abs(u) < l.clear[0] / 2 && Math.abs(v) < l.clear[1] / 2;
}

type XZ = [number, number];
export interface LmCtx {
  B: Record<string, TiledBatch>;
  obstacle: (x: number, z: number, r: number, top: number) => void;
  solid: (ring: XZ[], h: number) => void;          // a footprint the car stands on / bumps into
  road: (x: number, z: number, pad: number) => boolean;   // is there a mapped road here (walls leave gaps)
  roadY: (x: number, z: number) => number | null;  // deck height of a road here
  roadNear?: (x: number, z: number, R: number) => { d: number; cx: number; cz: number; hx: number; hz: number; w: number } | null;   // nearest street centreline
  sign?: (id: string, text: string, bg: string, fg: string, c: number[], facing: number[], w: number, h: number) => void;   // a name board (front normal)
}

// local modelling frame of one monument
export class Kit {
  c: number; s: number; ry0: number;
  constructor(public x0: number, public z0: number, rotDeg: number, public k: LmCtx, public y0 = 0) {
    const r = (rotDeg * Math.PI) / 180; this.c = Math.cos(r); this.s = Math.sin(r); this.ry0 = -r;
  }
  P(u: number, v: number): XZ { return [this.x0 + u * this.c + v * this.s, this.z0 + u * this.s - v * this.c]; }
  L(x: number, z: number): XZ { const dx = x - this.x0, dz = z - this.z0; return [dx * this.c + dz * this.s, dx * this.s - dz * this.c]; }
  // local ry that turns a shape's width (local u) across a street running along world (hx, hz)
  across(hx: number, hz: number) { return Math.atan2(-hx, -hz) - this.ry0; }
  // box: centre (u, v), bottom y, sizes along u (w), up (h), along v (d)
  box(u: number, v: number, y: number, w: number, h: number, d: number, col: string, ry = 0, b = 'st') { const [x, z] = this.P(u, v); this.k.B[b].box(x, this.y0 + y + h / 2, z, w, h, d, col, { ry: this.ry0 + ry }); }
  cyl(u: number, v: number, y: number, r: number, h: number, col: string, t = 'cyl', b = 'st') { const [x, z] = this.P(u, v); this.k.B[b].add(TPL[t], x, this.y0 + y + h / 2, z, r, h, r, col, { ry: this.ry0 }); }
  // lathe shapes and arch panels have their base at 0
  shape(t: string, u: number, v: number, y: number, sx: number, h: number, sz: number, col: string, ry = 0, b = 'st', rx = 0) { const [x, z] = this.P(u, v); this.k.B[b].add(TPL[t], x, this.y0 + y, z, sx, h, sz, col, { ry: this.ry0 + ry, rx }); }
  sph(u: number, v: number, y: number, r: number, col: string, ry = 0, sy = r) { const [x, z] = this.P(u, v); this.k.B.st.add(TPL.sph, x, this.y0 + y, z, r, sy, r, col, { ry: this.ry0 + ry }); }
  // a row of arch panels from (u0, v0) to (u1, v1)
  arcade(t: string, u0: number, v0: number, u1: number, v1: number, n: number, y: number, h: number, d: number, col: string) {
    const L = Math.hypot(u1 - u0, v1 - v0), ry = Math.atan2(v1 - v0, u1 - u0);
    for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; this.shape(t, u0 + (u1 - u0) * f, v0 + (v1 - v0) * f, y, L / n + 0.02, h, d, col, ry); }
  }
  // the same arcade on all four faces of a w x d block
  faces(t: string, w: number, d: number, nu: number, nv: number, y: number, h: number, depth: number, col: string, inset = 0) {
    const hu = w / 2 - inset, hv = d / 2 - inset;
    this.arcade(t, -hu, hv, hu, hv, nu, y, h, depth, col); this.arcade(t, -hu, -hv, hu, -hv, nu, y, h, depth, col);
    this.arcade(t, hu, -hv, hu, hv, nv, y, h, depth, col); this.arcade(t, -hu, -hv, -hu, hv, nv, y, h, depth, col);
  }
  // a name board at (u, v), facing the front (+v) unless turned by ry
  board(text: string, u: number, v: number, y: number, w: number, h = 0.9, bg = '#1f3a68', fg = '#ffffff', ry = 0) {
    if (!this.k.sign) return;
    const fu = Math.sin(ry), fv = Math.cos(ry), [x, z] = this.P(u + fu * 0.08, v + fv * 0.08), [x2, z2] = this.P(u + fu, v + fv), [x0, z0] = this.P(u, v);
    this.box(u, v, y - h / 2 - 0.05, w + 0.2, h + 0.1, 0.12, bg, ry);
    this.k.sign(`lm_${this.x0.toFixed(0)}_${this.z0.toFixed(0)}_${u.toFixed(0)}_${v.toFixed(0)}`, text.toUpperCase().slice(0, 30), bg, fg, [x, this.y0 + y - h / 2 - 0.05, z], [x2 - x0, 0, z2 - z0], w, h);
  }
  // collision footprints
  solidRect(u: number, v: number, w: number, d: number, h: number) { this.k.solid([this.P(u - w / 2, v - d / 2), this.P(u + w / 2, v - d / 2), this.P(u + w / 2, v + d / 2), this.P(u - w / 2, v + d / 2)], this.y0 + h); }
  solidCircle(u: number, v: number, r: number, h: number, n = 14) { const ring: XZ[] = []; for (let i = 0; i < n; i++) ring.push(this.P(u + Math.cos((i / n) * Math.PI * 2) * r, v + Math.sin((i / n) * Math.PI * 2) * r)); this.k.solid(ring, this.y0 + h); }
  ob(u: number, v: number, r: number, top: number) { const [x, z] = this.P(u, v); this.k.obstacle(x, z, r, this.y0 + top); }
  road(u: number, v: number, pad = 4) { const [x, z] = this.P(u, v); return this.k.road(x, z, pad); }
  // chhatri: small domed kiosk on 4 posts
  chhatri(u: number, v: number, y: number, s: number, col: string, dome = 'dome') {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.box(u + a * s * 0.38, v + b * s * 0.38, y, s * 0.12, s * 0.9, s * 0.12, col);
    this.box(u, v, y + s * 0.9, s * 1.05, s * 0.12, s * 1.05, col);
    this.shape(dome, u, v, y + s * 1.02, s * 0.85, s * 0.8, s * 0.85, col);
  }
  // a wall that leaves gaps where mapped roads pass
  wall(u0: number, v0: number, u1: number, v1: number, y: number, h: number, t: number, col: string, solid = true, merlons = true) {
    const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 4)), ry = Math.atan2(v1 - v0, u1 - u0);
    for (let i = 0; i < n; i++) {
      const f0 = i / n, f1 = (i + 1) / n, fm = (f0 + f1) / 2, u = u0 + (u1 - u0) * fm, v = v0 + (v1 - v0) * fm;
      if (this.road(u, v, t / 2 + 3)) continue;
      this.box(u, v, y, L / n + 0.05, h, t, col, ry);
      if (merlons) this.box(u, v, y + h, (L / n) * 0.5, 0.9, t * 0.6, col, ry);
      if (solid) { const a = this.P(u0 + (u1 - u0) * f0, v0 + (v1 - v0) * f0), b = this.P(u0 + (u1 - u0) * f1, v0 + (v1 - v0) * f1); const nx = (-(b[1] - a[1]) / (L / n)) * t / 2, nz = ((b[0] - a[0]) / (L / n)) * t / 2; this.k.solid([[a[0] - nx, a[1] - nz], [b[0] - nx, b[1] - nz], [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]], this.y0 + y + h); }
    }
  }
  // A rocky hill. Wheel support is captured from these actual mound/rock faces;
  // concentric flat collision terraces would put the car inside the visible hill.
  hill(u: number, v: number, ru: number, rv: number, h: number, rock: string, scrub: string, seed: number) {
    const [x, z] = this.P(u, v);
    this.k.B.st.add(TPL.mound, x, this.y0, z, ru * 2, h, rv * 2, scrub, { ry: this.ry0 });
    { const [x2, z2] = this.P(u + ru * 0.12, v - rv * 0.1); this.k.B.st.add(TPL.mound, x2, this.y0, z2, ru * 1.5, h * 0.93, rv * 1.6, rock, { ry: this.ry0 + 0.7 }); }
    const r = rng(seed);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, f = Math.sqrt(r()) * 0.95;
      const fy = Math.max(0, Math.min(1, 1 - Math.pow(f, 1.4)));      // height of the mound at this radius
      const bu = u + Math.cos(a) * ru * f, bv = v + Math.sin(a) * rv * f, s = r.range(2.5, 7);
      const [bx, bz] = this.P(bu, bv); this.k.B.st.add(TPL.ico0, bx, this.y0 + h * fy + s * 0.15, bz, s, s * 0.7, s * 0.9, r.pick([rock, '#6f675d', '#958b7c']), { ry: r() * 6 });
    }
  }
}

// ===================================================================================================================
export function drawLandmark(l: Landmark, ctx: LmCtx) {
  let rot = l.rot;
  // the mapped footprint gives the front only up to a half turn: face whichever long side has the nearer street
  if (l.kind.startsWith('x_') && ctx.roadNear && !(Array.isArray(l.clear) && l.clear.length === 4)) {
    const dd = (l.d?.d || 20) / 2 + 14;
    const probe = (r: number) => { const [x, z] = new Kit(l.x!, l.z!, r, ctx).P(0, dd); return ctx.roadNear!(x, z, 50)?.d ?? 99; };
    if (probe(rot + 180) + 5 < probe(rot)) rot += 180;
  }
  const K = new Kit(l.x!, l.z!, rot, ctx);
  const f = MODELS[l.kind] || (EXTRA_MODELS as any)[l.kind]; if (f) f(K, l);
}

const MODELS: Partial<Record<LmKind, (K: Kit, l: Landmark) => void>> = {
  // ---------------- Charminar (1591): 20 m square, four great pointed arches, clocks, two arcaded storeys, four
  // fluted minarets with two balconies above the roof and onion domes; roof mosque at the west end ----------------
  charminar(K) {
    const C = '#E9D9B6', D = '#B9A788', S = '#8C7B62', W = '#F5F2EA';
    K.box(0, 0, 0, 25, 0.9, 25, '#A89C86');                                   // plinth
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const fu = Math.sin(ry), fv = Math.cos(ry);                                // face normal in (u, v)
      const at = (along: number, out: number): [number, number] => [fu * out + fv * along, fv * out - fu * along];
      // District architecture reference: 11 m opening; archBig's opening is 55% of its panel width.
      let [u, v] = at(0, 9.1); K.shape('archBig', u, v, 0.9, 20, 21, 1.8, C, ry);
      // clock band, clock, balcony
      [u, v] = at(0, 9.9); K.box(u, v, 21.9, 18.4, 2.2, 0.6, C, ry);
      [u, v] = at(0, 10.25); { const [x, z] = K.P(u, v); K.k.B.st.add(TPL.cyl, x, 23.0, z, 1.05, 0.12, 1.05, W, { ry: K.ry0 + ry, rx: Math.PI / 2 }); K.k.B.st.box(x, 23.15, z, 0.08, 0.8, 0.08, '#1a1a1a', { ry: K.ry0 + ry }); }
      [u, v] = at(0, 10.4); K.box(u, v, 24.1, 19.6, 0.45, 1.6, D, ry);
      // first gallery: 11 small arches; second: 13 smaller arches and a parapet
      [u, v] = at(0, 9.4); K.shape('archArc', u, v, 24.55, 18.2, 4.2, 0.7, C, ry);
      { const a0 = at(-9.1, 9.5), a1 = at(9.1, 9.5); K.arcade('archArc', a0[0], a0[1], a1[0], a1[1], 11, 24.55, 4.0, 0.7, C); }
      [u, v] = at(0, 9.7); K.box(u, v, 28.7, 19.4, 0.4, 1.2, D, ry);
      { const a0 = at(-9.1, 9.5), a1 = at(9.1, 9.5); K.arcade('archArc', a0[0], a0[1], a1[0], a1[1], 13, 29.1, 2.6, 0.5, C); }
      [u, v] = at(0, 9.5); K.box(u, v, 31.7, 19.0, 0.35, 0.6, D, ry);
      for (let i = -8; i <= 8; i += 2) { [u, v] = at(i, 9.5); K.box(u, v, 32.0, 0.55, 0.7, 0.45, C, ry); }   // merlons
    }
    K.box(0, 0, 20.6, 17, 1.2, 17, S); K.box(0, 0, 24.5, 17.6, 6.6, 17.6, S);  // floors / dark inner core behind galleries
    K.box(0, 0, 31.1, 18.6, 0.6, 18.6, D);                                      // roof terrace
    // roof mosque at the west end: low hall with three small domes
    K.box(-6.5, 0, 31.7, 3.4, 2.6, 12, C); for (const vv of [-3.6, 0, 3.6]) K.shape('onion', -6.5, vv, 34.3, 1.9, 2.3, 1.9, C);
    // Hyderabad District and Telangana Tourism both specify48.7m minarets. Retain the lower gallery,
    // shorten the unsupported legacy upper tiers to that reference instead of scaling the11m arch opening.
    const upperScale = (48.7 - 24.3) / (55.8 - 24.3), top = (y: number) => 24.3 + (y - 24.3) * upperScale;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const u = su * 10, v = sv * 10;
      K.cyl(u, v, .9, 2.55, 23.4, C, 'cyl10');
      K.cyl(u, v, top(24.3), 3.15, .55*upperScale, D, 'cyl10'); K.cyl(u, v, top(24.85), 2.95, .9*upperScale, C, 'cyl10');
      K.cyl(u, v, top(25.7), 2.05, 9.3*upperScale, C, 'cyl10');
      K.cyl(u, v, top(35), 2.85, .5*upperScale, D, 'cyl10'); K.cyl(u, v, top(35.5), 2.65, 1*upperScale, C, 'cyl10');
      K.cyl(u, v, top(36.5), 1.85, 7*upperScale, C, 'cyl10');
      K.cyl(u, v, top(43.5), 2.6, .45*upperScale, D, 'cyl10'); K.cyl(u, v, top(43.95), 2.4, .9*upperScale, C, 'cyl10');
      K.cyl(u, v, top(44.85), 1.7, 2.6*upperScale, C, 'cyl10');
      K.shape('melon', u, v, top(47.4), 4, 1*upperScale, 4, D);
      K.shape('onion', u, v, top(48.3), 3.7, 5*upperScale, 3.7, C);
      K.cyl(u, v, top(53.2), .14, 2.6*upperScale, '#9c8a64'); K.ob(u, v, 2.7, 49);
    }
    // the four piers are solid; the crossing under the arches is open (walk/drive through is not possible: the
    // real monument is on a raised plinth)
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.solidRect(su * 7.3, sv * 7.3, 5.6, 5.6, 31.4);
    K.solidRect(0, 0, 20, 20, 0.9);
  },
  // Char Kaman: four arched gateways around Gulzar Houz, 19-21 m high, over the four streets
  charkaman(K) {
    const C = '#E4D3AE';
    for (const ry0 of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      // each gateway straddles its street: centred on the carriageway, a pier on either kerb
      let u = Math.sin(ry0) * 105, v = Math.cos(ry0) * 105, ry = ry0, span = 14;
      const [wx, wz] = K.P(u, v), rd = K.k.roadNear?.(wx, wz, 12);
      if (rd) { [u, v] = K.L(rd.cx, rd.cz); ry = K.across(rd.hx, rd.hz); span = Math.max(14, rd.w + 5.5); }
      const fu = Math.cos(ry), fv = -Math.sin(ry);                 // local direction of the span
      K.shape('archBig', u, v, 0, span, 19, 3, C, ry);
      K.box(u, v, 19, span + 0.4, 1.4, 3.4, '#B9A788', ry);
      for (const side of [-1, 1]) {
        const pu = u + fu * side * (span / 2 - 1.4), pv = v + fv * side * (span / 2 - 1.4);
        K.box(pu, pv, 0, 2.8, 19, 3.2, C, ry);                       // the pier on this kerb
        K.cyl(pu, pv, 19, 0.7, 3, C, 'cyl8'); K.shape('dome', pu, pv, 22, 1.5, 1.5, 1.5, C); K.ob(pu, pv, 1.6, 19);
      }
    }
    K.cyl(0, 0, 0, 5, 1.0, '#C9BC9E', 'cyl8'); K.cyl(0, 0, 1.0, 1.0, 1.6, '#C9BC9E', 'cyl8');   // Gulzar Houz fountain
    K.solidCircle(0, 0, 5, 1.0, 8);
  },
  // Mecca Masjid: long dark-grey granite prayer hall, five great arches facing east, two stout octagonal minarets
  mecca(K) {
    const G = '#7D766C', Gd = '#5A544C', P = '#A59C8E', Wt = '#E8E1D0';
    K.box(52, -8, 0, 118, 0.12, 100, P);                                       // forecourt paving (in front = +v)
    K.box(0, 0, 0, 65, 1.0, 52, Gd);                                            // plinth
    K.solidRect(0, 0, 65, 52, 1.0);
    K.box(0, -3, 1.0, 64, 21, 46, G);                                           // hall body
    K.arcade('arch', -30, 23.0, 30, 23.0, 5, 1.0, 19.5, 4, G);                  // the five great arches
    // The facade projects beyond the hall footprint. Match the solid side piers
    // of TPL.arch (62% opening) while keeping each arch's opening traversable.
    const bay = 60 / 5 + 0.02, pier = bay * 0.19;
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) K.solidRect(-24 + i * 12 + side * (bay - pier) / 2, 23, pier, 4, 20.5);
    K.box(0, 22.5, 1.0, 60, 0.3, 3.2, '#3d3934');                               // shadowed interior behind them
    K.box(0, 23.2, 20.5, 62, 2.6, 2.2, G);                                      // cornice band
    for (let i = -30; i <= 30; i += 2.6) K.box(i, 23.4, 23.1, 1.1, 1.2, 1.0, G); // conch-shaped crenellations
    for (let i = -23; i <= 23; i += 2.6) { K.box(31.6, i, 21.5, 1.0, 1.2, 1.1, G); K.box(-31.6, i, 21.5, 1.0, 1.2, 1.1, G); }
    for (const su of [-1, 1]) {
      const u = su * 33.5, v = 24;                                              // facade minarets
      K.cyl(u, v, 0, 3.0, 26, G, 'cyl8'); K.cyl(u, v, 26, 3.6, 0.7, Gd, 'cyl8');
      K.cyl(u, v, 26.7, 2.5, 3.2, G, 'cyl8'); K.shape('dome', u, v, 29.9, 4.4, 3.6, 4.4, G); K.cyl(u, v, 33.4, 0.15, 2.2, '#6b6458');
      K.solidCircle(u, v, 3.0, 26, 8);
      K.cyl(su * 31.5, -26, 0, 1.6, 23, G, 'cyl8'); K.shape('dome', su * 31.5, -26, 23, 2.6, 2.2, 2.6, G);   // rear corner minarets
      K.solidCircle(su * 31.5, -26, 1.6, 23, 8);
    }
    K.solidRect(0, -3, 64, 46, 22);
    // Asaf Jahi tombs: a long low white arcade in the courtyard south-east of the hall, little minarets at its ends
    const tu = 11, tv = 51;
    K.box(tu, tv, 0, 11, 6.0, 59, Wt); K.arcade('archArc', tu - 5.6, tv - 29, tu - 5.6, tv + 29, 14, 0.6, 5.0, 0.6, Wt); K.arcade('archArc', tu + 5.6, tv - 29, tu + 5.6, tv + 29, 14, 0.6, 5.0, 0.6, Wt);
    for (const ev of [-26, 26]) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const u = tu + a * 4.5, v = tv + ev + b * 2.4; K.cyl(u, v, 6, 0.45, 3.5, Wt, 'cyl8'); K.shape('dome', u, v, 9.5, 1.1, 1.0, 1.1, Wt); K.cyl(u, v, 10.5, 0.06, 1.0, '#9a927f'); }
    K.solidRect(tu, tv, 11, 59, 6);
    // east gate with two minarets in the compound wall (Charminar Road side)
    const gv = 140, gu = -7;
    K.shape('arch', gu, gv, 0, 14, 12, 4, G); for (const s of [-1, 1]) { K.cyl(gu + s * 8, gv, 0, 1.6, 17, G, 'cyl8'); K.shape('dome', gu + s * 8, gv, 17, 2.4, 2.0, 2.4, G); K.ob(gu + s * 8, gv, 1.8, 17); }
    for (const side of [-1, 1]) K.solidRect(gu + side * 14 * 0.405, gv, 14 * 0.19, 4, 12);
    K.wall(gu - 9.6, gv, -58, gv, 0, 6, 1.2, G); K.wall(gu + 9.6, gv, 52, gv, 0, 6, 1.2, G);
  },
  // Chowmahalla Palace: long N-S walled complex; north court with pool framed by long ranges and the Khilwat
  // Mubarak durbar hall; south court of four neoclassical palaces around a garden and pool; clock-tower gate
  chowmahalla(K) {
    const C = '#EFE6D2', Wt = '#FAF8F2', O = '#E3C98A', Wa = '#4FA3A5', L = '#6E9B4E';
    K.wall(-56, -207, 56, -207, 0, 7, 1.2, '#D8CDB4'); K.wall(56, -207, 56, 207, 0, 7, 1.2, '#D8CDB4'); K.wall(56, 207, -56, 207, 0, 7, 1.2, '#D8CDB4'); K.wall(-56, 207, -56, -207, 0, 7, 1.2, '#D8CDB4');
    // north court
    K.box(0, 135, 0, 39, 0.1, 101, L, 0, 'park'); K.box(0, 135, 0.1, 14, 0.15, 44, Wa, 0, 'water'); K.cyl(0, 135, 0.1, 0.5, 2.0, Wt);
    for (const su of [-1, 1]) { const u = su * 33; K.box(u, 132, 0, 22, 10, 124, C); K.arcade('archArc', u - su * 11.05, 72, u - su * 11.05, 192, 24, 0.5, 4.2, 0.6, Wt); K.arcade('archArc', u - su * 11.05, 72, u - su * 11.05, 192, 24, 5.2, 4.2, 0.6, Wt); K.box(u, 132, 10, 22.6, 0.6, 124.6, Wt); K.solidRect(u, 132, 22, 124, 10); }
    // Khilwat Mubarak: two-storey arcaded hall at the south end of the north court, kiosks and Mughal domes
    const kv = 55; K.box(0, kv, 0, 54, 16, 30, C); K.arcade('archArc', -26, kv + 15.05, 26, kv + 15.05, 9, 0.6, 7.2, 0.8, Wt); K.arcade('archArc', -26, kv + 15.05, 26, kv + 15.05, 13, 8.2, 6.4, 0.8, Wt);
    K.box(0, kv, 16, 55, 0.7, 31, Wt); for (let i = -24; i <= 24; i += 3) K.box(i, kv + 15.2, 16.7, 1.6, 0.9, 0.4, Wt);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.chhatri(a * 24, kv + b * 12, 16.7, 4.2, C);
    K.shape('onion', 0, kv, 16.7, 9, 8, 9, Wt); K.cyl(0, kv, 24.6, 0.12, 2.2, '#C9A23F'); K.solidRect(0, kv, 54, 30, 16);
    // clock-tower gateway (north end)
    K.box(0, 200, 0, 14, 15, 9, C); K.shape('archRound', 0, 204.6, 0, 7, 9, 0.6, Wt); K.box(0, 200, 15, 6, 5, 6, C); K.shape('dome', 0, 200, 20, 6, 4.5, 6, Wt);
    { const [x, z] = K.P(0, 203.1); K.k.B.st.add(TPL.cyl, x, 17.5, z, 1.4, 0.15, 1.4, '#FAFAF5', { ry: K.ry0, rx: Math.PI / 2 }); }
    K.solidRect(0, 200, 14, 9, 15);
    // south court: four palaces (two long E/W ranges, N and S end blocks), double-height colonnades
    K.box(0, -110, 0, 54, 0.1, 71, L, 0, 'park'); K.box(0, -110, 0.1, 19, 0.15, 45, Wa, 0, 'water');
    for (const su of [-1, 1]) {
      const u = su * 38; K.box(u, -110, 0, 22, 13, 122, su > 0 ? C : O); K.box(u, -110, 13, 22.6, 0.8, 122.6, Wt);
      for (let i = 0; i < 20; i++) { const vv = -168 + i * 6.1; K.cyl(u - su * 11.6, vv, 0, 0.45, 12.4, Wt, 'cyl8'); }
      for (let i = -55; i <= 55; i += 5) K.box(u - su * 11.2, -110 + i, 13.8, 0.4, 1.0, 1.6, Wt);
      K.solidRect(u, -110, 22, 122, 13);
    }
    K.box(0, -50, 0, 54, 14, 27, C); for (let i = 0; i < 9; i++) K.cyl(-24 + i * 6, -63.8, 0, 0.5, 13, Wt, 'cyl8'); K.box(0, -50, 14, 55, 0.8, 28, Wt); K.solidRect(0, -50, 54, 27, 14);
    K.box(0, -185, 0, 43, 14, 26, O); for (let i = 0; i < 7; i++) K.cyl(-18 + i * 6, -171.8, 0, 0.5, 13, Wt, 'cyl8'); K.box(0, -185, 14, 44, 0.8, 27, Wt); K.solidRect(0, -185, 43, 26, 14);
  },
  // Falaknuma Palace: long white neoclassical palace alone on its hilltop, pedimented portico facing north,
  // curved forward wings around a fountain forecourt, service ranges behind ("scorpion" plan)
  falaknuma(K) {
    const Wt = '#F4F0E6', Cr = '#E6DCC8', G = '#6F9A4A';
    K.hill(0, -10, 105, 125, 22, '#8A7F70', '#6E7F49', 31);
    K.y0 = 22;
    K.box(0, 0, 0, 150, 0.4, 170, G, 0, 'park');
    K.box(0, -8, 0, 72, 2.2, 32, Cr);                                          // terrace
    K.box(0, -8, 2.2, 70, 14.5, 28, Wt);                                       // main block, two storeys
    K.arcade('archRound', -33, 6.05, 33, 6.05, 15, 2.2, 6.4, 0.5, Cr); K.arcade('archRound', -33, 6.05, 33, 6.05, 15, 9.0, 6.0, 0.5, Cr);
    K.box(0, -8, 16.7, 71, 0.6, 29, Cr); for (let i = -34; i <= 34; i += 1.6) K.box(i, 6.1, 17.3, 0.3, 1.0, 0.3, Wt);   // balustrade
    for (let i = -32; i <= 32; i += 8) K.shape('dome', i, 6.1, 18.3, 0.9, 1.2, 0.9, Cr);   // urns
    // central portico with columns and pediment, crescent and star on top
    K.box(0, 10.5, 2.2, 22, 1.0, 9, Cr); for (let i = 0; i < 6; i++) K.cyl(-9.5 + i * 3.8, 14.3, 3.2, 0.55, 13, Wt, 'cyl10');
    K.box(0, 10.5, 16.2, 23, 1.4, 9.6, Wt); K.shape('prism', 0, 14.6, 17.6, 23, 5, 1.6, Wt); K.shape('prism', 0, 10.5, 17.6, 22.6, 4.9, 8.6, Cr);
    K.box(0, 14.9, 23, 0.5, 1.6, 0.4, '#C9A23F'); K.sph(0, 14.9, 25.2, 0.8, '#C9A23F');
    // curved forward wings (quadrants) reaching north around the forecourt
    for (const su of [-1, 1]) for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) / 9) * (Math.PI / 2), R = 36;
      const u = su * (35 + R * Math.sin(a)), v = 6 + R - R * Math.cos(a), ry = Math.atan2(Math.sin(a), su * Math.cos(a));
      K.box(u, v, 2.2, 13, 10.5, 9.6, Wt, ry); K.solidRect(u, v, 8, 8, 12.7);
    }
    K.box(0, -40, 0, 46, 9, 36, Cr); K.box(0, -40, 9, 46.6, 0.5, 36.6, Wt); K.solidRect(0, -40, 46, 36, 9.5);      // zenana and service ranges
    K.solidRect(0, -8, 70, 28, 16.7); K.solidRect(0, 10.5, 22, 9, 16.2);
    K.cyl(0, 42, 0, 6, 0.8, Wt); K.cyl(0, 42, 0.8, 1.2, 2.4, Wt); K.box(0, 42, 0.8, 9, 0.15, 9, '#4FA3A5', 0, 'water');      // Carrara fountain
  },
  // Golconda: granite hill with the Baradari on top, citadel walls with round bastions around its base
  golconda(K) {
    const R = '#857B6F', Rd = '#5C554C', Pl = '#C8B99E', Rk = '#7a7064';
    // granite hill centred a little NE of the summit pavilion
    const hu = 35, hv = 45, ru = 205, rv = 230, H = 78;
    K.hill(hu, hv, ru, rv, H, Rk, '#7d7660', 77);
    // a rough granite massif, not a smooth dome: overlapping knolls and outcrops, dark rock showing through scrub
    for (const [ou, ov, s1, s2, hh, ry] of [[-60, 40, 120, 90, 62, 0.4], [90, -40, 110, 140, 48, 1.1], [40, 130, 140, 100, 52, 2.0], [-20, -70, 100, 90, 58, 2.7], [0, 0, 70, 60, 86, 0.2]] as number[][]) {
      const [x, z] = K.P(hu + ou, hv + ov); K.k.B.st.add(TPL.mound, x, 0, z, s1 * 2, hh, s2 * 2, ry > 1.5 ? R : Rd, { ry: K.ry0 + ry });
    }
    { const r = rng(78); for (let i = 0; i < 90; i++) { const a = r() * Math.PI * 2, f = 0.15 + r() * 0.8, fy = Math.max(0, 1 - Math.pow(f, 1.4)), sz = r.range(6, 14); const [x, z] = K.P(hu + Math.cos(a) * ru * f, hv + Math.sin(a) * rv * f); K.k.B.st.add(TPL.ico0, x, H * fy + sz * 0.1, z, sz, sz * 0.6, sz * 0.8, r.pick([R, Rd, '#9a8f80']), { ry: r() * 6 }); } }
    // rings of crenellated walls climbing the hill, broken where the slope is steep (gaps), with ruined arcades
    for (const [fr, seed] of [[0.82, 1], [0.62, 2], [0.42, 3]] as [number, number][]) {
      const fy = 1 - Math.pow(fr, 1.4), y = H * fy - 1, n = 34, r = rng(seed * 101);
      for (let i = 0; i < n; i++) {
        if (r() < 0.3) continue;
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const u0 = hu + Math.cos(a0) * ru * fr, v0 = hv + Math.sin(a0) * rv * fr, u1 = hu + Math.cos(a1) * ru * fr, v1 = hv + Math.sin(a1) * rv * fr;
        K.wall(u0, v0, u1, v1, y, 7, 2.5, Rd, false, true);
        if (r() < 0.35) K.arcade('arch', u0, v0, u1, v1, 4, y, 6, 2.6, Pl);
        if (i % 4 === 0) { K.cyl(u0, v0, y, 4, 9, R, 'cyl24'); }
      }
    }
    drawGolcondaSummit(K);
    K.y0 = 0;
    // citadel wall ring with round bastions around the base (gaps where roads cross)
    const ring = 64, cu = 262, cv = 300;
    for (let i = 0; i < ring; i++) {
      const a0 = (i / ring) * Math.PI * 2, a1 = ((i + 1) / ring) * Math.PI * 2;
      K.wall(hu + Math.cos(a0) * cu, hv + Math.sin(a0) * cv, hu + Math.cos(a1) * cu, hv + Math.sin(a1) * cv, 0, 12, 4, R);
      if (i % 3 === 0) { const u = hu + Math.cos(a0) * cu, v = hv + Math.sin(a0) * cv; if (!K.road(u, v, 10)) { K.cyl(u, v, 0, 6.5, 15, R, 'cyl24'); for (let k = 0; k < 8; k++) { const b = (k / 8) * Math.PI * 2; K.box(u + Math.cos(b) * 6, v + Math.sin(b) * 6, 15, 1.4, 1.1, 1.4, R); } K.solidCircle(u, v, 6.5, 15, 10); } }
    }
  },
  // Bala Hisar Darwaza: the citadel gate, a tall pointed arch in a rectangular frame, peacock/yali spandrels
  balahisar(K) {
    const R = '#8A8073', Pl = '#C8B99E';
    K.shape('arch', 0, 0, 0, 22, 17, 12, R); K.box(0, 0, 17, 22.6, 2.2, 12.4, R);
    for (const s of [-1, 1]) { K.box(s * 7.5, 6.05, 11, 4.0, 3.0, 0.3, Pl); K.solidRect(s * 8.2, 0, 5.6, 12, 19); }
    for (let i = -10; i <= 10; i += 2.2) K.box(i, 6, 19.2, 1.1, 1.0, 0.9, R);
    K.box(0, -11, 0, 18, 9, 10, R); K.shape('dome', 0, -11, 9, 12, 6, 9, '#958a7b');     // the domed clapping portico
  },
  // Fateh Darwaza: outer gate, 4 x 7.6 m spiked doors in a domed gatehouse with wall stubs and bastions
  fateh(K) {
    const R = '#857B6F';
    K.shape('arch', 0, 0, 0, 16, 12.5, 9, R); K.box(0, 0, 12.5, 16.4, 2, 9.4, R); K.shape('dome', 0, 0, 14.5, 7, 4, 7, R);
    for (const s of [-1, 1]) { K.box(s * 2.6, 4.6, 0, 1.6, 7.6, 0.35, '#4A3A2A', s * 0.9); for (let k = 0; k < 6; k++) K.cyl(s * 2.6, 4.9, 1 + k * 1.1, 0.07, 0.4, '#2E2E2E'); K.solidRect(s * 6.5, 0, 3, 9, 14.5); }
    K.wall(8, 0, 40, -3, 0, 13, 5, R); K.wall(-8, 0, -40, 3, 0, 13, 5, R);
    for (const s of [-1, 1]) { K.cyl(s * 40, -s * 3, 0, 7, 16, R, 'cyl24'); K.solidCircle(s * 40, -s * 3, 7, 16, 10); }
  },
  // a large Qutb Shahi tomb: arcaded terrace, cube with arcaded verandah and parapet, corner minarets, lotus drum,
  // big bulbous dome (grey-black weathered)
  qstomb(K, l) {
    const p = l.p!, T = p.terrace, C = p.cube, Dm = p.dome, H = p.h, n = p.arches;
    const Gp = '#C9C0AE', Gd = '#5F5B55', Gk = '#3E3B37';
    const th = T > 40 ? 4 : 2.5;
    K.box(0, 0, 0, T, th, T, '#A9A08F'); K.faces('niche', T, T, Math.round(T / 5), Math.round(T / 5), 0.3, th * 0.8, 0.3, '#8f8676', -0.05);
    K.box(0, T / 2 + 4, 0, 6, th / 2, 8, '#A9A08F');                            // steps
    const ch = Math.max(10, H * 0.42);
    K.box(0, 0, th, C, ch, C, Gp);
    K.faces('arch', C + 0.2, C + 0.2, n, n, th, ch * 0.55, 0.6, Gp);            // verandah arches
    K.faces('niche', C + 0.15, C + 0.15, n * 2, n * 2, th + ch * 0.6, ch * 0.28, 0.3, '#a59d8b');
    K.box(0, 0, th + ch, C + 1.4, 0.6, C + 1.4, Gd);                            // cornice
    K.faces('niche', C, C, n * 3, n * 3, th + ch + 0.6, 1.8, 0.4, Gp);          // parapet with trefoil crenels
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const u = a * C / 2, v = b * C / 2; K.cyl(u, v, th, 0.8, ch + 3, Gp, 'cyl8'); K.shape('dome', u, v, th + ch + 3, 1.8, 1.8, 1.8, Gd); }
    const dy = th + ch + 0.6;
    K.cyl(0, 0, dy, Dm * 0.47, Dm * 0.22, Gp, 'cyl24');                         // drum
    K.shape('melon', 0, 0, dy + Dm * 0.22, Dm * 1.05, Dm * 0.16, Dm * 1.05, Gd);   // lotus petals
    K.shape('bulb', 0, 0, dy + Dm * 0.3, Dm, H - dy - Dm * 0.3 - 2, Dm, Gk);
    K.cyl(0, 0, H - 2.2, 0.2, 2.6, '#9a8f6a');
    K.solidRect(0, 0, T, T, th); K.solidRect(0, 0, C, C, th + ch + 0.6); K.solidCircle(0, 0, Dm * 0.45, H - 3, 12);
  },
  // Hayat Bakshi's Great Mosque: prayer hall with rows of small cupolas and two tall minarets
  qsmosque(K) {
    const Gp = '#C9C0AE', Gd = '#5F5B55';
    K.box(0, 0, 0, 34, 12, 24, Gp); K.arcade('arch', -16, 12.05, 16, 12.05, 5, 0, 10, 0.6, Gp);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) K.shape('dome', -13.6 + i * 6.8, -8 + j * 7.5, 12, 4, 3.2, 4, Gd);
    for (const s of [-1, 1]) { K.cyl(s * 18.5, 12, 0, 1.6, 30, Gp, 'cyl8'); K.cyl(s * 18.5, 12, 18, 2.2, 0.6, Gd, 'cyl8'); K.cyl(s * 18.5, 12, 26, 2.1, 0.6, Gd, 'cyl8'); K.shape('bulb', s * 18.5, 12, 30, 3.4, 4, 3.4, Gd); K.solidCircle(s * 18.5, 12, 1.7, 30, 8); }
    K.solidRect(0, 0, 34, 24, 12);
  },
  // Taramati Baradari: flat-roofed salmon pavilion on a hillock, five pointed arches per face, niche parapet
  taramati(K) {
    const S = '#E0B29A', Sd = '#B6866E', G = '#8C8375';
    K.hill(0, 0, 34, 34, 9, '#8A6E52', '#4F5E33', 5); K.y0 = 9;
    K.box(0, 0, 0, 46, 0.4, 46, '#A39E95'); K.wall(-23, -23, 23, -23, 0.4, 1.0, 0.5, G, false, false); K.wall(-23, 23, 23, 23, 0.4, 1.0, 0.5, G, false, false);
    K.box(0, 0, 0.4, 24, 1.5, 23, G);
    K.box(0, 0, 1.9, 19.6, 8, 18.6, Sd); K.faces('arch', 21, 20, 5, 5, 1.9, 8, 1.0, S);
    K.box(0, 0, 9.9, 21.6, 0.5, 20.6, S); K.faces('niche', 21, 20, 22, 21, 10.4, 1.5, 0.5, S); K.box(0, 0, 10.4, 20.4, 1.2, 19.4, Sd);
    K.solidRect(0, 0, 21, 20, 11.9);
  },
  // Paigah Tombs: roofless walled courts with arcaded upper tier and a forest of bulb-domed finials; small mosque
  // with two melon-domed minarets reflected in a pond (front = east)
  paigah(K) {
    const W = '#E8E2D6', Gr = '#A9A69E', M = '#F2F0EA';
    // court row runs along v (east-west); mosque at the west end facing east, pond between
    const courts: [number, number][] = [[-5, 33], [24, 17], [41, 17]];
    for (const [cv, len] of courts) {
      const hv = len / 2, hu = 8;
      for (const [u0, v0, u1, v1] of [[-hu, cv - hv, hu, cv - hv], [-hu, cv + hv, hu, cv + hv], [-hu, cv - hv, -hu, cv + hv], [hu, cv - hv, hu, cv + hv]]) {
        K.wall(u0, v0, u1, v1, 0, 6, 0.6, W, true, false);
        K.arcade('archRound', u0, v0, u1, v1, Math.max(3, Math.round(Math.hypot(u1 - u0, v1 - v0) / 1.7)), 6, 3, 0.5, W);
        const L = Math.hypot(u1 - u0, v1 - v0), n = Math.round(L / 2.2);
        for (let i = 0; i <= n; i++) { const fu = u0 + (u1 - u0) * i / n, fv = v0 + (v1 - v0) * i / n; K.cyl(fu, fv, 9, 0.16, 2.2, W, 'cyl8'); K.shape('melon', fu, fv, 11.2, 0.6, 0.8, 0.6, W); K.cyl(fu, fv, 12, 0.04, 0.6, Gr); }
      }
      for (let i = 0; i < Math.floor(len / 6); i++) { const vv = cv - hv + 3 + i * 6; for (const s of [-1, 1]) { for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.cyl(s * 3.5 + a * 1, vv + b * 1, 0, 0.1, 3.4, M, 'cyl8'); K.box(s * 3.5, vv, 3.4, 2.6, 0.5, 2.6, M); K.box(s * 3.5, vv, 0, 1.8, 0.8, 1.2, M); } }
    }
    K.box(0, -30, 0, 10, 0.12, 10, '#4E5F2E', 0, 'water');
    K.box(0, -45, 0, 16, 7.5, 12, W); K.arcade('arch', -6.5, -38.95, 6.5, -38.95, 3, 0, 6, 0.6, W);
    for (const s of [-1, 1]) { K.cyl(s * 8, -39.5, 0, 0.8, 11, W, 'cyl8'); K.cyl(s * 8, -39.5, 11, 1.1, 0.4, Gr, 'cyl8'); K.shape('melon', s * 8, -39.5, 11.4, 1.8, 2.6, 1.8, W); K.cyl(s * 8, -39.5, 14, 0.05, 1.0, Gr); }
    K.solidRect(0, -45, 16, 12, 7.5);
  },
  // ---------------- Hussain Sagar & centre ----------------
  // Buddha: standing granite figure with right palm raised (abhaya), left hand at robe collar and stone lotus.
  // Visible pose/pedestal corrected from original frontal photograph captured2025-10-14; fine carvings remain stylised.
  buddha(K) {
    const W = '#E9E6DF', Wd = '#CFCAC0', Rd = '#C7C2B3', Pl = '#A8A49C';
    K.box(0, 12, -0.5, 29, 1.5, 66, Pl);                                         // island deck (long E-W = along v)
    K.box(0, 33, 1.0, 13, 0.3, 13, '#5f8f45', 0, 'park'); K.solidRect(0, 12, 29, 66, 1.0);
    K.box(0, 0, 1.0, 9, 3, 9, Pl); K.box(0, 0, 4.0, 7.5, 0.6, 7.5, '#bcb6aa');
    K.shape('melon', 0, 0, 4.6, 11, 1.6, 11, Rd); K.cyl(0, 0, 6.0, 3.6, 0.6, Rd, 'cyl24');
    // figure, facing +v (east): robe, shoulders, head, ushnisha, raised right hand, left hand at the collar
    const y = 6.6;
    K.shape('robe', 0, 0, y, 4.6, 11.5, 3.6, W);
    K.box(0, 0.2, y + 11.3, 4.2, 2.0, 2.6, W); K.sph(0, 0.1, y + 13.4, 1.35, W, 0, 1.6);
    K.sph(0, 0.1, y + 15.1, 0.75, Wd); K.sph(0, -0.1, y + 13.5, 1.38, Wd, 0, 1.5);       // curls
    K.box(2.2, 0.4, y + 9.0, 0.9, 3.2, 1.0, W, 0); K.box(2.0, 1.6, y + 11.0, 0.8, 3.4, 0.9, W, 0);   // positive u is the figure's right, viewer-left
    K.box(2.0, 2.0, y + 14.3, 0.5, 1.5, 1.2, W, 0);                           // raised palm
    K.box(-2.3, 0.3, y + 9.0, 0.9, 2.8, 1.0, W);
    { const [x,z]=K.P(-1.7,1.3); K.k.B.st.add(TPL.box,x,K.y0+y+10.95,z,.8,Math.hypot(1.2,3.7),.8,W,{ry:K.ry0,rz:-Math.atan2(1.2,3.7)}); }
    K.box(-1.1, 1.55, y + 12.5, 0.8, 1.1, 0.8, W);   // bent left forearm holds robe at the collar
    for (let i = -1.6; i <= 1.6; i += 0.8) K.box(i, 1.7, y + 0.4, 0.12, 9, 0.2, Wd);     // pleats
    K.solidRect(0, 0, 9, 9, 6.6); K.ob(0, 0, 2.2, y + 16);
  },
  // Secretariat: 192 x 106 m white Deccani palace block around a courtyard, red stone plinth, two central towers
  // with 25 m domes crowned by the Ashoka lions, rows of domed kiosks along the parapet (front = east)
  secretariat(K) {
    const W = '#F1ECE2', Wd = '#E2DCCF', G = '#C8C5BE', R = '#A6533B', Au = '#B48A3C';
    // long faces run along u (north-south), depth along v (east-west)
    const hu = 96, hv = 53, wing = 21.5, H = 34;
    K.box(0, 0, 0, 2 * hu, 3, 2 * hv, R);
    for (const [u, v, w, d] of [[0, hv - wing / 2, 2 * hu, wing], [0, -hv + wing / 2, 2 * hu, wing], [hu - wing / 2, 0, wing, 2 * hv - 2 * wing], [-hu + wing / 2, 0, wing, 2 * hv - 2 * wing]]) { K.box(u, v, 3, w, H - 3, d, W, 0, 'wall'); K.solidRect(u, v, w, d, H); }
    for (let f = 1; f < 8; f++) for (const sv of [-1, 1]) K.box(0, sv * (hv + 0.4), 3 + f * 4.3, 2 * hu, 0.25, 0.9, Wd);   // chhajja bands
    K.arcade('arch', -hu, hv + 0.35, hu, hv + 0.35, 32, 3, 8.4, 0.7, W); K.arcade('arch', -hu, -hv - 0.35, hu, -hv - 0.35, 32, 3, 8.4, 0.7, W);
    K.box(0, 0, H, 2 * hu + 1, 0.8, 2 * hv + 1, G);
    for (let i = -88; i <= 88; i += 16) for (const sv of [-1, 1]) K.chhatri(i, sv * (hv - 1.5), H + 0.8, 4.4, W);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { K.box(a * (hu - 6), b * (hv - 6), H, 12, 6, 12, W); K.cyl(a * (hu - 6), b * (hv - 6), H + 6, 4.6, 2.5, G, 'cyl24'); K.shape('onion', a * (hu - 6), b * (hv - 6), H + 8.5, 9.4, 8.5, 9.4, W); }
    // central towers on the east and west wings with the giant domes and the national emblem
    for (const sv of [-1, 1]) {
      const v = sv * (hv - wing / 2);
      K.box(0, v, H, 30, 16, wing + 2, W, 0, 'wall'); K.arcade('archSlim', -15, v + sv * (wing / 2 + 1.1), 15, v + sv * (wing / 2 + 1.1), 5, H, 14, 0.6, W);
      K.box(0, v, H + 16, 31, 0.8, wing + 3, G); for (const a of [-1, 1]) for (const b of [-1, 1]) K.chhatri(a * 12.5, v + b * 8.5, H + 16.8, 4.4, W);
      K.cyl(0, v, H + 16.8, 8.6, 5, G, 'cyl24'); K.shape('onion', 0, v, H + 21.8, 15.8, 25, 15.8, W);
      K.cyl(0, v, H + 46.6, 1.4, 1.5, Au);
      drawLionCapital(K,0,v,H+48.1);
      K.solidCircle(0, v, 7.5, H + 30);
    }
    // porte-cochere at the main (east) entrance
    K.box(0, hv + 9, 0, 26, 9, 14, W); K.arcade('archRound', -13, hv + 16.05, 13, hv + 16.05, 3, 0, 7.5, 0.6, W); K.shape('dome', 0, hv + 9, 9, 8, 5, 8, W); K.solidRect(0, hv + 9, 26, 14, 9);
    K.box(0, 0, 3, 2 * hu - 2 * wing, 0.12, 2 * hv - 2 * wing, '#6E9B4E', 0, 'park');
  },
  // Ambedkar statue: 38 m bronze standing figure, left hand holding the Constitution, right arm raised pointing,
  // on a 15 m round colonnaded pedestal building modelled on the old Parliament House
  ambedkar(K) {
    const Bz = '#7B5332', Bh = '#A8743F', Sd = '#D8C6A2', Sr = '#A0523D';
    K.cyl(0, 0, 0, 26.5, 1.2, Sr, 'cyl24'); K.cyl(0, 0, 1.2, 24, 13, Sd, 'cyl24');
    for (let i = 0; i < 44; i++) { const a = (i / 44) * Math.PI * 2; K.cyl(Math.cos(a) * 25.6, Math.sin(a) * 25.6, 1.2, 0.55, 12.6, '#E8DCC0', 'cyl8'); }
    K.cyl(0, 0, 13.8, 26.6, 1.4, Sr, 'cyl24'); K.cyl(0, 0, 15.2, 12, 0.6, Sd, 'cyl24');
    K.solidCircle(0, 0, 26.6, 15.2, 16);
    const y = 15.8;
    K.box(-1.3, 0, y, 2.4, 1.0, 4.0, Bz); K.box(1.3, 0, y, 2.4, 1.0, 4.0, Bz);           // shoes
    K.box(-1.3, 0, y + 1, 2.3, 15, 2.6, Bz); K.box(1.3, 0, y + 1, 2.3, 15, 2.6, Bz);     // trousers
    K.shape('robe', 0, 0, y + 11, 7.6, 18, 5.0, Bz);                           // long coat
    K.box(0, 0.4, y + 23.5, 7.4, 4.5, 4.4, Bz); K.box(0, 2.2, y + 21, 1.2, 6, 0.3, '#3b2a1b');    // chest, tie
    K.cyl(0, 0, y + 28, 1.2, 1.5, Bz); K.sph(0, 0.2, y + 31.2, 2.2, Bz, 0, 2.6); K.sph(0, -0.3, y + 32.4, 2.15, '#2b1d12', 0, 1.6); K.box(0, 2.3, y + 31.4, 3.0, 0.5, 0.3, '#2a2018');   // head, spectacles
    // left arm (u>0) holding the book at the chest; right arm (u<0) raised forward, index finger pointing
    K.box(4.1, 0.6, y + 19.5, 1.6, 7, 1.8, Bz); K.box(2.6, 2.6, y + 22.0, 3.6, 4.4, 1.0, '#5a3a20');
    K.shape('robe', -4.0, 0.3, y + 20.5, 2.0, 6.0, 2.0, Bz); K.box(-4.0, 3.2, y + 26.0, 1.6, 1.6, 6.0, Bz, 0); K.box(-4.0, 7.0, y + 26.8, 0.5, 0.5, 2.4, Bh);
    K.ob(0, 0, 5, y + 34);
  },
  // Martyrs' memorial: mirror-steel elliptical oil lamp with a sloped rim and a golden flame
  martyrs(K) {
    const St = '#C9CDD1', Au = '#E8A92A';
    K.shape('diya', 0, 0, -2.0, 37, 24, 54, St, 0, 'st', 0.15);                  // tilted so the rim runs from 18 m to 26 m
    K.shape('flame', 0, 3, 17, 13, 27, 9, Au); K.shape('flame', 0, 3.2, 18, 9, 23, 6.5, '#F6C93A', 0, 'lit');
    K.box(0, 0, 0, 46, 0.3, 64, '#A59C8E');
    K.solidCircle(0, 0, 20, 20, 16);
  },
  // Birla Mandir: white marble temple on a rocky hill: Odia-style curved main tower, stepped Dravidian gopuram
  birla(K) {
    const M = '#F5F3ED', Md = '#DCD8CF', Au = '#C9A23F';
    K.hill(0, 0, 70, 110, 20, '#8C7E6A', '#6B7F4A', 9); K.y0 = 20;
    K.box(0, 0, 0, 70, 2.2, 69, Md);
    K.box(0, -8, 2.2, 18, 9, 18, M); K.arcade('archRound', -9, 1.05, 9, 1.05, 3, 2.2, 7, 0.5, M);
    K.shape('shikhara', 0, -8, 11.2, 17, 25, 17, M);
    K.cyl(0, -8, 35.8, 3.4, 1.4, Md, 'cyl24'); K.shape('melon', 0, -8, 37.2, 4.6, 2.0, 4.6, M); K.shape('dome', 0, -8, 39, 1.4, 2.4, 1.4, Au);
    for (const s of [-1, 1]) { K.box(s * 19, -12, 2.2, 10, 7, 10, M); K.shape('shikhara', s * 19, -12, 9.2, 9, 12, 9, M); K.shape('dome', s * 19, -12, 21, 1, 1.6, 1, Au); }
    // pillared hall towards the gopuram, then the stepped gopuram at the east entrance
    K.box(0, 13, 2.2, 22, 6, 16, M); for (let i = 0; i < 6; i++) K.cyl(-10 + i * 4, 21.2, 2.2, 0.45, 6, M, 'cyl8'); K.box(0, 13, 8.2, 23, 0.8, 17, Md);
    for (let t = 0; t < 6; t++) K.box(0, 32, 2.2 + t * 3, 16 - t * 2.1, 3, 9 - t * 1.0, t % 2 ? Md : M);
    K.shape('onion', 0, 32, 20.2, 5, 3, 2.4, M); K.cyl(0, 32, 23, 0.25, 2, Au);
    K.cyl(13, 24, 2.2, 0.25, 13, Au, 'cyl8');                                     // brass flagstaff
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.chhatri(a * 31, b * 31, 2.2, 4, M);
    K.solidRect(0, -8, 18, 18, 30); K.solidRect(0, 32, 16, 9, 18); K.solidRect(0, 13, 22, 16, 9);
  },
  // Assembly (heritage Town Hall): long white Indo-Saracenic block, two arcaded storeys of cusped arches, cupolas,
  // central dome over the portico, urns on the parapet; seated Gandhi in front (front = north-east)
  assembly(K) {
    const W = '#F7F5EF', Wd = '#CFC9BD', Bz = '#6E5032';
    K.box(0, 0, 0, 40, 17, 128, W); K.box(0, 50, 0, 64, 17, 28, W);
    K.arcade('archArc', -32, 64.05, 32, 64.05, 14, 0.4, 7.6, 0.8, W); K.arcade('archArc', -32, 64.05, 32, 64.05, 14, 8.4, 7.6, 0.8, W);
    for (const su of [-1, 1]) { K.arcade('archArc', su * 20.05, -64, su * 20.05, 36, 22, 0.4, 7.6, 0.8, W); K.arcade('archArc', su * 20.05, -64, su * 20.05, 36, 22, 8.4, 7.6, 0.8, W); }
    K.box(0, 0, 17, 41, 0.7, 129, Wd); K.box(0, 50, 17, 65, 0.7, 29, Wd);
    for (let i = -60; i <= 60; i += 6) for (const su of [-1, 1]) K.shape('dome', su * 20, i, 17.7, 0.9, 1.3, 0.9, W);   // urns
    for (const [a, b] of [[-31, 63], [31, 63], [-19, -63], [19, -63], [-31, 37], [31, 37]]) K.chhatri(a, b, 17.7, 4.5, W);
    K.box(0, 68, 0, 18, 9, 9, W); K.arcade('archArc', -9, 72.55, 9, 72.55, 3, 0, 8, 0.6, W);
    K.cyl(0, 50, 17.7, 6, 4, W, 'cyl24'); K.shape('onion', 0, 50, 21.7, 11, 9, 11, W); K.cyl(0, 50, 30.5, 0.15, 2, '#C9A23F');
    K.solidRect(0, 0, 40, 128, 17); K.solidRect(0, 50, 64, 28, 17); K.solidRect(0, 68, 18, 9, 9);
    // seated Gandhi statue on a pedestal in front
    const gu = 8, gv = 96;
    K.box(gu, gv, 0, 6, 3, 6, '#BDB6A6'); K.box(gu, gv - 0.4, 3, 3.4, 2.0, 3.4, Bz); K.box(gu, gv + 1.2, 3, 3.0, 1.2, 1.6, Bz); K.box(gu, gv - 0.6, 5, 2.6, 2.6, 1.8, Bz); K.sph(gu, gv - 0.4, 8.6, 0.9, Bz);
    K.solidRect(gu, gv, 6, 6, 3);
  },
  // High Court: long red-and-white banded Indo-Saracenic block on the Musi, huge central arch, domes and turrets
  highcourt(K) {
    const R = '#B4654F', Wt = '#EDE6DA', Dc = '#E8E0D0';
    K.box(0, 0, 0, 116, 19, 49, R);
    for (let y = 2.5; y < 19; y += 3) K.box(0, 0, y, 116.4, 0.35, 49.4, Wt);    // white bands
    K.arcade('arch', -56, 24.55, -14, 24.55, 7, 0.5, 8, 0.6, Wt); K.arcade('arch', 14, 24.55, 56, 24.55, 7, 0.5, 8, 0.6, Wt);
    K.arcade('archArc', -56, 24.55, -14, 24.55, 9, 9.6, 7, 0.6, Wt); K.arcade('archArc', 14, 24.55, 56, 24.55, 9, 9.6, 7, 0.6, Wt);
    // central arch block rising above the roof
    K.box(0, 2, 0, 26, 30, 47, R); K.shape('arch', 0, 25.6, 0, 26, 30, 1.2, Wt); for (let y = 2.5; y < 30; y += 3) K.box(0, 2, y, 26.4, 0.35, 47.4, Wt);
    K.cyl(0, 2, 30, 7.5, 3.5, Wt, 'cyl24'); K.shape('onion', 0, 2, 33.5, 14, 12, 14, Dc); K.cyl(0, 2, 45.2, 0.2, 2.5, '#C9A23F');
    for (const s of [-1, 1]) { K.shape('onion', s * 28, 10, 19, 8, 7, 8, Dc); K.shape('onion', s * 28, -10, 19, 8, 7, 8, Dc); }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { K.cyl(a * 57, b * 23.5, 0, 2.2, 23, R, 'cyl8'); K.chhatri(a * 57, b * 23.5, 23, 4, Wt); }
    K.box(0, 0, 19, 117, 0.8, 50, Wt);
    K.solidRect(0, 0, 116, 49, 19); K.solidRect(0, 2, 26, 47, 30);
  },
  // Osmania General Hospital: very long three-storey arcaded block over the Musi, grand bulbous central dome
  osmania(K) {
    const G = '#C6BCA9', Gd = '#9F9583', Dm = '#D4CCBC';
    K.box(0, 0, 0, 183, 20, 32, G); for (const s of [-1, 1]) K.box(s * 70, -22, 0, 40, 16, 22, G);
    for (let f = 0; f < 3; f++) { K.arcade('archArc', -91, 16.05, -14, 16.05, 26, 0.6 + f * 6.4, 5.6, 0.7, G); K.arcade('archArc', 14, 16.05, 91, 16.05, 26, 0.6 + f * 6.4, 5.6, 0.7, G); K.box(0, 16.5, 6.2 + f * 6.4, 183, 0.25, 1.4, Gd); }
    K.box(0, 2, 0, 28, 24, 36, G); K.arcade('arch', -14, 20.05, 14, 20.05, 3, 0, 14, 0.8, G);
    K.cyl(0, 2, 24, 8.5, 6, G, 'cyl24'); K.shape('bulb', 0, 2, 30, 16, 13, 16, Dm); K.cyl(0, 2, 42.6, 0.2, 2.6, '#9a8f6a');
    for (const s of [-1, 1]) { K.box(s * 86, 0, 0, 14, 24, 34, G); K.cyl(s * 86, 0, 24, 4.5, 3, G, 'cyl24'); K.shape('bulb', s * 86, 0, 27, 8.6, 7.5, 8.6, Dm); }
    for (let i = -76; i <= 76; i += 19) if (Math.abs(i) > 20) K.chhatri(i, 15, 20, 3.6, G);
    K.box(0, 0, 20, 184, 0.7, 33, Gd);
    K.solidRect(0, 0, 183, 32, 20); K.solidRect(0, 2, 28, 36, 30); for (const s of [-1, 1]) { K.solidRect(s * 70, -22, 40, 22, 16); K.solidRect(s * 86, 0, 14, 34, 24); }
  },
  // Salar Jung Museum: white D-shaped building on the Musi, central entrance tower with a giant arched window and a
  // ribbed "net" dome, smaller domes at the wing ends (front = NNW, flat side of the D)
  salarjung(K) {
    const W = '#F1EEE7', Wd = '#D8D3C9', Gs = '#8D8A84', Dm = '#CFCCC4';
    const R = 60, d = 19, H = 15.5;
    // front wing (straight) and the semicircular back arc
    K.box(0, -d / 2 + 20, 0, 120, H, d, W, 0, 'wall'); K.box(0, -d / 2 + 20, 0, 120.2, 4, d + 0.2, Gs); K.solidRect(0, -d / 2 + 20, 120, d, H);
    K.arcade('archRound', -58, 20.05, -8, 20.05, 12, 9.5, 5.4, 0.4, W); K.arcade('archRound', 8, 20.05, 58, 20.05, 12, 9.5, 5.4, 0.4, W);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2;
      const ru = Math.cos(am) * (R - d / 2), rv = 20 - d + Math.sin(am) * (R - d / 2) * 0.9;
      const seg = (R * Math.PI) / n + 0.6;
      K.box(ru, rv, 0, seg, H, d, W, am + Math.PI / 2, 'wall'); K.box(ru, rv, 0, seg + 0.2, 4, d + 0.2, Gs, am + Math.PI / 2); K.solidRect(ru, rv, d, d, H);
    }
    K.box(0, 20 - d, H, 121, 0.6, d + 1, Wd);
    // entrance tower
    K.box(0, 22, 0, 14, 27, 12, W); K.shape('archRound', 0, 28.05, 4, 9, 18, 0.5, Wd); K.box(0, 28.4, 9.5, 13, 0.6, 1.4, Wd);
    K.cyl(0, 22, 27, 6.4, 2.5, W, 'cyl24'); K.shape('melon', 0, 22, 29.5, 12, 8.5, 12, Dm); K.cyl(0, 22, 38, 0.2, 3, '#C8A24A');
    K.solidRect(0, 22, 14, 12, 27);
    for (const s of [-1, 1]) { K.box(s * 52, 14, H, 7, 4, 7, W); K.shape('melon', s * 52, 14, H + 4, 6, 4.5, 6, Dm); }
    K.cyl(0, -18, 0, 11, H + 3, Wd, 'cyl24'); K.shape('dome', 0, -18, H + 3, 18, 4, 18, '#6F93A8');
  },
  // OU Arts College: pink-grey granite quadrangle, tall central gateway with one giant pointed-arch recess, arcaded
  // wings over a columned verandah (front = SSE)
  ouarts(K) {
    const P = '#C4A597', Pm = '#A98D81', Sh = '#5E4C45';
    const hs = 54, H = 17, dW = 16;
    for (const [u, v, w, d] of [[0, hs - dW / 2, 2 * hs, dW], [0, -hs + dW / 2, 2 * hs, dW], [hs - dW / 2, 0, dW, 2 * hs - 2 * dW], [-hs + dW / 2, 0, dW, 2 * hs - 2 * dW]]) { K.box(u, v, 0, w, H, d, P); K.solidRect(u, v, w, d, H); }
    K.arcade('archSlim', -hs, hs + 0.05, -10, hs + 0.05, 13, 8.8, 7.2, 0.6, Pm); K.arcade('archSlim', 10, hs + 0.05, hs, hs + 0.05, 13, 8.8, 7.2, 0.6, Pm);
    for (let i = -hs + 3; i < hs - 2; i += 6.5) if (Math.abs(i) > 11) K.box(i, hs + 0.3, 3, 0.9, 5.6, 0.9, Pm);
    K.box(0, hs + 0.1, 8.4, 2 * hs, 0.5, 1.4, Pm); K.box(0, 0, H, 2 * hs + 1, 0.6, 2 * hs + 1, Pm);
    for (let i = -hs; i <= hs; i += 2.4) K.box(i, hs, H + 0.6, 1.0, 0.9, 0.7, P);
    // central gateway
    K.box(0, hs + 1, 0, 20, 28, 12, P); K.shape('archSlim', 0, hs + 7.05, 1.5, 15, 23, 0.4, Sh); K.shape('archSlim', 0, hs + 7.15, 1.5, 13, 21, 0.3, Pm);
    for (const s of [-1, 1]) K.box(s * 9.4, hs + 7.2, 0, 1.2, 28.6, 1.2, Pm);
    for (let i = -9; i <= 9; i += 2) K.box(i, hs + 7, 28, 1.0, 1.0, 0.8, P);
    K.box(0, hs + 10, 0, 22, 1.2, 8, Pm); K.box(0, hs - 6, 0, 26, 24, 14, P);
    K.solidRect(0, hs + 1, 20, 12, 28); K.solidRect(0, hs - 6, 26, 14, 24);
  },
  // ---------------- Modern Hyderabad ----------------
  // Cyber Towers: 10-storey peach drum (R 46.5 m) wrapped in a white diamond lattice, two deep wedge notches
  // (NE and SW) showing a curved green glass core, white pergola crown on the roof. Front (rot) = NE notch.
  cybertowers(K) {
    const Pe = '#DDA77C', Wl = '#F4F4F0', Gl = '#5FAFA5', H = 37, Ro = 46.5, Ri = 30;
    // angles measured in the local frame from +v (the NE notch centre); notches are +-19.5 deg around 0 and 180
    const at = (deg: number, r: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r];
    K.cyl(0, 0, 0, Ri, H, Gl, 'cyl24');                                         // glass core
    const arcs: [number, number][] = [[19.5, 160.5], [199.5, 340.5]];
    for (const [a0, a1] of arcs) {
      const n = 28;
      for (let i = 0; i < n; i++) {
        const d0 = a0 + ((a1 - a0) * i) / n, d1 = a0 + ((a1 - a0) * (i + 1)) / n, dm = (d0 + d1) / 2;
        const [u, v] = at(dm, (Ro + Ri) / 2), seg = (Math.PI * 2 * Ro * (d1 - d0)) / 360 + 0.3;
        K.box(u, v, 0, seg, H, Ro - Ri, Pe, -(dm * Math.PI) / 180, 'wall');
        const [ou, ov] = at(dm, Ro);
        K.solidRect(u, v, (Ro - Ri) * 0.8, (Ro - Ri) * 0.8, H);
        // white diagrid: two crossing diagonals per segment per two floors, chunky nodes
        for (let f = 0; f < 5; f++) {
          const [lu, lv] = at(dm, Ro + 1.0);
          for (const sg of [-1, 1]) { const [x, z] = K.P(lu, lv); K.k.B.st.add(TPL.box, x, f * 7.4 + 3.7, z, 0.45, 8.6, 0.45, Wl, { ry: K.ry0 - (dm * Math.PI) / 180, rz: sg * 0.62 }); }
          const [nu, nv] = at(dm + (d1 - d0) / 2, Ro + 1.0); K.box(nu, nv, f * 7.4 - 0.4, 0.9, 0.9, 0.9, Wl, -(dm * Math.PI) / 180);
        }
        void ou; void ov;
        // pergola crown: radial beam flaring up and out
        const [pu, pv] = at(dm, Ro - 1); { const [x, z] = K.P(pu, pv); K.k.B.st.add(TPL.box, x, H + 2.3, z, 0.4, 5, 0.4, Wl, { ry: K.ry0 - (dm * Math.PI) / 180, rx: -0.5 }); }
        const [ru, rv] = at(dm, Ro + 1.2); K.box(ru, rv, H + 4.3, seg, 0.5, 0.6, Wl, -(dm * Math.PI) / 180);
      }
      // flat radial end walls facing the notches
      for (const d of [a0, a1]) { const [u, v] = at(d, (Ro + Ri) / 2); K.box(u, v, 0, 0.6, H + 0.4, Ro - Ri, Pe, -(d * Math.PI) / 180 + Math.PI / 2); }
    }
    K.box(0, Ri + 8, H - 5, 26, 5.5, 3, '#E8E8E4');                             // lintel block over the NE notch
    K.cyl(0, 0, H, Ro - 0.5, 0.6, '#C9C3B7', 'cyl24');
    K.solidCircle(0, 0, Ri, H);
  },
  cablebridge: drawDurgamBridge,
  // T-Hub 2.0: dark pixel-panelled "plank" floating over a recessed lower block, rooftop steel frame
  thub(K) {
    const P = ['#3A3D42', '#4A4D52', '#5C6066'], Gl = '#2B3A45', Fr = '#6E7378';
    K.box(0, -8, 0, 36, 22, 64, Gl); K.solidRect(0, -8, 36, 64, 22);
    K.box(0, -8, 22, 34, 4.5, 60, '#16181b');
    K.box(0, 0, 26.5, 45, 18.5, 94, P[1]); K.solidRect(0, 0, 45, 94, 45);
    const r = rng(4011);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 31; col++) for (const su of [-1, 1]) K.box(su * 22.62, -46.5 + col * 3.03 + 1.5, 26.8 + row * 2.25, 0.2, 2.1, 2.9, r.pick(P));
    for (let row = 0; row < 8; row++) for (let col = 0; col < 15; col++) for (const sv of [-1, 1]) K.box(-22.5 + col * 3.0 + 1.5, sv * 47.12, 26.8 + row * 2.25, 2.85, 2.1, 0.2, r.pick(P));
    for (let i = -40; i <= 40; i += 8) K.box(0, i, 45, 38, 0.4, 0.4, Fr); for (const su of [-1, 1]) K.box(su * 19, 0, 45, 0.4, 4.5, 84, Fr); K.box(0, 0, 49.3, 38, 0.4, 84, Fr);
    K.cyl(10, 30, 45, 0.2, 9, Fr); K.box(-12, 47.3, 38, 7, 3, 0.3, '#F04E23', 0, 'lit');
  },
  // Gachibowli stadium: oval bowl, continuous white-topped cantilever roof with an orange underside, yellow raking
  // struts all round, red track and green pitch, four corner floodlight masts (long axis N-S)
  stadium(K) {
    const Rw = '#EDE9E0', Ro = '#A9532F', St = '#B9B6AE', Y = '#F2C230', Wf = '#F3F3EF';
    const A = 133, Bv = 93, ai = 104, bi = 63, n = 64;
    const pt = (t: number, a: number, b: number): [number, number] => [Math.cos(t) * b, Math.sin(t) * a];     // long axis along v
    K.box(0, 0, 0.02, 2 * bi - 2, 0.06, 2 * ai - 2, '#B5504A', 0, 'marks');
    K.box(0, 0, 0.06, 68, 0.06, 105, '#6E8F3A', 0, 'park');
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
      const [iu0, iv0] = pt(t0, ai, bi), [iu1, iv1] = pt(t1, ai, bi), [ou0, ov0] = pt(t0, A, Bv), [ou1, ov1] = pt(t1, A, Bv);
      const P = (u: number, v: number, y: number) => { const [x, z] = K.P(u, v); return [x, y, z]; };
      // raked stands
      K.k.B.st.quad(P(iu0, iv0, 2), P(iu1, iv1, 2), P(ou1, ov1, 16), P(ou0, ov0, 16), St);
      // outer facade
      K.k.B.st.quad(P(ou0, ov0, 0), P(ou1, ov1, 0), P(ou1, ov1, 18), P(ou0, ov0, 18), Wf);
      // roof: from the outer rim at 23 m, cantilevered 25 m inwards, white on top, orange below
      const f = 25 / 30, ru0 = ou0 + (iu0 - ou0) * f, rv0 = ov0 + (iv0 - ov0) * f, ru1 = ou1 + (iu1 - ou1) * f, rv1 = ov1 + (iv1 - ov1) * f;
      K.k.B.st.quad(P(ou0, ov0, 23.2), P(ou1, ov1, 23.2), P(ru1, rv1, 20.6), P(ru0, rv0, 20.6), Rw);
      K.k.B.st.quad(P(ou0, ov0, 22.9), P(ou1, ov1, 22.9), P(ru1, rv1, 20.3), P(ru0, rv0, 20.3), Ro);
      K.k.B.st.quad(P(ou0, ov0, 18), P(ou1, ov1, 18), P(ou1, ov1, 23.2), P(ou0, ov0, 23.2), Ro);
      // yellow raking strut from the ground outside to the roof edge
      if (i % 2 === 0) { const gu = ou0 * 1.09, gv = ov0 * 1.06, mu = (gu + ou0) / 2, mv = (gv + ov0) / 2, [mx, mz] = K.P(mu, mv); const L = Math.hypot(Math.hypot(gu - ou0, gv - ov0), 23); K.k.B.st.add(TPL.cyl8, mx, 11.6, mz, 0.45, L, 0.45, Y, { ry: K.ry0 + Math.atan2(ov0, ou0) + Math.PI / 2, rx: Math.atan2(Math.hypot(gu - ou0, gv - ov0), 23) }); }
      // stand segment collision
      const [cu, cv] = [(iu0 + ou0 + iu1 + ou1) / 4, (iv0 + ov0 + iv1 + ov1) / 4];
      K.k.solid([K.P(iu0, iv0), K.P(iu1, iv1), K.P(ou1, ov1), K.P(ou0, ov0)], 18); void cu; void cv;
    }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const u = a * 105, v = b * 140; K.box(u, v, 0, 1.6, 55, 1.6, '#9aa0ab'); K.box(u, v, 55, 8, 4, 1.2, '#d6dce6', -a * b * 0.6); K.box(u, v, 55.3, 7, 3.2, 0.3, '#fff4d6', -a * b * 0.6, 'lit'); K.ob(u, v, 1.2, 59); }
  },
  // Secunderabad Clock Tower (1896, 37 m): grey granite base and shaft, white clock stage with four dials and
  // chevron corner pilasters, hipped metal roof, white arched lantern, weather vane
  clocktower(K) {
    const G = '#8E8D88', Wt = '#F2F1EC', Mt = '#9EA3A6';
    K.box(0, 0, 0, 7.7, 9.8, 7.7, G); K.shape('prism', 0, 0, 9.0, 9.0, 1.4, 9.0, Mt);
    K.box(0, 0, 9.8, 6.6, 10.5, 6.6, G); for (const ry of [0, Math.PI / 2]) for (const y of [12.5, 16.5]) K.box(0, 0, y, ry ? 6.7 : 1.0, 1.4, ry ? 1.0 : 6.7, '#4c4a46');
    K.box(0, 0, 20.3, 7.0, 1.4, 7.0, Wt); K.faces('niche', 7.05, 7.05, 3, 3, 20.4, 1.2, 0.2, '#d8d6cf');
    K.box(0, 0, 21.7, 7.9, 6.3, 7.9, Wt);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const fu = Math.sin(ry) * 4.0, fv = Math.cos(ry) * 4.0, [x, z] = K.P(fu, fv); K.k.B.st.add(TPL.cyl, x, 24.9, z, 1.15, 0.15, 1.15, '#FAFAF5', { ry: K.ry0 + ry, rx: Math.PI / 2 }); K.k.B.st.box(x, 25.1, z, 0.1, 1.0, 0.1, '#1A1A1A', { ry: K.ry0 + ry }); }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box(a * 3.85, b * 3.85, 21.7, 0.6, 6.3, 0.6, '#d8d6cf');
    K.shape('prism', 0, 0, 28, 8.4, 1.7, 8.4, Mt);
    K.box(0, 0, 29.7, 4.9, 3.9, 4.9, Wt); K.faces('archSlim', 4.95, 4.95, 3, 3, 29.8, 3.6, 0.2, '#6a6862');
    K.box(0, 0, 33.6, 5.2, 1.0, 5.2, Wt); K.cyl(0, 0, 34.6, 0.06, 2.4, '#333'); K.box(0, 0, 36.2, 1.4, 0.08, 0.08, '#333');
    K.solidRect(0, 0, 7.7, 7.7, 33.6);
  },
};

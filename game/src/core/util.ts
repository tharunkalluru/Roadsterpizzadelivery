import * as THREE from 'three';

// ---------- seeded random ----------
export interface Rng { (): number; range(lo: number, hi: number): number; int(lo: number, hi: number): number; pick<T>(a: T[]): T; chance(p: number): boolean }
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const f = (() => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- geometry templates (non-indexed) ----------
export interface Tpl { pos: ArrayLike<number>; nor: ArrayLike<number>; uv: ArrayLike<number>; count: number }
export function toTpl(geo: THREE.BufferGeometry): Tpl {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const count = g.attributes.position.count;
  const uv = g.attributes.uv ? (g.attributes.uv.array as ArrayLike<number>) : new Float32Array(count * 2);
  return { pos: g.attributes.position.array as ArrayLike<number>, nor: g.attributes.normal.array as ArrayLike<number>, uv, count };
}
export const TPL: Record<string, Tpl> = {};
export function initTemplates(extra: Record<string, THREE.BufferGeometry> = {}) {
  TPL.box = toTpl(new THREE.BoxGeometry(1, 1, 1));
  TPL.cyl = toTpl(new THREE.CylinderGeometry(1, 1, 1, 14));
  TPL.cyl6 = toTpl(new THREE.CylinderGeometry(1, 1, 1, 6));
  TPL.cone = toTpl(new THREE.ConeGeometry(1, 1, 10));
  TPL.sph = toTpl(new THREE.SphereGeometry(1, 14, 10));
  TPL.ico = toTpl(new THREE.IcosahedronGeometry(1, 1));
  TPL.ico0 = toTpl(new THREE.IcosahedronGeometry(1, 0));
  TPL.plane = toTpl(new THREE.PlaneGeometry(1, 1));
  TPL.halfCyl = toTpl(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true, -Math.PI / 2, Math.PI));
  TPL.capsule = toTpl(new THREE.CapsuleGeometry(0.5, 1, 4, 10));
  TPL.pill = toTpl(new THREE.CapsuleGeometry(0.5, 1, 4, 10).scale(1, 0.5, 1));   // capsule of unit height
  // low-poly variants for distant crowds
  TPL.sphL = toTpl(new THREE.SphereGeometry(1, 7, 5));
  TPL.pillL = toTpl(new THREE.CapsuleGeometry(0.5, 1, 1, 6).scale(1, 0.5, 1));
  TPL.taperL = toTpl(new THREE.CylinderGeometry(1, 0.8, 1, 6));
  TPL.skirtL = toTpl(new THREE.CylinderGeometry(0.55, 1, 1, 7));
  TPL.skirt = toTpl(new THREE.CylinderGeometry(0.55, 1, 1, 12));
  TPL.taper = toTpl(new THREE.CylinderGeometry(1, 0.8, 1, 10));
  // ---- monument kit ----
  // wall panel (1 wide, 1 tall, 1 deep, base at y=0) with a pointed (or round) arch opening through it
  const archPanel = (openW: number, spring: number, apex: number, round = false) => {
    const a = openW / 2, sh = new THREE.Shape();
    sh.moveTo(-0.5, 0); sh.lineTo(-a, 0); sh.lineTo(-a, spring);
    if (round) sh.absarc(0, spring, a, Math.PI, 0, true);
    else { sh.quadraticCurveTo(-a, spring + (apex - spring) * 0.78, 0, apex); sh.quadraticCurveTo(a, spring + (apex - spring) * 0.78, a, spring); }
    sh.lineTo(a, 0); sh.lineTo(0.5, 0); sh.lineTo(0.5, 1); sh.lineTo(-0.5, 1); sh.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -0.5); return g;
  };
  TPL.arch = toTpl(archPanel(0.62, 0.5, 0.88));          // a typical Qutb Shahi pointed arch bay
  TPL.archBig = toTpl(archPanel(0.55, 0.55, 0.94));      // Charminar's great arches
  TPL.archArc = toTpl(archPanel(0.7, 0.5, 0.86));        // arcade of small arches
  TPL.archSlim = toTpl(archPanel(0.42, 0.55, 0.9));      // tall narrow recess
  TPL.archRound = toTpl(archPanel(0.6, 0.55, 0.85, true));
  // blind arch niche: a shallow pointed-arch shaped plate (0..1 tall), to stick on a wall in a darker colour
  { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(-0.5, 0.55); sh.quadraticCurveTo(-0.5, 0.85, 0, 1); sh.quadraticCurveTo(0.5, 0.85, 0.5, 0.55); sh.lineTo(0.5, 0); sh.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 5 }); g.translate(0, 0, -0.5); TPL.niche = toTpl(g); }
  const lathe = (pts: [number, number][], seg: number, rot = 0) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); if (rot) g.rotateY(rot); return toTpl(g); };
  // all lathe shapes: unit height (0..1), unit diameter at the widest
  TPL.onion = lathe([[0, 0], [0.36, 0], [0.45, 0.1], [0.5, 0.26], [0.47, 0.44], [0.37, 0.6], [0.22, 0.76], [0.1, 0.88], [0.04, 0.96], [0, 1]], 16);
  TPL.bulb = lathe([[0, 0], [0.4, 0], [0.47, 0.08], [0.5, 0.24], [0.49, 0.42], [0.42, 0.6], [0.29, 0.77], [0.14, 0.9], [0.04, 0.98], [0, 1]], 18);
  TPL.dome = lathe([[0, 0], [0.5, 0], [0.49, 0.17], [0.45, 0.4], [0.37, 0.62], [0.25, 0.82], [0.12, 0.95], [0, 1]], 18);
  TPL.melon = lathe([[0, 0], [0.42, 0], [0.5, 0.2], [0.5, 0.45], [0.4, 0.7], [0.2, 0.9], [0, 1]], 10);       // ribbed (10 facets)
  TPL.shikhara = lathe([[0, 0], [0.5, 0], [0.5, 0.08], [0.48, 0.32], [0.43, 0.56], [0.34, 0.78], [0.22, 0.93], [0.08, 1], [0, 1]], 8, Math.PI / 8);
  TPL.diya = lathe([[0, 0], [0.18, 0], [0.3, 0.12], [0.39, 0.32], [0.45, 0.55], [0.49, 0.8], [0.5, 1], [0.47, 1], [0.44, 0.94], [0, 0.9]], 28);
  TPL.flame = lathe([[0, 0], [0.3, 0.03], [0.46, 0.14], [0.5, 0.3], [0.46, 0.46], [0.36, 0.62], [0.22, 0.79], [0.1, 0.92], [0, 1]], 16);
  TPL.robe = lathe([[0, 0], [0.5, 0], [0.47, 0.25], [0.4, 0.6], [0.36, 0.85], [0.3, 1], [0, 1]], 12);
  TPL.mound = lathe([[0, 0], [0.5, 0], [0.48, 0.1], [0.42, 0.3], [0.33, 0.55], [0.21, 0.8], [0.09, 0.95], [0, 1]], 24);
  TPL.cyl8 = toTpl(new THREE.CylinderGeometry(1, 1, 1, 8));
  TPL.cyl10 = toTpl(new THREE.CylinderGeometry(1, 1, 1, 10));
  TPL.cyl24 = toTpl(new THREE.CylinderGeometry(1, 1, 1, 24));
  TPL.prism = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return toTpl(g); })();
  for (const [k, g] of Object.entries(extra)) TPL[k] = toTpl(g);
}

// ---------- batch: many transformed templates merged into one geometry with vertex colours ----------
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();
export interface AddOpts { rx?: number; ry?: number; rz?: number; ao?: boolean; aoBase?: number; aoH?: number; uvRect?: number[]; uvScale?: number[] }

export class Batch {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  addTpl(t: Tpl, matrix: THREE.Matrix4, color: THREE.ColorRepresentation, opts: AddOpts = {}) {
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    const ao = opts.ao, aoBase = opts.aoBase || 0, aoH = opts.aoH || 3;
    const r = opts.uvRect, us = opts.uvScale;
    for (let i = 0; i < t.count; i++) {
      _v.set(t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2]).applyMatrix4(matrix);
      _n.set(t.nor[i * 3], t.nor[i * 3 + 1], t.nor[i * 3 + 2]).applyMatrix3(_nm).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
      let u = t.uv[i * 2], w = t.uv[i * 2 + 1];
      if (us) { u *= us[0]; w *= us[1]; }
      if (r) { u = r[0] + u * r[2]; w = r[1] + w * r[3]; }
      this.uv.push(u, w);
      let f = 1;
      if (ao) { const k = Math.min(1, Math.max(0, (_v.y - aoBase) / aoH)); f = 0.55 + 0.45 * Math.sqrt(k); }
      this.col.push(_c.r * f, _c.g * f, _c.b * f);
    }
  }
  add(t: Tpl, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts: AddOpts = {}) {
    _e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.addTpl(t, _m, color, opts);
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts?: AddOpts) { this.add(TPL.box, x, y, z, sx, sy, sz, color, opts); }
  // raw triangle (already in world space)
  tri(a: number[], b: number[], c: number[], color: THREE.ColorRepresentation, uvs?: number[][]) {
    _c.set(color);
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    for (const [i, p] of [a, b, c].entries()) {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(n.x, n.y, n.z);
      const uv = uvs ? uvs[i] : [0, 0]; this.uv.push(uv[0], uv[1]); this.col.push(_c.r, _c.g, _c.b);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, uvs?: number[][]) {
    // a-b-c-d counter-clockwise seen from the front
    this.tri(a, b, c, color, uvs ? [uvs[0], uvs[1], uvs[2]] : undefined);
    this.tri(a, c, d, color, uvs ? [uvs[0], uvs[2], uvs[3]] : undefined);
  }
  get empty() { return this.pos.length === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(mat: THREE.Material, { cast = true, receive = true } = {}) {
    if (this.empty) return null;
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}

// ---------- procedural textures ----------
export function canvas(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function asphaltTexture() {
  const c = canvas(512, 512), g = c.getContext('2d')!;
  g.fillStyle = '#3a3740'; g.fillRect(0, 0, 512, 512);
  const r = rng(7);
  for (let i = 0; i < 26000; i++) { const v = 40 + r() * 40 | 0; g.fillStyle = `rgba(${v},${v - 2},${v + 4},${0.25 + r() * 0.35})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${r() < 0.5 ? 30 : 70},${r() < 0.5 ? 28 : 66},${r() < 0.5 ? 34 : 72},0.25)`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(20,18,24,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * 512, y = r() * 512; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  return tex(c);
}
export function tileTexture() {
  const c = canvas(256, 256), g = c.getContext('2d')!;
  g.fillStyle = '#b9aa98'; g.fillRect(0, 0, 256, 256);
  const r = rng(11), cols = ['#c7b8a4', '#a8998a', '#bfae96', '#9e8f82', '#cbbca8'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(60,50,40,${r() * 0.15})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  return tex(c);
}
// kerb paint: alternating light / dark blocks, 1 m per pair along u (tinted yellow or white by vertex colour)
export function kerbTexture() {
  const c = canvas(64, 4), g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 4); g.fillStyle = '#26242c'; g.fillRect(32, 0, 32, 4);
  const t = tex(c); t.magFilter = THREE.NearestFilter; return t;
}
export function radialTexture() {
  const c = canvas(128, 128), g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}
// upper-floor facade: one tile = one window bay (3 m) x one floor (3.2 m). `lit` = emissive variant.
export function facadeTextures() {
  const mk = (lit: boolean) => {
    const c = canvas(512, 512), g = c.getContext('2d')!;
    const r = rng(lit ? 5 : 4), r2 = rng(5);
    g.fillStyle = lit ? '#000' : '#fff'; g.fillRect(0, 0, 512, 512);
    // 4 x 4 bays per tile so neighbouring windows differ
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const on = r2() < 0.36, kind = r2();
      const X = x * 128, Y = y * 128;
      if (!lit) {
        g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(X, Y + 116, 128, 12);           // floor band
        if (kind < 0.25) {                                                             // balcony
          g.fillStyle = '#3c4054'; g.fillRect(X + 22, Y + 18, 84, 74);
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(X + 12, Y + 70, 104, 30);
        } else {
          g.fillStyle = on ? '#5a5f74' : '#3c4054'; g.fillRect(X + 30, Y + 26, 68, 58);
          g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(X + 26, Y + 22, 76, 5); g.fillRect(X + 26, Y + 84, 76, 5);
          if (kind > 0.55) { g.fillStyle = '#2b2a31'; for (let k = 0; k < 4; k++) g.fillRect(X + 40 + k * 16, Y + 26, 3, 58); }
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(X + 22, Y + 14, 84, 8);       // sunshade
          if (kind > 0.8) { g.fillStyle = '#e9e9ee'; g.fillRect(X + 36, Y + 92, 40, 20); }  // AC unit
        }
      } else {
        if (!on || kind < 0.25 && r() < 0.5) continue;
        // a lit room: warm or tube-light, brighter at the bottom, with curtain and mullion shadows
        const warm = r() < 0.6, wx = X + 32, wy = Y + 28, ww = 64, wh = 54;
        const gr = g.createLinearGradient(0, wy, 0, wy + wh);
        gr.addColorStop(0, warm ? '#6a4a22' : '#4a5560'); gr.addColorStop(1, warm ? '#d8a55e' : '#c8dde6');
        g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        if (r() < 0.6) g.fillRect(wx + (r() < 0.5 ? 0 : ww * 0.55), wy, ww * 0.45, wh);   // drawn curtain
        if (kind > 0.55) for (let k = 0; k < 4; k++) g.fillRect(X + 40 + k * 16, wy, 3, wh);
        g.fillRect(wx, wy + wh * 0.48, ww, 3);
      }
      void r;
    }
    return tex(c);
  };
  return { map: mk(false), emissive: mk(true) };
}
// ground-floor shopfront band: shutters, glass and open shops
export function shopfrontTextures() {
  const mk = (lit: boolean) => {
    const c = canvas(512, 128), g = c.getContext('2d')!;
    const r = rng(9);
    g.fillStyle = lit ? '#000' : '#d8d2c8'; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++) {
      const X = i * 128, kind = r();
      if (lit) {
        if (kind < 0.35) { g.fillStyle = '#1a1208'; g.fillRect(X + 10, 112, 108, 6); continue; }   // shutter: light leaking underneath
        const gr = g.createLinearGradient(0, 14, 0, 118);
        gr.addColorStop(0, kind > 0.7 ? '#e8f2ff' : '#ffe2a8'); gr.addColorStop(1, kind > 0.7 ? '#7d8ea8' : '#a8743c');
        g.fillStyle = gr; g.fillRect(X + 10, 14, 108, 104);
        if (kind < 0.7) for (let s2 = 0; s2 < 3; s2++) for (let k = 0; k < 6; k++) {   // goods on shelves, lit from inside
          g.fillStyle = ['#b0302a', '#1d4596', '#c88a1c', '#1a8a58', '#b24f74', '#dcdcdc'][(k + s2 * 2 + i) % 6]; g.fillRect(X + 16 + k * 17, 24 + s2 * 30, 13, 20);
        } else { g.fillStyle = 'rgba(20,24,40,0.7)'; for (let k = 0; k < 3; k++) g.fillRect(X + 26 + k * 32, 44, 12, 60); }   // mannequins in a glass front
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(X + 10, 14, 108, 8); continue;
      }
      g.fillStyle = '#5d5a64'; g.fillRect(X, 0, 8, 128);
      if (kind < 0.35) { // shutter
        g.fillStyle = '#9a97a0'; g.fillRect(X + 10, 14, 108, 104);
        for (let y = 14; y < 118; y += 6) { g.fillStyle = '#7b7882'; g.fillRect(X + 10, y, 108, 2); }
      } else if (kind < 0.7) { // open shop with goods
        g.fillStyle = '#6b5240'; g.fillRect(X + 10, 14, 108, 104);
        for (let s = 0; s < 3; s++) for (let k = 0; k < 6; k++) { g.fillStyle = ['#E8413A', '#1F5FCC', '#FFB627', '#22B573', '#F06A9B', '#fff'][(k + s * 2 + i) % 6]; g.fillRect(X + 16 + k * 17, 24 + s * 30, 13, 20); }
      } else { // glass front
        g.fillStyle = '#33425e'; g.fillRect(X + 10, 14, 108, 104);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(X + 18, 20, 20, 90);
      }
    }
    return tex(c);
  };
  return { map: mk(false), emissive: mk(true) };
}

// Spatially tiled batch: geometry is bucketed into square tiles so frustum culling (and the shadow pass) skips far tiles.
export class TiledBatch {
  tiles = new Map<string, Batch>();
  constructor(public size = 220) {}
  at(x: number, z: number): Batch {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.tiles.get(k); if (!b) { b = new Batch(); this.tiles.set(k, b); }
    return b;
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts?: AddOpts) { this.at(x, z).box(x, y, z, sx, sy, sz, color, opts); }
  add(t: Tpl, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts: AddOpts = {}) { this.at(x, z).add(t, x, y, z, sx, sy, sz, color, opts); }
  tri(a: number[], b: number[], c: number[], color: THREE.ColorRepresentation, uvs?: number[][]) { this.at((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3).tri(a, b, c, color, uvs); }
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation, uvs?: number[][]) { this.at((a[0] + c[0]) / 2, (a[2] + c[2]) / 2).quad(a, b, c, d, color, uvs); }
  addTpl(t: Tpl, m: THREE.Matrix4, color: THREE.ColorRepresentation, opts: AddOpts = {}) { this.at(m.elements[12], m.elements[14]).addTpl(t, m, color, opts); }
  meshes(mat: THREE.Material, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.tiles.values()) { const m = b.mesh(mat, { cast: o.cast ?? true, receive: o.receive ?? true }); if (m) out.push(m); }
    return out;
  }
}

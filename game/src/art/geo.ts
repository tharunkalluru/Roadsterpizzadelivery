/**
 * Geometry helpers shared by every art builder: a tiny mesh builder, polyline
 * sampling with mitred frames, profile sweeps, lofts and a seeded RNG.
 * All build-time only; nothing here runs per frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  constructor(public useColor = false) {}

  get vcount(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c?: ArrayLike<number>): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    if (this.useColor) {
      if (c) this.col.push(c[0], c[1], c[2]);
      else this.col.push(1, 1, 1);
    }
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /**
   * Quad from 4 corners (12 numbers, going around). Winding is flipped so the
   * geometric normal agrees with `n` (per-vertex 12 numbers or one V3); with no
   * `n` the winding is kept and the geometric normal is used.
   */
  quad(p: ArrayLike<number>, uv: ArrayLike<number>, n?: ArrayLike<number>, c?: ArrayLike<number>): void {
    const ax = p[3] - p[0], ay = p[4] - p[1], az = p[5] - p[2];
    const bx = p[6] - p[0], by = p[7] - p[1], bz = p[8] - p[2];
    let gx = ay * bz - az * by, gy = az * bx - ax * bz, gz = ax * by - ay * bx;
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    let flip = false;
    if (n) {
      const hx = n[0], hy = n[1], hz = n[2];
      if (gx * hx + gy * hy + gz * hz < 0) flip = true;
    }
    const base = this.vcount;
    for (let k = 0; k < 4; k++) {
      let nx = gx, ny = gy, nz = gz;
      if (n) {
        if (n.length >= 12) { nx = n[k * 3]; ny = n[k * 3 + 1]; nz = n[k * 3 + 2]; }
        else { nx = n[0]; ny = n[1]; nz = n[2]; }
      } else if (flip) { nx = -gx; ny = -gy; nz = -gz; }
      this.vert(p[k * 3], p[k * 3 + 1], p[k * 3 + 2], nx, ny, nz, uv[k * 2], uv[k * 2 + 1], c);
    }
    if (flip) { this.tri(base, base + 2, base + 1); this.tri(base, base + 3, base + 2); }
    else { this.tri(base, base + 1, base + 2); this.tri(base, base + 2, base + 3); }
  }

  /** Triangle with explicit normal-driven winding. */
  triangle(a: V3, b: V3, c: V3, uvA: [number, number], uvB: [number, number], uvC: [number, number], n?: V3, col?: ArrayLike<number>): void {
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let gx = e1[1] * e2[2] - e1[2] * e2[1], gy = e1[2] * e2[0] - e1[0] * e2[2], gz = e1[0] * e2[1] - e1[1] * e2[0];
    const gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl; gy /= gl; gz /= gl;
    let flip = false;
    if (n && gx * n[0] + gy * n[1] + gz * n[2] < 0) flip = true;
    const nn: V3 = n ?? [gx, gy, gz];
    const i0 = this.vert(a[0], a[1], a[2], nn[0], nn[1], nn[2], uvA[0], uvA[1], col);
    const i1 = this.vert(b[0], b[1], b[2], nn[0], nn[1], nn[2], uvB[0], uvB[1], col);
    const i2 = this.vert(c[0], c[1], c[2], nn[0], nn[1], nn[2], uvC[0], uvC[1], col);
    if (flip) this.tri(i0, i2, i1); else this.tri(i0, i1, i2);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Append all vertices of another builder, optionally forcing a constant UV. */
  appendBuilder(o: GeoBuilder, uv?: [number, number]): void {
    const base = this.vcount;
    for (let i = 0; i < o.pos.length; i++) this.pos.push(o.pos[i]);
    for (let i = 0; i < o.nor.length; i++) this.nor.push(o.nor[i]);
    for (let i = 0; i < o.uv.length; i += 2) {
      if (uv) this.uv.push(uv[0], uv[1]); else this.uv.push(o.uv[i], o.uv[i + 1]);
    }
    if (this.useColor) {
      if (o.useColor) for (let i = 0; i < o.col.length; i++) this.col.push(o.col[i]);
      else for (let i = 0; i < o.pos.length / 3; i++) this.col.push(1, 1, 1);
    }
    for (let i = 0; i < o.idx.length; i++) this.idx.push(base + o.idx[i]);
  }

  /** Append another geometry (already positioned) into this builder. */
  appendGeometry(g: THREE.BufferGeometry, m?: THREE.Matrix4, color?: ArrayLike<number>): void {
    const p = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const colAttr = g.getAttribute('color');
    const index = g.getIndex();
    const base = this.vcount;
    const cc: number[] = [1, 1, 1];
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (m) v.applyMatrix4(m);
      if (nrm) { n.fromBufferAttribute(nrm, i); if (nm) n.applyMatrix3(nm).normalize(); } else n.set(0, 1, 0);
      if (colAttr) {
        cc[0] = colAttr.getX(i) * (color ? color[0] : 1);
        cc[1] = colAttr.getY(i) * (color ? color[1] : 1);
        cc[2] = colAttr.getZ(i) * (color ? color[2] : 1);
        this.vert(v.x, v.y, v.z, n.x, n.y, n.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, cc);
      } else this.vert(v.x, v.y, v.z, n.x, n.y, n.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, color);
    }
    const flip = m ? m.determinant() < 0 : false;
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        if (flip) this.tri(base + index.getX(i), base + index.getX(i + 2), base + index.getX(i + 1));
        else this.tri(base + index.getX(i), base + index.getX(i + 1), base + index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < p.count; i += 3) {
        if (flip) this.tri(base + i, base + i + 2, base + i + 1);
        else this.tri(base + i, base + i + 1, base + i + 2);
      }
    }
  }
}

/** Merge a list of equally-attributed indexed geometries; disposes the inputs. */
export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (list.length > 1) list.forEach((x) => x.dispose());
  if (!g) return null;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/* ------------------------------------------------------------------ RNG */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ----------------------------------------------------- polyline sampling */

export interface PSample {
  x: number;
  z: number;
  y: number;
  /** unit tangent in the XZ plane (direction of travel along the polyline) */
  tx: number;
  tz: number;
  /** arclength from polyline start */
  s: number;
  /** mitre factor (>=1) that keeps lateral offsets at constant distance through corners */
  m: number;
}

/** Right-hand lateral vector for a forward vector (X east, Z south, Y up). */
export function rightOf(tx: number, tz: number): [number, number] {
  return [-tz, tx];
}

export function makeSamples(points: ArrayLike<ArrayLike<number>>, elev?: ArrayLike<number> | number): PSample[] {
  const pts: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const x = points[i][0], z = points[i][1];
    const y = typeof elev === 'number' ? elev : elev ? elev[i] ?? 0 : 0;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 1e-3) {
      last.y = Math.max(last.y, y);
      continue;
    }
    pts.push({ x, z, y });
  }
  const n = pts.length;
  const out: PSample[] = [];
  if (n < 2) return out;
  const segT: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z;
    const l = Math.hypot(dx, dz) || 1;
    segT.push([dx / l, dz / l]);
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    let tx: number, tz: number, m = 1;
    if (i === 0) { [tx, tz] = segT[0]; }
    else if (i === n - 1) { [tx, tz] = segT[n - 2]; }
    else {
      const a = segT[i - 1], b = segT[i];
      tx = a[0] + b[0]; tz = a[1] + b[1];
      const l = Math.hypot(tx, tz);
      if (l < 1e-4) { tx = b[0]; tz = b[1]; }
      else { tx /= l; tz /= l; }
      const d = tx * a[0] + tz * a[1];
      m = 1 / Math.max(0.45, d);
    }
    out.push({ x: pts[i].x, z: pts[i].z, y: pts[i].y, tx, tz, s, m });
  }
  return out;
}

export function polyLength(samples: PSample[]): number {
  return samples.length ? samples[samples.length - 1].s : 0;
}

export function sampleAt(samples: PSample[], s: number): PSample {
  const n = samples.length;
  if (s <= samples[0].s) return { ...samples[0] };
  if (s >= samples[n - 1].s) return { ...samples[n - 1] };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const t = (s - a.s) / (b.s - a.s || 1);
  let tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l; tz /= l;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, tx, tz, s, m: a.m + (b.m - a.m) * t };
}

/** Sub-polyline between arclengths s0 and s1 with interpolated end samples. */
export function sliceSamples(samples: PSample[], s0: number, s1: number): PSample[] {
  if (s1 - s0 < 0.05 || !samples.length) return [];
  const out: PSample[] = [sampleAt(samples, s0)];
  for (const p of samples) if (p.s > s0 + 0.01 && p.s < s1 - 0.01) out.push(p);
  out.push(sampleAt(samples, s1));
  return out;
}

/** Offset position of a sample along the right vector. */
export function offsetPos(p: PSample, r: number, out: V3 = [0, 0, 0], dy = 0): V3 {
  const [rx, rz] = rightOf(p.tx, p.tz);
  out[0] = p.x + rx * r * p.m;
  out[1] = p.y + dy;
  out[2] = p.z + rz * r * p.m;
  return out;
}

export type Profile = [number, number][];

export interface SweepOpts {
  /** +1 uses outward normal = (dv,-dr) of the profile direction, -1 flips */
  sign?: 1 | -1;
  /** metres of texture per UV unit */
  tile?: number;
  color?: ArrayLike<number>;
  /** profile may change along the sweep */
  profileAt?: (i: number, p: PSample) => Profile;
  /** extra vertical offset */
  dy?: number;
  /** extra uv offset */
  u0?: number;
  v0?: number;
  /** close both ends of the sweep with a triangle fan (convex profiles only) */
  caps?: boolean;
}

/**
 * Sweep a 2D profile [(rightOffset, up)...] along samples. Faces are flat-shaded
 * per profile segment (hard edges, appropriate for concrete / steel).
 */
export function sweep(b: GeoBuilder, samples: PSample[], profile: Profile, o: SweepOpts = {}): void {
  const sign = o.sign ?? 1;
  const tile = o.tile ?? 2;
  const dy = o.dy ?? 0;
  const prof = (i: number): Profile => (o.profileAt ? o.profileAt(i, samples[i]) : profile);
  const np = profile.length;
  const pa: V3 = [0, 0, 0];
  const pb: V3 = [0, 0, 0];
  const pc: V3 = [0, 0, 0];
  const pd: V3 = [0, 0, 0];
  const posArr = new Array(12);
  const uvArr = new Array(8);
  const nArr = new Array(3);
  for (let i = 0; i < samples.length - 1; i++) {
    const A = samples[i], B = samples[i + 1];
    const PA = prof(i), PB = prof(i + 1);
    const [rax, raz] = rightOf(A.tx, A.tz);
    const [rbx, rbz] = rightOf(B.tx, B.tz);
    let vl = 0;
    for (let k = 0; k < np - 1; k++) {
      const a0 = PA[k], a1 = PA[k + 1], b0 = PB[k], b1 = PB[k + 1];
      offsetPos(A, a0[0], pa, a0[1] + dy);
      offsetPos(A, a1[0], pb, a1[1] + dy);
      offsetPos(B, b1[0], pc, b1[1] + dy);
      offsetPos(B, b0[0], pd, b0[1] + dy);
      const dr = a1[0] - a0[0], dv = a1[1] - a0[1];
      const segLen = Math.hypot(dr, dv);
      if (segLen < 1e-5) continue;
      const nr = (dv / segLen) * sign, nv = (-dr / segLen) * sign;
      const nx = (rax + rbx) * 0.5 * nr, nz = (raz + rbz) * 0.5 * nr;
      const nl = Math.hypot(nx, nv, nz) || 1;
      nArr[0] = nx / nl; nArr[1] = nv / nl; nArr[2] = nz / nl;
      posArr[0] = pa[0]; posArr[1] = pa[1]; posArr[2] = pa[2];
      posArr[3] = pb[0]; posArr[4] = pb[1]; posArr[5] = pb[2];
      posArr[6] = pc[0]; posArr[7] = pc[1]; posArr[8] = pc[2];
      posArr[9] = pd[0]; posArr[10] = pd[1]; posArr[11] = pd[2];
      const u0 = (A.s / tile) + (o.u0 ?? 0), u1 = (B.s / tile) + (o.u0 ?? 0);
      const v0 = vl / tile + (o.v0 ?? 0), v1 = (vl + segLen) / tile + (o.v0 ?? 0);
      uvArr[0] = u0; uvArr[1] = v0; uvArr[2] = u0; uvArr[3] = v1; uvArr[4] = u1; uvArr[5] = v1; uvArr[6] = u1; uvArr[7] = v0;
      b.quad(posArr, uvArr, nArr, o.color);
      vl += segLen;
    }
  }
  if (o.caps && samples.length >= 2) {
    const capAt = (i: number, dir: number): void => {
      const S = samples[i];
      const P = prof(i);
      let cr = 0, cv = 0;
      for (const q of P) { cr += q[0]; cv += q[1]; }
      cr /= P.length; cv /= P.length;
      const c = offsetPos(S, cr, [0, 0, 0], cv + dy);
      const nn: V3 = [S.tx * dir, 0, S.tz * dir];
      for (let k = 0; k < P.length; k++) {
        const a = P[k], bq = P[(k + 1) % P.length];
        const A = offsetPos(S, a[0], [0, 0, 0], a[1] + dy);
        const B = offsetPos(S, bq[0], [0, 0, 0], bq[1] + dy);
        b.triangle(c, A, B, [0, 0], [1, 0], [0, 1], nn, o.color);
      }
    };
    capAt(0, -1);
    capAt(samples.length - 1, 1);
  }
}

/** Flat horizontal strip between lateral offsets r0 and r1 at the sample's y (+dy), facing up. */
export function strip(
  b: GeoBuilder,
  samples: PSample[],
  r0: number,
  r1: number,
  dy: number,
  uvFn: (x: number, z: number, s: number, r: number) => [number, number],
  color?: ArrayLike<number>,
): void {
  const pa: V3 = [0, 0, 0], pb: V3 = [0, 0, 0], pc: V3 = [0, 0, 0], pd: V3 = [0, 0, 0];
  const up = [0, 1, 0];
  const posArr = new Array(12);
  const uvArr = new Array(8);
  for (let i = 0; i < samples.length - 1; i++) {
    const A = samples[i], B = samples[i + 1];
    offsetPos(A, r0, pa, dy); offsetPos(A, r1, pb, dy);
    offsetPos(B, r1, pc, dy); offsetPos(B, r0, pd, dy);
    const ua = uvFn(pa[0], pa[2], A.s, r0), ub = uvFn(pb[0], pb[2], A.s, r1), uc = uvFn(pc[0], pc[2], B.s, r1), ud = uvFn(pd[0], pd[2], B.s, r0);
    posArr[0] = pa[0]; posArr[1] = pa[1]; posArr[2] = pa[2];
    posArr[3] = pb[0]; posArr[4] = pb[1]; posArr[5] = pb[2];
    posArr[6] = pc[0]; posArr[7] = pc[1]; posArr[8] = pc[2];
    posArr[9] = pd[0]; posArr[10] = pd[1]; posArr[11] = pd[2];
    uvArr[0] = ua[0]; uvArr[1] = ua[1]; uvArr[2] = ub[0]; uvArr[3] = ub[1]; uvArr[4] = uc[0]; uvArr[5] = uc[1]; uvArr[6] = ud[0]; uvArr[7] = ud[1];
    b.quad(posArr, uvArr, up, color);
  }
}

/* ------------------------------------------------------------- polygons */

export function signedArea(poly: ArrayLike<number>[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function pointInPoly(x: number, z: number, poly: ArrayLike<number>[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the polygon boundary. */
export function distToPolyEdge(x: number, z: number, poly: ArrayLike<number>[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t)));
  }
  return best;
}

/** Triangulate a horizontal polygon (with optional holes) facing up at height y. */
export function addHorizontalPolygon(
  b: GeoBuilder,
  poly: ArrayLike<number>[],
  holes: ArrayLike<number>[][] | undefined,
  y: number,
  uvFn: (x: number, z: number) => [number, number],
  color?: ArrayLike<number>,
  normalY = 1,
): void {
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const holeV = (holes ?? []).map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
  const faces = THREE.ShapeUtils.triangulateShape(contour, holeV);
  const all = contour.concat(...holeV);
  const base = b.vcount;
  for (const p of all) {
    const uv = uvFn(p.x, p.y);
    b.vert(p.x, y, p.y, 0, normalY, 0, uv[0], uv[1], color);
  }
  for (const f of faces) {
    // ensure the face points in +Y (or -Y) as requested
    const a = all[f[0]], bb = all[f[1]], c = all[f[2]];
    const cross = (bb.x - a.x) * (c.y - a.y) - (bb.y - a.y) * (c.x - a.x);
    // cross (in x,z) > 0 => normal points -Y for (a,b,c) order in right-handed XYZ
    const wantUp = normalY > 0;
    const isUp = cross < 0;
    if (isUp === wantUp) b.tri(base + f[0], base + f[1], base + f[2]);
    else b.tri(base + f[0], base + f[2], base + f[1]);
  }
}

/* ------------------------------------------------------------------ loft */

export interface LoftStation {
  z: number;
  halfW: number;
  yBot: number;
  yTop: number;
  /** horizontal squeeze of the top half (0..0.6) for tumblehome */
  tumble?: number;
  /** superellipse exponent (2 = ellipse, higher = boxier) */
  n?: number;
  /** lateral centre offset */
  cx?: number;
  /** raises the upper surface near the shoulders (fender crowns) */
  crown?: number;
  /** per-vertex vertical adjustment: (lateral -1..1, y) => y */
  lower?: (ex: number, y: number) => number;
}

/** Smooth closed-ring loft along Z. Station list must be ordered by z. Ends taper to a point. */
export function loft(stations: LoftStation[], ring = 20, color?: ArrayLike<number>, uvScale = 1): THREE.BufferGeometry {
  const b = new GeoBuilder(!!color);
  const S = stations.length;
  for (let s = 0; s < S; s++) {
    const st = stations[s];
    const n = st.n ?? 2.6;
    const tum = st.tumble ?? 0;
    const yMid = (st.yTop + st.yBot) / 2;
    const hh = (st.yTop - st.yBot) / 2;
    for (let k = 0; k <= ring; k++) {
      const t = (k / ring) * Math.PI * 2;
      const c = Math.cos(t), si = Math.sin(t);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ey = Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
      const squeeze = ey > 0 ? 1 - tum * ey : 1;
      const x = (st.cx ?? 0) + st.halfW * ex * squeeze;
      let y = yMid + hh * ey;
      if (st.crown && ey > 0) y += st.crown * Math.exp(-Math.pow((Math.abs(ex) - 0.72) / 0.24, 2)) * ey;
      if (st.lower) y = st.lower(ex, y);
      b.vert(x, y, st.z, 0, 1, 0, (k / ring) * uvScale, st.z * 0.25 * uvScale, color);
    }
  }
  const row = ring + 1;
  for (let s = 0; s < S - 1; s++) {
    for (let k = 0; k < ring; k++) {
      const a = s * row + k, bb = a + 1, c = a + row + 1, d = a + row;
      // winding chosen so normals point outward for stations ordered by increasing z
      b.tri(a, bb, c);
      b.tri(a, c, d);
    }
  }
  const g = b.build();
  g.computeVertexNormals();
  // verify orientation: normal of the first top vertex should point +Y roughly; flip winding if not
  const nrm = g.getAttribute('normal');
  const pos = g.getAttribute('position');
  const mid = Math.floor(S / 2) * row + Math.floor(ring / 4);
  const yMidVal = (stations[Math.floor(S / 2)].yTop + stations[Math.floor(S / 2)].yBot) / 2;
  if ((pos.getY(mid) - yMidVal) * nrm.getY(mid) < 0) {
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i += 3) {
      const t1 = idx.getX(i + 1), t2 = idx.getX(i + 2);
      idx.setX(i + 1, t2); idx.setX(i + 2, t1);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** z-ordered station helper: interpolate smoothly through key values using smoothstep-ish easing. */
export function taperRadius(t: number, p = 0.5): number {
  // t in 0..1 from the tip; returns 0..1 with rounded tip (ellipse-like)
  return Math.pow(Math.max(0, 1 - Math.pow(1 - Math.min(1, t), 2)), p);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
export function hex(c: number): [number, number, number] {
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
}

/**
 * Axis-aligned box in local space centred at the origin of `m` (default identity) with
 * metre-scaled UVs (u,v from face dimensions / tile) so concrete tiles stay square.
 */
export function addBox(
  b: GeoBuilder,
  sx: number,
  sy: number,
  sz: number,
  m?: THREE.Matrix4,
  tile = 2,
  color?: ArrayLike<number>,
  faces: { top?: boolean; bottom?: boolean } = {},
): void {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  const tv = new THREE.Vector3();
  const tn = new THREE.Vector3();
  const face = (corners: number[], n: V3, du: number, dv: number): void => {
    const p: number[] = [];
    const nn: number[] = [];
    for (let i = 0; i < 4; i++) {
      tv.set(corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2]);
      if (m) tv.applyMatrix4(m);
      p.push(tv.x, tv.y, tv.z);
      tn.set(n[0], n[1], n[2]);
      if (nm) tn.applyMatrix3(nm).normalize();
      nn.push(tn.x, tn.y, tn.z);
    }
    b.quad(p, [0, 0, du / tile, 0, du / tile, dv / tile, 0, dv / tile], nn, color);
  };
  // +X, -X, +Z, -Z, +Y, -Y  (each ordered so the geometric normal matches n; quad() re-checks anyway)
  face([hx, -hy, -hz, hx, hy, -hz, hx, hy, hz, hx, -hy, hz], [1, 0, 0], sz, sy);
  face([-hx, -hy, hz, -hx, hy, hz, -hx, hy, -hz, -hx, -hy, -hz], [-1, 0, 0], sz, sy);
  face([hx, -hy, hz, hx, hy, hz, -hx, hy, hz, -hx, -hy, hz], [0, 0, 1], sx, sy);
  face([-hx, -hy, -hz, -hx, hy, -hz, hx, hy, -hz, hx, -hy, -hz], [0, 0, -1], sx, sy);
  if (faces.top !== false) face([-hx, hy, hz, hx, hy, hz, hx, hy, -hz, -hx, hy, -hz], [0, 1, 0], sx, sz);
  if (faces.bottom !== false) face([-hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz], [0, -1, 0], sx, sz);
}

export function boxMatrix(cx: number, cy: number, cz: number, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(rotX, rotY, rotZ, 'YXZ');
  m.makeRotationFromEuler(e);
  m.setPosition(cx, cy, cz);
  return m;
}

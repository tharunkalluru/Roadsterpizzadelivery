/**
 * Low-poly but well-proportioned Hyderabad street traffic: hatchback car,
 * auto-rickshaw, TSRTC-style city bus (generic livery, no logos), motorbike with
 * rider, goods truck. Shared materials, merged geometry (<= 5 draw calls each).
 *
 * Every template exposes:
 *   - child "body"  : paint mesh (material.color is the vehicle colour; clone material to vary)
 *   - child "brake" : tail-light mesh; swap material with object.userData.brakeOn / brakeOff
 *   - userData.paintVariants : suggested colours for the lead's spawner
 * Forward is -Z, origin at ground centre.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Quality, TrafficKind, TrafficTemplate } from './api';
import { GeoBuilder, addBox, boxMatrix, clamp, hex, loft, smoothstep } from './geo';
import { curve } from './hero';

type RGB = [number, number, number];

/* ----------------------------------------------------------- materials */

interface VMats {
  detail: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  brakeOff: THREE.MeshStandardMaterial;
  brakeOn: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
  paint: Record<TrafficKind, THREE.MeshStandardMaterial>;
}
let vmats: VMats | null = null;

function getVMats(): VMats {
  if (vmats) return vmats;
  const mk = (color: number, metal: number, rough: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, vertexColors: true, envMapIntensity: 1.1 });
  vmats = {
    detail: new THREE.MeshStandardMaterial({ name: 'veh-detail', vertexColors: true, roughness: 0.72, metalness: 0.12 }),
    glass: new THREE.MeshStandardMaterial({ name: 'veh-glass', color: 0x5a7690, roughness: 0.06, metalness: 0.45, envMapIntensity: 1.6 }),
    brakeOff: new THREE.MeshStandardMaterial({ name: 'veh-brake-off', color: 0x5a0a08, emissive: 0xc01810, emissiveIntensity: 0.35, roughness: 0.4 }),
    brakeOn: new THREE.MeshStandardMaterial({ name: 'veh-brake-on', color: 0x8a0e0a, emissive: 0xff2a1c, emissiveIntensity: 3.2, roughness: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({ name: 'veh-lamp', color: 0xf5f8ff, emissive: 0xfff4dc, emissiveIntensity: 1.6, roughness: 0.3 }),
    paint: {
      car: mk(0xd8dde3, 0.45, 0.32),
      auto: mk(0xf2c230, 0.2, 0.45),
      bus: mk(0xc3281f, 0.25, 0.42),
      bike: mk(0xb81f27, 0.55, 0.3),
      truck: mk(0x2563a8, 0.3, 0.4),
    },
  };
  vmats.paint.car.name = 'veh-paint-car';
  vmats.paint.auto.name = 'veh-paint-auto';
  vmats.paint.bus.name = 'veh-paint-bus';
  vmats.paint.bike.name = 'veh-paint-bike';
  vmats.paint.truck.name = 'veh-paint-truck';
  return vmats;
}

/* ------------------------------------------------------------- helpers */

const WHITE: RGB = [1, 1, 1];
const BLACK = hex(0x101113);
const RUBBER = hex(0x151618);
const CHROME = hex(0xb9bec4);
const STEEL = hex(0x5c636b);

interface Parts {
  paint: GeoBuilder;
  detail: GeoBuilder;
  glass: GeoBuilder;
  brake: GeoBuilder;
  lamp: GeoBuilder;
}
const newParts = (): Parts => ({ paint: new GeoBuilder(true), detail: new GeoBuilder(true), glass: new GeoBuilder(false), brake: new GeoBuilder(false), lamp: new GeoBuilder(false) });

function bx(b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, col: ArrayLike<number> = WHITE, ry = 0, rx = 0, rz = 0): void {
  addBox(b, w, h, d, boxMatrix(x, y, z, ry, rx, rz), 1, col);
}
function rbox(b: GeoBuilder, w: number, h: number, d: number, r: number, x: number, y: number, z: number, col: ArrayLike<number> = WHITE, ry = 0): void {
  const g = new RoundedBoxGeometry(w, h, d, 2, r);
  b.appendGeometry(g, boxMatrix(x, y, z, ry), col);
  g.dispose();
}
function cylX(b: GeoBuilder, r: number, w: number, x: number, y: number, z: number, col: ArrayLike<number>, seg = 14, r2 = r): void {
  const g = new THREE.CylinderGeometry(r, r2, w, seg, 1);
  g.rotateZ(Math.PI / 2);
  b.appendGeometry(g, new THREE.Matrix4().makeTranslation(x, y, z), col);
  g.dispose();
}
function cylY(b: GeoBuilder, r0: number, r1: number, h: number, x: number, y: number, z: number, col: ArrayLike<number>, seg = 10): void {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1);
  b.appendGeometry(g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), col);
  g.dispose();
}
const _up = new THREE.Vector3(0, 1, 0);
function limb(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, col: ArrayLike<number>, seg = 8): void {
  const dir = new THREE.Vector3().subVectors(c, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  b.appendGeometry(g, m, col);
  g.dispose();
}
function sphere(b: GeoBuilder, r: number, x: number, y: number, z: number, col: ArrayLike<number>, sx = 1, sy = 1, sz = 1, seg = 10): void {
  const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 3));
  b.appendGeometry(g, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), col);
  g.dispose();
}
function wheel(det: GeoBuilder, x: number, y: number, z: number, r: number, w: number, seg: number, hubCol: ArrayLike<number> = CHROME): void {
  cylX(det, r, w, x, y, z, RUBBER, seg);
  const out = Math.sign(x) || 1;
  cylX(det, r * 0.6, w * 0.3, x + out * (w / 2 - 0.004), y, z, hubCol, Math.max(8, seg - 4));
  cylX(det, r * 0.22, w * 0.34, x + out * (w / 2 + 0.002), y, z, STEEL, 8);
}

/** Closed (z,y) side profile extruded across x with linear half-width taper by height. */
function prism(b: GeoBuilder, prof: [number, number][], hwAt: (y: number) => number, col: ArrayLike<number> = WHITE): void {
  const n = prof.length;
  let cz = 0, cy = 0;
  for (const p of prof) { cz += p[0]; cy += p[1]; }
  cz /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const p = prof[i], q = prof[(i + 1) % n];
    const hp = hwAt(p[1]), hq = hwAt(q[1]);
    const dz = q[0] - p[0], dy = q[1] - p[1];
    let nz = dy, ny = -dz;
    const mz = (p[0] + q[0]) / 2 - cz, my = (p[1] + q[1]) / 2 - cy;
    if (nz * mz + ny * my < 0) { nz = -nz; ny = -ny; }
    const l = Math.hypot(nz, ny) || 1;
    b.quad([-hp, p[1], p[0], hp, p[1], p[0], hq, q[1], q[0], -hq, q[1], q[0]], [0, 0, 1, 0, 1, 1, 0, 1], [0, ny / l, nz / l], col);
  }
  const tris = THREE.ShapeUtils.triangulateShape(prof.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const s of [-1, 1]) {
    for (const t of tris) {
      const P = t.map((k) => [s * hwAt(prof[k][1]), prof[k][1], prof[k][0]] as [number, number, number]);
      b.triangle(P[0], P[1], P[2], [0, 0], [1, 0], [0, 1], [s, 0.12, 0], col);
    }
  }
}

/** Planar window on both sides of a prism. pts = [z,y] x4 around the window. */
function sideWindows(g: GeoBuilder, pts: [number, number][], hwAt: (y: number) => number, eps = 0.012): void {
  for (const s of [-1, 1]) {
    const c: number[] = [];
    for (const [z, y] of pts) c.push(s * (hwAt(y) + eps), y, z);
    g.quad(c, [0, 0, 1, 0, 1, 1, 0, 1], [s, 0.1, 0]);
  }
}
/** Slanted glass quad (windshield/rear glass) between two (z,y) points, with half-width inset. */
function slantGlass(g: GeoBuilder, a: [number, number], b: [number, number], hwAt: (y: number) => number, inset: number, outward: number, eps = 0.012): void {
  const ha = hwAt(a[1]) - inset, hb = hwAt(b[1]) - inset;
  const dz = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dz, dy) || 1;
  const nz = (dy / l) * outward, ny = (-dz / l) * outward;
  const ez = nz * eps, ey = ny * eps;
  g.quad([-ha, a[1] + ey, a[0] + ez, ha, a[1] + ey, a[0] + ez, hb, b[1] + ey, b[0] + ez, -hb, b[1] + ey, b[0] + ez], [0, 0, 1, 0, 1, 1, 0, 1], [0, ny, nz]);
}

/** Smooth sculpted lower body with cut wheel arches. */
function sculptBody(opts: {
  length: number; halfW: number; yBot: number; top: [number, number][]; noseLen: number; tailLen: number;
  archZ: number[]; archR: number; wheelR: number; wheelX: number; n?: number; tumble?: number; ring?: number; stations?: number;
}): THREE.BufferGeometry {
  const st = [];
  const N = opts.stations ?? 36;
  const half = opts.length / 2;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const z = -half + opts.length * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const ellp = (d: number, len: number): number => Math.sqrt(Math.max(0, 1 - Math.pow(1 - clamp(d / len, 0, 1), 2)));
    const hw = opts.halfW * Math.min(ellp(z + half, opts.noseLen), ellp(half - z, opts.tailLen));
    let arch = -1;
    for (const az of opts.archZ) {
      const dz = Math.abs(z - az);
      if (dz < opts.archR) arch = Math.max(arch, opts.wheelR + 0.03 + Math.sqrt(opts.archR * opts.archR - dz * dz));
    }
    st.push({
      z, halfW: Math.max(0.0001, hw), yBot: opts.yBot, yTop: curve(opts.top, z), n: opts.n ?? 2.8, tumble: opts.tumble ?? 0.1,
      lower: arch > 0 ? (ex: number, y: number): number => y + (Math.max(y, arch) - y) * smoothstep(0.45, 0.85, Math.abs(ex)) : undefined,
    });
  }
  const g = loft(st, opts.ring ?? 16, [1, 1, 1]);
  // darken underside + arch interiors
  const p = g.getAttribute('position'), nr = g.getAttribute('normal');
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let d = smoothstep(-0.2, -0.65, nr.getY(i));
    for (const az of opts.archZ) if (Math.abs(p.getZ(i) - az) < opts.archR + 0.02 && Math.abs(p.getX(i)) > opts.halfW * 0.45 && p.getY(i) < opts.wheelR + 0.1 + opts.archR && Math.abs(nr.getX(i)) < 0.9) d = Math.max(d, 0.95);
    d = Math.max(d, smoothstep(opts.yBot + 0.12, opts.yBot + 0.02, p.getY(i)) * 0.85);
    const f = 1 - d * 0.9;
    c.setXYZ(i, f, f, f);
  }
  return g;
}

function finish(kind: TrafficKind, parts: Parts, size: { length: number; width: number; height: number }, variants: number[], q: Quality = 'standard'): TrafficTemplate {
  const m = getVMats();
  const root = new THREE.Group();
  root.name = `traffic-${kind}`;
  const add = (b: GeoBuilder, mat: THREE.Material, name: string, shadow = true): void => {
    if (b.vcount === 0) return;
    const mesh = new THREE.Mesh(b.build(), mat);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  add(parts.paint, m.paint[kind], 'body');
  if (q === 'low') {
    // fewer draw calls: glass and lamps become plain vertex colours inside the detail mesh
    const fold = (src: GeoBuilder, col: RGB): void => {
      const d = new GeoBuilder(true);
      d.appendBuilder(src);
      for (let i = 0; i < d.col.length; i += 3) { d.col[i] = col[0]; d.col[i + 1] = col[1]; d.col[i + 2] = col[2]; }
      parts.detail.appendBuilder(d);
    };
    fold(parts.glass, hex(0x3a5068));
    fold(parts.lamp, hex(0xf4f0e0));
    add(parts.detail, m.detail, 'detail');
  } else {
    add(parts.detail, m.detail, 'detail');
    add(parts.glass, m.glass, 'glass', false);
    add(parts.lamp, m.lamp, 'lamps', false);
  }
  add(parts.brake, m.brakeOff, 'brake', false);
  root.userData.brakeOn = m.brakeOn;
  root.userData.brakeOff = m.brakeOff;
  root.userData.paintVariants = variants;
  root.userData.dimensions = size;
  return { kind, object: root, length: size.length, width: size.width, height: size.height };
}

/* ======================================================= individual kinds */

function buildCar(q: Quality): TrafficTemplate {
  const P = newParts();
  const seg = q === 'low' ? 10 : 16;
  const wr = 0.31, wx = 0.76, az = 1.22;
  const body = sculptBody({
    length: 3.92, halfW: 0.86, yBot: 0.26, noseLen: 0.55, tailLen: 0.4, archZ: [-az, az], archR: 0.4, wheelR: wr, wheelX: wx,
    top: [[-1.96, 0.5], [-1.75, 0.64], [-1.1, 0.8], [-0.6, 0.86], [0.5, 0.88], [1.4, 0.9], [1.8, 0.86], [1.96, 0.72]],
    ring: q === 'low' ? 12 : 16, stations: q === 'low' ? 24 : 34, tumble: 0.1,
  });
  P.paint.appendGeometry(body);
  body.dispose();
  const hw = (y: number): number => 0.74 - (y - 0.86) * 0.24;
  prism(P.paint, [[-0.9, 0.86], [-0.14, 1.47], [1.0, 1.47], [1.66, 0.93]], hw, WHITE);
  // glass
  sideWindows(P.glass, [[-0.5, 0.99], [-0.12, 1.4], [0.34, 1.4], [0.34, 0.99]], hw);
  sideWindows(P.glass, [[0.43, 0.99], [0.43, 1.4], [0.92, 1.4], [1.3, 0.99]], hw);
  slantGlass(P.glass, [-0.84, 0.92], [-0.2, 1.42], hw, 0.09, 1);
  slantGlass(P.glass, [1.6, 0.97], [1.04, 1.42], hw, 0.1, 1);
  // lower trim, bumpers, grille, lights
  bx(P.detail, 1.62, 0.16, 0.2, 0, 0.3, -1.93, BLACK);
  bx(P.detail, 1.62, 0.16, 0.2, 0, 0.3, 1.92, BLACK);
  bx(P.detail, 0.8, 0.12, 0.05, 0, 0.56, -1.97, BLACK);
  for (const s of [-1, 1]) {
    bx(P.lamp, 0.34, 0.1, 0.05, s * 0.6, 0.62, -1.94 + Math.abs(s) * 0.02, WHITE, s * 0.35);
    bx(P.brake, 0.3, 0.1, 0.05, s * 0.62, 0.74, 1.92, WHITE, s * -0.3);
    // mirrors
    bx(P.detail, 0.14, 0.1, 0.1, s * 0.86, 0.98, -0.55, BLACK);
    // door handles/side strip
    bx(P.detail, 0.012, 0.03, 0.9, s * 0.87, 0.74, 0.3, BLACK);
  }
  bx(P.detail, 0.45, 0.12, 0.02, 0, 0.5, 1.96, hex(0xe8e8e8));
  for (const s of [-1, 1]) for (const z of [-az, az]) wheel(P.detail, s * wx, wr, z, wr, 0.2, seg);
  return finish('car', P, { length: 3.92, width: 1.74, height: 1.47 }, [0xd8dde3, 0xf2f2f0, 0x8e949b, 0x20242a, 0xb12a2a, 0x2a4f87, 0x6b7f9a, 0xc8b99a], q);
}

function buildAuto(q: Quality): TrafficTemplate {
  const P = newParts();
  const seg = q === 'low' ? 10 : 14;
  const black = hex(0x16181a);
  const green = hex(0x1f6b3a);
  const seat = hex(0x23262a);
  // passenger tub (yellow lower body), rounded
  rbox(P.paint, 1.3, 0.56, 1.62, 0.1, 0, 0.62, 0.72);
  // front cowl: narrow nose widening to the cabin
  const cowl = loft([
    { z: -1.42, halfW: 0.0001, yBot: 0.52, yTop: 0.62, n: 3, cx: 0 },
    { z: -1.36, halfW: 0.2, yBot: 0.5, yTop: 0.74, n: 3 },
    { z: -1.1, halfW: 0.33, yBot: 0.46, yTop: 0.9, n: 3.2 },
    { z: -0.7, halfW: 0.5, yBot: 0.42, yTop: 1.02, n: 3.2 },
    { z: -0.25, halfW: 0.63, yBot: 0.4, yTop: 1.04, n: 3.2 },
    { z: 0.0, halfW: 0.64, yBot: 0.4, yTop: 1.0, n: 3.2 },
  ], q === 'low' ? 10 : 14, [1, 1, 1]);
  P.paint.appendGeometry(cowl);
  cowl.dispose();
  // dark floor, seats, driver controls
  bx(P.detail, 1.1, 0.05, 2.5, 0, 0.36, 0.15, BLACK);
  bx(P.detail, 1.12, 0.16, 0.52, 0, 0.98, 0.9, seat);
  bx(P.detail, 1.12, 0.52, 0.12, 0, 1.28, 1.2, seat);
  bx(P.detail, 0.5, 0.14, 0.42, 0, 1.02, 0.0, seat);
  // roof posts + canopy
  const roofY = 1.78;
  for (const s of [-1, 1]) {
    bx(P.detail, 0.045, roofY - 1.0, 0.045, s * 0.6, (roofY + 1.0) / 2, -0.28, black, 0, 0.12);
    bx(P.detail, 0.045, roofY - 1.0, 0.045, s * 0.62, (roofY + 1.0) / 2, 1.34, black);
    bx(P.detail, 0.045, roofY - 1.0, 0.045, s * 0.62, (roofY + 1.0) / 2, 0.55, black);
  }
  // windscreen: tall, slightly raked
  slantGlass(P.glass, [-0.52, 1.04], [-0.3, 1.74], (y) => 0.58 - (y - 1.04) * 0.03, 0.02, 1, 0.01);
  // black canopy roof, arched rear drop
  bx(P.detail, 1.42, 0.06, 2.0, 0, roofY, 0.52, black, 0, -0.03);
  bx(P.detail, 1.4, 0.5, 0.06, 0, roofY - 0.25, 1.52, black, 0, -0.12);
  // bright visor over the windscreen
  bx(P.paint, 1.3, 0.05, 0.36, 0, roofY + 0.0, -0.46, WHITE, 0, 0.3);
  // green side band + bumper
  for (const s of [-1, 1]) bx(P.detail, 0.015, 0.07, 1.55, s * 0.655, 0.78, 0.72, green);
  // handlebar, headlamp, front fender and wheel
  bx(P.detail, 0.72, 0.035, 0.035, 0, 1.12, -0.5, BLACK);
  limb(P.detail, new THREE.Vector3(0, 1.1, -0.5), new THREE.Vector3(0, 0.3, -1.06), 0.022, 0.022, STEEL, 6);
  sphere(P.lamp, 0.09, 0, 0.72, -1.4, WHITE, 1, 1, 0.55);
  bx(P.detail, 0.24, 0.035, 0.52, 0, 0.56, -1.06, black, 0, 0.0);
  wheel(P.detail, 0, 0.26, -1.06, 0.26, 0.11, seg);
  // rear wheels
  for (const s of [-1, 1]) {
    wheel(P.detail, s * 0.62, 0.26, 0.95, 0.26, 0.12, seg);
    bx(P.paint, 0.04, 0.03, 0.58, s * 0.66, 0.54, 0.95);
    bx(P.brake, 0.1, 0.08, 0.04, s * 0.5, 0.76, 1.54);
  }
  bx(P.detail, 0.9, 0.28, 0.06, 0, 0.58, 1.54, BLACK);
  void green;
  return finish('auto', P, { length: 2.9, width: 1.4, height: 1.8 }, [0xf2c230, 0x2c8a4b, 0xf2c230, 0xe8b323, 0x35a15a], q);
}

function buildBus(q: Quality): TrafficTemplate {
  const P = newParts();
  const seg = q === 'low' ? 10 : 16;
  const L = 10.4, W = 2.5, H = 3.05;
  const white = hex(0xf2f1ec);
  const dark = hex(0x15181b);
  // body shell: lower (paint colour) and roof band (white)
  rbox(P.paint, W, 1.75, L, 0.18, 0, 0.35 + 0.875, 0);
  rbox(P.detail, W - 0.02, 0.95, L - 0.02, 0.18, 0, 2.1 + 0.475, 0, WHITE);
  // recolour roof band white
  const roofCap = new THREE.BoxGeometry(W - 0.5, 0.06, L - 1.0);
  P.detail.appendGeometry(roofCap, boxMatrix(0, H + 0.03, 0), hex(0xdedbd2));
  roofCap.dispose();
  // window band (dark glass with white pillars)
  const winY0 = 1.45, winY1 = 2.5;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.006);
    const n = 7;
    const start = -L / 2 + 1.6, end = L / 2 - 0.8;
    const wlen = (end - start) / n;
    for (let i = 0; i < n; i++) {
      const z0 = start + i * wlen + 0.06, z1 = start + (i + 1) * wlen - 0.06;
      P.glass.quad([x, winY0, z0, x, winY0, z1, x, winY1, z1, x, winY1, z0], [0, 0, 1, 0, 1, 1, 0, 1], [s, 0, 0]);
    }
    // door (front-left for LHT traffic: boarding side is the left = -x)
    P.glass.quad([x, 0.55, -L / 2 + 0.35, x, 0.55, -L / 2 + 1.25, x, 2.5, -L / 2 + 1.25, x, 2.5, -L / 2 + 0.35], [0, 0, 1, 0, 1, 1, 0, 1], [s, 0, 0]);
    bx(P.detail, 0.02, 0.1, L - 0.4, x, 1.25, 0, white); // white belt stripe
  }
  // windscreen & rear glass
  P.glass.quad([-W / 2 + 0.2, 1.1, -L / 2 - 0.006, W / 2 - 0.2, 1.1, -L / 2 - 0.006, W / 2 - 0.2, 2.55, -L / 2 - 0.006, -W / 2 + 0.2, 2.55, -L / 2 - 0.006], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, -1]);
  P.glass.quad([-W / 2 + 0.3, 1.5, L / 2 + 0.006, W / 2 - 0.3, 1.5, L / 2 + 0.006, W / 2 - 0.3, 2.45, L / 2 + 0.006, -W / 2 + 0.3, 2.45, L / 2 + 0.006], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, 1]);
  // route board
  bx(P.lamp, 1.6, 0.26, 0.03, 0, 2.78, -L / 2 - 0.02, hex(0xffe9b0));
  // bumpers, lights
  bx(P.detail, W + 0.04, 0.22, 0.2, 0, 0.42, -L / 2 - 0.05, dark);
  bx(P.detail, W + 0.04, 0.22, 0.2, 0, 0.42, L / 2 + 0.05, dark);
  for (const s of [-1, 1]) {
    bx(P.lamp, 0.34, 0.16, 0.04, s * 0.88, 0.75, -L / 2 - 0.02);
    bx(P.brake, 0.24, 0.4, 0.04, s * 1.02, 0.95, L / 2 + 0.015);
    bx(P.detail, 0.12, 0.5, 0.1, s * 1.28, 2.1, -L / 2 + 0.55, dark); // mirror arms
    bx(P.detail, 0.14, 0.34, 0.06, s * 1.42, 2.0, -L / 2 + 0.55, dark);
  }
  // roof pods
  bx(P.detail, 1.0, 0.18, 1.5, 0, H + 0.1, 1.6, hex(0xc9c6bc));
  bx(P.detail, 1.0, 0.18, 1.5, 0, H + 0.1, -0.5, hex(0xc9c6bc));
  // wheels with arch shadows
  for (const z of [-L / 2 + 1.9, L / 2 - 2.0]) for (const s of [-1, 1]) {
    cylX(P.detail, 0.6, 0.03, s * (W / 2 + 0.002), 0.52, z, dark, 18);
    wheel(P.detail, s * 1.2, 0.5, z, 0.5, 0.3, seg);
  }
  return finish('bus', P, { length: L + 0.2, width: W + 0.1, height: H + 0.2 }, [0xc3281f, 0x1e63a8, 0xc3281f, 0x2a8b4e], q);
}

function buildBike(q: Quality): TrafficTemplate {
  const P = newParts();
  const seg = q === 'low' ? 10 : 14;
  const wr = 0.31;
  const zF = -0.64, zR = 0.62;
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  // wheels (thin)
  for (const z of [zF, zR]) {
    cylX(P.detail, wr, 0.1, 0, wr, z, RUBBER, seg);
    cylX(P.detail, wr * 0.62, 0.11, 0, wr, z, CHROME, 10);
  }
  // fork + handlebar + headlamp
  limb(P.detail, V(0.08, wr, zF), V(0.07, 0.95, zF + 0.2), 0.022, 0.022, CHROME, 6);
  limb(P.detail, V(-0.08, wr, zF), V(-0.07, 0.95, zF + 0.2), 0.022, 0.022, CHROME, 6);
  bx(P.detail, 0.72, 0.03, 0.03, 0, 1.0, zF + 0.22, BLACK);
  sphere(P.lamp, 0.1, 0, 0.9, zF - 0.05, WHITE, 1, 1, 0.8);
  // frame / engine / exhaust
  bx(P.detail, 0.22, 0.34, 0.5, 0, 0.42, 0.0, STEEL);
  limb(P.detail, V(0.13, 0.28, 0.1), V(0.12, 0.34, 0.95), 0.045, 0.06, CHROME, 8);
  limb(P.detail, V(0, 0.7, -0.35), V(0, 0.4, zR - 0.05), 0.03, 0.03, BLACK, 6);
  // tank (paint colour), seat, tail
  sphere(P.paint, 0.2, 0, 0.78, -0.22, WHITE, 0.95, 0.85, 1.7, 12);
  bx(P.detail, 0.26, 0.09, 0.62, 0, 0.78, 0.38, hex(0x1b1c1e));
  bx(P.paint, 0.2, 0.05, 0.38, 0, 0.82, 0.78, WHITE, 0, -0.1);
  bx(P.brake, 0.14, 0.06, 0.03, 0, 0.78, 0.99);
  // rear mudguard
  bx(P.detail, 0.16, 0.03, 0.5, 0, 0.64, zR + 0.1, BLACK, 0, 0.15);
  // rider
  const jacket = hex(0x2f4a7a), jeans = hex(0x2c3340), skin = hex(0xa8754f), helmet = hex(0xd9d9d6);
  limb(P.detail, V(0, 0.9, 0.34), V(0, 1.38, 0.0), 0.15, 0.17, jacket, 10); // torso
  sphere(P.detail, 0.12, 0, 1.58, -0.06, helmet, 1.05, 1.1, 1.15, 12);
  bx(P.detail, 0.2, 0.06, 0.04, 0, 1.56, -0.18, BLACK);
  for (const s of [-1, 1]) {
    limb(P.detail, V(s * 0.19, 1.33, 0.02), V(s * 0.3, 1.18, -0.3), 0.045, 0.04, jacket, 6); // upper arm
    limb(P.detail, V(s * 0.3, 1.18, -0.3), V(s * 0.34, 1.0, zF + 0.22), 0.04, 0.035, jacket, 6); // forearm
    limb(P.detail, V(s * 0.15, 0.88, 0.34), V(s * 0.27, 0.68, -0.15), 0.08, 0.065, jeans, 7); // thigh
    limb(P.detail, V(s * 0.27, 0.68, -0.15), V(s * 0.22, 0.28, 0.0), 0.062, 0.05, jeans, 7); // shin
    bx(P.detail, 0.1, 0.07, 0.24, s * 0.22, 0.24, -0.06, BLACK);
  }
  return finish('bike', P, { length: 1.98, width: 0.76, height: 1.7 }, [0xb81f27, 0x1e3f7a, 0x22252a, 0x2d7a46, 0xd8d8d4], q);
}

function buildTruck(q: Quality): TrafficTemplate {
  const P = newParts();
  const seg = q === 'low' ? 10 : 16;
  const L = 6.3, W = 2.1, H = 2.85;
  const white = hex(0xe6e6e1), dark = hex(0x15181b), orange = hex(0xe07a1f);
  // cab (paint colour)
  const hw = (y: number): number => 0.98 - Math.max(0, y - 1.3) * 0.05;
  prism(P.paint, [[-3.15, 0.55], [-3.15, 1.55], [-2.75, 2.3], [-1.85, 2.4], [-1.85, 0.55]], hw, WHITE);
  rbox(P.paint, 1.96, 0.55, 1.3, 0.1, 0, 0.62, -2.55); // lower grille block
  // glass
  slantGlass(P.glass, [-3.13, 1.6], [-2.75, 2.25], hw, 0.1, 1);
  sideWindows(P.glass, [[-2.9, 1.6], [-2.7, 2.25], [-2.1, 2.25], [-2.1, 1.6]], hw);
  // grille + bumper + lights
  bx(P.detail, 1.4, 0.4, 0.05, 0, 1.0, -3.18, dark);
  bx(P.detail, W, 0.26, 0.28, 0, 0.45, -3.22, hex(0x8a8f95));
  for (const s of [-1, 1]) {
    bx(P.lamp, 0.34, 0.18, 0.05, s * 0.72, 0.98, -3.2);
    bx(P.detail, 0.14, 0.4, 0.12, s * 1.12, 1.9, -2.8, dark); // mirrors
  }
  // chassis rails
  bx(P.detail, 1.0, 0.2, L - 0.2, 0, 0.55, 0.1, dark);
  // cargo box (white, with orange stripe) behind cab
  rbox(P.detail, W, 2.0, 4.2, 0.06, 0, 0.7 + 1.0, 0.95, white);
  for (const s of [-1, 1]) bx(P.detail, 0.02, 0.22, 4.1, s * (W / 2 + 0.01), 1.2, 0.95, orange);
  bx(P.detail, W + 0.02, 0.07, 4.25, 0, 2.72, 0.95, hex(0xcfcfc8));
  bx(P.detail, 1.8, 0.8, 0.05, 0, 1.75, 3.06, hex(0xd9d9d3));
  // rear lights & bumper
  for (const s of [-1, 1]) bx(P.brake, 0.18, 0.34, 0.05, s * 0.9, 0.95, 3.07);
  bx(P.detail, W, 0.22, 0.2, 0, 0.5, 3.12, dark);
  // wheels: front single, rear dual
  for (const s of [-1, 1]) {
    cylX(P.detail, 0.56, 0.03, s * 0.99, 0.5, -2.35, dark, 16);
    wheel(P.detail, s * 1.02, 0.46, -2.35, 0.46, 0.26, seg);
    wheel(P.detail, s * 0.9, 0.46, 1.9, 0.46, 0.22, seg);
    wheel(P.detail, s * 1.14, 0.46, 1.9, 0.46, 0.22, seg);
  }
  void L; void H;
  return finish('truck', P, { length: 6.4, width: 2.2, height: 2.85 }, [0x2563a8, 0xc3281f, 0x2f7a4a, 0xe0a21f, 0x6b7077], q);
}

export function createTrafficTemplates(quality: Quality): Record<TrafficKind, TrafficTemplate> {
  return {
    car: buildCar(quality),
    auto: buildAuto(quality),
    bus: buildBus(quality),
    bike: buildBike(quality),
    truck: buildTruck(quality),
  };
}

/* ======================================================== pedestrian */

export function createPedestrianTemplate(quality: Quality): THREE.Object3D {
  const seg = quality === 'low' ? 6 : 9;
  const root = new THREE.Group();
  root.name = 'pedestrian';
  const skin = hex(0xb07c55), hair = hex(0x1a1410);
  const tintable = (name: string, color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ name, color, vertexColors: true, roughness: 0.85, metalness: 0 });
  const topMat = tintable('ped-top', 0x3a6ea5);
  const legMat = tintable('ped-legs', 0x30343c);
  const headMat = new THREE.MeshStandardMaterial({ name: 'ped-skin', vertexColors: true, roughness: 0.8 });

  // torso + arms + shoulders (white => tinted by material colour)
  const top = new GeoBuilder(true);
  rbox(top, 0.4, 0.56, 0.22, 0.07, 0, 1.2, 0, WHITE);
  for (const s of [-1, 1]) {
    limb(top, new THREE.Vector3(s * 0.23, 1.4, 0), new THREE.Vector3(s * 0.27, 0.95, 0.03), 0.06, 0.05, WHITE, seg);
  }
  const topMesh = new THREE.Mesh(top.build(), topMat);
  topMesh.name = 'top';

  const head = new GeoBuilder(true);
  sphere(head, 0.105, 0, 1.64, 0, skin, 0.95, 1.1, 1, seg + 2);
  sphere(head, 0.108, 0, 1.675, -0.012, hair, 1, 0.85, 1.02, seg + 2);
  cylY(head, 0.045, 0.045, 0.1, 0, 1.46, 0, skin, 6);
  for (const s of [-1, 1]) sphere(head, 0.045, s * 0.28, 0.9, 0.03, skin, 1, 1.2, 1, 6);
  const headMesh = new THREE.Mesh(head.build(), headMat);
  headMesh.name = 'head';

  const mkLegGeo = (): THREE.BufferGeometry => {
    const b = new GeoBuilder(true);
    // origin at hip so rotation.x swings the leg
    limb(b, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.84, 0), 0.085, 0.055, WHITE, seg);
    bx(b, 0.11, 0.07, 0.26, 0, -0.9, -0.05, hex(0x16171a));
    return b.build();
  };
  const meshes: THREE.Object3D[] = [topMesh, headMesh];
  if (quality === 'low') {
    // one static lower-body mesh (fixed dark trousers); legL/legR stay as empty nodes so callers can still address them
    const lower = new GeoBuilder(true);
    for (const s of [-1, 1]) {
      const g = mkLegGeo();
      lower.appendGeometry(g, new THREE.Matrix4().makeTranslation(s * 0.1, 0.92, 0), hex(0x343944));
      g.dispose();
    }
    const lowerMesh = new THREE.Mesh(lower.build(), new THREE.MeshStandardMaterial({ name: 'ped-lower', vertexColors: true, roughness: 0.85 }));
    lowerMesh.name = 'lower';
    meshes.push(lowerMesh);
    for (const [s, name] of [[-1, 'legL'], [1, 'legR']] as const) {
      const n = new THREE.Object3D();
      n.name = name;
      n.position.set(s * 0.1, 0.92, 0);
      root.add(n);
    }
  } else {
    for (const [s, name] of [[-1, 'legL'], [1, 'legR']] as const) {
      const m = new THREE.Mesh(mkLegGeo(), legMat);
      m.position.set(s * 0.1, 0.92, 0);
      m.name = name;
      meshes.push(m);
    }
  }
  for (const m of meshes) {
    (m as THREE.Mesh).castShadow = true;
    (m as THREE.Mesh).receiveShadow = true;
    root.add(m);
  }
  root.userData.dimensions = { length: 0.35, width: 0.6, height: 1.72 };
  root.userData.variants = [
    { top: 0x3a6ea5, bottom: 0x30343c },
    { top: 0xc4453b, bottom: 0x2a2f45 },
    { top: 0xe2c14b, bottom: 0x4a3f33 },
    { top: 0x4d8c5f, bottom: 0x1f2226 },
    { top: 0xf0eee6, bottom: 0x6b5a3d },
    { top: 0x8e5aa3, bottom: 0x303a52 },
  ];
  return root;
}

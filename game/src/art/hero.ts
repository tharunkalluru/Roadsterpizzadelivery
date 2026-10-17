/**
 * Hero car: an original, low and wide two-seat sports roadster (~4.0 x 2.0 x 1.15 m).
 * The body is a lofted, sculpted surface (nose taper, fender crowns, cut wheel arches),
 * with a tinted glass canopy, spoked wheels, LED light bars, underbody thruster nozzles
 * with restrained vapour, and a small "Metro Express" delivery pod decal (original branding).
 */
import * as THREE from 'three';
import type { HeroCar, Quality } from './api';
import { GeoBuilder, addBox, boxMatrix, clamp, hex, loft, smoothstep } from './geo';
import { getSoftSprite, latinLabelTexture } from './textures';

/* ---- 1D cubic Hermite through keys ---- */
export function curve(keys: [number, number][], x: number): number {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const m0 = i > 0 ? (y1 - keys[i - 1][1]) / (x1 - keys[i - 1][0]) : (y1 - y0) / h;
  const m1 = i < n - 2 ? (keys[i + 2][1] - y0) / (keys[i + 2][0] - x0) : (y1 - y0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

function ell(d: number, len: number): number {
  const t = clamp(d / len, 0, 1);
  return Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
}

const WHEEL_R = 0.35;
const AXLE_Z = 1.3;
const TRACK_X = 0.84;

export function createHeroCar(quality: Quality): HeroCar {
  const low = quality === 'low';
  const high = quality === 'high';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => { owned.push(o); return o; };

  // ------------------------------------------------------------- materials
  const paint: THREE.MeshStandardMaterial = low
    ? own(new THREE.MeshStandardMaterial({ name: 'hero-paint', color: 0x1f58b8, metalness: 0.6, roughness: 0.34, vertexColors: true }))
    : own(new THREE.MeshPhysicalMaterial({
        name: 'hero-paint', color: 0x1f58b8, metalness: 0.78, roughness: 0.3, vertexColors: true,
        clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25,
      }));
  const trim = own(new THREE.MeshStandardMaterial({ name: 'hero-trim', color: 0x15171a, roughness: 0.55, metalness: 0.35, vertexColors: true }));
  const glass = own(new THREE.MeshPhysicalMaterial({
    name: 'hero-glass', color: 0x0d1b26, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.5,
    clearcoat: low ? 0 : 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, depthWrite: false,
  }));
  const tyreMat = own(new THREE.MeshStandardMaterial({ name: 'hero-tyre', color: 0x111214, roughness: 0.88, metalness: 0 }));
  const rimMat = own(new THREE.MeshStandardMaterial({ name: 'hero-rim', color: 0xffffff, vertexColors: true, roughness: 0.28, metalness: 0.92, envMapIntensity: 1.3 }));
  const headMat = own(new THREE.MeshStandardMaterial({ name: 'hero-head', color: 0xeaf4ff, emissive: 0xdfeeff, emissiveIntensity: 2.4, roughness: 0.3 }));
  const tailMat = own(new THREE.MeshStandardMaterial({ name: 'hero-tail', color: 0x3a0505, emissive: 0xff1c14, emissiveIntensity: 0.9, roughness: 0.4 }));
  const reverseMat = own(new THREE.MeshStandardMaterial({ name: 'hero-reverse', color: 0xd8d8d8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 }));
  const nozzleGlow = own(new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));

  const root = new THREE.Group();
  root.name = 'hero-car';
  const body = new THREE.Group();
  body.name = 'hero-body';
  root.add(body);

  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string, parent: THREE.Object3D = body, cast = true): THREE.Mesh => {
    own(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ------------------------------------------------------------ body loft
  const ringN = low ? 14 : high ? 30 : 22;
  const stN = low ? 44 : high ? 100 : 72;
  const topKeys: [number, number][] = [[-2.0, 0.27], [-1.85, 0.33], [-1.5, 0.45], [-1.0, 0.56], [-0.5, 0.68], [0.0, 0.72], [0.7, 0.74], [1.4, 0.75], [1.8, 0.72], [2.0, 0.6]];
  const archR = 0.43;
  const stations = [];
  for (let i = 0; i <= stN; i++) {
    const u = i / stN;
    const z = -2 + 4 * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const noseD = z + 2;
    const tailD = 2 - z;
    const noseT = clamp(noseD / 0.78, 0, 1);
    const hw = 0.97 * Math.min(Math.pow(noseT, 0.52), ell(tailD, 0.55)) * (1 + 0.03 * Math.exp(-Math.pow((z - 1.1) / 0.5, 2)));
    const bump = (c: number, w: number): number => Math.max(0, 1 - Math.pow((z - c) / w, 2));
    const crown = 0.27 * bump(-1.3, 0.78) + 0.23 * bump(1.3, 0.85);
    const yTop = curve(topKeys, z);
    const yBot = 0.19 + 0.02 * ell(noseD, 0.5) * 0; // base ride line
    const dzF = Math.abs(z + AXLE_Z), dzR = Math.abs(z - AXLE_Z);
    const archTop = (dz: number): number => (dz < archR ? WHEEL_R + 0.02 + Math.sqrt(archR * archR - dz * dz) : -1);
    const arch = Math.max(archTop(dzF), archTop(dzR));
    stations.push({
      z,
      halfW: Math.max(0.0001, hw),
      yBot,
      yTop,
      n: 3.1,
      tumble: 0.16,
      crown,
      lower: arch > 0 ? (ex: number, y: number): number => {
        const w = smoothstep(0.4, 0.82, Math.abs(ex));
        return y + (Math.max(y, arch) - y) * w;
      } : undefined,
    });
  }
  const bodyGeo = loft(stations, ringN, [1, 1, 1]);
  {
    // darken the underside, wheel-arch interiors and the sill; leave the rest as paint
    const p = bodyGeo.getAttribute('position');
    const n = bodyGeo.getAttribute('normal');
    const c = bodyGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i), ny = n.getY(i);
      let d = smoothstep(-0.15, -0.6, ny);
      const dz = Math.min(Math.abs(Math.abs(z) - AXLE_Z), 9);
      const inArch = Math.abs(p.getX(i)) > 0.45 && Math.abs(Math.abs(z) - AXLE_Z) < archR + 0.03 && y < WHEEL_R + 0.02 + archR + 0.02 && Math.abs(n.getX(i)) < 0.9;
      if (inArch) d = Math.max(d, 0.95);
      d = Math.max(d, smoothstep(0.3, 0.2, y) * 0.9);
      void dz;
      const f = 1 - d * 0.93;
      c.setXYZ(i, f, f, f);
    }
  }
  const bodyMesh = addMesh(bodyGeo, paint, 'body');

  // -------------------------------------------------------- glass canopy
  const roofKeys: [number, number][] = [[-0.7, 0.68], [-0.4, 0.88], [-0.05, 1.02], [0.45, 1.14], [0.95, 1.1], [1.3, 0.94], [1.6, 0.78]];
  const cabin = [];
  const cN = low ? 20 : 34;
  for (let i = 0; i <= cN; i++) {
    const u = i / cN;
    const z = -0.7 + 2.3 * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const hw = 0.7 * Math.min(ell(z + 0.7, 0.75), ell(1.6 - z, 0.62));
    cabin.push({ z, halfW: Math.max(0.0001, hw), yBot: 0.55, yTop: curve(roofKeys, z), n: 2.3, tumble: 0.22 });
  }
  const canopyGeo = loft(cabin, low ? 14 : 24);
  addMesh(canopyGeo, glass, 'canopy', body, false);
  // thin dark roof spine + windshield frame for definition
  const trimB = new GeoBuilder(true);
  {
    const tb = trimB;
    const dk = hex(0x101215);
    // windshield header / cowl strip
    addBox(tb, 1.0, 0.03, 0.1, boxMatrix(0, 0.74, -0.62, 0, -0.5), 1, dk);
    // mirrors
    for (const s of [-1, 1]) {
      addBox(tb, 0.11, 0.06, 0.09, boxMatrix(s * 0.86, 0.79, -0.6, s * 0.3), 1, dk);
    }
    // side intakes
    for (const s of [-1, 1]) addBox(tb, 0.04, 0.09, 0.5, boxMatrix(s * 0.955, 0.36, -0.7, 0), 1, dk);
  }

  // ----------------------------------------------------------- interior
  {
    const ib = trimB;
    const seatC = hex(0x1b1d21), tan = hex(0xb8855a), dash = hex(0x141518);
    for (const s of [-1, 1]) {
      addBox(ib, 0.46, 0.1, 0.5, boxMatrix(s * 0.33, 0.74, 0.5), 1, seatC);
      addBox(ib, 0.46, 0.36, 0.1, boxMatrix(s * 0.33, 0.9, 0.8, 0, -0.3), 1, seatC);
      addBox(ib, 0.34, 0.1, 0.02, boxMatrix(s * 0.33, 0.92, 0.745, 0, -0.3), 1, tan);
    }
    addBox(ib, 1.2, 0.14, 0.3, boxMatrix(0, 0.76, -0.4, 0, 0.2), 1, dash);
    const wheelGeo = new THREE.TorusGeometry(0.13, 0.018, 6, 16);
    ib.appendGeometry(wheelGeo, new THREE.Matrix4().compose(new THREE.Vector3(0.33, 0.88, -0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)), new THREE.Vector3(1, 1, 1)), hex(0x0a0a0a));
    wheelGeo.dispose();
  }

  // ----------------------------------------------- lights (LED bars) & decals
  // nose ellipse: halfW(z)=0.97*ell(z+2,0.7) => z(x) solves ell(d,0.7)=x/0.97 -> d = 0.7*(1 - sqrt(1-r^2)) with r=x/0.97 ... invert
  const noseAt = (x: number): number => {
    const r = clamp(x / 0.97, 0, 0.999);
    return -2 + 0.78 * Math.pow(r, 1 / 0.52);
  };
  const tailAt = (x: number): number => {
    const r = clamp(x / 0.97, 0, 0.999);
    return 2 - 0.55 * (1 - Math.sqrt(1 - r * r));
  };
  {
    const hb = new GeoBuilder(false);
    const x0s = [0.16, 0.42, 0.68, 0.9];
    // head light bar segments hugging the nose, y=0.43
    for (const s of [-1, 1]) {
      for (let i = 0; i < x0s.length - 1; i++) {
        const xa = x0s[i], xb = x0s[i + 1];
        const za = noseAt(xa) - 0.012, zb = noseAt(xb) - 0.012;
        const y0 = 0.425 - 0.012 * i, h = 0.05 - 0.01 * i;
        hb.quad([s * xa, y0, za, s * xb, y0, zb, s * xb, y0 + h, zb, s * xa, y0 + h, za], [0, 0, 1, 0, 1, 1, 0, 1], [s * (xb - xa) * 0 - s * 0.2, 0, -1]);
      }
    }
    // DRL under-line
    for (const s of [-1, 1]) {
      const xa = 0.3, xb = 0.82;
      hb.quad([s * xa, 0.375, noseAt(xa) - 0.01, s * xb, 0.362, noseAt(xb) - 0.01, s * xb, 0.37, noseAt(xb) - 0.01, s * xa, 0.383, noseAt(xa) - 0.01], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, -1]);
    }
    addMesh(hb.build(), headMat, 'headlights', body, false);

    const tb = new GeoBuilder(false);
    // continuous tail LED bar across the rear
    const xs = [-0.86, -0.6, -0.3, 0, 0.3, 0.6, 0.86];
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      const za = tailAt(Math.abs(xa)) + 0.012, zb = tailAt(Math.abs(xb)) + 0.012;
      tb.quad([xa, 0.62, za, xb, 0.62, zb, xb, 0.67, zb, xa, 0.67, za], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, 1]);
    }
    const brake = addMesh(tb.build(), tailMat, 'brake', body, false);
    brake.name = 'brake';
    const rb = new GeoBuilder(false);
    for (const s of [-1, 1]) {
      const xa = 0.62, xb = 0.84;
      rb.quad([s * xa, 0.4, tailAt(xa) + 0.03, s * xb, 0.4, tailAt(xb) + 0.03, s * xb, 0.45, tailAt(xb) + 0.03, s * xa, 0.45, tailAt(xa) + 0.03], [0, 0, 1, 0, 1, 1, 0, 1], [0, 0, 1]);
    }
    addMesh(rb.build(), reverseMat, 'reverse', body, false);
  }

  // delivery pod on the rear deck + branding decals (original "Metro Express")
  {
    const podY = curve(topKeys, 1.62) + 0.015;
    addBox(trimB, 0.96, 0.05, 0.56, boxMatrix(0, podY + 0.02, 1.62, 0, -0.05), 1, hex(0x22262c));
    // all decals share one single-line texture and one merged mesh
    const decalTex = own(latinLabelTexture(['METRO EXPRESS'], '#ffffff', null, 512, 64, '800 42px "Helvetica Neue", Arial, sans-serif'));
    const decalMat = own(new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    const db = new GeoBuilder(false);
    const podTop = podY + 0.048;
    // pod lid decal (reads from behind and above)
    db.quad([-0.4, podTop, 1.62 - 0.05, 0.4, podTop, 1.62 - 0.05, 0.4, podTop - 0.0, 1.62 + 0.05, -0.4, podTop, 1.62 + 0.05].map((v, i) => (i % 3 === 1 ? v + (i < 6 ? 0.004 : 0.0) : v)), [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 0]);
    for (const s of [-1, 1]) {
      const x = s * 0.972;
      db.quad([x, 0.36, 0.2 + s * 0.39, x, 0.36, 0.2 - s * 0.39, x, 0.46, 0.2 - s * 0.39, x, 0.46, 0.2 + s * 0.39], [0, 0, 1, 0, 1, 1, 0, 1], [s, 0, 0]);
    }
    addMesh(db.build(), decalMat, 'decals', body, false);
  }

  // --------------------------------------------------------------- wheels
  const wheelPivots: THREE.Object3D[] = [];
  const spinGroups: THREE.Object3D[] = [];
  {
    const segs = low ? 18 : high ? 40 : 28;
    const tyreProfile = (w: number): THREE.Vector2[] => {
      const hw2 = w / 2;
      const pts = [
        [0.228, -hw2 * 0.74], [0.26, -hw2 * 0.97], [0.31, -hw2], [0.342, -hw2 * 0.84], [0.352, -hw2 * 0.45], [0.354, 0], [0.352, hw2 * 0.45], [0.342, hw2 * 0.84], [0.31, hw2], [0.26, hw2 * 0.97], [0.228, hw2 * 0.74],
      ];
      return pts.map(([r, y]) => new THREE.Vector2(r, y));
    };
    const makeTyre = (w: number): THREE.BufferGeometry => {
      const g = new THREE.LatheGeometry(tyreProfile(w), segs);
      g.rotateZ(-Math.PI / 2);
      return own(g);
    };
    const makeRim = (w: number): THREE.BufferGeometry => {
      const b = new GeoBuilder(true);
      const hw2 = w / 2;
      const silver = hex(0xc9ced3), graphite = hex(0x2b2f35), steel = hex(0x555b62), cap = hex(0x9aa1a8);
      // lathe pieces around Y then rotated to X
      const barrel = new THREE.LatheGeometry([new THREE.Vector2(0.2, -hw2 * 0.85), new THREE.Vector2(0.232, -hw2 * 0.7), new THREE.Vector2(0.236, hw2 * 0.75), new THREE.Vector2(0.246, hw2 * 0.9), new THREE.Vector2(0.236, hw2 * 0.98)], segs);
      b.appendGeometry(barrel, new THREE.Matrix4().makeRotationZ(-Math.PI / 2), silver);
      barrel.dispose();
      // dish face
      const face = new THREE.CircleGeometry(0.23, segs);
      face.rotateY(Math.PI / 2);
      b.appendGeometry(face, new THREE.Matrix4().makeTranslation(hw2 * 0.7, 0, 0), graphite);
      face.dispose();
      // brake disc behind
      const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.022, segs);
      disc.rotateZ(Math.PI / 2);
      b.appendGeometry(disc, new THREE.Matrix4().makeTranslation(hw2 * 0.12, 0, 0), steel);
      disc.dispose();
      // spokes: 5 twin spokes
      const n = low ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (i % 2 ? 0.05 : -0.05) * 0;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
        m.compose(new THREE.Vector3(hw2 * 0.78, 0, 0).applyQuaternion(q), q, new THREE.Vector3(1, 1, 1));
        const sp = new THREE.BoxGeometry(0.035, 0.22, 0.034);
        sp.translate(0, 0.125, 0);
        b.appendGeometry(sp, m, silver);
        sp.dispose();
      }
      // hub cap
      const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.035, 14);
      hub.rotateZ(Math.PI / 2);
      b.appendGeometry(hub, new THREE.Matrix4().makeTranslation(hw2 * 0.88, 0, 0), cap);
      hub.dispose();
      return own(b.build());
    };
    const frontTyre = makeTyre(0.27), rearTyre = makeTyre(0.31);
    const frontRim = makeRim(0.27), rearRim = makeRim(0.31);
    const defs = [
      { x: -TRACK_X, z: -AXLE_Z, front: true, left: true },
      { x: TRACK_X, z: -AXLE_Z, front: true, left: false },
      { x: -TRACK_X, z: AXLE_Z, front: false, left: true },
      { x: TRACK_X, z: AXLE_Z, front: false, left: false },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.name = `wheel-${d.front ? 'F' : 'R'}${d.left ? 'L' : 'R'}`;
      pivot.rotation.order = 'YXZ';
      pivot.position.set(d.x, WHEEL_R, d.z);
      const spin = new THREE.Group();
      spin.name = 'spin';
      const faceFlip = new THREE.Group();
      if (d.left) faceFlip.rotation.y = Math.PI;
      const tyre = new THREE.Mesh(d.front ? frontTyre : rearTyre, tyreMat);
      const rim = new THREE.Mesh(d.front ? frontRim : rearRim, rimMat);
      tyre.castShadow = rim.castShadow = true;
      tyre.receiveShadow = rim.receiveShadow = true;
      tyre.name = 'tyre'; rim.name = 'rim';
      faceFlip.add(tyre, rim);
      spin.add(faceFlip);
      pivot.add(spin);
      root.add(pivot);
      wheelPivots.push(pivot);
      spinGroups.push(spin);
    }
  }

  // ------------------------------------------------------------ thrusters
  const nozzlePos: THREE.Vector3[] = [];
  const nozzleRings: THREE.Mesh[] = [];
  const puffs: { sprite: THREE.Sprite; nozzle: number; phase: number; mat: THREE.SpriteMaterial }[] = [];
  const glowTex = getSoftSprite('glow');
  const nozzleGlows: THREE.Sprite[] = [];
  const vapourTex = getSoftSprite('vapour');
  {
    const nb = trimB;
    const nozzleGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.07, low ? 8 : 14, 1, true);
    const ringGeo = own(new THREE.RingGeometry(0.045, 0.085, low ? 8 : 14).rotateX(Math.PI / 2));
    const pts: [number, number][] = [[-0.5, -0.78], [0.5, -0.78], [-0.5, 0.78], [0.5, 0.78]];
    for (const [x, z] of pts) {
      nb.appendGeometry(nozzleGeo, new THREE.Matrix4().makeTranslation(x, 0.19, z), hex(0x1b1e22));
      const v = new THREE.Vector3(x, 0.152, z);
      nozzlePos.push(v);
      const ring = new THREE.Mesh(ringGeo, nozzleGlow);
      ring.position.copy(v);
      ring.visible = false;
      body.add(ring);
      nozzleRings.push(ring);
      const gm = own(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
      const gs = new THREE.Sprite(gm);
      gs.position.set(x, 0.1, z);
      gs.visible = false;
      gs.name = 'nozzle-glow';
      body.add(gs);
      nozzleGlows.push(gs);
    }
    nozzleGeo.dispose();
    const per = low ? 2 : 4;
    nozzlePos.forEach((_, ni) => {
      for (let j = 0; j < per; j++) {
        const mat = own(new THREE.SpriteMaterial({ map: vapourTex, transparent: true, opacity: 0, depthWrite: false, color: 0xeaf4ff, fog: true }));
        const sp = new THREE.Sprite(mat);
        sp.visible = false;
        sp.name = 'vapour';
        body.add(sp);
        puffs.push({ sprite: sp, nozzle: ni, phase: j / per, mat });
      }
    });
  }

  addMesh(trimB.build(), trim, 'trim');

  // -------------------------------------------------------------- state
  let thrTarget = 0, thr = 0, time = 0, spinAngle = 0;
  const reverseOn = { v: false };
  const brakeOn = { v: false };
  const tmpCol = new THREE.Color();

  const applyThruster = (): void => {
    const on = thr > 0.01;
    for (const g of nozzleGlows) {
      g.visible = on;
      g.material.opacity = thr * 0.9;
      g.scale.set(0.35 + thr * 0.35, 0.35 + thr * 0.35, 1);
    }
    nozzleGlow.opacity = thr * 0.95;
    for (const r of nozzleRings) r.visible = on;
    for (const p of puffs) p.sprite.visible = on;
  };

  const car: HeroCar = {
    root,
    wheels: wheelPivots,
    setThruster(intensity: number): void {
      thrTarget = clamp(intensity, 0, 1);
    },
    setBrakeLights(on: boolean): void {
      brakeOn.v = on;
      tailMat.emissiveIntensity = on ? 4.2 : 0.9;
      tmpCol.setHex(on ? 0xff2a1a : 0xff1c14);
      tailMat.emissive.copy(tmpCol);
    },
    setReverseLights(on: boolean): void {
      reverseOn.v = on;
      reverseMat.emissiveIntensity = on ? 2.8 : 0;
    },
    animate(dt: number, speedMps: number, steerRad: number): void {
      time += dt;
      spinAngle -= (speedMps * dt) / WHEEL_R;
      if (spinAngle < -1e4) spinAngle %= Math.PI * 2;
      for (let i = 0; i < 4; i++) spinGroups[i].rotation.x = spinAngle;
      wheelPivots[0].rotation.y = steerRad;
      wheelPivots[1].rotation.y = steerRad;
      // thruster easing
      const k = 1 - Math.exp(-dt * 7);
      thr += (thrTarget - thr) * k;
      if (thr < 0.004 && thrTarget === 0) thr = 0;
      applyThruster();
      if (thr > 0.01) {
        for (let i = 0; i < puffs.length; i++) {
          const p = puffs[i];
          const ph = (time * 1.1 + p.phase + p.nozzle * 0.17) % 1;
          const n = nozzlePos[p.nozzle];
          const side = n.x < 0 ? -1 : 1;
          p.sprite.position.set(n.x + side * ph * 0.22, n.y - 0.08 - ph * 1.5, n.z);
          const s = 0.26 + ph * 1.1;
          p.sprite.scale.set(s, s, 1);
          p.mat.opacity = thr * 0.75 * (1 - ph) * smoothstep(0, 0.1, ph);
        }
      }
    },
    dispose(): void {
      root.removeFromParent();
      for (const o of owned) o.dispose();
    },
  };
  root.userData.dimensions = { length: 4.0, width: 2.0, height: 1.15 };
  root.userData.bodyMesh = bodyMesh;
  return car;
}

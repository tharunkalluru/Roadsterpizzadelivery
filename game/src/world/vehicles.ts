import * as THREE from 'three';
import { Batch, TPL } from '../core/util';

const PI = Math.PI;
// Metro train and the hero roadster. Street traffic models live in traffic_models.ts.

export function metroTrain(cars = 3) {
  const b = new Batch(), l = new Batch();
  const CL = 21.5;
  for (let i = 0; i < cars; i++) {
    const z = i * (CL + 0.6);
    b.add(TPL.rbox, 0, 1.95, z, 2.9, 3.6, CL, '#f1eff5');
    b.box(0, 2.1, z, 2.94, 1.1, CL - 1.2, '#1f2638');
    b.box(0, 1.1, z, 2.95, 0.24, CL, '#3B7BF0');
    b.box(0, 3.65, z, 1.6, 0.25, CL * 0.7, '#cfcbd8');
    for (const s of [-1, 1]) for (let d = -1; d <= 1; d++) b.box(s * 1.48, 1.7, z + d * 6.5, 0.02, 2.4, 1.4, '#c9c5d2');
    l.box(0, 2.2, z, 2.96, 0.06, CL - 1.4, '#e8f4ff');
  }
  // cab noses
  b.add(TPL.rbox, 0, 1.95, -CL / 2 - 0.6, 2.9, 3.4, 1.6, '#f1eff5');
  b.box(0, 2.4, -CL / 2 - 1.42, 2.2, 1.2, 0.05, '#1f2638');
  const zEnd = (cars - 1) * (CL + 0.6) + CL / 2 + 0.6;
  b.add(TPL.rbox, 0, 1.95, zEnd, 2.9, 3.4, 1.6, '#f1eff5');
  for (const s of [-1, 1]) {
    l.box(s * 0.9, 1.2, -CL / 2 - 1.42, 0.4, 0.18, 0.03, '#fff8e1');
    l.box(s * 0.9, 1.2, zEnd + 0.82, 0.4, 0.18, 0.03, '#ff2236');
  }
  return { body: b, lights: l, length: zEnd + 0.8 + CL / 2 + 1.4 };
}

// ---------- hero: an original two-seat electric roadster with cold-gas thrusters ----------
// Built from lofted cross-sections (superellipse sections along the car), in road-level coordinates (y = 0 is the
// tarmac), front towards -z. Open cockpit, raked windscreen, flared arches, short ducktail. Not modelled on any
// real car.
export function roadster(mats: any, labels: { logo: THREE.Material; plate: THREE.Material }) {
  const outer = new THREE.Group(), g = new THREE.Group(); g.position.y = -0.55; outer.add(g);
  const L = 4.36, N = 40, M = 28;
  const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // profiles along t in [0, 1] from nose to tail
  const halfW = (t: number) => 0.62 + 0.36 * sm(0.0, 0.16, t) + 0.05 * Math.exp(-((t - 0.24) ** 2) / 0.004) + 0.07 * Math.exp(-((t - 0.78) ** 2) / 0.006) - 0.06 * Math.exp(-((t - 0.5) ** 2) / 0.02) - 0.12 * sm(0.9, 1.0, t);
  const top = (t: number) => 0.5 + 0.28 * sm(0.0, 0.3, t) + 0.1 * sm(0.62, 0.8, t) - 0.04 * sm(0.94, 1.0, t) + 0.05 * Math.exp(-((t - 0.97) ** 2) / 0.0015);
  const bot = (t: number) => 0.2 + 0.06 * (1 - sm(0.0, 0.08, t)) + 0.04 * sm(0.92, 1.0, t);
  const pos: number[] = [], idx: number[] = [];
  // a point on the body's cross-section at t (0 nose .. 1 tail) and angle a (0 = right side, PI/2 = top)
  const sec = (t: number, a: number): [number, number] => {
    const w = halfW(t), y0 = bot(t), y1 = top(t), cy = (y0 + y1) / 2, hh = (y1 - y0) / 2, c = Math.cos(a), sN = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.2) * w, y = Math.sign(sN) * Math.pow(Math.abs(sN), 2 / (sN > 0 ? 2.4 : 4)) * hh;
    return [x, cy + y * (sN > 0 ? 1 - 0.18 * Math.abs(c) : 1)];
  };
  // the body's half-width at a given z and height (for trim that has to sit on the skin)
  const skinX = (z: number, y: number) => {
    const t = Math.min(1, Math.max(0, (z + L / 2) / L)); let best = 0, bd = 1e9;
    for (let k = -40; k <= 40; k++) { const [x, yy] = sec(t, (k / 40) * (Math.PI / 2)); const d = Math.abs(yy - y); if (d < bd) { bd = d; best = x; } }
    return best;
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L;
    for (let j = 0; j < M; j++) { const [x, y] = sec(t, (j / M) * Math.PI * 2); pos.push(x, y, z); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M); idx.push(a, c, b, b, c, d); }
  // nose and tail caps
  const capF = pos.length / 3; pos.push(0, (bot(0) + top(0)) / 2, -L / 2 - 0.02); for (let j = 0; j < M; j++) idx.push(capF, j, (j + 1) % M);
  const capR = pos.length / 3; pos.push(0, (bot(1) + top(1)) / 2, L / 2 + 0.02); for (let j = 0; j < M; j++) idx.push(capR, N * M + ((j + 1) % M), N * M + j);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mats.paint); body.castShadow = true; body.receiveShadow = true; g.add(body);

  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, opts: any = {}) => {
    const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.scale) m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
    m.castShadow = opts.cast !== false; m.receiveShadow = true; (opts.to || g).add(m); return m;
  };
  // open cockpit: dark tub, two seats, driver, roll hoops, raked windscreen in a thin frame
  // the cockpit opening: a dark, flattened oval just breaking the body's top surface (the loft itself is closed)
  add(new THREE.SphereGeometry(1, 28, 10), mats.trim, 0, 0.745, 0.14, { scale: [0.66, 0.075, 0.66], cast: false });
  add(new THREE.TorusGeometry(1, 0.02, 6, 40), mats.trim, 0, 0.79, 0.14, { rot: [Math.PI / 2, 0, 0], scale: [0.67, 0.67, 1.6], cast: false });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.5, 0.18), mats.seat || mats.trim, s * 0.33, 0.95, 0.62, { rot: [-0.18, 0, 0] });
    add(new THREE.TorusGeometry(0.2, 0.04, 6, 14, Math.PI), mats.trim, s * 0.33, 1.08, 0.82, { cast: true });
  }
  add(new THREE.SphereGeometry(0.17, 18, 12), mats.helmet, -0.33, 1.2, 0.4);
  add(new THREE.BoxGeometry(0.3, 0.32, 0.22), mats.helmet, -0.33, 0.98, 0.45);
  add(new THREE.TorusGeometry(0.15, 0.025, 6, 16), mats.trim, -0.33, 0.95, -0.12, { rot: [0.9, 0, 0] });   // steering wheel
  add(new THREE.PlaneGeometry(1.3, 0.44), mats.canopy, 0, 0.93, -0.6, { rot: [0.95, 0, 0], cast: false });
  add(new THREE.BoxGeometry(1.34, 0.035, 0.035), mats.trim, 0, 1.06, -0.42, { rot: [0.95, 0, 0] });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.035, 0.46, 0.035), mats.trim, s * 0.66, 0.93, -0.6, { rot: [0.95, 0, 0] });
  // character line, side intakes behind the doors, door seam
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.18, 0.62), mats.trim, s * (skinX(0.88, 0.5) - 0.005), 0.5, 0.88);
    add(new THREE.BoxGeometry(0.02, 0.3, 0.02), mats.trim, s * (skinX(0.32, 0.52) + 0.005), 0.52, 0.32);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) { const z = -1.75 + (k / 24) * 3.6; pts.push(new THREE.Vector3(s * (skinX(z, 0.6) + 0.006), 0.6, z)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.012, 4), mats.accent, 0, 0, 0, { cast: false });
  }
  // LED lights: thin front strip with corner hooks, full-width tail bar
  add(new THREE.BoxGeometry(1.0, 0.035, 0.05), mats.head, 0, 0.45, -2.13, { cast: false });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.035, 0.3), mats.head, s * 0.55, 0.47, -1.99, { cast: false, rot: [0, s * 0.5, 0] });
  add(new THREE.BoxGeometry(1.24, 0.05, 0.04), mats.tail, 0, 0.76, 2.17, { cast: false });
  add(new THREE.BoxGeometry(1.3, 0.14, 0.12), mats.trim, 0, 0.34, 2.1);                                   // diffuser
  for (let k = -2; k <= 2; k++) add(new THREE.BoxGeometry(0.025, 0.14, 0.14), mats.trim, k * 0.24, 0.35, 2.13);
  add(new THREE.PlaneGeometry(0.52, 0.13), labels.plate, 0, 0.55, 2.19, { cast: false });
  // pizza box strapped on the rear deck, logo facing back
  const box = add(new THREE.BoxGeometry(0.86, 0.3, 0.62), mats.pizzaBox, 0, 1.02, 1.46);
  add(new THREE.BoxGeometry(0.88, 0.06, 0.64), mats.red, 0, 1.06, 1.46);
  add(new THREE.BoxGeometry(0.8, 0.03, 0.02), mats.heatLed, 0, 0.9, 1.78, { cast: false });
  add(new THREE.PlaneGeometry(0.8, 0.2), labels.logo, 0, 1.03, 1.775, { cast: false });
  // wheels: tyre, five-spoke rim, dark arch liner
  const wheels: THREE.Group[] = [];
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24); tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.27, 20); rim.rotateZ(Math.PI / 2);
  for (const [s, z] of [[-1, -1.38], [1, -1.38], [-1, 1.32], [1, 1.32]]) {
    const wg = new THREE.Group(); wg.position.set(s * 0.86, 0.34, z); g.add(wg);
    add(tyre, mats.tyre || mats.trim, 0, 0, 0, { to: wg }); add(rim, mats.rim || mats.pod, 0, 0, 0, { to: wg });
    for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.28, 0.05, 0.42), mats.trim, s * 0.01, 0, 0, { to: wg, rot: [(k / 5) * Math.PI, 0, 0] });
    wheels.push(wg);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 18, 1, true, 0, Math.PI), mats.trim, s * 0.86, 0.36, z, { rot: [0, 0, Math.PI / 2], cast: false });
  }
  // cold-gas thruster nozzles: two in the rear bumper corners, two low on the front quarters (point down/back)
  const nozzles: { node: THREE.Object3D; dir: THREE.Vector3; jet: THREE.Object3D | null }[] = [];
  const pods: THREE.Mesh[] = [];
  for (const [x, y, z, dx, dy, dz] of [[-0.62, 0.36, 2.2, -0.15, -0.35, 1], [0.62, 0.36, 2.2, 0.15, -0.35, 1], [-0.58, 0.3, -1.7, -0.3, -1, 0.2], [0.58, 0.3, -1.7, 0.3, -1, 0.2]]) {
    const ring = add(new THREE.CylinderGeometry(0.075, 0.1, 0.12, 14), mats.pod, x, y, z, { rot: [dz > 0.5 ? Math.PI / 2 : 0, 0, 0], cast: false });
    const glow = add(new THREE.CircleGeometry(0.06, 12), mats.podGlow, x, y + (dz > 0.5 ? 0 : -0.065), z + (dz > 0.5 ? 0.065 : 0), { rot: [dz > 0.5 ? 0 : Math.PI / 2, 0, 0], cast: false });
    pods.push(glow); void ring;
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const n = new THREE.Object3D(); n.position.set(x, y, z); g.add(n);
    // the visible jet: a frosty cone, tip at the nozzle, opening along the thrust direction (scaled while firing)
    let jet: THREE.Object3D | null = null;
    if (mats.jet) {
      jet = new THREE.Group(); jet.position.set(x, y, z); jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); g.add(jet);
      for (const [r, h, m] of [[0.2, 1, mats.jet], [0.09, 0.7, mats.jetCore || mats.jet]] as [number, number, THREE.Material][]) {
        const cg = new THREE.CylinderGeometry(r * 0.3, r, h, 14, 1, true); cg.translate(0, -h / 2, 0);
        const cm = new THREE.Mesh(cg, m); cm.renderOrder = 3; jet.add(cm);
      }
      jet.visible = false;
    }
    nozzles.push({ node: n, dir, jet });
  }
  return { group: outer, pods, box, wheels, nozzles };
}

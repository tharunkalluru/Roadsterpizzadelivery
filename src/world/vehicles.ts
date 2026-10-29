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

// ---------- hero: Tesla Roadster-inspired coupe with cold-gas thrusters ----------
// Procedural interpretation of Tesla's October 2026 exterior photos, not a CAD model.
// Reference: https://www.tesla.com/roadster (Hidden Aero, Pilot, Gravity Defying).
// Dimensions below fit the existing arcade collision footprint; y = 0 is the road, front = -z.
export interface RoadsterNozzle {
  node: THREE.Object3D;
  dir: THREE.Vector3;
  jet: THREE.Object3D | null;
}

export function roadster(mats: any, labels: { logo: THREE.Material; plate: THREE.Material }) {
  const outer = new THREE.Group(), g = new THREE.Group(); g.position.y = -0.55; outer.add(g);
  outer.name = 'Roadster';
  const add = (geom: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, to: THREE.Object3D = g) => {
    const mesh = new THREE.Mesh(geom, mat); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; to.add(mesh); return mesh;
  };
  const boxAt = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, to = g) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, to);
  const panel = (points: number[][], mat: THREE.Material, to: THREE.Object3D = g) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    const indices: number[] = []; for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    geometry.setIndex(indices); geometry.computeVertexNormals(); mat.side = THREE.DoubleSide; return add(geometry, mat, 0, 0, 0, to);
  };
  const line = (points: number[][], radius: number, mat: THREE.Material, to: THREE.Object3D = g) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])), false, 'centripetal'), Math.max(8, points.length * 4), radius, 5), mat, 0, 0, 0, to);
  const stations = [
    [-2.30, 0.79, 0.52], [-1.95, 0.95, 0.68], [-1.40, 1.035, 0.86],
    [-0.85, 1.00, 0.84], [0.00, 0.965, 0.86], [0.75, 1.015, 0.93],
    [1.40, 1.06, 0.97], [1.95, 1.025, 0.92], [2.30, 0.94, 0.86],
  ];
  const profile = (z: number, column: number) => {
    let i = 0; while (i < stations.length - 2 && z > stations[i + 1][0]) i++;
    const a = stations[i], b = stations[i + 1], t = (z - a[0]) / (b[0] - a[0]);
    return a[column] + (b[column] - a[column]) * t;
  };
  // Actual open wheel arches in the side skin, rather than tyres intersecting a solid body.
  const archFloor = (z: number) => {
    let y = 0.22;
    for (const axle of [-1.40, 1.40]) { const dz = z - axle; if (Math.abs(dz) < 0.405) y = Math.max(y, 0.36 + Math.sqrt(0.405 ** 2 - dz ** 2)); }
    return y;
  };
  const positions: number[] = [], indices: number[] = [], segments = 100, ringSize = 12;
  for (let i = 0; i <= segments; i++) {
    const z = -2.30 + 4.60 * i / segments, w = profile(z, 1), top = profile(z, 2), low = archFloor(z);
    const ring = [[-w * 0.76, top], [w * 0.76, top], [w * 0.97, top - 0.035], [w, Math.max(low + 0.025, top - 0.14)], [w * 0.98, low], [w * 0.73, low], [w * 0.68, 0.21], [-w * 0.68, 0.21], [-w * 0.73, low], [-w * 0.98, low], [-w, Math.max(low + 0.025, top - 0.14)], [-w * 0.97, top - 0.035]];
    for (const [x, y] of ring) positions.push(x, y, z);
    if (i > 0) for (let j = 0; j < ringSize; j++) {
      const a = (i - 1) * ringSize + j, b = (i - 1) * ringSize + (j + 1) % ringSize, c = i * ringSize + j, d = i * ringSize + (j + 1) % ringSize;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let j = 1; j < ringSize - 1; j++) { indices.push(0, j, j + 1); const tail = segments * ringSize; indices.push(tail, tail + j + 1, tail + j); }
  const skin = new THREE.BufferGeometry(); skin.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); skin.setIndex(indices); skin.computeVertexNormals();
  add(skin, mats.paint).name = 'Faceted body with open wheel arches';
  boxAt(1.57, 0.07, 4.15, mats.trim, 0, 0.20, 0.02);

  // A shallow enclosed greenhouse, raked windscreen and long fastback replace the open tub.
  const windL = [-0.77, 0.852, -0.96], windR = [0.77, 0.852, -0.96], roofFL = [-0.615, 1.265, -0.22], roofFR = [0.615, 1.265, -0.22];
  const roofRL = [-0.62, 1.28, 0.43], roofRR = [0.62, 1.28, 0.43], rearL = [-0.78, 0.97, 1.45], rearR = [0.78, 0.97, 1.45];
  panel([windL, windR, roofFR, roofFL], mats.canopy).name = 'Copper windscreen';
  panel([roofFL, roofFR, roofRR, roofRL], mats.canopy);
  panel([roofRL, roofRR, rearR, rearL], mats.canopy);
  for (const s of [-1, 1]) {
    panel([[s * 0.80, 0.85, -0.88], [s * 0.625, 1.25, -0.20], [s * 0.635, 1.26, 0.43], [s * 0.79, 0.97, 1.42], [s * 0.885, 0.89, 0.57]], mats.canopy);
    line([[s * 0.78, 0.86, -0.96], [s * 0.625, 1.276, -0.22], [s * 0.635, 1.292, 0.43], [s * 0.79, 0.98, 1.45]], 0.018, mats.paint);
    line([[s * 0.645, 1.265, 0.33], [s * 0.875, 0.90, 0.48]], 0.012, mats.trim);
    // Recessed door shut-lines and flush handles; titanium sill picks up the wedge profile.
    line([[s * 1.008, 0.79, -0.84], [s * 0.975, 0.32, -0.70], [s * 0.98, 0.30, 0.48], [s * 1.005, 0.87, 0.66]], 0.007, mats.trim);
    boxAt(0.018, 0.025, 0.14, mats.accent, s * 1.002, 0.81, 0.46);
    line([[s * 0.98, 0.245, -0.93], [s * 0.968, 0.24, 0.70]], 0.025, mats.trim);
    const mirror = boxAt(0.12, 0.055, 0.18, mats.trim, s * 1.015, 0.91, -0.67); mirror.rotation.y = s * 0.2;
    line([[s * 0.87, 0.88, -0.66], [s * 1.02, 0.91, -0.67]], 0.018, mats.trim);
    boxAt(0.024, 0.035, 0.16, mats.accent, s * 1.026, 0.69, -0.91);
  }
  // Seats remain visible through the warm tinted glass, without a helmet sticking through the roof.
  for (const s of [-1, 1]) { const seat = boxAt(0.42, 0.28, 0.14, mats.seat, s * 0.33, 0.99, 0.40); seat.rotation.x = -0.15; }
  boxAt(1.18, 0.065, 0.22, mats.trim, 0, 0.90, -0.65);

  // The current Roadster has a narrow front light strip and triangular recessed lamps.
  boxAt(1.54, 0.024, 0.025, mats.head, 0, 0.532, -2.315);
  boxAt(1.51, 0.12, 0.04, mats.trim, 0, 0.44, -2.32);
  boxAt(1.67, 0.052, 0.17, mats.trim, 0, 0.235, -2.25);
  for (const s of [-1, 1]) {
    panel([[s * 0.79, 0.56, -2.23], [s * 0.94, 0.70, -1.90], [s * 0.70, 0.70, -1.90]], mats.trim);
    line([[s * 0.915, 0.702, -1.916], [s * 0.724, 0.702, -1.916]], 0.018, mats.head);
  }
  boxAt(1.82, 0.14, 0.035, mats.trim, 0, 0.76, 2.31);
  boxAt(1.82, 0.035, 0.04, mats.tail, 0, 0.82, 2.335);
  boxAt(1.68, 0.19, 0.21, mats.trim, 0, 0.32, 2.25);
  for (let i = -3; i <= 3; i++) boxAt(0.025, 0.14, 0.32, mats.trim, i * 0.22, 0.27, 2.28);
  add(new THREE.PlaneGeometry(0.40, 0.13), labels.plate, 0, 0.63, 2.335);

  // Active spoiler sits flush on the rear deck and rises during flight; gas nozzles deploy from below.
  const wing = new THREE.Group(); wing.position.set(0, 0.91, 1.96); g.add(wing);
  boxAt(1.93, 0.045, 0.34, mats.paint, 0, 0.025, 0, wing);
  const wingSupports: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    boxAt(0.035, 0.12, 0.38, mats.trim, s * 0.94, 0.055, 0, wing);
    wingSupports.push(boxAt(0.04, 1, 0.09, mats.pod, s * 0.64, 0.93, 1.94));
  }
  // The compact insulated case is a game accessory, separate from the production reference.
  const box = boxAt(0.70, 0.14, 0.43, mats.pizzaBox, 0, 1.065, 1.42);
  boxAt(0.72, 0.025, 0.45, mats.red, 0, 1.14, 1.42);
  for (const s of [-1, 1]) boxAt(0.035, 0.16, 0.46, mats.trim, s * 0.25, 1.065, 1.42);
  add(new THREE.PlaneGeometry(0.64, 0.11), labels.logo, 0, 1.07, 1.641);

  // Thin split-spoke wheels, machined rim lips, brake discs and fixed red calipers.
  const wheels: THREE.Group[] = [], wheelRollers: THREE.Group[] = [];
  const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.245, 32); tyreGeo.rotateZ(PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.245, 0.245, 0.015, 24); discGeo.rotateZ(PI / 2);
  for (const [s, z] of [[-1, -1.40], [1, -1.40], [-1, 1.40], [1, 1.40]]) {
    const steering = new THREE.Group(), roller = new THREE.Group(); steering.position.set(s * 0.945, 0.36, z); steering.add(roller); g.add(steering);
    wheels.push(steering); wheelRollers.push(roller);
    add(tyreGeo, mats.tyre, 0, 0, 0, roller);
    add(discGeo, mats.rim, s * 0.13, 0, 0, roller);
    const lip = add(new THREE.TorusGeometry(0.282, 0.014, 6, 32), mats.rim, s * 0.132, 0, 0, roller); lip.rotation.y = PI / 2;
    const inner = add(new THREE.CylinderGeometry(0.27, 0.27, 0.012, 24), mats.trim, s * 0.146, 0, 0, roller); inner.rotation.z = PI / 2;
    for (let k = 0; k < 5; k++) for (const offset of [-0.035, 0.035]) {
      const a = k * PI * 2 / 5 + offset;
      const spoke = boxAt(0.025, 0.027, 0.225, mats.rim, s * 0.158, Math.sin(a) * 0.15, Math.cos(a) * 0.15, roller); spoke.rotation.x = -a;
    }
    const hub = add(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 12), mats.pod, s * 0.165, 0, 0, roller); hub.rotation.z = PI / 2;
    boxAt(0.045, 0.15, 0.07, mats.red, s * 0.14, 0.04, -0.19, steering);
    const arch: number[][] = [];
    for (let j = 0; j <= 24; j++) { const a = j * PI / 24, zz = z - Math.cos(a) * 0.409; arch.push([s * (profile(zz, 1) + 0.003), 0.36 + Math.sin(a) * 0.409, zz]); }
    line(arch, 0.013, mats.trim);
  }
  const nozzles: RoadsterNozzle[] = [], pods: THREE.Mesh[] = [], retractors: { group: THREE.Group; home: THREE.Vector3; delta: THREE.Vector3 }[] = [];
  const nozzle = (x: number, y: number, z: number, direction: THREE.Vector3, travel: THREE.Vector3) => {
    const housing = new THREE.Group(); housing.position.set(x, y, z); g.add(housing);
    const dir = direction.normalize(), local = new THREE.Group(); local.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); housing.add(local);
    const bell = add(new THREE.CylinderGeometry(0.073, 0.052, 0.12, 16, 1, true), mats.pod, 0, 0, 0, local); bell.material = mats.pod;
    const rim = add(new THREE.TorusGeometry(0.071, 0.012, 6, 16), mats.accent, 0, 0.06, 0, local); rim.rotation.x = PI / 2;
    const mouth = add(new THREE.CircleGeometry(0.06, 16), mats.trim, 0, 0.061, 0, local); mouth.rotation.x = -PI / 2;
    const glow = add(new THREE.CircleGeometry(0.045, 12), mats.podGlow, 0, 0.063, 0, local); glow.rotation.x = -PI / 2; glow.visible = false; pods.push(glow);
    const node = new THREE.Object3D(); node.position.copy(dir).multiplyScalar(0.065); housing.add(node);
    let jet: THREE.Group | null = null;
    if (mats.jet) {
      jet = new THREE.Group(); jet.position.copy(node.position); jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); housing.add(jet);
      for (const [radius, length, material] of [[0.16, 1, mats.jet], [0.065, 0.65, mats.jetCore || mats.jet]] as [number, number, THREE.Material][]) {
        const geometry = new THREE.CylinderGeometry(0.03, radius, length, 12, 1, true); geometry.translate(0, -length / 2, 0);
        const cone = add(geometry, material, 0, 0, 0, jet); cone.castShadow = false; cone.renderOrder = 3;
      }
      jet.visible = false;
    }
    nozzles.push({ node, dir, jet }); retractors.push({ group: housing, home: housing.position.clone(), delta: travel });
  };
  // Four rear thrust ports and four downward lift jets are visually distinct.
  for (const x of [-0.48, -0.16, 0.16, 0.48]) nozzle(x, 0.47, 2.28, new THREE.Vector3(0, -0.08, 1), new THREE.Vector3(0, 0, 0.12));
  for (const s of [-1, 1]) for (const z of [-1.02, 1.73]) nozzle(s * 0.83, 0.27, z, new THREE.Vector3(s * 0.10, -1, 0.08), new THREE.Vector3(s * 0.13, -0.10, 0));
  const setDeployment = (amount: number) => {
    const d = THREE.MathUtils.clamp(amount, 0, 1), eased = d * d * (3 - 2 * d);
    wing.position.y = 0.91 + eased * 0.30; wing.rotation.x = -eased * 0.10;
    for (const support of wingSupports) { const height = 0.025 + eased * 0.30; support.scale.y = height; support.position.y = 0.92 + height / 2; }
    for (const r of retractors) r.group.position.copy(r.home).addScaledVector(r.delta, eased);
  };
  setDeployment(0);
  return { group: outer, pods, box, wheels, wheelRollers, nozzles, setDeployment };
}

import * as THREE from 'three';

type Point = [number, number, number];
const CRANK_RADIUS = .13;
const LEG_LENGTH = .395;
const up = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
const rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
const scale = new THREE.Vector3();

/** Authored rider kinematics; both feet stay on opposite, level pedals. */
export function bicycleLegPose(phase: number, side: -1 | 1): { hip: Point; knee: Point; ankle: Point; pedal: Point } {
  const hip: Point = [side * .12, .94, .26];
  const pedal: Point = [side * .18, .34 + side * CRANK_RADIUS * Math.cos(phase), .12 + side * CRANK_RADIUS * Math.sin(phase)];
  const ankle: Point = [pedal[0], pedal[1] + .075, pedal[2] + .015];
  const delta = ankle.map((v, i) => v - hip[i]) as Point;
  const length = Math.hypot(...delta), unit = delta.map(v => v / length) as Point;
  // Project the bicycle's forward direction onto the knee's bend plane.
  const bend: Point = [unit[0] * unit[2], unit[1] * unit[2], -1 + unit[2] ** 2];
  const bendLength = Math.hypot(...bend), height = Math.sqrt(Math.max(0, LEG_LENGTH ** 2 - length ** 2 / 4));
  const knee = hip.map((v, i) => v + delta[i] / 2 + bend[i] / bendLength * height) as Point;
  return { hip, knee, ankle, pedal };
}

function segment(mesh: THREE.InstancedMesh, index: number, start: Point, end: Point, radius: number): void {
  a.fromArray(start); b.fromArray(end); direction.subVectors(b, a);
  scale.set(radius, direction.length(), radius);
  rotation.setFromUnitVectors(up, direction.normalize());
  matrix.compose(a.add(b).multiplyScalar(.5), rotation, scale); mesh.setMatrixAt(index, matrix);
}

/** Four leg segments and four shoe/pedal boxes cost only two additional draws per bicycle. */
export function updateBicycleAnimation(root: THREE.Object3D, distanceM: number): void {
  const phase = -distanceM * 3; // same forward rotation sense as the wheels (-Z travel)
  const cranks = root.getObjectByName('bicycle-cranks'); if (cranks) cranks.rotation.x = phase;
  for (const name of ['bicycle-wheel-front', 'bicycle-wheel-rear']) {
    const wheel = root.getObjectByName(name); if (wheel) wheel.rotation.x = -distanceM / (root.userData.cycleWheelRadius ?? .3);
  }
  const legs = root.getObjectByName('bicycle-legs') as THREE.InstancedMesh | undefined;
  const feet = root.getObjectByName('bicycle-footrests') as THREE.InstancedMesh | undefined;
  if (!legs?.isInstancedMesh || !feet?.isInstancedMesh) return;
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const pose = bicycleLegPose(phase, side);
    segment(legs, i * 2, pose.hip, pose.knee, .065);
    segment(legs, i * 2 + 1, pose.knee, pose.ankle, .047);
    matrix.makeScale(.1, .065, .2).setPosition(pose.pedal[0], pose.pedal[1] + .05, pose.pedal[2] - .035);
    feet.setMatrixAt(i * 2, matrix);
    matrix.makeScale(.14, .035, .065).setPosition(...pose.pedal);
    feet.setMatrixAt(i * 2 + 1, matrix);
  }
  legs.instanceMatrix.needsUpdate = true; feet.instanceMatrix.needsUpdate = true;
}

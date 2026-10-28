import * as THREE from 'three';

interface CameraClearance {
  solid(point: THREE.Vector3): boolean;
  clear(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3;
}
// A viaduct can pull the normal chase camera inside the rolling model's bounds.
// Find a clear cinematic view before fitting; an extreme FOV cannot fix that.
export function frameTakeoff(camera: THREE.PerspectiveCamera, car: THREE.Object3D, look: THREE.Vector3, clearance?: CameraClearance) {
  car.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(car);
  if (bounds.isEmpty()) return;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const minimum = Math.max(6, sphere.radius * 1.9 + camera.near);
  if (camera.position.distanceTo(sphere.center) < minimum) {
    const direction = camera.position.clone().sub(sphere.center).normalize();
    if (direction.lengthSq() < .01) direction.set(0, .4, 1).normalize();
    const candidates = [sphere.center.clone().addScaledVector(direction, minimum)];
    const baseYaw = Math.atan2(direction.x, direction.z);
    for (const height of [.3, -.3, .7, -.7]) for (const turn of [0, .7854, -.7854, 1.5708, -1.5708, Math.PI]) {
      const horizontal = Math.sqrt(1 - height * height);
      candidates.push(sphere.center.clone().add(new THREE.Vector3(Math.sin(baseYaw + turn) * horizontal, height, Math.cos(baseYaw + turn) * horizontal).multiplyScalar(minimum)));
    }
    candidates.push(sphere.center.clone().add(new THREE.Vector3(0, minimum, 0)));
    const free = candidates.filter(p => !clearance?.solid(p));
    // Prefer uninterrupted sight. If the rolling body itself crosses a deck,
    // use a free eye point rather than embedding the camera in the car or deck.
    const visible = clearance ? free.filter(p => clearance.clear(sphere.center, p).distanceToSquared(p) < .04) : free;
    const pool = visible.length ? visible : free;
    pool.sort((a, b) => a.distanceToSquared(camera.position) - b.distanceToSquared(camera.position));
    if (pool.length) camera.position.copy(pool[0]);
  }
  const distance = camera.position.distanceTo(sphere.center);
  const halfAngle = Math.asin(Math.min(.98, sphere.radius / Math.max(distance, .01)));
  const vertical = Math.max(halfAngle, Math.atan(Math.tan(halfAngle) / camera.aspect));
  camera.fov = Math.min(90, Math.max(camera.fov, THREE.MathUtils.radToDeg(vertical * 2) * 1.12));
  look.copy(sphere.center); camera.lookAt(look);
}

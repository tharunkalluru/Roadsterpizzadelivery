/**
 * Fog-distance culling. Everything beyond the fog far plane is fully hazed, so the
 * environment's per-frame update() hides built groups that cannot be seen (cheap, keeps
 * draw calls bounded when the whole road network lives in the scene). Only groups this
 * module hid are ever re-shown, so the host's own visibility logic is never overridden.
 */
import * as THREE from 'three';

interface Item {
  ref: WeakRef<THREE.Object3D>;
  x: number;
  z: number;
  r: number;
}
const items: Item[] = [];
const box = new THREE.Box3();
const sphere = new THREE.Sphere();

export function registerCull(g: THREE.Object3D): void {
  g.updateMatrixWorld(true);
  box.setFromObject(g);
  if (box.isEmpty()) return;
  box.getBoundingSphere(sphere);
  items.push({ ref: new WeakRef(g), x: sphere.center.x, z: sphere.center.z, r: sphere.radius });
}

export function applyCull(tx: number, tz: number, fogFar: number): void {
  const lim = fogFar + 40;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const o = it.ref.deref();
    if (!o) { items.splice(i, 1); continue; }
    const far = Math.hypot(it.x - tx, it.z - tz) - it.r > lim;
    if (far) {
      if (o.visible) { o.visible = false; o.userData.artCulled = true; }
    } else if (o.userData.artCulled) {
      o.visible = true;
      o.userData.artCulled = false;
    }
  }
}

import * as THREE from 'three';
import { Batch, TPL } from '../core/util';

/** Worker-safe parked vehicle placement. Forward is local +z. */
export interface ParkedVehicleSite { id: string; kind: 'bike' | 'bus'; x: number; y: number; z: number; yaw: number; color: string }
export interface ParkedVehiclePose { x: number; y: number; z: number; hx: number; hz: number; pitch: number }
export interface ParkedVehicle extends ParkedVehicleSite {
  hx: number; hz: number; size: number[]; pitch: number; loaded: boolean;
  /** Last supported pose or a collision-validated landing, never the airborne frame. */
  settledPose?: ParkedVehiclePose;
  sync(): void;
}

// A handful of colour prototypes per tile; each vehicle costs one instance,
// including after a collision. No street vehicle is baked into static scenery.
export function createParkedVehicles(sites: readonly ParkedVehicleSite[], material: THREE.Material) {
  const group = new THREE.Group(), bodies: ParkedVehicle[] = [], dummy = new THREE.Object3D();
  const buckets = new Map<string, ParkedVehicleSite[]>();
  for (const site of sites) { const key = site.kind + site.color; const a = buckets.get(key) || []; a.push(site); buckets.set(key, a); }
  for (const sites of buckets.values()) {
    const { kind, color } = sites[0], b = new Batch();
    if (kind === 'bike') {
      for (const z of [-.62, .62]) b.add(TPL.cyl6, 0, .3, z, .3, .09, .3, '#18171c', { rz: Math.PI / 2 });
      b.box(0, .6, 0, .3, .36, 1.05, color);
      b.box(0, .84, -.18, .3, .1, .62, '#151418');
      b.box(0, .95, .5, .08, .55, .12, color, { rx: -.35 });
      b.box(0, 1.18, .58, .68, .05, .05, '#2a2930');
    } else {
      b.box(0, 1.65, 0, 2.5, 2.9, 11, color);
      b.box(0, 2.25, 0, 2.54, .8, 10, '#1c2533');
      for (const x of [-1.17, 1.17]) for (const z of [-3.4, 3.4]) b.add(TPL.cyl6, x, .5, z, .5, .25, .5, '#18171c', { rz: Math.PI / 2 });
    }
    const mesh = new THREE.InstancedMesh(b.geometry(), material, sites.length);
    mesh.name = `movable parked ${kind}`; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Keep normal tile culling; leave generous room for kicks, then grow the
    // bound only if an impact carries an instance beyond that allowance.
    mesh.geometry.computeBoundingSphere();
    const localRadius = mesh.geometry.boundingSphere!.radius + mesh.geometry.boundingSphere!.center.length();
    const position = new THREE.Vector3();
    let boundsReady = false;
    group.add(mesh);
    sites.forEach((site, i) => {
      const body: ParkedVehicle = { ...site, hx: Math.sin(site.yaw), hz: Math.cos(site.yaw), size: kind === 'bike' ? [.72, 1.22, 1.9] : [2.54, 3.1, 11], pitch: 0, loaded: true,
        sync() {
          dummy.position.set(body.x, body.y, body.z); dummy.rotation.set(body.pitch, Math.atan2(body.hx, body.hz), 0, 'YXZ'); dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix); mesh.instanceMatrix.needsUpdate = true;
          if (boundsReady) {
            position.copy(dummy.position);
            if (mesh.boundingSphere!.center.distanceTo(position) + localRadius > mesh.boundingSphere!.radius)
              mesh.boundingSphere!.union(new THREE.Sphere(position.clone(), localRadius + 32));
          }
        } };
      body.sync(); bodies.push(body);
    });
    mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += 32; boundsReady = true;
  }
  return { group, bodies };
}

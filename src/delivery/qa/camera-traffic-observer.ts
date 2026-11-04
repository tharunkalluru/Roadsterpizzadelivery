import * as THREE from 'three';
import type { Game } from '../../game/game';
import { segmentHitsVehicle } from '../../game/spatial-safety';
import { trafficOverlap } from '../../game/traffic-path';

/** Read existing mesh matrices/vertices only. In particular, do not update the
 * scene, compute/cache bounds, render, or advance the paused game for QA. */
export function cameraTrafficMeshProbe(root: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360), halfWidth = halfHeight * camera.aspect;
  let meshes = 0, triangles = 0, nearPlaneCrossings = 0, minDepth = Infinity, maxDepth = -Infinity;
  const point = new THREE.Vector3(), transform = new THREE.Matrix4();
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh) || !camera.layers.test(node.layers)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some(material => material.visible && material.opacity > 0)) return;
    const positions = node.geometry.getAttribute('position'), index = node.geometry.index;
    if (!positions) return;
    meshes++; transform.multiplyMatrices(camera.matrixWorldInverse, node.matrixWorld);
    const at = (i: number) => {
      point.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(transform);
      const depth = -point.z; minDepth = Math.min(minDepth, depth); maxDepth = Math.max(maxDepth, depth);
      return [point.x, point.y, depth];
    };
    for (let i = 0, count = index?.count ?? positions.count; i + 2 < count; i += 3) {
      triangles++;
      const vertices = [at(i), at(i + 1), at(i + 2)], cuts: number[][] = [];
      for (let j = 0; j < 3; j++) {
        const a = vertices[j], b = vertices[(j + 1) % 3], da = a[2] - camera.near, db = b[2] - camera.near;
        if (Math.abs(da) < 1e-9) cuts.push(a);
        if (da * db < 0) { const t = da / (da - db); cuts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, camera.near]); }
      }
      if (!cuts.length) continue;
      // Clip the triangle/near-plane intersection segment to the real lens
      // rectangle. A nearby exterior body alone is not a clipping verdict.
      const a = cuts[0], b = cuts[1] ?? a; let enter = 0, leave = 1;
      for (let axis = 0; axis < 2; axis++) {
        const extent = axis ? halfHeight : halfWidth, delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-10) { if (Math.abs(a[axis]) > extent) { leave = -1; break; } continue; }
        const lo = (-extent - a[axis]) / delta, hi = (extent - a[axis]) / delta;
        enter = Math.max(enter, Math.min(lo, hi)); leave = Math.min(leave, Math.max(lo, hi));
      }
      if (enter <= leave) nearPlaneCrossings++;
    }
  });
  return { meshes, triangles, nearPlaneCrossings, minDepth: Number.isFinite(minDepth) ? minDepth : null, maxDepth: Number.isFinite(maxDepth) ? maxDepth : null,
    limitation: 'Existing displayed matrices and render-enabled triangles; not pixel coverage, collision or performance acceptance.' };
}

/** Opt-in DEV QA only. No observers, clocks or mutations are installed here. */
export function cameraTrafficSnapshot(game: Game, metadata: { build: string; source: string }, inspectMeshes = false) {
  const player = game.player, p = player.pos, forward = player.forward, camera = game.engine.camera;
  const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360), halfWidth = halfHeight * camera.aspect;
  const nearPlaneCorners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([x, y]) => new THREE.Vector3(x * halfWidth, y * halfHeight, -camera.near).applyQuaternion(camera.quaternion).add(camera.position).toArray());
  const playerBody = { x: p.x, y: p.y - .55, z: p.z, hx: forward.x, hz: forward.z, size: [2, 1.6, 4.8] };
  const nearby = game.traffic.cars.map((car, index) => ({ car, index, distance: Math.hypot(car.x - p.x, car.z - p.z) }))
    .filter(item => item.distance <= 35).sort((a, b) => a.distance - b.distance).slice(0, 12).map(({ car, index, distance }) => {
      const visualBody = { x: car.g.position.x, y: car.g.position.y - .02, z: car.g.position.z, hx: -Math.sin(car.g.rotation.y), hz: -Math.cos(car.g.rotation.y), size: [...car.size] };
      const dx = p.x - car.x, dz = p.z - car.z, along = dx * car.hx + dz * car.hz, side = dx * car.hz - dz * car.hx;
      return { index, kind: car.kind, group: car.group, edge: car.edge.e.id, direction: car.dir, lane: car.lane, s: car.s,
        distanceToPlayer: distance, position: [car.x, car.y, car.z], heading: [car.hx, car.hz], size: [...car.size], speed: car.speed,
        display: { position: car.g.position.toArray(), rotation: car.g.rotation.toArray(), visible: car.g.visible, matrixWorld: [...car.g.matrixWorld.elements] },
        playerAlong: along, playerSide: side, nominalAlignedBumperGap: along - car.size[2] / 2 - 2.4,
        nominalPlayerOverlap: trafficOverlap(playerBody, car, 0), sweptPlayerMarginOverlap: trafficOverlap(playerBody, car, .18),
        eyeInsideHideVolume: segmentHitsVehicle(camera.position, camera.position, visualBody, .1),
        ...(inspectMeshes ? { displayedMesh: cameraTrafficMeshProbe(car.g, camera) } : {}) };
    });
  return { schemaVersion: 1, readOnly: true, ...metadata, gameSeconds: game.t, paused: game.paused,
    player: { position: p.toArray(), yaw: player.yaw, heading: [forward.x, forward.z], speed: player.speed, support: player.lastSupport,
      flying: player.flying, jumping: player.jumping, descending: player.descending,
      displayPosition: player.group.position.toArray(), displayRotation: player.group.rotation.toArray(), nominalBody: playerBody },
    camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far,
      followPosition: game.camPos.toArray(), lookAt: game.camLook.toArray(), nearPlaneCorners, matrixWorld: [...camera.matrixWorld.elements],
      matrixWorldInverse: [...camera.matrixWorldInverse.elements], projectionMatrix: [...camera.projectionMatrix.elements] },
    nearby, totalTraffic: game.traffic.cars.length,
    limitations: ['Body overlap uses the existing nominal unpitched simulation boxes; literal displayed rotation is retained for review.',
      'Aligned bumper gap is meaningful only for parallel, overlapping lanes. Mesh scan runs only on explicit snapshot download.'] };
}

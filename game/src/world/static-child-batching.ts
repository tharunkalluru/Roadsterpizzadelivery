// Merge only explicitly selected static Roadster children; animated hierarchy stays authoritative.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchStaticChildren(root: THREE.Object3D, parents: readonly THREE.Object3D[], protectedObjects: ReadonlySet<THREE.Object3D>) {
  const removed = new Set<THREE.BufferGeometry>(), stats = { batches: 0, mergedMeshes: 0, disposedGeometries: 0 };
  const eligible = (mesh: THREE.Mesh) => {
    const material = mesh.material, geometry = mesh.geometry;
    if (protectedObjects.has(mesh) || !mesh.visible || mesh.children.length || Array.isArray(material)) return false;
    for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) if (!p.visible) return false;
    if (!((material as THREE.MeshStandardMaterial).isMeshStandardMaterial || (material as THREE.MeshBasicMaterial).isMeshBasicMaterial) || material.transparent || material.opacity !== 1 || !material.visible || material.alphaTest > 0) return false;
    if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender || mesh.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow || mesh.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow) return false;
    if ((mesh as any).isSkinnedMesh || (mesh as any).isInstancedMesh || mesh.customDepthMaterial || mesh.customDistanceMaterial || Object.keys(geometry.morphAttributes).length) return false;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity || Object.values(geometry.attributes).some(a => (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)) return false;
    mesh.updateMatrix(); return mesh.matrix.determinant() > 0;
  };
  for (const parent of parents) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const node of [...parent.children]) {
      const mesh = node as THREE.Mesh; if (!mesh.isMesh || !eligible(mesh)) continue;
      const key = [(mesh.material as THREE.Material).uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled,
        !!mesh.geometry.index, Object.entries(mesh.geometry.attributes).sort().map(([name, a]) => { const attribute = a as THREE.BufferAttribute; return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}:${attribute.usage}:${attribute.gpuType}`; }).join('|')].join(':');
      (groups.get(key) || groups.set(key, []).get(key)!).push(mesh);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrix));
      let geometry: THREE.BufferGeometry | null;
      try { geometry = mergeGeometries(pieces, false); } finally { for (const piece of pieces) piece.dispose(); }
      if (!geometry) continue; // Leave the original hierarchy intact if an unsupported signature slips through.
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
      batch.name = 'Static Roadster details'; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder; batch.layers.mask = first.layers.mask; batch.frustumCulled = first.frustumCulled;
      // Insert at the first source position, preserving surrounding child order.
      const slot = parent.children.indexOf(first);
      for (const mesh of meshes) { parent.remove(mesh); removed.add(mesh.geometry); }
      parent.add(batch); parent.children.splice(parent.children.indexOf(batch), 1); parent.children.splice(slot, 0, batch);
      stats.batches++; stats.mergedMeshes += meshes.length;
    }
  }
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse(node => { if ((node as THREE.Mesh).isMesh) retained.add((node as THREE.Mesh).geometry); });
  // Disposal follows all parent batches so a shared wheel disc remains valid
  // until its final source use is removed; materials/textures are never disposed.
  for (const geometry of removed) if (!retained.has(geometry)) { geometry.dispose(); stats.disposedGeometries++; }
  return stats;
}

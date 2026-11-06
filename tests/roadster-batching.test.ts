import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticChildren } from '../src/world/static-child-batching';

test('same-parent opaque batching preserves transformed attributes, indices, material and animated exclusions', () => {
  const root = new THREE.Group(), wheel = new THREE.Group(); root.add(wheel);
  const material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry.clone(), material), protectedMesh = new THREE.Mesh(geometry, material);
  a.position.x = 2; b.position.z = 3; b.rotation.x = .4; wheel.add(a, b, protectedMesh);
  for (const m of [a, b, protectedMesh]) { m.castShadow = true; m.receiveShadow = true; m.updateMatrix(); }
  const original = [a, b].map(m => ({ matrix: m.matrix.clone(), position: m.geometry.getAttribute('position'), index: m.geometry.index! }));
  let disposedShared = 0; geometry.addEventListener('dispose', () => disposedShared++);
  const stats = batchStaticChildren(root, [wheel], new Set([protectedMesh]));
  assert.equal(stats.batches, 1); assert.equal(stats.mergedMeshes, 2); assert.equal(disposedShared, 0);
  assert.equal(protectedMesh.parent, wheel); const batch = wheel.children.find(m => m !== protectedMesh) as THREE.Mesh;
  assert.equal(batch.material, material); assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
  wheel.rotation.set(.3, -.4, 1.2); root.position.set(4, 5, 6); root.updateMatrixWorld(true);
  let offset = 0, indexAt = 0;
  for (const source of original) {
    for (let i = 0; i < source.position.count; i++) {
      const expected = new THREE.Vector3().fromBufferAttribute(source.position, i).applyMatrix4(source.matrix).applyMatrix4(wheel.matrixWorld);
      const actual = new THREE.Vector3().fromBufferAttribute(batch.geometry.getAttribute('position'), offset + i).applyMatrix4(batch.matrixWorld);
      assert.ok(expected.distanceTo(actual) < 1e-6);
    }
    for (let i = 0; i < source.index.count; i++) assert.equal(batch.geometry.index!.getX(indexAt++), source.index.getX(i) + offset);
    offset += source.position.count;
  }
});

test('transparent, mirrored, custom callback and differing render state remain separate', () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial(), protectedObjects = new Set<THREE.Object3D>();
  const add = (mat: THREE.Material = material) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), mat); root.add(m); return m; };
  const a = add(), b = add(), mirrored = add(), translucent = add(new THREE.MeshStandardMaterial({ transparent: true, opacity: .8 }));
  const custom = add(), order = add(), hidden = add(); mirrored.scale.x = -1; custom.onBeforeRender = () => {}; order.renderOrder = 5; hidden.visible = false;
  const materialBefore = translucent.material;
  batchStaticChildren(root, [root], protectedObjects);
  assert.equal(a.parent, null); assert.equal(b.parent, null);
  for (const m of [mirrored, translucent, custom, order, hidden]) assert.equal(m.parent, root);
  assert.equal(translucent.material, materialBefore); assert.equal(mirrored.scale.x, -1);
});

test('shared source geometry disposes once after every batch and never through a retained reference', () => {
  const root = new THREE.Group(), a = new THREE.Group(), b = new THREE.Group(); root.add(a, b);
  const material = new THREE.MeshBasicMaterial(), shared = new THREE.BoxGeometry(); let disposed = 0; shared.addEventListener('dispose', () => disposed++);
  for (const parent of [a, b]) parent.add(new THREE.Mesh(shared, material), new THREE.Mesh(new THREE.BoxGeometry(), material));
  batchStaticChildren(root, [a, b], new Set()); assert.equal(disposed, 1);
});

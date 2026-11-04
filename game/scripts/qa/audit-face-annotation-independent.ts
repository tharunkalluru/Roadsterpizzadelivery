import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import catalog from '../../src/delivery/art/character-assets.json';
import { createAuthoredMotionPlayer } from '../../src/delivery/art/authored-motion';
import { validFaceAnnotation } from '../../src/delivery/art/face-annotations';

// Independent source/pose audit of native-picked records. This never approves
// anatomy from coordinates: native closed/mask/open image review is required.
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Supply annotation JSON and a new output path.');
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const annotationBytes = await readFile(input), annotations = JSON.parse(annotationBytes.toString());
assert.equal(annotations.schemaVersion, 1); assert.ok(Array.isArray(annotations.entries));
const visualPath = 'docs/qa/evidence/main-expansion/face-annotation-independent/visual-review.json';
const visuals = JSON.parse(await readFile(visualPath, 'utf8'));
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const identities = new Set<string>(), results: any[] = [];
for (const annotation of annotations.entries) {
  assert.ok(!identities.has(annotation.characterId), 'duplicate identity'); identities.add(annotation.characterId);
  const asset = catalog.assets.find(entry => entry.characterId === annotation.characterId);
  assert.ok(asset, 'unknown identity'); assert.equal(annotation.glbSha256, asset.glb.sha256);
  const sourcePath = 'public' + asset.glb.url, bytes = await readFile(sourcePath);
  assert.equal(sha(bytes), asset.glb.sha256);
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  // Texture bindings only are omitted in memory; BIN, vertices, indices, skins,
  // animation and node transforms remain the exact hashed source.
  for (const material of json.materials ?? []) {
    for (const key of Object.keys(material)) if (key.endsWith('Texture')) delete material[key];
    if (material.pbrMetallicRoughness) for (const key of Object.keys(material.pbrMetallicRoughness))
      if (key.endsWith('Texture')) delete material.pbrMetallicRoughness[key];
  }
  delete json.images; delete json.textures; delete json.samplers;
  const text = Buffer.from(JSON.stringify(json)), padding = (4 - text.length % 4) % 4;
  const bin = bytes.subarray(20 + jsonLength), header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + padding + bin.length, 8);
  header.writeUInt32LE(text.length + padding, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const buffer = Buffer.concat([header, text, Buffer.alloc(padding, 32), bin]);
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), '');
  const root = gltf.scene, pose = asset.contract.pose;
  const motion = createAuthoredMotionPlayer(root, gltf.animations, asset.contract.motions, pose.mode === 'handoff-clip' ? pose : undefined);
  motion.catchPose(0); motion.animate?.(0, 'idle', 0); root.updateWorldMatrix(true, true);
  let selected: THREE.Object3D = root;
  for (const index of annotation.nodePath) { assert.ok(Number.isInteger(index) && selected.children[index]); selected = selected.children[index]; }
  assert.ok(selected instanceof THREE.Mesh); const mesh = selected as THREE.Mesh;
  assert.equal(mesh.name, annotation.meshName); assert.equal(mesh.geometry.getAttribute('position').count, annotation.positionCount);
  if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
  root.userData.releasedCharacter = { identity: annotation.characterId, glbSha256: asset.glb.sha256 };
  assert.equal(validFaceAnnotation(root, annotation, annotation.characterId, true), true,
    annotation.characterId + ': current hardened runtime guard must accept the exact picked source');
  assert.equal(validFaceAnnotation(root, annotation, annotation.characterId), annotation.review.status === 'approved',
    annotation.characterId + ': production guard must distinguish picked from approved');
  const head = root.getObjectByName(annotation.headNode); assert.ok(head);
  const tuple = annotation.sourceTriangle.indices as number[], index = mesh.geometry.index;
  assert.equal(new Set(tuple).size, 3); let triangleFound = false;
  const drawCount = index?.count ?? annotation.positionCount;
  for (let offset = 0; offset < drawCount; offset += 3) {
    if (tuple.every((entry, i) => entry === (index ? index.getX(offset + i) : offset + i))) { triangleFound = true; break; }
  }
  assert.ok(triangleFound, annotation.characterId + ': source triangle must be an actual drawn source face');
  const vertex = new THREE.Vector3(), anchorWorld = head!.localToWorld(new THREE.Vector3().fromArray(annotation.anchorHeadLocal));
  const reconstructed = new THREE.Vector3(), rootInverse = root.matrixWorld.clone().invert();
  for (let i = 0; i < 3; i++) reconstructed.addScaledVector(mesh.getVertexPosition(tuple[i], vertex).applyMatrix4(mesh.matrixWorld), annotation.sourceTriangle.barycentric[i]);
  const anchorResidual = reconstructed.distanceTo(anchorWorld);
  assert.ok(anchorResidual < .002, annotation.characterId + ': picked surface must reconstruct the head-local anchor');
  const anchorRoot = anchorWorld.clone().applyMatrix4(rootInverse), seen = new Set<number>(); let maxWeightResidual = 0;
  for (const entry of annotation.mask) {
    assert.ok(!seen.has(entry.index)); seen.add(entry.index);
    mesh.getVertexPosition(entry.index, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInverse);
    const x = (vertex.x - anchorRoot.x) / .035, y = (vertex.y - anchorRoot.y) / .018, radius = x * x + y * y;
    assert.ok(radius < 1.00001 && Math.abs(vertex.z - anchorRoot.z) <= .015001, annotation.characterId + ': mask leaves picked lip neighborhood');
    assert.equal(entry.lower, y <= 0);
    maxWeightResidual = Math.max(maxWeightResidual, Math.abs(entry.weight - Math.max(0, 1 - radius) ** 2));
  }
  assert.ok(maxWeightResidual < .0001, annotation.characterId + ': mask weights must correspond to the picked region');
  const payload = Object.fromEntries(Object.entries(annotation).filter(([key]) => key !== 'review'));
  const anatomyBindingSHA256 = sha(JSON.stringify(canonical(payload)));
  const visual = visuals.reviews.find((entry: any) => entry.characterId === annotation.characterId && entry.anatomyBindingSHA256 === anatomyBindingSHA256 && entry.verdict === 'accepted');
  assert.ok(visual, annotation.characterId + ': exact annotation requires independent native image acceptance');
  for (const image of visual.images) assert.equal(sha(await readFile(image.path)), image.sha256);
  results.push({ characterId: annotation.characterId, anatomyBindingSHA256, sourcePath, sourceSHA256: sha(bytes),
    sourceTriangleFound: true, hardenedRuntimeGuardPassed: true, anchorResidualMetres: anchorResidual, maskVertices: seen.size, maxWeightResidual,
    sourceReviewStatus: annotation.review.status, nativeVisualReceipt: visualPath });
  motion.dispose(); root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose(); if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); } });
  assert.equal(sha(await readFile(sourcePath)), asset.glb.sha256);
}
const report = { schemaVersion: 1, sourceExport: input, sourceExportSHA256: sha(annotationBytes),
  scope: 'Independent exact-source topology, Idle0 barycentric anchor, sparse lip neighborhood and immutable native image binding. Picked status is not production approval; no voice, meal or hardware acceptance is inferred.', results };
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, records: results.length, maximumAnchorResidualMetres: Math.max(0, ...results.map(result => result.anchorResidualMetres)) }));

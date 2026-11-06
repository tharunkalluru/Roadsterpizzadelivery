#!/usr/bin/env node
/** Export a DIAGNOSTIC posed mesh from the real Three.js gameplay mixer.
 * This is a frozen pose, never a replacement production rig. Existing source
 * textures/materials are retained; skin deformation is baked into copied vertex
 * buffers so Blender sees the actual masked combination rather than TakePizza
 * alone. No browser, renderer or GPU is used by this exporter.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createAuthoredMotionPlayer } from '../../src/delivery/art/authored-motion.ts';
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
for (const key of ['--input', '--rig', '--output']) if (!args.get(key)) throw new Error(`Missing ${key}.`);
const input = resolve(args.get('--input')), output = resolve(args.get('--output'));
const proofPath = output.replace(/\.glb$/, '.pose-proof.json');
if (input === output || !output.endsWith('.glb')) throw new Error('Use a new diagnostic GLB output.');
for (const path of [output, proofPath]) { try { await access(path); throw new Error(`Refusing to overwrite ${path}.`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const bytes = await readFile(input), contract = JSON.parse(await readFile(args.get('--rig'), 'utf8'));
const phase = Number(args.get('--phase') ?? .35), amount = Number(args.get('--catch') ?? 1), mode = args.get('--mode') ?? 'read';
const speed = Number(args.get('--speed') ?? 1);
if (!Number.isFinite(phase) || phase < 0 || phase > 10 || !Number.isFinite(amount) || amount < 0 || amount > 1 || !Number.isFinite(speed) || speed < 0) throw new Error('Invalid diagnostic sample.');
globalThis.self ??= globalThis; globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const root = gltf.scene, motion = createAuthoredMotionPlayer(root, gltf.animations, contract.motions, contract.pose);
motion.animate?.(0, mode, speed);
let elapsed = 0;
while (elapsed < phase - 1e-10) { const dt = Math.min(.05, phase - elapsed); motion.animate?.(dt, mode, speed); elapsed += dt; }
const clockBefore = root.userData.authoredMotion.time;
motion.catchPose(amount); root.updateMatrixWorld(true);
if (clockBefore !== root.userData.authoredMotion.time) throw new Error('Catch rewound the base animation clock.');
const jsonSize = bytes.readUInt32LE(12), model = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
const binStart = 28 + jsonSize, binary = Buffer.from(bytes.subarray(binStart));
const vector = new THREE.Vector3(), skinIndex = new THREE.Vector4(), skinWeight = new THREE.Vector4();
const matrix = new THREE.Matrix4(), skinMatrix = new THREE.Matrix4(), normal = new THREE.Vector4();
let measured = 0;
function writer(accessorId) {
  const accessor = model.accessors[accessorId], view = model.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) throw new Error('Expected dense floating VEC3 geometry.');
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 12;
  return { accessor, put(index, point) { for (let component = 0; component < 3; component++) binary.writeFloatLE(point.getComponent(component), offset + index * stride + component * 4); } };
}
root.traverse(node => {
  const association = gltf.parser.associations.get(node);
  if (association?.nodes !== undefined) {
    const destination = model.nodes[association.nodes]; delete destination.matrix;
    destination.translation = node.position.toArray(); destination.rotation = node.quaternion.toArray(); destination.scale = node.scale.toArray();
  }
  if (!(node instanceof THREE.SkinnedMesh)) return;
  if (association?.meshes === undefined || association?.primitives === undefined) throw new Error('Missing exact GLTF mesh association.');
  const primitive = model.meshes[association.meshes].primitives[association.primitives], position = writer(primitive.attributes.POSITION);
  const normalWriter = primitive.attributes.NORMAL === undefined ? null : writer(primitive.attributes.NORMAL);
  const box = new THREE.Box3();
  for (let index = 0; index < position.accessor.count; index++) {
    node.getVertexPosition(index, vector); position.put(index, vector); box.expandByPoint(vector); measured++;
    if (normalWriter) {
      skinIndex.fromBufferAttribute(node.geometry.getAttribute('skinIndex'), index); skinWeight.fromBufferAttribute(node.geometry.getAttribute('skinWeight'), index);
      skinMatrix.elements.fill(0);
      for (let component = 0; component < 4; component++) {
        const weight = skinWeight.getComponent(component); if (!weight) continue;
        const bone = skinIndex.getComponent(component); matrix.multiplyMatrices(node.skeleton.bones[bone].matrixWorld, node.skeleton.boneInverses[bone]);
        for (let element = 0; element < 16; element++) skinMatrix.elements[element] += matrix.elements[element] * weight;
      }
      skinMatrix.premultiply(node.bindMatrixInverse).multiply(node.bindMatrix);
      vector.fromBufferAttribute(node.geometry.getAttribute('normal'), index); normal.set(vector.x, vector.y, vector.z, 0).applyMatrix4(skinMatrix);
      vector.set(normal.x, normal.y, normal.z).normalize(); normalWriter.put(index, vector);
    }
  }
  position.accessor.min = box.min.toArray(); position.accessor.max = box.max.toArray();
  // GLTFLoader represents a multi-material mesh as a node Group with one
  // SkinnedMesh child per primitive. Its source node association lives on the
  // parent, while the primitive association lives on the child.
  let sourceNode = node, sourceAssociation = association;
  while (sourceAssociation?.nodes === undefined && sourceNode.parent) { sourceNode = sourceNode.parent; sourceAssociation = gltf.parser.associations.get(sourceNode); }
  if (sourceAssociation?.nodes === undefined) throw new Error('Skinned primitive has no exact source node.');
  delete model.nodes[sourceAssociation.nodes].skin;
});
// Frozen pose keeps all prop/bone hierarchy transforms above. It must not play
// old clips or run another skin a second time on these already-deformed points.
delete model.animations; delete model.skins;
const encoded = Buffer.from(JSON.stringify(model)), padding = Buffer.alloc((4 - encoded.length % 4) % 4, 32), result = Buffer.alloc(28 + encoded.length + padding.length + binary.length);
result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(encoded.length + padding.length, 12); result.writeUInt32LE(0x4e4f534a, 16); encoded.copy(result, 20); padding.copy(result, 20 + encoded.length);
const binHeader = 20 + encoded.length + padding.length; result.writeUInt32LE(binary.length, binHeader); result.writeUInt32LE(0x004e4942, binHeader + 4); binary.copy(result, binHeader + 8);
const hash = value => createHash('sha256').update(value).digest('hex');
const catchNode = root.getObjectByName(contract.nodes.catchPoint), catchWorld = catchNode.getWorldPosition(new THREE.Vector3());
let palmEvidence;
if (args.get('--contact-proof')) {
  const contact = JSON.parse(await readFile(args.get('--contact-proof'), 'utf8'));
  if (contact.outputGlbSha256 !== hash(bytes)) throw new Error('Contact proof does not match this exact source GLB.');
  const sources = contact.sourceHands ?? [{ meshName: contact.sourceMeshName, vertices: contact.sourcePalmVertices }];
  const hands = sources.map(source => {
    const hand = root.getObjectByName(source.meshName);
    if (!(hand instanceof THREE.SkinnedMesh)) throw new Error('Contact proof anatomical hand is absent.');
    const points = source.vertices.map(entry => hand.localToWorld(hand.getVertexPosition(entry.exportedVertexIndex, new THREE.Vector3())));
    const mean = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
    return { side: source.side, sourceIndices: source.vertices, pointsWorldThree: points.map(point => point.toArray()), meanWorldThree: mean.toArray() };
  });
  const mean = hands.reduce((sum, hand) => sum.add(new THREE.Vector3().fromArray(hand.meanWorldThree)), new THREE.Vector3()).divideScalar(hands.length);
  const palmAnchor = catchWorld.clone(); if (contract.catchPointSpace === 'box-center') palmAnchor.y -= .035;
  palmEvidence = { hands, pointsWorldThree: hands.flatMap(hand => hand.pointsWorldThree), meanWorldThree: mean.toArray(), catchToPalmMetres: palmAnchor.distanceTo(mean) };
}
const proof = { status: 'DIAGNOSTIC frozen gameplay-mixer pose; never a production character or scene approval', input, inputSha256: hash(bytes), outputSha256: hash(result),
  actualMixer: 'createAuthoredMotionPlayer from current gameplay source', mode, speedMetresPerSecond: speed, elapsed: phase, catchAmount: amount, baseClockBeforeCatch: clockBefore, baseClockAfterCatch: root.userData.authoredMotion.time,
  skinnedVerticesBaked: measured, allOriginalTexturesAndMaterialsRetained: true, catchWorldThree: catchWorld.toArray(), catchPointSpace: contract.catchPointSpace ?? 'palm-contact', palmEvidence,
  note: 'Actual masked skin deformation frozen into copied geometry; prop and bone transforms retain actual mixer pose. No GPU or performance evidence.', scriptSha256: hash(await readFile(new URL(import.meta.url))) };
await writeFile(output, result); await writeFile(proofPath, JSON.stringify(proof, null, 2));
motion.dispose(); console.log(JSON.stringify({ output, measured, sha256: hash(result), catchWorld: catchWorld.toArray() }));

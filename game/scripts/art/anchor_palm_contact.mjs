#!/usr/bin/env node
/** Native GLB contact authoring against the actual gameplay animation mixer.
 * Geometry-only ImageBitmap stubs avoid a DOM/GPU; they are never exported.
 * Only the catch-node parent/transform and descriptor are authored. Every
 * existing GLB buffer, image, material, mesh and animation remains unchanged.
 * A numerical contact pass is not an appearance or release approval.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { createAuthoredMotionPlayer } from '../../src/delivery/art/authored-motion.ts';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
for (const key of ['--input', '--rig', '--palm-vertices', '--output']) if (!args.get(key)) throw new Error(`Missing ${key}.`);
const input = resolve(args.get('--input')), rigPath = resolve(args.get('--rig'));
const palmPath = resolve(args.get('--palm-vertices')), output = resolve(args.get('--output'));
if (extname(output) !== '.glb' || input === output) throw new Error('Use a new GLB output.');
const sibling = suffix => output.slice(0, -4) + suffix;
for (const path of [output, sibling('.rig.json'), sibling('.contact-proof.json'), sibling('.production.json')]) {
  try { await access(path); throw new Error(`Refusing to overwrite ${path}.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const bytes = await readFile(input), contract = JSON.parse(await readFile(rigPath, 'utf8'));
const sourcePalm = JSON.parse(await readFile(palmPath, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
if (!sourcePalm.vertices?.length) throw new Error('Actual native palm evidence is required.');
let referenceGlbSha256;
if (sourcePalm.sourceGlbSha256 !== hash(bytes)) {
  // A local texture-only descendant still needs the original, fingerprinted
  // native reference. Every source point is independently matched against the
  // actual current rest skin below; the old hash is never relabelled as new.
  if (!args.get('--reference-source')) throw new Error('Derived input needs the exact fingerprinted native reference GLB.');
  referenceGlbSha256 = hash(await readFile(args.get('--reference-source')));
  if (referenceGlbSha256 !== sourcePalm.sourceGlbSha256) throw new Error('Native reference GLB fingerprint mismatch.');
}
globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
const parse = async data => new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
const gltf = await parse(bytes), root = gltf.scene;
root.updateMatrixWorld(true);
const mesh = root.getObjectByName(sourcePalm.meshName);
if (!(mesh instanceof THREE.SkinnedMesh)) throw new Error('Exact anatomical hand mesh missing.');
const point = new THREE.Vector3(), exported = [];
for (const source of sourcePalm.vertices) {
  const expected = new THREE.Vector3().fromArray(source.exportThreeRestWorld), matches = [];
  for (let index = 0; index < mesh.geometry.getAttribute('position').count; index++) {
    mesh.getVertexPosition(index, point); mesh.localToWorld(point);
    if (point.distanceTo(expected) < 2e-6) matches.push(index);
  }
  if (!matches.length) throw new Error(`No exact exported source-palm vertex ${source.nativeVertexIndex}.`);
  exported.push({ nativeVertexIndex: source.nativeVertexIndex, exportedVertexIndex: matches[0], coincidentExportedVertices: matches });
}
const phases = [0, .35, 1], inspect = (scene, phase) => {
  const actor = clone(scene), hand = actor.getObjectByName(sourcePalm.meshName);
  const motion = createAuthoredMotionPlayer(actor, gltf.animations, contract.motions, contract.pose);
  motion.animate?.(0, 'read');
  let elapsed = 0;
  while (elapsed < phase - 1e-10) { const dt = Math.min(.05, phase - elapsed); motion.animate?.(dt, 'read'); elapsed += dt; }
  const clockBefore = actor.userData.authoredMotion.time;
  motion.catchPose(1); actor.updateMatrixWorld(true);
  const points = exported.map(({ exportedVertexIndex }) => hand.localToWorld(hand.getVertexPosition(exportedVertexIndex, new THREE.Vector3())));
  const palm = points.reduce((mean, vertex) => mean.add(vertex), new THREE.Vector3()).divideScalar(points.length);
  const bone = actor.getObjectByName(sourcePalm.boneName), catchNode = actor.getObjectByName(contract.nodes.catchPoint);
  if (!bone || !catchNode) throw new Error('Required native bone or catch point missing.');
  const anchor = catchNode.getWorldPosition(new THREE.Vector3());
  const result = { readElapsed: phase, readClockBeforeCatch: clockBefore, readClockAfterCatch: actor.userData.authoredMotion.time,
    exactMixer: 'createAuthoredMotionPlayer: Read + reviewed masked TakePizza(1)',
    palmWorld: palm.toArray(), anchorWorld: anchor.toArray(), anchorMinusPalm: anchor.clone().sub(palm).toArray(),
    anchorDistanceMetres: anchor.distanceTo(palm), palmBoneLocal: bone.worldToLocal(palm.clone()).toArray() };
  motion.dispose(); return result;
};
const before = phases.map(phase => inspect(root, phase));
const local = new THREE.Vector3().fromArray(before[1].palmBoneLocal);
if (before.some(row => new THREE.Vector3().fromArray(row.palmBoneLocal).distanceTo(local) > .001)) throw new Error('Palm is not stable in this hand bone across continuing Read phases.');
const size = bytes.readUInt32LE(12), model = JSON.parse(bytes.subarray(20, 20 + size).toString());
const catchIndex = model.nodes.findIndex(node => node.name === contract.nodes.catchPoint);
const handIndex = model.nodes.findIndex(node => node.name === sourcePalm.boneName);
if (catchIndex < 0 || handIndex < 0 || catchIndex === handIndex) throw new Error('Required exact GLB nodes missing.');
const originalNodes = structuredClone(model.nodes);
for (const node of model.nodes) if (node.children) node.children = node.children.filter(index => index !== catchIndex);
for (const scene of model.scenes ?? []) if (scene.nodes) scene.nodes = scene.nodes.filter(index => index !== catchIndex);
model.nodes[handIndex].children ??= []; model.nodes[handIndex].children.push(catchIndex);
const catchNode = model.nodes[catchIndex];
delete catchNode.matrix; delete catchNode.rotation; delete catchNode.scale;
catchNode.translation = local.toArray();
const encoded = Buffer.from(JSON.stringify(model)), padding = Buffer.alloc((4 - encoded.length % 4) % 4, 32);
const tail = bytes.subarray(20 + size), result = Buffer.alloc(20 + encoded.length + padding.length + tail.length);
result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(encoded.length + padding.length, 12); result.writeUInt32LE(0x4e4f534a, 16);
encoded.copy(result, 20); padding.copy(result, 20 + encoded.length); tail.copy(result, 20 + encoded.length + padding.length);
const reparsed = await parse(result), after = phases.map(phase => inspect(reparsed.scene, phase));
if (after.some(row => row.anchorDistanceMetres > .001 || row.readClockBeforeCatch !== row.readClockAfterCatch)) throw new Error('Actual mixer palm contact/continuing Read regression.');
const oldModel = JSON.parse(bytes.subarray(20, 20 + size).toString());
for (const key of ['meshes', 'materials', 'images', 'textures', 'samplers', 'animations', 'accessors', 'bufferViews', 'buffers', 'skins']) {
  if (JSON.stringify(model[key]) !== JSON.stringify(oldModel[key])) throw new Error(`Unexpected authored ${key} change.`);
}
if (!result.subarray(20 + encoded.length + padding.length).equals(tail)) throw new Error('Binary source buffers changed.');
if (!contract.id.includes('-actual-mixer-palm-parent-v1')) contract.id += '-actual-mixer-palm-parent-v1';
contract.catchPointSpace = 'palm-contact';
const proof = { status: 'UNREVIEWED geometry-only contact authoring; actual scene/appearance review still required',
  sourceGlbSha256: hash(bytes), outputGlbSha256: hash(result), referenceGlbSha256, sourcePalmEvidenceSha256: hash(await readFile(palmPath)),
  sourcePalmVertices: exported, sourceMeshName: sourcePalm.meshName, boneName: sourcePalm.boneName,
  actualMixerBefore: before, actualMixerAfter: after, parentBoneLocalPalmContact: local.toArray(),
  unchangedBinaryPayloadSha256: hash(tail), unchanged: ['all geometry', 'all materials/images/textures', 'all skins', 'all animation data/clip names', 'JapaneseBook', 'locomotion timing'],
  changedNodeNames: model.nodes.flatMap((node, index) => JSON.stringify(node) !== JSON.stringify(originalNodes[index]) ? [node.name] : []),
  runtimeBoxContract: '.4x.07x.4m; centre is palm-contact world position +.035 world Y; no double half-height',
  renderer: 'none; real Three.js GLTFLoader and gameplay mixer, skinned vertices evaluated on CPU' };
await writeFile(output, result); await writeFile(sibling('.rig.json'), JSON.stringify(contract, null, 2));
await writeFile(sibling('.contact-proof.json'), JSON.stringify(proof, null, 2));
await writeFile(sibling('.production.json'), JSON.stringify({ ...proof, input, rigPath, palmPath, scriptSha256: hash(await readFile(new URL(import.meta.url))) }, null, 2));
console.log(JSON.stringify({ output, sha256: hash(result), beforeMetres: before.map(row => row.anchorDistanceMetres), afterMetres: after.map(row => row.anchorDistanceMetres) }));

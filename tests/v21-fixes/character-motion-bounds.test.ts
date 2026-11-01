import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { bakeMotionBounds, sampleTimes, validateMotionBoundsSamples } from '../../scripts/art/bake_motion_bounds.mjs';
import { applyCharacterMotionBounds, validateCharacterMotionBounds, type CharacterMotionBounds } from '../../src/delivery/art/motion-bounds';

const HASH = 'a'.repeat(64);
function fixture() {
  const root = new THREE.Group(); root.name = 'TestActor';
  const shoulder = new THREE.Bone(); shoulder.name = 'Shoulder';
  const wrist = new THREE.Bone(); wrist.name = 'Wrist'; shoulder.add(wrist); root.add(shoulder);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0, 1, .1, 0, .9, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); mesh.name = 'Hand'; root.add(mesh);
  root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([shoulder, wrist]));
  const rotation = (name: string, radians: number) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1], [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), radians).toArray()]);
  const clips = [new THREE.AnimationClip('Read', 1, [rotation('Shoulder', Math.PI / 2)]), new THREE.AnimationClip('TakePizza', 1, [rotation('Wrist', Math.PI)])];
  const contract = { sceneName: root.name, pose: { mode: 'handoff-clip', clipName: 'TakePizza', upperBodyNodes: ['Wrist'] }, motions: { clips: { read: { clipName: 'Read' } } } };
  return { root, geometry, mesh, shoulder, wrist, clips, contract };
}
const baked = (f: ReturnType<typeof fixture>) => bakeMotionBounds(f.root, f.clips, HASH, f.contract, { fps: 24, margin: .02 }).bounds as CharacterMotionBounds;

test('offline bake covers bind pose, exact keyframes/endpoints and an articulated hand over the seated/base torso, then restores the source', () => {
  const f = fixture(), geometryBefore = f.geometry.boundingSphere!.clone(), initialSphere = f.mesh.boundingSphere;
  const bounds = baked(f), sphere = new THREE.Sphere(new THREE.Vector3(...bounds.meshes.Hand.center), bounds.meshes.Hand.radius);
  assert.ok(bounds.sampling.poseCount > 50);
  assert.deepEqual(bounds.sampling.clips.map(clip => clip.name), ['Read', 'TakePizza']);
  assert.ok(bounds.sampling.maskedHandoff!.fractions.includes(1));
  assert.ok(sphere.containsPoint(new THREE.Vector3(0, 1, 0)));
  assert.ok(sphere.containsPoint(new THREE.Vector3(-1, 0, 0)));
  assert.ok(sphere.containsPoint(new THREE.Vector3(0, -1, 0)), 'shoulder 90° plus wrist 180° is a masked combination outside either standalone clip');
  assert.deepEqual(f.shoulder.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(f.wrist.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(f.geometry.boundingSphere, geometryBefore);
  assert.equal(f.mesh.boundingSphere, initialSphere);
  const validation = validateMotionBoundsSamples(f.root, f.clips, bounds, f.contract);
  assert.ok(validation.poses > 30); assert.ok(validation.maximumRadiusFraction < 1);
  const tooSmall = structuredClone(bounds); tooSmall.meshes.Hand.radius = .1;
  assert.throws(() => validateMotionBoundsSamples(f.root, f.clips, tooSmall, f.contract), /validation failed/);
  assert.deepEqual(f.shoulder.quaternion.toArray(), [0, 0, 0, 1]);
  assert.deepEqual(sampleTimes(new THREE.AnimationClip('Key', .17, [new THREE.NumberKeyframeTrack('Wrist.rotation[x]', [0, .033, .17], [0, .4, 0])]), 12), [0, new Float32Array([.033])[0], 1 / 12, 2 / 12, .17]);
});

test('only clone-owned SkinnedMesh spheres change, with no runtime scan or shared geometry mutation', () => {
  const f = fixture(), bounds = baked(f), originalGeometrySphere = f.geometry.boundingSphere!.clone();
  f.mesh.computeBoundingSphere();
  const staleFirstPose = f.mesh.boundingSphere!.clone(), one = cloneSkeleton(f.root), two = cloneSkeleton(f.root);
  const handOne = one.getObjectByName('Hand') as THREE.SkinnedMesh, handTwo = two.getObjectByName('Hand') as THREE.SkinnedMesh;
  assert.equal(handOne.geometry, f.geometry); assert.equal(handTwo.geometry, f.geometry);
  handOne.getVertexPosition = () => { throw new Error('Runtime must not scan skinned vertices.'); };
  assert.equal(applyCharacterMotionBounds(one, bounds, HASH), 1);
  assert.equal(applyCharacterMotionBounds(two, bounds, HASH), 1);
  assert.notEqual(handOne.boundingSphere, handTwo.boundingSphere);
  assert.notEqual(handOne.boundingSphere, f.mesh.boundingSphere);
  handOne.boundingSphere!.radius += 1;
  assert.equal(handTwo.boundingSphere!.radius, bounds.meshes.Hand.radius);
  assert.deepEqual(f.mesh.boundingSphere, staleFirstPose);
  assert.deepEqual(f.geometry.boundingSphere, originalGeometrySphere);
  assert.equal(handOne.frustumCulled, true);
});

test('bounds remain mesh-local under world placement and allow the normal frustum test to see the moved hand', () => {
  const f = fixture(), bounds = baked(f); applyCharacterMotionBounds(f.root, bounds, HASH);
  const before = f.mesh.boundingSphere!.clone();
  f.root.position.set(7, 2, -4); f.root.rotation.y = .7; f.root.scale.setScalar(1.5);
  f.wrist.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); f.root.updateMatrixWorld(true);
  const point = f.mesh.getVertexPosition(0, new THREE.Vector3());
  assert.ok(f.mesh.boundingSphere!.containsPoint(point));
  const world = point.clone().applyMatrix4(f.mesh.matrixWorld), camera = new THREE.PerspectiveCamera(10, 1, .01, 10);
  camera.position.copy(world).add(new THREE.Vector3(0, 0, 2)); camera.lookAt(world); camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.ok(frustum.intersectsObject(f.mesh));
  assert.deepEqual(f.mesh.boundingSphere, before, 'world placement never rewrites the authored local sphere');
});

test('wrong hashes, changed/missing/duplicate skinned graph and unsafe spheres fail before any instance change', () => {
  const f = fixture(), good = baked(f);
  const invalid = (edit: (bounds: CharacterMotionBounds) => void, pattern: RegExp) => {
    const bad = structuredClone(good); edit(bad);
    assert.throws(() => applyCharacterMotionBounds(f.root, bad, HASH), pattern);
    assert.equal(f.mesh.boundingSphere, null);
  };
  invalid(bounds => { bounds.glbSha256 = 'b'.repeat(64); }, /verified GLB/);
  invalid(bounds => { bounds.sceneName = 'Other'; }, /named scene/);
  invalid(bounds => { delete bounds.meshes.Hand; }, /exact skinned mesh graph/);
  invalid(bounds => { bounds.meshes.Extra = { ...bounds.meshes.Hand }; }, /exact skinned mesh graph/);
  invalid(bounds => { bounds.meshes.Hand.radius = NaN; }, /sphere/);
  invalid(bounds => { bounds.meshes.Hand.radius = 11; }, /sphere/);
  invalid(bounds => { bounds.meshes.Hand.center = [0, Infinity, 0]; }, /sphere/);
  invalid(bounds => { bounds.meshes.Hand.vertexCount += 1; }, /sphere/);
  invalid(bounds => { bounds.sampling.framesPerSecond = 1; }, /sampling/);
  const duplicate = f.mesh.clone(); duplicate.name = 'Hand'; f.root.add(duplicate);
  assert.throws(() => validateCharacterMotionBounds(f.root, good, HASH), /unique/);
});

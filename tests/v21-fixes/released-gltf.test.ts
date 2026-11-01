import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ReleasedGltfRegistry, serializeCharacterRigContract, type CharacterRigContract, type ReleasedCharacterAssetManifest, type ReleasedGltfDependencies } from '../../src/delivery/art/released-gltf';
import { getCharacterReleaseDecision, REQUIRED_CHARACTER_CHECKS, REQUIRED_CHARACTER_VIEWS, type CharacterReviewManifest } from '../../src/delivery/art/release-gate';
import productionAssets from '../../src/delivery/art/character-assets.json';

const hash = (value: string | ArrayBuffer) => createHash('sha256').update(typeof value === 'string' ? value : new Uint8Array(value)).digest('hex');
const bytes = (json = { asset: { version: '2.0' } }) => {
  const text = JSON.stringify(json), padded = text + ' '.repeat((4 - text.length % 4) % 4), payload = new TextEncoder().encode(padded), buffer = new ArrayBuffer(20 + payload.length), view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true); view.setUint32(12, payload.length, true); view.setUint32(16, 0x4e4f534a, true); new Uint8Array(buffer, 20).set(payload); return buffer;
};
function fixture(glbBytes = bytes()) {
  const contract: CharacterRigContract = { id: 'test-only-pose', sceneName: 'TestActorScene', requireSkin: true, nodes: { leftArm: 'LeftArm', rightArm: 'RightArm', catchPoint: 'PizzaCatch' }, pose: { mode: 'handoff-clip', clipName: 'TakePizza' }, height: { min: 1.7, max: 1.9 }, materialTreatment: 'as-authored' };
  const glbSha = hash(glbBytes), contractPath = 'public/delivery/characters/fixture.rig.json', files = [{ path: 'public/delivery/characters/fixture.glb', sha256: glbSha }, { path: contractPath, sha256: hash(serializeCharacterRigContract(contract)) }], candidate = { assetId: 'synthetic-unit-test-only', sha256: hash(JSON.stringify(files)) };
  const assets: ReleasedCharacterAssetManifest = { schemaVersion: 1, assets: [{ characterId: 'fixture-only', candidate, glb: { url: '/delivery/characters/fixture.glb', sha256: glbSha }, contractPath, contract }] };
  const reviews: CharacterReviewManifest = { schemaVersion: 1, records: [{ characterId: 'fixture-only', name: 'TEST VALIDATOR FIXTURE', film: 'TEST FIXTURE', status: 'approved', candidate, candidateFiles: files, authorId: 'test-artist', reviewerId: 'test-independent-reviewer', reviewedAt: '2026-10-31T10:00:00Z', checks: Object.fromEntries(REQUIRED_CHARACTER_CHECKS.map(check => [check, 'close-match'])), references: [{ id: 'test-film', characterId: 'fixture-only', kind: 'film-still', sourceUrl: 'https://example.com/test-only', publisher: 'fixture', path: 'docs/delivery/character-review/fixture-only.jpg', sha256: 'b'.repeat(64), primarySource: true, visuallyVerified: true, note: 'Synthetic fixture, never production approval.' }], evidence: REQUIRED_CHARACTER_VIEWS.map(view => ({ view, path: `docs/delivery/character-review/fixture-${view}.jpg`, sha256: 'c'.repeat(64), assetSha256: candidate.sha256, comparedReferenceIds: ['test-film'], observedBy: 'test-independent-reviewer' })), feedback: [] }] };
  return { assets, reviews, glbBytes };
}
function authoredScene({ skin = true, catchNode = true, animation = true, sceneName = 'TestActorScene' } = {}) {
  const root = new THREE.Group(); root.name = sceneName;
  const hips = new THREE.Bone(); hips.name = 'Hips'; const left = new THREE.Bone(); left.name = 'LeftArm'; left.position.set(-.4, 1.3, 0); const right = new THREE.Bone(); right.name = 'RightArm'; right.position.set(.4, 1.3, 0); hips.add(left, right); root.add(hips);
  const catchPoint = new THREE.Group(); catchPoint.name = 'PizzaCatch'; catchPoint.position.set(-.3, -.2, .3); if (catchNode) right.add(catchPoint);
  const geometry = new THREE.BoxGeometry(.6, 1.8, .4); geometry.translate(0, .9, 0); const count = geometry.getAttribute('position').count;
  const indices = new Uint16Array(count * 4); const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) { indices[i * 4] = geometry.getAttribute('position').getX(i) < 0 ? 1 : 2; weights[i * 4] = 1; } geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture, metalness: .28, roughness: .73, color: '#987243' });
  const mesh = skin ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material); mesh.name = 'Body'; root.add(mesh); if (mesh instanceof THREE.SkinnedMesh) mesh.bind(new THREE.Skeleton([hips, left, right]));
  const animations = animation ? [new THREE.AnimationClip('TakePizza', 1, [new THREE.NumberKeyframeTrack('LeftArm.rotation[x]', [0, 1], [0, Math.PI / 3])])] : [];
  return { root, geometry, texture, material, mesh, gltf: { scene: root, scenes: [root], animations, cameras: [], asset: { version: '2.0' }, userData: {} } as GLTF };
}
function owned() {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  return { geometries, materials, resources: { geometry: <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; }, material: (_: string, m: THREE.Material) => { materials.add(m); } }, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
function dependencies(f: ReturnType<typeof fixture>, scene = authoredScene()) {
  const calls = { fetch: 0, parse: 0 }; const deps: ReleasedGltfDependencies = { fetchBytes: async () => { calls.fetch++; return f.glbBytes; }, parse: async () => { calls.parse++; return scene.gltf; }, digest: async bytes => hash(bytes) };
  return { calls, deps, scene };
}

test('production assets require independent approval and unapproved characters never fetch or parse', async () => {
  for (const asset of productionAssets.assets as ReleasedCharacterAssetManifest['assets']) assert.equal(getCharacterReleaseDecision(asset.characterId, asset.candidate).allowed, true, 'Only independently approved art can enter the production asset list.');
  const f = fixture(), d = dependencies(f); f.reviews.records[0].status = 'pending';
  const registry = new ReleasedGltfRegistry(f.assets, f.reviews, d.deps), report = await registry.prewarm();
  assert.equal(report.ready.length, 0); assert.equal(report.withheld.length, 1); assert.deepEqual(d.calls, { fetch: 0, parse: 0 });
  assert.equal(registry.create('fixture-only', owned().resources), null);
});

test('wrong download bytes, altered rig metadata and unreviewed external payloads are blocked', async () => {
  const f = fixture(), d = dependencies(f); d.deps.fetchBytes = async () => bytes({ asset: { version: '2.0' }, changed: true } as any);
  let registry = new ReleasedGltfRegistry(f.assets, f.reviews, d.deps), report = await registry.prewarm(); assert.match(report.failed[0].reason, /bytes.*fingerprint/); assert.equal(d.calls.parse, 0);
  const tampered = fixture(), tamperedDeps = dependencies(tampered); tampered.assets.assets[0].contract.nodes.catchPoint = 'OtherCatch'; registry = new ReleasedGltfRegistry(tampered.assets, tampered.reviews, tamperedDeps.deps); report = await registry.prewarm(); assert.match(report.failed[0].reason, /metadata differs/); assert.deepEqual(tamperedDeps.calls, { fetch: 0, parse: 0 });
  const external = fixture(bytes({ asset: { version: '2.0' }, images: [{ uri: 'https://example.com/unreviewed.png' }] } as any)), externalDeps = dependencies(external); report = await new ReleasedGltfRegistry(external.assets, external.reviews, externalDeps.deps).prewarm(); assert.match(report.failed[0].reason, /embed every/); assert.equal(externalDeps.calls.parse, 0);
});

test('missing scene, skeleton, catch anchor or handoff clip never produces a character', async () => {
  for (const [options, reason] of [[{ sceneName: 'WrongScene' }, /named scene/], [{ skin: false }, /skeletal/], [{ catchNode: false }, /PizzaCatch/], [{ animation: false }, /handoff animation/]] as const) {
    const f = fixture(), scene = authoredScene(options), d = dependencies(f, scene); let disposedGeometry = 0, disposedTexture = 0; scene.geometry.addEventListener('dispose', () => disposedGeometry++); scene.texture.addEventListener('dispose', () => disposedTexture++);
    const registry = new ReleasedGltfRegistry(f.assets, f.reviews, d.deps), report = await registry.prewarm(); assert.match(report.failed[0].reason, reason); assert.equal(registry.create('fixture-only', owned().resources), null); assert.equal(disposedGeometry, 1); assert.equal(disposedTexture, 1);
  }
});

test('approved ready clones have independent skeletons, poses and owned materials with shared immutable geometry/textures', async () => {
  const f = fixture(), d = dependencies(f), registry = new ReleasedGltfRegistry(f.assets, f.reviews, d.deps);
  assert.equal(registry.create('fixture-only', owned().resources), null, 'not ready before awaited prewarm');
  const [first, second] = await Promise.all([registry.prewarm(), registry.prewarm()]); assert.deepEqual(first.ready, ['fixture-only']); assert.deepEqual(second.ready, first.ready); assert.deepEqual(d.calls, { fetch: 1, parse: 1 });
  const a = owned(), b = owned(), actorA = registry.create('fixture-only', a.resources)!, actorB = registry.create('fixture-only', b.resources)!;
  assert.notEqual(actorA.leftArm, actorB.leftArm); assert.notEqual(actorA.leftArm, d.scene.root.getObjectByName('LeftArm'));
  actorA.catchPose(.5); assert.ok(actorA.leftArm.rotation.x > .4); assert.equal(Math.abs(actorB.leftArm.rotation.x), 0); assert.equal(Math.abs(d.scene.root.getObjectByName('LeftArm')!.rotation.x), 0);
  const meshA = actorA.group.getObjectByName('Body') as THREE.SkinnedMesh, meshB = actorB.group.getObjectByName('Body') as THREE.SkinnedMesh;
  assert.notEqual(meshA.skeleton, meshB.skeleton); assert.equal(meshA.geometry, meshB.geometry); assert.equal(meshA.geometry, d.scene.geometry); assert.notEqual(meshA.material, meshB.material);
  assert.equal(a.geometries.size, 0); assert.equal(b.geometries.size, 0, 'registry-owned geometry is never registered for module teardown');
  const unchangedPositions = [...d.scene.geometry.getAttribute('position').array];
  const material = meshA.material as THREE.MeshStandardMaterial; assert.equal(material.map, d.scene.texture); assert.equal(material.metalness, .28); assert.equal(material.roughness, .73); assert.equal(material.color.getHex(), d.scene.material.color.getHex(), 'no automatic material or lighting repair');
  const leftVertex = Array.from({ length: meshA.geometry.getAttribute('position').count }, (_, i) => i).find(i => meshA.geometry.getAttribute('skinIndex').getX(i) === 1)!;
  assert.ok(meshA.getVertexPosition(leftVertex, new THREE.Vector3()).distanceTo(meshB.getVertexPosition(leftVertex, new THREE.Vector3())) > .1, 'authored skin deforms independently, not just a detached arm transform');
  assert.deepEqual([...d.scene.geometry.getAttribute('position').array], unchangedPositions, 'independent skeletal poses never rewrite shared vertex attributes');
  actorA.catchPose(NaN); assert.equal(Math.abs(actorA.leftArm.rotation.x), 0);
  let sourceGeometryDisposals = 0, sourceTextureDisposals = 0; d.scene.geometry.addEventListener('dispose', () => sourceGeometryDisposals++); d.scene.texture.addEventListener('dispose', () => sourceTextureDisposals++);
  assert.deepEqual(registry.dispose(), { released: 0, deferred: 1 }); assert.equal(registry.create('fixture-only', owned().resources), null, 'retiring templates cannot spawn new instances');
  a.dispose(); assert.equal(sourceTextureDisposals, 0); assert.equal(registry.diagnostics().liveInstances[0].instances, 1); actorB.catchPose(.75); assert.ok(actorB.leftArm.rotation.x > .6, 'other clone remains functional');
  b.dispose(); assert.equal(sourceGeometryDisposals, 1); assert.equal(sourceTextureDisposals, 1); assert.equal(registry.diagnostics().liveInstances.length, 0); a.dispose(); b.dispose(); assert.equal(sourceTextureDisposals, 1, 'repeated owner cleanup cannot release shared source twice');
});

test('approval revocation and disposal during a pending load remain fail closed', async () => {
  const f = fixture(), d = dependencies(f), registry = new ReleasedGltfRegistry(f.assets, f.reviews, d.deps); await registry.prewarm(); f.reviews.records[0].status = 'rejected'; assert.equal(registry.create('fixture-only', owned().resources), null); registry.dispose();
  const pending = fixture(), pendingDeps = dependencies(pending); let resolveFetch!: (bytes: ArrayBuffer) => void, signalStart!: () => void;
  const started = new Promise<void>(resolve => signalStart = resolve); pendingDeps.deps.fetchBytes = () => { signalStart(); return new Promise(resolve => resolveFetch = resolve); };
  const cancelled = new ReleasedGltfRegistry(pending.assets, pending.reviews, pendingDeps.deps), warming = cancelled.prewarm(); await started; cancelled.dispose(); resolveFetch(pending.glbBytes); const report = await warming; assert.match(report.failed[0].reason, /cancelled/); assert.equal(pendingDeps.calls.parse, 0); assert.equal(cancelled.create('fixture-only', owned().resources), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ReleasedGltfRegistry, serializeCharacterRigContract, type CharacterRigContract, type ReleasedCharacterAssetManifest, type ReleasedGltfDependencies } from '../../src/delivery/art/released-gltf';
import { REQUIRED_CHARACTER_CHECKS, REQUIRED_CHARACTER_VIEWS, type CharacterReviewManifest } from '../../src/delivery/art/release-gate';

const hash = (bytes: string | ArrayBuffer) => createHash('sha256').update(typeof bytes === 'string' ? bytes : new Uint8Array(bytes)).digest('hex');
function glb(identity: string) {
  const json = JSON.stringify({ asset: { version: '2.0' }, extras: { identity } });
  const encoded = new TextEncoder().encode(json + ' '.repeat((4 - json.length % 4) % 4)), bytes = new ArrayBuffer(20 + encoded.length), header = new DataView(bytes);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.byteLength, true); header.setUint32(12, encoded.length, true); header.setUint32(16, 0x4e4f534a, true); new Uint8Array(bytes, 20).set(encoded); return bytes;
}
function scene() {
  const root = new THREE.Group(); root.name = 'FixtureScene';
  for (const name of ['LeftArm', 'RightArm', 'PizzaCatch']) { const node = new THREE.Group(); node.name = name; root.add(node); }
  const geometry = new THREE.BoxGeometry(.6, 1.8, .4); geometry.translate(0, .9, 0);
  const texture = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4); texture.generateMipmaps = false;
  const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0 }); root.add(new THREE.Mesh(geometry, material));
  return { root, geometry, texture, material, gltf: { scene: root, scenes: [root], animations: [], cameras: [], asset: { version: '2.0' }, userData: {} } as GLTF };
}
function fixture(identities = ['one', 'two', 'three']) {
  const assets: ReleasedCharacterAssetManifest = { schemaVersion: 1, assets: [] }, reviews: CharacterReviewManifest = { schemaVersion: 1, records: [] }, payloads = new Map<string, ArrayBuffer>();
  for (const identity of identities) {
    const contract: CharacterRigContract = { id: `fixture-${identity}`, sceneName: 'FixtureScene', requireSkin: false, nodes: { leftArm: 'LeftArm', rightArm: 'RightArm', catchPoint: 'PizzaCatch' }, pose: { mode: 'authored-static' }, height: { min: 1.7, max: 1.9 }, materialTreatment: 'as-authored' };
    const bytes = glb(identity), url = `/delivery/characters/${identity}.glb`, contractPath = `public/delivery/characters/${identity}.rig.json`, files = [{ path: `public${url}`, sha256: hash(bytes) }, { path: contractPath, sha256: hash(serializeCharacterRigContract(contract)) }], candidate = { assetId: `synthetic-test-only-${identity}`, sha256: hash(JSON.stringify(files)) };
    payloads.set(url, bytes); assets.assets.push({ characterId: identity, candidate, glb: { url, sha256: hash(bytes) }, contractPath, contract });
    reviews.records.push({ characterId: identity, name: 'SYNTHETIC TEST ONLY', film: 'SYNTHETIC FIXTURE', status: 'approved', candidate, candidateFiles: files, authorId: 'fixture-artist', reviewerId: 'fixture-independent-reviewer', reviewedAt: '2026-10-31T10:00:00Z', checks: Object.fromEntries(REQUIRED_CHARACTER_CHECKS.map(check => [check, 'close-match'])), references: [{ id: 'fixture-reference', characterId: identity, kind: 'film-still', sourceUrl: 'https://example.com/synthetic-only', publisher: 'test fixture', path: 'docs/delivery/character-review/fixture.jpg', sha256: 'b'.repeat(64), primarySource: true, visuallyVerified: true, note: 'Synthetic validator fixture, never an actual likeness approval.' }], evidence: REQUIRED_CHARACTER_VIEWS.map(view => ({ view, path: `docs/delivery/character-review/fixture-${view}.jpg`, sha256: 'c'.repeat(64), assetSha256: candidate.sha256, comparedReferenceIds: ['fixture-reference'], observedBy: 'fixture-independent-reviewer' })), feedback: [] });
  }
  const fetches: string[] = [], parsed: ReturnType<typeof scene>[] = [];
  const dependencies: ReleasedGltfDependencies = { fetchBytes: async url => { fetches.push(url); return payloads.get(url)!; }, parse: async () => { const value = scene(); parsed.push(value); return value.gltf; }, digest: async value => hash(value) };
  return { assets, reviews, payloads, fetches, parsed, dependencies };
}
function owner() {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  return { resources: { geometry: <T extends THREE.BufferGeometry>(value: T) => (geometries.push(value), value), material: (_: string, value: THREE.Material) => { materials.push(value); } }, dispose() { geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); } };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('overlapping selective requests share per-identity preparation; ready/live assets are not reloaded', async () => {
  const f = fixture(), registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies);
  const [a, b] = await Promise.all([registry.prewarm(['one', 'one']), registry.prewarm(['one', 'two'])]);
  assert.deepEqual(a.ready, ['one']); assert.deepEqual(b.ready, ['one', 'two']); assert.equal(f.fetches.length, 2); assert.equal(f.parsed.length, 2);
  const owned = owner(), actor = registry.create('one', owned.resources); assert.ok(actor);
  assert.deepEqual((await registry.prewarm(['one'])).ready, ['one']); assert.equal(f.fetches.length, 2, 'live ready template reuses approved resources');
  assert.deepEqual((await registry.prewarm([])).ready, []); assert.equal(registry.diagnostics().liveInstances.length, 2);
  f.reviews.records.find(record => record.characterId === 'three')!.status = 'pending';
  assert.equal((await registry.prewarm(['three'])).withheld.length, 1); assert.equal(f.fetches.length, 2, 'pending art never consumes preparation budget');
  assert.match((await registry.prewarm(['unknown'])).failed[0].reason, /No released asset/);
  owned.dispose(); registry.dispose();
});

test('all-assets backward compatibility remains bounded across concurrent requests', async () => {
  const f = fixture(['one', 'two', 'three', 'four', 'five']), releases: (() => void)[] = [];
  let active = 0, peak = 0;
  f.dependencies.fetchBytes = async url => { f.fetches.push(url); active++; peak = Math.max(peak, active); await new Promise<void>(resolve => releases.push(resolve)); active--; return f.payloads.get(url)!; };
  const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies), warming = registry.prewarm(), overlapping = registry.prewarm(['five']);
  await flush(); assert.equal(f.fetches.length, 2); assert.equal(registry.diagnostics().preparation.queued, 3);
  while (f.fetches.length < 5 || active) { releases.splice(0).forEach(release => release()); await flush(); }
  assert.equal((await warming).ready.length, 5); assert.deepEqual((await overlapping).ready, ['five']); assert.equal(peak, 2); assert.equal(f.fetches.length, 5); registry.dispose();
});

test('a selective failure retries without reloading other ready identities', async () => {
  const f = fixture(), original = f.dependencies.fetchBytes; let fail = true;
  f.dependencies.fetchBytes = async (url, signal) => { if (url.includes('one') && fail) { fail = false; throw new Error('temporary offline'); } return original(url, signal); };
  const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies);
  const first = await registry.prewarm(['one', 'two']); assert.match(first.failed[0].reason, /offline/); assert.deepEqual(first.ready, ['two']);
  const next = await registry.prewarm(['one', 'two']); assert.deepEqual(next.ready, ['one', 'two']); assert.equal(next.failed.length, 0); assert.equal(f.fetches.filter(url => url.includes('two')).length, 1); registry.dispose();
});

test('selective retirement preserves live clone textures and leaves unrelated assets ready', async () => {
  const f = fixture(), registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies); await registry.prewarm(['one', 'two']);
  const owned = owner(), actor = registry.create('one', owned.resources)!; assert.ok(actor);
  let disposals = 0; const source = f.parsed[0]; source.texture.addEventListener('dispose', () => disposals++);
  const before = registry.diagnostics().estimatedMemory; assert.ok(before.geometryBytes > 0); assert.equal(before.textureBytes, 2 * 8 * 4 * 4); assert.equal(before.instanceGeometryBytes, 0, 'live actors reuse immutable template buffers'); assert.ok(before.approximateResidentBytes > before.downloadedBytes);
  assert.deepEqual(registry.retainOnly(['two']), { released: 0, deferred: 1 }); assert.equal(registry.create('one', owner().resources), null); assert.equal(disposals, 0);
  assert.deepEqual((await registry.prewarm(['two'])).ready, ['two']); assert.equal(f.fetches.length, 2);
  assert.match((await registry.prewarm(['one'])).failed[0].reason, /instances must finish disposal/);
  owned.dispose(); assert.equal(disposals, 1); assert.equal(registry.diagnostics().estimatedMemory.instanceGeometryBytes, 0);
  assert.equal(registry.diagnostics().liveInstances.length, 1); assert.deepEqual((await registry.prewarm(['one'])).ready, ['one']); assert.equal(f.fetches.length, 3);
  registry.dispose(); assert.equal(registry.diagnostics().estimatedMemory.approximateResidentBytes, 0); assert.equal(disposals, 1);
});

test('retiring queued or parsing identities cannot resurrect stale resources and can retry', async () => {
  const f = fixture(), releases: (() => void)[] = [], signals: AbortSignal[] = [];
  f.dependencies.fetchBytes = async (url, signal) => { f.fetches.push(url); signals.push(signal!); await new Promise<void>(resolve => releases.push(resolve)); return f.payloads.get(url)!; };
  const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies), first = registry.prewarm(['one', 'two', 'three']);
  await flush(); registry.retire(['three', 'one']); assert.equal(signals[0].aborted, true); assert.equal(f.fetches.length, 2, 'queued identity never fetched');
  releases.splice(0).forEach(resolve => resolve()); const result = await first;
  assert.deepEqual(result.ready, ['two']); assert.equal(result.failed.length, 2); assert.ok(result.failed.every(value => /cancelled/.test(value.reason))); assert.equal(registry.diagnostics().liveInstances.length, 1);
  f.dependencies.fetchBytes = async url => (f.fetches.push(url), f.payloads.get(url)!);
  let resolveParse!: (value: GLTF) => void, started!: () => void; const parseStarted = new Promise<void>(resolve => started = resolve), parsed = scene(); let disposed = 0;
  parsed.texture.addEventListener('dispose', () => disposed++); f.dependencies.parse = () => (started(), new Promise(resolve => resolveParse = resolve));
  const stale = registry.prewarm(['one']); await parseStarted; registry.retire(['one']); resolveParse(parsed.gltf);
  assert.match((await stale).failed[0].reason, /cancelled/); assert.equal(disposed, 1); assert.equal(registry.create('one', owner().resources), null);
  f.dependencies.parse = async () => scene().gltf; assert.deepEqual((await registry.prewarm(['one'])).ready, ['one']); registry.dispose();
});

test('asynchronous review revocation or metadata changes remain blocked and dispose parsed assets', async () => {
  for (const change of ['approval', 'metadata'] as const) {
    const f = fixture(['one']), parsed = scene(); let resolve!: (value: GLTF) => void, started!: () => void;
    const entered = new Promise<void>(done => started = done); let disposed = 0; parsed.texture.addEventListener('dispose', () => disposed++);
    f.dependencies.parse = () => (started(), new Promise(done => resolve = done));
    const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies), warming = registry.prewarm(['one']); await entered;
    if (change === 'approval') f.reviews.records[0].status = 'rejected'; else f.assets.assets[0].contract.nodes.catchPoint = 'UnreviewedCatch';
    resolve(parsed.gltf); const report = await warming; assert.equal(report.ready.length, 0); assert.match(report.failed[0].reason, change === 'approval' ? /approval changed/ : /metadata changed/); assert.equal(disposed, 1); assert.equal(registry.create('one', owner().resources), null); registry.dispose();
  }
});

test('GPU preparation borrows exact template resources and retirement waits for every borrow and actor', async () => {
  const f = fixture(['one']), registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies); await registry.prewarm(['one']);
  const source = f.parsed[0], owned = owner(), actor = registry.create('one', owned.resources)!; assert.ok(actor);
  let geometryDisposals = 0, textureDisposals = 0;
  source.geometry.addEventListener('dispose', () => geometryDisposals++); source.texture.addEventListener('dispose', () => textureDisposals++);
  const release: (() => void)[] = []; let started!: () => void; const bothStarted = new Promise<void>(resolve => started = resolve);
  const prepare = async (root: THREE.Group, entry: Readonly<ReleasedCharacterAssetManifest['assets'][number]>) => {
    assert.equal(root, source.root); assert.equal(entry, f.assets.assets[0]);
    const mesh = root.children.find(node => node instanceof THREE.Mesh) as THREE.Mesh;
    assert.equal(mesh.geometry, source.geometry); assert.equal(mesh.material, source.material, 'GPU preparation retains the exact source material/program owner');
    await new Promise<void>(resolve => { release.push(resolve); if (release.length === 2) started(); });
  };
  const a = registry.prepareGpu(['one'], prepare), b = registry.prepareGpu(['one'], prepare); await bothStarted;
  assert.equal(registry.diagnostics().liveInstances[0].gpuBorrows, 2);
  assert.deepEqual(registry.retire(['one']), { released: 0, deferred: 1 }); owned.dispose();
  assert.equal(geometryDisposals, 0); assert.equal(textureDisposals, 0, 'last actor may release before GPU compilation finishes');
  assert.match((await registry.prewarm(['one'])).failed[0].reason, /GPU preparations must finish disposal/);
  release[0](); assert.match((await a).failed[0].reason, /cancelled/); assert.equal(geometryDisposals, 0, 'second borrower still owns shared buffers');
  release[1](); assert.match((await b).failed[0].reason, /cancelled/);
  assert.equal(geometryDisposals, 1); assert.equal(textureDisposals, 1); assert.equal(registry.diagnostics().liveInstances.length, 0);
  assert.deepEqual((await registry.prewarm(['one'])).ready, ['one']); assert.equal(f.fetches.length, 2); registry.dispose();
});

test('failed GPU work releases only the borrow and can retry without downloading again', async () => {
  const f = fixture(['one', 'two']); f.reviews.records[1].status = 'pending';
  const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies); let callbacks = 0;
  const first = await registry.prepareGpu(['one', 'two'], async () => { callbacks++; throw new Error('temporary renderer loss'); });
  assert.equal(callbacks, 1); assert.match(first.failed[0].reason, /renderer loss/); assert.equal(first.withheld.length, 1); assert.equal(registry.diagnostics().liveInstances[0].gpuBorrows, 0);
  const next = await registry.prepareGpu(['one'], async () => { callbacks++; }); assert.deepEqual(next.ready, ['one']); assert.equal(f.fetches.length, 1); assert.equal(callbacks, 2);
  assert.deepEqual(registry.dispose(), { released: 1, deferred: 0 });
});

test('empty mesh material lists cannot bypass the live-instance ownership contract', async () => {
  const f = fixture(['one']), value = scene(); (value.root.children.find(node => node instanceof THREE.Mesh) as THREE.Mesh).material = [];
  f.dependencies.parse = async () => value.gltf; const registry = new ReleasedGltfRegistry(f.assets, f.reviews, f.dependencies), report = await registry.prewarm(['one']);
  assert.match(report.failed[0].reason, /At least one authored mesh material/); assert.equal(registry.create('one', owner().resources), null); registry.dispose();
});

test('meal source classification finishes inside the existing GPU borrow, cancels on retirement and retries before the GPU callback',async()=>{
  const f=fixture(['jessie']);let sourceGeometry:THREE.BufferGeometry|undefined,disposals=0;
  f.dependencies.parse=async()=>{const value=scene(),mesh=value.root.children.find(n=>n instanceof THREE.Mesh)as THREE.Mesh;const dense=new THREE.BoxGeometry(.6,1.8,.4,24,24,24);dense.translate(0,.9,0);mesh.geometry=dense;sourceGeometry=dense;dense.addEventListener('dispose',()=>disposals++);f.parsed.push(value);return value.gltf;};
  const registry=new ReleasedGltfRegistry(f.assets,f.reviews,f.dependencies);await registry.prewarm(['jessie']);let gpuCalls=0;
  const pending=registry.prepareGpu(['jessie'],async()=>{gpuCalls++;});await flush();registry.retire(['jessie']);const cancelled=await pending;assert.equal(cancelled.ready.length,0);assert.match(cancelled.failed[0].reason,/cancelled/);assert.equal(gpuCalls,0,'retired preprocessing cannot enter GPU work');assert.equal(disposals,1,'borrow releases the retired source exactly once');
  const {prepareActorPerformanceGeometry}=await import('../../src/delivery/art/actor-meal-geometry');
  const ready=await registry.prepareGpu(['jessie'],async root=>{gpuCalls++;let uncachedYields=0;await prepareActorPerformanceGeometry(root,()=>true,async()=>{uncachedYields++;});assert.equal(uncachedYields,0,'source classification must finish before GPU callback, not at first visible instance');});
  assert.deepEqual(ready.ready,['jessie']);assert.equal(gpuCalls,1);assert.ok(sourceGeometry);registry.dispose();assert.equal(disposals,2);
});

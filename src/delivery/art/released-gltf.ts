import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { SceneCharacter } from '../modules/character';
import assetManifest from './character-assets.json';
import { CHARACTER_REVIEW_MANIFEST, getCharacterReleaseDecision, type CharacterCandidate, type CharacterReviewManifest } from './release-gate';
import { applyCharacterMotionBounds, validateCharacterMotionBounds, type CharacterMotionBounds } from './motion-bounds';
import { createAuthoredMotionPlayer, validateAuthoredMotions, type AuthoredMotionContract } from './authored-motion';

export interface ReleasedCharacterResources {
  geometry: <T extends THREE.BufferGeometry>(value: T) => T;
  material: (key: string, value: THREE.Material) => void;
}
export interface CharacterRigContract {
  id: string;
  sceneName: string;
  requireSkin: boolean;
  nodes: { leftArm: string; rightArm: string; catchPoint: string; book?: string };
  catchPointSpace?: 'palm-contact'|'box-center';
  pose: { mode: 'authored-static' } | { mode: 'handoff-clip'; clipName: string; upperBodyNodes?: string[] };
  motions?: AuthoredMotionContract;
  motionBounds?: CharacterMotionBounds;
  height: { min: number; max: number };
  materialTreatment: 'as-authored';
}
export interface ReleasedCharacterAsset {
  characterId: string;
  candidate: CharacterCandidate;
  glb: { url: string; sha256: string };
  /** Canonical JSON.stringify(contract) bytes must exist at this reviewed artifact path. */
  contractPath: string;
  contract: CharacterRigContract;
}
export interface ReleasedCharacterAssetManifest { schemaVersion: number; assets: ReleasedCharacterAsset[] }
export interface ReleasedGltfWarmReport {
  ready: string[];
  withheld: { characterId: string; reasons: string[] }[];
  failed: { characterId: string; reason: string }[];
}
export interface ReleasedGltfDependencies {
  fetchBytes: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer>;
  parse: (bytes: ArrayBuffer) => Promise<GLTF>;
  digest: (bytes: ArrayBuffer) => Promise<string>;
}
/** The callback borrows the exact template. Only renderer resource preparation
 * is allowed: never animate, reparent or change authored geometry/materials. */
export type ReleasedGltfGpuPreparation = (root: THREE.Group, entry: Readonly<ReleasedCharacterAsset>) => Promise<void>;
interface Template {
  entry: ReleasedCharacterAsset; root: THREE.Group; animations: THREE.AnimationClip[];
  instances: number; gpuBorrows: number; clearWhenUnused: boolean; entryFingerprint: string;
  memory: { downloadedBytes: number; geometryBytes: number; textureBytes: number; animationBytes: number; instanceGeometryBytes: number; instanceBoneBytes: number };
}
type WarmOutcome = { characterId: string; kind: 'ready' } | { characterId: string; kind: 'withheld'; reasons: string[] } | { characterId: string; kind: 'failed'; reason: string };
interface WarmJob { identity: string; epoch: number; controller: AbortController; started: boolean; settled: boolean; promise: Promise<WarmOutcome>; resolve: (result: WarmOutcome) => void }
const encoder = new TextEncoder();
const validSha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const binary = (value: Uint8Array): ArrayBuffer => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;

/** No normalization, material substitution, pose invention or model repair occurs here. */
export const serializeCharacterRigContract = (contract: CharacterRigContract) => JSON.stringify({
  id: contract.id, sceneName: contract.sceneName, requireSkin: contract.requireSkin,
  nodes: { leftArm: contract.nodes.leftArm, rightArm: contract.nodes.rightArm, catchPoint: contract.nodes.catchPoint, ...(contract.nodes.book ? { book: contract.nodes.book } : {}) },
  ...(contract.catchPointSpace?{catchPointSpace:contract.catchPointSpace}:{}),
  pose: contract.pose.mode === 'handoff-clip' ? { mode: contract.pose.mode, clipName: contract.pose.clipName, ...(contract.pose.upperBodyNodes ? { upperBodyNodes: [...contract.pose.upperBodyNodes] } : {}) } : { mode: contract.pose.mode },
  ...(contract.motions ? { motions: { required: [...contract.motions.required], clips: Object.fromEntries((['idle','walk','dance','read'] as const).filter(mode => contract.motions!.clips[mode]).map(mode => { const clip=contract.motions!.clips[mode]!; return [mode,{clipName:clip.clipName,...(clip.metresPerCycle !== undefined?{metresPerCycle:clip.metresPerCycle}:{})}]; })) } } : {}),
  ...(contract.motionBounds?{motionBounds:contract.motionBounds}:{}),
  height: { min: contract.height.min, max: contract.height.max }, materialTreatment: contract.materialTreatment,
});
const defaultDependencies: ReleasedGltfDependencies = {
  async fetchBytes(url, signal) { const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache', signal }); if (!response.ok) throw new Error(`Character asset HTTP ${response.status}.`); return response.arrayBuffer(); },
  async parse(bytes) { const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'); return new GLTFLoader().parseAsync(bytes, ''); },
  async digest(bytes) { if (!globalThis.crypto?.subtle) throw new Error('Secure asset fingerprint verification is unavailable.'); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join(''); },
};

function disposeRoots(roots: THREE.Object3D[]) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  for (const root of roots) root.traverse(node => { if (node instanceof THREE.Mesh) {
    geometry.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) { if (!(material instanceof THREE.Material)) continue; materials.add(material); for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); }
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
  } });
  const images = new Set<ImageBitmap>();
  textures.forEach(texture => { if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image); });
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); images.forEach(image => image.close()); skeletons.forEach(s => s.dispose());
}
function disposeTemplate(template: Template) { disposeRoots([template.root]); }

/** Estimates, not measured browser/driver memory. Immutable geometry and maps
 * count once per template; instance bone arrays are tracked separately. */
function estimateTemplateMemory(root: THREE.Object3D, animations: THREE.AnimationClip[]) {
  const arrays = new Set<ArrayBufferLike>(), textures = new Set<THREE.Texture>();
  const add = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => arrays.add(attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array.buffer : attribute.array.buffer);
  root.traverse(node => { if (node instanceof THREE.Mesh) {
    Object.values(node.geometry.attributes).forEach(add); if (node.geometry.index) add(node.geometry.index);
    Object.values(node.geometry.morphAttributes).flat().forEach(add);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
  } });
  const animationArrays = new Set<ArrayBufferLike>();
  for (const clip of animations) for (const track of clip.tracks) { animationArrays.add(track.times.buffer); animationArrays.add(track.values.buffer); }
  let textureBytes = 0;
  for (const texture of textures) {
    const dataMips = texture.mipmaps as { data?: ArrayBufferView }[];
    if (dataMips?.length && dataMips.every(mip => mip.data?.byteLength !== undefined)) textureBytes += dataMips.reduce((sum, mip) => sum + mip.data.byteLength, 0);
    else for (const image of Array.isArray(texture.image) ? texture.image : [texture.image]) {
      const width = image?.width ?? image?.videoWidth ?? 0, height = image?.height ?? image?.videoHeight ?? 0;
      if (Number.isFinite(width * height)) textureBytes += Math.ceil(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
    }
  }
  return { downloadedBytes: 0, geometryBytes: [...arrays].reduce((sum, array) => sum + array.byteLength, 0), textureBytes, animationBytes: [...animationArrays].reduce((sum, array) => sum + array.byteLength, 0), instanceGeometryBytes: 0, instanceBoneBytes: 0 };
}

/** GLB is self-contained so an approved file cannot pull unreviewed external images/buffers. */
function assertEmbeddedGlb(bytes: ArrayBuffer) {
  if (bytes.byteLength < 24 || bytes.byteLength > 16 * 1024 * 1024) throw new Error('GLB payload is empty or exceeds the 16 MiB character limit.');
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength || header.getUint32(16, true) !== 0x4e4f534a) throw new Error('Expected a complete binary glTF 2.0 file.');
  const jsonLength = header.getUint32(12, true); if (20 + jsonLength > bytes.byteLength) throw new Error('GLB JSON chunk is truncated.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) if (item.uri && !/^data:/.test(item.uri)) throw new Error('Character GLB must embed every texture and buffer.');
}

function validateTemplate(gltf: GLTF, entry: ReleasedCharacterAsset): Template {
  const contract = entry.contract, roots = gltf.scenes.filter(scene => scene.name === contract.sceneName);
  if (roots.length !== 1) throw new Error(`Required named scene is missing or ambiguous: ${contract.sceneName}.`);
  const root = roots[0], names = Object.values(contract.nodes).filter(Boolean), nodeByName = new Map<string, THREE.Object3D>();
  if (new Set(names).size !== names.length) throw new Error('Arm and catch node names must be distinct.');
  for (const name of names) { const matches: THREE.Object3D[] = []; root.traverse(node => { if (node.name === name) matches.push(node); }); if (matches.length !== 1) throw new Error(`Required rig node is missing or ambiguous: ${name}.`); nodeByName.set(name, matches[0]); }
  let meshes = 0, skins = 0, materialCount = 0; const boundBones = new Set<THREE.Bone>();
  root.traverse(node => { if (node instanceof THREE.Mesh) { meshes++; for (const material of Array.isArray(node.material) ? node.material : [node.material]) { if (!(material instanceof THREE.Material)) throw new Error('Authored mesh material is missing or invalid.'); materialCount++; } if (node instanceof THREE.SkinnedMesh && node.skeleton?.bones.length) { skins++; node.skeleton.bones.forEach(bone => boundBones.add(bone)); } } });
  if (!meshes || (contract.requireSkin && !skins)) throw new Error('The reviewed skeletal character rig is missing.');
  if (!materialCount) throw new Error('At least one authored mesh material is required for safe instance ownership.');
  for (const name of [contract.nodes.leftArm, contract.nodes.rightArm]) if (nodeByName.get(name) instanceof THREE.Mesh) throw new Error('Arm anchors must be authored bones or transform nodes, not replacement geometry.');
  if (contract.requireSkin && [contract.nodes.leftArm, contract.nodes.rightArm].some(name => !boundBones.has(nodeByName.get(name) as THREE.Bone))) throw new Error('Required arm bones are not bound to the authored skeletal rig.');
  const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(height) || height < contract.height.min || height > contract.height.max) throw new Error('Authored model units or upright height do not meet the reviewed contract.');
  const pose = contract.pose;
  if (pose.mode === 'handoff-clip') {
    const clips = gltf.animations.filter(clip => clip.name === pose.clipName);
    if (clips.length !== 1 || !Number.isFinite(clips[0].duration) || clips[0].duration <= 0 || !clips[0].tracks.length) throw new Error('Required authored handoff animation is missing or invalid.');
    for (const track of clips[0].tracks) {
      const target = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      if (target && target !== root.name && !root.getObjectByName(target) && !root.getObjectByProperty('uuid', target)) throw new Error(`Handoff animation targets an absent node: ${target}.`);
    }
  }
  if(contract.motionBounds)validateCharacterMotionBounds(root,contract.motionBounds,entry.glb.sha256);
  validateAuthoredMotions(root, gltf.animations, contract.motions, pose.mode === 'handoff-clip' ? pose : undefined);
  return { entry, root, animations: gltf.animations, instances: 0, gpuBorrows: 0, clearWhenUnused: false, entryFingerprint: JSON.stringify(entry), memory: estimateTemplateMemory(root, gltf.animations) };
}

export class ReleasedGltfRegistry {
  private templates = new Map<string, Template>();
  private jobs = new Map<string, WarmJob>();
  private queue: WarmJob[] = [];
  private active = new Set<WarmJob>();
  private epochs = new Map<string, number>();
  private outcomes = new Map<string, WarmOutcome>();
  private readonly maxConcurrent = 2;
  // JSON imports widen three-component sphere centers to number[]. Their tuple
  // lengths, finite bounds and exact artifact hashes are checked before use.
  constructor(private manifest: ReleasedCharacterAssetManifest = assetManifest as unknown as ReleasedCharacterAssetManifest, private reviews: CharacterReviewManifest = CHARACTER_REVIEW_MANIFEST, private dependencies: ReleasedGltfDependencies = defaultDependencies) {}

  async prewarm(identities?: readonly string[]): Promise<ReleasedGltfWarmReport> {
    if (this.manifest.schemaVersion !== 1 || !Array.isArray(this.manifest.assets)) return { ready: [], withheld: [], failed: [{ characterId: '*', reason: 'Unsupported character asset manifest.' }] };
    const requested = [...new Set(identities ?? this.manifest.assets.map(entry => entry.characterId))];
    return this.toReport(await Promise.all(requested.map(identity => this.schedule(identity))));
  }
  private toReport(outcomes: WarmOutcome[]): ReleasedGltfWarmReport {
    return { ready: outcomes.filter(outcome => outcome.kind === 'ready').map(outcome => outcome.characterId), withheld: outcomes.filter((outcome): outcome is Extract<WarmOutcome, { kind: 'withheld' }> => outcome.kind === 'withheld').map(({ characterId, reasons }) => ({ characterId, reasons: [...reasons] })), failed: outcomes.filter((outcome): outcome is Extract<WarmOutcome, { kind: 'failed' }> => outcome.kind === 'failed').map(({ characterId, reason }) => ({ characterId, reason })) };
  }
  private schedule(identity: string): Promise<WarmOutcome> {
    const existing = this.jobs.get(identity); if (existing) return existing.promise;
    let resolve!: WarmJob['resolve']; const promise = new Promise<WarmOutcome>(done => resolve = done);
    const job: WarmJob = { identity, epoch: this.epochs.get(identity) ?? 0, controller: new AbortController(), started: false, settled: false, promise, resolve };
    this.jobs.set(identity, job); this.queue.push(job); this.pump(); return promise;
  }
  private current(job: WarmJob) { return !job.controller.signal.aborted && job.epoch === (this.epochs.get(job.identity) ?? 0) && this.jobs.get(job.identity) === job; }
  private finish(job: WarmJob, outcome: WarmOutcome) {
    if (job.settled) return;
    if (!this.current(job) && outcome.kind !== 'failed') outcome = { characterId: job.identity, kind: 'failed', reason: 'Character preparation was cancelled.' };
    if (this.current(job)) this.outcomes.set(job.identity, outcome);
    job.settled = true; if (this.jobs.get(job.identity) === job) this.jobs.delete(job.identity); job.resolve(outcome);
  }
  private pump() {
    while (this.active.size < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift()!; if (job.settled) continue;
      job.started = true; this.active.add(job);
      void this.warm(job).then(outcome => this.finish(job, outcome), error => this.finish(job, { characterId: job.identity, kind: 'failed', reason: error instanceof Error ? error.message : 'Character asset preparation failed.' })).finally(() => { this.active.delete(job); this.pump(); });
    }
  }
  private async warm(job: WarmJob): Promise<WarmOutcome> {
      const identity = job.identity;
      const entries = this.manifest.assets.filter(asset => asset.characterId === identity);
      if (entries.length !== 1) return { characterId: identity, kind: 'failed', reason: entries.length ? 'Duplicate identity asset entries are forbidden.' : 'No released asset is registered for this identity.' };
      const entry = entries[0], entryFingerprint = JSON.stringify(entry);
      const decision = getCharacterReleaseDecision(entry.characterId, entry.candidate, this.reviews);
      if (!decision.allowed) return { characterId: identity, kind: 'withheld', reasons: decision.reasons };
      let parsed: GLTF | undefined;
      try {
        const assertCurrent = () => { if (!this.current(job)) throw new Error('Character preparation was cancelled.'); if (JSON.stringify(entry) !== entryFingerprint) throw new Error('Character metadata changed during preparation.'); };
        assertCurrent();
        const previous = this.templates.get(identity);
        if (previous && !previous.clearWhenUnused && previous.entryFingerprint === JSON.stringify(entry)) return { characterId: identity, kind: 'ready' };
        if (previous?.instances) throw new Error('Previous character instances must finish disposal before preparing a new template.');
        if (previous?.gpuBorrows) throw new Error('Previous GPU preparations must finish disposal before preparing a new template.');
        if (previous) { disposeTemplate(previous); this.templates.delete(identity); }
        if (!/^\/delivery\/characters\/[a-zA-Z0-9_./-]+\.glb$/.test(entry.glb.url) || entry.glb.url.includes('..') || !validSha(entry.glb.sha256)) throw new Error('Expected a fingerprinted same-origin character GLB.');
        const contract = entry.contract;
        if (contract?.catchPointSpace!==undefined&&!['palm-contact','box-center'].includes(contract.catchPointSpace))throw new Error('Unknown reviewed catch-point coordinate convention.');
        if (!contract?.id || !contract.sceneName || !contract.nodes?.leftArm || !contract.nodes?.rightArm || !contract.nodes?.catchPoint || contract.materialTreatment !== 'as-authored' || typeof contract.requireSkin !== 'boolean' || !['authored-static', 'handoff-clip'].includes(contract.pose?.mode) || !Number.isFinite(contract.height?.min) || !Number.isFinite(contract.height?.max) || contract.height.min <= 0 || contract.height.max < contract.height.min) throw new Error('A complete reviewed scene, rig, pose and material contract is required.');
        const record = this.reviews.records.find(record => record.characterId === entry.characterId && record.candidate?.assetId === entry.candidate.assetId && record.candidate.sha256 === entry.candidate.sha256)!;
        const files = record.candidateFiles ?? [];
        const contractHash = await this.dependencies.digest(binary(encoder.encode(serializeCharacterRigContract(contract))));
        if (!files.some(file => file.path === `public${entry.glb.url}` && file.sha256 === entry.glb.sha256) || !files.some(file => file.path === entry.contractPath && file.sha256 === contractHash)) throw new Error('GLB or rig/pose metadata differs from the independently reviewed artifact bundle.');
        const candidateHash = await this.dependencies.digest(binary(encoder.encode(JSON.stringify(files))));
        if (candidateHash !== entry.candidate.sha256) throw new Error('Reviewed candidate bundle fingerprint is inconsistent.');
        assertCurrent();
        const bytes = await this.dependencies.fetchBytes(entry.glb.url, job.controller.signal);
        if (await this.dependencies.digest(bytes) !== entry.glb.sha256) throw new Error('Downloaded GLB bytes do not match the reviewed fingerprint.');
        assertCurrent(); assertEmbeddedGlb(bytes); parsed = await this.dependencies.parse(bytes); assertCurrent();
        // A review may be revoked while the network/parser is running.
        if (!getCharacterReleaseDecision(identity, entry.candidate, this.reviews).allowed) throw new Error('Character approval changed during preparation.');
        const template = validateTemplate(parsed, entry); template.memory.downloadedBytes = bytes.byteLength; this.templates.set(identity, template); parsed = undefined;
        return { characterId: identity, kind: 'ready' };
      } catch (error) {
        if (parsed) disposeRoots(parsed.scenes);
        return { characterId: identity, kind: 'failed', reason: !this.current(job) ? 'Character preparation was cancelled.' : error instanceof Error ? error.message : 'Character asset preparation failed.' };
      }
  }

  /** Prepare real renderer programs/textures while keeping their exact source
   * materials resident. Renderer-key deduplication belongs to the renderer's
   * wrapper; this registry has no renderer or camera ownership. */
  async prepareGpu(identities: readonly string[], prepare: ReleasedGltfGpuPreparation): Promise<ReleasedGltfWarmReport> {
    const loaded = await this.prewarm(identities), ready: string[] = [], failed = [...loaded.failed];
    for (const identity of loaded.ready) {
      const template = this.templates.get(identity);
      if (!template || template.clearWhenUnused || !getCharacterReleaseDecision(identity, template.entry.candidate, this.reviews).allowed) { failed.push({ characterId: identity, reason: 'Character GPU preparation was cancelled.' }); continue; }
      template.gpuBorrows++;
      try {
        await prepare(template.root, template.entry);
        if (template.clearWhenUnused || this.templates.get(identity) !== template) throw new Error('Character GPU preparation was cancelled.');
        if (template.entryFingerprint !== JSON.stringify(template.entry) || !getCharacterReleaseDecision(identity, template.entry.candidate, this.reviews).allowed) throw new Error('Character metadata or approval changed during GPU preparation.');
        ready.push(identity);
      } catch (error) { failed.push({ characterId: identity, reason: error instanceof Error ? error.message : 'Character GPU preparation failed.' }); }
      finally { template.gpuBorrows--; this.collectRetired(identity, template); }
    }
    return { ready, withheld: loaded.withheld, failed };
  }

  private collectRetired(identity: string, template: Template) {
    if (!template.clearWhenUnused || template.instances || template.gpuBorrows) return;
    disposeTemplate(template); if (this.templates.get(identity) === template) this.templates.delete(identity);
  }

  create(identity: string, resources: ReleasedCharacterResources): SceneCharacter | null {
    const template = this.templates.get(identity);
    if (!template || template.clearWhenUnused || template.entryFingerprint !== JSON.stringify(template.entry) || !getCharacterReleaseDecision(identity, template.entry.candidate, this.reviews).allowed) return null;
    const group = cloneSkeleton(template.root) as THREE.Group, materialCopies = new Map<THREE.Material, THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
    if(template.entry.contract.motionBounds)applyCharacterMotionBounds(group,template.entry.contract.motionBounds,template.entry.glb.sha256);
    group.traverse(node => { if (node instanceof THREE.Mesh) {
      // SkeletonUtils clones bones and bind state, while geometry remains an
      // immutable registry-owned buffer shared by templates and every actor.
      const cloneMaterial = (source: THREE.Material) => { let material = materialCopies.get(source); if (!material) { material = source.clone(); materialCopies.set(source, material); } return material; };
      node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    } });
    const nodes = template.entry.contract.nodes, leftArm = group.getObjectByName(nodes.leftArm)! as THREE.Group, rightArm = group.getObjectByName(nodes.rightArm)! as THREE.Group, catchPoint = group.getObjectByName(nodes.catchPoint)!;
    const pose = template.entry.contract.pose;
    const motion = createAuthoredMotionPlayer(group, template.animations, template.entry.contract.motions, pose.mode === 'handoff-clip' ? pose : undefined);
    const instanceBoneBytes = [...skeletons].reduce((sum, skeleton) => sum + skeleton.boneMatrices.byteLength, 0);
    let remaining = materialCopies.size, released = false;
    template.instances++; template.memory.instanceBoneBytes += instanceBoneBytes;
    const releasePart = () => { if (released || --remaining > 0) return; released = true; motion.dispose(); skeletons.forEach(skeleton => skeleton.dispose()); template.instances--; template.memory.instanceBoneBytes -= instanceBoneBytes; this.collectRetired(identity, template); };
    const watch = (resource: THREE.Material) => { let disposed = false; resource.addEventListener('dispose', () => { if (!disposed) { disposed = true; releasePart(); } }); };
    for (const material of materialCopies.values()) watch(material);
    try { for (const [index, material] of [...materialCopies.values()].entries()) resources.material(`released-${identity}-${group.uuid}-${index}`, material); }
    catch (error) { materialCopies.forEach(m => m.dispose()); throw error; }
    group.userData.releasedCharacter = { identity, candidate: { ...template.entry.candidate }, poseContract: template.entry.contract.id };
    const result: SceneCharacter = {
      group, leftArm, rightArm, catchPoint, catchPointSpace:template.entry.contract.catchPointSpace??'palm-contact', book: nodes.book ? group.getObjectByName(nodes.book) : undefined,
      catchPose(amount) { if (!released) motion.catchPose(amount); },
      animate: motion.animate ? (dt, mode, speed) => { if (!released) motion.animate!(dt, mode, speed); } : undefined,
    };
    result.catchPose(0); return result;
  }

  /** Cancellation is per identity. Live clones keep shared geometry/textures
   * until all owned cloned-material resources have actually been released. */
  retire(identities: readonly string[]): { released: number; deferred: number } {
    let released = 0, deferred = 0;
    for (const identity of new Set(identities)) {
      this.epochs.set(identity, (this.epochs.get(identity) ?? 0) + 1); this.outcomes.delete(identity);
      const job = this.jobs.get(identity);
      if (job) { job.controller.abort(); this.jobs.delete(identity); if (!job.started) this.finish(job, { characterId: identity, kind: 'failed', reason: 'Character preparation was cancelled.' }); }
      const template = this.templates.get(identity); if (!template) continue;
      if (template.instances || template.gpuBorrows) { template.clearWhenUnused = true; deferred++; }
      else { disposeTemplate(template); this.templates.delete(identity); released++; }
    }
    this.queue = this.queue.filter(job => !job.settled); this.pump(); return { released, deferred };
  }
  retainOnly(identities: readonly string[]) {
    const retained = new Set(identities);
    return this.retire([...new Set([...this.templates.keys(), ...this.jobs.keys(), ...this.outcomes.keys()])].filter(identity => !retained.has(identity)));
  }
  dispose(): { released: number; deferred: number } { return this.retire([...new Set([...this.templates.keys(), ...this.jobs.keys(), ...this.outcomes.keys()])]); }
  diagnostics() {
    const memory = [...this.templates.values()].reduce((sum, template) => {
      for (const key of Object.keys(sum) as (keyof typeof sum)[]) sum[key] += template.memory[key]; return sum;
    }, { downloadedBytes: 0, geometryBytes: 0, textureBytes: 0, animationBytes: 0, instanceGeometryBytes: 0, instanceBoneBytes: 0 });
    const geometryBuffers = memory.geometryBytes + memory.instanceGeometryBytes;
    return { ...this.toReport([...this.outcomes.values()]),
      liveInstances: [...this.templates].map(([characterId, template]) => ({ characterId, instances: template.instances, gpuBorrows: template.gpuBorrows, retiring: template.clearWhenUnused })),
      preparation: { active: this.active.size, queued: this.queue.filter(job => !job.settled).length, limit: this.maxConcurrent, identities: [...this.jobs].map(([characterId, job]) => ({ characterId, state: job.started ? 'loading' as const : 'queued' as const })) },
      estimatedMemory: { ...memory, approximateGpuBytes: geometryBuffers + memory.textureBytes, approximateResidentBytes: geometryBuffers * 2 + memory.textureBytes * 2 + memory.animationBytes + memory.instanceBoneBytes,
        note: 'Estimates count typed geometry/animation buffers, RGBA texture dimensions/mips and instance bone arrays. Resident estimate assumes CPU and GPU copies; excludes driver, material, decoder and object overhead. Downloaded GLB bytes are transfer size, not retained memory.' },
    };
  }
}

const releasedRegistry = new ReleasedGltfRegistry();
export const prewarmReleasedGltfAssets = (identities?: readonly string[]) => releasedRegistry.prewarm(identities);
export const prepareReleasedGltfGpu = (identities: readonly string[], prepare: ReleasedGltfGpuPreparation) => releasedRegistry.prepareGpu(identities, prepare);
export const createReleasedGltfCharacter = (identity: string, resources: ReleasedCharacterResources) => releasedRegistry.create(identity, resources);
export const disposeReleasedGltfAssets = () => releasedRegistry.dispose();
export const retireReleasedGltfAssets = (identities: readonly string[]) => releasedRegistry.retire(identities);
export const retainReleasedGltfAssets = (identities: readonly string[]) => releasedRegistry.retainOnly(identities);
export const releasedGltfAssetDiagnostics = () => releasedRegistry.diagnostics();

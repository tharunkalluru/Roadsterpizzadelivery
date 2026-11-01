import * as THREE from 'three';

export interface CharacterMotionSphere {
  vertexCount: number;
  center: [number, number, number];
  radius: number;
}
/** Exported offline for these exact model bytes. No vertex scan runs in play. */
export interface CharacterMotionBounds {
  schemaVersion: 1;
  glbSha256: string;
  sceneName: string;
  sampling: {
    framesPerSecond: number;
    marginMetres: number;
    poseCount: number;
    clips: { name: string; duration: number; samples: number }[];
    maskedHandoff?: { clipName: string; upperBodyNodes: string[]; fractions: number[]; baseFramesPerSecond: number };
  };
  meshes: Record<string, CharacterMotionSphere>;
}

const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Validate the complete graph before changing any instance sphere. The caller
 * must already have verified the GLB bytes against expectedGlbSha256. Metadata
 * is part of the reviewed rig contract, not a substitute for that verification.
 * These bounds cover the exported sampled clips/overlays plus their margin;
 * new animations or transforms need a fresh bake and visual review.
 */
export function validateCharacterMotionBounds(root: THREE.Object3D, bounds: CharacterMotionBounds, expectedGlbSha256: string) {
  if (!bounds || bounds.schemaVersion !== 1 || !sha(expectedGlbSha256) || bounds.glbSha256 !== expectedGlbSha256)
    throw new Error('Character motion bounds do not match the verified GLB.');
  if (!bounds.sceneName || root.name !== bounds.sceneName) throw new Error('Character motion bounds have a different named scene.');
  const sampling = bounds.sampling;
  if (!sampling || !finite(sampling.framesPerSecond) || sampling.framesPerSecond < 12 || sampling.framesPerSecond > 60 ||
      !finite(sampling.marginMetres) || sampling.marginMetres < .005 || sampling.marginMetres > .25 ||
      !Number.isSafeInteger(sampling.poseCount) || sampling.poseCount < 1 || !Array.isArray(sampling.clips))
    throw new Error('Character motion-bound sampling metadata is invalid.');
  const clips = new Set<string>();
  for (const clip of sampling.clips) {
    if (!clip?.name || clips.has(clip.name) || !finite(clip.duration) || clip.duration <= 0 || !Number.isSafeInteger(clip.samples) || clip.samples < 2)
      throw new Error('Character motion-bound animation coverage is invalid.');
    clips.add(clip.name);
  }
  if (sampling.maskedHandoff) {
    const overlay = sampling.maskedHandoff;
    if (!clips.has(overlay.clipName) || !Array.isArray(overlay.upperBodyNodes) || !overlay.upperBodyNodes.length ||
        new Set(overlay.upperBodyNodes).size !== overlay.upperBodyNodes.length || overlay.upperBodyNodes.some(name => typeof name !== 'string' || !root.getObjectByName(name)) ||
        !finite(overlay.baseFramesPerSecond) || overlay.baseFramesPerSecond < 12 || overlay.baseFramesPerSecond > 60 ||
        !Array.isArray(overlay.fractions) || !overlay.fractions.includes(0) || !overlay.fractions.includes(1) || overlay.fractions.some(value => !finite(value) || value < 0 || value > 1))
      throw new Error('Character motion-bound handoff coverage is invalid.');
  }
  if (!bounds.meshes || typeof bounds.meshes !== 'object' || Array.isArray(bounds.meshes)) throw new Error('Character motion bounds need named mesh spheres.');
  const nodes = new Map<string, THREE.SkinnedMesh>();
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    if (!node.name || nodes.has(node.name)) throw new Error('Character motion bounds require unique named skinned meshes.');
    nodes.set(node.name, node);
  });
  if (!nodes.size || Object.keys(bounds.meshes).length !== nodes.size) throw new Error('Character motion bounds must cover the exact skinned mesh graph.');
  for (const [name, node] of nodes) {
    const sphere = Object.hasOwn(bounds.meshes, name) ? bounds.meshes[name] : undefined;
    if (!sphere || !Number.isSafeInteger(sphere.vertexCount) || sphere.vertexCount !== node.geometry.getAttribute('position')?.count ||
        !Array.isArray(sphere.center) || sphere.center.length !== 3 || sphere.center.some(value => !finite(value) || Math.abs(value) > 50) ||
        !finite(sphere.radius) || sphere.radius < sampling.marginMetres || sphere.radius > 10)
      throw new Error(`Character motion sphere is missing or invalid: ${name}.`);
  }
  return nodes;
}

/** Run once on each SkeletonUtils clone, before its first draw. Every clone
 * owns its sphere, while all immutable geometry/index/texture buffers stay
 * shared. Three then uses this local sphere through the normal world transform
 * and camera frustum test. Neither global culling nor skinning is disabled.
 */
export function applyCharacterMotionBounds(root: THREE.Object3D, bounds: CharacterMotionBounds, expectedGlbSha256: string): number {
  const nodes = validateCharacterMotionBounds(root, bounds, expectedGlbSha256);
  for (const [name, node] of nodes) {
    const sphere = bounds.meshes[name];
    node.boundingSphere = new THREE.Sphere(new THREE.Vector3(...sphere.center), sphere.radius);
  }
  return nodes.size;
}

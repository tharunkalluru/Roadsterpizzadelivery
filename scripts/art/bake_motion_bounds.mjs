#!/usr/bin/env node
/** Offline CPU-only authored-skin bounds. The PNGs are deliberately not decoded:
 * a geometry-only ImageBitmap stub lets the real GLTFLoader load embedded GLB
 * structure without a DOM/GPU. Source buffers, textures and materials are never
 * edited. This is sampled coverage with a safety margin, not a visual approval
 * or a mathematical bound on arbitrary new animations.
 *
 * node scripts/art/bake_motion_bounds.mjs --input actor.glb --rig actor.rig.json
 *   --output new-motion-bounds.json [--fps 24] [--margin 0.02]
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function sampleTimes(clip, fps) {
  const times = new Set([0, clip.duration]);
  for (let frame = 1; frame < Math.ceil(clip.duration * fps); frame++) times.add(Math.min(clip.duration, frame / fps));
  for (const track of clip.tracks) for (const time of track.times) {
    if (!Number.isFinite(time) || time < 0 || time > clip.duration + 1e-5) throw new Error(`Invalid keyframe time in ${clip.name}.`);
    times.add(Math.min(time, clip.duration));
  }
  return [...times].sort((a, b) => a - b);
}

/** getVertexPosition includes Three's actual morph and bind-weighted bone
 * transform. It returns mesh-local positions, so later sphere/frustum transforms
 * use exactly the same coordinate space as SkinnedMesh.computeBoundingSphere.
 */
export function bakeMotionBounds(root, clips, glbSha256, contract, { fps = 24, margin = .02, overlayFps = 12, fractions = [0, .25, .5, .75, 1] } = {}) {
  if (!Number.isFinite(fps) || fps < 12 || fps > 60 || !Number.isFinite(margin) || margin < .005 || margin > .25) throw new Error('Use 12–60 fps and a .005–.25 metre margin.');
  if (!Number.isFinite(overlayFps) || overlayFps < 12 || overlayFps > 60 || !Array.isArray(fractions) || !fractions.includes(0) || !fractions.includes(1) || fractions.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid masked-handoff sampling settings.');
  if (!root.name || root.name !== contract.sceneName) throw new Error('The reviewed named scene does not match the GLB.');
  if (!/^[a-f0-9]{64}$/.test(glbSha256)) throw new Error('A complete GLB SHA-256 is required.');
  const meshes = new Map(), clipsByName = new Map(), point = new THREE.Vector3();
  for (const clip of clips) {
    if (!clip.name || clipsByName.has(clip.name) || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error('Animations require unique names and finite positive durations.');
    clipsByName.set(clip.name, clip);
  }
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    if (!node.name || meshes.has(node.name) || !node.geometry.getAttribute('position')?.count) throw new Error('Skinned meshes need unique names and populated positions.');
    meshes.set(node.name, { node, box: new THREE.Box3(), vertexCount: node.geometry.getAttribute('position').count });
  });
  if (!meshes.size) throw new Error('No authored skinned meshes were found.');
  const original = [];
  root.traverse(node => original.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), morph: node.morphTargetInfluences?.slice() }));
  const reset = () => {
    for (const entry of original) {
      entry.node.position.copy(entry.position); entry.node.quaternion.copy(entry.quaternion); entry.node.scale.copy(entry.scale);
      if (entry.morph) entry.node.morphTargetInfluences.splice(0, entry.morph.length, ...entry.morph);
    }
    root.updateMatrixWorld(true);
  };
  let poseCount = 0, verticesMeasured = 0;
  const measure = () => {
    root.updateMatrixWorld(true);
    for (const value of meshes.values()) for (let i = 0; i < value.vertexCount; i++) {
      value.node.getVertexPosition(i, point);
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`Invalid skinned vertex in ${value.node.name}.`);
      value.box.expandByPoint(point);
      verticesMeasured++;
    }
    poseCount++;
  };
  const bakeClip = (clip, times) => {
    reset();
    const mixer = new THREE.AnimationMixer(root), action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; action.play(); action.paused = true;
    try { for (const time of times) { action.time = time; mixer.update(0); measure(); } }
    finally { mixer.stopAllAction(); mixer.uncacheRoot(root); }
  };
  const coverage = [];
  try {
    reset(); measure();
    for (const clip of clips) { const times = sampleTimes(clip, fps); bakeClip(clip, times); coverage.push({ name: clip.name, duration: clip.duration, samples: times.length }); }
    const handoff = contract.pose?.mode === 'handoff-clip' ? contract.pose : undefined;
    let maskedHandoff;
    if (handoff && contract.motions) {
      const catchClip = clipsByName.get(handoff.clipName), mask = handoff.upperBodyNodes;
      if (!catchClip || !Array.isArray(mask) || !mask.length || new Set(mask).size !== mask.length || mask.some(name => !root.getObjectByName(name))) throw new Error('The authored handoff mask is missing or invalid.');
      const nodeName = track => THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      if (catchClip.tracks.some(track => !mask.includes(nodeName(track)))) throw new Error('The handoff clip animates outside its reviewed mask.');
      const bases = [...new Set(Object.values(contract.motions.clips).map(value => value.clipName))].map(name => {
        const clip = clipsByName.get(name); if (!clip) throw new Error(`Required base motion is missing: ${name}.`); return clip;
      });
      // The scene samples TakePizza independently from a still-running Read,
      // Walk or Dance clock. Include those real masked combinations as well as
      // each standalone clip; otherwise a raised hand on a seated torso can
      // escape bounds measured on a standing full-body TakePizza pose alone.
      for (const base of bases) {
        reset();
        const mixer = new THREE.AnimationMixer(root);
        const lower = new THREE.AnimationClip(`${base.name}:bounds-base`, base.duration, base.tracks.filter(track => !mask.includes(nodeName(track))));
        const baseAction = mixer.clipAction(lower).setLoop(THREE.LoopOnce, 1), catchAction = mixer.clipAction(catchClip).setLoop(THREE.LoopOnce, 1);
        for (const action of [baseAction, catchAction]) { action.clampWhenFinished = true; action.play(); action.paused = true; }
        const catchTimes = new Set(fractions.map(fraction => fraction * catchClip.duration));
        for (const track of catchClip.tracks) for (const time of track.times) catchTimes.add(time);
        try { for (const time of sampleTimes(base, overlayFps)) for (const catchTime of catchTimes) { baseAction.time = time; catchAction.time = catchTime; mixer.update(0); measure(); } }
        finally { mixer.stopAllAction(); mixer.uncacheRoot(root); }
      }
      maskedHandoff = { clipName: handoff.clipName, upperBodyNodes: [...mask], fractions: [...fractions], baseFramesPerSecond: overlayFps };
    }
    const spheres = Object.create(null);
    for (const [name, value] of meshes) {
      // The sphere encloses the union AABB of every measured pose, not just the
      // average hand/body position or a stale first-frame geometry bound.
      const sphere = value.box.getBoundingSphere(new THREE.Sphere()); sphere.radius += margin;
      spheres[name] = { vertexCount: value.vertexCount, center: sphere.center.toArray(), radius: sphere.radius };
    }
    return {
      bounds: { schemaVersion: 1, glbSha256, sceneName: root.name, sampling: { framesPerSecond: fps, marginMetres: margin, poseCount, clips: coverage, ...(maskedHandoff ? { maskedHandoff } : {}) }, meshes: spheres },
      diagnostics: { poseCount, verticesMeasured, skinnedMeshes: meshes.size, note: 'Offline sampled deformation coverage plus margin. Includes rest, exact animation keyframes, 24 fps by default, clip endpoints and masked catch/base combinations. No GPU, visual acceptance or performance claim.' },
    };
  } finally { reset(); }
}

/** A separate validation grid deliberately samples between bake frames and at
 * unrelated base/catch phases. It does not enlarge a failed sphere silently.
 * It is additional measured coverage, not a proof over every continuous pose.
 */
export function validateMotionBoundsSamples(root, clips, bounds, contract) {
  const original = [], meshes = [], point = new THREE.Vector3();
  root.traverse(node => {
    original.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), morph: node.morphTargetInfluences?.slice() });
    if (node instanceof THREE.SkinnedMesh) {
      const data = bounds.meshes[node.name];
      if (!data || data.vertexCount !== node.geometry.getAttribute('position')?.count) throw new Error(`Validation mesh does not match bounds: ${node.name}.`);
      meshes.push({ node, sphere: new THREE.Sphere(new THREE.Vector3(...data.center), data.radius), count: data.vertexCount });
    }
  });
  const reset = () => { for (const entry of original) { entry.node.position.copy(entry.position); entry.node.quaternion.copy(entry.quaternion); entry.node.scale.copy(entry.scale); if (entry.morph) entry.node.morphTargetInfluences.splice(0, entry.morph.length, ...entry.morph); } root.updateMatrixWorld(true); };
  let poses = 0, vertices = 0, maximumRadiusFraction = 0;
  const verify = () => {
    root.updateMatrixWorld(true);
    for (const { node, sphere, count } of meshes) for (let i = 0; i < count; i++) {
      node.getVertexPosition(i, point);
      const fraction = point.distanceTo(sphere.center) / sphere.radius;
      if (!Number.isFinite(fraction) || fraction > 1 + 1e-6) throw new Error(`Independent motion-bound validation failed for ${node.name}, vertex ${i}.`);
      maximumRadiusFraction = Math.max(maximumRadiusFraction, fraction); vertices++;
    }
    poses++;
  };
  const start = (mixer, clip) => { const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); action.paused = true; return action; };
  try {
    for (const clip of clips) {
      reset(); const mixer = new THREE.AnimationMixer(root), action = start(mixer, clip);
      try { for (let frame = .5; frame < clip.duration * bounds.sampling.framesPerSecond; frame++) { action.time = frame / bounds.sampling.framesPerSecond; mixer.update(0); verify(); } }
      finally { mixer.stopAllAction(); mixer.uncacheRoot(root); }
    }
    const overlay = bounds.sampling.maskedHandoff;
    if (overlay) {
      const catchClip = clips.find(clip => clip.name === overlay.clipName), mask = overlay.upperBodyNodes;
      for (const name of new Set(Object.values(contract.motions.clips).map(value => value.clipName))) {
        reset(); const base = clips.find(clip => clip.name === name), mixer = new THREE.AnimationMixer(root);
        const lower = new THREE.AnimationClip(`${base.name}:validation-base`, base.duration, base.tracks.filter(track => !mask.includes(THREE.PropertyBinding.parseTrackName(track.name).nodeName)));
        const baseAction = start(mixer, lower), catchAction = start(mixer, catchClip);
        try { for (const phase of [.173, .491, .837]) for (const catchPhase of [.13, .57, .89]) { baseAction.time = base.duration * phase; catchAction.time = catchClip.duration * catchPhase; mixer.update(0); verify(); } }
        finally { mixer.stopAllAction(); mixer.uncacheRoot(root); }
      }
    }
    return { poses, vertices, maximumRadiusFraction, grid: 'Half-frame offsets plus independent base/catch phases; no failed sphere is enlarged.' };
  } finally { reset(); }
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--rig', '--output', '--fps', '--margin'].includes(args[i]) || !args[i + 1]) throw new Error('Expected --input, --rig, --output and optional --fps / --margin pairs.');
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.input || !options.rig || !options.output) throw new Error('Provide --input actor.glb --rig actor.rig.json --output NEW-motion-bounds.json.');
  const input = resolve(options.input), output = resolve(options.output), bytes = await readFile(input);
  // Reject external payloads before invoking the normal loader.
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24 || header.getUint32(0, true) !== 0x46546c67 || header.getUint32(8, true) !== bytes.length || header.getUint32(16, true) !== 0x4e4f534a) throw new Error('Expected a complete embedded binary glTF 2.0 file.');
  const json = JSON.parse(bytes.subarray(20, 20 + header.getUint32(12, true)).toString());
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw new Error('Offline bounds require self-contained GLB resources.');
  globalThis.self ??= globalThis;
  globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const contract = JSON.parse(await readFile(resolve(options.rig), 'utf8'));
  const roots = gltf.scenes.filter(scene => scene.name === contract.sceneName);
  if (roots.length !== 1) throw new Error('Required authored scene is missing or ambiguous.');
  const started = performance.now(), sha = createHash('sha256').update(bytes).digest('hex');
  const result = bakeMotionBounds(roots[0], gltf.animations, sha, contract, { fps: options.fps === undefined ? 24 : Number(options.fps), margin: options.margin === undefined ? .02 : Number(options.margin) });
  const validation = validateMotionBoundsSamples(roots[0], gltf.animations, result.bounds, contract);
  await writeFile(output, JSON.stringify(result.bounds, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ input, output, glbSha256: sha, seconds: (performance.now() - started) / 1000, ...result.diagnostics, validation }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

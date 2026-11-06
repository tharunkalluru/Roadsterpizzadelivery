import * as THREE from 'three';
import type { CharacterMotion } from '../modules/character';

export interface AuthoredMotionClip { clipName: string; metresPerCycle?: number }
export interface AuthoredMotionContract {
  required: CharacterMotion[];
  clips: Partial<Record<CharacterMotion, AuthoredMotionClip>>;
}
export interface HandoffClipContract { clipName: string; upperBodyNodes?: string[] }
const MODES: readonly CharacterMotion[] = ['idle', 'walk', 'dance', 'read'];
const nodeName = (track: THREE.KeyframeTrack) => THREE.PropertyBinding.parseTrackName(track.name).nodeName;

/** Validate authored animation, rather than silently substituting a body bob. */
export function validateAuthoredMotions(root: THREE.Object3D, clips: THREE.AnimationClip[], motion?: AuthoredMotionContract, handoff?: HandoffClipContract) {
  const validateClip = (name: string) => {
    const matches = clips.filter(clip => clip.name === name), clip = matches[0];
    if (matches.length !== 1 || !Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.tracks.length) throw new Error(`Required authored animation is missing or invalid: ${name}.`);
    for (const track of clip.tracks) {
      const target = nodeName(track);
      if (!target || !root.getObjectByName(target) && !root.getObjectByProperty('uuid', target)) throw new Error(`Animation targets an absent node: ${target}.`);
      if (Array.from(track.values).some(value => !Number.isFinite(value))) throw new Error('Authored animation contains non-finite keyframes.');
    }
    return clip;
  };
  const catchClip = handoff ? validateClip(handoff.clipName) : null;
  if (!motion) return;
  if (!Array.isArray(motion.required) || !motion.required.length || new Set(motion.required).size !== motion.required.length || motion.required.some(mode => !MODES.includes(mode))) throw new Error('Authored motion requirements must be explicit and unique.');
  for (const mode of motion.required) if (!motion.clips?.[mode]) throw new Error(`Required authored ${mode} motion is not declared.`);
  for (const [mode, entry] of Object.entries(motion.clips ?? {})) {
    if (!MODES.includes(mode as CharacterMotion) || !entry?.clipName) throw new Error('Unknown or incomplete authored motion.');
    const clip = validateClip(entry.clipName);
    if (mode === 'walk' && (!Number.isFinite(entry.metresPerCycle) || entry.metresPerCycle! <= 0)) throw new Error('Walking needs an authored stride distance.');
    for (const track of clip.tracks) if ((nodeName(track) === root.name || nodeName(track) === root.uuid) && /\.(position|quaternion|rotation)(\[|$)/.test(track.name)) throw new Error('Scene motion must be in place; the scene owns world movement.');
  }
  if (catchClip) {
    const mask = handoff!.upperBodyNodes;
    if (!Array.isArray(mask) || !mask.length || new Set(mask).size !== mask.length || mask.some(name => !name || !root.getObjectByName(name))) throw new Error('Locomotion handoff requires a reviewed upper-body mask.');
    if (catchClip.tracks.some(track => !mask.includes(nodeName(track)))) throw new Error('Handoff animation leaves its reviewed upper-body mask.');
  }
}

/** One mixer clock. Sampling a catch never rewinds the leg gait or another actor. */
export function createAuthoredMotionPlayer(root: THREE.Group, clips: THREE.AnimationClip[], motion?: AuthoredMotionContract, handoff?: HandoffClipContract) {
  const mixer = new THREE.AnimationMixer(root), actions = new Map<string, THREE.AnimationAction>();
  const handoffClip = handoff && clips.find(clip => clip.name === handoff.clipName);
  const catchAction = handoffClip ? mixer.clipAction(handoffClip).setLoop(THREE.LoopOnce, 1) : null;
  if (catchAction) { catchAction.clampWhenFinished = true; catchAction.play(); catchAction.paused = true; catchAction.enabled = false; }
  let active: THREE.AnimationAction | null = null, mode: CharacterMotion | null = null, catching = false, disposed = false;
  const telemetry = { motion: 'idle' as CharacterMotion, clip: '', time: 0, rate: 1, catching: false };
  root.userData.authoredMotion = telemetry;
  const select = (requested: CharacterMotion, rate: number, masked: boolean) => {
    const entry = motion?.clips[requested]; if (!entry) return;
    const key = `${requested}:${masked ? 'lower' : 'full'}`;
    let next = actions.get(key);
    if (!next) {
      const source = clips.find(clip => clip.name === entry.clipName)!;
      const tracks = masked ? source.tracks.filter(track => !handoff?.upperBodyNodes?.includes(nodeName(track))) : source.tracks;
      const clip = new THREE.AnimationClip(`${source.name}:${key}`, source.duration, tracks);
      next = mixer.clipAction(clip); next.setLoop(THREE.LoopRepeat, Infinity); actions.set(key, next);
    }
    if (next !== active) {
      const previous = active, preservePhase = requested === mode;
      next.reset().play();
      if (preservePhase && previous) { next.time = previous.time; previous.stop(); }
      else if (previous) next.crossFadeFrom(previous, .15, false);
      active = next; mode = requested;
    }
    active.setEffectiveTimeScale(rate);
    telemetry.motion = requested; telemetry.clip = entry.clipName; telemetry.rate = rate;
  };
  const animate = (dt: number, requested: CharacterMotion, speed = 1) => {
    if (disposed || !motion) return;
    const chosen = motion.clips[requested] ? requested : 'idle', entry = motion.clips[chosen];
    if (!entry) return;
    const clip = clips.find(clip => clip.name === entry.clipName)!;
    const rate = chosen === 'walk' ? Math.max(0, Math.min(3, Math.abs(Number.isFinite(speed) ? speed : 0) * clip.duration / entry.metresPerCycle!)) : 1;
    select(chosen, rate, catching);
    mixer.update(Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0);
    telemetry.time = active?.time ?? 0; root.updateMatrixWorld(true);
  };
  const catchPose = (amount: number) => {
    if (disposed || !catchAction) return;
    const value = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0, nextCatching = value > 0;
    if (catching !== nextCatching) { catching = nextCatching; if (active && mode) select(mode, active.getEffectiveTimeScale(), catching); }
    catchAction.enabled = nextCatching; catchAction.time = catchAction.getClip().duration * value;
    catchAction.paused = true; telemetry.catching = nextCatching;
    mixer.update(0); root.updateMatrixWorld(true);
  };
  return { animate: motion ? animate : undefined, catchPose, dispose() { if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(root); } };
}

// Synthetic actual-module diagnostics. No browser, phone, renderer or FPS benchmark.
// Run with the archived optimization checkout, not the restored Version 21 game/.
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const option = name => { const at = argv.indexOf(name); if (at < 0) return null; if (!argv[at + 1] || argv[at + 1].startsWith('--')) throw new Error(`Missing value for ${name}`); return argv[at + 1]; };
for (let i = 0; i < argv.length; i += 2) if (!['--source', '--out'].includes(argv[i])) throw new Error(`Unknown option ${argv[i]}`);
const source = resolve(option('--source') || '/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit');
const destination = option('--out');
const requireSource = createRequire(join(source, 'package.json'));
const { build } = requireSource('esbuild');
const sources = ['src/game/game.ts', 'src/core/performance-monitor.ts', 'src/core/refresh-policy.ts', 'src/game/presentation.ts', 'src/game/player.ts'];
const sourceSha256 = Object.fromEntries(sources.map(name => [name, createHash('sha256').update(readFileSync(join(source, name))).digest('hex')]));
const bundle = await build({
  stdin: { contents: `export {Game} from './src/game/game.ts'; export {RefreshPolicy} from './src/core/refresh-policy.ts'; export {PresentationPacer,FixedStepClock} from './src/core/performance-monitor.ts'; export * as THREE from 'three';`, resolveDir: source },
  bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false, logLevel: 'silent',
});
const { Game, RefreshPolicy, PresentationPacer, FixedStepClock, THREE: T } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

function cadenceRun(callbackHz, cpuMs) {
  const policy = new RefreshPolicy(60), pacer = new PresentationPacer();
  let presentedFrames = 0, lastPresentationAt = 0, timeMs = 0, lastFPS = null;
  const decisions = [];
  for (let i = 0; i < callbackHz * 25; i++) {
    timeMs += 1000 / callbackHz;
    const state = policy.state;
    const presented = pacer.due(1 / callbackHz, state.effectiveFPS, true, state.callbackDivisor);
    if (presented) presentedFrames++;
    policy.observe({ rafMs: 1000 / callbackHz, cpuMs, presented, presentationMs: presented && lastPresentationAt ? timeMs - lastPresentationAt : null, active: true });
    if (presented) lastPresentationAt = timeMs;
    if (lastFPS !== policy.state.effectiveFPS) {
      decisions.push({ atSyntheticSeconds: timeMs / 1000, effectiveFPS: policy.state.effectiveFPS, reason: policy.state.reason });
      lastFPS = policy.state.effectiveFPS;
    }
  }
  return { callbackHz, suppliedSyntheticCPUMs: cpuMs, requestedFPS: 60, syntheticDurationSeconds: 25, scheduledPresentationRate: presentedFrames / 25, final: policy.snapshot(), decisions };
}

function cameraRun(callbackHz, callbacksPerPresentation, usePresentationElapsed) {
  const game = Object.create(Game.prototype), speed = 160 / 3.6;
  Object.assign(game, {
    player: { group: new T.Object3D(), pos: new T.Vector3(0, 12, 0), forward: { x: 0, z: -1 }, placementRevision: 1, lastSupport: 0, speed, flying: true, descending: false, jumping: false, takeoffAnimating: false, bump: 0 },
    cameraPlacementRevision: 1, camPos: new T.Vector3(), camLook: new T.Vector3(), cameraPivot: new T.Vector3(), cameraDesired: new T.Vector3(), cameraTarget: new T.Vector3(), sunTarget: new T.Vector3(),
    orbitYaw: 0, orbitPitch: .38, orbitDist: 0, dragging: false,
    engine: { camera: new T.PerspectiveCamera(), placeSun() {} }, traffic: { hideNear() {} }, city: { signs: { update() {} } },
    clearCamera(_from, to) { return to; }, insideSolid() { return false; }, placeLampLights() {},
  });
  for (let i = 1; i <= callbackHz * 20; i++) {
    game.player.pos.set(0, 12, -speed * i / callbackHz); game.player.group.position.copy(game.player.pos);
    if (i % callbacksPerPresentation === 0) game.updateCamera((usePresentationElapsed ? callbacksPerPresentation : 1) / callbackHz);
  }
  return { cameraZ: game.camPos.z, playerZ: game.player.pos.z, cameraToPlayerOffsetMetres: game.camPos.z - game.player.pos.z };
}

const camera = [[60, 1], [120, 2], [120, 3], [90, 2]].map(([callbackHz, divisor]) => ({
  callbackHz, scheduledFPS: callbackHz / divisor, flightSpeedKmH: 160, durationSeconds: 20,
  currentCallerDT: cameraRun(callbackHz, divisor, false), presentationElapsedDT: cameraRun(callbackHz, divisor, true),
}));
const clock = new FixedStepClock(); let ticks = 0;
for (let i = 0; i < 10; i++) ticks += clock.advance(.1, true);
const results = {
  generatedAt: new Date().toISOString(), sourceCheckout: source,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), sourceSha256,
  scope: 'Synthetic unmodified-module policy schedules and actual Game.updateCamera with unobstructed environment doubles. No real browser input, device, renderer, CPU benchmark, measured FPS, thermal or battery evidence.',
  cadence: [60, 90, 120].flatMap(hz => [10, 15.1, 20].map(cpu => cadenceRun(hz, cpu))),
  camera,
  catchUp: {
    suppliedSeconds: 1, callbacks: 10, callbackIntervalSeconds: .1, executedSimulationSteps: ticks,
    simulatedSeconds: ticks * clock.step, droppedSeconds: clock.droppedSeconds,
    stepsForOneCallback: [1 / 60, 1 / 30, .05, 1 / 15, .1].map(dt => { const c = new FixedStepClock(); return { suppliedDTSeconds: dt, version23WholeSimulationCalls: c.advance(dt, true), version21WholeSimulationCalls: 1, version21ClampedDTSeconds: Math.min(dt, .05) }; }),
    interpretation: 'Version 23 can execute several complete player/traffic/world/walker updates in one callback. This is a source-level workload count, not a measured slowdown; its catch-up cap also deliberately drops elapsed time under severe load.',
  },
  visualHierarchyRisk: {
    sourceConfirmed: true, browserReproduction: false,
    description: 'Game.presentationObjects interpolates the player root/glow/light but not kickflipPivot, wheels, deployed thrusters or gas; Player updates those children at the current fixed tick. Parent and children therefore do not share the same presentation timestamp.',
  },
};
if (destination) {
  const path = resolve(destination); mkdirSync(dirname(path), { recursive: true });
  // Do not overwrite an earlier original probe result.
  writeFileSync(path, JSON.stringify(results, null, 2) + '\n', { flag: 'wx' });
  console.log(path);
} else console.log(JSON.stringify(results, null, 2));

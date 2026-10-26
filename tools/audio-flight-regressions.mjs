import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

// These are offline production-code regressions. Simulated elapsed flight time is
// not browser play, and the audio protocol fake cannot prove audible device output.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'roadster-audio-flight-'));
const originals = new Map(['window', 'document', 'addEventListener', 'performance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };

class Param {
  events = []; _value = 0;
  get value() { return this._value; }
  set value(value) { assert.ok(Number.isFinite(value), `non-finite audio value: ${value}`); this._value = value; }
  event(method, value, time, extra) {
    assert.ok(Number.isFinite(time), `non-finite audio time: ${time}`);
    if (value !== undefined) this.value = value;
    if (extra !== undefined) assert.ok(Number.isFinite(extra));
    this.events.push({ method, value, time, extra });
  }
  cancelScheduledValues(time) { this.event('cancel', undefined, time); }
  setTargetAtTime(value, time, constant) { this.event('target', value, time, constant); }
  setValueAtTime(value, time) { this.event('set', value, time); }
  linearRampToValueAtTime(value, time) { this.event('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { assert.ok(value > 0); this.event('exponential', value, time); }
}

class AudioNode {
  connections = []; disconnected = false;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class Voice extends AudioNode {
  frequency = new Param(); starts = []; stops = []; type = 'sine';
  start(time = 0) { this.starts.push(time); }
  stop(time = 0) { assert.ok(time >= this.starts.at(-1)); this.stops.push(time); }
  finish() { this.onended?.(); }
}

class FakeAudioContext {
  static instances = []; static nextState = 'running';
  state = FakeAudioContext.nextState; currentTime = 0; sampleRate = 1000;
  destination = new AudioNode(); nodes = []; oscillators = []; sources = []; resumeCalls = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  add(node) { this.nodes.push(node); return node; }
  createGain() { const node = new AudioNode(); node.gain = new Param(); return this.add(node); }
  createBiquadFilter() { const node = new AudioNode(); node.frequency = new Param(); node.Q = new Param(); return this.add(node); }
  createOscillator() { const node = this.add(new Voice()); this.oscillators.push(node); return node; }
  createStereoPanner() { const node = new AudioNode(); node.pan = new Param(); return this.add(node); }
  createBuffer(channels, length) { assert.equal(channels, 1); return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const node = this.add(new Voice()); this.sources.push(node); return node; }
  resume() { this.resumeCalls++; return new Promise(resolve => { this.resolveResume = resolve; }); }
  async completeResume() { this.state = 'running'; this.resolveResume?.(); await Promise.resolve(); }
  automationCount() { return this.nodes.reduce((sum, node) => sum + Object.values(node).filter(value => value instanceof Param).reduce((n, param) => n + param.events.length, 0), 0); }
}

let nowMs = 0;
function audioFixture(Sound, initialState = 'running') {
  const listeners = new Map(), documentListeners = new Map();
  const on = (map, name, callback) => { const list = map.get(name) || []; list.push(callback); map.set(name, list); };
  const document = { hidden: false, addEventListener: (name, callback) => on(documentListeners, name, callback) };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { AudioContext: FakeAudioContext } },
    document: { configurable: true, value: document },
    addEventListener: { configurable: true, value: (name, callback) => on(listeners, name, callback) },
    performance: { configurable: true, value: { now: () => nowMs } },
  });
  FakeAudioContext.nextState = initialState; nowMs = 0;
  const sound = new Sound();
  return {
    sound, document,
    emit: name => { for (const callback of listeners.get(name) || []) callback(); },
    visibility: hidden => { document.hidden = hidden; for (const callback of documentListeners.get('visibilitychange') || []) callback(); },
  };
}

function vehicleNodes(context) {
  const motor = context.oscillators[0], motorFilter = motor.connections[0], motorGain = motorFilter.connections[0];
  const thrustGain = context.sources[0].connections[0].connections[0];
  return { motor, motorFilter, motorGain, thrustGain };
}

try {
  await build({
    stdin: { contents: "export { Player } from './src/game/player'; export { Sound } from './src/game/audio'; export { Vector3, Group } from 'three';", resolveDir: join(root, 'game'), loader: 'ts' },
    outfile: join(output, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
  });
  const { Player, Sound, Vector3, Group } = await import(pathToFileURL(join(output, 'production.mjs')));
  const input = { throttle: 0, brake: 0, steer: 0, boost: false, flyPressed: false };
  const playerFixture = () => Object.assign(Object.create(Player.prototype), {
    city: { surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map() },
    pos: new Vector3(0, 0.55, 0), yaw: 0, speed: 0, vy: 0, steerVis: 0,
    flying: false, descending: false, charge: 0, chargeCap: 20, earnT: 0,
    onRoad: true, lastSupport: 0, lastKind: 'road', lastElevRoad: false, lastEdge: null,
    hitCooldown: 0, bump: 0, flyAlt: 24, altT: 0, kerbT: 0, glide: null, placementRevision: 0,
    group: new Group(), glow: new Group(), light: new Group(), wheels: [], wheelRollers: [], animateThrusters() {},
  });

  await test('road speed is capped at 150 km/h with either boost setting; flight caps at 240 km/h', () => {
    for (const boost of [false, true]) {
      const player = playerFixture();
      for (let n = 0; n < 1800; n++) player.update(1 / 60, { ...input, throttle: 1, boost }, n / 60);
      assert.ok(Math.abs(player.speed * 3.6 - 150) < 1e-8);
    }
    const player = playerFixture(); player.flying = true;
    for (let n = 0; n < 1800; n++) player.update(1 / 60, { ...input, throttle: 1 }, n / 60);
    assert.ok(Math.abs(player.speed * 3.6 - 240) < 1e-8);
    player.update(1 / 60, { ...input, throttle: 1, flyPressed: true }, 31);
    assert.ok(player.speed * 3.6 <= 150 + 1e-8, 'landing never carries flight-only speed onto the road');
  });

  await test('both front wheels steer toward the actual forward turn; rear wheels stay straight', () => {
    for (const steer of [-1, 1]) {
      const player = playerFixture(); player.speed = 10; player.wheels = Array.from({ length: 4 }, () => new Group());
      player.update(1 / 30, { ...input, throttle: 1, steer }, 0);
      assert.equal(Math.sign(player.wheels[0].rotation.y), Math.sign(player.yaw));
      assert.equal(player.wheels[0].rotation.y, player.wheels[1].rotation.y);
      assert.equal(player.wheels[2].rotation.y, 0); assert.equal(player.wheels[3].rotation.y, 0);
      const wheelForwardX = -Math.sin(player.wheels[0].rotation.y);
      assert.equal(Math.sign(wheelForwardX), Math.sign(player.pos.x));
    }
  });

  await test('zero-charge takeoff and 20 simulated minutes of unlimited flight', () => {
    const player = playerFixture(), dt = 1 / 60;
    player.update(dt, { ...input, flyPressed: true }, 0);
    assert.equal(player.flying, true); assert.equal(player.descending, false); assert.ok(player.pos.y > 0.55);
    for (let frame = 1; frame <= 20 * 60 * 60; frame++) player.update(dt, input, frame * dt);
    assert.equal(player.flying, true, 'flight must not expire'); assert.equal(player.descending, false);
    assert.equal(player.charge, 0); assert.ok(Math.abs(player.pos.y - 24) < 0.01); assert.ok(Number.isFinite(player.pos.y));
    player.update(dt, { ...input, flyPressed: true }, 1200 + dt);
    assert.equal(player.flying, false); assert.equal(player.descending, true);
    for (let frame = 1; frame <= 20 * 60; frame++) player.update(dt, input, 1200 + frame * dt);
    assert.equal(player.descending, false, 'explicit landing must finish'); assert.equal(player.pos.y, 0.55); assert.equal(player.vy, 0);
    player.update(dt, { ...input, flyPressed: true }, 1221);
    assert.equal(player.flying, true, 'landed player can take off again with zero charge');
  });

  await test('gesture unlock is lazy and does not duplicate persistent vehicle voices', () => {
    const before = FakeAudioContext.instances.length, fixture = audioFixture(Sound), sound = fixture.sound;
    assert.equal(sound.ctx, null); assert.equal(FakeAudioContext.instances.length, before);
    fixture.emit('touchend'); assert.ok(sound.ctx); assert.equal(FakeAudioContext.instances.length, before + 1);
    const context = sound.ctx, voices = context.oscillators.length;
    for (const gesture of ['pointerdown', 'keydown', 'click', 'touchend']) fixture.emit(gesture);
    assert.equal(sound.ctx, context); assert.equal(context.oscillators.length, voices); assert.equal(context.sources.length, 1);
    assert.equal(context.oscillators[0].starts.length, 1); assert.equal(context.sources[0].loop, true);
  });

  await test('engine and thrust follow driving, flight, descent and pause without automation flood', () => {
    const { sound } = audioFixture(Sound); sound.unlock();
    const context = sound.ctx, nodes = vehicleNodes(context);
    const driving = { speed: 22, throttle: 1, flying: false, active: true };
    sound.vehicle(driving);
    assert.ok(nodes.motorGain.gain.value > 0); assert.equal(nodes.thrustGain.gain.value, 0);
    assert.ok(nodes.motor.frequency.value > 55); assert.ok(nodes.motorFilter.frequency.value > 450);
    const automation = context.automationCount();
    for (let frame = 0; frame < 20 * 60 * 60; frame++) { context.currentTime += 1 / 60; sound.vehicle(driving); }
    assert.equal(context.automationCount(), automation, 'steady frames must reuse automation targets');
    sound.vehicle({ ...driving, flying: true });
    assert.equal(nodes.motorGain.gain.value, 0); assert.ok(nodes.thrustGain.gain.value > 0);
    const flightGain = nodes.thrustGain.gain.value, flightAutomation = context.automationCount();
    for (let frame = 0; frame < 20 * 60 * 60; frame++) sound.vehicle({ ...driving, flying: true });
    assert.equal(context.automationCount(), flightAutomation);
    sound.vehicle({ ...driving, flying: false, descending: true });
    assert.ok(nodes.thrustGain.gain.value > 0 && nodes.thrustGain.gain.value < flightGain);
    sound.vehicle({ ...driving, active: false });
    assert.equal(nodes.motorGain.gain.value, 0); assert.equal(nodes.thrustGain.gain.value, 0);
    sound.vehicle({ ...driving, speed: Infinity, throttle: NaN });
    assert.ok(Number.isFinite(nodes.motor.frequency.value));
    sound.vehicle({ ...driving, speed: -1e20, throttle: 1e20 });
    assert.ok(nodes.motor.frequency.value < 300); assert.ok(nodes.motorGain.gain.value < 0.2);
  });

  await test('mute, blur, visibility and pagehide silence audio and resume cleanly', () => {
    const fixture = audioFixture(Sound), sound = fixture.sound; sound.setMuted(true); fixture.emit('click');
    const context = sound.ctx, nodes = vehicleNodes(context), driving = { speed: 20, throttle: 1, flying: false, active: true };
    assert.equal(sound.master.gain.value, 0); sound.cue('accept'); sound.horn('car', 0);
    assert.equal(context.oscillators.length, 1);
    sound.setMuted(false); assert.ok(sound.master.gain.value > 0); sound.vehicle(driving);
    fixture.emit('blur'); assert.equal(sound.master.gain.value, 0); assert.equal(nodes.motorGain.gain.value, 0);
    sound.vehicle(driving); sound.cue('pickup'); sound.horn('car', 0); assert.equal(nodes.motorGain.gain.value, 0); assert.equal(context.oscillators.length, 1);
    fixture.emit('focus'); sound.vehicle(driving); assert.ok(sound.master.gain.value > 0); assert.ok(nodes.motorGain.gain.value > 0);
    fixture.visibility(true); sound.vehicle(driving); sound.cue('delivery');
    assert.equal(sound.master.gain.value, 0); assert.equal(nodes.motorGain.gain.value, 0); assert.equal(context.oscillators.length, 1);
    fixture.visibility(false); sound.vehicle(driving); assert.ok(nodes.motorGain.gain.value > 0);
    fixture.emit('pagehide'); assert.equal(sound.master.gain.value, 0); assert.equal(nodes.motorGain.gain.value, 0);
  });

  await test('interrupted audio resumes once and plays only a fresh queued cue', async () => {
    const { sound } = audioFixture(Sound, 'interrupted'); sound.unlock();
    const context = sound.ctx; sound.cue('accept'); sound.unlock(); sound.unlock();
    assert.equal(context.resumeCalls, 1); assert.equal(context.oscillators.length, 1);
    nowMs = 500; await context.completeResume();
    assert.ok(context.oscillators.length > 1, 'a fresh accepted-order cue survives audio resume');
    const count = context.oscillators.length; sound.unlock(); assert.equal(context.oscillators.length, count);
    context.state = 'suspended'; sound.unlock(); sound.cue('delivery'); nowMs += 1500;
    await context.completeResume(); assert.equal(context.oscillators.length, count, 'stale cues should not replay after a long interruption');
    context.state = 'suspended'; sound.unlock(); sound.cue('pickup'); sound.setMuted(true); await context.completeResume();
    assert.equal(context.oscillators.length, count, 'muting cancels a pending cue');
  });

  await test('closed context recreation rebuilds voices and reapplies current vehicle state', () => {
    const { sound } = audioFixture(Sound); sound.unlock();
    const state = { speed: 10, throttle: 1, flying: true, active: true }; sound.vehicle(state);
    const old = sound.ctx; old.state = 'closed'; sound.unlock();
    assert.notEqual(sound.ctx, old); sound.vehicle(state);
    const nodes = vehicleNodes(sound.ctx); assert.equal(nodes.motorGain.gain.value, 0); assert.ok(nodes.thrustGain.gain.value > 0);
    assert.ok(nodes.motor.frequency.events.length > 0, 'recreated voice must receive an automation target');
  });

  await test('all gameplay cues schedule finite notes, throttle repeats and free transient nodes', () => {
    const { sound } = audioFixture(Sound); sound.unlock(); const context = sound.ctx;
    for (const kind of ['start', 'offer', 'accept', 'pickup', 'delivery', 'flight', 'lease', 'bump', 'error']) {
      const before = context.oscillators.length; sound.cue(kind); assert.ok(context.oscillators.length > before, kind);
      const count = context.oscillators.length; sound.cue(kind); assert.equal(context.oscillators.length, count, `${kind} repeats are throttled`);
      for (const voice of context.oscillators.slice(before)) {
        assert.equal(voice.starts.length, 1); assert.equal(voice.stops.length, 1);
        assert.ok(voice.stops[0] > voice.starts[0]); voice.finish();
        assert.equal(voice.disconnected, true); assert.equal(voice.connections[0].disconnected, true);
      }
      context.currentTime += 1;
    }
    sound.cue('bump'); const count = context.oscillators.length; context.currentTime += 0.2; sound.cue('bump');
    assert.equal(context.oscillators.length, count); context.currentTime += 0.3; sound.cue('bump'); assert.ok(context.oscillators.length > count);
  });

  await test('distant traffic does not suppress nearby horn and double-horn nodes are released', () => {
    const { sound } = audioFixture(Sound); sound.unlock(); const context = sound.ctx;
    sound.horn('car', 500); assert.equal(context.oscillators.length, 1);
    sound.horn('auto', 5, 5, true); assert.equal(context.oscillators.length, 5);
    const voices = context.oscillators.slice(1), filter = voices[0].connections[0], gain = filter.connections[0], panner = gain.connections[0];
    assert.equal(panner.pan.value, 1); voices[0].finish(); assert.equal(filter.disconnected, false);
    for (const voice of voices.slice(1)) voice.finish();
    for (const node of [...voices, filter, gain, panner]) assert.equal(node.disconnected, true);
  });

  console.log(`Audio/flight regressions: ${passed} passed (offline production-code tests).`);
} finally {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  await rm(output, { recursive: true, force: true });
}

// Exercise production UI handlers with a small DOM seam; real mobile layout is tested separately.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const temp = mkdtempSync(path.join(tmpdir(), 'roadster-v2-ui-'));
const saved = Object.fromEntries(['document', 'addEventListener', 'ResizeObserver', 'matchMedia', 'localStorage', 'window', 'screen'].map((key) => [key, globalThis[key]]));
let checks = 0;
const test = async (label, run) => { await run(); checks++; console.log(`PASS ${label}`); };
class Events {
  events = new Map();
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(fn); }
  emit(type, values = {}) {
    const event = { pointerId: 1, clientX: 0, clientY: 0, button: 0, isPrimary: true, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
    for (const fn of [...this.events.get(type) || []]) fn(event);
    return event;
  }
}
class Element extends Events {
  constructor(id = '') {
    super(); this.id = id; this.nodes = new Map(); this.attributes = new Map(); this.hidden = false; this.dataset = {}; this.style = { values: new Map(), setProperty(key, value) { this.values.set(key, value); } }; this.captures = new Set(); this.clientWidth = 100;
    const classes = new Set(); this.classList = { add: (value) => classes.add(value), remove: (value) => classes.delete(value), contains: (value) => classes.has(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } };
  }
  set innerHTML(html) { this.html = html; this.nodes.clear(); for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) this.nodes.set(id, new Element(id)); }
  get innerHTML() { return this.html; }
  querySelector(selector) { if (selector.startsWith('#')) return this.nodes.get(selector.slice(1)) || null; if (!this.nodes.has(selector)) this.nodes.set(selector, new Element(selector)); return this.nodes.get(selector); }
  querySelectorAll(selector) { return selector === '[id]' ? [...this.nodes.values()] : []; }
  appendChild() {}
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  getBoundingClientRect() { return { width: 844, height: 390, top: 0, left: 0, bottom: 120 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}
try {
  const entry = path.join(temp, 'ui.mjs');
  await build({ stdin: { contents: "export { Hud, bindDeliverySwipe } from './game/src/ui/hud'; export { Game } from './game/src/game/game'; export { AreaPicker } from './game/src/ui/areapicker'; export { loadSettings, settingsHtml } from './game/src/ui/settings';", resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { Hud, bindDeliverySwipe, Game, AreaPicker, loadSettings, settingsHtml } = await import(pathToFileURL(entry));
  const globalEvents = new Events(), docEvents = new Events(), portrait = new Events(), root = new Element('hud');
  portrait.matches = false;
  globalThis.addEventListener = globalEvents.addEventListener.bind(globalEvents);
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.matchMedia = () => portrait;
  globalThis.document = { head: new Element(), documentElement: new Element(), hidden: false, createElement: () => new Element(), getElementById: () => root, addEventListener: docEvents.addEventListener.bind(docEvents) };
  globalThis.window = { DeviceOrientationEvent: class {} };
  globalThis.screen = { orientation: { angle: 90 } };
  const hud = new Hud(true), el = hud.el;
  // DialogFocus's native isolation is tested independently in ui-regressions.
  // This seam exercises dispatch/tip handlers without pretending to render DOM geometry.
  hud.offerFocus = { show() {}, hide() {} }; hud.tipFocus = { show() {}, hide() {} };
  let resets = 0;
  hud.onInputReset = () => { resets++; hud.resetControls(); }; // mirrors the game callback without recursion
  const down = (id, pointerId) => el[id].emit('pointerdown', { pointerId });
  const pressed = () => { down('t-left', 1); down('t-gas', 2); down('t-brake', 3); hud.tilt = 0.7; hud.touchBoost = true; };
  const released = () => {
    assert.equal(hud.touchGas, false); assert.equal(hud.touchBrake, false); assert.equal(hud.touchSteer, 0); assert.equal(hud.touchBoost, false); assert.equal(hud.tilt, 0); assert.equal(hud.touchAct, false);
    for (const id of ['t-left', 't-right', 't-gas', 't-brake', 't-act']) { assert.equal(el[id].captures.size, 0); assert.equal(el[id].classList.contains('on'), false); }
    assert.equal(hud.touchLeft, false); assert.equal(hud.touchRight, false);
  };
  await test('second fingers cannot steal held steering or throttle input', () => {
    down('t-left', 1); assert.equal(hud.touchSteer, -1);
    down('t-left', 9); el['t-left'].emit('pointerup', { pointerId: 9 }); assert.equal(hud.touchSteer, -1); assert.equal(el['t-left'].hasPointerCapture(1), true);
    down('t-gas', 2); down('t-gas', 8); el['t-gas'].emit('pointerup', { pointerId: 8 }); assert.equal(hud.touchGas, true);
    hud.resetControls(); released(); assert.equal(resets, 0);
  });
  await test('opposite arrows cancel each other and releasing one preserves the other thumb', () => {
    down('t-left', 1); assert.equal(hud.steer, -1);
    down('t-right', 2); assert.equal(hud.steer, 0); assert.equal(hud.touchLeft, true); assert.equal(hud.touchRight, true);
    el['t-left'].emit('pointerup', { pointerId: 1 }); assert.equal(hud.steer, 1); assert.equal(el['t-right'].classList.contains('on'), true);
    down('t-left', 3); el['t-right'].emit('pointercancel', { pointerId: 2 }); assert.equal(hud.steer, -1);
    hud.resetControls(); released();
    down('t-right', 4); down('t-gas', 5); assert.equal(hud.steer, 1); assert.equal(hud.touchGas, true);
    el['t-right'].emit('pointerup', { pointerId: 4 }); assert.equal(hud.steer, 0); assert.equal(hud.touchGas, true);
    hud.resetControls(); released();
  });
  await test('keyboard activation holds arrows and never reaches the global flight shortcut', () => {
    for (const [key, code] of [[' ', 'Space'], ['Enter', 'Enter']]) {
      const press = el['t-left'].emit('keydown', { key, code, repeat: false });
      assert.equal(press.prevented, true); assert.equal(press.stopped, true); assert.equal(hud.steer, -1);
      const repeat = el['t-left'].emit('keydown', { key, code, repeat: true }); assert.equal(repeat.stopped, true); assert.equal(hud.steer, -1);
      const release = el['t-left'].emit('keyup', { key, code }); assert.equal(release.prevented, true); assert.equal(release.stopped, true); assert.equal(hud.steer, 0);
    }
    const ignored = el['t-right'].emit('keydown', { key: 'x', code: 'KeyX' }); assert.equal(ignored.stopped, false); assert.equal(hud.steer, 0);
    el['t-right'].emit('keydown', { key: ' ', code: 'Space' }); el['t-right'].emit('blur'); assert.equal(hud.steer, 0);
    hud.resetControls(); released();
  });
  await test('a button held by pointer and keyboard stays active until both inputs release', () => {
    down('t-left', 11); el['t-left'].emit('keydown', { key: ' ', code: 'Space' });
    assert.equal(el['t-left'].getAttribute('aria-pressed'), 'true');
    el['t-left'].emit('pointerup', { pointerId: 11 }); assert.equal(hud.steer, -1); assert.equal(el['t-left'].captures.size, 0);
    el['t-left'].emit('keyup', { key: ' ', code: 'Space' }); assert.equal(hud.steer, 0); assert.equal(el['t-left'].getAttribute('aria-pressed'), 'false');
    el['t-right'].emit('keydown', { key: 'Enter', code: 'Enter' }); down('t-right', 12);
    el['t-right'].emit('keyup', { key: 'Enter', code: 'Enter' }); assert.equal(hud.steer, 1);
    el['t-right'].emit('pointerup', { pointerId: 12 }); assert.equal(hud.steer, 0);
    hud.resetControls(); released();
  });
  await test('pointer cancel and lost capture release both controls and visual pressed state', () => {
    down('t-gas', 2); el['t-gas'].emit('pointercancel', { pointerId: 2 }); assert.equal(hud.touchGas, false); assert.equal(el['t-gas'].captures.size, 0);
    down('t-left', 1); el['t-left'].releasePointerCapture(1); assert.equal(hud.touchSteer, 0); assert.equal(hud.touchLeft, false);
    down('t-right', 4); el['t-right'].emit('pointercancel', { pointerId: 4 }); assert.equal(hud.touchSteer, 0); assert.equal(hud.touchRight, false);
    down('t-brake', 3); el['t-brake'].releasePointerCapture(3); assert.equal(hud.touchBrake, false); assert.equal(el['t-brake'].classList.contains('on'), false);
  });
  await test('blur and hidden-page transitions release captures and also reset native game input', () => {
    pressed(); globalEvents.emit('blur'); released(); assert.equal(resets, 1);
    pressed(); docEvents.emit('visibilitychange'); assert.equal(hud.touchGas, true); assert.equal(resets, 1);
    document.hidden = true; docEvents.emit('visibilitychange'); released(); assert.equal(resets, 2); document.hidden = false;
  });
  await test('opening a menu clears held controls without recursive resets', () => {
    hud.modalFocus = { show() {}, hide() {} };
    pressed(); hud.modal('<h2>Settings</h2>'); released(); assert.equal(resets, 3); assert.equal(hud.modalOpen, true);
    hud.modal(null); assert.equal(resets, 3); assert.equal(hud.modalOpen, false);
  });
  await test('portrait rotation blocks simulation input until landscape or explicit dismissal', () => {
    pressed(); portrait.matches = true; portrait.emit('change'); released(); assert.equal(hud.rotationBlocked, true); assert.equal(resets, 4);
    portrait.matches = false; portrait.emit('change'); assert.equal(hud.rotationBlocked, false);
    portrait.matches = true; portrait.emit('change'); assert.equal(hud.rotationBlocked, true);
    el['rot-ok'].emit('click'); assert.equal(hud.rotationBlocked, false);
    portrait.emit('change'); assert.equal(hud.rotationBlocked, false);
  });
  await test('arrow controls remain available while gyro permission is pending and hide only after grant', async () => {
    let grant, requested = 0;
    window.DeviceOrientationEvent = class { static requestPermission() { requested++; return new Promise((resolve) => { grant = resolve; }); } };
    down('t-left', 1); down('t-gas', 2);
    const enabling = hud.enableTilt(true);
    assert.equal(requested, 1); assert.equal(hud.tiltOn, false); assert.equal(el.steering.hidden, false); released();
    down('t-right', 3); assert.equal(hud.steer, 1);
    grant('granted'); assert.equal(await enabling, true);
    assert.equal(hud.tiltOn, true); assert.equal(el.steering.hidden, true); released();
    hud.tilt = .7; assert.equal(hud.steer, .7); hud.resetControls();
    assert.equal(hud.tiltOn, true); assert.equal(el.steering.hidden, true); assert.equal(hud.steer, 0);
    assert.equal(await hud.enableTilt(false), true); assert.equal(el.steering.hidden, false); assert.equal(hud.tiltOn, false);
  });
  await test('unavailable, denied and rejected gyro leave usable arrows without stale steering', async () => {
    for (const motion of [undefined, class { static async requestPermission() { return 'denied'; } }, class { static async requestPermission() { throw Error('permission rejected'); } }]) {
      window.DeviceOrientationEvent = motion;
      down('t-left', 1); assert.equal(hud.steer, -1);
      assert.equal(await hud.enableTilt(true), false);
      assert.equal(hud.tiltOn, false); assert.equal(el.steering.hidden, false); released();
      down('t-right', 2); assert.equal(hud.steer, 1); hud.resetControls();
    }
  });
  await test('saved gyro preference defers an iOS prompt until an explicit user action', async () => {
    let requested = 0;
    window.DeviceOrientationEvent = class { static async requestPermission() { requested++; return 'granted'; } };
    assert.equal(await hud.enableTilt(true, false), false); assert.equal(requested, 0);
    assert.equal(hud.tiltOn, false); assert.equal(el.steering.hidden, false);
    assert.equal(await hud.enableTilt(true), true); assert.equal(requested, 1); assert.equal(el.steering.hidden, true);
    await hud.enableTilt(false);
  });
  await test('late gyro permission results cannot override a newer steering mode', async () => {
    const pending = [];
    window.DeviceOrientationEvent = class { static requestPermission() { return new Promise((resolve) => pending.push(resolve)); } };
    const first = hud.enableTilt(true);
    await hud.enableTilt(false); pending.shift()('granted'); await first;
    assert.equal(hud.tiltOn, false); assert.equal(el.steering.hidden, false);
    const older = hud.enableTilt(true), newer = hud.enableTilt(true);
    pending[1]('granted'); assert.equal(await newer, true); assert.equal(hud.tiltOn, true);
    pending[0]('denied'); await older;
    assert.equal(hud.tiltOn, true); assert.equal(el.steering.hidden, true);
    await hud.enableTilt(false);
  });
  await test('tilt steering respects landscape direction, dead zone and finite sensor values', async () => {
    window.DeviceOrientationEvent = class {};
    const listeners = () => globalEvents.events.get('deviceorientation')?.length ?? 0;
    const count = listeners(); assert.equal(await hud.enableTilt(true), true);
    assert.ok(listeners() <= Math.max(count, 1), 'mode changes do not add duplicate sensor listeners');
    screen.orientation.angle = 90; globalEvents.emit('deviceorientation', { beta: 11, gamma: 0 }); assert.equal(hud.steer, .5);
    screen.orientation.angle = 270; globalEvents.emit('deviceorientation', { beta: 11, gamma: 0 }); assert.equal(hud.steer, -.5);
    screen.orientation.angle = 0; globalEvents.emit('deviceorientation', { beta: 0, gamma: 44 }); assert.equal(hud.steer, 1);
    globalEvents.emit('deviceorientation', { beta: 0, gamma: 1 }); assert.equal(hud.steer, 0);
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      hud.tilt = 0; globalEvents.emit('deviceorientation', { beta: value, gamma: value }); assert.equal(hud.steer, 0); assert.ok(Number.isFinite(hud.steer));
    }
    await hud.enableTilt(false); globalEvents.emit('deviceorientation', { beta: 11, gamma: 11 }); assert.equal(hud.steer, 0);
    down('t-left', 9); assert.equal(hud.steer, -1); hud.resetControls(); released();
  });
  await test('area search ignores IME Enter, accepts completed Enter and lets Escape and Tab reach the dialog', () => {
    const picker = Object.assign(Object.create(AreaPicker.prototype), { root: new Element(), popular: [], list: [], focus: { show() {}, hide() {} }, onClose: null });
    picker.show({ first: true });
    const query = picker.root.querySelector('#ap-q'), result = picker.root.querySelector('#ap-res');
    let selected = 0; result.querySelector = () => ({ click() { selected++; } });
    const composing = query.emit('keydown', { key: 'Enter', isComposing: true }); assert.equal(selected, 0); assert.equal(composing.prevented, false);
    const complete = query.emit('keydown', { key: 'Enter', isComposing: false }); assert.equal(selected, 1); assert.equal(complete.prevented, true);
    assert.equal(query.emit('keydown', { key: 'Escape' }).stopped, false); assert.equal(query.emit('keydown', { key: 'Tab' }).stopped, false); assert.equal(query.emit('keydown', { key: 'w' }).stopped, true);
  });
  const defaults = { quality: 'auto', sound: true, steer: 'stick', tips: true };
  let stored;
  globalThis.localStorage = { getItem: () => stored };
  await test('invalid or unavailable saved settings recover to safe defaults', () => {
    for (stored of ['null', '[]', '42', '"low"', '{', '{"quality":"extreme","sound":"false","steer":true,"tips":0,"other":"ignored"}']) assert.deepEqual(loadSettings(), defaults);
    localStorage.getItem = () => { throw Error('storage blocked'); }; assert.deepEqual(loadSettings(), defaults); localStorage.getItem = () => stored;
  });
  await test('valid settings survive independently and unknown properties are discarded', () => {
    stored = '{"quality":"low","sound":false,"steer":"tilt","tips":false,"other":"ignored"}'; assert.deepEqual(loadSettings(), { quality: 'low', sound: false, steer: 'tilt', tips: false });
    stored = '{"quality":"high","sound":false,"steer":"invalid"}'; assert.deepEqual(loadSettings(), { ...defaults, quality: 'high', sound: false });
    assert.match(settingsHtml(defaults, true), /Engine, thrusters, traffic and delivery sounds/);
    assert.match(settingsHtml(defaults, true), /Arrow buttons/);
    assert.doesNotMatch(settingsHtml(defaults, true), /Thumb stick|thumb stick still works/);
  });
  const steeringFixture = (enableTilt) => {
    const buttons = ['stick', 'tilt'].map((value) => { const button = new Element(); button.dataset.v = value; return button; });
    const writes = [], notices = [];
    localStorage.setItem = (key, value) => writes.push({ key, value: JSON.parse(value) });
    const game = Object.assign(Object.create(Game.prototype), {
      steeringChange: 0, settings: { ...defaults, steer: 'tilt' },
      hud: { enableTilt, el: { sheet: { querySelectorAll: () => buttons } }, toast: (...args) => notices.push(args) },
    });
    return { game, writes, notices, buttons };
  };
  await test('denied gyro restores the persisted arrow mode and visible settings selection', async () => {
    const { game, writes, notices, buttons } = steeringFixture(async () => false);
    await game.applySteering();
    assert.equal(game.settings.steer, 'stick');
    assert.deepEqual(writes, [{ key: 'p2ph-settings-v1', value: { ...defaults, steer: 'stick' } }]);
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'true'); assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
    assert.equal(notices.length, 1); assert.match(notices[0][0], /Arrow buttons are ready/);
  });
  await test('startup deferral preserves the saved gyro choice without a denial toast or write', async () => {
    const calls = [];
    const { game, writes, notices } = steeringFixture(async (...args) => { calls.push(args); return false; });
    await game.applySteering(false, false);
    assert.deepEqual(calls, [[true, false]]); assert.equal(game.settings.steer, 'tilt'); assert.equal(writes.length, 0); assert.equal(notices.length, 0);
  });
  await test('older permission failure cannot rewrite a newer successful gyro selection', async () => {
    const pending = [];
    const { game, writes, notices } = steeringFixture(() => new Promise((resolve) => pending.push(resolve)));
    const older = game.applySteering(), newer = game.applySteering();
    pending[1](true); await newer; pending[0](false); await older;
    assert.equal(game.settings.steer, 'tilt'); assert.equal(writes.length, 0); assert.equal(notices.length, 0);
    const failed = game.applySteering(); pending[2](false); await failed;
    assert.equal(game.settings.steer, 'stick'); assert.equal(writes.length, 1); assert.equal(notices.length, 1);
  });
  const actionReleased = () => {
    assert.equal(hud.touchAct, false); assert.equal(el['t-act'].captures.size, 0);
    assert.equal(el['t-act'].classList.contains('on'), false); assert.equal(el['t-act'].getAttribute('aria-pressed'), 'false');
  };
  await test('contextual actions appear only with an available action and use specific labels', () => {
    hud.resetControls();
    assert.equal(el.prompt.hidden, true); assert.equal(el['t-act'].hidden, true);
    down('t-act', 40); assert.equal(hud.touchAct, false); assert.equal(el['t-act'].captures.size, 0);
    hud.prompt('Drive to the kitchen');
    assert.equal(el.prompt.hidden, false); assert.equal(el['t-act'].hidden, true);
    down('t-act', 40); assert.equal(hud.touchAct, false);
    for (const [kind, title, hint] of [['collect', 'Collect pizza', 'Hold to collect'], ['handover', 'Hand over pizza', 'Hold to deliver'], ['theatre', 'Talk to manager', 'Hold to talk']]) {
      hud.prompt('Available now', 0, kind);
      assert.equal(el.prompt.hidden, false); assert.equal(el['t-act'].hidden, false);
      assert.equal(el['action-title'].textContent, title); assert.equal(el['action-hint'].textContent, hint);
      assert.equal(el['t-act'].getAttribute('aria-label'), `${title}. ${hint}.`);
    }
    hud.prompt(null, 0, 'collect'); assert.equal(el.prompt.hidden, true); assert.equal(el['t-act'].hidden, true); actionReleased();
  });
  await test('context action is held only for its captured finger and releases immediately', () => {
    const events = []; hud.onButton = (id) => events.push(id);
    hud.prompt('Hold to collect the pizza', 0, 'collect'); down('t-act', 41);
    assert.equal(hud.touchAct, true); assert.equal(el['t-act'].hasPointerCapture(41), true); assert.equal(el['t-act'].getAttribute('aria-pressed'), 'true');
    down('t-act', 42); el['t-act'].emit('pointerup', { pointerId: 42 }); assert.equal(hud.touchAct, true);
    el['t-act'].emit('pointerup', { pointerId: 41 }); actionReleased();
    assert.deepEqual(events, [], 'Holding does not create an automatic action pulse');
    for (const event of ['pointercancel', 'lostpointercapture']) {
      down('t-act', 43); assert.equal(hud.touchAct, true);
      if (event === 'lostpointercapture') el['t-act'].releasePointerCapture(43); else el['t-act'].emit(event, { pointerId: 43 });
      actionReleased();
    }
    hud.resetControls();
  });
  await test('context action keyboard holds release on keyup or focus loss without triggering flight', () => {
    hud.prompt('Hold to collect', 0, 'collect');
    for (const [key, code] of [[' ', 'Space'], ['Enter', 'Enter']]) {
      const press = el['t-act'].emit('keydown', { key, code, repeat: false });
      assert.ok(press.prevented && press.stopped); assert.equal(hud.touchAct, true);
      const up = el['t-act'].emit('keyup', { key, code }); assert.ok(up.prevented && up.stopped); actionReleased();
      el['t-act'].emit('keydown', { key, code, repeat: false }); el['t-act'].emit('blur'); actionReleased();
    }
    hud.resetControls();
  });
  await test('action progress updates preserve a hold but changing or removing the action releases it', () => {
    hud.prompt('Collect the pizza', 0, 'collect'); down('t-act', 44); assert.equal(root.classList.contains('has-context-action'), true);
    hud.prompt('Collecting the pizza…', .4, 'collect'); assert.equal(hud.touchAct, true); assert.equal(el['t-act'].hasPointerCapture(44), true);
    hud.prompt('Hand over the pizza', 0, 'handover'); actionReleased(); assert.equal(el['t-act'].hidden, false);
    down('t-act', 45); hud.prompt('Talk to the manager', 0, 'theatre'); actionReleased();
    down('t-act', 46); hud.prompt(null); actionReleased(); assert.equal(el['t-act'].hidden, true); assert.equal(root.classList.contains('has-context-action'), false);
    hud.prompt('Collect the pizza', 0, 'collect'); down('t-act', 47); hud.prompt('Drive closer'); actionReleased(); assert.equal(el['t-act'].hidden, true);
    hud.resetControls();
  });
  await test('steering, throttle and contextual action fingers remain independent', () => {
    hud.prompt('Hold to collect', 0, 'collect'); down('t-left', 48); down('t-gas', 49); down('t-act', 50);
    assert.equal(hud.steer, -1); assert.equal(hud.touchGas, true); assert.equal(hud.touchAct, true);
    el['t-act'].emit('pointercancel', { pointerId: 50 }); actionReleased(); assert.equal(hud.steer, -1); assert.equal(hud.touchGas, true);
    down('t-act', 51); hud.prompt(null); actionReleased(); assert.equal(hud.steer, -1); assert.equal(hud.touchGas, true);
    hud.resetControls(); released();
  });
  await test('reset, modal, new offer, page blur and visibility loss hide and release the context action', () => {
    const cleanup = [
      () => hud.resetControls(),
      () => { hud.modal('<h2>Paused</h2>'); assert.equal(hud.modalOpen, true); hud.modal(null); },
      () => { hud.offer('<p>New order</p>'); assert.equal(root.classList.contains('has-offer'), true); hud.offer(null); },
      () => globalEvents.emit('blur'),
      () => { document.hidden = true; docEvents.emit('visibilitychange'); document.hidden = false; },
    ];
    for (const reset of cleanup) {
      hud.prompt('Hold to collect', .5, 'collect'); down('t-act', 52); assert.equal(hud.touchAct, true);
      reset(); actionReleased(); assert.equal(el.prompt.hidden, true); assert.equal(el['t-act'].hidden, true);
    }
    hud.prompt('Collect the pizza', 0, 'collect'); hud.rotationBlocked = true; down('t-act', 53); assert.equal(hud.touchAct, false);
    hud.rotationBlocked = false; hud.resetControls();
  });
  await test('cruise remains separate from the accelerator and releases on brake and overlays', () => {
    const events = []; hud.onButton = id => events.push(id);
    el['t-cruise'].emit('pointerdown'); assert.deepEqual(events, ['cruise']); assert.equal(hud.touchGas, false);
    hud.setCruise(true); assert.equal(hud.cruiseOn, true);
    assert.equal(el['t-cruise'].getAttribute('aria-pressed'), 'true'); assert.equal(el['cruise-label'].textContent, 'CRUISE ON');
    down('t-brake', 61); assert.equal(hud.touchBrake, true); assert.equal(hud.cruiseOn, false);
    hud.resetControls(); hud.setCruise(true);
    el['t-brake'].emit('keydown', { code: 'Space', key: ' ' }); assert.equal(hud.cruiseOn, false);
    hud.resetControls();
    for (const reset of [() => hud.resetControls(), () => { hud.offer('<p>Offer</p>'); hud.offer(null); }, () => { hud.modal('<h2>Paused</h2>'); hud.modal(null); }, () => globalEvents.emit('blur')]) {
      hud.setCruise(true); reset(); assert.equal(hud.cruiseOn, false); assert.equal(el['t-cruise'].getAttribute('aria-pressed'), 'false');
    }
  });
  await test('flight label and busy state track actual flight state without duplicate keyboard toggles', () => {
    const events = []; hud.onButton = id => events.push(id);
    hud.flightState(true, false); assert.equal(el['fly-label'].textContent, 'LAND'); assert.equal(el['t-fly'].getAttribute('aria-label'), 'Land');
    el['t-fly'].emit('keydown', { code: 'Space', key: ' ', repeat: false });
    el['t-fly'].emit('keydown', { code: 'Space', key: ' ', repeat: true }); assert.deepEqual(events, ['fly']);
    hud.flightState(false, true); assert.equal(el['fly-label'].textContent, 'LANDING…'); assert.equal(el['t-fly'].disabled, true);
    el['t-fly'].emit('pointerdown'); el['t-fly'].emit('click', { detail: 0 }); assert.deepEqual(events, ['fly']);
    hud.flightState(false, false); assert.equal(el['fly-label'].textContent, 'FLY'); assert.equal(el['t-fly'].disabled, false);
    assert.equal(el['t-fly'].getAttribute('aria-label'), 'Take off');
  });
  await test('accepted pickup card exposes real next stop and hides pickup note after collection', () => {
    hud.order({ state: 'Head to pickup', title: 'Kitchen', sub: '', dist: '373 m', time: '', meters: false, stage: 'pickup', next: 'Home in Panjeshah', orderId: 'PZ-1042' });
    assert.equal(el.order.dataset.stage, 'pickup'); assert.equal(el['o-next'].textContent, 'Next: Home in Panjeshah');
    assert.equal(el['o-note'].hidden, false); assert.equal(el['o-id'].textContent, '#PZ-1042');
    hud.order({ state: 'Deliver', title: 'Home', sub: '', dist: '670 m', time: '141 s', meters: false, stage: 'delivery' });
    assert.equal(el.order.dataset.stage, 'delivery'); assert.equal(el['o-note'].hidden, true); assert.equal(el['o-next'].hidden, true);
  });
  await test('order availability stays locked before the first completion and exposes accessible on/off state after it', () => {
    const events = []; hud.onButton = id => events.push(id);
    hud.orderAvailability({ unlocked: false, accepting: true });
    assert.equal(el['orders-availability'].hidden, true);
    el['orders-toggle'].emit('click'); assert.deepEqual(events, []);
    hud.orderAvailability({ unlocked: true, accepting: true });
    assert.equal(el['orders-availability'].hidden, false); assert.equal(el['orders-status'].textContent, 'ON');
    assert.equal(el['orders-toggle'].getAttribute('aria-pressed'), 'true');
    down('t-gas', 74); assert.equal(hud.touchGas, true);
    el['orders-toggle'].emit('click'); assert.deepEqual(events, ['orders']); assert.equal(hud.touchGas, false);
    hud.orderAvailability({ unlocked: true, accepting: false, activeOrder: true });
    assert.equal(el['orders-status'].textContent, 'OFF'); assert.equal(el['orders-toggle'].getAttribute('aria-pressed'), 'false');
    assert.match(el['orders-toggle'].getAttribute('aria-label'), /Current delivery continues/);
    assert.equal(el['orders-hint'].hidden, false); assert.equal(el['orders-hint'].textContent, 'After this delivery');
    assert.equal(el.order.dataset.stage, 'delivery', 'availability never replaces accepted work');
    hud.orderAvailability({ unlocked: true, accepting: false }); assert.equal(el['orders-hint'].hidden, true);
    assert.equal(el['orders-toggle'].emit('keydown', { code: 'Space', key: ' ' }).stopped, true);
    hud.orderAvailability({ unlocked: false, accepting: true });
  });
  await test('an unlocked pending request can turn off offers from inside its focus-trapped panel', () => {
    const events = []; hud.onButton = id => { events.push(id); hud.offer(null); };
    const buttons = [{ label: 'Accept', cls: 'go', fn: () => events.push('accept') }, { label: 'Decline', cls: 'alt', fn: () => events.push('decline') }];
    hud.orderAvailability({ unlocked: false, accepting: true }); hud.offer('<p>Delivery</p>', buttons);
    assert.equal(el.offer.querySelector('#offer-orders-toggle'), null);
    hud.offer(null); hud.orderAvailability({ unlocked: true, accepting: true }); hud.offer('<p>Delivery</p>', buttons);
    assert.ok(el.offer.querySelector('#offer-orders-toggle'));
    el['orders-toggle'].emit('click'); assert.deepEqual(events, [], 'isolated offer cannot use controls behind it');
    el.offer.querySelector('#offer-orders-toggle').emit('click');
    assert.deepEqual(events, ['orders']); assert.equal(el.offer.hidden, true);
    hud.orderAvailability({ unlocked: false, accepting: true });
  });
  await test('availability cannot toggle behind acknowledged tips, pause or rotation warning', () => {
    const events = []; hud.onButton = id => events.push(id);
    hud.orderAvailability({ unlocked: true, accepting: true });
    hud.tipAcknowledgement('Wait for acknowledgment'); el['orders-toggle'].emit('click'); assert.deepEqual(events, []); hud.tipAcknowledgement(null);
    hud.modal('<h2>Paused</h2>'); el['orders-toggle'].emit('click'); assert.deepEqual(events, []); hud.modal(null);
    hud.rotationBlocked = true; el['orders-toggle'].emit('click'); assert.deepEqual(events, []); hud.rotationBlocked = false;
    hud.orderAvailability({ unlocked: false, accepting: true });
  });
  const swipeFixture = () => {
    const button = new Element('swipe'); let accepted = 0, available = true;
    button.getBoundingClientRect = () => ({ left: 20, top: 0, width: 300, height: 48 });
    const release = bindDeliverySwipe(button, () => accepted++, () => available);
    return { button, release, accepted: () => accepted, unavailable: () => { available = false; } };
  };
  await test('delivery slider requires a captured horizontal swipe and never accepts a tap or short drag', () => {
    const { button, accepted } = swipeFixture();
    button.emit('pointerdown', { clientX: 30, clientY: 20 }); button.emit('pointerup', { clientX: 30, clientY: 20 });
    button.emit('click', { detail: 1 }); button.emit('click', { detail: 0 });
    assert.equal(accepted(), 0, 'compatibility clicks after a physical tap cannot bypass the swipe');
    button.emit('pointerdown', { clientX: 30, clientY: 20 }); button.emit('pointermove', { clientX: 100, clientY: 20 });
    assert.equal(button.hasPointerCapture(1), true); assert.notEqual(button.style.values.get('--swipe-x'), '0px');
    button.emit('pointerup', { clientX: 100, clientY: 20 });
    assert.equal(accepted(), 0); assert.equal(button.style.values.get('--swipe-x'), '0px'); assert.equal(button.captures.size, 0);
    button.emit('pointerdown', { clientX: 30, clientY: 20 }); button.emit('pointermove', { clientX: 275, clientY: 20 }); button.emit('pointerup', { clientX: 275, clientY: 20 });
    assert.equal(accepted(), 1); assert.equal(button.captures.size, 0);
    button.emit('pointerup', { clientX: 300, clientY: 20 }); button.emit('click', { detail: 1 }); assert.equal(accepted(), 1);
  });
  await test('slider owns one thumb, rejects starts away from its handle, and cancels vertical movement', () => {
    const { button, accepted } = swipeFixture();
    button.emit('pointerdown', { clientX: 180, clientY: 20 }); button.emit('pointerup', { clientX: 310, clientY: 20 }); assert.equal(accepted(), 0);
    button.emit('pointerdown', { pointerId: 5, clientX: 30, clientY: 20 });
    button.emit('pointerdown', { pointerId: 6, clientX: 30, clientY: 20 }); button.emit('pointerup', { pointerId: 6, clientX: 310, clientY: 20 });
    assert.equal(accepted(), 0); assert.equal(button.hasPointerCapture(5), true);
    button.emit('pointermove', { pointerId: 5, clientX: 300, clientY: 120 }); button.emit('pointerup', { pointerId: 5, clientX: 300, clientY: 20 });
    assert.equal(accepted(), 0, 'vertical cancellation remains cancelled even when the finger returns');
  });
  await test('slider cancellation, lost capture, blur and external reset never commit a partial gesture', () => {
    for (const cancel of [(b) => b.emit('pointercancel'), (b) => b.releasePointerCapture(1), (b) => b.emit('blur'), (_b, release) => release()]) {
      const { button, release, accepted } = swipeFixture();
      button.emit('pointerdown', { clientX: 30, clientY: 20 }); button.emit('pointermove', { clientX: 250, clientY: 20 }); cancel(button, release);
      button.emit('pointerup', { clientX: 300, clientY: 20 }); assert.equal(accepted(), 0); assert.equal(button.captures.size, 0); assert.equal(button.style.values.get('--swipe-x'), '0px');
    }
    const { button, unavailable, accepted } = swipeFixture();
    button.emit('pointerdown', { clientX: 30, clientY: 20 }); button.emit('pointermove', { clientX: 280, clientY: 20 }); unavailable(); button.emit('pointerup', { clientX: 280, clientY: 20 }); assert.equal(accepted(), 0);
  });
  await test('delivery acceptance remains accessible to keyboard and screen readers without duplicate activation', () => {
    for (const code of ['Enter', 'Space']) {
      const { button, accepted } = swipeFixture();
      const event = button.emit('keydown', { code, repeat: false }); button.emit('keydown', { code, repeat: true }); button.emit('keyup', { code });
      assert.equal(accepted(), 1); assert.ok(event.prevented && event.stopped);
    }
    const { button, accepted } = swipeFixture(); button.emit('click', { detail: 1 }); assert.equal(accepted(), 0);
    button.emit('click', { detail: 0 }); button.emit('click', { detail: 0 }); assert.equal(accepted(), 1);
  });
  await test('pending delivery isolates its controls, preserves explicit decline and releases swipes on blur', () => {
    let accepted = 0, declined = 0; const events = []; hud.onButton = id => events.push(id);
    const show = () => hud.offer('<p>Request</p>', [{ label: 'Accept', cls: 'go', fn: () => { accepted++; hud.offer(null); } }, { label: 'Decline', cls: 'alt', fn: () => { declined++; hud.offer(null); } }]);
    show();
    down('t-gas', 77); down('t-left', 78); el['t-cruise'].emit('pointerdown'); el['t-fly'].emit('pointerdown');
    assert.equal(hud.touchGas, false); assert.equal(hud.steer, 0); assert.deepEqual(events, []);
    assert.match(el.offer.innerHTML, /SLIDE TO ACCEPT/); assert.match(el.offer.innerHTML, /aria-describedby="swipe-help"/);
    const slide = el.offer.querySelector('#offer-slide'); slide.getBoundingClientRect = () => ({ left: 20, top: 0, width: 300, height: 48 });
    slide.emit('pointerdown', { clientX: 30, clientY: 20 }); slide.emit('pointermove', { clientX: 250, clientY: 20 }); globalEvents.emit('blur');
    slide.emit('pointerup', { clientX: 300, clientY: 20 }); assert.equal(accepted, 0);
    el.offer.querySelector('#offer-action-1').emit('click', { detail: 1 }); assert.equal(declined, 1); assert.equal(el.offer.hidden, true);
    show(); const keyboard = el.offer.querySelector('#offer-slide'); keyboard.emit('keydown', { code: 'Enter', repeat: false });
    assert.equal(accepted, 1); assert.equal(el.offer.hidden, true);
  });
  await test('driving tips block held input and remain until an acknowledged dismissal', () => {
    const events = []; hud.onButton = id => events.push(id); const before = resets;
    down('t-gas', 80); hud.setCruise(true); hud.tipAcknowledgement('Hold GO to accelerate.');
    assert.equal(hud.tipOpen, true); assert.equal(el['tip-layer'].hidden, false); assert.equal(el['tip-t'].textContent, 'Hold GO to accelerate.'); released();
    assert.equal(hud.cruiseOn, false); assert.equal(resets, before + 1);
    hud.tipAcknowledgement('Hold GO to accelerate.'); assert.equal(resets, before + 1, 'same open tip does not repeatedly reset or refocus');
    down('t-gas', 81); el['t-fly'].emit('pointerdown'); el['t-cruise'].emit('pointerdown'); assert.equal(hud.touchGas, false); assert.deepEqual(events, []);
    hud.resetControls(); assert.equal(hud.tipOpen, true, 'input reset alone does not dismiss coaching');
    el['tip-x'].emit('click'); assert.equal(hud.tipOpen, false); assert.deepEqual(events, ['tip-close']);
    el['tip-x'].emit('click'); assert.deepEqual(events, ['tip-close']);
    hud.tip('Another tip'); hud.modal('<h2>Paused</h2>'); assert.equal(hud.tipOpen, false); hud.modal(null);
    hud.tip('Another tip'); hud.offer('<p>Offer</p>'); assert.equal(hud.tipOpen, false); hud.offer(null);
  });
  await test('reserve is inside FLY/LAND and idle availability never creates an extra task card', () => {
    assert.doesNotMatch(root.innerHTML, /id="fly-v"|id="fly"|>Unlimited</);
    hud.flightReserve(0); assert.equal(el['t-fly'].style.values.get('--flight-reserve'), '0'); assert.equal(el['t-fly'].getAttribute('data-charged'), 'false');
    hud.flightReserve(.35); assert.equal(el['t-fly'].style.values.get('--flight-reserve'), '0.35');
    hud.flightReserve(0, true); assert.equal(el['t-fly'].style.values.get('--flight-reserve'), '1'); assert.equal(el['t-fly'].getAttribute('aria-description'), 'Flight reserve full');
    hud.flightReserve(NaN); assert.equal(el['t-fly'].style.values.get('--flight-reserve'), '0');
    hud.orderAvailability({ unlocked: true, accepting: false });
    hud.order({ state:'Free roam',title:'Explore Hyderabad',sub:'',dist:'',time:'',meters:false,stage:'idle' }); assert.equal(el.order.hidden,true); assert.equal(el['orders-availability'].hidden,false);
    hud.order({ state:'GPS',title:'Charminar',sub:'',dist:'400 m',time:'',meters:false,stage:'idle' }); assert.equal(el.order.hidden,false,'a real navigation target keeps its destination/distance card');
    hud.order({ state:'Pickup',title:'Kitchen',sub:'',dist:'50 m',time:'',meters:false,stage:'pickup' }); assert.equal(el.order.hidden,false);
    const events=[];hud.onButton=id=>events.push(id);down('t-gas',901);el['b-report'].emit('click');assert.deepEqual(events,['report']);assert.equal(hud.touchGas,false);
    assert.equal(el['b-report'].emit('keydown',{code:'Space',key:' '}).stopped,true);
  });
  await test('repeated frame HUD updates leave measured layout to its resize observer', () => {
    const layout=hud.updateLayout;let reads=0;hud.updateLayout=()=>reads++;
    for(let i=0;i<120;i++){hud.orderAvailability({unlocked:true,accepting:true});hud.order({state:'Pickup',title:'Kitchen',sub:'',dist:'50 m',time:'',meters:false,stage:'pickup'});hud.flightReserve(1,true);}
    assert.equal(reads,0,'a steady gameplay frame must not force DOM measurement');hud.updateLayout=layout;
  });
  await test('accessible arrow, brake and map close rules survive integration', () => {
    assert.match(root.innerHTML, /id="t-left"[^>]*aria-label="Steer left"/);
    assert.match(root.innerHTML, /id="t-right"[^>]*aria-label="Steer right"/);
    assert.match(root.innerHTML, /id="t-gas"[^>]*aria-label="Accelerate"[^>]*>GO<\/button>/);
    assert.match(root.innerHTML, /id="t-brake"[^>]*aria-label="Brake and reverse"[^>]*><svg[\s\S]*?<span>BRAKE<\/span><\/button>/);
    assert.doesNotMatch(root.innerHTML, />ACT<|aria-label="Accept order or hold/);
    const controls = root.innerHTML.slice(root.innerHTML.indexOf('<div class="touch pe">'), root.innerHTML.indexOf('<button type="button" class="rescue pe"'));
    assert.doesNotMatch(controls, /id="t-act"/, 'The action button is contextual, outside the permanent driving controls');
    assert.doesNotMatch(root.innerHTML, /id="stick"|id="knob"/);
    const title = readFileSync(new URL('../game/src/ui/title.ts', import.meta.url), 'utf8'), map = readFileSync(new URL('../game/src/ui/map.ts', import.meta.url), 'utf8');
    assert.match(title, /Flight is unlimited\. Press again to land/); assert.match(title, /title-screen/);
    assert.match(title, /<b>GO<\/b> hold to accelerate/); assert.match(title, /<b>BRAKE<\/b> brake \/ reverse/);
    assert.match(title, /<b>CRUISE<\/b> hold your current speed/);
    assert.match(title, /hold the button that appears in the middle/);
    assert.match(map, /\.fmap \.close\{[^}]*min-width:44px;min-height:44px;touch-action:manipulation/);
    assert.match(map, /\.fmap \.map-title\{[^}]*min-width:0;pointer-events:none/);
    assert.match(map, /\.fmap\[hidden\],\.fmap \[hidden\]\{display:none!important/);
  });
  console.log(`V2 UI regressions: ${checks} checks passed. No browser acceptance claimed.`);
} finally {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  rmSync(temp, { recursive: true, force: true });
}

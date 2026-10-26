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
    const event = { pointerId: 1, clientX: 0, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
    for (const fn of [...this.events.get(type) || []]) fn(event);
    return event;
  }
}
class Element extends Events {
  constructor(id = '') {
    super(); this.id = id; this.nodes = new Map(); this.attributes = new Map(); this.hidden = false; this.dataset = {}; this.style = { setProperty() {} }; this.captures = new Set(); this.clientWidth = 100;
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
  await build({ stdin: { contents: "export { Hud } from './game/src/ui/hud'; export { Game } from './game/src/game/game'; export { AreaPicker } from './game/src/ui/areapicker'; export { loadSettings, settingsHtml } from './game/src/ui/settings';", resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { Hud, Game, AreaPicker, loadSettings, settingsHtml } = await import(pathToFileURL(entry));
  const globalEvents = new Events(), docEvents = new Events(), portrait = new Events(), root = new Element('hud');
  portrait.matches = false;
  globalThis.addEventListener = globalEvents.addEventListener.bind(globalEvents);
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.matchMedia = () => portrait;
  globalThis.document = { head: new Element(), documentElement: new Element(), hidden: false, createElement: () => new Element(), getElementById: () => root, addEventListener: docEvents.addEventListener.bind(docEvents) };
  globalThis.window = { DeviceOrientationEvent: class {} };
  globalThis.screen = { orientation: { angle: 90 } };
  const hud = new Hud(true), el = hud.el;
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
    hud.prompt('Collect the pizza', 0, 'collect'); down('t-act', 44);
    hud.prompt('Collecting the pizza…', .4, 'collect'); assert.equal(hud.touchAct, true); assert.equal(el['t-act'].hasPointerCapture(44), true);
    hud.prompt('Hand over the pizza', 0, 'handover'); actionReleased(); assert.equal(el['t-act'].hidden, false);
    down('t-act', 45); hud.prompt('Talk to the manager', 0, 'theatre'); actionReleased();
    down('t-act', 46); hud.prompt(null); actionReleased(); assert.equal(el['t-act'].hidden, true);
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
  await test('unlimited-flight wording and accessible map close rules survive integration', () => {
    assert.match(root.innerHTML, /id="fly-v">Unlimited/);
    assert.match(root.innerHTML, /id="t-left"[^>]*aria-label="Steer left"/);
    assert.match(root.innerHTML, /id="t-right"[^>]*aria-label="Steer right"/);
    assert.match(root.innerHTML, /id="t-gas"[^>]*aria-label="Accelerate"[^>]*>GO<\/button>/);
    assert.match(root.innerHTML, /id="t-brake"[^>]*aria-label="Brake and reverse"[^>]*>BRAKE<\/button>/);
    assert.doesNotMatch(root.innerHTML, />ACT<|aria-label="Accept order or hold/);
    const controls = root.innerHTML.slice(root.innerHTML.indexOf('<div class="touch pe">'), root.innerHTML.indexOf('<button type="button" class="rescue pe"'));
    assert.doesNotMatch(controls, /id="t-act"/, 'The action button is contextual, outside the permanent driving controls');
    assert.doesNotMatch(root.innerHTML, /id="stick"|id="knob"/);
    const title = readFileSync(new URL('../game/src/ui/title.ts', import.meta.url), 'utf8'), map = readFileSync(new URL('../game/src/ui/map.ts', import.meta.url), 'utf8');
    assert.match(title, /Flight is unlimited\. Press again to land/); assert.match(title, /title-screen/);
    assert.match(title, /<b>GO<\/b> drive/); assert.match(title, /<b>BRAKE<\/b> brake \/ reverse/);
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

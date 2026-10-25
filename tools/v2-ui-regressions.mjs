// Exercise production UI handlers with a small DOM seam; real mobile layout is tested separately.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const temp = mkdtempSync(path.join(tmpdir(), 'roadster-v2-ui-'));
const saved = Object.fromEntries(['document', 'addEventListener', 'ResizeObserver', 'matchMedia', 'localStorage'].map((key) => [key, globalThis[key]]));
let checks = 0;
const test = (label, run) => { run(); checks++; console.log(`PASS ${label}`); };
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
    super(); this.id = id; this.nodes = new Map(); this.hidden = false; this.dataset = {}; this.style = { setProperty() {} }; this.captures = new Set(); this.clientWidth = 100;
    const classes = new Set(); this.classList = { add: (value) => classes.add(value), remove: (value) => classes.delete(value), contains: (value) => classes.has(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } };
  }
  set innerHTML(html) { this.html = html; this.nodes.clear(); for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) this.nodes.set(id, new Element(id)); }
  get innerHTML() { return this.html; }
  querySelector(selector) { if (selector.startsWith('#')) return this.nodes.get(selector.slice(1)) || null; if (!this.nodes.has(selector)) this.nodes.set(selector, new Element(selector)); return this.nodes.get(selector); }
  querySelectorAll(selector) { return selector === '[id]' ? [...this.nodes.values()] : []; }
  appendChild() {}
  setAttribute() {}
  getBoundingClientRect() { return { width: 844, height: 390, top: 0, left: 0, bottom: 120 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
}
try {
  const entry = path.join(temp, 'ui.mjs');
  await build({ stdin: { contents: "export { Hud } from './game/src/ui/hud'; export { AreaPicker } from './game/src/ui/areapicker'; export { loadSettings, settingsHtml } from './game/src/ui/settings';", resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { Hud, AreaPicker, loadSettings, settingsHtml } = await import(pathToFileURL(entry));
  const globalEvents = new Events(), docEvents = new Events(), portrait = new Events(), root = new Element('hud');
  portrait.matches = false;
  globalThis.addEventListener = globalEvents.addEventListener.bind(globalEvents);
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.matchMedia = () => portrait;
  globalThis.document = { head: new Element(), documentElement: new Element(), hidden: false, createElement: () => new Element(), getElementById: () => root, addEventListener: docEvents.addEventListener.bind(docEvents) };
  const hud = new Hud(true), el = hud.el;
  let resets = 0;
  hud.onInputReset = () => { resets++; hud.resetControls(); }; // mirrors the game callback without recursion
  const down = (id, pointerId) => el[id].emit('pointerdown', { pointerId });
  const pressed = () => { down('stick', 1); el.stick.emit('pointermove', { pointerId: 1, clientX: 30 }); down('t-gas', 2); down('t-brake', 3); hud.tilt = 0.7; hud.touchBoost = true; };
  const released = () => {
    assert.equal(hud.touchGas, false); assert.equal(hud.touchBrake, false); assert.equal(hud.touchSteer, 0); assert.equal(hud.touchBoost, false); assert.equal(hud.tilt, 0);
    for (const id of ['stick', 't-gas', 't-brake']) { assert.equal(el[id].captures.size, 0); assert.equal(el[id].classList.contains('on'), false); }
    assert.equal(el.knob.style.transform, '');
  };
  test('second fingers cannot steal held steering or throttle input', () => {
    down('stick', 1); el.stick.emit('pointermove', { pointerId: 1, clientX: 30 });
    down('stick', 9); el.stick.emit('pointerup', { pointerId: 9 }); assert.equal(hud.touchSteer, 0.75);
    down('t-gas', 2); down('t-gas', 8); el['t-gas'].emit('pointerup', { pointerId: 8 }); assert.equal(hud.touchGas, true);
    hud.resetControls(); released(); assert.equal(resets, 0);
  });
  test('pointer cancel and lost capture release both controls and visual pressed state', () => {
    down('t-gas', 2); el['t-gas'].emit('pointercancel', { pointerId: 2 }); assert.equal(hud.touchGas, false); assert.equal(el['t-gas'].captures.size, 0);
    down('stick', 1); el.stick.emit('pointermove', { pointerId: 1, clientX: 30 }); el.stick.releasePointerCapture(1); assert.equal(hud.touchSteer, 0);
    down('t-brake', 3); el['t-brake'].releasePointerCapture(3); assert.equal(hud.touchBrake, false); assert.equal(el['t-brake'].classList.contains('on'), false);
  });
  test('blur and hidden-page transitions release captures and also reset native game input', () => {
    pressed(); globalEvents.emit('blur'); released(); assert.equal(resets, 1);
    pressed(); docEvents.emit('visibilitychange'); assert.equal(hud.touchGas, true); assert.equal(resets, 1);
    document.hidden = true; docEvents.emit('visibilitychange'); released(); assert.equal(resets, 2); document.hidden = false;
  });
  test('opening a menu clears held controls without recursive resets', () => {
    hud.modalFocus = { show() {}, hide() {} };
    pressed(); hud.modal('<h2>Settings</h2>'); released(); assert.equal(resets, 3); assert.equal(hud.modalOpen, true);
    hud.modal(null); assert.equal(resets, 3); assert.equal(hud.modalOpen, false);
  });
  test('portrait rotation blocks simulation input until landscape or explicit dismissal', () => {
    pressed(); portrait.matches = true; portrait.emit('change'); released(); assert.equal(hud.rotationBlocked, true); assert.equal(resets, 4);
    portrait.matches = false; portrait.emit('change'); assert.equal(hud.rotationBlocked, false);
    portrait.matches = true; portrait.emit('change'); assert.equal(hud.rotationBlocked, true);
    el['rot-ok'].emit('click'); assert.equal(hud.rotationBlocked, false);
    portrait.emit('change'); assert.equal(hud.rotationBlocked, false);
  });
  test('area search ignores IME Enter, accepts completed Enter and lets Escape and Tab reach the dialog', () => {
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
  test('invalid or unavailable saved settings recover to safe defaults', () => {
    for (stored of ['null', '[]', '42', '"low"', '{', '{"quality":"extreme","sound":"false","steer":true,"tips":0,"other":"ignored"}']) assert.deepEqual(loadSettings(), defaults);
    localStorage.getItem = () => { throw Error('storage blocked'); }; assert.deepEqual(loadSettings(), defaults); localStorage.getItem = () => stored;
  });
  test('valid settings survive independently and unknown properties are discarded', () => {
    stored = '{"quality":"low","sound":false,"steer":"tilt","tips":false,"other":"ignored"}'; assert.deepEqual(loadSettings(), { quality: 'low', sound: false, steer: 'tilt', tips: false });
    stored = '{"quality":"high","sound":false,"steer":"invalid"}'; assert.deepEqual(loadSettings(), { ...defaults, quality: 'high', sound: false });
    assert.match(settingsHtml(defaults, true), /Engine, thrusters, traffic and delivery sounds/);
  });
  test('unlimited-flight wording and accessible map close rules survive integration', () => {
    assert.match(root.innerHTML, /id="fly-v">Unlimited/);
    const title = readFileSync(new URL('../game/src/ui/title.ts', import.meta.url), 'utf8'), map = readFileSync(new URL('../game/src/ui/map.ts', import.meta.url), 'utf8');
    assert.match(title, /Flight is unlimited\. Press again to land/); assert.match(title, /title-screen/);
    assert.match(map, /\.fmap \.close\{[^}]*min-width:44px;min-height:44px;touch-action:manipulation/);
    assert.match(map, /\.fmap \.map-title\{[^}]*min-width:0;pointer-events:none/);
    assert.match(map, /\.fmap\[hidden\],\.fmap \[hidden\]\{display:none!important/);
  });
  console.log(`V2 UI regressions: ${checks} checks passed. No browser acceptance claimed.`);
} finally {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  rmSync(temp, { recursive: true, force: true });
}

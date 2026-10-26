// Offline production Game integration checks. Rendering and browser-native focus,
// touch and audio output still require the separate visible-controls acceptance pass.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'roadster-v2-game-'));
const globals = ['window', 'document', 'location', 'navigator', 'addEventListener', 'requestAnimationFrame', 'localStorage', '__roadsterV2Ui'];
const originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let checks = 0;
const test = async (label, run) => { await run(); checks++; console.log(`PASS ${label}`); };
const clone = value => JSON.parse(JSON.stringify(value));

class Control {
  listeners = new Map(); dataset = {}; hidden = false;
  constructor(id = '') { this.id = id; }
  addEventListener(name, callback) { const callbacks = this.listeners.get(name) || []; callbacks.push(callback); this.listeners.set(name, callbacks); }
  emit(name, event = {}) { for (const callback of this.listeners.get(name) || []) callback(event); }
  focus(options) { this.focusOptions = options; document.activeElement = this; }
}

function sheetFrom(html) {
  const controls = [...html.matchAll(/<button\b([^>]*)>/g)].map(([, attributes]) => {
    const control = new Control();
    for (const [, name, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      if (name.startsWith('data-')) control.dataset[name.slice(5)] = value;
      else control[name] = value;
    }
    return control;
  });
  return {
    controls,
    querySelector: selector => controls.find(control => `#${control.id}` === selector) || null,
    querySelectorAll: selector => controls.filter(control => selector === '.opt' ? control.class?.split(' ').includes('opt') : selector.startsWith('[data-') && selector.slice(6, -1) in control.dataset),
  };
}

function makeHud() {
  return {
    root: new Control('hud'), el: { minimap: new Control('minimap'), 'b-full': new Control('fullscreen'), dev: new Control('dev') },
    modalOpen: false, rotationBlocked: false, touchGas: false, touchBrake: false, touchSteer: 0, steer: 0,
    toasts: [], modals: [], sheet: null, offerValue: null,
    modal(html, bind) { this.modalOpen = !!html; this.modals.push(html); this.sheet = html ? sheetFrom(html) : null; if (bind) bind(this.sheet); },
    toast(...args) { this.toasts.push(args); }, offer(html) { this.offerValue = html; }, prompt() {}, tip() {}, rescue() {},
    resetControls() { this.touchGas = false; this.touchBrake = false; this.touchSteer = 0; this.steer = 0; },
    async enableTilt() { return true; },
  };
}

function installEnvironment() {
  const storage = new Map(), listeners = new Map(), documentListeners = new Map();
  const add = (map, name, callback) => { const callbacks = map.get(name) || []; callbacks.push(callback); map.set(name, callbacks); };
  const document = { hidden: false, activeElement: null, getElementById: () => null,
    documentElement: { classList: { contains: () => false } },
    addEventListener: (name, callback) => add(documentListeners, name, callback) };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: {} }, document: { configurable: true, value: document },
    location: { configurable: true, value: { href: 'http://127.0.0.1:4189/', search: '', reload() {} } },
    navigator: { configurable: true, value: { maxTouchPoints: 0 } },
    addEventListener: { configurable: true, value: (name, callback) => add(listeners, name, callback) },
    requestAnimationFrame: { configurable: true, value: () => 1 },
    localStorage: { configurable: true, value: localStorage },
  });
  return { storage, document, emit: (name, event) => { for (const callback of listeners.get(name) || []) callback(event); },
    visibility: hidden => { document.hidden = hidden; for (const callback of documentListeners.get('visibilitychange') || []) callback(); } };
}

try {
  // Only constructor boundaries for mounted UI are replaced. The complete Game,
  // persistence validators, input handlers, frame and cinema code execute unchanged.
  const uiModules = {
    hud: "export class Hud { constructor() { return globalThis.__roadsterV2Ui.hud(); } } export const orderOfferHtml = value => JSON.stringify(value);",
    map: "export class FullMap { constructor(...args) { return globalThis.__roadsterV2Ui.map(...args); } }",
    areapicker: "export class AreaPicker { constructor() { return { popular: [], list: [], show() {}, hide() {} }; } }",
    title: "export class TitleScreen { show() {} } export const canFullscreen=()=>false; export const isFullscreen=()=>false; export const goFullscreen=()=>{}; export const exitFullscreen=()=>{};",
  };
  await build({
    stdin: { contents: "export { Game } from './src/game/game'; export { LADDER, FILMS } from './src/game/cinema'; export { Vector3, Group, Mesh, MeshBasicMaterial, BufferGeometry, PerspectiveCamera } from 'three';", resolveDir: join(root, 'game'), loader: 'ts' },
    outfile: join(output, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
    plugins: [{ name: 'ui-constructor-boundaries', setup(build) {
      build.onLoad({ filter: /[/\\]ui[/\\](hud|map|areapicker|title)\.ts$/ }, args => ({ contents: uiModules[args.path.match(/([^/\\]+)\.ts$/)[1]], loader: 'js' }));
    } }],
  });
  const { Game, LADDER, FILMS, Vector3, Group, Mesh, MeshBasicMaterial, BufferGeometry, PerspectiveCamera } = await import(pathToFileURL(join(output, 'production.mjs')));
  const order = state => ({ state, pickup: { x: 100, z: 0, y: 0, label: 'Kitchen', sub: 'Pickup road' }, drop: { x: 500, z: 0, y: 0, label: 'Customer', sub: 'Customer road' }, dist: 500, limit: 120, t: 12, heat: 100, slices: 8, pickupName: 'Kitchen' });
  const theatre = { def: LADDER[0], stop: { x: 700, z: 50, y: 0, label: LADDER[0].name, sub: 'Theatre' } };
  const lease = () => ({ theatre: theatre.def.key, film: { ...clone(FILMS[0]), quality: 0.7 }, price: 150, shows: 4, campaign: 'none', startDay: 2, days: [], hype: 1.2, wom: 1, done: false });
  const report = day => ({ day, tickets: 100, occupancy: 0.5, gross: 15000, coins: 4, note: 'Test day' });
  const validSave = () => ({ coins: 700, level: 2, doneInLevel: 1, day: 4, minutes: 725.5, total: 10, lease: null });
  const fixture = () => {
    const environment = installEnvironment(), hud = makeHud(), counts = { player: 0, traffic: 0, city: 0, signals: 0, signalSeconds: 0, render: 0, clock: 0, poster: 0, save: 0 };
    const sound = { muted: false, vehicles: [], cues: [], horns: [], vehicle(value) { this.vehicles.push(value); }, cue(value) { this.cues.push(value); }, horn(...args) { this.horns.push(args); }, setMuted(value) { this.muted = value; }, unlock() {} };
    const canvas = new Control('scene'), beacon = new Group(); beacon.visible = false; beacon.col = { material: new MeshBasicMaterial() }; beacon.ring = { material: new MeshBasicMaterial(), scale: { setScalar() {} } };
    const g = Object.assign(Object.create(Game.prototype), {
      keys: new Set(), flyQueued: false, actHeld: false, actTap: 0, actProgress: 0, dragging: false, rotationWasBlocked: false,
      coins: 500, level: 0, doneInLevel: 0, day: 1, minutes: 480, totalDelivered: 0, streak: 1,
      order: null, nextOfferAt: null, cinemaReport: null, paused: false, choosing: false, relocating: false,
      area: { name: 'Test area', x: 0, z: 0 }, map: { open: false, ticks: 0, tick() { this.ticks++; }, show() { this.open = true; }, handleKey() {} },
      route: null, routeTarget: null, routeT: 0, routeGuide: [], routeGuidanceBlocked: false,
      theatres: [theatre], lease: null, slate: [], food: [], residences: [], opts: { lowQ: true }, zone: { bounds: [-1000, -1000, 1000, 1000] },
      player: { pos: new Vector3(0, 0.55, 0), forward: new Vector3(0, 0, -1), speed: 0, yaw: 0, flying: false, descending: false, glide: null, lastSupport: 0, hitCooldown: 0, bump: 0, placementRevision: 0, update() { counts.player++; } },
      hud, sound, beacon, gps: new Mesh(new BufferGeometry(), new MeshBasicMaterial()),
      settings: { quality: 'auto', sound: true, steer: 'stick', tips: true },
      engine: { renderer: { domElement: canvas }, camera: new PerspectiveCamera(), render() { counts.render++; }, placeSun() {} },
      clock: { getDelta() { counts.clock++; return 0.05; } },
      city: { rails: new Map(), update() { counts.city++; }, updateSignals(seconds) { counts.signals++; counts.signalSeconds = seconds; }, signs: { update() {} }, loadedBuildings: () => [] },
      traffic: { t: 0, update(dt) { this.t += dt; counts.traffic++; }, hitTest: () => null, pushOut() {}, hideNear() {} }, walkers: { list: [], update() {} }, metro: { bodies: [], update() {} }, rail: { bodies: [], update() {} },
      railContacts: { beforePlayer() {}, afterPlayer: () => ({ hit: false, impact: 0, carried: false }) }, aircraft: { update() {} },
      t: 0, moodT: 1, busyT: 1, fpsN: 0, fpsT: performance.now(), fps: 60, devOn: false, autopilot: false,
      camPos: new Vector3(), camLook: new Vector3(), cameraPlacementRevision: 0, orbitYaw: 0, orbitPitch: 0.38, orbitDist: 0,
      applyClockMood() {}, watchStuck() {}, setStreetLife() {}, updateRoute() {}, clearCamera: (_pivot, desired) => desired,
      insideSolid: () => false, placeLampLights() {}, updateHud() {}, tutorialTick() {}, paintPoster() { counts.poster++; },
    });
    return { g, environment, hud, sound, counts, canvas };
  };
  const key = (code, repeat = false, value = code) => ({ code, key: value, repeat, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });

  await test('valid saves round-trip zero values, final-level progress, negative balances and fractional time', () => {
    const { g, environment } = fixture();
    Object.assign(g, { coins: -40, level: 6, doneInLevel: 12, day: 7, minutes: 0.25, totalDelivered: 0 }); g.save();
    const restored = fixture().g; localStorage.setItem('p2ph-save-v1', environment.storage.get('p2ph-save-v1')); restored.load();
    assert.deepEqual([restored.coins, restored.level, restored.doneInLevel, restored.day, restored.minutes, restored.totalDelivered], [-40, 6, 12, 7, 0.25, 0]);
  });

  await test('corrupt or out-of-range numeric saves fall back without poisoning other progress', () => {
    const cases = [['coins', '900', 500], ['coins', 1.5, 500], ['coins', Number.MAX_SAFE_INTEGER + 1, 500],
      ['level', -1, 0], ['level', 7, 0], ['doneInLevel', 5, 0], ['day', 0, 1], ['minutes', 1440, 480], ['minutes', null, 480], ['total', -1, 0], ['total', 2.2, 0]];
    for (const [field, value, expected] of cases) {
      const { g } = fixture(), saved = validSave(); saved[field] = value; localStorage.setItem('p2ph-save-v1', JSON.stringify(saved)); g.load();
      assert.equal(g[field === 'total' ? 'totalDelivered' : field], expected, field);
      if (field !== 'coins') assert.equal(g.coins, 700, `${field}: unrelated valid balance`);
    }
    for (const raw of ['{', '[]', 'null', '"bad"']) { const { g } = fixture(); localStorage.setItem('p2ph-save-v1', raw); g.load(); assert.equal(g.coins, 500); assert.equal(g.day, 1); }
    const { g } = fixture(); localStorage.getItem = () => { throw Error('storage disabled'); }; assert.doesNotThrow(() => g.load());
  });

  await test('saved leases validate films, prices, theatre identity and ordered day reports', () => {
    const good = lease();
    { const { g } = fixture(); localStorage.setItem('p2ph-save-v1', JSON.stringify({ ...validSave(), lease: good })); g.load(); assert.deepEqual(g.lease, good); }
    const mutations = [l => l.theatre = 'unknown', l => l.film.id = 'invented', l => l.film.quality = 2,
      l => l.film.star = 2.5, l => l.film.title = 123, l => l.film.colors = ['#fff'], l => l.price = 0,
      l => l.shows = 100, l => l.campaign = 'unknown', l => l.startDay = 0, l => l.hype = -1,
      l => l.wom = '1', l => l.done = 'false', l => l.days = [report(2)], l => l.days = [{ ...report(1), tickets: -1 }],
      l => l.days = [{ ...report(1), occupancy: 2 }], l => l.days = Array.from({ length: 8 }, (_, i) => report(i + 1))];
    for (const mutate of mutations) { const { g } = fixture(), candidate = clone(good); mutate(candidate); localStorage.setItem('p2ph-save-v1', JSON.stringify({ ...validSave(), lease: candidate })); g.load(); assert.equal(g.lease, null); assert.equal(g.coins, 700); }
    const { g } = fixture(); localStorage.setItem('p2ph-save-v1', JSON.stringify({ ...validSave(), lease: { ...good, days: Array.from({ length: 7 }, (_, i) => report(i + 1)), done: false } })); g.load(); assert.equal(g.lease.done, true, 'completed weeks cannot settle again after reload');
  });

  await test('saved areas accept playable bounds and reject malformed or off-map coordinates', () => {
    const { g } = fixture();
    for (const area of [{ name: 'RTC X Roads', x: 0, z: 0 }, { name: 'Edge', x: -1000, z: 1000 }]) { localStorage.setItem('p2ph-area-v1', JSON.stringify(area)); assert.deepEqual(g.savedArea(), area); }
    for (const area of [null, { name: ' ', x: 0, z: 0 }, { name: 'Bad', x: '0', z: 0 }, { name: 'Bad', x: 1001, z: 0 }, { name: 'Bad', x: 0, z: -1001 }, { name: 1, x: 0, z: 0 }]) { localStorage.setItem('p2ph-area-v1', JSON.stringify(area)); assert.equal(g.savedArea(), null); }
    localStorage.setItem('p2ph-area-v1', '{'); assert.equal(g.savedArea(), null);
  });

  await test('handover pays a collected order once and ignores offers, pickups and duplicate calls', () => {
    const { g, sound } = fixture(); let saves = 0; g.save = () => saves++;
    for (const state of ['offer', 'toPickup']) { g.order = order(state); g.completeDelivery(); assert.equal(g.coins, 500); assert.equal(g.totalDelivered, 0); }
    g.order = order('toDrop'); g.setTarget(g.order.drop); g.completeDelivery();
    assert.equal(g.coins, 675); assert.equal(g.totalDelivered, 1); assert.equal(g.doneInLevel, 1); assert.equal(g.streak, 1.2);
    assert.equal(g.order, null); assert.equal(g.routeTarget, null); assert.ok(Number.isFinite(g.nextOfferAt));
    const due = g.nextOfferAt; g.completeDelivery();
    assert.equal(g.coins, 675); assert.equal(g.totalDelivered, 1); assert.equal(g.nextOfferAt, due); assert.equal(saves, 1); assert.deepEqual(sound.cues, ['delivery']);
  });

  await test('cinema settlement credits each day once and closes a seven-day lease once', () => {
    const { g, counts } = fixture(); g.lease = lease(); let saves = 0; g.save = () => saves++;
    g.settleDay(); assert.equal(g.lease.days.length, 0, 'no earnings before release');
    for (let day = 2; day <= 8; day++) {
      g.day = day; g.settleDay(); const coins = g.coins, hype = g.lease.hype, wom = g.lease.wom;
      assert.equal(g.lease.days.length, day - 1); assert.equal(coins, 500 + g.lease.days.reduce((total, r) => total + r.coins, 0));
      g.settleDay(); assert.equal(g.coins, coins); assert.equal(g.lease.days.length, day - 1); assert.equal(g.lease.hype, hype); assert.equal(g.lease.wom, wom);
    }
    assert.equal(g.lease.done, true); assert.equal(saves, 7); assert.equal(counts.poster, 1); assert.ok(g.cinemaReport);
    const finalCoins = g.coins; g.day = 9; g.settleDay(); assert.equal(g.coins, finalCoins); assert.equal(saves, 7);
  });

  await test('weekly report waits for all overlays and hidden state, then appears exactly once', () => {
    for (const blocker of ['paused', 'map', 'choosing', 'relocating', 'modal', 'rotation', 'hidden']) {
      const { g, hud, environment, canvas } = fixture(); const report = { readyAt: 100, html: '<h2>HIT!</h2><button id="close">Back to deliveries</button>' }; g.cinemaReport = report;
      const block = value => { if (blocker === 'map') g.map.open = value; else if (blocker === 'modal') hud.modalOpen = value; else if (blocker === 'rotation') hud.rotationBlocked = value; else if (blocker === 'hidden') environment.document.hidden = value; else g[blocker] = value; };
      g.tickCinemaReport(99); assert.equal(hud.modals.length, 0); block(true); g.tickCinemaReport(500); assert.equal(g.cinemaReport, report, blocker); assert.equal(hud.modals.length, 0, blocker);
      block(false); g.tickCinemaReport(501); assert.equal(g.cinemaReport, null); assert.equal(hud.modals.length, 1); assert.equal(hud.modalOpen, true);
      g.tickCinemaReport(1000); assert.equal(hud.modals.length, 1); hud.sheet.querySelector('#close').emit('click');
      assert.equal(hud.modalOpen, false); assert.equal(document.activeElement, canvas);
    }
  });

  await test('theatre GPS cannot erase an accepted delivery but can replace a pending offer', () => {
    for (const state of ['toPickup', 'toDrop', 'offer']) {
      const { g, hud } = fixture(); const current = order(state); g.order = current; g.setTarget(state === 'toPickup' ? current.pickup : current.drop); const target = g.routeTarget; g.nextOfferAt = 777;
      g.openTheatres(); hud.sheet.querySelectorAll('.opt')[0].emit('click');
      if (state === 'offer') { assert.equal(g.order, null); assert.equal(g.routeTarget, theatre.stop); assert.equal(g.nextOfferAt, null); assert.equal(hud.modalOpen, false); }
      else { assert.equal(g.order, current); assert.equal(g.routeTarget, target); assert.equal(g.nextOfferAt, 777); assert.equal(hud.modalOpen, true); assert.match(hud.toasts.at(-1)[0], /Finish this delivery/); }
    }
  });

  await test('held keys retain driving input while repeated toggles and action acceptance stay single-shot', () => {
    const { g, sound } = fixture();
    g.handleKeyDown(key('Space')); assert.equal(g.input().flyPressed, true); g.handleKeyDown(key('Space', true)); assert.equal(g.input().flyPressed, false);
    g.handleKeyDown(key('KeyW')); g.handleKeyDown(key('KeyW', true)); assert.equal(g.input().throttle, 1);
    g.order = order('offer'); g.handleKeyDown(key('KeyE')); g.handleKeyDown(key('KeyE', true)); assert.equal(g.order.state, 'toPickup'); assert.equal(g.actHeld, true); assert.equal(sound.cues.filter(c => c === 'accept').length, 1);
    const toggles = { KeyT: 'openTheatres', KeyM: 'openMap', KeyR: 'rescue' };
    for (const [code, method] of Object.entries(toggles)) { let calls = 0; g[method] = () => calls++; g.handleKeyDown(key(code)); g.handleKeyDown(key(code, true)); assert.equal(calls, 1, code); }
    g.handleKeyDown(key('KeyH')); g.handleKeyDown(key('KeyH', true)); assert.equal(sound.horns.length, 1);
    g.handleKeyDown(key('KeyN')); g.handleKeyDown(key('KeyN', true)); assert.equal(sound.muted, true); assert.equal(g.settings.sound, false);
    g.handleKeyDown(key('Backquote', false, '`')); g.handleKeyDown(key('Backquote', true, '`')); assert.equal(g.devOn, true);
    g.handleKeyDown(key('Backslash', false, '\\')); g.handleKeyDown(key('Backslash', true, '\\')); assert.equal(g.autopilot, true);
  });

  await test('P and Escape pause/resume clear held controls and restore canvas focus', () => {
    for (const code of ['KeyP', 'Escape']) {
      const { g, hud, sound, canvas } = fixture(); g.keys.add('KeyW'); hud.touchGas = true; g.actHeld = true; g.flyQueued = true;
      g.handleKeyDown(key(code)); assert.equal(g.paused, true); assert.equal(hud.modalOpen, true); assert.equal(g.keys.size, 0); assert.equal(g.actHeld, false); assert.equal(hud.touchGas, false);
      g.handleKeyDown(key(code, true)); assert.equal(g.paused, true, 'holding toggle must not resume');
      hud.el.minimap.focus(); g.handleKeyDown(key(code)); assert.equal(g.paused, false); assert.equal(hud.modalOpen, false); assert.equal(document.activeElement, canvas); assert.equal(g.flyQueued, false);
      assert.equal(sound.vehicles.at(-1).active, false, 'resume clears residual vehicle audio before the next active frame');
    }
  });

  await test('paused, rotated, hidden and covered frames freeze gameplay and send inactive vehicle audio', () => {
    for (const blocker of ['paused', 'rotation', 'hidden', 'map', 'modal', 'choosing', 'area']) {
      const { g, hud, sound, counts, environment } = fixture(); g.order = order('toDrop'); g.actProgress = 0.3;
      if (blocker === 'rotation') hud.rotationBlocked = true; else if (blocker === 'hidden') environment.document.hidden = true;
      else if (blocker === 'map') g.map.open = true; else if (blocker === 'modal') hud.modalOpen = true;
      else if (blocker === 'area') g.area = null; else g[blocker] = true;
      g.keys.add('KeyW'); g.frame();
      assert.deepEqual([g.t, g.minutes, g.order.t, g.order.heat, counts.player, counts.traffic, counts.city, counts.signals], [0, 480, 12, 100, 0, 0, 0, 0], blocker);
      assert.equal(sound.vehicles.at(-1).active, false, blocker);
      if (blocker === 'rotation') { assert.equal(g.keys.size, 0); assert.equal(g.actProgress, 0); }
    }
    const { g, counts, sound } = fixture(); g.order = order('toDrop'); g.frame();
    assert.ok(g.t > 0 && g.minutes > 480 && g.order.t > 12); assert.equal(counts.player, 1); assert.equal(counts.traffic, 1); assert.equal(counts.city, 1); assert.equal(counts.signals, 1); assert.equal(counts.signalSeconds, g.traffic.t); assert.equal(sound.vehicles.at(-1).active, true);
  });

  await test('moving trains update before player physics and rail impact reaches gameplay and traffic', () => {
    const { g, sound } = fixture(), calls = [], metroBody = { id: 'metro' }, railBody = { id: 'rail' };
    g.order = order('toDrop'); const slices = g.order.slices;
    g.metro.update = () => { calls.push('metro'); g.metro.bodies = [metroBody]; };
    g.rail.update = () => { calls.push('rail'); g.rail.bodies = [railBody]; };
    g.railContacts.beforePlayer = (_player, bodies) => { calls.push('carry'); assert.deepEqual(bodies, [metroBody, railBody]); };
    g.player.update = () => { calls.push('player'); assert.deepEqual(g.city.movingRail, [metroBody, railBody]); };
    g.railContacts.afterPlayer = player => { calls.push('contact'); player.pos.x = 4; return { hit: true, impact: 3, carried: false }; };
    g.aircraft.update = (_dt, x) => { calls.push('aircraft'); assert.equal(x, 4); };
    g.city.update = x => { calls.push('world'); assert.equal(x, 4); };
    g.traffic.update = (_dt, x) => { calls.push('traffic'); assert.equal(x, 4); };
    g.frame();
    assert.deepEqual(calls, ['metro', 'rail', 'carry', 'player', 'contact', 'aircraft', 'world', 'traffic']);
    assert.ok(sound.cues.includes('bump')); assert.equal(g.order.slices, slices - 1); assert.equal(g.player.hitCooldown, 1);
    calls.length = 0; g.paused = true; g.frame(); assert.deepEqual(calls, [], 'pause freezes every moving system');
  });

  await test('Game.start wires map close to gameplay focus or the explicit keyboard opener', () => {
    const { g, hud, environment, canvas } = fixture();
    globalThis.__roadsterV2Ui = { hud: () => hud, map: (_root, _zone, getState, onClose) => ({
      open: false, getState, closeControl: new Control('close-map'), tick() {}, handleKey() {},
      show() { this.open = true; this.opener = document.activeElement; this.closeControl.focus(); },
      hide() { if (!this.open) return; this.open = false; this.opener?.focus(); onClose(); },
    }) };
    g.start(); g.choosing = false; g.paused = false; g.area = { name: 'Test area', x: 0, z: 0 };
    hud.el.minimap.focus(); hud.el.minimap.emit('click'); assert.equal(g.map.open, true); assert.equal(g.paused, true); g.map.hide();
    assert.equal(g.paused, false); assert.equal(document.activeElement, canvas, 'pointer map returns to driving');
    hud.el.minimap.focus(); hud.el.minimap.emit('keydown', key('Enter', false, 'Enter')); g.map.hide(); assert.equal(document.activeElement, hud.el.minimap, 'explicit keyboard opener retains navigation focus');
    hud.el.minimap.focus(); environment.emit('keydown', key('KeyM')); g.map.hide(); assert.equal(document.activeElement, canvas, 'M shortcut returns to driving');
    g.keys.add('KeyW'); g.actHeld = true; hud.touchGas = true; environment.visibility(true);
    assert.equal(g.keys.size, 0); assert.equal(g.actHeld, false); assert.equal(hud.touchGas, false); assert.equal(g.paused, true); assert.equal(hud.modalOpen, true);
  });

  console.log(`Version 2 Game integration: ${checks} regression groups passed (offline production code).`);
} finally {
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  await rm(output, { recursive: true, force: true });
}

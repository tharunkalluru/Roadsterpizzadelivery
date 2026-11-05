// Offline production Game integration checks. Rendering and browser-native focus,
// touch and audio output still require the separate visible-controls acceptance pass.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../../node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
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
  setAttribute(name, value) { this[name] = String(value); }
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
    controls, html,
    querySelector: selector => controls.find(control => `#${control.id}` === selector) || null,
    querySelectorAll: selector => controls.filter(control => selector === '.opt' ? control.class?.split(' ').includes('opt') : selector.startsWith('[data-') && selector.slice(6, -1) in control.dataset),
  };
}

function makeHud() {
  return {
    root: new Control('hud'), el: { minimap: new Control('minimap'), 'b-full': new Control('fullscreen'), dev: new Control('dev'), fly: { style: {} } },
    modalOpen: false, tipOpen: false, rotationBlocked: false, touchGas: false, touchBrake: false, touchSteer: 0, steer: 0, touchAct: false, activeAction: null, 
    toasts: [], modals: [], sheet: null, offerValue: null, values: new Map(), flightStates: [], reserves: [],
    modal(html, bind) { if (html) this.tip(null); this.modalOpen = !!html; this.modals.push(html); this.sheet = html ? sheetFrom(html) : null; if (bind) bind(this.sheet); },
    toast(...args) { this.toasts.push(args); }, offer(html, buttons = []) { this.offerValue = html; this.offerButtons = buttons; },
    set(id, value) { this.values.set(id, value); }, order(value) { this.orderValue = value; },
    orderAvailability(value) { this.orderAvailabilityValue = value; },
    flightNavigation() {},
    flightState(flying, descending) { this.flightStates.push({ flying, descending }); },
    flightReserve(fraction, unlimited) { this.reserves.push({ fraction, unlimited }); },
    prompt(text, progress = 0, action = null) { if (action !== this.activeAction) this.touchAct = false; this.activeAction = action; this.promptValue = { text, progress, action }; },
    tip(text) { this.tipOpen = !!text; this.tipValue = text; }, rescue() {},
    resetControls() { this.touchGas = false; this.touchBrake = false; this.touchSteer = 0; this.steer = 0; this.touchAct = false; this.prompt(null); },
    async enableTilt() { return true; },
  };
}

function installEnvironment() {
  const storage = new Map(), listeners = new Map(), documentListeners = new Map();
  const add = (map, name, callback) => { const callbacks = map.get(name) || []; callbacks.push(callback); map.set(name, callbacks); };
  const document = { hidden: false, activeElement: null, getElementById: () => null,
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener: (name, callback) => add(documentListeners, name, callback) };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => listeners.set(name, (listeners.get(name) || []).filter(value => value !== callback)) } }, document: { configurable: true, value: document },
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
  // persistence validators, input handlers, frame and frame code execute unchanged; removed features are listed in the migration ledger.
  const uiModules = {
    hud: "export class Hud { constructor() { return globalThis.__roadsterV2Ui.hud(); } } export const orderOfferHtml = value => JSON.stringify(value);",
    map: "export class FullMap { constructor(...args) { return globalThis.__roadsterV2Ui.map(...args); } }",
    areapicker: "export class AreaPicker { constructor() { return { popular: [], list: [], show() {}, hide() {} }; } }",
    title: "export class TitleScreen { show() {} } export { goFullscreen, exitFullscreen, isFullscreen, canFullscreen, fullscreenFallbackHtml } from 'actual-title';",
  };
  await build({
    stdin: { contents: "export { Game } from './src/game/game'; export { Player } from './src/game/player'; export { RailRiderClearance } from './src/game/rail-rider-clearance'; export { Vector3, Group, Mesh, MeshBasicMaterial, BufferGeometry, PerspectiveCamera } from 'three';", resolveDir: root, loader: 'ts' },
    outfile: join(output, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
    plugins: [{ name: 'ui-constructor-boundaries', setup(build) {
      build.onResolve({ filter: /^actual-title$/ }, () => ({ path: join(root, 'src/ui/title.ts'), namespace: 'actual-title' }));
      build.onLoad({ filter: /.*/, namespace: 'actual-title' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'ts', resolveDir: join(root, 'src/ui') }));
      build.onLoad({ filter: /[/\\]ui[/\\](hud|map|areapicker|title)\.ts$/, namespace: 'file' }, args => ({ contents: uiModules[args.path.match(/([^/\\]+)\.ts$/)[1]], loader: 'js' }));
    } }],
  });
  const { Game, Player, RailRiderClearance, Vector3, Group, Mesh, MeshBasicMaterial, BufferGeometry, PerspectiveCamera } = await import(pathToFileURL(join(output, 'production.mjs')));
  const order = state => ({ state, pickup: { x: 100, z: 0, y: 0, label: 'Kitchen', sub: 'Pickup road' }, drop: { x: 500, z: 0, y: 0, label: 'Customer', sub: 'Customer road' }, dist: 500, limit: 120, t: 12, heat: 100, slices: 8, pickupName: 'Kitchen' });
  const waypoint = { x: 700, z: 50, y: 0, label: 'Street waypoint', sub: 'Street' };
  const report = day => ({ day, tickets: 100, occupancy: 0.5, gross: 15000, coins: 4, note: 'Test day' });
  const validSave = () => ({ coins: 700, level: 2, doneInLevel: 1, day: 4, minutes: 725.5, total: 10, lease: null });
  const fixture = () => {
    const environment = installEnvironment(), hud = makeHud(), counts = { player: 0, traffic: 0, city: 0, signals: 0, signalSeconds: 0, render: 0, clock: 0, poster: 0, save: 0 };
    const sound = { muted: false, vehicles: [], cues: [], horns: [], vehicle(value) { this.vehicles.push(value); }, cue(value) { this.cues.push(value); }, horn(...args) { this.horns.push(args); }, setMuted(value) { this.muted = value; }, unlock() {} };
    const canvas = new Control('scene'), beacon = new Group(); beacon.visible = false; beacon.col = { material: new MeshBasicMaterial() }; beacon.ring = { material: new MeshBasicMaterial(), scale: { setScalar() {} } };
    const g = Object.assign(Object.create(Game.prototype), {
      keys: new Set(), flyQueued: false, actHeld: false, actTap: 0, actProgress: 0, dragging: false, rotationWasBlocked: false, offerSequence: 0, tipWasOpen: false, acknowledgedTips: new Set(),
      coins: 500, level: 0, doneInLevel: 0, day: 1, minutes: 480, totalDelivered: 0, streak: 1, acceptingOrders: true,
      order: null, nextOfferAt: null, paused: false, choosing: false, relocating: false,
      area: { name: 'Test area', x: 0, z: 0 }, map: { open: false, ticks: 0, tick() { this.ticks++; }, show() { this.open = true; }, handleKey() {} },
      route: null, routeTarget: null, routeT: 0, routeGuide: [], routeGuidanceBlocked: false,
      food: [], residences: [], opts: { lowQ: true }, zone: { bounds: { minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 } },
      player: { pos: new Vector3(0, 0.55, 0), forward: new Vector3(0, 0, -1), speed: 0, yaw: 0, flying: false, descending: false, glide: null, lastSupport: 0, hitCooldown: 0, bump: 0, placementRevision: 0, enforceSpeedLimit: Player.prototype.enforceSpeedLimit, group: new Group(), syncPresentation() {}, canJump: false, update() { counts.player++; } },
      hud, sound, beacon, gps: new Mesh(new BufferGeometry(), new MeshBasicMaterial()),
      settings: { quality: 'auto', sound: true, steer: 'stick', tips: true, reducedMotion: false },
      engine: { renderer: { domElement: canvas }, camera: new PerspectiveCamera(), render() { counts.render++; }, placeSun() {} },
      clock: { getDelta() { counts.clock++; return 0.05; } },
      city: { rails: new Map(), update() { counts.city++; }, updateSignals(seconds) { counts.signals++; counts.signalSeconds = seconds; }, signs: { update() {} }, loadedBuildings: () => [] },
      traffic: { t: 0, update(dt) { this.t += dt; counts.traffic++; }, hitTest: () => null, pushOut() {}, hideNear() {} }, walkers: { list: [], clear() { this.list.length = 0; }, update() {} }, metro: { bodies: [], update() {} }, rail: { bodies: [], setRiderStop() {}, update() {} },
      // This fixture bypasses Game's constructor, so retain its real initially
      // inactive train-rider guard rather than weakening production frame code.
      railRiderClearance: new RailRiderClearance(), railRiderWarned: false,
      railContacts: { beforePlayer() {}, afterPlayer: () => ({ hit: false, impact: 0, carried: false }) }, aircraft: { update() {} },
      t: 0, moodT: 1, busyT: 1, fpsN: 0, fpsT: performance.now(), fps: 60, devOn: false, autopilot: false,
      camPos: new Vector3(), camLook: new Vector3(), cameraPlacementRevision: 0, orbitYaw: 0, orbitPitch: 0.38, orbitDist: 0,
      updateCamera() {}, applyClockMood() {}, watchStuck() {}, setStreetLife() {}, updateRoute() {}, clearCamera: (_pivot, desired) => desired,
      insideSolid: () => false, placeLampLights() {}, updateHud() {}, tutorialTick() {}, paintPoster() { counts.poster++; },
    });
    return { g, environment, hud, sound, counts, canvas };
  };
  const key = (code, repeat = false, value = code) => ({ code, key: value, repeat, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  const requestFixture = () => {
    const f = fixture(); f.requests = { generated: 0 };
    f.g.makeOffer = () => { f.requests.generated++; return order('offer'); };
    f.g.graph = { route: () => ({ len: 250, complete: true, pts: [[0, 0, 0], [100, 0, 0]] }) };
    f.g.areaName = () => ''; f.g.drawMinimap = () => {};
    f.g.updateHud = Game.prototype.updateHud.bind(f.g);
    return f;
  };

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


  await test('new players receive an offer and unlock order availability only after completed handover', () => {
    const { g, hud, requests } = requestFixture();
    g.setAcceptingOrders(false); assert.equal(g.acceptingOrders, true); assert.equal(g.ordersUnlocked, false);
    g.queueOffer(0, 0); g.tickOfferQueue(0); assert.equal(requests.generated, 1); assert.equal(g.order.state, 'offer');
    g.acceptOffer(); assert.equal(g.ordersUnlocked, false); assert.equal(g.coins, 500); assert.equal(hud.orderAvailabilityValue.unlocked, false);
    g.player.pos.set(100, .55, 0); g.frame(); hud.touchAct = true;
    for (let i = 0; i < 19; i++) g.frame();
    assert.equal(g.order.state, 'toDrop'); assert.equal(g.ordersUnlocked, false); assert.equal(g.coins, 500);
    g.player.pos.set(500, .55, 0); g.frame(); hud.touchAct = true;
    for (let i = 0; i < 19; i++) g.frame();
    assert.equal(g.order, null); assert.equal(g.totalDelivered, 1); assert.equal(g.ordersUnlocked, true); assert.equal(g.coins, 675);
    assert.deepEqual(hud.orderAvailabilityValue, { unlocked: true, accepting: true, activeOrder: false });
    assert.ok(Number.isFinite(g.nextOfferAt), 'normal offers continue until the player switches them off');
  });

  await test('orders OFF retracts an unaccepted request and queue without changing money, progress or a separate GPS waypoint', () => {
    const { g, hud, requests, canvas } = requestFixture(); g.totalDelivered = 1; g.setTarget(waypoint);
    g.queueOffer(0, 0); g.tickOfferQueue(0); const staleAccept = hud.offerButtons[0].fn;
    const progress = [g.coins, g.totalDelivered, g.level, g.doneInLevel];
    g.setAcceptingOrders(false);
    assert.equal(g.order, null); assert.equal(g.nextOfferAt, null); assert.equal(hud.offerValue, null); assert.equal(g.routeTarget, waypoint);
    assert.equal(hud.orderValue.state, 'GPS'); assert.equal(document.activeElement, canvas);
    staleAccept(); g.showOffer(); g.queueOffer(0, 0); g.tickOfferQueue(10000);
    assert.equal(requests.generated, 1); assert.equal(g.order, null); assert.equal(g.nextOfferAt, null);
    assert.deepEqual([g.coins, g.totalDelivered, g.level, g.doneInLevel], progress);
    g.setTarget(null); g.updateHud(); assert.equal(hud.orderValue.state, 'Free roam'); assert.equal(hud.orderValue.title, 'Explore Hyderabad');
    g.keys.add('KeyW'); assert.equal(g.input().throttle, 1, 'free roam still drives normally');
  });

  await test('orders OFF preserves accepted pickup and customer legs through paid handover and suppresses the next offer', () => {
    for (const state of ['toPickup', 'toDrop']) {
      const { g, hud, requests } = requestFixture(); g.totalDelivered = 1; const current = order(state); g.order = current;
      g.setTarget(state === 'toPickup' ? current.pickup : current.drop); const target = g.routeTarget;
      const untouched = clone(current); g.setAcceptingOrders(false);
      assert.equal(g.order, current); assert.equal(g.routeTarget, target); assert.deepEqual(g.order, untouched); assert.equal(g.coins, 500);
      assert.deepEqual(hud.orderAvailabilityValue, { unlocked: true, accepting: false, activeOrder: true });
      assert.equal(hud.orderValue.stage, state === 'toPickup' ? 'pickup' : 'delivery');
      g.showOffer(); g.tickOfferQueue(Number.MAX_SAFE_INTEGER); assert.equal(g.order, current); assert.equal(requests.generated, 0);
      if (state === 'toPickup') {
        g.player.pos.set(100, .55, 0); g.frame(); hud.touchAct = true;
        for (let i = 0; i < 19; i++) g.frame();
        assert.equal(current.state, 'toDrop'); assert.equal(g.coins, 500);
      }
      g.player.pos.set(500, .55, 0); g.frame(); hud.touchAct = true;
      for (let i = 0; i < 19; i++) g.frame();
      assert.equal(g.order, null); assert.equal(g.totalDelivered, 2); assert.equal(g.coins, 675); assert.equal(g.nextOfferAt, null);
      assert.deepEqual(hud.orderAvailabilityValue, { unlocked: true, accepting: false, activeOrder: false });
      g.completeDelivery(); g.tickOfferQueue(Number.MAX_SAFE_INTEGER); assert.equal(g.coins, 675); assert.equal(requests.generated, 0);
      assert.equal(JSON.parse(localStorage.getItem('p2ph-save-v1')).acceptingOrders, false);
    }
  });

  await test('orders ON queues one request and waits for each overlay or hidden state before presenting it', () => {
    for (const blocker of ['paused', 'modal', 'tip', 'map', 'rotation', 'choosing', 'relocating', 'hidden']) {
      const { g, hud, environment, requests } = requestFixture(); g.totalDelivered = 1; g.setAcceptingOrders(false);
      const block = value => {
        if (blocker === 'modal') hud.modalOpen = value; else if (blocker === 'tip') hud.tip(value ? 'Read this' : null);
        else if (blocker === 'map') g.map.open = value; else if (blocker === 'rotation') hud.rotationBlocked = value;
        else if (blocker === 'hidden') environment.document.hidden = value; else g[blocker] = value;
      };
      block(true); g.setAcceptingOrders(true); const due = g.nextOfferAt; assert.ok(Number.isFinite(due));
      g.setAcceptingOrders(true); assert.equal(g.nextOfferAt, due, 'repeated ON does not replace the pending request');
      g.tickOfferQueue(due + 100); assert.equal(requests.generated, 0, blocker); assert.equal(g.nextOfferAt, due);
      block(false); g.tickOfferQueue(due + 101); assert.equal(requests.generated, 1, blocker); assert.equal(g.order.state, 'offer'); assert.equal(g.nextOfferAt, null);
      g.setAcceptingOrders(true); g.tickOfferQueue(due + 1000); assert.equal(requests.generated, 1, 'no duplicate while a request is already visible');
    }
  });

  await test('order availability saves are backward compatible, boolean validated and locked ON before the first delivery', () => {
    for (const value of [undefined, true, false, 'false', null, 0, {}, []]) {
      for (const total of [0, 1]) {
        const { g } = requestFixture(); localStorage.setItem('p2ph-save-v1', JSON.stringify({ ...validSave(), total, acceptingOrders: value })); g.load();
        assert.equal(g.acceptingOrders, total === 0 || value !== false); assert.equal(g.ordersUnlocked, total > 0);
        g.save(); assert.equal(JSON.parse(localStorage.getItem('p2ph-save-v1')).acceptingOrders, total === 0 || value !== false);
      }
    }
    const { g } = requestFixture(); g.totalDelivered = 1; g.setAcceptingOrders(false); const raw = localStorage.getItem('p2ph-save-v1');
    const restored = requestFixture(); localStorage.setItem('p2ph-save-v1', raw); restored.g.load();
    assert.equal(restored.g.acceptingOrders, false); restored.g.setAcceptingOrders(true);
    assert.equal(JSON.parse(localStorage.getItem('p2ph-save-v1')).acceptingOrders, true);
  });

  await test('restored OFF remains free roaming through a real area relocation without scheduling offers', async () => {
    const { g, hud, requests } = requestFixture(); localStorage.setItem('p2ph-save-v1', JSON.stringify({ ...validSave(), acceptingOrders: false })); g.load();
    g.picker = { hide() {} }; g.city.ensure = async () => {}; g.placeNear = () => true; g.traffic.clear = () => {}; g.walkers.group = new Group();
    const oldTimeout = globalThis.setTimeout;
    globalThis.setTimeout = () => 1;
    try { await g.relocate({ name: 'Free roam area', x: 40, z: 80 }); }
    finally { globalThis.setTimeout = oldTimeout; }
    assert.equal(g.acceptingOrders, false); assert.equal(g.nextOfferAt, null); assert.equal(g.order, null); assert.equal(g.paused, false);
    g.showOffer(); g.tickOfferQueue(Number.MAX_SAFE_INTEGER); assert.equal(requests.generated, 0);
    g.updateHud(); assert.equal(hud.orderValue.state, 'Free roam');
  });

  await test('the HUD order switch invokes the lifecycle and blocked storage cannot disable free roam', () => {
    const { g, hud, canvas } = requestFixture();
    globalThis.__roadsterV2Ui = { hud: () => hud, map: () => ({ open: false, tick() {}, handleKey() {} }) };
    g.start(); g.choosing = false; g.paused = false; g.totalDelivered = 1;
    localStorage.setItem = () => { throw Error('storage blocked'); };
    assert.doesNotThrow(() => hud.onButton('orders')); assert.equal(g.acceptingOrders, false);
    assert.equal(document.activeElement, canvas, 'switching availability returns keyboard input to the car');
    assert.equal(hud.orderValue.state, 'Free roam'); assert.equal(g.nextOfferAt, null);
    hud.onButton('orders'); assert.equal(g.acceptingOrders, true); assert.ok(Number.isFinite(g.nextOfferAt));
  });

  await test('saved areas accept playable bounds and reject malformed or off-map coordinates', () => {
    const { g } = fixture();
    for (const area of [{ name: 'RTC X Roads', x: 0, z: 0 }, { name: 'Edge', x: -1000, z: 1000 }]) { localStorage.setItem('p2ph-area-v1', JSON.stringify(area)); assert.deepEqual(g.savedArea(), area); }
    for (const area of [null, { name: ' ', x: 0, z: 0 }, { name: 'Bad', x: '0', z: 0 }, { name: 'Bad', x: 1001, z: 0 }, { name: 'Bad', x: 0, z: -1001 }, { name: 1, x: 0, z: 0 }]) { localStorage.setItem('p2ph-area-v1', JSON.stringify(area)); assert.equal(g.savedArea(), null); }
    localStorage.setItem('p2ph-area-v1', '{'); assert.equal(g.savedArea(), null);
  });

  const relocatingFixture = () => {
    const f = requestFixture(), { g } = f;
    g.picker = { hide() {}, show() {} }; g.city.ensure = async () => {};
    g.traffic.clear = () => {}; g.walkers.group = new Group();
    g.map.hide = () => { g.map.open = false; };
    g.map.showPick = (callbacks, at) => { g.map.open = true; g.map.pick = callbacks; g.map.at = at; };
    g.map.build = async () => {}; g.placeNear = (x, z) => { g.player.pos.set(x, .55, z); return true; };
    return f;
  };
  await test('latest destination wins even if obsolete loads resolve or reject after the new choice', async () => {
    for (const lateFailure of [false, true]) {
      const { g } = relocatingFixture(), waits = [];
      g.city.ensure = (x, z, radius, signal) => new Promise((resolve, reject) => waits.push({ resolve, reject, signal }));
      const old = g.relocate({ name:'Old destination',x:100,z:200 });
      const latest = g.relocate({ name:'Latest destination',x:-700,z:-800 });
      assert.equal(waits[0].signal.aborted,true); assert.equal(waits[1].signal.aborted,false);
      waits[1].resolve(); await latest;
      if(lateFailure) waits[0].reject(Error('old network request')); else waits[0].resolve();
      await old;
      assert.equal(g.area.name,'Latest destination'); assert.equal(g.player.pos.x,-700);
      assert.equal(g.relocating,false); assert.equal(g.choosing,false); assert.equal(g.paused,false);
      assert.equal(g.savedArea().name,'Latest destination');
    }
  });
  await test('failed loading or blocked placement retains destination for retry and keeps old progress', async () => {
    const savedError = console.error; console.error = () => {};
    try { for (const failure of ['network','blocked']) {
      const { g, hud } = relocatingFixture(), destination={name:'Selected destination',x:900,z:-900};
      const oldArea=g.area, oldOrder=order('offer'); g.order=oldOrder; g.coins=1234;
      localStorage.setItem('p2ph-area-v1',JSON.stringify(oldArea));
      const requests=[];
      g.city.ensure=async (x,z) => { requests.push([x,z]); if(failure==='network'&&requests.length===1) throw Error('offline'); };
      g.placeNear = (x,z) => { if(failure==='blocked'&&requests.length===1) return false; g.player.pos.set(x,.55,z); return true; };
      await g.relocate(destination);
      assert.equal(g.area,oldArea); assert.equal(g.order,oldOrder); assert.equal(g.coins,1234); assert.equal(g.player.pos.x,0);
      assert.deepEqual(g.savedArea(),oldArea); assert.match(hud.modals.at(-1),/Selected destination/);
      assert.equal(g.paused,true); assert.equal(g.choosing,true); assert.equal(g.relocating,false);
      hud.sheet.querySelector('#area-retry').emit('click'); await Promise.resolve(); await Promise.resolve();
      assert.deepEqual(requests,[[900,-900],[900,-900]]); assert.deepEqual(g.area,destination); assert.equal(g.player.pos.x,900); assert.equal(g.order,null);
    } } finally { console.error=savedError; }
  });
  await test('nearby retry opens at the selected pin, cancelling retains it, and Stay here resumes the old area', async () => {
    const { g, hud } = relocatingFixture(), c={name:'Pin',x:400,z:500}, old=g.area;
    g.placeNear=()=>false; await g.relocate(c);
    hud.sheet.querySelector('#area-nearby').emit('click'); assert.deepEqual(g.map.at,{x:400,z:500,scale:.5});
    g.map.pick.onCancel(); assert.match(hud.modals.at(-1),/Could not move to Pin/);
    hud.sheet.querySelector('#area-stay').emit('click'); assert.equal(g.area,old); assert.equal(g.paused,false); assert.equal(g.choosing,false);
  });
  await test('accepted orders and malformed or outside-map choices cannot relocate or start loading', async () => {
    const { g } = relocatingFixture(); let loads=0; g.city.ensure=async()=>{loads++;};
    g.order=order('pickup'); await g.relocate({name:'Valid',x:500,z:500}); assert.equal(loads,0); assert.equal(g.order.state,'pickup');
    g.order=null;
    for(const c of [{name:'Outside',x:1001,z:0},{name:'Invalid',x:NaN,z:0},{name:' ',x:0,z:0},{name:'String',x:'20',z:0}]) await g.relocate(c);
    assert.equal(loads,0); assert.equal(g.area.name,'Test area');
  });




  await test('pending requests block vehicle controls and acceptance clears held input without awarding money', () => {
    const { g, hud, sound, canvas } = fixture(); g.order = order('offer');
    hud.touchGas = true; hud.touchBrake = true; hud.touchSteer = 1; hud.steer = 1; g.flyQueued = true; g.keys.add('KeyW');
    assert.deepEqual(g.input(), { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false, jumpPressed: false });
    g.queueFlight(); assert.equal(g.flyQueued, false);
    const coins = g.coins; g.acceptOffer();
    assert.equal(document.activeElement, canvas, 'acceptance restores driving keys after closing its focus trap');
    assert.equal(g.order.state, 'toPickup'); assert.equal(g.routeTarget, g.order.pickup); assert.equal(g.order.t, 12, 'pickup approach does not start the delivery timer');
    assert.equal(g.coins, coins); assert.equal(g.totalDelivered, 0); assert.equal(g.keys.size, 0); assert.equal(hud.touchGas, false); assert.equal(hud.touchBrake, false);
    assert.deepEqual(hud.toasts.at(-1), ['Order accepted', 'teal']); g.acceptOffer(); assert.equal(sound.cues.filter(c => c === 'accept').length, 1);
  });

  await test('flight presentation follows actual airborne and landing state and landing cannot be retriggered', () => {
    const { g, hud } = fixture(); g.order = order('toPickup'); g.frame();
    assert.deepEqual(hud.flightStates.at(-1), { flying: false, descending: false });
    g.player.flying = true; 
    g.queueFlight(); assert.equal(g.flyQueued, true); 
    g.player.update = (_dt, input) => { if (input.flyPressed) { g.player.flying = false; g.player.descending = true; } };
    g.frame(); assert.deepEqual(hud.flightStates.at(-1), { flying: false, descending: true });
    g.handleKeyDown(key('KeyQ')); assert.equal(g.flyQueued, false); assert.equal(g.input().flyPressed, false, 'keyboard and button share busy landing state');
    g.player.update = () => { g.player.descending = false; };
    g.frame(); assert.deepEqual(hud.flightStates.at(-1), { flying: false, descending: false });
    g.queueFlight(); assert.equal(g.input().flyPressed, true, 'FLY is available again after touchdown');
  });

  await test('request identity and active pickup cards use real order data and change stage only after collection', () => {
    const { g, hud } = fixture();
    g.food = [{ s: { x: 100, z: 0, y: 0 }, board: 'Test kitchen', name: 'Test kitchen', pizza: true }];
    g.residences = [{ x: 350, z: 0, y: 0, label: 'Customer road' }];
    g.graph = { route: () => ({ len: 250 }) }; g.areaName = () => 'Test area'; g.r = () => .1;
    const first = g.makeOffer(), second = g.makeOffer(); assert.match(first.id, /^PZ-\d{4}$/); assert.notEqual(first.id, second.id);
    g.order = first; g.showOffer(); const offered = JSON.parse(hud.offerValue);
    assert.equal(offered.orderId, first.id); assert.equal(offered.pickupName, first.pickup.label); assert.equal(offered.customerName, first.drop.label);
    assert.deepEqual(hud.offerButtons.map(b => b.label), ['Accept order (E)', 'Decline']);
    g.drawMinimap = () => {}; g.acceptOffer(); Game.prototype.updateHud.call(g);
    assert.equal(hud.orderValue.stage, 'pickup'); assert.equal(hud.orderValue.state, 'Head to pickup'); assert.equal(hud.orderValue.next, first.drop.label); assert.equal(hud.orderValue.orderId, first.id);
    hud.activeAction = 'collect'; Game.prototype.updateHud.call(g); assert.equal(hud.orderValue.stage, 'collect');
    g.order.state = 'toDrop'; g.setTarget(g.order.drop); Game.prototype.updateHud.call(g);
    assert.equal(hud.orderValue.stage, 'delivery'); assert.equal(hud.orderValue.state, 'Deliver to customer'); assert.equal(hud.orderValue.title, first.drop.label);
  });

  await test('context actions follow real eligibility and require a sustained touch hold through pickup and handover', () => {
    const { g, hud } = fixture(); g.order = order('toPickup');
    g.frame(); assert.equal(hud.activeAction, null, 'no action while driving toward the kitchen');
    g.player.pos.set(100, .55, 0); g.frame(); assert.equal(hud.activeAction, 'collect');
    hud.touchAct = true; for (let i = 0; i < 5; i++) g.frame();
    assert.equal(g.order.state, 'toPickup'); const partial = g.actProgress; assert.ok(partial > 0 && partial < 1);
    hud.touchAct = false; g.frame(); assert.ok(g.actProgress < partial, 'early release stops collection');
    hud.touchAct = true; g.player.flying = true; g.frame();
    assert.equal(hud.activeAction, null); assert.equal(hud.touchAct, false); assert.equal(g.actProgress, 0);
    g.player.flying = false; g.player.speed = 3; g.frame(); assert.equal(hud.activeAction, null, 'must stop');
    g.player.speed = 0; g.player.pos.y = 12; g.frame(); assert.equal(hud.activeAction, null, 'must be on the correct level');
    g.player.pos.y = .55; g.frame(); hud.touchAct = true;
    for (let i = 0; i < 19; i++) g.frame();
    assert.equal(g.order.state, 'toDrop'); assert.equal(hud.activeAction, null); assert.equal(hud.touchAct, false, 'completion releases collection');
    assert.equal(g.totalDelivered, 0, 'collection does not count as handover');
    g.player.pos.set(500, .55, 0); g.frame(); assert.equal(hud.activeAction, 'handover');
    hud.touchAct = true; for (let i = 0; i < 19; i++) g.frame();
    assert.equal(g.order, null); assert.equal(g.totalDelivered, 1); assert.ok(g.coins > 500);
    assert.equal(hud.activeAction, null); assert.equal(hud.touchAct, false);
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




  await test('held keys retain driving input while repeated toggles and action acceptance stay single-shot', () => {
    const { g, sound } = fixture();
    g.handleKeyDown(key('KeyQ')); assert.equal(g.input().flyPressed, true); g.handleKeyDown(key('KeyQ', true)); assert.equal(g.input().flyPressed, false);
    g.handleKeyDown(key('KeyW')); g.handleKeyDown(key('KeyW', true)); assert.equal(g.input().throttle, 1);
    g.order = order('offer'); g.handleKeyDown(key('KeyF')); g.handleKeyDown(key('KeyF', true)); assert.equal(g.order.state, 'toPickup'); assert.equal(g.actHeld, false, 'accepting cannot carry a held action into pickup'); assert.equal(sound.cues.filter(c => c === 'accept').length, 1);
    const toggles = { KeyE: 'queueJump', KeyM: 'openMap', KeyR: 'rescue' };
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

  await test('pause exposes only current actions and settings Done is in its top header', () => {
    const { g, hud } = fixture();
    g.openPause();
    assert.equal(g.paused, true); assert.equal(hud.modalOpen, true);
    assert.deepEqual(hud.sheet.controls.map(button=>button.id), ['resume','settings','area','unstick','reset']);
    assert.doesNotMatch(hud.modals.at(-1), /Replay tips|id="tut"/);
    hud.sheet.querySelector('#settings').emit('click');
    assert.match(hud.modals.at(-1), /^<header class="sheet-header"><h2>Settings<\/h2><button[^>]*id="set-done">Done<\/button><\/header>/);
    assert.equal(hud.sheet.controls[0].id, 'set-done', 'Done precedes scrollable settings options');
    hud.sheet.querySelector('#set-done').emit('click');
    assert.ok(hud.sheet.querySelector('#resume')); assert.equal(g.paused,true);
    hud.sheet.querySelector('#resume').emit('click'); assert.equal(g.paused,false); assert.equal(hud.modalOpen,false);
  });

  await test('fullscreen fallback is honest, returns to gameplay and never opens beneath portrait or another menu', async () => {
    const flush = async () => { for(let i=0;i<12;i++)await Promise.resolve(); };
    {
      const {g,hud,environment}=fixture();g.keys.add('KeyW');hud.touchGas=true;
      g.requestFullscreen();await flush();
      assert.equal(g.paused,true);assert.equal(hud.modalOpen,true);assert.equal(g.keys.size,0);assert.equal(hud.touchGas,false);
      assert.match(hud.modals.at(-1),/Full screen was not available or the browser declined/);
      hud.sheet.querySelector('#fullscreen-done').emit('click');assert.equal(g.paused,false);assert.equal(hud.modalOpen,false);
      environment.document.fullscreenElement=environment.document.documentElement;
      let exited=0;environment.document.exitFullscreen=async()=>{exited++;environment.document.fullscreenElement=null;};
      g.requestFullscreen();await flush();assert.equal(exited,1);assert.equal(hud.modalOpen,false);
    }
    {
      const {g,hud,environment}=fixture();let resolve;
      environment.document.documentElement.requestFullscreen=()=>new Promise(done=>{resolve=done;});
      g.requestFullscreen();hud.rotationBlocked=true;resolve();await flush();
      assert.equal(hud.modalOpen,false,'a pending landscape request cannot put help under the portrait gate');assert.equal(g.paused,false);
    }
    {
      const {g,hud,environment}=fixture();let resolve;
      environment.document.documentElement.requestFullscreen=()=>new Promise(done=>{resolve=done;});
      g.requestFullscreen();g.openPause();const pause= hud.modals.at(-1);resolve();await flush();
      assert.equal(hud.modals.at(-1),pause,'pending request cannot replace a menu opened in the meantime');
    }
    {
      const {g,hud,environment}=fixture();
      environment.document.documentElement.requestFullscreen=async()=>{environment.document.fullscreenElement=environment.document.documentElement;};
      g.requestFullscreen();await flush();assert.equal(hud.modalOpen,false);assert.equal(g.paused,false);
    }
  });

  await test('paused, rotated, hidden and covered frames freeze gameplay and send inactive vehicle audio', () => {
    for (const blocker of ['paused', 'rotation', 'hidden', 'map', 'modal', 'tip', 'choosing', 'area']) {
      const { g, hud, sound, counts, environment } = fixture(); g.order = order('toDrop'); g.actProgress = 0.3;
      if (blocker === 'rotation') hud.rotationBlocked = true; else if (blocker === 'hidden') environment.document.hidden = true;
      else if (blocker === 'map') g.map.open = true; else if (blocker === 'modal') hud.modalOpen = true;
      else if (blocker === 'tip') hud.tip('Read this before continuing');
      else if (blocker === 'area') g.area = null; else g[blocker] = true;
      g.keys.add('KeyW'); g.frame();
      assert.deepEqual([g.t, g.minutes, g.order.t, g.order.heat, counts.player, counts.traffic, counts.city, counts.signals], [0, 480, 12, 100, 0, 0, 0, 0], blocker);
      assert.equal(sound.vehicles.at(-1).active, false, blocker);
      if (blocker === 'rotation') { assert.equal(g.keys.size, 0); assert.equal(g.actProgress, 0); }
    }
    const { g, counts, sound } = fixture(); g.order = order('toDrop'); g.frame();
    assert.ok(g.t > 0 && g.minutes > 480 && g.order.t > 12); assert.equal(counts.player, 1); assert.equal(counts.traffic, 1); assert.equal(counts.city, 1); assert.equal(counts.signals, 1); assert.equal(counts.signalSeconds, g.traffic.t); assert.equal(sound.vehicles.at(-1).active, true);
  });

  await test('an acknowledged tip freezes the world and order clock, clears held input and cannot enable flight or jump', () => {
    const { g, hud, counts, sound } = fixture(); g.order = order('toDrop');
    hud.touchGas = true; g.keys.add('KeyW'); g.actHeld = true; g.flyQueued = true;
    hud.tip('Stop and read the driving instructions');
    for (let i = 0; i < 30; i++) g.frame();
    assert.deepEqual([g.t, g.minutes, g.order.t, g.order.heat, counts.player, counts.traffic, counts.city, counts.signals], [0, 480, 12, 100, 0, 0, 0, 0]);
    assert.equal(g.keys.size, 0); assert.equal(g.actHeld, false); assert.equal(hud.touchGas, false); 
    assert.equal(sound.vehicles.at(-1).active, false);
    g.handleKeyDown(key('KeyW')); g.queueFlight(); g.queueJump();
    assert.equal(g.keys.size, 0); assert.equal(g.flyQueued, false); 
    assert.deepEqual(g.input(), { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false, jumpPressed: false });
    hud.tip(null); g.frame(); assert.ok(g.order.t > 12); assert.equal(counts.player, 1);

    g.order = null; g.queueOffer(0, 0); let offered = 0; g.showOffer = () => offered++;
    hud.tip('Another acknowledged tip'); g.tickOfferQueue(10000); assert.equal(offered, 0); assert.equal(g.nextOfferAt, 0);
    hud.tip(null); g.tickOfferQueue(10001); assert.equal(offered, 1);
  });

  await test('tutorial steps appear before simulation, remain dismissed and respect map/menu/offers without a replay action', () => {
    const { g, hud, counts } = fixture();
    globalThis.__roadsterV2Ui = { hud: () => hud, map: (_root, _zone, _getState, onClose) => ({
      open: false, tick() {}, handleKey() {}, show() { this.open = true; }, hide() { this.open = false; onClose(); },
    }) };
    g.start(); g.choosing = false; g.paused = false; g.area = { name: 'Test area', x: 0, z: 0 };
    g.tutorialTick = Game.prototype.tutorialTick.bind(g); g.order = order('offer');
    g.frame(); assert.equal(hud.tipOpen, false, 'offer UI gets uninterrupted acceptance');
    g.order.state = 'toPickup'; const before = counts.player;
    g.frame(); assert.equal(hud.tipOpen, true); assert.equal(g.tutStep, 2); assert.equal(counts.player, before, 'first instruction blocks before a drive frame');
    hud.tip(null); hud.onButton('tip-close'); assert.equal(g.tipDismissed, 2);
    g.frame(); assert.equal(hud.tipOpen, false, 'same step does not reopen'); assert.equal(counts.player, before + 1);
    g.player.pos.set(100, .55, 0); g.frame(); assert.equal(hud.tipOpen, true); assert.equal(g.tutStep, 3);
    g.openMap(); assert.equal(hud.tipOpen, false); g.tutorialTick(); assert.equal(hud.tipOpen, false, 'map owns focus');
    g.map.hide(); g.frame(); assert.equal(hud.tipOpen, true, 'unacknowledged step remains available after map closes');
    hud.tip(null); hud.onButton('tip-close');
    g.player.pos.set(0, .55, 0); g.frame(); assert.equal(hud.tipOpen, false, 'driving away cannot reopen acknowledged far-pickup guidance');
    g.player.pos.set(100, .55, 0); g.frame(); assert.equal(hud.tipOpen, false, 'returning cannot reopen acknowledged collection guidance');
    g.openPause();
    assert.equal(hud.modalOpen, true); g.tutorialTick(); assert.equal(hud.tipOpen, false, 'pause menu is not covered');
    assert.equal(hud.sheet.querySelector('#tut'), null, 'replay action is removed');
    hud.sheet.querySelector('#resume').emit('click'); g.frame();
    assert.equal(hud.modalOpen, false); assert.equal(hud.tipOpen, false, 'resuming never restarts acknowledged tips');
  });

  await test('the delivery-complete tip requires acknowledgement rather than an automatic hide timer', () => {
    const { g, hud } = fixture(); g.tutStep = 4; g.order = null;
    const oldTimeout = globalThis.setTimeout, scheduled = [];
    globalThis.setTimeout = (callback, delay) => { scheduled.push({ callback, delay }); return 1; };
    try { Game.prototype.tutorialTick.call(g); }
    finally { globalThis.setTimeout = oldTimeout; }
    assert.equal(g.tutStep, -1); assert.equal(hud.tipOpen, true); assert.match(hud.tipValue, /Delivered!/);
    assert.equal(scheduled.length, 0, 'no nine-second auto dismissal');
    for (let i = 0; i < 60; i++) g.frame(); assert.equal(hud.tipOpen, true);
    hud.tip(null); Game.prototype.tutorialTick.call(g); assert.equal(hud.tipOpen, false);
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

  await test('train impulses obey absolute road and airborne speed limits without changing carry or push separation', () => {
    for (const state of ['road', 'flying', 'descending']) {
      const { g } = fixture();
      g.player.flying = state === 'flying'; g.player.descending = state === 'descending';
      g.railContacts.afterPlayer = player => { player.speed = 100; player.pos.set(4, player.pos.y, 7); return { hit: true, impact: 10, carried: false }; };
      g.frame();
      assert.equal(g.player.speed, (state === 'road' ? 120 : 160) / 3.6, state);
      assert.equal(g.player.pos.x, 4); assert.equal(g.player.pos.z, 7, 'contact separation and carrier position stay intact');
      g.railContacts.afterPlayer = player => { player.speed = -100; return { hit: true, impact: 10, carried: false }; };
      g.frame(); assert.equal(g.player.speed, -6, 'backward impacts retain their direction and normal reverse cap');
    }
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

  console.log(`Delivery-only Game integration: ${checks} regression groups passed (offline production code).`);
} finally {
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  await rm(output, { recursive: true, force: true });
}

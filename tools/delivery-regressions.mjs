// Order lifecycle and data safety regressions. No WebGL or browser state mutation.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'roadster-delivery-'));
const oldDocument = globalThis.document;
let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: "export { Game } from './game/src/game/game'; export { RoadGraph } from './game/src/game/roadgraph'; export { eligiblePickup } from './game/src/game/pickups';", resolveDir: root, loader: 'ts' }, outfile: join(out, 'delivery.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { Game, RoadGraph, eligiblePickup } = await import(pathToFileURL(join(out, 'delivery.mjs')));
  globalThis.document = { hidden: false, documentElement: { classList: { contains: () => false } } };
  const makeOrder = () => ({ state: 'offer', pickup: { x: 100, z: 0, y: 0, label: 'Kitchen', sub: 'Test road' }, drop: { x: 600, z: 0, y: 0, label: 'Customer' }, dist: 500, limit: 120, heat: 80, slices: 8 });
  const fixture = () => {
    let generated = 0, shown = 0;
    const g = Object.assign(Object.create(Game.prototype), {
      order: null, nextOfferAt: null, paused: false, choosing: false, relocating: false, keys: new Set(),
      sound: { cue() {}, vehicle() {} }, map: { open: false }, level: 0, doneInLevel: 0, streak: 1, coins: 500, totalDelivered: 0, acceptingOrders: true,
      player: { pos: { x: 0, y: .57, z: 0 }, forward: { x: 1, z: 0 }, flying: false }, graph: { route: () => ({ len: 100 }) },
      hud: { modalOpen: false, tipOpen: false, rotationBlocked: false, resetControls() {}, setCruise() {}, orderAvailability() {}, offer(html) { if (html) shown++; }, toast() {} },
      makeOffer() { generated++; return makeOrder(); }, setTarget() {}, save() {},
    });
    return { g, generated: () => generated, shown: () => shown };
  };
  await test('post-handover pause retains the next offer and delivers it once after resume', () => {
    const { g, generated, shown } = fixture();
    g.order = { ...makeOrder(), state: 'toDrop' };
    g.completeDelivery();
    assert.equal(g.order, null); assert.equal(g.totalDelivered, 1); assert.ok(g.coins > 500);
    const due = g.nextOfferAt;
    g.paused = true; g.hud.modalOpen = true;
    g.tickOfferQueue(due + 6000);
    assert.equal(g.nextOfferAt, due); assert.equal(generated(), 0); assert.equal(shown(), 0);
    g.paused = false; g.hud.modalOpen = false; g.tickOfferQueue(due + 7000);
    assert.equal(g.order.state, 'offer'); assert.equal(g.nextOfferAt, null);
    g.tickOfferQueue(due + 9000);
    assert.equal(generated(), 1); assert.equal(shown(), 1);
  });
  await test('unpaused handover keeps its delay then presents the next order', () => {
    const { g, shown } = fixture();
    g.order = { ...makeOrder(), state: 'toDrop' }; g.completeDelivery();
    const due = g.nextOfferAt;
    g.tickOfferQueue(due - 1); assert.equal(shown(), 0);
    g.tickOfferQueue(due); assert.equal(shown(), 1);
  });
  await test('due offers wait for map, area picker, relocation and modal to release input', () => {
    for (const flag of ['map', 'choosing', 'relocating', 'modal']) {
      const { g, shown } = fixture(); g.queueOffer(2200, 0);
      const toggle = (value) => { if (flag === 'map') g.map.open = value; else if (flag === 'modal') g.hud.modalOpen = value; else g[flag] = value; };
      toggle(true); g.tickOfferQueue(5000); assert.equal(shown(), 0, flag); assert.equal(g.nextOfferAt, 2200);
      toggle(false); g.tickOfferQueue(5001); assert.equal(shown(), 1, flag);
    }
  });
  await test('pending offer retry is bounded and an accepted order cancels it', () => {
    const { g, shown } = fixture(); let attempts = 0;
    g.makeOffer = () => { attempts++; return null; }; g.queueOffer(0, 0);
    g.tickOfferQueue(0); assert.equal(attempts, 6); assert.equal(g.nextOfferAt, 1000);
    g.tickOfferQueue(999); assert.equal(attempts, 6);
    const active = { ...makeOrder(), state: 'toPickup' }; g.order = active;
    g.tickOfferQueue(1000); assert.equal(g.order, active); assert.equal(g.nextOfferAt, null); assert.equal(shown(), 0);
  });
  await test('direct offer rendering is blocked under a pause or map overlay', () => {
    const { g, generated, shown } = fixture();
    g.paused = true; g.showOffer(); g.paused = false; g.map.open = true; g.showOffer();
    assert.equal(generated(), 0); assert.equal(shown(), 0);
  });
  await test('offer approach uses the same legal carriageway and junction turn as accepted guidance', () => {
    const { g } = fixture(); let html = '';
    g.graph = new RoadGraph([{ id: 'arterial', seg: 'arterial', from: 'a', to: 'b', pts: [[0, 0], [200, 0]], cls: 'primary', w: 14, lanes: 4, oneway: null, elev: null, name: 'Divided road', maxspeed: null }]);
    // Pickup is close but on the other side of a median; crossing immediately is illegal.
    g.player.pos = { x: 20, y: .57, z: -3.5 };
    g.order = { ...makeOrder(), pickup: { ...makeOrder().pickup, x: 10, z: 3.5 } };
    const live = g.graph.route(20, -3.5, 10, 3.5, { hx: 1, hz: 0, y: .57 });
    assert.equal(live.len, 377); assert.ok(live.pts.some(p => p[0] === 200));
    assert.ok(g.graph.route(20, -3.5, 10, 3.5).len < live.len, 'fixture exposes the former heading-free underestimate');
    g.hud.offer = (value) => { html = value; }; g.showOffer();
    assert.match(html, /377 m to pickup/);
  });
  await test('offer approach preserves current deck height and uses overview routing while flying', () => {
    const { g } = fixture(); const calls = [];
    g.player.pos.y = 9.5; g.player.forward = { x: -.6, z: .8 };
    g.graph.route = (...args) => { calls.push(args); return { len: 150, complete: false }; };
    let html = ''; g.hud.offer = (value) => { html = value; };
    g.showOffer(); assert.deepEqual(calls[0][4], { hx: -.6, hz: .8, y: 9.5 });
    assert.match(html, /About 150 m to pickup/);
    g.player.flying = true; g.showOffer(); assert.equal(calls[1][4], undefined);
  });
  await test('pickup category matching distinguishes food tokens from public safety and substrings', () => {
    const poi = { id: 'ordinary', name: 'Source name', board: 'Source board' }, places = new Set(['hyderabad']);
    for (const category of ['police_station', 'public_safety_service', 'Barber', 'teacher', 'food_bank', 'restaurant_supply', 'food_and_beverage_retail', 'pet_food_store', 'food_wholesaler']) {
      assert.equal(eligiblePickup({ ...poi, category }, places), false, category);
    }
    for (const category of ['restaurant', 'fast_food', 'food_court', 'food_stall', 'food_truck', 'pub', 'café', 'Food and Dining > Bakeries']) {
      assert.equal(eligiblePickup({ ...poi, category }, places), true, category);
    }
    assert.equal(eligiblePickup({ ...poi, name: 'Police Canteen', board: 'Police Canteen', category: 'restaurant' }, places), true);
    assert.equal(eligiblePickup({ ...poi, pickupEligible: false }, places), false);
    assert.equal(eligiblePickup({ ...poi, board: 'Hyderabad' }, places), false);
  });
  await test('legacy police POIs are excluded from kitchens without altering city names or source records', async () => {
    const corePath = join(root, 'game/public/city/core.pack.wasm');
    const bytes = await readFile(corePath), core = JSON.parse(gunzipSync(bytes));
    const excluded = ['b_6d4468aa-c5da-40', 'b_d6fc7fdd-c2c9-4f'];
    const names = ['Kushaiguda Traffic PS', 'Bhagyanagar Institute of Police'];
    for (let i = 0; i < excluded.length; i++) {
      const p = core.food.find((p) => p.id === excluded[i]); assert.ok(p, excluded[i]); assert.equal(p.name, names[i]);
    }
    const g = Object.assign(Object.create(Game.prototype), { zone: core, food: [], residences: [] });
    g.prepareStops();
    for (const id of excluded) assert.equal(g.food.some((p) => p.id === id), false);
    const places = new Set(core.places.map((p) => p.name.toLowerCase()).concat(['rtc x roads', 'rtc cross roads', 'hyderabad', 'secunderabad']));
    const previous = core.food.filter((p) => p.board.trim().length >= 3 && !places.has(p.board.toLowerCase().trim()));
    assert.equal(previous.length - g.food.length, 2, 'only the two documented legacy kitchens change');
    assert.deepEqual(await readFile(corePath), bytes, 'the city pack and its storefront identities stay untouched');
  });
  console.log(`${checks} delivery/pickup regression groups passed.`);
} finally { globalThis.document = oldDocument; await rm(out, { recursive: true, force: true }); }

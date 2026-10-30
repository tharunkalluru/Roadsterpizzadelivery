import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { RoadGraph } from '../../src/game/roadgraph';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';
import { MYSTERY_SAVE_KEY } from '../../src/delivery/systems/progress-system';
import { loadLevels } from '../../src/delivery/content/levels';

const originals = new Map(['window', 'document', 'localStorage', 'setTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
test.after(() => { for (const [key, value] of originals) if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; });
class Button {
  listeners: (() => unknown)[] = [];
  addEventListener(_event: string, listener: () => unknown) { this.listeners.push(listener); }
  async click() { for (const listener of this.listeners) await listener(); }
}
function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: {} },
    document: { configurable: true, value: { getElementById: () => null, documentElement: { classList: { remove() {} } } } },
    localStorage: { configurable: true, value: storage },
    setTimeout: { configurable: true, value: () => 0 }, // Map prewarm scheduling is outside these relocation tests.
  });
  const controller = new DeliveryController(loadLevels(), new EventBus<DeliveryEvents>(), storage);
  controller.progress.complete(controller.levels[0].id); controller.progress.complete(controller.levels[1].id);
  const counts = { retry: 0, carriers: 0, detector: 0, traffic: 0, input: 0, hud: 0, focus: 0 };
  const controls = new Map<string, Button>();
  const hud: any = {
    html: null, toasts: [] as string[], resetControls() { counts.input++; }, tip() {}, offer() {}, pickupStatus() {},
    toast(text: string) { this.toasts.push(text); },
    modal(html: string | null, bind?: (sheet: any) => void) {
      this.html = html; controls.clear();
      for (const match of html?.matchAll(/id="([^"]+)"/g) || []) controls.set(match[1], new Button());
      if (bind) bind({ querySelector: (selector: string) => controls.get(selector.slice(1)) ?? null });
    },
  };
  const loads: { x: number; z: number; radius: number; signal: AbortSignal }[] = [];
  const placements: { x: number; z: number; campaign: boolean }[] = [];
  const g: any = Object.assign(Object.create(Game.prototype), {
    carrierPickupMode: true, opts: { sessionStorage: storage },
    area: { name: 'Old area', x: 20, z: 30 }, zone: { bounds: { minX: -20000, minZ: -20000, maxX: 20000, maxZ: 20000 } },
    story: { controller, get activeOrder() { return !!controller.activeLevel && !controller.complete; }, retry() { counts.retry++; controller.retry(); } },
    city: { radius: 700, focus: [20, 30], async ensure(x: number, z: number, radius: number, signal: AbortSignal) { loads.push({ x, z, radius, signal }); } },
    player: { pos: new THREE.Vector3(20, .55, 30), yaw: 0, place(x: number, z: number, yaw: number, y: number) { this.pos.set(x, y + .55, z); this.yaw = yaw; } },
    map: { open: true, pick: null, at: null, hide() { this.open = false; }, async build() {}, showPick(pick: unknown, at: unknown) { this.open = true; this.pick = pick; this.at = at; } },
    picker: { hide() {} }, hud,
    sound: { cue() {}, vehicle() {} }, keys: new Set(),
    carriers: { clear() { counts.carriers++; } }, pickupDetector: { reset() { counts.detector++; } }, carrierSpawnT: 4,
    traffic: { clear() { counts.traffic++; } }, walkers: { list: [], group: new THREE.Group() },
    camPos: new THREE.Vector3(1, 2, 3), camLook: new THREE.Vector3(1, 2, 3), orbitYaw: 1, orbitDist: 2,
    engine: { renderer: { domElement: { focus() { counts.focus++; } } } }, clock: { getDelta() { return 0; } },
    order: null, relocating: false, paused: false, choosing: false,
    setTarget() {}, updateHud() { counts.hud++; }, areaName: () => 'Nearby street',
    placeNear(x: number, z: number, campaign: boolean) { placements.push({ x, z, campaign }); this.player.pos.set(x, .55, z); return true; },
  });
  storage.setItem('p2ph-area-v1', JSON.stringify(g.area));
  const savedProgress = () => ({ ids: controller.progress.completedIds, cards: controller.progress.cards, stage: controller.progress.restaurantStage, current: controller.progress.currentLevel, raw: storage.getItem(MYSTERY_SAVE_KEY) });
  return { g, controller, hud, loads, placements, counts, controls, storage, savedProgress };
}
async function click(f: ReturnType<typeof fixture>, id: string) {
  const button = f.controls.get(id); assert.ok(button, `expected actionable ${id}, got ${f.hud.html}`); await button.click();
}

// Coordinates are synthetic selections: these test the production async state flow,
// not the packed city's separate geometry/placement acceptance checks.
test('campaign free roaming can move from the map and each selected area keeps its own coordinates and progress', async () => {
  const f = fixture(), progress = f.savedProgress();
  const areas = [{ name: 'RTC X Roads', x: 100, z: 200 }, { name: 'Uppal', x: 700, z: -600 }, { name: 'HITEC City', x: -1200, z: 800 }, { name: 'IKEA', x: -1400, z: -300 }];
  assert.equal(f.g.canMoveFromMap(), true, 'level-based free roam must not permanently disable map relocation');
  for (const area of areas) {
    await f.g.relocate(area, 'map');
    assert.deepEqual(f.g.area, area); assert.deepEqual(f.g.savedArea(), area);
    assert.equal(f.g.player.pos.x, area.x); assert.equal(f.g.player.pos.z, area.z);
    assert.deepEqual(f.placements.at(-1), { x: area.x, z: area.z, campaign: false });
    assert.deepEqual(f.savedProgress(), progress, 'relocation cannot erase levels, celebrity cards or restaurant upgrades');
    assert.equal(f.g.relocating, false); assert.equal(f.g.choosing, false); assert.equal(f.g.paused, false);
  }
  assert.equal(f.counts.retry, areas.length); assert.equal(f.counts.detector, areas.length); assert.equal(f.counts.carriers, areas.length);
});

for (const failure of ['network', 'blocked'] as const) test(`a ${failure} map failure keeps the exact pin and completed progress until a same-pin retry succeeds`, async () => {
  const f = fixture(), oldArea = f.g.area, oldPos = f.g.player.pos.clone(), progress = f.savedProgress();
  const destination = { name: 'Selected pin', x: 900, z: -900 }; let attempts = 0;
  const originalEnsure = f.g.city.ensure;
  f.g.city.ensure = async (...args: any[]) => { attempts++; await originalEnsure(...args); if (failure === 'network' && attempts === 1) throw Error('offline fixture'); };
  const originalPlace = f.g.placeNear;
  f.g.placeNear = (...args: any[]) => { if (failure === 'blocked' && attempts === 1) return false; return originalPlace.apply(f.g, args); };
  await f.g.relocate(destination, 'map');
  assert.equal(f.g.area, oldArea); assert.deepEqual(f.g.player.pos, oldPos); assert.deepEqual(f.g.savedArea(), oldArea);
  assert.deepEqual(f.savedProgress(), progress); assert.equal(f.counts.retry, 0);
  assert.match(f.hud.html, /Could not move to Selected pin/); assert.ok(!f.controls.has('campaign-retry'));
  assert.equal(f.g.paused, true); assert.equal(f.g.choosing, true); assert.equal(f.g.relocating, false);
  await click(f, 'area-retry');
  assert.deepEqual(f.loads.map(p => [p.x, p.z]), [[900, -900], [900, -900]]);
  assert.deepEqual(f.g.area, destination); assert.deepEqual(f.g.savedArea(), destination);
  assert.equal(f.placements.at(-1)?.campaign, false, 'Retry must retain the map source instead of enforcing campaign startup rules');
  assert.equal(f.counts.retry, 1); assert.deepEqual(f.savedProgress(), progress);
});

test('nearby selection retains the failed map pin through cancel and Stay here restores the existing area', async () => {
  const f = fixture(), destination = { name: 'Blocked pin', x: 400, z: 500 }, old = f.g.area, progress = f.savedProgress();
  f.g.placeNear = () => false;
  await f.g.relocate(destination, 'map');
  await click(f, 'area-nearby'); assert.deepEqual(f.g.map.at, { x: 400, z: 500, scale: .5 });
  f.g.map.pick.onCancel(); assert.match(f.hud.html, /Could not move to Blocked pin/);
  assert.equal(f.g.map.open, false, 'cancel must close the nearby map before restoring the failure options');
  assert.ok(f.controls.has('area-retry')); assert.ok(f.controls.has('area-nearby')); assert.ok(f.controls.has('area-stay'));
  await click(f, 'area-stay');
  assert.equal(f.g.area, old); assert.deepEqual(f.g.savedArea(), old); assert.deepEqual(f.savedProgress(), progress);
  assert.equal(f.g.paused, false); assert.equal(f.g.choosing, false); assert.equal(f.g.map.open, false, 'Stay here returns to driving without a hidden-open map'); assert.equal(f.counts.retry, 0);
});

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('Stay here keeps the game paused until the old-area tiles and prepared frame are ready', async () => {
  const f = fixture(), destination = { name: 'Far blocked pin', x: 9000, z: -9000 }, oldArea = f.g.area;
  const oldPos = f.g.player.pos.clone(), progress = f.savedProgress(), phases: string[] = [];
  f.g.placeNear = () => false;
  await f.g.relocate(destination, 'map');
  const tiles = deferred(), frame = deferred();
  let returnSignal: AbortSignal | null = null;
  f.g.city.ensure = (x: number, z: number, radius: number, signal: AbortSignal) => {
    assert.equal(x, oldPos.x); assert.equal(z, oldPos.z); assert.ok(radius >= 650);
    returnSignal = signal; phases.push('tiles-requested'); return tiles.promise;
  };
  f.g.updateCamera = (dt: number) => { assert.equal(dt, 0); phases.push('camera-prepared'); };
  f.g.engine.prepareFrame = () => { phases.push('frame-requested'); return frame.promise; };
  const returning = click(f, 'area-stay');
  assert.deepEqual(phases, ['tiles-requested']); assert.ok(returnSignal); assert.equal((returnSignal as AbortSignal).aborted, false);
  assert.equal(f.g.paused, true); assert.equal(f.g.choosing, true); assert.equal(f.g.relocating, true);
  assert.equal(f.g.map.open, false); assert.equal(f.hud.html, null);
  assert.deepEqual(f.g.player.pos, oldPos); assert.deepEqual(f.savedProgress(), progress);
  tiles.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(phases, ['tiles-requested', 'camera-prepared', 'frame-requested']);
  assert.equal(f.g.paused, true); assert.equal(f.g.relocating, true, 'draw preparation also stays behind the loading gate');
  frame.resolve(); await returning;
  assert.equal(f.g.area, oldArea); assert.deepEqual(f.g.savedArea(), oldArea); assert.deepEqual(f.g.player.pos, oldPos);
  assert.deepEqual(f.savedProgress(), progress); assert.equal(f.counts.retry, 0); assert.equal(f.counts.carriers, 0);
  assert.equal(f.g.paused, false); assert.equal(f.g.choosing, false); assert.equal(f.g.relocating, false); assert.equal(f.g.map.open, false);
});

test('failed old-area restoration stays paused and retains both the original selected pin and a retryable Stay here', async () => {
  const f = fixture(), destination = { name: 'Selected failed pin', x: 9000, z: -9000 }, oldArea = f.g.area;
  const oldPos = f.g.player.pos.clone(), progress = f.savedProgress(); let returns = 0;
  f.g.placeNear = () => false;
  const ensure = f.g.city.ensure;
  f.g.city.ensure = async (...args: any[]) => {
    await ensure(...args);
    if (args[0] === oldPos.x && args[1] === oldPos.z && ++returns === 1) throw Error('old-area network fixture');
  };
  await f.g.relocate(destination, 'map');
  await click(f, 'area-stay');
  assert.equal(f.g.paused, true); assert.equal(f.g.choosing, true); assert.equal(f.g.relocating, false);
  assert.match(f.hud.html, /previous area could not reload/); assert.match(f.hud.html, /Selected failed pin/);
  assert.ok(f.controls.has('area-stay')); assert.ok(f.controls.has('area-retry')); assert.ok(!f.controls.has('campaign-retry'));
  assert.equal(f.g.area, oldArea); assert.deepEqual(f.g.player.pos, oldPos); assert.deepEqual(f.savedProgress(), progress);
  await click(f, 'area-retry'); // The original failed pin remains actionable, rather than silently changing to the return coordinates.
  assert.deepEqual(f.loads.at(-1) && [f.loads.at(-1)!.x, f.loads.at(-1)!.z], [9000, -9000]);
  await click(f, 'area-stay');
  assert.deepEqual(f.loads.map(p => [p.x, p.z]), [[9000, -9000], [20, 30], [9000, -9000], [20, 30]]);
  assert.equal(f.g.area, oldArea); assert.deepEqual(f.g.player.pos, oldPos); assert.deepEqual(f.savedProgress(), progress);
  assert.equal(f.g.paused, false); assert.equal(f.g.relocating, false); assert.equal(f.counts.retry, 0);
});

test('choosing a nearby street after cancel keeps map placement rules on every retry callback', async () => {
  const f = fixture(), destination = { name: 'Blocked pin', x: 400, z: 500 }, originalPlace = f.g.placeNear;
  f.g.placeNear = () => false; await f.g.relocate(destination, 'map');
  await click(f, 'area-nearby'); f.g.map.pick.onCancel(); await click(f, 'area-nearby');
  f.g.placeNear = originalPlace;
  await f.g.map.pick.onPick(450, 550);
  assert.deepEqual(f.g.area, { name: 'Nearby street', x: 450, z: 550 });
  assert.deepEqual(f.placements.at(-1), { x: 450, z: 550, campaign: false });
});

for (const lateFailure of [false, true]) test(`the latest map pin wins when an aborted earlier load ${lateFailure ? 'rejects' : 'resolves'} late`, async () => {
  const f = fixture(), progress = f.savedProgress();
  const waits: { resolve: () => void; reject: (e: Error) => void; signal: AbortSignal }[] = [];
  f.g.city.ensure = (_x: number, _z: number, _radius: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => waits.push({ resolve, reject, signal }));
  const old = f.g.relocate({ name: 'Old pin', x: 100, z: 200 }, 'map');
  const latestArea = { name: 'Latest pin', x: -700, z: -800 }, latest = f.g.relocate(latestArea, 'map');
  assert.equal(waits[0].signal.aborted, true); assert.equal(waits[1].signal.aborted, false);
  waits[1].resolve(); await latest;
  if (lateFailure) waits[0].reject(Error('obsolete failed load')); else waits[0].resolve();
  await old;
  assert.deepEqual(f.g.area, latestArea); assert.deepEqual(f.g.savedArea(), latestArea);
  assert.deepEqual(f.placements, [{ x: -700, z: -800, campaign: false }]);
  assert.equal(f.counts.retry, 1); assert.deepEqual(f.savedProgress(), progress); assert.equal(f.hud.html, null);
});

test('an active story delivery or accepted legacy order blocks map availability and relocation before loading', async () => {
  const f = fixture(), progress = f.savedProgress();
  assert.equal(f.controller.pickup(), true); assert.equal(f.g.canMoveFromMap(), false);
  const active = f.controller.activeLevel;
  await f.g.relocate({ name: 'Blocked move', x: 600, z: 700 }, 'map');
  assert.equal(f.loads.length, 0); assert.equal(f.controller.activeLevel, active); assert.equal(f.counts.retry, 0);
  assert.deepEqual(f.savedProgress(), progress); assert.match(f.hud.toasts.at(-1), /Finish this delivery/);
  f.controller.retry(); f.g.order = { state: 'pickup' }; assert.equal(f.g.canMoveFromMap(), false);
  await f.g.relocate({ name: 'Blocked legacy move', x: 600, z: 700 }, 'map'); assert.equal(f.loads.length, 0);
  f.g.order = { state: 'offer' }; assert.equal(f.g.canMoveFromMap(), true);
  f.g.relocating = true; assert.equal(f.g.canMoveFromMap(), false);
  f.g.relocating = false; f.g.area = null; assert.equal(f.g.canMoveFromMap(), false, 'no move action before a world area exists');
});

test('finished campaign map relocation preserves all seven completed cards and the final restaurant stage', async () => {
  const f = fixture();
  for (const level of f.controller.levels) if (!f.controller.progress.completedIds.includes(level.id)) f.controller.progress.complete(level.id);
  const progress = f.savedProgress();
  assert.equal(f.controller.progress.finished, true); assert.equal(f.g.canMoveFromMap(), true);
  await f.g.relocate({ name: 'Explore after opening', x: -800, z: 1200 }, 'map');
  assert.deepEqual(f.savedProgress(), progress); assert.equal(f.controller.progress.finished, true);
  assert.equal(f.controller.progress.cards.length, f.controller.levels.length); assert.equal(f.counts.retry, 1);
});

test('campaign startup retains the main-road constraint, including startup retry, while map relocation opts out', async () => {
  const f = fixture(), original = f.g.placeNear;
  f.g.placeNear = () => false; const start = { name: 'Campaign start', x: 800, z: 600 };
  await f.g.relocate(start);
  assert.ok(f.controls.has('campaign-retry'), 'startup uses its own recovery rather than the map retry choices');
  f.g.placeNear = original; await click(f, 'campaign-retry');
  assert.deepEqual(f.placements.at(-1), { x: 800, z: 600, campaign: true });
  await f.g.relocate({ name: 'Map road', x: 1200, z: 1000 }, 'map');
  assert.equal(f.placements.at(-1)?.campaign, false);
});

test('the real placement algorithm accepts an ordinary residential map road but refuses it as a campaign main-road start', () => {
  const f = fixture();
  const road: any = { id: 'local', seg: 'local', name: 'Residential street', cls: 'residential', w: 8, lanes: 2, oneway: null, from: 'a', to: 'b', pts: [[0, 0], [300, 0]], elev: null, maxspeed: null };
  const surface = { ax: 0, az: 0, bx: 300, bz: 0, ya: 0, yb: 0, hw: 4, kind: 'road', e: road };
  const surfaceGrid = new Map(); for (let x = -1; x <= 11; x++) for (let z = -1; z <= 1; z++) surfaceGrid.set(`${x},${z}`, [surface]);
  f.g.graph = new RoadGraph([road]); f.g.city = { surfaceGrid, buildingGrid: new Map(), obstacles: new Map(), walls: new Map(), waterGrid: new Map(), movingRail: [] };
  f.g.placeNear = Game.prototype.placeNear;
  assert.equal(f.g.placeNear(120, 0, true), false, 'campaign startup cannot silently use a narrow local street');
  assert.equal(f.g.placeNear(120, 0, false), true, 'a safe player-selected local road is a valid map relocation');
  assert.ok(Math.abs(f.g.player.pos.x - 120) < 1); assert.ok(Math.abs(f.g.player.pos.z) <= 2.5);
});

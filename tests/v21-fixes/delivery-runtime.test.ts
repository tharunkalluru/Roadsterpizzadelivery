import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeliveryRuntime, deliverySurfaceHeight } from '../../src/delivery/runtime';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { loadLevels } from '../../src/delivery/content/levels';
import { RoadGraph } from '../../src/game/roadgraph';
import type { DeliveryModule, DeliveryModuleContext, DeliveryPoint, ModuleArrival } from '../../src/delivery/modules/types';
import type { DeliveryUIActions, DeliveryView } from '../../src/delivery/ui/view-model';
import type { Game } from '../../src/game/game';
import type { MovingRailBody } from '../../src/game/moving-rail';
import { createDeliveryModule } from '../../src/delivery/modules';
import { MYSTERY_SAVE_KEY, ProgressSystem } from '../../src/delivery/systems/progress-system';

class UIAdapter {
  visible = true; collectionOpen = false; model: DeliveryView | null = null; disposed = 0;
  get blocking() { return this.visible && (this.collectionOpen || !!this.model?.phone || !!this.model?.completion); }
  setVisible(visible: boolean) { this.visible = visible; }
  openCollection() { this.collectionOpen = true; }
  update(model: DeliveryView) { this.model = model; }
  dispose() { this.disposed++; }
}
class ModuleAdapter implements DeliveryModule {
  ctx!: DeliveryModuleContext;
  target: DeliveryPoint = { x: 0, y: 0, z: 0 };
  status = { instruction: 'Match the truck', canDrop: true, actionLabel: 'DROP' };
  supports: MovingRailBody[] = [];
  movement: any = { mode: 'normal' };
  arrival?: ModuleArrival;
  frames = 0; teardownCount = 0;
  setup(ctx: DeliveryModuleContext) { this.ctx = ctx; this.target = { ...ctx.destination }; ctx.onTarget?.(this.target); }
  update() { this.frames++; }
  onDrop() { if (this.ctx.canInteract?.()) this.ctx.emit('done'); }
  teardown() { this.teardownCount++; }
}
function fixture({ oneway, missingRoads = false, levelIndex = 0, realModule = false }: { oneway?: string; missingRoads?: boolean; levelIndex?: number; realModule?: boolean } = {}) {
  const source = loadLevels(), levels = levelIndex ? [{ ...source[levelIndex], level: 1 }] : source; levels[0].destination = { label: 'Mapped highway', x: 150, y: 0, z: 0 };
  const events = new EventBus<DeliveryEvents>(), ui = new UIAdapter(), module = new ModuleAdapter();
  const graph = new RoadGraph(missingRoads ? [] : [{ id: 'road', cls: 'primary', w: 16, pts: [[0, 0], [300, 0]], oneway } as any], []);
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  let actions!: DeliveryUIActions, routeResets = 0, resets = 0, focus = 0, markerClears = 0, detectorResets = 0, laneDir = 0;
  const game: any = {
    deliveryEvents: events, graph, rail: { bodies: [] }, paused: false, map: { open: false },
    player: { pos: { x: 145, y: .55, z: 0 }, yaw: 0, speed: 0, flying: false, descending: false, jumping: false, deliveryMotion: undefined },
    traffic: { pickLane(_edge: unknown, _width: number, _group: string, dir: number) { laneDir = dir; return 3; } },
    city: { surfaceGrid: new Map(), buildingGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] },
    hud: { root: null, storyBlocked: false, rotationBlocked: false, set() {}, pickupStatus() {} },
    carriers: { clear() { markerClears++; } }, pickupDetector: { reset() { detectorResets++; } },
    sound: { cue() {} }, resetInput() { resets++; }, clock: { getDelta() { return .016; } },
    engine: { scene: new THREE.Scene(), renderer: { domElement: { focus() { focus++; } } } }, beacon: new THREE.Group(),
    routeTarget: null,
    setTarget(target: unknown) { routeResets++; game.routeTarget = target; },
  };
  const runtime = new DeliveryRuntime(game as Game, { levels,
    storage,
    uiFactory(_host, callbacks) { actions = callbacks; return ui; }, moduleFactory(name) { return realModule ? createDeliveryModule(name) : module; },
  });
  return { runtime, game, events, ui, module, storage, get actions() { return actions; },
    stats: () => ({ routeResets, resets, focus, markerClears, detectorResets, laneDir }) };
}
function pickup(f: ReturnType<typeof fixture>) { f.events.emit('orderPicked', { carrierId: 'anonymous-auto', position: { x: 145, y: 3, z: 0 } }); }
function approach(f: ReturnType<typeof fixture>) {
  const target = f.runtime.destination!;
  Object.assign(f.game.player.pos, { x: target.x, z: target.z });
}
function completeCall(f: ReturnType<typeof fixture>) {
  approach(f);
  f.runtime.tick(.016, true);
  assert.equal(f.runtime.controller.calls.buttonState, f.runtime.controller.activeLevel?.callMode === 'PLAYER_CALLS' ? 'enabled' : 'ringing'); f.actions.call();
  while (f.runtime.controller.calls.active) f.actions.advanceCall(f.runtime.controller.calls.currentLine?.replies ? 0 : undefined);
}

test('runtime connects anonymous pickup, mandatory call, module gate and completion without identity leak', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016);
  assert.equal(f.runtime.controller.state, 'EN_ROUTE'); assert.equal(f.module.ctx.canInteract?.(), false);
  assert.equal(f.ui.model?.phone, null); assert.ok(!JSON.stringify(f.ui.model).includes('Allu Arjun'));
  f.module.ctx.emit('done'); assert.equal(f.runtime.controller.state, 'EN_ROUTE', 'rogue module cannot bypass call');
  completeCall(f); assert.equal(f.module.ctx.canInteract?.(), true); assert.equal(f.runtime.controller.state, 'SETPIECE');
  f.actions.drop(); assert.equal(f.runtime.controller.state, 'LEVEL_COMPLETE');
  assert.equal(f.runtime.controller.progress.completedIds.length, 1); assert.equal(f.module.teardownCount, 1);
  assert.equal(f.game.routeTarget, null); assert.equal(f.runtime.destination, null);
  assert.equal(f.ui.model?.completion?.name, 'Allu Arjun');
  f.actions.continue(); assert.equal(f.runtime.controller.state, 'ROAMING');
  assert.equal(f.runtime.controller.progress.currentLevel, 2); assert.equal(f.stats().detectorResets, 1);
});

test('mapped one-way route retains the legal direction and gives the oversized interior truck central clearance', () => {
  const f = fixture({ oneway: 'forward' }); pickup(f); f.runtime.beforePlayer(.016);
  const route = f.module.ctx.route!;
  assert.equal(f.stats().laneDir, -1); assert.ok(route.length > 10);
  assert.ok(route[0].x > route[route.length - 1].x, 'dir -1 is already reversed by pointAt; do not reverse twice');
  assert.ok(route.every(point => Math.abs(point.z) < .001), 'wide interior truck stays centrally within the same one-way carriageway');
  assert.ok(Math.min(...route.map(point => Math.abs(point.x - 150))) <= 4, 'route must pass the chosen anchor');
});

test('moving target stays frame-exact while route invalidation is bounded', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016);
  const initial = f.stats().routeResets;
  for (let i = 1; i <= 1000; i++) {
    f.runtime.beforePlayer(.016);
    f.module.ctx.onTarget?.({ x: 150 + i * .12, y: 3, z: 3, label: 'Mapped highway' });
  }
  assert.equal(f.runtime.destination?.x, 270); assert.equal(f.game.routeTarget.x, 270);
  assert.equal(f.game.beacon.position.x, 270);
  assert.ok(f.stats().routeResets - initial <= 5, '120 metres of motion must not reset road geometry every3metres');
  const resets = f.stats().routeResets;
  f.module.ctx.onTarget?.({ x: 300, y: 6, z: 3, label: 'Next set' });
  assert.equal(f.stats().routeResets, resets + 1, 'a new chain target changes immediately');
});

test('delivery truck uses the full mapped segment with junction margins instead of stopping after 180m', () => {
  const f = fixture({ oneway: 'forward' }); pickup(f); f.runtime.beforePlayer(.016);
  const route = f.module.ctx.route!;
  const distance = route.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - route[index].x, point.z - route[index].z), 0);
  assert.ok(distance > 270, '300m mapped segment must provide nearly its full travel distance');
  assert.equal(route[0].x, 286); assert.equal(route[route.length - 1].x, 14);
  assert.ok(route.every(point => point.x >= 14 && point.x <= 286), 'leave room for the full twenty metre body, including its two metre centre offset');
  assert.equal(f.module.ctx.routeLoop, undefined, 'finite roads do not become invented loops');
});

test('invalid targets and stale module callbacks cannot restore a completed map marker', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016);
  const previous = { ...f.runtime.destination! };
  f.module.ctx.onTarget?.({ x: NaN, y: 0, z: 0 }); assert.deepEqual(f.runtime.destination, previous);
  completeCall(f); f.actions.drop();
  f.module.ctx.onTarget?.({ x: 200, y: 5, z: 0 }); f.module.ctx.emit('done'); f.module.ctx.emit('failed', { reason: 'stale' });
  assert.equal(f.runtime.destination, null); assert.equal(f.game.routeTarget, null);
  assert.equal(f.runtime.controller.progress.completedIds.length, 1); assert.equal(f.runtime.controller.lastFailure, '');
});

test('phone timers use active time, not background/map time, and module physics stays frozen under phone', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); approach(f); f.runtime.tick(.016, true); f.actions.call();
  f.runtime.tick(.1, true); const before = f.runtime.controller.calls.elapsed, frames = f.module.frames;
  assert.equal(f.game.hud.storyBlocked, true); f.runtime.beforePlayer(.1); assert.equal(f.module.frames, frames);
  f.runtime.tick(100, false); assert.equal(f.runtime.controller.calls.elapsed, before);
  assert.equal(f.game.hud.storyBlocked, false, 'hidden overlays must not strand touch controls');
  f.runtime.tick(.1, true); assert.equal(f.game.hud.storyBlocked, true);
  assert.ok(Math.abs(f.runtime.controller.calls.elapsed - before - .1) < 1e-9);
  f.ui.collectionOpen = true; f.runtime.tick(.1, true);
  assert.ok(Math.abs(f.runtime.controller.calls.elapsed - before - .1) < 1e-9);
});

test('missing roads retry preparation at most once per second instead of scanning the graph every frame', () => {
  const f = fixture({ missingRoads: true }); let searches = 0;
  f.game.graph.nearestEdges = () => { searches++; return []; }; pickup(f);
  for (let i = 0; i < 100; i++) f.runtime.beforePlayer(.016);
  assert.equal(searches, 2); assert.equal(f.runtime.module, null);
  completeCall(f); f.runtime.tick(.016, true);
  assert.equal(f.ui.model?.action?.enabled, false); assert.equal(f.ui.model?.action?.label, 'PREPARING');
});

test('retry removes scene and dive override while retaining completed story data', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); completeCall(f); f.actions.drop(); f.actions.continue();
  pickup(f); f.game.player.deliveryMotion = { mode: 'underwater' }; f.game.player.pos.y = -4;
  f.runtime.retry(); assert.equal(f.runtime.controller.progress.currentLevel, 2);
  assert.equal(f.game.player.deliveryMotion, undefined); assert.equal(f.game.player.flying, true);
  assert.equal(f.runtime.destination, null); assert.equal(f.runtime.controller.calls.buttonState, 'hidden');
});

test('start from level 1 clears earned campaign progress and active interactions while preserving unrelated saves', () => {
  const f = fixture();
  f.storage.setItem('p2ph-save-v1', 'baseline progress');
  f.storage.setItem('p2ph-settings-v1', 'graphics and sound');
  pickup(f); f.runtime.beforePlayer(.016); completeCall(f); f.actions.drop(); f.actions.continue();
  assert.equal(f.runtime.controller.progress.currentLevel, 2);
  assert.equal(f.runtime.controller.progress.cards.length, 1);
  pickup(f); f.runtime.beforePlayer(.016); approach(f); f.runtime.tick(.016, true); f.actions.call();
  assert.equal(f.runtime.controller.calls.active, true);
  f.game.player.deliveryMotion = { mode: 'underwater' }; f.game.player.pos.y = -4;
  const before = f.stats();
  f.runtime.startFromLevelOne();
  const progress = f.runtime.controller.progress;
  assert.equal(f.runtime.controller.state, 'ROAMING');
  assert.equal(progress.currentLevel, 1); assert.equal(progress.finished, false);
  assert.deepEqual(progress.completedIds, []); assert.deepEqual(progress.cards, []);
  assert.equal(progress.restaurantIndex, 0); assert.equal(progress.restaurantStage, 'Your dream');
  assert.equal(f.runtime.controller.calls.active, false); assert.equal(f.runtime.controller.calls.buttonState, 'hidden');
  assert.equal(f.runtime.controller.activeLevel, null); assert.equal(f.runtime.destination, null);
  assert.equal(f.game.routeTarget, null); assert.equal(f.runtime.module, null);
  assert.equal(f.game.player.deliveryMotion, undefined); assert.equal(f.game.player.flying, true);
  assert.equal(f.stats().markerClears, before.markerClears + 1);
  assert.equal(f.stats().detectorResets, before.detectorResets + 1);
  assert.match(f.runtime.levelLabel, /^Level 1 \/ 7$/);
  assert.equal(f.ui.model?.completion, null); assert.deepEqual(f.ui.model?.collection, []);
  assert.deepEqual(JSON.parse(f.storage.getItem(MYSTERY_SAVE_KEY)!).completed, []);
  assert.equal(new ProgressSystem(f.runtime.controller.levels, f.storage).currentLevel, 1);
  assert.equal(f.storage.getItem('p2ph-save-v1'), 'baseline progress');
  assert.equal(f.storage.getItem('p2ph-settings-v1'), 'graphics and sound');
  pickup(f); assert.equal(f.runtime.controller.activeLevel?.id, f.runtime.controller.levels[0].id);
});

test('dispose is idempotent and disconnects pickup callbacks and HUD blocking', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); f.game.hud.storyBlocked = true;
  f.runtime.dispose(); f.runtime.dispose(); assert.equal(f.module.teardownCount, 1); assert.equal(f.ui.disposed, 1);
  assert.equal(f.game.hud.storyBlocked, false); assert.equal(f.game.routeTarget, null);
  f.runtime.controller.retry(); pickup(f); assert.equal(f.runtime.controller.activeLevel, null);
});

test('static scene support includes real roof/deck heights but excludes temporary trains', () => {
  const f = fixture(), city = f.game.city;
  const roof = { h: 16, ring: [[-5, -5], [5, -5], [5, 5], [-5, 5]] };
  city.buildingGrid.set('0,0', [roof]);
  const deck = { ax: -10, az: 0, bx: 10, bz: 0, ya: 21, yb: 21, hw: 4 };
  city.surfaceGrid.set('0,0', [deck]);
  city.movingRail = [{ x: 0, y: 0, z: 0, hx: 1, hz: 0, halfWidth: 20, halfLength: 20, roof: 35 }];
  assert.equal(deliverySurfaceHeight(city, 0, 0), 21);
  assert.equal(deliverySurfaceHeight(city, 0, 4.5), 16);
  assert.equal(deliverySurfaceHeight(city, 100, 0), 0, 'deck segment cannot extend infinitely');
});

test('stationary scene setup raises its full footprint above an off-center building', () => {
  const f = fixture(); f.runtime.controller.levels[0].moduleParams = { vehicle: 'stationary', speed: 0 };
  const roof = { h: 27, ring: [[140, 8], [160, 8], [160, 15], [140, 15]] };
  f.game.city.buildingGrid.set('3,0', [roof]); pickup(f); f.runtime.beforePlayer(.016);
  assert.ok(f.module.ctx.destination.y >= 34.1, 'seven metre hanging facade must also clear the neighbouring roof');
  assert.equal(f.module.ctx.surfaceHeightAt?.(150, 10), 27);
});

test('truck and lake identity reveals require their own scene event after the mandatory anonymous call', () => {
  for (const [levelIndex, sceneEvent, wrongEvent, expectedName] of [
    [0, 'interiorEntered', 'characterEmerged', 'Allu Arjun'],
    [5, 'characterEmerged', 'interiorEntered', 'Jr NTR'],
  ] as const) {
    const f = fixture({ levelIndex }); pickup(f); f.runtime.beforePlayer(.016);
    f.module.ctx.sceneEvent?.(sceneEvent); assert.equal(f.runtime.controller.reveals.current, null, 'scene cannot reveal before the call gate');
    completeCall(f); assert.equal(f.runtime.controller.reveals.current, null, 'call itself remains anonymous');
    f.module.ctx.sceneEvent?.('catchStarted'); f.module.ctx.sceneEvent?.(wrongEvent);
    assert.equal(f.runtime.controller.reveals.current, null, 'unrelated scene signals cannot reveal the customer');
    f.module.ctx.sceneEvent?.(sceneEvent); assert.equal(f.runtime.controller.reveals.current?.name, expectedName);
    f.runtime.dispose();
  }
});

test('late scene reveal callbacks cannot expose the next customer after a previous module completes', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); completeCall(f);
  const staleSceneEvent = f.module.ctx.sceneEvent!; f.actions.drop(); f.actions.continue();
  pickup(f); completeCall(f);
  assert.equal(f.runtime.controller.activeLevel?.celebrity.name, 'Ram Charan');
  assert.equal(f.runtime.controller.reveals.current, null);
  staleSceneEvent('interiorEntered'); staleSceneEvent('characterEmerged');
  assert.equal(f.runtime.controller.reveals.current, null, 'old truck callback cannot spoil the train customer');
  f.runtime.dispose();
});

test('truck arrival enables Call only behind its current rear entrance, not simply near the moving target', () => {
  const f=fixture();pickup(f);f.runtime.beforePlayer(.016);
  f.module.arrival={x:150,y:1,z:0,hx:1,hz:0,side:'rear',radius:48};
  Object.assign(f.game.player.pos,{x:160,z:0});f.runtime.tick(.016,true);
  assert.equal(f.runtime.controller.calls.buttonState,'disabled','nearby but ahead of the rear door is not the entry approach');
  Object.assign(f.game.player.pos,{x:140,z:0});f.runtime.tick(.016,true);
  assert.equal(f.runtime.controller.calls.buttonState,'enabled');
  Object.assign(f.game.player.pos,{x:140,z:55});f.runtime.tick(.016,true);
  assert.equal(f.runtime.controller.calls.buttonState,'disabled','parallel street does not unlock the ramp call');
  f.module.arrival.x=250;Object.assign(f.game.player.pos,{x:240,z:0});f.runtime.tick(.016,true);
  assert.equal(f.runtime.controller.calls.buttonState,'enabled','arrival uses the live truck pose, not the original landmark');
  f.runtime.dispose();
});

test('real truck permits calling at its approach marker and close behind the door, never beside or ahead of it', () => {
  const f = fixture({ realModule: true }); pickup(f); f.runtime.beforePlayer(.016);
  const module = f.runtime.module!, rear = module.arrival!, target = f.runtime.destination!;
  assert.ok(Math.hypot(target.x-rear.x,target.z-rear.z)>10, 'the guide stays behind the entire folded ramp');
  Object.assign(f.game.player.pos, target); f.runtime.tick(.016, true);
  assert.equal(f.runtime.controller.calls.buttonState, 'enabled', 'the real module marker must not sit ahead of the call-zone boundary');
  assert.deepEqual(f.runtime.localNavigation, { metres: 0, hint: 'Approach rear', bearing: 0 });
  Object.assign(f.game.player.pos, { x: rear.x-.5*rear.hx, z: rear.z-.5*rear.hz }); f.runtime.tick(.016, true);
  assert.equal(f.runtime.controller.calls.buttonState, 'enabled', 'close behind the actual rear door remains a valid approach');
  Object.assign(f.game.player.pos, { x: rear.x+2.1*rear.hx, z: rear.z+2.1*rear.hz }); f.runtime.tick(.016, true);
  assert.equal(f.runtime.controller.calls.buttonState, 'disabled', 'moving beyond the rear boundary cannot open a call from the front');
  Object.assign(f.game.player.pos, { x: rear.x-5*rear.hx+6.1*rear.hz, z: rear.z-5*rear.hz-6.1*rear.hx }); f.runtime.tick(.016, true);
  assert.equal(f.runtime.controller.calls.buttonState, 'disabled', 'a parallel approach beside the truck must not unlock the call');
  f.runtime.dispose();
});

test('local navigation uses the live rear approach marker instead of a distant road-graph detour', () => {
  const f = fixture();
  assert.equal(f.runtime.localNavigation, undefined, 'free roam has no delivery cue');
  pickup(f); f.runtime.beforePlayer(.016);
  f.module.arrival = { x: 160, y: 1, z: 0, hx: 1, hz: 0, side: 'rear', radius: 48 };
  f.module.ctx.onTarget?.({ x: 150, y: 2, z: 0 });
  Object.assign(f.game.player.pos, { x: 143, z: 0 }); f.game.player.yaw = -Math.PI / 2;
  assert.deepEqual(f.runtime.localNavigation, { metres: 7, hint: 'Approach rear', bearing: 0 });
  f.module.arrival.x = 170; f.module.ctx.onTarget?.({ x: 160, y: 2, z: 0 });
  assert.equal(f.runtime.localNavigation?.metres, 17, 'moving approach marker follows the current truck, without a route refresh');
  f.game.player.pos.x = 79;
  assert.equal(f.runtime.localNavigation, undefined, 'the ordinary road route is retained outside the eighty metre approach');
  f.runtime.dispose();
});

test('local truck navigation follows the open ramp and aligns only within its rear approach', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); completeCall(f);
  f.module.arrival = { x: 150, y: 1, z: 0, hx: 1, hz: 0, side: 'rear', radius: 48 };
  f.module.ctx.onTarget?.({ x: 157, y: .55, z: 0 });
  Object.assign(f.game.player.pos, { x: 150, z: 0 }); f.game.player.yaw = -Math.PI / 2;
  assert.deepEqual(f.runtime.localNavigation, { metres: 7, hint: 'Approach ramp', bearing: 0 }, 'the unopened door must not instruct the player to drive through it');
  f.module.supports = [{ id: 'delivery-interior-ramp', x: 163, y: 0, z: 0, hx: 1, hz: 0, halfWidth: 2.75,
    halfLength: 4, bottom: 0, roof: .8, previous: { x: 163, y: 0, z: 0, hx: 1, hz: 0 } }];
  f.game.player.pos.x = 158; f.game.player.yaw = 0;
  assert.equal(f.runtime.localNavigation?.hint, 'Drive into truck');
  assert.ok(Math.abs(f.runtime.localNavigation!.bearing - Math.PI / 2) < 1e-9,
    'once one metre past the guide point, point forward into the truck rather than turn backwards to the marker');
  f.game.player.pos.z = 1.61;
  assert.equal(f.runtime.localNavigation?.hint, 'Approach ramp', 'a car beside the aisle must first steer back to the ramp');
  f.game.player.pos.z = 0; f.game.player.pos.x = 150;
  assert.equal(f.runtime.localNavigation?.hint, 'Approach ramp', 'nine metres behind the actual tip still follows its approach point');
  f.runtime.dispose();
});

test('ramp heading and side clearance rotate with the actual truck instead of a fixed world axis', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); completeCall(f);
  f.module.arrival = { x: 150, y: 1, z: 20, hx: 0, hz: -1, side: 'rear', radius: 48 };
  f.module.ctx.onTarget?.({ x: 150, y: .55, z: 11 });
  f.module.supports = [{ id: 'delivery-interior-ramp', x: 150, y: 0, z: 5, hx: 0, hz: -1, halfWidth: 2.75,
    halfLength: 4, bottom: 0, roof: .8, previous: { x: 150, y: 0, z: 5, hx: 0, hz: -1 } }];
  Object.assign(f.game.player.pos, { x: 150, z: 10 }); f.game.player.yaw = 0;
  assert.deepEqual(f.runtime.localNavigation, { metres: 1, hint: 'Drive into truck', bearing: 0 });
  f.game.player.pos.x = 152;
  assert.equal(f.runtime.localNavigation?.hint, 'Approach ramp');
  assert.ok(f.runtime.localNavigation!.bearing < 0, 'actual ramp to the left uses the same signed bearing as the flying HUD');
  f.runtime.dispose();
});

test('other scenes use actual nearby marker distance and clear local guidance on completion', () => {
  const f = fixture({ levelIndex: 2 }); pickup(f); f.runtime.beforePlayer(.016);
  f.module.ctx.onTarget?.({ x: 150, y: 30, z: -7 });
  Object.assign(f.game.player.pos, { x: 150, z: 0 }); f.game.player.yaw = 0;
  assert.deepEqual(f.runtime.localNavigation, { metres: 7, hint: 'Fly to marker', bearing: 0 }, 'the elevated marker requires flight from the street');
  f.game.player.pos.y = 30;
  assert.deepEqual(f.runtime.localNavigation, { metres: 7, hint: 'Approach marker', bearing: 0 }, 'a player already at the scene height keeps local handoff guidance');
  f.game.player.pos.y = .55;
  f.game.player.pos.z = 34; assert.equal(f.runtime.localNavigation, undefined, 'road guidance remains outside forty metres');
  f.game.player.pos.z = -7;
  assert.equal(f.runtime.localNavigation?.bearing, 0, 'standing at the marker never produces a spurious turn');
  f.game.player.pos.x = NaN; assert.equal(f.runtime.localNavigation, undefined);
  f.game.player.pos.x = 150; completeCall(f); f.actions.drop();
  assert.equal(f.runtime.localNavigation, undefined, 'a completed marker must not leave a stale local cue');
  f.runtime.dispose();
});


test('pause restaurant entry restores UI visibility and blocks simulation immediately without changing delivery progress', () => {
  const f = fixture();
  f.ui.setVisible(false); f.game.paused = false;
  const before = f.runtime.pauseProgress;
  assert.deepEqual(before, { current: 1, total: 7, completed: 0 });
  assert.equal(f.runtime.openRestaurant(), true);
  assert.equal(f.ui.visible, true); assert.equal(f.ui.collectionOpen, true);
  assert.equal(f.runtime.blocking, true); assert.equal(f.game.hud.storyBlocked, true);
  assert.deepEqual(f.runtime.pauseProgress, before); assert.equal(f.storage.getItem(MYSTERY_SAVE_KEY), null);
  f.ui.collectionOpen = false; f.actions.collectionClose?.(); f.runtime.tick(.016, true);
  assert.equal(f.game.hud.storyBlocked, false); assert.ok(f.stats().focus > 0);
});

test('restaurant entry cannot replace a live phone call or completion card', () => {
  const f = fixture(); pickup(f); f.runtime.beforePlayer(.016); approach(f); f.runtime.tick(.016, true); f.actions.call();
  assert.equal(f.runtime.controller.calls.active, true); assert.equal(f.runtime.openRestaurant(), false); assert.equal(f.ui.collectionOpen, false);
  while (f.runtime.controller.calls.active) f.actions.advanceCall(f.runtime.controller.calls.currentLine?.replies ? 0 : undefined);
  f.actions.drop(); assert.equal(f.runtime.controller.complete, true);
  assert.equal(f.runtime.openRestaurant(), false); assert.equal(f.ui.collectionOpen, false);
  assert.deepEqual(f.runtime.pauseProgress, { current: 1, total: 7, completed: 1 });
  f.actions.continue(); assert.deepEqual(f.runtime.pauseProgress, { current: 2, total: 7, completed: 1 });
  f.runtime.dispose(); assert.equal(f.runtime.openRestaurant(), false);
});

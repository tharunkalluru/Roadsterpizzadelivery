import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeliveryRuntime, deliverySurfaceHeight } from '../../src/delivery/runtime';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { loadLevels } from '../../src/delivery/content/levels';
import { RoadGraph } from '../../src/game/roadgraph';
import type { DeliveryModule, DeliveryModuleContext, DeliveryPoint } from '../../src/delivery/modules/types';
import type { DeliveryUIActions, DeliveryView } from '../../src/delivery/ui/view-model';
import type { Game } from '../../src/game/game';

class UIAdapter {
  visible = true; collectionOpen = false; model: DeliveryView | null = null; disposed = 0;
  get blocking() { return this.visible && (this.collectionOpen || !!this.model?.phone || !!this.model?.completion); }
  setVisible(visible: boolean) { this.visible = visible; }
  update(model: DeliveryView) { this.model = model; }
  dispose() { this.disposed++; }
}
class ModuleAdapter implements DeliveryModule {
  ctx!: DeliveryModuleContext;
  target: DeliveryPoint = { x: 0, y: 0, z: 0 };
  status = { instruction: 'Match the truck', canDrop: true, actionLabel: 'DROP' };
  supports = [];
  movement: any = { mode: 'normal' };
  frames = 0; teardownCount = 0;
  setup(ctx: DeliveryModuleContext) { this.ctx = ctx; this.target = { ...ctx.destination }; ctx.onTarget?.(this.target); }
  update() { this.frames++; }
  onDrop() { if (this.ctx.canInteract?.()) this.ctx.emit('done'); }
  teardown() { this.teardownCount++; }
}
function fixture({ oneway, missingRoads = false }: { oneway?: string; missingRoads?: boolean } = {}) {
  const levels = loadLevels(); levels[0].destination = { label: 'Mapped highway', x: 150, y: 0, z: 0 };
  const events = new EventBus<DeliveryEvents>(), ui = new UIAdapter(), module = new ModuleAdapter();
  const graph = new RoadGraph(missingRoads ? [] : [{ id: 'road', cls: 'primary', w: 14, pts: [[0, 0], [300, 0]], oneway } as any], []);
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
    storage: { getItem() { return null; }, setItem() {} },
    uiFactory(_host, callbacks) { actions = callbacks; return ui; }, moduleFactory() { return module; },
  });
  return { runtime, game, events, ui, module, get actions() { return actions; },
    stats: () => ({ routeResets, resets, focus, markerClears, detectorResets, laneDir }) };
}
function pickup(f: ReturnType<typeof fixture>) { f.events.emit('orderPicked', { carrierId: 'anonymous-auto', position: { x: 145, y: 3, z: 0 } }); }
function approach(f: ReturnType<typeof fixture>) {
  const target = f.runtime.destination!;
  Object.assign(f.game.player.pos, { x: target.x, z: target.z });
}
function completeCall(f: ReturnType<typeof fixture>) {
  approach(f);
  f.runtime.tick(.016, true); assert.equal(f.runtime.controller.calls.ringing, true); f.actions.call();
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

test('mapped one-way route uses the existing traffic lane picker and correct travel direction', () => {
  const f = fixture({ oneway: 'forward' }); pickup(f); f.runtime.beforePlayer(.016);
  const route = f.module.ctx.route!;
  assert.equal(f.stats().laneDir, -1); assert.ok(route.length > 10);
  assert.ok(route[0].x > route[route.length - 1].x, 'dir -1 is already reversed by pointAt; do not reverse twice');
  assert.ok(route.every(point => Math.abs(point.z - 3) < .001), 'same mapped travel lane throughout');
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
  assert.ok(distance > 280, '300m mapped segment must provide nearly its full travel distance');
  assert.equal(route[0].x, 294); assert.equal(route[route.length - 1].x, 6);
  assert.ok(route.every(point => point.x >= 6 && point.x <= 294));
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

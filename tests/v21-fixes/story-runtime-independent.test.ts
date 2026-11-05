import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DeliveryRuntime } from '../../src/delivery/runtime';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { loadLegacyLevels } from './fixtures/legacy-levels';
import { RoadGraph } from '../../src/game/roadgraph';
import type { DeliveryModule, DeliveryModuleContext, DeliveryPoint } from '../../src/delivery/modules/types';
import type { DeliveryUIActions, DeliveryView } from '../../src/delivery/ui/view-model';
import type { Game } from '../../src/game/game';
import { MovingRailInteraction, type MovingRailBody } from '../../src/game/moving-rail';

/** Separate review fixture: actual runtime/controller/storage and a deterministic
 * physical module, avoiding release-asset and browser dependencies. */
function fixture() {
  const levels = loadLegacyLevels().slice(0, 2).map((level, i) => ({
    ...level, callMode: 'NONE' as const, script: [], revealAt: 'afterDelivery' as const,
    destination: { label: `Review delivery ${i + 1}`, x: i * 6000, y: 0, z: 0 },
  }));
  const events = new EventBus<DeliveryEvents>(), saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); } };
  const graph = new RoadGraph(levels.map((level, i) => ({
    id: `review-main-${i}`, cls: 'primary', w: 16,
    pts: [[level.destination.x - 1600, 0], [level.destination.x + 1600, 0]],
  })) as any, []);
  let actions!: DeliveryUIActions, model: DeliveryView | null = null;
  const ui = { visible: true, get blocking() { return false; }, setVisible(v: boolean) { this.visible = v; },
    update(next: DeliveryView) { model = next; }, openCollection() {}, dispose() {} };
  const scene = new THREE.Scene();
  const game: any = {
    deliveryEvents: events, graph, rail: { bodies: [] }, paused: false, map: { open: false },
    player: { pos: new THREE.Vector3(0, .55, 0), yaw: 0, speed: 0, flying: false,
      descending: false, jumping: false, group: new THREE.Group() },
    traffic: { pickLane() { return 3; } },
    city: { surfaceGrid: new Map(), buildingGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] },
    hud: { root: null, storyBlocked: false, rotationBlocked: false, set() {}, pickupStatus() {}, toast() {} },
    carriers: { clear() {} }, pickupDetector: { reset() {} }, sound: { cue() {} },
    resetInput() {}, clock: { getDelta() { return .016; } },
    engine: { scene, renderer: { domElement: { focus() {} } } }, beacon: new THREE.Group(), setTarget() {},
  };
  const modules: DeliveryModule[] = [], contexts: DeliveryModuleContext[] = [], relocations: DeliveryPoint[] = [];
  const runtime = new DeliveryRuntime(game as Game, { levels, storage,
    uiFactory(_host, callbacks) { actions = callbacks; return ui; },
    moduleFactory() {
      let ctx!: DeliveryModuleContext;
      const module: DeliveryModule = {
        target: { x: 0, y: 0, z: 0 }, status: { instruction: 'Review handoff', canDrop: true, actionLabel: 'DROP' },
        supports: [], movement: { mode: 'normal' },
        setup(context) { ctx = context; contexts.push(context); Object.assign(module.target, context.destination); context.onTarget?.(module.target); },
        update() {}, onDrop() { if (ctx.canInteract?.()) ctx.emit('done'); }, teardown() {},
        get story() { return { entry: true, point: { ...game.player.pos }, maxSpeed: 0 }; },
      };
      modules.push(module); return module;
    },
  });
  game.relocate = async (point: DeliveryPoint) => {
    relocations.push({ ...point });
    // The real relocation path resets runtime delivery state after placement.
    // This must not erase an explicitly requested replay override.
    runtime.retry();
    game.player.pos.set(point.x, .55, point.z);
  };
  const pickup = () => events.emit('orderPicked', { carrierId: 'review-auto', position: { ...game.player.pos } });
  const complete = () => {
    pickup(); runtime.beforePlayer(.05);
    const target = runtime.destination!; game.player.pos.set(target.x, .55, target.z);
    runtime.tick(.05, true);
    for (let i = 0; i < 24; i++) { runtime.beforePlayer(.05); runtime.afterPlayer(.05); }
    assert.equal(runtime.director.viewing, true);
    assert.equal(runtime.controller.complete, true);
  };
  return { runtime, game, levels, saved, relocations, modules, contexts, pickup, complete,
    get actions() { return actions; }, get model() { return model; } };
}

test('capture hides driving HUD in its first rendered frame without waiting for the next regular UI tick',()=>{
  const f=fixture(),classes=new Set<string>();
  f.game.hud.root={classList:{toggle(name:string,on:boolean){if(on)classes.add(name);else classes.delete(name);},remove(name:string){classes.delete(name);}}};
  f.pickup();f.runtime.beforePlayer(.05);const at=f.runtime.destination!;f.game.player.pos.set(at.x,.55,at.z);
  f.runtime.tick(.05,true);
  for(let i=0;i<20&&!f.runtime.cinematic;i++)f.runtime.beforePlayer(.05);
  assert.equal(f.runtime.director.phase,'playing');
  assert.equal(classes.has('story-cinematic'),true,'controls must be concealed before a screenshot or passive observer can see a captured frame');
  assert.equal(f.game.hud.storyBlocked,true);
  f.runtime.dispose();
});

test('Restart current level from held completion replays that scene via relocation without deleting earned progress', async () => {
  const f = fixture(); f.complete();
  assert.equal(f.runtime.controller.progress.completedIds.length, 1);
  await f.runtime.restartCurrentLevel();
  assert.equal(f.relocations.length, 1, 'restart must load a safe road rather than release controls inside the old physical scene');
  assert.ok(Math.hypot(f.relocations[0].x - f.levels[0].destination.x, f.relocations[0].z - f.levels[0].destination.z) <= 4000);
  assert.equal(f.runtime.controller.progress.completedIds.length, 1, 'earned unlocks and cards survive a replay');
  f.pickup();
  assert.equal(f.runtime.controller.activeLevel?.id, f.levels[0].id, 'the next pickup replays the level selected in Pause');
  f.runtime.beforePlayer(.05);
  const target = f.runtime.destination!; f.game.player.pos.set(target.x, .55, target.z); f.runtime.tick(.05, true);
  for (let i = 0; i < 24; i++) { f.runtime.beforePlayer(.05); f.runtime.afterPlayer(.05); }
  assert.equal(f.runtime.director.viewing, true);
  f.actions.continue(); await Promise.resolve();
  assert.equal(f.relocations.length, 2);
  assert.ok(Math.hypot(f.relocations[1].x - f.levels[1].destination.x, f.relocations[1].z - f.levels[1].destination.z) <= 4000,
    'Next after replay returns to the next unfinished level');
  assert.equal(f.runtime.controller.progress.completedIds.length, 1);
  f.runtime.dispose();
});

test('ordinary relocation retry still assigns the next unfinished level after completion', () => {
  const f = fixture(); f.complete(); f.runtime.retry(); f.pickup();
  assert.equal(f.runtime.controller.activeLevel?.id, f.levels[1].id);
  assert.equal(f.runtime.controller.progress.completedIds.length, 1);
  f.runtime.dispose();
});

test('Restart current level during captured motion loads a safe road for the same unfinished delivery', async () => {
  const f = fixture(); f.pickup(); f.runtime.beforePlayer(.05);
  const target = f.runtime.destination!; f.game.player.pos.set(target.x, .55, target.z); f.runtime.tick(.05, true);
  for(let i=0;i<8;i++)f.runtime.beforePlayer(.05); f.runtime.afterPlayer(.05);
  assert.equal(f.runtime.director.phase, 'playing');
  await f.runtime.restartCurrentLevel();
  assert.equal(f.relocations.length, 1);
  assert.equal(f.runtime.cinematic, false);
  assert.equal(f.runtime.controller.progress.completedIds.length, 0);
  f.pickup(); assert.equal(f.runtime.controller.activeLevel?.id, f.levels[0].id);
  f.runtime.dispose();
});

test('Restart current level can replay the final held scene even though all campaign unlocks are complete', async () => {
  const f = fixture(); f.complete(); f.runtime.retry(); f.complete();
  assert.equal(f.runtime.controller.progress.finished, true);
  await f.runtime.restartCurrentLevel();
  assert.equal(f.relocations.length, 1);
  assert.ok(Math.hypot(f.relocations[0].x - f.levels[1].destination.x, f.relocations[0].z - f.levels[1].destination.z) <= 4000);
  assert.equal(f.runtime.canPickup, true);
  f.pickup(); assert.equal(f.runtime.controller.activeLevel?.id, f.levels[1].id);
  assert.equal(f.runtime.controller.progress.completedIds.length, 2);
  f.runtime.dispose();
});

test('Restart after the final restaurant Explore action replays the last level without reopening ordinary free-roam pickups', async () => {
  const f = fixture(); f.complete(); f.runtime.retry(); f.complete();
  f.actions.continue(); // Held character Next opens the final restaurant.
  assert.equal(f.model?.completion?.final, true);
  f.actions.continue(); // Explore clears the completed active scene.
  assert.equal(f.runtime.controller.activeLevel, null);
  assert.equal(f.runtime.controller.nextLevel, null);
  assert.equal(f.runtime.controller.progress.finished, true);
  assert.equal(f.runtime.canPickup, false, 'ordinary finished free roaming does not reassign a delivery');
  await f.runtime.restartCurrentLevel();
  assert.equal(f.relocations.length, 1);
  assert.equal(f.runtime.canPickup, true, 'only the explicit restart queues the replay');
  f.pickup(); assert.equal(f.runtime.controller.activeLevel?.id, f.levels[1].id);
  assert.equal(f.runtime.controller.progress.completedIds.length, 2);
  f.runtime.dispose();
});

test('a repeated Restart click cannot start a second relocation while the first loading transition is pending', async () => {
  const f = fixture(); f.complete(); let calls = 0, release!: () => void;
  const loading = new Promise<void>(resolve => { release = resolve; });
  f.game.relocate = async () => { calls++; f.runtime.retry(); await loading; };
  const first = f.runtime.restartCurrentLevel(), second = f.runtime.restartCurrentLevel();
  assert.equal(calls, 1); release(); await Promise.all([first, second]);
  f.pickup(); assert.equal(f.runtime.controller.activeLevel?.id, f.levels[0].id);
  f.runtime.dispose();
});

test('Restart with no safe main road preserves the held scene and completed progress for a later retry', async () => {
  const f = fixture(); f.complete(); const active = f.runtime.controller.activeLevel;
  f.game.graph = new RoadGraph([], []);
  await f.runtime.restartCurrentLevel();
  assert.equal(f.relocations.length, 0);
  assert.equal(f.runtime.director.viewing, true);
  assert.equal(f.runtime.controller.activeLevel, active);
  assert.equal(f.runtime.controller.progress.completedIds.length, 1);
  assert.equal(f.runtime.canPickup, false);
  f.runtime.dispose();
});

test('the actual runtime player closure forwards null, exact live roof support, and falling velocity without caching', () => {
  const f = fixture(); f.game.railContacts = new MovingRailInteraction();
  f.pickup(); f.runtime.beforePlayer(.05); const ctx = f.contexts[0];
  assert.ok(ctx, 'the real runtime constructed the module context');
  assert.equal(ctx.player().railSupportId, null, 'the host solver exists but has not established a roof contact');
  const body: MovingRailBody = { id: 'rail:review:2', x: 0, y: 0, z: 0, hx: 0, hz: 1,
    roof: 4.2, bottom: .2, halfWidth: 1.65, halfLength: 10, previous: { x: 0, y: 0, z: 0, hx: 0, hz: 1 } };
  f.game.player.pos.set(0, body.roof + .55, 0); f.game.player.vy = 0;
  f.game.railContacts.beforePlayer(f.game.player, [body], false, .016);
  assert.equal(f.game.railContacts.afterPlayer(f.game.player, .016).carried, true);
  assert.equal(ctx.player().railSupportId, body.id);
  assert.equal(ctx.player().verticalSpeed, 0);
  f.game.player.vy = -3; assert.equal(ctx.player().verticalSpeed, -3);
  f.game.railContacts.beforePlayer(f.game.player, [], false, .016);
  assert.equal(ctx.player().railSupportId, null, 'removing the actual support immediately invalidates the closure');
  f.runtime.dispose();
});

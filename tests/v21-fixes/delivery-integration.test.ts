import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { Player } from '../../src/game/player';
import { CarrierMarker } from '../../src/delivery/systems/carrier-marker';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { PickupDetector, type JumpPickupPose } from '../../src/delivery/systems/pickup-detector';
import type { Car } from '../../src/game/traffic';

function orchestration() {
  const calls = { spawn: 0, markers: 0, detection: 0, allowAssign: [] as boolean[], render: 0, map: 0 };
  const player = { pos: new THREE.Vector3(0, .55, 0), jumping: false, speed: 0, flying: false, descending: false };
  const game: any = Object.assign(Object.create(Game.prototype), {
    carrierPickupMode: true, player, carrierSpawnT: 0, keys: new Set(),
    pickupBefore: { x: 0, y: .55, z: 0, bottom: 0, top: 1.35, jumping: false },
    pickupAfter: { x: 0, y: .55, z: 0, bottom: 0, top: 1.35, jumping: false },
    traffic: { max: 3, cars: [{}, {}, {}], spawn() { calls.spawn++; this.cars.push({}); } },
    carriers: { activeCount: 0, markers: [], update(_dt: number, _cars: any, _p: any, allow = true) { calls.markers++; calls.allowAssign.push(allow); } },
    pickupDetector: { caught: false, update() { calls.detection++; } },
    coins: 1234, level: 2, doneInLevel: 3, totalDelivered: 12, acceptingOrders: true,
    order: null, nextOfferAt: null,
  });
  return { game, calls };
}

test('carrier mode cannot queue, restore, accept or pay out a legacy dispatch', () => {
  const { game } = orchestration();
  game.queueOffer(0, 10); assert.equal(game.nextOfferAt, null);
  game.nextOfferAt = 1; game.tickOfferQueue(100); assert.equal(game.nextOfferAt, null);
  const stale = { state: 'offer' }; game.order = stale; game.acceptOffer(); assert.equal(stale.state, 'offer');
  game.showOffer(); assert.equal(game.order, null); assert.equal(game.nextOfferAt, null);
  game.order = { state: 'toDrop', heat: 100, slices: 8, dist: 1000 };
  game.completeDelivery();
  assert.deepEqual([game.coins, game.level, game.doneInLevel, game.totalDelivered], [1234, 2, 3, 12]);
  game.setAcceptingOrders(false); assert.equal(game.acceptingOrders, true);
});

test('pickup preview neither reads nor overwrites the baseline progress save', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const baseline = JSON.stringify({ coins: 789, level: 4, doneInLevel: 2, total: 19 });
  const data = new Map([['p2ph-save-v1', baseline]]); let access = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { access++; return data.get(key) ?? null; },
    setItem(key: string, value: string) { access++; data.set(key, value); },
  } });
  try {
    const { game } = orchestration(); game.save(); game.load();
    assert.equal(access, 0); assert.equal(data.get('p2ph-save-v1'), baseline);
    assert.deepEqual([game.coins, game.level, game.doneInLevel, game.totalDelivered], [1234, 2, 3, 12]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as any).localStorage;
  }
});

test('empty-carrier recovery requests safe spawn at most once per second and never grows beyond max plus one', () => {
  const { game, calls } = orchestration();
  game.updateCarrierPickup(1 / 60); assert.equal(calls.spawn, 1); assert.equal(game.traffic.cars.length, 4);
  for (let i = 0; i < 180; i++) game.updateCarrierPickup(1 / 60);
  assert.equal(calls.spawn, 1, 'cap cannot expand again while existing retirement has not run');
  game.traffic.cars.pop(); game.carrierSpawnT = 0;
  game.updateCarrierPickup(1 / 60); assert.equal(calls.spawn, 2);
  game.traffic.cars.pop();
  for (let i = 0; i < 59; i++) game.updateCarrierPickup(1 / 60);
  assert.equal(calls.spawn, 2, 'wait for retry interval even when prior safe spawn failed or was retired');
  game.updateCarrierPickup(1 / 60); assert.equal(calls.spawn, 3);
  assert.ok(game.traffic.cars.length <= game.traffic.max + 1);
});

test('a caught box stops carrier assignment and spawn recovery', () => {
  const { game, calls } = orchestration(); game.pickupDetector.caught = true;
  for (let i = 0; i < 180; i++) game.updateCarrierPickup(1 / 60);
  assert.equal(calls.spawn, 0); assert.ok(calls.allowAssign.every(value => value === false));
});

test('map, pause, orientation, tips and hidden tabs never advance pickup detection', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { hidden: false }; Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    for (const gate of ['map', 'paused', 'rotation', 'tip', 'hidden', 'modal']) {
      const { game, calls } = orchestration();
      Object.assign(game, {
        clock: { getDelta: () => 1 / 60 }, tutorialTick() {}, updateJumpState() {},
        hud: { tipOpen: gate === 'tip', rotationBlocked: gate === 'rotation', modalOpen: gate === 'modal', flightState() {}, flightNavigation() {} },
        sound: { vehicle() {} }, area: { name: 'Test street' }, choosing: false, paused: gate === 'paused',
        engine: { render() { calls.render++; } },
        map: { open: gate === 'map', tick() { calls.map++; } },
      });
      doc.hidden = gate === 'hidden';
      game.resetInput = () => {};
      game.frame();
      assert.equal(calls.detection, 0, gate); assert.equal(calls.markers, 0, gate); assert.equal(calls.spawn, 0, gate);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete (globalThis as any).document;
  }
});

const idle = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false, jumpPressed: false };
function physicsPlayer(): any {
  const city = { group: new THREE.Group(), surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map(), movingRail: [] };
  return Object.assign(Object.create(Player.prototype), {
    city, pos: new THREE.Vector3(0, .55, 18), yaw: 0, speed: 20, vy: 0, steerVis: 0,
    flying: false, descending: false, onRoad: false, lastSupport: 0, lastKind: 'ground', lastElevRoad: false,
    hitCooldown: 0, bump: 0, flyAlt: 24, altT: 0, kerbT: 0, glide: null,
    jumpActive: false, jumpHeld: false, jumpCooldown: 0, jumpBodyTop: 2.4, jumpStartY: 0, jumpElapsed: 0,
    jumpForcedFall: false, jumpCooldownPendingLanding: false, jumpCollisionMeshes: [], jumpBoundsDirty: true,
    jumpBounds: { bottom: 0, top: 0 }, placementRevision: 0, group: new THREE.Group(), glow: new THREE.Group(),
    light: new THREE.Group(), wheels: [], wheelRollers: [], animateThrusters() {},
  });
}

test('production Player jump trajectory can collect a moving bus roof box at 30 and 60Hz without changing jump physics', () => {
  for (const hz of [30, 60]) {
    const player = physicsPlayer(), scene = new THREE.Scene(); scene.add(player.group);
    const bus: Car = { g: new THREE.Group(), group: 'bus', kind: 'bus', size: [2.5, 3.3, 12], x: 0, y: 0, z: 0 } as Car;
    scene.add(bus.g); bus.g.position.y = .02;
    const markers = new CarrierMarker(scene), events = new EventBus<DeliveryEvents>(), detector = new PickupDetector(events);
    let caught = 0, catchHeight = 0;
    events.on('orderPicked', event => { caught++; catchHeight = player.pos.y; markers.collect(event.carrierId, player.group); });
    const game: any = Object.assign(Object.create(Game.prototype), {
      player, city: player.city, carriers: markers, pickupDetector: detector, carrierSpawnT: 0,
      traffic: { cars: [bus], max: 32, spawn() { throw Error('A valid carrier already exists'); } },
      pickupBefore: {} as JumpPickupPose, pickupAfter: {} as JumpPickupPose,
    });
    markers.update(0, [bus], player.pos);
    for (let i = 0; i < hz * 3; i++) {
      game.capturePickupPose(game.pickupBefore); markers.beforeFrame();
      player.update(1 / hz, { ...idle, jumpPressed: i === 0 }, (i + 1) / hz);
      bus.z -= 6 / hz; bus.g.position.z = bus.z;
      game.updateCarrierPickup(1 / hz);
    }
    assert.equal(caught, 1, `${hz}Hz moving bus collection`); assert.ok(catchHeight > 3, 'catch occurs in the kickflip, above street traffic');
    assert.equal(player.jumping, false); assert.equal(player.flying, false); assert.ok(Math.abs(player.pos.y - .55) < .001);
    assert.equal(markers.activeCount, 0); assert.equal(markers.holding, true);
    markers.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, ROAD_SPEED_LIMIT, FLIGHT_SPEED_LIMIT, type Input } from '../../src/game/player';

const idle: Input = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false };
/** Production update with only browser-created meshes/particle drawing omitted. */
function car(speed = 0) {
  return Object.assign(Object.create(Player.prototype), {
    city: { group: new THREE.Group(), surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map(), movingRail: [] },
    pos: new THREE.Vector3(0, .55, 0), yaw: 0, speed, vy: 0, steerVis: 0,
    flying: false, descending: false, onRoad: false, lastSupport: 0, lastKind: 'ground', lastElevRoad: false,
    hitCooldown: 0, bump: 0, flyAlt: 24, altT: 0, kerbT: 0, glide: null,
    jumpActive: false, jumpHeld: false, jumpCooldown: 0, jumpBodyTop: 2.4, jumpStartY: 0, jumpElapsed: 0,
    jumpForcedFall: false, jumpCooldownPendingLanding: false, jumpCollisionMeshes: [], jumpBoundsDirty: true,
    jumpBounds: { bottom: 0, top: 0 }, placementRevision: 0, group: new THREE.Group(), glow: new THREE.Group(),
    light: new THREE.Group(), wheels: [], wheelRollers: [], animateThrusters() {},
  }) as Player;
}
function simulate(player: Player, input: Input, seconds: number, hz = 60) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) player.update(1 / hz, input, (frame + 1) / hz);
}
function accelerate(kmh: number, hz: number) {
  const player = car(); let frame = 0;
  while (frame < hz * 30 && player.speed < kmh / 3.6 - 1e-8) {
    frame++; player.update(1 / hz, { ...idle, throttle: 1 }, frame / hz);
  }
  return { seconds: frame / hz, distance: -player.pos.z, speed: player.speed };
}
function stop(kmh: number, hz: number, throttle = 0) {
  const player = car(kmh / 3.6); let frame = 0;
  while (frame < hz * 10 && player.speed > 0) {
    frame++; player.update(1 / hz, { ...idle, throttle, brake: 1, allowReverse: false }, frame / hz);
  }
  return { seconds: frame / hz, distance: -player.pos.z, speed: player.speed };
}

for (const hz of [30, 60, 120]) test(`road throttle gives a 1.5x launch and retains 120 km/h at ${hz} Hz`, t => {
  const thirty = accelerate(30, hz), sixty = accelerate(60, hz), top = accelerate(120, hz);
  t.diagnostic(JSON.stringify({ hz, zeroTo30: thirty, zeroTo60: sixty, zeroTo120: top }));
  assert.ok(thirty.seconds >= 1.0 && thirty.seconds < 1.8, '30 km/h takes about two thirds of the former time');
  assert.ok(sixty.seconds >= 2.5 && sixty.seconds < 3.7, '60 km/h takes about two thirds of the former time');
  assert.ok(top.seconds >= 5 && top.seconds < 7.2, 'sustained GO still reaches the unchanged road cap');
  assert.equal(top.speed, ROAD_SPEED_LIMIT);
});

for (const hz of [30, 60, 120]) test(`braking stops firmly without rolling backwards, including simultaneous GO at ${hz} Hz`, t => {
  const cityStop = stop(60, hz), fastStop = stop(120, hz), both = stop(120, hz, 1);
  t.diagnostic(JSON.stringify({ hz, stop60: cityStop, stop120: fastStop, goAndBrake: both }));
  assert.ok(cityStop.seconds <= .75 && cityStop.distance < 6.2);
  assert.ok(fastStop.seconds <= 1.45 && fastStop.distance < 24);
  assert.equal(cityStop.speed, 0); assert.equal(fastStop.speed, 0);
  assert.ok(Math.abs(both.seconds - fastStop.seconds) <= 1 / hz, 'GO cannot weaken a deliberate brake press');
  assert.equal(both.speed, 0);
  const player = car(60 / 3.6); simulate(player, { ...idle, brake: 1, allowReverse: false }, .8, hz);
  assert.equal(player.speed, 0, 'the same forward-braking press remains a stop');
  simulate(player, idle, .5, hz); assert.equal(player.speed, 0, 'releasing the brake after stopping leaves the car still');
});

test('reverse needs an intentional stopped hold, and holding GO with BRAKE cannot start reverse', () => {
  const player = car(); simulate(player, { ...idle, brake: 1 }, .25);
  assert.equal(player.speed, 0);
  simulate(player, { ...idle, brake: 1 }, .25); assert.ok(player.speed < -.4 && player.speed > -1);
  simulate(player, { ...idle, brake: 1 }, 3); assert.equal(player.speed, -6, 'reverse retains its existing cap');
  simulate(player, { ...idle, brake: 1, throttle: 1 }, 1); assert.equal(player.speed, 0, 'conflicting inputs brake reversing motion rather than accelerating it');
  simulate(player, { ...idle, brake: 1, throttle: 1 }, 2); assert.equal(player.speed, 0);
  simulate(player, { ...idle, throttle: 1 }, .5); assert.ok(player.speed > 1.5, 'releasing BRAKE immediately restores GO');
});

test('partial throttle, coasting and low-speed steering remain immediate and proportional', () => {
  const quarter = car(), half = car(); simulate(quarter, { ...idle, throttle: .25 }, 2); simulate(half, { ...idle, throttle: .5 }, 2);
  assert.ok(quarter.speed > 2.5 && quarter.speed < 3); assert.ok(Math.abs(half.speed - quarter.speed * 2) < 1e-8);
  const coast = car(60 / 3.6); simulate(coast, idle, 1); assert.ok(Math.abs(coast.speed - (60 / 3.6 - 4)) < 1e-8);
  const straight = car(), turning = car(); simulate(straight, { ...idle, throttle: 1 }, 1); simulate(turning, { ...idle, throttle: 1, steer: 1 }, 1);
  assert.equal(straight.speed, turning.speed); assert.ok(turning.yaw < -.1, 'reduced acceleration does not add input lag or disable low-speed steering');
});

test('unlimited flight and descent use the 1.5x forward acceleration and retain speed caps', () => {
  const flight = car(); flight.flying = true; flight.pos.y = 24; simulate(flight, { ...idle, throttle: 1 }, 2);
  assert.ok(Math.abs(flight.speed - 36) < 1e-8, 'flight acceleration is 18 m/s²');
  simulate(flight, { ...idle, throttle: 1 }, 4); assert.equal(flight.speed, FLIGHT_SPEED_LIMIT);
  simulate(flight, { ...idle, brake: 1 }, .5); assert.ok(Math.abs(flight.speed - (FLIGHT_SPEED_LIMIT - 10)) < 1e-8, 'flight braking remains 20 m/s²');
  const descent = car(); descent.descending = true; descent.pos.y = 100;
  simulate(descent, { ...idle, throttle: 1 }, .5); assert.ok(Math.abs(descent.speed - 6.75) < 1e-8, 'descent acceleration is 13.5 m/s² until touchdown');
});


for (const hz of [30, 60, 120]) test(`held BRAKE automatically reverses after stopping at ${hz} Hz`, () => {
  for (const kmh of [3.6, 60, 120]) {
    const player = car(kmh / 3.6);
    let frames = 0;
    while (player.speed > 0 && frames < hz * 2) {
      player.update(1 / hz, { ...idle, brake: 1 }, ++frames / hz);
    }
    assert.equal(player.speed, 0, `stopped from ${kmh} km/h`);
    simulate(player, { ...idle, brake: 1 }, .2, hz);
    assert.ok(player.speed < 0, 'continuing to hold BRAKE transitions from stopping into reverse');
    player.speed = 0;
    simulate(player, idle, .1, hz);
    simulate(player, { ...idle, brake: 1 }, .2, hz);
    assert.equal(player.speed, 0, 'a fresh reverse press retains its intentional hold delay');
    simulate(player, { ...idle, brake: 1 }, .3, hz);
    assert.ok(player.speed < -.4 && player.speed > -.8, 'release and repress from rest enables reverse');
  }
  const slowedByCollision = car(.2);
  simulate(slowedByCollision, { ...idle, brake: 1 }, .8, hz);
  assert.ok(slowedByCollision.speed < 0, 'a held brake transitions into reverse after a low-speed stop');
});

test('dedicated desktop brake stops both directions and never starts reversing', () => {
  for (const speed of [0, 12, -4]) {
    const player = car(speed);
    simulate(player, { ...idle, brake: 1, allowReverse: false }, 3);
    assert.equal(player.speed, 0);
    simulate(player, { ...idle, brake: 1, allowReverse: false }, 3);
    assert.equal(player.speed, 0);
    simulate(player, idle, .1);
    simulate(player, { ...idle, brake: 1 }, 1);
    assert.ok(player.speed < 0);
  }
});

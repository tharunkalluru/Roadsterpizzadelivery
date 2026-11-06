import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, type Input } from '../../src/game/player';
import { MovingRailInteraction, railLocal, railRoofAt, type MovingRailBody } from '../../src/game/moving-rail';
import { createDeliveryModule, type DeliveryModuleContext } from '../../src/delivery/modules';

const idle: Input = { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false, jumpPressed: false };

/** Production Player physics; only the browser-created model/thruster renderer is omitted. */
function playerFixture() {
  const city = { group: new THREE.Group(), surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map(), movingRail: [] };
  return Object.assign(Object.create(Player.prototype), {
    city, pos: new THREE.Vector3(.55, .55, -25), yaw: Math.PI, speed: 0, vy: 0, steerVis: 0,
    flying: false, descending: false, onRoad: false, lastSupport: 0, lastKind: 'ground', lastElevRoad: false,
    hitCooldown: 0, bump: 0, flyAlt: 24, altT: 0, kerbT: 0, glide: null,
    jumpActive: false, jumpHeld: false, jumpCooldown: 0, jumpBodyTop: 2.4, jumpStartY: 0, jumpElapsed: 0,
    jumpForcedFall: false, jumpCooldownPendingLanding: false, jumpCollisionMeshes: [], jumpBoundsDirty: true,
    jumpBounds: { bottom: 0, top: 0 }, placementRevision: 0, group: new THREE.Group(), glow: new THREE.Group(),
    light: new THREE.Group(), wheels: [], wheelRollers: [], animateThrusters() {},
  }) as Player;
}

for (const hz of [30, 60]) test(`production Player drives onto a moving ramp, enters and hands over without teleporting at ${hz}Hz`, () => {
  const player = playerFixture(), scene = new THREE.Scene(), contacts = new MovingRailInteraction();
  const events: string[] = [], sceneEvents: string[] = [], trace: unknown[] = [];
  let unlocked = false, time = 0, carried = false, enteredAt = -1, rampFrames = 0, bedFrames = 0, impacts = 0;
  const ctx: DeliveryModuleContext = {
    scene, player: () => ({ ...player.pos, yaw: player.yaw, speed: player.speed, flying: player.flying, jumping: player.jumping }),
    destination: { x: 0, y: 0, z: 0 }, route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1000 }],
    canInteract: () => unlocked, emit: event => events.push(event),
    sceneEvent: event => { sceneEvents.push(event); if (event === 'interiorEntered') enteredAt = time; },
  };
  const module = createDeliveryModule('matchAndLand'); module.setup(ctx, { scene: 'truckInterior', vehicle: 'truck', speed: 6 });
  const dt = 1 / hz;
  const tick = (input: Input) => {
    time += dt; module.update(dt);
    const truck = module.trafficBodies![0];
    if (time > 5 && !events.includes('done')) assert.ok(Math.abs((truck.z - truck.previous.z) / dt - 6) < 1e-7, 'truck remains at six metres/second throughout the driven approach');
    player.city.movingRail = [...module.supports];
    contacts.beforePlayer(player, player.city.movingRail, false, dt);
    player.update(dt, input, time);
    const contact = contacts.afterPlayer(player, dt); player.enforceSpeedLimit(); carried = contact.carried;
    if (contact.hit) impacts++;
    if (contact.body?.id === 'delivery-interior-ramp' && contact.carried) rampFrames++;
    if (contact.body?.id === 'delivery-interior-floor' && contact.carried) bedFrames++;
    if (contact.hit || Math.round(time * hz) % hz === 0) {
      const floor = module.supports.find(body => body.id === 'delivery-interior-floor')!;
      trace.push({ time, z: player.pos.z, y: player.pos.y, speed: player.speed, local: railLocal(floor, player.pos.x, player.pos.z),
        hit: contact.hit ? contact.body?.id : '', carried, instruction: module.status.instruction });
    }
  };
  // The truck reaches its steady six metres/second while the player waits for
  // the call. This is ordinary elapsed simulation, not a moved vehicle pose.
  for (let i = 0; i < hz * 3; i++) tick(idle);
  assert.ok(!module.supports.some(body => body.id === 'delivery-interior-ramp'));
  assert.deepEqual(sceneEvents, []); module.onDrop(); assert.deepEqual(events, []);
  unlocked = true;
  for (let i = 0; i < hz * 2; i++) tick(idle);
  const truckStart = module.trafficBodies![0].z;
  for (let i = 0; i < hz * 30 && !events.includes('done'); i++) {
    const floor = module.supports.find(body => body.id === 'delivery-interior-floor')!;
    const along = railLocal(floor, player.pos.x, player.pos.z).along;
    const desired = along > .3 ? 0 : carried ? 3 : 11;
    const input = { ...idle,
      throttle: player.speed < desired - .15 ? 1 : 0,
      brake: player.speed > desired + .4 && player.speed > 20 * dt ? 1 : 0,
    };
    tick(input);
    if (module.status.canDrop) { module.onDrop(); module.onDrop(); }
  }
  assert.ok(rampFrames > hz / 2, `the complete car must ride the moving ramp: ${JSON.stringify(trace.slice(-12))}`);
  assert.ok(bedFrames > hz / 2, `the complete car must reach its moving bed: ${JSON.stringify(trace.slice(-12))}`);
  assert.ok(enteredAt > 5, 'identity remains hidden until physical rear entry after the call');
  assert.deepEqual(sceneEvents, ['interiorEntered', 'catchStarted']);
  assert.deepEqual(events, ['done'], `handoff completes once through production driving: ${JSON.stringify(trace.slice(-12))}`);
  assert.equal(impacts, 0, `a correctly aligned approach must not bounce at either ramp seam: ${JSON.stringify(trace.filter((sample: any) => sample.hit))}`);
  assert.ok(module.trafficBodies![0].z > truckStart + 30, 'the truck keeps travelling throughout the approach and handoff');
  assert.ok(module.trafficBodies![0].z < 900, 'completion occurs before any route-end stop');
  assert.ok(Math.abs(player.speed) < .5, 'the player is carried at rest relative to the truck for handoff');
  assert.equal(player.flying, false); assert.equal(player.jumping, false);
  module.teardown();
});

function openTruckBodies() {
  const player = playerFixture(), module = createDeliveryModule('matchAndLand');
  module.setup({ scene: new THREE.Scene(), player: () => ({ ...player.pos, yaw: player.yaw, speed: player.speed }),
    destination: { x: 0, y: 0, z: 0 }, route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1000 }],
    canInteract: () => true, emit() {},
  }, { scene: 'truckInterior', vehicle: 'truck', speed: 6 });
  for (let i = 0; i < 120; i++) module.update(1 / 60);
  const bodies = module.supports.map(body => ({ ...body, previous: { x: body.x, y: body.y, z: body.z, hx: body.hx, hz: body.hz, grade: body.grade } }));
  module.teardown(); return bodies;
}

test('ramp seam exception does not bypass a missing ramp, a detached ramp, a below-ramp car or an ordinary train body', () => {
  for (const mode of ['missing', 'detached', 'below', 'ordinary-train'] as const) {
    const bodies = openTruckBodies(), floor = bodies.find(body => body.id === 'delivery-interior-floor')!, ramp = bodies.find(body => body.id === 'delivery-interior-ramp')!;
    const player = playerFixture(), contact = new MovingRailInteraction();
    const z = floor.z - floor.halfLength - 2.45;
    player.pos.set(.55, railRoofAt(ramp, .55, z)! + .55, z); player.speed = 4;
    let collisionBodies: MovingRailBody[] = bodies;
    if (mode === 'missing') collisionBodies = bodies.filter(body => body !== ramp);
    if (mode === 'detached') { ramp.z -= 1; ramp.previous.z -= 1; player.pos.y = railRoofAt(ramp, player.pos.x, player.pos.z)! + .55; }
    if (mode === 'below') player.pos.y = .55;
    if (mode === 'ordinary-train') floor.id = 'rail:ordinary-coach';
    player.city.movingRail = collisionBodies;
    let hit = false;
    for (let i = 0; i < 10 && !hit; i++) {
      contact.beforePlayer(player, collisionBodies, false, 1 / 30);
      player.update(1 / 30, { ...idle, throttle: 1 }, i / 30);
      hit = contact.afterPlayer(player, 1 / 30).hit;
    }
    assert.ok(hit, `${mode}: the rear bed or coach face remains solid without valid ramp contact`);
  }
});

test('production car still collides with the truck side walls, logs and front wall after the rear seam fix', () => {
  for (const [part, x, along, steer] of [
    ['right', 1.5, 0, -1], ['logs', -2, -5, 0], ['front', .55, 3, 0],
  ] as const) {
    const bodies = openTruckBodies(), floor = bodies.find(body => body.id === 'delivery-interior-floor')!;
    const player = playerFixture(), contact = new MovingRailInteraction();
    player.pos.set(x, floor.roof + .55, floor.z + along); player.speed = 4; player.city.movingRail = bodies;
    let hitBody = '';
    for (let i = 0; i < 120 && !hitBody; i++) {
      contact.beforePlayer(player, bodies, false, 1 / 60);
      player.update(1 / 60, { ...idle, throttle: 1, steer }, i / 60);
      const result = contact.afterPlayer(player, 1 / 60);
      if (result.hit) hitBody = result.body?.id || 'unknown';
    }
    assert.ok(hitBody, `${part} remains physically solid`);
    if (part === 'front') assert.ok(player.pos.z < floor.z + 8, 'the car does not pass into the cab');
    if (part === 'right') assert.ok(player.pos.x < 2.85, 'the car does not pass through the side wall');
    if (part === 'logs') assert.ok(player.pos.z < floor.z - 1, 'the car does not pass through the log stack');
  }
});

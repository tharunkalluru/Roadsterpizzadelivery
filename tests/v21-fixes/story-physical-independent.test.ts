import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeliveryModule } from '../../src/delivery/modules';
import { loadLevels } from '../../src/delivery/content/levels';
import { MovingRailFrames, MovingRailInteraction, railRoofAt, type MovingRailBody, type RailPlayer } from '../../src/game/moving-rail';

for (const levelIndex of [1, 9]) test(`${levelIndex === 1 ? 'Railway' : 'Metro'} story waits for physical roof contact during an ordinary nonflight fall`, () => {
  const level = loadLevels()[levelIndex], module = createDeliveryModule(level.module);
  const body: MovingRailBody = {
    id: levelIndex === 1 ? 'rail:story:review:2' : 'metro:blue:17:2',
    x: 0, y: 0, z: 0, hx: 0, hz: 1, roof: 4.2, bottom: .2,
    halfWidth: 1.65, halfLength: 10, previous: { x: 0, y: 0, z: 0, hx: 0, hz: 1 },
  };
  // Ordinary falling off a structure is not Player.airborne: those flags are
  // false while vy remains negative. This is a real physics state, unlike a
  // flying car whose flags would trivially prevent story capture.
  const player: RailPlayer = { pos: { x: 0, y: body.roof + .55 + .7, z: 0 }, yaw: 0,
    speed: 0, vy: -3, flying: false, descending: false, jumping: false };
  const contact = new MovingRailInteraction();
  contact.beforePlayer(player, [body], false, .016);
  assert.equal(contact.afterPlayer(player, .016).carried, false, 'a 0.7m air gap has not landed on the real roof');
  assert.equal(contact.supportId, null);
  module.setup({ scene: new THREE.Scene(), destination: { x: 0, y: 0, z: 0 },
    player: () => ({ ...player.pos, yaw: player.yaw, speed: player.speed, flying: player.flying,
      descending: player.descending, jumping: player.jumping,
      railSupportId: contact.supportId, verticalSpeed: player.vy }),
    emit() {}, automaticStories: true, canInteract: () => true,
    existingTrain: () => body, trainBodies: () => [body], metroService: () => ({ bodies: [body], dwells: [] }),
  }, level.moduleParams);
  module.update(.016);
  assert.notEqual(module.story?.entry, true, 'free-fall proximity must not turn into automatic landing');
  assert.equal(module.storyArrivalReady, false);

  player.pos.y = body.roof + .55; player.vy = 0;
  contact.beforePlayer(player, [body], false, .016);
  assert.equal(contact.afterPlayer(player, .016).carried, true);
  assert.equal(contact.supportId, body.id);
  module.update(.016);
  assert.equal(module.story?.entry, true, 'manual contact with the same marked roof does start the story');
  assert.equal(module.storyArrivalReady, true);
  module.teardown();
});

function contactFixture(levelIndex: number, coupling = false) {
  const level = loadLevels()[levelIndex], module = createDeliveryModule(level.module), frames = new MovingRailFrames();
  const group = levelIndex === 1 ? 'rail:story:review' : 'metro:blue:17';
  const grade = coupling ? .04 : 0;
  const shape = (index: number, z: number) => ({
    id: `${group}:${index}`, roofGroup: group, roofIndex: index,
    x: 0, y: z * grade, z, hx: 0, hz: 1, grade,
    roof: 4.2 + z * grade, bottom: .2 + z * grade, halfWidth: 1.65, halfLength: 10,
  });
  // Rear-first ordering makes the actual contact solver own the rear body,
  // even when both adjacent bodies expose the same real coupling surface.
  const bodies = frames.set(coupling ? [shape(3, -22), shape(2, 0)] : [shape(2, 0)]);
  const marked = bodies.find(body => body.id.endsWith(':2'))!, contacted = coupling ? bodies[0] : marked;
  const z = coupling ? -11 : 0, roof = railRoofAt(contacted, 0, z)!;
  assert.ok(roof !== null);
  const player: RailPlayer = { pos: { x: 0, y: roof + .55, z }, yaw: 0,
    speed: 0, vy: 0, flying: false, descending: false, jumping: false };
  const contact = new MovingRailInteraction();
  const snapshot = () => ({ ...player.pos, yaw: player.yaw, speed: player.speed,
    flying: player.flying, descending: player.descending, jumping: player.jumping,
    railSupportId: contact.supportId, verticalSpeed: player.vy });
  module.setup({ scene: new THREE.Scene(), destination: { x: 0, y: 0, z: 0 }, player: snapshot,
    emit() {}, automaticStories: true, canInteract: () => true, existingTrain: () => marked,
    trainBodies: () => bodies, metroService: () => ({ bodies, dwells: [] }),
  }, level.moduleParams);
  const touch = (supportBodies = bodies) => {
    contact.beforePlayer(player, supportBodies, false, .016);
    const result = contact.afterPlayer(player, .016);
    assert.equal(result.carried, true); return result;
  };
  return { module, bodies, marked, contacted, player, contact, touch };
}

for (const levelIndex of [1, 9]) {
  const kind = levelIndex === 1 ? 'Railway' : 'Metro';
  test(`${kind} story rejects an unsupported same-height car until the actual solver establishes contact`, () => {
    const f = contactFixture(levelIndex);
    assert.equal(f.contact.supportId, null);
    f.module.update(.016);
    assert.notEqual(f.module.story?.entry, true, 'position at roof height is insufficient without support');
    assert.equal(f.module.storyArrivalReady, false);
    f.touch(); assert.equal(f.contact.supportId, f.marked.id);
    f.module.update(.016); assert.equal(f.module.story?.entry, true);
    assert.equal(f.module.storyArrivalReady, true); f.module.teardown();
  });

  test(`${kind} story rejects real support from a different rake at the same roof coordinates`, () => {
    const f = contactFixture(levelIndex), wrong = { ...f.marked, id: 'wrong-rake:2', roofGroup: 'wrong-rake' };
    f.bodies.push(wrong); // Both real rakes are visible to the module service.
    f.touch([wrong]); assert.equal(f.contact.supportId, wrong.id);
    f.module.update(.016);
    assert.notEqual(f.module.story?.entry, true, 'another real train is not the marked delivery rake');
    assert.equal(f.module.storyArrivalReady, false);
    f.touch(); assert.equal(f.contact.supportId, f.marked.id);
    f.module.update(.016); assert.equal(f.module.story?.entry, true);
    assert.equal(f.module.storyArrivalReady, true); f.module.teardown();
  });

  test(`${kind} story rejects nonzero falling velocity even when a previous supported roof id remains`, () => {
    const f = contactFixture(levelIndex); f.touch();
    f.player.vy = -2;
    f.module.update(.016); assert.notEqual(f.module.story?.entry, true);
    assert.equal(f.module.storyArrivalReady, false);
    f.player.vy = 0;
    f.module.update(.016); assert.equal(f.module.story?.entry, true); f.module.teardown();
  });

  test(`${kind} story accepts actual rear-coach support on the graded coupling surface`, () => {
    const f = contactFixture(levelIndex, true);
    assert.ok(f.contacted.roofJoins?.length, 'test uses actual generated coach joins');
    assert.ok(Math.abs(f.player.pos.z - f.contacted.z) > f.contacted.halfLength,
      'the center is in the small physical gap, outside either coach rectangle');
    f.touch(); assert.equal(f.contact.supportId, f.contacted.id);
    f.module.update(.016); assert.equal(f.module.story?.entry, true);
    assert.equal(f.module.storyArrivalReady, true); f.module.teardown();
  });
}

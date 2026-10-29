import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import { createPickupConfig, PICKUP_CONFIG } from '../../src/delivery/core/pickup-config';
import { PickupDetector, type JumpPickupPose, type PickupMarker } from '../../src/delivery/systems/pickup-detector';

function pose(x = 0, y = 2, z = 0, jumping = true): JumpPickupPose { return { x, y, z, bottom: y - .55, top: y + 1.2, jumping }; }
function marker(x = 0, y = 3, z = 0, id = 'auto'): PickupMarker {
  return { carrierId: id, position: { x, y, z }, previousPosition: { x, y, z } };
}
function fixture() {
  const bus = new EventBus<DeliveryEvents>(), detector = new PickupDetector(bus), events: DeliveryEvents['orderPicked'][] = [];
  bus.on('orderPicked', event => events.push(event));
  return { bus, detector, events };
}

test('pickup tuning is finite, bounded, frozen and independent per override', () => {
  assert.equal(PICKUP_CONFIG.boxHeightAboveRoof, .65); assert.equal(PICKUP_CONFIG.maxCarriersNearby, 3);
  assert.ok(Object.isFrozen(PICKUP_CONFIG));
  assert.equal(createPickupConfig({ grabRadius: 2 }).grabRadius, 2); assert.equal(PICKUP_CONFIG.grabRadius, 1.7);
  for (const overrides of [{ grabRadius: NaN }, { carrierRange: 0 }, { maxCarriersNearby: 4 }, { maxCarriersNearby: 1.5 }, { recycleRange: 10 }])
    assert.throws(() => createPickupConfig(overrides), RangeError);
});

test('jump pickup gives one anonymous event, latches before callbacks and copies marker position', () => {
  const { bus, detector, events } = fixture(), box = marker();
  bus.on('orderPicked', () => assert.equal(detector.update(pose(), pose(), [box]), null));
  const result = detector.update(pose(), pose(), [box, marker(1, 3, 0, 'bus')]);
  assert.equal(result?.carrierId, 'auto'); assert.equal(events.length, 1); assert.equal(detector.caught, true);
  box.position.x = 99; assert.equal(events[0].position.x, 0);
  assert.deepEqual(Object.keys(events[0]).sort(), ['carrierId', 'position']);
  assert.equal(detector.update(pose(), pose(), [marker()]), null);
});

test('a miss remains retryable and reset starts the next delivery', () => {
  const { detector, events } = fixture();
  assert.equal(detector.update(pose(), pose(), [marker(8)]), null); assert.equal(detector.caught, false);
  assert.ok(detector.update(pose(), pose(), [marker()]));
  detector.reset(); assert.equal(detector.caught, false); assert.ok(detector.update(pose(), pose(), [marker()]));
  assert.equal(events.length, 2);
});

test('only Jump can grab: ground driving, ordinary flight and disabled simulation do not collect', () => {
  const { detector, events } = fixture();
  for (const y of [.55, 24]) assert.equal(detector.update(pose(0, y, 0, false), pose(0, y, 0, false), [marker(0, y)]), null);
  detector.enabled = false; assert.equal(detector.update(pose(), pose(), [marker()]), null);
  detector.enabled = true; assert.ok(detector.update(pose(), pose(), [marker()])); assert.equal(events.length, 1);
});

test('relative swept pickup catches a fast bike even when neither displayed endpoint overlaps', () => {
  const { detector } = fixture(), box = marker(-10, 3, 0, 'bike'); box.previousPosition.x = 10;
  assert.ok(detector.update(pose(-2), pose(2), [box]));
});

test('launch and landing frames remain eligible without granting the next grounded frame', () => {
  const launch = fixture(), landing = fixture();
  assert.ok(launch.detector.update(pose(0, .55, 0, false), pose(0, 2), [marker()]));
  assert.ok(landing.detector.update(pose(-5, 2), pose(5, .55, 0, false), [marker()]));
  landing.detector.reset(); assert.equal(landing.detector.update(pose(5, .55, 0, false), pose(5, .55, 0, false), [marker(5, 1)]), null);
});

test('bus roof boxes are reachable by the existing 3.125 metre jump with rotating car bounds', () => {
  const { detector } = fixture();
  const apex = pose(0, .55 + 3.125); apex.bottom = apex.y - 1.2; apex.top = apex.y + 1.5;
  assert.ok(detector.update(apex, apex, [marker(0, 3.3 + PICKUP_CONFIG.boxHeightAboveRoof, 0, 'bus')]));
});

test('stacked streets and noncoincident vertical/horizontal sweeps cannot pick through decks', () => {
  const { detector } = fixture();
  assert.equal(detector.update(pose(), pose(), [marker(0, 12)]), null);
  // Horizontal closest approach is at the start; height becomes reachable only after the marker has left.
  const box = marker(20, 2); box.previousPosition = { x: 0, y: 15, z: 0 };
  assert.equal(detector.update(pose(), pose(), [box]), null);
});

test('when multiple boxes sweep through the car, the first contact wins deterministically', () => {
  const { detector, events } = fixture();
  const late = marker(0, 3, 0, 'late'); late.previousPosition.x = 20;
  const early = marker(0, 3, 0, 'early'); early.previousPosition.x = 5;
  assert.equal(detector.update(pose(), pose(), [late, early])?.carrierId, 'early'); assert.equal(events.length, 1);
});

test('invalid geometry cannot emit an order and an invalid box cannot mask a valid one', () => {
  const { detector } = fixture(), invalid = marker(); invalid.position.x = Infinity;
  assert.equal(detector.update({ ...pose(), bottom: 10 }, pose(), [marker()]), null);
  assert.equal(detector.update({ ...pose(), x: NaN }, pose(), [marker()]), null);
  assert.ok(detector.update(pose(), pose(), [invalid, marker()]));
});

test('event subscriptions can be removed and a clear during emit is safe', () => {
  const bus = new EventBus<DeliveryEvents>(); let calls = 0;
  const off = bus.on('orderPicked', () => calls++); off();
  bus.emit('orderPicked', { carrierId: 'a', position: { x: 0, y: 0, z: 0 } }); assert.equal(calls, 0);
  bus.on('orderPicked', () => { calls++; bus.clear(); });
  bus.emit('orderPicked', { carrierId: 'a', position: { x: 0, y: 0, z: 0 } });
  bus.emit('orderPicked', { carrierId: 'a', position: { x: 0, y: 0, z: 0 } }); assert.equal(calls, 1);
});

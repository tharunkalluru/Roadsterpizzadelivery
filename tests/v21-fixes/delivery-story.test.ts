import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import type { LevelConfig, StorageLike } from '../../src/delivery/core/types';
// Historical call/story regression fixture; the production scene campaign has fourteen levels.
import { loadLegacyLevels as loadLevels } from './fixtures/legacy-levels';
import { validateLevels } from '../../src/delivery/content/levels';
import { ProgressSystem, MYSTERY_SAVE_KEY } from '../../src/delivery/systems/progress-system';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  writes: string[] = [];
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); this.map.set(key, value); }
}
function fixture(levels: LevelConfig[] = loadLevels()) {
  const bus = new EventBus<DeliveryEvents>(), storage = new MemoryStorage();
  const controller = new DeliveryController(levels, bus, storage);
  return { controller, bus, storage };
}
function finishCall(controller: DeliveryController) {
  let guard = 0;
  while (controller.calls.active && guard++ < 30) {
    const replies = controller.calls.currentLine?.replies;
    assert.equal(controller.advanceCall(replies ? 0 : undefined), true);
  }
  assert.ok(guard < 30, 'finite scripts must finish');
}
function finishLevel(controller: DeliveryController) {
  assert.equal(controller.pickup(), true); controller.update(.016, 0);
  assert.equal(controller.call(), true); finishCall(controller);
  assert.equal(controller.canDrop, true); assert.equal(controller.setpieceDone(), true);
}

test('seven data-driven levels validate; Jersey/Eega switch without mechanic code changes', () => {
  const levels = loadLevels(); assert.equal(levels.length, 7);
  assert.deepEqual([...new Set(levels.map(l => l.module))].sort(), ['beatDrop', 'chainDrop', 'matchAndLand', 'threadGap', 'underwater']);
  assert.deepEqual([...new Set(levels.map(l => l.callMode))].sort(), ['CUSTOMER_CALLS', 'CUSTOMER_NAGS_EN_ROUTE', 'PLAYER_CALLS']);
  assert.equal(levels[3].celebrity.movie, 'Jersey');
  const eega = loadLevels({ 'between-overs': 'eega' });
  assert.equal(eega[3].celebrity.movie, 'Eega'); assert.equal(eega[3].moduleParams.theme, 'eega');
  assert.equal(levels[3].celebrity.movie, 'Jersey', 'variant loading must not mutate default data');
  assert.equal(levels[4].script[0].text, 'gun chudali anuko tappuledu, bullet chudali anukoku');
  assert.equal(new Set(levels.map(l => l.restaurantStage)).size, levels.length);
  assert.throws(() => loadLevels({ 'between-overs': 'not-a-scene' }));
});

test('invalid content fails before play instead of yielding a locked gate', () => {
  for (const mutation of [
    (a: LevelConfig[]) => { a[0].destination.x = NaN; },
    (a: LevelConfig[]) => { a[1].id = a[0].id; },
    (a: LevelConfig[]) => { a[4].script = [{ who: 'customer', text: 'No reveal' }]; },
    (a: LevelConfig[]) => { a[1].script[0].reveal = true; },
    (a: LevelConfig[]) => { a[3].nagScript = []; },
    (a: LevelConfig[]) => { a[0].script[0].replies = ['Invalid customer reply']; },
    (a: LevelConfig[]) => { a[0].level = 19; },
  ]) { const levels = loadLevels(); mutation(levels); assert.throws(() => validateLevels(levels)); }
});

test('pickup reveals location only, ignores duplicate catches, and cannot bypass call gate', () => {
  const { controller, bus } = fixture(); let location: unknown;
  bus.on('locationSet', event => { location = event; });
  assert.equal(controller.calls.buttonState, 'hidden'); assert.equal(controller.canPickup, true);
  assert.equal(controller.pickup(), true); assert.equal(controller.pickup(), false);
  assert.equal(controller.state, 'EN_ROUTE'); assert.equal(controller.reveals.current, null);
  assert.equal(controller.calls.buttonState, 'disabled');
  assert.deepEqual(Object.keys(location as object).sort(), ['destination', 'levelId']);
  assert.ok(!JSON.stringify(location).includes('Allu')); assert.ok(!JSON.stringify(location).includes('Pushpa'));
  assert.equal(controller.setpieceDone(), false); assert.equal(controller.progress.restaurantIndex, 0);
});

test('incoming calls repeat if ignored and early hangup never unlocks the drop', () => {
  const incoming = loadLevels().find(level => level.callMode === 'CUSTOMER_CALLS')!;
  const { controller, bus } = fixture([{ ...incoming, level: 1 }]); let rings = 0;
  bus.on('callRinging', () => rings++);
  controller.pickup(); controller.update(.1, 50);
  assert.equal(controller.state, 'ARRIVED'); assert.equal(controller.calls.buttonState, 'ringing');
  controller.update(8, 50); assert.equal(controller.calls.buttonState, 'disabled');
  controller.update(5, 50); controller.update(.1, 50);
  assert.equal(rings, 2); assert.equal(controller.call(), true);
  assert.equal(controller.state, 'CALL'); controller.update(2.5, 50); assert.equal(controller.calls.elapsed, 2.5);
  assert.equal(controller.endCall(), true); assert.equal(controller.canDrop, false);
  assert.equal(controller.calls.arrivalComplete, false); controller.update(5, 50); controller.update(.1, 50);
  assert.equal(controller.calls.buttonState, 'ringing'); controller.call(); finishCall(controller);
  assert.equal(controller.calls.arrivalComplete, true); assert.equal(controller.state, 'SETPIECE');
});

test('player-call mode enables only near destination and after-delivery identity stays secret', () => {
  const { controller } = fixture(); finishLevel(controller); controller.continueAfterCompletion(); controller.pickup();
  controller.update(20, 1000); assert.equal(controller.calls.buttonState, 'disabled'); assert.equal(controller.call(), false);
  controller.update(.1, 50); assert.equal(controller.calls.buttonState, 'enabled');
  controller.update(.1, 1000); assert.equal(controller.calls.buttonState, 'disabled');
  controller.update(.1, 50); controller.call(); finishCall(controller);
  assert.equal(controller.reveals.current, null); assert.equal(controller.state, 'SETPIECE');
  controller.setpieceDone(); assert.equal(controller.reveals.current?.name, 'Ram Charan');
});

test('specific reveal line swaps unknown identity once; reply choices converge', () => {
  for (const reply of [0, 1]) {
    const callReveal = loadLevels().find(level => level.id === 'imax-seat-service')!;
    const { controller, bus } = fixture([{ ...callReveal, level: 1 }]); let reveals = 0;
    bus.on('celebrityRevealed', () => reveals++);
    controller.pickup(); controller.update(.1, 0); controller.call();
    assert.equal(controller.reveals.current, null); controller.advanceCall();
    assert.equal(controller.calls.lineIndex, 1); assert.equal(controller.advanceCall(), false);
    assert.equal(controller.advanceCall(7), false); assert.equal(controller.calls.lineIndex, 1);
    controller.advanceCall(reply); assert.equal(controller.calls.lineIndex, 2);
    assert.equal(controller.reveals.current?.name, 'Mahesh Babu'); assert.equal(reveals, 1);
    finishCall(controller); controller.setpieceDone(); assert.equal(reveals, 1);
  }
});

test('en-route nag is independent of the mandatory arrival call', () => {
  const levels = loadLevels(), { controller } = fixture();
  for (let n = 0; n < 3; n++) { finishLevel(controller); controller.continueAfterCompletion(); }
  controller.pickup(); controller.update(7, 1000); assert.equal(controller.calls.buttonState, 'disabled');
  controller.update(1, 1000); assert.equal(controller.calls.buttonState, 'ringing');
  controller.call(); assert.equal(controller.calls.kind, 'nag'); finishCall(controller);
  assert.equal(controller.state, 'EN_ROUTE'); assert.equal(controller.canDrop, false); assert.equal(controller.reveals.current, null);
  controller.update(100, 1000); assert.equal(controller.calls.buttonState, 'disabled', 'completed nag must not loop forever');
  controller.update(.1, 50); assert.equal(controller.calls.buttonState, 'ringing'); controller.call();
  assert.equal(controller.calls.kind, 'arrival'); finishCall(controller); assert.equal(controller.canDrop, true);
  assert.equal(controller.reveals.current?.name, levels[3].celebrity.name);
});

test('arrival supersedes ignored nag without trapping a fast player', () => {
  const { controller } = fixture();
  for (let n = 0; n < 3; n++) { finishLevel(controller); controller.continueAfterCompletion(); }
  controller.pickup(); controller.update(8, 1000); assert.equal(controller.calls.kind, 'nag');
  controller.update(.1, 0); assert.equal(controller.calls.kind, 'arrival'); controller.call(); finishCall(controller);
  assert.equal(controller.canDrop, true);
});

test('failure keeps the same level and call complete; completion is idempotent', () => {
  const { controller, bus } = fixture(); const states: string[] = [];
  bus.on('stateChanged', event => states.push(event.state));
  controller.pickup(); controller.update(.1, 0); controller.call(); finishCall(controller);
  assert.equal(controller.setpieceFailed('Try the truck bed again.'), true);
  assert.equal(controller.canDrop, true); assert.equal(controller.progress.completedIds.length, 0);
  assert.equal(controller.setpieceDone(), true); assert.equal(controller.setpieceDone(), false);
  assert.equal(controller.progress.completedIds.length, 1); assert.equal(controller.progress.currentLevel, 2);
  assert.ok(states.includes('REVEAL')); assert.equal(controller.state, 'LEVEL_COMPLETE');
  assert.equal(controller.progress.cards[0].name, 'Allu Arjun');
});

test('bonus calls are optional, revealed, and return to completion without incrementing levels', () => {
  const { controller } = fixture(); finishLevel(controller);
  assert.equal(controller.bonusCall(), true); assert.equal(controller.calls.kind, 'bonus');
  assert.equal(controller.reveals.current?.name, 'Allu Arjun'); finishCall(controller);
  assert.equal(controller.state, 'LEVEL_COMPLETE'); assert.equal(controller.progress.completedIds.length, 1);
  assert.equal(controller.continueAfterCompletion(), true); assert.equal(controller.state, 'ROAMING');
  assert.equal(controller.calls.buttonState, 'hidden'); assert.equal(controller.destination, null);
});

test('new save is isolated; reload retries incomplete level and retains completed restaurant stages', () => {
  const { controller, storage } = fixture(); storage.map.set('p2ph-save-v1', '{"coins":999,"level":12}');
  finishLevel(controller); controller.continueAfterCompletion(); controller.pickup();
  const resumed = new DeliveryController(loadLevels(), new EventBus<DeliveryEvents>(), storage);
  assert.equal(resumed.progress.currentLevel, 2); assert.equal(resumed.state, 'ROAMING');
  assert.equal(resumed.progress.restaurantStage, 'Pizza cart'); assert.equal(resumed.progress.cards.length, 1);
  resumed.pickup(); resumed.retry(); assert.equal(resumed.progress.currentLevel, 2);
  resumed.reset(); assert.equal(resumed.progress.currentLevel, 1);
  assert.ok(storage.writes.every(key => key === MYSTERY_SAVE_KEY));
  assert.equal(storage.map.get('p2ph-save-v1'), '{"coins":999,"level":12}');
});

test('corrupt and blocked storage remain playable and cannot unlock a future level', () => {
  const levels = loadLevels(), storage = new MemoryStorage();
  storage.map.set(MYSTERY_SAVE_KEY, '{broken');
  const corrupt = new ProgressSystem(levels, storage); assert.equal(corrupt.currentLevel, 1);
  assert.equal(corrupt.complete(levels[2].id), false);
  storage.map.set(MYSTERY_SAVE_KEY, JSON.stringify({ version: 1, completed: [levels[0].id, levels[2].id] }));
  const holes = new ProgressSystem(levels, storage); assert.deepEqual(holes.completedIds, [levels[0].id]);
  const blocked = new ProgressSystem(levels, { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); } });
  assert.equal(blocked.complete(levels[0].id), true); assert.equal(blocked.currentLevel, 2); assert.equal(blocked.saveAvailable, false);
});

test('all seven story gates complete in order; final free roam has no extra orders', () => {
  const { controller } = fixture();
  for (let n = 0; n < controller.progress.total; n++) {
    assert.equal(controller.progress.currentLevel, n + 1); finishLevel(controller);
    assert.equal(controller.progress.restaurantIndex, n + 1); controller.continueAfterCompletion();
  }
  assert.equal(controller.progress.finished, true); assert.equal(controller.progress.cards.length, 7);
  assert.equal(controller.progress.restaurantStage, 'Neon restaurant'); assert.equal(controller.canPickup, false);
  assert.equal(controller.pickup(), false); assert.equal(controller.state, 'ROAMING');
});

test('adding an eighth data entry updates the HUD denominator and unlock sequence without code changes', () => {
  const levels = loadLevels(); levels.push({ ...levels[0], id: 'another-delivery', level: 8, restaurantStage: 'Rooftop restaurant' });
  validateLevels(levels); const { controller } = fixture(levels);
  for (let n = 0; n < 7; n++) { finishLevel(controller); controller.continueAfterCompletion(); }
  assert.equal(controller.progress.total, 8); assert.equal(controller.progress.currentLevel, 8);
  assert.equal(controller.progress.finished, false); finishLevel(controller); assert.equal(controller.progress.finished, true);
});

test('dispose unsubscribes controller lifecycle handlers', () => {
  const { controller, bus } = fixture(); controller.dispose();
  bus.emit('callStarted', { kind: 'arrival' }); assert.equal(controller.state, 'ROAMING');
});

// These two scene reveals are deliberately later than their anonymous calls.
test('truck-interior and lake customers remain unknown throughout their player-initiated calls', () => {
  for (const id of ['sandalwood-special', 'sagar-axe-special']) {
    const content = loadLevels().find(level => level.id === id)!;
    const { controller, bus } = fixture([{ ...content, level: 1 }]); let reveals = 0;
    bus.on('celebrityRevealed', () => reveals++);
    assert.equal(content.callMode, 'PLAYER_CALLS');
    controller.pickup(); controller.update(.016, 0);
    assert.equal(controller.calls.buttonState, 'enabled'); controller.call();
    while (controller.calls.active) {
      assert.equal(controller.reveals.current, null);
      controller.advanceCall(controller.calls.currentLine?.replies ? 0 : undefined);
    }
    assert.equal(reveals, 0); assert.equal(controller.canDrop, true);
  }
});

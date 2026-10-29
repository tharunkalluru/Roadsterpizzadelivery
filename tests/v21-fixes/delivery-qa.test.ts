import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDeliveryQA } from '../../src/delivery/qa';
import { ProgressSystem, MYSTERY_SAVE_KEY } from '../../src/delivery/systems/progress-system';

test('QA scenarios use the real seven levels and normal sequential progress with isolated storage', () => {
  for (let number = 1; number <= 7; number++) {
    const qa = createDeliveryQA(String(number))!;
    assert.equal(qa.runtime.levels!.length, 7);
    const progress = new ProgressSystem(qa.runtime.levels!, qa.storage);
    assert.equal(progress.currentLevel, number); assert.equal(progress.completedIds.length, number - 1);
    assert.equal(qa.area.x, qa.runtime.levels![number - 1].destination.x);
    assert.equal(qa.area.z, qa.runtime.levels![number - 1].destination.z);
    progress.complete(progress.nextLevel!.id);
    const fresh = createDeliveryQA(String(number))!;
    assert.equal(new ProgressSystem(fresh.runtime.levels!, fresh.storage).completedIds.length, number - 1, 'reload creates fresh temporary progress');
    assert.equal(qa.storage.getItem('p2ph-save-v1'), null); assert.equal(qa.storage.getItem('p2ph-area-v1'), null);
    if (number > 1) assert.ok(fresh.storage.getItem(MYSTERY_SAVE_KEY));
  }
});

test('invalid QA levels cannot launch, and the entry point gates its dynamic import on Vite DEV', () => {
  for (const value of [null, '', '0', '8', '-1', '1.5', '1x', 'Infinity', '01']) assert.equal(createDeliveryQA(value), null);
  const main = readFileSync('src/main.ts', 'utf8');
  assert.match(main, /import\.meta\.env\.DEV && q\.has\('qaDelivery'\)/);
  assert.match(main, /await import\('\.\/delivery\/qa'\)/);
  const qa = readFileSync('src/delivery/qa.ts', 'utf8');
  assert.doesNotMatch(qa, /localStorage|__qa|setpieceDone\(|advanceCall\(|onDrop\(/);
});

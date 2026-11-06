import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseProgressHtml } from '../../src/ui/pause-progress';
import { pauseMenuHtml } from '../../src/ui/settings';
import { Game } from '../../src/game/game';

const count = (html: string, state: string) => [...html.matchAll(new RegExp(`data-state="${state}"`, 'g'))].length;
test('pause progress shows the current level separately from completed deliveries, with content-sized segments', () => {
  for (const total of [7, 27, 100]) {
    const html = pauseProgressHtml({ current: 4, total, completed: 3 });
    assert.equal([...html.matchAll(/class="pause-segment"/g)].length, total);
    assert.equal(count(html, 'completed'), 3); assert.equal(count(html, 'current'), 1); assert.equal(count(html, 'locked'), total - 4);
    assert.match(html, new RegExp(`Level 4 / ${total}`));
    assert.match(html, new RegExp(`aria-valuemax="${total}" aria-valuenow="4"`));
    assert.match(html, /aria-valuetext="Level 4 of \d+, 3 completed"/);
    assert.match(html, new RegExp(`--progress-columns:${Math.min(total, 14)}`));
    assert.doesNotMatch(html, /button|tabindex|celebrity/i, 'progress does not unlock levels or leak customers');
  }
});
test('finished, fresh and malformed counts render bounded accessible progress', () => {
  const done = pauseProgressHtml({ current: 27, total: 27, completed: 27 });
  assert.equal(count(done, 'completed'), 27); assert.equal(count(done, 'current'), 0); assert.equal(count(done, 'locked'), 0);
  const fresh = pauseProgressHtml({ current: 1, total: 7, completed: 0 });
  assert.equal(count(fresh, 'current'), 1); assert.equal(count(fresh, 'completed'), 0); assert.match(fresh, /0 completed/);
  const bounded = pauseProgressHtml({ current: 100, total: 7, completed: -1 });
  assert.match(bounded, /Level 7 \/ 7/); assert.match(bounded, /aria-valuenow="7"/);
  for (const total of [0, -2, NaN, Infinity]) assert.equal(pauseProgressHtml({ current: 1, total, completed: 0 }), '');
  assert.equal(pauseProgressHtml(), '');
});
test('campaign pause contains restaurant, progress and map credits while preserving both restart actions', () => {
  const html = pauseMenuHtml(true, { current: 4, total: 27, completed: 3 }, 'Day 4 · 10:05 AM');
  assert.match(html, /data-pause-menu/); assert.match(html, /Level 4 \/ 27/); assert.match(html, /Day 4 · 10:05 AM/);
  assert.match(html, /id="restaurant"><span>My restaurant/); assert.doesNotMatch(html, /id="area"/);
  assert.match(html, /id="reset">Restart current level<\/button><button[^>]+id="start-level-one">Start from level 1/);
  assert.match(html, /href="\/credits.html"[^>]+>Map credits/);
  assert.doesNotMatch(pauseMenuHtml(false), /id="restaurant"|pause-progress|start-level-one/);
  assert.match(pauseMenuHtml(false), /id="area"/);
  assert.doesNotMatch(pauseMenuHtml(true, undefined, '<script>'), /<script>/);
});

function menu(restaurantAvailable = true) {
  const trace: string[] = [], buttons = new Map<string, () => void>();
  let markup = '';
  const game: any = {
    carrierPickupMode: true, map: { open: false }, choosing: false, paused: false, day: 5, minutes: 65,
    story: { pauseProgress: { current: 4, total: 27, completed: 3 }, openRestaurant() { trace.push('restaurant opened'); return restaurantAvailable; } },
    resetInput: () => trace.push('input released'), clock: { getDelta: () => trace.push('clock reset') },
    resume() {}, startCampaign() {}, openPause: () => trace.push('pause reopened'),
    hud: { modal(html: string | null, bind?: (sheet: any) => void) {
      trace.push(html ? 'pause shown' : 'pause hidden'); if (!html) return;
      markup = html;
      const nodes = new Map<string, any>();
      for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], { addEventListener(_: string, handler: () => void) { buttons.set(match[1], handler); } });
      bind?.({ querySelector: (selector: string) => nodes.get(selector.slice(1)) ?? null });
    } },
  };
  Game.prototype.openPause.call(game);
  return { game, trace, markup, click: (id: string) => { assert.ok(buttons.has(id)); buttons.get(id)!(); } };
}
test('pause restaurant entry dismisses the pause surface and releases its clock before opening the collection', () => {
  const f = menu(); assert.equal(f.game.paused, true); assert.match(f.markup, /Level 4 \/ 27/);
  f.trace.length = 0; f.click('restaurant');
  assert.deepEqual(f.trace, ['pause hidden', 'input released', 'clock reset', 'restaurant opened']);
  assert.equal(f.game.paused, false, 'the restaurant owns blocking while the generic pause layer is closed');
});
test('an unavailable restaurant entry returns to Pause rather than leaving an unpaused empty interface', () => {
  const f = menu(false); f.trace.length = 0; f.click('restaurant');
  assert.equal(f.trace.at(-1), 'pause reopened');
});

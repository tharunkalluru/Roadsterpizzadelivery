import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../../src/game/game';
import { pauseMenuHtml } from '../../src/ui/settings';

function menu() {
  const buttons = new Map<string, { handler?: () => void; removed?: boolean; addEventListener: (_: string, handler: () => void) => void; remove: () => void }>();
  const calls: string[] = [];
  let markup = '';
  const game: any = {
    carrierPickupMode: true, map: { open: false }, choosing: false, paused: false,
    story: { restartCurrentLevel: () => calls.push('load current level'), startFromLevelOne: () => calls.push('reset campaign') },
    resetInput: () => calls.push('release input'), resume: () => calls.push('resume'),
    startCampaign: () => calls.push('place at campaign start'),
    hud: { modal(html: string, bind: (sheet: any) => void) {
      markup = html;
      for (const match of html.matchAll(/id="([^"]+)"/g)) {
        const button: any = { addEventListener(_: string, handler: () => void) { button.handler = handler; }, remove() { button.removed = true; } };
        buttons.set(match[1], button);
      }
      bind({ querySelector: (selector: string) => buttons.get(selector.slice(1)) ?? null });
    } },
  };
  Game.prototype.openPause.call(game);
  return { game, calls, get markup() { return markup; }, click: (id: string) => { const b = buttons.get(id); assert.ok(b?.handler, `${id} is actionable`); b.handler(); } };
}

test('campaign pause places current-level and level-one restart actions beside each other', () => {
  const html = pauseMenuHtml(true);
  assert.match(html, /class="pause-footer campaign-restarts"/);
  assert.match(html, /id="reset">Restart current level<\/button><button[^>]+id="start-level-one">Start from level 1<\/button>/);
  const css = readFileSync('src/ui/hud.ts', 'utf8');
  assert.match(css, /\.pause-footer\.campaign-restarts\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px\}/);
  const legacy = pauseMenuHtml();
  assert.match(legacy, /id="reset">Reset progress/);
  assert.doesNotMatch(legacy, /id="start-level-one"/);
});

test('current-level restart resumes before the dedicated safe-road replay and does not reset the campaign', () => {
  const f = menu(); assert.equal(f.game.paused, true);
  f.calls.length = 0; f.click('reset');
  assert.deepEqual(f.calls, ['resume', 'load current level']);
});

test('start from level 1 explicitly resets the campaign before using the normal safe campaign start', () => {
  const f = menu(); f.calls.length = 0; f.click('start-level-one');
  assert.deepEqual(f.calls, ['reset campaign', 'place at campaign start']);
  assert.doesNotMatch(f.markup, /Restart current delivery/);
});

test('pause cannot create a restart menu over an open map or area picker', () => {
  for (const state of [{ map: { open: true }, choosing: false }, { map: { open: false }, choosing: true }]) {
    let modals = 0;
    Game.prototype.openPause.call({ ...state, hud: { modal() { modals++; } } } as any);
    assert.equal(modals, 0);
  }
});

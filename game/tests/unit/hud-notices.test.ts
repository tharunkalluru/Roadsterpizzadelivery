import { describe, expect, it } from 'vitest';
import { Hud } from '../../src/ui/hud';
import type { SessionNotice } from '../../src/missions/session';

function harness(lastNotice?: SessionNotice) {
  const shown: SessionNotice['text'][] = [];
  const hud = Object.assign(Object.create(Hud.prototype), {
    lastNotice,
    toast: (text: string) => shown.push(text),
  }) as { announceNotices(notices: SessionNotice[]): void };
  return { hud, shown };
}

const notice = (text: string): SessionNotice => ({ text, tick: 100, kind: 'info' });

describe('HUD bounded session notices', () => {
  it('continues showing notices after the session ring reaches eight entries', () => {
    const { hud, shown } = harness(), notices: SessionNotice[] = [];
    for (let i = 0; i < 12; i++) {
      notices.push(notice(`notice ${i}`));
      if (notices.length > 8) notices.shift();
      hud.announceNotices(notices);
    }
    expect(shown).toEqual(Array.from({ length: 12 }, (_, i) => `notice ${i}`));
  });

  it('forwards cancellation and collection in order even within the same tick', () => {
    const notices = Array.from({ length: 8 }, (_, i) => notice(`old ${i}`));
    const { hud, shown } = harness(notices.at(-1));
    notices.splice(0, 2);
    notices.push(notice('Delivery hold cancelled'), { ...notice('Pizza collected. Deliver to destination.'), kind: 'good' });
    hud.announceNotices(notices); hud.announceNotices(notices);
    expect(shown).toEqual(['Delivery hold cancelled', 'Pizza collected. Deliver to destination.']);
  });

  it('does not replay the notice history when resuming a run', () => {
    const notices = [notice('prior warning'), notice('prior collection')];
    const { hud, shown } = harness(notices.at(-1));
    hud.announceNotices(notices);
    expect(shown).toEqual([]);
    hud.announceNotices([]);
    hud.announceNotices([notice('new run warning')]);
    expect(shown).toEqual(['new run warning']);
  });
});

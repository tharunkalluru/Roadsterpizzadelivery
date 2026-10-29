import type { Game } from '../game/game';
import type { StorageLike } from './core/types';
import { loadLevels } from './content/levels';
import { ProgressSystem } from './systems/progress-system';
import type { DeliveryRuntimeOptions } from './runtime';

/** Imported only by main.ts's import.meta.env.DEV branch. No global test hooks. */
export function createDeliveryQA(value: string | null) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const levels = loadLevels(), number = Number(value);
  if (!Number.isSafeInteger(number) || number > levels.length) return null;
  const values = new Map<string, string>([['roadster-carrier-tutorial-v1', '1']]);
  const storage: StorageLike = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  // Use ordinary progress validation, rather than replacing the content list
  // or mutating the controller's unlocked level behind its public API.
  const progress = new ProgressSystem(levels, storage);
  for (const previous of levels.slice(0, number - 1)) progress.complete(previous.id);
  const destination = levels[number - 1].destination;
  const runtime: DeliveryRuntimeOptions = { levels, storage };
  return {
    number, runtime, storage,
    area: { name: `QA scenario ${number}`, x: destination.x, z: destination.z },
    attach(game: Game) {
      const panel = document.createElement('aside');
      panel.setAttribute('aria-label', 'Development delivery scenario');
      panel.style.cssText = 'position:absolute;z-index:6;left:50%;top:76px;transform:translateX(-50%);max-width:340px;width:calc(100vw - 30px);box-sizing:border-box;padding:8px 10px;border:2px solid #ffbf00;border-radius:12px;background:#20152f;color:#fff1d5;font:12px system-ui;pointer-events:auto';
      const label = document.createElement('strong');
      label.textContent = `QA scenario ${number} · temporary progress`;
      const status = document.createElement('p'); status.style.margin = '5px 0';
      status.setAttribute('role', 'status');
      const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      const button = (text: string, act: () => void) => {
        const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
        el.style.cssText = 'min-height:36px;padding:6px 9px;border:1px solid #a18ab5;border-radius:8px;background:#362345;color:#fff1d5;touch-action:manipulation';
        el.addEventListener('click', event => { event.stopPropagation(); act(); }); buttons.append(el); return el;
      };
      const prepare = button('Prepare order', () => {
        if (prepare.disabled || !game.story) return;
        game.resetInput(); game.sound.unlock(); game.story.controller.pickup(); update();
        game.engine.renderer.domElement.focus({ preventScroll: true });
      });
      button('Restart scenario', () => location.reload());
      button('Hide QA controls', () => cleanup());
      panel.addEventListener('pointerdown', event => event.stopPropagation());
      panel.addEventListener('keydown', event => event.stopPropagation());
      panel.append(label, status, buttons); game.hud.root.append(panel);
      const update = () => {
        const blocked = game.relocating || game.choosing || !game.area || game.paused || game.hud.modalOpen || game.hud.rotationBlocked || !!game.map?.open;
        prepare.disabled = blocked || !game.story?.canPickup;
        const text = game.relocating ? 'Loading through normal area placement…' : blocked ? 'Resume in landscape to prepare.' :
          game.story?.activeOrder ? 'Order prepared. Calls and delivery stay manual.' : 'Prepare skips only the pickup for this test.';
        if (status.textContent !== text) status.textContent = text;
      };
      const timer = setInterval(update, 250);
      const cleanup = () => { clearInterval(timer); panel.remove(); removeEventListener('pagehide', cleanup); };
      addEventListener('pagehide', cleanup, { once: true }); update();
    },
  };
}

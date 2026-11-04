import test from 'node:test';
import assert from 'node:assert/strict';
import { RestaurantOpening, restaurantArt, type RestaurantOpeningPhase } from '../../src/delivery/ui/restaurant';
import { DeliveryUI, DELIVERY_UI_CSS } from '../../src/delivery/ui/delivery-ui';

function clock() {
  let now = 0, nextId = 0;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  return {
    set(fn: () => void, delay: number) { const id = ++nextId; tasks.set(id, { at: now + delay, fn }); return id; },
    clear(id: number) { tasks.delete(id); },
    get pending() { return tasks.size; },
    advance(to: number) {
      for (;;) {
        const next = [...tasks].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; tasks.delete(next[0]); next[1].fn();
      }
      now = to;
    },
  };
}

test('grand opening lights the restaurant, opens doors and completes in three seconds with no residual timers', () => {
  const time = clock(), phases: RestaurantOpeningPhase[] = [];
  const opening = new RestaurantOpening(phase => phases.push(phase), time);
  opening.start(); assert.deepEqual(phases, ['closed']);
  time.advance(699); assert.equal(opening.phase, 'closed');
  time.advance(700); assert.equal(opening.phase, 'lights');
  time.advance(1500); assert.equal(opening.phase, 'doors');
  time.advance(2999); assert.equal(opening.phase, 'doors');
  time.advance(3000); assert.deepEqual(phases, ['closed', 'lights', 'doors', 'open']);
  assert.equal(time.pending, 0);
});

test('skip, visibility exit and disposal cancel the remaining ceremony rather than leaving delayed DOM callbacks', () => {
  const time = clock(), phases: RestaurantOpeningPhase[] = [], opening = new RestaurantOpening(p => phases.push(p), time);
  opening.start(); time.advance(800); opening.finish();
  assert.deepEqual(phases, ['closed', 'lights', 'open']); assert.equal(time.pending, 0);
  time.advance(10000); assert.equal(phases.length, 3);
  opening.start(); opening.dispose(); const before = phases.length;
  time.advance(20000); opening.start(); opening.finish();
  assert.equal(phases.length, before, 'disposed UI cannot be animated later'); assert.equal(time.pending, 0);
});

test('reduced motion shows the finished lit restaurant immediately without scheduling animation', () => {
  const time = clock(), phases: RestaurantOpeningPhase[] = [], opening = new RestaurantOpening(p => phases.push(p), time);
  opening.start(true); assert.deepEqual(phases, ['open']); assert.equal(time.pending, 0);
  assert.ok(DELIVERY_UI_CSS.includes('@media(prefers-reduced-motion:reduce){.du-grand-opening'));
  assert.ok(DELIVERY_UI_CSS.includes('transition:none'));
  const art = restaurantArt(25, 25, 'Restaurant');
  assert.ok(art.includes('du-opening-door-left') && art.includes('du-opening-neon-text'));
  assert.ok(!art.includes('<filter') && !art.includes('<animate'), 'no SVG filters or independent animation survive reduced motion');
});

test('final completion offers immediate Continue and Skip, and returning to the same card never restarts the opening', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousMatch = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const doc: any = { activeElement: null };
  class Element {
    dataset: Record<string, string> = {}; hidden = false; innerHTML = ''; textContent = '';
    listeners = new Map<string, () => void>();
    addEventListener(type: string, fn: () => void) { this.listeners.set(type, fn); }
    focus() { doc.activeElement = this; }
    click() { this.listeners.get('click')?.(); }
  }
  const nodes = new Map<string, Element>();
  const sheet: any = new Element();
  sheet.querySelector = (selector: string) => nodes.get(selector) || (nodes.set(selector, new Element()), nodes.get(selector));
  let continued = 0;
  const ui: any = Object.assign(Object.create(DeliveryUI.prototype), { elements: { completion: sheet }, completionKey: '', opening: null,
    avatar() {}, callback: { continue() { continued++; } } });
  const model: any = { level: 7, total: 7, restaurantStage: 7, completion: {
    name: 'S.S. Rajamouli', movie: 'Baahubali', restaurantLabel: 'Neon restaurant', final: true, bonusAvailable: true,
  } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
  try {
    ui.updateCompletion(model);
    const opening = ui.opening;
    assert.equal(opening.phase, 'closed');
    assert.match(sheet.innerHTML, /<button class="du-primary" data-continue>Explore Hyderabad<\/button>/, 'Continue is never disabled by the ceremony');
    const skip = nodes.get('[data-skip-opening]')!; doc.activeElement = skip; skip.click();
    assert.equal(opening.phase, 'open'); assert.equal(skip.hidden, true);
    assert.equal(doc.activeElement, nodes.get('[data-continue]'), 'hiding a keyboard-focused Skip transfers focus to Continue');
    ui.updateCompletion(model); assert.equal(ui.opening, opening); assert.equal(ui.opening.phase, 'open');
    nodes.get('[data-continue]')!.click(); assert.equal(continued, 1);
  } finally {
    ui.opening?.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete (globalThis as any).document;
    if (previousMatch) Object.defineProperty(globalThis, 'matchMedia', previousMatch); else delete (globalThis as any).matchMedia;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { NavSystem } from '../../src/delivery/systems/nav-system';
import { callTimer, deliveryDistance, portraitUrl } from '../../src/delivery/ui/view-model';
import { restaurantArt } from '../../src/delivery/ui/restaurant';
import { DeliveryUI, DELIVERY_UI_CSS } from '../../src/delivery/ui/delivery-ui';

test('location chip follows Roadster negative-Z forward convention and hides identity', () => {
  const nav = new NavSystem(); assert.equal(nav.update({ x: 0, z: 0 }, 0), null);
  nav.set({ x: 0, z: -100, label: 'Stadium' });
  assert.deepEqual(nav.update({ x: 0, z: 0 }, 0), { label: 'Stadium', distance: 100, angle: 0 });
  nav.set({ x: 100, z: 0, label: 'Roof' });
  assert.equal(nav.update({ x: 0, z: 0 }, 0)!.angle, Math.PI / 2);
  nav.set({ x: -100, z: 0, label: 'Roof' });
  assert.ok(Math.abs(nav.update({ x: 0, z: 0 }, Math.PI / 2)!.angle) < 1e-12);
  nav.set(null); assert.equal(nav.update({ x: 0, z: 0 }, 0), null);
});

test('UI distances and live timer use stable concise values, invalid image schemes are rejected', () => {
  assert.equal(deliveryDistance(1524), '1.5 km'); assert.equal(deliveryDistance(19.8), '20 m');
  assert.equal(callTimer(65.9), '01:05'); assert.equal(callTimer(-4), '00:00');
  assert.equal(portraitUrl('javascript:alert(1)'), ''); assert.equal(portraitUrl('//example.com/a.jpg'), '');
  assert.equal(portraitUrl('/delivery/celebrities/nani.jpg'), '/delivery/celebrities/nani.jpg');
});

test('restaurant upgrades add distinct construction for every content level and encode labels safely', () => {
  const stages = Array.from({ length: 7 }, (_, i) => restaurantArt(i + 1, 7, `Stage ${i + 1}`));
  assert.equal(new Set(stages).size, 7);
  assert.ok(stages[6].includes('stroke="#45E3D3"'));
  assert.ok(restaurantArt(3, 3, '<script>').includes('&lt;script&gt;'));
  assert.ok(restaurantArt(25, 25, 'Restaurant').includes('ROADSTER PIZZA'));
});

test('critical delivery surfaces retain opaque base paint and touch buttons retain minimum targets', () => {
  assert.ok(DELIVERY_UI_CSS.includes('.du-overlay'));
  assert.ok(DELIVERY_UI_CSS.includes('background-color:#171125!important'));
  assert.ok(DELIVERY_UI_CSS.includes('background-color:#271936!important'));
  assert.ok(DELIVERY_UI_CSS.includes('min-height:44px'));
  assert.equal(/backdrop-filter:\s*blur/.test(DELIVERY_UI_CSS), false);
});


// Layout-only DOM stand-in: hierarchy and measured browser rectangles are the
// inputs; the real DeliveryUI.layout method must choose the safe touch column.
// This regression is not a replacement for browser/mobile visual acceptance.
test('Answer inherits touch mode from documentElement and clears Fly in an 800x360 viewport', () => {
  class Node {
    classes = new Set<string>();
    classList = { contains: (name: string) => this.classes.has(name) };
    constructor(public parentElement: Node | null = null) {}
    closest(selector: string): Node | null {
      for (let node: Node | null = this; node; node = node.parentElement)
        if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node;
      return null;
    }
  }
  const documentElement = new Node(); documentElement.classes.add('is-touch');
  const body = new Node(documentElement), host: any = new Node(body);
  assert.equal(host.classList.contains('is-touch'), false, 'only the ancestor carries the mobile mode');
  const style: Record<string, string> = {};
  const ui: any = Object.assign(Object.create(DeliveryUI.prototype), {
    host, elements: { actions: { style }, call: { hidden: false }, drop: { hidden: true }, hint: { hidden: true } },
  });
  for (const offset of [{ left: 0, top: 0 }, { left: 12, top: 8 }]) {
    const hostRect = { ...offset, width: 800, height: 360 };
    const jump = { left: offset.left + 530, top: offset.top + 250, width: 112, height: 42 };
    const fly = { left: offset.left + 654, top: offset.top + 250, width: 134, height: 42 };
    host.getBoundingClientRect = () => hostRect;
    host.querySelector = (selector: string) => selector === '#t-jump' ? {
      getClientRects: () => [jump], getBoundingClientRect: () => jump,
    } : null;
    ui.layout();
    assert.equal(style.left, '530px', 'Answer uses the measured Jump/brake column, not the desktop right-edge fallback');
    assert.equal(style.width, '112px');
    assert.equal(style.right, 'auto'); assert.equal(style.bottom, 'auto');
    const answer = { left: offset.left + parseFloat(style.left), top: offset.top + parseFloat(style.top), width: parseFloat(style.width), height: 42 };
    assert.ok(answer.top >= offset.top + 64 && answer.top + answer.height <= jump.top - 8);
    const overlapsFly = answer.left < fly.left + fly.width && answer.left + answer.width > fly.left &&
      answer.top < fly.top + fly.height && answer.top + answer.height > fly.top;
    assert.equal(overlapsFly, false, 'Answer must remain separately tappable from Fly');
  }
  documentElement.classes.delete('is-touch'); ui.layout();
  assert.equal(style.left, ''); assert.equal(style.top, ''); assert.equal(style.width, '', 'leaving touch mode removes stale measured positioning');
});

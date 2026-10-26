// DOM-independent behavior regressions. Browser acceptance is a separate, visible-controls pass.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const temp = mkdtempSync(path.join(tmpdir(), 'roadster-ui-'));
let checks = 0;
const test = (label, run) => { run(); checks++; console.log(`PASS ${label}`); };
try {
  const entry = path.join(temp, 'ui.mjs');
  await build({ stdin: { contents: "export { DialogFocus } from './game/src/ui/dialog'; export { guidanceBounds, orderOfferHtml } from './game/src/ui/hud';", resolveDir: new URL('../', import.meta.url).pathname, loader: 'ts' }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { DialogFocus, guidanceBounds, orderOfferHtml } = await import(pathToFileURL(entry));

  test('offer/tutorial region excludes both measured HUD rails at short and wide viewports', () => {
    for (const [width, height, leftBottom, rightLeft, rightBottom, touch] of [
      [594, 466, 176, 402, 238, false], [594, 522, 200, 402, 300, false],
      [1280, 800, 184, 1080, 328, false], [844, 390, 150, 650, 190, true],
      [390, 844, 228, 190, 330, true],
    ]) {
      const b = guidanceBounds(width, height, leftBottom, rightLeft, rightBottom, touch);
      assert.ok(b.width >= 260 && b.height > 0, `${width}×${height}: usable guidance`);
      assert.ok(b.top >= leftBottom + 12, 'never covers the order HUD');
      assert.ok(b.left + b.width <= rightLeft - 12 || b.top >= rightBottom + 12, 'never covers the minimap or right rail');
      assert.ok(b.top + b.height <= height - 12, 'stays inside viewport');
      if (touch) assert.ok(b.top + b.height <= height - (height <= 520 ? 142 : 190), 'reserves touch controls');
    }
  });
  test('offer labels distinguish approach, delivery route, and timer start, escaping shop text', () => {
    const html = orderOfferHtml({ level: 2, pickupName: '<Kitchen & Co>', pickupRoad: 'Road "4"', customerName: 'Home', approachMetres: 1969, deliveryMetres: 456, deliverySeconds: 110, basePay: 67 });
    assert.match(html, /1,969 m to pickup/);
    assert.match(html, /456 m after pickup/);
    assert.match(html, /Delivery window: 110 s/);
    assert.match(html, /Delivery timer starts after collection/);
    assert.match(html, /2\.43 km/);
    assert.match(html, /Base reward/); assert.match(html, /Tips may add extra/);
    assert.match(html, /Pickup approach is untimed/);
    assert.match(html, /&lt;Kitchen &amp; Co&gt;/); assert.doesNotMatch(html, /<Kitchen/);
    const unknown = orderOfferHtml({ level: 1, pickupName: 'Kitchen', pickupRoad: '', customerName: 'Home', approachMetres: null, deliveryMetres: 100, deliverySeconds: 60, basePay: 42 });
    assert.match(unknown, /Route unavailable/); assert.doesNotMatch(unknown, /NaN/);
    assert.doesNotMatch(unknown, /Total route<strong>0/);
    const estimate = orderOfferHtml({ level: 1, pickupName: 'Kitchen', pickupRoad: '', customerName: 'Home', approachMetres: 250, approachEstimated: true, deliveryMetres: 750, deliverySeconds: 120, basePay: 82, orderId: '<PZ&42>' });
    assert.match(estimate, /About 250 m to pickup/); assert.match(estimate, /About 1 km/);
    assert.match(estimate, /&lt;PZ&amp;42&gt;/); assert.doesNotMatch(estimate, /<PZ/);
  });
  test('tutorial cannot inherit conflicting top/bottom anchors; offer actions do not scroll with details', () => {
    const source = readFileSync(new URL('../game/src/ui/hud.ts', import.meta.url), 'utf8');
    const tipRules = [...source.matchAll(/(?:^|\})\s*\.tip\{([^}]+)\}/gm)];
    assert.ok(tipRules.length);
    for (const [, rule] of tipRules) assert.doesNotMatch(rule, /(?:^|;)(?:position|top|bottom|transform):/);
    assert.match(source, /\.offer-content\{[^}]*overflow:auto/);
    assert.match(source, /\.offer-actions\{[^}]*flex-shrink:0/);
    assert.match(source, /\.has-offer \.tip/);
  });

  // A minimal DOM seam exercises real DialogFocus event handlers and state restoration.
  // Layout above is tested separately; browser native inert/tab behavior still needs manual acceptance.
  const savedDocument = globalThis.document, savedHTMLElement = globalThis.HTMLElement;
  const listeners = new Map();
  class Element {
    constructor(name, tabIndex = -1) { this.name = name; this.tabIndex = tabIndex; this.children = []; this.parentElement = null; this.hidden = false; this.inert = false; this.disabled = false; this.isConnected = true; }
    append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentElement = this; } }
    contains(n) { return n === this || this.children.some((c) => c.contains(n)); }
    querySelectorAll() { return this.children.flatMap((c) => [c, ...c.querySelectorAll()]); }
    matches(selector) { return selector === ':disabled' && this.disabled; }
    closest() { for (let n = this; n; n = n.parentElement) if (n.hidden || n.inert) return n; return null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus() { document.activeElement = this; for (const listener of [...listeners.get('focusin') || []]) listener({ target: this }); }
  }
  globalThis.HTMLElement = Element;
  const body = new Element('body');
  globalThis.document = {
    body, activeElement: body,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const key = (value, shiftKey = false) => {
    const event = { key: value, code: value === 'Escape' ? 'Escape' : value === ' ' ? 'Space' : value, target: document.activeElement, shiftKey, repeat: false, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const listener of [...listeners.get('keydown') || []]) listener(event);
    return event;
  };
  try {
    const hud = new Element('hud'), scene = new Element('scene'), preservedInert = new Element('already-inert'); preservedInert.inert = true;
    const help = new Element('pause', 0), minimap = new Element('minimap', 0), map = new Element('map');
    const close = new Element('Close map', 0), zoom = new Element('Zoom in', 0), hidden = new Element('Deliver from here', 0); hidden.hidden = true;
    body.append(scene, hud, preservedInert); hud.append(help, minimap, map); map.append(close, zoom, hidden);
    minimap.focus();
    let escapeCalls = 0;
    const focus = new DialogFocus(map, { initial: () => close, captureKeys: true, key(event) { if (event.key === 'Escape') { escapeCalls++; event.preventDefault(); map.hidden = true; focus.hide(); } } });
    test('opening map isolates background controls and focuses its close action', () => {
      focus.show();
      assert.equal(document.activeElement, close);
      assert.ok(help.inert && minimap.inert && scene.inert && preservedInert.inert);
      assert.equal(map.inert, false);
    });
    test('Shift+Tab and repeated Tab stay within visible map buttons', () => {
      const backwards = key('Tab', true); assert.equal(document.activeElement, zoom); assert.ok(backwards.prevented && backwards.stopped);
      key('Tab'); assert.equal(document.activeElement, close);
      for (let i = 0; i < 9; i++) { key('Tab'); assert.ok([close, zoom].includes(document.activeElement)); }
    });
    test('programmatic background focus is redirected and game shortcuts cannot escape', () => {
      help.focus(); assert.equal(document.activeElement, close);
      assert.equal(key('p').stopped, true);
      const space = key(' '); assert.equal(space.stopped, true); assert.equal(space.prevented, false, 'native button activation is preserved');
    });
    test('Escape closes once and restores the opener and original inert state', () => {
      const event = key('Escape'); assert.equal(escapeCalls, 1); assert.ok(event.prevented && event.stopped);
      assert.equal(document.activeElement, minimap);
      assert.equal(help.inert, false); assert.equal(scene.inert, false); assert.equal(preservedInert.inert, true);
      focus.hide(); key('Escape'); assert.equal(escapeCalls, 1);
    });
    test('reopen and content replacement retain original opener, with no stale listeners', () => {
      map.hidden = false; focus.show(); focus.show(); assert.equal(listeners.get('keydown').size, 1);
      focus.hide(); assert.equal(document.activeElement, minimap); assert.equal(listeners.get('keydown').size, 0);
    });
    test('closing restores a usable HUD control when the original opener was hidden or removed', () => {
      help.focus();
      const replacement = new DialogFocus(map, { initial: () => close, restore: () => minimap });
      replacement.show(); help.hidden = true; replacement.hide();
      assert.equal(document.activeElement, minimap); help.hidden = false;
    });
  } finally { globalThis.document = savedDocument; globalThis.HTMLElement = savedHTMLElement; }
  console.log(`UI regressions: ${checks} checks passed. No browser acceptance claimed.`);
} finally { rmSync(temp, { recursive: true, force: true }); }

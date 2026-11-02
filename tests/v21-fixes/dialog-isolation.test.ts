import test from 'node:test';
import assert from 'node:assert/strict';
import { DialogFocus } from '../../src/ui/dialog';

// Production DialogFocus with a small native-DOM seam. Inert elements reject
// focus, as browsers do. Parent browser QA separately exercises the real game
// completion -> background pause -> Resume -> Next delivery interaction.
function fixture(run: (f: ReturnType<typeof create>) => void) {
  const previousDocument = globalThis.document, previousElement = globalThis.HTMLElement;
  const f = create(); globalThis.document = f.doc as unknown as Document; globalThis.HTMLElement = f.Element as unknown as typeof HTMLElement;
  try { run(f); } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousElement;
  }
}
function create() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  class Element {
    children: Element[] = []; parentElement: Element | null = null; hidden = false; inert = false; disabled = false; isConnected = true;
    constructor(public name: string, public tabIndex = -1) {}
    append(...nodes: Element[]) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    contains(node: Element) { return node === this || this.children.some(child => child.contains(node)); }
    querySelectorAll(): Element[] { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
    matches(selector: string) { return selector === ':disabled' && this.disabled; }
    closest() { for (let node: Element | null = this; node; node = node.parentElement) if (node.hidden || node.inert) return node; return null; }
    getClientRects() { for (let node: Element | null = this; node; node = node.parentElement) if (node.hidden) return []; return [{}]; }
    focus() {
      if (!this.isConnected || this.closest()) return;
      doc.activeElement = this;
      for (const listener of [...listeners.get('focusin') || []]) listener({ target: this });
    }
  }
  const body = new Element('body'), canvas = new Element('canvas', 0), hud = new Element('hud'), controls = new Element('driving controls'), pause = new Element('pause dialog'), delivery = new Element('delivery UI'), completion = new Element('completion dialog'), preserved = new Element('already inert');
  const steer = new Element('steer', 0), resume = new Element('resume', 0), next = new Element('next delivery', 0), opener = new Element('pause button', 0);
  preserved.inert = true; body.append(canvas, hud, preserved); hud.append(controls, pause, delivery); controls.append(steer, opener); pause.append(resume); delivery.append(completion); completion.append(next);
  const doc = { body, activeElement: body,
    addEventListener(type: string, listener: (event: any) => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener(type: string, listener: (event: any) => void) { listeners.get(type)?.delete(listener); } };
  const focus = (root: Element) => new DialogFocus(root as unknown as HTMLElement);
  const completionFocus = focus(completion), pauseFocus = focus(pause);
  return { Element, body, canvas, hud, controls, pause, delivery, completion, preserved, steer, resume, next, opener, doc, listeners, focus, completionFocus, pauseFocus };
}

test('completion -> background pause -> completion hide -> Resume -> completion -> Next restores usable driving', () => fixture(f => {
  f.opener.focus();
  f.completionFocus.show(); assert.equal(f.doc.activeElement, f.next); assert.equal(f.canvas.inert, true); assert.equal(f.controls.inert, true);
  f.pauseFocus.show(); assert.equal(f.canvas.inert, true);
  f.completionFocus.hide(); assert.equal(f.canvas.inert, true, 'pause still owns scene isolation'); assert.equal(f.controls.inert, true);
  f.pauseFocus.hide(); assert.equal(f.canvas.inert, false); assert.equal(f.controls.inert, false); assert.equal(f.delivery.inert, false);
  f.completionFocus.show(); assert.equal(f.doc.activeElement, f.next); assert.equal(f.canvas.inert, true);
  f.completionFocus.hide();
  assert.equal(f.canvas.inert, false, 'Next delivery must release the real game canvas'); assert.equal(f.controls.inert, false, 'visible touch and desktop HUD controls must be usable');
  assert.equal(f.pause.inert, false); assert.equal(f.delivery.inert, false); assert.equal(f.preserved.inert, true);
  f.steer.focus(); assert.equal(f.doc.activeElement, f.steer); f.canvas.focus(); assert.equal(f.doc.activeElement, f.canvas);
  assert.equal(f.listeners.get('focusin')!.size, 0); assert.equal(f.listeners.get('keydown')!.size, 0);
}));

test('closing Next delivery after a background pause leaves no stale true snapshot on the canvas or HUD', () => fixture(f => {
  // Complete the whole observed order before asserting: the previous code
  // temporarily unlocked too early, then permanently re-locked these controls.
  f.completionFocus.show(); f.pauseFocus.show(); f.completionFocus.hide(); f.pauseFocus.hide(); f.completionFocus.show(); f.completionFocus.hide();
  assert.equal(f.canvas.inert, false, 'the original out-of-order snapshots stranded the canvas inert here');
  assert.equal(f.controls.inert, false); assert.equal(f.delivery.inert, false); assert.equal(f.pause.inert, false);
}));

for (const order of [[0, 1], [1, 0]]) test(`overlapping dialog close order ${order.join(',')} preserves last-owner isolation and original inert state`, () => fixture(f => {
  const dialogs = [f.completionFocus, f.pauseFocus]; dialogs.forEach(dialog => dialog.show());
  dialogs[order[0]].hide(); assert.equal(f.canvas.inert, true); assert.equal(f.preserved.inert, true);
  dialogs[order[1]].hide(); assert.equal(f.canvas.inert, false); assert.equal(f.controls.inert, false); assert.equal(f.preserved.inert, true);
  assert.equal(f.listeners.get('keydown')!.size, 0);
}));

test('a nested child dialog keeps the scene isolated when its parent closes first', () => fixture(f => {
  const nested = new f.Element('nested dialog'), childButton = new f.Element('child action', 0); nested.append(childButton); f.completion.append(nested);
  const childFocus = f.focus(nested); f.completionFocus.show(); childFocus.show();
  assert.equal(f.next.inert, true); assert.equal(f.canvas.inert, true); assert.equal(f.controls.inert, true);
  f.completionFocus.hide(); assert.equal(f.canvas.inert, true); assert.equal(f.controls.inert, true);
  childFocus.hide(); assert.equal(f.next.inert, false); assert.equal(f.canvas.inert, false); assert.equal(f.controls.inert, false); assert.equal(f.preserved.inert, true);
}));

test('three dialog owners, repeated show/hide and reuse cannot leak isolation or restore another owner snapshot', () => fixture(f => {
  const map = new f.Element('map dialog'); f.hud.append(map); const mapFocus = f.focus(map);
  for (let i = 0; i < 20; i++) {
    f.completionFocus.show(); f.completionFocus.show(); f.pauseFocus.show(); mapFocus.show();
    assert.equal(f.listeners.get('keydown')!.size, 3);
    f.pauseFocus.hide(); f.pauseFocus.hide(); assert.equal(f.canvas.inert, true);
    f.completionFocus.hide(); assert.equal(f.canvas.inert, true);
    mapFocus.hide(); mapFocus.hide(); assert.equal(f.canvas.inert, false); assert.equal(f.controls.inert, false); assert.equal(f.preserved.inert, true);
    assert.equal(f.listeners.get('keydown')!.size, 0); assert.equal(f.listeners.get('focusin')!.size, 0);
  }
}));

test('a truly pre-existing inert canvas is preserved after the final owner releases it', () => fixture(f => {
  f.canvas.inert = true; f.completionFocus.show(); f.pauseFocus.show(); f.completionFocus.hide(); f.pauseFocus.hide(); assert.equal(f.canvas.inert, true);
  f.canvas.inert = false; f.completionFocus.show(); f.completionFocus.hide(); assert.equal(f.canvas.inert, false, 'a later opening captures a fresh baseline');
}));

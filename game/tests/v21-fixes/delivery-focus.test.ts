import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryUI } from '../../src/delivery/ui/delivery-ui';

// A narrow DOM stand-in exercises the production line-update method. It models
// focus loss when a reply is removed; this is not browser/mobile acceptance.
function fixture() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc: any = { activeElement: null, createElement: () => new Element() };
  class Element {
    hidden = false; textContent = ''; children: Element[] = []; focusCount = 0;
    contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
    replaceChildren() { if (this.contains(doc.activeElement)) doc.activeElement = null; this.children = []; }
    append(child: Element) { this.children.push(child); }
    querySelector() { return this.children[0] ?? null; }
    addEventListener() {}
    focus() { this.focusCount++; doc.activeElement = this; }
  }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  const ui: any = Object.create(DeliveryUI.prototype);
  ui.root = { hidden: false }; ui.currentDialog = 'phone'; ui.keyboardMode = true; ui.lineKey = '';
  ui.elements = Object.fromEntries(['next', 'end', 'replies', 'caller-avatar'].map(key => [key, new Element()]));
  ui.text = () => {}; ui.avatar = () => {}; ui.callback = { advanceCall() {} };
  const model = (text: string, replies?: string[], elapsed = 1) => ({ phone: {
    revealed: false, who: 'customer', text, replies, elapsed, canAdvance: true,
  } });
  return { ui, doc, model, restore() {
    if (previous) Object.defineProperty(globalThis, 'document', previous); else delete (globalThis as any).document;
  } };
}

test('keyboard focus follows Next to a reply and then the next visible script control', () => {
  const f = fixture();
  try {
    f.doc.activeElement = f.ui.elements.next;
    f.ui.updatePhone(f.model('Your reply?', ['Yes', 'Definitely']));
    const reply = f.ui.elements.replies.children[0];
    assert.equal(f.doc.activeElement, reply); assert.equal(f.ui.elements.next.hidden, true);
    f.ui.updatePhone(f.model('Then we have a deal.'));
    assert.equal(f.doc.activeElement, f.ui.elements.next); assert.equal(f.ui.elements.next.hidden, false);
    const before = f.ui.elements.next.focusCount;
    f.ui.updatePhone(f.model('Then we have a deal.', undefined, 2));
    assert.equal(f.ui.elements.next.focusCount, before, 'timer-only frames cannot refocus a control');
  } finally { f.restore(); }
});

test('touch, hidden UI and a separately focused End call button are not refocused', () => {
  const f = fixture();
  try {
    f.ui.keyboardMode = false; f.doc.activeElement = f.ui.elements.next;
    f.ui.updatePhone(f.model('Touch reply', ['Okay']));
    assert.equal(f.ui.elements.replies.children[0].focusCount, 0);
    f.ui.keyboardMode = true; f.doc.activeElement = f.ui.elements.end;
    f.ui.updatePhone(f.model('Another reply', ['Okay']));
    assert.equal(f.doc.activeElement, f.ui.elements.end);
    f.ui.root.hidden = true; f.doc.activeElement = f.ui.elements.next;
    f.ui.updatePhone(f.model('Hidden reply', ['Okay']));
    assert.equal(f.ui.elements.replies.children[0].focusCount, 0);
  } finally { f.restore(); }
});

test('keyboard focus falls back to End call when no Next or reply control is available', () => {
  const f = fixture();
  try {
    f.doc.activeElement = f.ui.elements.next;
    const model = f.model('Call ended'); model.phone.canAdvance = false;
    f.ui.updatePhone(model);
    assert.equal(f.doc.activeElement, f.ui.elements.end);
  } finally { f.restore(); }
});

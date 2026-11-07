import test from 'node:test';
import assert from 'node:assert/strict';
import { protectGameplaySurface, isIOSGestureBrowser } from '../../src/ui/gameplay-gestures';

test('iOS gameplay native gestures are cancelled without stopping pointer events or invoking actions', () => {
  const surface = new EventTarget(); let active = true, actions = 0;
  surface.addEventListener('pointerdown', () => actions++);
  const dispose = protectGameplaySurface(surface, () => active, true);
  for (const type of ['touchstart','touchmove','touchend','gesturestart','gesturechange']) {
    const event = new Event(type, { cancelable: true }); surface.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
  }
  assert.equal(actions, 0);
  surface.dispatchEvent(new Event('pointerdown')); assert.equal(actions, 1);
  active = false;
  for (const type of ['touchstart','touchmove','touchend','gesturestart','gesturechange']) {
    const event = new Event(type, { cancelable: true }); surface.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  }
  active = true; dispose();
  const event = new Event('touchend', { cancelable: true }); surface.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
});
test('Android and desktop native gestures remain untouched; noncancelable events are safe', () => {
  const surface = new EventTarget(); protectGameplaySurface(surface, () => true, false);
  const event = new Event('touchend', { cancelable: true }); surface.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  protectGameplaySurface(surface, () => true, true);
  surface.dispatchEvent(new Event('touchstart'));
});
test('iPhone and desktop-mode iPad detected without treating Android or desktop Mac as iOS', () => {
  assert.equal(isIOSGestureBrowser({userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5}),true);
  assert.equal(isIOSGestureBrowser({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(isIOSGestureBrowser({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}),false);
  assert.equal(isIOSGestureBrowser({userAgent:'Android',platform:'Linux',maxTouchPoints:5}),false);
});

test('common-ancestor Safari gestures are guarded only with an active gameplay-origin touch', async () => {
  const { protectGameplayGestures } = await import('../../src/ui/gameplay-gestures');
  const doc = new EventTarget(), win = new EventTarget(), surface = new EventTarget();
  const oldDoc = Object.getOwnPropertyDescriptor(globalThis, 'document'), oldWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
  let active = true;
  const touch = (type: string, ids: number[]) => { const e = new Event(type, { cancelable: true }); Object.assign(e, { changedTouches: ids.map(identifier => ({identifier})) }); return e; };
  const gesture = () => { const e = new Event('gesturestart', {cancelable:true}); doc.dispatchEvent(e); return e.defaultPrevented; };
  try {
    protectGameplayGestures([surface as any], () => active, true);
    assert.equal(gesture(), false);
    surface.dispatchEvent(touch('touchstart', [1,2])); assert.equal(gesture(), true);
    doc.dispatchEvent(touch('touchend', [2])); assert.equal(gesture(), true);
    active = false; assert.equal(gesture(), false); active = true;
    doc.dispatchEvent(touch('touchcancel', [1])); assert.equal(gesture(), false);
    surface.dispatchEvent(touch('touchstart', [3])); win.dispatchEvent(new Event('blur')); assert.equal(gesture(), false);
  } finally {
    if(oldDoc)Object.defineProperty(globalThis,'document',oldDoc);else delete (globalThis as any).document;
    if(oldWin)Object.defineProperty(globalThis,'window',oldWin);else delete (globalThis as any).window;
  }
});

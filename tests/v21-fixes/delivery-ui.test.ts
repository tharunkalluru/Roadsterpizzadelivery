import test from 'node:test';
import assert from 'node:assert/strict';
import { NavSystem } from '../../src/delivery/systems/nav-system';
import { callTimer, deliveryDistance, portraitUrl } from '../../src/delivery/ui/view-model';
import { restaurantArt } from '../../src/delivery/ui/restaurant';
import { DeliveryUI, DELIVERY_UI_CSS } from '../../src/delivery/ui/delivery-ui';
import { callButtonLayout, type CallButtonRect } from '../../src/delivery/ui/call-button-layout';
import { mobileHudLayout } from '../../src/ui/hud-layout';

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


// These tests exercise production layout with the actual base HUD geometry as
// measured rectangles, plus an ancestor .is-touch and an offset HUD origin.
// They do not replace parent-agent browser / physical-phone acceptance.
function layoutFixture(width: number, height: number, offset = { left: 0, top: 0 }, drop = false) {
  class Node {
    classes = new Set<string>();
    hidden = false;
    style: Record<string, string> = {};
    classList = { contains: (name: string) => this.classes.has(name) };
    constructor(public parentElement: Node | null = null, public rect: CallButtonRect = { left: 0, top: 0, width: 0, height: 0 }) {}
    closest(selector: string): Node | null {
      for (let node: Node | null = this; node; node = node.parentElement)
        if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node;
      return null;
    }
    getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
    getBoundingClientRect() { return { ...this.rect, left: this.rect.left + offset.left, top: this.rect.top + offset.top }; }
  }
  const documentElement = new Node(); documentElement.classes.add('is-touch');
  const body = new Node(documentElement), host: any = new Node(body, { left: 0, top: 0, width, height });
  const controls = mobileHudLayout(width, height, 64, 60);
  const rects = [controls.map, controls.leftSteer, controls.rightSteer, controls.brake, controls.gas, controls.fly, controls.jump, controls.speed,
    { left: width / 2 - 126, top: 10, width: 252, height: 38 },
    { left: width - 184, top: 10, width: 166, height: 44 },
    { left: 12, top: 10, width: 130, height: 44 },
    { left: width / 2 - 86, top: height - 188, width: 172, height: 64 }];
  const obstacles = rects.map(rect => new Node(host, rect));
  const jump = obstacles[6], call = new Node(host), actions = new Node(host);
  const dropNode = new Node(actions), hint = new Node(actions); dropNode.hidden = !drop; hint.hidden = !drop;
  actions.getBoundingClientRect = () => ({ left: offset.left + Number.parseFloat(actions.style.left || '0'), top: offset.top + Number.parseFloat(actions.style.top || '0'), width: Number.parseFloat(actions.style.width || '170'), height: drop ? 85 : 0 });
  host.querySelector = (selector: string) => selector === '#t-jump' ? jump : null;
  host.querySelectorAll = () => obstacles;
  const ui: any = Object.assign(Object.create(DeliveryUI.prototype), { host, elements: { actions, call, drop: dropNode, hint } });
  return { ui, host, documentElement, call, actions, controls, obstacles: () => drop ? [...rects, { left: Number.parseFloat(actions.style.left), top: Number.parseFloat(actions.style.top), width: Number.parseFloat(actions.style.width), height: 85 }] : rects };
}
function overlaps(a: CallButtonRect, b: CallButtonRect, gap = 0) {
  return a.left < b.left + b.width + gap && a.left + a.width + gap > b.left && a.top < b.top + b.height + gap && a.top + a.height + gap > b.top;
}

for (const [width, height] of [[800, 360], [852, 393], [918, 384], [1024, 700]]) {
  test(`circular Answer is separately tappable at ${width}x${height}, including a simultaneous Drop`, () => {
    for (const drop of [false, true]) for (const offset of [{ left: 0, top: 0 }, { left: 12, top: 8 }]) {
      const f = layoutFixture(width, height, offset, drop);
      assert.equal(f.host.classList.contains('is-touch'), false, 'touch mode lives on documentElement');
      f.ui.layout();
      const style = f.call.style, answer = { left: parseFloat(style.left), top: parseFloat(style.top), width: parseFloat(style.width), height: parseFloat(style.height) };
      assert.equal(style.visibility, ''); assert.equal(answer.width, answer.height);
      assert.ok(answer.width >= 44 && answer.width <= 48, 'small visual, full minimum touch target');
      assert.ok(answer.left >= 12 && answer.top >= 12 && answer.left + answer.width <= width - 12 && answer.top + answer.height <= height - 12);
      for (const obstacle of f.obstacles()) assert.equal(overlaps(answer, obstacle, 7.9), false, `must clear obstacle ${JSON.stringify(obstacle)}`);
      assert.ok(Math.abs(answer.left + answer.width / 2 - (f.controls.jump.left + f.controls.jump.width / 2)) < 150, 'keep it reachable by the action thumb');
      const first = { ...style }; f.ui.layout(); assert.deepEqual(style, first, 'an unchanged HUD cannot make the icon drift');
      f.documentElement.classes.delete('is-touch'); f.ui.layout();
      if(drop){
        assert.equal(f.actions.style.width,'170px','desktop remeasures its own width instead of retaining the touch column');
        const action={left:parseFloat(f.actions.style.left),top:parseFloat(f.actions.style.top),width:170,height:85};
        for(const obstacle of f.obstacles().slice(0,-1))assert.equal(overlaps(action,obstacle,7.9),false,'complete desktop action must also clear the HUD');
      }else assert.equal(f.actions.style.left,'');
    }
  });
}

test('800×360 desktop Throw and its full hint clear the measured minimap even while the phone is hidden',()=>{
  const f=layoutFixture(800,360,{left:12,top:8},true);f.documentElement.classes.delete('is-touch');
  const rects=[
    {left:613,top:113,width:166,height:166}, // rendered desktop regression
    {left:274,top:10,width:252,height:38},
    {left:616,top:10,width:166,height:44},
    {left:314,top:172,width:172,height:64},
    {left:325,top:309,width:150,height:39},
    {left:12,top:10,width:130,height:44},
  ];
  f.host.querySelectorAll=()=>rects.map(rect=>({hidden:false,getClientRects:()=>[rect],getBoundingClientRect:()=>({...rect,left:rect.left+12,top:rect.top+8})}));
  for(const phoneHidden of [true,false]){
    f.call.hidden=phoneHidden;f.ui.layout();
    const action={left:parseFloat(f.actions.style.left),top:parseFloat(f.actions.style.top),width:parseFloat(f.actions.style.width),height:85};
    assert.equal(f.actions.style.visibility,'');assert.equal(f.ui.elements.hint.style.display,'','full instruction has a real free slot');
    assert.ok(action.left>=12&&action.top>=12&&action.left+action.width<=788&&action.top+action.height<=348);
    for(const obstacle of rects)assert.equal(overlaps(action,obstacle,7.9),false,`Throw plus hint cannot cover ${JSON.stringify(obstacle)}`);
    if(!phoneHidden){const call={left:parseFloat(f.call.style.left),top:parseFloat(f.call.style.top),width:parseFloat(f.call.style.width),height:parseFloat(f.call.style.height)};assert.equal(overlaps(action,call,7.9),false);}
  }
});

test('phone placement respects notches, blocked preferred slots, and the 44px minimum without covering controls', () => {
  const bounds = { left: 40, top: 12, width: 760, height: 336 };
  const anchor = { left: 680, top: 240, width: 110, height: 44 };
  const blockers = [{ left: 620, top: 12, width: 180, height: 208 }, anchor];
  const answer = callButtonLayout(bounds, blockers, anchor)!;
  assert.ok(answer.left >= 40 && answer.left + answer.width <= 800);
  for (const obstacle of blockers) assert.equal(overlaps(answer, obstacle, 7.9), false);
  assert.deepEqual(callButtonLayout({ left: 12, top: 12, width: 44, height: 44 }, []), { left: 12, top: 12, width: 44, height: 44 });
  assert.equal(callButtonLayout({ left: 0, top: 0, width: 43, height: 43 }, []), null, 'never shrink the hit area below 44px');
});

test('phone state updates keep icon-only Call and Answer accessible and never render a customer name early', () => {
  const element = () => ({ hidden: false, disabled: false, textContent: '', dataset: {} as Record<string, string>, attributes: {} as Record<string, string>, title: '',
    getAttribute(name: string) { return this.attributes[name]; }, setAttribute(name: string, value: string) { this.attributes[name] = value; } });
  const names = ['call', 'drop', 'drop-label', 'hint', 'notice', 'collection-button'];
  const elements = Object.fromEntries(names.map(name => [name, element()]));
  const ui: any = Object.assign(Object.create(DeliveryUI.prototype), { root: { hidden: false }, host: { classList: { toggle() {} } }, elements, opening: null, collectionShown: false,
    layoutDirty: false, layoutTimer: performance.now(), syncDialog() {}, layout() {}, updatePhone() {}, updateCompletion() {} });
  const model: any = { level: 1, total: 7, stage: 'EN_ROUTE', restaurantStage: 0, restaurantLabel: 'Dream', collection: [], nav: { label: 'Destination', distance: 10, angle: 0 }, call: { state: 'disabled', label: 'Unrevealed celebrity' } };
  ui.update(model); assert.equal(elements.call.disabled, true); assert.equal(elements.call.hidden, false);
  assert.equal(elements.call.attributes['aria-label'], 'Call unavailable until arrival');
  model.call.state = 'enabled'; ui.update(model); assert.equal(elements.call.disabled, false); assert.equal(elements.call.attributes['aria-label'], 'Call customer');
  model.call.state = 'ringing'; ui.update(model); assert.equal(elements.call.attributes['aria-label'], 'Answer call'); assert.equal(elements.call.title, 'Answer call');
  assert.equal(elements.call.textContent, '', 'the handset has no visible text row');
  model.phone = {}; ui.update(model); assert.equal(elements.call.hidden, true, 'the HUD icon hides behind a call dialog');
  model.phone = null; model.call.state = 'hidden'; ui.update(model); assert.equal(elements.call.hidden, true, 'no order means no phone action');
  assert.equal(DELIVERY_UI_CSS.includes('.du-nav'), false, 'only the host navigation remains');
  assert.ok(DELIVERY_UI_CSS.includes('.du-call[data-state=enabled] svg,.du-call[data-state=ringing] svg{animation:none}'), 'both attention states honor reduced motion');
  assert.equal(/\.du-call\[data-state=disabled\][^{]*\{[^}]*animation/.test(DELIVERY_UI_CSS), false, 'idle/disabled cannot flash');
});

function noticeFixture() {
  const classes = new Set<string>(); let classWrites = 0;
  const element = () => ({ hidden: false, disabled: false, textContent: '', dataset: {} as Record<string, string>, title: '',
    attributes: {} as Record<string, string>, getAttribute(name: string) { return this.attributes[name]; },
    setAttribute(name: string, value: string) { this.attributes[name] = value; } });
  const elements = Object.fromEntries(['call', 'drop', 'drop-label', 'hint', 'notice', 'collection-button', 'phone', 'completion', 'collection', 'overlay'].map(key => [key, element()]));
  const removedListeners: string[] = [];
  const host = { removeEventListener(name: string) { removedListeners.push(name); }, classList: { toggle(name: string, active: boolean) { classWrites++; active ? classes.add(name) : classes.delete(name); }, remove(name: string) { classes.delete(name); } } };
  const ui: any = Object.assign(Object.create(DeliveryUI.prototype), { host, root: { hidden: false, dataset: {}, remove() {} }, elements,
    model: null, opening: null, collectionShown: false, currentDialog: '', layoutDirty: false, layoutTimer: performance.now(), noticeActive: false,
    callback: {}, dialogFocus: { show() {}, hide() {} }, keyHandler() {}, layout() {}, updatePhone() {}, updateCompletion() {}, updateCollection() {} });
  const model: any = { level: 1, total: 7, stage: 'SETPIECE', restaurantStage: 0, restaurantLabel: 'Dream', collection: [], call: { state: 'enabled' } };
  return { ui, model, elements, classes, removedListeners, writes: () => classWrites };
}

test('delivery notice owns host priority only while visible and clears for calls, collection, hide and disposal', () => {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { removeEventListener() {} } });
  try {
    const f = noticeFixture(); f.ui.update(f.model);
    assert.equal(f.classes.has('has-delivery-notice'), false); assert.equal(f.elements.notice.hidden, true);
    f.model.notice = 'Stay near the surface and try again.'; f.ui.update(f.model);
    assert.equal(f.classes.has('has-delivery-notice'), true); assert.equal(f.elements.notice.hidden, false);
    const writes = f.writes(); for (let i = 0; i < 100; i++) f.ui.update(f.model);
    assert.equal(f.writes(), writes, 'unchanged notice state does not rewrite the host priority class');
    f.ui.setVisible(false); assert.equal(f.classes.has('has-delivery-notice'), false); assert.equal(f.elements.notice.hidden, true);
    f.ui.setVisible(true); assert.equal(f.classes.has('has-delivery-notice'), true);
    f.model.phone = {}; f.ui.update(f.model);
    assert.equal(f.classes.has('has-delivery-notice'), false); assert.equal(f.elements.notice.hidden, true);
    f.model.phone = undefined; f.ui.update(f.model); assert.equal(f.classes.has('has-delivery-notice'), true);
    f.ui.openCollection(); assert.equal(f.classes.has('has-delivery-notice'), false);
    f.ui.closeCollection(); assert.equal(f.classes.has('has-delivery-notice'), true);
    f.model.completion = {}; f.ui.update(f.model); assert.equal(f.classes.has('has-delivery-notice'), false);
    f.model.completion = undefined; f.ui.update(f.model); assert.equal(f.classes.has('has-delivery-notice'), true);
    f.model.notice = '   '; f.ui.update(f.model); assert.equal(f.classes.has('has-delivery-notice'), false);
    f.model.notice = 'Retry safely.'; f.ui.update(f.model); assert.equal(f.classes.has('has-delivery-notice'), true);
    f.ui.dispose(); assert.equal(f.classes.has('has-delivery-notice'), false);
    assert.deepEqual(f.removedListeners, ['hudlayoutchange'], 'disposal releases the synchronous host layout listener');
  } finally {
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument); else delete (globalThis as any).document;
  }
});

test('host layout changes reposition visible delivery controls immediately without waiting for the slow tick', () => {
  const f = noticeFixture(); let layouts = 0;
  f.ui.layout = () => layouts++;
  f.ui.layoutDirty = false; f.ui.layoutTimer = 0;
  f.ui.onHostLayout();
  assert.equal(layouts, 1); assert.equal(f.ui.layoutDirty, false); assert.ok(f.ui.layoutTimer > 0);
  f.ui.root.hidden = true; f.ui.onHostLayout();
  assert.equal(layouts, 1, 'hidden controls do not measure invisible geometry'); assert.equal(f.ui.layoutDirty, true);
  f.ui.setVisible(true); f.ui.onHostLayout();
  assert.equal(layouts, 2, 'restored controls use the latest host positions');
});

test('delivery notice uses the fixed host notice slot and cannot expand over navigation', () => {
  const rule = DELIVERY_UI_CSS.match(/\.du-notice\{([^}]+)\}/)![1];
  for (const name of ['left', 'top', 'width', 'height']) assert.ok(rule.includes(`var(--hud-notice-${name},`));
  assert.match(rule, /position:fixed/); assert.match(rule, /overflow:hidden/); assert.match(rule, /-webkit-line-clamp:2/);
  assert.doesNotMatch(DELIVERY_UI_CSS, /\.du-notice\{(?:top:74px|max-width:36vw)/);
});

test('a host-rejected notice slot does not create a fallback obstacle after a short resize', () => {
  const f=layoutFixture(220,190);f.documentElement.classes.delete('is-touch');
  f.host.querySelectorAll=()=>[];f.host.dataset={};
  const read=()=>({left:parseFloat(f.call.style.left),top:parseFloat(f.call.style.top),width:parseFloat(f.call.style.width),height:parseFloat(f.call.style.height)});
  const fallback={left:18,top:105,width:180,height:48};
  f.ui.layout();assert.equal(overlaps(read(),fallback,7.9),false,'older hosts still get the default reservation');
  f.host.dataset.noticeSpace='false';f.ui.layout();
  assert.deepEqual(read(),callButtonLayout({left:12,top:12,width:196,height:166},[])!, 'an invalid host slot cannot displace the handset');
  assert.equal(overlaps(read(),fallback),true,'the handset can reuse the now-unreserved region');
  f.host.dataset.noticeSpace='true';f.ui.layout();
  assert.equal(overlaps(read(),fallback,7.9),false,'restoring a real notice lane restores its reservation');
});

test('call and complete delivery actions reserve empty notice and navigation lanes before either appears', () => {
  for (const [width, height] of [[568, 320], [667, 375], [800, 360], [1280, 720]]) {
    const f = layoutFixture(width, height, { left: 12, top: 8 }, true);
    const nav = { left: width / 2 - 90, top: 62, width: 180, height: 48 };
    const notice = { left: 18, top: 106, width: Math.min(180, nav.left - 26), height: 48 };
    const area = { left: 18, top: 62, width: notice.width, height: 28 };
    const reserved = [nav, notice, area];
    const nodes = reserved.map(rect => ({ hidden: false, getClientRects: () => [rect], getBoundingClientRect: () => ({ ...rect, left: rect.left + 12, top: rect.top + 8 }) }));
    const originalQuery = f.host.querySelectorAll, originalSingle = f.host.querySelector;
    f.host.querySelectorAll = (selector: string) => {
      assert.match(selector, /#hud-navigation-slot/); assert.match(selector, /#hud-notice-slot/);
      // Replace the earlier fixture's floating guide with the fixed reservation.
      const touch = f.documentElement.classes.has('is-touch');
      const base = originalQuery().slice(0, -1).filter((_: unknown, index: number) => touch || index === 0 || index >= 7);
      return [...base, ...nodes];
    };
    f.host.querySelector = (selector: string) => selector === '#hud-notice-slot' ? nodes[1] : originalSingle(selector);
    for (const touch of [true, false]) {
      touch ? f.documentElement.classes.add('is-touch') : f.documentElement.classes.delete('is-touch');
      f.ui.layout();
      assert.equal(f.call.style.visibility, '', `${width}×${height}: phone remains reachable`);
      assert.equal(f.actions.style.visibility, '', `${width}×${height} touch=${touch}: delivery remains reachable`);
      const call = { left: parseFloat(f.call.style.left), top: parseFloat(f.call.style.top), width: parseFloat(f.call.style.width), height: parseFloat(f.call.style.height) };
      const action = { left: parseFloat(f.actions.style.left), top: parseFloat(f.actions.style.top), width: parseFloat(f.actions.style.width), height: 85 };
      for (const blocker of reserved) {
        assert.equal(overlaps(call, blocker, 7.9), false, 'phone cannot claim an empty reserved notice/navigation slot');
        assert.equal(overlaps(action, blocker, 7.9), false, 'action plus hint cannot claim an empty reserved slot');
      }
    }
  }
});

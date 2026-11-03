import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadLevels } from '../../src/delivery/content/levels';
import { CampaignQARecorder, type CampaignQANextObservation, type CampaignQAStoryObservation } from '../../src/delivery/qa/campaign-recorder';
import { attachCampaignQA } from '../../src/delivery/qa/campaign-observer';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
import type { Game } from '../../src/game/game';

function recorderFixture() {
  let now = 0;
  const levels = loadLevels(), recorder = new CampaignQARecorder(levels,
    { mode: 'full-campaign', layout: 'desktop', environment: 'Independent accounting fixture, not device evidence' }, [], () => now);
  const scene: CampaignQAStoryObservation = { levelId: levels[0].id, phase: 'playing', captured: true,
    controllerState: 'SETPIECE', modulePresent: true, charactersReady: true, sceneVisible: true,
    visiblePizzaTransfer: true, paused: false, pauseVisible: true, nextVisible: false, gameplayVisible: false };
  recorder.sample({ x: 0, y: .55, z: 0, yaw: 0, speed: 0, flying: false, descending: false, jumping: false,
    placementRevision: 1, support: null, action: '', ready: false, instruction: '' });
  recorder.begin(levels[0].id); recorder.picked('independent-carrier', true);
  recorder.observeStory(scene); recorder.setpieceFinished(levels[0].id, { ...scene, controllerState: 'REVEAL' }); recorder.complete(levels[0].id);
  const held = { ...scene, phase: 'viewing' as const, controllerState: 'LEVEL_COMPLETE', nextVisible: true };
  recorder.observeStory(held); now += 1001; recorder.observeStory(held);
  assert.equal(recorder.requestNext(levels[1].id, { x: 0, y: .55, z: 0, placementRevision: 1 }, true), true);
  const loading: CampaignQANextObservation = { loading: true, relocating: true, oldSceneReleased: true,
    nextLevelId: levels[1].id, paused: true, choosing: true, x: 0, y: .55, z: 0,
    placementRevision: 1, onRoad: false, surface: 'ground' };
  const ready: CampaignQANextObservation = { ...loading, loading: false, relocating: false, paused: false, choosing: false,
    x: levels[1].destination.x + 1000, z: levels[1].destination.z, placementRevision: 2, onRoad: true, surface: 'road' };
  return { recorder, loading, ready };
}

test('a Next transaction cannot silently absorb multiple unobserved placements as one clean progression', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  f.recorder.observeNext({ ...f.ready, placementRevision: 3 });
  assert.equal(f.recorder.active!.facts.includes('next-road-ready'), false,
    'revision jump of two cannot prove that the only placement was the expected Next');
});

test('a car that starts an old-scene departure under the loader cannot later acquire clean direct-Next proof', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  f.recorder.observeNext({ ...f.loading, x: 8 });
  f.recorder.observeNext(f.ready);
  const report = f.recorder.report();
  assert.ok(!f.recorder.active!.facts.includes('next-road-ready') || report.rows[0].storyViolations.length > 0 || report.assistance.length > 0,
    'the observed old-position drift must remain a failure, even if a later ready road is correct');
});

test('a vertical old-scene departure such as resurfacing under the loader cannot acquire clean direct-Next proof', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  f.recorder.observeNext({ ...f.loading, y: 8 });
  f.recorder.observeNext(f.ready);
  const report = f.recorder.report();
  assert.ok(!f.recorder.active!.facts.includes('next-road-ready') || report.rows[0].storyViolations.length > 0 || report.assistance.length > 0,
    'vertical old-position drift is still departure and must remain a failure');
});

test('a new order cannot inherit or finish an older attempt\'s pending Next transaction', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  f.recorder.begin(loadLevels()[2].id);
  f.recorder.observeNext(f.ready);
  const old = f.recorder.report().attempts[0];
  assert.equal(old.facts.includes('next-road-ready'), false,
    'a later attempt boundary must invalidate any incomplete old transition');
});

test('one legitimate Next placement can finish asset warming before ready without being mislabeled assistance', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  const warming = { ...f.ready, loading: true, relocating: true, paused: true, choosing: true };
  f.recorder.observeNext(warming);
  const sample = { x: warming.x, y: warming.y, z: warming.z, yaw: 0, speed: 0, flying: false,
    descending: false, jumping: false, placementRevision: warming.placementRevision,
    support: null, action: '', ready: false, instruction: '' };
  f.recorder.sample(sample);
  assert.equal(f.recorder.report().assistance.length, 0);
  assert.equal(f.recorder.active!.facts.includes('next-road-ready'), false, 'the loader must actually finish');
  f.recorder.observeNext(f.ready); f.recorder.sample(sample);
  assert.equal(f.recorder.active!.facts.includes('next-road-ready'), true);
  assert.equal(f.recorder.report().assistance.length, 0);
  f.recorder.sample({ ...sample, placementRevision: sample.placementRevision + 1 });
  assert.deepEqual(f.recorder.report().assistance.map(event => event.kind), ['player-relocated'],
    'a later independent R or map move remains assistance');
});

test('an extra R placement during asset warming cannot be absorbed by a pending legitimate Next', () => {
  const f = recorderFixture(); f.recorder.observeNext(f.loading);
  f.recorder.observeNext({ ...f.ready, loading: true, relocating: true, paused: true, choosing: true });
  f.recorder.observeNext({ ...f.ready, placementRevision: 3 });
  assert.equal(f.recorder.active!.facts.includes('next-road-ready'), false);
  assert.ok(f.recorder.report().assistance.length > 0);
});

/** Minimal DOM for executing the actual passive observer. No browser, gameplay
 * mutation, GPU rendering or physical-device claim is involved. */
interface ObserverDomControl {
  setOpening(hidden: boolean): void;
  hideOpening(hidden: boolean): void;
  setBackground(hidden: boolean): void;
  showNext(): void;
  clickNext(): void;
  poll(at: number): void;
}
function withObserverDom(run: (control: ObserverDomControl) => void) {
  class Element {
    hidden = false; style: any = {}; textContent = ''; value = ''; parent: Element | null = null;
    children: Element[] = []; attributes = new Map<string, string>();
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    append(...children: Element[]) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children: Element[]) { this.children = []; this.append(...children); }
    addEventListener() {} removeEventListener() {}
    contains(other: Element): boolean { return other === this || this.children.some(child => child.contains(other)); }
    isNext = false;
    closest(selector: string) { return selector === '[hidden]' && this.hidden || selector === '[data-du="story-next"]' && this.isNext ? this : null; }
    getBoundingClientRect() { return { x: 0, y: 0, width: 50, height: 50 }; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const install = (name: string, value: unknown) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); };
  const pause = new Element(), next = new Element(); next.isNext = true; next.hidden = true;
  let opening: Element | null = null, frame: FrameRequestCallback | null = null, wallTime = 10;
  const listeners = new Map<string, Set<(event: any) => void>>();
  const document = { hidden: false, body: new Element(), createElement: () => new Element(),
    getElementById: () => null, querySelector: (selector: string) => selector === '#b-help' ? pause : selector === '.du-grand-opening' ? opening : selector === '[data-du="story-next"]' ? next : null,
    addEventListener(name: string, callback: (event: any) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback); },
    removeEventListener(name: string, callback: (event: any) => void) { listeners.get(name)?.delete(callback); } };
  document.body.append(pause, next);
  install('document', document); install('getComputedStyle', () => ({ display: 'block', visibility: 'visible', opacity: '1' }));
  install('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; }); install('cancelAnimationFrame', () => {});
  install('performance', { now: () => wallTime });
  install('addEventListener', () => {}); install('removeEventListener', () => {});
  try { run({
    setOpening(hidden) { opening = new Element(); opening.hidden = hidden; opening.setAttribute('data-opening', 'open'); document.body.append(opening); },
    hideOpening(hidden) { assert.ok(opening); opening.hidden = hidden; },
    setBackground(hidden) { document.hidden = hidden; },
    showNext() { next.hidden = false; },
    // Synthetic test event to exercise the actual observer listener. Its
    // trusted bit is fixture data, never physical-device/input evidence.
    clickNext() { listeners.get('click')?.forEach(callback => callback({ target: next, isTrusted: true })); },
    poll(at) { wallTime = at; (frame as FrameRequestCallback | null)?.(at); },
  }); } finally { for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete (globalThis as any)[name]; } }
}

for (const [label, z, paint, layer, expected] of [
  ['front visible carton', -10, true, 0, true],
  ['carton entirely behind the camera', 10, true, 0, false],
  ['hidden carton material', -10, false, 0, false],
  ['carton outside the camera layer', -10, true, 2, false],
] as const) test(`the actual observer distinguishes ${label} when certifying physical transfer`, () => withObserverDom(() => {
  const level = loadLevels()[0], events = new EventBus<DeliveryEvents>(), scene = new THREE.Scene(), root = new THREE.Group();
  root.name = 'delivery-setpiece'; scene.add(root);
  const pizza = new THREE.Mesh(new THREE.BoxGeometry(1, .2, 1), new THREE.MeshBasicMaterial());
  pizza.name = 'delivery-truck-handoff-pizza'; pizza.position.set(0, 0, z); pizza.material.visible = paint; pizza.layers.set(layer); root.add(pizza);
  const camera = new THREE.PerspectiveCamera(60, 2, .1, 100); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(frustum.intersectsObject(pizza), z < 0, 'the fixture uses the actual gameplay camera frustum');
  const story: any = { controller: { levels: [level], activeLevel: level, nextLevel: null,
      state: 'SETPIECE', progress: { completedIds: [], nextLevel: null } },
    module: { charactersReady: true, supports: [], status: { canDrop: false, instruction: '', actionLabel: '' } },
    director: { phase: 'playing' }, cinematic: true };
  const game: any = { story, deliveryEvents: events, engine: { scene, camera }, t: 0, paused: false, choosing: false, relocating: false,
    railContacts: { supportId: null }, city: { movingRail: [] }, metro: { stationDwells: [] },
    player: { pos: new THREE.Vector3(0, .55, 0), yaw: 0, speed: 0, vy: 0, placementRevision: 1,
      flying: false, descending: false, jumping: false, onRoad: false, lastKind: 'ground' } };
  const observer = attachCampaignQA(game as Game, { full: true, touch: false });
  events.emit('locationSet', { levelId: level.id, destination: level.destination });
  story.controller.state = 'REVEAL'; events.emit('setpieceDone', { levelId: level.id });
  const report = observer.report(); observer.dispose();
  assert.equal(report.attempts[0].facts.includes('physical-pizza-transfer'), expected,
    'scene graph, camera frustum, layer and material state must all permit the physical handoff to render');
  assert.equal(report.rows[0].automaticHandoff, expected);
  pizza.geometry.dispose(); (pizza.material as THREE.Material).dispose();
}));

function finalObserverFixture(control: ObserverDomControl, automatic = true) {
  const source = loadLevels(), level = { ...source.at(-1)!, callMode: automatic ? 'NONE' as const : 'PLAYER_CALLS' as const },
    levels = [...source.slice(0, -1), level], events = new EventBus<DeliveryEvents>();
  const scene = new THREE.Scene(), root = new THREE.Group(); root.name = 'delivery-setpiece'; scene.add(root);
  const pizza = new THREE.Mesh(new THREE.BoxGeometry(1, .2, 1), new THREE.MeshBasicMaterial());
  pizza.name = 'delivery-handoff-pizza'; pizza.position.z = -10; root.add(pizza);
  const camera = new THREE.PerspectiveCamera(60, 2, .1, 100); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  const story: any = { controller: { levels, activeLevel: level, nextLevel: null,
      state: 'SETPIECE', progress: { completedIds: [], nextLevel: null, finished: false } },
    module: { charactersReady: true, supports: [], status: { canDrop: false, instruction: '', actionLabel: '' } },
    director: { phase: automatic ? 'playing' : 'driving' }, cinematic: automatic };
  const game: any = { story, deliveryEvents: events, engine: { scene, camera }, t: 0, paused: false, choosing: false, relocating: false,
    railContacts: { supportId: null }, city: { movingRail: [] }, metro: { stationDwells: [] },
    player: { pos: new THREE.Vector3(0, .55, 0), yaw: 0, speed: 0, vy: 0, placementRevision: 1,
      flying: false, descending: false, jumping: false, onRoad: false, lastKind: 'ground' } };
  const observer = attachCampaignQA(game as Game, { full: true, touch: false });
  events.emit('locationSet', { levelId: level.id, destination: level.destination });
  story.controller.state = 'REVEAL'; events.emit('setpieceDone', { levelId: level.id });
  story.controller.state = 'LEVEL_COMPLETE'; story.controller.progress.finished = true;
  story.controller.progress.completedIds = levels.map(level => level.id); story.director.phase = automatic ? 'viewing' : 'driving';
  if (automatic) control.showNext();
  events.emit('levelComplete', { levelId: level.id, level: level.level, total: levels.length, restaurantStage: levels.length, finished: true });
  game.t = 1; control.poll(1000); game.t = 2.1; control.poll(2100);
  if (automatic) {
    control.clickNext();
    assert.ok(observer.report().attempts[0].facts.includes('automatic-handoff'));
    assert.ok(observer.report().attempts[0].facts.includes('story-viewing-hold'));
    assert.ok(observer.report().attempts[0].facts.includes('final-next-requested'));
  }
  const dispose = () => { observer.dispose(); root.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } }); };
  return { observer, game, dispose };
}

test('the actual observer does not treat a hidden stale final-opening DOM node as a viewed ceremony', () => withObserverDom(control => {
  const f = finalObserverFixture(control); control.setOpening(true);
  for (let t = 2350; t <= 5350; t += 250) control.poll(t);
  const report = f.observer.report(); f.dispose();
  assert.equal(report.attempts[0].facts.includes('final-opening'), false,
    'hidden DOM state and elapsed wall time do not prove a ceremony was actually visible');
}));

test('the actual observer accepts a continuously visible final ceremony only after completion and trusted Next', () => withObserverDom(control => {
  const f = finalObserverFixture(control); control.setOpening(false);
  for (let t = 2350; t <= 4350; t += 250) control.poll(t);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'), false, 'two seconds are still short of the required exposure');
  control.poll(4600);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'), true);
  f.dispose();
}));

test('legacy non-NONE final ceremony keeps its visible-opening proof without an automatic-story Next button', () => withObserverDom(control => {
  const f = finalObserverFixture(control, false); control.setOpening(false);
  for (let t = 2350; t <= 4850; t += 250) control.poll(t);
  const report = f.observer.report(); f.dispose();
  assert.equal(report.attempts[0].facts.includes('final-next-requested'), false, 'legacy final dialogs have no story Next action');
  assert.equal(report.attempts[0].facts.includes('final-opening'), true, 'the unchanged legacy requirement remains observable');
}));

for (const interruption of ['hidden-panel', 'background', 'paused'] as const) test(`the actual observer restarts final ceremony exposure after ${interruption}`, () => withObserverDom(control => {
  const f = finalObserverFixture(control); control.setOpening(false);
  for (let t = 2350; t <= 3850; t += 250) control.poll(t);
  if (interruption === 'hidden-panel') control.hideOpening(true);
  else if (interruption === 'background') control.setBackground(true);
  else f.game.paused = true;
  control.poll(4100); control.poll(4350); control.poll(4600);
  if (interruption === 'hidden-panel') control.hideOpening(false);
  else if (interruption === 'background') control.setBackground(false);
  else f.game.paused = false;
  control.poll(4850); control.poll(5100); control.poll(5350);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'), false,
    'earlier visible exposure must not be combined with hidden/background/paused time');
  for (let t = 5600; t <= 7100; t += 250) control.poll(t);
  assert.equal(f.observer.report().attempts[0].facts.includes('final-opening'), true);
  f.dispose();
}));

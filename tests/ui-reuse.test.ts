import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SignSystem } from '../src/world/signs';
import { MinimapBaseCache } from '../src/ui/minimap-cache';
import { normalizeSettings, loadSettings, saveSettings } from '../src/ui/settings';

function fakeCanvas() {
  const calls = { paints: 0, strokes: 0, draws: 0 };
  const ctx: any = {
    fillRect() { calls.paints++; }, fillText() { calls.paints++; },
    measureText(text: string) { return { width: text.length * 10 }; },
    scale() {}, translate() {}, beginPath() {}, moveTo() {}, lineTo() {},
    setLineDash() {}, stroke() { calls.strokes++; }, drawImage() { calls.draws++; },
  };
  const canvas: any = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, ctx, calls };
}

function installDocument(fonts?: any, created?: ReturnType<typeof fakeCanvas>[]) {
  const previous = (globalThis as any).document;
  (globalThis as any).document = { fonts, createElement: () => { const c = fakeCanvas(); created?.push(c); return c.canvas; } };
  return () => { (globalThis as any).document = previous; };
}

function board(id: string, text = id, x = 0) {
  return { id, text, bg: '#fff', fg: '#111', c: new THREE.Vector3(x, 5, 10),
    right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), w: 8, h: 2 };
}

test('settings migrate old values without changing preferences or progress', () => {
  const old = { quality: 'high', sound: false, steer: 'tilt', tips: false };
  assert.deepEqual(normalizeSettings(old), { ...old, targetFPS: 60, adaptiveResolution: false });
  assert.deepEqual(normalizeSettings({ ...old, targetFPS: 120, adaptiveResolution: true }),
    { ...old, targetFPS: 120, adaptiveResolution: true });
  assert.equal(normalizeSettings({ targetFPS: 144, adaptiveResolution: 'on' }).targetFPS, 60);
  assert.equal(normalizeSettings({ targetFPS: 90 }).targetFPS, 90);
  assert.equal(normalizeSettings([]).adaptiveResolution, false);
  const storage = new Map([['p2ph-settings-v1', JSON.stringify(old)], ['p2ph-progress', 'retained']]);
  const previous = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
  try {
    const migrated = loadSettings(); migrated.targetFPS = 90; saveSettings(migrated);
    assert.equal(loadSettings().targetFPS, 90);
    assert.equal(storage.get('p2ph-progress'), 'retained');
    storage.set('p2ph-settings-v1', 'invalid-json');
    assert.equal(loadSettings().targetFPS, 60);
  } finally { (globalThis as any).localStorage = previous; }
});

test('stationary shop signs retain geometry and atlas uploads through 120 Hz updates', () => {
  const restore = installDocument();
  const signs = new SignSystem(1, 230);
  try {
    signs.init(.4);
    const a = signs.add(board('a', 'Hyderabad Shop'));
    const b = signs.add(board('b', 'Hyderabad Shop', 12));
    signs.update(0, 0, false, 0);
    assert.equal(a.slot, b.slot, 'same text and style share an atlas slot');
    const geometry = signs.pages[0].mesh.geometry, textureVersion = signs.pages[0].tex.version;
    const original = { ...signs.stats };
    for (let i = 1; i <= 3600; i++) signs.update(0, 0, false, i * 1000 / 120);
    assert.deepEqual(signs.stats, original);
    assert.equal(signs.pages[0].mesh.geometry, geometry);
    assert.equal(signs.pages[0].tex.version, textureVersion);
    assert.equal(geometry.drawRange.count, 12);
    const pos = geometry.getAttribute('position');
    assert.deepEqual([pos.getX(0), pos.getY(0), pos.getZ(0)], [-4, 4, 10]);
    signs.update(5, 0, false, 31000);
    assert.equal(signs.stats.geometryUpdates, original.geometryUpdates, 'movement within unchanged membership does not rewrite quads');
    assert.equal(signs.stats.texturePaints, original.texturePaints);
  } finally { signs.dispose(); restore(); }
});

test('changed source signs update retained buffers and unload clears visible draw range', () => {
  const restore = installDocument(), signs = new SignSystem(1, 230);
  try {
    signs.init(.4);
    const a = signs.add(board('a'));
    signs.update(0, 0, false, 0);
    const geometry = signs.pages[0].mesh.geometry;
    a.c.x = 20; a.text = 'కొత్త దుకాణం'; signs.invalidate();
    signs.update(0, 0, false, 1);
    assert.equal(signs.pages[0].mesh.geometry, geometry);
    assert.equal(geometry.getAttribute('position').getX(0), 16);
    assert.equal(signs.slotOf.size, 1);
    signs.remove([a]); signs.update(0, 0, false, 2);
    assert.equal(geometry.drawRange.count, 0);
    assert.equal(signs.slotOf.size, 0);
    assert.equal(signs.pages[0].mesh.geometry, geometry);
  } finally { signs.dispose(); restore(); }
});

test('minimap reuses road imagery under motion and remote graph changes', () => {
  const output = fakeCanvas(), edges: any[] = [{ e: { cls: 'primary', elev: null, w: 12, pts: [[-300, 0], [600, 0]] } }];
  const graph: any = { revision: 1, nearestEdges: () => [...edges] };
  const lines: any[] = [];
  const cache = new MinimapBaseCache(256, 32, () => fakeCanvas().canvas);
  cache.draw(output.ctx, graph, lines, 0, 0, 240, .7);
  const first = cache.stats.builds;
  assert.ok(first > 0);
  for (let i = 0; i < 100; i++) cache.draw(output.ctx, graph, lines, i / 10, 0, 240, .7);
  assert.equal(cache.stats.builds, first);
  graph.revision++;
  cache.draw(output.ctx, graph, lines, 0, 0, 240, .7);
  assert.equal(cache.stats.builds, first, 'remote graph revision verifies membership without repainting local roads');
  edges.push({ e: { cls: 'residential', elev: null, w: 6, pts: [[0, -300], [0, 600]] } });
  graph.revision++;
  cache.draw(output.ctx, graph, lines, 0, 0, 240, .7);
  assert.ok(cache.stats.builds > first);
  cache.dispose(); assert.equal(cache.stats.bytes, 0);
});

test('minimap bounds raster cache memory while traversing distant areas', () => {
  const output = fakeCanvas(), graph: any = { revision: 1, nearestEdges: () => [] }, lines: any[] = [];
  const cache = new MinimapBaseCache(256, 16, () => fakeCanvas().canvas);
  for (let i = 0; i < 50; i++) cache.draw(output.ctx, graph, lines, i * 1000, i * 1000, 240, .7);
  assert.ok(cache.stats.bytes <= 16 * 256 * 256 * 4);
});

test('late web fonts repaint retained selected atlas slots once without changing source or geometry', () => {
  const listeners = new Set<() => void>();
  const fonts = {
    loaded: false,
    addEventListener(type: string, listener: () => void) { assert.equal(type, 'loadingdone'); listeners.add(listener); },
    removeEventListener(type: string, listener: () => void) { assert.equal(type, 'loadingdone'); listeners.delete(listener); },
    finishLoading() { this.loaded = true; for (const listener of [...listeners]) listener(); },
  };
  const created: ReturnType<typeof fakeCanvas>[] = [], restore = installDocument(fonts, created);
  const signs = new SignSystem(1, 230), fontAtPaint: boolean[] = [];
  try {
    signs.init(.4); signs.init(.4); assert.equal(listeners.size, 1, 'initialization subscribes once');
    const ctx = created[0].ctx, originalFillText = ctx.fillText;
    ctx.fillText = (...args: any[]) => { fontAtPaint.push(fonts.loaded); originalFillText(...args); };
    const a = signs.add(board('source-a', 'Hyderabad Shop')), b = signs.add(board('source-b', 'Hyderabad Shop', 12));
    const third = signs.add(board('source-c', 'Another Shop', 24));
    signs.update(0, 0, false, 0);
    const key = JSON.stringify([a.text, a.bg, a.fg]), retainedSlot = signs.slotOf.get(key)!;
    const geometry = signs.pages[0].mesh.geometry, texture = signs.pages[0].tex;
    const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
    const original = { ...signs.stats }, textureVersion = texture.version;
    const identity = { a, b, third, thirdSlot: third.slot, c: a.c, right: a.right, up: a.up, id: a.id, text: a.text, page: a.page, slot: a.slot,
      coordinates: Array.from(position.array), uvs: Array.from(uv.array), positionVersion: position.version, uvVersion: uv.version };
    assert.deepEqual(fontAtPaint, [false, false], 'both distinct boards painted before fonts completed');
    fonts.finishLoading(); assert.deepEqual(signs.stats, original, 'font event only invalidates; it does not paint synchronously');
    signs.update(0, 0, false, 1);
    assert.deepEqual(fontAtPaint, [false, false, true, true], 'each distinct slot repaints once, while duplicate text still shares a slot');
    assert.equal(signs.stats.texturePaints, original.texturePaints + 2);
    assert.equal(texture.version, textureVersion + 1, 'one upload invalidation for the affected page');
    assert.equal(signs.slotOf.get(key), retainedSlot); assert.equal(a.slot, identity.slot); assert.equal(a.page, identity.page); assert.equal(a.slot, b.slot);
    assert.equal(signs.signs[0], identity.a); assert.equal(signs.signs[1], identity.b); assert.equal(signs.signs[2], identity.third); assert.equal(third.slot, identity.thirdSlot);
    assert.equal(a.c, identity.c); assert.equal(a.right, identity.right); assert.equal(a.up, identity.up); assert.equal(a.id, identity.id); assert.equal(a.text, identity.text);
    assert.equal(signs.pages[0].mesh.geometry, geometry); assert.equal(signs.stats.geometryUpdates, original.geometryUpdates);
    assert.deepEqual(Array.from(position.array), identity.coordinates); assert.deepEqual(Array.from(uv.array), identity.uvs);
    assert.equal(position.version, identity.positionVersion); assert.equal(uv.version, identity.uvVersion);
    const afterFont = { ...signs.stats }, afterVersion = texture.version;
    for (let i = 1; i <= 3600; i++) signs.update(0, 0, false, 1 + i * 1000 / 120);
    assert.deepEqual(signs.stats, afterFont); assert.equal(texture.version, afterVersion); assert.deepEqual(fontAtPaint, [false, false, true, true]);
    signs.dispose(); assert.equal(listeners.size, 0, 'disposed sign system unsubscribes');
    fonts.finishLoading(); signs.update(0, 0, false, 40000); assert.deepEqual(signs.stats, afterFont);
  } finally { signs.dispose(); restore(); }
});

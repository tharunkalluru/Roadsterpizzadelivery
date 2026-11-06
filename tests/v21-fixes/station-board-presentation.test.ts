import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { stationBoardContent, stationBoardLayout, stationBoardRegion, paintStationBoard } from '../../src/world/station-board';
import { StationSignAtlas, STATION_ATLAS_MAX_QUADS } from '../../src/world/station-sign-atlas';
import { SignSystem } from '../../src/world/signs';
import { drawMetroStationVisuals } from '../../src/world/metro-station-visuals';
import { metroCorridors, metroPlatformAssemblies } from '../../src/world/metro-geometry';
import type { SignEntry } from '../../src/world/city';
import type { CoreData } from '../../src/world/types';

const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
const almost = (a: number, b: number, why?: string) => assert.ok(Math.abs(a - b) < 1e-6, why ?? `${a} != ${b}`);
function context() {
  const draws: { text: string; x: number; y: number; font: string; color: string }[] = [];
  const g = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillRect() {}, beginPath() {}, arc() {}, fill() {},
    measureText(text: string) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)?.[1] || 0) * .65 }; },
    fillText(text: string, x: number, y: number) { draws.push({ text, x, y, font: this.font, color: this.fillStyle }); } };
  return { g: g as unknown as CanvasRenderingContext2D, draws };
}
function withCanvas(run: (state: { contexts: ReturnType<typeof context>[]; listeners: Map<string, () => void> }) => void) {
  const before = globalThis.document, contexts: ReturnType<typeof context>[] = [], listeners = new Map<string, () => void>();
  globalThis.document = { createElement: () => { const c = context(); contexts.push(c); return { width: 0, height: 0, getContext: () => c.g }; },
    fonts: { addEventListener: (type: string, f: () => void) => listeners.set(type, f), removeEventListener: (type: string, f: () => void) => { if (listeners.get(type) === f) listeners.delete(type); } } } as unknown as Document;
  try { run({ contexts, listeners }); } finally { if (before === undefined) delete globalThis.document; else globalThis.document = before; }
}
function quad(id: string, name = 'Ameerpet', kind: 'exterior' | 'platform' = 'exterior', x = 0) {
  return { id, text: name, bg: '#f8fafb', fg: '#17304d', station: stationBoardContent(name, 'అమీర్‌పేట్', ['blue', 'red'], kind),
    c: new THREE.Vector3(x, 8.4, 0), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), w: kind === 'exterior' ? 15.4 : 4.2, h: kind === 'exterior' ? 1.95 : 1.15 };
}

test('station names retain sourced Telugu, decode literal joiners and only fall back when no source translation exists', () => {
  assert.equal(core.metro.stations.length, 57);
  let translated = 0; const missing: string[] = [];
  for (const source of core.metro.stations) {
    const board = stationBoardContent(source.name, source.te, source.lines, 'exterior');
    assert.equal(board.english, source.name.toUpperCase());
    if (source.te) { translated++; assert.ok(board.telugu); assert.doesNotMatch(board.telugu!, /\\u[0-9a-f]{4}/i); }
    else { missing.push(source.name); assert.equal(board.telugu, undefined); }
  }
  assert.equal(translated, 54); assert.deepEqual(missing.sort(), ['JBS', 'Jubilee Hills Checkpost', 'Raidurg']);
  assert.equal(stationBoardContent('Ameerpet', 'అమీర్\\u200cపేట్', ['red', 'blue', 'red'], 'platform').telugu, 'అమీర్‌పేట్');
  assert.equal(stationBoardContent('Example', 'not a translation', [], 'platform').telugu, undefined);
});

test('every real corridor assembly keeps exactly two primary exterior faces and one inward name per platform', () => {
  const assemblies = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight);
  assert.ok(assemblies.length > 50);
  for (const a of assemblies) {
    const signs: SignEntry[] = [], boxes: any[][] = [], { hx, hz, cx, cz } = a.frame;
    drawMetroStationVisuals({ ...a.source, id: a.key, name: a.source.name! }, a.frame, a.deckHeight, { signs, B: { st: { box: (...args: any[]) => boxes.push(args) } as any }, exterior: !a.secondary });
    const outside = signs.filter(s => s.station?.kind === 'exterior'), inside = signs.filter(s => s.station?.kind === 'platform');
    assert.equal(outside.length, a.secondary ? 0 : 2, a.key); assert.equal(inside.length, 2, a.key);
    assert.equal(new Set(signs.map(s => s.id)).size, signs.length);
    for (const s of signs) {
      const expected = stationBoardContent(a.source.name!, a.source.te, s.station!.kind === 'platform' ? [a.lineId] : a.source.lines, s.station!.kind); assert.deepEqual(s.station, expected);
      const n = new THREE.Vector3(...s.right).cross(new THREE.Vector3(...s.up)), dx = s.c[0] - cx, dz = s.c[2] - cz;
      if (s.station!.kind === 'exterior') {
        assert.ok(n.x * dx + n.z * dz > 60, 'each end must face its own road approach');
        almost(s.w, 15.4); almost(s.h, 1.95); assert.ok(s.c[1] + s.h / 2 < a.deckHeight - 1.2);
      } else {
        assert.ok(n.x * -dx + n.z * -dz > 6, 'each platform must face the train window');
        //6m side platform: inner edge3.9m, outer9.9m; inward sign face
        // stays.25m inside the outer railing rather than in the walkway.
        almost(s.w, 4.2); almost(s.h, 1.15); almost(Math.abs(-dx * hz + dz * hx), 9.65);
      }
    }
    assert.equal(boxes.filter(b => b[3] === 16 && b[4] === 2.25 && b[5] === .16).length, outside.length);
    assert.equal(boxes.filter(b => b[3] === .14 && b[4] === 1.35 && b[5] === 4.6).length, 2);
    assert.equal(boxes.filter(b => b[3] === .66 && b[4] === .14 && b[5] === 4.2).length, 4, 'benches retained');
  }
});

test('both quality modes give station UVs exactly the physical face aspect without horizontally stretching type', () => {
  for (const scale of [1, .5]) for (const [w, h, span] of [[15.4, 1.95, 2], [4.2, 1.15, 1]]) {
    const slot = { x: 512 * scale, y: 320 * scale, w: 512 * span * scale, h: 160 * scale };
    const { paint, sample } = stationBoardRegion(slot, w, h, scale);
    almost(paint.w / paint.h, w / h); almost(sample.w / sample.h, w / h);
    assert.ok(sample.x > paint.x && sample.y > paint.y && sample.w < paint.w && sample.h < paint.h);
    assert.ok(paint.x >= slot.x + 4 * scale && paint.x + paint.w <= slot.x + slot.w - 4 * scale + 1e-6);
    assert.ok(paint.y >= slot.y + 4 * scale && paint.y + paint.h <= slot.y + slot.h - 4 * scale + 1e-6);
  }
});

test('all actual English and Telugu names fit completely with metro identity and route bands in both quality modes', () => {
  const { g, draws } = context();
  for (const source of core.metro.stations) for (const low of [false, true]) for (const kind of ['exterior', 'platform'] as const) {
    const board = stationBoardContent(source.name, source.te, source.lines, kind), scale = low ? .5 : 1;
    const rect = stationBoardRegion({ x: 0, y: 0, w: (kind === 'exterior' ? 1024 : 512) * scale, h: 160 * scale }, kind === 'exterior' ? 15.4 : 4.2, kind === 'exterior' ? 1.95 : 1.15, scale).paint;
    const lines = stationBoardLayout(g, board, rect); assert.equal(lines.length, source.te ? 2 : 1);
    for (const line of lines) {
      g.font = line.font; assert.ok(g.measureText(line.text).width <= line.maxWidth);
      assert.ok(line.size >= (low ? 7 : 14), `${source.name}: unreadably small atlas font`);
      assert.ok(line.x >= rect.x && line.x <= rect.x + rect.w && line.y >= rect.y && line.y <= rect.y + rect.h);
    }
    const before = draws.length; paintStationBoard(g, board, rect); const painted = draws.slice(before);
    assert.equal(painted[0].text, 'M'); assert.ok(painted.some(d => d.text === board.english));
    if (board.telugu) assert.ok(painted.some(d => d.text === board.telugu));
    for (const line of board.lines) assert.ok(painted.some(d => d.text === `${line.toUpperCase()} LINE`));
    assert.ok(painted.filter(d => d.text === board.english || d.text === board.telugu).every(d => d.color === '#fff9e9'));
  }
});

test('station rendering shares one bounded unlit opaque atlas and opposite faces share text allocation', () => withCanvas(() => {
  for (const low of [false, true]) {
    const atlas = new StationSignAtlas(low), signs = [quad('outside-1'), quad('outside-2'), quad('inside-1', 'Ameerpet', 'platform'), quad('inside-2', 'Ameerpet', 'platform')];
    atlas.sync(signs);
    assert.equal(atlas.entries.size, 2); assert.equal(atlas.stats.texturePaints, 2); assert.equal(atlas.geometry.drawRange.count, 24);
    assert.equal(atlas.mesh.material, atlas.material); assert.equal(atlas.material.type, 'MeshBasicMaterial');
    assert.equal(atlas.material.toneMapped, false); assert.equal(atlas.material.transparent, false); assert.equal(atlas.material.opacity, 1);
    assert.equal(atlas.material.depthWrite, true); assert.equal(atlas.material.side, THREE.FrontSide);
    assert.equal(atlas.texture.colorSpace, THREE.SRGBColorSpace); assert.equal(atlas.canvas.width, low ? 1024 : 2048); assert.equal(atlas.canvas.height, low ? 512 : 1024);
    const p = atlas.geometry.getAttribute('position'), uv = atlas.geometry.getAttribute('uv');
    for (let i = 0; i < atlas.geometry.drawRange.count; i++) {
      assert.ok(atlas.geometry.boundingBox!.containsPoint(new THREE.Vector3().fromBufferAttribute(p, i)));
      assert.ok(uv.getX(i) > 0 && uv.getX(i) < 1 && uv.getY(i) > 0 && uv.getY(i) < 1);
    }
    assert.ok(p.count <= STATION_ATLAS_MAX_QUADS * 6); atlas.dispose();
  }
}));

test('120 Hz stationary updates keep geometry and texture versions stable; completed fonts only repaint pixels', () => withCanvas(() => {
  const atlas = new StationSignAtlas(false), signs = [quad('out'), quad('in', 'Ameerpet', 'platform')]; atlas.sync(signs);
  const geometry = atlas.geometry, positions = geometry.getAttribute('position'), version = atlas.texture.version, uv = Array.from(geometry.getAttribute('uv').array);
  for (let i = 0; i < 1200; i++) atlas.sync(signs);
  assert.equal(atlas.stats.geometryUpdates, 1); assert.equal(atlas.stats.texturePaints, 2); assert.equal(atlas.texture.version, version);
  assert.equal(atlas.geometry, geometry); assert.equal(geometry.getAttribute('position'), positions);
  atlas.sync(signs, true); assert.equal(atlas.stats.texturePaints, 4); assert.equal(atlas.texture.version, version + 1);
  assert.equal(atlas.stats.geometryUpdates, 1); assert.deepEqual(Array.from(geometry.getAttribute('uv').array), uv);
  atlas.sync([]); assert.equal(geometry.drawRange.count, 0); assert.equal(atlas.mesh.visible, false);
  for (let i = 0; i < 20; i++) { atlas.sync(signs); atlas.sync([]); }
  assert.equal(atlas.geometry, geometry); assert.equal(atlas.entries.size, 0); assert.equal(atlas.mesh.visible, false); atlas.dispose();
}));

test('atlas capacity stays bounded and nearest complete station identities survive row fragmentation', () => withCanvas(() => {
  const atlas = new StationSignAtlas(true);
  const platforms = Array.from({ length: 24 }, (_, i) => quad(`p${i}`, `Station ${i}`, 'platform', i)); atlas.sync(platforms);
  assert.equal(atlas.entries.size, 24);
  const retained = platforms.filter((_, i) => i % 2), exterior = Array.from({ length: 6 }, (_, i) => quad(`e${i}`, `Exterior ${i}`));
  atlas.sync([...exterior, ...retained]); assert.equal(atlas.entries.size, 18); assert.equal(atlas.geometry.drawRange.count, 18 * 6);
  const cells = [...atlas.entries.values()].flatMap(e => Array.from({ length: e.span }, (_, i) => e.cell + i));
  assert.equal(cells.length, 24); assert.equal(new Set(cells).size, 24); assert.ok(cells.every(i => i >= 0 && i < 24));
  const fullStations = Array.from({ length: 30 }, (_, i) => [quad(`${i}-a`, `Nearest ${i}`), quad(`${i}-b`, `Nearest ${i}`), quad(`${i}-c`, `Nearest ${i}`, 'platform'), quad(`${i}-d`, `Nearest ${i}`, 'platform')]).flat();
  atlas.sync(fullStations); assert.equal(atlas.entries.size, 16); assert.equal(atlas.geometry.drawRange.count, 8 * 4 * 6);
  assert.ok([...atlas.entries.values()].every(e => Number(e.board.english.split(' ')[1]) < 8), 'nearest eight complete station identities get the bounded page');
  assert.ok(atlas.geometry.drawRange.count <= STATION_ATLAS_MAX_QUADS * 6); atlas.dispose();
}));

test('station names appear on the first update and font completion works without disturbing shop appearance or cadence', () => withCanvas(({ listeners }) => {
  const system = new SignSystem(3), s = quad('station'); system.init(.6); system.init(.6);
  assert.equal(system.pages.length, 3); assert.equal(listeners.size, 1);
  system.add(s); const shop = system.add({ ...quad('shop', 'Local Shop'), station: undefined }); system.update(0, 0);
  assert.equal(system.stationAtlas!.geometry.drawRange.count, 6); assert.equal(system.grid.size, 1); assert.equal(system.slotOf.size, 0);
  const atlas = system.stationAtlas!, previous = atlas.texture.version, geometry = atlas.geometry;
  for (let i = 0; i < 120; i++) system.update(i % 5, 0);
  assert.equal(atlas.stats.geometryUpdates, 1); assert.equal(atlas.texture.version, previous);
  assert.ok(shop.page >= 0); assert.equal(system.pages[shop.page].mesh.material.type, 'MeshStandardMaterial');
  assert.equal(system.slotOf.size, 1, 'station content never consumes or duplicates a shop slot');
  system.setEmissive(1.5); assert.ok(system.material.every(m => m.emissiveIntensity === 1.5)); assert.equal(atlas.material.type, 'MeshBasicMaterial');
  listeners.get('loadingdone')!(); system.update(0, 0); assert.equal(atlas.texture.version, previous + 1); assert.equal(atlas.geometry, geometry); assert.equal(atlas.stats.geometryUpdates, 1);
  system.update(1000, 1000); assert.equal(atlas.mesh.visible, false); system.update(0, 0); assert.equal(atlas.mesh.visible, true);
  system.remove([system.signs.find(s => s.id === 'station')!]); system.update(0, 0); assert.equal(atlas.mesh.visible, false);
  system.dispose(); assert.equal(listeners.size, 0); assert.equal(system.group.children.length, 0);
}));

test('disposing station resources releases every GPU owner exactly once and subsequent sync is harmless', () => withCanvas(() => {
  const atlas = new StationSignAtlas(false); atlas.sync([quad('out')]); const counts = { geometry: 0, texture: 0, material: 0 };
  atlas.geometry.addEventListener('dispose', () => counts.geometry++); atlas.texture.addEventListener('dispose', () => counts.texture++); atlas.material.addEventListener('dispose', () => counts.material++);
  const parent = new THREE.Group(); parent.add(atlas.mesh); atlas.dispose(); atlas.dispose(); atlas.sync([quad('later')]);
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1 }); assert.equal(parent.children.length, 0); assert.equal(atlas.entries.size, 0);
}));

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates, TiledBatch } from '../../src/core/util';
import { stationWindowMaterial } from '../../src/core/world-materials';
import { drawStationPresentation, drawStationEntrancePresentation, stationVaultHeight, stationWindowBays, STATION_PRESENTATION } from '../../src/world/station-presentation';
import { StreetPresentationBudget, STREET_DETAIL_KIT_LIMIT, drawShelterPresentation } from '../../src/world/street-presentation';
import { metroCorridors, metroPlatformAssemblies, projectMetroPath, sampleMetroPath } from '../../src/world/metro-geometry';
import type { CoreData } from '../../src/world/types';
import { buildTile } from '../../src/world/city';

const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
const assemblies = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight);
initTemplates();
const batch = () => new TiledBatch(500);
const vertexCount = (b: TiledBatch) => [...b.tiles.values()].reduce((n, tile) => n + tile.pos.length / 3, 0);
function positions(b: TiledBatch) { return [...b.tiles.values()].flatMap(tile => Array.from({ length: tile.pos.length / 3 }, (_, i) => tile.pos.slice(i * 3, i * 3 + 3))); }
const near = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 1e-6, message ?? `${a} != ${b}`);

test('smooth station shell stays above the retained structural liner, with a fixed 134 by 26 metre envelope', () => {
  assert.equal(STATION_PRESENTATION.halfLength, 67); assert.equal(STATION_PRESENTATION.halfSpan, 13);
  for (let k = 0; k < 7; k++) {
    const a = -13 + k * 26 / 7, b = -13 + (k + 1) * 26 / 7;
    const y0 = 9.2 - 2.4 * (a / 13) ** 2, y1 = 9.2 - 2.4 * (b / 13) ** 2;
    const slope = (y1 - y0) / (b - a), upperFaceOffset = .15 * Math.sqrt(1 + slope * slope);
    for (let i = 0; i <= 20; i++) {
      const v = a + (b - a) * i / 20, oldTop = y0 + (v - a) * slope + upperFaceOffset;
      assert.ok(stationVaultHeight(v, 0) - oldTop > .1, `outer roof clips the retained slat at ${v}`);
    }
  }
  // Low mode shares the same silhouette; only the imperceptible roof segments
  // and rib count differ. Neither replaces lamp mounts or platform surfaces.
  near(stationVaultHeight(13, 18), 25.07); near(stationVaultHeight(0, 18), 27.47);
});

test('all real station window bays follow the actual track curve outside platform guards and leave terminal ends open', () => {
  assert.ok(assemblies.length > 50); let inspected = 0, curved = 0;
  for (const assembly of assemblies) {
    const { cx, cz, hx, hz } = assembly.frame, path = assembly.corridor.center, stationS = projectMetroPath(path, [cx, cz]).s;
    const bays = stationWindowBays(assembly); assert.ok(bays.length > 0, assembly.key); assert.ok(bays.length <= 24);
    assert.ok(STATION_PRESENTATION.windowBottom > 3.3, 'open bay frames must sit above the unchanged platform guard');
    for (const bay of bays) for (const [u, q] of [[bay.u0, bay.a], [bay.u1, bay.b]] as const) {
      const p = sampleMetroPath(path, stationS + u), offset = bay.side * STATION_PRESENTATION.windowOffset;
      near(q[0], p.x - p.hz * offset); near(q[1], p.z + p.hx * offset);
      near(Math.hypot(q[0] - p.x, q[1] - p.z), 8.45);
      assert.ok(Math.abs(u) <= 56, '130 m platform retains at least 9 m of open access at either end');
      const localU = (q[0] - cx) * hx + (q[1] - cz) * hz, localV = -(q[0] - cx) * hz + (q[1] - cz) * hx;
      assert.ok(Math.abs(localU) <= 65 + 1e-6 && Math.abs(localV) <= 12.4 + 1e-6, 'no unsupported glazing outside the retained canopy');
      curved = Math.max(curved, Math.hypot(p.x - cx - hx * u, p.z - cz - hz * u)); inspected++;
    }
  }
  assert.ok(inspected > 2500); assert.ok(curved > 1, 'covers the real curved station case');
});

test('station presentation is finite, bounded batched geometry in both quality modes, with no gameplay callbacks', () => {
  let maximumHigh = 0, maximumLow = 0;
  for (const assembly of assemblies) for (const low of [false, true]) {
    const B = { st: batch(), stationWindow: batch() };
    // The helper is deliberately supplied only rendering batches: it cannot
    // register a wall/obstacle/surface, alter trains or introduce a light.
    drawStationPresentation(assembly, B, low);
    assert.equal(vertexCount(B.stationWindow), 0, 'upper platform presentation must not emit opaque window fills');
    const count = vertexCount(B.st) + vertexCount(B.stationWindow);
    assert.ok(count <= (low ? 4600 : 6400), `${assembly.key}: ${count}`);
    if (low) maximumLow = Math.max(maximumLow, count); else maximumHigh = Math.max(maximumHigh, count);
    for (const p of [...positions(B.st), ...positions(B.stationWindow)]) {
      assert.ok(p.every(Number.isFinite)); assert.ok(p[1] > assembly.deckHeight + 3.4);
    }
  }
  assert.ok(maximumLow < maximumHigh); assert.ok(maximumHigh > 0);
});

test('actual curved platform bay apertures remain open to camera-to-recipient sightlines at varied orbit heights', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); let sightlines = 0;
  try {
    for (const assembly of assemblies) {
      const B = { st: batch() }; drawStationPresentation(assembly, B, false);
      const meshes = B.st.meshes(material); for (const mesh of meshes) mesh.updateMatrixWorld(true);
      try {
        for (const bay of stationWindowBays(assembly)) {
          const dx = bay.b[0] - bay.a[0], dz = bay.b[1] - bay.a[1], length = Math.hypot(dx, dz);
          const nx = -dz / length, nz = dx / length, mx = (bay.a[0] + bay.b[0]) / 2, mz = (bay.a[1] + bay.b[1]) / 2;
          for (const height of [3.8, 4.8, 5.8]) {
            // These segments cross the facade where the former opaque pane
            // intercepted a free-orbit camera looking toward the handoff.
            const camera = new THREE.Vector3(mx + nx * 3, assembly.deckHeight + height, mz + nz * 3);
            const toward = new THREE.Vector3(-nx, 0, -nz), ray = new THREE.Raycaster(camera, toward, 0, 6);
            assert.equal(ray.intersectObjects(meshes).length, 0, `${assembly.key}: closed bay at height ${height}`); sightlines++;
          }
        }
      } finally { for (const mesh of meshes) mesh.geometry.dispose(); }
    }
  } finally { material.dispose(); }
  assert.ok(sightlines > 4000, 'test every real station side, not only a synthetic straight station');
});

test('decorative station pieces honor the existing road/train clearance filter instead of obstructing an interchange', () => {
  const assembly = assemblies[0], B = { st: batch(), stationWindow: batch() }; let checks = 0;
  drawStationPresentation(assembly, B, false, (footprint, bottom, top) => {
    assert.ok(Number.isFinite(footprint.x) && Number.isFinite(footprint.z)); assert.ok(top >= bottom); checks++; return false;
  });
  assert.ok(checks > 100); assert.equal(vertexCount(B.st), 0); assert.equal(vertexCount(B.stationWindow), 0);
});

test('entrance trim remains inside the already cleared stair-canopy footprint', () => {
  for (const yaw of [0, .6, 1.9, -2.4]) for (const groundEnd of [-1, 1]) {
    const st = batch(), x = 123, z = -79, roofY = 16;
    drawStationEntrancePresentation(x, z, yaw, roofY, 'blue', { st }, groundEnd);
    assert.ok(vertexCount(st) <= 700); assert.ok(vertexCount(st) > 144, 'ground entry detail must actually be emitted');
    let groundFront = 0, oppositeFront = 0;
    for (const p of positions(st)) {
      const dx = p[0] - x, dz = p[2] - z, u = dx * Math.sin(yaw) + dz * Math.cos(yaw), v = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      assert.ok(Math.abs(u) <= 8.5 + 1e-6 && Math.abs(v) <= 2.2 + 1e-6); assert.ok(p[1] <= roofY + .09 + 1e-6);
      assert.ok(p[1] >= 0);
      if (p[1] < 3.5 && Math.abs(u - groundEnd * 8.045) < .025) groundFront++;
      if (p[1] < 3.5 && Math.abs(u + groundEnd * 8.045) < .025) oppositeFront++;
    }
    assert.ok(groundFront >= 90, 'closed door/pictogram must face the actual ground end'); assert.equal(oppositeFront, 0);
    const gray = new THREE.Color('#83969e'), low: number[] = [], high: number[] = [];
    for (const tile of st.tiles.values()) for (let i = 0; i < tile.pos.length; i += 3) {
      if (Math.abs(tile.col[i] - gray.r) > 1e-8 || Math.abs(tile.col[i + 1] - gray.g) > 1e-8 || Math.abs(tile.col[i + 2] - gray.b) > 1e-8) continue;
      const u = ((tile.pos[i] - x) * Math.sin(yaw) + (tile.pos[i + 2] - z) * Math.cos(yaw)) * groundEnd;
      if (u > 5.7) low.push(tile.pos[i + 1]); if (u < -5.7) high.push(tile.pos[i + 1]);
    }
    assert.ok(low.length && high.length); assert.ok(Math.min(...high) > Math.max(...low) + 2.5, 'stair profile must rise toward the station from either ground end');
  }
});

test('entrance detail fits every mapped station orientation and both road sides without extending checked footprints', () => {
  for (const assembly of assemblies) for (const groundEnd of [-1, 1]) for (const side of [-1, 1]) {
    const { cx, cz, hx, hz } = assembly.frame, yaw = Math.atan2(hx, hz), roofY = assembly.deckHeight - 1.9;
    // City may shift a blocked stair run outward in3m steps. Translation does
    // not change its 2.2m by8.5m checked envelope; inspect every allowed shift.
    for (const shift of [0, 3, 6, 9, 12]) {
      const u = groundEnd * 47, v = side * (14.5 + shift), x = cx + hx * u - hz * v, z = cz + hz * u + hx * v, st = batch();
      drawStationEntrancePresentation(x, z, yaw, roofY, assembly.lineId, { st }, groundEnd);
      assert.ok(vertexCount(st) <= 700, assembly.key);
      for (const p of positions(st)) {
        const dx = p[0] - x, dz = p[2] - z;
        assert.ok(Math.abs(dx * hx + dz * hz) <= 8.5 + 1e-6 && Math.abs(dx * hz - dz * hx) <= 2.2 + 1e-6, assembly.key);
        assert.ok(p[1] >= 0 && p[1] <= assembly.deckHeight - 1.8 + 1e-6);
      }
    }
  }
});

test('actual accepted Rasoolpura/Ameerpet entrances retain their original support envelopes with visible ground-end detail', () => {
  const tiles = new Set<string>(); let checked = 0;
  for (const assembly of assemblies.filter(a => /Rasoolpura|Ameerpet/.test(a.source.name ?? ''))) {
    const i = Math.floor(assembly.source.p[0] / 1000), j = Math.floor(assembly.source.p[1] / 1000), key = `${i}_${j}`;
    if (tiles.has(key)) continue; tiles.add(key);
    const pack = core.packs.find(p => p.tiles.some(t => t[0] === i && t[1] === j))!;
    const zone = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()).tiles[key];
    const built = buildTile(zone, { lowQ: false, metro: core.metro });
    for (const support of built.structureSupports!.filter(s => s.part === 'station_stairs')) {
      const source = assemblies.find(a => a.key === support.source)!; assert.ok(source);
      const fp = support.footprint; assert.ok('hx' in fp); if (!('hx' in fp)) continue;
      const end = Math.sign((fp.x - source.frame.cx) * fp.hx + (fp.z - source.frame.cz) * fp.hz), st = batch();
      drawStationEntrancePresentation(fp.x, fp.z, Math.atan2(fp.hx, fp.hz), support.top - .1, source.lineId, { st }, end);
      for (const p of positions(st)) {
        const dx = p[0] - fp.x, dz = p[2] - fp.z;
        assert.ok(Math.abs(dx * fp.hx + dz * fp.hz) <= fp.hl + 1e-6 && Math.abs(dx * fp.hz - dz * fp.hx) <= fp.hw + 1e-6);
        assert.ok(p[1] >= support.bottom && p[1] <= support.top + 1e-6);
      }
      checked++;
    }
  }
  assert.ok(checked >= 5, 'includes both actual Rasoolpura entries and stacked Ameerpet entrances');
});

test('useful mapped bus-shelter detail has a strict per-tile budget and fits the existing cleared shelter', () => {
  for (const limit of [0, STREET_DETAIL_KIT_LIMIT.low, STREET_DETAIL_KIT_LIMIT.high]) {
    const budget = new StreetPresentationBudget(limit), B = { st: batch(), lit: batch() };
    const yaw = .71, hx = Math.sin(yaw), hz = Math.cos(yaw), x = 71, z = -16, base = -.8;
    for (let i = 0; i < 100; i++) assert.equal(drawShelterPresentation(x, z, hx, hz, hz, -hx, base, B, budget), i < limit);
    assert.equal(budget.count, limit); assert.equal(vertexCount(B.st) + vertexCount(B.lit), limit * 216);
    for (const p of [...positions(B.st), ...positions(B.lit)]) {
      const dx = p[0] - x, dz = p[2] - z, u = dx * hx + dz * hz, v = dx * hz - dz * hx;
      assert.ok(Math.abs(u) <= 3.2 && Math.abs(v) <= 1.25, 'detail must remain off the road inside the checked existing shelter');
      assert.ok(p[1] >= base && p[1] <= base + 3.4);
    }
  }
});

test('station window material shares textures, stays opaque and uses ordinary depth without expensive transmission', () => {
  const map = new THREE.Texture(), emissive = new THREE.Texture(), material = stationWindowMaterial({ map, emissive });
  assert.equal(material.map, map); assert.equal(material.emissiveMap, emissive);
  assert.equal(material.transparent, false); assert.equal(material.opacity, 1); assert.equal(material.depthWrite, true);
  assert.equal(material.side, THREE.DoubleSide); assert.equal(material.blending, THREE.NormalBlending);
  assert.equal(material.emissiveIntensity, 0); assert.equal((material as any).transmission, undefined);
  material.dispose(); map.dispose(); emissive.dispose();
});

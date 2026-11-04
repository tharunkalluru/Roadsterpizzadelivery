import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildingTransportClearance, footprintArea } from '../../src/world/building-clearance';
import type { Building, CoreData } from '../../src/world/types';

const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const station = core.metro.stations.find(s => s.id === 'st_paradise')!;
const x = Math.floor(station.p[0] / 1000), z = Math.floor(station.p[1] / 1000), key = `${x}_${z}`;
const pack = core.packs.find(p => p.tiles.some(([i,j]) => i === x && j === z))!;
const zone = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()).tiles[key];
const source = zone.buildings.find((b: Building) => b.id === '18f6a0df-e72') as Building;
const replacement = /duplicate mapped metro station model replaced by station assembly/;

test('the actual Paradise source station shell is replaced by the real assembly without perimeter-wall remnants or source mutation', () => {
  assert.ok(source && source.cls === 'transportation');
  const before = JSON.stringify(source), result = buildingTransportClearance([], core.metro).correct(source)!;
  assert.ok(result);
  assert.deepEqual(result.pieces, [], 'a second solid station model must not leave inaccessible perimeter walls');
  assert.equal(result.correction.sourceId, source.id);
  assert.deepEqual(result.correction.corridors, ['station:st_paradise']);
  assert.equal(result.correction.sourceArea, footprintArea(source.ring));
  assert.equal(result.correction.retainedArea, 0);
  assert.equal(result.correction.fragments, 0);
  assert.match(result.correction.fallback!, replacement);
  assert.equal(JSON.stringify(source), before, 'packed geometry and metadata remain available for provenance and later corrections');
});

test('source ID alone cannot omit an ordinary office, changed depot, or changed/malformed footprint', () => {
  const clearance = buildingTransportClearance([], core.metro);
  const mutations: Building[] = [
    { ...source, id: 'nearby-transport-depot' },
    { ...source, cls: 'office' },
    { ...source, h: source.h + .1 },
    { ...source, ring: source.ring.map(([a,b]) => [a + .5,b]) },
    { ...source, ring: source.ring.map((p,i) => i === 0 ? source.ring[1] : p) },
  ];
  for (const building of mutations) {
    const result = clearance.correct(building);
    assert.doesNotMatch(result?.correction.fallback ?? '', replacement);
    if (result) assert.ok(result.pieces.length > 0, `${building.cls}/${building.id}: ordinary transport cropping retains source portions outside the station`);
  }
});

test('the exact source shell is not replaced when its matching procedural station is absent or moved', () => {
  assert.equal(buildingTransportClearance([]).correct(source), null);
  const variants = [
    { ...core.metro, stations: core.metro.stations.filter(s => s.id !== station.id) },
    { ...core.metro, stations: core.metro.stations.map(s => s.id === station.id ? { ...s, id: 'different-transport-property' } : s) },
    { ...core.metro, stations: core.metro.stations.map(s => s.id === station.id ? { ...s, p: [s.p[0] + 50, s.p[1]] as [number,number] } : s) },
  ];
  for (const metro of variants) {
    const result = buildingTransportClearance([], metro).correct(source);
    assert.doesNotMatch(result?.correction.fallback ?? '', replacement);
    if (result) assert.ok(result.pieces.length > 0);
  }
});

test('ring winding or first-vertex encoding does not change the exact reviewed station identity', () => {
  const clearance = buildingTransportClearance([], core.metro);
  for (const ring of [source.ring.slice().reverse(), [...source.ring.slice(3), ...source.ring.slice(0,3)]]) {
    const result = clearance.correct({ ...source, ring })!;
    assert.deepEqual(result.pieces, []);
    assert.match(result.correction.fallback!, replacement);
  }
});

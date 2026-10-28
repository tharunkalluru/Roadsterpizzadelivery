import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batch, initTemplates } from '../src/core/util';
import { drawPerson, walkerGeometry, walkerGeometryCacheStats as stats, trimWalkerGeometryCache, type PersonSpec } from '../src/world/people';
import { Walkers } from '../src/game/walkers';
import { BusPassengerExchange } from '../src/game/bus-passengers';
import { MetroStationLife } from '../src/game/station-life';

initTemplates();
const spec: PersonSpec = { kind: 'shirt', s: 1.03, walk: 1.2, skin: '#8d5a3b', hair: '#141216', a: '#9EC1E8', b: '#2b2a31', c: '#1b1a1f', sleeve: 'long', pattern: 'check', facialHair: true };

test('shared pedestrian geometry preserves exact appearance and cannot be disposed while one figure retains it', () => {
  trimWalkerGeometryCache(true);
  const a = walkerGeometry(spec), b = walkerGeometry({ ...spec, s: .9, walk: 1.8 });
  const expected = new Batch(); drawPerson(expected, { ...spec, s: 1 }, 0, 0, 0, false); const baseline = expected.geometry();
  for (const name of Object.keys(baseline.attributes)) assert.deepEqual(Array.from(a.body.getAttribute(name).array), Array.from(baseline.getAttribute(name).array));
  baseline.dispose(); assert.equal(a.body, b.body); assert.equal(a.leg, b.leg);
  let bodyDisposals = 0, legDisposals = 0;
  a.body.addEventListener('dispose', () => bodyDisposals++); a.leg?.addEventListener('dispose', () => legDisposals++);
  a.release(); a.release(); trimWalkerGeometryCache(true);
  assert.equal(bodyDisposals, 0); assert.equal(legDisposals, 0); assert.equal(stats.activeReferences, 1);
  b.release(); trimWalkerGeometryCache(true); trimWalkerGeometryCache(true);
  assert.equal(bodyDisposals, 1); assert.equal(legDisposals, 1); assert.equal(stats.entries, 0);
});

test('many retired appearances evict unused GPU geometry while preserving active leases and bounded unused bytes', () => {
  trimWalkerGeometryCache(true);
  const live = walkerGeometry(spec); let liveDisposed = 0, retiredDisposed = 0;
  live.body.addEventListener('dispose', () => liveDisposed++);
  for (let i = 0; i < 420; i++) {
    const lease = walkerGeometry({ ...spec, a: `#${(i + 0x100000).toString(16)}` });
    lease.body.addEventListener('dispose', () => retiredDisposed++); lease.release();
    assert.ok(stats.unusedEntries <= stats.maxUnusedEntries); assert.ok(stats.unusedBytes <= stats.maxUnusedBytes);
  }
  assert.ok(retiredDisposed > 0, 'old cache.clear discarded GPU ownership without any dispose event');
  assert.equal(liveDisposed, 0); assert.equal(stats.activeReferences, 1);
  trimWalkerGeometryCache(true); assert.equal(liveDisposed, 0); assert.equal(stats.entries, 1);
  live.release(); trimWalkerGeometryCache(true); assert.equal(liveDisposed, 1); assert.equal(stats.entries, 0);
});

test('walker and bus exchange removal release geometry on relocation, path unload and exchange retirement', () => {
  trimWalkerGeometryCache(true);
  const material = new THREE.MeshBasicMaterial(), path: any = { edge: 'street', pts: [[40, 0], [80, 0]] };
  const walkers = new Walkers({ walkPaths: [path] } as any, material);
  const random: any = () => .5; random.int = () => 0; random.pick = (a: any[]) => a[0]; random.range = (a: number, b: number) => (a + b) / 2; walkers.r = random;
  walkers.spawn(0, 0); walkers.spawn(0, 0);
  assert.equal(walkers.list.length, 2); assert.equal(stats.activeReferences, 2);
  // Same direct parent removal as Game's relocation clear.
  walkers.group.remove(walkers.list[0].g); assert.equal(stats.activeReferences, 1);
  walkers.removePaths([path]); assert.equal(stats.activeReferences, 0);
  const scene = new THREE.Scene(), exchange = new BusPassengerExchange({ x: 0, y: 0, z: 0, hx: 0, hz: -1 }, 6, material);
  scene.add(exchange.group); assert.equal(stats.activeReferences, 4);
  scene.remove(exchange.group); scene.remove(exchange.group); assert.equal(stats.activeReferences, 0);
  trimWalkerGeometryCache(true); assert.equal(stats.entries, 0); material.dispose();
});

test('station-life retains its finite shared figure leases until owner disposal', () => {
  trimWalkerGeometryCache(true);
  const material = new THREE.MeshBasicMaterial();
  const life: any = new MetroStationLife({ lines: [], stations: [], deckHeight: 12 }, material);
  for (let i = 0; i < 300; i++) { life.actor(`station:${i}`, false); life.actor(`station:${i}`, true); }
  assert.ok(life.figures.size <= 72); assert.equal(stats.activeReferences, life.figures.size);
  trimWalkerGeometryCache(true); assert.equal(stats.activeReferences, life.figures.size);
  life.dispose(); life.dispose(); trimWalkerGeometryCache(true);
  assert.equal(stats.activeReferences, 0); assert.equal(stats.entries, 0); material.dispose();
});

// Exercise the existing four ownership regressions through the actual release runner.
import '../person-geometry-lifetime.test';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rng, type Rng } from '../../src/core/util';
import { walkerGeometryCacheStats as stats, trimWalkerGeometryCache } from '../../src/world/people';
import { Walkers } from '../../src/game/walkers';

test('repeated real pedestrian spawn and all final-removal paths plateau in live plus bounded idle geometry', () => {
  trimWalkerGeometryCache(true);
  const material = new THREE.MeshBasicMaterial();
  const path: any = { edge: 'street', pts: [[40, 0], [80, 0]] };
  const walkers = new Walkers({ walkPaths: [path] } as any, material, 1);
  const createdBefore = stats.created, disposedBefore = stats.disposed;
  try {
    for (let cycle = 0; cycle < 300; cycle++) {
      const colors = rng(9000 + cycle);
      // Placement and clothing selection have independent deterministic sources;
      // every spawn uses this real path while appearances continue to vary.
      const random = (() => .51) as Rng;
      random.int = () => 0;
      random.range = (lo, hi) => (lo + hi) / 2;
      random.pick = items => items[Math.floor(colors() * items.length)];
      random.chance = p => .51 < p;
      walkers.r = random;
      walkers.spawn(0, 0);
      assert.equal(walkers.list.length, 1);
      assert.equal(stats.activeReferences, 1);
      if (cycle % 4 === 0) {
        walkers.update(0, 1e6, 1e6, { x: 1e6, z: 1e6, y: 0, speed: 0, fx: 0, fz: 1 });
      } else if (cycle % 4 === 1) {
        walkers.removePaths([path]); walkers.addPaths([path]);
      } else if (cycle % 4 === 2) {
        // Game.relocate's existing direct-parent removal must release too.
        for (const walker of walkers.list) walkers.group.remove(walker.g);
        walkers.list.length = 0;
      } else {
        // At100.4m this figure exceeds the budget-retirement threshold90m,
        // while staying inside the separate distance-retirement threshold170m.
        walkers.max = 0;
        walkers.update(0, -40, 0, { x: -40, z: 0, y: 0, speed: 0, fx: 0, fz: 1 });
        walkers.max = 1;
      }
      assert.equal(walkers.list.length, 0);
      assert.equal(stats.activeReferences, 0);
      assert.ok(stats.unusedEntries <= stats.maxUnusedEntries);
      assert.ok(stats.unusedBytes <= stats.maxUnusedBytes);
      assert.ok(stats.created - createdBefore - (stats.disposed - disposedBefore) <= stats.maxUnusedEntries);
    }
    assert.ok(stats.disposed > disposedBefore, 'retired appearances release actual geometry under cache pressure');
    trimWalkerGeometryCache(true);
    assert.equal(stats.entries, 0);
    assert.equal(stats.created - createdBefore, stats.disposed - disposedBefore);
  } finally {
    for (const walker of walkers.list) walkers.group.remove(walker.g);
    walkers.list.length = 0;
    trimWalkerGeometryCache(true); material.dispose();
  }
});

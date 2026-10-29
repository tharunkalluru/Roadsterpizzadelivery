import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTemplates } from '../src/core/util';
import { RailTrains } from '../src/game/rail';

function fixtureTracks(): Parameters<RailTrains['update']>[3] {
  return new Map([-480, -240, 0, 240, 480].map(z => [String(z), {
    pts: [[-1500, z], [0, z], [1500, z]] as [number, number][],
    elev: [0, 2, 0],
  }]));
}

function state(rail: RailTrains) {
  return {
    clock: rail.t,
    trains: rail.trains.map(t => ({
      id: t.id, run: t.run, distance: t.s, direction: t.dir, speed: t.v,
      coaches: t.cars.map(c => ({
        livery: Object.keys(rail.geos).find(k => rail.geos[k] === c.geometry),
        position: c.position.toArray(), rotation: c.rotation.toArray(), visible: c.visible,
      })),
    })),
    bodies: rail.bodies,
  };
}

function dispose(rail: RailTrains) {
  for (const geometry of Object.values(rail.geos)) geometry.dispose();
  rail.mat.dispose();
}

test('seeded rail spawn choices and coach poses ignore interleaved presentation randomness', () => {
  initTemplates();
  const globalRandom = Math.random;
  const a = new RailTrains(new THREE.MeshBasicMaterial(), 0x719abc03);
  const b = new RailTrains(new THREE.MeshBasicMaterial(), 0x719abc03);
  const other = new RailTrains(new THREE.MeshBasicMaterial(), 0x719abc04);
  const tracks = fixtureTracks(), seen = new Set<string>();
  let otherSeedDiffers = false, visibleCoaches = 0;
  try {
    // Six minutes of real rail updates, including retirement and later spawns.
    // Player changes force the fixture to exercise more than the initial two trains.
    for (let tick = 0; tick < 2160; tick++) {
      const px = Math.floor(tick / 360) % 2 ? 4500 : 0;
      a.update(1 / 6, px, 0, tracks);
      // A visual system drawing at another presentation rate consumes global RNG.
      for (let i = 0; i < 1 + tick % 13; i++) Math.random();
      b.update(1 / 6, px, 0, tracks);
      other.update(1 / 6, px, 0, tracks);
      const actual = state(a);
      assert.deepEqual(state(b), actual, `rail simulation diverged at tick ${tick}`);
      if (JSON.stringify(state(other)) !== JSON.stringify(actual)) otherSeedDiffers = true;
      for (const train of a.trains) {
        seen.add(train.id);
        visibleCoaches += train.cars.filter(c => c.visible).length;
        assert.ok(train.v >= 12 && train.v < 20);
        assert.ok(train.cars.length >= 8 && train.cars.length <= 13);
      }
    }
    assert.ok(seen.size >= 4, 'fixture must exercise later spawn decisions after retirement');
    assert.ok(visibleCoaches > 100, 'fixture must exercise actual rendered coach positions');
    assert.ok(otherSeedDiffers, 'different simulation seeds must vary train choices');
    assert.equal(Math.random, globalRandom, 'test must never replace global RNG');
  } finally {
    dispose(a); dispose(b); dispose(other);
  }
});

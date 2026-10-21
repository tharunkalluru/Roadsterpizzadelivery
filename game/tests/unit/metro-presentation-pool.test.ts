import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Quality } from '../../src/art/api';
import { makeSamples, polyLength, sampleAt, type PSample } from '../../src/art/geo';
import { createMetroService } from '../../src/art/metroTrains';
import { MetroTimetable } from '../../src/traffic/metroTimetable';

interface Alignment { samples: PSample[]; color: string; stations: number[] }
interface PresentationStats { services: number; active: number; pool: number; created: number }
const trackOffset = 2.1;
// Synthetic full-length lines exercise bends, grades, both directions and distinct
// station timings without changing or copying the frozen mapping package.
const alignments: Alignment[] = [
  { samples: makeSamples([[0, 0], [1800, 0], [3400, 600], [6200, 600]], [12, 12, 14, 14]), color: '#c83132', stations: [1200, 3000, 5100] },
  { samples: makeSamples([[0, 4400], [1900, 4400], [3900, 3300], [7600, 3300]], [10, 10, 13, 13]), color: '#3986bc', stations: [900, 2700, 4600, 6500] },
  { samples: makeSamples([[-2500, -2800], [-2500, -500], [-1300, 1800], [-1300, 4800]], [11, 11, 15, 15]), color: '#418e55', stations: [1500, 3600, 5900] },
];

/** Eager pose oracle: deliberately contains no pooling, acquisition or release. */
function eagerReference(lines: Alignment[], quality: Quality) {
  const root = new THREE.Group();
  const descriptors = lines.flatMap(line => {
    const length = polyLength(line.samples);
    if (length < 120) return [];
    return [1, -1].flatMap(direction => {
      const timetable = new MetroTimetable(length, line.stations.map(s => direction === 1 ? s : length - s));
      const count = Math.max(1, Math.ceil((timetable.duration + 24) / 150));
      return Array.from({ length: count }, (_, index) => {
        const rig = new THREE.Group();
        rig.name = `metro-${direction === 1 ? 'outbound' : 'inbound'}-${index}`;
        const coaches = Array.from({ length: 3 }, (_, coachIndex) => {
          const coach = new THREE.Group(); coach.name = `coach-${coachIndex + 1}`;
          // Four rigid components and two independently sliding door leaves.
          for (let component = 0; component < 6; component++) coach.add(new THREE.Object3D());
          rig.add(coach); return coach;
        });
        root.add(rig);
        return { line, timetable, direction, offset: index * 150 + (direction === 1 ? 0 : 75), rig, coaches };
      });
    });
  });
  return {
    root, descriptors,
    update(time: number, target: THREE.Vector3) {
      let sound = 0;
      for (const d of descriptors) {
        const cycle = Math.ceil((d.timetable.duration + 24) / 150) * 150;
        const elapsed = ((time + d.offset) % cycle + cycle) % cycle;
        d.rig.visible = false;
        if (elapsed > d.timetable.duration) continue;
        const run = d.timetable.sample(elapsed);
        const along = d.direction === 1 ? run.distance : d.timetable.length - run.distance;
        const center = sampleAt(d.line.samples, along);
        const distance = Math.hypot(center.x - target.x, center.z - target.z, center.y - target.y);
        const falloff = Math.max(0, 1 - distance / 180);
        sound = Math.max(sound, falloff * falloff * (run.dwelling ? .08 : Math.min(1, run.speed / 18)));
        if (Math.hypot(center.x - target.x, center.z - target.z) >= (quality === 'low' ? 700 : 1400)) continue;
        d.rig.visible = true;
        const doorTravel = (run.dwelling ? Math.min(1, run.dwellProgress * 8, (1 - run.dwellProgress) * 8) : 0) * .66;
        d.coaches.forEach((coach, i) => {
          const position = along - d.direction * (i - 1) * 20.1;
          coach.visible = position > 10 && position < d.timetable.length - 10;
          const p = sampleAt(d.line.samples, Math.max(0, Math.min(d.timetable.length, position)));
          coach.position.set(p.x - p.tz * d.direction * trackOffset, p.y + .25, p.z + p.tx * d.direction * trackOffset);
          coach.rotation.y = Math.atan2(-p.tx * d.direction, -p.tz * d.direction);
          coach.children[4].position.z = -doorTravel;
          coach.children[5].position.z = doorTravel;
        });
      }
      root.updateMatrixWorld(true);
      return sound;
    },
  };
}

function stats(root: THREE.Group): PresentationStats {
  const value = root.userData.trainStats;
  return { services: value.services, active: value.active, pool: value.pooled, created: value.created };
}

function visibleRigs(root: THREE.Group) {
  return root.children.filter(rig => rig.visible).slice().sort((a, b) =>
    a.name.localeCompare(b.name) || a.children[1].position.x - b.children[1].position.x || a.children[1].position.z - b.children[1].position.z);
}

function expectSamePresentation(actual: THREE.Group, expected: ReturnType<typeof eagerReference>, time: number, target: THREE.Vector3) {
  const sound = expected.update(time, target);
  actual.userData.update(time, target);
  actual.updateMatrixWorld(true);
  expect(actual.userData.nearbySound).toBe(sound);
  const a = visibleRigs(actual), e = visibleRigs(expected.root);
  expect(a).toHaveLength(e.length);
  // A detached rig must never remain in the render tree, even when hidden.
  expect(actual.children).toHaveLength(e.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i].name).toBe(e[i].name);
    expect(a[i].children).toHaveLength(3);
    for (let coach = 0; coach < 3; coach++) {
      const ac = a[i].children[coach], ec = e[i].children[coach];
      expect(ac.name).toBe(ec.name);
      expect(ac.visible).toBe(ec.visible);
      expect(ac.matrixWorld.elements).toEqual(ec.matrixWorld.elements);
      expect(ac.children).toHaveLength(6);
      for (let part = 0; part < 6; part++) {
        expect(ac.children[part].matrixWorld.elements).toEqual(ec.children[part].matrixWorld.elements);
      }
    }
  }
  expect(stats(actual).active).toBe(e.length);
  expect(stats(actual).pool).toBeLessThanOrEqual(4);
  expect(stats(actual).active + stats(actual).pool).toBeLessThanOrEqual(e.length + 4);
}

function geometryHash(geometry: THREE.BufferGeometry) {
  const hash = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name] as THREE.BufferAttribute;
    hash.update(name);
    hash.update(`${attribute.itemSize}|${attribute.normalized}|${attribute.array.constructor.name}`);
    hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  if (geometry.index) {
    hash.update('index'); hash.update(geometry.index.array.constructor.name);
    hash.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
  }
  return hash.digest('hex');
}

// Captured by read-only inspection of the eager v2 builder before pooling changes.
// Includes every attribute's bytes, type, item size, normalization and index data.
const geometryHashes = [
  'eee5a115faeddc6a8ea812b26c79ce716e486e01df3bd7b69b5a55c81f69a1ee',
  '86091f89c680fb61434ef93afd7d1249d193dd83debb94a8f5c5b61358aa210f',
  'd65421c23f37f93e9ea466cb0405ff492e9d3e9fab0bb71f364c47224924cc7a',
  'cc2935b28123bad0ae88af808ae3a27f5fe61fb125c057b3a747e72cccb01c7c',
  '44dbf31c8829e8d07d7a22fa11421c0cedbd7eb1803af4d235aa949f8a4414e3',
  'a0e45a9f5bc0790e987863e60b4020227ff087bafe09b0226f7c882166d35c43',
];

describe('bounded metro presentation pool', () => {
  it('keeps the full timetable without allocating distant train hierarchies up front', () => {
    const lines = [...alignments, { samples: makeSamples([[0, 0], [119, 0]], 12), color: '#fff', stations: [] }];
    const root = createMetroService(lines, 'low', trackOffset);
    const reference = eagerReference(lines, 'low');
    expect(reference.descriptors.length).toBeGreaterThan(20);
    expect(root.children).toHaveLength(0);
    expect(stats(root)).toMatchObject({ services: reference.descriptors.length, active: 0, pool: 0, created: 0 });
    expectSamePresentation(root, reference, 0, new THREE.Vector3(1e6, 0, 1e6));
    expect(stats(root).created).toBe(0);
    root.userData.dispose();
  });

  it.each<Quality>(['low', 'standard', 'high'])('preserves every visible coach, door and sound across time/target jumps on %s', quality => {
    const root = createMetroService(alignments, quality, trackOffset);
    const reference = eagerReference(alignments, quality);
    const arrival = 1200 / 18 + 18 / .85;
    const first = reference.descriptors[0];
    const cycle = Math.ceil((first.timetable.duration + 24) / 150) * 150;
    const times = [0, .001, arrival - 1e-6, arrival, arrival + 2.5, arrival + 10, arrival + 17.5, arrival + 20 - 1e-6, arrival + 20, 149.999, 150, 151, first.timetable.duration, first.timetable.duration + .001, cycle - .001, cycle, cycle + .001, 901.25, -25, 4000.5, 40];
    for (const [index, time] of times.entries()) {
      const line = alignments[index % alignments.length];
      const d = reference.descriptors.find(d => d.line === line && d.direction === 1)!;
      const elapsed = ((time % cycle) + cycle) % cycle;
      const center = sampleAt(line.samples, d.timetable.sample(elapsed).distance);
      expectSamePresentation(root, reference, time, new THREE.Vector3(center.x, center.y, center.z));
      if (index % 3 === 0) expectSamePresentation(root, reference, time, new THREE.Vector3(1e6, 100, -1e6));
    }
    // Explicitly revisit the first stop through its full opening/closing interval.
    for (const offset of [0, 2.5, 10, 17.5, 20]) {
      expectSamePresentation(root, reference, arrival + offset, new THREE.Vector3(1200, 12, 0));
    }
    root.userData.dispose();
  });

  it.each<Quality>(['low', 'standard', 'high'])('retains the exact strict planar visibility boundary on %s', quality => {
    const line = { samples: makeSamples([[0, 0], [6000, 0]], 12), color: '#fff', stations: [1200, 3000, 5100] };
    const root = createMetroService([line], quality, trackOffset);
    const reference = eagerReference([line], quality);
    const limit = quality === 'low' ? 700 : 1400;
    for (const [distance, visible] of [[limit - 1e-7, true], [limit, false], [limit + 1e-7, false], [limit - 1e-7, true]] as const) {
      expectSamePresentation(root, reference, 0, new THREE.Vector3(0, 1000, distance));
      expect(root.children.some(rig => rig.name === 'metro-outbound-0')).toBe(visible);
    }
    expectSamePresentation(root, reference, 0, new THREE.Vector3(0, 1012, 0));
    expect(root.children.some(rig => rig.name === 'metro-outbound-0')).toBe(true);
    expect(root.userData.nearbySound).toBe(0);
    root.userData.dispose();
  });

  it('reuses detached rigs without leaking open doors, endpoint coach visibility or a former service name', () => {
    const root = createMetroService(alignments, 'low', trackOffset);
    const reference = eagerReference(alignments, 'low');
    const dwellTime = 1200 / 18 + 18 / .85 + 10;
    expectSamePresentation(root, reference, dwellTime, new THREE.Vector3(1200, 12, 0));
    const oldRigs = new Set(root.children);
    const dwelling = root.children.find(rig => rig.name === 'metro-outbound-0')!;
    expect(dwelling.children[1].children[4].position.z).toBe(-.66);
    expectSamePresentation(root, reference, dwellTime, new THREE.Vector3(1e6, 0, 1e6));
    expect(stats(root).pool).toBeGreaterThan(0);
    expectSamePresentation(root, reference, 0, new THREE.Vector3(0, 12, 0));
    expect(root.children.some(rig => oldRigs.has(rig))).toBe(true);
    const restarted = root.children.find(rig => rig.name === 'metro-outbound-0')!;
    expect(restarted.children.map(coach => coach.visible)).toEqual([true, false, false]);
    for (const coach of restarted.children) expect(coach.children.slice(4).map(door => door.position.z)).toEqual([-0, 0]);
    // Many distant moves cannot accumulate a rig for every scheduled service.
    for (let i = 0; i < 30; i++) {
      const line = alignments[i % 3];
      const sample = sampleAt(line.samples, (i * 977) % polyLength(line.samples));
      expectSamePresentation(root, reference, i * 83.5, new THREE.Vector3(sample.x, sample.y, sample.z));
    }
    root.userData.dispose();
  });

  it.each<Quality>(['low', 'standard', 'high'])('shares unchanged geometry/materials and disposes active and pooled resources once on %s', quality => {
    const root = createMetroService(alignments, quality, trackOffset);
    root.userData.update(30, new THREE.Vector3(400, 12, 0));
    expect(root.children.length).toBeGreaterThan(0);
    const firstCoach = root.children[0].children[0];
    const geometries = firstCoach.children.map(part => (part as THREE.Mesh).geometry);
    expect(geometries.map(geometryHash)).toEqual(geometryHashes);
    const materials = new Set<THREE.Material>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(geometries).toContain(object.geometry);
      expect(object.castShadow).toBe(quality === 'high');
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    expect(new Set(geometries).size).toBe(6);
    expect(materials.size).toBe(4);
    const disposed = [...geometries, ...materials].map(resource => {
      const onDispose = vi.fn(); resource.addEventListener('dispose', onDispose); return onDispose;
    });
    root.userData.update(30, new THREE.Vector3(1e6, 0, 1e6));
    expect(stats(root).pool).toBeGreaterThan(0);
    root.userData.dispose(); root.userData.dispose();
    expect(root.children).toHaveLength(0);
    expect(stats(root)).toMatchObject({ active: 0, pool: 0 });
    for (const onDispose of disposed) expect(onDispose).toHaveBeenCalledTimes(1);
    root.userData.update(30, new THREE.Vector3(400, 12, 0));
    expect(root.children).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { ReadableSign } from '../../src/art/api';
import type { Building, Vec2 } from '../../src/world/schema';
import { labelOccludedByBuilding } from '../../src/ui/worldLabels';

const rectangle = (left: number, right: number, near: number, far: number): Vec2[] => [
  [left, far], [right, far], [right, near], [left, near],
];

function building(overrides: Partial<Building> = {}): Building {
  return {
    id: 'foreground', osmId: 'way/test', footprint: rectangle(-4, 4, -10, -20),
    heightM: 8, heightStatus: 'provisional', levels: null, name: null,
    kind: 'commercial', frontRoadId: null, frontSide: null, centroid: [0, -15],
    ...overrides,
  };
}

function sign(overrides: Partial<ReadableSign> = {}): ReadableSign {
  return {
    id: 'existing-sign', text: 'Existing source name', x: 0, y: 3, z: -30,
    nx: 0, nz: 1, buildingId: 'target', kind: 'sign', provisional: true,
    ...overrides,
  };
}

const camera = { x: 0, y: 3, z: 0 };

describe('world-label building occlusion', () => {
  it('hides a sign behind a thin foreground building between spatial sample points', () => {
    // A 30 m sight line sampled at ninths never lands inside this 8 cm strip.
    const thin = building({ footprint: rectangle(-2, 2, -13, -13.08), centroid: [0, -13.04] });
    expect(labelOccludedByBuilding(sign(), camera, thin)).toBe(true);
  });

  it('leaves buildings beside the sight line or beyond the sign unobstructing', () => {
    expect(labelOccludedByBuilding(sign(), camera, building({ footprint: rectangle(3, 5, -10, -20) }))).toBe(false);
    expect(labelOccludedByBuilding(sign(), camera, building({ footprint: rectangle(-4, 4, -35, -45) }))).toBe(false);
  });

  it('respects both the lower clearance and the roof of raised building bodies', () => {
    const raised = building({ baseHeightM: 10, heightM: 20 });
    expect(labelOccludedByBuilding(sign({ y: 3 }), camera, raised)).toBe(false);
    expect(labelOccludedByBuilding(sign({ y: 25 }), { ...camera, y: 25 }, raised)).toBe(false);
    expect(labelOccludedByBuilding(sign({ y: 15 }), { ...camera, y: 15 }, raised)).toBe(true);
  });

  it('finds occlusion when a descending sight line enters the body near its far edge', () => {
    // At z=-10 the ray is above the 8 m roof; before z=-20 it passes below it.
    expect(labelOccludedByBuilding(sign({ y: 2 }), { ...camera, y: 18 }, building())).toBe(true);
  });

  it('does not exempt a far-side sign from its own building body', () => {
    const own = building({ id: 'target' });
    expect(labelOccludedByBuilding(sign({ z: -20.04 }), camera, own)).toBe(true);
  });

  it('keeps a front-face board outside its own building visible', () => {
    const own = building({ id: 'target' });
    expect(labelOccludedByBuilding(sign({ z: -9.96 }), camera, own)).toBe(false);
  });

  it('leaves a sight line wholly inside an open courtyard hole unobstructed', () => {
    const courtyard = building({
      footprint: rectangle(-6, 6, -2, -20),
      holes: [rectangle(-2, 2, -4, -18)],
    });
    expect(labelOccludedByBuilding(sign({ z: -16 }), { x: 0, y: 3, z: -6 }, courtyard)).toBe(false);
  });

  it('still hides a courtyard sign when the sight line crosses the outer wall', () => {
    const courtyard = building({
      footprint: rectangle(-6, 6, -2, -20),
      holes: [rectangle(-2, 2, -4, -18)],
    });
    expect(labelOccludedByBuilding(sign({ z: -10 }), camera, courtyard)).toBe(true);
  });

  it('does not alter source labels, evidence status, footprints, or holes', () => {
    const source = sign(), body = building({ holes: [rectangle(-1, 1, -12, -18)] });
    const before = JSON.stringify({ source, body });
    labelOccludedByBuilding(source, camera, body);
    expect(JSON.stringify({ source, body })).toBe(before);
  });
});

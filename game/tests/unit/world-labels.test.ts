import { describe, expect, it } from 'vitest';
import type { ReadableSign } from '../../src/art/api';
import type { Building, Vec2 } from '../../src/world/schema';
import { LabelInspectionGate, labelOccludedByBuilding, measureLabelLayout } from '../../src/ui/worldLabels';

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

describe('full-name inspection layout', () => {
  const measure = (text: string) => text.length * 6;

  it('fits the complete Kallada name on two phone lines', () => {
    const layout = measureLabelLayout('Kallada Tours Travels & Logistics', 180, measure);
    expect(layout).toEqual({ width: 180, height: 44, lines: 2 });
  });

  it('keeps short names compact and includes all wrapped lines in placement height', () => {
    expect(measureLabelLayout('R MOBILES', 180, measure)).toEqual({ width: 74, height: 28, lines: 1 });
    expect(measureLabelLayout('A source building name with several separate words', 180, measure)).toEqual({ width: 180, height: 60, lines: 3 });
  });

  it('suppresses names beyond the safe three-line budget instead of truncating them', () => {
    expect(measureLabelLayout('A source building name with several separate words and a very long additional source name', 180, measure)).toBeNull();
    expect(measureLabelLayout('A'.repeat(53), 180, measure)).toEqual({ width: 180, height: 60, lines: 3 });
    expect(measureLabelLayout('A'.repeat(79), 180, measure)).toBeNull();
  });
});

describe('stationary sign inspection', () => {
  const held = { speedMps: 0, airborne: false, inspecting: true };
  const released = { ...held, inspecting: false };

  it('shows no automatic labels or delayed labels from a short tap', () => {
    const gate = new LabelInspectionGate();
    expect(gate.update(true, released, 0)).toBe(false);
    expect(gate.update(true, held, 100)).toBe(false);
    expect(gate.update(true, released, 150)).toBe(false);
    expect(gate.update(true, released, 600)).toBe(false);
  });

  it('requires a held glance, then allows a short reading interval after release', () => {
    const gate = new LabelInspectionGate();
    expect(gate.update(true, held, 0)).toBe(false);
    expect(gate.update(true, held, 349)).toBe(false);
    expect(gate.update(true, held, 350)).toBe(true);
    expect(gate.update(true, released, 1850)).toBe(true);
    expect(gate.update(true, released, 1851)).toBe(false);
    expect(gate.update(true, held, 2000)).toBe(false);
  });

  it('does not combine separate short taps into a held inspection', () => {
    const gate = new LabelInspectionGate();
    expect(gate.update(true, held, 100)).toBe(false);
    expect(gate.update(true, released, 150)).toBe(false);
    expect(gate.update(true, held, 600)).toBe(false);
    expect(gate.update(true, released, 650)).toBe(false);
    expect(gate.update(true, held, 1000)).toBe(false);
    expect(gate.update(true, held, 1350)).toBe(true);
  });

  it.each([
    { ...held, speedMps: .16 },
    { ...held, speedMps: -.16 },
    { ...held, airborne: true },
    { ...held, speedMps: NaN },
  ])('immediately clears an inspection when driving or airborne: %j', context => {
    const gate = new LabelInspectionGate();
    gate.update(true, held, 0);
    expect(gate.update(true, held, 350)).toBe(true);
    expect(gate.update(true, context, 351)).toBe(false);
    expect(gate.update(true, released, 400)).toBe(false);
    expect(gate.update(true, held, 450)).toBe(false);
  });

  it('does not carry an inspection across a hidden or reset view', () => {
    const gate = new LabelInspectionGate();
    gate.update(true, held, 0); gate.update(true, held, 350);
    expect(gate.update(false, held, 351)).toBe(false);
    expect(gate.update(true, released, 352)).toBe(false);
    gate.update(true, held, 400); gate.update(true, held, 750);
    gate.reset();
    expect(gate.update(true, released, 751)).toBe(false);
  });
});

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

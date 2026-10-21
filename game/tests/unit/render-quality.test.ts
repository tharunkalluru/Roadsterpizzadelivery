import { describe, expect, it } from 'vitest';
import { AdaptiveResolution, automaticQuality, pixelRatioFor } from '../../src/app/renderQuality';

describe('bounded rendering quality', () => {
  it('keeps touch and constrained hardware conservative without identifying a device', () => {
    expect(automaticQuality(true, 8, 8)).toBe('low');
    expect(automaticQuality(false, 4, 8)).toBe('low');
    expect(automaticQuality(false, undefined, 4)).toBe('low');
    expect(automaticQuality(false, 8, 8)).toBe('standard');
  });
  it('caps large render targets and never supersamples a low-DPR screen', () => {
    for (const [quality, budget] of [['low', 800000], ['standard', 1500000], ['high', 2500000]] as const) {
      const dpr = pixelRatioFor(quality, 3, 2560, 1440);
      expect(2560 * 1440 * dpr * dpr).toBeLessThanOrEqual(budget + 1);
    }
    expect(pixelRatioFor('high', 1, 800, 600)).toBe(1);
    expect(pixelRatioFor('low', 3, 844, 390)).toBe(1);
  });
  it('waits for sustained pressure, stays bounded, and recovers more slowly', () => {
    const controller = new AdaptiveResolution();
    for (let i = 0; i < 59; i++) controller.sample(34);
    expect(controller.scale).toBe(1);
    for (let i = 0; i < 61; i++) controller.sample(34);
    expect(controller.scale).toBe(.9);
    for (let i = 0; i < 1000; i++) controller.sample(34);
    expect(controller.scale).toBe(.65);
    // Allow the partly accumulated slow window to flush, then ten healthy seconds.
    for (let i = 0; i < 800; i++) controller.sample(16);
    expect(controller.scale).toBe(.7);
  });
  it('ignores single loading or background-tab stalls', () => {
    const controller = new AdaptiveResolution();
    for (let i = 0; i < 100; i++) { controller.sample(16); controller.sample(1000); }
    expect(controller.scale).toBe(1);
  });
});

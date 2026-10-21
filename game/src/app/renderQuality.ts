import type { Quality } from '../art/api';

/** Conservative capability hints, never a user-agent/device-name guess. */
export function automaticQuality(coarsePointer: boolean, memoryGB?: number, cores?: number): Quality {
  return coarsePointer || (memoryGB !== undefined && memoryGB <= 4) || (cores !== undefined && cores <= 4) ? 'low' : 'standard';
}

/** Bound render-target RAM as well as device pixel ratio on large / Retina displays. */
export function pixelRatioFor(quality: Quality, deviceRatio: number, width: number, height: number): number {
  const cap = quality === 'high' ? 1.75 : quality === 'standard' ? 1.5 : 1;
  const pixels = quality === 'high' ? 2_500_000 : quality === 'standard' ? 1_500_000 : 800_000;
  return Math.min(deviceRatio > 0 ? deviceRatio : 1, cap, Math.sqrt(pixels / Math.max(1, width * height)));
}

/** Allocation-free, slow hysteresis. It changes pixels only, never the simulation or world. */
export class AdaptiveResolution {
  scale = 1;
  private elapsed = 0;
  private samples = 0;
  private slowWindows = 0;
  private fastWindows = 0;

  resetWindow() { this.elapsed = 0; this.samples = 0; this.slowWindows = 0; this.fastWindows = 0; }

  sample(frameMs: number): boolean {
    // Visibility / load stalls are not sustained GPU pressure.
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 150) { this.resetWindow(); return false; }
    this.elapsed += frameMs;
    this.samples++;
    if (this.elapsed < 2000) return false;
    const mean = this.elapsed / this.samples;
    this.elapsed = 0; this.samples = 0;
    this.slowWindows = mean > 25 ? this.slowWindows + 1 : 0;
    this.fastWindows = mean < 18 ? this.fastWindows + 1 : 0;
    if (this.slowWindows >= 2 && this.scale > .65) {
      this.scale = Math.max(.65, Math.round((this.scale - .1) * 100) / 100);
      this.resetWindow(); return true;
    }
    if (this.fastWindows >= 5 && this.scale < 1) {
      this.scale = Math.min(1, Math.round((this.scale + .05) * 100) / 100);
      this.resetWindow(); return true;
    }
    return false;
  }
}

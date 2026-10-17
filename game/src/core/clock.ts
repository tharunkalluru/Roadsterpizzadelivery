import { SIM_HZ } from '../config/gameplay';

export const TICK_SECONDS = 1 / SIM_HZ;

/**
 * Fixed-step accumulator (MASTER §10). Render frame rate never changes simulation
 * time: the caller feeds wall dt, receives an integer number of ticks to run, and an
 * interpolation alpha. A severe stall beyond maxCatchUpTicks yields a technical
 * pause request instead of silently discarding or bulk-simulating the gap.
 */
export class FixedClock {
  private accumulator = 0;
  constructor(public maxCatchUpTicks = 30, public stallThresholdSeconds = 0.5) {} // 30 ticks = 0.5 s: every gap below the stall threshold is simulated, none silently dropped

  reset(): void { this.accumulator = 0; }

  advance(wallDtSeconds: number): { ticks: number; alpha: number; stalled: boolean } {
    if (!(wallDtSeconds >= 0)) wallDtSeconds = 0;
    if (wallDtSeconds > this.stallThresholdSeconds) {
      this.accumulator = 0;
      return { ticks: 0, alpha: 0, stalled: true };
    }
    this.accumulator += wallDtSeconds;
    let ticks = Math.floor(this.accumulator / TICK_SECONDS + 1e-9);
    if (ticks > this.maxCatchUpTicks) {
      ticks = this.maxCatchUpTicks;
      this.accumulator = 0; // bounded catch-up; remaining gap is a (short) dropped interval below stall threshold
    } else {
      this.accumulator -= ticks * TICK_SECONDS;
      if (this.accumulator < 0) this.accumulator = 0;
    }
    return { ticks, alpha: this.accumulator / TICK_SECONDS, stalled: false };
  }
}

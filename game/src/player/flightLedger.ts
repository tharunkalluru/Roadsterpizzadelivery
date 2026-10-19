import { flightTicksFor, SIM_HZ } from '../config/gameplay';

/** Cumulative boost accounting. Driving earns charge; capacity is never exceeded. */
export class FlightLedger {
  readonly initialTicks: number;
  readonly initialChargeTicks: number;
  private consumed = 0;
  private earned = 0;
  private rechargeFraction = 0;
  launches = 0;
  transaction = 0;

  /** Full charge is the low-level default; contracts explicitly start with a 2.5 s charge. */
  constructor(public readonly allocationSeconds: number, consumedTicks = 0, initialChargeSeconds = allocationSeconds) {
    this.initialTicks = flightTicksFor(allocationSeconds);
    this.initialChargeTicks = Math.round(initialChargeSeconds * SIM_HZ);
    if (!Number.isInteger(consumedTicks) || consumedTicks < 0 || consumedTicks > this.initialChargeTicks || this.initialChargeTicks < 0 || this.initialChargeTicks > this.initialTicks) throw new Error('invalid consumed ticks or initial charge');
    this.consumed = consumedTicks;
  }

  get consumedTicks(): number { return this.consumed; }
  get earnedTicks(): number { return this.earned; }
  get remainingTicks(): number { return this.initialChargeTicks + this.earned - this.consumed; }
  get remainingSeconds(): number { return this.remainingTicks / SIM_HZ; }
  get consumedSeconds(): number { return this.consumed / SIM_HZ; }
  get rechargeProgress(): number { return this.rechargeFraction; }

  spendTick(): boolean {
    if (this.remainingTicks <= 0) return false;
    this.consumed++;
    return true;
  }

  /** Called only by the grounded controller after a qualifying tick. No collision/refund path. */
  earnRoadTick(rate = 0.25): number {
    if (this.remainingTicks >= this.initialTicks) { this.rechargeFraction = 0; return 0; }
    this.rechargeFraction += rate;
    const amount = Math.min(Math.floor(this.rechargeFraction), this.initialTicks - this.remainingTicks);
    this.earned += amount;
    this.rechargeFraction -= amount;
    if (this.remainingTicks === this.initialTicks) this.rechargeFraction = 0;
    return amount;
  }

  beginTransaction(): number { this.launches++; return ++this.transaction; }

  snapshot() { return { allocationSeconds: this.allocationSeconds, initialChargeTicks: this.initialChargeTicks, consumed: this.consumed, earned: this.earned, rechargeFraction: this.rechargeFraction, launches: this.launches, transaction: this.transaction }; }

  static restore(s: ReturnType<FlightLedger['snapshot']>): FlightLedger {
    const cap = flightTicksFor(s.allocationSeconds);
    const initial = s.initialChargeTicks ?? cap, earned = s.earned ?? 0, fraction = s.rechargeFraction ?? 0;
    if (![initial, earned, s.consumed, s.launches, s.transaction].every((v) => Number.isInteger(v) && v >= 0) || initial > cap || initial + earned - s.consumed < 0 || initial + earned - s.consumed > cap || !Number.isFinite(fraction) || fraction < 0 || fraction >= 1) throw new Error('invalid flight ledger');
    const l = new FlightLedger(s.allocationSeconds, 0, initial / SIM_HZ);
    l.consumed = s.consumed; l.earned = earned; l.rechargeFraction = fraction;
    l.launches = s.launches; l.transaction = s.transaction;
    return l;
  }
}

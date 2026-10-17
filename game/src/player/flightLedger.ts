import { flightTicksFor, SIM_HZ } from '../config/gameplay';

/**
 * The single authoritative flight-resource counter for one delivery contract
 * (MASTER §12.1, config/flight-budget.json).
 *
 *   remainingFlightTicks = initialFlightTicks - consumedFlightTicks
 *
 * There is deliberately no API to add, refund or reset ticks: a new allocation
 * requires a new ledger (new contract or full retry).
 */
export class FlightLedger {
  readonly initialTicks: number;
  private consumed = 0;
  launches = 0;
  /** transaction id of the current/last flight; increments per accepted launch */
  transaction = 0;

  constructor(public readonly allocationSeconds: number, consumedTicks = 0) {
    this.initialTicks = flightTicksFor(allocationSeconds);
    if (!Number.isInteger(consumedTicks) || consumedTicks < 0 || consumedTicks > this.initialTicks) throw new Error('invalid consumed ticks');
    this.consumed = consumedTicks;
  }

  get consumedTicks(): number { return this.consumed; }
  get remainingTicks(): number { return this.initialTicks - this.consumed; }
  get remainingSeconds(): number { return this.remainingTicks / SIM_HZ; }
  get consumedSeconds(): number { return this.consumed / SIM_HZ; }

  /** spend exactly one tick; returns false (and spends nothing) if already exhausted */
  spendTick(): boolean {
    if (this.consumed >= this.initialTicks) return false;
    this.consumed += 1;
    return true;
  }

  beginTransaction(): number {
    this.launches += 1;
    this.transaction += 1;
    return this.transaction;
  }

  snapshot() { return { allocationSeconds: this.allocationSeconds, consumed: this.consumed, launches: this.launches, transaction: this.transaction }; }

  static restore(s: ReturnType<FlightLedger['snapshot']>): FlightLedger {
    const l = new FlightLedger(s.allocationSeconds, s.consumed);
    l.launches = s.launches;
    l.transaction = s.transaction;
    return l;
  }
}

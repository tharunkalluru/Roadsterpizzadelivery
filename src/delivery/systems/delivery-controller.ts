import { EventBus, type DeliveryEvents } from '../core/events';
import type { DeliveryState, LevelConfig, StorageLike } from '../core/types';
import { ProgressSystem } from './progress-system';
import { OrderSystem } from './order-system';
import { CallSystem } from './call-system';
import { RevealSystem } from './reveal-system';

/** Owns story gates only. Driving, camera and world simulation keep their original timing. */
export class DeliveryController {
  state: DeliveryState = 'ROAMING';
  readonly progress: ProgressSystem;
  readonly orders: OrderSystem;
  readonly calls: CallSystem;
  readonly reveals: RevealSystem;
  lastFailure = '';
  private lastDistance = Infinity;
  private returnAfterCall: DeliveryState = 'EN_ROUTE';
  private off: (() => void)[] = [];

  constructor(readonly levels: readonly LevelConfig[], readonly events: EventBus<DeliveryEvents>, storage?: StorageLike) {
    this.progress = new ProgressSystem(levels, storage);
    this.orders = new OrderSystem(this.progress);
    this.calls = new CallSystem(events);
    this.reveals = new RevealSystem(events, this.progress);
    this.off.push(events.on('callStarted', () => {
      this.returnAfterCall = this.state; this.setState('CALL');
    }), events.on('callEnded', event => {
      if (!this.activeLevel) return;
      if (event.kind === 'arrival' && event.completed) {
        this.setState('SETPIECE');
        this.events.emit('setpieceStarted', { level: this.activeLevel });
      } else if (event.kind === 'bonus') this.setState('LEVEL_COMPLETE');
      else this.setState(this.returnAfterCall === 'ARRIVED' ? 'ARRIVED' : 'EN_ROUTE');
    }));
  }
  get activeLevel() { return this.orders.level; }
  get destination() { return this.orders.destination; }
  get canPickup() { return this.state === 'ROAMING' && !this.progress.finished && !this.activeLevel; }
  get canDrop() { return this.state === 'SETPIECE' && this.calls.arrivalComplete; }
  get complete() { return this.state === 'LEVEL_COMPLETE'; }

  pickup() {
    if (!this.canPickup) return false;
    const level = this.orders.assign(); if (!level) return false;
    this.reveals.clear(); this.lastFailure = ''; this.lastDistance = Infinity;
    this.calls.prepare(level, () => this.reveals.reveal(level));
    this.setState('EN_ROUTE');
    this.events.emit('locationSet', { levelId: level.id, destination: { ...level.destination } });
    return true;
  }
  /** Pass active gameplay seconds only; paused/background/map time must not make calls expire. */
  update(dt: number, distance: number) {
    if (!this.activeLevel) return;
    this.lastDistance = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
    if (this.state === 'CALL') { this.calls.update(dt, this.lastDistance); return; }
    if (!['EN_ROUTE', 'ARRIVED'].includes(this.state)) return;
    const near = this.lastDistance <= (this.activeLevel.arrivalRadius ?? 100);
    if (near && this.state === 'EN_ROUTE') {
      this.setState('ARRIVED'); this.events.emit('arrived', { levelId: this.activeLevel.id });
    } else if (!near && this.state === 'ARRIVED') this.setState('EN_ROUTE');
    this.calls.update(dt, this.lastDistance);
  }
  call() { return ['EN_ROUTE', 'ARRIVED'].includes(this.state) && this.calls.answer(); }
  advanceCall(replyIndex?: number) { return this.state === 'CALL' && this.calls.advance(replyIndex); }
  endCall() { return this.state === 'CALL' && this.calls.end(); }
  bonusCall() {
    const level = this.activeLevel;
    return this.state === 'LEVEL_COMPLETE' && !!level && this.calls.bonus(level, () => this.reveals.reveal(level));
  }
  setpieceDone() {
    const level = this.activeLevel;
    if (!level || !this.canDrop) return false;
    // Lock before emitting: duplicate module callbacks cannot double-complete a level.
    this.setState('REVEAL');
    this.events.emit('setpieceDone', { levelId: level.id });
    this.reveals.reveal(level);
    this.progress.complete(level.id);
    this.setState('LEVEL_COMPLETE');
    this.events.emit('levelComplete', { levelId: level.id, level: level.level, total: this.progress.total,
      restaurantStage: this.progress.restaurantStage, finished: this.progress.finished });
    return true;
  }
  setpieceFailed(reason?: string) {
    if (!this.activeLevel || !this.canDrop) return false;
    this.lastFailure = reason || this.activeLevel.failureLine || 'Try again. Your delivery is safe.';
    this.events.emit('setpieceFailed', { levelId: this.activeLevel.id, reason: this.lastFailure });
    return true;
  }
  continueAfterCompletion() {
    if (this.state !== 'LEVEL_COMPLETE') return false;
    this.clearActive(); return true;
  }
  /** Restart the current delivery without erasing any completed levels or restaurant progress. */
  retry() { this.clearActive(); }
  /** Explicit new-story action only; never touches the baseline game's storage. */
  reset() { this.progress.reset(); this.clearActive(); }
  dispose() { for (const off of this.off) off(); this.off = []; this.calls.reset(); }
  private clearActive() {
    this.calls.reset(); this.orders.clear(); this.reveals.clear(); this.lastFailure = ''; this.lastDistance = Infinity;
    this.setState('ROAMING');
  }
  private setState(state: DeliveryState) {
    if (this.state === state) return;
    const previous = this.state; this.state = state;
    this.events.emit('stateChanged', { state, previous });
  }
}

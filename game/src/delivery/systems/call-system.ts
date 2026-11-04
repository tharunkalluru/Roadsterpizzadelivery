import type { CallButtonState, CallKind, LevelConfig, ScriptLine } from '../core/types';
import type { EventBus, DeliveryEvents } from '../core/events';

const RING_SECONDS = 8, REPEAT_SECONDS = 5, NAG_DELAY = 8;

/** Fixed scripts; the caller never requires a network, generated dialogue or timed reading. */
export class CallSystem {
  buttonState: CallButtonState = 'hidden';
  active = false;
  kind: CallKind = 'arrival';
  lineIndex = 0;
  elapsed = 0;
  arrivalComplete = false;
  private level: LevelConfig | null = null;
  private script: ScriptLine[] = [];
  private journeyTime = 0;
  private ringTime = 0;
  private repeatTime = 0;
  private near = false;
  private nagFinished = false;
  private onReveal?: () => void;

  constructor(private events: EventBus<DeliveryEvents>) {}
  get ringing() { return this.buttonState === 'ringing'; }
  get currentLine(): ScriptLine | null { return this.active ? this.script[this.lineIndex] ?? null : null; }
  get lineCount() { return this.script.length; }
  get isLastLine() { return this.active && this.lineIndex === this.script.length - 1; }

  prepare(level: LevelConfig, reveal: () => void) {
    this.reset(); if(level.callMode==='NONE')return;
    this.level = level; this.onReveal = reveal; this.buttonState = 'disabled';
  }
  update(dt: number, distance: number) {
    if (!this.level) return;
    dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.active) { this.elapsed += dt; return; }
    if (this.arrivalComplete) return;
    this.journeyTime += dt;
    this.near = Number.isFinite(distance) && distance <= (this.level.arrivalRadius ?? 100);
    if (this.level.callMode === 'PLAYER_CALLS') {
      this.kind = 'arrival'; this.buttonState = this.near ? 'enabled' : 'disabled'; return;
    }
    const kind: CallKind | null = this.near ? 'arrival' :
      this.level.callMode === 'CUSTOMER_NAGS_EN_ROUTE' && !this.nagFinished && this.journeyTime >= NAG_DELAY ? 'nag' : null;
    if (!kind) {
      this.buttonState = 'disabled'; this.ringTime = 0; this.repeatTime = 0; return;
    }
    if (kind !== this.kind) { this.kind = kind; this.ringTime = 0; this.repeatTime = 0; this.buttonState = 'disabled'; }
    if (this.ringing) {
      this.ringTime += dt;
      if (this.ringTime >= RING_SECONDS) { this.buttonState = 'disabled'; this.ringTime = 0; this.repeatTime = REPEAT_SECONDS; }
    } else if (this.repeatTime > 0) this.repeatTime = Math.max(0, this.repeatTime - dt);
    else this.ring(kind);
  }
  private ring(kind: CallKind) {
    this.kind = kind; this.buttonState = 'ringing'; this.ringTime = 0;
    this.events.emit('callRinging', { kind });
  }
  answer() {
    if (!this.level || this.active || !['enabled', 'ringing'].includes(this.buttonState)) return false;
    this.script = this.kind === 'nag' ? this.level.nagScript ?? [] : this.level.script;
    if (!this.script.length) return false;
    this.begin(); return true;
  }
  bonus(level: LevelConfig, reveal: () => void) {
    if (this.active || !level.bonusScript?.length) return false;
    this.level = level; this.onReveal = reveal; this.kind = 'bonus'; this.script = level.bonusScript;
    this.begin(); return true;
  }
  private begin() {
    this.active = true; this.buttonState = 'disabled'; this.lineIndex = 0; this.elapsed = 0;
    this.events.emit('callStarted', { kind: this.kind }); this.revealLine();
  }
  advance(replyIndex?: number) {
    if (!this.active) return false;
    const replies = this.currentLine?.replies;
    if (replies && (!Number.isInteger(replyIndex) || replyIndex! < 0 || replyIndex! >= replies.length)) return false;
    if (this.isLastLine) { this.finish(true); return true; }
    this.lineIndex++; this.revealLine(); return true;
  }
  /** Hanging up early does not bypass the gate; a finished final line can end normally. */
  end() {
    if (!this.active) return false;
    this.finish(this.isLastLine && !this.currentLine?.replies); return true;
  }
  private revealLine() {
    if (this.level?.revealAt === 'callLine' && this.currentLine?.reveal) this.onReveal?.();
  }
  private finish(completed: boolean) {
    const kind = this.kind;
    this.active = false; this.script = []; this.buttonState = 'disabled';
    this.ringTime = 0; this.repeatTime = completed ? 0 : REPEAT_SECONDS;
    if (kind === 'arrival' && completed) this.arrivalComplete = true;
    if (kind === 'nag' && completed) this.nagFinished = true;
    this.events.emit('callEnded', { kind, completed });
  }
  reset() {
    this.level = null; this.onReveal = undefined; this.script = []; this.active = false;
    this.buttonState = 'hidden'; this.kind = 'arrival'; this.lineIndex = 0; this.elapsed = 0;
    this.arrivalComplete = false; this.journeyTime = 0; this.ringTime = 0; this.repeatTime = 0;
    this.near = false; this.nagFinished = false;
  }
}

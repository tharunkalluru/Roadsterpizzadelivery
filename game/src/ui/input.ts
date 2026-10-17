import type { TickInput } from '../player/player';

/**
 * Pointer + keyboard input (MASTER §11). Each control owns its pointer independently with
 * pointer capture so steering + brake/fly work simultaneously. Held state is cleared on
 * pointercancel, lost capture, blur, page hide, modal open and layout replacement (U02).
 * Fly is delivered to the simulation as a FRESH-PRESS EDGE consumed exactly once; a press
 * while unavailable is never queued for later (F06).
 */
export class InputManager {
  private keys = new Set<string>();
  private steerPointer: number | null = null;
  private steerOriginX = 0;
  private steerValue = 0;
  private brakePointers = new Set<number>();
  private boostPointers = new Set<number>();
  private flyEdge = false;
  private reverseToggle = false;
  sensitivity = 1;
  enabled = false;
  onPause: (() => void) | null = null;
  onMap: (() => void) | null = null;
  onHorn: (() => void) | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private root: HTMLElement) {
    const kd = (e: KeyboardEvent) => this.keyDown(e);
    const ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
    const blur = () => this.clearAll();
    const vis = () => { if (document.hidden) this.clearAll(); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', blur);
    this.cleanup.push(() => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', blur); });
  }

  private keyDown(e: KeyboardEvent) {
    if (!this.enabled) return;
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'KeyF') { this.flyEdge = true; e.preventDefault(); }
    if (e.code === 'KeyR') this.reverseToggle = !this.reverseToggle;
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
    if (e.code === 'KeyM') this.onMap?.();
    if (e.code === 'KeyH') this.onHorn?.();
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }

  /** wire the touch controls of the driving layout */
  bindTouch(els: { steer: HTMLElement; steerKnob: HTMLElement; brake: HTMLElement; fly: HTMLElement; reverse: HTMLElement; boost?: HTMLElement }) {
    const { steer, steerKnob, brake, fly, reverse, boost } = els;
    const steerDown = (e: PointerEvent) => {
      if (!this.enabled || this.steerPointer !== null) return;
      this.steerPointer = e.pointerId; this.steerOriginX = e.clientX; this.steerValue = 0;
      steer.setPointerCapture(e.pointerId);
      steerKnob.style.left = `${e.clientX - steer.getBoundingClientRect().left}px`;
      steer.classList.add('active');
      e.preventDefault();
    };
    const steerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointer) return;
      const range = Math.max(40, steer.clientWidth * 0.28) / this.sensitivity;
      const dx = e.clientX - this.steerOriginX;
      const dead = 6;
      const v = Math.abs(dx) < dead ? 0 : (dx - Math.sign(dx) * dead) / range;
      this.steerValue = Math.max(-1, Math.min(1, v));
      steerKnob.style.transform = `translateX(${this.steerValue * 44}px)`;
    };
    const steerEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = null; this.steerValue = 0; // recentre
      steerKnob.style.transform = 'translateX(0)';
      steer.classList.remove('active');
    };
    steer.addEventListener('pointerdown', steerDown);
    steer.addEventListener('pointermove', steerMove);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) steer.addEventListener(t, steerEnd);

    const holdButton = (el: HTMLElement, set: Set<number>) => {
      el.addEventListener('pointerdown', (e) => { if (!this.enabled) return; set.add(e.pointerId); el.setPointerCapture(e.pointerId); el.classList.add('down'); e.preventDefault(); });
      const up = (e: PointerEvent) => { set.delete(e.pointerId); if (!set.size) el.classList.remove('down'); };
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(t, up);
      // finger sliding out of the region releases the control
      el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') up(e); });
    };
    holdButton(brake, this.brakePointers);
    if (boost) holdButton(boost, this.boostPointers);
    fly.addEventListener('pointerdown', (e) => { if (!this.enabled) return; this.flyEdge = true; fly.classList.add('down'); e.preventDefault(); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) fly.addEventListener(t, () => fly.classList.remove('down'));
    reverse.addEventListener('pointerdown', (e) => { if (!this.enabled) return; this.reverseToggle = !this.reverseToggle; e.preventDefault(); });
  }

  /** clear every held action (U02) */
  clearAll(): void {
    this.keys.clear();
    this.steerPointer = null; this.steerValue = 0;
    this.brakePointers.clear(); this.boostPointers.clear();
    this.flyEdge = false;
    this.reverseToggle = false;
    this.root.querySelectorAll('.down,.active').forEach((el) => el.classList.remove('down', 'active'));
    const knob = this.root.querySelector<HTMLElement>('.steer-knob');
    if (knob) knob.style.transform = 'translateX(0)';
  }

  get reverseRequested(): boolean { return this.reverseToggle; }
  setReverse(on: boolean) { this.reverseToggle = on; }

  /** sample one simulation tick; the fly edge is consumed by the first tick that reads it */
  sample(): TickInput {
    const k = this.keys;
    let steer = this.steerValue;
    if (k.has('ArrowLeft') || k.has('KeyA')) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) steer += 1;
    steer = Math.max(-1, Math.min(1, steer));
    const brake = this.brakePointers.size > 0 || k.has('ArrowDown') || k.has('KeyS');
    const boost = this.boostPointers.size > 0 || k.has('ArrowUp') || k.has('KeyW');
    const flyPress = this.flyEdge;
    this.flyEdge = false;
    return { steer, brake, boost, reverse: this.reverseToggle, flyPress, holdStop: false };
  }

  /** discard a pending press that arrived while flight was unavailable (never queued) */
  discardEdges(): void { this.flyEdge = false; }

  dispose(): void { this.cleanup.forEach((f) => f()); }
}

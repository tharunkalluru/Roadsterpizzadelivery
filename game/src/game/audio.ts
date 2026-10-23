// Street sound: synthesized horns (no audio files). Browsers only allow sound after the player's first
// key press or tap, so the context is created lazily on that gesture.
export class Sound {
  ctx: AudioContext | null = null; master: GainNode | null = null; muted = false; last = 0;
  constructor() {
    const unlock = () => {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx!.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx!.destination);
      } catch { this.ctx = null; }
    };
    for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, unlock, { passive: true });
  }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  // kind sets the pitch: bikes squeak, autos bleat, cars beep, buses and lorries blare
  horn(kind: string, dist: number, pan = 0, double = false) {
    const c = this.ctx, m = this.master; if (!c || !m || this.muted || c.state !== 'running') return;
    const now = c.currentTime; if (now - this.last < 0.12) return; this.last = now;
    const vol = Math.max(0, Math.min(1, 1 - dist / 70)) * 0.32; if (vol < 0.01) return;
    const base = kind === 'bike' ? 620 : kind === 'auto' ? 520 : kind === 'bus' || kind === 'truck' ? 260 : 400;
    const out = c.createGain(); out.gain.value = 0;
    let node: AudioNode = out;
    if ((c as any).createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); node = p; }
    node.connect(m);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = kind === 'bus' || kind === 'truck' ? 1400 : 2600; filt.connect(out);
    const beeps = double ? [[0, 0.16], [0.22, 0.32]] : [[0, kind === 'bus' || kind === 'truck' ? 0.55 : 0.3]];
    for (const [t0, t1] of beeps) {
      for (const f of [base, base * 1.26]) {
        const o = c.createOscillator(); o.type = kind === 'auto' ? 'square' : 'sawtooth'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
        o.connect(filt); o.start(now + t0); o.stop(now + t1 + 0.05);
      }
      out.gain.setValueAtTime(0, now + t0); out.gain.linearRampToValueAtTime(vol, now + t0 + 0.015);
      out.gain.setValueAtTime(vol, now + t1 - 0.02); out.gain.linearRampToValueAtTime(0, now + t1);
    }
  }
}

// Small synthesized game sounds. No downloads, media permissions, or autoplay before a gesture.
export type SoundCue = 'start' | 'offer' | 'accept' | 'pickup' | 'delivery' | 'flight' | 'bump' | 'error';
export interface VehicleSound { speed: number; throttle: number; flying: boolean; descending?: boolean; active: boolean }

export class Sound {
  ctx: AudioContext | null = null; master: GainNode | null = null; muted = false; last = -Infinity;
  private motor: OscillatorNode | null = null; private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null; private thrustGain: GainNode | null = null;
  private foreground = !document.hidden;
  private pending: { kind: SoundCue; time: number } | null = null;
  private resumePending = false;
  private cueTimes = new Map<SoundCue, number>();
  private vehicleTargets = { frequency: -1, filter: -1, motor: -1, thrust: -1 };

  constructor() {
    // Capture runs before Play/settings handlers. touchend/click also cover mobile browsers
    // that do not unlock audio on pointerdown, and keyboard activation of real buttons.
    for (const ev of ['keydown', 'pointerdown', 'touchend', 'click'])
      addEventListener(ev, () => this.unlock(), { capture: true, passive: true });
    addEventListener('blur', () => { this.foreground = false; this.silence(); this.applyMaster(); });
    addEventListener('focus', () => { this.foreground = !document.hidden; this.applyMaster(); });
    addEventListener('pagehide', () => { this.foreground = false; this.silence(); this.applyMaster(); });
    document.addEventListener('visibilitychange', () => {
      this.foreground = !document.hidden;
      if (!this.foreground) this.silence();
      this.applyMaster();
      if (this.foreground && this.ctx) this.unlock();
    });
  }

  unlock() {
    this.foreground = !document.hidden;
    if (!this.ctx || this.ctx.state === 'closed') {
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        const c: AudioContext = new AC();
        this.ctx = c; this.master = c.createGain();
        this.resumePending = false; this.last = -Infinity; this.cueTimes.clear();
        this.vehicleTargets = { frequency: -1, filter: -1, motor: -1, thrust: -1 };
        this.master.gain.value = this.muted || !this.foreground ? 0 : 0.5;
        this.master.connect(c.destination);
        this.createVehicleVoices(c, this.master);
      } catch { this.ctx = null; this.master = null; return; }
    }
    const c = this.ctx;
    this.applyMaster();
    // iOS can report "interrupted" as well as "suspended" after a call or app switch.
    if (c.state !== 'running' && !this.resumePending) {
      this.resumePending = true;
      c.resume().then(() => { this.resumePending = false; this.flushCue(); })
        .catch(() => { this.resumePending = false; });
    } else if (c.state === 'running') this.flushCue();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) this.pending = null;
    this.applyMaster();
    if (!m && this.ctx) this.unlock();
  }

  private applyMaster() {
    if (!this.ctx || !this.master || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted || !this.foreground || document.hidden ? 0 : 0.5, now, 0.015);
  }

  private createVehicleVoices(c: AudioContext, master: GainNode) {
    this.motorGain = c.createGain(); this.motorGain.gain.value = 0; this.motorGain.connect(master);
    this.motorFilter = c.createBiquadFilter(); this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 600; this.motorFilter.Q.value = 0.5; this.motorFilter.connect(this.motorGain);
    this.motor = c.createOscillator(); this.motor.type = 'sawtooth'; this.motor.frequency.value = 55;
    this.motor.connect(this.motorFilter); this.motor.start();
    const noise = c.createBuffer(1, c.sampleRate, c.sampleRate), data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(); source.buffer = noise; source.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.6;
    this.thrustGain = c.createGain(); this.thrustGain.gain.value = 0; this.thrustGain.connect(master);
    source.connect(filter); filter.connect(this.thrustGain); source.start();
  }

  vehicle(s: VehicleSound) {
    const c = this.ctx;
    if (!c || !this.motor || !this.motorGain || !this.motorFilter || !this.thrustGain || c.state === 'closed') return;
    const now = c.currentTime, active = s.active && this.foreground && !document.hidden;
    const speed = Math.min(45, Math.abs(Number.isFinite(s.speed) ? s.speed : 0));
    const throttle = Math.max(0, Math.min(1, Number.isFinite(s.throttle) ? s.throttle : 0));
    const air = s.flying || s.descending;
    const ramp = (key: keyof typeof this.vehicleTargets, param: AudioParam, value: number, time: number, epsilon: number) => {
      if (Math.abs(this.vehicleTargets[key] - value) < epsilon) return;
      this.vehicleTargets[key] = value;
      param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time);
    };
    // Do not enqueue identical automation events throughout a long drive or unlimited flight.
    ramp('frequency', this.motor.frequency, 55 + speed * 4.2 + throttle * 24, 0.08, 0.5);
    ramp('filter', this.motorFilter.frequency, 450 + speed * 28 + throttle * 160, 0.08, 5);
    ramp('motor', this.motorGain.gain, active && !air ? 0.035 + speed / 45 * 0.065 + throttle * 0.02 : 0, 0.04, 0.0005);
    ramp('thrust', this.thrustGain.gain, active && air ? (s.flying ? 0.16 : 0.06) : 0, 0.04, 0.0005);
  }

  private silence() {
    this.pending = null;
    this.vehicle({ speed: 0, throttle: 0, flying: false, active: false });
  }

  private flushCue() {
    const p = this.pending;
    this.pending = null;
    if (p && performance.now() - p.time < 1000) this.cue(p.kind);
  }

  cue(kind: SoundCue) {
    const c = this.ctx;
    if (!c || !this.master || this.muted || !this.foreground || document.hidden) return;
    if (c.state !== 'running') { this.pending = { kind, time: performance.now() }; return; }
    const now = c.currentTime;
    if (now - (this.cueTimes.get(kind) ?? -Infinity) < (kind === 'bump' ? 0.45 : 0.12)) return;
    this.cueTimes.set(kind, now);
    const notes: [number, number, number][] = {
      start: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.2]],
      offer: [[523, 0, 0.1], [659, 0.14, 0.15]],
      accept: [[659, 0, 0.11], [784, 0.12, 0.16]],
      pickup: [[784, 0, 0.1], [988, 0.11, 0.1], [1175, 0.22, 0.17]],
      delivery: [[523, 0, 0.13], [659, 0.13, 0.13], [784, 0.26, 0.13], [1047, 0.39, 0.28]],
      flight: [[180, 0, 0.24]],
      bump: [[100, 0, 0.14]],
      error: [[220, 0, 0.15], [165, 0.18, 0.2]],
    }[kind] as [number, number, number][];
    for (const [f, offset, duration] of notes) {
      const o = c.createOscillator(), gain = c.createGain(), start = now + offset;
      o.type = kind === 'bump' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, start);
      if (kind === 'flight' || kind === 'bump') o.frequency.exponentialRampToValueAtTime(kind === 'flight' ? 700 : 40, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(kind === 'bump' ? 0.25 : 0.16, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      o.connect(gain); gain.connect(this.master); o.start(start); o.stop(start + duration + 0.02);
      o.onended = () => { o.disconnect(); gain.disconnect(); };
    }
  }

  // Nearby traffic and the player's horn; distant traffic fades out and pans across the street.
  horn(kind: string, dist: number, pan = 0, double = false) {
    const c = this.ctx, m = this.master;
    if (!c || !m || this.muted || !this.foreground || document.hidden || c.state !== 'running') return;
    const now = c.currentTime; if (now - this.last < 0.12) return;
    const vol = Math.max(0, Math.min(1, 1 - dist / 70)) * 0.32; if (vol < 0.01) return;
    this.last = now;
    const base = kind === 'bike' ? 620 : kind === 'auto' ? 520 : kind === 'bus' || kind === 'truck' ? 260 : 400;
    const out = c.createGain(); out.gain.value = 0;
    let node: AudioNode = out;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); node = p; }
    node.connect(m);
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = kind === 'bus' || kind === 'truck' ? 1400 : 2600; filt.connect(out);
    const beeps = double ? [[0, 0.16], [0.22, 0.32]] : [[0, kind === 'bus' || kind === 'truck' ? 0.55 : 0.3]];
    let remaining = beeps.length * 2;
    for (const [t0, t1] of beeps) {
      for (const f of [base, base * 1.26]) {
        const o = c.createOscillator(); o.type = kind === 'auto' ? 'square' : 'sawtooth'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
        o.connect(filt); o.start(now + t0); o.stop(now + t1 + 0.05);
        o.onended = () => { o.disconnect(); if (--remaining === 0) { filt.disconnect(); out.disconnect(); if (node !== out) node.disconnect(); } };
      }
      out.gain.setValueAtTime(0, now + t0); out.gain.linearRampToValueAtTime(vol, now + t0 + 0.015);
      out.gain.setValueAtTime(vol, now + t1 - 0.02); out.gain.linearRampToValueAtTime(0, now + t1);
    }
  }
}

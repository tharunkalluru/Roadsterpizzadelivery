/**
 * Original synthesized audio (no imported recordings): engine, thruster, horn, impacts,
 * chimes, light ambient pad. Separate music / effects / interface buses (MASTER §20).
 * Started only after a user gesture; suspended on page hide. The game is fully playable muted.
 */
export interface AmbienceState {timeOfDay:'day'|'dusk'|'night';weather:'clear'|'rain';traffic?:number;metro?:number}
export class AudioSystem {
  ctx: AudioContext | null = null;
  private music!: GainNode; private sfx!: GainNode; private ui!: GainNode;
  private engOsc: OscillatorNode | null = null; private engGain!: GainNode; private engFilter!: BiquadFilterNode;
  private thrGain!: GainNode; private thrFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private rainGain!:GainNode;private cityGain!:GainNode;private railGain!:GainNode;private tyreGain!:GainNode;
  private ambience:AmbienceState={timeOfDay:'day',weather:'clear',traffic:.35,metro:0};
  private nextRoadHorn=0;
  volumes = { music: 0.5, sfx: 0.8, ui: 0.7 };
  state: 'off' | 'running' | 'suspended' | 'unavailable' = 'off';

  /** must be called from a user gesture */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) { this.state = 'unavailable'; return; }
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    this.music = ctx.createGain(); this.sfx = ctx.createGain(); this.ui = ctx.createGain();
    for (const g of [this.music, this.sfx, this.ui]) g.connect(master);
    this.applyVolumes();
    // engine: saw through low-pass, pitch follows speed
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 300;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.sfx);
    this.engOsc.start();
    // thruster: filtered noise loop
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; }
    noise.buffer = buf; noise.loop = true;
    this.thrFilter = ctx.createBiquadFilter(); this.thrFilter.type = 'bandpass'; this.thrFilter.frequency.value = 700; this.thrFilter.Q.value = 0.7;
    this.thrGain = ctx.createGain(); this.thrGain.gain.value = 0;
    noise.connect(this.thrFilter).connect(this.thrGain).connect(this.sfx);
    noise.start();
    // Original layered urban ambience: no unlicensed recordings or fabricated spoken announcements.
    const layer=(type:BiquadFilterType,frequency:number,q:number)=>{
      const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
      const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
      const gain=ctx.createGain();gain.gain.value=0;src.connect(filter).connect(gain).connect(this.sfx);src.start();return gain;
    };
    this.rainGain=layer('highpass',1300,.35);this.cityGain=layer('lowpass',210,.5);
    this.railGain=layer('bandpass',380,.8);this.tyreGain=layer('bandpass',900,.45);
    // ambient pad (original): two detuned sines, slow swell
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0;
    for (const f of [110, 164.8, 220.5]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(this.padGain); o.start();
    }
    this.padGain.connect(this.music);
    this.state = 'running';
    this.setAmbience(this.ambience);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.music.gain.value = this.volumes.music * 0.5;
    this.sfx.gain.value = this.volumes.sfx;
    this.ui.gain.value = this.volumes.ui;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') { void this.ctx.suspend(); this.state = 'suspended'; } }
  resume() { if (this.ctx) { void this.ctx.resume().then(() => { this.state = 'running'; }); } }

  setAmbience(state:AmbienceState):void {
    this.ambience={...state,traffic:Math.max(0,Math.min(1,state.traffic??.35)),metro:Math.max(0,Math.min(1,state.metro??0))};
    if(!this.ctx||!this.rainGain)return;
    const t=this.ctx.currentTime,night=state.timeOfDay==='night'?.55:1;
    this.rainGain.gain.setTargetAtTime(state.weather==='rain'?.055:0,t,.8);
    this.cityGain.gain.setTargetAtTime((this.ambience.traffic??.35)*.055*night,t,.6);
    this.railGain.gain.setTargetAtTime((this.ambience.metro??0)*.065,t,.45);
  }

  setDriving(active: boolean, speedMps: number, thrust: number) {
    if (!this.ctx || !this.engOsc) return;
    const t = this.ctx.currentTime;
    const v = Math.abs(speedMps);
    this.engOsc.frequency.setTargetAtTime(38 + v * 5.5, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(220 + v * 40, t, 0.1);
    this.engGain.gain.setTargetAtTime(active ? 0.05 + Math.min(0.08, v * 0.005) : 0, t, 0.15);
    this.thrGain.gain.setTargetAtTime(active ? thrust * 0.22 : 0, t, 0.08);
    this.thrFilter.frequency.setTargetAtTime(500 + thrust * 900, t, 0.1);
    this.padGain.gain.setTargetAtTime(active ? 0.6 : 0.3, t, 1.5);
    this.tyreGain.gain.setTargetAtTime(active?Math.min(.055,v*.0016)*(this.ambience.weather==='rain'?1.6:.5):0,t,.2);
    // Sparse distant horns vary with the selected density; never a constant citywide loop.
    const traffic=this.ambience.traffic??.35;
    if(active&&traffic>.05&&this.ctx.state==='running'&&t>=this.nextRoadHorn){
      this.nextRoadHorn=t+9+(1-traffic)*16+(this.ambience.timeOfDay==='night'?9:0);
      if(t>2){this.tone('sfx',294,.15,'triangle',.016*traffic);this.tone('sfx',370,.2,'triangle',.012*traffic);}
    }
  }

  private tone(bus: 'sfx' | 'ui', freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus === 'ui' ? this.ui : this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  click() { this.tone('ui', 880, 0.06, 'triangle', 0.15); }
  deny() { this.tone('ui', 220, 0.18, 'square', 0.12); this.tone('ui', 165, 0.2, 'square', 0.08); }
  launch() { this.tone('sfx', 180, 0.5, 'sawtooth', 0.12, 220); }
  land() { this.tone('sfx', 120, 0.25, 'sine', 0.3, -60); }
  bump() { this.tone('sfx', 90, 0.15, 'square', 0.2, -40); }
  crash() { this.tone('sfx', 70, 0.6, 'sawtooth', 0.35, -50); this.tone('sfx', 45, 0.7, 'square', 0.2, -20); }
  horn() { this.tone('sfx', 392, 0.35, 'square', 0.12); this.tone('sfx', 494, 0.35, 'square', 0.1); }
  chime() { [659, 784, 988].forEach((f, i) => setTimeout(() => this.tone('ui', f, 0.35, 'sine', 0.2), i * 110)); }
  warn() { this.tone('ui', 660, 0.12, 'triangle', 0.15); setTimeout(() => this.tone('ui', 660, 0.12, 'triangle', 0.15), 160); }
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone('ui', f, 0.3, 'triangle', 0.18), i * 140)); }
}

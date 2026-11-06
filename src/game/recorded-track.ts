// A source node is single-use. Keep its decoded buffer and resume at the exact
// sample-clock offset when the game resumes after opening a menu or switching apps.
export type TrackStatus = 'idle' | 'loading' | 'playing' | 'ended' | 'failed';

export class RecordedTrack {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private request: AbortController | null = null;
  private offset = 0;
  private startedAt = 0;
  private active = false;
  status: TrackStatus = 'idle';

  constructor(private context: AudioContext, private output: AudioNode, private loop: boolean,
    private onFinish?: () => void, private onStart?: () => void) {}

  /** Short RMS window of the decoded voice, independent of master volume. */
  get speechLevel() {
    if (!this.buffer || !this.source || this.status !== 'playing') return 0;
    const pcm = this.buffer.getChannelData(0);
    const end = Math.min(pcm.length, Math.floor(this.position * this.buffer.sampleRate));
    const start = Math.max(0, end - Math.round(this.buffer.sampleRate * .028));
    let sum = 0, count = 0;
    for (let i = start; i < end; i += 8) { sum += pcm[i] * pcm[i]; count++; }
    const rms = Math.sqrt(sum / Math.max(1, count));
    return Math.max(0, Math.min(1, (rms - .012) * 8));
  }

  get duration() { return this.buffer?.duration ?? 0; }
  get position() {
    const elapsed = this.offset + (this.source ? this.context.currentTime - this.startedAt : 0);
    return this.loop && this.duration ? elapsed % this.duration : Math.min(this.duration, elapsed);
  }

  async load(url: string) {
    this.clear();
    const request = new AbortController();
    this.request = request;
    this.status = 'loading';
    const timeout = setTimeout(() => request.abort(), 20_000);
    try {
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) throw Error('Recording unavailable');
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      if (request !== this.request) return;
      this.buffer = buffer;
      this.sync();
    } catch {
      if (request !== this.request) return;
      this.status = 'failed';
      this.onFinish?.();
    } finally {
      clearTimeout(timeout);
      if (request === this.request) this.request = null;
    }
  }

  setActive(active: boolean) {
    this.active = active;
    this.sync();
  }

  private sync() {
    if (!this.active) { this.pause(); return; }
    if (!this.buffer || this.source || this.status === 'ended' || this.status === 'failed' || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = this.loop;
    source.connect(this.output);
    source.onended = () => {
      if (this.source !== source) return;
      source.disconnect();
      this.source = null;
      this.offset = this.duration;
      this.status = 'ended';
      this.onFinish?.();
    };
    this.source = source;
    this.startedAt = this.context.currentTime;
    source.start(0, this.offset);
    this.status = 'playing';
    this.onStart?.();
  }

  private pause() {
    if (!this.source) return;
    this.offset = this.position;
    this.source.onended = null;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }

  clear() {
    this.request?.abort();
    this.request = null;
    this.pause();
    this.offset = 0;
    this.buffer = null;
    this.status = 'idle';
  }
}

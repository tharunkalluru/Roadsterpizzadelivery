import { ModuleBase, numberParam } from './base';

export class BeatDrop extends ModuleBase {
  private lastBeat = -1;
  protected build() {
    this.lastBeat = -1;
    const tiny = this.params.theme === 'eega';
    if (tiny) {
      this.platform(9, 9, 0, '#656049');
      this.cylinder(0, 1.8, 0, .18, .35, '#EFC74C');
      this.box(-.28, 1.85, 0, .4, .04, .2, '#F2F4E5'); this.box(.28, 1.85, 0, .4, .04, .2, '#F2F4E5');
    } else {
      this.platform(74, 92, 0, '#2F7E50');
      this.box(0, .03, 0, 5.8, .08, 22, '#D7B58B');
      for (const z of [-10, 10]) for (const x of [-.45, 0, .45]) this.box(x, .55, z, .08, 1.1, .08, '#F5EEDC');
      for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
        this.box(side * (39 + row * 2), row * 1.2, 0, 3, 1.2, 84, row % 2 ? '#7496A9' : '#BBC8D0');
      }
      for (const x of [-37, 37]) for (const z of [-42, 42]) {
        this.box(x, 12, z, .6, 24, .6, '#A4B0BA');
        this.box(x, 24, z, 6, 3, .6, '#FFF0C4');
      }
      this.person(3, 0, 2, '#E0E8EA'); this.person(-3, 0, -8, '#2C5F9A');
    }
    this.movement = { mode: 'approach', center: { ...this.target }, radius: 120, altitude: this.target.y + 5 };
    this.status = { instruction: 'Wait for the green break between overs', canDrop: false, actionLabel: 'DROP' };
  }
  update(dt: number) {
    if (!this.tick(dt)) return;
    const period = numberParam(this.params, 'period', 6, 2, 12), phase = this.time % period / period;
    const start = numberParam(this.params, 'windowStart', .65, 0, .9), end = Math.max(start + .05, numberParam(this.params, 'windowEnd', .92, .1, 1));
    const ready = phase >= start && phase <= end;
    const beat = Math.floor(this.time / (period / 4));
    if (beat !== this.lastBeat) { this.lastBeat = beat; if (this.unlocked() && this.within(120, 80)) this.ctx.cue?.('beat'); }
    this.ring.material = this.mat(ready ? '#45E3D3' : '#FFB627');
    this.ring.scale.setScalar(ready ? 1.35 : 1);
    const radius = numberParam(this.params, 'radius', this.params.theme === 'eega' ? 4 : 12, 2, 24);
    this.status.canDrop = this.unlocked() && ready && this.within(radius, 10);
    this.status.timing = { phase, start, end, ready };
    this.status.instruction = this.status.canDrop ? 'Break in play — drop now!' : !this.within(radius, 10) ? 'Hover above the glowing pitch marker' : 'Wait for the green break between overs';
  }
  onDrop() {
    if (!this.unlocked() || this.ended) return;
    if (this.status.canDrop) this.done(); else this.fail(this.within(numberParam(this.params, 'radius', 12), 10) ? 'Not between overs yet. Wait for green and retry.' : 'Move over the pitch marker first.');
  }
}

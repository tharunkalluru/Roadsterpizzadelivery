const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Seven visible construction details, scaled from content count rather than level constants. */
export function restaurantArt(stage: number, total: number, label: string) {
  const complete = total > 0 && stage >= total;
  const tier = stage <= 0 ? 0 : Math.max(1, Math.min(7, Math.ceil(stage / Math.max(1, total) * 7)));
  if (tier === 0) return `<svg viewBox="0 0 320 210" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="210" rx="20" fill="#21152F"/><path d="M35 166 160 115l125 51-125 30z" fill="#432F50" stroke="#785D91" stroke-width="3"/><path d="M160 140v-82" stroke="#CBB8DC" stroke-width="6"/><rect x="92" y="29" width="136" height="57" rx="8" fill="#271936" stroke="#FFBF00" stroke-width="3"/><text x="160" y="54" text-anchor="middle" fill="#FFBF00" font-family="Arial,sans-serif" font-size="14" font-weight="900">MY RESTAURANT</text><text x="160" y="73" text-anchor="middle" fill="#FFF1D8" font-family="Arial,sans-serif" font-size="12">One delivery at a time</text></svg>`;
  const shop = tier >= 3, width = tier >= 5 ? 236 : 190, left = (320 - width) / 2;
  const doorway = complete ? `<svg x="${left + width - 62}" y="96" width="44" height="82" viewBox="0 0 44 82" overflow="hidden"><rect width="44" height="82" fill="#FFDB85"/><path d="M0 66h44" stroke="#DB573C" stroke-width="8"/><g class="du-opening-door-left"><rect width="22" height="82" fill="#3B2A49" stroke="#CBB8DC" stroke-width="2"/><path d="M17 34v14" stroke="#FFBF00" stroke-width="3"/></g><g class="du-opening-door-right"><rect x="22" width="22" height="82" fill="#3B2A49" stroke="#CBB8DC" stroke-width="2"/><path d="M27 34v14" stroke="#FFBF00" stroke-width="3"/></g></svg>` : `<rect x="${left + width - 62}" y="96" width="44" height="82" fill="#271936"/>`;
  const wall = shop ? `<rect x="${left}" y="65" width="${width}" height="113" rx="7" fill="#E8C6A1" stroke="#140F22" stroke-width="5"/><rect class="du-opening-window" x="${left + 15}" y="100" width="70" height="65" fill="${complete ? '#FFDB85' : '#432F50'}"/>${doorway}` : `<rect x="70" y="118" width="180" height="48" rx="7" fill="#FF8F3D" stroke="#140F22" stroke-width="5"/><circle cx="94" cy="178" r="13" fill="#C7B7D8" stroke="#140F22" stroke-width="6"/><circle cx="226" cy="178" r="13" fill="#C7B7D8" stroke="#140F22" stroke-width="6"/>`;
  const awning = tier >= 2 ? `<path d="M${left-8} 83h${width+16}l-8-34H${left}z" fill="#DB573C" stroke="#140F22" stroke-width="4"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${left+i*width/6} 51h${width/12}v29h-${width/12}z" fill="#FFF2CC"/>`).join('')}` : '';
  const oven = tier >= 4 ? `<path d="M${left+28} 145v-20a20 20 0 0 1 40 0v20z" fill="#CC6148" stroke="#140F22" stroke-width="4"/><path class="du-opening-oven" d="M${left+39} 144v-15a9 9 0 0 1 18 0v15z" fill="#FFBF00"/>` : '';
  const seats = tier >= 5 ? `<path d="M12 158h28m-14 0v26m258-26h28m-14 0v26" stroke="#45E3D3" stroke-width="7"/><path d="M7 179h11m25 0h11m212 0h11m25 0h11" stroke="#FFF2CC" stroke-width="5"/>` : '';
  const plants = tier >= 6 ? `<path d="M49 170h19l-3 19H52zM252 170h19l-3 19h-13z" fill="#FF8F3D"/><path d="M58 168v-30m-1 18l-12-11m15 8l12-15m189 30v-30m0 18l-12-11m12 8l12-15" stroke="#45E3D3" stroke-width="5"/>` : '';
  const sign = tier >= 3 ? `<rect class="du-opening-neon-frame" x="91" y="19" width="138" height="28" rx="7" fill="#21152F" stroke="${complete ? '#45E3D3' : '#E8C6A1'}" stroke-width="3"/><text class="du-opening-neon-text" x="160" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="900" fill="${complete ? '#45E3D3' : '#FFBF00'}">ROADSTER PIZZA</text>` : `<text x="160" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="900" fill="#21152F">ROADSTER PIZZA</text>`;
  return `<svg viewBox="0 0 320 210" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="210" rx="20" fill="#21152F"/><path d="M17 192h286" stroke="#785D91" stroke-width="5"/>${wall}${awning}${oven}${seats}${plants}${sign}${complete ? '<path class="du-opening-rays" d="M27 29l5 10m254-7l-5 10M51 11l8 5m207 0l-8 5M160 2v8" stroke="#FFBF00" stroke-width="4"/>' : ''}</svg>`;
}

export type RestaurantOpeningPhase = 'closed' | 'lights' | 'doors' | 'open';
export interface RestaurantOpeningClock {
  set(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}
/** A short, finite ceremony; never gates the continue action or game progress. */
export class RestaurantOpening {
  phase: RestaurantOpeningPhase = 'open';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private disposed = false;
  constructor(private onPhase: (phase: RestaurantOpeningPhase) => void,
    private clock: RestaurantOpeningClock = { set: (fn, delay) => setTimeout(fn, delay), clear: timer => clearTimeout(timer) }) {}
  start(reducedMotion = false) {
    if (this.disposed) return;
    this.cancel(); this.show(reducedMotion ? 'open' : 'closed');
    if (reducedMotion) return;
    this.timers.push(this.clock.set(() => this.show('lights'), 700),
      this.clock.set(() => this.show('doors'), 1500), this.clock.set(() => this.finish(), 3000));
  }
  finish() { this.cancel(); if (!this.disposed && this.phase !== 'open') this.show('open'); }
  dispose() { this.cancel(); this.disposed = true; }
  private show(phase: RestaurantOpeningPhase) { if (!this.disposed) { this.phase = phase; this.onPhase(phase); } }
  private cancel() { for (const timer of this.timers) this.clock.clear(timer); this.timers.length = 0; }
}

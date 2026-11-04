const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Keep the shipped seven-customer ceremony and its original construction art. */
function legacyRestaurantArt(stage: number, total: number, label: string) {
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

/** Each completed delivery visibly builds something. The fourteen-scene arc has
 * fourteen distinct construction milestones; longer content sets also lay a new
 * terrace stone each time rather than showing duplicate pictures between tiers.
 * All paint is opaque SVG: no blur, filters, external images or ongoing timers. */
export function restaurantArt(stage:number,total:number,label:string){
  const count=Math.max(0,Math.floor(Number.isFinite(total)?total:0));
  const built=Math.max(0,Math.min(count,Math.floor(Number.isFinite(stage)?stage:0)));
  if(count<=7||built===0)return legacyRestaurantArt(built,count,label);
  const complete=built===count,phase=Math.max(1,Math.min(14,Math.ceil(built/count*14)));
  const shop=phase>=6,width=phase>=12?236:190,left=(320-width)/2;
  const parts:string[]=[];
  const add=(name:string,art:string)=>parts.push(`<g data-build="${name}">${art}</g>`);
  add('foundation','<path d="M17 192h286" stroke="#785D91" stroke-width="5"/>');
  if(shop){
    add('shop',`<rect x="${left}" y="65" width="${width}" height="113" rx="7" fill="${phase>=12?'#F0D9AF':'#DAB997'}" stroke="#140F22" stroke-width="5"/><rect class="du-opening-window" x="${left+12}" y="99" width="${phase>=10?110:78}" height="66" fill="${complete?'#FFDB85':'#432F50'}" stroke="#A66D55" stroke-width="3"/>`);
    if(complete)add('opening-doors',`<svg x="${left+width-62}" y="96" width="44" height="82" viewBox="0 0 44 82" overflow="hidden"><rect width="44" height="82" fill="#FFDB85"/><path d="M0 66h44" stroke="#DB573C" stroke-width="8"/><g class="du-opening-door-left"><rect width="22" height="82" fill="#3B2A49" stroke="#CBB8DC" stroke-width="2"/><path d="M17 34v14" stroke="#FFBF00" stroke-width="3"/></g><g class="du-opening-door-right"><rect x="22" width="22" height="82" fill="#3B2A49" stroke="#CBB8DC" stroke-width="2"/><path d="M27 34v14" stroke="#FFBF00" stroke-width="3"/></g></svg>`);
    else add('shop-door',`<rect x="${left+width-62}" y="96" width="44" height="82" fill="#271936" stroke="#A66D55" stroke-width="3"/><path d="M${left+width-28} 132v13" stroke="#FFBF00" stroke-width="3"/>`);
  }else{
    add('cart','<rect x="70" y="118" width="180" height="48" rx="7" fill="#FF8F3D" stroke="#140F22" stroke-width="5"/>');
    if(phase<3)add('cart-wheels','<circle cx="94" cy="178" r="13" fill="#C7B7D8" stroke="#140F22" stroke-width="6"/><circle cx="226" cy="178" r="13" fill="#C7B7D8" stroke="#140F22" stroke-width="6"/>');
    else add('stall-frame','<path d="M72 76v105m176-105v105M65 169h190" stroke="#BA8260" stroke-width="8"/><rect x="65" y="163" width="190" height="18" fill="#A66D55"/>');
  }
  if(phase>=2)add('canopy',`<path d="M${left-8} 83h${width+16}l-8-34H${left}z" fill="#DB573C" stroke="#140F22" stroke-width="4"/>${Array.from({length:6},(_,i)=>`<path d="M${left+i*width/6} 51h${width/12}v29h-${width/12}z" fill="#FFF2CC"/>`).join('')}`);
  if(phase>=4)add('counter-oven',`<path d="M${left+22} 151v-22a23 23 0 0 1 46 0v22z" fill="${phase>=8?'#B04E3E':'#CC6148'}" stroke="#140F22" stroke-width="4"/><path class="du-opening-oven" d="M${left+35} 150v-17a10 10 0 0 1 20 0v17z" fill="#FFBF00"/><path d="M${left+14} 155h66" stroke="#E8C6A1" stroke-width="5"/>`);
  if(phase>=5)add('takeaway-counter',`<rect x="${shop?left+width-75:175}" y="${shop?150:105}" width="49" height="23" rx="3" fill="#FFF2CC" stroke="#6D443E" stroke-width="3"/><path d="M${shop?left+width-65:185} ${shop?162:117}h29" stroke="#DB573C" stroke-width="4"/>`);
  if(phase>=7)add('shop-seating','<path d="M12 157h28m-14 0v27m258-27h28m-14 0v27" stroke="#45E3D3" stroke-width="7"/><path d="M7 179h11m25 0h11m212 0h11m25 0h11" stroke="#FFF2CC" stroke-width="5"/>');
  if(phase>=8)add('brick-oven',`<path d="M${left+25} 132h10m20 0h10m-39 10h9m20 0h10m-34-19h7m10 0h7" stroke="#E9A16B" stroke-width="3"/><rect x="${left+32}" y="27" width="17" height="27" fill="#B04E3E" stroke="#140F22" stroke-width="3"/><path d="M${left+28} 27h25" stroke="#E8C6A1" stroke-width="5"/>`);
  if(phase>=9)add('kitchen',`<path d="M${left+93} 114h28m-28 18h28m-23-33v41" stroke="#BFA88A" stroke-width="3"/><circle cx="${left+106}" cy="110" r="4" fill="#FFBF00"/><path d="M${left+100} 127h14" stroke="#F0D9AF" stroke-width="5"/>`);
  if(phase>=10)add('dining-room',`<path d="M${left+79} 153h32m-16 0v13" stroke="#FFF2CC" stroke-width="4"/><path d="M${left+72} 148v17m46-17v17" stroke="#45E3D3" stroke-width="4"/>`);
  if(phase>=11)add('terrace','<path d="M39 182h242m-238 0v-17m22 17v-13m192 13v-13m20 13v-17" stroke="#CBB8DC" stroke-width="3"/><path d="M49 166h19l-3 20H52zM252 166h19l-3 20h-13z" fill="#DB573C"/><path d="M58 164v-27m0 18l-12-11m12 8l12-15m191 27v-27m0 18l-12-11m12 8l12-15" stroke="#45E3D3" stroke-width="4"/>');
  if(phase>=12)add('finished-facade',`<path d="M${left+4} 90v85m${width-8}-85v85M${left-2} 89h${width+4}" stroke="#FFF2CC" stroke-width="5"/><path d="M${left+3} 174h${width-6}" stroke="#B78560" stroke-width="6"/>`);
  if(phase>=13)add(complete?'neon-open':'installed-sign',`<rect ${complete?'class="du-opening-neon-frame" ':''}x="85" y="16" width="150" height="31" rx="7" fill="#21152F" stroke="${complete?'#45E3D3':'#CBB8DC'}" stroke-width="3"/><text ${complete?'class="du-opening-neon-text" ':''}x="160" y="36" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="900" fill="${complete?'#45E3D3':'#9683A7'}">ROADSTER PIZZA</text>`);
  else add('painted-name',`<text x="160" y="${phase===1?148:95}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#FFBF00">ROADSTER PIZZA</text>`);
  // New paving is actual construction geometry, keeping >14-level campaigns
  // visibly progressive even when two deliveries share a structural milestone.
  // Bound SVG node count for unusually large authored campaigns.
  const slots=Math.min(128,count),laid=built/count*slots;
  add('terrace-paving',Array.from({length:Math.ceil(laid)},(_,i)=>`<rect x="${24+i*272/slots}" y="196" width="${Math.min(1,laid-i)*(272/slots-.6)}" height="6" rx="1" fill="${i%2?'#DAB997':'#BA8260'}"/>`).join(''));
  if(complete)add('grand-opening','<path class="du-opening-rays" d="M27 29l5 10m254-7l-5 10M51 11l8 5m207 0l-8 5M160 2v8" stroke="#FFBF00" stroke-width="4"/>');
  return `<svg viewBox="0 0 320 210" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="210" rx="20" fill="#21152F"/>${parts.join('')}</svg>`;
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

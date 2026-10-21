import type { Session, SessionNotice } from '../missions/session';
import type { App } from '../app/app';
import { SIM_HZ } from '../config/gameplay';
import { predictAscentTicks, predictTicksToTouchdown } from '../player/player';
import { FLIGHT } from '../config/gameplay';

const ARROWS: Record<string, string> = { left: '↰', right: '↱', straight: '↑', uturn: '↶', arrive: '◎' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/**
 * Driving HUD + touch controls (MASTER §20, PLAYER_EXPERIENCE §5–8). Text updates at ~10 Hz;
 * the Fly/Land control and landing feedback update every frame. Critical states use text and
 * shape as well as colour (U04).
 */
export class Hud {
  root: HTMLElement;
  private timer!: HTMLElement; private timerLbl!: HTMLElement; private dest!: HTMLElement; private cargo!: HTMLElement;
  private man!: HTMLElement; private manArrow!: HTMLElement; private manD!: HTMLElement; private manN!: HTMLElement;
  private toasts!: HTMLElement; private banner!: HTMLElement; private hold!: HTMLElement; private holdBar!: HTMLElement; private holdTxt!: HTMLElement;
  private speedV!: HTMLElement; private gear!: HTMLElement;
  private fly!: HTMLElement; private flyLabel!: HTMLElement; private flySec!: HTMLElement;
  private meterFill!: HTMLElement; private meterRes!: HTMLElement; private meterLbl!: HTMLElement; private meterWhy!: HTMLElement;
  private minimap!: HTMLCanvasElement;
  private dbg!: HTMLElement;
  private cd!: HTMLElement;
  private rec!: HTMLElement;
  private action!: HTMLButtonElement;
  private lookHint!: HTMLElement;
  private reserveLabel!: HTMLElement;
  private meter!: HTMLElement;
  private acc = 0;
  private lastNotice: SessionNotice | undefined;
  private bound = false;

  constructor(private ui: HTMLElement, private app: App) {
    this.root = el('div', 'hud hidden');
    this.root.setAttribute('aria-live', 'off');
    this.root.innerHTML = `
      <div class="hud-top">
      <div class="tl">
        <div class="chip hud-status"><div><div class="timer-label">Time left</div><div class="timer" data-t>0:00</div></div><div class="cargo hidden" data-cargo></div></div>
        <div class="dest" data-dest></div>
      </div>
      <div class="chip maneuver" data-man><span class="arrow" data-ma>↑</span><div><div class="d" data-md>—</div><div class="n" data-mn></div></div></div>
      <div class="tr">
        <canvas class="minimap" width="256" height="256" data-mini aria-label="Compact route map"></canvas>
        <button class="iconbtn" data-map aria-label="Open map (pauses)"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/></svg></button>
        <button class="iconbtn" data-pause aria-label="Pause">❚❚</button>
      </div>
      </div>
      <div class="toast-wrap" data-toasts role="status" aria-live="polite"></div>
      <div class="banner hidden" data-banner></div>
      <div class="hold hidden" data-hold><div class="chip" data-holdtxt>Stop here to deliver</div><div class="bar"><div data-holdbar></div></div></div>
      <div class="camera-hint" data-look-hint>Drag the view to inspect nearby signs.</div>
      <div class="flightmeter chip" data-meter>
        <div class="speed"><div class="v" data-speed>0</div><div class="u">km/h</div><div class="gear" data-gear></div></div>
        <div class="lbl"><span data-mlbl>Flight 25.0 s</span><span class="small" data-mres></span></div>
        <div class="bar"><div class="fill" data-mfill></div><div class="reserve" data-mreserve></div></div>
        <div class="why" data-why></div>
      </div>
      <div class="controls">
        <div class="steer" data-steer aria-label="Steering pad"><div class="steer-knob"></div></div>
        <button class="cbtn interact hidden" data-interact aria-label="Collect pizza (E)">COLLECT PIZZA <small>E</small></button>
        <div class="rbtns">
          <button class="cbtn fly" data-fly aria-label="Fly"><span data-flylbl>FLY</span><span class="fs" data-flysec>25.0s</span></button>
          <button class="cbtn accel" data-accel aria-label="Accelerate">▲</button>
          <button class="cbtn brake" data-brake aria-label="Brake, hold to reverse">▼</button>
        </div>
      </div>
      <div class="countdown hidden" data-cd></div>
      <div class="banner hidden" data-rec style="border-color: var(--bad)"></div>
      <div class="rotate"><div class="card"><h2>Rotate to landscape</h2><p>Your delivery is paused. Turn your phone sideways, then press Resume.</p></div></div>
      <div class="debug hidden" data-debug></div>`;
    ui.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(`[data-${s}]`) as T;
    this.timer = q('t'); this.dest = q('dest'); this.cargo = q('cargo');
    this.man = q('man'); this.manArrow = q('ma'); this.manD = q('md'); this.manN = q('mn');
    this.toasts = q('toasts'); this.banner = q('banner'); this.hold = q('hold'); this.holdBar = q('holdbar'); this.holdTxt = q('holdtxt');
    this.speedV = q('speed'); this.gear = q('gear');
    this.fly = q('fly'); this.flyLabel = q('flylbl'); this.flySec = q('flysec');
    this.meterFill = q('mfill'); this.meterRes = q('mreserve'); this.meterLbl = q('mlbl'); this.meterWhy = q('why');
    this.minimap = q('mini'); this.dbg = q('debug'); this.cd = q('cd'); this.rec = q('rec');
    this.action = q('interact'); this.lookHint = q('look-hint'); this.reserveLabel = q('mres');
    this.meter = q('meter');
    this.timerLbl = this.root.querySelector('.timer-label') as HTMLElement;
    q('pause').addEventListener('click', () => { this.app.audio.click(); this.app.pause('user'); });
    q('map').addEventListener('click', () => { this.app.audio.click(); this.app.openMap(); });
    this.action.addEventListener('click', () => this.app.input.requestInteraction());
    void this.timerLbl;
  }

  setHandedness(h: 'left' | 'right') { this.root.classList.toggle('left-handed', h === 'left'); }

  show(s: Session) {
    this.root.classList.remove('hidden');
    this.root.classList.toggle('zone-hud', !!this.app.pilotZone);
    const zoneLabel = this.ui.querySelector<HTMLElement>('.pilot-zone-label');
    if (zoneLabel && this.app.pilotZone) {
      const verified = this.app.pilotZone.mode === 'verified';
      zoneLabel.textContent = `${verified ? 'Verified boundary' : 'Provisional'} · Survey ${this.app.pilotZone.definition.surveyRevision}`;
      zoneLabel.title = verified ? this.app.pilotZone.definition.label : 'Partial-map preview; buildings, shops, entrances and road dimensions are approximate. Not fully mapped or verified.';
    }
    document.body.classList.add('playing');
    if (!this.bound) {
      const q = (k: string) => this.root.querySelector(`[data-${k}]`) as HTMLElement;
      this.app.input.bindTouch({ steer: q('steer'), steerKnob: this.root.querySelector('.steer-knob') as HTMLElement, brake: q('brake'), accel: q('accel'), fly: this.fly });
      this.bound = true;
    }
    this.lastNotice = s.notices.at(-1);
    this.toasts.innerHTML = '';
    this.update(s, 1, this.app);
  }
  hide() { this.root.classList.add('hidden'); document.body.classList.remove('playing'); this.cd.classList.add('hidden'); this.rec.classList.add('hidden'); }

  countdown(n: number) {
    this.cd.classList.toggle('hidden', n <= 0);
    this.cd.textContent = n > 0 ? String(n) : '';
  }
  recovering(on: boolean, reason = '') {
    this.rec.classList.toggle('hidden', !on);
    this.rec.textContent = on ? `Recovering — ${reason} (+3 s)` : '';
  }

  toast(text: string, kind: 'info' | 'warn' | 'bad' | 'good' = 'info') {
    // A successful retry supersedes the cancellation feedback; retain the session notice log.
    if (kind === 'good' && text.startsWith('Pizza collected. Deliver to ')) {
      for (const previous of Array.from(this.toasts.children)) {
        if (previous.textContent === 'Delivery hold cancelled') previous.remove();
      }
    }
    const t = el('div', `toast ${kind}`);
    t.textContent = text;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 2600);
  }

  debugText(s: string) { this.dbg.classList.remove('hidden'); this.dbg.textContent = s; }

  update(s: Session, dt: number, app: App) {
    const p = s.player;
    const l = p.ledger;
    this.lookHint.classList.toggle('hidden',p.isAirborne||Math.abs(p.speed)>.5);
    // ---- every frame: fly control + meter (urgent feedback)
    const air = p.isAirborne;
    const remainS = l.remainingTicks / SIM_HZ;
    const visibleSeconds = Math.floor(remainS * 10) / 10;
    this.fly.classList.toggle('land', air);
    let unavailable: string | null = null;
    if (!air) {
      if (p.move === 'GROUNDED' && s.phase === 'PLAYING') {
        if (this.acc === 0) { const ev = p.evaluateLaunch(); unavailable = ev.ok ? null : ev.reason; (this as any)._why = unavailable; }
        else unavailable = (this as any)._why ?? null;
      } else unavailable = p.move === 'LANDING_CONFIRM' ? 'Landing not confirmed yet' : null;
    }
    this.fly.classList.toggle('unavail', !!unavailable);
    setText(this.flyLabel, air ? (p.move === 'DESCENDING' ? 'LANDING' : 'LAND') : 'FLY');
    setText(this.flySec, `${visibleSeconds}s`);
    const flyAria = air ? 'Land' : `Fly, ${remainS.toFixed(1)} seconds left${unavailable ? ', unavailable: ' + unavailable : ''}`;
    if (this.fly.getAttribute('aria-label') !== flyAria) this.fly.setAttribute('aria-label', flyAria);
    const frac = l.remainingTicks / l.initialTicks;
    this.meterFill.style.transform = `scaleX(${frac.toFixed(4)})`;
    const reserve = air ? Math.min(l.remainingTicks, p.reserveTicks) : (l.remainingTicks > 0 ? Math.min(l.remainingTicks, predictAscentTicks() + predictTicksToTouchdown(FLIGHT.minFlightAltitude, FLIGHT.maxClimbRate) + FLIGHT.uncertaintyMarginTicks) : 0);
    this.meterRes.style.transform = `translateX(${(((l.remainingTicks - reserve) / l.initialTicks) * 100).toFixed(2)}%) scaleX(${(reserve / l.initialTicks).toFixed(4)})`;
    setText(this.meterLbl, `Boost ${visibleSeconds} s`);
    const charging = !air && p.speed >= FLIGHT.rechargeMinSpeed && !!p.surface?.onCarriageway && l.remainingTicks < l.initialTicks;
    const why = air
      ? (p.landingSoon || p.move === 'DESCENDING' ? (p.protectedLandingUsed ? 'Protected landing — boost empty' : 'Landing soon — reserve in use') : forecastText(p.forecast.state, p.forecast.reason))
      : charging ? 'Recharging' : unavailable === 'Flight power used' || unavailable?.includes('Not enough') ? 'Drive to recharge' : '';
    setText(this.meterWhy, why);
    this.meterWhy.classList.toggle('hidden', !why);
    this.meter.classList.toggle('airborne', air);
    this.meter.classList.toggle('charging', charging);
    this.meter.title = air ? `Landing reserve ${(reserve / SIM_HZ).toFixed(1)} seconds` : `${unavailable ? `${unavailable}. ` : ''}Drive 10 seconds on the road to recharge 2.5 seconds of boost.`;
    setText(this.reserveLabel, air ? `▨ ${(reserve / SIM_HZ).toFixed(1)}s` : '');
    this.banner.classList.toggle('hidden', !(air && p.landingSoon));
    this.banner.textContent = 'Landing soon';
    // hold
    const showHold = s.holdActive || (!!s.holdHint && !s.canInteract);
    this.hold.classList.toggle('hidden', !showHold);
    if (showHold) {
      this.holdTxt.textContent = s.holdActive ? `${s.cargoLoaded ? 'Handing over pizza' : 'Collecting pizza'}… press ▲ to cancel` : s.holdHint!;
      this.holdBar.style.transform = `scaleX(${Math.min(1, s.holdTicks / 60)})`;
    }
    this.root.classList.toggle('interaction-state', s.canInteract || showHold);
    this.action.classList.toggle('hidden', !s.canInteract || s.holdActive);
    setText(this.action, `${s.actionLabel} · E`);
    const actionAria = `${s.actionLabel} (E)`;
    if (this.action.getAttribute('aria-label') !== actionAria) this.action.setAttribute('aria-label', actionAria);
    // ---- notices
    this.announceNotices(s.notices);
    // ---- 10 Hz text
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const left = s.remainingTicks / SIM_HZ;
    this.timer.textContent = fmt(Math.max(0, left));
    this.timer.classList.toggle('low', left < 20);
    const stop = s.currentStop;
    this.dest.textContent = stop ? `${s.cargoLoaded ? 'DELIVER' : 'PICK UP'} · ${stop.label} · ${fmtDist(s.routeRemainingM())}` : '';
    const showCargo = s.cargoLoaded;
    this.cargo.classList.toggle('hidden', !showCargo);
    this.cargo.textContent = `🍕 ${s.cargo.toFixed(0)}%`;
    this.cargo.title = `Pizza condition ${s.cargo.toFixed(0)}%${s.mission.cargo.failThreshold > 0 ? `; delivery fails below ${s.mission.cargo.failThreshold}%` : ''}`;
    this.cargo.setAttribute('aria-label', this.cargo.title);
    this.dest.title = this.dest.textContent;
    const m = s.maneuver;
    if (s.wrongWay) { this.manArrow.textContent = '⛔'; this.manD.textContent = 'Wrong way'; this.manN.textContent = 'Turn around where permitted'; }
    else if (s.outOfArea === 'warn') { this.manArrow.textContent = '⚠'; this.manD.textContent = 'Outside delivery area'; this.manN.textContent = 'Follow the marked return'; }
    else if (m) { this.manArrow.textContent = ARROWS[m.kind]; this.manD.textContent = fmtDist(m.distanceM); this.manN.textContent = m.kind === 'arrive' ? (stop?.label ?? '') : (m.roadName ?? 'unnamed road'); }
    this.speedV.textContent = String(Math.round(Math.abs(p.speed) * 3.6));
    this.gear.textContent = p.reverseEngaged ? 'R' : air ? 'AIR' : '';
    this.drawMinimap(s);
  }

  private announceNotices(notices: readonly SessionNotice[]) {
    const newest = notices.at(-1);
    if (newest === this.lastNotice) return;
    // Session keeps only its latest eight notices; its array length stops changing.
    // Object identity retains ordering even when several notices share a simulation tick.
    const previous = this.lastNotice ? notices.indexOf(this.lastNotice) : -1;
    for (let i = previous + 1; i < notices.length; i++) this.toast(notices[i].text, notices[i].kind);
    this.lastNotice = newest;
  }

  private drawMinimap(s: Session) {
    const c = this.minimap, g = c.getContext('2d')!;
    const W = c.width, H = c.height, p = s.player;
    const scale = 0.9; // px per metre (256 px ≈ 280 m)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    g.rotate(p.heading); // heading-up
    const tx = (x: number) => (x - p.x) * scale, tz = (z: number) => (z - p.z) * scale;
    const world = this.app.world!;
    g.lineCap = 'round';
    for (const seg of world.roads.segmentsNear(p.x, p.z).concat(world.roads.segmentsNear(p.x + 120, p.z), world.roads.segmentsNear(p.x - 120, p.z), world.roads.segmentsNear(p.x, p.z + 120), world.roads.segmentsNear(p.x, p.z - 120))) {
      g.strokeStyle = seg.road.level > 0 ? '#8a96a3' : '#5b6672';
      g.lineWidth = Math.max(2, seg.road.widthM * scale);
      g.beginPath(); g.moveTo(tx(seg.ax), tz(seg.az)); g.lineTo(tx(seg.bx), tz(seg.bz)); g.stroke();
    }
    for (const line of world.core.metroLines) {
      g.strokeStyle = line.color; g.lineWidth = 2; g.setLineDash([4, 3]);
      for (const pl of line.local) { g.beginPath(); pl.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.stroke(); }
      g.setLineDash([]);
    }
    if (s.route.length) {
      g.strokeStyle = '#35d0ff'; g.lineWidth = 4; g.beginPath();
      let first = true;
      for (const id of s.route.slice(s.routeIdx, s.routeIdx + 12)) {
        const e = world.nav.edges.get(id)!; const r = world.roads.roads.get(e.roadId)!;
        const pts = e.forward ? r.points : r.points.slice().reverse();
        for (const [x, z] of pts) { if (first) { g.moveTo(tx(x), tz(z)); first = false; } else g.lineTo(tx(x), tz(z)); }
      }
      g.stroke();
    }
    const stop = s.currentStop;
    if (stop) { g.fillStyle = '#ffb020'; g.beginPath(); g.arc(tx(stop.entrance[0]), tz(stop.entrance[1]), 6, 0, Math.PI * 2); g.fill(); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(W / 2, H / 2 - 9); g.lineTo(W / 2 + 6, H / 2 + 6); g.lineTo(W / 2 - 6, H / 2 + 6); g.closePath(); g.fill();
  }
}

function setText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text;
}

function forecastText(state: string, reason: string | null): string {
  if (state === 'clear') return '✓ landing clear';
  if (state === 'uncertain') return `? landing uncertain${reason ? ` (${reason.toLowerCase()})` : ''}`;
  if (state === 'blocked') return `✕ landing blocked${reason ? ` (${reason.toLowerCase()})` : ''}`;
  return '';
}
export function fmt(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
export function fmtDist(m: number): string { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`; }

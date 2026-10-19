import type { App } from '../app/app';
import type { MissionDef, ResultSummary } from '../missions/types';
import type { MapView } from './map';
import type { Session } from '../missions/session';
import { fmt, fmtDist } from './hud';
import type { BestRecord } from '../persistence/store';
import { LEVELS } from '../missions/levels';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** DOM menus and full-screen states (MASTER §20). Semantic buttons, keyboard focusable. */
export class Screens {
  private el: HTMLElement;
  constructor(private ui: HTMLElement, private app: App) {
    this.el = document.createElement('div');
    this.el.className = 'screens';
    ui.appendChild(this.el);
  }

  clear() { this.el.innerHTML = ''; }

  private set(html: string, dim = false): HTMLElement {
    this.el.innerHTML = `<div class="screen${dim ? ' dim' : ''}">${html}</div>`;
    const first = this.el.querySelector<HTMLElement>('button:not([disabled])');
    first?.focus({ preventScroll: true });
    return this.el.firstElementChild as HTMLElement;
  }
  private on(sel: string, fn: () => void) {
    this.el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => { this.app.audio.start(); this.app.audio.click(); fn(); }));
  }

  boot(status: string) {
    this.set(`<div class="brand">Metro Express<small>Hyderabad delivery</small></div>
      <div class="card" style="max-width:420px"><p>${esc(status)}</p><div class="progress"><div style="width:35%"></div></div></div>`);
  }

  error(message: string, detail: string, retry: (() => void) | null) {
    this.set(`<div class="card" style="margin-top:12vh"><h2>${esc(message)}</h2>
      <div class="notice-box err"><span class="mono">${esc(detail).slice(0, 600)}</span></div>
      <div class="row">${retry ? '<button class="btn primary" data-retry>Retry</button>' : ''}<button class="btn" data-back>Back</button></div></div>`, true);
    if (retry) this.on('[data-retry]', retry);
    this.on('[data-back]', () => (this.app.core ? this.app.toMenu() : location.reload()));
  }

  message(title: string, body: string, ok: () => void) {
    this.set(`<div class="card" style="margin-top:14vh"><h2>${esc(title)}</h2><p>${esc(body)}</p><button class="btn primary" data-ok>OK</button></div>`, true);
    this.on('[data-ok]', ok);
  }

  home(saved: any | null, saveError: string | null) {
    const a = this.app;
    const storeNote = a.store.reason ? `<div class="notice-box">${esc(a.store.reason)}</div>` : '';
    const savedNote = saveError ? `<div class="notice-box">${esc(saveError)}</div>` : '';
    const contMission = saved ? a.missions.find((m) => m.id === saved.missionId) : null;
    this.set(`<div class="brand">Metro Express<small>Hyderabad delivery</small></div>
      <p class="tagline">Pick up pizza, navigate Hyderabad traffic and earn short flights by driving.</p>
      ${storeNote}${savedNote}
      <div class="menu">
        ${contMission ? `<button class="btn primary" data-continue>Continue: ${esc(contMission.title)}</button>` : ''}
        <button class="btn ${contMission ? '' : 'primary'}" data-play>Play</button>
        <button class="btn" data-practice>Practice <span class="sub">${a.settings.practiceDone ? 'replay' : 'recommended first'}</span></button>
        <button class="btn" data-corridor>Corridor <span class="sub">Uppal – Tarnaka · Blue Line</span></button>
        <button class="btn" data-map>Map</button>
        <button class="btn" data-atlas>Explore Hyderabad</button>
        <button class="btn" data-settings>Settings</button>
        <button class="btn" data-credits>Credits &amp; data</button>
      </div>
      <p class="small" style="text-align:center;margin-top:18px">Map data © OpenStreetMap contributors (ODbL). Development build — see Credits for what is verified.</p>`);
    if (contMission) this.on('[data-continue]', () => a.continueSaved(saved));
    this.on('[data-play]', () => this.missionSelect());
    this.on('[data-practice]', () => { const p = a.missions.find((m) => m.practice); if (p) this.preview(p); });
    this.on('[data-corridor]', () => this.corridors());
    this.on('[data-map]', () => this.mapBrowse());
    this.on('[data-atlas]', () => a.openStreetAtlas());
    this.on('[data-settings]', () => this.settings(() => this.app.toMenu()));
    this.on('[data-credits]', () => this.credits());
  }

  corridors() {
    const net = this.app.isNetwork();
    const rows = net
      ? `<div class="mission"><div class="t">Red Line · Miyapur – LB Nagar <span class="pill ok">Playable</span></div><div class="m">Roads around the whole line.</div></div>
        <div class="mission"><div class="t">Blue Line · Nagole – Raidurg <span class="pill ok">Playable</span></div><div class="m">Roads around the whole line, including the Uppal skywalk area.</div></div>
        <div class="mission"><div class="t">Green Line · JBS Parade Ground – MG Bus Station <span class="pill ok">Playable</span></div><div class="m">Roads around the whole line.</div></div>
        <div class="mission"><div class="m">Roads, buildings and shop names come from Overture Maps open data (shop listings, not street-view checked). Treat them as provisional.</div></div>`
      : `<div class="mission"><div class="t">Blue Line · Uppal – Stadium – NGRI – Habsiguda – Tarnaka <span class="pill ok">Playable</span></div>
        <div class="m">Selected connected roads from bundled OpenStreetMap extracts. Geometry and names are source claims (provisional), not field-verified.</div></div>
        <div class="mission"><div class="t">Blue Line · rest (Nagole – Raidurg) <span class="pill plan">Planned</span></div><div class="m">Street data not yet acquired in this build.</div></div>
        <div class="mission"><div class="t">Red Line · Miyapur – LB Nagar <span class="pill plan">Planned</span></div><div class="m">Street data not yet acquired in this build.</div></div>
        <div class="mission"><div class="t">Green Line · JBS Parade Ground – MG Bus Station <span class="pill plan">Planned</span></div><div class="m">Street data not yet acquired in this build.</div></div>`;
    this.set(`<div class="card" style="margin-top:4vh"><h2>Corridors</h2>
      <div class="mission-list">${rows}</div><div class="divider"></div><button class="btn" data-back>Back</button></div>`);
    this.on('[data-back]', () => this.app.toMenu());
  }

  missionSelect() {
    const a = this.app;
    const prog = a.store.loadProgress();
    const bests = a.store.loadBests();
    const card = (m: MissionDef, locked = false) => {
      const done = prog.completed.includes(m.id);
      const best = Object.values(bests).find((b) => b.comparableKey.startsWith(`${m.id}@`));
      const areaText = m.fromArea && m.toArea ? (m.toArea !== m.fromArea ? `${m.fromArea} → ${m.toArea}` : m.fromArea) : '';
      const area = areaText && areaText !== m.title ? `<div class="m">${esc(areaText)}</div>` : '';
      return `<button class="mission" ${locked ? 'aria-disabled="true" disabled' : `data-m="${m.id}"`}><div class="t">${esc(m.title)} ${done ? '<span class="pill ok">✓ done</span>' : ''}</div>
        ${area}<div class="m">${esc(m.brief)}</div>
        <div class="m">${fmtDist(m.routeLengthM ?? 0)} · deadline ${fmt(m.deadlineSeconds)} · rechargeable boost · ${m.flightSeconds} s capacity · ${m.traffic} traffic${m.cargo.fragility > 1 ? ' · fragile' : ''}${m.stops.length > 1 ? ` · ${m.stops.length} stops` : ''}${best ? ` · best ${best.score}` : ''}</div></button>`;
    };
    const list = a.missions.filter((m) => !m.practice);
    let body: string;
    let title = 'Deliveries · Uppal – Tarnaka';
    if (list.some((m) => m.level)) {
      title = 'Deliveries · Hyderabad Metro';
      const doneLevel = (lv: number) => list.some((m) => m.level === lv && prog.completed.includes(m.id));
      body = LEVELS.map((L) => {
        const ms = list.filter((m) => m.level === L.level);
        if (!ms.length) return '';
        const prev = LEVELS.filter((p) => p.level < L.level && list.some((m) => m.level === p.level)).pop();
        const locked = !!prev && !doneLevel(prev.level) && !new URLSearchParams(location.search).has('unlock'); // ?unlock: testing aid
        return `<h3 class="lvl">Level ${L.level} · ${esc(L.title)} ${locked ? `<span class="pill plan">Locked — finish a Level ${prev!.level} delivery</span>` : ''}</h3>
          <p class="small">${esc(L.blurb)}</p>${ms.map((m) => card(m, locked)).join('')}`;
      }).join('');
    } else {
      body = list.map((m) => card(m)).join('');
    }
    this.set(`<div class="card" style="margin-top:2vh"><h2>${title}</h2>
      <div class="mission-list">${body}
      <div class="mission"><div class="t">Choose the atmosphere in Settings</div><div class="m">Day, dusk or night, with clear skies or rain. Delivery routes and deadlines stay the same.</div></div></div>
      <div class="divider"></div><button class="btn" data-back>Back</button></div>`);
    this.el.querySelectorAll<HTMLElement>('[data-m]').forEach((b) => b.addEventListener('click', () => { a.audio.start(); a.audio.click(); this.preview(a.missions.find((m) => m.id === b.dataset.m)!); }));
    this.on('[data-back]', () => a.toMenu());
  }

  preview(m: MissionDef) {
    const a = this.app;
    const core = a.core!;
    const pick = core.deliveries.find((d) => d.id === m.pickupId)!;
    const stops = m.stops.map((id) => core.deliveries.find((d) => d.id === id)!);
    this.set(`<div class="card" style="margin-top:2vh"><h2>${esc(m.title)}</h2><p>${esc(m.brief)}</p>
      <dl class="kv">
        <dt>Pickup</dt><dd>${esc(pick.label)}</dd>
        <dt>${stops.length > 1 ? 'Stops (in order)' : 'Deliver to'}</dt><dd>${stops.map((s) => esc(s.label)).join(' → ')}</dd>
        <dt>Route</dt><dd>${fmtDist(m.routeLengthM ?? 0)} on real roads</dd>
        <dt>Deadline</dt><dd>${fmt(m.deadlineSeconds)}</dd>
        <dt>Traffic</dt><dd>${m.traffic}</dd>
        <dt>Cargo</dt><dd>${esc(m.cargo.label)}${m.cargo.fragility > 1 ? ` — fragile ×${m.cargo.fragility}, fails below ${m.cargo.failThreshold}%` : ''}</dd>
        <dt>Boost</dt><dd><b>Drive 10 seconds on the road to earn 2.5 seconds of flight.</b> Starts with 2.5 s; stores up to ${m.flightSeconds} s. Idle time earns nothing. Automatic descent protects landing.</dd>
      </dl>
      <div class="notice-box">Accept the order, drive to the restaurant, stop and press E or COLLECT PIZZA. Then follow the route to the customer, stop and press E or HAND OVER. Business listings and estimated entrances remain provisional until street-survey verified.</div>
      <div class="row"><button class="btn primary" data-go>Accept order</button><button class="btn" data-back>Back</button></div></div>`);
    this.on('[data-go]', () => void a.startMission(m));
    this.on('[data-back]', () => (m.practice ? a.toMenu() : this.missionSelect()));
  }

  loading(m: MissionDef, stage: string, frac: number) {
    const bar = this.el.querySelector<HTMLElement>('[data-lbar]');
    const st = this.el.querySelector<HTMLElement>('[data-lstage]');
    if (bar && st) { bar.style.width = `${Math.round(frac * 100)}%`; st.textContent = stage; return; }
    this.set(`<div class="card" style="margin-top:20vh;max-width:460px"><h2>${esc(m.title)}</h2><p data-lstage>${esc(stage)}</p>
      <div class="progress"><div data-lbar style="width:${Math.round(frac * 100)}%"></div></div>
      <p class="small">Loading never spends delivery time or flight.</p><button class="btn" data-cancel>Cancel</button></div>`, true);
    this.on('[data-cancel]', () => this.app.toMenu());
  }

  ready(m: MissionDef, resumed: boolean) {
    this.set(`<div class="card" style="margin-top:auto;margin-bottom:6vh;max-width:460px">
      <h2>${resumed ? 'Restored from your last saved checkpoint' : 'Order accepted. Drive to the restaurant.'}</h2>
      <p class="small">${esc(m.title)} · Rechargeable boost · ${fmt(m.deadlineSeconds)}. Left thumb steers. Right thumb: ▲ go, ▼ brake (hold when stopped to reverse), FLY. Let go and the car stops and holds. Keyboard: A/D or ←/→ steer, W/↑ go, S/↓ brake/reverse, Space fly/land, E collect/hand over, P pause, M map.</p>
      <div class="row"><button class="btn primary" data-start>${resumed ? 'Continue delivery' : 'Drive to pickup'}</button><button class="btn" data-back>Back</button></div></div>`, true);
    (this.el.firstElementChild as HTMLElement).style.background = 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(6,8,11,0.85))';
    this.on('[data-start]', () => this.app.beginCountdown());
    this.on('[data-back]', () => this.app.toMenu());
  }

  pause(reason: string) {
    const titles: Record<string, string> = {
      user: 'Paused', hidden: 'Paused while you were away', orientation: 'Rotate to landscape to continue', loading: 'Road still loading. Your delivery is paused.', stall: 'Paused after a long stall',
    };
    const loadingNote = reason === 'loading' ? '<p class="small" data-ln>Waiting for nearby road data… Resume becomes available when it arrives.</p>' : '';
    this.set(`<div class="card" style="max-width:440px"><h2>${titles[reason] ?? 'Paused'}</h2>${loadingNote}
      <p class="small">Time, traffic and flight are frozen.</p>
      <div class="menu" style="width:100%">
        <button class="btn primary" data-resume>Resume</button>
        <button class="btn" data-map>Map</button>
        <button class="btn" data-recover>Recover car (+3 s)</button>
        <button class="btn" data-restart>Restart delivery</button>
        <button class="btn" data-settings>Settings</button>
        <button class="btn" data-abandon>Abandon delivery</button>
      </div></div>`, true);
    this.on('[data-resume]', () => this.app.resume());
    this.on('[data-map]', () => { this.app.pause('map'); this.map(this.app.map!, this.app.session!); });
    this.on('[data-recover]', () => { this.app.resume(); this.app.session?.requestManualRecovery(); });
    this.on('[data-restart]', () => this.app.retry(true));
    this.on('[data-settings]', () => this.settings(() => this.pause(reason)));
    this.on('[data-abandon]', () => this.app.abandon());
  }

  map(mv: MapView, s: Session | null) {
    mv.layer = 'traffic';
    mv.focusedPlaceIds.clear();
    const eta = s ? Math.max(1, Math.round(mv.etaSeconds(s) / 60)) : 0;
    const root = this.set(`<div class="mapwrap">
      <div class="mapbar"><h2 style="margin:0">Hyderabad</h2>
        <span class="map-eta">${s ? `About ${eta} min · traffic near you` : 'Explore the metro corridors'}</span>
        <button class="btn map-layer active" data-layer="traffic">Traffic</button><button class="btn map-layer" data-layer="streets">Streets</button><button class="btn map-layer" data-layer="research">Street review</button>
        <button class="btn" data-fitc>All streets</button><button class="btn" data-here>${s ? 'Near me' : 'All lines'}</button>
        <button class="btn primary" data-close>${s ? 'Resume' : 'Close'}</button></div>
      <canvas data-canvas aria-label="Hyderabad street and traffic map"></canvas>
      <div class="legend" data-map-legend></div></div>`);
    root.style.padding = '0';
    const c = this.el.querySelector<HTMLCanvasElement>('[data-canvas]')!;
    const legend = () => {
      const el=this.el.querySelector<HTMLElement>('[data-map-legend]')!;
      el.innerHTML=mv.layer==='traffic'
        ? '<span><i style="background:#4ca879"></i>Moving</span><span><i style="background:#f0ab32"></i>Slow</span><span><i style="background:#df5345"></i>Queueing</span><span><i style="background:repeating-linear-gradient(90deg,#858b91 0 4px,transparent 4px 8px)"></i>Metro</span><span>Traffic is the paused game snapshot near your car; other streets have no traffic reading.</span>'
        : mv.layer==='research'
        ? '<span><i style="background:#178578"></i>Both sides reviewed</span><span><i style="background:#dca03a"></i>Research started</span><span><i style="background:#b7bdc0"></i>Not reviewed</span>'
        : '<span><i style="background:#2467cf"></i>Your route</span><span><i style="background:#7c8992"></i>Business listing</span><span><i style="background:#b36b46"></i>Provisional façade</span><span><i style="background:#178578"></i>Checked placement</span>';
      el.innerHTML+='<span>Map data © OpenStreetMap contributors · Overture Maps</span>';
    };
    const draw = () => { const r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);c.width=r.width*dpr;c.height=r.height*dpr;mv.draw(c,s); };
    requestAnimationFrame(()=>{const r=c.getBoundingClientRect();mv.fitCorridor(r.width,r.height);if(s){mv.cx=s.player.x;mv.cz=s.player.z;mv.scale=.65;}legend();draw();});
    let drag: {x:number;y:number}|null=null;
    c.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};c.setPointerCapture(e.pointerId);});
    c.addEventListener('pointermove',e=>{if(!drag)return;mv.cx-=(e.clientX-drag.x)/mv.scale;mv.cz-=(e.clientY-drag.y)/mv.scale;drag={x:e.clientX,y:e.clientY};draw();});
    c.addEventListener('pointerup',()=>drag=null);c.addEventListener('pointercancel',()=>drag=null);
    c.addEventListener('wheel',e=>{mv.scale=Math.max(.015,Math.min(6,mv.scale*(e.deltaY<0?1.2:1/1.2)));draw();e.preventDefault();},{passive:false});
    this.el.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach(b=>b.addEventListener('click',()=>{mv.layer=b.dataset.layer as typeof mv.layer;this.el.querySelectorAll('[data-layer]').forEach(el=>el.classList.toggle('active',el===b));legend();draw();}));
    this.on('[data-fitc]',()=>{const r=c.getBoundingClientRect();mv.fitCorridor(r.width,r.height);draw();});
    this.on('[data-here]',()=>{if(s){mv.cx=s.player.x;mv.cz=s.player.z;mv.scale=.85;}else{const r=c.getBoundingClientRect();mv.fitNetwork(r.width,r.height);}draw();});
    this.on('[data-close]',()=>s?this.app.resume():this.app.toMenu());
  }

  mapBrowse() { this.map(this.app.map!, null); }

  results(r: ResultSummary, m: MissionDef, best: { isBest: boolean; previous: BestRecord | null }) {
    const ok = r.outcome.success;
    const pen = r.penalties.length ? r.penalties.map((p) => `<li>${esc(p.reason)}${p.seconds ? ` +${p.seconds.toFixed(0)} s` : ''}${p.cargo ? ` · cargo −${p.cargo}` : ''}</li>`).join('') : '<li>None</li>';
    const recNote = m.practice ? 'Practice — not scored.' : r.debugUsed ? 'Debug tools were used: not recorded as a personal best.' : r.resumed ? 'Resumed run: kept separate from uninterrupted records.' : best.isBest ? '★ New local personal best' : best.previous ? `Local best: ${best.previous.score}` : '';
    this.set(`<div class="card" style="margin-top:3vh"><h2 style="color:${ok ? 'var(--good)' : 'var(--bad)'}">${ok ? '✓ Delivered' : '✕ ' + esc(r.outcome.reason)}</h2>
      <dl class="kv">
        <dt>Charged time</dt><dd>${fmt(r.chargedSeconds)} / ${fmt(r.deadlineSeconds)} deadline</dd>
        <dt>Cargo</dt><dd>${r.cargo.toFixed(0)}%</dd>
        <dt>Boost used</dt><dd>${r.flightUsedSeconds.toFixed(1)} s used · ${(r.flightEarnedSeconds ?? 0).toFixed(1)} s earned · ${r.flightLeftSeconds.toFixed(1)} s left · ${r.launches} launch${r.launches === 1 ? '' : 'es'}</dd>
        <dt>Penalties</dt><dd>${r.penaltySeconds.toFixed(0)} s</dd>
      </dl>
      <details style="margin-top:10px"><summary>Details</summary>
        <dl class="kv" style="margin-top:8px">
          <dt>Active driving time</dt><dd>${r.activeSeconds.toFixed(1)} s</dd>
          <dt>Distance driven</dt><dd>${fmtDist(r.routeDistanceM)}</dd>
          <dt>Recoveries</dt><dd>${r.recoveries}</dd>
          <dt>Score</dt><dd>${r.score} = ${r.scoreBreakdown.map((b) => `${b.label} ${b.value}`).join(' + ') || '0'}</dd>
          <dt>Seed</dt><dd class="mono">${r.seed}</dd>
        </dl><ul class="small">${pen}</ul></details>
      <p class="small">${recNote}</p>
      <div class="row"><button class="btn primary" data-retry>Retry same challenge</button><button class="btn" data-new>New variation</button></div>
      <div class="row" style="margin-top:10px"><button class="btn" data-another>Another delivery</button><button class="btn" data-menu>Menu</button></div></div>`, true);
    this.on('[data-retry]', () => this.app.retry(true));
    this.on('[data-new]', () => this.app.retry(false));
    this.on('[data-another]', () => { this.app.toMenu(); this.missionSelect(); });
    this.on('[data-menu]', () => this.app.toMenu());
  }

  lesson(title: string, text: string) {
    this.set(`<div class="card" style="max-width:480px;margin-top:auto;margin-bottom:8vh"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="row"><button class="btn primary" data-ok>Got it</button><button class="btn" data-skip>Skip tips</button></div><p class="small">The world is paused while you read.</p></div>`, true);
    (this.el.firstElementChild as HTMLElement).style.background = 'rgba(6,8,11,0.35)';
    this.on('[data-ok]', () => this.app.resume());
    this.on('[data-skip]', () => { this.app.tutorial = null; this.app.resume(); });
  }

  contextLost(restored: boolean) {
    this.set(`<div class="card" style="max-width:440px"><h2>Graphics were interrupted</h2>
      <p>${restored ? 'Graphics are back. Your delivery is paused and safe.' : 'Waiting for the browser to restore graphics… Your delivery is paused.'}</p>
      <div class="row"><button class="btn primary" data-res ${restored ? '' : 'disabled'}>Resume</button><button class="btn" data-reload>Reload from checkpoint</button></div></div>`, true);
    this.on('[data-res]', () => this.app.resumeAfterContext());
    this.on('[data-reload]', () => location.reload());
  }

  settings(back: () => void) {
    const s = this.app.settings;
    const chk = (k: keyof typeof s, label: string) => `<label class="btn"><span>${label}</span><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></label>`;
    const rng = (k: keyof typeof s, label: string, min: number, max: number, step: number) => `<label class="btn" style="flex-direction:column;align-items:stretch"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></label>`;
    this.set(`<div class="card" style="margin-top:2vh"><h2>Settings</h2>
      <div class="menu" style="width:100%">
        ${rng('sensitivity', 'Steering sensitivity', 0.5, 2, 0.1)}
        ${rng('sfxVolume', 'Effects volume', 0, 1, 0.05)}${rng('musicVolume', 'Music volume', 0, 1, 0.05)}${rng('uiVolume', 'Interface volume', 0, 1, 0.05)}
        ${chk('haptics', 'Haptics (where supported)')}${chk('reducedShake', 'Reduce camera shake')}${chk('reducedFlashing', 'Reduce flashing')}${chk('largeText', 'Larger text')}
        <label class="btn"><span>Controls layout</span><select data-k="handedness"><option value="right" ${s.handedness === 'right' ? 'selected' : ''}>Steer left / buttons right</option><option value="left" ${s.handedness === 'left' ? 'selected' : ''}>Buttons left / steer right</option></select></label>
        <label class="btn"><span>Graphics (applies on reload)</span><select data-k="quality">${['auto', 'low', 'standard', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
        <label class="btn"><span>Time of day</span><select data-k="timeOfDay">${['day','dusk','night'].map(q=>`<option value="${q}" ${s.timeOfDay===q?'selected':''}>${q[0].toUpperCase()+q.slice(1)}</option>`).join('')}</select></label>
        <label class="btn"><span>Weather</span><select data-k="weather"><option value="clear" ${s.weather==='clear'?'selected':''}>Clear</option><option value="rain" ${s.weather==='rain'?'selected':''}>Rain</option></select></label>
      </div>
      <p class="small">Settings never change a contract's deadline or flight allocation. ${this.app.store.available ? 'Saved on this device only.' : 'Saving unavailable: settings last for this session.'}</p>
      <button class="btn primary" data-back>Done</button></div>`, true);
    this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.k as keyof typeof s;
      const v = inp instanceof HTMLInputElement && inp.type === 'checkbox' ? inp.checked : inp instanceof HTMLInputElement && inp.type === 'range' ? Number(inp.value) : inp.value;
      (s as any)[k] = v;
      this.app.applySettings();
    }));
    this.on('[data-back]', back);
  }

  credits() {
    const core = this.app.core!;
    this.set(`<div class="card" style="margin-top:2vh"><h2>Credits &amp; data</h2>
      ${this.app.isNetwork()
        ? `<p><b>Map data.</b> Road network, turn restrictions, building footprints and metro alignments: © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright), distributed through the Overture Maps Foundation (release 2026-09-23.1, overturemaps.org). Some road segments come from TomTom Orbis Maps and some footprints from Microsoft ML Buildings and Google Open Buildings, as recorded in the Overture source entries. The map database in this game is an ODbL derivative and, if redistributed, is offered under ODbL 1.0.</p>
      <p><b>Business listings</b> (shop signboards and delivery names): © Overture Maps Foundation, CDLA-Permissive-2.0, contributed by Meta, Microsoft, Foursquare (Apache-2.0), AllThePlaces (CC0-1.0), DAC and PinMeTo. They are listings, not verified street signs; names and positions can be out of date.</p>`
        : `<p><b>Map data</b> © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0) — openstreetmap.org/copyright. Roads, buildings, metro alignments, station and place names come from dated OSM extracts bundled with this build. They are source claims: not field-verified, and storefront inventory is incomplete.</p>`}
      <p><b>Textures</b>: aerial_asphalt_01 and concrete_wall_006 from Poly Haven (CC0). <b>Font</b>: Noto Sans Telugu (SIL Open Font License 1.1).</p>
      ${this.app.loader.accuracy?'<p><b>Building height estimates</b>: Google Research, <a href="https://sites.research.google/gr/open-buildings/temporal/" target="_blank" rel="noopener noreferrer">Open Buildings 2.5D Temporal</a>, 2023, CC BY 4.0. Derived from Copernicus Sentinel-2 data processed by ESA. This game masks low-presence pixels and takes robust footprint medians at 4 m effective resolution. These are model estimates with possible roof offsets, not measured Hyderabad dimensions; source dimensions and researched profiles take priority.</p>':''}
      <p><b>Vehicle, buildings, traffic, audio and UI</b>: original procedural work for this game. The car is a fictional Roadster-inspired design; no manufacturer endorsement. Delivery brand "Metro Express" is fictional.</p>
      <h3>What this build covers</h3>
      <p class="small">${this.app.isNetwork() ? `Playable: ${core.roads.length} road segments around all three metro lines (Red, Blue, Green).` : `Playable: ${core.roads.length} road segments around the Blue Line from Uppal to Tarnaka. Planned, not yet built: the rest of the Blue Line, the Red Line and the Green Line street networks.`} Building heights, lane details, metro deck and pillar heights are provisional estimates.</p>
      ${this.app.loader.listingIndex?`<p class="small">${this.app.loader.listingIndex.count.toLocaleString()} named source points form the citywide listing index. Researched replacements and suppressions apply to map and search; grey markers preserve the remaining source coordinates. A nearest road association helps orientation; it does not establish the shop side, floor, entrance or current operation.</p>`:''}
      <button class="btn" data-back>Back</button></div>`);
    this.on('[data-back]', () => this.app.toMenu());
  }
}

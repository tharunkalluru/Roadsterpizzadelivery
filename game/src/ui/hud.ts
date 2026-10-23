// DOM heads-up display. Plain DOM keeps it crisp on phones and easy to restyle.
const CSS = `
:root{--ink:#17132B;--panel:rgba(23,19,43,.88);--line:#3A3160;--cream:#F6EEDC;--muted:#CFC6E4;--saffron:#FFB627;--teal:#45E3D3;--heat:#FF7A3D;--pink:#FF8FB1;--display:'Bungee','Arial Black',system-ui,sans-serif;--body:'Baloo 2','Noto Sans Telugu','Trebuchet MS',system-ui,sans-serif}
#hud{position:fixed;inset:0;pointer-events:none;z-index:5;color:var(--cream);font-family:var(--body);-webkit-user-select:none;user-select:none}
#hud .pe{pointer-events:auto}
.h-tl{position:absolute;left:max(12px,env(safe-area-inset-left,0px));top:max(10px,env(safe-area-inset-top,0px));width:min(320px,42vw);display:flex;flex-direction:column;gap:8px}
.card{background:var(--panel);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.card .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.k{font-family:var(--display);font-size:12px;letter-spacing:.04em;color:var(--saffron)}
.big{font-weight:800;font-size:15px;line-height:1.15}
.sm{font-size:12px;color:var(--muted);line-height:1.25}
.bar{height:9px;border-radius:5px;background:#2E2550;overflow:hidden}.bar>i{display:block;height:100%}
.slices{display:flex;gap:3px}.slices i{flex:1;height:9px;border-radius:3px;background:var(--saffron)}.slices i.off{background:var(--line)}
.h-tc{position:fixed;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top,0px));display:flex;gap:8px;align-items:center}
@media (max-width:860px){.h-tc{position:static;transform:none;flex-wrap:wrap}}
.dev{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(96px,calc(env(safe-area-inset-bottom,0px) + 96px));background:rgba(0,0,0,.72);color:#9ff5c8;font:12px/1.35 ui-monospace,Menlo,monospace;padding:6px 9px;border-radius:8px;white-space:pre;pointer-events:none}
.dev[hidden]{display:none}
.pill{height:36px;padding:0 12px;border-radius:18px;background:var(--panel);display:flex;align-items:center;gap:8px;font-family:var(--display);font-size:14px;white-space:nowrap}
.h-tr{position:absolute;right:max(12px,env(safe-area-inset-right,0px));top:max(10px,env(safe-area-inset-top,0px));display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.btnrow{display:flex;gap:6px}
.ib{height:38px;min-width:38px;padding:0 10px;border:0;border-radius:11px;background:var(--panel);color:var(--cream);font-family:var(--display);font-size:12px;cursor:pointer}
.ib:focus-visible,.btn:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
#minimap{width:168px;height:168px;border-radius:50%;border:3px solid var(--cream);background:#1B1633}
.toast{position:absolute;left:50%;top:max(78px,17%);transform:translate(-50%,-50%) rotate(-3deg);font-family:var(--display);font-size:clamp(20px,3.6vw,34px);color:var(--saffron);text-shadow:0 3px 0 #0C0A1A;opacity:0;transition:opacity .25s,transform .25s;white-space:nowrap}
.toast.show{opacity:1;transform:translate(-50%,-62%) rotate(-3deg)}.toast.teal{color:var(--teal)}.toast.pink{color:var(--pink)}
.prompt{position:absolute;left:50%;bottom:max(120px,calc(env(safe-area-inset-bottom,0px) + 110px));transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:var(--panel);border-radius:16px;padding:10px 16px;font-weight:800;font-size:16px}
.prompt[hidden],.offer[hidden],.modal[hidden]{display:none}
.ring{width:30px;height:30px;border-radius:50%;background:conic-gradient(var(--saffron) var(--p,0%),#2E2550 0)}
.offer{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);max-height:calc(100% - 150px);overflow:auto;width:min(420px,88vw);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:10px}
.btn{height:46px;border:0;border-radius:13px;font-family:var(--display);font-size:15px;cursor:pointer;padding:0 14px}
.btn.go{background:var(--saffron);color:var(--ink);box-shadow:0 4px 0 #B8780A}.btn.alt{background:#2E2550;color:var(--cream)}
.modal{position:absolute;inset:0;z-index:9;background:rgba(12,10,26,.78);display:grid;place-items:center;pointer-events:auto;padding:16px}
.sheet{box-sizing:border-box;width:min(720px,100%);max-height:86vh;overflow:auto;background:#1E1937;border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px}
.sheet h2{margin:0;font-family:var(--display);font-weight:400;font-size:24px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:10px}
.opt{background:#2A2347;border:2px solid transparent;border-radius:12px;padding:10px;color:var(--cream);text-align:left;font-family:var(--body);cursor:pointer;display:flex;flex-direction:column;gap:2px}
.opt[aria-pressed=true]{border-color:var(--saffron)}.opt:disabled{opacity:.45;cursor:not-allowed}
.seg{display:flex;gap:6px;flex-wrap:wrap}.seg .opt{flex-direction:row;align-items:center;justify-content:center;min-width:64px;font-weight:800}
.touch{display:none}.is-touch .touch{display:block}.is-touch .keys{display:none}
/* the browser must not turn a thumb on the controls (or the scene) into a scroll / zoom / long-press menu */
.touch,.touch *,.stick,.tb,#game canvas,#hud .pe{touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.tb.on{filter:brightness(1.15);transform:translateY(3px)}
.stick{position:absolute;left:max(18px,env(safe-area-inset-left,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));width:140px;height:140px;border-radius:50%;border:3px solid rgba(246,238,220,.4);background:rgba(23,19,43,.3)}
.stick i{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(246,238,220,.85)}
.tb{position:absolute;border:0;border-radius:50%;font-family:var(--display);color:var(--ink);cursor:pointer}
.keys{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));background:var(--panel);border-radius:12px;padding:7px 11px;font-size:12px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;max-width:62vw}
.keys b{font-family:var(--display);font-size:10px;color:var(--cream);background:var(--line);border-radius:4px;padding:1px 5px;font-weight:400}
.speed{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));font-family:var(--display);font-size:28px;text-shadow:0 3px 0 #0C0A1A}
.is-touch .speed{bottom:auto;top:250px}
.attr{position:absolute;right:8px;bottom:2px;font-size:9px;color:rgba(246,238,220,.55)}
@media (max-width:760px){.h-tl{width:200px}#minimap{width:120px;height:120px}.pill{font-size:12px;height:32px}.toast{top:44%;white-space:normal;text-align:center;width:min(92vw,520px);font-size:clamp(18px,5vw,26px)}}
@media (max-width:700px){.keys{display:none}}
/* phones in landscape and other short screens: everything smaller and out of the middle */
@media (max-height:520px){
  .h-tl{width:min(230px,34vw);gap:5px}.card{padding:7px 9px;gap:3px}.big{font-size:13px}.sm{font-size:11px}.k{font-size:10px}
  .pill{height:28px;font-size:11px;padding:0 9px}.ib{height:32px;font-size:11px}.h-tr{gap:5px}
  #minimap{width:96px;height:96px}.keys{display:none}.speed{font-size:20px}.is-touch .speed{top:auto;bottom:max(8px,env(safe-area-inset-bottom,0px));right:50%;transform:translateX(50%)}
  .offer{top:50%;width:min(420px,60vw);padding:10px;gap:5px;max-height:calc(100% - 16px)}.offer .hint{display:none}.offer .btn{height:38px;font-size:13px}
  .toast{top:30%;font-size:clamp(16px,3.4vw,24px)}
  .prompt{bottom:max(14px,env(safe-area-inset-bottom,0px));font-size:13px;padding:7px 12px}
  .stick{width:112px;height:112px}.stick i{width:46px;height:46px;margin:-23px 0 0 -23px}
  #t-gas{width:76px!important;height:76px!important}#t-brake{width:58px!important;height:58px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 86px)!important}
  #t-fly{width:54px!important;height:54px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 152px)!important;bottom:max(18px,env(safe-area-inset-bottom,0px))!important}
  #t-act{width:52px!important;height:52px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 12px)!important;bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 84px)!important}
  #minimap{width:76px;height:76px}.h-tr .card{padding:5px 8px!important;width:130px!important}
}
/* narrow portrait phones */
@media (max-width:440px){.h-tl{width:47vw}.h-tr .card{width:38vw!important}#minimap{width:104px;height:104px}.is-touch .speed{top:auto;bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 190px);right:22px;font-size:22px}}
.rotate{position:fixed;inset:0;z-index:20;background:#17132B;display:none;place-items:center;text-align:center;padding:24px;pointer-events:auto}
.rotate>div{display:flex;flex-direction:column;gap:12px;align-items:center;max-width:320px}
.rotate b{font-family:var(--display);font-weight:400;font-size:22px;color:var(--saffron)}.rotate span{color:var(--muted);font-size:15px}
.rotate svg{width:84px;height:84px;animation:rot 2.4s ease-in-out infinite}
@keyframes rot{0%,25%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait) and (pointer:coarse){.rotate{display:grid}}
.rotate.ok{display:none!important}
.tip{position:absolute;left:50%;transform:translateX(-50%);top:max(56px,calc(env(safe-area-inset-top,0px) + 52px));width:min(460px,70vw);background:rgba(23,19,43,.94);border:2px solid var(--teal);border-radius:14px;padding:9px 12px;display:flex;gap:10px;align-items:center;font-size:15px;font-weight:700;line-height:1.25}
.tip[hidden]{display:none}.tip>b{font-family:var(--display);font-weight:400;font-size:12px;color:var(--teal)}.tip>span{flex:1}
.tip>button{border:0;background:transparent;color:var(--muted);font-size:18px;cursor:pointer;min-width:32px;min-height:32px}
.ib svg{width:16px;height:16px;display:block}
.area-chip{position:absolute;left:50%;top:max(54px,calc(env(safe-area-inset-top,0px) + 50px));transform:translateX(-50%) translateY(-6px);background:#17703f;color:#fff;border:2px solid #fff;border-radius:8px;padding:5px 14px;font-family:var(--display);font-size:15px;letter-spacing:.03em;opacity:0;transition:opacity .4s,transform .4s;white-space:nowrap;pointer-events:none}
.area-chip small{display:block;font-family:var(--body);font-weight:700;font-size:11px;opacity:.85;letter-spacing:0}
.area-chip.show{opacity:1;transform:translateX(-50%) translateY(0)}
@media (max-height:520px){.area-chip{top:auto;bottom:max(10px,env(safe-area-inset-bottom,0px));font-size:12px}}
.rescue{position:absolute;left:50%;transform:translateX(-50%);bottom:max(64px,calc(env(safe-area-inset-bottom,0px) + 60px));height:46px;padding:0 18px;border:0;border-radius:23px;background:var(--teal);color:var(--ink);font-family:var(--display);font-size:14px;box-shadow:0 4px 0 #1E8F85;cursor:pointer;white-space:nowrap}
.rescue[hidden]{display:none}
@media (max-height:520px){.rescue{bottom:auto;top:44%;height:40px;font-size:12px}}.ib[hidden]{display:none}
@media (max-width:860px){.tip{top:auto;bottom:max(64px,calc(env(safe-area-inset-bottom,0px) + 60px));width:min(440px,86vw)}}
@media (max-width:860px) and (pointer:coarse){.tip{bottom:auto;top:max(10px,env(safe-area-inset-top,0px));width:min(400px,46vw)}}
@media (max-height:520px){.tip{top:max(46px,calc(env(safe-area-inset-top,0px) + 42px));width:min(380px,44vw);font-size:12px;padding:6px 9px}}
@media (prefers-reduced-motion:reduce){.toast{transition:none}.rotate svg{animation:none}}
`;

export class Hud {
  root: HTMLElement; el: Record<string, HTMLElement> = {}; toastT = 0;
  onButton: (id: string) => void = () => {};
  touchSteer = 0; touchGas = false; touchBrake = false; touchBoost = false;
  constructor(touch: boolean) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (touch) document.documentElement.classList.add('is-touch');
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="h-tl">
        <div class="h-tc"><div class="pill" id="clock">Day 1 · 8:00 AM</div><div class="pill" id="level">Level 1</div></div>
        <section class="card" id="order"><div class="k" id="o-state">Finding an order…</div><div class="big" id="o-title"></div><div class="sm" id="o-sub"></div>
          <div class="row"><span class="sm" id="o-dist"></span><span class="sm" id="o-time"></span></div>
          <div id="o-meters"><div class="row sm"><span id="o-heatl">Heat</span><span id="o-heatv"></span></div><div class="bar"><i id="o-heat" style="background:var(--heat)"></i></div>
          <div class="slices" id="o-slices" style="margin-top:6px"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        </section>
      </div>
      <div class="dev" id="dev" hidden></div>
      <div class="h-tr">
        <div class="btnrow pe"><button class="ib" id="b-theatre" type="button">Theatres</button><button class="ib" id="b-full" type="button" aria-label="Full screen" hidden><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"/></svg></button><button class="ib" id="b-help" type="button" aria-label="Pause, settings and help">II</button></div>
        <div class="pill"><span style="color:var(--saffron)">●</span><span id="coins">0</span> coins</div>
        <div class="card" style="width:160px;padding:7px 10px"><div class="row sm"><span style="color:var(--teal)">Flight boost</span><span id="fly-v">2.5 s</span></div><div class="bar"><i id="fly" style="background:var(--teal)"></i></div></div>
        <canvas id="minimap" class="pe" width="336" height="336" aria-label="Minimap. Tap to open the full map" role="button" tabindex="0" style="cursor:pointer"></canvas>
      </div>
      <div class="toast" id="toast" aria-live="polite"></div>
      <div class="prompt" id="prompt" hidden><div class="ring" id="ring"></div><span id="prompt-t"></span></div>
      <div class="offer pe" id="offer" hidden></div>
      <div class="keys"><span><b>W</b> drive</span><span><b>A D</b> steer</span><span><b>S</b> brake/reverse</span><span><b>Space</b> fly</span><span><b>E</b> collect / hand over / accept</span><span><b>T</b> theatres</span><span><b>M</b> map</span><span><b>H</b> horn</span><span><b>N</b> sound</span><span><b>Drag</b> look around when stopped</span><span><b>P</b> pause</span></div>
      <div class="speed"><span id="spd">0</span><small style="font-size:12px"> km/h</small></div>
      <div class="touch pe">
        <div class="stick" id="stick"><i id="knob"></i></div>
        <button class="tb" id="t-gas" type="button" style="right:max(18px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));width:92px;height:92px;background:var(--saffron);box-shadow:0 5px 0 #B8780A">GO</button>
        <button class="tb" id="t-brake" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 104px);bottom:max(18px,env(safe-area-inset-bottom,0px));width:70px;height:70px;background:#E9E4F2;box-shadow:0 4px 0 #9A93AE">BRAKE</button>
        <button class="tb" id="t-fly" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 14px);bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 106px);width:66px;height:66px;background:var(--teal);box-shadow:0 4px 0 #1E8F85">FLY</button>
        <button class="tb" id="t-act" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 96px);bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 92px);width:62px;height:62px;background:var(--pink);box-shadow:0 4px 0 #B85A78;font-size:12px">ACT</button>
      </div>
      <button type="button" class="rescue pe" id="rescue" hidden>Stuck? Get back on the road</button>
      <div class="area-chip" id="area-chip" aria-live="polite"></div>
      <div class="tip pe" id="tip" hidden><b>TIP</b><span id="tip-t"></span><button type="button" id="tip-x" aria-label="Hide tip">✕</button></div>
      <div class="modal" id="modal" hidden><div class="sheet" id="sheet"></div></div>
      <div class="rotate" id="rotate"><div><svg viewBox="0 0 64 64" fill="none" stroke="#F6EEDC" stroke-width="4"><rect x="20" y="6" width="24" height="52" rx="5"/><circle cx="32" cy="50" r="2" fill="#F6EEDC"/></svg><b>Turn your phone sideways</b><span>Pizza to Picture Hall is made for landscape: the controls sit under your thumbs.</span><button type="button" class="btn alt" id="rot-ok">Play like this anyway</button></div></div>
      <div class="attr">© OpenStreetMap contributors · Overture · Foursquare · Mapillary</div>`;
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n as HTMLElement;
    this.el['b-theatre'].addEventListener('click', () => this.onButton('theatres'));
    this.el['b-help'].addEventListener('click', () => this.onButton('pause'));
    this.el['b-full'].addEventListener('click', () => this.onButton('fullscreen'));
    this.el.rescue.addEventListener('click', () => this.onButton('rescue'));
    this.el['tip-x'].addEventListener('click', () => { this.tip(null); this.onButton('tip-close'); });
    this.el['rot-ok'].addEventListener('click', () => this.el.rotate.classList.add('ok'));
    // touch
    // steering stick: the finger keeps steering wherever it slides (pointer capture), the knob follows horizontally
    const stick = this.el.stick, knob = this.el.knob; let sid = -1, sx = 0;
    const R = () => stick.clientWidth * 0.4;
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); sid = e.pointerId; sx = e.clientX; try { stick.setPointerCapture(sid); } catch { /* ignore */ } });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId !== sid) return; e.preventDefault(); const r = R(), dx = Math.max(-r, Math.min(r, e.clientX - sx)); knob.style.transform = `translateX(${dx}px)`; this.touchSteer = dx / r; this.stickT = performance.now(); });
    const end = (e: PointerEvent) => { if (e.pointerId !== sid) return; sid = -1; knob.style.transform = ''; this.touchSteer = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end); stick.addEventListener('lostpointercapture', end);
    // held buttons stay held while the thumb wobbles off them; only lifting the finger releases
    const hold = (id: string, f: (v: boolean) => void) => {
      const b = this.el[id]; let pid = -1;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { b.setPointerCapture(pid); } catch { /* ignore */ } f(true); b.classList.add('on'); });
      const up = (e: PointerEvent) => { if (e.pointerId !== pid) return; pid = -1; f(false); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    };
    hold('t-gas', (v) => (this.touchGas = v)); hold('t-brake', (v) => (this.touchBrake = v));
    this.el['t-fly'].addEventListener('pointerdown', (e) => { e.preventDefault(); this.onButton('fly'); });
    this.el['t-act'].addEventListener('pointerdown', (e) => { e.preventDefault(); this.onButton('act'); });
    for (const n of this.root.querySelectorAll('.touch, .touch *')) n.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // optional tilt-to-steer (phone held in landscape like a steering wheel); the stick wins while it is being used
  stickT = 0; tilt = 0; tiltOn = false;
  async enableTilt(on: boolean) {
    this.tiltOn = on; this.tilt = 0;
    if (!on) return true;
    const D = (window as any).DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') { try { if ((await D.requestPermission()) !== 'granted') { this.tiltOn = false; return false; } } catch { this.tiltOn = false; return false; } }
    if (!this.tiltBound) {
      this.tiltBound = true;
      addEventListener('deviceorientation', (e) => {
        if (!this.tiltOn || e.beta == null || e.gamma == null) return;
        const ang = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
        const roll = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;     // tilting the phone like a wheel
        this.tilt = Math.max(-1, Math.min(1, roll / 22));
      });
    }
    return true;
  }
  tiltBound = false;
  get steer() { return this.tiltOn && performance.now() - this.stickT > 400 && this.touchSteer === 0 ? (Math.abs(this.tilt) < 0.08 ? 0 : this.tilt) : this.touchSteer; }
  set(id: string, text: string) { const e = this.el[id]; if (e && e.textContent !== text) e.textContent = text; }
  toast(text: string, cls = '') {
    const t = this.el.toast; t.textContent = text; t.className = 'toast show ' + cls;
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => (t.className = 'toast ' + cls), 1900);
  }
  prompt(text: string | null, progress = 0) {
    const p = this.el.prompt; p.hidden = !text; if (!text) return;
    this.set('prompt-t', text); this.el.ring.style.setProperty('--p', `${Math.round(progress * 100)}%`);
  }
  order(o: { state: string; title: string; sub: string; dist: string; time: string; heat?: number; slices?: number; meters: boolean }) {
    this.set('o-state', o.state); this.set('o-title', o.title); this.set('o-sub', o.sub); this.set('o-dist', o.dist); this.set('o-time', o.time);
    this.el['o-meters'].style.display = o.meters ? '' : 'none';
    if (o.meters && o.heat !== undefined) {
      this.el['o-heat'].style.width = `${Math.max(0, o.heat)}%`;
      this.set('o-heatv', `${Math.round(o.heat)}°`);
      this.set('o-heatl', `Heat · ${o.heat >= 70 ? 'GARAM' : o.heat >= 40 ? 'THEEK' : 'THANDA'}`);
      [...this.el['o-slices'].children].forEach((c, i) => c.classList.toggle('off', i >= (o.slices ?? 8)));
    }
  }
  offer(html: string | null, buttons: { label: string; cls: string; fn: () => void }[] = []) {
    const o = this.el.offer; o.hidden = !html; if (!html) return;
    o.innerHTML = html + `<div style="display:flex;gap:8px">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls}" data-i="${i}" style="flex:1">${b.label}</button>`).join('')}</div>`;
    o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => buttons[+b.dataset.i!].fn()));
  }
  modal(html: string | null, bind?: (sheet: HTMLElement) => void) {
    this.el.modal.hidden = !html; if (!html) return;
    this.el.sheet.innerHTML = html; bind?.(this.el.sheet);
  }
  get modalOpen() { return !this.el.modal.hidden; }
  rescue(show: boolean, text = '') {
    const b = this.el.rescue; if (b.hidden === !show && (!show || b.dataset.t === text)) return;
    b.hidden = !show; if (show) { b.dataset.t = text; b.textContent = text + (document.documentElement.classList.contains('is-touch') ? '' : ' (R)'); }
  }
  areaT = 0;
  areaChip(name: string) {
    const c = this.el['area-chip']; c.innerHTML = `<small>Entering</small>${name.replace(/[<>&]/g, '')}`; c.classList.add('show');
    clearTimeout(this.areaT); this.areaT = window.setTimeout(() => c.classList.remove('show'), 4200);
  }
  tip(text: string | null) { this.el.tip.hidden = !text; if (text) this.set('tip-t', text); }
}

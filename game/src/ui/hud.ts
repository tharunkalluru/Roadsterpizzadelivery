// DOM heads-up display. Plain DOM keeps it crisp on phones and easy to restyle.
import { DialogFocus } from './dialog';

// Reserve the measured HUD rails rather than guessing where the minimap ends.
// On portrait screens there is no usable column beside it, so use the space below both rails.
export function guidanceBounds(width: number, height: number, leftBottom: number, rightLeft: number, rightBottom: number, touch: boolean) {
  const gap = 12, bottom = height - (touch ? (height <= 520 ? 142 : 190) : width <= 700 || height <= 600 ? gap : 76);
  let right = Math.max(gap, rightLeft - gap), top = leftBottom + gap;
  if (right - gap < 260) { right = width - gap; top = Math.max(leftBottom, rightBottom) + gap; }
  // Tiny/zoomed windows scroll the guidance panel, never expand it over the HUD rails.
  return { left: gap, top, width: Math.max(0, right - gap), height: Math.max(0, bottom - top) };
}

export function orderOfferHtml(o: { level: number; pickupName: string; pickupRoad: string; customerName: string; approachMetres: number | null; approachEstimated?: boolean; deliveryMetres: number; deliverySeconds: number; basePay: number }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const metres = (n: number) => `${Math.round(n).toLocaleString('en-IN')} m`;
  return `<div class="k">New order · Level ${o.level}</div>
    <div class="big">Pick up at ${esc(o.pickupName)}</div>${o.pickupRoad ? `<div class="sm">${esc(o.pickupRoad)}</div>` : ''}
    <div class="sm offer-leg"><b>Drive to pickup:</b> ${o.approachMetres == null ? 'route unavailable' : `${o.approachEstimated ? 'about ' : ''}${metres(o.approachMetres)}`}</div>
    <div class="big">Deliver to ${esc(o.customerName)}</div>
    <div class="sm offer-leg"><b>Pickup → customer:</b> ${metres(o.deliveryMetres)}<br><b>Delivery window:</b> ${Math.round(o.deliverySeconds)} s after collection</div>
    <div class="sm">Base pay ${o.basePay} coins + tip · Pickup approach is untimed.</div>`;
}

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
.guidance{position:absolute;left:12px;top:210px;width:calc(100% - 220px);height:calc(100% - 286px);display:flex;flex-direction:column;justify-content:flex-end;align-items:center;pointer-events:none;overflow:hidden}
.offer{box-sizing:border-box;flex:0 1 auto;min-height:0;max-height:100%;overflow:hidden;width:min(420px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px}
.offer-content{min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:6px;touch-action:pan-y!important}.offer-content>*{flex-shrink:0}
.offer-leg b{color:var(--cream)}.offer-actions{display:flex;flex-shrink:0;gap:8px;padding-top:6px}.offer-actions .btn{flex:1;flex-shrink:0}
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
.touch,.touch *,.tb,#game canvas,#hud .pe{touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.tb.on{filter:brightness(1.15);transform:translateY(3px)}
.steering{position:absolute;left:max(18px,env(safe-area-inset-left,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;gap:10px}
.steering[hidden]{display:none!important}
.steering .tb{position:relative;width:64px;height:74px;border-radius:18px;background:var(--panel);color:var(--cream);border:2px solid rgba(246,238,220,.5);box-shadow:0 4px 0 #0C0A1A;display:grid;place-items:center}
.steering .tb svg{width:34px;height:34px;pointer-events:none}
.steering .tb:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
.steering .tb.on{background:var(--saffron);color:var(--ink);border-color:var(--saffron)}
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
  .offer{padding:10px;gap:5px}.offer .hint{display:none}.offer .btn{height:38px;font-size:13px}
  .toast{top:30%;font-size:clamp(16px,3.4vw,24px)}
  .prompt{bottom:max(14px,env(safe-area-inset-bottom,0px));font-size:13px;padding:7px 12px}
  .steering{gap:8px}.steering .tb{width:60px;height:64px}.steering .tb svg{width:30px;height:30px}
  #t-gas{width:76px!important;height:76px!important}#t-brake{width:58px!important;height:58px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 86px)!important}
  #t-fly{width:54px!important;height:54px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 152px)!important;bottom:max(18px,env(safe-area-inset-bottom,0px))!important}
  #t-act{width:52px!important;height:52px!important;right:calc(max(18px,env(safe-area-inset-right,0px)) + 12px)!important;bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 84px)!important}
  #minimap{width:76px;height:76px}.h-tr .card{padding:5px 8px!important;width:130px!important}
}
/* narrow portrait phones */
@media (max-width:440px){.h-tl{width:47vw}.h-tr .card{width:38vw!important}#minimap{width:104px;height:104px}.is-touch .speed{top:auto;bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 190px);right:22px;font-size:22px}}
@media (max-width:360px){.steering{left:max(12px,env(safe-area-inset-left,0px));gap:8px}.steering .tb{width:50px;height:64px}.steering .tb svg{width:28px;height:28px}}
.rotate{position:fixed;inset:0;z-index:20;background:#17132B;display:none;place-items:center;text-align:center;padding:24px;pointer-events:auto}
.rotate>div{display:flex;flex-direction:column;gap:12px;align-items:center;max-width:320px}
.rotate b{font-family:var(--display);font-weight:400;font-size:22px;color:var(--saffron)}.rotate span{color:var(--muted);font-size:15px}
.rotate svg{width:84px;height:84px;animation:rot 2.4s ease-in-out infinite}
@keyframes rot{0%,25%{transform:rotate(0)}55%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait) and (pointer:coarse){.rotate{display:grid}}
.rotate.ok{display:none!important}
/* Let an already-open menu finish before presenting the portrait rotation prompt. */
.modal:not([hidden])~.rotate{display:none}
.tip{box-sizing:border-box;flex:0 1 auto;min-height:0;max-height:min(88px,100%);overflow:auto;width:min(460px,100%);background:rgba(23,19,43,.94);border:2px solid var(--teal);border-radius:14px;padding:9px 12px;display:flex;gap:10px;align-items:center;font-size:15px;font-weight:700;line-height:1.25;touch-action:pan-y!important}
.has-offer .tip,.has-offer #order{display:none}
.is-touch #hud.has-offer .touch{display:none}
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
@media (max-height:600px){.tip{font-size:12px;padding:6px 9px;max-height:min(68px,100%)}}
@media (prefers-reduced-motion:reduce){.toast{transition:none}.rotate svg{animation:none}}
`;

export class Hud {
  root: HTMLElement; el: Record<string, HTMLElement> = {}; toastT = 0;
  private modalFocus: DialogFocus;
  private updateLayout = () => {};
  private controlReleases: (() => void)[] = [];
  onButton: (id: string) => void = () => {};
  onInputReset: () => void = () => {};
  rotationBlocked = false;
  touchLeft = false; touchRight = false; touchSteer = 0; touchGas = false; touchBrake = false; touchBoost = false;
  private resetInput = () => { this.resetControls(); this.onInputReset(); };
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
        <div class="card" style="width:160px;padding:7px 10px"><div class="row sm"><span style="color:var(--teal)">Flight</span><span id="fly-v">Unlimited</span></div><div class="bar"><i id="fly" style="background:var(--teal);width:100%"></i></div></div>
        <canvas id="minimap" class="pe" width="336" height="336" aria-label="Minimap. Tap to open the full map" role="button" tabindex="0" style="cursor:pointer"></canvas>
      </div>
      <div class="toast" id="toast" aria-live="polite"></div>
      <div class="prompt" id="prompt" hidden><div class="ring" id="ring"></div><span id="prompt-t"></span></div>
      <div class="guidance" id="guidance">
        <div class="offer pe" id="offer" role="region" aria-label="New delivery offer" hidden></div>
        <div class="tip pe" id="tip" hidden><b>TIP</b><span id="tip-t"></span><button type="button" id="tip-x" aria-label="Hide tip">✕</button></div>
      </div>
      <div class="keys"><span><b>W</b> drive</span><span><b>A D</b> steer</span><span><b>S</b> brake/reverse</span><span><b>Space</b> fly</span><span><b>E</b> collect / hand over / accept</span><span><b>T</b> theatres</span><span><b>M</b> map</span><span><b>H</b> horn</span><span><b>N</b> sound</span><span><b>Drag</b> look around when stopped</span><span><b>P</b> pause</span></div>
      <div class="speed"><span id="spd">0</span><small style="font-size:12px"> km/h</small></div>
      <div class="touch pe">
        <div class="steering" id="steering" role="group" aria-label="Arrow steering">
          <button class="tb" id="t-left" type="button" aria-label="Steer left" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M26 16H6M15 6 5 16l10 10"/></svg></button>
          <button class="tb" id="t-right" type="button" aria-label="Steer right" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16h20M17 6l10 10-10 10"/></svg></button>
        </div>
        <button class="tb" id="t-gas" type="button" style="right:max(18px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));width:92px;height:92px;background:var(--saffron);box-shadow:0 5px 0 #B8780A">GO</button>
        <button class="tb" id="t-brake" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 104px);bottom:max(18px,env(safe-area-inset-bottom,0px));width:70px;height:70px;background:#E9E4F2;box-shadow:0 4px 0 #9A93AE">BRAKE</button>
        <button class="tb" id="t-fly" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 14px);bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 106px);width:66px;height:66px;background:var(--teal);box-shadow:0 4px 0 #1E8F85">FLY</button>
        <button class="tb" id="t-act" type="button" style="right:calc(max(18px,env(safe-area-inset-right,0px)) + 96px);bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 92px);width:62px;height:62px;background:var(--pink);box-shadow:0 4px 0 #B85A78;font-size:12px">ACT</button>
      </div>
      <button type="button" class="rescue pe" id="rescue" hidden>Stuck? Get back on the road</button>
      <div class="area-chip" id="area-chip" aria-live="polite"></div>
      <div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Game menu" hidden><div class="sheet" id="sheet"></div></div>
      <div class="rotate" id="rotate"><div><svg viewBox="0 0 64 64" fill="none" stroke="#F6EEDC" stroke-width="4"><rect x="20" y="6" width="24" height="52" rx="5"/><circle cx="32" cy="50" r="2" fill="#F6EEDC"/></svg><b>Turn your phone sideways</b><span>Pizza to Picture Hall is made for landscape: the controls sit under your thumbs.</span><button type="button" class="btn alt" id="rot-ok">Play like this anyway</button></div></div>
      <div class="attr">© OpenStreetMap contributors · Overture · Foursquare · Mapillary</div>`;
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n as HTMLElement;
    this.modalFocus = new DialogFocus(this.el.modal, { restore: () => this.el['b-help'] });
    const left = this.root.querySelector('.h-tl')!, right = this.root.querySelector('.h-tr')!;
    const layout = () => {
      const root = this.root.getBoundingClientRect(), l = left.getBoundingClientRect(), r = right.getBoundingClientRect();
      const bounds = guidanceBounds(root.width, root.height, l.bottom - root.top, r.left - root.left, r.bottom - root.top, touch && !this.root.classList.contains('has-offer'));
      Object.assign(this.el.guidance.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    };
    const resize = new ResizeObserver(layout);
    this.updateLayout = layout;
    resize.observe(this.root); resize.observe(left); resize.observe(right); layout();
    this.el['b-theatre'].addEventListener('click', () => this.onButton('theatres'));
    this.el['b-help'].addEventListener('click', () => this.onButton('pause'));
    this.el['b-full'].addEventListener('click', () => this.onButton('fullscreen'));
    this.el.rescue.addEventListener('click', () => this.onButton('rescue'));
    this.el['tip-x'].addEventListener('click', () => { this.tip(null); this.onButton('tip-close'); });
    this.el['rot-ok'].addEventListener('click', () => { this.el.rotate.classList.add('ok'); this.rotationBlocked = false; });
    // Each held control owns its pointer, so steering and pedals can be used together.
    const hold = (id: string, f: (v: boolean) => void, enabled = () => true) => {
      const b = this.el[id]; let pid = -1; const keys = new Set<string>();
      const paint = () => {
        const active = pid !== -1 || keys.size > 0;
        f(active); b.classList.toggle('on', active); b.setAttribute('aria-pressed', String(active));
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); if (pid !== -1 || !enabled()) return;
        pid = e.pointerId; try { b.setPointerCapture(pid); } catch { /* pointer already ended */ } paint();
      });
      const releasePointer = () => {
        const id = pid; pid = -1;
        try { if (id !== -1 && b.hasPointerCapture(id)) b.releasePointerCapture(id); } catch { /* already released */ }
        paint();
      };
      this.controlReleases.push(() => { keys.clear(); releasePointer(); });
      const up = (e: PointerEvent) => { if (e.pointerId === pid) releasePointer(); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault(); e.stopPropagation(); if (!enabled()) return;
        keys.add(e.code); paint();
      });
      b.addEventListener('keyup', (e) => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault(); e.stopPropagation(); keys.delete(e.code); paint();
      });
      b.addEventListener('blur', () => { keys.clear(); paint(); });
    };
    const steer = () => { this.touchSteer = Number(this.touchRight) - Number(this.touchLeft); };
    hold('t-left', (v) => { this.touchLeft = v; steer(); }, () => !this.tiltOn);
    hold('t-right', (v) => { this.touchRight = v; steer(); }, () => !this.tiltOn);
    hold('t-gas', (v) => (this.touchGas = v)); hold('t-brake', (v) => (this.touchBrake = v));
    this.el['t-fly'].addEventListener('pointerdown', (e) => { e.preventDefault(); this.onButton('fly'); });
    this.el['t-act'].addEventListener('pointerdown', (e) => { e.preventDefault(); this.onButton('act'); });
    for (const n of this.root.querySelectorAll('.touch, .touch *')) n.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', this.resetInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.resetInput(); });
    const portraitTouch = matchMedia('(orientation: portrait) and (pointer: coarse)');
    const updateRotation = () => {
      this.rotationBlocked = portraitTouch.matches && !this.el.rotate.classList.contains('ok');
      if (this.rotationBlocked) this.resetInput();
    };
    portraitTouch.addEventListener('change', updateRotation);
    updateRotation();
  }
  // Also used by the game's keyboard reset; callbacks stay outside this method to avoid recursion.
  resetControls() {
    for (const release of this.controlReleases) release();
    this.touchGas = false; this.touchBrake = false; this.touchBoost = false; this.touchLeft = false; this.touchRight = false; this.touchSteer = 0; this.tilt = 0;
  }
  // Motion permission comes from a gesture; arrows remain usable until it succeeds.
  tilt = 0; tiltOn = false;
  private tiltRequest = 0;
  async enableTilt(on: boolean, requestPermission = true) {
    const request = ++this.tiltRequest;
    this.tiltOn = false; this.el.steering.hidden = false; this.resetInput();
    if (!on) return true;
    const D = (window as any).DeviceOrientationEvent;
    if (!D) return false;
    if (typeof D.requestPermission === 'function') {
      if (!requestPermission) return false;
      try { if ((await D.requestPermission()) !== 'granted') return false; } catch { return false; }
    }
    if (request !== this.tiltRequest) return false;
    this.resetInput(); // A thumb may have pressed an arrow while permission was pending.
    if (!this.tiltBound) {
      this.tiltBound = true;
      addEventListener('deviceorientation', (e) => {
        if (!this.tiltOn) return;
        if (typeof e.beta !== 'number' || !Number.isFinite(e.beta) || typeof e.gamma !== 'number' || !Number.isFinite(e.gamma)) { this.tilt = 0; return; }
        const ang = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
        const roll = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
        this.tilt = Math.max(-1, Math.min(1, roll / 22));
      });
    }
    this.tiltOn = true; this.el.steering.hidden = true;
    return true;
  }
  tiltBound = false;
  get steer() { return this.tiltOn ? (Math.abs(this.tilt) < 0.08 ? 0 : this.tilt) : this.touchSteer; }
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
    const o = this.el.offer; o.hidden = !html; this.root.classList.toggle('has-offer', !!html); this.updateLayout(); if (!html) return;
    o.innerHTML = `<div class="offer-content">${html}</div><div class="offer-actions">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls}" data-i="${i}">${b.label}</button>`).join('')}</div>`;
    o.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => buttons[+b.dataset.i!].fn()));
  }
  modal(html: string | null, bind?: (sheet: HTMLElement) => void) {
    this.el.modal.hidden = !html; if (!html) { this.modalFocus.hide(); return; }
    this.resetInput();
    this.el.sheet.innerHTML = html; bind?.(this.el.sheet);
    this.modalFocus.show();
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

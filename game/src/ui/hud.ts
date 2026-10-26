// DOM heads-up display. Plain DOM keeps it crisp on phones and easy to restyle.
import { DialogFocus } from './dialog';
import { controlIcon } from './control-icons';
import { installPrototypeTheme } from './theme';

export type ContextAction = 'collect' | 'handover' | 'theatre';

// A pointer must begin on the thumb and finish near the far end. A tap never accepts.
// Keyboard and assistive activation use the native button semantics separately.
export function bindDeliverySwipe(button: HTMLElement, accept: () => void, available: () => boolean) {
  let pointer = -1, startX = 0, startY = 0, travel = 1, progress = 0, cancelled = false, complete = false, lastPointer = -Infinity;
  const paint = (value: number) => { progress = value; button.style.setProperty('--swipe-x', `${Math.round(value * travel)}px`); button.style.setProperty('--swipe-progress', String(value)); };
  const release = () => {
    const id = pointer; pointer = -1;
    try { if (id !== -1 && button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch { /* capture already gone */ }
    paint(0); button.classList.remove('dragging');
  };
  const confirm = () => { if (!complete && available()) { complete = true; release(); accept(); } };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    if (Math.abs(event.clientY - startY) > Math.max(50, button.getBoundingClientRect().height)) cancelled = true;
    paint(cancelled ? 0 : Math.max(0, Math.min(1, (event.clientX - startX) / travel)));
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault(); event.stopPropagation();
    lastPointer = Date.now();
    if (complete || pointer !== -1 || !available() || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    const bounds = button.getBoundingClientRect(), thumb = Math.min(56, bounds.height - 10);
    if (event.clientX < bounds.left || event.clientX > bounds.left + thumb + 16) return;
    pointer = event.pointerId; startX = event.clientX; startY = event.clientY; travel = Math.max(1, bounds.width - thumb - 14); cancelled = false;
    try { button.setPointerCapture(pointer); } catch { release(); return; }
    paint(0); button.classList.add('dragging');
  });
  button.addEventListener('pointermove', (event) => { if (event.pointerId === pointer) { event.preventDefault(); event.stopPropagation(); move(event); } });
  button.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); event.stopPropagation(); move(event);
    const accepted = progress >= .86 && !cancelled; release(); if (accepted) confirm();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) button.addEventListener(type, (event) => { if ((event as PointerEvent).pointerId === pointer) release(); });
  button.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault(); event.stopPropagation(); if (!event.repeat) confirm();
  });
  button.addEventListener('keyup', (event) => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); event.stopPropagation(); } });
  button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); if (event.detail === 0 && Date.now() - lastPointer > 400) confirm(); });
  button.addEventListener('blur', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  return release;
}

// Reserve the measured HUD rails rather than guessing where the minimap ends.
// On portrait screens there is no usable column beside it, so use the space below both rails.
export function guidanceBounds(width: number, height: number, leftBottom: number, rightLeft: number, rightBottom: number, touch: boolean) {
  const gap = 12, bottom = height - (touch ? (height <= 520 ? 154 : 190) : width <= 700 || height <= 600 ? gap : 76);
  let right = Math.max(gap, rightLeft - gap), top = leftBottom + gap;
  if (right - gap < 260) { right = width - gap; top = Math.max(leftBottom, rightBottom) + gap; }
  // Tiny/zoomed windows scroll the guidance panel, never expand it over the HUD rails.
  return { left: gap, top, width: Math.max(0, right - gap), height: Math.max(0, bottom - top) };
}

export function orderOfferHtml(o: { level: number; pickupName: string; pickupRoad: string; customerName: string; approachMetres: number | null; approachEstimated?: boolean; deliveryMetres: number; deliverySeconds: number; basePay: number; orderId?: string }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const metres = (n: number) => `${Math.round(n).toLocaleString('en-IN')} m`;
  const approach = o.approachMetres == null ? 'Route unavailable' : `${o.approachEstimated ? 'About ' : ''}${metres(o.approachMetres)} to pickup`;
  const total = o.approachMetres == null ? 'Unavailable' : `${o.approachEstimated ? 'About ' : ''}${((o.approachMetres + o.deliveryMetres) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} km`;
  return `<header class="dispatch-heading"><span class="dispatch-bag">${controlIcon('bag')}</span><h2>New delivery</h2><span class="dispatch-id">${o.orderId ? esc(o.orderId) : `Level ${o.level}`}</span></header>
    <div class="dispatch-overview"><div class="dispatch-reward">${controlIcon('coin')}<div><strong>${o.basePay.toLocaleString('en-IN')} coins</strong><span>Base reward</span></div></div><div class="dispatch-total"><span>Total route</span><strong>${total}</strong><small>Tips may add extra</small></div></div>
    <div class="dispatch-stops">
      <div class="dispatch-stop pickup"><span class="stop-pin">${controlIcon('pin')}</span><div><span class="stop-label">Pickup</span><strong>${esc(o.pickupName)}</strong><span>${approach}</span>${o.pickupRoad ? `<small>${esc(o.pickupRoad)}</small>` : ''}</div></div>
      <div class="dispatch-stop dropoff"><span class="stop-pin">${controlIcon('pin')}</span><div><span class="stop-label">Drop-off</span><strong>${esc(o.customerName)}</strong><span>${metres(o.deliveryMetres)} after pickup</span></div></div>
    </div>
    <div class="dispatch-note">${controlIcon('info')}<span>Delivery timer starts after collection<small>Delivery window: ${Math.round(o.deliverySeconds)} s · Pickup approach is untimed.</small></span></div>`;
}

const CSS = `
:root{--ink:#17132B;--panel:rgba(23,19,43,.88);--line:#3A3160;--cream:#F6EEDC;--muted:#CFC6E4;--saffron:#FFB627;--teal:#45E3D3;--heat:#FF7A3D;--pink:#FF8FB1;--display:'Bungee','Arial Black',system-ui,sans-serif;--body:'Baloo 2','Noto Sans Telugu','Trebuchet MS',system-ui,sans-serif}
#hud{--touch-size:70px;--touch-gap:10px;--touch-left:max(18px,env(safe-area-inset-left,0px));--touch-right:max(18px,env(safe-area-inset-right,0px));--touch-bottom:max(18px,env(safe-area-inset-bottom,0px));position:fixed;inset:0;pointer-events:none;z-index:5;color:var(--cream);font-family:var(--body);-webkit-user-select:none;user-select:none}
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
.tb.on,.tb:active{filter:brightness(1.15);transform:translateY(3px) scale(.97)}
.steering{position:absolute;left:var(--touch-left);bottom:var(--touch-bottom);display:flex;gap:var(--touch-gap)}
.steering[hidden]{display:none!important}
.steering .tb{width:calc(var(--touch-size) + 12px);height:calc(var(--touch-size) + 12px);background:var(--panel);color:var(--cream);border:2px solid rgba(246,238,220,.5);box-shadow:0 4px 0 #0C0A1A}
.tb svg{width:40px;height:40px;pointer-events:none}
.tb:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
.steering .tb.on{background:var(--saffron);color:var(--ink);border-color:var(--saffron)}
.tb{box-sizing:border-box;position:relative;flex:none;width:var(--touch-size);height:var(--touch-size);display:grid;place-items:center;padding:0;border:0;border-radius:50%;font-family:var(--display);color:var(--ink);cursor:pointer}
.pedals{position:absolute;right:var(--touch-right);bottom:var(--touch-bottom);display:flex;align-items:flex-end;gap:var(--touch-gap)}
.touch-actions{position:absolute;right:calc(var(--touch-right) + var(--touch-size) + var(--touch-size) + 26px + var(--touch-gap) + var(--touch-gap));bottom:var(--touch-bottom);display:flex}
#t-gas{width:calc(var(--touch-size) + 26px);height:calc(var(--touch-size) + 26px);background:var(--saffron);box-shadow:0 4px 0 #B8780A;font-size:21px}
#t-brake{background:#E9E4F2;box-shadow:0 4px 0 #9A93AE;font-size:13px}
#t-fly{background:var(--teal);box-shadow:0 4px 0 #1E8F85;font-size:16px}
.prompt-copy{display:flex;align-items:center;gap:10px}
.context-action{display:none;position:relative;overflow:hidden;min-height:72px;min-width:220px;max-width:100%;padding:12px 24px 17px;border:2px solid var(--cream);border-radius:22px;background:var(--pink);color:var(--ink);font-family:var(--body);cursor:pointer;box-shadow:0 4px 0 #B85A78;touch-action:none}
.context-action[hidden]{display:none!important}
.context-action strong{font-family:var(--display);font-size:17px;font-weight:400}
.context-action small{font-size:13px;font-weight:800}
.context-action.on,.context-action:active{transform:scale(.97);filter:brightness(1.08)}
.context-action:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
.action-progress{position:absolute;inset:auto 0 0;height:6px;background:#B85A78}
.action-progress:after{content:'';display:block;height:100%;width:var(--p,0%);background:var(--cream)}
.is-touch .prompt{bottom:calc(var(--touch-bottom) + var(--touch-size) + var(--touch-size) + var(--touch-gap) + 12px);max-width:calc(100% - 32px);box-sizing:border-box;text-align:center}
.is-touch .prompt.has-action{top:54%;bottom:auto;transform:translate(-50%,-50%);padding:0;background:transparent}
.is-touch .prompt.has-action .prompt-copy{display:none}
.is-touch .prompt.has-action .context-action{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
@media (max-width:600px) and (orientation:portrait){.pedals{flex-direction:column;align-items:center}.touch-actions{left:var(--touch-left);right:auto;bottom:calc(var(--touch-bottom) + var(--touch-size) + 12px + var(--touch-gap))}}
.keys{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));background:var(--panel);border-radius:12px;padding:7px 11px;font-size:12px;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap;max-width:62vw}
.keys b{font-family:var(--display);font-size:10px;color:var(--cream);background:var(--line);border-radius:4px;padding:1px 5px;font-weight:400}
.speed{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));font-family:var(--display);font-size:28px;text-shadow:0 3px 0 #0C0A1A}
.is-touch .speed{bottom:auto;top:250px}
.attr{position:absolute;right:8px;bottom:2px;font-size:9px;color:rgba(246,238,220,.55)}
@media (max-width:760px){.h-tl{width:200px}#minimap{width:120px;height:120px}.pill{font-size:12px;height:32px}.toast{top:44%;white-space:normal;text-align:center;width:min(92vw,520px);font-size:clamp(18px,5vw,26px)}}
@media (max-width:700px){.keys{display:none}}
/* phones in landscape and other short screens: everything smaller and out of the middle */
@media (max-height:520px){
  #hud{--touch-size:58px;--touch-gap:8px}
  .h-tl{width:min(230px,34vw);gap:5px}.card{padding:7px 9px;gap:3px}.big{font-size:13px}.sm{font-size:11px}.k{font-size:10px}
  .pill{height:28px;font-size:11px;padding:0 9px}.ib{height:32px;font-size:11px}.h-tr{gap:5px}
  #minimap{width:96px;height:96px}.keys{display:none}.speed{font-size:20px}.is-touch .speed{top:auto;bottom:max(8px,env(safe-area-inset-bottom,0px));right:50%;transform:translateX(50%)}
  .offer{padding:10px;gap:5px}.offer .hint{display:none}.offer .btn{height:38px;font-size:13px}
  .toast{top:30%;font-size:clamp(16px,3.4vw,24px)}
  .prompt{bottom:max(14px,env(safe-area-inset-bottom,0px));font-size:13px;padding:7px 12px}
  .tb svg{width:36px;height:36px}
  #minimap{width:76px;height:76px}.h-tr .card{padding:5px 8px!important;width:130px!important}
}
/* narrow portrait phones */
@media (max-width:440px){.h-tl{width:47vw}.h-tr .card{width:38vw!important}#minimap{width:104px;height:104px}.is-touch .speed{top:auto;bottom:calc(max(18px,env(safe-area-inset-bottom,0px)) + 190px);right:22px;font-size:22px}}
@media (max-width:360px){#hud{--touch-left:max(12px,env(safe-area-inset-left,0px));--touch-right:max(12px,env(safe-area-inset-right,0px));--touch-gap:8px}.tb svg{width:36px;height:36px}}
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
.has-offer .prompt{display:none}
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
.is-touch .rescue{top:auto;bottom:calc(var(--touch-bottom) + var(--touch-size) + var(--touch-size) + var(--touch-gap) + 12px);max-width:calc(100% - 24px);font-size:12px}
@media (max-height:600px){.tip{font-size:12px;padding:6px 9px;max-height:min(68px,100%)}}
@media (prefers-reduced-motion:reduce){.toast{transition:none}.rotate svg{animation:none}}

/* Approved prototype: luminous rims, chunky icons and a separate cruise switch. */
#hud{--steer-size:clamp(78px,10.4vw,108px);--brake-size:clamp(72px,9vw,96px);--go-width:clamp(148px,19vw,222px);--go-height:clamp(78px,9.4vw,108px);--flight-height:52px;--cruise-height:38px;--stack-gap:10px}
.ui-icon{display:block;width:24px;height:24px;flex:none;pointer-events:none}
.steering{gap:18px}
.steering .tb{isolation:isolate;width:var(--steer-size);height:var(--steer-size);border:3px solid #6a528b;background:radial-gradient(circle at 34% 15%,#39284e 0,#211731 65%,#150e26 100%);box-shadow:inset 0 0 0 3px #30213e,inset 0 2px 5px #b591db55,0 4px 0 #130d21,0 0 16px #9f73d34d;color:var(--cream)}
.steering .tb:before{content:'';position:absolute;inset:5px;border:2px solid #b89bd859;border-radius:inherit;pointer-events:none}
.steering .tb svg{width:50%;height:50%;filter:drop-shadow(0 2px 0 #100b20)}
.steering .tb.on{background:radial-gradient(circle at 40% 20%,#6c4388,#2d1b4a);color:#fff3d9;border-color:#d1b2fa;box-shadow:inset 0 0 0 3px #38234c,0 0 22px #b48aff88}
.pedals{gap:14px;align-items:flex-end}
.tb{transition:transform 110ms ease-out,filter 110ms ease-out}
.tb.on,.tb:active{filter:brightness(1.08);transform:translateY(2px) scale(.97)}
#t-gas{width:var(--go-width);height:var(--go-height);border-radius:999px;border:3px solid #fff5c2;background:linear-gradient(135deg,#ffd52a 0%,#ffc500 48%,#ffad04 100%);box-shadow:inset 0 0 0 4px #ffbe16,inset 0 0 0 6px #d58c0a,0 0 0 3px #f7a82f,0 0 19px #ffb733b8,0 5px 0 #9d5b0d;color:#241335;font-size:clamp(29px,4.1vw,48px);letter-spacing:.02em;text-shadow:0 2px 0 #ffdf4b}
#t-brake{--brake-face:#e5d6ff;width:var(--brake-size);height:var(--brake-size);display:flex;flex-direction:column;gap:3px;justify-content:center;border:3px solid #382449;background:radial-gradient(circle at 35% 20%,#f7efff,#dac7f5 70%);box-shadow:inset 0 0 0 3px #ffffff4d,0 0 0 2px #b9a2d36b,0 4px 0 #241432;color:#211333;font-size:clamp(12px,1.8vw,17px)}
#t-brake .ui-icon{width:32%;height:32%}
.touch-actions{left:auto;right:var(--touch-right);bottom:calc(var(--touch-bottom) + var(--go-height) + 14px);width:var(--go-width);display:flex;flex-direction:column;gap:var(--stack-gap)}
#t-fly{width:100%;height:var(--flight-height);border-radius:999px;border:3px solid #1f1635;background:linear-gradient(145deg,#5bfff1,#21e9dd);box-shadow:inset 0 0 0 3px #c6fff65c,0 0 0 2px #7deee75c,0 0 17px #2be5db52,0 3px 0 #17102b;display:flex;align-items:center;justify-content:center;gap:12px;color:#1d1530;font-size:clamp(15px,2.2vw,23px)}
#t-fly .ui-icon{width:30px;height:30px}
#t-fly:disabled{cursor:default;filter:saturate(.6);opacity:.82;transform:none}
#t-fly:disabled .ui-icon{width:24px;height:24px}
#t-fly:disabled #fly-label{font-size:.84em}
#t-cruise{box-sizing:border-box;width:100%;height:var(--cruise-height);display:flex;align-items:center;justify-content:center;gap:8px;padding:0 10px;border:3px solid #7a648e;border-radius:999px;background:linear-gradient(145deg,#30223f,#170e29);box-shadow:inset 0 0 0 2px #140d20,0 0 0 2px #291b3c,0 3px 0 #130c1f;color:var(--cream);font-family:var(--display);font-size:clamp(11px,1.7vw,16px);cursor:pointer;touch-action:none}
.cruise-switch{width:38px;height:23px;padding:2px;box-sizing:border-box;background:#625a70;border:1px solid #91869e;border-radius:999px;flex:none}
.cruise-switch:before{content:'';display:block;width:17px;height:17px;border-radius:50%;background:#fbf8ed;box-shadow:0 1px 3px #08040e}
#t-cruise[aria-pressed=true]{background:linear-gradient(145deg,#075629,#052d1e);border-color:#45fa72;color:#77ff9c;box-shadow:inset 0 0 0 2px #07371e,0 0 14px #42ff794d,0 3px 0 #061f16}
#t-cruise[aria-pressed=true] .cruise-switch{background:#22df61;border-color:#72ff9c}
#t-cruise[aria-pressed=true] .cruise-switch:before{transform:translateX(14px)}
#t-cruise:focus-visible{outline:3px solid var(--teal);outline-offset:4px}
.is-touch .speed{top:auto;right:50%;bottom:var(--touch-bottom);transform:translateX(50%);padding:5px 12px;background:linear-gradient(145deg,#21172fdd,#160e26ee);border:1px solid #61486f88;border-radius:17px;font-size:clamp(22px,3.7vw,36px);text-shadow:0 2px 0 #0e0718}
.context-action{border-radius:999px;border-color:#ffe4f0;background:linear-gradient(135deg,#ff84bd,#f24c99);box-shadow:inset 0 0 0 3px #ffb4d24d,0 0 0 3px #a64b7f,0 0 20px #ff63af59,0 4px 0 #7b2e61}
.context-action strong{text-transform:uppercase}
.action-progress{background:#9e2b73}.action-progress:after{background:#fff0dd}
.toast{z-index:6;top:max(78px,15%);transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px;max-width:calc(100% - 32px);box-sizing:border-box;padding:8px 18px;border:2px solid #e8bf5b;background:linear-gradient(145deg,#392b28f5,#261a25f5);border-radius:999px;color:#fff0bb;box-shadow:0 0 18px #ffd02b3b;text-shadow:none;font-size:clamp(13px,1.8vw,21px);transition:opacity 180ms ease-out}
.toast.show{transform:translate(-50%,-50%)}
.toast.teal{border-color:#21b85a;background:linear-gradient(145deg,#09512d,#03351f);color:#c5ffda;box-shadow:0 0 16px #25eb6e59}
.toast.pink{border-color:#ef74b5;background:linear-gradient(145deg,#62274f,#371b39);color:#ffe4f0;box-shadow:0 0 14px #f44da94d}
.toast .ui-icon{padding:3px;width:20px;height:20px;box-sizing:border-box;border-radius:50%;background:currentColor;color:inherit}
.toast .toast-check{background:#55ef98;color:#06422a}
#hud #order{box-sizing:border-box;position:relative;overflow:hidden;min-width:0;border:1px solid #715080;border-radius:18px;padding:14px 16px;background:linear-gradient(135deg,#302039f5,#180f29ed);box-shadow:inset 0 1px 0 #b897cb45,0 4px 14px #100a204d;gap:5px}
.order-id{font-size:11px;color:var(--muted);font-weight:800}
#o-title{font-size:clamp(16px,2vw,24px);overflow-wrap:anywhere}
#o-sub{overflow-wrap:anywhere}
#o-state{color:#ffc326}
.order-distance{font-family:var(--display);font-size:clamp(22px,3.2vw,34px);line-height:1.2;color:#ffb82b}
.order-time{font-size:13px;color:var(--muted);font-weight:700}
.order-steps{display:flex;align-items:center;gap:5px;padding-top:8px;margin-top:5px;border-top:1px solid #725b8188;font-size:12px;font-weight:800;color:#8b7d9f}
.order-step{display:flex;align-items:center;gap:4px;white-space:nowrap}
.order-step:before{content:'';width:11px;height:11px;border:2px solid currentColor;border-radius:50%;background:#635373;box-sizing:border-box}
.order-step-line{flex:1;min-width:5px;border-top:2px dotted #81728f}
#order[data-stage=pickup] .step-pickup,#order[data-stage=collect] .step-collect{color:#ffbf22}
#order[data-stage=delivery] .step-deliver{color:#48edda}
#order[data-stage=collect] .step-pickup:before,#order[data-stage=delivery] .step-pickup:before,#order[data-stage=delivery] .step-collect:before{background:#ffb627;border-color:#ffd471}
#order[data-stage=pickup] .step-pickup:before,#order[data-stage=collect] .step-collect:before{background:#ffb627;border-color:#ffe254;box-shadow:0 0 6px #ffbd4566}
#order[data-stage=delivery] .step-deliver:before{background:#2be8d5;border-color:#99fff4;box-shadow:0 0 6px #2be8d566}
#order[data-stage=idle] .order-steps,#order[data-stage=idle] .order-next{display:none}
.order-next{font-size:12px;color:var(--cream);font-weight:700;overflow-wrap:anywhere}
.order-note{display:flex;align-items:flex-start;gap:6px;font-size:11px;line-height:1.25;color:var(--muted);padding-top:5px}
.order-note .ui-icon{width:14px;height:14px}
.has-offer .guidance{align-items:flex-start;justify-content:flex-start}
#hud .offer{width:min(440px,100%);padding:14px;gap:8px;border:2px solid #b68be7;background:linear-gradient(135deg,#30203bf5,#1b102cf5);border-radius:20px;box-shadow:inset 0 0 0 2px #4f2f65,0 0 0 2px #5d367b,0 0 20px #a96eed59,0 6px 16px #10091d66}
.offer-content{gap:9px}
.dispatch-heading{display:flex;align-items:center;gap:9px;min-width:0}
.dispatch-heading h2{margin:0;flex:1;font-family:var(--display);font-size:clamp(15px,2vw,22px);font-weight:400;line-height:1.15;text-transform:uppercase;color:var(--cream)}
.dispatch-dot{width:14px;height:14px;border-radius:50%;flex:none;background:#ff9d18;box-shadow:0 0 13px #ff9d18aa}
.dispatch-id{font-size:11px;color:#d7c3ed;font-weight:800;white-space:nowrap}
.dispatch-reward{display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid #785294;border-radius:14px;background:linear-gradient(140deg,#352145,#24162e)}
.dispatch-reward>.ui-icon{width:40px;height:40px;color:#ffbf0f;filter:drop-shadow(0 0 7px #ffad1266)}
.dispatch-reward div{display:flex;flex-direction:column}
.dispatch-reward strong{font-family:var(--display);font-size:clamp(23px,3.1vw,35px);font-weight:400;line-height:1.15;color:#fff2d2}
.dispatch-reward span{font-size:14px;font-weight:700;color:#d8c7e9}
.dispatch-stops{position:relative;display:flex;flex-direction:column;gap:14px;padding:2px 5px}
.dispatch-stops:before{content:'';position:absolute;left:17px;top:28px;bottom:26px;border-left:2px dotted #d8c5df}
.dispatch-stop{display:flex;gap:11px;position:relative;min-width:0}
.stop-pin{flex:none;width:24px;height:28px;position:relative;z-index:1;color:#ffb620;background:#291933}
.stop-pin .ui-icon{width:24px;height:28px}
.dispatch-stop>div{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.dispatch-stop .stop-label{color:#ffc12b;font-size:12px;font-weight:800}
.dispatch-stop.dropoff .stop-label,.dispatch-stop.dropoff .stop-pin{color:#35eddf}
.dispatch-stop strong{font-size:clamp(16px,2.2vw,21px);font-weight:800;overflow-wrap:anywhere;color:#fff6e5}
.dispatch-stop span:not(.stop-pin):not(.stop-label){font-size:14px;font-weight:700;color:#d6c1e9}
.dispatch-stop small{font-size:11px;color:#bba8cd;overflow-wrap:anywhere}
.dispatch-summary{border-top:1px solid #78618a;display:flex;gap:12px;align-items:center;justify-content:space-between;padding-top:9px}
.dispatch-summary>div{display:flex;gap:8px;align-items:center;min-width:0}
.dispatch-summary>div>span{display:flex;flex-direction:column;font-size:12px;line-height:1.2;color:#d6c3e8}
.dispatch-summary strong{font-family:var(--display);font-size:clamp(16px,2.1vw,22px);font-weight:400;color:#fff3d9}
.dispatch-summary .ui-icon{width:23px;height:23px}
.dispatch-tip{display:flex;gap:6px;align-items:center;font-size:11px;color:#d6c3e8;font-weight:700}
.dispatch-tip .ui-icon{color:#ffc127;width:19px;height:19px}
.dispatch-note{display:flex;align-items:flex-start;gap:7px;font-size:11px;line-height:1.2;color:#d8c7e9}
.dispatch-note>.ui-icon{width:15px;height:15px}
.dispatch-note small{display:block;padding-top:3px;color:#baa6ce;font-size:10px}
.offer-actions{gap:9px;padding-top:3px}
#hud .offer-actions .btn{flex:0 1 auto;min-width:0;font-size:clamp(12px,1.9vw,18px);padding:0 12px;height:50px;border-radius:999px;white-space:normal;line-height:1.2}
#hud .offer-actions .btn.go{flex:1;border:2px solid #ffe86a;background:linear-gradient(135deg,#ffdc25,#ffb300);box-shadow:inset 0 0 0 2px #e39a11,0 0 12px #ffbc1c4d,0 3px 0 #9a5f12}
#hud .offer-actions .btn.alt{border:2px solid #8f76a6;background:linear-gradient(145deg,#3f2d50,#271832);color:#fff1df}
.is-touch #hud.has-offer .touch{display:block;opacity:.38}
.has-offer .touch,.has-offer .touch *{pointer-events:none!important}
.has-offer .speed{display:none}
.has-offer .touch-actions{visibility:hidden}
@media (max-height:520px){
  #hud{--steer-size:76px;--brake-size:66px;--go-width:152px;--go-height:72px;--flight-height:44px;--cruise-height:32px;--stack-gap:6px}
  .steering{gap:12px}.pedals{gap:10px}.touch-actions{bottom:calc(var(--touch-bottom) + var(--go-height) + 10px)}
  #t-gas{font-size:31px}#t-fly{font-size:17px;gap:8px}#t-fly .ui-icon{width:25px;height:25px}#t-cruise{font-size:11px;gap:5px;padding:0 7px}.cruise-switch{width:32px;height:20px}.cruise-switch:before{width:14px;height:14px}#t-cruise[aria-pressed=true] .cruise-switch:before{transform:translateX(11px)}
  #hud #order{padding:9px 11px;gap:3px}.order-id{font-size:9px}#o-title{font-size:16px}.order-distance{font-size:21px}.order-steps{font-size:10px;padding-top:5px;margin-top:3px}.order-next{font-size:10px}.order-note{font-size:9px}.order-note .ui-icon{width:12px;height:12px}
  #hud .offer{padding:9px;gap:6px;border-radius:16px}.offer-content{gap:7px}.dispatch-heading h2{font-size:15px}.dispatch-id{font-size:10px}.dispatch-reward{padding:7px 9px;gap:9px}.dispatch-reward>.ui-icon{width:31px;height:31px}.dispatch-reward strong{font-size:24px}.dispatch-reward span{font-size:12px}.dispatch-stops{gap:9px}.dispatch-stop strong{font-size:15px}.dispatch-stop span:not(.stop-pin):not(.stop-label){font-size:12px}.dispatch-stop small{font-size:10px}.dispatch-summary{padding-top:6px}.dispatch-summary strong{font-size:17px}.dispatch-note{font-size:10px}.dispatch-note small{font-size:9px}.dispatch-tip{font-size:10px}#hud .offer-actions .btn{height:42px;font-size:13px}
  .toast{top:21%;font-size:13px;padding:6px 12px}
  #minimap{width:64px;height:64px}
}
@media (max-width:600px) and (orientation:portrait){
  .is-touch #hud.has-offer .touch{display:none}
  #hud{--steer-size:72px;--brake-size:66px;--go-width:132px;--go-height:74px;--flight-height:44px;--cruise-height:32px;--stack-gap:6px}
  .steering{gap:10px}.pedals{right:var(--touch-right);flex-direction:column;align-items:center;gap:12px}.touch-actions{left:auto;right:var(--touch-right);width:var(--go-width);bottom:calc(var(--touch-bottom) + var(--go-height) + var(--brake-size) + 30px)}
  .is-touch .speed{bottom:calc(var(--touch-bottom) + var(--steer-size) + 14px);left:calc(var(--touch-left) + var(--steer-size) + 5px);right:auto;transform:translateX(-50%);font-size:23px}
  #t-fly{font-size:16px;gap:6px}#t-fly .ui-icon{width:24px;height:24px}#t-gas{font-size:32px}#t-cruise{font-size:10px;padding:0 5px;gap:5px}.cruise-switch{width:30px;height:19px}.cruise-switch:before{width:13px;height:13px}#t-cruise[aria-pressed=true] .cruise-switch:before{transform:translateX(10px)}
  .is-touch .prompt.has-action{top:52%;max-width:calc(100% - 24px)}.context-action{min-width:200px;min-height:64px;padding:10px 18px 15px}.context-action strong{font-size:14px}
  #hud .offer{width:100%}.dispatch-heading h2{font-size:17px}.dispatch-id{font-size:10px}.dispatch-reward strong{font-size:27px}.dispatch-stop strong{font-size:17px}.dispatch-stop span:not(.stop-pin):not(.stop-label){font-size:13px}.dispatch-summary strong{font-size:19px}.dispatch-tip{font-size:10px}#hud .offer-actions .btn{height:44px;font-size:13px}
  .toast{top:41%;font-size:13px;white-space:normal;text-align:center}
}
@media (max-width:360px){#hud{--steer-size:66px;--go-width:118px;--go-height:70px;--brake-size:62px}.steering{gap:8px}.dispatch-tip{max-width:100px}.dispatch-heading h2{font-size:15px}}
@media (max-width:600px) and (max-height:650px) and (orientation:portrait){
  #hud.has-context-action #minimap{width:56px;height:56px}
  #hud.has-context-action #order{padding:9px 10px;gap:3px}
  #hud.has-context-action #order .order-id,#hud.has-context-action #o-sub,#hud.has-context-action #o-time,#hud.has-context-action #o-meters,#hud.has-context-action #order .order-steps,#hud.has-context-action #order .order-next,#hud.has-context-action #order .order-note{display:none}
  #hud.has-context-action #o-title{font-size:15px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .is-touch #hud.has-context-action .prompt.has-action{top:auto;bottom:calc(var(--touch-bottom) + var(--go-height) + var(--brake-size) + 30px + var(--flight-height) + var(--cruise-height) + var(--stack-gap) + 12px);transform:translateX(-50%)}
  #hud.has-context-action .context-action{box-sizing:border-box;height:64px;min-height:64px;padding:6px 12px 11px}
}
@media (prefers-reduced-motion:reduce){.tb{transition:none}}

/* Centered dispatch and acknowledged coaching use their own blocking surfaces. */
#t-brake{border-radius:38%;padding:8px;gap:4px;box-shadow:inset 0 0 0 2px #ffffff80,0 0 0 2px #b9a2d37a,0 4px 0 #241432}
#t-brake .ui-icon{width:36%;height:36%;overflow:visible}
.has-offer .guidance{z-index:7;align-items:center;justify-content:center;pointer-events:auto;overflow:visible;background:#120a221c;border-radius:0}
#hud .offer{width:clamp(310px,36vw,570px);max-width:100%;max-height:100%;border:2px solid #ff9b39;border-radius:22px;padding:12px;gap:8px;background:linear-gradient(140deg,#2a1938f7,#170d27fa);box-shadow:inset 0 0 0 2px #773b344d,0 0 0 1px #ffd28b55,0 0 18px #ff8a274d,0 6px 22px #0e071e80}
.dispatch-heading{gap:9px}
.dispatch-heading h2{color:#ff9b31;font-size:clamp(16px,2.1vw,27px)}
.dispatch-bag{display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex:none;color:#ff9d29}
.dispatch-bag .ui-icon{width:30px;height:30px}
.dispatch-overview{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:center;gap:10px;padding:10px 12px;background:#35233d55;border:1px solid #78529480;border-radius:14px}
.dispatch-reward{border:0;background:none;padding:0;gap:9px;min-width:0}
.dispatch-reward>.ui-icon{width:34px;height:34px}
.dispatch-reward strong{font-size:clamp(20px,2.6vw,33px);white-space:nowrap}
.dispatch-reward span{font-size:12px}
.dispatch-total{display:flex;flex-direction:column;gap:1px;padding-left:10px;border-left:1px solid #70537d;min-width:0;line-height:1.2;color:#d9c6e8}
.dispatch-total>span{font-size:12px}.dispatch-total>strong{font-family:var(--display);font-size:clamp(20px,2.5vw,31px);color:var(--cream);font-weight:400;overflow-wrap:anywhere}.dispatch-total>small{font-size:10px}
.dispatch-stops{gap:10px;border:1px solid #78529466;border-radius:13px;padding:9px 10px}
.dispatch-stops:before{left:22px;top:34px;bottom:34px}
.dispatch-stop strong{font-size:clamp(16px,1.9vw,22px)}
.dispatch-note{font-size:11px}.dispatch-note small{font-size:10px}
.offer-actions{width:100%;min-width:0;display:flex;align-items:stretch;gap:9px;flex-shrink:0}
.offer-slide{box-sizing:border-box;position:relative;isolation:isolate;display:grid;place-items:center;flex:1;min-width:0;height:54px;padding:0 12px 0 43px;border:2px solid #a3fff5;border-radius:999px;background:linear-gradient(135deg,#35ffee,#15e8d5);box-shadow:inset 0 0 0 2px #2abbcb,0 0 0 2px #0c5663,0 0 14px #1ff5ed59,0 3px 0 #10132c;color:#11162b;font-family:var(--display);font-size:clamp(11px,1.6vw,17px);line-height:1.15;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;overflow:hidden}
.offer-slide:focus-visible{outline:3px solid #fff1b3;outline-offset:4px}.offer-slide.dragging{cursor:grabbing}
.swipe-thumb{position:absolute;inset:4px auto 4px 4px;width:42px;display:grid;place-items:center;transform:translateX(var(--swipe-x,0px));border:1px solid #a0e6e5;border-radius:50%;background:linear-gradient(135deg,#ffffff,#e9fff9);box-shadow:0 1px 5px #12536466;color:#0b3343;pointer-events:none;z-index:2}
.swipe-thumb .ui-icon{width:28px;height:28px}.swipe-label{position:relative;z-index:1;pointer-events:none;text-align:center}.swipe-chevrons{position:absolute;left:52px;display:flex;gap:0;opacity:.17;pointer-events:none}.swipe-chevrons .ui-icon{width:18px;height:18px}
.swipe-instructions{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
#hud .offer-actions .btn.alt{flex:0 0 auto;max-width:28%;height:54px;padding:0 13px;border-color:#8e3d59;background:linear-gradient(145deg,#452338,#29172b);font-size:clamp(11px,1.5vw,15px)}
.tip-overlay{position:absolute;inset:0;z-index:8;display:grid;place-items:center;box-sizing:border-box;padding:18px;pointer-events:auto;background:#10091cc9;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
#hud .tip-overlay .tip{display:flex;flex-direction:column;align-items:stretch;gap:14px;width:min(430px,100%);max-height:calc(100dvh - 36px);padding:20px;border:2px solid #44e9d8;border-radius:23px;background:linear-gradient(145deg,#332044,#190f2e);box-shadow:inset 0 0 0 2px #79ddda13,0 0 22px #35dfc32d,0 8px 35px #09051180;overflow:auto}
.tip-heading{display:flex;gap:10px;align-items:center;color:#61ffe8;font-family:var(--display);font-size:17px}.tip-heading .ui-icon{width:26px;height:26px}#hud .tip-overlay #tip-t{font-size:19px;line-height:1.35;font-weight:700;color:var(--cream)}#hud .tip-overlay #tip-x{height:48px;min-height:48px;align-self:stretch;font-family:var(--display);font-size:15px}
.has-tip .touch,.has-tip .touch *, .has-tip .h-tr,.has-tip .prompt,.has-tip .rescue{pointer-events:none!important}
.has-tip .touch{opacity:.3}
.orders-availability{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;flex-shrink:0}
.orders-availability[hidden]{display:none}
#hud .orders-toggle{box-sizing:border-box;min-height:44px;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 9px;border:1px solid #7c608e;border-radius:12px;background:linear-gradient(135deg,#382447,#21172f);color:#e9dff2;font:700 12px/1.15 var(--body,system-ui,sans-serif);cursor:pointer;pointer-events:auto;touch-action:manipulation}
.orders-toggle>span{display:flex;flex-direction:column;gap:2px;min-width:0;text-align:left}.orders-toggle small{font:600 9px/1.15 var(--body,system-ui,sans-serif);color:#c7b4d2}.orders-toggle small[hidden]{display:none}
.orders-switch{display:flex;align-items:center;gap:5px;flex:none;font:700 10px/1 var(--body,system-ui,sans-serif);color:#baa9c9}.orders-switch:before{content:'';width:8px;height:8px;border-radius:50%;background:#81718f;box-shadow:0 0 0 3px #89769d19}
.orders-toggle[aria-pressed=true]{border-color:#3d9b93}.orders-toggle[aria-pressed=true] .orders-switch{color:#77ffe5}.orders-toggle[aria-pressed=true] .orders-switch:before{background:#4ce8cc;box-shadow:0 0 8px #35e5c477}
.orders-toggle:focus-visible{outline:3px solid var(--teal);outline-offset:3px}
.has-offer .orders-availability{display:none}
#hud .offer-actions.has-orders-toggle{flex-wrap:wrap;gap:7px}.offer-actions.has-orders-toggle .offer-slide{flex-basis:100%}
#hud .offer-actions.has-orders-toggle .btn.alt{flex:1;max-width:none}
#hud .offer-actions .offer-orders-toggle{flex:1;min-width:0;min-height:44px;border:1px solid #665076;border-radius:12px;background:#271b37;color:#d7cae3;font:700 11px/1.15 var(--body,system-ui,sans-serif);cursor:pointer}
.offer-orders-toggle:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
@media (max-height:520px) and (min-width:601px){
  #hud.orders-unlocked #o-sub,#hud.orders-unlocked #order .order-note{display:none}
}
@media (max-width:600px) and (max-height:650px) and (orientation:portrait){
  #hud .orders-toggle>span{font-size:11px;white-space:nowrap}
  #hud .orders-toggle small{display:none}
  #hud.orders-unlocked #o-sub{display:none}
  .is-touch #hud.orders-unlocked.has-context-action .prompt.has-action{top:max(192px,calc(var(--task-bottom,180px) + 12px));bottom:auto;transform:none}
}
#hud.has-offer .h-tr #minimap{position:static;margin:0}
@media (max-height:520px) and (min-width:601px){
  #hud .h-tr{gap:5px}#hud .h-tr #minimap{position:absolute;top:70px;right:calc(var(--go-width) + 12px);width:clamp(96px,28vh,120px);height:clamp(96px,28vh,120px);margin:0}
  #hud.has-offer .h-tr #minimap{position:static;width:clamp(96px,28vh,120px);height:clamp(96px,28vh,120px)}
  #hud .offer{width:clamp(310px,42vw,460px);padding:9px;border-radius:17px;gap:6px}.offer-content{gap:6px}.dispatch-heading h2{font-size:16px}.dispatch-bag{width:26px;height:26px}.dispatch-bag .ui-icon{width:25px;height:25px}.dispatch-id{font-size:9px}.dispatch-overview{padding:7px 8px;gap:7px}.dispatch-reward>.ui-icon{width:27px;height:27px}.dispatch-reward strong{font-size:22px}.dispatch-total{padding-left:8px}.dispatch-total>strong{font-size:21px}.dispatch-total>span,.dispatch-reward span{font-size:10px}.dispatch-total>small{font-size:9px}.dispatch-stops{gap:7px;padding:7px 8px}.dispatch-stops:before{left:20px;top:30px;bottom:28px}.dispatch-stop strong{font-size:15px}.dispatch-stop .stop-label,.dispatch-stop span:not(.stop-pin):not(.stop-label){font-size:11px}.dispatch-stop small{font-size:9px}.stop-pin,.stop-pin .ui-icon{width:20px;height:24px}.dispatch-note{font-size:10px}.dispatch-note small{display:none}.offer-slide,#hud .offer-actions .btn.alt{height:46px}.offer-slide{font-size:12px;padding-left:39px;padding-right:7px}.swipe-thumb{width:34px}.swipe-thumb .ui-icon{width:23px;height:23px}.swipe-chevrons{left:42px}#hud .offer-actions .btn.alt{font-size:11px;padding:0 10px}
  #hud .tip-overlay .tip{padding:16px;gap:11px}#hud .tip-overlay #tip-t{font-size:17px}
  /* Keep the complete normal offer compact on 800x360-class phone screens. */
  #hud .offer{width:clamp(350px,46vw,430px);max-height:min(260px,calc(100dvh - 24px));padding:8px;gap:5px}
  .offer-content{gap:4px}.dispatch-heading{gap:7px}.dispatch-heading h2{font-size:16px}.dispatch-bag{width:22px;height:22px}.dispatch-bag .ui-icon{width:22px;height:22px}
  .dispatch-overview{padding:4px 7px;gap:7px}.dispatch-reward{gap:7px}.dispatch-reward>.ui-icon{width:25px;height:25px}.dispatch-reward strong{font-size:20px}.dispatch-reward span{font-size:10px}.dispatch-total>strong{font-size:20px}.dispatch-total>span{font-size:10px}.dispatch-total>small{font-size:9px}
  .dispatch-stops{gap:5px;padding:5px 7px}.dispatch-stops:before{left:18px;top:25px;bottom:24px}.dispatch-stop{gap:8px}.dispatch-stop>div{flex:1;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;row-gap:0;align-items:center}.dispatch-stop .stop-label{grid-column:1;grid-row:1;font-size:9px;line-height:1.1}.dispatch-stop strong{grid-column:1;grid-row:2;font-size:14px;line-height:1.15}.dispatch-stop span:not(.stop-pin):not(.stop-label){grid-column:2;grid-row:1 / span 2;font-size:10px;line-height:1.1;white-space:nowrap}.dispatch-stop small{display:none}.stop-pin,.stop-pin .ui-icon{width:18px;height:22px}
  .dispatch-note{font-size:10px;line-height:1.1;gap:5px}.dispatch-note>.ui-icon{width:12px;height:12px}.offer-actions{padding-top:2px}.offer-slide,#hud .offer-actions .btn.alt{height:46px}
}
@media (max-width:600px) and (orientation:portrait){
  #hud .h-tr #minimap{width:clamp(112px,30vw,144px);height:clamp(112px,30vw,144px)}
  #hud .offer{width:min(400px,100%);padding:11px}.dispatch-heading h2{font-size:18px}.dispatch-overview{gap:8px;padding:9px}.dispatch-reward strong{font-size:23px}.dispatch-reward>.ui-icon{width:27px;height:27px}.dispatch-total>strong{font-size:23px}.dispatch-total>span{font-size:11px}.dispatch-reward span{font-size:11px}.dispatch-total>small{font-size:9px}.offer-slide{font-size:12px}.dispatch-note{font-size:10px}
}
@media (max-width:600px) and (max-height:650px) and (orientation:portrait){
  #hud .h-tr{gap:5px}#hud .h-tr .pill{height:30px}#hud .h-tr .card{padding:5px 8px!important}#hud .h-tr #minimap,#hud.has-context-action .h-tr #minimap{position:absolute;top:132px;right:0;width:112px;height:112px}
  .is-touch #hud.has-context-action .prompt.has-action{left:var(--touch-left);width:calc(100% - var(--go-width) - var(--touch-left) - var(--touch-right) - 12px);max-width:none;transform:none;top:192px;bottom:auto}#hud.has-context-action .context-action{width:100%;min-width:0;height:auto;min-height:64px;padding:8px 8px 13px}#hud.has-context-action .context-action strong{font-size:12px}#hud.has-context-action .context-action small{font-size:11px}
}
@media (prefers-reduced-motion:reduce){.offer-slide,.swipe-thumb{transition:none}}
`;

export class Hud {
  root: HTMLElement; el: Record<string, HTMLElement> = {}; toastT = 0;
  private modalFocus: DialogFocus;
  private offerFocus: DialogFocus;
  private tipFocus: DialogFocus;
  private cancelOfferSwipe = () => {};
  private acceptPendingOffer: (() => void) | null = null;
  private declinePendingOffer: (() => void) | null = null;
  private updateLayout = () => {};
  private controlReleases: (() => void)[] = [];
  private releaseAction = () => {};
  private contextAction: ContextAction | null = null;
  cruiseOn = false;
  private ordersUnlocked = false;
  private ordersAccepting = true;
  private flightMode: 'ground' | 'air' | 'descending' = 'ground';
  onButton: (id: string) => void = () => {};
  onInputReset: () => void = () => {};
  rotationBlocked = false;
  touchLeft = false; touchRight = false; touchSteer = 0; touchGas = false; touchBrake = false; touchBoost = false; touchAct = false;
  private resetInput = () => { this.resetControls(); this.onInputReset(); };
  constructor(touch: boolean) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    installPrototypeTheme();
    if (touch) document.documentElement.classList.add('is-touch');
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = `
      <div class="h-tl">
        <div class="h-tc"><div class="pill" id="clock">Day 1 · 8:00 AM</div><div class="pill" id="level">Level 1</div></div>
        <section class="card" id="order" data-stage="idle"><div class="orders-availability" id="orders-availability" hidden><button type="button" class="orders-toggle" id="orders-toggle" aria-pressed="true" aria-label="Accept orders: on"><span>Accept orders<small id="orders-hint" hidden></small></span><b class="orders-switch" id="orders-status">ON</b></button></div><div class="order-id" id="o-id" hidden></div><div class="k" id="o-state">Finding an order…</div><div class="big" id="o-title"></div><div class="sm" id="o-sub"></div>
          <div class="row"><span class="order-distance" id="o-dist"></span><span class="order-time" id="o-time"></span></div>
          <div class="order-steps" aria-label="Delivery progress"><span class="order-step step-pickup">Pickup</span><i class="order-step-line"></i><span class="order-step step-collect">Collect</span><i class="order-step-line"></i><span class="order-step step-deliver">Deliver</span></div>
          <div class="order-next" id="o-next" hidden></div>
          <div class="order-note" id="o-note" hidden>${controlIcon('info')}<span>Delivery timer starts after collection</span></div>
          <div id="o-meters"><div class="row sm"><span id="o-heatl">Heat</span><span id="o-heatv"></span></div><div class="bar"><i id="o-heat" style="background:var(--heat)"></i></div>
          <div class="slices" id="o-slices" style="margin-top:6px"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
        </section>
      </div>
      <div class="dev" id="dev" hidden></div>
      <div class="h-tr">
        <div class="btnrow pe"><button class="ib" id="b-theatre" type="button">Theatres</button><button class="ib" id="b-full" type="button" aria-label="Full screen" hidden><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4"/></svg></button><button class="ib" id="b-help" type="button" aria-label="Pause, settings and help">II</button></div>
        <div class="pill wallet"><span style="color:var(--saffron)">${controlIcon('coin')}</span><span id="coins">0</span> coins</div>
        <div class="card" style="width:160px;padding:7px 10px"><div class="row sm"><span style="color:var(--teal)">Flight</span><span id="fly-v">Unlimited</span></div><div class="bar"><i id="fly" style="background:var(--teal);width:100%"></i></div></div>
        <canvas id="minimap" class="pe" width="336" height="336" aria-label="Minimap. Tap to open the full map" role="button" tabindex="0" style="cursor:pointer"></canvas>
      </div>
      <div class="toast" id="toast" aria-live="polite"></div>
      <div class="prompt" id="prompt" hidden><div class="prompt-copy"><div class="ring" id="ring"></div><span id="prompt-t"></span></div><button class="context-action pe" id="t-act" type="button" aria-pressed="false" hidden><strong id="action-title"></strong><small id="action-hint"></small><span class="action-progress" aria-hidden="true"></span></button></div>
      <div class="guidance" id="guidance">
        <div class="offer pe" id="offer" role="dialog" aria-modal="true" aria-label="New delivery offer" hidden></div>
      </div>
      <div class="tip-overlay" id="tip-layer" role="dialog" aria-modal="true" aria-label="Driving tip" hidden><section class="tip pe" id="tip" hidden><div class="tip-heading">${controlIcon('info')}<span>Driving tip</span></div><span id="tip-t"></span><button type="button" class="btn go" id="tip-x">Got it</button></section></div>
      <div class="keys"><span><b>W</b> drive</span><span><b>A D</b> steer</span><span><b>S</b> brake/reverse</span><span><b>Space</b> fly</span><span><b>E</b> collect / hand over / accept</span><span><b>T</b> theatres</span><span><b>M</b> map</span><span><b>H</b> horn</span><span><b>N</b> sound</span><span><b>Drag</b> look around when stopped</span><span><b>P</b> pause</span></div>
      <div class="speed"><span id="spd">0</span><small style="font-size:12px"> km/h</small></div>
      <div class="touch pe">
        <div class="steering" id="steering" role="group" aria-label="Arrow steering">
          <button class="tb" id="t-left" type="button" aria-label="Steer left" aria-pressed="false">${controlIcon('left')}</button>
          <button class="tb" id="t-right" type="button" aria-label="Steer right" aria-pressed="false">${controlIcon('right')}</button>
        </div>
        <div class="pedals" role="group" aria-label="Drive and brake">
          <button class="tb" id="t-brake" type="button" aria-label="Brake and reverse" aria-pressed="false">${controlIcon('brake')}<span>BRAKE</span></button>
          <button class="tb" id="t-gas" type="button" aria-label="Accelerate" aria-pressed="false">GO</button>
        </div>
        <div class="touch-actions" role="group" aria-label="Flight and cruise">
          <button class="tb" id="t-fly" type="button" aria-label="Take off"><span id="fly-icon">${controlIcon('up')}</span><span id="fly-label">FLY</span></button>
          <button id="t-cruise" type="button" aria-label="Enable cruise" aria-pressed="false"><span class="cruise-switch" aria-hidden="true"></span><span id="cruise-label">CRUISE</span></button>
        </div>
      </div>
      <button type="button" class="rescue pe" id="rescue" hidden>Stuck? Get back on the road</button>
      <div class="area-chip" id="area-chip" aria-live="polite"></div>
      <div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="Game menu" hidden><div class="sheet" id="sheet"></div></div>
      <div class="rotate" id="rotate"><div><svg viewBox="0 0 64 64" fill="none" stroke="#F6EEDC" stroke-width="4"><rect x="20" y="6" width="24" height="52" rx="5"/><circle cx="32" cy="50" r="2" fill="#F6EEDC"/></svg><b>Turn your phone sideways</b><span>Pizza to Picture Hall is made for landscape: the controls sit under your thumbs.</span><button type="button" class="btn alt" id="rot-ok">Play like this anyway</button></div></div>
      <div class="attr">© OpenStreetMap contributors · Overture · Foursquare · Mapillary · Contains data provided by TGSRTC</div>`;
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n as HTMLElement;
    this.el['tip-layer'].hidden = true; this.el.tip.hidden = true; this.el.offer.hidden = true; this.el.modal.hidden = true; this.el.prompt.hidden = true; this.el['orders-availability'].hidden = true;
    this.modalFocus = new DialogFocus(this.el.modal, { restore: () => this.el['b-help'] });
    this.offerFocus = new DialogFocus(this.el.offer, { initial: () => this.el.offer.querySelector('#offer-slide'), restore: () => this.el.minimap, captureKeys: true, key: (event) => {
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); this.acceptPendingOffer?.(); }
      if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); this.declinePendingOffer?.(); }
    } });
    this.tipFocus = new DialogFocus(this.el['tip-layer'], { initial: () => this.el['tip-x'], restore: () => this.el.minimap, captureKeys: true, key: (event) => {
      if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); this.acknowledgeTip(); }
    } });
    const left = this.root.querySelector('.h-tl')!, right = this.root.querySelector('.h-tr')!;
    const layout = () => {
      const root = this.root.getBoundingClientRect(), l = left.getBoundingClientRect(), r = right.getBoundingClientRect();
      this.root.style.setProperty('--task-bottom', `${Math.max(0, l.bottom - root.top)}px`);
      const offered = this.root.classList.contains('has-offer');
      const bounds = guidanceBounds(root.width, root.height, l.bottom - root.top, r.left - root.left, r.bottom - root.top, touch && !offered);
      if (offered) {
        // A request is a centered, isolated decision surface, independent of HUD rails.
        bounds.left = 12; bounds.top = 12; bounds.width = Math.max(0, root.width - 24); bounds.height = Math.max(0, root.height - 24);
      }
      Object.assign(this.el.guidance.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    };
    const resize = new ResizeObserver(layout);
    this.updateLayout = layout;
    resize.observe(this.root); resize.observe(left); resize.observe(right); layout();
    this.el['b-theatre'].addEventListener('click', () => this.onButton('theatres'));
    this.el['b-help'].addEventListener('click', () => this.onButton('pause'));
    this.el['b-full'].addEventListener('click', () => this.onButton('fullscreen'));
    this.el.rescue.addEventListener('click', () => this.onButton('rescue'));
    this.el['tip-x'].addEventListener('click', () => this.acknowledgeTip());
    this.el['orders-toggle'].addEventListener('click', () => {
      if (this.ordersUnlocked && this.controlsAvailable) { this.resetInput(); this.onButton('orders'); }
    });
    // Keep native button activation without letting Space reach the flight shortcut.
    for (const type of ['keydown', 'keyup']) this.el['orders-toggle'].addEventListener(type, event => event.stopPropagation());
    this.el['rot-ok'].addEventListener('click', () => { this.el.rotate.classList.add('ok'); this.rotationBlocked = false; });
    // Each held control owns its pointer, so steering and pedals can be used together.
    const hold = (id: string, f: (v: boolean) => void, enabled = () => true) => {
      const b = this.el[id]; let pid = -1; const keys = new Set<string>();
      const paint = () => {
        const active = pid !== -1 || keys.size > 0;
        f(active); b.classList.toggle('on', active); b.setAttribute('aria-pressed', String(active));
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); if (pid !== -1 || !enabled() || !this.controlsAvailable) return;
        pid = e.pointerId; try { b.setPointerCapture(pid); } catch { /* pointer already ended */ } paint();
      });
      const releasePointer = () => {
        const id = pid; pid = -1;
        try { if (id !== -1 && b.hasPointerCapture(id)) b.releasePointerCapture(id); } catch { /* already released */ }
        paint();
      };
      const release = () => { keys.clear(); releasePointer(); };
      this.controlReleases.push(release);
      const up = (e: PointerEvent) => { if (e.pointerId === pid) releasePointer(); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault(); e.stopPropagation(); if (!enabled() || !this.controlsAvailable) return;
        keys.add(e.code); paint();
      });
      b.addEventListener('keyup', (e) => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault(); e.stopPropagation(); keys.delete(e.code); paint();
      });
      b.addEventListener('blur', () => { keys.clear(); paint(); });
      return release;
    };
    const steer = () => { this.touchSteer = Number(this.touchRight) - Number(this.touchLeft); };
    hold('t-left', (v) => { this.touchLeft = v; steer(); }, () => !this.tiltOn);
    hold('t-right', (v) => { this.touchRight = v; steer(); }, () => !this.tiltOn);
    hold('t-gas', (v) => (this.touchGas = v));
    hold('t-brake', (v) => { this.touchBrake = v; if (v) this.setCruise(false); });
    const tap = (id: string, action: string) => {
      const button = this.el[id] as HTMLButtonElement;
      const activate = () => { if (!button.disabled && this.controlsAvailable) this.onButton(action); };
      button.addEventListener('pointerdown', (e) => { e.preventDefault(); activate(); });
      button.addEventListener('keydown', (e) => {
        if (e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault(); e.stopPropagation(); if (!e.repeat) activate();
      });
      // Screen readers activate a button with a zero-detail click rather than a pointer.
      button.addEventListener('click', (e) => { if (e.detail === 0) activate(); });
    };
    tap('t-fly', 'fly'); tap('t-cruise', 'cruise');
    this.releaseAction = hold('t-act', (v) => (this.touchAct = v), () => this.contextAction !== null && !this.el.prompt.hidden && !this.modalOpen && !this.rotationBlocked);
    this.el['t-act'].addEventListener('contextmenu', (e) => e.preventDefault());
    for (const n of this.root.querySelectorAll('.touch, .touch *')) n.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', this.resetInput);
    addEventListener('resize', () => this.cancelOfferSwipe());
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
    this.cancelOfferSwipe();
    for (const release of this.controlReleases) release();
    this.setCruise(false);
    this.prompt(null);
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
  get activeAction() { return this.contextAction; }
  private get controlsAvailable() { return !this.root.classList.contains('has-offer') && !this.tipOpen && !this.modalOpen && !this.rotationBlocked; }
  orderAvailability({ unlocked, accepting, activeOrder = false }: { unlocked: boolean; accepting: boolean; activeOrder?: boolean }) {
    this.ordersUnlocked = unlocked; this.ordersAccepting = accepting;
    const button = this.el['orders-toggle'];
    this.el['orders-availability'].hidden = !unlocked;
    this.root.classList.toggle('orders-unlocked', unlocked);
    button.setAttribute('aria-pressed', String(accepting));
    button.setAttribute('aria-label', `Accept orders: ${accepting ? 'on' : 'off'}.${!accepting && activeOrder ? ' Current delivery continues.' : ''}`);
    this.set('orders-status', accepting ? 'ON' : 'OFF');
    const hint = this.el['orders-hint']; hint.hidden = accepting || !activeOrder;
    this.set('orders-hint', !accepting && activeOrder ? 'After this delivery' : '');
    const offerToggle = this.el.offer.querySelector<HTMLButtonElement>('#offer-orders-toggle');
    if (offerToggle) { offerToggle.hidden = !unlocked; offerToggle.textContent = accepting ? 'Stop requests' : 'Accept orders'; }
  }
  setCruise(on: boolean) {
    this.cruiseOn = on;
    const button = this.el['t-cruise']; if (!button) return;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Disable cruise' : 'Enable cruise');
    this.set('cruise-label', on ? 'CRUISE ON' : 'CRUISE');
  }
  flightState(flying: boolean, descending: boolean) {
    const mode = descending ? 'descending' : flying ? 'air' : 'ground';
    if (mode === this.flightMode) return;
    this.flightMode = mode;
    this.el['fly-icon'].innerHTML = controlIcon(mode === 'ground' ? 'up' : 'down');
    this.set('fly-label', mode === 'ground' ? 'FLY' : mode === 'air' ? 'LAND' : 'LANDING…');
    const button = this.el['t-fly'] as HTMLButtonElement;
    button.disabled = mode === 'descending';
    button.setAttribute('aria-label', mode === 'ground' ? 'Take off' : mode === 'air' ? 'Land' : 'Landing in progress');
  }
  set(id: string, text: string) { const e = this.el[id]; if (e && e.textContent !== text) e.textContent = text; }
  toast(text: string, cls = '') {
    const t = this.el.toast;
    t.innerHTML = `${cls === 'teal' ? controlIcon('check', 'toast-check') : ''}<span></span>`;
    t.querySelector('span')!.textContent = text; t.className = 'toast show ' + cls;
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => (t.className = 'toast ' + cls), 1900);
  }
  prompt(text: string | null, progress = 0, action: ContextAction | null = null) {
    const p = this.el.prompt, button = this.el['t-act'];
    const visible = !!text && !this.root.classList.contains('has-offer');
    const next = visible ? action : null;
    if (next !== this.contextAction) this.releaseAction();
    this.contextAction = next; p.hidden = !visible;
    this.root.classList.toggle('has-context-action', next !== null);
    p.classList.toggle('has-action', next !== null); button.hidden = next === null;
    if (!text) return;
    if (next) {
      const [title, hint] = { collect: ['Collect pizza', 'Hold to collect'], handover: ['Hand over pizza', 'Hold to deliver'], theatre: ['Talk to manager', 'Hold to talk'] }[next];
      this.set('action-title', title); this.set('action-hint', hint);
      button.setAttribute('aria-label', `${title}. ${hint}.`);
      button.style.setProperty('--p', `${Math.round(progress * 100)}%`);
    }
    this.set('prompt-t', text); this.el.ring.style.setProperty('--p', `${Math.round(progress * 100)}%`);
  }
  order(o: { state: string; title: string; sub: string; dist: string; time: string; heat?: number; slices?: number; meters: boolean; next?: string; stage?: 'pickup' | 'collect' | 'delivery' | 'idle'; orderId?: string }) {
    this.set('o-state', o.state); this.set('o-title', o.title); this.set('o-sub', o.sub); this.set('o-dist', o.dist); this.set('o-time', o.time);
    this.el.order.dataset.stage = o.stage ?? (o.meters ? 'delivery' : 'idle');
    this.el['o-next'].hidden = !o.next; if (o.next) this.set('o-next', `Next: ${o.next}`);
    this.el['o-note'].hidden = o.stage !== 'pickup' && o.stage !== 'collect';
    this.el['o-id'].hidden = !o.orderId; if (o.orderId) this.set('o-id', `#${o.orderId.replace(/^#/, '')}`);
    this.el['o-meters'].style.display = o.meters ? '' : 'none';
    if (o.meters && o.heat !== undefined) {
      this.el['o-heat'].style.width = `${Math.max(0, o.heat)}%`;
      this.set('o-heatv', `${Math.round(o.heat)}°`);
      this.set('o-heatl', `Heat · ${o.heat >= 70 ? 'GARAM' : o.heat >= 40 ? 'THEEK' : 'THANDA'}`);
      [...this.el['o-slices'].children].forEach((c, i) => c.classList.toggle('off', i >= (o.slices ?? 8)));
    }
  }
  offer(html: string | null, buttons: { label: string; cls: string; fn: () => void }[] = []) {
    this.cancelOfferSwipe(); this.cancelOfferSwipe = () => {};
    this.acceptPendingOffer = null; this.declinePendingOffer = null;
    if (html) { this.tipAcknowledgement(null); this.resetInput(); }
    else this.offerFocus.hide();
    const o = this.el.offer; o.hidden = !html; this.root.classList.toggle('has-offer', !!html); this.updateLayout(); if (!html) return;
    const primary = buttons.findIndex((button) => button.cls.split(/\s+/).includes('go'));
    o.innerHTML = `<div class="offer-content">${html}</div><div class="offer-actions${this.ordersUnlocked ? ' has-orders-toggle' : ''}">${buttons.map((b, i) => i === primary
      ? `<button type="button" class="offer-slide" id="offer-slide" aria-label="Accept delivery" aria-describedby="swipe-help"><span class="swipe-thumb">${controlIcon('right')}</span><span class="swipe-chevrons">${controlIcon('right')}${controlIcon('right')}</span><span class="swipe-label">SLIDE TO ACCEPT</span></button><span id="swipe-help" class="swipe-instructions">Swipe right to accept. Keyboard: press Enter, Space or E.</span>`
      : `<button type="button" class="btn ${b.cls}" id="offer-action-${i}">${b.label}</button>`).join('')}${this.ordersUnlocked ? `<button type="button" class="offer-orders-toggle" id="offer-orders-toggle">${this.ordersAccepting ? 'Stop requests' : 'Accept orders'}</button>` : ''}</div>`;
    let decided = false;
    const available = () => !o.hidden && !decided && !this.modalOpen && !this.tipOpen && !this.rotationBlocked;
    const decide = (index: number) => { if (available()) { decided = true; this.cancelOfferSwipe(); buttons[index].fn(); } };
    if (primary >= 0) {
      const accept = () => decide(primary); this.acceptPendingOffer = accept;
      this.cancelOfferSwipe = bindDeliverySwipe(o.querySelector('#offer-slide')!, accept, available);
    }
    buttons.forEach((button, i) => {
      if (i === primary) return;
      const decline = () => decide(i);
      this.declinePendingOffer ??= decline;
      o.querySelector(`#offer-action-${i}`)!.addEventListener('click', decline);
    });
    o.querySelector('#offer-orders-toggle')?.addEventListener('click', () => {
      if (available() && this.ordersUnlocked) { decided = true; this.cancelOfferSwipe(); this.resetInput(); this.onButton('orders'); }
    });
    if (!this.modalOpen) this.offerFocus.show();
  }
  modal(html: string | null, bind?: (sheet: HTMLElement) => void) {
    this.el.modal.hidden = !html; if (!html) { this.modalFocus.hide(); if (!this.el.offer.hidden) this.offerFocus.show(); return; }
    this.tipAcknowledgement(null); this.offerFocus.hide();
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
  areaChip(name: string, label = 'Entering') {
    const c = this.el['area-chip']; c.innerHTML = `<small>${label.replace(/[<>&]/g, '')}</small>${name.replace(/[<>&]/g, '')}`; c.classList.add('show');
    clearTimeout(this.areaT); this.areaT = window.setTimeout(() => c.classList.remove('show'), 4200);
  }
  get tipOpen() { return !this.el['tip-layer'].hidden; }
  private acknowledgeTip() { if (!this.tipOpen) return; this.tipAcknowledgement(null); this.onButton('tip-close'); }
  tipAcknowledgement(text: string | null) {
    if (text && (this.modalOpen || this.root.classList.contains('has-offer'))) return;
    const wasOpen = this.tipOpen;
    this.el['tip-layer'].hidden = !text; this.el.tip.hidden = !text; this.root.classList.toggle('has-tip', !!text);
    if (!text) { this.tipFocus.hide(); return; }
    this.set('tip-t', text);
    if (!wasOpen) { this.resetInput(); this.tipFocus.show(); }
  }
  tip(text: string | null) { this.tipAcknowledgement(text); }
}

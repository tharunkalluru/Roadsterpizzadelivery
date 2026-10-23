// Title screen with how-to-play, shown once per visit before choosing an area.
const CSS = `
.title{position:absolute;inset:0;z-index:8;pointer-events:auto;background:radial-gradient(130% 100% at 50% 0%,#33285F 0%,#17132B 60%);display:flex;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top,0px)) 14px max(16px,env(safe-area-inset-bottom,0px))}
.title[hidden]{display:none}
.title .in{width:min(860px,100%);display:flex;flex-direction:column;gap:14px;margin:auto 0}
.title h1{margin:0;font-family:var(--display);font-weight:400;font-size:clamp(30px,6.4vw,58px);line-height:1;color:var(--saffron);text-shadow:0 4px 0 #0C0A1A}
.title .tag{font-size:clamp(15px,2.2vw,19px);color:var(--cream);margin:0;font-weight:700}
.title .how{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:10px}
.title .how div{background:#241E42;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:4px}
.title .how b{font-family:var(--display);font-weight:400;font-size:15px}
.title .how span{font-size:14px;color:var(--muted);line-height:1.3}
.title .ctl{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 12px}
.title .ctl b{font-family:var(--display);font-weight:400;font-size:11px;color:var(--cream);background:var(--line);border-radius:4px;padding:1px 6px}
.title .acts{display:flex;gap:8px;flex-wrap:wrap}.title .acts .btn{flex:1;min-width:180px;height:52px;font-size:17px}
.title .src{font-size:11px;color:rgba(246,238,220,.55)}
@media (max-height:520px){.title h1{font-size:30px}.title .br{display:none}.title .tag{font-size:14px}.title .in{gap:8px}.title .how div{padding:8px}.title .how span{font-size:12px}.title .acts .btn{height:44px}}
`;

export class TitleScreen {
  root: HTMLElement;
  onPlay: () => void = () => {};
  onSettings: () => void = () => {};
  constructor(host: HTMLElement, touch: boolean) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.className = 'title'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'Pizza to Picture Hall');
    const keys = touch
      ? '<span><b>STICK</b> steer</span><span><b>GO</b> drive</span><span><b>BRAKE</b> brake / reverse</span><span><b>FLY</b> thrusters</span><span><b>ACT</b> hold to collect / hand over</span><span><b>MAP</b> tap the minimap</span>'
      : '<span><b>W</b> drive</span><span><b>A D</b> steer</span><span><b>S</b> brake / reverse</span><span><b>SPACE</b> fly</span><span><b>E</b> accept, hold to collect / hand over</span><span><b>M</b> map</span><span><b>T</b> theatres</span><span><b>P</b> pause</span>';
    this.root.innerHTML = `<div class="in">
      <h1>Pizza to<br class="br"> Picture Hall</h1>
      <p class="tag">Fly a pizza roadster across Hyderabad. Deliver it hot, earn coins, run a picture hall.</p>
      <div class="how">
        <div><b style="color:var(--saffron)">1 · Deliver</b><span>Accept an order, collect the pizza at the kitchen (orange marker) and race it to the customer (teal marker) before it goes cold. Bumping into traffic costs slices.</span></div>
        <div><b style="color:var(--teal)">2 · Fly</b><span>Driving on the road charges the cold-gas thrusters. Press FLY to lift off over traffic, flyovers and rooftops while the boost lasts.</span></div>
        <div><b style="color:var(--pink)">3 · Run a picture hall</b><span>Spend your coins to lease a single-screen theatre, choose a film and a campaign, and watch the collections come in each night.</span></div>
      </div>
      <div class="ctl">${keys}</div>
      <div class="acts"><button type="button" class="btn go" id="tt-play">Play</button><button type="button" class="btn alt" id="tt-set">Settings</button></div>
      <div class="src">Streets, buildings and shop names from OpenStreetMap, Overture Maps, Foursquare and Mapillary street photos. Films and orders are made up.</div>
    </div>`;
    host.appendChild(this.root);
    this.root.querySelector('#tt-play')!.addEventListener('click', () => { if (touch) goFullscreen(); this.hide(); this.onPlay(); });
    this.root.querySelector('#tt-set')!.addEventListener('click', () => this.onSettings());
  }
  show() { this.root.hidden = false; (this.root.querySelector('#tt-play') as HTMLElement).focus(); }
  hide() { this.root.hidden = true; }
  get open() { return !this.root.hidden; }
}

// full screen and (on phones) landscape; both quietly do nothing where the browser doesn't allow them
export async function goFullscreen() {
  const d = document as any, el = document.documentElement as any;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.());
  } catch { /* not allowed (iPhone Safari, iframes) */ }
  try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not supported */ }
}
export function exitFullscreen() { const d = document as any; try { (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); } catch { /* ignore */ } }
export const isFullscreen = () => !!((document as any).fullscreenElement || (document as any).webkitFullscreenElement);
export const canFullscreen = () => !!((document as any).fullscreenEnabled || (document as any).webkitFullscreenEnabled);

// Title screen with how-to-play, shown once per visit before choosing an area.
import { installPrototypeTheme } from './theme';

const CSS = `
.title-screen{position:absolute;inset:0;z-index:8;pointer-events:auto;background:radial-gradient(ellipse at 15% 10%,rgba(175,94,238,.2),transparent 48%),radial-gradient(ellipse at 90% 85%,rgba(24,217,199,.09),transparent 45%),linear-gradient(145deg,#2D1A43,#171125 70%);display:flex;justify-content:center;overflow:auto;overscroll-behavior:contain;padding:max(22px,env(safe-area-inset-top,0px)) 18px max(22px,env(safe-area-inset-bottom,0px))}
.title-screen[hidden]{display:none}
.title-screen .in{width:min(900px,100%);display:flex;flex-direction:column;gap:18px;margin:auto 0}
.title-screen .eyebrow{align-self:flex-start;display:flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid #80609E;border-radius:999px;background:var(--ui-plum);box-shadow:var(--ui-panel-shadow);color:var(--muted);font-family:var(--display);font-size:10px;letter-spacing:.08em}
.title-screen .eyebrow i{width:8px;height:8px;background:var(--teal);border-radius:50%;box-shadow:0 0 10px rgba(32,242,213,.55)}
.title-screen h1{margin:0;font-family:var(--display);font-weight:400;font-size:clamp(30px,6.4vw,62px);line-height:1.06;color:var(--saffron);text-shadow:0 3px 0 #8E421F,0 7px 0 #10091D,0 0 30px rgba(255,191,0,.12)}
.title-screen .tag{font-size:clamp(15px,2.2vw,19px);color:var(--cream);margin:0;font-weight:700}
.title-screen .how{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:10px}
.title-screen .how>div{background:var(--ui-plum);border:1px solid #6D4E89;border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--ui-panel-shadow)}
.title-screen .how .how-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,rgba(247,200,255,.08),rgba(20,12,34,.3));border:1px solid currentColor;box-shadow:0 0 14px rgba(171,118,235,.12)}
.title-screen .how svg{width:23px;height:23px;display:block}
.title-screen .how b{font-family:var(--display);font-weight:400;font-size:15px}
.title-screen .how span{font-size:14px;color:var(--muted);line-height:1.3}
.title-screen .ctl{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px 14px;line-height:1.6}
.title-screen .ctl b{font-family:var(--display);font-weight:400;font-size:11px;color:var(--cream);background:linear-gradient(150deg,#51376B,#2A1C3B);border:1px solid #7A5899;border-radius:7px;padding:2px 7px;white-space:nowrap}
.title-screen .acts{display:flex;gap:8px;flex-wrap:wrap}.title-screen .acts .btn{flex:1;min-width:180px;height:52px;font-size:17px}
.title-screen .src{font-size:11px;color:rgba(246,238,220,.55)}
@media (max-height:520px){.title-screen{padding-block:12px}.title-screen h1{font-size:30px}.title-screen .br{display:none}.title-screen .tag{font-size:14px}.title-screen .in{gap:9px}.title-screen .how>div{padding:10px;gap:5px}.title-screen .how .how-icon{width:28px;height:28px}.title-screen .how svg{width:18px;height:18px}.title-screen .how span{font-size:12px}.title-screen .acts .btn{height:44px}.title-screen .eyebrow{padding:4px 10px;font-size:9px}}
`;

export class TitleScreen {
  root: HTMLElement;
  onPlay: () => void = () => {};
  onSettings: () => void = () => {};
  constructor(host: HTMLElement, touch: boolean) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    installPrototypeTheme();
    this.root = document.createElement('div'); this.root.className = 'title-screen'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'Pizza to Picture Hall');
    const keys = touch
      ? '<span><b>← →</b> steer</span><span><b>GO</b> hold to accelerate</span><span><b>BRAKE</b> brake / reverse</span><span><b>CRUISE</b> hold your current speed</span><span><b>FLY / LAND</b> take off / descend</span><span><b>Collect / Hand over</b> hold the button that appears in the middle</span><span><b>MAP</b> tap the minimap</span>'
      : '<span><b>W</b> drive</span><span><b>A D</b> steer</span><span><b>S</b> brake / reverse</span><span><b>SPACE</b> fly</span><span><b>E</b> accept, hold to collect / hand over</span><span><b>M</b> map</span><span><b>T</b> theatres</span><span><b>P</b> pause</span>';
    this.root.innerHTML = `<div class="in">
      <div class="eyebrow"><i aria-hidden="true"></i>Hyderabad · Delivery & cinema</div>
      <h1>Pizza to<br class="br"> Picture Hall</h1>
      <p class="tag">Fly a pizza roadster across Hyderabad. Deliver it hot, earn coins, run a picture hall.</p>
      <div class="how">
        <div><span class="how-icon" style="color:var(--saffron)" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2M8 13h8M9 17h6"/></svg></span><b style="color:var(--saffron)">1 · Deliver</b><span>Accept an order, collect the pizza at the kitchen (orange marker) and race it to the customer (teal marker) before it goes cold. Bumping into traffic costs slices.</span></div>
        <div><span class="how-icon" style="color:var(--teal)" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.5 7.5L22 14v3l-8-3v5l3 2v1l-5-1-5 1v-1l3-2v-5l-8 3v-3l6.5-4.5L12 2Z"/></svg></span><b style="color:var(--teal)">2 · Fly</b><span>Press ${touch ? 'FLY' : 'Space'} to lift off over traffic, flyovers and rooftops. Flight is unlimited. Press again to land.${touch ? ' The button changes to LAND in the air.' : ''}</span></div>
        <div><span class="how-icon" style="color:var(--pink)" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4m-10-6 5 3-5 3v-6Z"/></svg></span><b style="color:var(--pink)">3 · Run a picture hall</b><span>Spend your coins to lease a single-screen theatre, choose a film and a campaign, and watch the collections come in each night.</span></div>
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

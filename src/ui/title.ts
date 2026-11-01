// Title screen with how-to-play, shown once per visit before choosing an area.
import { installPrototypeTheme } from './theme';

export const TITLE_SCREEN_CSS = `
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
.title-screen .acts{display:flex;gap:8px;flex-wrap:wrap}.title-screen .acts .btn{flex:1;min-width:180px;height:52px;font-size:17px}
@media (max-height:520px){.title-screen{padding-block:12px}.title-screen h1{font-size:30px}.title-screen .br{display:none}.title-screen .tag{font-size:14px}.title-screen .in{gap:9px}.title-screen .how>div{padding:10px;gap:5px}.title-screen .how .how-icon{width:28px;height:28px}.title-screen .how svg{width:18px;height:18px}.title-screen .how span{font-size:12px}.title-screen .acts .btn{height:44px}.title-screen .eyebrow{padding:4px 10px;font-size:9px}}
/* A third card must not wrap into another row on short phones: the resulting
   extra row pushed Play below the 667×375 viewport. Keep the full instructions
   visible, combine each icon/title into one row, and reserve real 44px actions. */
@media (orientation:landscape) and (max-height:520px){
  .title-screen{padding:max(10px,env(safe-area-inset-top,0px)) max(18px,env(safe-area-inset-right,0px)) max(10px,env(safe-area-inset-bottom,0px)) max(18px,env(safe-area-inset-left,0px))}
  .title-screen .in{gap:8px;flex:none}
  .title-screen .tag{line-height:1.2}
  .title-screen .how{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .title-screen[data-steps="2"] .how{grid-template-columns:repeat(2,minmax(0,1fr))}
  .title-screen .how>div{min-width:0;display:grid;grid-template-columns:28px minmax(0,1fr);grid-template-rows:auto 1fr;align-items:center;gap:5px 6px;padding:9px;border-radius:14px}
  .title-screen .how b{font-size:13px;line-height:1.2}
  .title-screen .how>div>span:last-child{grid-column:1/-1;align-self:start;line-height:1.25}
  .title-screen .acts{flex-wrap:nowrap;flex:none}
  .title-screen .acts .btn{height:44px;min-height:44px;min-width:0;font-size:15px}
}
@media (orientation:landscape) and (max-height:340px){
  .title-screen h1{font-size:27px}
  .title-screen .in{gap:6px}
  .title-screen .tag{font-size:13px}
  .title-screen .how b{font-size:12px}
}

`;

export class TitleScreen {
  root: HTMLElement;
  onPlay: () => void = () => {};
  onSettings: () => void = () => {};
  constructor(host: HTMLElement, touch: boolean, carrierPickup = false) {
    const st = document.createElement('style'); st.textContent = TITLE_SCREEN_CSS; document.head.appendChild(st);
    installPrototypeTheme();
    this.root = document.createElement('div'); this.root.className = 'title-screen'; this.root.dataset.steps = carrierPickup ? '3' : '2'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'Hyderabad Roadster');
    this.root.innerHTML = `<div class="in">
      <div class="eyebrow"><i aria-hidden="true"></i>Hyderabad · Delivery & flight</div>
      <h1>Hyderabad<br class="br"> Roadster</h1>
      <p class="tag">${carrierPickup ? 'Mystery customers. One dream: your own pizza restaurant.' : 'Deliver it hot. Take to the skies.'}</p>
      <div class="how">
        <div><span class="how-icon" style="color:var(--saffron)" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2M8 13h8M9 17h6"/></svg></span><b style="color:var(--saffron)">1 · ${carrierPickup ? 'Jump grab' : 'Deliver'}</b><span>${carrierPickup ? 'Jump through a glowing pizza slice above traffic to catch it.' : 'Accept an order, collect the pizza, and deliver to the customer.'}</span></div>
        <div><span class="how-icon" style="color:var(--teal)" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.5 7.5L22 14v3l-8-3v5l3 2v1l-5-1-5 1v-1l3-2v-5l-8 3v-3l6.5-4.5L12 2Z"/></svg></span><b style="color:var(--teal)">2 · Fly</b><span>Press ${touch ? 'FLY' : 'Q'} to fly, or ${touch ? 'JUMP' : 'E'} for a short moving kickflip.</span></div>
        ${carrierPickup ? '<div><span class="how-icon" style="color:var(--pink)" aria-hidden="true">☎</span><b style="color:var(--pink)">3 · Deliver</b><span>Follow the location and deliver to grow your restaurant.</span></div>' : ''}
      </div>
      <div class="acts"><button type="button" class="btn go" id="tt-play">Play</button><button type="button" class="btn alt" id="tt-set">Settings</button></div>
    </div>`;
    host.appendChild(this.root);
    this.root.querySelector('#tt-play')!.addEventListener('click', () => { if (touch) goFullscreen(); this.hide(); this.onPlay(); });
    this.root.querySelector('#tt-set')!.addEventListener('click', () => { this.hide(); this.onSettings(); });
  }
  show() { this.root.hidden = false; this.root.parentElement?.classList.add('title-open'); (this.root.querySelector('#tt-play') as HTMLElement).focus(); }
  hide() { this.root.hidden = true; this.root.parentElement?.classList.remove('title-open'); }
  get open() { return !this.root.hidden; }
}

// A request is not proof that fullscreen was granted. Unsupported browsers
// still get the landscape request, then an honest fallback from the caller.
export async function goFullscreen() {
  const d = document as any, el = document.documentElement as any;
  try {
    if (!isFullscreen()) {
      if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
      else if (typeof el.webkitRequestFullscreen === 'function') await el.webkitRequestFullscreen();
    }
  } catch { /* not allowed (iPhone Safari, iframes) */ }
  try { if (typeof screen !== 'undefined') await (screen.orientation as any)?.lock?.('landscape'); } catch { /* not supported */ }
  return isFullscreen();
}
export async function exitFullscreen() { const d = document as any; try { await (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d); } catch { /* ignore */ } }
export const isFullscreen = () => !!((document as any).fullscreenElement || (document as any).webkitFullscreenElement);
export const canFullscreen = () => !!((document.documentElement as any).requestFullscreen || (document.documentElement as any).webkitRequestFullscreen);

const appleMobile = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export function fullscreenFallbackMessage() {
  return appleMobile() ? 'Full screen is unavailable here. In Safari, tap Share, then Add to Home Screen. Open the saved game and turn your phone sideways. Home Screen appearance depends on your iOS version; landscape also works in this browser.' : 'Full screen was unavailable or declined. Turn your phone sideways to play; your browser controls may remain visible.';
}
export function fullscreenFallbackHtml() {
  const apple = appleMobile();
  return `<header class="sheet-header"><h2>Full screen options</h2><button type="button" class="btn go" id="fullscreen-done">Done</button></header>
    <p class="sm">${apple ? 'This browser does not allow the game to enter full screen here.' : 'Full screen was not available or the browser declined the request.'}</p>
    ${apple ? '<ol class="fullscreen-guide"><li>Open the game in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Open the saved game from your Home Screen and turn your phone sideways.</li></ol><p class="sm">Home Screen appearance depends on your iOS version. You can also keep playing in landscape in this browser.</p>' : '<p class="sm">Keep your phone sideways. You can continue playing with your browser controls visible, or use your browser’s full screen option.</p>'}`;
}

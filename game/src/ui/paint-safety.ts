// Critical UI must have real opaque paint beneath optional decorative images.
// A background shorthand resets background-color; keep these final overrides
// separate and important so later component styles cannot undo the fallback.
export const PAINT_SAFETY_CSS = `
#hud .card,#hud .pill,#hud .ib,#hud .sheet,#hud .offer,#hud .tip,#hud .keys,
#hud .map-title,#hud .legend,#hud .places-toggle,#hud .places-panel,#hud .place-detail,#hud .pickbar,
#hud .orders-toggle,#hud .dispatch-overview,#hud .dispatch-reward,#hud .dispatch-stops,#hud .opt,
#hud button,#hud .how>div,#hud .how-icon,#hud .eyebrow,#hud .speed,#hud input,#hud select{
  background-color:#271936!important;
}
#hud .btn.go,#hud #t-gas{background-color:#FFBF00!important}
#hud #t-brake{background-color:#E5D6FF!important}
#hud #t-fly{background-color:#241B37!important}
#hud .offer-slide{background-color:#20F2D5!important}
#hud .swipe-thumb{background-color:#FFF9EA!important}
#hud .context-action{background-color:#FF75B6!important}
#hud .title-screen,#hud .apick,#hud .rotate,#hud .modal,#hud .tip-overlay{
  background-color:#171125!important;
}
.ui-blocks-world #game{visibility:hidden!important}
/* Touch devices use simple opaque primitives over the canvas. Keep the neon
   palette, rims and icon shapes, without shader-painted gradient/blur layers. */
.solid-ui #hud .card,.solid-ui #hud .pill,.solid-ui #hud .ib,.solid-ui #hud .sheet,
.solid-ui #hud .offer,.solid-ui #hud .tip,.solid-ui #hud .keys,.solid-ui #hud .title-screen,
.solid-ui #hud .apick,.solid-ui #hud .rotate,.solid-ui #hud .modal,.solid-ui #hud .tip-overlay,
.solid-ui #hud .map-title,.solid-ui #hud .legend,.solid-ui #hud .places-toggle,
.solid-ui #hud .places-panel,.solid-ui #hud .place-detail,.solid-ui #hud .pickbar,
.solid-ui #hud .orders-toggle,.solid-ui #hud .dispatch-overview,.solid-ui #hud .dispatch-reward,
.solid-ui #hud .dispatch-stops,.solid-ui #hud .speed,.solid-ui #hud .area-chip,.solid-ui #hud .toast,
.solid-ui #hud button,.solid-ui #hud .how>div,.solid-ui #hud .how-icon,.solid-ui #hud .eyebrow,
.solid-ui #hud input,.solid-ui #hud select{
  background-image:none!important;filter:none!important;backdrop-filter:none!important;
  -webkit-backdrop-filter:none!important;mix-blend-mode:normal!important;mask-image:none!important;
  -webkit-mask-image:none!important;will-change:auto!important;
}
.solid-ui #hud button,.solid-ui #hud .how>div,.solid-ui #hud .how-icon,.solid-ui #hud .eyebrow,
.solid-ui #hud .speed,.solid-ui #hud input,.solid-ui #hud select{background-color:#271936!important}
.solid-ui #hud .card,.solid-ui #hud .pill,.solid-ui #hud .ib,.solid-ui #hud .sheet,
.solid-ui #hud .offer,.solid-ui #hud .tip,.solid-ui #hud .how>div{box-shadow:0 3px 0 #130D20!important}
.solid-ui #hud .btn.go,.solid-ui #hud #t-gas{background-color:#FFBF00!important;color:#171125}
.solid-ui #hud .btn.alt,.solid-ui #hud .opt{background-color:#372546!important}
.solid-ui #hud .opt[aria-pressed=true]{background-color:#543257!important}
.solid-ui #hud #t-brake{background-color:#E5D6FF!important;color:#211333}
.solid-ui #hud #t-fly{background-color:#241B37!important;isolation:auto}
.solid-ui #hud #t-fly:disabled{opacity:1!important}
.solid-ui #hud #t-fly:before{z-index:0;background:#20F2D5!important;width:calc(var(--flight-reserve,1)*100%);right:auto;transform:none;transition:none}
.solid-ui #hud #t-fly>span{position:relative;z-index:1}
.solid-ui #hud .offer-slide{background-color:#20F2D5!important}
.solid-ui #hud .swipe-thumb{background-color:#FFF9EA!important;background-image:none!important;filter:none!important}
.solid-ui #hud .swipe-fill{background-color:#20F2D5!important;background-image:none!important}
.solid-ui #hud .offer-slide:before,.solid-ui #hud .offer-slide:after{background-image:none!important;filter:none!important}
.solid-ui #hud .context-action{background-color:#FF75B6!important}
.solid-ui #hud #t-jump{background-color:#271936!important;opacity:1!important}
.solid-ui #hud #t-jump:disabled{background-color:#271936!important;color:#BDAED6!important}
.solid-ui #hud .area-chip,.solid-ui #hud .toast.teal{background-color:#0B3E2B!important}
.solid-ui #hud .toast{background-color:#392B28!important}
.solid-ui #hud .toast.pink{background-color:#54213F!important}
.solid-ui #hud .tb:active,.solid-ui #hud .tb.on,.solid-ui #hud .ib:active,
.solid-ui #hud .btn:active,.solid-ui #hud .opt:active{filter:none!important;transform:none}
.solid-ui #hud .ui-icon,.solid-ui #hud .tb svg{filter:none!important}
.solid-ui #hud .toast,.solid-ui #hud .area-chip{transition:none}
.solid-ui #hud .title-screen h1{text-shadow:0 3px 0 #8E421F!important}
/* Recovery is an action, not a plum panel. Keep its readable face explicit
   after the generic button fallback in both decorated and opaque modes. */
#hud .rescue,.solid-ui #hud .rescue{
  background-color:#20F2D5!important;background-image:none!important;color:#171125!important;
  border-color:#84FFF0;box-shadow:0 3px 0 #130D20!important;text-shadow:none;
}
`;

export function installPaintSafety(touch: boolean) {
  if (touch) document.documentElement.classList.add('solid-ui');
  if (document.getElementById('ui-paint-safety')) return;
  const style = document.createElement('style'); style.id = 'ui-paint-safety';
  style.textContent = PAINT_SAFETY_CSS; document.head.appendChild(style);
}

export function worldPaintBlocked(root: HTMLElement) {
  return ['title-open','area-picker-open','has-modal','has-tip','rotation-blocked'].some(name => root.classList.contains(name)) ||
    [...root.querySelectorAll<HTMLElement>('.fmap')].some(map => !map.hidden);
}

export function guardWorldPaint(root: HTMLElement) {
  const update = () => document.documentElement.classList.toggle('ui-blocks-world', worldPaintBlocked(root));
  update();
  if (typeof MutationObserver !== 'undefined') new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['class','hidden'], subtree: true });
}

export function paintDiagnostics() {
  const viewport = window.visualViewport;
  return { mode: document.documentElement.classList.contains('solid-ui') ? 'opaque-touch' : 'decorated-opaque',
    worldPaintBlocked: document.documentElement.classList.contains('ui-blocks-world'),
    userAgent: navigator.userAgent, fullscreen: !!document.fullscreenElement,
    orientation: typeof screen === 'undefined' ? '' : screen.orientation?.type || '',
    visualViewport: viewport ? { width: viewport.width, height: viewport.height, scale: viewport.scale, offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop } : null };
}

export function graphicsDiagnostics(context: WebGLRenderingContext | WebGL2RenderingContext | null) {
  try { return context ? { version: context.getParameter(context.VERSION), renderer: context.getParameter(context.RENDERER), contextLost: context.isContextLost() } : { unavailable: true }; }
  catch { return { unavailable: true }; }
}

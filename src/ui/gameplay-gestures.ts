/** Native gesture fallback only; Pointer Events remain the sole input source. */
export function protectGameplaySurface(surface: EventTarget, active: () => boolean, ios: boolean) {
  if (!ios) return () => {};
  const prevent = (event: Event) => {
    if (active() && event.cancelable) event.preventDefault();
  };
  const types = ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange'];
  for (const type of types) surface.addEventListener(type, prevent, { passive: false });
  return () => { for (const type of types) surface.removeEventListener(type, prevent); };
}
// Safari may target a multi-control pinch at their common ancestor rather than
// either button. Track only touches that began on our gameplay surfaces.
export function protectGameplayGestures(surfaces: HTMLElement[], active: () => boolean, ios: boolean) {
  if (!ios) return;
  const touches = new Set<number>();
  for (const surface of surfaces) {
    protectGameplaySurface(surface, active, true);
    surface.addEventListener('touchstart', event => {
      if (active()) for (const touch of Array.from(event.changedTouches)) touches.add(touch.identifier);
    }, { passive: true });
  }
  const end = (event: TouchEvent) => { for (const touch of Array.from(event.changedTouches)) touches.delete(touch.identifier); };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
  window.addEventListener('blur', () => touches.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) touches.clear(); });
  for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, event => {
    if (touches.size && active() && event.cancelable) event.preventDefault();
  }, { passive: false });
}
export function isIOSGestureBrowser(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

/** Opt-in development ring buffer; no logging or listeners in ordinary gameplay. */
export function installGameplayTouchDiagnostics(surfaces: HTMLElement[], active: () => boolean) {
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('qaTouchDiagnostics')) return;
  const pointers = new Map<number, string>(), records: unknown[] = [];
  let previousScale = window.visualViewport?.scale ?? 1;
  const record = (event: string) => {
    const v = window.visualViewport, scale = v?.scale ?? 1;
    records.push({ time: performance.now(), event, unexpectedScaleChange: Math.abs(scale - previousScale) > .01,
      scale, width: v?.width, height: v?.height, offsetLeft: v?.offsetLeft, offsetTop: v?.offsetTop,
      innerWidth, innerHeight, orientation: screen.orientation?.type, active: active(),
      pointerCount: pointers.size, pointers: [...pointers],
      buttons: surfaces.filter(s => s.getAttribute('aria-pressed') === 'true' || s.classList.contains('pressed')).map(s => s.id) });
    previousScale = scale; if (records.length > 500) records.shift();
  };
  for (const surface of surfaces) {
    surface.addEventListener('pointerdown', e => { if (active()) pointers.set(e.pointerId, surface.id || 'canvas'); record('pointerdown'); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(type, e => {
      pointers.delete((e as PointerEvent).pointerId); record(type);
    });
  }
  window.addEventListener('blur', () => { pointers.clear(); record('blur'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pointers.clear(); record('visibilitychange'); });
  for (const type of ['resize', 'orientationchange']) window.addEventListener(type, () => record(type));
  for (const type of ['resize', 'scroll']) window.visualViewport?.addEventListener(type, () => record(`visualViewport.${type}`));
  (window as unknown as { __touchDiagnostics: unknown }).__touchDiagnostics = { records, snapshot: () => record('snapshot') };
  record('installed');
}

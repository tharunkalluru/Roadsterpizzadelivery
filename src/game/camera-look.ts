export interface CameraOrbitState {
  orbitYaw: number; orbitPitch: number; orbitDist: number;
  airOrbitPitch: number; airOrbitDist: number; dragging: boolean;
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function dragCameraOrbit(state: CameraOrbitState, dx: number, dy: number, flight: boolean) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  state.orbitYaw -= dx * .008;
  if (flight) state.airOrbitPitch = clamp(state.airOrbitPitch + dy * .005, -.7, 1.45);
  else state.orbitPitch = clamp(state.orbitPitch + dy * .005, .05, 1.25);
}
export function zoomCameraOrbit(state: CameraOrbitState, delta: number, flight: boolean) {
  if (!Number.isFinite(delta)) return;
  if (flight) state.airOrbitDist = clamp(state.airOrbitDist + delta * .01, -6, 26);
  else state.orbitDist = clamp(state.orbitDist + delta * .01, -4, 22);
}

// One scene finger owns the orbit until it ends. Releasing a second finger on
// a drive button must not end the original camera gesture.
export function installCameraLook(canvas: HTMLCanvasElement, state: CameraOrbitState,
  controls: { blocked(): boolean; flight(): boolean; speed(): number }, events: EventTarget = window) {
  let pointer: number | null = null, x = 0, y = 0;
  const release = () => {
    const previous = pointer; pointer = null; state.dragging = false;
    if (previous !== null) { try { canvas.releasePointerCapture(previous); } catch { /* Older browser or cancelled pointer. */ } }
  };
  canvas.addEventListener('pointerdown', event => {
    if (controls.blocked() || pointer !== null || Math.abs(controls.speed()) > 2 && !controls.flight()) return;
    pointer = event.pointerId; x = event.clientX; y = event.clientY; state.dragging = true;
    // Move keyboard focus off the minimap/menu trigger when returning to the
    // scene; Space must fly, rather than activating that previous button.
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(pointer); } catch { /* Scene-local dragging still works. */ }
    if (event.cancelable) event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer || !state.dragging) return;
    if (controls.blocked() || Math.abs(controls.speed()) > 2 && !controls.flight()) { release(); return; }
    const dx = event.clientX - x, dy = event.clientY - y; x = event.clientX; y = event.clientY;
    dragCameraOrbit(state, dx, dy, controls.flight());
  });
  const end = (event: Event) => { if ((event as PointerEvent).pointerId === pointer) release(); };
  events.addEventListener('pointerup', end); events.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end); events.addEventListener('blur', release);
  canvas.addEventListener('wheel', event => {
    if (!controls.blocked() && Math.abs(controls.speed()) < 2) { event.preventDefault(); zoomCameraOrbit(state, event.deltaY, controls.flight()); }
  }, { passive: false });
  return release;
}

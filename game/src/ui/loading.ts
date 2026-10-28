export type LoadingStage = 'fonts' | 'city' | 'streets' | 'view';
const stages: LoadingStage[] = ['fonts', 'city', 'streets', 'view'];

// Keep the partially built WebGL scene behind a separate opaque DOM surface.
export function showLoading(message: string, stage: LoadingStage = 'streets') {
  const shell = document.getElementById('loading');
  if (!shell) return;
  shell.hidden = false; shell.setAttribute('data-state', 'loading'); shell.setAttribute('aria-busy', 'true');
  const status = document.getElementById('loading-status'); if (status) status.textContent = message;
  shell.querySelectorAll('[data-load-step]').forEach((el, i) => el.setAttribute('data-state', i < stages.indexOf(stage) ? 'done' : i === stages.indexOf(stage) ? 'current' : 'waiting'));
  document.documentElement.classList.add('game-loading');
  const hud = document.getElementById('hud'); if (hud) hud.inert = true;
}
export function hideLoading() {
  const shell = document.getElementById('loading'); if (shell) { shell.hidden = true; shell.setAttribute('aria-busy', 'false'); }
  document.documentElement.classList.remove('game-loading');
  const hud = document.getElementById('hud'); if (hud) hud.inert = false;
}
export function loadingRetry(message: string, label = 'Retry loading', signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Loading cancelled', 'AbortError'));
  showLoading(message);
  const shell = document.getElementById('loading'); if (!shell) return Promise.reject(new Error(message));
  shell.setAttribute('data-state', 'error'); shell.setAttribute('aria-busy', 'false');
  return new Promise((resolve, reject) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'loading-retry'; button.textContent = label;
    const cleanup = () => { button.remove(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Loading cancelled', 'AbortError')); };
    button.addEventListener('click', () => { cleanup(); resolve(); }, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    (document.getElementById('loading-actions') || shell).append(button); button.focus();
  });
}

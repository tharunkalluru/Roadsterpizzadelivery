// Player settings, kept in this browser. Quality is read at start-up (changing it reloads the page).
import { GAME_BUILD } from '../game/bug-report';
import { pauseProgressHtml, type PauseProgress } from './pause-progress';
export interface Settings { quality: 'auto' | 'high' | 'low'; sound: boolean; steer: 'stick' | 'tilt'; tips: boolean }
const esc = (value: string) => value.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const KEY = 'p2ph-settings-v1';
const DEF: Settings = { quality: 'auto', sound: true, steer: 'stick', tips: true };

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEF };
    return {
      quality: ['auto', 'high', 'low'].includes(value.quality) ? value.quality : DEF.quality,
      sound: typeof value.sound === 'boolean' ? value.sound : DEF.sound,
      steer: ['stick', 'tilt'].includes(value.steer) ? value.steer : DEF.steer,
      tips: typeof value.tips === 'boolean' ? value.tips : DEF.tips,
    };
  } catch { return { ...DEF }; }
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// the settings sheet's markup and wiring, shared by the title screen and the pause menu
export function settingsHtml(s: Settings, touch: boolean) {
  const seg = (name: string, cur: string, opts: [string, string][]) =>
    `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" class="opt" data-k="${name}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<header class="sheet-header"><h2>Settings</h2><button type="button" class="btn go" id="set-done">Done</button></header>
    <div class="k">Graphics</div>${seg('quality', s.quality, [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (faster)']])}
    <div class="sm">Auto uses Low on phones and tablets and High on computers. Changing it reloads the game; your progress is kept.</div>
    <div class="k">Sound</div>${seg('sound', s.sound ? 'on' : 'off', [['on', 'On'], ['off', 'Off']])}
    <div class="sm">Engine, thrusters, traffic and delivery sounds. Starts after your first tap or key press.</div>
    ${touch ? `<div class="k">Steering</div>${seg('steer', s.steer, [['stick', 'Arrow buttons'], ['tilt', 'Tilt the phone']])}
    <div class="sm">Hold the left or right arrow to steer. Tilt steering hides the arrows; hold your phone sideways and tilt it like a steering wheel.</div>
    <div class="k">Driving controls</div><div class="sm">Hold GO to accelerate. JUMP grabs the slice above a marked auto and recharges five seconds after landing. Hitting a marked auto above 60 km/h also collects its order. Use FLY / LAND for longer flights. Stop at the blue marker to begin the delivery scene. Road speed is limited to 120 km/h; flight to 160 km/h.</div>` : ''}
    <div class="k">Tips while playing</div>${seg('tips', s.tips ? 'on' : 'off', [['on', 'Show'], ['off', 'Hide']])}
    <small class="sm build-info">Build ${GAME_BUILD.slice(0, 8)} · ${touch ? 'Opaque touch UI' : 'Opaque panel fallback'}</small>`;
}

export function pauseMenuHtml(campaign = false, progress?: PauseProgress, sessionLabel?: string) {
  return `<div class="pause-menu" data-pause-menu><header class="sheet-header"><div class="pause-heading"><span class="pause-kicker">Take a breather</span><h2>Game paused</h2></div>${sessionLabel ? `<small class="pause-session">${esc(sessionLabel)}</small>` : ''}</header>
    ${campaign ? pauseProgressHtml(progress) : ''}
    <button type="button" class="btn go pause-primary" id="resume">Resume driving</button>
    <div class="pause-grid${campaign ? ' campaign-grid' : ''}">
      <button type="button" class="pause-card" id="settings"><span>Settings</span><small>Sound, steering and graphics</small></button>
      ${campaign ? '<button type="button" class="pause-card" id="restaurant"><span>My restaurant</span><small>Restaurant and delivered customers</small></button>' : '<button type="button" class="pause-card" id="area"><span>Change area</span><small>Choose another part of Hyderabad</small></button>'}
      <button type="button" class="pause-card" id="unstick"><span>Back to the road</span><small>Recover your Roadster nearby</small></button>
    </div>
    <footer class="pause-footer${campaign ? ' campaign-restarts' : ''}"><button type="button" class="pause-reset" id="reset">${campaign ? 'Restart current level' : 'Reset progress'}</button>${campaign ? '<button type="button" class="pause-reset" id="start-level-one">Start from level 1</button>' : ''}</footer>
    <a class="pause-credits" href="/credits.html" target="_blank" rel="noopener">Map credits</a></div>`;
}
export function bindSettings(sheet: HTMLElement, s: Settings, apply: (s: Settings, changed: keyof Settings) => void) {
  sheet.querySelectorAll<HTMLButtonElement>('.opt[data-k]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k as keyof Settings, v = b.dataset.v!;
    if (k === 'quality') s.quality = v as Settings['quality'];
    else if (k === 'sound') s.sound = v === 'on';
    else if (k === 'steer') s.steer = v as Settings['steer'];
    else if (k === 'tips') s.tips = v === 'on';
    sheet.querySelectorAll<HTMLButtonElement>(`.opt[data-k="${k}"]`).forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    saveSettings(s); apply(s, k);
  }));
}

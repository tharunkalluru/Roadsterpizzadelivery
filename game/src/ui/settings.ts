// Player settings, kept in this browser. Quality is read at start-up (changing it reloads the page).
import { GAME_BUILD } from '../game/bug-report';
export type TargetFPS = 60 | 90 | 120;
export interface Settings { quality: 'auto' | 'high' | 'low'; sound: boolean; steer: 'stick' | 'tilt'; tips: boolean; targetFPS: TargetFPS; adaptiveResolution: boolean }
const KEY = 'p2ph-settings-v1';
const DEF: Settings = { quality: 'auto', sound: true, steer: 'stick', tips: true, targetFPS: 60, adaptiveResolution: false };

// Keep the existing storage key: adding defaults migrates old preferences without
// touching progress, sound, steering or an explicitly selected graphics preset.
export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEF };
  const v = value as Partial<Settings>;
  return {
    quality: ['auto', 'high', 'low'].includes(v.quality) ? v.quality : DEF.quality,
    sound: typeof v.sound === 'boolean' ? v.sound : DEF.sound,
    steer: ['stick', 'tilt'].includes(v.steer) ? v.steer : DEF.steer,
    tips: typeof v.tips === 'boolean' ? v.tips : DEF.tips,
    targetFPS: [60, 90, 120].includes(v.targetFPS) ? v.targetFPS : DEF.targetFPS,
    adaptiveResolution: typeof v.adaptiveResolution === 'boolean' ? v.adaptiveResolution : DEF.adaptiveResolution,
  };
}

export function loadSettings(): Settings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch { return { ...DEF }; }
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// the settings sheet's markup and wiring, shared by the title screen and the pause menu
export function settingsHtml(s: Settings, touch: boolean) {
  const seg = (name: string, cur: string, opts: [string, string][]) =>
    `<div class="seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" class="opt" data-k="${name}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<h2>Settings</h2>
    <div class="k">Graphics</div>${seg('quality', s.quality, [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (faster)']])}
    <div class="sm">Auto balances detail using measured performance. Changing graphics reloads the game; your progress is kept.</div>
    <div class="k">Frame rate</div>${seg('targetFPS', String(s.targetFPS), [['60', '60 FPS'], ['90', '90 FPS'], ['120', '120 FPS']])}
    <div class="sm">Requested goal. The game uses an evenly paced browser-supported rate and lowers it under sustained load. Graphics stay unchanged.</div>
    <div class="k">Adaptive scene resolution</div>${seg('adaptiveResolution', s.adaptiveResolution ? 'on' : 'off', [['off', 'Off'], ['on', 'On']])}
    <div class="sm">Optional small scene-resolution changes. Buttons and text stay sharp.</div>
    <div class="k">Sound</div>${seg('sound', s.sound ? 'on' : 'off', [['on', 'On'], ['off', 'Off']])}
    <div class="sm">Engine, thrusters, traffic and delivery sounds. Starts after your first tap or key press.</div>
    ${touch ? `<div class="k">Steering</div>${seg('steer', s.steer, [['stick', 'Arrow buttons'], ['tilt', 'Tilt the phone']])}
    <div class="sm">Hold the left or right arrow to steer. Tilt steering hides the arrows; hold your phone sideways and tilt it like a steering wheel.</div>
    <div class="k">Driving controls</div><div class="sm">Hold GO to accelerate. JUMP performs a short moving kickflip and lands automatically. The next jump is ready five seconds after landing. Road speed is limited to 120 km/h; flight to 160 km/h. FLY changes to LAND in the air, then LANDING while descending. Collection and handover buttons appear when you stop at the marked location.</div>` : ''}
    <div class="k">Tips while playing</div>${seg('tips', s.tips ? 'on' : 'off', [['on', 'Show'], ['off', 'Hide']])}
    <small class="sm build-info">Build ${GAME_BUILD.slice(0, 8)} · ${touch ? 'Opaque touch UI' : 'Opaque panel fallback'}</small>`;
}
export function bindSettings(sheet: HTMLElement, s: Settings, apply: (s: Settings, changed: keyof Settings) => void) {
  sheet.querySelectorAll<HTMLButtonElement>('.opt[data-k]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k as keyof Settings, v = b.dataset.v!;
    if (k === 'quality') s.quality = v as Settings['quality'];
    else if (k === 'targetFPS' && ['60', '90', '120'].includes(v)) s.targetFPS = Number(v) as TargetFPS;
    else if (k === 'adaptiveResolution') s.adaptiveResolution = v === 'on';
    else if (k === 'sound') s.sound = v === 'on';
    else if (k === 'steer') s.steer = v as Settings['steer'];
    else if (k === 'tips') s.tips = v === 'on';
    sheet.querySelectorAll<HTMLButtonElement>(`.opt[data-k="${k}"]`).forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    saveSettings(s); apply(s, k);
  }));
}

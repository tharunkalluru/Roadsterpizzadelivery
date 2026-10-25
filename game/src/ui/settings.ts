// Player settings, kept in this browser. Quality is read at start-up (changing it reloads the page).
export interface Settings { quality: 'auto' | 'high' | 'low'; sound: boolean; steer: 'stick' | 'tilt'; tips: boolean }
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
  return `<h2>Settings</h2>
    <div class="k">Graphics</div>${seg('quality', s.quality, [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (faster)']])}
    <div class="sm">Auto uses Low on phones and tablets and High on computers. Changing it reloads the game; your progress is kept.</div>
    <div class="k">Sound</div>${seg('sound', s.sound ? 'on' : 'off', [['on', 'On'], ['off', 'Off']])}
    <div class="sm">Engine, thrusters, traffic and delivery sounds. Starts after your first tap or key press.</div>
    ${touch ? `<div class="k">Steering</div>${seg('steer', s.steer, [['stick', 'Arrow buttons'], ['tilt', 'Tilt the phone']])}
    <div class="sm">Hold the left or right arrow to steer. Tilt steering hides the arrows; hold your phone sideways and tilt it like a steering wheel.</div>` : ''}
    <div class="k">Tips while playing</div>${seg('tips', s.tips ? 'on' : 'off', [['on', 'Show'], ['off', 'Hide']])}`;
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

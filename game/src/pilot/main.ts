import release from '../../config/pilot-release.json';
import type { PilotZoneDefinition } from './zone';

const ui = document.getElementById('ui')!;
async function boot() {
  if (release.zone === null || release.status !== 'qualified') {
    ui.innerHTML = `<main class="pilot-gate"><div class="pilot-wordmark">ROADSTER <span>PIZZA DELIVERY</span></div><section class="pilot-card"><span class="pilot-eyebrow">SEPARATE GAME · DEVELOPMENT</span><h1>A real delivery.<br>A verified neighbourhood.</h1><p class="pilot-lead">The delivery game is being prepared. Play opens after one connected area passes mapping verification.</p><div class="pilot-status"><span aria-hidden="true">◌</span><div><strong>Waiting for a verified zone</strong><p>Survey 133 has no fully verified playable area yet. Provisional imagery is kept separate from verified coverage.</p></div></div><p class="pilot-detail">Planned play: accept an order, drive to a supported pizza pickup, collect it, deliver inside the boundary, then review your result.</p><button type="button" disabled aria-describedby="release-note">Play pending verification</button><p id="release-note" class="pilot-footnote">The live game remains unchanged. This development screen does not claim a completed or fully mapped pilot.</p></section></main>`;
    return;
  }
  const response = await fetch('./research/street-survey.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Survey unavailable (${response.status})`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  if (sha !== release.surveySha256) throw new Error('Pinned survey mismatch. Play remains locked.');
  const { App } = await import('../app/app');
  const app = new App(document.getElementById('gl') as HTMLCanvasElement, ui, { definition: release.zone as unknown as PilotZoneDefinition, surveySha256: sha, surveyData: JSON.parse(new TextDecoder().decode(bytes)) });
  await app.boot();
}
void boot().catch((e: unknown) => {
  ui.replaceChildren();
  const message = document.createElement('p'); message.className = 'pilot-error'; message.setAttribute('role', 'alert');
  message.textContent = `Play remains locked: ${e instanceof Error ? e.message : 'Qualification could not be checked.'}`;
  ui.append(message);
});

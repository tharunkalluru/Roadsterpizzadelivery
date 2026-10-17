// Capture gameplay views of the production build (debug harness): node scripts/capture.mjs <outdir> [mission] [w] [h]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2] ?? 'qa/artifacts/views';
const mission = process.argv[3] ?? 'mt02_first_flight';
const W = +(process.argv[4] ?? 1280), H = +(process.argv[5] ?? 720);
const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: W < 1000 ? 2 : 1, hasTouch: W < 1000 });
try {
  await p.goto(`http://127.0.0.1:4180/?debug&manualclock`);
  await p.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 180000 });
  await p.evaluate(() => { document.querySelector('.debug')?.classList.add('hidden'); });
  await p.screenshot({ path: `${out}/menu-${W}.png` });
  await p.click('[data-play]'); await p.click(`[data-m="${mission}"]`); await p.click('[data-go]');
  await p.waitForFunction(() => window.__hmd.state === 'READY', null, { timeout: 180000 });
  await p.evaluate(() => window.__hmd.debugSkipCountdown());
  await p.waitForFunction(() => window.__hmd.state === 'PLAYING');
  await p.addStyleTag({ content: '.debug{display:none!important}' });
  await p.evaluate(() => window.__hmd.enableAutopilot());
  const adv = (n) => p.evaluate((n) => window.__hmd.debugAdvance(n), n);
  await adv(420); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/drive-${W}.png` });
  await p.evaluate(() => { window.__hmd.autopilot = null; });
  await p.keyboard.press('Space'); await adv(1);
  for (let i = 0; i < 6 && (await p.evaluate(() => window.__hmd.session.player.ledger.launches)) === 0; i++) { await adv(90); await p.keyboard.press('Space'); await adv(1); }
  await adv(160); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/fly-${W}.png` });
  await p.keyboard.press('Space'); await adv(40); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/landing-${W}.png` });
  console.log(JSON.stringify(await p.evaluate(() => ({ move: window.__hmd.session.player.move, fuel: window.__hmd.session.player.ledger.remainingTicks, stats: window.__hmd.view.stats }))));
} finally { await b.close(); srv.kill(); }

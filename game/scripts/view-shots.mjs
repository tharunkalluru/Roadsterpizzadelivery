// Free-camera screenshots of the running game world (production build, debug harness).
// node scripts/view-shots.mjs <outdir> '<json [{name, missionId?, eye:[x,y,z], at:[x,y,z]}]>'
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const shots = JSON.parse(process.argv[3]);
const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4184', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
try {
  await p.goto(`http://127.0.0.1:4184/?debug&manualclock`);
  await p.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 300000 });
  await p.click('[data-play]');
  const mid = shots[0].missionId;
  await p.evaluate((id) => { const a = window.__hmd; a.screens.preview(id ? a.missions.find((m) => m.id === id) : a.missions.find((m) => !m.practice)); }, mid);
  await p.click('[data-go]');
  await p.waitForFunction(() => window.__hmd.state === 'READY', null, { timeout: 300000 });
  await p.addStyleTag({ content: '.debug,.hud,#ui,.ui{display:none!important}' });
  await p.evaluate(() => { const v = window.__hmd.view; v.update = () => {}; });
  for (const s of shots) {
    await p.evaluate((s) => { const v = window.__hmd.view; v.camera.position.set(...s.eye); v.camera.lookAt(...s.at); v.camera.fov = s.fov ?? 60; v.camera.updateProjectionMatrix(); window.__hmd.view.env?.update?.(v.camera.position); }, s);
    await p.waitForTimeout(4000);
    await p.screenshot({ path: `${out}/${s.name}.png` });
  }
} finally { await b.close(); srv.kill(); }

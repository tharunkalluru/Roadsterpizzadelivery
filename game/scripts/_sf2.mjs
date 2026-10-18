import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4182', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
try {
  await p.goto(`http://127.0.0.1:4182/?debug&manualclock`);
  await p.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 300000 });
  await p.click('[data-play]'); await p.click('[data-m]'); await p.click('[data-go]');
  await p.waitForFunction(() => window.__hmd.state === 'READY', null, { timeout: 300000 });
  await p.waitForTimeout(3000);
  await p.addStyleTag({ content: '.debug,.hud,#ui{display:none!important}' });
  const picks = await p.evaluate(async () => {
    const a = window.__hmd; const m = a.loader.manifest; const out = [];
    for (const id of [...a.view.chunkGroups.keys()]) {
      const ref = m.chunks.find((c) => c.id === id); const c = await (await fetch('./world/hyd-metro/v2/' + ref.file)).json();
      for (const s of c.storefronts ?? []) if (s.facade && s.floor === 0) out.push(s);
    }
    return out.slice(0, 200).filter((_, i) => i % 40 === 0).map((s) => ({ name: s.name, f: s.facade, h: s.facingHeading }));
  });
  console.log(JSON.stringify(picks.map((x) => x.name)));
  await p.evaluate(() => { const v = window.__hmd.view; v.update = () => {}; });
  let i = 0;
  for (const s of picks) {
    await p.evaluate((s) => { const v = window.__hmd.view; const cx = (s.f[0][0] + s.f[1][0]) / 2, cz = (s.f[0][1] + s.f[1][1]) / 2; const fx = -Math.sin(s.h), fz = -Math.cos(s.h); v.camera.position.set(cx + fx * 14, 3, cz + fz * 14); v.camera.lookAt(cx, 3, cz); v.camera.fov = 60; v.camera.updateProjectionMatrix(); }, s);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `qa/artifacts/v2/sign-${i++}.png` });
  }
} finally { await b.close(); srv.kill(); }

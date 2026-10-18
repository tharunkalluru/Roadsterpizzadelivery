// Probe the v2 world in the production build: load time, mission list, in-mission frame stats.
// node scripts/probe-v2.mjs <outdir> [missionId]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2] ?? 'qa/artifacts/v2';
const srv = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4181', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('pageerror', e.message));
try {
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:4181/?debug&manualclock`);
  await p.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 300000 });
  console.log('menu after', Date.now() - t0, 'ms');
  const info = await p.evaluate(() => { const a = window.__hmd; return { net: a.isNetwork(), roads: a.core.roads.length, missions: a.missions.map((m) => [m.id, m.level, m.routeLengthM, m.deadlineSeconds, m.fromArea, m.toArea]) }; });
  console.log(JSON.stringify(info));
  await p.click('[data-play]'); await p.screenshot({ path: `${out}/missions.png` });
  const mid = process.argv[3] ?? info.missions.find((m) => m[1] === 1)[0];
  await p.evaluate((id) => window.__hmd.screens.preview(window.__hmd.missions.find((m) => m.id === id)), mid);
  const t1 = Date.now();
  await p.click('[data-go]');
  await p.waitForFunction(() => window.__hmd.state === 'READY', null, { timeout: 300000 });
  console.log('mission ready after', Date.now() - t1, 'ms');
  await p.evaluate(() => window.__hmd.debugSkipCountdown());
  await p.addStyleTag({ content: '.debug{display:none!important}' });
  await p.evaluate(() => window.__hmd.enableAutopilot());
  const adv = (n) => p.evaluate((n) => window.__hmd.debugAdvance(n), n);
  for (let i = 0; i < 4; i++) {
    await adv(300); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/drive-${i}.png` });
    console.log(JSON.stringify(await p.evaluate(() => { const a = window.__hmd; const r = a.renderer.info; return { pos: [a.session.player.x | 0, a.session.player.z | 0], calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, chunks: a.view.chunkGroups.size, heap: performance.memory ? (performance.memory.usedJSHeapSize / 1e6) | 0 : null }; })));
  }
  const fps = await p.evaluate(async () => { let n = 0; const t = performance.now(); await new Promise((r) => { const f = () => { if (++n < 30) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return 30000 / (performance.now() - t); });
  console.log('swiftshader fps', fps.toFixed(1));
} finally { await b.close(); srv.kill(); }

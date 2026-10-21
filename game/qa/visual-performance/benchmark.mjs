import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const phase = process.argv[2] ?? 'after';
const port = process.argv[3] ?? '5486';
const out = new URL(`../../output/visual-performance/${phase}/`, import.meta.url);
await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile(new URL('../../config/provisional-preview.json', import.meta.url)));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const profile of [
    { name: 'phone-low', width: 844, height: 390, quality: 'low', touch: true, dpr: 2 },
    { name: 'desktop-standard', width: 1280, height: 720, quality: 'standard', touch: false, dpr: 1 },
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.dpr });
    await context.addInitScript(({ id, quality }) => localStorage.setItem(`hmd.provisional.${id}.settings`, JSON.stringify({ schema: 1, data: { quality, practiceDone: true, musicVolume: 0, sfxVolume: 0, uiVolume: 0 } })), { id: config.zone.id, quality: profile.quality });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const start = performance.now();
    await page.goto(`http://127.0.0.1:${port}/preview.html?debug&manualclock`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-preview-start]').click();
    await page.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 120000 });
    const menuMs = performance.now() - start;
    await page.locator('[data-play]').click();
    await page.locator('[data-m]').first().click();
    await page.locator('[data-go]').click();
    await page.waitForFunction(() => window.__hmd?.state === 'READY', null, { timeout: 120000 });
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__hmd?.state === 'PLAYING', null, { timeout: 30000 });
    const playMs = performance.now() - start;
    await page.evaluate(() => { window.__hmd.debug = false; document.querySelector('[data-debug]').classList.add('hidden'); });
    await page.waitForTimeout(2000);
    const metrics = await page.evaluate(async () => {
      const app = window.__hmd, renderer = app.renderer, gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const times = [], draws = [], triangles = [];
      let last = performance.now();
      const start = last;
      await new Promise(resolve => {
        function sample(t) {
          times.push(t - last); last = t;
          draws.push(renderer.info.render.calls); triangles.push(renderer.info.render.triangles);
          if (t - start >= 10000) resolve(); else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      times.shift(); times.sort((a, b) => a - b);
      const q = n => times[Math.floor((times.length - 1) * n)];
      const memory = performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null;
      const resources = performance.getEntriesByType('resource');
      return {
        method: '10-second stationary normal-spawn rendered sample, simulation manually frozen; developer server; not physical-phone certification',
        samples: times.length, frameMs: { p50: q(.5), p95: q(.95), p99: q(.99) },
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        drawCalls: { min: Math.min(...draws), max: Math.max(...draws) }, triangles: { min: Math.min(...triangles), max: Math.max(...triangles) },
        gpuResources: { ...renderer.info.memory, programs: renderer.info.programs.length }, memory,
        loadedResources: { count: resources.length, transferBytes: resources.reduce((n, r) => n + r.transferSize, 0), decodedBytes: resources.reduce((n, r) => n + r.decodedBodySize, 0) },
        resolution: { dpr: renderer.getPixelRatio(), width: renderer.domElement.width, height: renderer.domElement.height },
        quality: app.quality, state: app.state, position: { x: app.session.player.x, z: app.session.player.z },
      };
    });
    // Retained JavaScript heap is a separate diagnostic, sampled after an explicit
    // collection outside the timed window. Neither number measures total device RAM.
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    metrics.retainedHeapAfterGC = { usedSize: heap.usedSize, totalSize: heap.totalSize, embedderHeapUsedSize: heap.embedderHeapUsedSize, backingStorageSize: heap.backingStorageSize };
    await cdp.detach();
    await page.screenshot({ path: new URL(`${profile.name}.png`, out).pathname });
    results.push({ profile, menuMs, playMs, ...metrics, pageErrors: errors });
    console.log(JSON.stringify({ phase, profile: profile.name, menuMs, playMs, ...metrics, pageErrors: errors }));
    await context.close();
  }
  await writeFile(new URL('metrics.json', out), JSON.stringify({ phase, at: new Date().toISOString(), results }, null, 2) + '\n');
} finally { await browser.close(); }

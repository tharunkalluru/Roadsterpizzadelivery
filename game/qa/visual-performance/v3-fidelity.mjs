import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const out = new URL('../../output/visual-performance/v3-fidelity/', import.meta.url);
await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile(new URL('../../config/provisional-preview.json', import.meta.url)));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const quality of ['low', 'standard']) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    try {
      await context.addInitScript(({ id, quality }) => localStorage.setItem(`hmd.provisional.${id}.settings`, JSON.stringify({ schema: 1, data: { quality, practiceDone: true, musicVolume: 0, sfxVolume: 0, uiVolume: 0 } })), { id: config.zone.id, quality });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:5486/preview.html?debug&manualclock');
      await page.locator('[data-preview-start]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 120000 });
      await page.locator('[data-play]').click(); await page.locator('[data-m]').first().click(); await page.locator('[data-go]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'READY', null, { timeout: 120000 });
      await page.locator('[data-start]').click(); await page.waitForFunction(() => window.__hmd?.state === 'PLAYING');
      const result = await page.evaluate(async () => {
        const { compareSignals } = await import('/qa/visual-performance/v3-signal-fidelity.ts');
        return compareSignals(window.__hmd);
      });
      for (let i = 0; i < result.results.length; i++) for (const key of ['originalImage', 'batchedImage']) {
        await writeFile(new URL(`${quality}-${i}-${key}.png`, out), Buffer.from(result.results[i][key].split(',')[1], 'base64'));
        delete result.results[i][key];
      }
      results.push({ quality, ...result, errors });
      if (errors.length || result.results.some(r => r.meanAbsoluteChannelDifference > .1 || r.changedPixelFraction > .01)) process.exitCode = 1;
    } finally { await context.close(); }
  }
  await writeFile(new URL('metrics.json', out), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally { await browser.close(); }

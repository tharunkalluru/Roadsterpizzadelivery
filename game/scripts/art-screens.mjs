// Usage: node scripts/art-screens.mjs [quality] [preset,preset,...|v2]   ('v2' = the shop/flyover/skywalk set)
// Requires `npx vite --port 5199` running. Writes PNGs to qa/artifacts/art/.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const quality = process.argv[2] || 'standard';
const V2 = 'shops,shops2,shopsclose,shopsclose2,telugu,shopsaerial,shopsfar,shopsfar2,flyover,flyoverside,flyoverunder,flyoveraerial,flyoverslip,flyoverramp,skywalk,skywalkground,skywalkdeck,skywalkstairs,footbridge';
const arg = process.argv[3] || 'car,carfly,carside,carrear,street,aerial,metro,metrostreet,traffic,markers,sign';
const presets = (arg === 'v2' ? V2 : arg === 'real-v2' ? 'real-v2,real-v2-street,real-v2-skywalk,real-v2-fly' : arg).split(',');
const isV2 = (p) => /^(shops|telugu|flyover|skywalk|footbridge|real-v2|realfly)/.test(p);
const out = 'qa/artifacts/art';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5199/art-preview.html#${presets[0]}&q=${quality}`);
await page.waitForFunction(() => window.__artReady === true, null, { timeout: 180000 });
for (const p of presets) {
  await page.evaluate((hash) => { location.hash = hash; }, `${p}&q=${quality}`);
  await page.waitForFunction(() => window.__artFrames() >= 3, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const stats = await page.evaluate(() => window.__artStats());
  await page.screenshot({ path: `${out}/${isV2(p) ? 'v2-' : ''}${quality}-${p}.png` });
  console.log(p, JSON.stringify(stats));
  if (process.env.VIS) console.log('  VISIBLE', JSON.stringify(await page.evaluate(() => window.__artVisible())));
}
const info = await page.evaluate(() => ({ info: window.__artInfo?.(), real: window.__artReal?.() }));
console.log('BREAKDOWN', JSON.stringify(await page.evaluate(() => window.__artBreakdown?.())));
console.log('INFO', JSON.stringify(info));
await browser.close();

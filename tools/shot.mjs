// Render a still from the local build: node tools/shot.mjs "<query>" out.png [w h]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const [query, out, w = '1280', h = '592'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:4173/?still=1&w=${w}&h=${h}&${query}`);
await page.waitForFunction(() => window.__done || window.__err, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__err);
if (err) { console.log('ERR', err); process.exit(1); }
const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log('ok', out, (Date.now() - t0) / 1000 + 's');
await browser.close();

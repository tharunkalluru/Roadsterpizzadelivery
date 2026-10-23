// Load a page of the local build and print console output and boot state: node tools/debugpage.mjs "<query>" [waitMs]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const [query, wait = '30000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 320 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
await page.goto(`http://127.0.0.1:4173/?${query}`);
await page.waitForTimeout(+wait);
console.log('state', await page.evaluate(() => ({ done: window.__done, err: window.__err, game: !!window.__game, loading: document.getElementById('loading')?.textContent })));
await browser.close();

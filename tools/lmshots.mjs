// Monument review renders: an aerial and a street-level view of each landmark (still mode).
// node tools/lmshots.mjs outdir [kind,kind,...]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2], only = process.argv[3] ? process.argv[3].split(',') : null;
const L = [
  ['charminar', 17.36160, 78.47463, 11.5, 60], ['charkaman', 17.36248, 78.47483, 11.5, 70], ['mecca', 17.36038, 78.47313, 95, 110], ['chowmahalla', 17.35739, 78.47161, 6, 300],
  ['falaknuma', 17.33070, 78.46700, 0, 170], ['golconda', 17.38298, 78.39906, 75, 300], ['balahisar', 17.38429, 78.40262, 90, 40], ['fateh', 17.37930, 78.41280, 110, 50],
  ['qstomb', 17.39423, 78.39493, 0, 70], ['qsmosque', 17.39690, 78.39660, 90, 45], ['taramati', 17.37610, 78.37811, 183, 55], ['paigah', 17.34415, 78.50415, 90, 70],
  ['buddha', 17.41557, 78.47500, 90, 40], ['secretariat', 17.40978, 78.46922, 90, 190], ['ambedkar', 17.41326, 78.46741, 72, 70], ['martyrs', 17.40866, 78.47298, 15, 70],
  ['birla', 17.40607, 78.46914, 90, 110], ['assembly', 17.40135, 78.46774, 45, 120], ['highcourt', 17.36909, 78.47199, 347, 110], ['osmania', 17.37256, 78.47353, 163, 170],
  ['salarjung', 17.37136, 78.48043, 340, 120], ['ouarts', 17.41921, 78.52625, 155, 110], ['cybertowers', 17.45048, 78.38112, 56, 100], ['cablebridge', 17.43177, 78.38994, 76, 260],
  ['thub', 17.43400, 78.37918, 40, 100], ['stadium', 17.44618, 78.34416, 0, 260], ['clocktower', 17.44090, 78.49855, 0, 38],
];
const KX = Math.cos(17.4063 * Math.PI / 180) * 6380050.094 * Math.PI / 180, KZ = 6341141.9 * Math.PI / 180;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (const [kind, lat, lon, rot, S] of L) {
  if (only && !only.includes(kind)) continue;
  const x = (lon - 78.4966) * KX, z = -(lat - 17.4063) * KZ, b = rot * Math.PI / 180;
  const fx = Math.sin(b), fz = -Math.cos(b), sx = Math.cos(b), sz = Math.sin(b);      // front, right
  const views = {
    air: [x + fx * S * 1.25 + sx * S * 0.55, S * 0.62, z + fz * S * 1.25 + sz * S * 0.55, x, S * 0.12, z],
    street: [x + fx * S * 0.95 - sx * S * 0.25, 1.8, z + fz * S * 0.95 - sz * S * 0.25, x, S * 0.28, z],
  };
  for (const [v, c] of Object.entries(views)) {
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:4173/?still=1&hour=10.5&r=${Math.round(Math.max(450, S * 1.6))}&fov=55&cam=${c.map((n) => n.toFixed(1)).join(',')}`);
    await page.waitForFunction(() => window.__done || window.__err, null, { timeout: 400000 });
    await page.screenshot({ path: `${out}/${kind}_${v}.png`, timeout: 120000 });
    console.log(kind, v, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
}
await browser.close();

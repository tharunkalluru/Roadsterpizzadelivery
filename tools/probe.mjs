import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const [query] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 200 } });
await page.goto(`http://127.0.0.1:4173/?still=1&w=400&h=200&${query}`);
await page.waitForFunction(() => window.__done || window.__err, null, { timeout: 600000 });
const r = await page.evaluate(() => {
  const E = window.__engine, T = window.__THREE, cam = E.camera;
  const rc = new T.Raycaster(); const out = [];
  for (const [nx, ny] of [[0, 0.8], [0.5, 0.9], [-0.5, 0.6]]) {
    rc.setFromCamera(new T.Vector2(nx, ny), cam);
    const hits = rc.intersectObjects(E.scene.children, true).slice(0, 3);
    out.push(hits.map(h => ({ d: h.distance.toFixed(1), name: h.object.name, type: h.object.type, mat: h.object.material?.type, p: h.point.toArray().map(v => v.toFixed(1)), geom: h.object.geometry?.type })));
  }
  return { out, far: cam.far, bg: E.scene.background, fog: E.scene.fog?.density };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();

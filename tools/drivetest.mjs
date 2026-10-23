// Drive across tile borders with a simple autopilot following the GPS route (fixed 50 ms steps, yielding so the
// tile worker can deliver). Reports streaming, add times and whether the car stayed on the road. node tools/drivetest.mjs outdir
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:4173/?q=high&area=RTC%20X%20Roads');
await page.waitForFunction(() => window.__game || window.__err, null, { timeout: 300000 });
const res = await page.evaluate(async () => {
  const g = window.__game, w = window.__world;
  g.halted = true; window.__render = g.engine.render.bind(g.engine); g.engine.render = () => {}; g.clock.getDelta = () => 0.05;
  g.order = null; g.hud.offer(null);
  const tiv = g.theatres.find((t) => t.def.key === 'tivoli');
  g.setTarget(tiv.stop, '#FF8FB1');
  const P = g.player.pos, log = [];
  let frames = 0, stuck = 0, lastD = 1e9, offRoad = 0, minY = 99, maxY = -99, loadedKeys = new Set(), unloaded = 0;
  const onRem = w.onTileRemoved; w.onTileRemoved = (t) => { unloaded++; onRem(t); };
  for (let chunk = 0; chunk < 160; chunk++) {
    for (let i = 0; i < 40; i++) {
      // kinematic drive: slide the car along the GPS polyline at 20 m/s (tests streaming, not steering)
      if (!window.__path && g.route) { window.__path = g.route.pts.map((p) => [p[0], p[1], p[2]]); window.__s = 0; }
      const path = window.__path;
      if (path) {
        window.__s += 20 * 0.05; let acc = 0, k = 1;
        for (; k < path.length; k++) { const L = Math.hypot(path[k][0] - path[k - 1][0], path[k][2] - path[k - 1][2]); if (acc + L >= window.__s) break; acc += L; }
        if (k >= path.length) k = path.length - 1;
        const a = path[k - 1], b = path[k], L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, u = Math.min(1, (window.__s - acc) / L);
        P.x = a[0] + (b[0] - a[0]) * u; P.z = a[2] + (b[2] - a[2]) * u; P.y = a[1] + (b[1] - a[1]) * u + 0.55;
        g.player.yaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2])); g.player.speed = 0;
      }
      g.frame(); frames++;
      minY = Math.min(minY, P.y); maxY = Math.max(maxY, P.y);
      if (!g.player.onRoad) offRoad++;
    }
    for (const k of w.tiles.keys()) loadedKeys.add(k);
    const d = Math.hypot(tiv.stop.x - P.x, tiv.stop.z - P.z);
    if (chunk % 10 === 0) log.push({ t: Math.round(frames * 0.05), d: Math.round(d), tiles: w.tiles.size, pending: w.pending.size, x: Math.round(P.x), z: Math.round(P.z), y: +P.y.toFixed(1), v: +(g.player.speed * 3.6).toFixed(0), area: g.areaName(P.x, P.z) });
    if (d < 25) break;
    if (Math.abs(d - lastD) < 0.5) stuck++; lastD = d;
    await new Promise((r) => setTimeout(r, 0));
  }
  g.keys.clear();
  return { log, seconds: Math.round(frames * 0.05), finalDist: Math.round(Math.hypot(tiv.stop.x - P.x, tiv.stop.z - P.z)), tilesSeen: loadedKeys.size, unloaded, offRoadPct: Math.round(offRoad / frames * 100), minY: +minY.toFixed(2), maxY: +maxY.toFixed(2),
    addMsMax: Math.max(...w.addMs), addMsMedian: w.addMs.slice().sort((a, b) => a - b)[Math.floor(w.addMs.length / 2)] };
});
console.log(JSON.stringify(res, null, 1));
await page.evaluate(() => window.__render());
await page.screenshot({ path: `${out}/d_arrived.png`, timeout: 180000 });
console.log('errors', JSON.stringify(errs.slice(0, 6)));
fs.writeFileSync(`${out}/drivetest.log`, JSON.stringify(res, null, 1));
await browser.close();

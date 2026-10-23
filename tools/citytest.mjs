// City streaming check: boot, then drive/teleport across Hyderabad and report tile loads, build times, memory and
// screenshots at landmarks. node tools/citytest.mjs outdir
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const t0 = Date.now();
await page.goto('http://127.0.0.1:4173/?q=high&area=RTC%20X%20Roads');
await page.waitForFunction(() => window.__game || window.__err, null, { timeout: 300000 });
const log = [];
const note = (s) => { console.log(s); log.push(s); };
note(`boot ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.evaluate(() => {
  const g = window.__game;
  g.halted = true; window.__render = g.engine.render.bind(g.engine); g.engine.render = () => {}; g.clock.getDelta = () => 0.05;
  window.__step = (n) => { for (let i = 0; i < n; i++) g.frame(); };
  g.order = null; g.hud.offer(null); g.setTarget(null); window.__step(5); g.order = null; g.hud.offer(null);
  window.__stats = () => {
    const w = window.__world, r = g.engine.renderer.info;
    let verts = 0; for (const t of w.tiles.values()) verts += t.built.counts.verts;
    const bm = w.buildMs.filter((_, i) => i % 2 === 0);
    return { tiles: w.tiles.size, pending: w.pending.size, verts: Math.round(verts / 1000) + 'k', buildMsMedian: bm.sort((a, b) => a - b)[Math.floor(bm.length / 2)], buildMsMax: Math.max(...bm), addMsMedian: w.addMs.slice().sort((a, b) => a - b)[Math.floor(w.addMs.length / 2)], addMsMax: Math.max(...w.addMs), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      graphEdges: g.graph.edges.length, cars: g.traffic.cars.length, walkers: g.walkers.list.length, busStops: w.busStops.length, calls: r.render.calls, tris: r.render.triangles };
  };
});
const ll = (lat, lon) => { const KX = Math.cos(17.4063 * Math.PI / 180) * 6380050.094 * Math.PI / 180, KZ = 6341141.9 * Math.PI / 180; return [(lon - 78.4966) * KX, -(lat - 17.4063) * KZ]; };
const PLACES = [['RTC X Roads', 17.4068, 78.4966], ['Charminar', 17.3616, 78.4747], ['Punjagutta flyover', 17.4275, 78.4505], ['HITEC City', 17.4474, 78.3762], ['Secunderabad', 17.4399, 78.4983], ['Kukatpally', 17.4948, 78.3996], ['Dilsukhnagar', 17.3688, 78.5247], ['ORR Gachibowli', 17.4209, 78.3359]];
await page.evaluate(() => window.__render());
await page.screenshot({ path: `${out}/c0_start.png`, timeout: 180000 });
note('start ' + JSON.stringify(await page.evaluate(() => window.__stats())));
for (const [name, lat, lon] of PLACES.slice(1)) {
  const [x, z] = ll(lat, lon);
  const t1 = Date.now();
  const r = await page.evaluate(async ([x, z]) => {
    const g = window.__game, w = window.__world;
    await w.ensure(x, z, 600);
    // drop the car on the nearest street and take a few steps so traffic and walkers fill in
    const n = g.graph.nearestNode(x, z, 20);
    if (!n) return { err: 'no road near' };
    const o = n.out[0]; const p = g.graph.pointAt(o.edge, Math.min(8, o.edge.len / 2), o.dir, o.edge.e.oneway ? 0 : Math.max(2.2, o.edge.e.w / 4 + 0.8));
    g.player.place(p.x, p.z, Math.atan2(-p.hx, -p.hz), p.y);
    window.__step(80);
    return { at: [Math.round(p.x), Math.round(p.z)], road: o.edge.e.name, area: g.areaName(p.x, p.z), ...window.__stats() };
  }, [x, z]);
  note(`${name}: ${((Date.now() - t1) / 1000).toFixed(1)} s ` + JSON.stringify(r));
  await page.evaluate(() => { const g = window.__game; g.minutes = 11 * 60; g.applyClockMood(); window.__step(2); window.__render(); });
  await page.screenshot({ path: `${out}/c_${name.replace(/\W+/g, '_')}.png`, timeout: 180000 });
}
// a long GPS route across the city
const rt = await page.evaluate(([a, b]) => { const g = window.__game; const t = performance.now(); const r = g.graph.route(a[0], a[1], b[0], b[1]); return { ms: Math.round(performance.now() - t), km: r ? +(r.len / 1000).toFixed(1) : null }; }, [ll(17.4068, 78.4966), ll(17.4474, 78.3762)]);
note('route RTC X Roads -> HITEC City ' + JSON.stringify(rt));
note('errors: ' + JSON.stringify(errs.slice(0, 8)));
fs.writeFileSync(`${out}/citytest.log`, log.join('\n') + '\n');
await browser.close();

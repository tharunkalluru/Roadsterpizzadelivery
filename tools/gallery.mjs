// Review renders of street life in the local build: walkers, traffic queue, a bus at its stop. node tools/gallery.mjs outdir
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 520 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:4173/?q=high&area=RTC%20X%20Roads');
await page.waitForFunction(() => window.__game || window.__err, null, { timeout: 300000 });
await page.evaluate(() => {
  const g = window.__game;
  g.halted = true; window.__render = g.engine.render.bind(g.engine); g.engine.render = () => {}; g.clock.getDelta = () => 0.05;
  window.__step = (n) => { for (let i = 0; i < n; i++) g.frame(); };
  window.__still = (cam, look, fov = 55) => { const c = g.engine.camera; c.position.set(...cam); c.lookAt(...look); c.fov = fov; c.updateProjectionMatrix(); g.traffic.hideNear(c.position); g.city.signs.update(cam[0], cam[2], true); const fr = g.frame; g.frame = () => {}; window.__render(); g.frame = fr; };
  window.__step(60); g.order = null; g.hud.offer(null); g.setTarget(null);
  document.getElementById('hud').style.display = 'none';
});
const snap = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 180000 });
// 1. people on the footpath outside the cinemas
await page.evaluate(() => {
  const g = window.__game; g.minutes = 16.8 * 60; g.applyClockMood();
  const st = g.theatres[0].stop; g.player.place(st.x + 40, st.z + 40, 0, 0);
  window.__step(160);
  // pick the walker with most neighbours and frame it
  let best = g.walkers.list[0], bn = 0;
  for (const w of g.walkers.list) { const n = g.walkers.list.filter((o) => Math.hypot(o.x - w.x, o.z - w.z) < 10).length; if (n > bn) { bn = n; best = w; } }
  const f = best.g.rotation.y, dx = -Math.sin(f), dz = -Math.cos(f);
  window.__still([best.x + dx * 7 + dz * 3, 2.2, best.z + dz * 7 - dx * 3], [best.x, 1.0, best.z], 52);
});
await snap('g1_people');
// 2. stopped car with traffic queueing behind it, a bike squeezing past
await page.evaluate(() => {
  const g = window.__game; for (const c of g.traffic.cars) g.engine.scene.remove(c.g); g.traffic.cars.length = 0; g.traffic.max = 0;
  const e = g.graph.edges.filter((x) => !!x.e.oneway && ['primary', 'trunk'].includes(x.e.cls) && x.len > 150 && !(x.e.elev && Math.max(...x.e.elev) > 1.2)).sort((a, b) => Math.hypot(...a.e.pts[0]) - Math.hypot(...b.e.pts[0]))[0];
  const dir = e.e.oneway === 'forward' ? -1 : 1, S0 = e.len - 20, lane = 0.8;
  const p = g.graph.pointAt(e, S0, dir, lane); g.player.place(p.x, p.z, Math.atan2(-p.hx, -p.hz), p.y);
  g.traffic.spawnAt('auto', e, dir, S0 - 20, lane); g.traffic.spawnAt('car', e, dir, S0 - 32, lane); g.traffic.spawnAt('bus', e, dir, S0 - 48, -2.2);
  g.traffic.spawnAt('bike', e, dir, S0 - 60, lane); g.traffic.spawnAt('bike', e, dir, S0 - 70, 2.5);
  window.__step(230);
  const q = g.graph.pointAt(e, S0 + 6, dir, -3.5);
  window.__still([q.x - p.hx * 2, 3.3, q.z - p.hz * 2], [p.x - p.hx * 14, 1.0, p.z - p.hz * 14], 58);
});
await snap('g2_queue');
// 3. a bus pulled in at its stop
await page.evaluate(() => {
  const g = window.__game; for (const c of g.traffic.cars) g.engine.scene.remove(c.g); g.traffic.cars.length = 0;
  for (const st of g.city.busStops) {
    const e = g.graph.edges.find((x) => x.e.id === st.edge); if (!e) continue;
    const dir = st.side === 1 ? 1 : -1;
    if ((dir === 1 && e.e.oneway === 'forward') || (dir === -1 && e.e.oneway === 'backward')) continue;
    const sd = dir === 1 ? st.s : e.len - st.s; if (sd < 40) continue;
    g.player.place(st.x + 80, st.z + 80, 0); g.player.pos.y = 60;
    const b = g.traffic.spawnAt('bus', e, dir, sd - 35);
    for (let i = 0; i < 300 && !(b.dwell > 0 && b.dwell < 3); i++) window.__step(1);
    const p = g.graph.pointAt(e, sd, dir, 0), lx = p.hz, lz = -p.hx;
    window.__still([p.x - lx * 6 - p.hx * 14, 3.0, p.z - lz * 6 - p.hz * 14], [st.x, 1.6, st.z], 55);
    return;
  }
});
await snap('g3_busstop');
await browser.close();
console.log('ok');

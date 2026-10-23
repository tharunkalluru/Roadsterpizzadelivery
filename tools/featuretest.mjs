// Checks the street features through the real game logic (fixed 50 ms ticks, rendering off between screenshots):
// queueing + horns, two-wheelers filtering past, medians and bridge parapets, roof landing, bus dwell, walkers, map, look-around.
// node tools/featuretest.mjs outdir
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://127.0.0.1:4173/?q=high&area=RTC%20X%20Roads');
await page.waitForFunction(() => window.__game || window.__err, null, { timeout: 300000 });
const log = [];
const note = (s) => { console.log(s); log.push(s); };
await page.evaluate(() => {
  const g = window.__game;
  try { localStorage.clear(); } catch {}
  g.halted = true; window.__render = g.engine.render.bind(g.engine);
  g.engine.render = () => {};
  g.clock.getDelta = () => 0.05;
  window.__step = (n) => { for (let i = 0; i < n; i++) g.frame(); };
  window.__horns = 0; const h = g.traffic.onHorn; g.traffic.onHorn = (...a) => { window.__horns++; h(...a); };
  window.__clear = () => { for (const c of g.traffic.cars) g.engine.scene.remove(c.g); g.traffic.cars.length = 0; g.traffic.max = 0; };
  window.__edge = (pred) => g.graph.edges.filter(pred).sort((a, b) => Math.hypot(...a.e.pts[0]) - Math.hypot(...b.e.pts[0]))[0];
  window.__stop = () => { g.order = null; g.hud.offer(null); g.setTarget(null); };
});
await page.evaluate(() => window.__step(70));
await page.evaluate(() => window.__stop());
const shot = async (name) => { await page.evaluate(() => window.__render()); await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); };

// ---- 1. queue + honk behind a stopped car, then a bike squeezes past ----
const q = await page.evaluate(() => {
  const g = window.__game; window.__clear();
  const e = window.__edge((x) => !x.e.oneway && ['primary', 'secondary', 'trunk'].includes(x.e.cls) && x.e.w >= 10 && x.len > 110 && !(x.e.elev && Math.max(...x.e.elev) > 1.2));
  if (!e) return { err: 'no wide two-way road' };
  const lane = g.traffic.pickLane(e, 1.8, 'car');
  const S0 = Math.min(90, e.len - 10); const p = g.graph.pointAt(e, S0, 1, lane);
  g.player.place(p.x, p.z, Math.atan2(-p.hx, -p.hz), p.y); g.player.speed = 0;
  const car = g.traffic.spawnAt('car', e, 1, S0 - 35, lane);
  window.__horns = 0;
  window.__step(200);
  const gapCar = (S0 - car.s) - car.size[2] / 2;
  const bike = g.traffic.spawnAt('bike', e, 1, S0 - 50, lane);
  window.__step(420);
  const bikePos = bike.s;
  return { road: e.e.name, width: e.e.w, carStoppedGap: +gapCar.toFixed(1), carSpeed: +car.speed.toFixed(2), horns: window.__horns, bikePassed: bikePos > S0 + 2 || bike.edge !== e, bikeS: +bikePos.toFixed(1), bikeFiltered: bike.lane !== lane || bike.edge !== e };
});
note('queue: ' + JSON.stringify(q));
await page.evaluate(() => { const g = window.__game; const c = g.engine.camera; const P = g.player.pos, f = g.player.forward; c.position.set(P.x - f.x * 6 + f.z * 6, 4, P.z - f.z * 6 - f.x * 6); c.lookAt(P.x - f.x * 10, 1, P.z - f.z * 10); g.traffic.max = 0; });
await page.evaluate(() => { const g = window.__game; g.traffic.spawnAt('car', g.traffic.cars[0]?.edge || g.graph.edges[0], 1, 60); });
await page.evaluate(() => { const g = window.__game, fr = g.frame; g.frame = () => {}; window.__render(); g.frame = fr; });
await page.screenshot({ path: `${out}/f1_queue.png`, timeout: 180000 });

// ---- 2. medians and parapets hold the car ----
const w = await page.evaluate(() => {
  const g = window.__game; window.__clear();
  const res = {};
  const lat = (e, x, z) => { let best = 1e9, side = 0; const P = e.e.pts; for (let i = 0; i < P.length - 1; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2)); const px = P[i][0] + dx * u, pz = P[i][1] + dz * u, d = Math.hypot(x - px, z - pz); if (d < best) { best = d; const L = Math.sqrt(L2); side = ((x - px) * (dz / L) - (z - pz) * (dx / L)) >= 0 ? 1 : -1; } } return best * side; };
  const ram = (e, s, dir, lane, steerSign, label) => {
    const p = g.graph.pointAt(e, s, dir, lane);
    g.player.place(p.x, p.z, Math.atan2(-p.hx, -p.hz), p.y + 0.2);
    g.keys.clear(); g.keys.add('KeyW'); g.keys.add(steerSign > 0 ? 'KeyA' : 'KeyD');
    let maxOut = -1e9; const y0 = g.player.pos.y;
    for (let i = 0; i < 90; i++) { window.__step(1); const l = lat(e, g.player.pos.x, g.player.pos.z) * (dir === 1 ? 1 : -1) * steerSign; maxOut = Math.max(maxOut, l); }
    g.keys.clear();
    res[label] = { road: e.e.name, halfWidth: +(e.e.w / 2).toFixed(1), furthestToward: +maxOut.toFixed(2), yStart: +y0.toFixed(2), yEnd: +g.player.pos.y.toFixed(2) };
  };
  // two-way road with a centre median: steer right (toward the median when driving on the left)
  const e1 = window.__edge((x) => !x.e.oneway && ['primary', 'secondary', 'trunk'].includes(x.e.cls) && x.e.w >= 10.5 && x.len > 120 && !(x.e.elev && Math.max(...x.e.elev) > 1.2));
  if (e1) ram(e1, e1.len / 2 - 25, 1, 3, -1, 'centreMedian'); else res.centreMedian = 'no road';
  // one-way carriageway of a dual road: steer toward its right-hand median
  const e2 = window.__edge((x) => !!x.e.oneway && ['primary', 'secondary', 'trunk'].includes(x.e.cls) && x.len > 160 && !(x.e.elev && Math.max(...x.e.elev) > 1.2));
  if (e2) { const dir = e2.e.oneway === 'forward' ? -1 : 1; ram(e2, e2.len / 2, dir, 0, -1, 'dualCarriagewayMedian'); }
  // steel bridge deck: steer into the parapet
  const e3 = g.graph.edges.find((x) => /Steel Bridge/.test(x.e.name || '') && x.e.elev && Math.max(...x.e.elev) > 6 && x.len > 150);
  if (e3) { const dir = e3.e.oneway === 'forward' ? -1 : 1; const s = e3.len / 2; ram(e3, s, dir, 0, 1, 'bridgeParapetLeft'); ram(e3, s, dir, 0, -1, 'bridgeParapetRight'); }
  return res;
});
note('walls: ' + JSON.stringify(w));

// ---- 3. land on a roof ----
const roof = await page.evaluate(() => {
  const g = window.__game;
  const b = g.city.loadedBuildings().filter((b) => b.h > 14 && b.h < 30).sort((a, c) => Math.hypot(...a.ring[0]) - Math.hypot(...c.ring[0]))[0];
  const c = g.city.centroid(b);
  g.player.pos.set(c[0], 34, c[1]); g.player.flying = false; g.player.descending = true; g.player.vy = 0; g.player.speed = 0;
  window.__step(160);
  return { buildingHeight: b.h, carY: +g.player.pos.y.toFixed(2), landedOnRoof: Math.abs(g.player.pos.y - (b.h + 0.57)) < 0.3, support: g.player.lastKind };
});
note('roof: ' + JSON.stringify(roof));
await page.evaluate(() => { const g = window.__game; g.orbitYaw = 2.3; g.orbitPitch = 0.55; window.__step(40); });
await shot('f2_roof_lookaround');

// ---- 4. buses stop at their stops ----
const bus = await page.evaluate(() => {
  const g = window.__game; window.__clear();
  for (const st of g.city.busStops) {
    const e = g.graph.edges.find((x) => x.e.id === st.edge); if (!e) continue;
    const dir = st.side === 1 ? 1 : -1;
    if ((dir === 1 && e.e.oneway === 'forward') || (dir === -1 && e.e.oneway === 'backward')) continue;
    const sd = dir === 1 ? st.s : e.len - st.s; if (sd < 40) continue;
    g.player.place(st.x + 60, st.z + 60, 0); g.player.pos.y = 40;    // park the player out of the way
    const b = g.traffic.spawnAt('bus', e, dir, sd - 35);
    let minSpeed = 99, dwellSeen = 0;
    for (let i = 0; i < 300; i++) { window.__step(1); if (Math.abs(b.s - sd) < 3) minSpeed = Math.min(minSpeed, b.speed); if (b.dwell > 0) dwellSeen += 0.05; if (b.edge !== e) break; }
    return { stops: g.city.busStops.length, road: e.e.name, minSpeedAtStop: +minSpeed.toFixed(2), dwellSeconds: +dwellSeen.toFixed(1), served: b.served.size };
  }
  return { err: 'no usable stop', stops: g.city.busStops.length };
});
note('bus: ' + JSON.stringify(bus));

// ---- 5. walkers ----
const walk = await page.evaluate(() => {
  const g = window.__game; g.traffic.max = 55;
  const p = g.theatres[0].stop; g.player.place(p.x, p.z, 0, p.y);
  window.__step(200);
  const kinds = {}; for (const w of g.walkers.list) kinds[w.spec.kind] = (kinds[w.spec.kind] || 0) + 1;
  const female = g.walkers.list.filter((w) => ['sari', 'salwar', 'burqa', 'western_f', 'schoolgirl', 'elder_f'].includes(w.spec.kind)).length;
  const moved = g.walkers.list.filter((w) => w.phase > 1).length;
  return { walkers: g.walkers.list.length, female, moving: moved, crossing: g.walkers.list.filter((w) => w.cross).length, kinds, skins: new Set(g.walkers.list.map((w) => w.spec.skin)).size };
});
note('walkers: ' + JSON.stringify(walk));
await page.evaluate(() => { const g = window.__game; g.minutes = 17.2 * 60; g.applyClockMood(); const c = g.engine.camera; c.position.set(28, 3.2, -30); c.lookAt(66, 1.5, -44); c.fov = 60; c.updateProjectionMatrix(); const fr = g.frame; g.frame = () => {}; g.traffic.hideNear(c.position); window.__render(); g.frame = fr; });
await page.screenshot({ path: `${out}/f3_street.png`, timeout: 180000 });

// ---- 6. full map ----
await page.evaluate(async () => { const g = window.__game; g.openMap(); await g.map.build(); g.map.zoomTo(0.025); g.map.draw(); });
await page.screenshot({ path: `${out}/f4_map.png`, timeout: 180000 });
await page.evaluate(() => { const g = window.__game; g.map.zoomTo(0.5); g.map.draw(); });
await page.screenshot({ path: `${out}/f5_map_zoom.png`, timeout: 180000 });
const mapState = await page.evaluate(() => { const g = window.__game; const s = { open: g.map.open, scale: +g.map.scale.toFixed(2) }; g.map.hide(); return { ...s, closed: !g.map.open }; });
note('map: ' + JSON.stringify(mapState));
note('errors: ' + JSON.stringify(errs.slice(0, 8)));
fs.writeFileSync(`${out}/featuretest.log`, log.join('\n') + '\n');
await browser.close();

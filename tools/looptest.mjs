// Full-loop verification of the local build, driven through the real game logic:
// deliver pizzas -> earn coins -> lease Sandhya 35mm -> release a film -> collect 7 nights -> verdict.
// Rendering is switched off while stepping (fixed 50 ms ticks) so the test runs fast; screenshots re-enable it.
// node tools/looptest.mjs outdir
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
await page.evaluate(() => {
  const g = window.__game;
  try { localStorage.clear(); } catch {}
  Object.assign(g, { coins: 500, level: 0, doneInLevel: 0, day: 1, minutes: 480, lease: null, totalDelivered: 0 });
  g.halted = true; window.__render = g.engine.render.bind(g.engine);
  g.engine.render = () => {};
  g.clock.getDelta = () => 0.05;
  window.__step = (n) => { for (let i = 0; i < n; i++) g.frame(); };
  window.__goto = async (s) => { await window.__world.ensure(s.x, s.z, 350); g.player.place(s.x, s.z, g.player.yaw ?? 0, s.y || 0); g.player.speed = 0; window.__step(3); };
});
const log = [];
const note = (s) => { console.log(s); log.push(s); };
const shot = async (name) => {
  await page.evaluate(() => { window.__render(); });
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
};
await page.evaluate(() => window.__step(60));                       // offer arrives after 2.6 s of play
await page.evaluate(() => { const g = window.__game; if (!g.order) g.showOffer(); });
await shot('loop1_offer');
// ---- deliveries until the starter lease is affordable ----
let deliveries = 0;
for (let k = 0; k < 60; k++) {
  const r = await page.evaluate(async () => {
    const g = window.__game;
    if (!g.order) g.showOffer();
    if (!g.order) return { err: 'no offer' };
    const o = g.order, info = { pickup: o.pickup.label, drop: o.drop.label, dist: Math.round(o.dist) };
    g.acceptOffer();
    await window.__goto(o.pickup); g.actHeld = true; window.__step(24); g.actHeld = false;
    if (o.state !== 'toDrop') return { err: 'pickup failed', state: o.state, info, d: Math.hypot(o.pickup.x - g.player.pos.x, o.pickup.z - g.player.pos.z), y: g.player.pos.y, sy: o.pickup.y };
    g.order.t = o.dist / 9;                                          // pretend we drove the route at ~32 km/h
    await window.__goto(o.drop); g.actHeld = true; window.__step(24); g.actHeld = false;
    if (g.order === o) return { err: 'drop failed', state: o.state, info };
    return { ok: true, info, coins: g.coins, level: g.level + 1 };
  });
  if (r.err) { note('ERR ' + JSON.stringify(r)); break; }
  deliveries++;
  if (deliveries <= 3 || deliveries % 5 === 0) note(`delivery ${deliveries}: ${r.info.pickup} -> ${r.info.drop} (${r.info.dist} m) · coins ${r.coins} · level ${r.level}`);
  if (deliveries === 2) { await page.evaluate(async () => { const g = window.__game; g.showOffer(); g.acceptOffer(); await window.__goto(g.order.pickup); g.actHeld = true; window.__step(24); g.actHeld = false; }); await shot('loop2_carrying'); await page.evaluate(async () => { const g = window.__game; await window.__goto(g.order.drop); g.actHeld = true; window.__step(24); g.actHeld = false; }); deliveries++; }
  if (r.coins >= 3400) break;
}
// ---- lease Sandhya 35mm at the theatre gate ----
const lease = await page.evaluate(async () => {
  const g = window.__game;
  g.order = null; g.hud.offer(null); g.setTarget(null);
  const site = g.theatres.find((s) => s.def.key === 'sandhya35');
  if (!site) return { err: 'no Sandhya 35mm site' };
  await window.__goto(site.stop); g.actHeld = true; window.__step(20); g.actHeld = false;
  return { open: g.hud.modalOpen, coins: g.coins, stop: [site.stop.x.toFixed(1), site.stop.z.toFixed(1)] };
});
note('at Sandhya gate: ' + JSON.stringify(lease));
await shot('loop3_lease');
await page.evaluate(() => { document.querySelector('[data-f="1"]')?.click(); document.querySelector('[data-p="150"]')?.click(); document.querySelector('[data-c="1"]')?.click(); });
await page.evaluate(() => document.querySelector('#sign')?.click());
const signed = await page.evaluate(() => { const g = window.__game; return { lease: g.lease && { film: g.lease.film.title, price: g.lease.price, shows: g.lease.shows, campaign: g.lease.campaign, startDay: g.lease.startDay }, coins: g.coins }; });
note('signed: ' + JSON.stringify(signed));
// poster view: camera across the road from the Sandhya frontage
await page.evaluate(async () => { await window.__world.ensure(60, -40, 400); window.__game.buildFronts(); }); await page.evaluate(() => { const g = window.__game; g.minutes = 19.8 * 60; g.applyClockMood(); window.__step(2); const c = g.engine.camera; c.position.set(45, 12, -20); c.lookAt(63, 8, -46); c.fov = 62; c.updateProjectionMatrix(); });
await page.evaluate(() => { const g = window.__game; const fr = g.frame; g.frame = () => {}; window.__render(); g.frame = fr; });
await page.screenshot({ path: `${out}/loop4_nowshowing.png`, timeout: 180000 });
// ---- seven nights of collections ----
for (let n = 0; n < 8; n++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    if (g.hud.modalOpen) g.hud.modal(null);
    g.minutes = 1439.9; window.__step(4);
    const l = g.lease; const d = l.days[l.days.length - 1];
    return { day: g.day, coins: g.coins, nights: l.days.length, done: l.done, last: d && { tickets: d.tickets, occ: Math.round(d.occupancy * 100), coins: d.coins, note: d.note } };
  });
  note(`night ${n + 1}: ` + JSON.stringify(r));
  if (r.done) break;
}
await page.waitForTimeout(2600);                                    // verdict modal opens 2.2 s after the last night
await page.evaluate(() => window.__step(1));
const verdict = await page.evaluate(() => [...document.querySelectorAll("h2")].map((h) => h.textContent).join(" | "));
note('verdict: ' + verdict);
await shot('loop5_verdict');
note('errors: ' + JSON.stringify(errs.slice(0, 8)));
fs.writeFileSync(`${out}/looptest.log`, log.join('\n') + '\n');
await browser.close();
